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
import { openSettle, openCustLimit, openCustEdit } from './presentation/views/customers.js';
import { renderHist, openNoteSheet } from './presentation/views/history.js';
import {
  renderSet, saveRatesAction, saveSetAction, pwSetAction, pwChangeAction,
  wipeAllAction, doWipeAction, bkExportAction, bkFileChangeAction, bkConfirmAction,
  logoutAction, installAction, setThemeAction, removeDeviceAction, setPermAction,
  showAutoBackups, restoreAutoBackupAction,
} from './presentation/views/settings.js';
import { showAuth, authGoAction, authResetAction } from './presentation/views/login.js';

import { compute } from './domain/compute.js';
import { dayKey, shiftDay } from './domain/time.js';
import { liveTxs } from './domain/ledger.js';
import { PERMS, permsOf } from './domain/perms.js';

import { freshSyncState, startSync, stopSync, writable, anyPending } from './application/sync.js';
import { scanForSms } from './application/smsImport.js';
import { registerDevice } from './application/devices.js';
import { runAutoBackup } from './application/autoBackup.js';
import { describeDevice } from './infrastructure/deviceInfo.js';

import { getItem, setItem, removeItem } from './infrastructure/storage.js';
import { getNative } from './infrastructure/nativeBridge.js';
import { limitNotifications, pruneSent, noteId } from './domain/limitNotify.js';
import { brandTip, smsQueueNote } from './domain/bgHints.js';
import { getDeviceId } from './infrastructure/deviceId.js';
import { sha } from './infrastructure/crypto.js';
import { createWriteQueue } from './infrastructure/writeQueue.js';
import { makeLocalDB } from './infrastructure/localDb.js';
import { makeFsDB, makeNetworkNudger, loadScripts, FB } from './infrastructure/firestoreDb.js';
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
var nudge = function () { /* set once Firebase is up */ };
var devInfo = null, devBusy = false, abBusy = false;

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
  applyPerms();
  maybeRegisterDevice(state);
  maybeAutoBackup(state, false);
  maybeLimitNotify(state, C);
}

/** What this phone may do (the owner sets it per phone in settings). Local mode and unregistered phones: everything. */
function myPerms() {
  var s = store.getState();
  return permsOf(s.mode === 'cloud' ? (s.devices || {})[deviceId] : null);
}

// switched-off features are hidden with CSS (`np-<perm>` classes on <html>); the click handler re-checks every action
function applyPerms() {
  var p = myPerms(), cl = document.documentElement.classList;
  PERMS.forEach(function (x) { cl.toggle('np-' + x[0], !p[x[0]]); });
  var tab = store.getState().ui.tab;
  if ((tab === 'set' && !p.settings) || (tab === 'credit' && !p.credit)) showTab(store, 'tx');
}

// one automatic backup a day, taken by the first phone that opens the app with fresh server data
async function maybeAutoBackup(state, force) {
  if (state.mode !== 'cloud' || !db || !writable(state) || abBusy) return;
  var fresh = ['ledger', 'wallets', 'settings', 'closes'].every(function (c) { return state.meta[c] && !state.meta[c].fc; });
  if (!fresh) return;
  var day = dayKey(Date.now());
  if (!force && getItem('dw_autobk') === day) return;
  abBusy = true;
  try { setItem('dw_autobk', day); await runAutoBackup(db, queue, clock, state.raw, force); }
  catch (e) { setItem('dw_autobk', ''); }
  finally { setTimeout(function () { abBusy = false; }, 20000); }
}

/* ---------- background service + limit notifications (Android APK only) ---------- */
var native = getNative();
var bgOpts = { ka: getItem('dw_ka') === '1', ln: getItem('dw_ln') !== '0' };

