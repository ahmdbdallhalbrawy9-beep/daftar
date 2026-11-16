import { walletRoom } from '../../src/domain/limits.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { recordTransaction, voidTransaction, persistTxs } from '../../src/application/transactions.js';
import { settleCustomer, setCustomerLimit } from '../../src/application/customers.js';
import { wipeTransactions } from '../../src/application/wipe.js';
import { compute } from '../../src/domain/compute.js';
import { buildPlan } from '../../src/domain/plan.js';
import { rank } from '../../src/domain/rank.js';
import { resolveCollector } from '../../src/domain/wallets.js';
import { entryChk } from '../../src/domain/limits.js';
import { deferLimitCheck, custKey } from '../../src/domain/customers.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { limBar } from '../../src/presentation/components/bars.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

const NOW = 1700000000000;
const W = (id, bal, dl, ml, extra) => Object.assign({ id, name: id, type: 'vf', base: bal, baseTs: 0, dayLimit: dl, monthLimit: ml, active: true }, extra);
const S = DEFAULTS;
const comp = (ledger, wallets, settings) => compute({ ledger, wallets, settings: settings || S, now: NOW });
const dayId = 'x';
const led = (txs) => ({ [dayId]: txs });
const tx = (id, k, w, a, extra) => Object.assign({ id, ts: NOW - 1000 + Number(id.replace(/\D/g, '') || 0), k, w, a, f: 0, c: 0 }, extra);

/* ---------- Feature 1: limits ---------- */
test('entryChk: monthly and daily stuck flags', () => {
  const ws = [W('a', 1000, 100000, 20000)];
  const C = comp(led([tx('1', 'out', 'a', 15000, {})]), [W('a', 19000, 100000, 20000)]); // bal 4000, room 5000
  assert.equal(entryChk(C.W.a, S, 1000).m, false);
  assert.equal(entryChk(C.W.a, S, 1001).m, true);
  assert.equal(entryChk(C.W.a, S, 1001).maxM, 1000);
  assert.ok(ws.length);
});

test('entryChk: daily-only stuck', () => {
  const C = comp(led([tx('1', 'out', 'a', 8000, {})]), [W('a', 11000, 10000, 200000)]); // bal 3000, day room 2000
  const e = entryChk(C.W.a, S, 100);
  assert.equal(e.m, false); assert.equal(e.d, true);
});

test('buildPlan collect: collector stuck monthly blocks, daily only warns', () => {
  const ws = [W('c', 7000, 100000, 20000), W('o', 50000, 100000, 200000)];
  const Cm = comp(led([tx('1', 'out', 'c', 15000, {})]), [W('c', 22000, 100000, 20000), ws[1]]); // c bal 7000, room 5000
  const p = buildPlan({ kind: 'out', amount: 3000, fee: 0, splitMode: 'collect', collectorId: 'c', splits: { o: '3000' }, dest: 'vf' }, ws, Cm, S);
  assert.equal(p.stuckM, true); assert.equal(p.ok, false);
  // daily only: day room small, month room large
  const wd = [W('c', 3000, 1000, 200000), W('o', 50000, 100000, 200000)];
  const Cd = comp({}, wd);
  const pd = buildPlan({ kind: 'out', amount: 500, fee: 0, splitMode: 'collect', collectorId: 'c', splits: { o: '500' }, dest: 'vf' }, wd, Cd, S);
  assert.equal(pd.stuckM, false); assert.equal(pd.stuckD, true); assert.equal(pd.ok, true);
});

test('resolveCollector prefers wallets whose monthly send room covers the amount', () => {
  const ws = [W('rich', 90000, 100000, 20000), W('ok', 10000, 100000, 200000)];
  const C = comp({}, ws);
  assert.equal(resolveCollector(ws, C, null), 'rich');
  assert.equal(resolveCollector(ws, C, null, 30000, S), 'ok');
  assert.equal(resolveCollector(ws, C, null, 300000, S), 'rich', 'nobody fits: fall back to all');
  assert.equal(resolveCollector(ws, C, 'rich', 30000, S), 'rich', 'a valid choice is kept');
});

