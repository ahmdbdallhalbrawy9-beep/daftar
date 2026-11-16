// @ts-check
// Best-effort phone name for the "registered phones" list. Chrome/WebView hide the model in the
// user-agent string, so ask `userAgentData` first and fall back to parsing the UA.

/** @returns {Promise<{name: string, os: string}>} */
export async function describeDevice() {
  var ua = navigator.userAgent || '';
  var model = '', os = '';
  try {
    var uad = /** @type {any} */ (navigator).userAgentData;
    if (uad && uad.getHighEntropyValues) {
      var h = await uad.getHighEntropyValues(['model', 'platformVersion']);
      model = (h.model || '').trim();
      if (h.platformVersion) os = 'Android ' + String(h.platformVersion).split('.')[0];
    }
  } catch (e) { /* ignore */ }
  var m = ua.match(/Android\s([\d.]+);\s*([^;)]+)/);
  if (m) {
    if (!os) os = 'Android ' + m[1].split('.')[0];
    if (!model && m[2].trim() !== 'K') model = m[2].trim();
  } else if (!os) {
    os = /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  }
  var app = /** @type {any} */ (window).Capacitor ? 'تطبيق' : 'متصفح';
  return { name: (model || 'موبايل') + ' · ' + app, os: os };
}
