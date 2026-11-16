// @ts-check
// The اليوم (today) tab: profit/cash tiles, the opening-cash sheet, the daily
// close inventory, today's transaction list, and recent closes. Extracted
// from index.html's `renderDay`/`renderOpen`/`renderGuide`/`openCashSheet`/
// `saveOpenCash`/`setDiff`/`updateDiffs`/`voidTx`/`doClose`.
import { $, $$ } from '../dom.js';
import { fmt, esc } from '../formatters.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { groupHTML } from '../components/txRow.js';
import { getItem, setItem } from '../../infrastructure/storage.js';
import { NUM } from '../../domain/numbers.js';
import { dayKey, hhmm } from '../../domain/time.js';
import { isInsT } from '../../domain/kinds.js';
import { txGroups } from '../../domain/ledger.js';
import { writable } from '../../application/sync.js';
import { recordOpeningCash } from '../../application/openingCash.js';
import { closeDay } from '../../application/closeDay.js';
import { renderCust } from './customers.js';
import { walletTotals } from '../../domain/wallets.js';
import { voidTransaction } from '../../application/transactions.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 */
export function renderGuide(store) {
  var box = $('#guideBox');
  var dis = getItem('dw_guide') === '1';
  var state = store.getState();
  if (dis || !state.wallets.length || !writable(state)) { box.innerHTML = ''; return; }
  var act = state.wallets.filter(function (w) { return w.active !== false; });
  var noPh = act.filter(function (w) { return !(w.phone || '').trim(); }).length;
  var opened = state.settings.openDay === dayKey(Date.now());
  if (!noPh && opened) { box.innerHTML = ''; return; }
  var li = function (done, t) { return '<div class="small" style="display:flex;gap:6px"><span>' + (done ? '✅' : '⬜') + '</span><span>' + t + '</span></div>'; };
  box.innerHTML = '<div class="card"><b>خطوات البداية</b>' +
    li(true, 'المحافظ اتعملت') +
    li(!noPh, 'اكتب رقم كل محفظة من تبويب "المحافظ" ← تعديل' + (noPh ? ' (باقي ' + noPh + ')' : '')) +
    li(false, 'اظبط رصيد كل محفظة من تبويب "اليوم" ← الجرد، عشان الرسائل تتعرف على المحفظة') +
    li(opened, 'سجّل "إدخال نقدية الدرج" أول كل يوم') +
    '<button class="btn" id="guideOk">تمام، فهمت</button></div>';
}

export function dismissGuideAction() {
  setItem('dw_guide', '1');
  $('#guideBox').innerHTML = '';
}

/** @param {import('../../domain/compute.js').ComputeResult} C */
export function renderOpen(store, C) {
  var state = store.getState();
  var tk = dayKey(Date.now()), opened = state.settings.openDay === tk;
  $('#openBanner').innerHTML = (!opened && writable(state) && state.wallets.length)
    ? '<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>لسه ما سجّلتش نقدية الدرج النهارده</span><button class="btn-ghost" data-oc="1" style="flex:0 0 auto;background:var(--surface)">إدخال نقدية الدرج</button></div>'
    : '';
  $('#openCard').innerHTML = '<div class="card"><div class="row" style="justify-content:space-between"><div><b>نقدية الدرج أول اليوم</b><div class="small num">' + (opened ? fmt(state.settings.openAmt || 0) + ' ج · اتسجّلت ' + hhmm(state.settings.openTs || Date.now()) : 'لسه ما اتسجّلتش النهارده') + '</div></div><button class="btn" data-oc="1" style="flex:0 0 auto">إدخال نقدية الدرج</button></div></div>';
}

/** @param {import('../../domain/compute.js').ComputeResult} C */
export function openCashSheet(store, ctx, C) {
  var html = '<div class="sheet" role="dialog" aria-label="نقدية الدرج">' +
    '<b>إدخال نقدية الدرج (أول اليوم)</b><p class="small">اكتب الكاش اللي في الدرج قبل أول عملية النهارده. الرقم ده هو نقطة بداية حساب "النقدي المتوقع في الدرج" طول اليوم.</p>' +
    '<label for="ocAmt">النقدية في الدرج (جنيه)</label><input id="ocAmt" class="big" inputmode="decimal" autocomplete="off" value="' + Math.round(C.cash) + '">' +
    '<div class="row"><button class="btn-ghost" id="ocCancel">إلغاء</button><button class="btn-primary" id="ocSave">حفظ</button></div></div>';
  openSheet(html, function () {
    $('#ocCancel').onclick = closeSheet;
    $('#ocSave').onclick = function () { saveOpenCashAction(store, ctx); };
    $('#ocAmt').focus(); $('#ocAmt').select();
  });
}

export async function saveOpenCashAction(store, ctx) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var raw = $('#ocAmt').value.trim();
  if (raw === '' || NUM(raw) < 0) { toast('اكتب مبلغ صحيح', true); return; }
  closeSheet();
  var res = await recordOpeningCash(ctx.db, ctx.queue, ctx.clock, state.settings, raw);
  if (res.ok) toast('اتسجّلت نقدية الدرج: ' + fmt(res.amount));
}

/** @param {HTMLElement} el @param {number} exp @param {string} raw */
export function setDiff(el, exp, raw) {
  if (raw.trim() === '') { el.textContent = ''; el.className = 'diff'; return; }
  var df = NUM(raw) - exp;
  if (Math.abs(df) < 0.5) { el.textContent = 'مطابق'; el.className = 'diff ok'; }
  else { el.textContent = (df > 0 ? '+' : '−') + fmt(Math.abs(df)); el.className = 'diff bad'; }
}

