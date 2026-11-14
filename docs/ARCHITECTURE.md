# Architecture plan — `src/domain` → `application` → `infrastructure` / `presentation`

Written for Phase 2 of `docs/ROADMAP.md`, based on the full inventory in `docs/inventory.md`.
This is a **plan**, not a move: nothing in `index.html` changes in this phase. Phases 3–5 execute it.

Fixed rules this plan honors (from `AGENTS.md` / the roadmap): native ES modules (`<script type="module">`),
no bundler, no npm dependencies, no new CDN; plain JS + JSDoc + `// @ts-check`; `domain` and `application`
never touch `window` / `document` / Firebase / Capacitor / `localStorage`; views never talk to Firestore
directly.

## 1. Layers and the dependency rule

```
   domain            no imports at all (pure functions + pure data)
     ^
   application       imports: domain, its own ports (interfaces only)
     ^
   infrastructure     imports: application's ports (to implement them), domain only if a port's
     ^                data shape needs it (adapters: Firestore, local DB, auth, SMS plugin,
     |                localStorage, download/file I/O, service worker, install prompt)
     |
   presentation       imports: application (use cases), domain (pure helpers like formatters
     ^                built on domain/time.js), its own store/router/components. Never imports
     |                infrastructure directly — it calls use cases, which were already wired to
     |                an adapter by the composition root.
     |
   main.js           the ONLY module allowed to import from all four layers: picks the local or
                      Firestore adapter, builds the use cases with those adapters injected, creates
                      the store, mounts the views, wires DOM events, runs the boot sequence.
```

`domain` is pure: given the same inputs it returns the same outputs, no `Date.now()`, no globals,
no I/O. Today several domain-shaped functions read `S`/`UI` or call `Date.now()` directly — see
§3 "Hidden coupling" for exactly which ones and the parameter they gain.

`application` holds use cases (one per user-facing action: record a transaction, void it, close the
day, …) and **ports** — JSDoc-typed interfaces (`DbPort`, `AuthPort`, `SmsPort`, `ClockPort`) with no
implementation. Phase 4's "Done when" (`application` never imports `infrastructure`) is enforced by
only ever importing the port *shape*, never a concrete adapter.

`infrastructure` implements those ports: Firestore, the local-storage-shaped DB fallback, Firebase
Auth, the Capacitor `SmsReader` bridge, raw `localStorage`, file download/read, service-worker
registration, the PWA install-prompt bridge.

`presentation` is the store (reactive state + change notifications), a tab router, one view module
per tab, shared components (sheet, toast, pill, progress bars, tx row, pending-SMS card), and
formatters. It calls application use cases and renders; it never constructs a `db.collection(...)`
call itself.

## 2. Final folder structure