// "limit nearly used up / used up" phone notifications, once per wallet+limit per day (or month).
// The first run only records what is already true, so turning this on never fires a burst.
function maybeLimitNotify(state, C) {
  if (!native || !bgOpts.ln || state.mode !== 'cloud' || !writable(state)) return;
  var fresh = ['ledger', 'wallets', 'settings', 'closes'].every(function (c) { return state.meta[c] && !state.meta[c].fc; });
  if (!fresh) return;
  var dk = dayKey(Date.now()), raw = getItem('dw_lnsent'), first = raw === null, sent = {};
  try { sent = pruneSent(raw ? JSON.parse(raw) : {}, dk); } catch (e) { sent = {}; }
  var r = limitNotifications(state.wallets, C.W, state.settings, dk, sent);
  var next = Object.assign({}, sent);
  r.keys.forEach(function (k) { next[k] = 1; });
  setItem('dw_lnsent', JSON.stringify(next));
  if (first) return;
  r.notes.forEach(function (n) {
    Promise.resolve(native.notify({ id: noteId(n.id), title: n.title, body: n.body })).catch(function () { /* no permission: the banner in the app still shows it */ });
  });
}

async function refreshBg() {
  var card = $('#bgCard');
  if (!native) { card.hidden = true; return; }
  card.hidden = false;
  $('#kaOn').checked = bgOpts.ka; $('#lnOn').checked = bgOpts.ln;
  var st = null;
  try { st = await native.status(); } catch (e) { /* old plugin */ }
  var msgs = [];
  var up = $('#smsUp');
  if (st && st.lastUpload !== undefined) {
    up.hidden = false;
    var line;
    if (!st.smsOk) line = 'رفع الرسايل التلقائي: مقفول. دوس "اسمح باستقبال الرسايل".';
    else if (!st.hasAuth) line = 'رفع الرسايل التلقائي: افتح التطبيق وانت داخل بحسابك مرة.';
    else if (st.uploadErr === 'login-expired') line = 'رفع الرسايل وقف: الحساب اتغيّر. اعمل خروج وادخل تاني.';
    else if (st.lastUpload) line = 'آخر رفع للرسايل: ' + new Date(st.lastUpload).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }) + (st.uploadErr ? ' (آخر محاولة فشلت: ' + st.uploadErr + ')' : '');
    else line = 'رفع الرسايل التلقائي: لسه ما رفعش حاجة' + (st.uploadErr ? ' (' + st.uploadErr + ')' : '') + '.';
    var qn = smsQueueNote(st, function (ms) { return new Date(ms).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false }); });
    up.textContent = qn ? line + ' ' + qn : line;
    $('#smsPerm').hidden = !!st.smsOk;
    $('#smsNow').hidden = !(st.smsOk && st.hasAuth);
  }
  if (st && !st.notif) msgs.push('الإشعارات مقفولة للتطبيق. دوس "اسمح بالإشعارات".');
  // the SMS upload needs this too (not only the keep-alive service): without it Android holds the upload back
  if (st && !st.battery) msgs.push('عشان رفع الرسايل والمزامنة يشتغلوا وهو مقفول، دوس "فك قيود البطارية" واختار السماح.');
  var tip = st ? brandTip(st.maker) : '';
  if (tip) msgs.push(tip);
  if (st && !msgs.length) msgs.push('تمام، كله شغّال.');
  $('#bgInfo').textContent = msgs.join(' ');
  $('#bgNotif').hidden = !st || st.notif;
  $('#bgBat').hidden = !st || st.battery;
}

async function applyBg(ask) {
  if (!native) return;
  try {
    if (ask && (bgOpts.ka || bgOpts.ln)) await native.requestNotifPermission();
    if (ask && native.requestSmsPermissions) await native.requestSmsPermissions();
    await native.setKeepAlive({ on: bgOpts.ka });
  } catch (e) { /* ignore */ }
  refreshBg();
}

