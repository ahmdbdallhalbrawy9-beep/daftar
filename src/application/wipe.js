// @ts-check
// The two password-gated wipe actions. The two-tap confirm *timers* for both
// buttons stay in the view (they're UI state) — these functions run only
// once the owner has actually confirmed. `queue` is index.html's own
// write-serializing `queue(fn)`, passed in explicitly (see transactions.js's
// header comment for why) — each wipe is one serialized block, same as
// index.html's `wipeAll`/`doWipe`.
import { checkWipePassword } from './settingsUseCases.js';
import { openCustomers } from '../domain/customers.js';

/**
 * Deletes every document in every collection (password-gated).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {(text: string) => Promise<string>} sha
 * @param {object} settings
 * @param {string} pw
 * @param {{ledger: Record<string,object[]>, closes: object[], wallets: object[], inbox: Record<string,object>}} state current known data (to know which doc ids to delete)
 */
export async function wipeAllData(db, queue, sha, settings, pw, state) {
  if (!(await checkWipePassword(sha, settings, pw))) return { ok: false, error: 'wrong-password' };
  var lids = Object.keys(state.ledger || {});
  var cids = (state.closes || []).map(function (c) { return c.id; }).filter(Boolean);
  var wids = (state.wallets || []).map(function (w) { return w.id; });
  var iids = Object.keys(state.inbox || {});
  await queue(function () {
    var p = Promise.resolve();
    lids.forEach(function (id) { p = p.then(function () { return db.collection('ledger').doc(id).delete(); }); });
    cids.forEach(function (id) { p = p.then(function () { return db.collection('closes').doc(id).delete(); }); });
    wids.forEach(function (id) { p = p.then(function () { return db.collection('wallets').doc(id).delete(); }); });
    iids.forEach(function (id) { p = p.then(function () { return db.collection('settings').doc('inbox_' + id).delete(); }); });
    return p.then(function () { return db.collection('settings').doc('main').delete(); });
  });
  return { ok: true };
}

/**
 * Wipes transactions/closes only: re-bases every wallet and the cash drawer to
 * the current computed values first, so no balance is lost.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {import('../domain/compute.js').ComputeResult} computeResult
 * @param {object[]} wallets
 * @param {object} settings
 * @param {{ledger: Record<string,object[]>, closes: object[], inbox: Record<string,object>}} state
 */
export async function wipeTransactions(db, queue, clock, computeResult, wallets, settings, state) {
  var C = computeResult, ts = clock.now();
  var lids = Object.keys(state.ledger || {});
  var cids = (state.closes || []).map(function (c) { return c.id; }).filter(Boolean);
  var iids = Object.keys(state.inbox || {});
  // open customer credit (آجل) must survive the wipe: carry it over in settings.cb
  var cb = {};
  openCustomers(C.cust || {}).forEach(function (c) { cb[c.key] = { n: c.n, v: c.v }; });
  await queue(function () {
    var p = Promise.resolve();
    wallets.forEach(function (w) { p = p.then(function () { return db.collection('wallets').doc(w.id).update({ base: C.W[w.id].bal, baseTs: ts }); }); });
    p = p.then(function () { return db.collection('settings').doc('main').set(Object.assign({}, settings, { baseCash: C.cash, baseTs: ts, cb: cb })); });
    lids.forEach(function (id) { p = p.then(function () { return db.collection('ledger').doc(id).delete(); }); });
    cids.forEach(function (id) { p = p.then(function () { return db.collection('closes').doc(id).delete(); }); });
    iids.forEach(function (id) { p = p.then(function () { return db.collection('settings').doc('inbox_' + id).delete(); }); });
    return p;
  });
  return { ok: true };
}
