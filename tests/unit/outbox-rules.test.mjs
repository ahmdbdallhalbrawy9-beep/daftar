import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawInbox, pendingItems, allInboxItems } from '../../src/application/smsImport.js';
import { parseSms } from '../../src/domain/sms.js';
import { brandTip, smsQueueNote } from '../../src/domain/bgHints.js';

// These tests pin the rules the native SmsOutbox/SmsUploader rely on (android-native/*.java is not compiled here):
//  - a message with an operation number gets the same id whatever `d` (date) it is uploaded with;
//  - an airtime message ("شحن رصيد", no operation number) gets an id made from its date, so it must always be
//    uploaded with the inbox date; the native side defers every message containing "شحن" to the inbox path.

var recvBody = 'تم استلام مبلغ 500 جنيه من رقم 01012345678 المسجل بإسم أحمد علي على رقم محفظتك 01099998888. رصيدك الحالي 1500 جنيه رقم العملية 12345678';
var otherBody = 'تم استلام مبلغ 200 جنيه من رقم 01055556666 المسجل بإسم منى على رقم محفظتك 01099998888. رصيدك الحالي 1700 جنيه رقم العملية 87654321';
var payBody = 'تم دفع مبلغ 47.99جنية لMidasbuyPayermax. رصيد محفظتك الحالي 1701.92 جنيه. رقم العملية 22334455';
var transferBody = 'تم تحويل 300 جنيه لرقم 01011112222 مصاريف الخدمة 5 رصيد حسابك الحالي 900 جنيه رقم العملية 33445566';
var cashoutBody = 'تم سحب 400 جنيه رصيد حسابك الحالي 500 جنيه رقم العملية 44556677';
var airBody = 'تم شحن رصيد ب 30 ج بنجاح إلى رقم 01012345678 وخصم 30 ج من محفظتك. رصيد حسابك الحالي 70 جنيه';

var inboxDate = 1700000000000;
var receiverDate = inboxDate + 1800; // the broadcast and the inbox row differ by a moment

test('operation-number message: outbox copy (receiver time) and inbox row (inbox date) are the same item', function () {
  var raws = { d1: { items: {
    m42: { a: 'VF-Cash', b: recvBody, d: inboxDate },            // read from the phone's inbox
    oabc123: { a: 'VF-Cash', b: recvBody, d: receiverDate },     // saved by SmsReceiver
  } } };
  var items = rawInbox(raws)['~raw~d1'].items;
  var ids = Object.keys(items);
  assert.deepEqual(ids, ['12345678']);
  // and it is the id a normal scan on any phone would produce
  assert.equal(parseSms(recvBody, inboxDate).id, '12345678');
  assert.equal(parseSms(recvBody, receiverDate).id, '12345678');
});

test('different operation numbers stay different items (no text/time merging)', function () {
  var raws = { d1: { items: {
    o1: { a: 'VF-Cash', b: recvBody, d: receiverDate },
    o2: { a: 'VF-Cash', b: otherBody, d: receiverDate + 5 },
  } } };
  assert.deepEqual(Object.keys(rawInbox(raws)['~raw~d1'].items).sort(), ['12345678', '87654321']);
});

test('every kind that carries an operation number keeps its id independent of the date', function () {
  [recvBody, payBody, transferBody, cashoutBody].forEach(function (b) {
    var a = parseSms(b, inboxDate), c = parseSms(b, receiverDate);
    assert.ok(a && c, b);
    assert.equal(a.id, c.id);
    assert.ok(!a.id.startsWith('c'), 'operation-number ids are plain digits');
  });
});

test('airtime message: id depends on the date, so it must be uploaded with the inbox date', function () {
  var fromInbox = parseSms(airBody, inboxDate);
  var fromReceiver = parseSms(airBody, receiverDate);
  assert.ok(fromInbox && fromReceiver);
  assert.ok(fromInbox.id.startsWith('c'));
  assert.notEqual(fromInbox.id, fromReceiver.id); // why SmsReceiver never uploads these itself
  // the inbox path gives the same id as a normal scan on the phone
  var items = rawInbox({ d1: { items: { m7: { a: 'VF-Cash', b: airBody, d: inboxDate } } } })['~raw~d1'].items;
  assert.deepEqual(Object.keys(items), [fromInbox.id]);
});

test('every message whose id is date-derived contains "شحن" (the native "defer to inbox" test is a superset)', function () {
  [recvBody, otherBody, payBody, transferBody, cashoutBody, airBody].forEach(function (b) {
    var r = parseSms(b, inboxDate);
    assert.ok(r, b);
    if (r.id.startsWith('c')) assert.ok(b.indexOf('شحن') >= 0, 'date-keyed message must contain شحن: ' + b);
  });
  // and the Arabic-Indic digit / spacing variants the parser normalizes first still contain it
  var variant = 'تم  شحن رصيد ب ٣٠ ج بنجاح إلى رقم ٠١٠١٢٣٤٥٦٧٨ وخصم ٣٠ ج من محفظتك. رصيد حسابك الحالي ٧٠ جنيه';
  var r2 = parseSms(variant, inboxDate);
  assert.ok(r2 && r2.id.startsWith('c'));
  assert.ok(variant.indexOf('شحن') >= 0);
});

test('a confirmed operation is not pending again however many copies the raw doc holds', function () {
  var raws = { d1: { items: {
    m1: { a: 'VF-Cash', b: recvBody, d: inboxDate },
    o1: { a: 'VF-Cash', b: recvBody, d: receiverDate },
  } } };
  var inbox = rawInbox(raws);
  assert.equal(Object.keys(allInboxItems(inbox)).length, 1);
  var wallets = [{ id: 'w1', type: 'vf', active: true, phone: '01099998888' }];
  var compute = { W: { w1: { bal: 1000 } } };
  assert.equal(pendingItems(wallets, inbox, [], /** @type {any} */ (compute)).length, 1);
  assert.equal(pendingItems(wallets, inbox, [{ sid: '12345678' }], /** @type {any} */ (compute)).length, 0);
});

test('brandTip: known brands get a tip, unknown ones none', function () {
  assert.match(brandTip('oppo'), /أوبو/);
  assert.match(brandTip('realme'), /ريلمي/);
  assert.match(brandTip('infinix'), /إنفينكس/);
  assert.match(brandTip('samsung'), /سامسونج/);
  assert.equal(brandTip('google'), '');
  assert.equal(brandTip(undefined), '');
});

test('smsQueueNote: shows what is queued and the last receive time, nothing when there is nothing', function () {
  var fmt = function (ms) { return 'T' + ms; };
  assert.equal(smsQueueNote(null, fmt), '');
  assert.equal(smsQueueNote({ queued: 0, waitInbox: 0, lastRecv: 0 }, fmt), '');
  var s = smsQueueNote({ queued: 2, waitInbox: 1, lastRecv: 5 }, fmt);
  assert.match(s, /2 رسالة مستنية الرفع/);
  assert.match(s, /1 رسالة شحن مستنية/);
  assert.match(s, /T5/);
});
