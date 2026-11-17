import test from 'node:test';
import assert from 'node:assert/strict';
import { permsOf, withPerm, PERMS } from '../../src/domain/perms.js';
import { balanceDrift } from '../../src/domain/drift.js';
import { pendingItems, allInboxItems } from '../../src/application/smsImport.js';
import { registerDevice, setDevicePerm } from '../../src/application/devices.js';
import { chunkBackup, runAutoBackup, readIndex, readSnapshot, savePreRestore, KEEP } from '../../src/application/autoBackup.js';
import { restoreBackup, exportBackup } from '../../src/application/backup.js';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb } from '../helpers/fakeAdapters.mjs';

/* ---------- permissions ---------- */
test('permsOf: everything allowed by default, only explicit false switches a flag off', () => {
  const all = permsOf(null);
  assert.deepEqual(Object.keys(all), PERMS.map((p) => p[0]));
  assert.ok(Object.values(all).every((v) => v === true));
  assert.equal(permsOf({ perm: { profit: false } }).profit, false);
  assert.equal(permsOf({ perm: { profit: false } }).void, true);
  assert.equal(permsOf({}).settings, true);
});

test('withPerm: stores only the flags that are off', () => {
  let p = withPerm(undefined, 'profit', false);
  assert.deepEqual(p, { profit: false });
  p = withPerm(p, 'void', false);
  assert.deepEqual(p, { profit: false, void: false });
  p = withPerm(p, 'profit', true);
  assert.deepEqual(p, { void: false });
});

const q = (fn) => fn();
test('device doc: refresh keeps the owner-set perm; setDevicePerm only touches perm', async () => {
  const db = makeFakeDb({ 'settings/dev_B': { kind: 'device', name: 'old', os: 'a', ts: 1, first: 1, perm: { profit: false } } });
  const cur = (await db.collection('settings').doc('dev_B').get()).data();
  await registerDevice(db, q, { now: () => 1e12 }, 'B', { B: cur }, { name: 'new', os: 'a' });
  let d = db.__dump()['settings/dev_B'];
  assert.equal(d.name, 'new'); assert.deepEqual(d.perm, { profit: false }); assert.equal(d.first, 1);
  await setDevicePerm(db, q, 'B', { void: false });
  d = db.__dump()['settings/dev_B'];
  assert.deepEqual(d.perm, { void: false }); assert.equal(d.name, 'new');
});

/* ---------- drift ---------- */
const W = { id: 'w1', baseTs: 0, phone: '01000000001' };
const tx = (id, ts, k, a, extra) => Object.assign({ id, ts, k, w: 'w1', a, f: 0, c: 0 }, extra);

test('balanceDrift: nothing when the SMS balance matches', () => {
  // wallet 1000 -> pay 50 (SMS says 950)
  const txs = [tx('t1', 100, 'out', 50, { sid: 's1' })];
  assert.equal(balanceDrift(W, 950, txs, { s1: { bal: 950 } }), null);
});

test('balanceDrift: flags a missing/extra operation and replays later transactions', () => {
  const txs = [tx('t1', 100, 'out', 50, { sid: 's1' }), tx('t2', 200, 'in', 300)];
  // SMS said 950 after t1, then +300 recorded -> app should be 1250
  assert.equal(balanceDrift(W, 1250, txs, { s1: { bal: 950 } }), null);
  const d = balanceDrift(W, 1300, txs, { s1: { bal: 950 } }); // app shows 50 too much
  assert.equal(d.diff, -50); assert.equal(d.smsBal, 950); assert.equal(d.expected, 1000);
});

test('balanceDrift: uses the newest confirmed SMS, ignores wallets with none, respects inventory resets', () => {
  const txs = [tx('t1', 100, 'out', 50, { sid: 's1' }), tx('t2', 300, 'in', 100, { sid: 's2' })];
  const items = { s1: { bal: 111 }, s2: { bal: 1050 } };
  assert.equal(balanceDrift(W, 1050, txs, items), null);            // only s2 counts
  assert.equal(balanceDrift({ id: 'w9' }, 5, txs, items), null);     // other wallet: nothing
  assert.equal(balanceDrift({ id: 'w1', baseTs: 400 }, 7, txs, items), null); // reset after the SMS
});

test('balanceDrift: transfers between wallets and fees are replayed', () => {
  const txs = [tx('t1', 100, 'in', 100, { sid: 's1' }), { id: 'x', ts: 200, k: 'xfer', w: 'w1', to: 'w2', a: 40, c: 1 }, tx('t3', 300, 'out', 10, { c: 1 })];
  // SMS 500 after t1; then -41 (xfer) and -11 (out+cost) -> 448
  assert.equal(balanceDrift(W, 448, txs, { s1: { bal: 500 } }), null);
  assert.equal(balanceDrift(W, 450, txs, { s1: { bal: 500 } }).diff, -2);
});

