// @ts-check
// Thin localStorage wrapper. Every call is try/caught, matching index.html's
// existing defensive pattern (storage can throw in private-mode/blocked contexts).

/** @param {string} key @returns {string|null} */
export function getItem(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

/** @param {string} key @param {string} value */
export function setItem(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

/** @param {string} key */
export function removeItem(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}
