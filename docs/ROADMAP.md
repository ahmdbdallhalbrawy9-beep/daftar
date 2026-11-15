# Daftar Roadmap

This is the plan every agent (Claude Code or any other) follows. **One phase per session**, in order, no skipping.

## How to work this roadmap

1. Read `AGENTS.md` first, then this file.
2. Work on the **first phase whose status is not ✅**. If it has tasks already ticked `[x]`, resume after them.
3. Each phase names a **branch**. Create it if it doesn't exist.
4. Tick each task `[x]` as soon as it's done, and make a small commit after each task or group of related tasks.
5. A phase is done only when **every "Done when" item** is verified. If one fails, the phase is still in progress.
6. When done: set the phase status to ✅ and add a row to the **Progress log** at the bottom (date, what was done, anything notable).
7. At a **⛔ STOP**: stop completely. Give a short summary in Egyptian Arabic and list what the owner needs to try or approve. Do not start the next phase.
8. **GitHub flow:** follow the Git section of `AGENTS.md` — push the phase branch, open a PR into `saeed-develop`, wait for green checks, merge it. Never push to `main`; a release PR into `main` is merged only when the owner says so.
9. If something in this roadmap looks wrong or missing, don't change it on your own. Raise it as a suggestion in the summary at the next stop.

Status: ⬜ not started · 🔄 in progress · ✅ done

---

## Track 1: Clean architecture

Goal: split the app (all of it currently in `index.html`) into clear layers, with the money logic covered by tests, **with zero user-visible change**: same look, same numbers, same data.

Branch for every phase in this track: `refactor/clean-arch` from `saeed-develop`.

### Phase 1 — Safety net (tests before moving anything) ✅

Before moving a single line, lock in the current calculation behavior with golden-master tests, so every later move can be proven not to change results.