test('pendingItems: a phone-matched receive whose balance disagrees carries the difference', () => {
  const ws = [{ id: 'v1', name: 'a', type: 'vf', phone: '01012345678', base: 1000, baseTs: 0, active: true }];
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const inbox = { d: { items: { s: { id: 's', k: 'in', a: 100, ts: 1, wn: '01012345678', bal: 1500 } }, ign: [] } };
  const it = pendingItems(ws, inbox, [], C)[0];
  assert.equal(it.sug, 'v1'); assert.equal(it.drift, 400); assert.equal(it.driftTo, 1100);
  const ok = pendingItems(ws, { d: { items: { s: { id: 's', k: 'in', a: 100, ts: 1, wn: '01012345678', bal: 1100 } } } }, [], C)[0];
  assert.equal(ok.drift, undefined);
  assert.deepEqual(Object.keys(allInboxItems(inbox)), ['s']);
});

/* ---------- automatic backup ---------- */
const raw = () => ({ wallets: { w1: { name: 'ف', base: 5 } }, ledger: { d1: { txs: [{ id: 't1', a: 1 }] } }, closes: {}, settings: { main: { x: 1 }, dev_A: { kind: 'device' }, inbox_A: { items: {} } } });
const clockAt = (ts) => ({ now: () => ts });
const DAY = new Date('2026-11-17T10:00:00+02:00').getTime();

test('chunkBackup: splits big data into pieces that rebuild exactly', () => {
  const flat = {}; for (let i = 0; i < 40; i++) flat['ledger/d' + i] = { txs: ['x'.repeat(20000)] };
  const chunks = chunkBackup(flat);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length < 330000));
  const back = Object.assign({}, ...chunks.map((c) => JSON.parse(c)));
  assert.deepEqual(back, flat);
  assert.equal(chunkBackup({}).length, 1);
});

test('runAutoBackup: writes today once, skips on the second call, force overwrites, excludes phone docs', async () => {
  const db = makeFakeDb(), queue = createWriteQueue();
  const r1 = await runAutoBackup(db, queue, clockAt(DAY), raw());
  assert.equal(r1.ok, true); assert.equal(r1.skipped, undefined);
  const idx = await readIndex(db);
  assert.deepEqual(Object.keys(idx.days), ['20261117']);
  const flat = await readSnapshot(db, '20261117', idx.days['20261117']);
  assert.deepEqual(Object.keys(flat).sort(), ['ledger/d1', 'settings/inbox_A', 'settings/main', 'wallets/w1'].sort());
  assert.ok(!Object.keys(flat).some((k) => k.includes('dev_')));
  assert.equal((await runAutoBackup(db, queue, clockAt(DAY), raw())).skipped, true);
  const r3 = await runAutoBackup(db, queue, clockAt(DAY + 1000), raw(), true);
  assert.equal(r3.skipped, undefined);
});

test('runAutoBackup: keeps only the newest KEEP days and removes the old chunks', async () => {
  const db = makeFakeDb(), queue = createWriteQueue();
  for (let i = 0; i < KEEP + 2; i++) await runAutoBackup(db, queue, clockAt(DAY + i * 864e5), raw());
  const idx = await readIndex(db);
  assert.equal(Object.keys(idx.days).length, KEEP);
  assert.ok(!('20261117' in idx.days));
  const dump = db.__dump();
  assert.ok(!('backups/bk_20261117_0' in dump));
  assert.ok('backups/bk_20261125_0' in dump);
});

test('restore from an automatic backup: saves the current data as "pre", then replaces everything', async () => {
  const db = makeFakeDb({ 'wallets/w1': { name: 'ف', base: 5 }, 'ledger/d1': { txs: [{ id: 't1', a: 1 }] }, 'settings/main': { x: 1 }, 'settings/inbox_A': { items: {} } });
  const queue = createWriteQueue();
  const live = () => { const r = { wallets: {}, ledger: {}, closes: {}, settings: {} }; Object.entries(db.__dump()).forEach(([k, v]) => { const [c, id] = k.split('/'); if (r[c]) r[c][id] = v; }); return r; };
  await runAutoBackup(db, queue, clockAt(DAY), live());
  // the day goes wrong: a wallet gets wrecked
  await db.collection('wallets').doc('w1').set({ name: 'مكسور', base: 0 });
  const idx = await readIndex(db), flat = await readSnapshot(db, '20261117', idx.days['20261117']);
  await savePreRestore(db, queue, clockAt(DAY + 5), live());
  await restoreBackup(db, queue, live(), flat);
  assert.equal(db.__dump()['wallets/w1'].name, 'ف');
  const idx2 = await readIndex(db);
  assert.ok(idx2.pre >= 1 && idx2.days['20261117']);
  const pre = await readSnapshot(db, 'pre', idx2.pre);
  assert.equal(pre['wallets/w1'].name, 'مكسور');
  assert.equal(await readSnapshot(db, '20260101', 1), null);
  assert.ok(exportBackup(live())['wallets/w1']);
});
