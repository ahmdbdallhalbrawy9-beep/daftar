// @ts-check
// Split-transaction planning (`direct` across several wallets, or `collect` then
// forward). index.html's `buildPlan`/`autoSplit` read `UI.kind`/`UI.sm`/`UI.col`/
// `UI.sp`/`UI.dest` directly today; everything here is an explicit parameter —
// see docs/ARCHITECTURE.md §3. The collector wallet must already be resolved
// (via `resolveCollector` in wallets.js) before calling either function here.
import { walletCost, xferCost, maxAmt } from './money.js';
import { NUM } from './numbers.js';
import { roomOf } from './limits.js';

/**
 * @typedef {object} PlanParams
 * @property {string} kind
 * @property {number} amount
 * @property {number} fee
 * @property {'one'|'direct'|'collect'} splitMode
 * @property {string|null} [collectorId]
 * @property {Record<string,string>} [splits] walletId -> typed amount string
 * @property {'vf'|'other'} [dest]
 */

/**
 * @param {PlanParams} params
 * @param {Array<{id:string,type?:string}>} wallets split-eligible wallets
 * @param {import('./compute.js').ComputeResult} computeResult
 * @param {import('./money.js').DEFAULTS} settings
 */
export function buildPlan(params, wallets, computeResult, settings) {
  var kind = params.kind, amount = params.amount, fee = params.fee,
    splitMode = params.splitMode, collectorId = params.collectorId,
    splits = params.splits || {}, dest = params.dest;
  var ws = wallets, C = computeResult;
  var r = { stuckM: false, stuckD: false, legs: [], sum: 0, ctot: 0, short: false, bad: {}, ok: false, coll: splitMode === 'collect', own: 0, diff: 0 };
  var byId = {};
  ws.forEach(function (w) { byId[w.id] = w; });
  var d = kind === 'out' ? dest : undefined;
  if (!r.coll) {
    ws.forEach(function (w) {
      var a = NUM(splits[w.id]);
      if (a > 0) {
        var c = walletCost(kind, a, settings, dest);
        r.legs.push({ k: kind, w: w.id, a: a, c: c, d: d, f: 0 });
        r.sum += a; r.ctot += c;
        if (C.W[w.id].bal < a + c - 0.005) { r.bad[w.id] = 1; r.short = true; }
      }
    });
    if (r.legs.length) r.legs[0].f = fee;
    r.diff = amount - r.sum;
    if (amount > 0) {
      var cap = 0;
      ws.forEach(function (w) { cap += maxAmt(C.W[w.id].bal, function (q) { return walletCost(kind, q, settings, dest); }); });
      if (cap < amount - 0.005) r.short = true;
    }
    r.ok = amount > 0 && r.legs.length > 0 && Math.abs(r.diff) < 0.005 && !r.short;
  } else {
    var X = byId[collectorId];
    ws.forEach(function (w) {
      if (w.id === collectorId) return;
      var a = NUM(splits[w.id]);
      if (a > 0) {
        var c = xferCost(w, a, settings);
        r.legs.push({ k: 'xfer', w: w.id, to: collectorId, a: a, c: c, ins: w.type === 'insta' ? 1 : 0, f: 0 });
        r.sum += a; r.ctot += c;
        if (C.W[w.id].bal < a + c - 0.005) { r.bad[w.id] = 1; r.short = true; }
      }
    });
    var cf = amount > 0 ? walletCost(kind, amount, settings, dest) : 0;
    r.own = amount - r.sum; r.cf = cf;
    if (X && amount > 0) {
      if (C.W[X.id].bal + r.sum < amount + cf - 0.005) { r.bad[X.id] = 1; r.short = true; }
      r.legs.push({ k: kind, w: X.id, a: amount, c: cf, d: d, f: fee });
      r.ctot += cf;
    }
    if (X && amount > 0) {
      var cap2 = C.W[X.id].bal;
      ws.forEach(function (w) { if (w.id !== collectorId) cap2 += maxAmt(C.W[w.id].bal, function (q) { return xferCost(w, q, settings); }); });
      if (cap2 < amount + cf - 0.005) r.short = true;
    }
    // Stuck check on the collector: what is left on it after sending `amount` must fit its send room.
    if (X && amount > 0 && r.sum > 0) {
      var rm = roomOf(C.W[X.id], settings), left = C.W[X.id].bal + r.sum - amount - cf;
      if (left > Math.max(0, rm.roomM - amount)) r.stuckM = true;
      else if (left > Math.max(0, rm.roomD - amount)) r.stuckD = true;
    }
    r.ok = !!X && amount > 0 && r.sum > 0 && r.own >= -0.005 && !r.short && !r.stuckM;
  }
  return r;
}

/**
 * Pure planning half of index.html's `autoSplit`: distributes `amount` across
 * `wallets` (richest first), respecting each wallet's max transferable amount.
 * Returns the resulting `splits` map and any `rest` that couldn't be placed.
 * @param {string} kind
 * @param {'direct'|'collect'} splitMode
 * @param {string|null} collectorId
 * @param {Array<{id:string,type?:string}>} wallets split-eligible wallets
 * @param {import('./compute.js').ComputeResult} computeResult
 * @param {import('./money.js').DEFAULTS} settings
 * @param {'vf'|'other'} dest
 * @param {number} amount
 */
export function suggestAutoSplit(kind, splitMode, collectorId, wallets, computeResult, settings, dest, amount) {
  var coll = splitMode === 'collect';
  var ws = wallets;
  var sp = {}, rest;
  var order = ws.filter(function (w) { return !(coll && w.id === collectorId); })
    .sort(function (p, q) { return computeResult.W[q.id].bal - computeResult.W[p.id].bal; });
  if (!coll) {
    rest = amount;
    order.forEach(function (w) {
      if (rest <= 0) return;
      var m = maxAmt(computeResult.W[w.id].bal, function (a) { return walletCost(kind, a, settings, dest); });
      var a = Math.min(rest, m);
      if (a > 0) { sp[w.id] = String(a); rest -= a; }
    });
  } else {
    var X = computeResult.W[collectorId];
    rest = Math.max(0, amount + walletCost(kind, amount, settings, dest) - X.bal);
    order.forEach(function (w) {
      if (rest <= 0) return;
      var m = maxAmt(computeResult.W[w.id].bal, function (a) { return xferCost(w, a, settings); });
      var a = Math.min(rest, m);
      if (a > 0) { sp[w.id] = String(a); rest -= a; }
    });
  }
  return { splits: sp, rest: rest };
}
