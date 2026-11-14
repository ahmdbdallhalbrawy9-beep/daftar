# Inventory of `index.html` (pre-refactor baseline)

Generated for Phase 1 of `docs/ROADMAP.md`. This is a map of everything the single `<script>` IIFE
in `index.html` currently does, so later phases can move code without losing behavior.
Line numbers are as of the Phase 1 commit on `refactor/clean-arch` (file is 1304 lines).

## 1. Structure

- `<style>` — lines 14–137 (design tokens + components, light/dark via `[data-theme]` and
  `prefers-color-scheme`).
- Markup — lines 140–335 (`.app` shell: `tab-tx`, `tab-wallets`, `tab-day`, `tab-hist`, `tab-set`,
  bottom `<nav>`, `#auth` screen, `#toastBox`, `#sheetBox`).
- `<script>` IIFE — lines 338–1301, `"use strict"`, one closure, everything below lives in it.

## 2. Global state

| Name | Line | What it holds |
|---|---|---|
| `$`, `$$` | 340–341 | `querySelector` / `querySelectorAll` shortcuts |
| `DEV` | 357 | per-device id, `localStorage['dw_dev']`, prefix for ledger doc ids |
| `DEFAULTS` | 378 | default settings object (fee %, vf/insta caps, `baseCash`, `baseTs`, `defDay`, `defMon`) |
| `S` | 379 | shared/synced app state: `inbox`, `meta`, `raw`, `seen`, `synced`, `wallets`, `settings`, `ledger`, `closes`, `ready`, `mode` (`'local'|'cloud'`), `live`, `waited`, `err` |
| `UI` | 380 | local UI/session state: `dest`, `costManual`, `flt`, `kind`, `sel`, `manualSel`, `feeManual`, `pct`, `showAll`, `tab`, `setupDone`, `invKey`, `sm`, `sp`, `col`, `spKey`, `svc`, `hd`, `hflt`, `pendKey`, plus ad-hoc fields set elsewhere (`delId`, `delT`, `wipe`, `wipeT`, `inst`, `reloaded`, `pendingImport`) |
| `db` | 381 | active DB adapter (local or Firestore-backed), set by `makeLocalDB()`/`makeFsDB()` |
| `Q` | 381 | write queue (`Promise` chain) |
| `FS`, `USER`, `UNS` | 381 | Firestore instance, current auth user, array of `onSnapshot` unsubscribers |
| `MSG` | 352 | shared "insufficient balance" string |
| `KIND` | 418 | operation-kind → Arabic label map |
| `PKIND` | 1028 | SMS pending-item kind → Arabic label map |
| `AR`, `N` | 997, 1000 | Arabic-Indic digit string, shared numeric regex fragment |
| `FB` | 1236 | Firebase SDK base URL (gstatic) |
| `toastT`, `raf` | 499, 503 | toast timeout handle, pending `requestAnimationFrame` id |

## 3. Pure-ish helper functions (candidates for `src/domain`)

