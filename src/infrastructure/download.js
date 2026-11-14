// @ts-check
// Browser file download/read for the backup export/import flow.

/**
 * Downloads `blob` as `filename` (matches index.html's `bkExport`'s DOM
 * half: a throwaway `<a>` click, then revoking the object URL shortly after).
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerDownload(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
}

/** @param {File} file @returns {Promise<string>} */
export function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result)); };
    r.onerror = function () { reject(r.error); };
    r.readAsText(file);
  });
}
