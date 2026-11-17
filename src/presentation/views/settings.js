// @ts-check
// The إعدادات (settings) tab: default rates, wallet fees, wipe password,
// wipe actions, backup export/import, account, install. Extracted from
// index.html's `renderSet` plus the settings-related branches of its click
// delegation handler (`saveRates`/`saveSet`/`pwSet`/`pwChange`/`wipeAll`/
// `doWipe`/`bkExport`/`#bkFile` change/`bkConfirm`/`logoutBtn`/`installBtn`).
import { $, $$ } from '../dom.js';
import { toast } from '../components/toast.js';
import { getItem, setItem } from '../../infrastructure/storage.js';
import { triggerDownload, readFileAsText } from '../../infrastructure/download.js';
import { NUM } from '../../domain/numbers.js';
import { dayKey, hhmm } from '../../domain/time.js';
import { esc } from '../formatters.js';
import { anyPending } from '../../application/sync.js';
import { removeDevice, setDevicePerm } from '../../application/devices.js';
import { PERMS, permsOf, withPerm } from '../../domain/perms.js';
import { readIndex, readSnapshot, savePreRestore } from '../../application/autoBackup.js';
import { writable } from '../../application/sync.js';
import { saveSettings, setWipePassword, changeWipePassword } from '../../application/settingsUseCases.js';
import { wipeAllData, wipeTransactions } from '../../application/wipe.js';
import { exportBackup, restoreBackup } from '../../application/backup.js';
import { logout } from '../../application/auth.js';
import { showTab } from '../router.js';
import { getThemeChoice, applyTheme } from '../theme.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {string} deviceId
 */
