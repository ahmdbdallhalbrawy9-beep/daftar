// @ts-check
// Cairo-time day/month keys. All limits and daily closes key off these, regardless
// of the device's own clock. Extracted from index.html unchanged.

const CF = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** @param {number} n @returns {string} */
export function pad(n) { return String(n).padStart(2, '0'); }

/**
 * @param {number} ts epoch ms
 * @returns {{year:string,month:string,day:string,hour:string,minute:string,second:string}}
 */
export function cp(ts) {
  var o = {};
  CF.formatToParts(new Date(ts)).forEach(function (q) { o[q.type] = q.value; });
  return /** @type {any} */ (o);
}

/** @param {number} ts @returns {string} YYYYMMDD in Cairo time */
export function dayKey(ts) { var o = cp(ts); return o.year + o.month + o.day; }

/** @param {number} ts @returns {string} HH:MM in Cairo time */
export function hhmm(ts) { var o = cp(ts); return o.hour + ':' + o.minute; }

/** @param {number} ts @returns {number} epoch ms of 00:00:00.000 Cairo time on ts's day */
export function dayStart(ts) {
  var o = cp(ts), t = ts - ((+o.hour * 3600 + (+o.minute) * 60 + (+o.second)) * 1000) - (ts % 1000), k = dayKey(ts);
  while (dayKey(t) !== k) t += 60000;
  while (dayKey(t - 60000) === k) t -= 60000;
  return t;
}

/** @param {string} dk YYYYMMDD @param {number} n days to add (may be negative) @returns {string} YYYYMMDD */
export function shiftDay(dk, n) {
  var d = new Date(Date.UTC(+dk.slice(0, 4), +dk.slice(4, 6) - 1, +dk.slice(6, 8) + n));
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}
