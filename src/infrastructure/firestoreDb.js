// @ts-check
// Firestore-backed `DbPort`, scoped to `users/{uid}`, plus the Firebase SDK
// script loader. Extracted from index.html's `makeFsDB`/`loadScripts`/`FB`
// unchanged. `onError` replaces the original's inline `toast(...)` call (an
// infrastructure module must not call into presentation directly).

export const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

/**
 * @param {any} fs a `firebase.firestore()` instance
 * @param {string} uid
 * @param {(e: any) => void} [onError]
 * @returns {import('../application/ports.js').DbPort}
 */
export function makeFsDB(fs, uid, onError) {
  var base = fs.collection('users').doc(uid);
  var fsErr = function (e) { if (onError) onError(e); };
  return {
    collection: function (c) {
      var cr = base.collection(c);
      return {
        doc: function (id) {
          var d = cr.doc(id);
          return {
            id: id, path: c + '/' + id,
            get: function () { return d.get(); },
            set: function (x) { d.set(x).catch(fsErr); return Promise.resolve(); },
            update: function (x) { d.update(x).catch(fsErr); return Promise.resolve(); },
            delete: function () { d.delete().catch(fsErr); return Promise.resolve(); },
          };
        },
        onSnapshot: function (next, err) {
          return cr.onSnapshot({ includeMetadataChanges: true }, function (sn) {
            next({ docs: sn.docs, size: sn.size, empty: sn.empty, metadata: sn.metadata });
          }, err);
        },
      };
    },
  };
}

/** @param {string[]} urls */
export function loadScripts(urls) {
  return urls.reduce(function (p, u) {
    return p.then(function () {
      return new Promise(function (res, rej) {
        var el = document.createElement('script');
        el.src = u;
        el.onload = res;
        el.onerror = function () { rej(new Error('load ' + u)); };
        document.head.appendChild(el);
      });
    });
  }, Promise.resolve());
}
