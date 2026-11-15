// @ts-check
// Renders one transaction row (or, for a multi-leg split, one grouped row).
// Shared by the today and history views. Extracted from index.html's
// `groupHTML` unchanged, taking `delId` (the two-tap void confirmation id)
// as an explicit parameter instead of reading `UI.delId`.
import { fmt, fm2, esc } from '../formatters.js';
import { KIND } from '../../domain/kinds.js';
import { baseK } from '../../domain/kinds.js';
import { hhmm } from '../../domain/time.js';

/** Cash-drawer direction for this kind (matches domain/money.js's `cd` sign) — out/cashout bring cash in. */
function isCashIn(kind) { var bk = baseK(kind); return bk === 'out' || bk === 'cashout'; }
function amtHTML(n, kind) { return '<div class="amt' + (isCashIn(kind) ? ' in' : '') + '">' + fmt(n) + '</div>'; }

/**
 * @param {object[]} L one transaction, or every leg of one split group
 * @param {import('../../domain/compute.js').ComputeResult} C
 * @param {boolean} withDel show the void button
 * @param {string|null} [delId] the tx id currently in its "confirm void?" state
 */
export function groupHTML(L, C, withDel, delId) {
  var t = L[0], pending = withDel && delId === t.id;
  if (t.k === 'settle') {
    var sb = withDel ? '<button class="del" data-del="' + esc(t.id) + '">' + (pending ? 'تأكيد الإلغاء' : 'إلغاء') + '</button>' : '';
    return '<div class="tx"><div><div class="t1">تسوية آجل · ' + esc(t.cn) + '</div><div class="t2 num">' + hhmm(t.ts) + ' · ' + (t.s === 'rc' ? 'استلمت كاش' : 'دفعت كاش') + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:4px"><div class="amt' + (t.s === 'rc' ? ' in' : '') + '">' + fmt(t.a) + '</div>' + sb + '</div></div>';
  }
  var nm0 = function (u) { var w = C.W[u.w]; return w ? w.w.name : 'محفظة محذوفة'; };
  var btn = withDel ? '<button class="del" data-del="' + esc(t.id) + '">' + (pending ? 'تأكيد الإلغاء' : 'إلغاء') + '</button>' : '';
  if (L.length > 1 || t.g) {
    var fin = L.filter(function (u) { return u.k !== 'xfer'; }), fsum = 0, ctot = 0, ftot = 0;
    L.forEach(function (u) { ctot += u.c || 0; ftot += u.f || 0; });
    var coll = t.gm === 'collect', title, amt, det;
    if (coll) {
      var fl = fin[fin.length - 1] || t;
      title = 'تجميع ثم ' + KIND[fl.k] + ' · ' + esc(nm0(fl));
      amt = fl.a;
      det = 'جمّع: ' + L.filter(function (u) { return u.k === 'xfer'; }).map(function (u) { return esc(nm0(u)) + ' ' + fmt(u.a); }).join('، ');
    } else {
      fin.forEach(function (u) { fsum += u.a; });
      title = 'تحويل مقسّم' + (t.k === 'iout' ? ' · إنستاباي' : '');
      amt = fsum;
      det = L.map(function (u) { return esc(nm0(u)) + ' ' + fmt(u.a); }).join('، ');
    }
    return '<div class="tx"><div><div class="t1">' + title + '</div><div class="t2 num">' + hhmm(t.ts) + (ftot ? ' · عمولة ' + fmt(ftot) : '') + (ctot ? ' · رسوم محافظ ' + fm2(ctot) : '') + (t.n ? ' · ' + esc(t.n) : '') + '</div><div class="t2">' + det + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:4px">' + amtHTML(amt, t.k) + btn + '</div></div>';
  }
  return '<div class="tx"><div><div class="t1">' + KIND[t.k] + ' · ' + esc(nm0(t)) + '</div><div class="t2 num">' + hhmm(t.ts) + (t.f ? ' · ' + ((baseK(t.k) === 'in' || baseK(t.k) === 'out') ? 'عمولة' : 'خسارة') + ' ' + fmt(t.f) : '') + (t.c ? ' · رسوم محفظة ' + fm2(t.c) : '') + (t.m ? ' · ' + (t.m === 'atm' ? 'ATM' : 'فوري') : '') + (t.n ? ' · ' + esc(t.n) : '') + (t.dl ? ' · آجل: ' + esc(t.cn) : '') + '</div></div>' +
    '<div style="display:flex;align-items:center;gap:4px">' + amtHTML(t.a, t.k) + btn + '</div></div>';
}
