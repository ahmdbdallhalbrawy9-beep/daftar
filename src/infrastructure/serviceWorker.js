// @ts-check
// Registers the service worker and reloads once after it updates (matches
// index.html's boot-time SW registration exactly).
export function registerServiceWorker() {
  try {
    if (!('serviceWorker' in navigator)) return;
    var hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js');
    var reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadCtl && !reloaded) { reloaded = true; location.reload(); }
    });
  } catch (e) { /* ignore */ }
}
