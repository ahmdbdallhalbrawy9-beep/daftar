// @ts-check
// Parses a Vodafone Cash SMS body into a confirmed-operation candidate.
// Extracted from index.html unchanged.
import { nrm, nv } from './numbers.js';

const N = '(\\d+(?:\\.\\d+)?)';

/**
 * @param {string} body raw SMS text
 * @param {number} [date] SMS received timestamp; defaults to now
 * @returns {{id:string,ts:number,k:string,a:number,c?:number,p?:string,wn?:string,bal?:number}|null}
 */
export function parseSms(body, date) {
  var t = nrm(body), m, r, q;
  if (/طلب سحب/.test(t)) return null;
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
