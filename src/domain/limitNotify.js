// @ts-check
// Which "limit is nearly used up / used up" phone notifications are due right now.
// Pure: it only decides; main.js remembers what was already sent and talks to the phone.
import { walletRoom } from './limits.js';
import { LIMIT_ALERT } from './alerts.js';

/** @param {number} n */
function num(n) { return Math.round(n).toLocaleString('en-US'); }

/**
 * @param {{id:string,name:string,active?:boolean,dayLimit?:number,monthLimit?:number}[]} wallets
 * @param {Record<string,{bal:number,dOut:number,dIn:number,mOut:number,mIn:number}>} W compute result `W`
 * @param {{defDay:number,defMon:number}} settings
 * @param {string} dk today's day key (YYYYMMDD, Cairo)
 * @param {Record<string,number>} sent keys already notified (see `pruneSent`)
 * @returns {{notes:{id:string,title:string,body:string}[], keys:string[]}}
 *   notes = notifications to show now (one per wallet); keys = every key that is currently true
 *   (to be remembered as sent so it is not repeated today / this month).
 */
export function limitNotifications(wallets, W, settings, dk, sent) {
  var notes = [], keys = [], mk = dk.slice(0, 6);
  wallets.forEach(function (w) {
    var x = W[w.id];
    if (!x || w.active === false) return;
    var dl = w.dayLimit || settings.defDay, ml = w.monthLimit || settings.defMon, r = walletRoom(dl, ml, x), lines = [];
    // [id, label, room, limit, period]; a room that is short only because of another cap (the month, or
    // the wallet's own balance) is not "this limit being used up", so it is skipped like in the banner.
    var ms = [
      ['do', 'إرسال النهارده', r.dOut, dl, dk],
      ['di', 'استلام النهارده', r.dIn, dl, dk],
      ['mo', 'إرسال الشهر', r.mOut, ml, mk],
      ['mi', 'استلام الشهر', r.mIn, ml, mk],
    ];
    ms.forEach(function (m) {
      var room = m[2], lim = m[3];
      if (!(lim > 0) || room.why) return;
      var base = w.id + '|' + m[0] + '|', lowK = base + 'low|' + m[4], endK = base + 'end|' + m[4];
      if (room.rem < 1) {
        keys.push(lowK, endK);
        if (!sent[endK]) lines.push(m[1] + ': الحد خلص (من ' + num(lim) + ')');
      } else if (room.rem <= lim * LIMIT_ALERT + 1e-9) {
        keys.push(lowK);
        if (!sent[lowK] && !sent[endK]) lines.push(m[1] + ': باقي ' + num(room.rem) + ' من ' + num(lim) + ' (' + Math.round(room.rem / lim * 100) + '%)');
      }
    });
    if (lines.length) notes.push({ id: w.id, title: 'تنبيه ليميت: ' + w.name, body: lines.join('\n') });
  });
  return { notes: notes, keys: keys };
}

/** Drops remembered keys of past days / months. @param {Record<string,number>} sent @param {string} dk */
export function pruneSent(sent, dk) {
  var mk = dk.slice(0, 6), out = {};
  Object.keys(sent || {}).forEach(function (k) {
    var p = k.slice(k.lastIndexOf('|') + 1);
    if (p === dk || p === mk) out[k] = 1;
  });
  return out;
}

/** Small stable number for a wallet id, used as the notification id so the same wallet replaces its own. @param {string} s */
export function noteId(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 1000 + (Math.abs(h) % 1000000);
}
