import test from 'node:test';
import assert from 'node:assert/strict';
import { limitNotifications, pruneSent, noteId } from '../../src/domain/limitNotify.js';

const S = { defDay: 60000, defMon: 200000 };
const w = (id, extra) => Object.assign({ id, name: 'محفظة ' + id, dayLimit: 60000, monthLimit: 200000 }, extra);
const x = (o) => Object.assign({ bal: 1000, dOut: 0, dIn: 0, mOut: 0, mIn: 0 }, o);
const DK = '20261118';

test('nothing when the limits are far from used up', () => {
  const r = limitNotifications([w('a')], { a: x({ dOut: 1000, mOut: 5000 }) }, S, DK, {});
  assert.deepEqual(r, { notes: [], keys: [] });
});

test('20% left: shows what is left, the limit and the percentage', () => {
  const r = limitNotifications([w('a')], { a: x({ dOut: 48000 }) }, S, DK, {});
  assert.equal(r.notes.length, 1);
  assert.equal(r.notes[0].title, 'تنبيه ليميت: محفظة a');
  assert.equal(r.notes[0].body, 'إرسال النهارده: باقي 12,000 من 60,000 (20%)');
  assert.deepEqual(r.keys, ['a|do|low|' + DK]);
});

test('just over 20% left: no notification', () => {
  assert.equal(limitNotifications([w('a')], { a: x({ dOut: 47000 }) }, S, DK, {}).notes.length, 0);
});

test('limit used up: its own message, and it also counts as the 20% one', () => {
  const r = limitNotifications([w('a')], { a: x({ dOut: 60000 }) }, S, DK, {});
  assert.equal(r.notes[0].body, 'إرسال النهارده: الحد خلص (من 60,000)');
  assert.deepEqual(r.keys.sort(), ['a|do|end|' + DK, 'a|do|low|' + DK].sort());
});

test('once only: a key that was already sent is not repeated, but "finished" still comes after "20%"', () => {
  const sent = { ['a|do|low|' + DK]: 1 };
  assert.equal(limitNotifications([w('a')], { a: x({ dOut: 50000 }) }, S, DK, sent).notes.length, 0);
  const r = limitNotifications([w('a')], { a: x({ dOut: 60000 }) }, S, DK, sent);
  assert.equal(r.notes.length, 1);
  assert.ok(/الحد خلص/.test(r.notes[0].body));
  sent['a|do|end|' + DK] = 1;
  assert.equal(limitNotifications([w('a')], { a: x({ dOut: 60000 }) }, S, DK, sent).notes.length, 0);
});

test('one notification per wallet, listing every limit that is low; month limits keyed by month', () => {
  const r = limitNotifications([w('a')], { a: x({ bal: 100000, dOut: 0, mOut: 170000 }) }, S, DK, {});
  assert.equal(r.notes.length, 1);
  assert.ok(/إرسال الشهر: باقي 30,000 من 200,000 \(15%\)/.test(r.notes[0].body));
  assert.ok(r.keys.includes('a|mo|low|202611'));
});

test('a day room cut short by the month, or a receive room cut short by the balance, is not a limit alert', () => {
  // month nearly gone -> the day room is capped by the month ("month"): only the month line shows
  const r = limitNotifications([w('a')], { a: x({ mOut: 195000 }) }, S, DK, {});
  assert.equal(r.notes[0].body.split('\n').length, 1);
  assert.ok(/إرسال الشهر/.test(r.notes[0].body));
  // very high balance: receive room is limited by the balance ("transfer")
  const r2 = limitNotifications([w('a')], { a: x({ bal: 59000, dOut: 0 }) }, S, DK, {});
  assert.equal(r2.notes.length, 0);
});

test('stopped wallets and wallets without data are ignored', () => {
  const r = limitNotifications([w('a', { active: false }), w('b')], { a: x({ dOut: 60000 }) }, S, DK, {});
  assert.equal(r.notes.length, 0);
});

test('pruneSent keeps only today and this month; noteId is stable and in range', () => {
  const sent = { ['a|do|low|' + DK]: 1, 'a|do|low|20261117': 1, 'a|mo|low|202611': 1, 'a|mo|low|202610': 1 };
  assert.deepEqual(Object.keys(pruneSent(sent, DK)).sort(), ['a|do|low|' + DK, 'a|mo|low|202611'].sort());
  assert.equal(noteId('w1'), noteId('w1'));
  assert.ok(noteId('w1') >= 1000);
  assert.notEqual(noteId('w1'), noteId('w2'));
});
