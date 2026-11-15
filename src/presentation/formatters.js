// @ts-check
// Display formatting: Western-digit grouped numbers, HTML-escaping. Extracted
// from index.html unchanged.

/** @param {number} n @returns {string} up to 2 decimals, en-US grouping */
export function fm2(n) {
  n = Math.round(n * 100) / 100;
  return Number.isInteger(n) ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** @param {number} n @returns {string} rounded integer, en-US grouping */
export function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

/** @param {string|number|null|undefined} s @returns {string} HTML-escaped, safe for innerHTML */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