```
index.html              thin shell: markup + <link> to styles/ + <script type="module" src="src/main.js">
src/
  domain/
    numbers.js           NUM, nrm, nv
    time.js              pad, cp, dayKey, hhmm, dayStart, shiftDay
    kinds.js             baseK, isInsta, isInsT, KIND, PKIND, MSG
    money.js             wd, cd, walletCost, xferCost, maxAmt
    wallets.js           splitWallets, resolveCollector (was ensureCol)
    plan.js              buildPlan
    compute.js           compute
    rank.js              rank
    ledger.js            liveTxs, daySum, txGroups
    sms.js               parseSms
  application/
    ports.js             JSDoc only: DbPort, AuthPort, SmsPort, ClockPort
    sync.js              startSync, stopSync, writable, anyPending, resetState (store-shape reset)
    transactions.js      recordTransaction (was save), voidTransaction (was voidTx)
    closeDay.js          closeDay (was doClose)
    wallets.js           createOrUpdateWallet (was saveWallet), setupWallets (was doSetup)
    settingsUseCases.js  saveSettings, setWipePassword/changeWipePassword/checkWipePassword (pwSet/pwChange/pwOk)
    wipe.js              wipeAllData (was wipeAll), wipeTransactions (was doWipe)
    backup.js            exportBackup (was dumpState), restoreBackup (was restoreData)
    smsImport.js         scanForSms (was scanSms, minus the plugin call), pendingItems,
                         confirmPending/ignorePending (was pendAction), inbox helpers (myInbox/saveInbox)
    auth.js              login/signup (was authGo), resetPassword (authReset), logout (doLogout),
                         authErrorMessage (authErr)
    openingCash.js       recordOpeningCash (was saveOpenCash)
  infrastructure/
    firestoreDb.js       makeFsDB, FB, loadScripts
    localDb.js           makeLocalDB
    firebaseAuth.js      initCloud's onAuthStateChanged wiring (implements AuthPort)
    writeQueue.js        queue()
    storage.js           small localStorage get/set/remove wrapper (also used by Phase 7 theme)
    deviceId.js          DEV, rid
    crypto.js            sha
    smsPlugin.js         smsPlugin(), the actual getSms/checkPermissions/requestPermissions calls
    download.js          triggerDownload(blob, filename), readFileAsText(file)
    serviceWorker.js     SW registration + controllerchange reload
    install.js           beforeinstallprompt / appinstalled wiring
  presentation/
    store.js             reactive state (replaces S/UI + changed()/raf), subscribe/notify
    router.js            showTab
    dom.js                $, $$
    formatters.js         fmt, fm2, esc
    views/
      transaction.js      renderTx, renderSplit, autoSplit, setupHTML, svcHTML
      wallets.js          renderWallets
      today.js            renderDay, renderOpen, renderGuide, updateDiffs, setDiff
      history.js          renderHist
      settings.js         renderSet
      login.js            showAuth (view half; authErr moved to application/auth.js)
    components/
      sheet.js            openSheet/closeSheet (generic) + openCashSheet
      toast.js            toast()
      pill.js             setPill()
      bars.js             remBar, limBar  (limBarOld is dead code today — dropped, not moved)
      txRow.js            groupHTML
      pendingCard.js       renderPend (view half; logic half is application/smsImport.js)
  main.js                 composition root (see §1); also the old boot IIFE's non-render parts
styles/                   tokens.css, base.css, layout.css, components.css, views/*.css (Phase 5)
tests/
  harness/                Phase 3+ loads ES modules directly; the Phase 1 vm-sandbox shim in
                          tests/harness/loadApp.js is retired once index.html is a thin shell
  unit/
scripts/
  check-precache.mjs      (Phase 6) fails if any src/ or styles/ file is missing from sw.js's FILES
docs/
```

## 3. Hidden coupling found in Phase 1, and the parameter each function gains

These are the "money function reads `UI.dest` / `S.settings` directly" cases `docs/inventory.md` §5
flagged. Each becomes an explicit parameter; the call site (today part of `renderTx`/`renderSplit`,
tomorrow a view or use case) is the only place that still knows about `UI`/`S`.

| Function | Today reads directly | New signature |
|---|---|---|
| `walletCost(k,A)` | `UI.dest`, `S.settings` | `walletCost(kind, amount, settings, dest)` |
| `xferCost(w,a)` | `S.settings` | `xferCost(wallet, amount, settings)` (was already explicit on `w,a`, just also takes `settings`) |
| `buildPlan(C,A,F)` | `UI.kind`, `UI.sm`, `UI.col`, `UI.sp`, `UI.dest`, `S.wallets` (via `splitWallets`) | `buildPlan({kind, amount, fee, splitMode, collectorId, splits, dest}, wallets, computeResult, settings)` — returns the plan; never mutates `UI` |
| `ensureCol(C,ws)` | `UI.col` (reads **and writes**) | renamed `resolveCollector(wallets, computeResult, collectorId)` — pure, **returns** the resolved id instead of writing `UI.col`; the caller (store/view) assigns it |
| `autoSplit()` | `UI.kind`, `UI.sm`, `UI.col`, `S.wallets`, and writes `UI.sp` + toasts | splits into domain `suggestAutoSplit(kind, splitMode, collectorId, wallets, computeResult)` (pure, returns the `sp` map) + a thin presentation caller that assigns it and toasts on shortfall |
| `rank(kind,a,C,cst)` | `S.wallets`, `S.settings` | `rank(kind, amount, wallets, computeResult, settings, extraCost)` |
| `splitWallets()` | `UI.kind`, `S.wallets` | `splitWallets(kind, wallets)` |
| `compute()` | `S.ledger`, `S.wallets`, `S.settings`, `Date.now()` | `compute({ ledger, wallets, settings, now })` — `now` is **required**, never read internally; callers pass `Date.now()` (this also makes Phase 3+ tests simpler than the Phase 1 vm-sandbox `setNow` trick) |
| `pendingItems(C)` | `S.wallets`, `S.inbox` | `pendingItems(wallets, inbox, liveTxs, computeResult)` |
| `liveTxs()` | `S.ledger` | `liveTxs(ledger)` |
| `writable()` | `S.ready`, `S.synced` | `writable(syncState)` — pure predicate over `{ready, synced}`, lives in `application/sync.js` since every use case needs to check it before writing |

