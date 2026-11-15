// @ts-check
// Record and void transactions. index.html's `save()`/`voidTx()` read the
// DOM form and `S.ledger`/`UI.*` directly and mutate `S.ledger` optimistically
// before the write resolves; here the view (phase 5) owns the form and the
// optimistic update, and only the validation + persistence logic lives here.
//
// `queue` is index.html's own write-serializing `queue(fn)` (built by
// infrastructure/writeQueue.js's `createWriteQueue`, injected by the
// composition root) — passed in explicitly, the same way `db`/`clock` are,
// so this module never imports infrastructure.
import { buildPlan } from '../domain/plan.js';
import { baseK } from '../domain/kinds.js';
import { dayKey } from '../domain/time.js';
import { rid } from '../domain/ids.js';
import { entryChk } from '../domain/limits.js';

/**
 * Merges new tx records into their day-docs and persists each changed
 * day-doc — one `queue()` call per day-doc, exactly like index.html's
 * `addTxs` (so several queued writes still serialize relative to each other
 * and to the rest of the app, in the order they were issued).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 * @param {Record<string, object[]>} ledger current known ledger
 * @param {object[]} records
 */
export function persistTxs(db, queue, deviceId, ledger, records) {
  var by = {};
  records.forEach(function (rec) {
    var id = dayKey(rec.ts) + '_' + deviceId;
    (by[id] = by[id] || []).push(rec);
  });
  var ids = Object.keys(by);
  // Capture each day-doc's current txs NOW (not inside the queued write): a later
  // snapshot may replace the in-memory ledger before the queue gets to run.
  var prior = {};
  ids.forEach(function (id) { prior[id] = (ledger[id] || []).slice(); });
  return Promise.all(ids.map(function (id) {
    return queue(function () {
      var merged = prior[id].concat(by[id]);
      return db.collection('ledger').doc(id).set({ day: id.slice(0, 8), dev: deviceId, txs: merged });
    });
  }));
}

/**
 * @typedef {object} RecordTransactionParams
 * @property {string} kind
 * @property {number} amount
 * @property {number} fee
 * @property {number} [cost] owner-side wallet fee, single-wallet mode only
 * @property {'vf'|'other'} [dest]
 * @property {string} [note]
 * @property {string} [selectedWalletId] single-wallet mode
 * @property {'one'|'direct'|'collect'} [splitMode]
 * @property {Record<string,string>} [splits]
 * @property {string|null} [collectorId]
 * @property {boolean} [deferred] "آجل": customer cash is settled later (single-wallet in/out only)
 * @property {string} [customer] customer name, required when `deferred`
 */

/**
 * Validates and persists one transaction (single-wallet mode) or several
 * (split mode) — the same checks index.html's `save()` runs before writing.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {string} deviceId
 * @param {Record<string, object[]>} ledger
 * @param {RecordTransactionParams} params
 * @param {object[]} wallets split-eligible wallets when splitting
 * @param {import('../domain/compute.js').ComputeResult} computeResult
 * @param {import('../domain/money.js').DEFAULTS} settings
 */
export async function recordTransaction(db, queue, clock, deviceId, ledger, params, wallets, computeResult, settings) {
  var kind = params.kind, amount = params.amount, fee = params.fee || 0, note = params.note || '';
  if (!(amount > 0)) return { ok: false, error: 'invalid-amount' };

  var isSplit = (kind === 'out' || kind === 'iout') && params.splitMode && params.splitMode !== 'one';
  var records, warn = null;
  if (isSplit) {
    var plan = buildPlan(
      { kind: kind, amount: amount, fee: fee, splitMode: params.splitMode, collectorId: params.collectorId, splits: params.splits, dest: params.dest },
      wallets, computeResult, settings,
    );
    if (plan.short) return { ok: false, error: 'insufficient' };
    if (plan.stuckM) return { ok: false, error: 'stuck-month' };
    if (plan.stuckD) warn = 'd';
    if (!plan.ok) return { ok: false, error: params.splitMode === 'collect' ? 'choose-collector' : 'split-mismatch' };
    var base = clock.now(), g = rid('g');
    records = plan.legs.map(function (l, i) {
      var r = { id: rid('t'), ts: base + i, k: l.k, w: l.w, a: l.a, f: l.f || 0, n: i === 0 ? note : '', g: g, gi: i, gm: params.splitMode };
      if (l.c) r.c = l.c;
      if (l.d) r.d = l.d;
      if (l.to) r.to = l.to;
      if (l.ins) r.ins = 1;
      if (params.splitMode === 'direct' && i > 0) r.nc = 1;
      return r;
    });
  } else {
    if (!params.selectedWalletId) return { ok: false, error: 'no-wallet' };
    var x0 = computeResult.W[params.selectedWalletId];
    var cost = params.cost || 0;
    var bk = baseK(kind);
    if (x0 && ((bk === 'out' && x0.bal < amount + cost - 0.005) || (bk === 'cashout' && x0.bal < amount - 0.005))) {
      return { ok: false, error: 'insufficient' };
    }
    if (x0 && (bk === 'topup' || bk === 'in') && amount > 0) {
      var ec = entryChk(x0, settings, amount);
      if (ec.m) { if (bk === 'topup') return { ok: false, error: 'stuck-month' }; warn = 'm'; }
      else if (ec.d) warn = 'd';
    }
    var deferred = !!params.deferred && (bk === 'in' || bk === 'out');
    var cname = (params.customer || '').trim();
    if (deferred && !cname) return { ok: false, error: 'need-name' };
    var rec = { id: rid('t'), ts: clock.now(), k: kind, w: params.selectedWalletId, a: amount, f: fee, n: note };
    if (deferred) { rec.dl = 1; rec.cn = cname; }
    if (bk === 'out') { if (cost) rec.c = cost; if (kind === 'out') rec.d = params.dest; }
    if (kind === 'itopup') rec.m = fee === 0 ? 'atm' : 'fawry';
    records = [rec];
  }

  await persistTxs(db, queue, deviceId, ledger, records);
  return { ok: true, records: records, warn: warn };
}

/**
 * Voids a transaction (or, if it's part of a multi-leg group, every live leg
 * in that group) by writing `void` records referencing them.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {string} deviceId
 * @param {Record<string, object[]>} ledger
 * @param {string} txId
 */
export async function voidTransaction(db, queue, clock, deviceId, ledger, txId) {
  var ids = [txId], tx = null;
  Object.keys(ledger).forEach(function (k) {
    (ledger[k] || []).forEach(function (t) { if (t.id === txId) tx = t; });
  });
  if (tx && tx.g) {
    ids = [];
    Object.keys(ledger).forEach(function (k) {
      (ledger[k] || []).forEach(function (t) { if (t.g === tx.g && t.k !== 'void') ids.push(t.id); });
    });
  }
  var ts = clock.now();
  var voidRecords = ids.map(function (i, n) { return { id: rid('v'), ts: ts + n, k: 'void', ref: i }; });
  await persistTxs(db, queue, deviceId, ledger, voidRecords);
  return { ok: true, records: voidRecords };
}
