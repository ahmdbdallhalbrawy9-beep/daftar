// @ts-check
// PWA install-prompt bridge (matches index.html's `beforeinstallprompt`/
// `appinstalled` wiring exactly).

/**
 * @param {(promptEvent: any) => void} onAvailable called with the deferred
 *   prompt event once the browser offers an install
 * @param {() => void} onInstalled called once the app is actually installed
 */
export function registerInstallPrompt(onAvailable, onInstalled) {
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (onAvailable) onAvailable(e);
  });
  window.addEventListener('appinstalled', function () {
    if (onInstalled) onInstalled();
  });
}
