// @ts-check
// The المحافظ (wallets) tab: grid + the add/edit wallet sheet. Extracted from
// index.html's `renderWallets`/`openSheet` (wallet-edit half)/`saveWallet`.
import { walletTotals, walletInUse } from '../../domain/wallets.js';
import { walletRoom } from '../../domain/limits.js';
import { balanceDrift } from '../../domain/drift.js';
import { liveTxs } from '../../domain/ledger.js';
import { allInboxItems } from '../../application/smsImport.js';
import { hhmm } from '../../domain/time.js';
import { $ } from '../dom.js';
import { fmt, fm2, esc } from '../formatters.js';
import { limBar } from '../components/bars.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { svcHTML } from './transaction.js';
import { NUM } from '../../domain/numbers.js';
import { createOrUpdateWallet, deleteWallet } from '../../application/wallets.js';
import { writable } from '../../application/sync.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderWallets(store, C) {
  var state = store.getState();
  var g = $('#wgrid');
  var isv = state.ui.svc === 'insta', list = state.wallets.filter(function (w) { return (w.type === 'insta') === isv; }), tot = 0;
  $('#svcW').innerHTML = svcHTML(state);
  list.forEach(function (w) { if (w.active !== false) tot += C.W[w.id].bal; });
  var bt = walletTotals(state.wallets, C);
  $('#wTotals').innerHTML = state.wallets.length ? '<div class="tile"><span>فودافون كاش</span><b>' + fmt(bt.vf) + '</b></div><div class="tile"><span>إنستاباي</span><b>' + fmt(bt.insta) + '</b></div><div class="tile hero" style="grid-column:1/-1"><span>إجمالي كل الأرصدة</span><b>' + fmt(bt.all) + ' ج</b></div>' : '';
  if (!list.length) {
    g.innerHTML = '<div class="empty" style="grid-column:1/-1">' + (state.wallets.length ? 'مفيش حسابات في القسم ده. اضغط "+ محفظة" وضيف.' : 'مفيش محافظ لسه. ابدأ من تبويب "عملية".') + '</div>';
    return;
  }
  var liveList = liveTxs(state.ledger), smsItems = allInboxItems(state.inbox);
  g.innerHTML = list.map(function (w) {
    var x = C.W[w.id], dl = w.dayLimit || state.settings.defDay, ml = w.monthLimit || state.settings.defMon, r = walletRoom(dl, ml, x);
    return '<button class="wcard' + (w.active === false ? ' off' : '') + '" data-edit="' + esc(w.id) + '"><div class="l1" style="display:flex;justify-content:space-between;align-items:baseline"><b>' + esc(w.name) + (w.type === 'insta' ? ' <span class="tag">إنستاباي</span>' : '') + (w.active === false ? ' <span class="tag">متوقفة</span>' : '') + '</b><span class="bal">' + fmt(x.bal) + '</span></div>' +
      (w.phone ? '<div class="small num">' + esc(w.phone) + '</div>' : '') + limBar('اليوم', { out: r.dOut, in: r.dIn }, dl) + limBar('الشهر', { out: r.mOut, in: r.mIn }, ml) + driftHTML(w, x, liveList, smsItems) + '</button>';
  }).join('');
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {import('../../domain/compute.js').ComputeResult} C
 * @param {string|null} id null opens the "new wallet" sheet
 */
