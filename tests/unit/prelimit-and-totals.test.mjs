import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { createOrUpdateWallet } from '../../src/application/wallets.js';
import { compute } from '../../src/domain/compute.js';
import { rank } from '../../src/domain/rank.js';
import { buildPlan } from '../../src/domain/plan.js';
import { entryChk, preFromRemaining } from '../../src/domain/limits.js';
import { walletTotals } from '../../src/domain/wallets.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { limBar } from '../../src/presentation/components/bars.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

const NOW = Date.UTC(2026, 10, 16, 10, 0, 0); // 16 Nov 2026, 12:00 Cairo
const NEXT = Date.UTC(2026, 11, 1, 10, 0, 0); // 1 Dec 2026
const S = DEFAULTS;
const W = (id, o) => Object.assign({ id, name: id, type: 'vf', base: 10000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true }, o);
const comp = (ledger, wallets, now) => compute({ ledger, wallets, settings: S, now: now || NOW });
const tx = (id, k, w, a) => ({ id, ts: NOW - 1000, k, w, a, f: 0, c: 0 });

test('pre-consumption only moves monthly usage, never balance, profit or cash', () => {
  const w = W('a', { pre: { mk: '202611', i: 30000, o: 150000 } });
  const C = comp({ x: [tx('1', 'out', 'a', 1000)] }, [w]);
  assert.equal(C.W.a.mOut, 151000); assert.equal(C.W.a.mIn, 30000);
  assert.equal(C.W.a.mOutRec, 1000); assert.equal(C.W.a.mInRec, 0);
  assert.equal(C.W.a.dOut, 1000, 'day usage untouched');
  assert.equal(C.W.a.bal, 10000 - 1000, 'balance untouched');
  const none = comp({ x: [tx('1', 'out', 'a', 1000)] }, [W('a')]);
  assert.equal(C.cash, none.cash); assert.equal(C.pMon, none.pMon);
});

test('pre-consumption disappears by itself in a new month', () => {
  const w = W('a', { pre: { mk: '202611', i: 30000, o: 150000 } });
  const C = comp({}, [w], NEXT);
  assert.equal(C.W.a.mOut, 0); assert.equal(C.W.a.mIn, 0);
});

test('limits, picker ranking and stuck checks all see the pre-consumption', () => {
  const ws = [W('a', { pre: { mk: '202611', i: 0, o: 195000 } }), W('b')];
  const C = comp({}, ws);
  assert.equal(entryChk(C.W.a, S, 6000).m, true, 'bal 10000 > send room 5000');
  const r = rank('out', 10000, ws, C, S);
  assert.equal(r.find((x) => x.w.id === 'a').fits, false);
  assert.equal(r.find((x) => x.w.id === 'a').remM, 5000);
  const p = buildPlan({ kind: 'out', amount: 3000, fee: 0, splitMode: 'collect', collectorId: 'a', splits: { b: '3000' }, dest: 'vf' }, ws, C, S);
  assert.equal(p.stuckM, true);
});

test('receive pre-consumption limits the receive bar', () => {
  const ws = [W('a', { base: 0, pre: { mk: '202611', i: 199900, o: 0 } })];
  const C = comp({}, ws);
  assert.match(limBar('الشهر', C.W.a.mIn, C.W.a.mOut, 200000, C.W.a.bal), /استلام \(سحب\).*متبقي 100 من 200,000/);
});

test('preFromRemaining subtracts what the app already counted and never goes negative', () => {
  assert.equal(preFromRemaining(200000, 150, 0), 199850);
  assert.equal(preFromRemaining(200000, 150, 1000), 198850);
  assert.equal(preFromRemaining(200000, 500000, 0), 0);
  assert.equal(preFromRemaining(200000, -5, 0), 200000);
});

test('createOrUpdateWallet stores pre only for the fields the owner changed', async () => {
  const db = makeFakeDb({ 'wallets/a': W('a') });
  const clock = makeFakeClock(NOW), q = createWriteQueue();
  const w = W('a');
  const form = { name: 'a', phone: '', type: 'vf', dayLimit: 60000, monthLimit: 200000, active: true, balance: 10000, remainOut: 100, recOut: 1000 };
  await createOrUpdateWallet(db, q, clock, w, 10000, form, S, [w]);
  let d = db.__dump()['wallets/a'];
  assert.deepEqual(d.pre, { mk: '202611', i: 0, o: 198900 });
  // later: only the receive side changes; the send side must be kept
  const w2 = Object.assign({}, w, { pre: d.pre });
  await createOrUpdateWallet(db, q, clock, w2, 10000, { name: 'a', phone: '', type: 'vf', dayLimit: 60000, monthLimit: 200000, active: true, balance: 10000, remainIn: 5000, recIn: 0 }, S, [w2]);
  d = db.__dump()['wallets/a'];
  assert.deepEqual(d.pre, { mk: '202611', i: 195000, o: 198900 });
  // no remaining fields => pre untouched
  await createOrUpdateWallet(db, q, clock, Object.assign({}, w, { pre: d.pre }), 10000, { name: 'renamed', phone: '', type: 'vf', dayLimit: 60000, monthLimit: 200000, active: true, balance: 10000 }, S, [w]);
  assert.deepEqual(db.__dump()['wallets/a'].pre, d.pre);
});

test('an old pre from a previous month is dropped when a new one is saved', async () => {
  const db = makeFakeDb({ 'wallets/a': W('a') });
  const w = W('a', { pre: { mk: '202610', i: 111, o: 222 } });
  await createOrUpdateWallet(db, createWriteQueue(), makeFakeClock(NOW), w, 10000, { name: 'a', phone: '', type: 'vf', dayLimit: 60000, monthLimit: 200000, active: true, balance: 10000, remainOut: 1000, recOut: 0 }, S, [w]);
  assert.deepEqual(db.__dump()['wallets/a'].pre, { mk: '202611', i: 0, o: 199000 });
});

test('walletTotals: Vodafone / InstaPay / all, active wallets only', () => {
  const ws = [W('a', { base: 100 }), W('b', { base: 50, type: 'other' }), W('c', { base: 7, type: 'insta' }), W('d', { base: 999, active: false })];
  const t = walletTotals(ws, comp({}, ws));
  assert.deepEqual(t, { vf: 150, insta: 7, all: 157 });
});