/** @param {import('../../domain/compute.js').ComputeResult} C */
export function updateDiffs(C) {
  setDiff($('#diffCash'), C.cash, $('#invCash').value);
  $$('[data-inv]').forEach(function (inp) {
    var x = C.W[inp.dataset.inv];
    if (x) setDiff($('[data-diff="' + inp.dataset.inv + '"]'), x.bal, inp.value);
  });
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderDay(store, C) {
  var state = store.getState();
  var bk = +(getItem('dw_bk') || 0);
  $('#bkNotice').innerHTML = (Date.now() - bk > 7 * 864e5) ? '<div class="notice">خد نسخة احتياطية من الإعدادات. البيانات على الموبايل ده بس.</div>' : '';
  $('#tiles').innerHTML =
    '<div class="tile hero"><span>صافي ربح اليوم (بعد الخسارة)</span><b>' + fmt(C.pDay) + ' ج</b></div>' +
    '<div class="tile"><span>ربح فودافون</span><b>' + fmt(C.pDay - C.pDayI) + '</b></div>' +
    '<div class="tile"><span>ربح إنستاباي</span><b>' + fmt(C.pDayI) + '</b></div>' +
    '<div class="tile"><span>ربح الشهر</span><b>' + fmt(C.pMon) + '</b></div>' +
    '<div class="tile"><span>عمليات اليوم</span><b>' + C.nDay + '</b></div>' +
    '<div class="tile" style="grid-column:1/-1"><span>النقدي المتوقع في الدرج</span><b>' + fmt(C.cash) + ' ج</b></div>';
  var bt = walletTotals(state.wallets, C);
  $('#balCard').innerHTML = state.wallets.length ? '<div class="card"><div class="small">أرصدة المحافظ</div>' +
    '<div class="row2"><span>فودافون</span><b class="num">' + fmt(bt.vf) + '</b></div>' +
    '<div class="row2"><span>إنستاباي</span><b class="num">' + fmt(bt.insta) + '</b></div>' +
    '<div class="row2 sumline"><b>الإجمالي</b><b class="num">' + fmt(bt.all) + ' ج</b></div></div>' : '';
  $('#fltChips').innerHTML = [['all', 'الكل'], ['v', 'محافظ'], ['i', 'إنستاباي']].map(function (f) { return '<button class="chip' + (state.ui.flt === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>'; }).join('');
  $('#expCash').textContent = fmt(C.cash);
  var key = state.wallets.map(function (w) { return w.id + ':' + w.name; }).join('|');
  if (key !== state.ui.invKey) {
    store.patchUI({ invKey: key });
    $('#invRows').innerHTML = state.wallets.map(function (w) { return '<div class="inv"><div><b>' + esc(w.name) + '</b><small>المتوقع <span class="num" data-exp="' + esc(w.id) + '"></span></small></div><input data-inv="' + esc(w.id) + '" inputmode="decimal" autocomplete="off" placeholder="الفعلي"><span class="diff" data-diff="' + esc(w.id) + '"></span></div>'; }).join('');
  }
  $$('[data-exp]').forEach(function (el) { var x = C.W[el.dataset.exp]; el.textContent = x ? fmt(x.bal) : ''; });
  updateDiffs(C);
  renderCust(store, C);
  var tl = $('#txList');
  var tlist = C.today.filter(function (t) { return state.ui.flt === 'all' || (t.k !== 'settle' && (state.ui.flt === 'i') === isInsT(t)); });
  if (!tlist.length) tl.innerHTML = '<div class="empty">لسه مفيش عمليات النهارده.</div>';
  else tl.innerHTML = txGroups(tlist).map(function (L) { return groupHTML(L, C, true, state.ui.delId); }).join('');
  var cl = $('#closeList'), cs = state.closes.slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 6);
  cl.innerHTML = cs.length ? cs.map(function (c) {
    var df = c.actCash - c.expCash;
    return '<div class="tx"><div><div class="t1 num">' + esc(c.day.slice(6) + '/' + c.day.slice(4, 6)) + ' · ' + hhmm(c.ts) + '</div><div class="t2 num">ربح اليوم ' + fmt(c.pDay || 0) + '</div></div><div class="diff ' + (Math.abs(df) < 0.5 ? 'ok' : 'bad') + '" style="font-size:13px">' + (Math.abs(df) < 0.5 ? 'مطابق' : (df > 0 ? 'زيادة ' : 'عجز ') + fmt(Math.abs(df))) + '</div></div>';
  }).join('') : '<div class="empty">لسه مفيش إقفالات.</div>';
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export async function doCloseAction(store, ctx, C) {
  var state = store.getState();
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var byWallet = {};
  state.wallets.forEach(function (w) { var inp = $('[data-inv="' + w.id + '"]'); byWallet[w.id] = inp ? inp.value : ''; });
  var res = await closeDay(ctx.db, ctx.queue, ctx.clock, C, state.wallets, state.settings, { cash: $('#invCash').value, byWallet: byWallet });
  if (res.ok) {
    $('#invCash').value = '';
    $$('[data-inv]').forEach(function (i) { i.value = ''; });
    toast('اتحفظ الجرد وتقفل اليوم');
  }
}

var delT;
/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {string} id
 */
export async function voidTxAction(store, ctx, id) {
  var ui = store.getState().ui;
  if (ui.delId !== id) {
    store.patchUI({ delId: id });
    clearTimeout(delT);
    delT = setTimeout(function () { store.patchUI({ delId: null }); }, 3500);
    return;
  }
  store.patchUI({ delId: null });
  clearTimeout(delT);
  await voidTransaction(ctx.db, ctx.queue, ctx.clock, ctx.deviceId, store.getState().ledger, id);
  toast('اتلغت العملية');
}