// keep this phone listed in settings → المزامنة والموبايلات (cloud mode only, once synced)
async function maybeRegisterDevice(state) {
  if (state.mode !== 'cloud' || !db || !writable(state) || devBusy) return;
  devBusy = true;
  try {
    if (!devInfo) devInfo = await describeDevice();
    await registerDevice(db, queue, clock, deviceId, state.devices, devInfo);
  } catch (e) { /* ignore */ } finally { setTimeout(function () { devBusy = false; }, 30000); }
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

  var perms = myPerms();
  if (t.dataset.t === 'set' && !perms.settings) return;
  if (t.dataset.t === 'credit' && !perms.credit) return;
  if (t.dataset.tn && !perms.void) { toast('مفيش صلاحية لتعديل العمليات على الموبايل ده', true); return; }
  if (t.dataset.del && !perms.void) { toast('مفيش صلاحية لإلغاء العمليات على الموبايل ده', true); return; }
  if ((t.dataset.edit || t.id === 'addWallet') && !perms.wallets) { toast('مفيش صلاحية لتعديل المحافظ على الموبايل ده', true); return; }
  if (t.id === 'closeBtn' && !perms.close) return;
  if ((t.dataset.cs || t.dataset.cl || t.dataset.ce) && !perms.credit) return;
  if (t.dataset.t) return showTab(store, t.dataset.t);
  if (t.id === 'abShow') return showAutoBackups(store, getCtx());
  if (t.dataset.abrestore) return restoreAutoBackupAction(store, getCtx(), t);
  if (t.id === 'syncNow') { nudge(); toast('بيحاول يزامن…'); return; }
  if (t.dataset.devdel) return removeDeviceAction(getCtx(), t);
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
      costManual: false, pct: null, showAll: false, pay: false,
    });
    return;
  }
  if (t.dataset.hd) { store.patchUI({ hd: t.dataset.hd }); return; }
  if (t.dataset.hf) { store.patchUI({ hflt: t.dataset.hf }); return; }
  if (t.id === 'hPrev') { store.patchUI({ hd: shiftDay(state.ui.hd || dayKey(Date.now()), -1) }); return; }
  if (t.id === 'hNext') { store.patchUI({ hd: shiftDay(state.ui.hd || dayKey(Date.now()), 1) }); return; }
  if (t.dataset.sm) { store.patchUI({ sm: t.dataset.sm, sp: {}, spKey: '', col: null }); return; }
  if (t.id === 'spAuto') return autoSplitAction(store, C);
  if (t.dataset.k) { store.patchUI({ kind: t.dataset.k, pay: !!t.dataset.pay, sm: t.dataset.pay ? 'one' : state.ui.sm, sp: {}, spKey: '', col: null, manualSel: false, feeManual: false, costManual: false, pct: null }); return; }
  if (t.dataset.d) { store.patchUI({ dest: t.dataset.d, costManual: false }); return; }
  if (t.dataset.f) { store.patchUI({ flt: t.dataset.f }); return; }
  if (t.dataset.p) { store.patchUI({ pct: parseFloat(t.dataset.p), feeManual: false }); return; }
  if (t.dataset.w) { store.patchUI({ sel: t.dataset.w, manualSel: true }); return; }
  if (t.dataset.more) { store.patchUI({ showAll: t.dataset.more === '1' }); return; }
  if (t.dataset.edit) return openWalletSheet(store, getCtx(), C, t.dataset.edit);
  if (t.dataset.cs) return openSettle(store, getCtx(), C, t.dataset.cs);
  if (t.dataset.cl) return openCustLimit(store, getCtx(), C, t.dataset.cl);
  if (t.dataset.ce) return openCustEdit(store, getCtx(), C, t.dataset.ce);
  if (t.dataset.tn) return openNoteSheet(store, getCtx(), t.dataset.tn);
  if (t.dataset.ws) { setItem('dw_wsort', t.dataset.ws); store.patchUI({ wsort: t.dataset.ws }); return; }
  if (t.dataset.hm) { store.patchUI({ hmode: t.dataset.hm }); return; }
  if (t.dataset.rm) { store.patchUI({ rmode: t.dataset.rm, roff: 0 }); return; }
  if (t.dataset.ro) { store.patchUI({ roff: Math.max(0, (state.ui.roff || 0) + parseInt(t.dataset.ro, 10)) }); return; }
  if (t.dataset.del) return voidTxAction(store, getCtx(), t.dataset.del);
  if (t.id === 'doSetup') return doSetupAction(store, getCtx());
  if (t.id === 'save') return saveAction(store, getCtx(), C);
  if (t.id === 'addWallet') return openWalletSheet(store, getCtx(), C, null);
  if (t.id === 'closeBtn') { doCloseAction(store, getCtx(), C); setTimeout(function () { maybeAutoBackup(store.getState(), true); }, 4000); return; }
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
store.patchUI({ wsort: getItem('dw_wsort') === 'manual' ? 'manual' : 'bal' });
$('#custQ').addEventListener('input', function (e) { store.patchUI({ custQ: /** @type {HTMLInputElement} */ (e.target).value }); });
$('#hQ').addEventListener('input', function (e) { store.patchUI({ hq: /** @type {HTMLInputElement} */ (e.target).value }); });
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
document.addEventListener('change', function (e) {
  var el = /** @type {HTMLInputElement} */ (e.target);
  if (el && el.dataset && el.dataset.permset) setPermAction(store, getCtx(), el);
});
$('#kaOn').addEventListener('change', function (e) { bgOpts.ka = /** @type {HTMLInputElement} */ (e.target).checked; setItem('dw_ka', bgOpts.ka ? '1' : '0'); applyBg(false); });
$('#lnOn').addEventListener('change', function (e) {
  bgOpts.ln = /** @type {HTMLInputElement} */ (e.target).checked; setItem('dw_ln', bgOpts.ln ? '1' : '0');
  removeItem('dw_lnsent'); // the next check only records today's state, so switching on never fires a burst
  applyBg(bgOpts.ln);
});
$('#bgNotif').addEventListener('click', async function () { try { await native.requestNotifPermission(); } catch (e) { /* ignore */ } refreshBg(); });
$('#bgBat').addEventListener('click', async function () { try { await native.requestBatteryExemption(); } catch (e) { /* ignore */ } setTimeout(refreshBg, 1500); });
$('#bkFile').addEventListener('change', function (e) { bkFileChangeAction(store, e.target); });

