// @ts-check
// Subscribes to the four shared collections and keeps a store in sync, the
// same shape index.html's `start()`/`stop()` build by hand against `S`.
// `store` is the minimal contract the real presentation/store.js (phase 5)
// implements: read the current state, and merge a patch into it (notifying
// subscribers). That is the only thing this module needs from "the store" —
// it never imports presentation.
import { DEFAULTS } from '../domain/money.js';

/**
 * @typedef {object} Store
 * @property {() => any} getState
 * @property {(patch: object) => void} patch
 */

/** A fresh sync-state-shaped slice, for logout/account-switch. */
export function freshSyncState() {
  return {
    inbox: {}, wallets: [], settings: Object.assign({}, DEFAULTS), ledger: {}, closes: [],
    ready: {}, meta: {}, raw: {}, seen: {}, synced: false, waited: false, devices: {}, lastSync: 0,
  };
}

/** @param {{ready: {ledger?:boolean,wallets?:boolean,settings?:boolean}, synced?:boolean}} syncState */
export function writable(syncState) {
  return !!(syncState.ready.ledger && syncState.ready.wallets && syncState.ready.settings && syncState.synced);
}

/** @param {Record<string, {hp?:boolean}>} meta */
export function anyPending(meta) {
  return Object.keys(meta).some(function (k) { return meta[k].hp; });
}

var currentStop = null;

/**
 * @param {import('./ports.js').DbPort} db
 * @param {Store} store
 * @param {{markDeviceSynced?: (uid: string) => void, onSynced?: (ts: number) => void}} [deps] `markDeviceSynced` persists the
 *   "already synced once" flag (infrastructure/storage.js) — kept out of this module directly.
 * @returns {() => void} a function that stops this sync (also returned so the
 *   caller doesn't have to call the separate `stopSync()`, though it may).
 */
export function startSync(db, store, deps) {
  stopSync();
  deps = deps || {};
  var unsubs = [];
  var fail = function (e) { store.patch({ err: e && e.code, waited: true }); };
  var mark = function (name, apply) {
    return function (snap) {
      var state = store.getState();
      var patch = {};
      apply(patch, snap);
      patch.ready = Object.assign({}, state.ready); patch.ready[name] = true;
      var md = snap.metadata || {};
      patch.meta = Object.assign({}, state.meta); patch.meta[name] = { fc: !!md.fromCache, hp: !!md.hasPendingWrites };
      // a fresh server snapshot with nothing waiting to upload = this device is fully in sync right now
      if (state.mode === 'cloud' && !md.fromCache && !md.hasPendingWrites) {
        patch.lastSync = Date.now();
        if (deps.onSynced) deps.onSynced(patch.lastSync);
      }
      patch.raw = Object.assign({}, state.raw); patch.raw[name] = {};
      snap.docs.forEach(function (d) { patch.raw[name][d.id] = d.data(); });
      if (state.mode === 'cloud' && !md.fromCache) {
        patch.seen = Object.assign({}, state.seen); patch.seen[name] = 1;
        if (patch.seen.wallets && patch.seen.ledger && patch.seen.settings && patch.seen.closes && !state.synced) {
          patch.synced = true;
          if (deps.markDeviceSynced && state.user) deps.markDeviceSynced(state.user.uid);
        }
      }
      store.patch(patch);
    };
  };
  unsubs.push(db.collection('wallets').onSnapshot(mark('wallets', function (patch, snap) {
    patch.wallets = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }), fail));
  unsubs.push(db.collection('ledger').onSnapshot(mark('ledger', function (patch, snap) {
    var m = {};
    snap.docs.forEach(function (d) { m[d.id] = (d.data() || {}).txs || []; });
    patch.ledger = m;
  }), fail));
  unsubs.push(db.collection('settings').onSnapshot(mark('settings', function (patch, snap) {
    var d = snap.docs.filter(function (x) { return x.id === 'main'; })[0];
    patch.settings = Object.assign({}, DEFAULTS, d ? d.data() : {});
    var ib = {};
    snap.docs.forEach(function (x) { if (x.id.indexOf('inbox_') === 0) ib[x.id.slice(6)] = x.data() || {}; });
    patch.inbox = ib;
    var dv = {};
    snap.docs.forEach(function (x) { if (x.id.indexOf('dev_') === 0) dv[x.id.slice(4)] = x.data() || {}; });
    patch.devices = dv;
  }), fail));
  unsubs.push(db.collection('closes').onSnapshot(mark('closes', function (patch, snap) {
    patch.closes = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  }), fail));
  var timeoutId = setTimeout(function () {
    if (!writable(store.getState())) store.patch({ waited: true });
  }, 10000);
  currentStop = function () {
    unsubs.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
    clearTimeout(timeoutId);
    currentStop = null;
  };
  return currentStop;
}

export function stopSync() {
  if (currentStop) currentStop();
}