test('rank: monthly-stuck wallet is unfit, daily-stuck is soft and sorts after clean ones', () => {
  const ws = [W('m', 4000, 100000, 20000), W('d', 3000, 10000, 200000), W('f', 100, 100000, 200000)];
  const C = comp(led([tx('1', 'out', 'm', 15000, {}), tx('2', 'out', 'd', 8000, {})]), [W('m', 19000, 100000, 20000), W('d', 11000, 10000, 200000), ws[2]]);
  const r = rank('in', 3000, ws, C, S);
  const by = Object.fromEntries(r.map((x) => [x.w.id, x]));
  assert.equal(by.m.fits, false); assert.ok(by.m.why[0].includes('هتقف عليها'));
  assert.equal(by.d.soft, 1);
  assert.equal(r[0].w.id, 'f');
  const t = rank('topup', 6000, ws, C, S);
  assert.equal(t.find((x) => x.w.id === 'm').fits, false);
});

const room = (inn, out, lim, bal) => { const r = walletRoom(lim, lim, { bal, dIn: inn, dOut: out, mIn: inn, mOut: out }); return { out: r.mOut, in: r.mIn }; };
test('limBar: receive bar shows the effective amount with a note', () => {
  assert.match(limBar('الشهر', room(0, 15000, 20000, 4000), 20000), /متبقي 1,000 من 20,000.*<div class="limnote">محدود بالتحويل/);
  assert.doesNotMatch(limBar('الشهر', room(0, 0, 20000, 0), 20000), /محدود/);
});

test('recordTransaction: topup blocked when monthly stuck, warns when only daily', async () => {
  const ws = [W('a', 19000, 100000, 20000), W('b', 11000, 10000, 200000)];
  const C = comp(led([tx('1', 'out', 'a', 15000, {}), tx('2', 'out', 'b', 8000, {})]), ws);
  const run = (sel, amount) => {
    const db = makeFakeDb(), clock = makeFakeClock(NOW);
    return recordTransaction(db, createWriteQueue(), clock, 'd', {}, { kind: 'topup', amount, fee: 0, selectedWalletId: sel }, ws, C, S).then((r) => [r, db]);
  };
  const [blocked, dbB] = await run('a', 1001);
  assert.equal(blocked.error, 'stuck-month'); assert.deepEqual(dbB.__dump(), {});
  assert.equal((await run('a', 1000))[0].ok, true);
  const [daily] = await run('b', 100);
  assert.equal(daily.ok, true); assert.equal(daily.warn, 'd');
});

test("recordTransaction: 'in' stuck monthly only warns", async () => {
  const ws = [W('a', 19000, 100000, 20000)];
  const C = comp(led([tx('1', 'out', 'a', 15000, {})]), ws);
  const r = await recordTransaction(makeFakeDb(), createWriteQueue(), makeFakeClock(NOW), 'd', {}, { kind: 'in', amount: 2000, fee: 0, selectedWalletId: 'a' }, ws, C, S);
  assert.equal(r.ok, true); assert.equal(r.warn, 'm');
});

test('recordTransaction: collect plan stuck monthly is refused', async () => {
  const ws = [W('c', 22000, 100000, 20000), W('o', 50000, 100000, 200000)];
  const C = comp(led([tx('1', 'out', 'c', 15000, {})]), ws);
  const r = await recordTransaction(makeFakeDb(), createWriteQueue(), makeFakeClock(NOW), 'd', {}, { kind: 'out', amount: 3000, fee: 0, dest: 'vf', splitMode: 'collect', collectorId: 'c', splits: { o: '3000' } }, ws, C, S);
  assert.equal(r.error, 'stuck-month');
});

