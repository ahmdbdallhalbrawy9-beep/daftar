import test from 'node:test';
import assert from 'node:assert/strict';
import { writable, anyPending, startSync, stopSync, freshSyncState } from '../../src/application/sync.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb } from '../helpers/fakeAdapters.mjs';

function makeFakeStore(initial) {
  var state = initial;
  return {
    getState: function () { return state; },
    patch: function (p) { state = Object.assign({}, state, p); },
    __state: function () { return state; },
  };
}

test('writable: true only once ledger/wallets/settings are ready and synced', () => {
  assert.equal(writable({ ready: {}, synced: false }), false);
  assert.equal(writable({ ready: { ledger: true, wallets: true, settings: true }, synced: false }), false, 'ready but not synced');
  assert.equal(writable({ ready: { ledger: true, wallets: true, settings: true }, synced: true }), true);
  assert.equal(writable({ ready: { ledger: true, wallets: true }, synced: true }), false, 'settings missing');
});

test('anyPending: true if any collection has a pending write', () => {
  assert.equal(anyPending({}), false);
  assert.equal(anyPending({ wallets: { hp: false }, ledger: { hp: true } }), true);
  assert.equal(anyPending({ wallets: { hp: false } }), false);
});

test('freshSyncState: a clean slate with the default settings', () => {
  const s = freshSyncState();
  assert.deepEqual(s.wallets, []);
  assert.deepEqual(s.ledger, {});
  assert.equal(s.settings.vfSame, DEFAULTS.vfSame);
  assert.equal(s.synced, false);
});

test('startSync: subscribes to all 4 collections and populates the store', async () => {
  const db = makeFakeDb({
    'wallets/v2': { name: 'ثانية', order: 2 },
    'wallets/v1': { name: 'أولى', order: 1 },
    'ledger/d1': { txs: [{ id: 't1' }] },
    'settings/main': { feePct: 2 },
    'settings/inbox_devA': { items: { x: 1 } },
    'closes/c1': { day: '20260101' },
  });
  const store = makeFakeStore(Object.assign(freshSyncState(), { mode: 'local' }));

  const stop = startSync(db, store);
  await new Promise((r) => setTimeout(r, 10));

  const state = store.__state();
  assert.equal(state.ready.wallets, true);
  assert.equal(state.ready.ledger, true);
  assert.equal(state.ready.settings, true);
  assert.equal(state.ready.closes, true);
  assert.deepEqual(state.wallets.map((w) => w.id), ['v1', 'v2'], 'sorted by order');
  assert.equal(state.ledger.d1.length, 1);
  assert.equal(state.settings.feePct, 2);
  assert.equal(state.settings.vfSame, DEFAULTS.vfSame, 'defaults still fill in the rest');
  assert.deepEqual(state.inbox.devA, { items: { x: 1 } });
  assert.equal(state.closes.length, 1);

  assert.doesNotThrow(() => stop());
  assert.doesNotThrow(() => stopSync());
});
