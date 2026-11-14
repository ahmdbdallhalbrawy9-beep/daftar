// @ts-check
// A short-lived status message at the bottom of the screen. Extracted from
// index.html's `toast` unchanged.
import { $ } from '../dom.js';
import { esc } from '../formatters.js';

var toastT;

/** @param {string} msg @param {boolean} [bad] */
export function toast(msg, bad) {
  var b = $('#toastBox');
  b.innerHTML = '<div class="toast' + (bad ? ' bad' : '') + '" role="status">' + esc(msg) + '</div>';
  clearTimeout(toastT);
  toastT = setTimeout(function () { b.innerHTML = ''; }, 2800);
}
