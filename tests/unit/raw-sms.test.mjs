import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawInbox, pendingItems, allInboxItems } from '../../src/application/smsImport.js';
import { parseSms } from '../../src/domain/sms.js';

var body = 'تم استلام مبلغ 500 جنيه من رقم 01012345678 المسجل بإسم أحمد علي على رقم محفظتك 01099998888. رصيدك الحالي 1500 جنيه رقم العملية 12345678';
var date = 1700000000000;

test('rawInbox parses uploaded raw SMS like a normal scan (same id)', function () {
  var direct = parseSms(body, date);
  var r = rawInbox({ d1: { items: { m1: { a: 'VF-Cash', b: body, d: date }, m2: { a: 'Bank', b: body, d: date }, m3: { a: 'VF-Cash', b: 'hello', d: date } } } });
  assert.deepEqual(Object.keys(r), ['~raw~d1']);
  var ids = Object.keys(r['~raw~d1'].items);
  assert.ok(direct);
  assert.deepEqual(ids, [direct.id]);
  assert.deepEqual(r['~raw~d1'].items[direct.id], direct);
});

test('same SMS from own scan and raw upload merges to one item', function () {
  var direct = parseSms(body, date);
  assert.ok(direct);
  var inbox = Object.assign({ me: { items: { [direct.id]: direct }, ign: [] } }, rawInbox({ d1: { items: { m1: { a: 'VF-Cash', b: body, d: date } } } }));
  assert.equal(Object.keys(allInboxItems(inbox)).length, 1);
});

test('empty / malformed raw docs are harmless', function () {
  assert.deepEqual(rawInbox({ x: {}, y: { items: { a: null } } }), { '~raw~x': { items: {}, ign: [] }, '~raw~y': { items: {}, ign: [] } });
  assert.deepEqual(rawInbox(undefined), {});
});
