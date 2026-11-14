import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { recordTransaction, voidTransaction } from '../../src/application/transactions.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

function wallets() {
  return [
    { id: 'v1', name: 'ف1', type: 'vf', base: 1000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'v2', name: 'ف2', type: 'vf', base: 500, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
}

test('recordTransaction: single-wallet "out" persists one tx into its day-doc', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: clock.now() });
  const res = await recordTransaction(
    db, queue, clock, 'devA', {},
    { kind: 'out', amount: 100, fee: 5, cost: 1, dest: 'vf', note: 'test', selectedWalletId: 'v1' },
    ws, C, DEFAULTS,
  );
  assert.equal(res.ok, true);
  assert.equal(res.records.length, 1);
  const dump = db.__dump();
  const docId = Object.keys(dump).find((k) => k.startsWith('ledger/'));
  assert.ok(docId, 'wrote a ledger day-doc');
  assert.equal(dump[docId].txs.length, 1);
  assert.equal(dump[docId].txs[0].a, 100);
  assert.equal(dump[docId].dev, 'devA');
});

test('recordTransaction: single-wallet "out" refuses when the balance is insufficient', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: clock.now() });
  const res = await recordTransaction(
    db, queue, clock, 'devA', {},
    { kind: 'out', amount: 10000, fee: 5, cost: 1, dest: 'vf', selectedWalletId: 'v2' },
    ws, C, DEFAULTS,
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, 'insufficient');
  assert.deepEqual(db.__dump(), {}, 'nothing persisted');
});

test('recordTransaction: direct split across two wallets writes a grouped tx set', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: clock.now() });
  const res = await recordTransaction(
    db, queue, clock, 'devA', {},
    { kind: 'out', amount: 1000, fee: 10, dest: 'vf', splitMode: 'direct', splits: { v1: '600', v2: '400' } },
    ws, C, DEFAULTS,
  );
  assert.equal(res.ok, true);
  assert.equal(res.records.length, 2);
  const g = res.records[0].g;
  assert.ok(g && res.records.every((r) => r.g === g), 'both legs share a group id');
  const dump = db.__dump();
  const docId = Object.keys(dump).find((k) => k.startsWith('ledger/'));
  assert.equal(dump[docId].txs.length, 2);
});

test('recordTransaction: a split that does not add up to the amount is rejected and nothing is written', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: clock.now() });
  const res = await recordTransaction(
    db, queue, clock, 'devA', {},
    { kind: 'out', amount: 1000, fee: 10, dest: 'vf', splitMode: 'direct', splits: { v1: '600', v2: '300' } },
    ws, C, DEFAULTS,
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, 'split-mismatch');
  assert.deepEqual(db.__dump(), {});
});

test('voidTransaction: voids a single (non-grouped) tx', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ledger = { d1: [{ id: 't1', ts: 100, k: 'out', w: 'v1', a: 50, f: 2 }] };

  const res = await voidTransaction(db, queue, clock, 'devA', ledger, 't1');
  assert.equal(res.records.length, 1);
  assert.equal(res.records[0].ref, 't1');
  assert.equal(res.records[0].k, 'void');

  const dump = db.__dump();
  const docId = Object.keys(dump).find((k) => k.startsWith('ledger/'));
  assert.equal(dump[docId].txs.length, 1);
  assert.equal(dump[docId].txs[0].ref, 't1');
});

test('voidTransaction: voiding one leg of a split group voids every live leg in that group', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ledger = {
    d1: [
      { id: 't2', ts: 200, k: 'out', w: 'v1', a: 60, f: 0, g: 'g1' },
      { id: 't3', ts: 201, k: 'xfer', w: 'v2', to: 'v1', a: 10, c: 1, g: 'g1' },
    ],
  };

  const res = await voidTransaction(db, queue, clock, 'devA', ledger, 't2');
  assert.equal(res.records.length, 2, 'both legs of the group get voided');
  const refs = res.records.map((r) => r.ref).sort();
  assert.deepEqual(refs, ['t2', 't3']);
});
