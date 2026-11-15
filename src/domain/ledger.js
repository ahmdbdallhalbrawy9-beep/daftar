// @ts-check
// Pure queries/aggregations over a ledger's transaction list. index.html's
// `liveTxs()` reads `S.ledger` directly today; `ledger` is an explicit param here.
import { baseK } from './kinds.js';
import { cd } from './money.js';

/**
 * All non-voided transactions across every day-doc in the ledger, time-sorted.
 * @param {Record<string, object[]>} ledger
 */
export function liveTxs(ledger) {
  var voided = {}, all = [];
  Object.keys(ledger).forEach(function (k) {
    (ledger[k] || []).forEach(function (t) { if (t.k === 'void') voided[t.ref] = 1; else all.push(t); });
  });
  return all.filter(function (t) { return !voided[t.id]; }).sort(function (a, b) { return a.ts - b.ts; });
}

/**
 * Summarizes a list of transactions (e.g. one day) into counts/profit/cash deltas.
 * @param {object[]} list
 */
export function daySum(list) {
  var r = { n: 0, pf: 0, wf: 0, cf: 0, cash: 0 };
  list.forEach(function (t) {
    var bk = baseK(t.k), f = t.f || 0, c = t.c || 0;
    if (t.k === 'xfer') { r.wf += c; r.pf -= c; return; }
    if (t.k === 'settle') { r.cash += t.s === 'rc' ? t.a : -t.a; return; }
    if (bk === 'in' || bk === 'out') { r.pf += f - c; r.cf += f; r.wf += c; if (!t.nc) r.n++; }
    else if (f && (bk === 'topup' || bk === 'cashout')) r.pf -= f;
    r.cash += cd(t);
  });
  return r;
}

/**
 * Groups a transaction list by `.g` (multi-leg group id) for display, newest leg first.
 * @param {object[]} tlist
 */
export function txGroups(tlist) {
  var seenG = {}, rows = [];
  tlist.slice().reverse().forEach(function (t) {
    if (t.g) { if (seenG[t.g]) return; seenG[t.g] = 1; rows.push(tlist.filter(function (u) { return u.g === t.g; })); }
    else rows.push([t]);
  });
  return rows;
}
