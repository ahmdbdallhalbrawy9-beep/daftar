import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { readInbox, pendingItems, confirmPending, ignorePending, scanForSms } from '../../src/application/smsImport.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { makeFakeDb, makeFakeClock, makeFakeSms } from '../helpers/fakeAdapters.mjs';

function wallets() {
  return [
    { id: 'v1', name: 'ف1', type: 'vf', phone: '01012345678', base: 1000, baseTs: 0, active: true },
    { id: 'v2', name: 'ف2', type: 'vf', phone: '01099998888', base: 500, baseTs: 0, active: true },
  ];
}

test('readInbox: defaults to empty items/ign for a device with no inbox yet', () => {
  assert.deepEqual(readInbox({}, 'devA'), { items: {}, ign: [] });
  assert.deepEqual(readInbox({ devA: { items: { x: 1 }, ign: ['y'] } }, 'devA'), { items: { x: 1 }, ign: ['y'] });
});

test('pendingItems: suggests the wallet whose phone matches the SMS destination', () => {
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const inbox = { devA: { items: { s1: { id: 's1', k: 'in', a: 100, ts: 1, wn: '01099998888' } }, ign: [] } };
  const list = pendingItems(ws, inbox, [], C);
  assert.equal(list.length, 1);
  assert.equal(list[0].sug, 'v2');
});

test('pendingItems: falls back to matching the resulting balance when there is no phone match', () => {
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  // "in" of 50 into v1 (bal 1000) would leave it at 1050 -- unique match
  const inbox = { devA: { items: { s1: { id: 's1', k: 'in', a: 50, ts: 1, bal: 1050 } }, ign: [] } };
  const list = pendingItems(ws, inbox, [], C);
  assert.equal(list[0].sug, 'v1');
});

test('pendingItems: excludes items already confirmed (by sid) or ignored', () => {
  const ws = wallets();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const inbox = {
    devA: {
      items: { s1: { id: 's1', k: 'in', a: 50, ts: 1 }, s2: { id: 's2', k: 'in', a: 60, ts: 2 } },
      ign: ['s2'],
    },
  };
  const liveTxList = [{ sid: 's1' }];
  const list = pendingItems(ws, inbox, liveTxList, C);
  assert.deepEqual(list, []);
});

test('ignorePending: adds the item id to this device\'s ignore list, once', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const inbox = { devA: { items: {}, ign: ['s0'] } };
  const m = await ignorePending(db, queue, 'devA', inbox, 's1');
  assert.deepEqual(m.ign.sort(), ['s0', 's1']);
  await ignorePending(db, queue, 'devA', { devA: m }, 's1');
  const dump = db.__dump();
  assert.deepEqual(dump['settings/inbox_devA'].ign.sort(), ['s0', 's1'], 'not duplicated');
});

test('confirmPending: "in" records a plain confirmation', async () => {
  const ws = wallets();
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const item = { id: 's1', ts: 123, k: 'in', a: 50, p: '0101' };
  const res = await confirmPending(db, queue, 'devA', {}, item, 'v1', 5, C, DEFAULTS);
  assert.equal(res.ok, true);
  assert.equal(res.record.k, 'in');
  assert.equal(res.record.sid, 's1');
});

test('confirmPending: "out" infers vf-same vs other-network from the reported wallet fee', async () => {
  const ws = wallets();
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const sameNetwork = { id: 's1', ts: 1, k: 'out', a: 100, c: DEFAULTS.vfSame };
  const r1 = await confirmPending(db, queue, 'devA', {}, sameNetwork, 'v1', 0, C, DEFAULTS);
  assert.equal(r1.record.d, 'vf');

  const otherNetwork = { id: 's2', ts: 2, k: 'out', a: 100, c: 15 };
  const r2 = await confirmPending(db, queue, 'devA', {}, otherNetwork, 'v1', 0, C, DEFAULTS);
  assert.equal(r2.record.d, 'other');
});

test('confirmPending: refuses when the chosen wallet cannot cover it', async () => {
  const ws = wallets();
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const C = compute({ ledger: {}, wallets: ws, settings: DEFAULTS, now: Date.now() });
  const item = { id: 's1', ts: 1, k: 'out', a: 10000, c: 1 };
  const res = await confirmPending(db, queue, 'devA', {}, item, 'v2', 0, C, DEFAULTS);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'insufficient');
});

test('scanForSms: parses new Vodafone messages into the inbox, skipping non-vf senders', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const smsPort = makeFakeSms({
    messages: [
      { address: 'VF', date: clock.now(), body: 'تم استلام مبلغ 500 جنيه من رقم 01012345678 المسجل بإسم أحمد على رقم محفظتك 01099998888. رصيدك الحالي 1500 جنيه رقم العملية 12345678' },
      { address: 'OTHER', date: clock.now(), body: 'تم استلام مبلغ 999 جنيه رقم العملية 99999999' },
    ],
  });
  const res = await scanForSms(smsPort, db, queue, clock, 'devA', {}, [], 0, true);
  assert.equal(res.ok, true);
  assert.equal(res.added, 1, 'only the vf-sender message is imported');
  const dump = db.__dump();
  const saved = dump['settings/inbox_devA'];
  assert.equal(Object.keys(saved.items).length, 1);
  assert.equal(saved.items['12345678'].a, 500);
});

test('scanForSms: a manual scan without permission returns an error instead of throwing', async () => {
  const db = makeFakeDb();
  const queue = createWriteQueue();
  const clock = makeFakeClock();
  const smsPort = makeFakeSms({ permission: 'denied' });
  const res = await scanForSms(smsPort, db, queue, clock, 'devA', {}, [], 0, true);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'permission-denied');
});
