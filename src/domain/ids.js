// @ts-check
// Generic random id generator for new documents/records. Pure (Math.random +
// Date.now, no app state, no I/O) — lives in domain so both `application`
// (new tx/wallet/group ids) and `infrastructure` (device id fallback) can use
// it without application ever importing infrastructure.
//
// Correction to docs/ARCHITECTURE.md: that plan originally placed `rid` in
// `infrastructure/deviceId.js`. Implementing phase 4 surfaced that
// `application` use cases need it too (to build tx/wallet ids before
// persisting), and `application` must never import `infrastructure` — so it
// moved here instead. Noted in the phase 4 progress-log entry.

/** @param {string} p id prefix @returns {string} */
export function rid(p) {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}
