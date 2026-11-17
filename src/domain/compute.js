// @ts-check
// The aggregate: replays a ledger (minus voided txs) into wallet balances, cash,
// and daily/monthly profit (plain + InstaPay). `now` is a required parameter —
// index.html's `compute()` reads `Date.now()` internally today; see
// docs/ARCHITECTURE.md §3.
import { baseK, isInsta } from './kinds.js';
import { wd, cd } from './money.js';
import { dayKey } from './time.js';
import { resolveCust, deferDelta } from './customers.js';

/**
 * @typedef {object} ComputeResult
 * @property {Record<string, {w:object, bal:number, dIn:number, dOut:number, mIn:number, mOut:number, mInRec:number, mOutRec:number}>} W
 * @property {number} cash
 * @property {number} pDay
 * @property {number} pMon
 * @property {number} pDayI
 * @property {number} pMonI
 * @property {number} nDay
 * @property {object[]} today
 * @property {string} mk current month key (YYYYMM, Cairo)
 * @property {Record<string,{n:string,v:number,last:number}>} cust open customer credit (positive = customer owes me)
 */

/**
 * @param {{ledger: Record<string, object[]>, wallets: Array<{id:string,base?:number,baseTs?:number}>, settings: {baseCash?:number,baseTs?:number,cb?:Record<string,{n:string,v:number}>}, now: number}} params
 * @returns {ComputeResult}
 */
export function compute(params) {
  var ledger = params.ledger, wallets = params.wallets, settings = params.settings, now = params.now;
  var tk = dayKey(now), mk = tk.slice(0, 6);
  var voided = {}, all = [];
  Object.keys(ledger).forEach(function (k) {
    (ledger[k] || []).forEach(function (t) { if (t.k === 'void') voided[t.ref] = 1; else all.push(t); });
  });
  var live = all.filter(function (t) { return !voided[t.id]; }).sort(function (a, b) { return a.ts - b.ts; });
  var W = {};
  wallets.forEach(function (w) { W[w.id] = { w: w, bal: w.base || 0, dIn: 0, dOut: 0, mIn: 0, mOut: 0, mInRec: 0, mOutRec: 0 }; });
  var cash = settings.baseCash || 0, pDay = 0, pMon = 0, pDayI = 0, pMonI = 0, nDay = 0, today = [];
  var cust = {};
  var cb = settings.cb || {};
  var ca = /** @type {any} */ (settings).ca;
  Object.keys(cb).forEach(function (k) {
    var r = resolveCust(ca, cb[k].n || k), e = cust[r.key] || (cust[r.key] = { n: r.n, v: 0, last: 0 });
    e.v += cb[k].v || 0;
  });
  var custOf = function (name) { var r = resolveCust(ca, name); return cust[r.key] || (cust[r.key] = { n: r.n, v: 0, last: 0 }); };
  live.forEach(function (t) {
    if (t.k === 'settle') {
      var sc = custOf(t.cn);
      sc.v += t.s === 'rc' ? -t.a : t.a;
      sc.last = Math.max(sc.last, t.ts);
      if (t.ts > (settings.baseTs || 0)) cash += t.s === 'rc' ? t.a : -t.a;
      if (dayKey(t.ts) === tk) today.push(t);
      return;
    }
    var x = W[t.w], dk = dayKey(t.ts), isD = dk === tk, isM = dk.slice(0, 6) === mk, bk = baseK(t.k);
    if (t.k === 'xfer') {
      var rx = W[t.to], xc = t.c || 0;
      if (x) { if (t.ts > (x.w.baseTs || 0)) x.bal -= t.a + xc; if (isD) x.dOut += t.a; if (isM) x.mOut += t.a; }
      if (rx) { if (t.ts > (rx.w.baseTs || 0)) rx.bal += t.a; if (isD) rx.dIn += t.a; if (isM) rx.mIn += t.a; }
      if (isM) { pMon -= xc; if (t.ins) pMonI -= xc; }
      if (isD) { pDay -= xc; if (t.ins) pDayI -= xc; today.push(t); }
      return;
    }
    if (x) {
      if (t.ts > (x.w.baseTs || 0)) x.bal += wd(t);
      if (bk === 'in') { if (isD) x.dIn += t.a; if (isM) x.mIn += t.a; }
      if (bk === 'out') { if (isD) x.dOut += t.a; if (isM) x.mOut += t.a; }
    }
    if (t.ts > (settings.baseTs || 0)) cash += cd(t);
    if (t.dl && t.cn && (bk === 'in' || bk === 'out')) {
      var dc = custOf(t.cn);
      dc.v += deferDelta(bk, t.a, t.f || 0);
      dc.last = Math.max(dc.last, t.ts);
    }
    var f = t.f || 0, c = t.c || 0, ins = isInsta(t.k);
    if (bk === 'in' || bk === 'out') {
      if (isM) { pMon += f - c; if (ins) pMonI += f - c; }
      if (isD) { pDay += f - c; if (ins) pDayI += f - c; if (!t.nc) nDay++; }
    } else if (f && (bk === 'topup' || bk === 'cashout')) {
      if (isM) { pMon -= f; if (ins) pMonI -= f; }
      if (isD) { pDay -= f; if (ins) pDayI -= f; }
    }
    if (isD) today.push(t);
  });
  // "مستهلك مسبقًا": usage of this month that happened before the app was used. Counts only while
  // its month key is the current month, so it disappears on its own on the 1st (no write needed).
  // It only moves the monthly usage — never a balance, profit or the drawer.
  wallets.forEach(function (w) {
    var x = W[w.id], p = /** @type {any} */ (w).pre;
    x.mInRec = x.mIn; x.mOutRec = x.mOut;
    if (p && p.mk === mk) { x.mIn += Math.max(0, p.i || 0); x.mOut += Math.max(0, p.o || 0); }
  });
  return { W: W, cash: cash, pDay: pDay, pMon: pMon, pDayI: pDayI, pMonI: pMonI, nDay: nDay, today: today, cust: cust, mk: mk };
}
