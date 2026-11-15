// @ts-check
// The عملية (new operation) tab: pick a kind, type an amount, see the
// suggested wallet(s), save. Extracted from index.html's `renderTx`,
// `setupHTML`, `renderSplit`, `autoSplit` and `svcHTML` — reading the store
// instead of `S`/`UI`, and calling `application/transactions.js` /
// `application/wallets.js` instead of writing to Firestore inline.
import { $, $$ } from '../dom.js';
import { fmt, fm2, esc } from '../formatters.js';
import { toast } from '../components/toast.js';
import { NUM } from '../../domain/numbers.js';
import { baseK, isInsta, MSG, KIND } from '../../domain/kinds.js';
import { walletCost } from '../../domain/money.js';
import { entryChk, MSG_SM, WARN_SD, WARN_SM } from '../../domain/limits.js';
import { deferLimitCheck, custKey } from '../../domain/customers.js';
import { rank } from '../../domain/rank.js';
import { splitWallets, resolveCollector } from '../../domain/wallets.js';
import { buildPlan, suggestAutoSplit } from '../../domain/plan.js';
import { recordTransaction } from '../../application/transactions.js';
import { setupWallets } from '../../application/wallets.js';
import { setCustomerLimit } from '../../application/customers.js';
import { writable } from '../../application/sync.js';
import { showTab } from '../router.js';

