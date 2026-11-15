// @ts-check
// Wallet selection for split transactions. `resolveCollector` is the pure
// replacement for index.html's `ensureCol`, which today reads+writes `UI.col`
// directly — see docs/ARCHITECTURE.md §3.
import { isInsta } from './kinds.js';

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
 * @returns {string|null}
 */
export function resolveCollector(wallets, computeResult, collectorId) {
  if (collectorId && wallets.some(function (w) { return w.id === collectorId; })) return collectorId;
  var b = null;
  wallets.forEach(function (w) { if (!b || computeResult.W[w.id].bal > computeResult.W[b.id].bal) b = w; });
  return b ? b.id : null;
}
