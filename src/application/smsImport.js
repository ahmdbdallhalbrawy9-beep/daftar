// @ts-check
// Pending-SMS inbox: reading/saving the per-device inbox, deriving confirmable
// items with a suggested wallet, confirming/ignoring one, and the scan itself
// (takes an SmsPort — never touches `window.Capacitor` directly).
import { parseSms } from '../domain/sms.js';
import { dayStart } from '../domain/time.js';
import { rid } from '../domain/ids.js';
import { persistTxs } from './transactions.js';

/**
 * @param {Record<string, {items?: object, ign?: string[]}>} inbox
 * @param {string} deviceId
 */
export function readInbox(inbox, deviceId) {
  var o = inbox[deviceId] || {};
  return { items: Object.assign({}, o.items || {}), ign: (o.ign || []).slice() };
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 * @param {{items: object, ign: string[]}} inboxPatch
 */
export function saveInbox(db, queue, deviceId, inboxPatch) {
  return queue(function () { return db.collection('settings').doc('inbox_' + deviceId).set(inboxPatch); })
    .then(function () { return inboxPatch; });
}

/**
 * Every SMS item any phone has seen, by id (later phones' fields win).
 * @param {Record<string, {items?: object}>} inbox
 * @returns {Record<string, any>}
 */
export function allInboxItems(inbox) {
  /** @type {Record<string, any>} */
  var all = {};
  Object.keys(inbox || {}).forEach(function (d) {
    var o = inbox[d] || {};
    Object.keys(o.items || {}).forEach(function (i) { all[i] = Object.assign(all[i] || {}, /** @type {any} */ (o.items)[i]); });
  });
  return all;
}

/**
 * Pending SMS-derived operations not yet confirmed or ignored, each with a
 * suggested wallet (`.sug`) guessed from the destination phone or the
 * resulting balance the SMS reported.
 * @param {object[]} wallets
 * @param {Record<string, {items?: object, ign?: string[]}>} inbox
 * @param {object[]} liveTxList (`domain/ledger.js`'s `liveTxs(ledger)`)
 * @param {import('../domain/compute.js').ComputeResult} computeResult
 */
export function pendingItems(wallets, inbox, liveTxList, computeResult) {
  var C = computeResult;
  var done = {};
  liveTxList.forEach(function (t) { if (t.sid) done[t.sid] = 1; });
  var ign = {}, all = {};
  Object.keys(inbox).forEach(function (d) {
    var o = inbox[d] || {};
    (o.ign || []).forEach(function (i) { ign[i] = 1; });
    Object.keys(o.items || {}).forEach(function (i) { all[i] = Object.assign(all[i] || {}, o.items[i]); });
  });
  var list = Object.keys(all).filter(function (i) { return !done[i] && !ign[i]; }).map(function (i) { return all[i]; })
    .sort(function (a, b) { return a.ts - b.ts; });
  var vb = {};
  wallets.forEach(function (w) { if (C.W[w.id]) vb[w.id] = C.W[w.id].bal; });
  list.forEach(function (it) {
    var delta = it.k === 'out' ? -(it.a + (it.c || 0)) : (it.k === 'cashout' || it.k === 'pay') ? -it.a : it.a;
    var cand = wallets.filter(function (w) { return w.active !== false && w.type !== 'insta'; }), pick = null;
    if (it.wn) {
      var d10 = String(it.wn).slice(-10);
      cand.forEach(function (w) { if (String(w.phone || '').replace(/\D/g, '').slice(-10) === d10) pick = w.id; });
    }
    if (!pick && it.bal != null) {
      var hit = cand.filter(function (w) { return Math.abs(vb[w.id] + delta - it.bal) < 0.011; });
      if (hit.length === 1) pick = hit[0].id;
    }
    it.sug = pick;
    // matched by phone number (not by balance): tell the card if the balance after the SMS disagrees with the app
    delete it.drift;
    if (pick && it.wn && it.bal != null) {
      var dr = Math.round((it.bal - (vb[pick] + delta)) * 100) / 100;
      if (Math.abs(dr) > 0.5) { it.drift = dr; it.driftTo = Math.round((vb[pick] + delta) * 100) / 100; }
    }
    if (pick) vb[pick] += delta;
  });
  return list;
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 * @param {Record<string, object>} inbox
 * @param {string} itemId
 */
export async function ignorePending(db, queue, deviceId, inbox, itemId) {
  var m = readInbox(inbox, deviceId);
  if (m.ign.indexOf(itemId) < 0) m.ign.push(itemId);
  await saveInbox(db, queue, deviceId, m);
  return m;
}

/**
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {string} deviceId
 * @param {Record<string, object[]>} ledger
 * @param {{id:string,ts:number,k:string,a:number,c?:number,p?:string}} item
 * @param {string} walletId
 * @param {number} fee
 * @param {import('../domain/compute.js').ComputeResult} computeResult
 * @param {{vfSame:number}} settings
 * @param {{deferred?: boolean, customer?: string}} [opts] "آجل" (in/out only)
 */
export async function confirmPending(db, queue, deviceId, ledger, item, walletId, fee, computeResult, settings, opts) {
  if (!walletId) return { ok: false, error: 'no-wallet' };
  var F = Math.max(0, fee || 0), x = computeResult.W[walletId];
  var rec = { id: rid('t'), ts: item.ts, w: walletId, a: item.a, f: F, n: item.p || '', sid: item.id };
  if (item.k === 'in') rec.k = 'in';
  else if (item.k === 'out') { rec.k = 'out'; rec.c = item.c || 0; rec.d = (item.c || 0) <= settings.vfSame + 0.0001 ? 'vf' : 'other'; }
  else if (item.k === 'pay') { rec.k = 'out'; rec.pay = 1; rec.c = 0; rec.d = 'vf'; rec.f = F; }
  else if (item.k === 'cashout') rec.k = 'cashout';
  else { rec.k = 'topup'; rec.f = 0; }
  if (x && ((rec.k === 'out' && x.bal < item.a + (item.c || 0) - 0.005) || (rec.k === 'cashout' && x.bal < item.a - 0.005))) {
    return { ok: false, error: 'insufficient' };
  }
  if (opts && opts.deferred && (rec.k === 'in' || rec.k === 'out')) {
    var cn = (opts.customer || '').trim();
    if (!cn) return { ok: false, error: 'need-name' };
    rec.dl = 1; rec.cn = cn;
  }
  await persistTxs(db, queue, deviceId, ledger, [rec]);
  return { ok: true, record: rec };
}

/**
 * Pulls new SMS via the given port, parses Vodafone Cash ones, and merges any
 * new/changed confirmable items into this device's inbox.
 * @param {import('./ports.js').SmsPort} smsPort
 * @param {import('./ports.js').DbPort} db
 * @param {(fn: () => Promise<any>) => Promise<any>} queue
 * @param {import('./ports.js').ClockPort} clock
 * @param {string} deviceId
 * @param {Record<string, object>} inbox every device's inbox (for the shared ignore-list)
 * @param {object[]} liveTxList
 * @param {number} lastScanTs 0 if never scanned
 * @param {boolean} manual true for an explicit "scan now" tap (requests permission, scans further back)
 */
export async function scanForSms(smsPort, db, queue, clock, deviceId, inbox, liveTxList, lastScanTs, manual) {
  var st = await smsPort.checkPermissions();
  if (st.sms !== 'granted') {
    if (!manual) return { ok: false, error: 'no-permission', lastScanTs: lastScanTs };
    st = await smsPort.requestPermissions();
    if (st.sms !== 'granted') return { ok: false, error: 'permission-denied', lastScanTs: lastScanTs };
  }
  var last = lastScanTs || 0;
  var since = manual || !last ? dayStart(clock.now() - 864e5) : last - 60000;
  var res = await smsPort.getSms({ since: since, limit: 500 });
  var msgs = (res && res.messages) || [];
  var found = {}, maxd = last;
  msgs.forEach(function (m) {
    maxd = Math.max(maxd, m.date || 0);
    if (!/vf/i.test(m.address || '')) return;
    var r = parseSms(m.body, m.date);
    if (!r) return;
    found[r.id] = found[r.id] ? Object.assign(found[r.id], r) : r;
  });
  var my = readInbox(inbox, deviceId), done = {};
  liveTxList.forEach(function (t) { if (t.sid) done[t.sid] = 1; });
  var ign = {};
  Object.keys(inbox).forEach(function (d) { ((inbox[d] || {}).ign || []).forEach(function (i) { ign[i] = 1; }); });
  var add = 0, upd = false;
  Object.keys(found).forEach(function (id) {
    if (done[id] || ign[id]) return;
    var old = my.items[id];
    if (!old) { my.items[id] = found[id]; add++; upd = true; }
    else {
      var mg = Object.assign({}, old, found[id]);
      if (JSON.stringify(mg) !== JSON.stringify(old)) { my.items[id] = mg; upd = true; }
    }
  });
  if (upd) await saveInbox(db, queue, deviceId, my);
  return { ok: true, added: add, updated: upd, lastScanTs: maxd || clock.now() };
}
