// @ts-check
// Backup export/restore. The actual browser file download/read is
// infrastructure (infrastructure/download.js); this module only shapes and
// persists the data.

/**
 * Flattens `{collection: {docId: data}}` into `{"collection/docId": data}` —
 * the shape saved in a backup file.
 * @param {Record<string, Record<string, object>>} rawState
 */
export function exportBackup(rawState) {
  var o = {};
  Object.keys(rawState).forEach(function (c) {
    // phones registered on the account (settings/dev_*) belong to the account, not to the ledger
    Object.keys(rawState[c]).forEach(function (id) { if (!(c === 'settings' && id.indexOf('dev_') === 0)) o[c + '/' + id] = rawState[c][id]; });
  });
  return o;
}

/**
 * Deletes every currently-known document, then writes every
 * `wallets|ledger|closes|settings/...` entry from the backup — one
 * serialized `queue()` block (index.html wraps the whole restore in one
 * `queue(fn)` call at its call site; that responsibility moves in here).
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {Record<string, Record<string, object>>} currentRaw
 * @param {Record<string, object>} backupData
 */
export function restoreBackup(db, queue, currentRaw, backupData) {
  var curKeys = Object.keys(exportBackup(currentRaw));
  var newKeys = Object.keys(backupData).filter(function (k) { return /^(wallets|ledger|closes|settings)\//.test(k) && k.indexOf('settings/dev_') !== 0; });
  return queue(function () {
    var p = Promise.resolve();
    curKeys.forEach(function (k) {
      var idx = k.indexOf('/');
      p = p.then(function () { return db.collection(k.slice(0, idx)).doc(k.slice(idx + 1)).delete(); });
    });
    newKeys.forEach(function (k) {
      var idx = k.indexOf('/');
      p = p.then(function () { return db.collection(k.slice(0, idx)).doc(k.slice(idx + 1)).set(backupData[k]); });
    });
    return p;
  }).then(function () { return { ok: true }; });
}
