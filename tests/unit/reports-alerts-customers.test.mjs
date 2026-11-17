import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCust, custMatches, custKey } from '../../src/domain/customers.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { periodRange, buildReport } from '../../src/domain/reports.js';
import { walletAlerts } from '../../src/domain/alerts.js';
import { sortWallets } from '../../src/domain/wallets.js';
import { liveTxs, daySum } from '../../src/domain/ledger.js';
import { editCustomer, setCustomerLimit } from '../../src/application/customers.js';
import { editTxNote } from '../../src/application/transactions.js';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { makeFakeDb } from '../helpers/fakeAdapters.mjs';

const NOW = new Date('2026-11-17T12:00:00+02:00').getTime();
const W = [{ id: 'w1', name: 'أ', type: 'vf', base: 1000, baseTs: 0, active: true, order: 1 }, { id: 'w2', name: 'ب', type: 'vf', base: 5000, baseTs: 0, active: true, order: 2 }];
const dtx = (id, cn, k, a, f, ts) => ({ id, ts, k, w: 'w1', a, f, c: 0, dl: 1, cn });
const comp = (txs, settings = {}) => compute({ ledger: { d: txs }, wallets: W, settings: Object.assign({}, DEFAULTS, settings), now: NOW });

test('resolveCust: no aliases = plain key; chains follow; loops stop', () => {
  assert.deepEqual(resolveCust(undefined, ' Ali '), { key: 'ali', n: 'Ali' });
  assert.deepEqual(resolveCust({ a: 'B', b: 'C' }, 'A'), { key: 'c', n: 'C' });
  assert.equal(resolveCust({ a: 'B', b: 'A' }, 'A').key.length > 0, true); // terminates
  assert.equal(resolveCust({ a: 'A ' }, 'a').n, 'A');
});

test('compute: a rename keeps the old balance, old and new records add up under the new name', () => {
  const txs = [dtx('1', 'احمد', 'out', 500, 5, 1e12), dtx('2', 'احمد علي', 'out', 100, 0, 1e12 + 5)];
  const before = comp(txs);
  assert.equal(Object.keys(before.cust).length, 2);
  const after = comp(txs, { ca: { [custKey('احمد')]: 'احمد علي' } });
  assert.deepEqual(Object.keys(after.cust), [custKey('احمد علي')]);
  assert.equal(after.cust[custKey('احمد علي')].v, before.cust[custKey('احمد')].v + before.cust[custKey('احمد علي')].v);
  assert.equal(after.cust[custKey('احمد علي')].n, 'احمد علي');
  // money outside the customer map is untouched
  assert.equal(after.cash, before.cash); assert.equal(after.W.w1.bal, before.W.w1.bal); assert.equal(after.pMon, before.pMon);
});

test('compute: opening balances (cb) follow the rename too; no ca = unchanged behaviour', () => {
  const cb = { [custKey('سمير')]: { n: 'سمير', v: 300 } };
  assert.equal(comp([], { cb }).cust[custKey('سمير')].v, 300);
  const c = comp([dtx('1', 'سمير', 'out', 100, 0, 1e12)], { cb, ca: { [custKey('سمير')]: 'سمير الكبير' } });
  assert.equal(c.cust[custKey('سمير الكبير')].v, 400);
});

