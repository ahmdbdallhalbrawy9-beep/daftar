// @ts-check
// Tab switching. Extracted from index.html's `showTab` unchanged, plus
// (phase 12) relocating the single shared date/sync-status chip into the
// now-active tab's page header — there is no global top bar any more, so
// this one DOM node (not a copy) moves into whichever `[data-slot]` is
// currently visible instead of living in a fixed header on every tab.
import { $, $$ } from './dom.js';

/** @param {ReturnType<typeof import('./store.js').createStore>} store @param {string} t */
export function showTab(store, t) {
  store.patchUI({ tab: t });
  $$('.tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t); });
  var slot = $('#tab-' + t + ' [data-slot]');
  var chip = $('#statusChip');
  if (slot && chip && chip.parentElement !== slot) slot.appendChild(chip);
  $$('nav button').forEach(function (b) {
    var active = b.dataset.t === t;
    b.classList.toggle('on', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