export function renderSet(store, deviceId) {
  var state = store.getState();
  var themeChoice = getThemeChoice() || 'auto';
  $$('#themeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.themeChoice === themeChoice); });
  var ae = document.activeElement;
  if (!(ae && /^set(Fee|FeeI|FeeC|FeeF|Day|Mon|VfS|VfOP|VfOC|InP|InC)$/.test(ae.id))) {
    $('#setFee').value = state.settings.feePct; $('#setFeeI').value = state.settings.feePctI;
    $('#setVfS').value = state.settings.vfSame; $('#setVfOP').value = state.settings.vfOP; $('#setVfOC').value = state.settings.vfOC;
    $('#setInP').value = state.settings.inP; $('#setInC').value = state.settings.inC;
    $('#setFeeC').value = state.settings.feePctC; $('#setFeeF').value = state.settings.feePctF;
    $('#setDay').value = state.settings.defDay; $('#setMon').value = state.settings.defMon;
  }
  $('#pwSetBox').hidden = !!state.settings.pwHash;
  $('#pwUseBox').hidden = !state.settings.pwHash;
  $('#devId').textContent = deviceId;
  $('#acctCard').hidden = state.mode !== 'cloud';
  if (state.user) $('#acctEmail').textContent = state.user.email || '';
  $('#syncInfo').textContent = state.mode === 'cloud'
    ? 'بياناتك بتتحفظ على الموبايل وبتترفع لحسابك لما النت يشتغل. أي موبايل تسجّل دخول بيه بنفس الحساب بيشوف نفس الدفتر. لو عملت عمليات بدون نت، هتترفع أوتوماتيك أول ما النت يرجع.'
    : 'الدفتر محفوظ على الموبايل ده بس، وبيشتغل من غير نت. لو غيّرت الموبايل أو مسحت بيانات المتصفح، البيانات بتضيع من غير نسخة احتياطية.';
  renderDevices(store, deviceId);
  var bk = +(getItem('dw_bk') || 0);
  $('#bkInfo').textContent = bk ? 'آخر نسخة احتياطية: ' + new Date(bk).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'long' }) : 'لسه ما أخدتش نسخة احتياطية.';
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {string} deviceId */
function renderDevices(store, deviceId) {
  var state = store.getState();
  $('#devCard').hidden = state.mode !== 'cloud';
  $('#abCard').hidden = state.mode !== 'cloud';
  if (state.mode !== 'cloud') return;
  var pend = anyPending(state.meta), off = navigator.onLine === false;
  var ls = state.lastSync || +(getItem('dw_lastsync') || 0);
  $('#syncStatus').textContent = (off ? 'مفيش نت على الموبايل ده دلوقتي. ' : '') +
    (pend ? 'فيه عمليات لسه ماترفعتش ولسه مش ظاهرة على باقي الموبايلات' + (off ? '، هتترفع أول ما النت يرجع.' : '، بيحاول يرفعها.')
      : 'كل اللي على الموبايل ده اترفع.') + (ls ? ' آخر مزامنة ' + new Date(ls).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric' }) + ' ' + hhmm(ls) + '.' : '');
  var ids = Object.keys(state.devices || {}).sort(function (a, b) { return (state.devices[b].ts || 0) - (state.devices[a].ts || 0); });
  var now = Date.now();
  var dkey = ids.map(function (id) { var d = state.devices[id]; return id + ':' + (d.ts || 0) + ':' + JSON.stringify(d.perm || {}) + ':' + (permOpen[id] ? 1 : 0); }).join('|') + '|' + deviceId;
  if ($('#devList').dataset.k === dkey) return;
  $('#devList').dataset.k = dkey;
  $('#devList').innerHTML = ids.length ? '<div class="small" style="margin-top:8px">الموبايلات المسجّلة على الحساب (' + ids.length + ')</div>' + ids.map(function (id) {
    var d = state.devices[id], me = id === deviceId, ago = now - (d.ts || 0);
    var seen = me ? 'ده الموبايل ده' : ago < 3600e3 ? 'ظهر من شوية' : 'آخر ظهور ' + new Date(d.ts || 0).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric' }) + ' ' + hhmm(d.ts || 0);
    return '<div class="row2 dev"><div><b>' + esc(d.name || 'موبايل') + '</b><div class="small num">' + esc(d.os || '') + ' · ' + seen + '</div></div>' +
      (me ? '' : '<button class="btn-ghost" data-devdel="' + esc(id) + '" style="flex:0 0 auto">شيل</button>') + '</div>' +
      (me ? '' : '<details class="xtra devperm" data-devid="' + esc(id) + '"' + (permOpen[id] ? ' open' : '') + '><summary>الصلاحيات</summary><div class="xtra-body">' +
        PERMS.map(function (pm) { var on = permsOf(d)[pm[0]]; return '<label class="check"><input type="checkbox" data-permset="' + esc(id) + '|' + pm[0] + '"' + (on ? ' checked' : '') + '> ' + pm[1] + '</label>'; }).join('') + '</div></details>');
  }).join('') : '';
}

/** which phones' permission lists are expanded (kept across re-renders) */
var permOpen = {};
document.addEventListener('toggle', function (e) {
  var el = /** @type {HTMLElement} */ (e.target);
  if (el && el.classList && el.classList.contains('devperm')) permOpen[/** @type {string} */ (el.dataset.devid)] = /** @type {HTMLDetailsElement} */ (el).open;
}, true);

/** A checkbox in a phone's permission list changed. */
export async function setPermAction(store, ctx, input) {
  var parts = input.dataset.permset.split('|'), id = parts[0], key = parts[1];
  var dev = (store.getState().devices || {})[id];
  if (!dev) return;
  await setDevicePerm(ctx.db, ctx.queue, id, withPerm(dev.perm, key, input.checked));
  toast(input.checked ? 'اتفعّلت الصلاحية' : 'اتقفلت الصلاحية على الموبايل ده');
}

var devT;
/** Two taps: first arms, second removes a phone that no longer uses the account (e.g. after reinstalling). */
export async function removeDeviceAction(ctx, btn) {
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1'; btn.textContent = 'تأكيد الشيل';
    clearTimeout(devT); devT = setTimeout(function () { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'شيل'; } }, 3500);
    return;
  }
  await removeDevice(ctx.db, ctx.queue, btn.dataset.devdel);
  toast('اتشال الموبايل من القائمة');
}

