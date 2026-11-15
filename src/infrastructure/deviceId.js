// @ts-check
// Per-device id, persisted in localStorage, prefixed onto ledger doc ids so
// several phones can write to the same shared day without clobbering.
import { getItem, setItem } from './storage.js';

/** @returns {string} */
export function getDeviceId() {
  var d = getItem('dw_dev');
  if (!d) { d = 'd' + Math.random().toString(36).slice(2, 7); setItem('dw_dev', d); }
  return d;
}