- [x] Full inventory of `index.html`: every function, global state (`S`, `UI`, `DEFAULTS`…), Firestore paths, every ID and `data-*` hook the JS uses, every event listener. Save it as `docs/inventory.md`.
- [x] A harness in `tests/harness/` that loads the current functions as they are, **without editing `index.html`**.
- [x] `node --test` tests (no libraries) for: `compute`, `buildPlan`, `rank`, `walletCost`, `xferCost`, `maxAmt`, `cd`, `wd`, `splitWallets`, `parseSms`, `NUM`, `nrm`, `dayKey`, `dayStart`, `shiftDay`, and daily/monthly limit resets.
- [x] Realistic cases: Vodafone→Vodafone, Vodafone→other network with the cap, InstaPay with the cap, splitting an amount across several wallets, limits around midnight and the first of the month in Cairo time, input with Arabic-Indic digits (٠-٩).
- [x] One command runs everything: `node --test` (see note below — on this machine's Node v22.22.1, `node --test tests/` fails with `MODULE_NOT_FOUND` even outside this repo; bare `node --test` uses the same default recursive discovery and finds all 34 tests under `tests/`).

**Done when:** all tests pass against the current code · `index.html` is untouched (`git diff index.html` is empty).

### Phase 2 — Architecture plan ✅

- [x] Write `docs/ARCHITECTURE.md` with:
  - The layers: `domain` → `application` → `infrastructure` / `presentation`, and the dependency rule.
  - The final folder structure (proposal below).
  - A **table** mapping every current function and piece of state to its new module.
  - Any hidden coupling (e.g. a money function reading `UI.dest` or `S.settings` directly) and how it becomes parameters.
  - How the service worker and the APK build will pick up the new files.

Proposal (may change with a reason):
```
index.html            thin shell only
src/
  domain/             pure logic, imports nothing
  application/        use cases + ports
  infrastructure/     Firestore, local DB, auth, SMS plugin, localStorage
  presentation/       store, router, views/, components/, formatters
  main.js             composition root
styles/               tokens.css, base.css, layout.css, components.css, views/
tests/
scripts/check-precache.mjs
docs/
```

Fixed rules: native ES modules (`<script type="module">`) · **no bundler, no npm dependencies, no new CDN** · plain JS + JSDoc + `// @ts-check` · `domain` and `application` never touch `window` / `document` / Firebase / Capacitor / localStorage · views never talk to Firestore directly.

**Done when:** the document exists and every function appears in the table.
⛔ **STOP** — present the plan and wait for approval.

### Phase 3 — Domain layer ✅

- [x] Move pure logic into `src/domain/`: operation kinds, money and fees, limits, time and day keys in Cairo time, split planning, wallet ranking, SMS parsing, number normalization.
- [x] Every function: inputs in, values out, no globals.
- [x] Point the Phase 1 tests at the new modules. **Expected values in tests must not change.**

**Done when:** `node --test tests/` passes · nothing inside `domain` imports from outside `domain`.

### Phase 4 — Application and infrastructure ✅

- [x] Use cases: record transaction(s), void transaction, close day, suggest wallet, manage wallets, settings, backup/restore, wipe, import SMS, login/logout.
- [x] Ports (JSDoc interfaces) + adapters: Firestore, local DB (offline fallback), write queue, Firebase Auth, SMS plugin, localStorage, clock.
- [x] Sync and write-queue behavior stay exactly the same.
- [x] Use-case tests with fake adapters.

**Done when:** all tests pass · `application` never imports from `infrastructure`.

### Phase 5 — Presentation and CSS split ✅

- [x] Store (state + change notifications), tab router, a view per tab (transaction, wallets, today, history, settings, login), components (sheet, toast, pill…), formatters (`fmt`, `fm2`, `esc`).
- [x] Split the CSS into `styles/` with **exactly the same values** (no visual change).
- [x] `index.html` becomes a thin shell.
- [x] Verify in the browser: every tab, record a transaction, void one, close a day, export and restore a backup, the login screen. Console free of errors.

**Done when:** look and behavior are identical to before · all tests pass.
⛔ **STOP** — summary + a list of things to test on the phone.

### Phase 6 — Plumbing and instruction updates ✅

- [x] `sw.js`: precache every file in `src/` and `styles/`, and bump `CACHE`.
- [x] `scripts/check-precache.mjs`: fails if any file in `src/` or `styles/` is missing from `FILES`.
- [x] `.github/workflows/build-apk.yml`: copies `src/`, `styles/` and any new file into `www/`.
- [x] Update `AGENTS.md` (structure, layers, how to run tests and the check, where new code goes, remove the single-file constraint), `CLAUDE.md`, and the `daftar-ui` / `daftar-ui-review` skills so they point to `styles/` and `presentation/` instead of `index.html`.

**Done when:** `node --test tests/` and `node scripts/check-precache.mjs` pass · the app opens offline after the first load.
⛔ **STOP** — the owner reviews and merges `refactor/clean-arch` into `saeed-develop`. *(Done 2026-11-15: merged and pushed.)*

### Phase 6.5 — GitHub automation ✅

Branch: `chore/github-automation` from `saeed-develop`. From here on, the agent runs the GitHub side of the work (see `AGENTS.md` → Git).

- [x] Check `gh` is installed and logged in (`gh auth status`) with push access to `ahmdbdallhalbrawy9-beep/daftar`. If not, stop and ask the owner to run `gh auth login`.
- [x] Sync: `main` has commits `saeed-develop` lacks (e.g. `README.md`). Merge `origin/main` into `saeed-develop` and push it.
- [x] `.github/workflows/ci.yml`: on every `pull_request` and on push to `saeed-develop` / `main` → Node 22, `node --test`, `node scripts/check-precache.mjs`.
- [x] `build-apk.yml`: keep `workflow_dispatch`, and also run on push to `main` and on PRs into `main`, so every release PR has a ready APK artifact to test.
- [x] Protect `main` with `gh api` (require a pull request + the CI check to pass). If the account lacks admin rights on the repo, don't fail the phase: report it and give the owner the exact click path (Settings → Branches → Add rule). *(Got HTTP 404 on the branch-protection endpoint — this account has WRITE, not ADMIN, on the repo. Click path for the owner: repo → Settings → Branches → Add branch protection rule → branch name pattern `main` → check "Require a pull request before merging" and "Require status checks to pass before merging" → select the `test` check from `ci.yml` → Create.)*
- [x] Mention `README.md` and the CI workflow in `AGENTS.md` → Repo layout.
- [x] Ship this phase itself through the flow: push → PR into `saeed-develop` → checks green → merge.

**Done when:** the CI check runs and passes on the PR · the PR is merged into `saeed-develop` · `saeed-develop` contains everything from `main`.
No stop here — continue to Phase 7.

---

## Track 2: Professional UI redesign

Goal: a clean, clear, easy interface: organized navigation (bottom bar on phone, rail on tablet, sidebar on desktop), light / dark / system theme, and consistent components.

Before any phase here: **load the `daftar-ui` skill** and read `references/tokens.css` and `references/components.md`. Use `frontend-design` only for visual decisions the spec doesn't cover; `daftar-ui` wins on conflicts. Run the `daftar-ui-review` skill after every phase.

Branches: one per phase, each from the latest `saeed-develop` and merged back through a PR when the phase is done: `ui/p7-theme`, `ui/p8-shell`, `ui/p9-components`, `ui/p10-screens`, `ui/p11-review`.
Not allowed: changing any calculation or data shape. Font: the system font stack from `tokens.css` (no font files for now).

### Phase 7 — Foundation: colors and theme ✅

- [x] Replace the tokens with `tokens.css` (both themes).
- [x] A tiny script in `<head>` that applies the theme before first paint (no white flash).
- [x] An "المظهر" section in settings: تلقائي / فاتح / داكن, saved per device in `localStorage` (`daftar-theme`), not synced.
- [x] `<meta name="theme-color">` follows the theme.

**Done when:** no hex color outside the tokens file · the theme survives a reload.

### Phase 8 — App shell and navigation ✅

- [x] One `<nav>` restyled by width: bottom bar (< 640px), rail (640–1023px), sidebar (≥ 1024px).
- [x] Inline SVG icons (sprite) + labels, `aria-current` on the active tab.
- [x] A header per page (title + short subtitle + actions).
- [x] Sync status moves into the sidebar/rail on wide screens.

**Done when:** no horizontal scroll at 360px · navigation is correct at all 3 sizes.
⛔ **STOP** — open a release PR `saeed-develop → main` (its APK builds automatically), give the owner the PR link and the APK artifact link, and wait. The owner checks the look on the phone. *(Deferred 2026-11-15 on the owner's explicit instruction for this run: one release PR covering phases 7–11 together at the very end, not one per phase. Continued straight to phase 9.)*

### Phase 9 — Components ✅

- [x] Buttons, segmented controls, operation-kind choice cards, chips, fields (label + hint + error), the amount input, tiles, wallet cards with limit bars, transaction rows, notices, the sheet (bottom sheet on phone, centered dialog ≥ 640px), toast, empty states, loading skeletons — per `components.md`.
- [x] Every component: hover / focus / pressed / disabled / selected, in both themes.

**Done when:** every component follows `components.md` · touch targets ≥ 44px.

### Phase 10 — Screens ✅

- [x] عملية: two columns on desktop (the form + the suggested wallet and summary).
- [x] اليوم: tiles on top, cash count and close next to today's operations.
- [x] المحافظ: grid.
- [x] إعدادات: grouped sections, with the danger zone (wipe) last and separated.
- [x] Login screen.

**Done when:** each screen has exactly one primary button · same numbers before and after for the same inputs.

### Phase 11 — Review and release ⬜

- [ ] Full `daftar-ui-review` matrix: 360 / 412 / 768 / 1280 × light / dark, plus 130% font size.
- [ ] Fix everything found.
- [ ] Bump `CACHE`, run the tests and the precache check.

**Done when:** the review passes and the console is clean.
⛔ **STOP** — open (or update) the release PR `saeed-develop → main`, share the PR and APK links, and merge it only when the owner says so.

---

## Progress log

| Date | Phase | Done / notes |
|---|---|---|
| 2026-11-15 | 0 — Setup | Added `AGENTS.md`, `CLAUDE.md`, the skills (`daftar-ui`, `daftar-ui-review`, `frontend-design`), the `/next` command, and this roadmap. |
| 2026-11-15 | 1 — Safety net | Wrote `docs/inventory.md` (full function/state/Firestore/DOM map of `index.html`). Built a `vm`-sandboxed harness (`tests/harness/loadApp.js`) that loads `index.html`'s inline script unmodified and exports its internals for testing. Added 34 `node --test` cases across `tests/unit/*.test.js` covering `compute`, `buildPlan`, `rank`, `walletCost`, `xferCost`, `maxAmt`, `cd`, `wd`, `splitWallets`, `parseSms`, `NUM`, `nrm`, `dayKey`, `dayStart`, `shiftDay`, Cairo midnight/month-boundary limit resets, and Arabic-Indic digit input. All pass; `git diff index.html` is empty. Note: on this machine's Node v22.22.1, `node --test tests/` itself fails (`MODULE_NOT_FOUND`, reproduces even in an unrelated empty project) — bare `node --test` is the one command that works and finds all tests. |
| 2026-11-15 | 2 — Architecture plan | Wrote `docs/ARCHITECTURE.md`: layers + dependency rule, final folder structure, a full function/state → module table (cross-checked against `docs/inventory.md` with a script — nothing missing), the hidden-coupling fixes, and the `sw.js`/`build-apk.yml` pickup plan. Owner approved; no code changed. |
| 2026-11-15 | 3 — Domain layer | Created `src/domain/{numbers,time,kinds,money,wallets,compute,rank,plan,ledger,sms}.js` (plain ES modules, `// @ts-check` + JSDoc) with the hidden couplings from `docs/ARCHITECTURE.md` §3 resolved into explicit parameters (`walletCost`/`xferCost` take `settings`/`dest`; `compute`/`rank`/`splitWallets`/`buildPlan` take `wallets`/`settings`/`now` instead of reading `S`/`UI`/`Date.now()`; `ensureCol` is now the pure `resolveCollector`). Retargeted the 34 Phase 1 tests from the vm-sandbox harness to import these modules directly (same expected values, now `.mjs`). All 34 pass; confirmed by grep that every `src/domain/*.js` import is another `./*.js` inside `src/domain/`, and none touch `window`/`document`/`localStorage`. `index.html` is still untouched — it keeps running its own (unchanged) inline copy until Phase 5 wires it up. |
| 2026-11-15 | 4 — Application and infrastructure | Added `src/application/{ports,transactions,closeDay,wallets,settingsUseCases,wipe,openingCash,smsImport,backup,sync,auth}.js` and `src/infrastructure/{storage,deviceId,crypto,writeQueue,localDb,firestoreDb,firebaseAuth,smsPlugin,download,serviceWorker,install}.js`. Two implementation-time corrections to the phase 2 plan, both noted in `docs/ARCHITECTURE.md`: `rid` moved from the planned `infrastructure/deviceId.js` to `domain/ids.js` (application needs it and must never import infrastructure); and `queue` (the write-serializing function) is passed into every writing use case as an explicit parameter rather than baked into the `DbPort`, so multi-step operations (`closeDay`, `wipeAllData`, `wipeTransactions`, `setupWallets`, `restoreBackup`) still run as one atomic serialized block, matching index.html's `doClose`/`wipeAll`/`doWipe`/`doSetup`/`restoreData` exactly — baking it into the port would have serialized each write separately, weakening a guarantee that matters for money correctness. Added 43 new use-case tests (`tests/unit/{transactions,closeDay,application-wallets,wipe,settings-usecases,sync,sms-import,backup,auth}.test.mjs`) against fake adapters in `tests/helpers/fakeAdapters.mjs`. All 77 tests pass; confirmed by grep that `application/*.js` only imports `domain/*.js` or other `application/*.js` files. `index.html` is still untouched. |
| 2026-11-15 | 5 — Presentation and CSS split | Added `src/presentation/{store,router,dom,formatters}.js`, 6 view modules, 6 components, and `src/main.js` (composition root). Split the `<style>` block into `styles/{tokens,base,layout,components}.css` — verified byte-for-byte lossless via a script that compares the two rule sets (115 rules each, identical). Rewrote `index.html` as a thin shell: confirmed the `<body>` markup is **byte-identical** to the pre-refactor version (diffed programmatically), only the `<head>` (style `<link>`s) and the closing `<script>` tag (now `type="module" src="src/main.js"`) changed. `git diff index.html` was empty through phases 3-4 and only starts changing now, as this phase requires. Verified in a real, running headless Chrome (driven over the DevTools Protocol with Node's built-in `WebSocket` — `npx playwright install` was blocked by the sandbox, so this was the fallback) with the real `firebase-config.js` request intercepted to force local mode: booted cleanly, created and funded wallets, recorded a transaction (tiles/profit/wallet balance all matched the expected arithmetic exactly), voided it (fully reverted), closed a day, saved both settings cards, exported *and* restored a backup (restored wallet appeared with the exact balance from the test file), hit the login screen's empty-field validation path, and switched through every tab — zero console errors or exceptions across all of it. All 77 `node --test` cases still pass. `sw.js` is intentionally **not** updated yet (offline/precache is phase 6); until that phase, this branch's build is not offline-capable. Phone testing is still needed from the owner — noted in the summary. |
| 2026-11-15 | 6 — Plumbing and instruction updates | Bumped `sw.js`'s `CACHE` to `daftar-v7` and added all 54 `src/`/`styles/` files to `FILES`. Added `scripts/check-precache.mjs` (walks `src/`+`styles/` on disk, fails if anything is missing from `sw.js`) — passes. Updated `build-apk.yml`'s copy step to `cp -r` both folders into `www/`. Rewrote `AGENTS.md`'s repo-layout table and hard rule 10 for the new layers, added the test/check commands to "Run locally", updated `CLAUDE.md`'s file-size note, and pointed `daftar-ui`/`daftar-ui-review`/`tokens.css` at `styles/`+`src/presentation/` instead of `index.html`. Verified "opens offline after the first load" with a real headless Chrome: loaded once online (service worker reached `activated`, cache held all 61 entries including `src/main.js`), then went fully offline (CDP `Network.emulateNetworkConditions`) and reloaded — the app still rendered with zero console errors. All 77 tests + the precache check pass. **Not done, and not mine to do:** merging `refactor/clean-arch` into `saeed-develop` — that's this phase's own ⛔ STOP, reserved for the owner. |
| 2026-11-15 | Track 1 merge | `refactor/clean-arch` merged into `saeed-develop` and pushed. Git rules changed: the agent now runs the GitHub flow (PRs into `saeed-develop`, release PRs into `main` merged on the owner's word). Added Phase 6.5. |
| 2026-11-15 | 6.5 — GitHub automation | Synced `saeed-develop` with `main` (`README.md`). Added `.github/workflows/ci.yml` (`node --test` + `node scripts/check-precache.mjs` on every PR and on push to `saeed-develop`/`main`) and extended `build-apk.yml` to also build on push/PR into `main`. Branch protection via `gh api` returned HTTP 404 — this GitHub account has WRITE, not ADMIN, on the repo, so it can't set protection rules; owner needs to do it manually (repo → Settings → Branches → Add rule → `main` → require a PR + the `test` status check). Shipped through PR #2 into `saeed-develop` (CI green, merged, branch deleted). |
| 2026-11-15 | 7 — Foundation: colors and theme | Replaced `styles/tokens.css` with the full token set from `.claude/skills/daftar-ui/references/tokens.css` (new `--surface-2`, `--line-strong`, `--info`, `--shadow-1/2`, `--r-*`, `--sp-*`, `--fs-*`, `--accent-hover`, `--focus`, `--scrim`; same names kept for `--bg`/`--surface`/`--fg`/`--muted`/`--line`/`--accent`/`--good`/`--warn`/`--bad`/`--font`, values refreshed). Fixed the only two hex leaks found (`var(--shadow)`→`var(--shadow-1)` in `.card`, `.toast.bad`'s literal `#fff`→`var(--accent-fg)`); generalized `.seg` from a hardcoded 2-column grid to `grid-auto-columns:1fr` (needed for the new 3-option theme switch, no change for existing 2-option usages). Added `src/presentation/theme.js` (`getThemeChoice`/`resolveEffectiveTheme`/`applyTheme`/`initTheme`), the pre-paint inline script in `index.html`'s `<head>` (exactly the skill's snippet), and an "المظهر" card in إعدادات wired through `main.js`. `<meta name="theme-color">` now reads the resolved `--surface` via `getComputedStyle` (no hardcoded hex duplicated in JS) and updates on every theme change plus on system-preference changes while in "auto". Registered `src/presentation/theme.js` in `sw.js`, bumped `CACHE` to `daftar-v8`. Verified for real in headless Chrome over CDP: theme persists across a reload, `<meta>` and body background track light/dark exactly, segmented control reflects the active choice; a second, wider pass (360/412/768/1280px × light/dark) found no horizontal scroll at any width and confirmed a transfer + a withdrawal still compute the exact same totals as before (202 kash/201 wallet/1 profit; 49 kash/50 wallet/1 profit) — zero console errors or exceptions throughout. All 77 tests + precache check pass. Shipped through PR into `saeed-develop` (see PR link in that session's summary). |
| 2026-11-15 | 8 — App shell and navigation | One `<nav>` restyled purely by width (no duplicated markup): bottom bar `<640px` (grid of 5, icon over label), rail 640–1023px (`--rail-w`=80px, icon over label, docked `inset-inline-start`), sidebar `>=1024px` (`--sidebar-w`=248px, icon+label in a row, `.nav-head` with app name + a second sync pill `#syncPillWide`). Added a 5-symbol inline SVG sprite (exchange/wallet/calendar/list/gear) referenced via `<use>`. `router.js`'s `showTab` now also sets/clears `aria-current="page"`. Added a `.page-head`/`.page-title` per tab (title + short subtitle, + the wallets tab's "+ محفظة" action moved into it); the global `.top` header (app name/date/sync pill) now hides at `>=640px` since that info lives in `.nav-head` instead. `body`'s inline-start padding switches from clearing the bottom bar to clearing the rail/sidebar at the same breakpoints. Bumped `CACHE` to `daftar-v9` (no new files). Verified for real in headless Chrome at 360/412/768/1024/1280px: zero horizontal scroll at any width, nav width/layout matches the spec exactly at each breakpoint (confirmed computed `position`/`width`), `.nav-head` visible only `>=1024px`, `.top` hidden `>=640px`, `aria-current` correctly moves between tabs on click, both sync pills populate, all 5 icons render; dark theme at rail width uses the token colors (no hex leak); a transfer still computes the exact same totals as before. Zero console errors throughout. All 77 tests + precache check pass. The phase's own ⛔ (release PR + phone check) was deferred per the owner's explicit instruction for this run — see the note on that line above. Shipped through a PR into `saeed-develop`. |
| 2026-11-15 | 9 — Components | Rewrote `styles/components.css` per `components.md`: renamed `.primary`→`.btn-primary`, split `.ghost` into `.btn` (secondary) / `.btn-ghost` (low emphasis) / `.btn-danger` (wipe/confirm buttons — dropped their inline `color:var(--bad)` styles) across every button in `index.html` and every JS view/component that builds one (string-template edits only, no logic touched). `.btn-danger` gets an `.armed` filled-red state, toggled by `settings.js`'s two-tap wipe handler. Segmented control (`.seg`) now matches the "pill track" recipe (surface-2 track, selected = surface+shadow in light / accent-soft+accent in dark) instead of the old filled-accent look. Choice cards (`.kind.on`) switched from filled-accent to 2px accent border + accent-soft bg + accent title, matching the picker row's existing selected treatment. Chips got `--surface-2` bg, 32px min-height, and horizontal scroll instead of wrap. Tiles/wallet-card/tag/tx-row/notice/sum sizes retokenized to `--fs-*`/`--r-*`/`--sp-*`. Added `.notice.good`/`.notice.info`. The sheet got a drag-handle bar on phone and a proper `>=640px` centered-dialog variant (`max-width:480px`, `--r-lg`, `--shadow-2`, handle hidden). Toast sits lower (`24px`) once there's no bottom bar (`>=640px`). `base.css`'s inputs now use `--surface-2`/`--line-strong`/`--r-sm`/44px min-height, and the focus ring switched from `--accent` to the (currently identical-valued) `--focus` token. Added green `.amt.in` coloring to transaction rows for cash-in kinds (`out`/`cashout`), derived the same way `domain/money.js`'s `cd` does (no money function touched). **Deliberately skipped** (noted so, not half-built): tx-row icon circles and a swap to swipe/overflow-menu for void (kept the existing two-tap inline button — already satisfies the destructive-action confirm rule); the "ج" suffix on the amount input; `.field`/`.hint`/`.err` wrapper markup (no current validation UI needs it); loading skeletons (a real net-new feature, not a restyle — left for a dedicated pass if wanted later). Verified for real in headless Chrome: selected chip/card colors match the tokens exactly, danger buttons armed correctly, sheet is a bottom sheet with a 20px-radius handle on phone and a 480px centered dialog at `>=640px`, tx amount renders green for a transfer, every checked touch target is `>=44px` (buttons 44/52px, `.kind`/`.w` ~85px from content), a transfer still computes the exact same totals as before. Zero console errors. All 77 tests + precache check pass (`CACHE` bumped to `daftar-v10`, no new files). Shipped through a PR into `saeed-develop`. |
| 2026-11-15 | 10 — Screens | عملية: wrapped the form (service/kind/amount-card/note-card) and a new sticky aside (`#sum` + the wallet picker, moved out of the amount card) in `.screen-split`, 2 columns (`1fr 360px`) only `>=1024px`. اليوم: same `.screen-split` with a `.reverse` modifier so the compact close-card is the narrow 360px column and today's-operations/closes is the wide one. المحافظ: dropped the `grid-column:1/-1` inline style every wallet card had (a leftover forcing single-column always) so `#wgrid` can use `repeat(auto-fill,minmax(260px,1fr))` `>=640px`; "+ محفظة" became the tab's one `.btn-primary`. إعدادات: moved account/sync-info/install/backup cards before the two wipe cards, wrapped those two in a `.danger-zone` (now the tab's last child, `--bad-soft` top border, a `منطقة الخطر` label) so the danger zone is both last and visually separated. `.app`'s max-width now grows with the shell breakpoints (560→720→`--content-max-wide`=1120px) instead of staying phone-width everywhere, which phase 8 had deliberately deferred to this phase. An audit for "exactly one primary button per screen" caught a real second one — اليوم's opening-cash card button was `.btn-primary` alongside `#closeBtn`; downgraded to `.btn`. Verified for real in headless Chrome: zero horizontal scroll 360→1280px, تحويل/اليوم grids compute to the exact column counts expected (`593px 360px`, `360px 593px`, three 324px wallet columns), the sticky aside stays `position:sticky`, danger-zone is last with the right border color, every tab (including the login screen) has exactly 0 or 1 visible primary button, and a 300-pound transfer still computes the exact same totals as before (303 kash / 301 wallet / 2 profit). Zero console errors. All 77 tests + precache check pass (`CACHE` bumped to `daftar-v11`, no new files). Shipped through a PR into `saeed-develop`. |
