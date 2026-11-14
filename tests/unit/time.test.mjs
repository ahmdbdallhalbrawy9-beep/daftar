// Timestamps below are built with Date.UTC(...) and a hand-checked Africa/Cairo
// offset (verified with `Intl.DateTimeFormat(...,{timeZoneName:'longOffset'})`
// for each date used: Cairo is UTC+2 on every date below — none fall in the
// Apr-Oct DST window Egypt has used in some recent years).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, hhmm, dayStart, shiftDay } from '../../src/domain/time.js';

test('dayKey / hhmm: midnight boundary in Cairo time (2026-01-15 -> 2026-01-16)', () => {
  const beforeMidnight = Date.UTC(2026, 0, 15, 21, 59, 30); // Cairo 2026-01-15 23:59:30
  const afterMidnight = Date.UTC(2026, 0, 15, 22, 0, 30); // Cairo 2026-01-16 00:00:30
  assert.equal(dayKey(beforeMidnight), '20260115');
  assert.equal(dayKey(afterMidnight), '20260116');
  assert.equal(hhmm(beforeMidnight), '23:59');
  assert.equal(hhmm(afterMidnight), '00:00');
});

test('dayKey: month boundary in Cairo time (2026-01-31 -> 2026-02-01)', () => {
  const beforeMidnight = Date.UTC(2026, 0, 31, 21, 59, 30); // Cairo 2026-01-31 23:59:30
  const afterMidnight = Date.UTC(2026, 0, 31, 22, 0, 30); // Cairo 2026-02-01 00:00:30
  const dayA = dayKey(beforeMidnight), dayB = dayKey(afterMidnight);
  assert.equal(dayA, '20260131');
  assert.equal(dayB, '20260201');
  assert.notEqual(dayA.slice(0, 6), dayB.slice(0, 6), 'month key must change across the boundary');
});

test('dayStart: returns the Cairo-midnight timestamp containing ts', () => {
  const midday = Date.UTC(2026, 0, 15, 8, 30, 0); // Cairo 2026-01-15 10:30:00
  const expectedStart = Date.UTC(2026, 0, 14, 22, 0, 0); // Cairo 2026-01-15 00:00:00.000
  assert.equal(dayStart(midday), expectedStart);

  // exactly at Cairo midnight: dayStart(ts) === ts
  assert.equal(dayStart(expectedStart), expectedStart);

  // one millisecond before Cairo midnight: belongs to the previous day
  const justBefore = expectedStart - 1;
  const prevDayStart = Date.UTC(2026, 0, 13, 22, 0, 0);
  assert.equal(dayStart(justBefore), prevDayStart);
});

test('shiftDay: crosses month/year/leap-year boundaries', () => {
  assert.equal(shiftDay('20260131', 1), '20260201');
  assert.equal(shiftDay('20260101', -1), '20251231');
  assert.equal(shiftDay('20261231', 1), '20270101');
  assert.equal(shiftDay('20280228', 1), '20280229', '2028 is a leap year');
  assert.equal(shiftDay('20280229', 1), '20280301');
  assert.equal(shiftDay('20260115', 0), '20260115');
});