export async function saveRatesAction(store, ctx) {
  var state = store.getState();
  var g = function (id, d) { var v = $(id).value.trim(); return v === '' ? d : Math.max(0, NUM(v)); };
  await saveSettings(ctx.db, ctx.queue, state.settings, {
    vfSame: g('#setVfS', 1), vfOP: g('#setVfOP', 0.5), vfOC: g('#setVfOC', 15), inP: g('#setInP', 0.1), inC: g('#setInC', 20),
  });
  toast('تم حفظ الرسوم');
}

export async function saveSetAction(store, ctx) {
  var state = store.getState();
  var f = NUM($('#setFee').value), fi = NUM($('#setFeeI').value), fc = NUM($('#setFeeC').value), ff = NUM($('#setFeeF').value);
  await saveSettings(ctx.db, ctx.queue, state.settings, {
    feePct: f > 0 ? f : 1, feePctI: fi > 0 ? fi : 1,
    feePctC: fc >= 0 && $('#setFeeC').value !== '' ? fc : 1, feePctF: ff >= 0 && $('#setFeeF').value !== '' ? ff : 0.6,
    defDay: NUM($('#setDay').value) || 60000, defMon: NUM($('#setMon').value) || 200000,
  });
  store.patchUI({ pct: null });
  toast('تم الحفظ');
}

export async function pwSetAction(store, ctx) {
  var state = store.getState();
  var pw = $('#pwNew').value;
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var res = await setWipePassword(ctx.db, ctx.queue, ctx.sha, state.settings, pw);
  if (!res.ok) { toast(res.error === 'too-short' ? 'كلمة السر لازم 4 على الأقل' : 'حصل خطأ', true); return; }
  $('#pwNew').value = '';
  toast('تم تعيين كلمة السر');
}

export async function pwChangeAction(store, ctx) {
  var state = store.getState();
  var oldPw = $('#pwOld').value, newPw = $('#pwNew2').value;
  var res = await changeWipePassword(ctx.db, ctx.queue, ctx.sha, state.settings, oldPw, newPw);
  if (!res.ok) {
    toast(res.error === 'wrong-password' ? 'كلمة السر الحالية غلط' : 'كلمة السر الجديدة لازم 4 على الأقل', true);
    return;
  }
  $('#pwOld').value = ''; $('#pwNew2').value = '';
  toast('تم تغيير كلمة السر');
}

export async function wipeAllAction(store, ctx) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var pw = $('#pwIn').value;
  var res = await wipeAllData(ctx.db, ctx.queue, ctx.sha, state.settings, pw, state);
  if (!res.ok) { toast('كلمة السر غلط', true); return; }
  $('#pwIn').value = '';
  store.patchUI({ invKey: '' });
  toast('اتمسحت كل البيانات');
  showTab(store, 'tx');
}

