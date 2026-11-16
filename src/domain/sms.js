// @ts-check
// Parses a Vodafone Cash SMS body into a confirmed-operation candidate.
// Extracted from index.html unchanged.
import { nrm, nv } from './numbers.js';

const N = '(\\d+(?:\\.\\d+)?)';

/** Small deterministic string hash (djb2) -> base36, used to give number-less SMS a stable id. @param {string} str */
function hash32(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * @param {string} body raw SMS text
 * @param {number} [date] SMS received timestamp; defaults to now
 * @returns {{id:string,ts:number,k:string,a:number,c?:number,p?:string,wn?:string,bal?:number}|null}
 */
export function parseSms(body, date) {
  var t = nrm(body), m, r, q;
  if (/طلب سحب/.test(t)) return null;
  // "تم شحن رصيد ب 30 ج بنجاح إلى رقم 010… وخصم 30 ج من محفظتك…": airtime bought from the wallet.
  // It carries no operation number, so the id is made from the SMS date + text (stable across re-scans).
  // What the wallet really lost is the "وخصم" amount (it can be more than the face value); 0 = free, ignore.
  if ((m = t.match(new RegExp('تم شحن رصيد\\s*ب\\s*' + N + '\\s*ج.*?إلى رقم\\s*(\\d{10,11}).*?وخصم\\s*' + N + '\\s*ج')))) {
    var ded = nv(m[3]);
    if (!(ded > 0)) return null;
    r = { id: 'c' + hash32(String(date || 0) + '|' + t), ts: date || Date.now(), k: 'pay', a: ded, p: 'شحن رصيد ' + m[2] };
    q = t.match(new RegExp('رصيد حسابك.*?الحالي\\D{0,3}' + N)); if (q) r.bal = nv(q[1]);
    return r;
  }
  var idm = t.match(/رقم العملية[^\d]{0,8}(\d{8,})/);
  if (!idm) return null;
  r = { id: idm[1], ts: date || Date.now() };
  var bal = function (re) { var q2 = t.match(re); if (q2) r.bal = nv(q2[1]); };
  if ((m = t.match(new RegExp('تم استلام مبلغ\\s*' + N)))) {
    r.k = 'in'; r.a = nv(m[1]);
    q = t.match(/محفظتك\s*(\d{10,11})/); if (q) r.wn = q[1];
    q = t.match(/من رقم\s*(\d+)\s*المسجل\s*بإسم\s*(.+?)\s*على رقم/);
    r.p = q ? q[2] : ((t.match(/من رقم\s*(\d+)/) || [])[1] || '');
    bal(new RegExp('رصيدك الحالي\\D{0,3}' + N));
  } else if ((m = t.match(new RegExp('تم دفع مبلغ\\s*' + N + '\\s*جني[هة]')))) {
    // "تم دفع مبلغ 47.99جنية لMidasbuyPayermax. رصيد محفظتك الحالي 1701.92 جنيه. رقم العملية …"
    r.k = 'pay'; r.a = nv(m[1]);
    q = t.match(/جني[هة]\s*ل\s*([^.]+?)\s*\.\s/); r.p = q ? q[1].trim() : '';
    bal(new RegExp('رصيد محفظتك الحالي\\D{0,3}' + N));
  } else if ((m = t.match(new RegExp('تم تحويل\\s*' + N + '\\s*جنيه')))) {
    r.k = 'out'; r.a = nv(m[1]);
    var f = t.match(new RegExp('مصاريف الخدمة\\s*' + N)); r.c = f ? nv(f[1]) : 0;
    r.p = (t.match(/لرقم\s*(\d+)/) || [])[1] || '';
    bal(new RegExp('رصيد حسابك.*?الحالي\\D{0,3}' + N));
  } else if ((m = t.match(new RegExp('تم سحب\\s*(?:مبلغ\\s*)?' + N + '\\s*جنيه')))) {
    r.k = 'cashout'; r.a = nv(m[1]);
    bal(new RegExp('رصيد حسابك الحالي\\D{0,3}' + N));
  } else if ((m = t.match(new RegExp('تم إيداع\\s*' + N)))) {
    r.k = 'dep'; r.a = nv(m[1]);
    var w = t.match(/إلى رقم\s*(\d{10,11})/); if (w) r.wn = w[1];
    bal(new RegExp('رصيدك الحالي\\D{0,3}' + N));
  } else return null;
  return r;
}
