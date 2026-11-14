// @ts-check
// SHA-256 hex digest for the wipe password, with a non-crypto fallback for
// contexts without Web Crypto (matches index.html's `sha`).

/** @param {string} x @returns {Promise<string>} */
export async function sha(x) {
  try {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x));
    return Array.prototype.map.call(new Uint8Array(b), function (y) { return y.toString(16).padStart(2, '0'); }).join('');
  } catch (e) {
    var h = 5381;
    for (var i = 0; i < x.length; i++) h = ((h << 5) + h + x.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }
}
