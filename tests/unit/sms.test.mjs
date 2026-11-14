import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSms } from '../../src/domain/sms.js';

test('parseSms: "in" (customer sends to our wallet) — Western digits', () => {
  const body = 'تم استلام مبلغ 500 جنيه من رقم 01012345678 المسجل بإسم أحمد علي على رقم محفظتك 01099998888. رصيدك الحالي 1500 جنيه رقم العملية 12345678';
  const r = parseSms(body, 1700000000000);
  assert.ok(r, 'should parse');
  assert.equal(r.k, 'in');
  assert.equal(r.a, 500);
  assert.equal(r.wn, '01099998888');
  assert.equal(r.p, 'أحمد علي');
  assert.equal(r.bal, 1500);
  assert.equal(r.id, '12345678');
  assert.equal(r.ts, 1700000000000);
});

test('parseSms: "in" with Arabic-Indic digits normalizes to the same result', () => {
  const body = 'تم استلام مبلغ ٥٠٠ جنيه من رقم ٠١٠١٢٣٤٥٦٧٨ المسجل بإسم أحمد علي على رقم محفظتك ٠١٠٩٩٩٩٨٨٨٨. رصيدك الحالي ١٥٠٠ جنيه رقم العملية ١٢٣٤٥٦٧٨';
  const r = parseSms(body);
  assert.ok(r);
  assert.equal(r.k, 'in');
  assert.equal(r.a, 500);
  assert.equal(r.bal, 1500);
  assert.equal(r.id, '12345678');
});

test('parseSms: "out" (we transfer out) captures the wallet fee and destination phone', () => {
  const body = 'تم تحويل 300 جنيه لرقم 01087654321 مصاريف الخدمة 5 جنيه رصيد حسابك المتبقي الحالي 2000 جنيه رقم العملية 87654321';
  const r = parseSms(body);
  assert.ok(r);
  assert.equal(r.k, 'out');
  assert.equal(r.a, 300);
  assert.equal(r.c, 5);
  assert.equal(r.p, '01087654321');
  assert.equal(r.bal, 2000);
  assert.equal(r.id, '87654321');
});

test('parseSms: "cashout" (cash withdrawal from the wallet)', () => {
  const body = 'تم سحب مبلغ 150 جنيه رصيد حسابك الحالي 850 جنيه رقم العملية 11112222';
  const r = parseSms(body);
  assert.ok(r);
  assert.equal(r.k, 'cashout');
  assert.equal(r.a, 150);
  assert.equal(r.bal, 850);
});

test('parseSms: "dep" (top-up into the wallet)', () => {
  const body = 'تم إيداع 400 جنيه إلى رقم 01055556666 رصيدك الحالي 3400 جنيه رقم العملية 22223333';
  const r = parseSms(body);
  assert.ok(r);
  assert.equal(r.k, 'dep');
  assert.equal(r.a, 400);
  assert.equal(r.wn, '01055556666');
  assert.equal(r.bal, 3400);
});

test('parseSms: a withdrawal *request* ("طلب سحب") is never a confirmed operation', () => {
  const body = 'طلب سحب مبلغ 100 جنيه رقم العملية 12345678';
  assert.equal(parseSms(body), null);
});

test('parseSms: unrecognized text, or text missing the operation id, returns null', () => {
  assert.equal(parseSms('رسالة ترويجية مش متعلقة بعملية'), null);
  assert.equal(parseSms('تم استلام مبلغ 500 جنيه بدون رقم عملية'), null);
});