No other domain-shaped function in the inventory reads global state; the rest already take every
input as a parameter (`cd`, `wd`, `maxAmt`, `baseK`, `isInsta`, `isInsT`, `NUM`, `nrm`, `nv`, `pad`,
`cp`, `dayKey`, `hhmm`, `dayStart`, `shiftDay`, `parseSms`, `daySum`, `txGroups`).

## 4. Full function/state → module table

### domain (pure, zero imports)

| Current name | Line (today) | New module | Notes |
|---|---|---|---|
| `NUM` | 345 | `domain/numbers.js` | unchanged |
| `nrm` | 998 | `domain/numbers.js` | unchanged |
| `nv` | 999 | `domain/numbers.js` | unchanged |
| `pad` | 346 | `domain/time.js` | unchanged |
| `CF`, `cp` | 348–349 | `domain/time.js` | unchanged |
| `dayKey` | 350 | `domain/time.js` | unchanged |
| `hhmm` | 351 | `domain/time.js` | unchanged |
| `dayStart` | 353 | `domain/time.js` | unchanged |
| `shiftDay` | 766 | `domain/time.js` | unchanged |
| `baseK` | 385 | `domain/kinds.js` | unchanged |
| `isInsta` | 386 | `domain/kinds.js` | unchanged |
| `isInsT` | 387 | `domain/kinds.js` | unchanged |
| `KIND` | 418 | `domain/kinds.js` | unchanged (data map) |
| `PKIND` | 1028 | `domain/kinds.js` | unchanged (data map) |
| `MSG` | 352 | `domain/kinds.js` | unchanged (shared string) |
| `wd` | 388 | `domain/money.js` | unchanged |
| `cd` | 417 | `domain/money.js` | unchanged |
| `walletCost` | 389 | `domain/money.js` | gains `settings`, `dest` params — see §3 |
| `xferCost` | 390 | `domain/money.js` | gains `settings` param — see §3 |
| `maxAmt` | 391 | `domain/money.js` | unchanged |
| `splitWallets` | 392 | `domain/wallets.js` | gains `kind`, `wallets` params — see §3 |
| `ensureCol` | 393 | `domain/wallets.js` | renamed `resolveCollector`, becomes pure — see §3 |
| `buildPlan` | 397 | `domain/plan.js` | reshaped params — see §3 |
| `autoSplit`'s planning half | 650 | `domain/plan.js` | new `suggestAutoSplit` — see §3 |
| `compute` | 420 | `domain/compute.js` | gains `{ledger,wallets,settings,now}` param — see §3 |
| `rank` | 456 | `domain/rank.js` | gains `wallets`, `settings` params — see §3 |
| `liveTxs` | 750 | `domain/ledger.js` | gains `ledger` param — see §3 |
| `daySum` | 755 | `domain/ledger.js` | unchanged |
| `txGroups` | 730 | `domain/ledger.js` | unchanged |
| `parseSms` | 1001 | `domain/sms.js` | unchanged |
| `AR` | 997 | `domain/numbers.js` | Arabic-Indic digit string used by `nrm` |
| `N` | 1000 | `domain/sms.js` | shared numeric regex fragment used by `parseSms` |
| `DEFAULTS` | 378 | `domain/money.js` | pure default-settings data, used by every layer above |

### application (use cases + ports)

