// @ts-check
// Generic bottom-sheet scaffold (scrim + content, closes on scrim click).
// index.html's `openSheet`/`closeSheet` were specific to the wallet-edit
// sheet; this is the shared shell both the wallet-edit sheet and
// today.js's "opening cash" sheet build their content into, with the
// exact same scrim/close behavior as the original.
import { $ } from '../dom.js';

/**
 * @param {string} innerHtml the `.sheet` element's full markup
 * @param {() => void} [wire] called right after the sheet is in the DOM, to
 *   attach its specific field values/listeners (mirrors what index.html did
 *   inline right after setting `#sheetBox.innerHTML`)
 */
export function openSheet(innerHtml, wire) {
  $('#sheetBox').innerHTML = '<div class="scrim" id="scrim">' + innerHtml + '</div>';
  $('#scrim').addEventListener('click', function (e) { if (e.target.id === 'scrim') closeSheet(); });
  if (wire) wire();
}

export function closeSheet() {
  $('#sheetBox').innerHTML = '';
}
