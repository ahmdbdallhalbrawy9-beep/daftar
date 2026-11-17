// @ts-check
// The phones signed in to this account: each one writes a small `settings/dev_<id>` doc so the
// settings tab can list them. Display only — nothing else reads these docs.

var REFRESH_MS = 6 * 3600e3;

/**
 * Registers (or refreshes) this phone. Skips the write when the doc is already fresh and unchanged.
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {string} deviceId
 * @param {Record<string, any>} devices current `state.devices` (id -> doc)
 * @param {{name: string, os: string}} info
 */
export function registerDevice(db, queue, clock, deviceId, devices, info) {
  var cur = devices && devices[deviceId];
  var now = clock.now();
  if (cur && cur.name === info.name && cur.os === info.os && now - (cur.ts || 0) < REFRESH_MS) return Promise.resolve({ ok: true, skipped: true });
  var doc = db.collection('settings').doc('dev_' + deviceId);
  // an existing doc is refreshed with `update` so the owner's `perm` flags are never overwritten
  if (cur) return queue(function () { return doc.update({ name: info.name, os: info.os, ts: now }); }).then(function () { return { ok: true }; });
  var rec = { kind: 'device', name: info.name, os: info.os, ts: now, first: now };
  return queue(function () { return doc.set(rec); }).then(function () { return { ok: true }; });
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 */
export function removeDevice(db, queue, deviceId) {
  return queue(function () { return db.collection('settings').doc('dev_' + deviceId).delete(); })
    .then(function () { return { ok: true }; });
}

/**
 * Owner sets what one phone may do (`perm` = only the flags that are off).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 * @param {Record<string, boolean>} perm
 */
export function setDevicePerm(db, queue, deviceId, perm) {
  return queue(function () { return db.collection('settings').doc('dev_' + deviceId).update({ perm: perm }); })
    .then(function () { return { ok: true }; });
}
