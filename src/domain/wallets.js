// @ts-check
// Wallet selection for split transactions. `resolveCollector` is the pure
// replacement for index.html's `ensureCol`, which today reads+writes `UI.col`
// directly — see docs/ARCHITECTURE.md §3.
import { isInsta } from './kinds.js';
import { roomOf } from './limits.js';

/**
 * Active wallets matching the service (vf vs insta) a kind operates on.
 * @param {string} kind
 * @param {Array<{id:string,active?:boolean,type?:string}>} wallets
 */
export function splitWallets(kind, wallets) {
  var ins = isInsta(kind);
  return wallets.filter(function (w) { return w.active !== false && (ins ? w.type === 'insta' : w.type !== 'insta'); });
}

/**
 * Resolve the "collect" split mode's collector wallet: keep the given id if
 * it's still one of `wallets`, otherwise pick the one with the highest balance.
 * @param {Array<{id:string}>} wallets split-eligible wallets (already filtered by `splitWallets`)
 * @param {{W: Record<string,{bal:number}>}} computeResult
 * @param {string|null|undefined} collectorId the currently chosen collector, if any
 * @param {number} [amount] when > 0 (with `settings`), prefer wallets whose monthly send room can still cover it
 * @param {{defDay:number,defMon:number}} [settings]
 * @returns {string|null}
 */
export function resolveCollector(wallets, computeResult, collectorId, amount, settings) {
  if (collectorId && wallets.some(function (w) { return w.id === collectorId; })) return collectorId;
  var pool = wallets;
  if (amount && amount > 0 && settings) {
    var fit = wallets.filter(function (w) { return roomOf(computeResult.W[w.id], settings).roomM >= amount; });
    if (fit.length) pool = fit;
  }
  var b = null;
  pool.forEach(function (w) { if (!b || computeResult.W[w.id].bal > computeResult.W[b.id].bal) b = w; });
  return b ? b.id : null;
}

/**
 * Sum of the balances of the active wallets, split by service. 'other' wallets count with Vodafone,
 * like the wallets tab does.
 * @param {Array<{id:string,type?:string,active?:boolean}>} wallets
 * @param {{W: Record<string,{bal:number}>}} computeResult
 */
export function walletTotals(wallets, computeResult) {
  var vf = 0, insta = 0;
  wallets.forEach(function (w) {
    if (w.active === false || !computeResult.W[w.id]) return;
    if (w.type === 'insta') insta += computeResult.W[w.id].bal; else vf += computeResult.W[w.id].bal;
  });
  return { vf: vf, insta: insta, all: vf + insta };
}
