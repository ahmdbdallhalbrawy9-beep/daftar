// @ts-check
// Customer accounts for "الآجل": settle (fully or partly) an open balance, and keep
// the owner-entered per-customer limit. A settle is a normal ledger tx, so it syncs
// and can be voided like any other.
import { rid } from '../domain/ids.js';
import { custKey, resolveCust } from '../domain/customers.js';
import { persistTxs } from './transactions.js';
import { saveSettings } from './settingsUseCases.js';

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {string} deviceId
 * @param {Record<string, object[]>} ledger
 * @param {import('../domain/compute.js').ComputeResult} C
 * @param {{key: string, amount: number}} params
 */
export async function settleCustomer(db, queue, clock, deviceId, ledger, C, params) {
  var c = (C.cust || {})[params.key], a = params.amount;
  if (!c || Math.abs(c.v) < 0.005) return { ok: false, error: 'no-balance' };
  if (!(a > 0) || a > Math.abs(c.v) + 0.005) return { ok: false, error: 'invalid-amount' };
  var s = c.v > 0 ? 'rc' : 'pd';
  if (s === 'pd' && C.cash < a - 0.005) return { ok: false, error: 'no-cash', cash: C.cash };
  var rec = { id: rid('t'), ts: clock.now(), k: 'settle', cn: c.n, a: a, s: s };
  await persistTxs(db, queue, deviceId, ledger, [rec]);
  return { ok: true, record: rec };
}

/**
 * Sets (or clears, with 0) the max deferred balance for a customer. Warning-only everywhere.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {{cm?: Record<string,{n:string,lim:number}>}} settings
 * @param {string} name
 * @param {number} lim
 */
export async function setCustomerLimit(db, queue, settings, name, lim) {
  var r = resolveCust(/** @type {any} */ (settings).ca, name);
  if (!r.key) return { ok: false, error: 'need-name' };
  var cm = Object.assign({}, settings.cm || {});
  cm[r.key] = Object.assign({}, cm[r.key], { n: r.n, lim: lim > 0 ? lim : 0 });
  var merged = await saveSettings(db, queue, /** @type {any} */ (settings), { cm: cm });
  return { ok: true, settings: merged };
}

/**
 * Edits a customer's name / phone / note. A rename never rewrites old records: it adds an alias
 * (`settings.ca[oldKey] = newName`) so every old and new record, the opening balances and the saved
 * limit all follow the customer to the new name. Refuses a name that already belongs to another customer.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {any} settings
 * @param {Record<string,{n:string}>} cust  current accounts (compute result `cust`)
 * @param {{key: string, name: string, phone?: string, note?: string}} p
 */
export async function editCustomer(db, queue, settings, cust, p) {
  var cur = (cust || {})[p.key], name = String(p.name || '').trim();
  if (!cur) return { ok: false, error: 'not-found' };
  if (!name) return { ok: false, error: 'need-name' };
  var ca = Object.assign({}, settings.ca || {}), cm = Object.assign({}, settings.cm || {});
  var nk = custKey(name);
  if (nk !== p.key && cust[nk]) return { ok: false, error: 'exists' };
  var info = Object.assign({}, cm[p.key], { n: name, ph: String(p.phone || '').trim(), note: String(p.note || '').trim() });
  if (!info.ph) delete info.ph;
  if (!info.note) delete info.note;
  if (nk !== p.key || name !== cur.n) {
    ca[p.key] = name;
    if (nk !== p.key) delete ca[nk];   // renaming back to an older alias must not make a loop
  }
  if (nk !== p.key) delete cm[p.key];
  cm[nk] = info;
  var merged = await saveSettings(db, queue, settings, { ca: ca, cm: cm });
  return { ok: true, settings: merged, key: nk };
}
