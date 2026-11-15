// @ts-check
// Replaces index.html's module-level `S`/`UI` globals and its `changed()`/
// `raf`/`renderAll()` debounced-notify mechanism with one small reactive
// store. Implements the minimal `Store` contract `application/sync.js`
// expects (`getState()`/`patch()`), plus `patchUI()` and `subscribe()` for
// presentation's own use. main.js subscribes one function that computes the
// ledger once and fans out to every view's render — the same shape as the
// original `renderAll()`.
import { DEFAULTS } from '../domain/money.js';

/** A fresh `ui`-shaped state slice (view/session-local, never synced). */
function freshUiState() {
  return {
    dest: 'vf', costManual: false, flt: 'all', kind: 'out', sel: null, manualSel: false, feeManual: false,
    pct: null, showAll: false, tab: 'tx', setupDone: false, invKey: '', sm: 'one', sp: {}, col: null,
    spKey: '', svc: 'vf', hd: null, hflt: 'all', pendKey: '', delId: null, wipe: false, inst: null,
    reloaded: false, pendingImport: null,
  };
}

export function createStore() {
  var state = {
    inbox: {}, meta: {}, raw: {}, seen: {}, synced: true, wallets: [],
    settings: Object.assign({}, DEFAULTS), ledger: {}, closes: [], ready: {},
    mode: 'local', waited: false, err: undefined, user: null,
    ui: freshUiState(),
  };
  var subs = [];
  var raf = 0;

  function notify() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      subs.slice().forEach(function (f) { f(state); });
    });
  }

  return {
    /** @returns {typeof state} */
    getState: function () { return state; },
    /** Merges a top-level patch (sync-related fields) into state. */
    patch: function (p) { state = Object.assign({}, state, p); notify(); },
    /** Merges a patch into `state.ui` only. */
    patchUI: function (p) { state = Object.assign({}, state, { ui: Object.assign({}, state.ui, p) }); notify(); },
    /** Resets the sync-related slice (logout/account switch); keeps `ui` as-is. */
    resetSync: function (freshSyncState) {
      state = Object.assign({}, freshSyncState(), { ui: state.ui });
      notify();
    },
    subscribe: function (fn) { subs.push(fn); return function () { subs.splice(subs.indexOf(fn), 1); }; },
    notify: notify,
  };
}
