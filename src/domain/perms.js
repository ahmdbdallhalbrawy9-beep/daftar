// @ts-check
// Per-phone permissions. Stored as `perm` on the phone's `settings/dev_<id>` doc; a missing flag means
// "allowed", so existing phones and new phones start with everything on. This is organisation, not
// security: every phone signs in with the same account.

/** @type {Array<[string, string]>} key, Arabic label shown in settings */
export const PERMS = [
  ['profit', 'يشوف الأرباح'],
  ['settings', 'يغيّر الإعدادات'],
  ['void', 'يلغي عمليات'],
  ['wallets', 'يعدّل المحافظ ويمسحها'],
  ['close', 'يعمل الجرد وإقفال اليوم'],
  ['credit', 'يشوف الآجل ويسجّله'],
];

/**
 * @param {{perm?: Record<string, boolean>}|null|undefined} dev the phone's device doc
 * @returns {Record<string, boolean>} every key of PERMS -> allowed?
 */
export function permsOf(dev) {
  var p = (dev && dev.perm) || {};
  /** @type {Record<string, boolean>} */
  var out = {};
  PERMS.forEach(function (x) { out[x[0]] = p[x[0]] !== false; });
  return out;
}

/** Copy of `perm` with one flag changed (only `false` flags are stored). @param {Record<string, boolean>|undefined} perm */
export function withPerm(perm, key, on) {
  var o = Object.assign({}, perm || {});
  if (on) delete o[key]; else o[key] = false;
  return o;
}