| Function | Line | Signature / purpose |
|---|---|---|
| `fm2(n)` | 342 | format number, up to 2 decimals, `en-US` |
| `fmt(n)` | 343 | format rounded integer, `en-US` |
| `esc(s)` | 344 | HTML-escape for `innerHTML` |
| `NUM(s)` | 345 | parse Arabic-Indic/Western numeric string → float |
| `pad(n)` | 346 | zero-pad to 2 digits |
| `CF` | 348 | `Intl.DateTimeFormat`, Cairo time, used by `cp` |
| `cp(ts)` | 349 | timestamp → `{year,month,day,hour,minute,second}` parts in Cairo time |
| `dayKey(ts)` | 350 | timestamp → `YYYYMMDD` in Cairo time |
| `hhmm(ts)` | 351 | timestamp → `HH:MM` in Cairo time |
| `dayStart(ts)` | 353 | start-of-day (midnight Cairo time) timestamp for `ts` |
| `rid(p)` | 355 | random id generator, prefix `p` |
| `baseK(k)` | 385 | maps insta kind → its vf-equivalent base kind (`iin→in`, `iout→out`, …) |
| `isInsta(k)` | 386 | true if kind is one of `iin/iout/itopup/icashout` |
| `isInsT(t)` | 387 | true if a ledger tx is an InstaPay operation (handles `xfer` specially via `t.ins`) |
| `wd(t)` | 388 | wallet balance delta for a tx |
| `walletCost(k,A)` | 389 | wallet fee charged to the owner for kind `k`, amount `A` (reads `S.settings`, `UI.dest`) |
| `xferCost(w,a)` | 390 | wallet fee for an internal wallet→wallet transfer leg |
| `maxAmt(bal,cf)` | 391 | max amount `a` such that `a + cf(a) <= bal` |
| `splitWallets()` | 392 | wallets eligible for the current `UI.kind`'s service (vf vs insta), active only |
| `ensureCol(C,ws)` | 393 | picks/validates the "collector" wallet (`UI.col`) for `collect` split mode |
| `buildPlan(C,A,F)` | 397 | builds the split-transaction plan (`direct` or `collect`): legs, totals, shortfall, validity |
| `cd(t)` | 417 | cash-drawer delta for a tx |
| `compute()` | 420 | **the** aggregate: replays `S.ledger` (minus voided) into wallet balances, cash, daily/monthly profit (plain + InstaPay), today's txs |
| `rank(kind,a,C,cst)` | 456 | ranks wallets for a kind+amount (limits, balance, score) → sorted suggestion list |
| `shiftDay(dk,n)` | 766 | `YYYYMMDD` + `n` days (UTC date arithmetic) |
| `txGroups(tlist)` | 730 | groups a tx list by `.g` (multi-leg group id) for display |
| `daySum(list)` | 755 | aggregates a list of txs into `{n,pf,wf,cf,cash}` for a day's summary |
| `liveTxs()` | 750 | all non-voided txs across `S.ledger`, sorted by `ts` |
| `nrm(x)` | 998 | normalize Arabic-Indic digits + bidi marks + whitespace in SMS text |
| `nv(x)` | 999 | parse a comma-grouped numeric string |
| `parseSms(body,date)` | 1001 | parses a Vodafone Cash SMS body into `{id,k,a,c,p,wn,bal,ts}` or `null` |

## 4. State mutation / persistence (candidates for `src/application` + `src/infrastructure`)

| Function | Line | Purpose |
|---|---|---|
| `makeLocalDB()` | 360 | local-storage-backed Firestore-shaped fallback adapter (`collection().doc()`, `onSnapshot`) |
| `makeFsDB(fs,uid)` | 1222 | real-Firestore-backed adapter, same shape, scoped to `users/{uid}` |
| `col(n)` | 382 | `db.collection(n)` shortcut |
| `queue(fn)` | 383 | serializes writes through `Q`, toasts on failure |
| `writable()` | 479 | true once ledger/wallets/settings are `ready` and `S.synced` |
| `addTx(rec)` | 480 | appends one tx to the right day-doc, writes through `queue` |
| `addTxs(arr)` | 486 | same, batched by day |
| `saveSettings(patch)` | 493 | merges into `S.settings`, writes `settings/main` |
| `doSetup()` | 889 | bulk-creates vf/insta wallets from the onboarding form |
| `save()` | 902 | reads the transaction form (+ split plan if active), builds tx record(s), calls `addTx`/`addTxs` |
| `voidTx(id)` | 932 | two-tap confirm, writes `void` tx/txs referencing the original (handles grouped txs) |
| `doClose()` | 941 | daily close: writes a `closes` doc + updates each wallet's `base`/`baseTs` + settings `baseCash` |
| `saveWallet(w,oldBal)` | 873 | create/update a wallet doc; sets `base`/`baseTs` if balance was hand-edited |
| `saveOpenCash` | 722 | records start-of-day drawer cash into `settings.opens[day]` + `baseCash`/`baseTs` |
| `sha(x)` | 953 | SHA-256 hex digest (with a non-crypto fallback) |
| `pwOk(pw)` | 954 | checks a password against `settings.pwHash`/`pwSalt` |
| `pwSet()` / `pwChange()` | 955/960 | set/change the wipe-all password |
| `wipeAll()` | 965 | deletes every doc in every collection (password-gated) |
| `doWipe()` | 979 | two-tap confirm; deletes ledger+closes, re-bases wallets/cash to current computed values |
| `myInbox()` / `saveInbox(o)` | 1066/1067 | per-device SMS inbox read/write (`settings/inbox_{DEV}`) |
| `pendingItems(C)` | 1029 | derives "pending SMS" suggestions not yet confirmed/ignored, with wallet-match heuristic |
| `pendAction(card,ok)` | 1068 | confirm or ignore a pending SMS item → `addTx` or inbox update |
| `scanSms(manual)` | 1082 | calls the native `SmsReader` plugin, parses new messages, merges into inbox |
| `dumpState()` | 1187 | flattens `S.raw` into `{ "coll/id": data }` for backup export |
| `restoreData(o)` | 1188 | deletes all current docs, writes docs from a backup object (`wallets/ledger/closes/settings` only) |
| `resetState()` | 1194 | resets `S`/`UI` on logout or account switch |
| `stop()` | 1195 | unsubscribes all `onSnapshot` listeners |
| `start()` | 1204 | subscribes `onSnapshot` for `wallets`/`ledger`/`settings`/`closes`, marks `ready`/`synced` |
| `initCloud()` | 1270 | `firebase.initializeApp`, Firestore persistence, `onAuthStateChanged` wiring |
| `authGo(mode)` | 1251 | login/signup via Firebase Auth |
| `authReset()` | 1261 | password-reset email |
| `doLogout()` | 1266 | sign-out (blocked while writes are pending) |
| `anyPending()` | 1265 | true if any collection has `hasPendingWrites` |
| `loadScripts(urls)` | 1233 | sequentially injects `<script>` tags (Firebase SDK) |
| `bkExport()` | 1168 | downloads `dumpState()` as a JSON file, stamps `localStorage['dw_bk']` |
| SMS plugin bridge | `smsPlugin()` 1027 | `window.Capacitor.Plugins.SmsReader` presence check |