setInterval(function () { if (!document.hidden) { store.notify(); scanSmsAction(false); if (anyPending(store.getState().meta)) nudge(); } }, 60000);
document.addEventListener('visibilitychange', function () { if (!document.hidden) { store.notify(); scanSmsAction(false); nudge(); } });
setTimeout(function () { scanSmsAction(false); }, 4000);

/* ---------- background SMS upload: give the native side this phone's login (APK only) ---------- */
// The native uploader signs in on its own with the refresh token, so SMS reach the account while the app is closed.
function handOverAuth(u) {
  if (!native) return;
  try {
    if (!u) { if (native.clearSyncAuth) native.clearSyncAuth(); return; }
    var cfg = window.FIREBASE_CONFIG || {};
    if (!native.setSyncAuth || !u.refreshToken) return;
    Promise.resolve(native.setSyncAuth({ apiKey: cfg.apiKey, projectId: cfg.projectId, uid: u.uid, deviceId: deviceId, refreshToken: u.refreshToken }))
      .then(refreshBg).catch(function () { /* old plugin */ });
  } catch (e) { /* ignore */ }
}
$('#smsPerm').addEventListener('click', async function () { try { await native.requestSmsPermissions(); } catch (e) { /* ignore */ } refreshBg(); });
$('#smsNow').addEventListener('click', async function () { try { await native.uploadNow(); toast('جاري الرفع…'); } catch (e) { /* ignore */ } setTimeout(refreshBg, 6000); });

/* ---------- cloud bootstrap ---------- */
function initCloud() {
  var fs = initFirebase(window.FIREBASE_CONFIG);
  nudge = makeNetworkNudger(fs);
  authPort = makeFirebaseAuth();
  authPort.onChange(function (u) {
    handOverAuth(u);
    if (u) {
      var cur = store.getState().user;
      if (cur && cur.uid === u.uid) return;
      $('#auth').hidden = true;
      stopSync();
      store.resetSync(freshSyncState);
      store.patch({ user: u, mode: 'cloud' });
      db = makeFsDB(fs, u.uid, function (e) { toast('تعذّر الحفظ في الحساب: ' + ((e && e.code) || 'خطأ'), true); });
      store.patch({ synced: getItem('dw_sync_' + u.uid) === '1' });
      startSync(db, store, { markDeviceSynced: function (uid) { setItem('dw_sync_' + uid, '1'); }, onSynced: function (ts) { setItem('dw_lastsync', String(ts)); } });
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
  applyBg(!getItem('dw_bgasked'));
  setItem('dw_bgasked', '1');
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshBg(); });
  registerInstallPrompt(
    function (promptEvent) { store.patchUI({ inst: promptEvent }); $('#installCard').hidden = false; },
    function () { $('#installCard').hidden = true; },
  );
  window.addEventListener('online', function () { store.notify(); nudge(); });
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
