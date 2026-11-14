import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { createOrUpdateWallet, setupWallets } from '../../src/application/wallets.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

test('createOrUpdateWallet: creating a new wallet assigns the next order and base', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const existing = [{ id: 'w01', order: 1 }, { id: 'w02', order: 2 }];

  const res = await createOrUpdateWallet(
    db, queue, clock, null, 0,
    { name: 'محفظة جديدة', phone: '0100', type: 'vf', active: true, balance: 300 },
    DEFAULTS, existing,
  );
  assert.equal(res.ok, true);
  const doc = db.__dump()['wallets/' + res.id];
  assert.equal(doc.order, 3);
  assert.equal(doc.base, 300);
  assert.equal(doc.baseTs, clock.now());
});

test('createOrUpdateWallet: editing without changing the balance does not re-base it', async () => {
  const db = makeFakeDb({ 'wallets/w01': { name: 'قديم', base: 100, baseTs: 5 } });
  const queue = createWriteQueue();
  const clock = makeFakeClock();

  await createOrUpdateWallet(
    db, queue, clock, { id: 'w01' }, 100,
    { name: 'اسم جديد', type: 'vf', active: true, balance: 100 },
    DEFAULTS, [],
  );
  const doc = db.__dump()['wallets/w01'];
  assert.equal(doc.name, 'اسم جديد');
  assert.equal(doc.base, 100, 'balance unchanged, so base/baseTs were never touched');
  assert.equal(doc.baseTs, 5);
});

test('createOrUpdateWallet: editing with a changed balance re-bases it', async () => {
  const db = makeFakeDb({ 'wallets/w01': { name: 'قديم', base: 100, baseTs: 5 } });
  const queue = createWriteQueue();
  const clock = makeFakeClock();

  await createOrUpdateWallet(
    db, queue, clock, { id: 'w01' }, 100,
    { name: 'قديم', type: 'vf', active: true, balance: 250 },
    DEFAULTS, [],
  );
  const doc = db.__dump()['wallets/w01'];
  assert.equal(doc.base, 250);
  assert.equal(doc.baseTs, clock.now());
});

test('createOrUpdateWallet: rejects an empty name without writing anything', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const res = await createOrUpdateWallet(db, queue, clock, null, 0, { name: '  ', type: 'vf', active: true, balance: 0 }, DEFAULTS, []);
  assert.equal(res.ok, false);
  assert.deepEqual(db.__dump(), {});
});

test('setupWallets: creates the requested vf + insta wallets with clamped counts', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const res = await setupWallets(db, queue, { vfCount: 2, instaCount: 1, vfDayLimit: 1000, vfMonthLimit: 5000 });
  assert.equal(res.ok, true);
  const dump = db.__dump();
  const ids = Object.keys(dump).sort();
  assert.deepEqual(ids, ['wallets/w01', 'wallets/w02', 'wallets/w03']);
  assert.equal(dump['wallets/w01'].type, 'vf');
  assert.equal(dump['wallets/w01'].dayLimit, 1000);
  assert.equal(dump['wallets/w03'].type, 'insta');
  assert.equal(dump['wallets/w03'].monthLimit, 400000, 'falls back to the default when not given');
});

test('setupWallets: refuses when both counts are zero', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const res = await setupWallets(db, queue, { vfCount: 0, instaCount: 0 });
  assert.equal(res.ok, false);
  assert.deepEqual(db.__dump(), {});
});
