// @ts-check
// "الآجل" on the اليوم tab: the open-credit card, the settle sheet and the per-customer limit sheet.
import { $ } from '../dom.js';
import { fmt, fm2, esc } from '../formatters.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { NUM } from '../../domain/numbers.js';
import { openCustomers, custTotals, custMatches, resolveCust } from '../../domain/customers.js';
import { liveTxs } from '../../domain/ledger.js';
import { settleCustomer, setCustomerLimit, editCustomer } from '../../application/customers.js';
import { writable } from '../../application/sync.js';

/** @param {number} ts */
function dm(ts) {
  var d = new Date(ts + 2 * 36e5);
  return String(d.getUTCDate()) + '/' + String(d.getUTCMonth() + 1);
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderCust(store, C) {
  var state = store.getState(), list = openCustomers(C.cust), box = $('#custCard');
  var tot = custTotals(C.cust);
  $('#invDefer').textContent = list.length ? 'آجل مفتوح: عليك ' + fmt(tot.owe) + ' · ليك ' + fmt(tot.due) + ' (مش داخل في النقدي المتوقع)' : '';
  var net = tot.due - tot.owe;
  $('#credTotals').innerHTML =
    '<div class="tile"><span>ليك عند الناس</span><b class="pos">' + fmt(tot.due) + '</b></div>' +
    '<div class="tile"><span>عليك للناس</span><b class="neg">' + fmt(tot.owe) + '</b></div>' +
    '<div class="tile hero" style="grid-column:1/-1"><span>الصافي</span><b>' + (Math.abs(net) < 0.005 ? '0' : (net > 0 ? 'ليك ' : 'عليك ') + fmt(Math.abs(net))) + ' ج</b></div>';
  if (!list.length) { box.innerHTML = '<div class="empty">مفيش آجل مفتوح دلوقتي. لما تسجّل عملية آجل هتظهر هنا.</div>'; return; }
  var cm = state.settings.cm || {};
  var q = String((state.ui || {}).custQ || '').trim();
  if (q) {
    var notes = {};   // each customer's deferred-operation notes, so a search can find "ببجي" too
    liveTxs(state.ledger).forEach(function (t) {
      if (t.dl && t.cn && t.n) { var k = resolveCust(state.settings.ca, t.cn).key; notes[k] = (notes[k] || '') + ' ' + t.n; }
    });
    list = list.filter(function (c) { return custMatches(c, cm[c.key], notes[c.key] || '', q); });
    if (!list.length) { box.innerHTML = '<div class="empty">مفيش زبون مطابق للبحث.</div>'; return; }
  }
  var h = '<div class="card">';
  if (tot.owe > 0 && C.cash < tot.owe) h += '<div class="notice">نقدية الدرج (' + fmt(C.cash) + ') أقل من اللي عليك للناس (' + fmt(tot.owe) + ')</div>';
  h += list.map(function (c) {
    var inf = cm[c.key] || {}, lim = inf.lim || 0, over = lim > 0 && Math.abs(c.v) > lim + 0.005;
    return '<div class="cust"><div class="row2"><b>' + esc(c.n) + (over ? ' <span class="tag bad">فوق الحد</span>' : '') + '</b>' +
      '<span class="num"><span class="small">' + (c.v > 0 ? 'عليه لك' : 'عليك له') + '</span> <b>' + fmt(Math.abs(c.v)) + '</b></span></div>' +
      '<div class="small num">' + (c.last ? 'آخر حركة ' + dm(c.last) : '') + (lim > 0 ? (c.last ? ' · ' : '') + 'الحد ' + fmt(lim) : '') + (inf.ph ? (c.last || lim > 0 ? ' · ' : '') + '<span class="ph" dir="ltr">' + esc(inf.ph) + '</span>' : '') + '</div>' +
      (inf.note ? '<div class="small">' + esc(inf.note) + '</div>' : '') +
      '<div class="acts"><button class="btn-ghost" data-ce="' + esc(c.key) + '">تعديل</button><button class="btn-ghost" data-cl="' + esc(c.key) + '">الحد</button><button class="btn" data-cs="' + esc(c.key) + '">تسوية</button></div></div>';
  }).join('');
  box.innerHTML = h + '</div>';
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {object} ctx @param {import('../../domain/compute.js').ComputeResult} C @param {string} key */
export function openSettle(store, ctx, C, key) {
  var c = (C.cust || {})[key];
  if (!c || Math.abs(c.v) < 0.005) return;
  var owed = c.v > 0, amt = Math.abs(c.v);
  var html = '<div class="sheet" role="dialog" aria-label="تسوية آجل">' +
    '<b>تسوية آجل · ' + esc(c.n) + '</b>' +
    '<p class="small num">' + (owed ? 'العميل عليه لك ' + fm2(amt) + ' — هتاخد منه كاش وتدخل الدرج' : 'عليك للعميل ' + fm2(amt) + ' — هتدّيله كاش من الدرج (المتاح ' + fmt(C.cash) + ')') + '</p>' +
    '<label for="stAmt">المبلغ (كامل أو جزء)</label><input id="stAmt" class="big" inputmode="decimal" autocomplete="off" value="' + (Math.round(amt * 100) / 100) + '">' +
    '<div class="row"><button class="btn-ghost" id="stCancel">إلغاء</button><button class="btn-primary" id="stSave">' + (owed ? 'استلمت الكاش' : 'دفعت الكاش') + '</button></div></div>';
  openSheet(html, function () {
    $('#stCancel').onclick = closeSheet;
    $('#stSave').onclick = function () { saveSettleAction(store, ctx, key); };
    $('#stAmt').focus(); $('#stAmt').select();
  });
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {object} ctx @param {string} key */
export async function saveSettleAction(store, ctx, key) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var a = NUM($('#stAmt').value);
  var C = ctx.getCompute();
  var res = await settleCustomer(ctx.db, ctx.queue, ctx.clock, ctx.deviceId, state.ledger, C, { key: key, amount: a });
  if (!res.ok) {
    if (res.error === 'no-cash') toast('لا يوجد نقدية كافية في الدرج (المتاح ' + fmt(res.cash) + ')', true);
    else toast('اكتب مبلغ صحيح (مش أكبر من الرصيد)', true);
    return;
  }
  closeSheet();
  toast('اتسجّلت التسوية: ' + fm2(a));
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {object} ctx @param {import('../../domain/compute.js').ComputeResult} C @param {string} key */
export function openCustLimit(store, ctx, C, key) {
  var c = (C.cust || {})[key], cur = ((store.getState().settings.cm || {})[key] || {}).lim || '';
  if (!c) return;
  var html = '<div class="sheet" role="dialog" aria-label="حد الآجل">' +
    '<b>أقصى آجل · ' + esc(c.n) + '</b><p class="small">لو الآجل عدّى الرقم ده هتظهرلك تنبيه بس. اكتب 0 لو مش عايز حد.</p>' +
    '<label for="clAmt">الحد (جنيه)</label><input id="clAmt" class="big" inputmode="numeric" autocomplete="off" value="' + cur + '">' +
    '<div class="row"><button class="btn-ghost" id="clCancel">إلغاء</button><button class="btn-primary" id="clSave">حفظ</button></div></div>';
  openSheet(html, function () {
    $('#clCancel').onclick = closeSheet;
    $('#clSave').onclick = async function () {
      var st = store.getState();
      if (!writable(st)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
      var v = NUM($('#clAmt').value);
      closeSheet();
      await setCustomerLimit(ctx.db, ctx.queue, st.settings, c.n, v);
      toast('اتحفظ الحد');
    };
    $('#clAmt').focus();
  });
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {object} ctx @param {import('../../domain/compute.js').ComputeResult} C @param {string} key */
export function openCustEdit(store, ctx, C, key) {
  var c = (C.cust || {})[key], inf = (store.getState().settings.cm || {})[key] || {};
  if (!c) return;
  var html = '<div class="sheet" role="dialog" aria-label="تعديل زبون">' +
    '<b>تعديل الزبون</b><p class="small">لو غيّرت الاسم، رصيده وكل حركاته القديمة بتفضل معاه على الاسم الجديد.</p>' +
    '<label for="ceName">الاسم</label><input id="ceName" autocomplete="off" value="' + esc(c.n) + '">' +
    '<label for="cePh">رقم الموبايل (اختياري)</label><input id="cePh" dir="ltr" inputmode="tel" autocomplete="off" value="' + esc(inf.ph || '') + '">' +
    '<label for="ceNote">ملاحظة (اختياري)</label><input id="ceNote" autocomplete="off" value="' + esc(inf.note || '') + '">' +
    '<div class="row"><button class="btn-ghost" id="ceCancel">إلغاء</button><button class="btn-primary" id="ceSave">حفظ</button></div></div>';
  openSheet(html, function () {
    $('#ceCancel').onclick = closeSheet;
    $('#ceSave').onclick = async function () {
      var st = store.getState();
      if (!writable(st)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
      var res = await editCustomer(ctx.db, ctx.queue, st.settings, ctx.getCompute().cust, { key: key, name: $('#ceName').value, phone: $('#cePh').value, note: $('#ceNote').value });
      if (!res.ok) { toast(res.error === 'exists' ? 'الاسم ده لزبون تاني عنده حساب' : 'اكتب اسم الزبون', true); return; }
      closeSheet();
      toast('اتحفظ التعديل');
    };
    $('#ceName').focus();
  });
}
