// @ts-check
// Daily/monthly limit progress bars. Extracted from index.html's `remBar`/
// `limBar` unchanged. (`limBarOld` was unused dead code in index.html —
// confirmed in docs/inventory.md §5 — and is dropped, not moved.)
import { fmt } from '../formatters.js';

var WHY = { transfer: 'محدود بالتحويل', month: 'محدود بالليميت الشهري' };

/** @param {string} lbl @param {number} rem @param {number} lim @param {string} [why] 'transfer' | 'month' */
export function remBar(lbl, rem, lim, why) {
  var r = Math.max(0, rem), pc = lim > 0 ? Math.max(0, Math.min(100, r / lim * 100)) : 0;
  if (r > 0 && pc < 2) pc = 2;
  var cls = r <= 0 ? 'full' : pc <= 25 ? 'hi' : '';
  return '<div class="lim1"><div class="small num"><span>' + lbl + '</span><span>متبقي ' + fmt(r) + (rem < 0 ? ' (تجاوز ' + fmt(-rem) + ')' : '') + ' من ' + fmt(lim) + '</span></div><div class="bar"><i class="' + cls + '" style="width:' + pc.toFixed(2) + '%"></i></div>' +
    (why && WHY[why] ? '<div class="limnote">' + WHY[why] + '</div>' : '') + '</div>';
}

/**
 * One limit block (today or month). `room` comes from `walletRoom` — the receive/send numbers are the
 * real ones (smaller than the official limit when the wallet could not send the money out again, or
 * when the month has less room left than today).
 * @param {string} label @param {{out:{rem:number,why:string}, in:{rem:number,why:string}}} room @param {number} lim
 */
export function limBar(label, room, lim) {
  return '<div class="lim" style="gap:5px"><div class="small"><b>' + label + '</b></div>' +
    remBar('إرسال (تحويل)', room.out.rem, lim, room.out.why) + remBar('استلام (سحب)', room.in.rem, lim, room.in.why) + '</div>';
}
