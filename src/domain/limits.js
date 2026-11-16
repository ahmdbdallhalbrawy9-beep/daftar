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

/**
 * What can really still be sent / received on a wallet, today and this month.
 * Display-only (never feeds balances or profit). `why` says what shrank the number:
 * 'transfer' = money would sit on the wallet because the send limit is used up,
 * 'month' = today's room is bigger than what is left of the monthly limit, '' = the official limit.
 * @param {number} dl daily limit @param {number} ml monthly limit
 * @param {{bal:number, dIn:number, dOut:number, mIn:number, mOut:number}} x
 */
export function walletRoom(dl, ml, x) {
  var bal = x.bal;
  var mOut = ml - x.mOut;
  var mInOff = ml - x.mIn, mInT = ml - x.mOut - bal;
  var mInWhy = mInT < mInOff ? 'transfer' : '';
  var mIn = mInWhy ? Math.max(0, mInT) : mInOff;
  var dOutOff = dl - x.dOut;
  var dOutWhy = mOut < dOutOff ? 'month' : '';
  var dOut = dOutWhy ? Math.max(0, mOut) : dOutOff;
  var dInOff = dl - x.dIn, dInT = dl - x.dOut - bal;
  var dInBase = Math.min(dInOff, dInT);
  var dInWhy = mIn < dInBase ? 'month' : (dInT < dInOff ? 'transfer' : '');
  var dIn = dInWhy ? Math.max(0, Math.min(dInBase, mIn)) : dInOff;
  return {
    dOut: { rem: dOut, why: dOutWhy }, dIn: { rem: dIn, why: dInWhy },
    mOut: { rem: mOut, why: '' }, mIn: { rem: mIn, why: mInWhy },
  };
}