| Current name | Line (today) | New module | Notes |
|---|---|---|---|
| — | — | `application/ports.js` | new: `DbPort` (`collection(name).doc(id).get/set/update/delete`, `onSnapshot`), `AuthPort`, `SmsPort`, `ClockPort` — JSDoc typedefs only |
| `start` | 1204 | `application/sync.js` | `startSync(db, store)`; no longer touches a module-level `S` |
| `stop` | 1195 | `application/sync.js` | `stopSync()` |
| `writable` | 479 | `application/sync.js` | pure predicate — see §3 |
| `anyPending` | 1265 | `application/sync.js` | unchanged shape, reads sync-state param instead of `S.meta` |
| `resetState` | 1194 | `application/sync.js` | resets the store's sync-related slice only (wallets/ledger/etc. reset is the store's job) |
| `UNS` | 381 | `application/sync.js` | the array of `onSnapshot` unsubscribers becomes a local variable inside `startSync`/`stopSync`, not a module global |
| `col` | 382 | — | dropped: use cases call `db.collection(name)` on the injected `DbPort` directly |
| `writeQueue`'s `queue` | 383 | `infrastructure/writeQueue.js` | moved to infrastructure (it is a retry/serialization *mechanism* over a port, not business logic) — exposed to use cases as part of the `DbPort` the composition root builds |
| `addTx` | 480 | `application/transactions.js` | folded into `recordTransaction` |
| `addTxs` | 486 | `application/transactions.js` | folded into `recordTransaction` |
| `save` | 902 | `application/transactions.js` | `recordTransaction(db, clock, { kind, amount, fee, cost, dest, note, selectedWallet, splitMode, splits, collectorId }, wallets, computeResult)` |
| `voidTx` | 932 | `application/transactions.js` | `voidTransaction(db, clock, ledger, txId)` — the two-tap confirm *timer* stays in the view (it's UI state), the use case just performs the void once confirmed |
| `doClose` | 941 | `application/closeDay.js` | `closeDay(db, clock, computeResult, wallets, inventoryInputs)` |
| `saveOpenCash` | 722 | `application/openingCash.js` | `recordOpeningCash(db, clock, settings, amount)` |
| `saveWallet` | 873 | `application/wallets.js` | `createOrUpdateWallet(db, clock, existingWallet, form)` |
| `doSetup` | 889 | `application/wallets.js` | `setupWallets(db, form)` |
| `saveSettings` | 493 | `application/settingsUseCases.js` | unchanged shape, takes `db` |
| `sha` | 953 | `infrastructure/crypto.js` | moved to infrastructure (Web Crypto is an I/O-ish browser API, kept out of `application`) |
| `pwOk` | 954 | `application/settingsUseCases.js` | `checkWipePassword(crypto, settings, pw)` — takes the crypto port fn |
| `pwSet` | 955 | `application/settingsUseCases.js` | `setWipePassword(db, crypto, pw)` |
| `pwChange` | 960 | `application/settingsUseCases.js` | `changeWipePassword(db, crypto, settings, oldPw, newPw)` |
| `wipeAll` | 965 | `application/wipe.js` | `wipeAllData(db, crypto, settings, pw)` |
| `doWipe` | 979 | `application/wipe.js` | `wipeTransactions(db, clock, computeResult, wallets)` (the two-tap timer stays in the view) |
| `myInbox` | 1066 | `application/smsImport.js` | `readInbox(inbox, deviceId)` |
| `saveInbox` | 1067 | `application/smsImport.js` | `saveInbox(db, deviceId, inboxPatch)` |
| `pendingItems` | 1029 | `application/smsImport.js` | gains `wallets`, `inbox` params — see §3 |
| `pendAction` | 1068 | `application/smsImport.js` | split into `confirmPending(db, clock, item, walletId, fee)` / `ignorePending(db, deviceId, inbox, itemId)` |
| `scanSms` | 1082 | `application/smsImport.js` | `scanForSms(smsPort, deviceId, inbox, liveTxs, lastScanTs)` — takes the `SmsPort`, no `window.Capacitor` reference |
| `dumpState` | 1187 | `application/backup.js` | `exportBackup(rawState)` |
| `restoreData` | 1188 | `application/backup.js` | `restoreBackup(db, currentRaw, backupData)` |
| `authGo` | 1251 | `application/auth.js` | `login(auth, email, pw)` / `signup(auth, email, pw)`, takes `AuthPort` |
| `authReset` | 1261 | `application/auth.js` | `resetPassword(auth, email)` |
| `doLogout` | 1266 | `application/auth.js` | `logout(auth, syncState)` |
| `authErr` | 1241 | `application/auth.js` | `authErrorMessage(code)` (pure string map, kept with the rest of auth) |

### infrastructure (adapters)

| Current name | Line (today) | New module | Notes |
|---|---|---|---|
| `makeLocalDB` | 360 | `infrastructure/localDb.js` | implements `DbPort` |
| `makeFsDB` | 1222 | `infrastructure/firestoreDb.js` | implements `DbPort` |
| `FB`, `loadScripts` | 1236, 1233 | `infrastructure/firestoreDb.js` | SDK bootstrap |
| `initCloud`'s Firebase/Auth wiring | 1270 | `infrastructure/firebaseAuth.js` | implements `AuthPort`, calls `startSync`/`stopSync` through the injected store, not module globals |
| `FS` | 381 | `infrastructure/firestoreDb.js` | the `firebase.firestore()` instance becomes a local variable inside this module, not a module global |
| `queue`, `Q` | 383 | `infrastructure/writeQueue.js` | see application table note |
| `DEV` | 357 | `infrastructure/deviceId.js` | unchanged behavior (localStorage-backed) |
| `rid` | 355 | `infrastructure/deviceId.js` | unchanged |
| `smsPlugin` | 1027 | `infrastructure/smsPlugin.js` | implements `SmsPort`; wraps `window.Capacitor.Plugins.SmsReader` |
| `bkExport`'s DOM part (Blob/`<a>`/click) | 1168 | `infrastructure/download.js` | `triggerDownload(blob, filename)` |
| `#bkFile` FileReader read | 1175 | `infrastructure/download.js` | `readFileAsText(file)` |
| SW registration + `controllerchange` reload | 1289 | `infrastructure/serviceWorker.js` | unchanged behavior |
| `beforeinstallprompt`/`appinstalled` wiring | 1290–1291 | `infrastructure/install.js` | unchanged behavior |
| raw `localStorage` reads scattered across the file (`dw_guide`, `dw_bk`, `dw_scan`, `dw_sync_{uid}`, `dw_dev`, `dw_local`) | throughout | `infrastructure/storage.js` | one small wrapper; current call sites (`renderGuide`, `renderDay`, `scanSms`, `initCloud`, `DEV` init, `makeLocalDB`) switch to calling it instead of `localStorage` directly |

### presentation (store, router, views, components, formatters)

| Current name | Line (today) | New module | Notes |
|---|---|---|---|
| `S`, `UI` | 379–380 | `presentation/store.js` | become the store's internal state; `UI`'s ad-hoc fields (`delId`,`wipe`,`inst`,…) move to the specific view/component that owns that timer/flag |
| `changed`, `raf` | 504, 503 | `presentation/store.js` | the store's notify-on-change mechanism |
| `renderAll` | 506 | `presentation/store.js` | becomes the store's subscriber fan-out (calls each view's render) |
| `$`, `$$` | 340–341 | `presentation/dom.js` | unchanged |
| `fmt`, `fm2`, `esc` | 343,342,344 | `presentation/formatters.js` | unchanged |
| `showTab` | 1112 | `presentation/router.js` | unchanged |
| `renderTx` | 514 | `presentation/views/transaction.js` | calls `application/transactions.js` on save |
| `setupHTML` | 596 | `presentation/views/transaction.js` | calls `application/wallets.js`'s `setupWallets` |
| `renderSplit` | 605 | `presentation/views/transaction.js` | calls `domain/plan.js`'s `buildPlan` |
| `autoSplit` (UI half) | 650 | `presentation/views/transaction.js` | calls `domain/plan.js`'s `suggestAutoSplit`, then toasts |
| `svcHTML` | 678 | `presentation/views/transaction.js` | shared by transaction + wallets views, kept here and imported by both |
| `renderWallets` | 679 | `presentation/views/wallets.js` | calls `application/wallets.js` |
| `renderGuide` | 693 | `presentation/views/today.js` | |
| `renderOpen` | 706 | `presentation/views/today.js` | calls `application/openingCash.js` |
| `renderDay` | 796 | `presentation/views/today.js` | calls `application/closeDay.js` |
| `setDiff` | 824 | `presentation/views/today.js` | |
| `updateDiffs` | 830 | `presentation/views/today.js` | |
| `renderHist` | 767 | `presentation/views/history.js` | |
| `renderSet` | 835 | `presentation/views/settings.js` | calls `application/settingsUseCases.js`, `application/wipe.js`, `application/backup.js`, `application/auth.js` |
| `showAuth` | 1237 | `presentation/views/login.js` | |
| `openSheet` / `closeSheet` | 853 / 872 | `presentation/components/sheet.js` | generic sheet scaffold; wallet-edit content stays view-local, calling the generic sheet |
| `openCashSheet` | 711 | `presentation/components/sheet.js` | built on the generic sheet |
| `toast` | 500 | `presentation/components/toast.js` | |
| `setPill` | 1196 | `presentation/components/pill.js` | |
| `remBar` | 666 | `presentation/components/bars.js` | |
| `limBar` | 671 | `presentation/components/bars.js` | |
| `limBarOld` | 674 | — | **dropped** — unused dead code today (confirmed in `docs/inventory.md` §5); not moved anywhere |
| `groupHTML` | 735 | `presentation/components/txRow.js` | used by both today + history views |
| `renderPend` | 1043 | `presentation/components/pendingCard.js` | calls `application/smsImport.js` |
| `USER` | 381 | `presentation/store.js` | the current auth user becomes a session slice of the store, written by `infrastructure/firebaseAuth.js` through `AuthPort`'s state callback |
| `toastT` | 499 | `presentation/components/toast.js` | the pending-timeout handle becomes a local variable inside this module |

