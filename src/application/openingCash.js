// @ts-check
// Records the drawer's starting cash for the day. `queue` is index.html's own
// write-serializing `queue(fn)`, passed in explicitly (see transactions.js's
// header comment for why).
import { NUM } from '../domain/numbers.js';
import { dayKey, dayStart } from '../domain/time.js';
import { saveSettings } from './settingsUseCases.js';

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {object} settings
 * @param {string} rawAmount as typed in the sheet's input
 */
export async function recordOpeningCash(db, queue, clock, settings, rawAmount) {
  var raw = (rawAmount || '').trim(), v = NUM(raw);
  if (raw === '' || v < 0) return { ok: false, error: 'invalid-amount' };
  var now = clock.now();
  var op = Object.assign({}, settings.opens || {});
  op[dayKey(now)] = { a: v, ts: now };
  var merged = await saveSettings(db, queue, settings, {
    baseCash: v, baseTs: dayStart(now) - 1, openDay: dayKey(now), openAmt: v, openTs: now, opens: op,
  });
  return { ok: true, amount: v, settings: merged };
}
