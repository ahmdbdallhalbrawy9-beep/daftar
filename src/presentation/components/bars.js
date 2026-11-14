// @ts-check
// Daily/monthly limit progress bars. Extracted from index.html's `remBar`/
// `limBar` unchanged. (`limBarOld` was unused dead code in index.html —
// confirmed in docs/inventory.md §5 — and is dropped, not moved.)
import { fmt } from '../formatters.js';

/** @param {string} lbl @param {number} rem @param {number} lim */
export function remBar(lbl, rem, lim) {
  var r = Math.max(0, rem), pc = lim > 0 ? Math.max(0, Math.min(100, r / lim * 100)) : 0;
  if (r > 0 && pc < 2) pc = 2;
  var cls = r <= 0 ? 'full' : pc <= 25 ? 'hi' : '';
  return '<div class="lim1"><div class="small num"><span>' + lbl + '</span><span>متبقي ' + fmt(r) + (rem < 0 ? ' (تجاوز ' + fmt(-rem) + ')' : '') + ' من ' + fmt(lim) + '</span></div><div class="bar"><i class="' + cls + '" style="width:' + pc.toFixed(2) + '%"></i></div></div>';
}

/** @param {string} label @param {number} inn @param {number} out @param {number} lim */
export function limBar(label, inn, out, lim) {
  return '<div class="lim" style="gap:5px"><div class="small"><b>' + label + '</b></div>' + remBar('إرسال (تحويل)', lim - out, lim) + remBar('استلام (سحب)', lim - inn, lim) + '</div>';
}