/* ---------- Feature 2: آجل ---------- */
const mk = () => [W('a', 10000, 100000, 200000)];
const cashBase = Object.assign({}, S, { baseCash: 5000, baseTs: 1 });

test('deferred in/out: wallet moves, drawer does not, customer net tracks', () => {
  const ws = mk();
  const L = led([tx('1', 'in', 'a', 1000, { f: 10, dl: 1, cn: 'أحمد' }), tx('2', 'out', 'a', 500, { f: 5, dl: 1, cn: 'أحمد' })]);
  const C = comp(L, ws, cashBase);
  assert.equal(C.cash, 5000, 'drawer untouched');
  assert.equal(C.W.a.bal, 10000 + 1000 - 500);
  const k = custKey('أحمد');
  assert.equal(C.cust[k].v, -(1000 - 10) + (500 + 5));
  assert.equal(C.pDay, 15, 'profit counted on the tx date');
});

test('settle rc / pd move the drawer and the net; void of settle restores', () => {
  const ws = mk();
  const base = [tx('1', 'out', 'a', 1000, { f: 0, dl: 1, cn: 'سعيد' })]; // he owes me 1000
  let C = comp(led(base.concat([{ id: 's1', ts: NOW - 10, k: 'settle', cn: 'سعيد', a: 400, s: 'rc' }])), ws, cashBase);
  assert.equal(C.cust[custKey('سعيد')].v, 600); assert.equal(C.cash, 5400);
  C = comp(led(base.concat([{ id: 's1', ts: NOW - 10, k: 'settle', cn: 'سعيد', a: 400, s: 'rc' }, { id: 'v1', ts: NOW - 5, k: 'void', ref: 's1' }])), ws, cashBase);
  assert.equal(C.cust[custKey('سعيد')].v, 1000); assert.equal(C.cash, 5000);
  const owe = [tx('1', 'in', 'a', 1000, { dl: 1, cn: 'منى' }), { id: 's2', ts: NOW - 10, k: 'settle', cn: 'منى', a: 300, s: 'pd' }];
  C = comp(led(owe), ws, cashBase);
  assert.equal(C.cust[custKey('منى')].v, -700); assert.equal(C.cash, 4700);
});

test('settleCustomer: validates amount, cash, direction; writes a settle tx', async () => {
  const ws = mk();
  const owe = led([tx('1', 'in', 'a', 1000, { dl: 1, cn: 'منى' })]);
  const C = comp(owe, ws, Object.assign({}, S, { baseCash: 200, baseTs: 1 }));
  const key = custKey('منى');
  const call = (amount, CC) => { const db = makeFakeDb(); return settleCustomer(db, createWriteQueue(), makeFakeClock(NOW), 'd', owe, CC || C, { key, amount }).then((r) => [r, db]); };
  assert.equal((await call(0))[0].error, 'invalid-amount');
  assert.equal((await call(1001))[0].error, 'invalid-amount');
  assert.equal((await call(500))[0].error, 'no-cash');
  const rich = comp(owe, ws, Object.assign({}, S, { baseCash: 5000, baseTs: 1 }));
  const [r, db] = await call(500, rich);
  assert.equal(r.ok, true); assert.equal(r.record.s, 'pd');
  const d = db.__dump(); assert.equal(Object.values(d)[0].txs[0].k, 'settle');
  assert.equal((await settleCustomer(makeFakeDb(), createWriteQueue(), makeFakeClock(NOW), 'd', {}, rich, { key: 'nobody', amount: 5 })).error, 'no-balance');
});

