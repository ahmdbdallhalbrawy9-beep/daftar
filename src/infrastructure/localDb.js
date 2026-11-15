// @ts-check
// Local-storage-backed fallback implementing the same `DbPort` shape as
// Firestore (so `application` use cases don't know which one they're
// talking to). Extracted from index.html's `makeLocalDB` unchanged.
import { getItem, setItem } from './storage.js';

/**
 * @returns {import('../application/ports.js').DbPort & {__dump: () => object, __load: (o: object) => void}}
 */
export function makeLocalDB() {
  var data = {}, subs = [];
  try { data = JSON.parse(getItem('dw_local') || '{}'); } catch (e) { /* ignore */ }
  var save = function () { setItem('dw_local', JSON.stringify(data)); };
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  var snap = function (p) {
    return {
      id: p.split('/').pop(), exists: p in data,
      data: function () { return p in data ? clone(data[p]) : undefined; },
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  };
  var docsOf = function (c) {
    var n = c.split('/').length + 1;
    return Object.keys(data).filter(function (p) { return p.indexOf(c + '/') === 0 && p.split('/').length === n; }).sort().map(snap);
  };
  var notify = function () { subs.slice().forEach(function (s) { s(); }); };
  return /** @type {any} */ ({
    __dump: function () { return clone(data); },
    __load: function (o) { data = clone(o); save(); notify(); },
    collection: function (c) {
      return {
        doc: function (id) {
          var p = c + '/' + id;
          return {
            id: id, path: p,
            get: function () { return Promise.resolve(snap(p)); },
            set: function (d) { data[p] = clone(d); save(); notify(); return Promise.resolve(); },
            update: function (d) {
              if (!(p in data)) return Promise.reject({ code: 'invalid_argument' });
              Object.assign(data[p], clone(d)); save(); notify(); return Promise.resolve();
            },
            delete: function () { delete data[p]; save(); notify(); return Promise.resolve(); },
          };
        },
        onSnapshot: function (next) {
          var f = function () {
            var d = docsOf(c);
            next({ docs: d, size: d.length, empty: !d.length, metadata: { fromCache: false, hasPendingWrites: false } });
          };
          subs.push(f); setTimeout(f, 0);
          return function () { subs.splice(subs.indexOf(f), 1); };
        },
      };
    },
  });
}
