import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { sha } from '../../src/infrastructure/crypto.js';
import { wipeAllData, wipeTransactions } from '../../src/application/wipe.js';
import { setWipePassword } from '../../src/application/settingsUseCases.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

function wallets() {
  return [
    { id: 'v1', name: 'ف1', type: 'vf', base: 1000, baseTs: 0, active: true },
    { id: 'v2', name: 'ف2', type: 'vf', base: 500, baseTs: 0, active: true },
  ];
}

test('wipeAllData: refuses with the wrong password and writes nothing', async () => {
  const db = makeFakeDb({ 'ledger/d1': { txs: [] }, 'settings/main': { pwHash: 'x', pwSalt: 's' } });
  const queue = createWriteQueue();
  const res = await wipeAllData(db, queue, sha, { pwHash: 'x', pwSalt: 's' }, 'wrong', {
    ledger: { d1: [] }, closes: [], wallets: [], inbox: {},
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'wrong-password');
  assert.ok('ledger/d1' in db.__dump(), 'nothing deleted');
});

test('wipeAllData: with the right password, deletes every known collection entry', async () => {
  const settingsDb = makeFakeDb();
  const q0 = createWriteQueue();
  await setWipePassword(settingsDb, q0, sha, DEFAULTS, 'secret1');
  const settings = settingsDb.__dump()['settings/main'];

  const db = makeFakeDb({
    'ledger/d1': { txs: [] },
    'ledger/d2': { txs: [] },
    'closes/c1': { day: '20260101' },
    'wallets/v1': wallets()[0],
    'settings/inbox_devA': { items: {} },
    'settings/main': settings,
  });
  const queue = createWriteQueue();
  const res = await wipeAllData(db, queue, sha, settings, 'secret1', {
    ledger: { d1: [], d2: [] }, closes: [{ id: 'c1' }], wallets: [{ id: 'v1' }], inbox: { devA: {} },
  });
  assert.equal(res.ok, true);
  assert.deepEqual(db.__dump(), {}, 'every doc gone, including settings/main itself');
});

test('wipeTransactions: re-bases wallets and cash before deleting ledger/closes/inbox', async () => {
  const ws = wallets();
  const settings = Object.assign({}, DEFAULTS, { baseCash: 50 });
  const db = makeFakeDb({
    'wallets/v1': ws[0], 'wallets/v2': ws[1],
    'ledger/d1': { txs: [{ id: 't1', ts: 100, k: 'in', w: 'v1', a: 200, f: 2 }] },
    'closes/c1': { day: '20260101' },
    'settings/inbox_devA': { items: {} },
  });
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const ledger = { d1: [{ id: 't1', ts: 100, k: 'in', w: 'v1', a: 200, f: 2 }] };
  const C = compute({ ledger, wallets: ws, settings, now: clock.now() });

  const res = await wipeTransactions(db, queue, clock, C, ws, settings, {
    ledger: { d1: [] }, closes: [{ id: 'c1' }], inbox: { devA: {} },
  });
  assert.equal(res.ok, true);
  const dump = db.__dump();
  assert.equal(dump['wallets/v1'].base, C.W.v1.bal, 'wallet re-based to its computed balance');
  assert.equal(dump['wallets/v1'].baseTs, clock.now());
  assert.equal(dump['settings/main'].baseCash, C.cash);
  assert.equal(dump['ledger/d1'], undefined, 'ledger entries deleted');
  assert.equal(dump['closes/c1'], undefined);
  assert.equal(dump['settings/inbox_devA'], undefined);
});
