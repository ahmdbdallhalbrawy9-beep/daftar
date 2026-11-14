// @ts-check
// The "new SMS messages" card on the عملية tab. Extracted from index.html's
// `renderPend` unchanged, reading the store instead of `S`/`UI` and taking
// `smsAvailable` as a parameter instead of calling `smsPlugin()` itself
// (presentation never reaches into infrastructure directly).
import { $ } from '../dom.js';
import { fm2, esc } from '../formatters.js';
import { hhmm } from '../../domain/time.js';
import { PKIND, MSG } from '../../domain/kinds.js';
import { NUM } from '../../domain/numbers.js';
import { liveTxs } from '../../domain/ledger.js';
import { pendingItems, confirmPending, ignorePending } from '../../application/smsImport.js';
import { writable } from '../../application/sync.js';
import { toast } from './toast.js';

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} computeResult
 * @param {boolean} smsAvailable
 */
export function renderPend(store, computeResult, smsAvailable) {
  var state = store.getState();
  var box = $('#pendBox');
  var items = pendingItems(state.wallets, state.inbox, liveTxs(state.ledger), computeResult);
  var key = items.map(function (i) { return i.id + ':' + (i.sug || '') + ':' + (i.bal == null ? '' : i.bal); }).join('|') +
    '|' + state.wallets.map(function (w) { return w.id + w.name; }).join(',') + '|' + (smsAvailable ? 1 : 0);
  $('#smsInfo').textContent = smsAvailable
    ? 'التطبيق بيقرا رسائل فودافون كاش على الموبايل ده ويعرضها كعمليات مقترحة تأكدها بضغطة.'
    : 'قراءة الرسائل بتشتغل في تطبيق الأندرويد (APK) بس. العمليات المقترحة من أي موبايل بتظهر هنا برضه.';
  $('#smsScan').style.display = smsAvailable ? '' : 'none';
  if (key === state.ui.pendKey) return;
  var ae = document.activeElement;
  if (ae && box.contains(ae) && ae.tagName === 'INPUT') return;
  store.patchUI({ pendKey: key });
  if (!items.length && !smsAvailable) { box.innerHTML = ''; return; }
  var ws = state.wallets.filter(function (w) { return w.active !== false && w.type !== 'insta'; });
  var h = '<div class="card"><div class="row" style="justify-content:space-between"><b>رسائل جديدة (' + items.length + ')</b>' + (smsAvailable ? '<button class="ghost" id="smsScan2" style="flex:0 0 auto">فحص</button>' : '') + '</div>';
  if (!items.length) h += '<div class="small">مفيش رسائل جديدة.</div>';
  items.forEach(function (it) {
    var isF = it.k !== 'dep', lbl = it.k === 'cashout' ? 'خسارة السحب' : 'عمولتك';
    var defF = it.k === 'in' || it.k === 'out' ? Math.round(it.a * state.settings.feePct / 100) : it.k === 'cashout' ? Math.round(it.a * state.settings.feePctC / 100) : 0;
    h += '<div class="sp" data-pid="' + esc(it.id) + '"><div class="l1"><b>' + PKIND[it.k] + ' · ' + fm2(it.a) + ' ج</b><span class="small num">' + hhmm(it.ts) + '</span></div>' +
      '<div class="small num">' + (it.p ? esc(it.p) + ' · ' : '') + (it.c ? 'رسوم المحفظة ' + fm2(it.c) + ' · ' : '') + (it.bal != null ? 'الرصيد بعدها ' + fm2(it.bal) : '') + '</div>' +
      '<div class="row"><select data-pw><option value="">اختار المحفظة</option>' + ws.map(function (w) { return '<option value="' + esc(w.id) + '"' + (w.id === it.sug ? ' selected' : '') + '>' + esc(w.name) + (w.phone ? ' · ' + esc(w.phone) : '') + '</option>'; }).join('') + '</select>' +
      (isF ? '<input data-pf inputmode="decimal" autocomplete="off" placeholder="' + lbl + '" value="' + defF + '">' : '') + '</div>' +
      '<div class="row"><button class="ghost" data-pig="1">تجاهل</button><button class="primary" data-pok="1" style="padding:9px">تسجيل</button></div></div>';
  });
  box.innerHTML = h + '</div>';
}

/**
 * Confirm/ignore one pending-SMS card. Extracted from index.html's `pendAction`.
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {object} ctx
 * @param {HTMLElement} card the `.sp[data-pid]` card the click happened in
 * @param {boolean} ok true = confirm (data-pok), false = ignore (data-pig)
 * @param {import('../../domain/compute.js').ComputeResult} computeResult
 */
export async function pendActionFromCard(store, ctx, card, ok, computeResult) {
  var state = store.getState();
  var id = card.dataset.pid;
  var items = pendingItems(state.wallets, state.inbox, liveTxs(state.ledger), computeResult);
  var it = items.filter(function (x) { return x.id === id; })[0];
  if (!it) return;
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  if (!ok) {
    store.patchUI({ pendKey: '' });
    await ignorePending(ctx.db, ctx.queue, ctx.deviceId, state.inbox, id);
    toast('اتجاهلت الرسالة');
    return;
  }
  var wid = card.querySelector('[data-pw]').value;
  if (!wid) { toast('اختار المحفظة الأول', true); return; }
  var fi = card.querySelector('[data-pf]'), F = fi ? Math.max(0, NUM(fi.value)) : 0;
  store.patchUI({ pendKey: '' });
  var res = await confirmPending(ctx.db, ctx.queue, ctx.deviceId, state.ledger, it, wid, F, computeResult, state.settings);
  if (!res.ok) { toast(MSG + ' (راجع رصيد المحفظة أو اختار محفظة تانية)', true); return; }
  toast('اتسجّلت: ' + PKIND[it.k] + ' ' + fm2(it.a));
}
