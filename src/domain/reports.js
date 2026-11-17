// @ts-check
// Week / month reports built from the live transactions. Profit uses the same `daySum` rules as the
// history tab, so the numbers always agree with the daily screens.
import { dayKey } from './time.js';
import { baseK } from './kinds.js';
import { daySum } from './ledger.js';

/** @param {string} dk YYYYMMDD @returns {Date} noon UTC of that day */
function d0(dk) { return new Date(Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6, 8), 12)); }
/** @param {Date} d */
function key(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }

/**
 * First and last day (YYYYMMDD) of the period `offset` periods back from the one containing `todayKey`.
 * Week = Saturday..Friday (Egyptian week), month = calendar month.
 * @param {'week'|'month'} mode @param {number} offset 0 = this period, 1 = the previous one, ...
 * @param {string} todayKey
 */
export function periodRange(mode, offset, todayKey) {
  var t = d0(todayKey);
  if (mode === 'month') {
    var a = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - offset, 1, 12));
    var b = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - offset + 1, 0, 12));
    return { from: key(a), to: key(b) };
  }
  var sinceSat = (t.getUTCDay() + 1) % 7;
  var s = new Date(t.getTime() - (sinceSat + 7 * offset) * 864e5);
  return { from: key(s), to: key(new Date(s.getTime() + 6 * 864e5)) };
}

/**
 * @param {object[]} live live transactions (liveTxs)
 * @param {{id:string,name:string}[]} wallets
 * @param {string} from @param {string} to inclusive YYYYMMDD
 */
export function buildReport(live, wallets, from, to) {
  var list = live.filter(function (t) { var d = dayKey(t.ts); return d >= from && d <= to; });
  var total = daySum(list), sent = 0, recv = 0;
  var byW = {}, byD = {};
  wallets.forEach(function (w) { byW[w.id] = { id: w.id, name: w.name, n: 0, sent: 0, recv: 0, pf: 0 }; });
  list.forEach(function (t) {
    var d = dayKey(t.ts); (byD[d] = byD[d] || []).push(t);
    var bk = baseK(t.k);
    if (t.k !== 'xfer' && t.k !== 'settle' && byW[t.w]) {
      var r = byW[t.w], s = daySum([t]);
      r.pf += s.pf; r.n += s.n;
      if (bk === 'out') r.sent += t.a; else if (bk === 'in') r.recv += t.a;
    }
    if (bk === 'out') sent += t.a; else if (bk === 'in') recv += t.a;
  });
  var days = Object.keys(byD).sort().map(function (d) { var s = daySum(byD[d]); return { day: d, n: s.n, pf: s.pf }; });
  var wl = Object.keys(byW).map(function (k) { return byW[k]; }).filter(function (r) { return r.n || r.sent || r.recv || Math.abs(r.pf) > 0.005; })
    .sort(function (a, b) { return b.pf - a.pf; });
  return { from: from, to: to, total: total, sent: sent, recv: recv, wallets: wl, days: days };
}
