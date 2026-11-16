import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletRoom } from '../../src/domain/limits.js';
import { walletInUse } from '../../src/domain/wallets.js';
import { deleteWallet } from '../../src/application/wallets.js';
import { registerDevice, removeDevice } from '../../src/application/devices.js';
import { exportBackup, restoreBackup } from '../../src/application/backup.js';
import { startSync, freshSyncState } from '../../src/application/sync.js';

const x = (o) => Object.assign({ bal: 0, dIn: 0, dOut: 0, mIn: 0, mOut: 0 }, o);

test('walletRoom: the three real wallets from the owner screenshots', () => {
  // احمد: bal 5,060, sent 1,000 today, month room out 54,271 / in recorded so that month in-room 49,211
  let r = walletRoom(60000, 200000, x({ bal: 5060, dOut: 1000, mOut: 145729 }));
  assert.equal(r.mOut.rem, 54271);
  assert.equal(r.mIn.rem, 49211); assert.equal(r.mIn.why, 'transfer');
  assert.equal(r.dOut.rem, 54271); assert.equal(r.dOut.why, 'month');
  assert.equal(r.dIn.rem, 49211); assert.equal(r.dIn.why, 'month');
  // اخره 40: bal 52, month out room 39,027
  r = walletRoom(60000, 200000, x({ bal: 52, mOut: 160973 }));
  assert.equal(r.dOut.rem, 39027); assert.equal(r.dOut.why, 'month');
  assert.equal(r.dIn.rem, 38975); assert.equal(r.dIn.why, 'month');
  // 34: month room bigger than today -> today's numbers stay, receive limited by transfer only
  r = walletRoom(60000, 200000, x({ bal: 2957, mOut: 131250 }));
  assert.equal(r.dOut.rem, 60000); assert.equal(r.dOut.why, '');
  assert.equal(r.dIn.rem, 57043); assert.equal(r.dIn.why, 'transfer');
  assert.equal(r.mIn.rem, 65793);
});

test('walletRoom: untouched wallet shows the official limits; overruns stay visible', () => {
  let r = walletRoom(60000, 200000, x());
  assert.deepEqual([r.dOut.rem, r.dIn.rem, r.mOut.rem, r.mIn.rem], [60000, 60000, 200000, 200000]);
  assert.equal(r.dIn.why, '');
  r = walletRoom(60000, 200000, x({ dOut: 65000 }));
  assert.equal(r.dOut.rem, -5000);
  r = walletRoom(60000, 200000, x({ mOut: 205000 }));
  assert.equal(r.dOut.rem, 0); assert.equal(r.dOut.why, 'month');
});

const ledger = { d1: [{ id: 't1', w: 'w1', k: 'out' }, { id: 't2', w: 'w2', k: 'topup', to: 'w3' }] };
test('walletInUse: counts wallet and receiving side', () => {
  assert.equal(walletInUse(ledger, 'w1'), true);
  assert.equal(walletInUse(ledger, 'w3'), true);
  assert.equal(walletInUse(ledger, 'w9'), false);
});

function fakeDb() {
  const calls = [];
  const db = { collection: (c) => ({ doc: (id) => ({
    set: async (v) => { calls.push(['set', c, id, v]); }, update: async (v) => { calls.push(['update', c, id, v]); },
    delete: async () => { calls.push(['delete', c, id]); },
  }), onSnapshot: () => () => {} }) };
  return { db, calls };
}
const q = (fn) => fn();

test('deleteWallet: refuses a wallet with history, deletes a clean one', async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await deleteWallet(db, q, ledger, 'w1'), { ok: false, error: 'in-use' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await deleteWallet(db, q, ledger, 'w9'), { ok: true });
  assert.deepEqual(calls, [['delete', 'wallets', 'w9']]);
});

test('registerDevice: writes once, then skips while fresh; rewrites when stale or renamed', async () => {
  const { db, calls } = fakeDb();
  const clock = { now: () => 1e12 };
  await registerDevice(db, q, clock, 'dA', {}, { name: 'OPPO · تطبيق', os: 'Android 13' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], 'dev_dA');
  const cur = { dA: calls[0][3] };
  assert.equal((await registerDevice(db, q, clock, 'dA', cur, { name: 'OPPO · تطبيق', os: 'Android 13' })).skipped, true);
  await registerDevice(db, q, { now: () => 1e12 + 7 * 3600e3 }, 'dA', cur, { name: 'OPPO · تطبيق', os: 'Android 13' });
  assert.equal(calls.length, 2);
  await registerDevice(db, q, clock, 'dA', cur, { name: 'Samsung · تطبيق', os: 'Android 13' });
  assert.equal(calls.length, 3);
  await removeDevice(db, q, 'dA');
  assert.deepEqual(calls[3], ['delete', 'settings', 'dev_dA']);
});

test('backup: phone docs are never exported or deleted/restored', async () => {
  const raw = { settings: { main: { a: 1 }, dev_dA: { kind: 'device' } }, wallets: { w1: {} } };
  assert.deepEqual(Object.keys(exportBackup(raw)).sort(), ['settings/main', 'wallets/w1']);
  const { db, calls } = fakeDb();
  await restoreBackup(db, q, raw, { 'settings/main': { a: 2 }, 'settings/dev_old': {} });
  assert.ok(!calls.some((c) => String(c[2]).startsWith('dev_')));
});

test('sync: devices list + lastSync from a fresh server snapshot', () => {
  const snaps = {};
  const db = { collection: (c) => ({ onSnapshot: (next) => { snaps[c] = next; return () => {}; } }) };
  let st = Object.assign(freshSyncState(), { mode: 'cloud', user: { uid: 'u' } });
  const store = { getState: () => st, patch: (p) => { st = Object.assign({}, st, p); } };
  let synced = 0;
  startSync(db, store, { onSynced: (ts) => { synced = ts; } });
  const doc = (id, data) => ({ id, data: () => data });
  snaps.settings({ docs: [doc('main', {}), doc('dev_dA', { name: 'X' })], metadata: { fromCache: false, hasPendingWrites: false } });
  assert.deepEqual(Object.keys(st.devices), ['dA']);
  assert.ok(st.lastSync > 0 && synced === st.lastSync);
  const before = st.lastSync;
  snaps.settings({ docs: [doc('main', {})], metadata: { fromCache: false, hasPendingWrites: true } });
  assert.equal(st.lastSync, before);
});
