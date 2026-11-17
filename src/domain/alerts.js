// @ts-check
// Soft alerts for the wallets: a limit that is nearly used up, or a balance under the wallet's own minimum.
// Display only — nothing here changes a balance, a limit or a record.
import { walletRoom } from './limits.js';

/** Alert when the room left is this share of the limit (or less). */
export const LIMIT_ALERT = 0.2;

/**
 * @param {{id:string,name:string,active?:boolean,dayLimit?:number,monthLimit?:number,minBal?:number}[]} wallets
 * @param {Record<string,{bal:number,dOut:number,dIn:number,mOut:number,mIn:number}>} W compute result `W`
 * @param {{defDay:number,defMon:number}} settings
 * @returns {{id:string,name:string,parts:string[]}[]} one entry per wallet that needs attention
 */
export function walletAlerts(wallets, W, settings) {
  var out = [];
  wallets.forEach(function (w) {
    var x = W[w.id];
    if (!x || w.active === false) return;
    var dl = w.dayLimit || settings.defDay, ml = w.monthLimit || settings.defMon, r = walletRoom(dl, ml, x), parts = [];
    var chk = function (label, rem, lim) {
      if (lim > 0 && rem <= lim * LIMIT_ALERT + 1e-9) parts.push({ label: label, rem: Math.max(0, Math.round(rem)) });
    };
    // Receive room that is short only because the wallet's balance is high ("transfer") is not a
    // limit being used up, so it is not alerted — it would show for every well-funded wallet.
    chk('إرسال النهارده', r.dOut.rem, dl); if (r.dIn.why !== 'transfer') chk('استلام النهارده', r.dIn.rem, dl);
    chk('إرسال الشهر', r.mOut.rem, ml); if (r.mIn.why !== 'transfer') chk('استلام الشهر', r.mIn.rem, ml);
    var txt = parts.map(function (p) { return p.label + ' باقي ' + p.rem; });
    if (w.minBal && w.minBal > 0 && x.bal < w.minBal) txt.push('الرصيد ' + Math.round(x.bal) + ' أقل من الحد الأدنى ' + Math.round(w.minBal));
    if (txt.length) out.push({ id: w.id, name: w.name, parts: txt });
  });
  return out;
}
