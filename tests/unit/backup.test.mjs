import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { exportBackup, restoreBackup } from '../../src/application/backup.js';
import { makeFakeDb } from '../helpers/fakeAdapters.mjs';

test('exportBackup: flattens {collection: {docId: data}} into "collection/docId" keys', () => {
  const raw = { wallets: { w1: { name: 'a' } }, ledger: { d1: { txs: [] } } };
  assert.deepEqual(exportBackup(raw), { 'wallets/w1': { name: 'a' }, 'ledger/d1': { txs: [] } });
});

test('restoreBackup: deletes every current doc, then writes the backup\'s wallets/ledger/closes/settings entries', async () => {
  const db = makeFakeDb({ 'wallets/old': { name: 'قديمة' }, 'ledger/old': { txs: [] } });
  const queue = createWriteQueue();
  const currentRaw = { wallets: { old: { name: 'قديمة' } }, ledger: { old: { txs: [] } } };
  const backupData = {
    'wallets/new': { name: 'جديدة' },
    'ledger/new': { txs: [{ id: 't1' }] },
    'not-a-real-collection/x': { hack: true },
  };
  const res = await restoreBackup(db, queue, currentRaw, backupData);
  assert.equal(res.ok, true);
  assert.deepEqual(db.__dump(), {
    'wallets/new': { name: 'جديدة' },
    'ledger/new': { txs: [{ id: 't1' }] },
  });
});