## 5. Rendering (candidates for `src/presentation`)

All driven by `changed()` (line 504, debounced via `requestAnimationFrame`) → `renderAll()` (506),
which calls `compute()` once and fans out to:

`renderTx`, `renderWallets`, `renderDay`, `renderSet`, `renderOpen`, `renderHist`, `renderPend`, `renderGuide`
— plus helpers `setupHTML`, `renderSplit`, `autoSplit`, `remBar`, `limBar`, `limBarOld` (dead code, unused),
`svcHTML`, `groupHTML`, `setDiff`, `updateDiffs`, `openSheet`, `closeSheet`, `openCashSheet`, `showTab`,
`toast`, `showAuth`, `authErr`, `setPill`.

**Hidden coupling found** (money/ranking functions reading UI/global state directly instead of taking
params — Phase 2 needs to turn these into explicit parameters):
- `walletCost(k,A)` reads `UI.dest` and `S.settings` directly.
- `buildPlan`, `renderSplit`, `autoSplit`, `ensureCol` read/write `UI.kind`, `UI.sm`, `UI.col`, `UI.sp` directly.
- `rank` reads `S.wallets`, `S.settings` directly (only `kind,a,C,cst` are passed in).
- `compute` reads `S.ledger`, `S.wallets`, `S.settings` directly (no params at all).
- `pendingItems` reads `S.wallets`, `S.inbox` directly.

## 6. Firestore / local-DB shape

Collections (top-level under `users/{uid}` in cloud mode, flat in local mode):

| Collection | Doc id | Shape |
|---|---|---|
| `wallets` | `w01`, `w02`, … (setup) or `rid('w')` (added later) | `{name,phone,type,order,dayLimit,monthLimit,base,baseTs,active}` |
| `ledger` | `{dayKey}_{DEV}` | `{day,dev,txs:[...]}` — tx shape: `{id,ts,k,w,a,f,c?,d?,to?,ins?,n,g?,gi?,gm?,m?,nc?,sid?}`; void tx: `{id,ts,k:'void',ref}` |
| `settings` | `main` | `DEFAULTS` shape + `pwHash`,`pwSalt`,`baseCash`,`baseTs`,`openDay`,`openAmt`,`openTs`,`opens:{day:{a,ts}}` |
| `settings` | `inbox_{DEV}` | `{items:{smsId:{...}}, ign:[smsId,...]}` |
| `closes` | `rid('c')` | `{ts,day,expCash,actCash,pDay,wallets:{id:{n,exp,act}}}` |

Backup file shape: `{app:'daftar-mahfaza', v:1, ts, data:{"coll/id":doc,...}}` (`dumpState`/`restoreData`).

## 7. DOM ids referenced by the script

