// @ts-check
// The السجل (history) tab: browse any past day's operations. Extracted from
// index.html's `renderHist` unchanged.
import { $ } from '../dom.js';
import { fmt, fm2 } from '../formatters.js';
import { groupHTML } from '../components/txRow.js';
import { dayKey, hhmm } from '../../domain/time.js';
import { isInsT } from '../../domain/kinds.js';
import { liveTxs, daySum, txGroups } from '../../domain/ledger.js';
import { periodRange, buildReport } from '../../domain/reports.js';
import { nrm } from '../../domain/numbers.js';
import { KIND } from '../../domain/kinds.js';
import { esc } from '../formatters.js';
import { openSheet, closeSheet } from '../components/sheet.js';
import { toast } from '../components/toast.js';
import { editTxNote } from '../../application/transactions.js';
import { writable } from '../../application/sync.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderHist(store, C) {
  var state = store.getState();
  var rep = state.ui.hmode === 'rep';
  $('#hMode').innerHTML = [['list', 'العمليات'], ['rep', 'تقارير']].map(function (o) { return '<button class="' + (state.ui.hmode === o[0] || (o[0] === 'list' && !rep) ? 'on' : '') + '" data-hm="' + o[0] + '">' + o[1] + '</button>'; }).join('');
  $('#repView').hidden = !rep; $('#histView').hidden = rep;
  if (rep) { renderReport(state); return; }
  var tk = dayKey(Date.now()), dk = state.ui.hd || tk, live = liveTxs(state.ledger);
  var ae = document.activeElement, iso = dk.slice(0, 4) + '-' + dk.slice(4, 6) + '-' + dk.slice(6, 8);
  if (!(ae && ae.id === 'hDate') && $('#hDate').value !== iso) $('#hDate').value = iso;
  $('#hLabel').textContent = new Date(Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6, 8), 12)).toLocaleDateString('ar-EG-u-nu-latn', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + (dk === tk ? ' (النهارده)' : '');
  var days = {};
  live.forEach(function (t) { days[dayKey(t.ts)] = 1; });
  state.closes.forEach(function (c) { if (c.day) days[c.day] = 1; });
  Object.keys(state.settings.opens || {}).forEach(function (d) { days[d] = 1; });
  days[tk] = 1;
  var dl = Object.keys(days).sort().reverse().slice(0, 10);
  $('#hDays').innerHTML = dl.map(function (d) { return '<button class="chip' + (d === dk ? ' on' : '') + '" data-hd="' + d + '">' + d.slice(6) + '/' + d.slice(4, 6) + '</button>'; }).join('');
  $('#hFlt').innerHTML = [['all', 'الكل'], ['v', 'فودافون كاش'], ['i', 'إنستاباي']].map(function (f) { return '<button class="chip' + (state.ui.hflt === f[0] ? ' on' : '') + '" data-hf="' + f[0] + '">' + f[1] + '</button>'; }).join('');
  var list = live.filter(function (t) { return dayKey(t.ts) === dk && (state.ui.hflt === 'all' || (t.k !== 'settle' && (state.ui.hflt === 'i') === isInsT(t))); });
  var sm = daySum(list), op = (state.settings.opens || {})[dk];
  if (!op && state.settings.openDay === dk) op = { a: state.settings.openAmt || 0, ts: state.settings.openTs || 0 };
  var sg = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)); };
  $('#hTiles').innerHTML =
    '<div class="tile hero" data-perm="profit"><span>صافي الربح</span><b>' + fm2(sm.pf) + ' ج</b></div>' +
    '<div class="tile"><span>عدد العمليات</span><b>' + sm.n + '</b></div>' +
    '<div class="tile" data-perm="profit"><span>عمولات الزبائن</span><b>' + fmt(sm.cf) + '</b></div>' +
    '<div class="tile" data-perm="profit"><span>رسوم المحافظ</span><b>' + fm2(sm.wf) + '</b></div>' +
    '<div class="tile"><span>حركة الدرج</span><b>' + sg(sm.cash) + '</b></div>' +
    '<div class="tile" style="grid-column:1/-1"><span>نقدية الدرج أول اليوم</span><b>' + (op ? fmt(op.a) + ' ج' : 'مش مسجّلة') + '</b></div>';
  var q = String(state.ui.hq || '').trim();
  $('#hDayCard').hidden = !!q; $('#hTiles').hidden = !!q; $('#hFlt').hidden = !!q;
  if (q) { renderSearch(state, C, live, q); return; }
  var items = txGroups(list).map(function (L) { return { ts: L[0].ts, html: groupHTML(L, C, false, null, true) }; });
  if (state.ui.hflt === 'all') {
    if (op && op.ts) {
      items.push({ ts: op.ts, html: '<div class="tx"><div><div class="t1">إدخال نقدية الدرج (أول اليوم)</div><div class="t2 num">' + hhmm(op.ts) + '</div></div><div class="amt">' + fmt(op.a) + '</div></div>' });
    }
    state.closes.filter(function (c) { return c.day === dk; }).forEach(function (c) {
      var df = c.actCash - c.expCash;
      items.push({
        ts: c.ts,
        html: '<div class="tx"><div><div class="t1">إقفال اليوم</div><div class="t2 num">' + hhmm(c.ts) + ' · المتوقع ' + fmt(c.expCash) + ' · الفعلي ' + fmt(c.actCash) + '</div></div><div class="diff ' + (Math.abs(df) < 0.5 ? 'ok' : 'bad') + '" style="font-size:13px">' + (Math.abs(df) < 0.5 ? 'مطابق' : (df > 0 ? 'زيادة ' : 'عجز ') + fmt(Math.abs(df))) + '</div></div>',
      });
    });
  }
  items.sort(function (a, b) { return b.ts - a.ts; });
  $('#hList').innerHTML = items.length ? items.map(function (i) { return i.html; }).join('') : '<div class="empty">مفيش عمليات في اليوم ده.</div>';
}

