// @ts-check
// Serializes async write operations so writes never race each other (matches
// index.html's `queue`/`Q`). `onError` is called (not thrown) on a failed
// write, same as the original's inline toast — the composition root wires it
// to the toast component.

/** @param {(e: any) => void} [onError] */
export function createWriteQueue(onError) {
  var Q = Promise.resolve();
  /** @param {() => Promise<any>} fn */
  return function queue(fn) {
    Q = Q.then(fn).catch(function (e) { if (onError) onError(e); });
    return Q;
  };
}
