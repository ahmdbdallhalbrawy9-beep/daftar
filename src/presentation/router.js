// @ts-check
// Tab switching. Extracted from index.html's `showTab` unchanged.
import { $$ } from './dom.js';

/** @param {ReturnType<typeof import('./store.js').createStore>} store @param {string} t */
export function showTab(store, t) {
  store.patchUI({ tab: t });
  $$('.tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + t); });
  $$('nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
  window.scrollTo(0, 0);
}
