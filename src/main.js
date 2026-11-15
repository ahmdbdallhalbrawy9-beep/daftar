// @ts-check
// Composition root: picks the local or Firestore adapter, builds every use
// case with it, creates the store, mounts the views, wires the single
// delegated click handler + scoped listeners, and runs the boot sequence.
// This is the only module allowed to import from every layer. Extracted from
// index.html's bottom boot IIFE, `start`/`stop`/`initCloud`, and the
// `document.addEventListener('click', ...)` dispatcher.
import { $ } from './presentation/dom.js';
import { createStore } from './presentation/store.js';
import { showTab } from './presentation/router.js';
import { toast } from './presentation/components/toast.js';
import { renderSyncPill } from './presentation/components/pill.js';
import { pendActionFromCard, renderPend, updatePendWarn } from './presentation/components/pendingCard.js';
import { renderTx, autoSplitAction, saveAction, doSetupAction } from './presentation/views/transaction.js';
import { renderWallets, openWalletSheet } from './presentation/views/wallets.js';
import {
  renderGuide, dismissGuideAction, renderOpen, openCashSheet, updateDiffs,
  renderDay, doCloseAction, voidTxAction,
} from './presentation/views/today.js';
import { openSettle, openCustLimit } from './presentation/views/customers.js';
import { renderHist } from './presentation/views/history.js';
import {
  renderSet, saveRatesAction, saveSetAction, pwSetAction, pwChangeAction,
  wipeAllAction, doWipeAction, bkExportAction, bkFileChangeAction, bkConfirmAction,
  logoutAction, installAction, setThemeAction,
} from './presentation/views/settings.js';
import { showAuth, authGoAction, authResetAction } from './presentation/views/login.js';

import { compute } from './domain/compute.js';
import { dayKey, shiftDay } from './domain/time.js';
import { liveTxs } from './domain/ledger.js';

import { freshSyncState, startSync, stopSync, writable } from './application/sync.js';
import { scanForSms } from './application/smsImport.js';

import { getItem, setItem } from './infrastructure/storage.js';
import { getDeviceId } from './infrastructure/deviceId.js';
import { sha } from './infrastructure/crypto.js';
import { createWriteQueue } from './infrastructure/writeQueue.js';
import { makeLocalDB } from './infrastructure/localDb.js';
import { makeFsDB, loadScripts, FB } from './infrastructure/firestoreDb.js';
import { initFirebase, makeFirebaseAuth } from './infrastructure/firebaseAuth.js';
import { getSmsPlugin } from './infrastructure/smsPlugin.js';
import { registerServiceWorker } from './infrastructure/serviceWorker.js';
import { registerInstallPrompt } from './infrastructure/install.js';
import { initTheme } from './presentation/theme.js';

var store = createStore();
var deviceId = getDeviceId();
var clock = { now: function () { return Date.now(); } };
var queue = createWriteQueue(function (e) { toast('تعذّر الحفظ: ' + ((e && e.message) || (e && e.code) || 'خطأ'), true); });
var db = null;
var authPort = null;

function getCtx() {
  return { db: db, queue: queue, clock: clock, deviceId: deviceId, auth: authPort, sha: sha, getCompute: currentCompute };
}

function currentCompute() {
  var state = store.getState();
  return compute({ ledger: state.ledger, wallets: state.wallets, settings: state.settings, now: Date.now() });
}

function renderAll() {
  var state = store.getState();
  var C = currentCompute();
  renderSyncPill($('#syncPill'), state);
  renderSyncPill($('#syncPillWide'), state);
  $('#dateLine').textContent = new Date().toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' });
  renderTx(store, C);
  renderWallets(store, C);
  renderDay(store, C);
  renderSet(store, deviceId);
  renderOpen(store, C);
  renderHist(store, C);
  renderPend(store, C, !!getSmsPlugin());
  renderGuide(store);
}

async function scanSmsAction(manual) {
  var smsPort = getSmsPlugin();
  var state = store.getState();
  if (!smsPort || !writable(state)) return;
  try {
    var last = +(getItem('dw_scan') || 0);
    var res = await scanForSms(smsPort, db, queue, clock, deviceId, state.inbox, liveTxs(state.ledger), last, manual);
    if (!res.ok) {
      if (manual && res.error === 'permission-denied') toast('لازم تسمح بقراءة الرسائل', true);
      return;
    }
    setItem('dw_scan', String(res.lastScanTs || clock.now()));
    if (manual) toast(res.added ? 'لقيت ' + res.added + ' رسالة جديدة' : 'مفيش رسائل جديدة');
  } catch (e) {
    if (manual) toast('تعذّر قراءة الرسائل: ' + ((e && e.message) || e), true);
  }
}