export function openWalletSheet(store, ctx, C, id) {
  var state = store.getState();
  var w = id ? state.wallets.filter(function (x) { return x.id === id; })[0] : null;
  var bal = w ? C.W[w.id].bal : 0;
  var ml0 = (w && w.monthLimit) || state.settings.defMon, xw = w ? C.W[w.id] : null;
  var remOut = Math.round(Math.max(0, ml0 - (xw ? xw.mOut : 0))), remIn = Math.round(Math.max(0, ml0 - (xw ? xw.mIn : 0)));
  var html = '<div class="sheet" role="dialog" aria-label="بيانات المحفظة">' +
    '<b>' + (w ? 'تعديل المحفظة' : 'محفظة جديدة') + '</b>' +
    '<div class="f2"><div><label for="sName">الاسم</label><input id="sName" value="' + esc(w ? w.name : '') + '"></div>' +
    '<div><label for="sPhone">رقم المحفظة</label><input id="sPhone" inputmode="tel" value="' + esc(w ? w.phone || '' : '') + '"></div>' +
    '<div><label for="sType">النوع</label><select id="sType"><option value="vf">فودافون كاش</option><option value="insta">إنستاباي</option><option value="other">أخرى</option></select></div>' +
    '<div><label for="sBal">الرصيد الحالي</label><input id="sBal" inputmode="decimal" value="' + Math.round(bal) + '"></div>' +
    '<div><label for="sDay">ليميت يومي</label><input id="sDay" inputmode="numeric" value="' + (w ? w.dayLimit || '' : state.settings.defDay) + '"></div>' +
    '<div><label for="sMon">ليميت شهري</label><input id="sMon" inputmode="numeric" value="' + (w ? w.monthLimit || '' : state.settings.defMon) + '"></div></div>' +
    '<details class="xtra"' + (w && w.pre && w.pre.mk === C.mk && (w.pre.i || w.pre.o) ? ' open' : '') + '><summary>المتبقي من الليميت الشهري (اختياري)</summary><div class="xtra-body">' +
    '<p class="small">اكتب المتبقي اللي ظاهر لك في تطبيق المحفظة. التطبيق بيحسب اللي اتصرف قبل ما تستخدمه، وبيتصفّر لوحده أول الشهر الجاي.</p>' +
    '<div class="f2"><div><label for="sRemOut">متبقي تحويل (إرسال)</label><input id="sRemOut" inputmode="numeric" value="' + remOut + '" data-orig="' + remOut + '"></div>' +
    '<div><label for="sRemIn">متبقي استلام (سحب)</label><input id="sRemIn" inputmode="numeric" value="' + remIn + '" data-orig="' + remIn + '"></div></div></div></details>' +
    '<label class="check"><input type="checkbox" id="sActive"' + (!w || w.active !== false ? ' checked' : '') + '> شغّالة (تظهر في الاقتراحات)</label>' +
    '<div class="row"><button class="btn-ghost" id="sCancel">إلغاء</button><button class="btn-primary" id="sSave">حفظ</button></div>' +
    (w ? '<button class="btn-danger" id="sDelete">مسح المحفظة</button>' : '') + '</div>';
  openSheet(html, function () {
    $('#sType').value = w ? w.type || 'vf' : (state.ui.svc === 'insta' ? 'insta' : 'vf');
    $('#sCancel').onclick = closeSheet;
    $('#sSave').onclick = function () { saveWalletAction(store, ctx, w, bal, w ? C.W[w.id] : null); };
    if (w) $('#sDelete').onclick = function () { deleteWalletAction(store, ctx, w, bal); };
    $('#sName').focus();
  });
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {object|null} w
 * @param {number} oldBal
 */
export async function saveWalletAction(store, ctx, w, oldBal, xw) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var name = $('#sName').value.trim();
  if (!name) { toast('اكتب اسم المحفظة', true); return; }
  var form = {
    name: name, phone: $('#sPhone').value.trim(), type: $('#sType').value,
    dayLimit: NUM($('#sDay').value) || state.settings.defDay, monthLimit: NUM($('#sMon').value) || state.settings.defMon,
    active: $('#sActive').checked, balance: NUM($('#sBal').value),
  };
  // remaining-room fields: only send the ones the owner actually changed
  var ro = $('#sRemOut'), ri = $('#sRemIn');
  if (ro && ro.value.trim() !== '' && ro.value !== ro.dataset.orig) { form.remainOut = NUM(ro.value); form.recOut = xw ? xw.mOutRec : 0; }
  if (ri && ri.value.trim() !== '' && ri.value !== ri.dataset.orig) { form.remainIn = NUM(ri.value); form.recIn = xw ? xw.mInRec : 0; }
  closeSheet();
  var res = await createOrUpdateWallet(ctx.db, ctx.queue, ctx.clock, w, oldBal, form, state.settings, state.wallets);
  if (res.ok) toast(w ? 'تم حفظ المحفظة' : 'تمت إضافة المحفظة');
}

/**
 * Two taps: the first arms the button, the second deletes. A wallet with history can't be deleted —
 * the sheet un-ticks "شغّالة" instead so saving stops it.
 */
async function deleteWalletAction(store, ctx, w, bal) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var btn = $('#sDelete');
  if (walletInUse(state.ledger, w.id)) {
    var act = $('#sActive'); if (act) act.checked = false;
    toast('المحفظة دي عليها عمليات ومينفعش تتمسح. اتعملت "مش شغّالة" — اضغط حفظ عشان تتوقف', true);
    return;
  }
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = 'اضغط تاني للتأكيد' + (Math.abs(bal) > 0.5 ? ' (رصيدها ' + fmt(bal) + ')' : '');
    setTimeout(function () { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'مسح المحفظة'; } }, 4000);
    return;
  }
  closeSheet();
  var res = await deleteWallet(ctx.db, ctx.queue, state.ledger, w.id);
  if (res.ok) toast('اتمسحت المحفظة');
  else toast('مينفعش تتمسح', true);
}

/** Soft warning when the last confirmed SMS balance disagrees with the app's balance for this wallet. */
function driftHTML(w, x, liveList, smsItems) {
  if (w.active === false) return '';
  var d = balanceDrift(w, x.bal, liveList, smsItems);
  if (!d) return '';
  return '<div class="cashwarn soft">آخر رسالة (' + hhmm(d.at) + ') رصيد المحفظة فيها ' + fm2(d.smsBal) + ' والتطبيق شايف ' + fm2(d.expected) + ' · فرق ' + fm2(Math.abs(d.diff)) + '. فيه عملية ناقصة أو غلط.</div>';
}
