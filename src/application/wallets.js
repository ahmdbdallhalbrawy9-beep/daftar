// @ts-check
// Create/update a wallet, and the first-run bulk wallet setup. `queue` is
// index.html's own write-serializing `queue(fn)`, passed in explicitly (see
// transactions.js's header comment for why).
import { pad } from '../domain/time.js';
import { rid } from '../domain/ids.js';
import { dayKey } from '../domain/time.js';
import { preFromRemaining } from '../domain/limits.js';

/**
 * @typedef {object} WalletForm
 * @property {string} name
 * @property {string} [phone]
 * @property {string} type
 * @property {number} [dayLimit]
 * @property {number} [monthLimit]
 * @property {number} [remainIn] monthly receive room left per the wallet's own app (omit = unchanged)
 * @property {number} [remainOut] monthly send room left per the wallet's own app (omit = unchanged)
 * @property {number} [recIn] receive usage the app already counted this month
 * @property {number} [recOut] send usage the app already counted this month
 * @property {boolean} active
 * @property {number} balance
 */

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {object|null} existingWallet
 * @param {number} currentBalance the wallet's computed balance when the edit sheet was opened
 * @param {WalletForm} form
 * @param {{defDay:number, defMon:number}} settings
 * @param {object[]} wallets current wallet list (used to compute a new wallet's `order`)
 */
export function createOrUpdateWallet(db, queue, clock, existingWallet, currentBalance, form, settings, wallets) {
  var name = (form.name || '').trim();
  if (!name) return Promise.resolve({ ok: false, error: 'no-name' });
  var rec = {
    name: name,
    phone: (form.phone || '').trim(),
    type: form.type,
    dayLimit: form.dayLimit || settings.defDay,
    monthLimit: form.monthLimit || settings.defMon,
    active: !!form.active,
  };
  if (form.remainIn != null || form.remainOut != null) {
    var mk = dayKey(clock.now()).slice(0, 6), old = (existingWallet && existingWallet.pre && existingWallet.pre.mk === mk) ? existingWallet.pre : { i: 0, o: 0 };
    rec.pre = { mk: mk, i: old.i || 0, o: old.o || 0 };
    if (form.remainIn != null) rec.pre.i = preFromRemaining(rec.monthLimit, form.remainIn, form.recIn || 0);
    if (form.remainOut != null) rec.pre.o = preFromRemaining(rec.monthLimit, form.remainOut, form.recOut || 0);
  }
  if (existingWallet) {
    var changedBalance = Math.abs(form.balance - currentBalance) > 0.001;
    if (changedBalance) { rec.base = form.balance; rec.baseTs = clock.now(); }
    return queue(function () { return db.collection('wallets').doc(existingWallet.id).update(rec); })
      .then(function () { return { ok: true, id: existingWallet.id }; });
  }
  rec.base = form.balance;
  rec.baseTs = clock.now();
  rec.order = wallets.reduce(function (m, x) { return Math.max(m, x.order || 0); }, 0) + 1;
  var id = rid('w');
  return queue(function () { return db.collection('wallets').doc(id).set(rec); })
    .then(function () { return { ok: true, id: id }; });
}

/**
 * @typedef {object} SetupForm
 * @property {number} vfCount
 * @property {number} instaCount
 * @property {number} [vfDayLimit]
 * @property {number} [vfMonthLimit]
 * @property {number} [instaDayLimit]
 * @property {number} [instaMonthLimit]
 */

/**
 * First-run bulk wallet creation — one serialized `queue()` block, same as
 * index.html's `doSetup`.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {SetupForm} form
 */
export function setupWallets(db, queue, form) {
  var nv = Math.max(0, Math.min(40, form.vfCount | 0));
  var ni = Math.max(0, Math.min(20, form.instaCount | 0));
  var vd = form.vfDayLimit || 60000, vm = form.vfMonthLimit || 200000;
  var idl = form.instaDayLimit || 120000, im = form.instaMonthLimit || 400000;
  if (!nv && !ni) return Promise.resolve({ ok: false, error: 'no-count' });
  return queue(function () {
    var p = Promise.resolve(), i = 0;
    for (var a = 1; a <= nv; a++) {
      (function (a, i) {
        p = p.then(function () {
          return db.collection('wallets').doc('w' + pad(i)).set({ name: 'فودافون ' + a, type: 'vf', phone: '', order: i, dayLimit: vd, monthLimit: vm, base: 0, baseTs: 0, active: true });
        });
      })(a, ++i);
    }
    for (var b = 1; b <= ni; b++) {
      (function (b, i) {
        p = p.then(function () {
          return db.collection('wallets').doc('w' + pad(i)).set({ name: 'إنستاباي ' + b, type: 'insta', phone: '', order: i, dayLimit: idl, monthLimit: im, base: 0, baseTs: 0, active: true });
        });
      })(b, ++i);
    }
    return p;
  }).then(function () { return { ok: true }; });
}
