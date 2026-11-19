// @ts-check
// Bridge to the native `Daftar` Capacitor plugin (Android APK only): background keep-alive service and
// phone notifications. Returns null on the web/PWA, where none of this is offered.

/**
 * @typedef {object} NativeStatus
 * @property {boolean} notif   notifications allowed
 * @property {boolean} battery app is exempt from battery optimisation
 * @property {boolean} keepalive background service switched on
 * @property {boolean} [smsOk]      SMS read/receive permissions granted
 * @property {boolean} [hasAuth]    the account login was handed over for background upload
 * @property {number} [lastUpload]  ms time of the last successful SMS upload (0 = never)
 * @property {string} [uploadErr]   short reason of the last failed upload
 * @property {number} [lastRecv]    ms time the SMS receiver last fired (0 = never)
 * @property {number} [lastRun]     ms time the uploader last ran
 * @property {string} [maker]       lowercase phone brand (Build.MANUFACTURER)
 * @property {number} [queued]      messages saved on the phone and not uploaded yet
 * @property {number} [waitInbox]   airtime messages waiting for their row in the phone's SMS inbox
 */
/**
 * @typedef {object} NativePort
 * @property {() => Promise<NativeStatus>} status
 * @property {(o: {on: boolean}) => Promise<NativeStatus>} setKeepAlive
 * @property {() => Promise<NativeStatus>} requestNotifPermission
 * @property {() => Promise<NativeStatus>} requestBatteryExemption
 * @property {(o: {apiKey: string, projectId: string, uid: string, deviceId: string, refreshToken: string}) => Promise<NativeStatus>} [setSyncAuth]
 * @property {() => Promise<NativeStatus>} [clearSyncAuth]
 * @property {() => Promise<NativeStatus>} [uploadNow]
 * @property {() => Promise<NativeStatus>} [requestSmsPermissions]
 * @property {(o: {id: number, title: string, body: string}) => Promise<void>} notify
 */

/** @returns {NativePort|null} */
export function getNative() {
  var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Daftar;
  return p || null;
}
