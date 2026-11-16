import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSms } from '../../src/domain/sms.js';
import { createWriteQueue } from '../../src/infrastructure/writeQueue.js';
import { pendingItems, confirmPending } from '../../src/application/smsImport.js';
import { recordTransaction } from '../../src/application/transactions.js';
import { compute } from '../../src/domain/compute.js';
import { DEFAULTS } from '../../src/domain/money.js';
import { groupHTML } from '../../src/presentation/components/txRow.js';
import { makeFakeDb, makeFakeClock } from '../helpers/fakeAdapters.mjs';

// real message texts (owner's phone), personal numbers kept as they appeared
const PAY = 'تم دفع مبلغ 47.99جنية لMidasbuyPayermax. رصيد محفظتك الحالي 1701.92 جنيه. رقم العملية 025847386524 تاريخ العملية 16-11-26 15:31. دلوقتي ولأول مرة تقدر تشحن أي كارت كهرباء بفودافون كاش من مكانك ,دوس على http://vf.eg/vfcash واختار خدمة شحن كارت الكهرباء.';
const OTP = 'الرقم السري المتغير الخاص بعمليه الشراء الالكترونية من محفظة فودافون كاش هو 291176 بمبلغ 47.99. وستنتهي صلاحيته خلال 5 دقائق. برجاء عدم مشاركه هذا الرقم مع أي شخص حفاظًا على بياناتك.';
const CHG30 = 'تم شحن رصيد ب 30 ج بنجاح إلى رقم 01025969299 وخصم 30 ج من محفظتك شاملة الضريبة; رصيد حسابك في فودافون كاش الحالي 1728.65. حول فلوس لأي محفظة وزود فرصك تكسب جنيه دهب! وكمان هيجيلك لحد 100ج كاش باك. http://vf.eg/vfcash?id=money_transfer';
const CHG35 = 'تم شحن رصيد ب 3.5 ج بنجاح إلى رقم 01029505638 وخصم 5 ج من محفظتك شاملة الضريبة; رصيد حسابك في فودافون كاش الحالي 2311.65. حول فلوس لأي محفظة وزود فرصك تكسب جنيه دهب!';
const CHG0 = 'تم شحن رصيد ب 3.5 ج بنجاح إلى رقم 01143575058 وخصم 0 جنيه من محفظتك شاملة الضريبة.';

test('parseSms: payment to a merchant ("تم دفع")', () => {
  const r = parseSms(PAY, 1000);
  assert.deepEqual(r, { id: '025847386524', ts: 1000, k: 'pay', a: 47.99, p: 'MidasbuyPayermax', bal: 1701.92 });
});

test('parseSms: airtime top-up uses the deducted amount, has a stable made-up id', () => {
  const a = parseSms(CHG35, 5000), b = parseSms(CHG35, 5000), c = parseSms(CHG35, 6000), d = parseSms(CHG30, 5000);
  assert.equal(a.k, 'pay'); assert.equal(a.a, 5); assert.equal(a.bal, 2311.65); assert.equal(a.p, 'شحن رصيد 01029505638');
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.notEqual(a.id, d.id);
  assert.equal(d.a, 30); assert.equal(d.bal, 1728.65);
});

test('parseSms: free top-up (deducted 0) and the one-time-password text are ignored', () => {
  assert.equal(parseSms(CHG0, 1), null);
  assert.equal(parseSms(OTP, 1), null);
});

test('parseSms: existing kinds still parse', () => {
  const r = parseSms('تم استلام مبلغ 910.00 جنيه من رقم 01280367907 المسجل بإسم عمر على رقم محفظتك 01067684410. رصيدك الحالي: 1813.00 جنيه تاريخ العملية: 15-11-26 15:04 رقم العملية: 025810601448', 1);
  assert.equal(r.k, 'in'); assert.equal(r.a, 910);
});