/** Shared by the transaction and wallets tabs' service (vf/insta) switch. */
export function svcHTML(state) {
  return [['vf', 'فودافون كاش'], ['insta', 'إنستاباي']].map(function (x) {
    return '<button data-svc="' + x[0] + '" class="' + (state.ui.svc === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
  }).join('');
}

export function setupHTML() {
  return '<div class="card"><b>ابدأ من هنا</b><p class="small">هنجهز محافظك. تقدر تغيّر الأسماء والليميت بعدين. ليميت إنستاباي تقديري، عدّله حسب حسابك.</p>' +
    '<div class="f2"><div><label for="nVf">عدد محافظ فودافون</label><input id="nVf" inputmode="numeric" value="12"></div><div><label for="nIn">عدد حسابات إنستاباي</label><input id="nIn" inputmode="numeric" value="2"></div>' +
    '<div><label for="vfD">فودافون: ليميت يومي</label><input id="vfD" inputmode="numeric" value="60000"></div><div><label for="vfM">فودافون: ليميت شهري</label><input id="vfM" inputmode="numeric" value="200000"></div>' +
    '<div><label for="inD">إنستاباي: ليميت يومي</label><input id="inD" inputmode="numeric" value="120000"></div><div><label for="inM">إنستاباي: ليميت شهري</label><input id="inM" inputmode="numeric" value="400000"></div></div>' +
    '<button class="btn-primary" id="doSetup">إنشاء المحافظ</button></div>' +
    '<div class="card"><b>بعد كده</b><div class="small">1) اكتب رقم كل محفظة · 2) اظبط الأرصدة من الجرد · 3) سجّل نقدية الدرج أول اليوم · 4) سجّل عملياتك، أو أكّدها من الرسائل الجديدة.</div></div>';
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export function renderTx(store, C) {
  var state = store.getState(), ui = state.ui;
  var k = ui.kind, bk = baseK(k), isI = isInsta(k), A = NUM($('#amt').value), F = NUM($('#fee').value), sp0 = (k === 'out' || k === 'iout') && ui.sm !== 'one';
  $('#svcTx').innerHTML = svcHTML(state);
  $$('#kinds .kind').forEach(function (b) { b.classList.toggle('on', b.dataset.k === k); b.style.display = b.dataset.s === (ui.svc === 'insta' ? 'i' : 'v') ? '' : 'none'; });
  var isFee = bk === 'in' || bk === 'out' || k === 'cashout' || k === 'itopup';
  $('#feeRow').style.display = isFee ? 'flex' : 'none';
  $('#feeLbl').textContent = k === 'cashout' ? 'نسبة الخسارة (جنيه)' : k === 'itopup' ? 'رسوم الإيداع (جنيه)' : 'العمولة (جنيه)';
  if (isFee) {
    if (ui.pct == null) {
      store.patchUI({ pct: k === 'cashout' ? state.settings.feePctC : k === 'itopup' ? state.settings.feePctF : isI ? state.settings.feePctI : state.settings.feePct });
      ui = store.getState().ui;
    }
    if (!ui.feeManual) { F = Math.round(A * ui.pct / 100); $('#fee').value = A ? String(F) : ''; }
    var ps = k === 'itopup' ? [0.6, 0] : [0.5, 1, 1.5, 2];
    if (ps.indexOf(ui.pct) < 0) ps.push(ui.pct);
    if (k !== 'itopup') ps.sort(function (a, b) { return a - b; });
    var lbl = function (p) { return k === 'itopup' ? (p === 0 ? 'ماكينة ATM (مجاناً)' : p === 0.6 ? 'ماكينة فوري (0.6%)' : p + '%') : p + '%'; };
    $('#pcts').innerHTML = ps.map(function (p) { var on = (!ui.feeManual && ui.pct === p) ? ' on' : ''; return '<button class="chip' + on + '" data-p="' + p + '">' + lbl(p) + '</button>'; }).join('');
  } else F = 0;
  var c = 0, showCost = bk === 'out';
  $('#costRow').style.display = showCost ? 'flex' : 'none';
  if (showCost) {
    if (!ui.costManual) { c = walletCost(k, A, state.settings, ui.dest); $('#cost').value = A ? String(c) : ''; } else c = NUM($('#cost').value);
    $('#dest').innerHTML = k === 'out'
      ? [['vf', 'لمحفظة فودافون (1 ج)'], ['other', 'لشبكة تانية (0.5% بحد 15)']].map(function (d) { return '<button class="chip' + (ui.dest === d[0] ? ' on' : '') + '" data-d="' + d[0] + '">' + d[1] + '</button>'; }).join('')
      : '<span class="small">إنستاباي بياخد 0.1% بحد أقصى 20 جنيه</span>';
  }

  // "خيارات إضافية": آجل is only for a one-wallet in/out
  var xv = !sp0 && (bk === 'in' || bk === 'out');
  $('#xtra').style.display = xv ? '' : 'none';
  var dfOn = xv && $('#dlOn').checked;
  $('#dlBox').style.display = dfOn ? 'flex' : 'none';
  var dfName = $('#dlName').value.trim(), dfLim = NUM($('#dlLim').value);
  var names = {};
  Object.keys(state.settings.cm || {}).forEach(function (q) { names[q] = state.settings.cm[q].n; });
  Object.keys(C.cust || {}).forEach(function (q) { names[q] = C.cust[q].n; });
  var nkey = Object.keys(names).map(function (q) { return names[q]; }).sort().join('|');
  if ($('#custList').dataset.k !== nkey) {
    $('#custList').dataset.k = nkey;
    $('#custList').innerHTML = Object.keys(names).map(function (q) { return '<option value="' + esc(names[q]) + '">'; }).join('');
  }

  $('#costInp').style.display = sp0 ? 'none' : 'flex';
  var su = $('#setup');
  if (state.ready.wallets && state.synced && !state.wallets.length) {
    if (!ui.setupDone) { store.patchUI({ setupDone: true }); su.innerHTML = setupHTML(); }
  } else { su.innerHTML = ''; if (ui.setupDone) store.patchUI({ setupDone: false }); }

  var nt = $('#notice');
  if (!writable(state)) { nt.innerHTML = '<div class="notice' + (state.waited ? ' bad' : '') + '">' + (state.waited ? 'مش قادر يوصل للبيانات المشتركة. اتأكد من النت وسيب الصفحة مفتوحة.' : 'جارٍ تحميل البيانات…') + '</div>'; }
  else nt.innerHTML = '';

  $('#splitWrap').style.display = (k === 'out' || k === 'iout') ? 'flex' : 'none';
  $('#smodes').innerHTML = [['one', 'عادي (محفظة واحدة)'], ['direct', 'تقسيم مباشر على كذا محفظة'], ['collect', 'تجميع ثم تحويل']].map(function (m) { return '<button class="chip' + (ui.sm === m[0] ? ' on' : '') + '" data-sm="' + m[0] + '">' + m[1] + '</button>'; }).join('');
  $('#pickTitle').style.display = $('#picker').style.display = sp0 ? 'none' : '';
  $('#splitBox').style.display = sp0 ? 'flex' : 'none';
  if (sp0) { renderSplit(store, C, A, F); return; }

  var s = '';
  if (A > 0) {
    if (dfOn && bk === 'out') s = '<div>العميل هيدفع لك <b>' + fmt(A + F) + '</b> كاش بعدين</div><span class="muted">المحفظة بتنقص ' + fm2(A + c) + (c ? ' (منها رسوم ' + fm2(c) + ')' : '') + ' · الدرج ما بيتأثرش · صافي ربحك ' + fm2(F - c) + '</span>';
    else if (dfOn && bk === 'in') s = '<div>هتدّي العميل <b>' + fmt(A - F) + '</b> كاش بعدين</div><span class="muted">المحفظة بتزيد ' + fmt(A) + ' · الدرج ما بيتأثرش · ربحك ' + fmt(F) + '</span>';
    else if (bk === 'out') s = '<div>هتاخد من الزبون <b>' + fmt(A + F) + '</b> كاش</div><span class="muted">المحفظة بتنقص ' + fm2(A + c) + (c ? ' (منها رسوم ' + fm2(c) + ')' : '') + ' · صافي ربحك ' + fm2(F - c) + '</span>';
    else if (bk === 'in') s = '<div>هتدّي الزبون <b>' + fmt(A - F) + '</b> كاش</div><span class="muted">المحفظة بتزيد ' + fmt(A) + ' · ربحك ' + fmt(F) + '</span>';
    else if (k === 'topup') s = '<div>هتطلع <b>' + fmt(A) + '</b> من الدرج وتحطها في المحفظة</div>';
    else if (k === 'itopup') s = '<div>هتطلع <b>' + fmt(A + F) + '</b> من الدرج</div><span class="muted">الحساب بيزيد ' + fmt(A) + ' · رسوم ' + fmt(F) + '</span>';
    else if (k === 'cashout') s = '<div>هتاخد <b>' + fmt(A - F) + '</b> كاش في الدرج</div><span class="muted">المحفظة بتنقص ' + fmt(A) + ' · خسارة ' + fmt(F) + '</span>';
    else s = '<div>هتاخد <b>' + fmt(A) + '</b> من الحساب وتحطها في الدرج</div>';
  } else s = '<span class="muted">اكتب المبلغ وهيقترح لك أنسب محفظة</span>';
  var need = bk === 'in' && !dfOn ? A - F : bk === 'topup' ? A + F : 0, noCash = A > 0 && need > 0 && C.cash < need - 0.0001;
  if (noCash) s += '<div class="cashwarn">لا يوجد نقدية كافية في الدرج (المتاح ' + fmt(C.cash) + ')</div>';
  $('#sum').innerHTML = s;

  var list = rank(k, A, state.wallets, C, state.settings, c);
  if (!list.length) { $('#picker').innerHTML = '<div class="empty">' + (isI ? 'مفيش حساب إنستاباي. أضفه من تبويب المحافظ.' : 'مفيش محافظ مناسبة للعملية دي.') + '</div>'; $('#save').disabled = true; return; }
  var chosen = list.filter(function (r) { return r.w.id === ui.sel; })[0];
  if (!ui.manualSel || !chosen) { store.patchUI({ sel: list[0].w.id, manualSel: false }); ui = store.getState().ui; chosen = list[0]; }
  $('#pickTitle').textContent = (bk === 'in' || bk === 'out') && A > 0 ? 'اختار المحفظة (الأولى هي الأنسب)' : 'اختار المحفظة';
  var shown = ui.showAll ? list : list.slice(0, 4);
  if (!ui.showAll && chosen && shown.indexOf(chosen) < 0) shown = shown.concat([chosen]);
  var useLim = bk === 'in' || bk === 'out';
  var html = shown.map(function (r, i) {
    var w = r.w, dl = w.dayLimit || state.settings.defDay, pc = Math.max(0, Math.min(100, r.remD / dl * 100));
    if (r.remD > 0 && pc < 2) pc = 2;
    var cls = r.remD <= 0 ? 'full' : pc <= 25 ? 'hi' : '';
    var tags = (i === 0 && r.fits && A > 0 && useLim ? '<span class="tag rec">مقترحة</span>' : '') + (w.type === 'insta' ? '<span class="tag">إنستاباي</span>' : '') + (r.why.length && A > 0 ? '<span class="tag bad">' + esc(r.why[0]) + '</span>' : '');
    return '<button class="w' + (w.id === ui.sel ? ' sel' : '') + (!r.fits && A > 0 ? ' no' : '') + '" data-w="' + esc(w.id) + '">' +
      '<div class="l1"><span class="nm">' + esc(w.name) + (w.phone ? '<span class="ph">' + esc(w.phone) + '</span>' : '') + tags + '</span>' + (useLim ? '' : '<span class="num"><b>' + fmt(r.x.bal) + '</b> <span class="small">رصيد</span></span>') + '</div>' +
      (useLim ? '<div class="bar"><i class="' + cls + '" style="width:' + pc.toFixed(2) + '%"></i></div><div class="small num" style="display:flex;justify-content:space-between"><span>متبقي اليوم ' + fmt(Math.max(0, r.remD)) + '</span><span>متبقي الشهر ' + fmt(Math.max(0, r.remM)) + '</span></div>' : '') +
      '</button>';
  }).join('');
  if (list.length > shown.length) html += '<button class="more" data-more="1">عرض كل المحافظ (' + list.length + ')</button>';
  else if (ui.showAll && list.length > 4) html += '<button class="more" data-more="0">إخفاء</button>';
  $('#picker').innerHTML = html;
  var balBad = A > 0 && chosen && ((bk === 'out' && chosen.x.bal < A + c - 0.005) || (bk === 'cashout' && chosen.x.bal < A - 0.005));
  if (balBad) $('#sum').insertAdjacentHTML('beforeend', '<div class="cashwarn">' + MSG + '</div>');
  var blockM = false, extra = '';
  if (A > 0 && chosen) {
    var ec = entryChk(chosen.x, state.settings, A);
    if (bk === 'topup') {
      if (ec.m) { blockM = true; extra += '<div class="cashwarn">' + MSG_SM + '</div>'; }
      else if (ec.d) extra += '<div class="cashwarn soft">' + WARN_SD + '</div>';
    } else if (bk === 'in') {
      if (ec.m) extra += '<div class="cashwarn soft">' + WARN_SM + '</div>';
      else if (ec.d) extra += '<div class="cashwarn soft">' + WARN_SD + '</div>';
    }
  }
  var needName = dfOn && A > 0 && !dfName;
  if (needName) extra += '<div class="cashwarn">اكتب اسم العميل</div>';
  if (dfOn && dfName && A > 0) {
    var lc = deferLimitCheck(C, state.settings, dfName, bk, A, F, dfLim);
    if (lc.over) extra += '<div class="cashwarn soft">' + esc(deferWarnText(dfName, lc)) + '</div>';
  }
  if (extra) $('#sum').insertAdjacentHTML('beforeend', extra);
  $('#save').disabled = !(A > 0 && ui.sel && writable(state) && !noCash && !balBad && !blockM && !needName);
  $('#save').textContent = chosen && !chosen.fits && A > 0 && useLim ? 'سجّل برضه (المحفظة فوق الليميت)' : 'تسجيل العملية';
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {import('../../domain/compute.js').ComputeResult} C
 * @param {number} A @param {number} F
 */
export function renderSplit(store, C, A, F) {
  var state = store.getState(), ui = state.ui;
  var k = ui.kind, ws = splitWallets(k, state.wallets), coll = ui.sm === 'collect', box = $('#splitBox');
  if (coll) {
    var resolved = resolveCollector(ws, C, ui.col, A, state.settings);
    if (resolved !== ui.col) { store.patchUI({ col: resolved }); ui = store.getState().ui; }
  }
  var key = ui.sm + '|' + k + '|' + (coll ? ui.col : '') + '|' + ws.map(function (w) { return w.id + ':' + w.name; }).join(',');
  if (key !== ui.spKey) {
    store.patchUI({ spKey: key });
    var h = '<div class="small">' + (coll ? 'اختار المحفظة اللي هتجمّع فيها، وحدد كل محفظة هتحوّل لها كام. كل تحويل داخلي بياخد رسوم وليميت من المحفظة اللي بتبعت، وبعدين التحويل النهائي للزبون بيتخصم من المحفظة المجمِّعة.' : 'اكتب كل محفظة هتدفع كام للزبون. كل محفظة بتتخصم منها مبلغها + رسوم التحويل بتاعتها، وبتتحسب على ليميتها.') + '</div>';
    if (coll) h += '<div class="sp"><div class="l1"><b>المحفظة المجمِّعة</b><span class="small num" data-spown="1"></span></div><select id="spCol">' + ws.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>'; }).join('') + '</select></div>';
    h += ws.filter(function (w) { return !(coll && w.id === ui.col); }).map(function (w) {
      return '<div class="sp" data-spw="' + esc(w.id) + '"><div class="l1"><b>' + esc(w.name) + '</b><span class="small num">رصيد <span data-spb="' + esc(w.id) + '"></span></span></div>' +
        '<div class="row"><input data-spin="' + esc(w.id) + '" inputmode="decimal" autocomplete="off" placeholder="' + (coll ? 'هتحوّل للمجمِّعة كام' : 'هتدفع كام') + '" value="' + esc(ui.sp[w.id] || '') + '"><span class="small num" data-spf="' + esc(w.id) + '"></span></div>' +
        '<div class="small num" data-spl="' + esc(w.id) + '"></div></div>';
    }).join('');
    h += '<button class="btn-ghost" id="spAuto">وزّع تلقائي</button><div class="small num" id="spInfo"></div>';
    box.innerHTML = h;
    if (coll) $('#spCol').value = ui.col;
  }
  var pl = buildPlan({ kind: k, amount: A, fee: F, splitMode: ui.sm, collectorId: ui.col, splits: ui.sp, dest: ui.dest }, ws, C, state.settings), over = false;
  ws.forEach(function (w) {
    var x = C.W[w.id], dl = w.dayLimit || state.settings.defDay, ml = w.monthLimit || state.settings.defMon, leg = null;
    pl.legs.forEach(function (l) { if (l.w === w.id) leg = l; });
    if (leg && (x.dOut + leg.a > dl || x.mOut + leg.a > ml)) over = true;
    var b = $('[data-spb="' + w.id + '"]'); if (b) b.textContent = fmt(x.bal);
    var l1 = $('[data-spl="' + w.id + '"]'); if (l1) l1.textContent = 'متبقي إرسال اليوم ' + fmt(Math.max(0, dl - x.dOut)) + ' · الشهر ' + fmt(Math.max(0, ml - x.mOut));
    var f1 = $('[data-spf="' + w.id + '"]'); if (f1) { f1.textContent = leg ? 'رسوم ' + fm2(leg.c) : ''; f1.className = 'small num' + (pl.bad[w.id] ? ' bad' : ''); }
    var row = $('[data-spw="' + w.id + '"]'); if (row) row.classList.toggle('bad', !!pl.bad[w.id]);
  });
  if (coll) {
    var X = C.W[ui.col], o = $('[data-spown]');
    if (o && X) o.textContent = 'رصيد ' + fmt(X.bal) + (A > 0 ? ' · نصيبها من رصيدها ' + fmt(Math.max(0, pl.own)) + ' · رسوم التحويل للزبون ' + fm2(pl.cf || 0) : '');
  }
  var info = $('#spInfo');
  if (info) {
    if (!(A > 0)) info.textContent = 'اكتب المبلغ فوق الأول';
    else if (!coll) info.textContent = 'موزّع ' + fm2(pl.sum) + ' من ' + fm2(A) + (Math.abs(pl.diff) < 0.005 ? ' ✓' : ' · باقي ' + fm2(pl.diff));
    else info.textContent = 'هتتجمّع ' + fm2(pl.sum) + ' من المحافظ التانية، والتحويل النهائي ' + fm2(A) + ' من المجمِّعة';
  }
  var s = '';
  if (A > 0) s = '<div>هتاخد من الزبون <b>' + fmt(A + F) + '</b> كاش</div><span class="muted">رسوم المحافظ ' + fm2(pl.ctot) + ' · صافي ربحك ' + fm2(F - pl.ctot) + '</span>';
  else s = '<span class="muted">اكتب المبلغ وبعدين وزّعه على المحافظ</span>';
  if (pl.stuckM) s += '<div class="cashwarn">' + MSG_SM + '</div>';
  else if (pl.stuckD) s += '<div class="cashwarn soft">' + WARN_SD + '</div>';
  if (pl.short) s += '<div class="cashwarn">' + MSG + '</div>';
  else if (coll && A > 0 && pl.own < -0.005) s += '<div class="cashwarn">المبلغ المحوَّل للمجمِّعة أكبر من المطلوب</div>';
  $('#sum').innerHTML = s;
  $('#save').disabled = !(pl.ok && writable(state));
  $('#save').textContent = pl.ok && over ? 'سجّل برضه (فوق الليميت)' : 'تسجيل العملية';
}

/** Warning text for a deferred op that pushes a customer's balance over his limit. */
export function deferWarnText(name, lc) {
  return 'تنبيه: الآجل على ' + name + ' هيوصل ' + fmt(Math.abs(lc.newV)) + ' وده فوق الحد (' + fmt(lc.lim) + ')';
}

/** @param {ReturnType<typeof import('../store.js').createStore>} store @param {import('../../domain/compute.js').ComputeResult} C */
export function autoSplitAction(store, C) {
  var state = store.getState(), ui = state.ui;
  var A = NUM($('#amt').value);
  if (!(A > 0)) { toast('اكتب المبلغ الأول', true); return; }
  var ws = splitWallets(ui.kind, state.wallets);
  var collectorId = ui.sm === 'collect' ? resolveCollector(ws, C, ui.col, A, state.settings) : null;
  var res = suggestAutoSplit(ui.kind, ui.sm, collectorId, ws, C, state.settings, ui.dest, A);
  store.patchUI({ sp: res.splits, spKey: '', col: collectorId });
  if (res.rest > 0.005) toast(MSG, true);
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {{db: import('../../application/ports.js').DbPort, queue: (fn:()=>Promise<any>)=>Promise<any>}} ctx
 */
export async function doSetupAction(store, ctx) {
  var state = store.getState();
  var nv = NUM($('#nVf').value) | 0, ni = NUM($('#nIn').value) | 0;
  var vd = NUM($('#vfD').value) || 60000, vm = NUM($('#vfM').value) || 200000;
  var idl = NUM($('#inD').value) || 120000, im = NUM($('#inM').value) || 400000;
  if (!nv && !ni) { toast('اكتب عدد المحافظ', true); return; }
  if (!writable(state)) { toast('استنى لحد ما البيانات تتحمّل', true); return; }
  var btn = $('#doSetup'); if (btn) btn.disabled = true;
  var res = await setupWallets(ctx.db, ctx.queue, { vfCount: nv, instaCount: ni, vfDayLimit: vd, vfMonthLimit: vm, instaDayLimit: idl, instaMonthLimit: im });
  if (res.ok) {
    toast('اتجهزت المحافظ. دلوقتي اكتب أرصدتها من تبويب "اليوم"');
    showTab(store, 'day');
  } else if (btn) btn.disabled = false;
}

/**
 * @param {ReturnType<typeof import('../store.js').createStore>} store
 * @param {{db: import('../../application/ports.js').DbPort, queue: (fn:()=>Promise<any>)=>Promise<any>, clock: import('../../application/ports.js').ClockPort, deviceId: string}} ctx
 * @param {import('../../domain/compute.js').ComputeResult} C
 */
export async function saveAction(store, ctx, C) {
  var state = store.getState(), ui = state.ui;
  var k = ui.kind, A = NUM($('#amt').value), F = (baseK(k) === 'in' || baseK(k) === 'out' || k === 'cashout' || k === 'itopup') ? NUM($('#fee').value) : 0;
  if (!(A > 0) || !writable(state)) return;
  var note = $('#note').value.trim();
  var isSplit = (k === 'out' || k === 'iout') && ui.sm !== 'one';
  var ws = isSplit ? splitWallets(k, state.wallets) : state.wallets;
  var cc = 0;
  if (!isSplit) { if (baseK(k) === 'out') cc = NUM($('#cost').value); }
  var xv = !isSplit && (baseK(k) === 'in' || baseK(k) === 'out');
  var deferred = xv && $('#dlOn').checked, cname = $('#dlName').value.trim(), clim = NUM($('#dlLim').value);
  var lc = deferred && cname ? deferLimitCheck(C, state.settings, cname, baseK(k), A, F, clim) : null;
  var params = {
    deferred: deferred, customer: cname,
    kind: k, amount: A, fee: F, cost: cc, dest: ui.dest, note: note,
    selectedWalletId: ui.sel, splitMode: ui.sm, splits: ui.sp, collectorId: ui.col,
  };
  var res = await recordTransaction(ctx.db, ctx.queue, ctx.clock, ctx.deviceId, state.ledger, params, ws, C, state.settings);
  if (!res.ok) {
    if (res.error === 'insufficient') toast(MSG, true);
    else if (res.error === 'choose-collector') toast('حدد المحافظ اللي هتجمّع منها', true);
    else if (res.error === 'split-mismatch') toast('مجموع المبالغ لازم يساوي ' + fm2(A), true);
    else if (res.error === 'stuck-month') toast(MSG_SM, true);
    else if (res.error === 'need-name') toast('اكتب اسم العميل', true);
    return;
  }
  var warnTxt = (res.warn === 'm' ? WARN_SM : res.warn === 'd' ? WARN_SD : '') + (lc && lc.over ? ' ' + deferWarnText(cname, lc) : '');
  if (deferred && clim > 0) {
    var cur = (state.settings.cm || {})[custKey(cname)];
    if (!cur || cur.lim !== clim) await setCustomerLimit(ctx.db, ctx.queue, store.getState().settings, cname, clim);
  }
  if (deferred) { $('#dlOn').checked = false; $('#dlName').value = ''; $('#dlLim').value = ''; }
  if (isSplit) {
    toast('اتسجّلت: ' + (ui.sm === 'collect' ? 'تجميع ثم ' : 'تحويل مقسّم ') + KIND[k] + ' ' + fmt(A) + ' · ' + res.records.length + ' حركات' + (warnTxt ? ' — ' + warnTxt : ''));
    $('#amt').value = ''; $('#note').value = ''; $('#fee').value = ''; $('#cost').value = '';
    store.patchUI({ feeManual: false, costManual: false, dest: 'vf', sp: {}, spKey: '', col: null });
    $('#amt').focus();
    return;
  }
  var chosenWallet = state.wallets.filter(function (x) { return x.id === ui.sel; })[0];
  toast('اتسجّلت: ' + (deferred ? 'آجل · ' : '') + KIND[k] + ' ' + fmt(A) + ' · ' + (chosenWallet ? chosenWallet.name : '') + (warnTxt ? ' — ' + warnTxt : ''));
  $('#amt').value = ''; $('#note').value = ''; $('#fee').value = ''; $('#cost').value = '';
  store.patchUI({ feeManual: false, costManual: false, dest: 'vf', manualSel: false });
  $('#amt').focus();
}