/** Search the whole history: note, wallet name, customer name, amount. Newest first, at most 60 rows. */
function renderSearch(state, C, live, q) {
  var t = nrm(q).toLowerCase();
  var hit = live.filter(function (u) {
    var w = C.W[u.w], hay = [u.n, u.cn, w ? w.w.name : '', w ? w.w.phone : '', String(u.a || ''), KIND[u.k] || ''].join(' ');
    return nrm(hay).toLowerCase().indexOf(t) >= 0;
  });
  var groups = txGroups(hit), shown = groups.slice(0, 60);
  var dm = function (ts) { var d = dayKey(ts); return d.slice(6) + '/' + d.slice(4, 6); };
  $('#hList').innerHTML = (shown.length ? '<div class="small">النتايج: ' + groups.length + (groups.length > shown.length ? ' (أحدث 60)' : '') + '</div>' +
    shown.map(function (L) { return '<div class="small num" style="padding-top:8px">' + dm(L[0].ts) + '</div>' + groupHTML(L, C, false, null, true); }).join('')
    : '<div class="empty">مفيش عملية مطابقة للبحث.</div>');
}

function dmy(dk) { return dk.slice(6) + '/' + dk.slice(4, 6); }
function renderReport(state) {
  var u = state.ui, mode = u.rmode === 'month' ? 'month' : 'week', off = Math.max(0, u.roff || 0);
  var r = periodRange(mode, off, dayKey(Date.now()));
  var R = buildReport(liveTxs(state.ledger), state.wallets, r.from, r.to);
  var P = function (inner) { return '<span data-perm="profit">' + inner + '</span>'; };
  var h = '<div class="seg">' + [['week', 'أسبوع'], ['month', 'شهر']].map(function (o) { return '<button class="' + (mode === o[0] ? 'on' : '') + '" data-rm="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
    '<div class="card"><div class="rep-nav"><button class="btn-ghost" data-ro="1" style="flex:0 0 auto">السابق</button><b class="num">' + dmy(r.from) + ' ← ' + dmy(r.to) + '</b><button class="btn-ghost" data-ro="-1" style="flex:0 0 auto"' + (off === 0 ? ' disabled' : '') + '>التالي</button></div></div>' +
    '<div class="grid">' +
    '<div class="tile hero" data-perm="profit"><span>صافي الربح</span><b>' + fm2(R.total.pf) + ' ج</b></div>' +
    '<div class="tile"><span>عدد العمليات</span><b>' + R.total.n + '</b></div>' +
    '<div class="tile" data-perm="profit"><span>عمولات الزبائن</span><b>' + fmt(R.total.cf) + '</b></div>' +
    '<div class="tile" data-perm="profit"><span>رسوم المحافظ</span><b>' + fm2(R.total.wf) + '</b></div>' +
    '<div class="tile"><span>اتحوّل (صادر)</span><b>' + fmt(R.sent) + '</b></div>' +
    '<div class="tile"><span>اتسحب (وارد)</span><b>' + fmt(R.recv) + '</b></div></div>';
  h += '<div class="card"><b>لكل محفظة</b>' + (R.wallets.length ? '<table class="rep-tbl"><tr><th>المحفظة</th><th class="n">عمليات</th><th class="n">صادر</th><th class="n">وارد</th><th class="n" data-perm="profit">ربح</th></tr>' +
    R.wallets.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="n">' + x.n + '</td><td class="n">' + fmt(x.sent) + '</td><td class="n">' + fmt(x.recv) + '</td><td class="n" data-perm="profit">' + fm2(x.pf) + '</td></tr>'; }).join('') + '</table>' : '<div class="empty">مفيش عمليات في الفترة دي.</div>') + '</div>';
  h += '<div class="card"><b>لكل يوم</b>' + (R.days.length ? '<table class="rep-tbl"><tr><th>اليوم</th><th class="n">عمليات</th><th class="n" data-perm="profit">ربح</th></tr>' +
    R.days.map(function (x) { return '<tr><td class="num">' + dmy(x.day) + '</td><td class="n">' + x.n + '</td><td class="n" data-perm="profit">' + fm2(x.pf) + '</td></tr>'; }).join('') + '</table>' : '<div class="empty">مفيش عمليات في الفترة دي.</div>') + '</div>';
  $('#repView').innerHTML = h;
}

/** Sheet to edit only the note of a transaction (amounts and wallets never change here). */
export function openNoteSheet(store, ctx, txId) {
  var st = store.getState(), t = null;
  liveTxs(st.ledger).forEach(function (u) { if (u.id === txId) t = u; });
  if (!t) return;
  var html = '<div class="sheet" role="dialog" aria-label="تعديل الملاحظة"><b>تعديل ملاحظة العملية</b>' +
    '<p class="small">الملاحظة بس. المبلغ والعمولة والمحفظة مش بتتغير. لو في غلط فيهم، الغي العملية وسجّلها من جديد.</p>' +
    '<label for="tnNote">الملاحظة</label><input id="tnNote" autocomplete="off" value="' + esc(t.n || '') + '">' +
    '<div class="row"><button class="btn-ghost" id="tnCancel">إلغاء</button><button class="btn-primary" id="tnSave">حفظ</button></div></div>';
  openSheet(html, function () {
    $('#tnCancel').onclick = closeSheet;
    $('#tnSave').onclick = async function () {
      var s2 = store.getState();
      if (!writable(s2)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
      var v = $('#tnNote').value;
      closeSheet();
      var res = await editTxNote(ctx.db, ctx.queue, s2.ledger, txId, v);
      toast(res.ok ? 'اتحفظت الملاحظة' : 'مش لاقي العملية', !res.ok);
    };
    $('#tnNote').focus();
  });
}