`dateLine, syncPill, setup, notice, guideBox, openBanner, pendBox, svcTx, kinds, amt, feeRow, feeLbl, fee,
pcts, costRow, costInp, cost, dest, splitWrap, smodes, splitBox, sum, pickTitle, picker, note, save,
addWallet, svcW, wTotal, wgrid, bkNotice, openCard, tiles, expCash, invCash, diffCash, invRows, closeBtn,
fltChips, txList, closeList, hPrev, hDate, hNext, hDays, hLabel, hTiles, hFlt, hList, setFee, setFeeI,
setFeeC, setFeeF, setDay, setMon, saveSet, setVfS, setVfOP, setVfOC, setInP, setInC, saveRates, smsCard,
smsInfo, smsScan, wipeBtn, pwSetBox, pwNew, pwSet, pwUseBox, pwIn, wipeAll, pwOld, pwNew2, pwChange,
acctCard, acctEmail, logoutBtn, installCard, installBtn, bkInfo, bkExport, bkFile, bkConfirm, syncInfo,
devId, auth, aEmail, aPass, authMsg, loginBtn, signupBtn, resetBtn, toastBox, sheetBox, scrim (sheet,
dynamic), smsScan2 (dynamic), spCol (dynamic)`.

## 8. `data-*` hooks (event delegation on `document` click, plus a few scoped listeners)

| Attribute | Meaning |
|---|---|
| `data-t` | nav tab switch |
| `data-oc` | open "cash at day start" sheet |
| `data-k` / `data-s` | operation-kind button / its service (`v`/`i`) |
| `data-svc` | vf/insta service switch |
| `data-d` | destination choice for `out` (`vf`/`other`) |
| `data-f` | today tx filter chip |
| `data-p` | fee-% chip |
| `data-w` | wallet picker selection |
| `data-more` | show-all/hide wallets toggle |
| `data-edit` | open wallet-edit sheet |
| `data-del` | void transaction (two-tap) |
| `data-sm` | split mode chip (`one/direct/collect`) |
| `data-hd` / `data-hf` | history day chip / history filter chip |
| `data-pok` / `data-pig` / `data-pid` | pending-SMS confirm / ignore / item id |
| `data-pw` / `data-pf` | pending-SMS wallet `<select>` / fee `<input>` |
| `data-spin` / `data-spw` / `data-spb` / `data-spf` / `data-spl` / `data-spown` | split-UI per-wallet input / row / balance / fee / limit text / collector-balance text |
| `data-inv` / `data-exp` / `data-diff` | day-close inventory input / expected text / diff text |

## 9. Event listeners

| Target | Event | Line | Handler |
|---|---|---|---|
| `document` | `click` | 1113 | single delegated handler, dispatches on the `data-*`/`id` table above |
| `#amt` | `input` | 1155 | `changed()` |
| `#hDate` | `change` | 1156 | sets `UI.hd` from date picker |
| `#splitBox` | `input` | 1157 | updates `UI.sp[walletId]` |
| `#splitBox` | `change` | 1158 | updates `UI.col` (collector `<select>`) |
| `#fee` | `input` | 1159 | marks `UI.feeManual`, `changed()` |
| `#cost` | `input` | 1160 | marks `UI.costManual`, `changed()` |
| `#invCash` | `input` | 1161 | `updateDiffs(compute())` |
| `#invRows` | `input` | 1162 | `updateDiffs(compute())` (delegated, inputs added dynamically) |
| `window` (via `setInterval`) | — | 1163 | every 60s: `changed()` + `scanSms(false)` if tab visible |
| `document` | `visibilitychange` | 1164 | same, on becoming visible |
| — | `setTimeout` | 1165 | one-shot `scanSms(false)` 4s after boot |
| `#bkFile` | `change` | 1175 | reads backup JSON file, validates, stages `UI.pendingImport` |
| `window` | `beforeinstallprompt` | 1290 | stashes install prompt, shows install card |
| `window` | `appinstalled` | 1291 | hides install card |
| `window` | `online` / `offline` | 1292 | `changed()` |
| `#scrim` (dynamic, per sheet) | `click` | 717, 867 | close sheet if click lands on the scrim itself |
| `firebase.auth()` | `onAuthStateChanged` | 1274 | drives `S.mode`, `db`, `start()/stop()/resetState()` |
| `navigator.serviceWorker` | `controllerchange` | 1289 | reloads page once after a SW update |

## 10. Entry point

Bottom IIFE (1286–1300): initial `renderAll()`, persistent storage request, SW registration, PWA
install/online listeners, then branches on `window.FIREBASE_CONFIG`: if present, loads the Firebase
compat SDK and calls `initCloud()`; else falls back to `makeLocalDB()` + `S.mode='local'` + `start()`.

## 11. Not covered by this inventory

Pure CSS (`<style>` block) and static markup are not itemized line-by-line here; they're addressed in
Phase 5 (CSS split) and Phase 2's architecture table only needs to note that `index.html` becomes a thin
shell.
