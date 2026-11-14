'use strict';
// Loads the real index.html inline <script> into a sandboxed vm context and
// exposes its internal functions/state for testing, WITHOUT editing index.html
// on disk. See docs/inventory.md for what lives where.
//
// How it works: the whole script is one sealed IIFE with no exports. We read
// index.html, extract the inline script text, and splice one line into the
// in-memory copy (right before the app's own boot IIFE at the bottom) that
// assigns the functions/state we need onto `globalThis.__APP__`. By that
// point every function declaration and top-level `var` in the file has
// already run, so the splice point only *captures* references — it changes
// nothing about how the app computes anything.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
const BOOT_MARKER = '(async function(){';

const EXPORTS = [
  'NUM', 'nrm', 'nv', 'esc', 'fmt', 'fm2', 'pad',
  'dayKey', 'dayStart', 'hhmm', 'shiftDay', 'cp', 'rid',
  'baseK', 'isInsta', 'isInsT', 'wd', 'cd',
  'walletCost', 'xferCost', 'maxAmt', 'splitWallets', 'ensureCol', 'buildPlan',
  'compute', 'rank', 'parseSms',
  'txGroups', 'daySum', 'liveTxs', 'writable', 'changed',
  'S', 'UI', 'DEFAULTS', 'KIND', 'PKIND', 'MSG', 'DEV',
];

function extractInlineScript(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('loadApp: could not find an inline <script> (no src attribute) in index.html');
  return m[1];
}

function makeFakeElement() {
  const el = {
    value: '', textContent: '', innerHTML: '', className: '',
    hidden: false, disabled: false,
    style: {}, dataset: {}, files: [],
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    focus() {}, select() {}, click() {}, remove() {},
    closest() { return null; },
    querySelector() { return makeFakeElement(); },
    querySelectorAll() { return []; },
    appendChild(x) { return x; }, insertAdjacentHTML() {},
    contains() { return false; },
    getAttribute() { return null; }, setAttribute() {},
  };
  return el;
}

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
}

function buildSandbox() {
  const document = Object.assign(makeFakeElement(), {
    activeElement: null,
    body: makeFakeElement(),
    head: makeFakeElement(),
    createElement() { return makeFakeElement(); },
  });
  const windowObj = {
    addEventListener() {}, removeEventListener() {}, scrollTo() {},
    FIREBASE_CONFIG: undefined,
  };
  const sandbox = {
    console,
    document,
    window: windowObj,
    navigator: { onLine: true },
    localStorage: makeLocalStorageStub(),
    setTimeout() { return 0; }, clearTimeout() {},
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame(cb) { cb(); return 0; },
    cancelAnimationFrame() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob: function Blob() {},
    crypto: globalThis.crypto,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

/**
 * @returns {object} the exported internals (see EXPORTS above), plus
 *   `setNow(ts)` / `resetNow()` to control `Date.now()` inside the sandbox
 *   (used for Cairo-midnight / month-boundary tests), and `__sandbox`.
 */
function loadApp() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const original = extractInlineScript(html);

  const idx = original.indexOf(BOOT_MARKER);
  if (idx < 0) throw new Error('loadApp: could not find the boot IIFE marker in the script');
  const exportLine = `\nglobalThis.__APP__ = { ${EXPORTS.map((n) => `${n}: ${n}`).join(', ')} };\n`;
  const src = original.slice(0, idx) + exportLine + original.slice(idx);

  const sandbox = buildSandbox();
  const bootResult = vm.runInContext(src, sandbox, { filename: 'index.html (inline script)' });
  if (bootResult && typeof bootResult.catch === 'function') {
    // the app's own boot IIFE (async, fire-and-forget in the real page too);
    // surface failures instead of letting them become unhandled rejections.
    bootResult.catch((e) => { throw e; });
  }

  const app = sandbox.__APP__;
  if (!app) throw new Error('loadApp: script ran but did not export __APP__');

  // Built-ins (Date, Object, ...) live on the context's real global, not on
  // the plain `sandbox` object we passed to vm.createContext — fetch the
  // context's own Date constructor to control "now" from the host side.
  const DateCtor = vm.runInContext('Date', sandbox);
  const originalDateNow = DateCtor.now;
  app.setNow = (ts) => { DateCtor.now = () => ts; };
  app.resetNow = () => { DateCtor.now = originalDateNow; };
  app.__sandbox = sandbox;
  return app;
}

module.exports = { loadApp };
