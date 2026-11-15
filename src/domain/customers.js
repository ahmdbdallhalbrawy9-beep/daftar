// @ts-check
// "الآجل": deferred cash. A deferred in/out moves the wallet now but not the drawer;
// the customer's open credit is tracked by name. Pure helpers shared by compute and the views.
import { nrm } from './numbers.js';

/** @param {string|null|undefined} name @returns {string} */
export function custKey(name) { return nrm(name).trim().toLowerCase(); }

/**
 * Change of the customer's net (positive = customer owes me) caused by a deferred in/out.
 * @param {'in'|'out'} bk @param {number} a @param {number} f
 */
export function deferDelta(bk, a, f) { return bk === 'in' ? -(a - f) : a + f; }

/**
 * Open (non-zero) customer accounts, biggest first.
 * @param {Record<string,{n:string,v:number,last:number}>} cust
 */
export function openCustomers(cust) {
  return Object.keys(cust || {}).map(function (k) { return Object.assign({ key: k }, cust[k]); })
    .filter(function (c) { return Math.abs(c.v) > 0.005; })
    .sort(function (p, q) { return Math.abs(q.v) - Math.abs(p.v); });
}

/** Totals: owe = what I owe people (cash I must hand out), due = what people owe me. */
export function custTotals(cust) {
  var owe = 0, due = 0;
  openCustomers(cust).forEach(function (c) { if (c.v < 0) owe -= c.v; else due += c.v; });
  return { owe: owe, due: due };
}

/**
 * Warning-only limit check for a new deferred operation.
 * @param {{cust?:Record<string,{v:number}>}} C
 * @param {{cm?:Record<string,{lim?:number}>}} settings
 * @param {string} name @param {'in'|'out'} bk @param {number} a @param {number} f
 * @param {number} [limInput] limit typed in the form (wins over the saved one)
 */
export function deferLimitCheck(C, settings, name, bk, a, f, limInput) {
  var key = custKey(name), cur = ((C.cust || {})[key] || { v: 0 }).v;
  var saved = ((settings.cm || {})[key] || {}).lim || 0;
  var lim = limInput && limInput > 0 ? limInput : saved;
  var nv = cur + deferDelta(bk, a, f);
  return { over: lim > 0 && Math.abs(nv) > lim + 0.005, newV: nv, lim: lim };
}
