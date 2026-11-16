// @ts-check
// Links *receiving* to *sending* limits: money must never sit on a wallet that
// cannot send it out. Monthly overflow blocks (deposits / collector legs) or warns
// (things that already happened, e.g. a customer sending to me); daily overflow
// only ever warns. Pure — everything is an explicit parameter.

export const MSG_SM = 'لا يمكن إتمام العملية: المبلغ هيقف على المحفظة ومش هتقدر تحوّله (ليميت التحويل الشهري)';
export const WARN_SD = 'تنبيه: الفلوس دي هتقف على المحفظة النهاردة بس (ليميت التحويل اليومي)، وتقدر تحوّلها بكرة';
export const WARN_SM = 'تنبيه: المبلغ ده هيقف على المحفظة لحد الشهر الجاي (ليميت التحويل الشهري). اطلب من العميل يحوّل على محفظة تانية';

/**
 * Send room left on a wallet (from a `compute` entry).
 * @param {{w:{dayLimit?:number,monthLimit?:number}, dOut:number, mOut:number}} x
 * @param {{defDay:number,defMon:number}} settings
 */
export function roomOf(x, settings) {
  var dl = x.w.dayLimit || settings.defDay, ml = x.w.monthLimit || settings.defMon;
  return { dl: dl, ml: ml, roomD: Math.max(0, dl - x.dOut), roomM: Math.max(0, ml - x.mOut) };
}

/**
 * "مستهلك مسبقًا": usage this month that happened before the app was used, derived from the
 * remaining room the owner reads in the wallet's own app. `recorded` = what the app already counted.
 * @param {number} limit monthly limit @param {number} remaining room left per the wallet's app @param {number} recorded
 */
export function preFromRemaining(limit, remaining, recorded) { return Math.max(0, limit - Math.max(0, remaining) - recorded); }

/**
 * Would `add` more money on this wallet be stuck (more than it can still send)?
 * @param {{w:object, bal:number, dOut:number, mOut:number}} x
 * @param {{defDay:number,defMon:number}} settings
 * @param {number} add
 */
export function entryChk(x, settings, add) {
  var r = roomOf(/** @type {any} */ (x), settings);
  return { m: x.bal + add > r.roomM, d: x.bal + add > r.roomD, maxM: Math.max(0, r.roomM - x.bal), roomM: r.roomM, roomD: r.roomD };
}
