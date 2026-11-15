// @ts-check
// Light/dark/system theme choice — a per-device UI preference, never synced
// through Firestore settings (roadmap phase 7). The flash-prevention itself
// is a tiny inline script in index.html's <head> (sets `data-theme` before
// first paint); this module re-applies choices made in إعدادات and keeps
// <meta name="theme-color"> following the resolved theme afterward.
import { getItem, setItem, removeItem } from '../infrastructure/storage.js';

const KEY = 'daftar-theme';

/** @returns {'light'|'dark'|null} the explicit per-device choice, or null for "system" */
export function getThemeChoice() {
  var v = getItem(KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

/** @returns {'light'|'dark'} the theme actually in effect right now */
export function resolveEffectiveTheme() {
  var choice = getThemeChoice();
  if (choice) return choice;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function updateThemeColorMeta() {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  if (surface) meta.setAttribute('content', surface);
}

/** @param {'light'|'dark'|null} choice null = follow the system */
export function applyTheme(choice) {
  if (choice === 'light' || choice === 'dark') {
    document.documentElement.dataset.theme = choice;
    setItem(KEY, choice);
  } else {
    delete document.documentElement.dataset.theme;
    removeItem(KEY);
  }
  updateThemeColorMeta();
}

/** Call once at boot: syncs the theme-color meta now, and on system changes while in "system" mode. */
export function initTheme() {
  updateThemeColorMeta();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!getThemeChoice()) updateThemeColorMeta();
    });
  }
}
