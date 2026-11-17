// @ts-check
// "Is the app's balance for this wallet the same as the balance Vodafone's last confirmed SMS reported?"
// A confirmed SMS operation keeps its SMS id (`sid`) on the recorded transaction, so we know which
// wallet it hit and what balance the SMS said afterwards. Everything recorded after it is replayed
// to get the balance the app should show now.

/** balance change of wallet `id` caused by one live transaction (0 when it does not touch it) */
function deltaFor(t, id) {
  if (t.k === 'settle') return 0;
  if (t.k === 'xfer') return t.w === id ? -(t.a + (t.c || 0)) : t.to === id ? t.a : 0;
  if (t.w !== id) return 0;
  var b = t.k === 'iin' ? 'in' : t.k === 'iout' ? 'out' : t.k === 'itopup' ? 'topup' : t.k === 'icashout' ? 'cashout' : t.k;
  return b === 'in' || b === 'topup' ? t.a : -(t.a + (b === 'out' ? (t.c || 0) : 0));
}

/**
 * @param {{id: string, baseTs?: number}} wallet
 * @param {number} bal the wallet's balance in the app right now
 * @param {Array<{ts: number, w?: string, to?: string, k: string, a: number, c?: number, sid?: string}>} txs live transactions
 * @param {Record<string, {bal?: number}>} items SMS items by id (every inbox, merged)
 * @returns {{diff: number, smsBal: number, expected: number, at: number}|null} diff = SMS balance − app balance
 */
export function balanceDrift(wallet, bal, txs, items) {
  var base = wallet.baseTs || 0, last = null;
  txs.forEach(function (t) {
    if (!t.sid || t.w !== wallet.id || t.ts <= base) return;
    var it = items[t.sid];
    if (!it || it.bal == null) return;
    if (!last || t.ts >= last.ts) last = t;
  });
  if (!last) return null;
  var lt = last, expected = bal;
  txs.forEach(function (t) { if (t.ts > lt.ts && t.ts > base) expected -= deltaFor(t, wallet.id); });
  var smsBal = /** @type {number} */ (items[/** @type {string} */ (lt.sid)].bal), diff = Math.round((smsBal - expected) * 100) / 100;
  return Math.abs(diff) > 0.5 ? { diff: diff, smsBal: smsBal, expected: Math.round(expected * 100) / 100, at: lt.ts } : null;
}
