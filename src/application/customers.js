// @ts-check
// Customer accounts for "الآجل": settle (fully or partly) an open balance, and keep
// the owner-entered per-customer limit. A settle is a normal ledger tx, so it syncs
// and can be voided like any other.
import { rid } from '../domain/ids.js';
import { custKey } from '../domain/customers.js';
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
  var key = custKey(name);
  if (!key) return { ok: false, error: 'need-name' };
  var cm = Object.assign({}, settings.cm || {});
  cm[key] = { n: name.trim(), lim: lim > 0 ? lim : 0 };
  var merged = await saveSettings(db, queue, /** @type {any} */ (settings), { cm: cm });
  return { ok: true, settings: merged };
}
