// @ts-check
// The top-right sync-status pill. Extracted from index.html's `setPill`
// unchanged, taking the sync-related state slice instead of reading `S`.

/**
 * @param {HTMLElement} pill
 * @param {{mode:string, meta: Record<string,{fc?:boolean,hp?:boolean}>}} state
 */
export function renderSyncPill(pill, state) {
  if (state.mode !== 'cloud') { pill.className = 'pill'; pill.textContent = 'شغّال بدون نت'; return; }
  var fc = false, hp = false;
  Object.keys(state.meta).forEach(function (k) { fc = fc || state.meta[k].fc; hp = hp || state.meta[k].hp; });
  if (navigator.onLine === false) { pill.className = 'pill warn'; pill.textContent = hp ? 'بدون نت · هيترفع بعدين' : 'بدون نت · محفوظ'; }
  else if (hp) { pill.className = 'pill warn'; pill.textContent = 'جارٍ الرفع…'; }
  else if (fc) { pill.className = 'pill warn'; pill.textContent = 'جارٍ الاتصال…'; }
  else { pill.className = 'pill'; pill.textContent = 'متزامن'; }
}
