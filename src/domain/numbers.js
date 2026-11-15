// @ts-check
// Number parsing: Arabic-Indic digit input, Arabic decimal/thousands separators.
// Extracted from index.html unchanged (see docs/inventory.md §3, docs/ARCHITECTURE.md §4).

const AR = '٠١٢٣٤٥٦٧٨٩';

/**
 * Parse a user-typed amount: Western or Arabic-Indic digits, Arabic/Western
 * decimal and thousands separators. Never throws; non-numeric input is 0.
 * @param {string|number|null|undefined} s
 * @returns {number}
 */
export function NUM(s) {
  s = String(s || '').replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); }).replace(/٫/g, '.').replace(/[,،\s]/g, '');
  var n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

/**
 * Normalize SMS body text: Arabic-Indic digits to Western, strip bidi marks,
 * collapse whitespace runs. Used before running the parseSms regexes.
 * @param {string|null|undefined} x
 * @returns {string}
 */
export function nrm(x) {
  return String(x || '').replace(/[٠-٩]/g, function (d) { return AR.indexOf(d); }).replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ');
}

/**
 * Parse a comma-grouped Western numeric string (SMS amounts are never Arabic-Indic
 * by the time this runs — `parseSms` normalizes the whole body with `nrm` first).
 * @param {string|number} x
 * @returns {number}
 */
export function nv(x) {
  return parseFloat(String(x).replace(/,/g, ''));
}
