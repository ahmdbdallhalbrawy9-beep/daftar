// @ts-check
// Bridges to the native `SmsReader` Capacitor plugin (Android APK only).
// Returns null on the web/PWA, where SMS import simply isn't offered.

/** @returns {import('../application/ports.js').SmsPort|null} */
export function getSmsPlugin() {
  var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SmsReader;
  return p || null;
}
