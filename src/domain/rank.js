// @ts-check
// Ranks wallets for a suggested kind+amount. index.html's `rank()` reads
// `S.wallets`/`S.settings` directly today; both are explicit params here —
// see docs/ARCHITECTURE.md §3.
import { baseK, isInsta } from './kinds.js';

/**
 * @param {string} kind
 * @param {number} a amount
 * @param {Array<{id:string,active?:boolean,type?:string,dayLimit?:number,monthLimit?:number}>} wallets
 * @param {import('./compute.js').ComputeResult} computeResult
 * @param {{defDay:number,defMon:number}} settings
 * @param {number} [cst] extra wallet-side cost already known for this amount (e.g. the transfer fee)
 */
export function rank(kind, a, wallets, computeResult, settings, cst) {
  var C = computeResult;
  var bk = baseK(kind), ins = isInsta(kind), limited = bk === 'in' || bk === 'out';
  var list = wallets.filter(function (w) {
    if (w.active === false) return false;
    return ins ? w.type === 'insta' : w.type !== 'insta';
  }).map(function (w) {
    var x = C.W[w.id], dl = w.dayLimit || settings.defDay, ml = w.monthLimit || settings.defMon, why = [], score = 0;
    var u = bk === 'in' ? [x.dIn, x.mIn] : [x.dOut, x.mOut];
    var remD = dl - u[0], remM = ml - u[1];
    if (limited) {
      if (bk === 'out' && x.bal < a + (cst || 0)) why.push('الرصيد مش كفاية');
      if (remD < a) why.push('الليميت اليومي');
      if (remM < a) why.push('الليميت الشهري');
      score = Math.min(remD, remM);
    } else if (bk === 'cashout') { if (x.bal < a) why.push('الرصيد مش كفاية'); score = x.bal; }
    else score = -x.bal;
    return { w: w, x: x, remD: remD, remM: remM, why: why, fits: !why.length, score: score };
  });
  list.sort(function (p, q) { return (q.fits - p.fits) || (q.score - p.score); });
  return list;
}