/* ---------- the single delegated click handler ---------- */
document.addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t) return;
  var state = store.getState();
  var C = currentCompute();

  if (t.dataset.t) return showTab(store, t.dataset.t);
  if (t.dataset.oc) return openCashSheet(store, getCtx(), C);
  if (t.id === 'guideOk') return dismissGuideAction();
  if (t.dataset.pok || t.dataset.pig) {
    var cd0 = t.closest('[data-pid]');
    if (cd0) return pendActionFromCard(store, getCtx(), cd0, !!t.dataset.pok, C);
    return;
  }
  if (t.id === 'smsScan' || t.id === 'smsScan2') return scanSmsAction(true);
  if (t.dataset.svc) {
    store.patchUI({
      svc: t.dataset.svc, kind: t.dataset.svc === 'insta' ? 'iout' : 'out', sm: 'one',
      sp: {}, spKey: '', col: null, sel: null, manualSel: false, feeManual: false,
      costManual: false, pct: null, showAll: false,
    });
    return;
  }
  if (t.dataset.hd) { store.patchUI({ hd: t.dataset.hd }); return; }
  if (t.dataset.hf) { store.patchUI({ hflt: t.dataset.hf }); return; }
  if (t.id === 'hPrev') { store.patchUI({ hd: shiftDay(state.ui.hd || dayKey(Date.now()), -1) }); return; }
  if (t.id === 'hNext') { store.patchUI({ hd: shiftDay(state.ui.hd || dayKey(Date.now()), 1) }); return; }
  if (t.dataset.sm) { store.patchUI({ sm: t.dataset.sm, sp: {}, spKey: '', col: null }); return; }
  if (t.id === 'spAuto') return autoSplitAction(store, C);
  if (t.dataset.k) { store.patchUI({ kind: t.dataset.k, sp: {}, spKey: '', col: null, manualSel: false, feeManual: false, costManual: false, pct: null }); return; }
  if (t.dataset.d) { store.patchUI({ dest: t.dataset.d, costManual: false }); return; }
  if (t.dataset.f) { store.patchUI({ flt: t.dataset.f }); return; }
  if (t.dataset.p) { store.patchUI({ pct: parseFloat(t.dataset.p), feeManual: false }); return; }
  if (t.dataset.w) { store.patchUI({ sel: t.dataset.w, manualSel: true }); return; }
  if (t.dataset.more) { store.patchUI({ showAll: t.dataset.more === '1' }); return; }
  if (t.dataset.edit) return openWalletSheet(store, getCtx(), C, t.dataset.edit);
  if (t.dataset.cs) return openSettle(store, getCtx(), C, t.dataset.cs);
  if (t.dataset.cl) return openCustLimit(store, getCtx(), C, t.dataset.cl);
  if (t.dataset.del) return voidTxAction(store, getCtx(), t.dataset.del);
  if (t.id === 'doSetup') return doSetupAction(store, getCtx());
  if (t.id === 'save') return saveAction(store, getCtx(), C);
  if (t.id === 'addWallet') return openWalletSheet(store, getCtx(), C, null);
  if (t.id === 'closeBtn') return doCloseAction(store, getCtx(), C);
  if (t.id === 'wipeBtn') return doWipeAction(store, getCtx(), C);
  if (t.id === 'bkExport') return bkExportAction(store);
  if (t.id === 'bkConfirm') return bkConfirmAction(store, getCtx(), t);
  if (t.id === 'logoutBtn') return logoutAction(store, getCtx());
  if (t.id === 'loginBtn') return authGoAction(getCtx(), 'login');
  if (t.id === 'signupBtn') return authGoAction(getCtx(), 'signup');
  if (t.id === 'resetBtn') return authResetAction(getCtx());
  if (t.id === 'installBtn') return installAction(store);
  if (t.dataset.themeChoice) return setThemeAction(store, t.dataset.themeChoice);
  if (t.id === 'saveRates') return saveRatesAction(store, getCtx());
  if (t.id === 'pwSet') return pwSetAction(store, getCtx());
  if (t.id === 'pwChange') return pwChangeAction(store, getCtx());
  if (t.id === 'wipeAll') return wipeAllAction(store, getCtx());
  if (t.id === 'saveSet') return saveSetAction(store, getCtx());
});

