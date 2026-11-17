// @ts-check
// Daily automatic backup kept in the account itself (collection `backups`, never read by the live sync):
//   backups/index        -> { days: { "20261117": <chunk count>, ... }, pre?: <chunk count> }
//   backups/bk_<day>_<i> -> { day, i, n, ts, json }   (json = a slice of the flattened backup)
// The newest KEEP days are kept. Restoring first saves the current data as the `pre` copy.
import { exportBackup } from './backup.js';
import { dayKey } from '../domain/time.js';

export var KEEP = 7;
var CHUNK_CHARS = 300000; // Arabic is 2 bytes/char in UTF-8 -> ~600 KB, under Firestore's 1 MiB document limit

/** @param {Record<string, object>} flat @returns {string[]} JSON strings, each a slice of the flat map */
export function chunkBackup(flat) {
  /** @type {string[]} */
  var out = [];
  /** @type {Record<string, object>} */
  var cur = {};
  var len = 0;
  Object.keys(flat).forEach(function (k) {
    var piece = JSON.stringify(flat[k]).length + k.length + 6;
    if (len && len + piece > CHUNK_CHARS) { out.push(JSON.stringify(cur)); cur = {}; len = 0; }
    cur[k] = flat[k]; len += piece;
  });
  out.push(JSON.stringify(cur));
  return out;
}

/** @param {import('./ports.js').DbPort} db @returns {Promise<{days: Record<string, number>, pre?: number}>} */
export async function readIndex(db) {
  var s = await db.collection('backups').doc('index').get();
  var d = s && s.exists ? s.data() : null;
  return { days: (d && d.days) || {}, pre: d && d.pre };
}

/**
 * Writes one snapshot under `name` ("20261117" or "pre") and returns its chunk count.
 * @param {import('./ports.js').DbPort} db
 * @param {Record<string, Record<string, object>>} raw the live state's raw docs
 * @param {string} name @param {number} ts
 */
function writeSnapshot(db, raw, name, ts) {
  var chunks = chunkBackup(exportBackup(raw));
  chunks.forEach(function (json, i) {
    db.collection('backups').doc('bk_' + name + '_' + i).set({ day: name, i: i, n: chunks.length, ts: ts, json: json });
  });
  return chunks.length;
}

/**
 * Takes today's backup unless one already exists (any phone) — or always when `force` (after the daily close).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {Record<string, Record<string, object>>} raw
 * @param {boolean} [force]
 * @returns {Promise<{ok: boolean, skipped?: boolean, day: string, chunks?: number}>}
 */
export async function runAutoBackup(db, queue, clock, raw, force) {
  var day = dayKey(clock.now());
  var idx = await readIndex(db);
  if (idx.days[day] && !force) return { ok: true, skipped: true, day: day };
  return queue(function () {
    var n = writeSnapshot(db, raw, day, clock.now());
    var days = Object.assign({}, idx.days); days[day] = n;
    var keys = Object.keys(days).sort();
    while (keys.length > KEEP) {
      var old = /** @type {string} */ (keys.shift()), cnt = days[old];
      for (var i = 0; i < cnt; i++) db.collection('backups').doc('bk_' + old + '_' + i).delete();
      delete days[old];
    }
    /** @type {any} */
    var rec = { days: days };
    if (idx.pre) rec.pre = idx.pre;
    db.collection('backups').doc('index').set(rec);
    return Promise.resolve({ ok: true, day: day, chunks: n });
  });
}

/**
 * Reads a snapshot back as the flat `{"collection/id": data}` map (`name` = day or "pre").
 * @param {import('./ports.js').DbPort} db @param {string} name @param {number} chunks
 * @returns {Promise<Record<string, object>|null>} null when a piece is missing
 */
export async function readSnapshot(db, name, chunks) {
  /** @type {Record<string, object>} */
  var flat = {};
  for (var i = 0; i < chunks; i++) {
    var s = await db.collection('backups').doc('bk_' + name + '_' + i).get();
    if (!s || !s.exists) return null;
    Object.assign(flat, JSON.parse(s.data().json));
  }
  return flat;
}

/**
 * Saves the current data as the `pre` copy (what restore falls back to).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {Record<string, Record<string, object>>} raw
 */
export async function savePreRestore(db, queue, clock, raw) {
  var idx = await readIndex(db);
  return queue(function () {
    var n = writeSnapshot(db, raw, 'pre', clock.now());
    for (var i = n; i < (idx.pre || 0); i++) db.collection('backups').doc('bk_pre_' + i).delete();
    db.collection('backups').doc('index').set({ days: idx.days, pre: n });
    return Promise.resolve(n);
  });
}
