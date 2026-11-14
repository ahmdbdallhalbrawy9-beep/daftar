// @ts-check
// Tiny DOM query helpers, used throughout presentation/. Extracted from
// index.html unchanged.

/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement|null} */
export function $(s, r) { return (r || document).querySelector(s); }

/** @param {string} s @param {ParentNode} [r] @returns {HTMLElement[]} */
export function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
