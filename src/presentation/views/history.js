// @ts-check
// The السجل (history) tab: browse any past day's operations. Extracted from
// index.html's `renderHist` unchanged.
import { $ } from '../dom.js';
import { fmt, fm2 } from '../formatters.js';
import { groupHTML } from '../components/txRow.js';
import { dayKey, hhmm } from '../../domain/time.js';
import { isInsT } from '../../domain/kinds.js';
import { liveTxs, daySum, txGroups } from '../../domain/ledger.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderHist(store, C) {
  var state = store.getState();
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
  $('#hFlt').innerHTML = [['all', 'الكل'], ['v', 'فودافون كاش'], ['i', 'إنستا باي']].map(function (f) { return '<button class="chip' + (state.ui.hflt === f[0] ? ' on' : '') + '" data-hf="' + f[0] + '">' + f[1] + '</button>'; }).join('');
  var list = live.filter(function (t) { return dayKey(t.ts) === dk && (state.ui.hflt === 'all' || (state.ui.hflt === 'i') === isInsT(t)); });
  var sm = daySum(list), op = (state.settings.opens || {})[dk];
  if (!op && state.settings.openDay === dk) op = { a: state.settings.openAmt || 0, ts: state.settings.openTs || 0 };
  var sg = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)); };
  $('#hTiles').innerHTML =
    '<div class="tile hero"><span>صافي الربح</span><b>' + fm2(sm.pf) + ' ج</b></div>' +
    '<div class="tile"><span>عدد العمليات</span><b>' + sm.n + '</b></div>' +
    '<div class="tile"><span>عمولات الزبائن</span><b>' + fmt(sm.cf) + '</b></div>' +
    '<div class="tile"><span>رسوم المحافظ</span><b>' + fm2(sm.wf) + '</b></div>' +
    '<div class="tile"><span>حركة الدرج</span><b>' + sg(sm.cash) + '</b></div>' +
    '<div class="tile" style="grid-column:1/-1"><span>نقدية الدرج أول اليوم</span><b>' + (op ? fmt(op.a) + ' ج' : 'مش مسجّلة') + '</b></div>';
  var items = txGroups(list).map(function (L) { return { ts: L[0].ts, html: groupHTML(L, C, false, null) }; });
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