test('recordTransaction: deferred needs a name, only in/out, stores dl/cn', async () => {
  const ws = mk(), C = comp({}, ws, cashBase), db = makeFakeDb();
  const q = createWriteQueue(), cl = makeFakeClock(NOW);
  const bad = await recordTransaction(db, q, cl, 'd', {}, { kind: 'in', amount: 100, fee: 1, selectedWalletId: 'a', deferred: true, customer: ' ' }, ws, C, cashBase);
  assert.equal(bad.error, 'need-name');
  const ok = await recordTransaction(db, q, cl, 'd', {}, { kind: 'in', amount: 100, fee: 1, selectedWalletId: 'a', deferred: true, customer: 'أحمد' }, ws, C, cashBase);
  assert.equal(ok.records[0].dl, 1); assert.equal(ok.records[0].cn, 'أحمد');
  const tp = await recordTransaction(makeFakeDb(), q, cl, 'd', {}, { kind: 'topup', amount: 100, fee: 0, selectedWalletId: 'a', deferred: true, customer: 'أحمد' }, ws, C, cashBase);
  assert.equal(tp.records[0].dl, undefined, 'topup is never deferred');
});

test('deferLimitCheck is warning-only and prefers the typed limit', () => {
  const ws = mk();
  const C = comp(led([tx('1', 'out', 'a', 1000, { dl: 1, cn: 'ع' })]), ws);
  const st = Object.assign({}, S, { cm: { [custKey('ع')]: { n: 'ع', lim: 1500 } } });
  assert.equal(deferLimitCheck(C, st, 'ع', 'out', 400, 0).over, false);
  assert.equal(deferLimitCheck(C, st, 'ع', 'out', 600, 0).over, true);
  assert.equal(deferLimitCheck(C, st, 'ع', 'out', 600, 0, 5000).over, false);
  assert.equal(deferLimitCheck(C, S, 'ع', 'out', 600, 0).over, false, 'no limit = no warning');
});

test('setCustomerLimit stores settings.cm', async () => {
  const db = makeFakeDb(), r = await setCustomerLimit(db, createWriteQueue(), S, 'أحمد', 2000);
  assert.equal(r.settings.cm[custKey('أحمد')].lim, 2000);
  assert.equal(db.__dump()['settings/main'].cm[custKey('أحمد')].n, 'أحمد');
});

test('wipeTransactions keeps open credit (settings.cb) and settle works afterwards', async () => {
  const ws = mk(), old = led([tx('1', 'out', 'a', 1000, { dl: 1, cn: 'سعيد' })]);
  const C = comp(old, ws, cashBase);
  const db = makeFakeDb({ 'wallets/a': ws[0], 'ledger/x': { txs: old.x }, 'settings/main': cashBase });
  const clock = makeFakeClock(NOW + 5000);
  await wipeTransactions(db, createWriteQueue(), clock, C, ws, cashBase, { ledger: old, closes: [], inbox: {} });
  const dump = db.__dump();
  assert.equal(dump['settings/main'].cb[custKey('سعيد')].v, 1000);
  assert.equal(dump['ledger/x'], undefined);
  const st = dump['settings/main'], w2 = [Object.assign({}, ws[0], dump['wallets/a'])];
  const after = { y: [{ id: 's', ts: NOW + 9000, k: 'settle', cn: 'سعيد', a: 1000, s: 'rc' }] };
  const C2 = compute({ ledger: after, wallets: w2, settings: st, now: NOW + 10000 });
  assert.equal(C2.cust[custKey('سعيد')].v, 0);
  assert.equal(C2.cash, st.baseCash + 1000);
});

test('persistTxs captures the day-doc eagerly (a ledger swapped before the queue runs does not lose txs)', async () => {
  const db = makeFakeDb(), q = createWriteQueue(), ledger = {};
  const id = new Date(NOW).toISOString();
  void id;
  const t1 = tx('1', 'in', 'a', 1, {});
  await persistTxs(db, q, 'd', ledger, [t1]);
  const docKey = Object.keys(db.__dump())[0], docId = docKey.split('/')[1];
  const ledger2 = { [docId]: [t1] };
  const p = persistTxs(db, q, 'd', ledger2, [tx('2', 'in', 'a', 2, {})]);
  ledger2[docId] = []; // snapshot swap right after the call
  await p;
  assert.equal(db.__dump()[docKey].txs.length, 2);
});