test('editCustomer: rename writes an alias, moves limit/phone/note, refuses a taken name', async () => {
  const db = makeFakeDb(), queue = createWriteQueue();
  let settings = Object.assign({}, DEFAULTS, { cm: { [custKey('احمد')]: { n: 'احمد', lim: 900 } } });
  const cust = { [custKey('احمد')]: { n: 'احمد', v: 100, last: 1 }, [custKey('منى')]: { n: 'منى', v: 5, last: 1 } };
  const r = await editCustomer(db, queue, settings, cust, { key: custKey('احمد'), name: 'احمد علي', phone: '010', note: 'جاري' });
  assert.equal(r.ok, true); settings = r.settings;
  assert.equal(settings.ca[custKey('احمد')], 'احمد علي');
  assert.equal(settings.cm[custKey('احمد علي')].lim, 900);
  assert.equal(settings.cm[custKey('احمد علي')].ph, '010');
  assert.ok(!settings.cm[custKey('احمد')]);
  assert.equal((await editCustomer(db, queue, settings, cust, { key: custKey('منى'), name: 'منى', note: 'x' })).ok, true);
  const cust2 = { [custKey('احمد علي')]: { n: 'احمد علي', v: 100, last: 1 }, [custKey('منى')]: { n: 'منى', v: 5, last: 1 } };
  assert.equal((await editCustomer(db, queue, settings, cust2, { key: custKey('منى'), name: 'احمد', phone: '' })).ok, true); // 'احمد' is only an old alias now, not a live account
  assert.equal((await editCustomer(db, queue, settings, cust2, { key: custKey('منى'), name: 'احمد علي' })).error, 'exists');
  assert.equal((await editCustomer(db, queue, settings, { a: { n: 'a', v: 1 }, b: { n: 'b', v: 1 } }, { key: 'a', name: 'B' })).error, 'exists');
  assert.equal((await editCustomer(db, queue, settings, cust, { key: custKey('منى'), name: '  ' })).error, 'need-name');
  // limit set by the typed old name lands on the new name
  const l = await setCustomerLimit(db, queue, settings, 'احمد', 50);
  assert.equal(l.settings.cm[custKey('احمد علي')].lim, 50);
});

test('custMatches: name, phone, note and operation notes; Arabic digits ok', () => {
  const c = { n: 'محمود' };
  assert.ok(custMatches(c, undefined, '', ''));
  assert.ok(custMatches(c, undefined, '', 'محم'));
  assert.ok(custMatches(c, { ph: '01012345678' }, '', '٠١٠١٢٣'));
  assert.ok(custMatches(c, { note: 'جاره' }, '', 'جاره'));
  assert.ok(custMatches(c, undefined, ' شحن ببجي', 'ببجي'));
  assert.ok(!custMatches(c, { ph: '1' }, '', 'سمير'));
});

test('periodRange: Saturday-Friday weeks and calendar months, going back', () => {
  assert.deepEqual(periodRange('week', 0, '20261117'), { from: '20261114', to: '20261120' }); // Tue 17 Nov
  assert.deepEqual(periodRange('week', 1, '20261117'), { from: '20261107', to: '20261113' });
  assert.deepEqual(periodRange('week', 0, '20261114'), { from: '20261114', to: '20261120' }); // a Saturday
  assert.deepEqual(periodRange('month', 0, '20261117'), { from: '20261101', to: '20261130' });
  assert.deepEqual(periodRange('month', 1, '20260105'), { from: '20251201', to: '20251231' });
});

test('buildReport: totals match daySum, per-wallet and per-day rows add up', () => {
  const t = (id, w, k, a, f, c, ts) => ({ id, ts, k, w, a, f, c });
  const d = (day) => new Date(`2026-11-${day}T12:00:00+02:00`).getTime();
  const live = [t('1', 'w1', 'out', 1000, 10, 2, d(15)), t('2', 'w2', 'in', 500, 5, 0, d(15)), t('3', 'w1', 'out', 200, 3, 0, d(16)), t('4', 'w1', 'out', 99, 9, 0, d(25))];
  const R = buildReport(live, W, '20261114', '20261120');
  assert.equal(R.total.n, 3);
  assert.equal(R.total.pf, daySum(live.slice(0, 3)).pf);
  assert.equal(R.sent, 1200); assert.equal(R.recv, 500);
  assert.equal(R.wallets.reduce((s, x) => s + x.pf, 0), R.total.pf);
  assert.equal(R.days.length, 2); assert.equal(R.days.reduce((s, x) => s + x.pf, 0), R.total.pf);
});

