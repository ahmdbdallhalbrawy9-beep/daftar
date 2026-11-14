import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { closeDay } from '../../src/application/closeDay.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

function wallets() {
  return [
    { id: 'v1', name: 'ف1', type: 'vf', base: 1000, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
    { id: 'v2', name: 'ف2', type: 'vf', base: 500, baseTs: 0, dayLimit: 60000, monthLimit: 200000, active: true },
  ];
}

test('closeDay: with no typed inputs, closes against the expected (computed) values', async () => {
  const ws = wallets();
  const db = makeFakeDb({ 'wallets/v1': ws[0], 'wallets/v2': ws[1] });
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const settings = Object.assign({}, DEFAULTS, { baseCash: 200 });
  const C = compute({ ledger: {}, wallets: ws, settings, now: clock.now() });

  const res = await closeDay(db, queue, clock, C, ws, settings, {});
  assert.equal(res.ok, true);
  assert.equal(res.settings.baseCash, 200, 'actual falls back to expected cash');

  const dump = db.__dump();
  const closeDoc = Object.values(dump).find((d) => 'expCash' in d);
  assert.equal(closeDoc.expCash, 200);
  assert.equal(closeDoc.actCash, 200);
  assert.equal(closeDoc.wallets.v1.act, 1000, 'wallet with no typed input closes at its expected balance');

  assert.equal(dump['wallets/v1'].base, 1000);
  assert.equal(dump['wallets/v1'].baseTs, clock.now());
  assert.equal(dump['settings/main'].baseCash, 200);
});

test('closeDay: typed inventory values become the new wallet/cash bases, and a mismatch is recorded', async () => {
  const ws = wallets();
  const db = makeFakeDb({ 'wallets/v1': ws[0], 'wallets/v2': ws[1] });
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const settings = Object.assign({}, DEFAULTS, { baseCash: 200 });
  const C = compute({ ledger: {}, wallets: ws, settings, now: clock.now() });

  const res = await closeDay(db, queue, clock, C, ws, settings, { cash: '150', byWallet: { v1: '950' } });
  assert.equal(res.settings.baseCash, 150, 'typed cash wins over expected');

  const dump = db.__dump();
  assert.equal(dump['wallets/v1'].base, 950, 'typed wallet count becomes the new base');
  assert.equal(dump['wallets/v2'].base, 500, 'untouched wallet keeps its expected balance');
  const closeDoc = Object.values(dump).find((d) => 'expCash' in d);
  assert.equal(closeDoc.expCash, 200);
  assert.equal(closeDoc.actCash, 150);
  assert.equal(closeDoc.wallets.v1.exp, 1000);
  assert.equal(closeDoc.wallets.v1.act, 950);
});
