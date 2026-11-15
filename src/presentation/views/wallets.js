// @ts-check
// The المحافظ (wallets) tab: grid + the add/edit wallet sheet. Extracted from
// index.html's `renderWallets`/`openSheet` (wallet-edit half)/`saveWallet`.
import { $ } from '../dom.js';
import { fmt, esc } from '../formatters.js';
import { limBar } from '../components/bars.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { svcHTML } from './transaction.js';
import { NUM } from '../../domain/numbers.js';
import { createOrUpdateWallet } from '../../application/wallets.js';
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
  $('#wTotal').textContent = list.length ? 'إجمالي الأرصدة: ' + fmt(tot) + ' ج' : '';
  if (!list.length) {
    g.innerHTML = '<div class="empty" style="grid-column:1/-1">' + (state.wallets.length ? 'مفيش حسابات في القسم ده. اضغط "+ محفظة" وضيف.' : 'مفيش محافظ لسه. ابدأ من تبويب "عملية".') + '</div>';
    return;
  }
  g.innerHTML = list.map(function (w) {
    var x = C.W[w.id], dl = w.dayLimit || state.settings.defDay, ml = w.monthLimit || state.settings.defMon;
    return '<button class="wcard' + (w.active === false ? ' off' : '') + '" data-edit="' + esc(w.id) + '"><div class="l1" style="display:flex;justify-content:space-between;align-items:baseline"><b>' + esc(w.name) + (w.type === 'insta' ? ' <span class="tag">إنستاباي</span>' : '') + (w.active === false ? ' <span class="tag">متوقفة</span>' : '') + '</b><span class="bal">' + fmt(x.bal) + '</span></div>' +
      (w.phone ? '<div class="small num">' + esc(w.phone) + '</div>' : '') + limBar('اليوم', x.dIn, x.dOut, dl, x.bal) + limBar('الشهر', x.mIn, x.mOut, ml, x.bal) + '</button>';
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
  var html = '<div class="sheet" role="dialog" aria-label="بيانات المحفظة">' +
    '<b>' + (w ? 'تعديل المحفظة' : 'محفظة جديدة') + '</b>' +
    '<div class="f2"><div><label for="sName">الاسم</label><input id="sName" value="' + esc(w ? w.name : '') + '"></div>' +
    '<div><label for="sPhone">رقم المحفظة</label><input id="sPhone" inputmode="tel" value="' + esc(w ? w.phone || '' : '') + '"></div>' +
    '<div><label for="sType">النوع</label><select id="sType"><option value="vf">فودافون كاش</option><option value="insta">إنستاباي</option><option value="other">أخرى</option></select></div>' +
    '<div><label for="sBal">الرصيد الحالي</label><input id="sBal" inputmode="decimal" value="' + Math.round(bal) + '"></div>' +
    '<div><label for="sDay">ليميت يومي</label><input id="sDay" inputmode="numeric" value="' + (w ? w.dayLimit || '' : state.settings.defDay) + '"></div>' +
    '<div><label for="sMon">ليميت شهري</label><input id="sMon" inputmode="numeric" value="' + (w ? w.monthLimit || '' : state.settings.defMon) + '"></div></div>' +
    '<label class="check"><input type="checkbox" id="sActive"' + (!w || w.active !== false ? ' checked' : '') + '> شغّالة (تظهر في الاقتراحات)</label>' +
    '<div class="row"><button class="btn-ghost" id="sCancel">إلغاء</button><button class="btn-primary" id="sSave">حفظ</button></div></div>';
  openSheet(html, function () {
    $('#sType').value = w ? w.type || 'vf' : (state.ui.svc === 'insta' ? 'insta' : 'vf');
    $('#sCancel').onclick = closeSheet;
    $('#sSave').onclick = function () { saveWalletAction(store, ctx, w, bal); };
    $('#sName').focus();
  });
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {object|null} w
 * @param {number} oldBal
 */
export async function saveWalletAction(store, ctx, w, oldBal) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var name = $('#sName').value.trim();
  if (!name) { toast('اكتب اسم المحفظة', true); return; }
  var form = {
    name: name, phone: $('#sPhone').value.trim(), type: $('#sType').value,
    dayLimit: NUM($('#sDay').value) || state.settings.defDay, monthLimit: NUM($('#sMon').value) || state.settings.defMon,
    active: $('#sActive').checked, balance: NUM($('#sBal').value),
  };
  closeSheet();
  var res = await createOrUpdateWallet(ctx.db, ctx.queue, ctx.clock, w, oldBal, form, state.settings, state.wallets);
  if (res.ok) toast(w ? 'تم حفظ المحفظة' : 'تمت إضافة المحفظة');
}