/* ---------- scoped listeners ---------- */
$('#amt').addEventListener('input', function () { store.notify(); });
$('#hDate').addEventListener('change', function (e) {
  var v = e.target.value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) store.patchUI({ hd: v.replace(/-/g, '') });
});
$('#splitBox').addEventListener('input', function (e) {
  var i = e.target.dataset && e.target.dataset.spin;
  if (i) { var sp = Object.assign({}, store.getState().ui.sp); sp[i] = e.target.value; store.patchUI({ sp: sp }); }
});
$('#splitBox').addEventListener('change', function (e) {
  if (e.target.id === 'spCol') {
    var sp = Object.assign({}, store.getState().ui.sp);
    delete sp[e.target.value];
    store.patchUI({ sp: sp, col: e.target.value, spKey: '' });
  }
});
['#dlOn', '#dlName', '#dlLim'].forEach(function (q) { $(q).addEventListener('input', function () { store.notify(); }); $(q).addEventListener('change', function () { store.notify(); }); });
$('#pendBox').addEventListener('change', function (e) {
  if (e.target.matches && e.target.matches('[data-pw],[data-pdl]')) updatePendWarn(store, currentCompute(), e.target.closest('[data-pid]'));
});
$('#fee').addEventListener('input', function () { store.patchUI({ feeManual: true }); });
$('#cost').addEventListener('input', function () { store.patchUI({ costManual: true }); });
$('#invCash').addEventListener('input', function () { updateDiffs(currentCompute()); });
$('#invRows').addEventListener('input', function () { updateDiffs(currentCompute()); });
$('#bkFile').addEventListener('change', function (e) { bkFileChangeAction(store, e.target); });

setInterval(function () { if (!document.hidden) { store.notify(); scanSmsAction(false); } }, 60000);
document.addEventListener('visibilitychange', function () { if (!document.hidden) { store.notify(); scanSmsAction(false); } });
setTimeout(function () { scanSmsAction(false); }, 4000);

/* ---------- cloud bootstrap ---------- */
function initCloud() {
  var fs = initFirebase(window.FIREBASE_CONFIG);
  authPort = makeFirebaseAuth();
  authPort.onChange(function (u) {
    if (u) {
      var cur = store.getState().user;
      if (cur && cur.uid === u.uid) return;
      $('#auth').hidden = true;
      stopSync();
      store.resetSync(freshSyncState);
      store.patch({ user: u, mode: 'cloud' });
      db = makeFsDB(fs, u.uid, function (e) { toast('تعذّر الحفظ في الحساب: ' + ((e && e.code) || 'خطأ'), true); });
      store.patch({ synced: getItem('dw_sync_' + u.uid) === '1' });
      startSync(db, store, { markDeviceSynced: function (uid) { setItem('dw_sync_' + uid, '1'); } });
    } else {
      stopSync();
      db = null;
      store.resetSync(freshSyncState);
      store.patch({ user: null, mode: 'cloud', synced: false });
      showAuth('');
    }
  });
}

/* ---------- boot ---------- */
store.subscribe(renderAll);
renderAll();
initTheme();
(async function () {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  registerServiceWorker();
  registerInstallPrompt(
    function (promptEvent) { store.patchUI({ inst: promptEvent }); $('#installCard').hidden = false; },
    function () { $('#installCard').hidden = true; },
  );
  window.addEventListener('online', function () { store.notify(); });
  window.addEventListener('offline', function () { store.notify(); });

  var cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey) {
    showAuth('جارٍ التحميل…');
    loadScripts([FB + 'firebase-app-compat.js', FB + 'firebase-auth-compat.js', FB + 'firebase-firestore-compat.js'])
      .then(initCloud)
      .catch(function () { showAuth('التطبيق محتاج نت أول مرة عشان يتحمّل. اتصل بالنت وافتحه تاني.', true); });
  } else {
    store.patch({ mode: 'local', synced: true });
    db = makeLocalDB();
    startSync(db, store);
  }
})();