test('walletAlerts: 20% of a limit left, and a minimum balance', () => {
  const ws = [{ id: 'a', name: 'أ', dayLimit: 1000, monthLimit: 10000, minBal: 500 }, { id: 'b', name: 'ب', dayLimit: 1000, monthLimit: 10000 }, { id: 'c', name: 'ج', active: false, dayLimit: 1, monthLimit: 1 }];
  const Wx = { a: { bal: 100, dOut: 850, dIn: 0, mOut: 850, mIn: 0 }, b: { bal: 9000, dOut: 100, dIn: 100, mOut: 100, mIn: 100 }, c: { bal: 0, dOut: 9, dIn: 9, mOut: 9, mIn: 9 } };
  const al = walletAlerts(ws, Wx, { defDay: 60000, defMon: 200000 });
  assert.equal(al.length, 1); assert.equal(al[0].id, 'a');
  assert.ok(al[0].parts.some((p) => p.includes('إرسال النهارده')) && al[0].parts.some((p) => p.includes('أقل من الحد الأدنى')));
  Wx.a.dOut = 700; Wx.a.bal = 900; // 30% left, balance fine
  assert.equal(walletAlerts(ws, Wx, { defDay: 60000, defMon: 200000 }).length, 0);
});

test('sortWallets: biggest balance first, stopped last, manual keeps the saved order', () => {
  const ws = [{ id: 'a', order: 1 }, { id: 'b', order: 2 }, { id: 'c', order: 3, active: false }, { id: 'd', order: 4 }];
  const Wx = { a: { bal: 10 }, b: { bal: 500 }, c: { bal: 9999 }, d: { bal: 500 } };
  assert.deepEqual(sortWallets(ws, Wx, 'bal').map((w) => w.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(sortWallets(ws, Wx, 'manual').map((w) => w.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ws.map((w) => w.id), ['a', 'b', 'c', 'd']); // input not mutated
});

test('editTxNote: changes only the note (and marks it edited); balances stay identical', async () => {
  const txs = [{ id: 't1', ts: 1e12, k: 'out', w: 'w1', a: 100, f: 1, c: 0, n: 'قديم' }, { id: 't2', ts: 1e12 + 1, k: 'out', w: 'w1', a: 50, f: 0, c: 0, g: 'G' }, { id: 't3', ts: 1e12 + 2, k: 'out', w: 'w2', a: 10, f: 0, c: 0, g: 'G' }];
  const db = makeFakeDb(), queue = createWriteQueue();
  const ledger = { '20260101_dA': txs };
  const before = compute({ ledger: { x: txs }, wallets: W, settings: DEFAULTS, now: NOW });
  assert.equal((await editTxNote(db, queue, ledger, 'zzz', 'x')).ok, false);
  await editTxNote(db, queue, ledger, 't1', ' جديد ');
  let saved = db.__dump()['ledger/20260101_dA'];
  assert.equal(saved.txs[0].n, 'جديد'); assert.equal(saved.txs[0].ed, 1); assert.equal(saved.dev, 'dA'); assert.equal(saved.day, '20260101');
  assert.equal(saved.txs[1].ed, undefined);
  await editTxNote(db, queue, ledger, 't2', 'مجموعة'); // split group: every leg
  saved = db.__dump()['ledger/20260101_dA'];
  assert.ok(saved.txs[1].ed && saved.txs[2].ed && saved.txs[2].n === 'مجموعة');
  const after = compute({ ledger: { x: saved.txs }, wallets: W, settings: DEFAULTS, now: NOW });
  assert.deepEqual([after.cash, after.pMon, after.W.w1.bal, after.W.w2.bal], [before.cash, before.pMon, before.W.w1.bal, before.W.w2.bal]);
  await editTxNote(db, queue, ledger, 't1', ''); // clearing the note
  assert.equal('n' in db.__dump()['ledger/20260101_dA'].txs[0], false);
  assert.ok(liveTxs({ x: saved.txs }).length === 3);
});