### main.js (composition root)

| Current name | Line (today) | New home | Notes |
|---|---|---|---|
| bottom boot IIFE | 1286–1300 | `main.js` | split into: pick `localDb`/`firestoreDb` adapter based on `window.FIREBASE_CONFIG`, build every use case with that adapter, create the store, mount views, call `startSync` |
| `document.addEventListener('click', …)` dispatcher | 1113 | `main.js` | the delegated handler stays one function, but each branch now calls a presentation action (router/view/component) instead of inline logic |
| scoped listeners (`#amt`, `#hDate`, `#splitBox`, `#fee`, `#cost`, `#invCash`, `#invRows`, `#bkFile`) | 1155–1175 | `main.js` (or the owning view's `mount()`, wired from `main.js`) | unchanged behavior |
| `setInterval(...)`, `visibilitychange`, boot `setTimeout(scanSms,4000)` | 1163–1165 | `main.js` | calls `application/smsImport.js`'s `scanForSms` through the `SmsPort` |
| `window.addEventListener('online'/'offline', changed)` | 1292 | `main.js` | |
| `db` | 381 | `main.js` | the active adapter instance (`localDb` or `firestoreDb`) is chosen once at boot and injected into every use case — no module-global `db` anywhere |

## 5. How `sw.js` and the APK build pick up the new files

- **`sw.js`**: its `FILES` array must list every file under `src/` and `styles/` individually (no
  bundler means no single bundle to cache) alongside the existing entries. Every phase from 3 onward
  that adds a module **must** add it to `FILES` and bump `CACHE` in the same commit (hard rule 1/2 in
  `AGENTS.md` already requires this; Phase 6 adds `scripts/check-precache.mjs` to catch a forgotten
  entry automatically instead of relying on memory).
- **`.github/workflows/build-apk.yml`**: today's `cp` line(s) copy named files into `www/`. Once
  `src/` and `styles/` exist, that step becomes a recursive copy — `cp -r src www/src` and
  `cp -r styles www/styles` — alongside the existing `index.html`/`sw.js`/`manifest.webmanifest`/
  `firebase-config.js`/icon copies. This is implemented in Phase 6, not here; flagged now so Phase 3
  doesn't accidentally create a file layout the workflow can't mirror.

## 6. What does *not* move in this phase

Nothing. Phase 2 is a plan only — `index.html` is untouched (`git diff index.html` stays empty), and
no `src/`/`styles/` files are created yet. Phase 3 begins the actual move with `src/domain/`.
