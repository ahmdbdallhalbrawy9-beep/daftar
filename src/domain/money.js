// @ts-check
// Wallet balance deltas, cash-drawer deltas, and owner-side wallet fees.
// `walletCost`/`xferCost` take `settings` and (for `walletCost`) `dest` explicitly —
// in index.html today they read `S.settings`/`UI.dest` directly; see
// docs/ARCHITECTURE.md §3 "Hidden coupling".
import { baseK } from './kinds.js';

export const DEFAULTS = {
  feePct: 1, feePctI: 1, feePctC: 1, feePctF: 0.6,
  vfSame: 1, vfOP: 0.5, vfOC: 15, inP: 0.1, inC: 20,
  baseCash: 0, baseTs: 0, defDay: 60000, defMon: 200000,
};

/** @param {{k:string,a:number,c?:number}} t @returns {number} wallet balance delta */
export function wd(t) {
  var b = baseK(t.k);
  return b === 'in' || b === 'topup' ? t.a : -(t.a + (b === 'out' ? (t.c || 0) : 0));
}

/** @param {{k:string,a:number,f?:number,dl?:number}} t @returns {number} cash-drawer delta (0 for a deferred cash tx) */
export function cd(t) {
  if (t.dl) return 0;
  var b = baseK(t.k), f = t.f || 0;
  return b === 'in' ? -(t.a - f) : b === 'out' ? t.a + f : b === 'topup' ? -(t.a + f) : t.a - f;
}

/**
 * Owner-side wallet fee for a direct customer operation.
 * @param {string} k operation kind
 * @param {number} A amount
 * @param {typeof DEFAULTS} settings
 * @param {'vf'|'other'} [dest] only used when k === 'out'
 * @returns {number}
 */
export function walletCost(k, A, settings, dest) {
  var st = settings, c = 0;
  if (!(A > 0)) return 0;
  if (k === 'iout') c = Math.min(A * st.inP / 100, st.inC);
  else if (k === 'out') c = dest === 'vf' ? st.vfSame : Math.min(A * st.vfOP / 100, st.vfOC);
  return Math.round(c * 100) / 100;
}

/**
 * Owner-side wallet fee for an internal wallet-to-wallet transfer leg (collect mode).
 * @param {{type?:string}} w the wallet the leg originates from
 * @param {number} a amount
 * @param {typeof DEFAULTS} settings
 * @returns {number}
 */
export function xferCost(w, a, settings) {
  var st = settings;
  if (!(a > 0)) return 0;
  return Math.round((w.type === 'insta' ? Math.min(a * st.inP / 100, st.inC) : st.vfSame) * 100) / 100;
}

/**
 * Largest amount `a` such that `a + cf(a) <= bal`.
 * @param {number} bal
 * @param {(a:number)=>number} cf cost function
 * @returns {number}
 */
export function maxAmt(bal, cf) {
  var a = Math.floor(bal);
  a = Math.floor(bal - cf(a));
  while (a > 0 && a + cf(a) > bal + 1e-9) a--;
  return Math.max(0, a);
}