var wipeT;
/**
 * Two-tap confirm for "wipe transactions only", same 5s window as index.html.
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export async function doWipeAction(store, ctx, C) {
  var state = store.getState();
  var b = $('#wipeBtn');
  if (!state.ui.wipe) {
    store.patchUI({ wipe: true });
    b.textContent = 'اضغط تاني للتأكيد: مسح كل المعاملات نهائياً';
    b.classList.add('armed');
    clearTimeout(wipeT);
    wipeT = setTimeout(function () { store.patchUI({ wipe: false }); b.textContent = 'مسح كل المعاملات'; b.classList.remove('armed'); }, 5000);
    return;
  }
  store.patchUI({ wipe: false });
  clearTimeout(wipeT);
  b.textContent = 'مسح كل المعاملات';
  b.classList.remove('armed');
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  await wipeTransactions(ctx.db, ctx.queue, ctx.clock, C, state.wallets, state.settings, state);
  toast('اتمسحت كل المعاملات');
}

export function bkExportAction(store) {
  var state = store.getState();
  var blob = new Blob([JSON.stringify({ app: 'daftar-mahfaza', v: 1, ts: Date.now(), data: exportBackup(state.raw) })], { type: 'application/json' });
  triggerDownload(blob, 'daftar-' + dayKey(Date.now()) + '.json');
  setItem('dw_bk', String(Date.now()));
  toast('اتنزّلت النسخة الاحتياطية');
  store.notify();
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {HTMLInputElement} inputEl */
export async function bkFileChangeAction(store, inputEl) {
  var f = inputEl.files && inputEl.files[0];
  if (!f) return;
  try {
    var text = await readFileAsText(f);
    var o = JSON.parse(text);
    if (!o || o.app !== 'daftar-mahfaza' || !o.data) throw new Error('not a backup file');
    store.patchUI({ pendingImport: o.data });
    $('#bkConfirm').hidden = false;
    toast('الملف سليم. اضغط تأكيد الاسترجاع');
  } catch (x) {
    store.patchUI({ pendingImport: null });
    toast('الملف ده مش نسخة احتياطية من الدفتر', true);
  }
  inputEl.value = '';
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {object} ctx @param {HTMLElement} btnEl */
export async function bkConfirmAction(store, ctx, btnEl) {
  var ui = store.getState().ui;
  if (!ui.pendingImport) return;
  var imp = ui.pendingImport;
  store.patchUI({ pendingImport: null, invKey: '' });
  btnEl.hidden = true;
  var res = await restoreBackup(ctx.db, ctx.queue, store.getState().raw, imp);
  if (res.ok) toast('اتسترجعت البيانات');
}

export async function logoutAction(store, ctx) {
  var state = store.getState();
  var res = await logout(ctx.auth, state.meta);
  if (!res.ok) toast(res.message, true);
}

export function installAction(store) {
  var inst = store.getState().ui.inst;
  if (inst) { inst.prompt(); store.patchUI({ inst: null }); }
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {'auto'|'light'|'dark'} choice
 */
export function setThemeAction(store, choice) {
  applyTheme(choice === 'auto' ? null : choice);
  store.notify();
}

/* ---------- automatic daily backups (kept in the account) ---------- */
var abIndex = null;

/** Lists the saved daily backups with a two-tap restore button each. */
export async function showAutoBackups(store, ctx) {
  var box = $('#abList');
  box.innerHTML = '<div class="small">جارٍ التحميل…</div>';
  try { abIndex = await readIndex(ctx.db); } catch (e) { box.innerHTML = '<div class="small">تعذّر تحميل القايمة. اتأكد من النت.</div>'; return; }
  var days = Object.keys(abIndex.days).sort().reverse();
  box.innerHTML = (days.length ? days.map(function (d) { return abRow(d, d.slice(6) + '/' + d.slice(4, 6) + '/' + d.slice(0, 4)); }).join('') : '<div class="small">لسه مفيش نسخ تلقائية. أول نسخة بتتاخد أول مرة تفتح التطبيق بعد التحديث.</div>') +
    (abIndex.pre ? abRow('pre', 'قبل آخر استرجاع') : '');
}
function abRow(key, label) {
  return '<div class="row2 dev"><b class="num">' + esc(label) + '</b><button class="btn-ghost" data-abrestore="' + esc(key) + '" style="flex:0 0 auto">استرجاع</button></div>';
}

var abT;
/** Two taps: first arms, second replaces ALL current data with that day's backup (current data is kept as "قبل آخر استرجاع"). */
export async function restoreAutoBackupAction(store, ctx, btn) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1'; btn.classList.add('bad'); btn.textContent = 'تأكيد: استبدال كل البيانات';
    clearTimeout(abT); abT = setTimeout(function () { if (btn.isConnected) { btn.dataset.armed = ''; btn.classList.remove('bad'); btn.textContent = 'استرجاع'; } }, 4000);
    return;
  }
  var name = btn.dataset.abrestore, n = name === 'pre' ? abIndex && abIndex.pre : abIndex && abIndex.days[name];
  if (!n) { toast('النسخة دي مش موجودة', true); return; }
  btn.disabled = true; btn.textContent = 'جارٍ الاسترجاع…';
  var flat = await readSnapshot(ctx.db, name, n);
  if (!flat) { toast('النسخة ناقصة، مينفعش تتسترجع', true); btn.disabled = false; return; }
  await savePreRestore(ctx.db, ctx.queue, ctx.clock, state.raw);
  var res = await restoreBackup(ctx.db, ctx.queue, state.raw, flat);
  if (res.ok) { toast('اتسترجعت النسخة'); store.patchUI({ invKey: '' }); showAutoBackups(store, ctx); }
}