const ws = () => [
  { id: 'v1', name: 'ف1', type: 'vf', phone: '01000000001', base: 1749.91, baseTs: 0, active: true },
  { id: 'v2', name: 'ف2', type: 'vf', phone: '01000000002', base: 5000, baseTs: 0, active: true },
];
const comp = (ledger, wallets) => compute({ ledger, wallets, settings: DEFAULTS, now: Date.now() });

test('pending payment: wallet is guessed from the balance after it, and consecutive payments chain', () => {
  const w = ws(), C = comp({}, w);
  const items = [
    Object.assign(parseSms(PAY, 1), { ts: 1 }),
    { id: 'p2', k: 'pay', a: 47.99, ts: 2, bal: 1653.93 },
  ];
  // 1749.91 - 47.99 = 1701.92 ; - 47.99 = 1653.93
  const inbox = { d: { items: { [items[0].id]: items[0], p2: items[1] }, ign: [] } };
  const list = pendingItems(w, inbox, [], C);
  assert.deepEqual(list.map((i) => i.sug), ['v1', 'v1']);
});

test('confirming a payment SMS: wallet down by the deducted amount, cash up, no profit, counted as sent', async () => {
  const w = ws(), C = comp({}, w), db = makeFakeDb(), q = createWriteQueue(), clock = makeFakeClock(Date.now());
  const item = Object.assign(parseSms(CHG35, Date.now()), {});
  const res = await confirmPending(db, q, 'devA', {}, item, 'v2', 0, C, DEFAULTS);
  assert.equal(res.ok, true);
  assert.equal(res.record.k, 'out'); assert.equal(res.record.pay, 1); assert.equal(res.record.a, 5); assert.equal(res.record.c, 0); assert.equal(res.record.f, 0);
  const led = {}; Object.keys(db.__dump()).forEach((k) => { if (k.startsWith('ledger/')) led[k] = db.__dump()[k].txs; });
  const C2 = comp(led, w);
  assert.equal(C2.W.v2.bal, 4995);
  assert.equal(C2.cash, C.cash + 5);
  assert.equal(C2.pDay, 0);
  assert.equal(C2.W.v2.mOut, 5);
  assert.equal(C2.W.v2.dOut, 5);
  assert.equal(clock.now() > 0, true);
});

test('confirming a payment bigger than the balance is refused', async () => {
  const w = ws(), C = comp({}, w), db = makeFakeDb(), q = createWriteQueue();
  const res = await confirmPending(db, q, 'devA', {}, { id: 'big', k: 'pay', a: 99999, ts: 1 }, 'v2', 0, C, DEFAULTS);
  assert.deepEqual(res, { ok: false, error: 'insufficient' });
});

test('manual payment: recorded as an "out" flagged pay:1 with no fee/cost, shows as دفع / شحن in history', async () => {
  const w = ws(), C = comp({}, w), db = makeFakeDb(), q = createWriteQueue(), clock = makeFakeClock(Date.now());
  const res = await recordTransaction(db, q, clock, 'devA', {}, { kind: 'out', amount: 300, fee: 0, cost: 0, dest: 'vf', note: 'ببجي', selectedWalletId: 'v2', splitMode: 'one', pay: true }, w, C, DEFAULTS);
  assert.equal(res.ok, true);
  const rec = res.records[0];
  assert.equal(rec.pay, 1); assert.equal(rec.k, 'out'); assert.equal(rec.a, 300);
  const C2 = comp({ x: [rec] }, w);
  assert.equal(C2.W.v2.bal, 4700); assert.equal(C2.cash, C.cash + 300); assert.equal(C2.pDay, 0);
  const html = groupHTML([rec], C2, false, null);
  assert.match(html, /دفع \/ شحن/);
  assert.match(html, /ببجي/);
  // a normal transfer is untouched
  const res2 = await recordTransaction(db, q, clock, 'devA', {}, { kind: 'out', amount: 300, fee: 3, cost: 1, dest: 'vf', note: '', selectedWalletId: 'v2', splitMode: 'one' }, w, C, DEFAULTS);
  assert.equal(res2.records[0].pay, undefined);
});
