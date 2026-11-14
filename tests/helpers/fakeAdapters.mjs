// Fake DbPort/ClockPort/AuthPort/SmsPort implementations for application
// use-case tests. Not part of the shipped app — test-only.

/**
 * A fake DbPort backed by a plain in-memory object, shaped exactly like
 * infrastructure/localDb.js and infrastructure/firestoreDb.js's real ones.
 * @param {Record<string, object>} [initialDocs] "collection/id" -> data
 */
export function makeFakeDb(initialDocs) {
  var data = {};
  Object.keys(initialDocs || {}).forEach(function (k) { data[k] = initialDocs[k]; });
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  return {
    __dump: function () { return clone(data); },
    collection: function (name) {
      return {
        doc: function (id) {
          var p = name + '/' + id;
          return {
            id: id, path: p,
            get: function () {
              return Promise.resolve({ id: id, exists: p in data, data: function () { return p in data ? clone(data[p]) : undefined; } });
            },
            set: function (d) { data[p] = clone(d); return Promise.resolve(); },
            update: function (d) {
              if (!(p in data)) return Promise.reject({ code: 'invalid_argument' });
              Object.assign(data[p], clone(d));
              return Promise.resolve();
            },
            delete: function () { delete data[p]; return Promise.resolve(); },
          };
        },
        onSnapshot: function (next) {
          var prefix = name + '/';
          var docs = Object.keys(data).filter(function (p) { return p.indexOf(prefix) === 0; }).map(function (p) {
            return { id: p.slice(prefix.length), exists: true, data: function () { return clone(data[p]); } };
          });
          var fire = function () { next({ docs: docs, size: docs.length, empty: !docs.length, metadata: {} }); };
          setTimeout(fire, 0);
          return function () { /* unsubscribe no-op */ };
        },
      };
    },
  };
}

/** @param {number} [startTs] */
export function makeFakeClock(startTs) {
  var t = startTs || 1700000000000;
  return { now: function () { return t; }, advance: function (ms) { t += ms; return t; }, set: function (ts) { t = ts; } };
}

/** @param {Record<string,string>} [codes] email -> error code to reject with */
export function makeFakeAuth(codes) {
  codes = codes || {};
  var listeners = [];
  return {
    signIn: function (email) { if (codes[email]) return Promise.reject({ code: codes[email] }); return Promise.resolve(); },
    signUp: function (email) { if (codes[email]) return Promise.reject({ code: codes[email] }); return Promise.resolve(); },
    sendPasswordReset: function (email) { if (codes[email]) return Promise.reject({ code: codes[email] }); return Promise.resolve(); },
    signOut: function () { return Promise.resolve(); },
    onChange: function (cb) { listeners.push(cb); },
    __emit: function (user) { listeners.forEach(function (cb) { cb(user); }); },
  };
}

/** @param {{permission?:string, messages?:object[]}} [opts] */
export function makeFakeSms(opts) {
  opts = opts || {};
  var permission = opts.permission || 'granted';
  return {
    checkPermissions: function () { return Promise.resolve({ sms: permission }); },
    requestPermissions: function () { return Promise.resolve({ sms: permission }); },
    getSms: function () { return Promise.resolve({ messages: opts.messages || [] }); },
  };
}
