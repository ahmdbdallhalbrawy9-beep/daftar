// @ts-check
// Default-rate settings and the wipe password. `queue` is index.html's own
// write-serializing `queue(fn)`, passed in explicitly (see transactions.js's
// header comment for why). `sha` is passed in as a plain function
// (implemented by infrastructure/crypto.js) so this module never imports
// infrastructure directly.
import { rid } from '../domain/ids.js';

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {object} settings current settings
 * @param {object} patch
 * @returns {Promise<object>} the merged settings (for the caller's optimistic update)
 */
export function saveSettings(db, queue, settings, patch) {
  var merged = Object.assign({}, settings, patch);
  return queue(function () { return db.collection('settings').doc('main').set(merged); })
    .then(function () { return merged; });
}

/**
 * @param {(text: string) => Promise<string>} sha
 * @param {{pwHash?: string, pwSalt?: string}} settings
 * @param {string} pw
 */
export async function checkWipePassword(sha, settings, pw) {
  return !!settings.pwHash && (await sha((settings.pwSalt || '') + pw)) === settings.pwHash;
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {(text: string) => Promise<string>} sha
 * @param {object} settings
 * @param {string} pw
 */
export async function setWipePassword(db, queue, sha, settings, pw) {
  if (pw.length < 4) return { ok: false, error: 'too-short' };
  var salt = rid('s');
  var merged = await saveSettings(db, queue, settings, { pwSalt: salt, pwHash: await sha(salt + pw) });
  return { ok: true, settings: merged };
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {(text: string) => Promise<string>} sha
 * @param {object} settings
 * @param {string} oldPw
 * @param {string} newPw
 */
export async function changeWipePassword(db, queue, sha, settings, oldPw, newPw) {
  if (!(await checkWipePassword(sha, settings, oldPw))) return { ok: false, error: 'wrong-password' };
  if (newPw.length < 4) return { ok: false, error: 'too-short' };
  var salt = rid('s');
  var merged = await saveSettings(db, queue, settings, { pwSalt: salt, pwHash: await sha(salt + newPw) });
  return { ok: true, settings: merged };
}
