// @ts-check
// Bridge to the native `Daftar` Capacitor plugin (Android APK only): background keep-alive service and
// phone notifications. Returns null on the web/PWA, where none of this is offered.

/**
 * @typedef {object} NativeStatus
 * @property {boolean} notif   notifications allowed
 * @property {boolean} battery app is exempt from battery optimisation
 * @property {boolean} keepalive background service switched on
 */
/**
 * @typedef {object} NativePort
 * @property {() => Promise<NativeStatus>} status
 * @property {(o: {on: boolean}) => Promise<NativeStatus>} setKeepAlive
 * @property {() => Promise<NativeStatus>} requestNotifPermission
 * @property {() => Promise<NativeStatus>} requestBatteryExemption
 * @property {(o: {id: number, title: string, body: string}) => Promise<void>} notify
 */

/** @returns {NativePort|null} */
export function getNative() {
  var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Daftar;
  return p || null;
}
