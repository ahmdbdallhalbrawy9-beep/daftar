// @ts-check
// Daily close: writes a `closes` doc, re-bases every wallet's `base`/`baseTs`
// to the just-counted value, and re-bases the cash drawer — all as ONE
// serialized `queue()` block (matches index.html's `doClose`, which chains
// every write through a single `queue(fn)` call so nothing else can write in
// the middle of a close). index.html's `doClose()` reads the inventory
// `<input>`s directly; here the view reads them and passes the typed
// strings in (empty string/missing = "use expected").
import { NUM } from '../domain/numbers.js';
import { dayKey } from '../domain/time.js';
import { rid } from '../domain/ids.js';

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {import('../domain/compute.js').ComputeResult} computeResult
 * @param {object[]} wallets
 * @param {import('../domain/money.js').DEFAULTS} settings
 * @param {{cash?: string, byWallet?: Record<string,string>}} inventoryInputs raw typed strings
 */
export function closeDay(db, queue, clock, computeResult, wallets, settings, inventoryInputs) {
  var C = computeResult, ts = clock.now();
  var cashRaw = ((inventoryInputs && inventoryInputs.cash) || '').trim();
  var cashV = cashRaw === '' ? C.cash : NUM(cashRaw);
  var ws = {}, upd = [];
  wallets.forEach(function (w) {
    var x = C.W[w.id];
    var raw = ((inventoryInputs && inventoryInputs.byWallet && inventoryInputs.byWallet[w.id]) || '').trim();
    var v = raw !== '' ? NUM(raw) : x.bal;
    ws[w.id] = { n: w.name, exp: x.bal, act: v };
    upd.push([w.id, v]);
  });
  var merged = Object.assign({}, settings, { baseCash: cashV, baseTs: ts });
  return queue(function () {
    var p = db.collection('closes').doc(rid('c')).set({ ts: ts, day: dayKey(ts), expCash: C.cash, actCash: cashV, pDay: C.pDay, wallets: ws });
    upd.forEach(function (u) { p = p.then(function () { return db.collection('wallets').doc(u[0]).update({ base: u[1], baseTs: ts }); }); });
    return p.then(function () { return db.collection('settings').doc('main').set(merged); });
  }).then(function () { return { ok: true, settings: merged }; });
}
