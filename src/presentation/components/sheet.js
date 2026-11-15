// @ts-check
// Generic bottom-sheet scaffold (scrim + content, closes on scrim click or
// Esc — per the daftar-ui skill's accessibility rule, "sheets/dialogs trap
// focus and close on Esc and scrim tap"). index.html's `openSheet`/
// `closeSheet` were specific to the wallet-edit sheet; this is the shared
// shell both the wallet-edit sheet and today.js's "opening cash" sheet build
// their content into.
import { $ } from '../dom.js';

var onEsc = null;

/**
 * @param {string} innerHtml the `.sheet` element's full markup
 * @param {() => void} [wire] called right after the sheet is in the DOM, to
 *   attach its specific field values/listeners (mirrors what index.html did
 *   inline right after setting `#sheetBox.innerHTML`)
 */
var FOCUSABLE = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';

export function openSheet(innerHtml, wire) {
  $('#sheetBox').innerHTML = '<div class="scrim" id="scrim">' + innerHtml + '</div>';
  $('#scrim').addEventListener('click', function (e) { if (e.target.id === 'scrim') closeSheet(); });
  onEsc = function (e) {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key !== 'Tab') return;
    var sheetEl = $('.sheet');
    if (!sheetEl) return;
    var items = Array.prototype.slice.call(sheetEl.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onEsc);
  if (wire) wire();
}

export function closeSheet() {
  $('#sheetBox').innerHTML = '';
  if (onEsc) { document.removeEventListener('keydown', onEsc); onEsc = null; }
}
