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

### Phase 11 — Review and release ✅

- [x] Full `daftar-ui-review` matrix: 360 / 412 / 768 / 1280 × light / dark, plus 130% font size.
- [x] Fix everything found.
- [x] Bump `CACHE`, run the tests and the precache check.

**Done when:** the review passes and the console is clean.
⛔ **STOP** — open (or update) the release PR `saeed-develop → main`, share the PR and APK links, and merge it only when the owner says so.

### Phase 12 — UI polish ✅

A pre-publish polish pass: find and fix every cross-page inconsistency, remove the global top app bar
(its info moves into each tab's page header), refine the color palette for a calmer and more premium
feel in both themes, and make sure every page follows the same structure. Branch: `ui/p12-polish` from
the latest `saeed-develop`.

- [x] Audit: screenshot every tab + login + an open sheet, light/dark, 360px/1280px. Write `docs/ui-audit.md`
      listing every inconsistency (spacing, card padding, section titles, button sizes/variants, alignment,
      font sizes, icon sizes, corner radii, empty states, page headers, section organization).
- [x] Fix every item on the audit list.
- [x] Remove the global top app bar; move its info (date, sync status) into each tab's page header on
      phones (stays in the sidebar/rail on wide screens already). No info duplicated anywhere.
- [x] Color polish in `styles/tokens.css` (and the `daftar-ui` skill's `references/tokens.css`, kept in
      sync): calmer/more premium neutrals, deliberate (not inverted) dark mode, semantic colors used only
      for meaning. No hex values outside the token files. Verify and log contrast ratios.
- [x] Organization pass: every page follows page header → main action area → grouped sections with small
      section titles → lists, same spacing scale and card recipe everywhere, settings' danger zone last.
- [x] Bump `CACHE`, run the tests, the precache check, and the full `daftar-ui-review` matrix.

**Done when:** `docs/ui-audit.md`'s list is empty of unfixed items, no top app bar remains, contrast ratios
are documented and meet the targets, the review matrix passes, and a transfer/withdrawal still compute the
same totals as before.
⛔ **STOP** — update (or open) the release PR `saeed-develop → main`, share the PR and APK links, and merge
it only when the owner says so.

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
| 2026-11-15 | 11 — Review and release | Ran the full `daftar-ui-review` matrix over real headless Chrome (CDP): 2 themes × 4 widths (360/412/768/1280) × 5 tabs = 40 combinations, all scroll-free (`scrollWidth<=innerWidth`); 130% font-size zoom scroll-free on all 5 tabs; RTL sanity (`dir="rtl"` on `<html>`, `.ph` phone numbers stay `direction:ltr`-isolated) confirmed. Found one real accessibility gap against the skill's own rule ("sheets/dialogs trap focus and close on Esc and scrim tap"): `src/presentation/components/sheet.js`'s `openSheet`/`closeSheet` only ever handled scrim-click, never Escape, and never trapped focus. Fixed: added a shared `keydown` listener that closes on `Escape` and wraps Tab/Shift+Tab between the sheet's first and last focusable element; removed on close. Re-verified on a fresh browser profile (stale-profile reuse across many CDP runs in one day had produced misleading results earlier, incl. one run that accidentally hit the real live Firebase project because it skipped the `firebase-config.js` interception — re-ran with the interception and a clean profile both times): `sheetOpenAfterEsc:false` (was `true` before the fix) and `focusedAfterTab` correctly wraps from the last field (`sSave`) back to the first (`sName`). Bumped `sw.js`'s `CACHE` to `daftar-v12` (no new files; `sheet.js` was already registered). Ran one final full money-flow regression on a brand-new profile to confirm zero regression from the fix: 2 vf + 1 insta wallet setup, funded a wallet to 2000, a 500-pound vf transfer (sum "هتاخد من الزبون 505 كاش المحفظة بتنقص 501 (منها رسوم 1) · صافي ربحك 4", save succeeded), a 200-pound InstaPay withdrawal preview (sum "هتدّي الزبون 198 كاش المحفظة بتزيد 200 · ربحك 2", save enabled), then closed the day (toast "اتحفظ الجرد وتقفل اليوم", tiles showing profit 4 / cash 505 matching only the completed transfer) — zero console messages, zero exceptions. All 77 `node --test` cases + the precache check pass. Shipped through a PR into `saeed-develop`; this was the last UI phase, so the `saeed-develop → main` release PR covering phases 7–11 together opens next, per the owner's standing instruction for this run, and does not merge until the owner says "انشر". |
| 2026-11-15 | 12 — UI polish | Full audit (screenshots + computed-style measurements over CDP, every tab + login + an open sheet, light/dark, 360/1280px) written to `docs/ui-audit.md`; every item fixed. Removed the global `.top` app bar — the date/sync-status chip is now one DOM node (`#statusChip`) that `router.js` relocates into whichever tab's `.page-head` `[data-slot]` is active, instead of a fixed bar repeating on every tab; confirmed by a matrix run that it's present in exactly one tab at a time and `#dateLine` never duplicates. Fixed a real copy inconsistency: "إنستاباي" was spelled two different ways (with/without a space) — `transaction.js`'s service switch and `history.js`'s filter chips were the odd ones out against 15+ other occurrences; unified. Replaced four different ad hoc inline `.btn-primary` padding overrides (9px/11px/11px/10px+14px-font, each hand-tuned to balance a paired footer button) with one CSS rule (`.row .btn-primary{min-height:44px;padding:11px 14px}`), and deleted a dead inline override on `installBtn` (its `min-height:52px` already won regardless). Found `.more` (the "نسيت كلمة السر؟" link) had no `min-height` and was shrunk to ~30px by an inline `padding:4px` override — under the skill's 44px touch-target rule; fixed both. Settings didn't use the extra desktop width (one ~1120px column with half-empty 2-field grids) while every other screen gets a deliberate multi-column layout at ≥1024px; wrapped its cards in `.settings-grid`, a CSS-columns 2-up masonry at ≥1024px with the danger zone spanning both columns and staying last. Tuned the dark palette: `--bg` was `#0d1311` (at the edge of pure black) with `--shadow-1:none`, so cards/the bottom sheet had almost no visible lift — confirmed in screenshots where the wallet-edit sheet was nearly invisible against the scrim. Lightened `--bg`/`--surface`/`--surface-2` and firmed up `--line`/`--line-strong` in both `styles/tokens.css` and the `daftar-ui` skill's `references/tokens.css` (kept in sync as required), and added a subtle top border to the phone-width bottom sheet in dark mode. Verified every text/icon contrast pair stays well above the 4.5:1 / 3:1 targets in both themes (ratios logged in `docs/ui-audit.md`) — this was a neutrals/line-color retune, not a text-color change, so the already-passing text contrast barely moved. Also fixed a hardcoded `26px` on `#auth h1` that happened to equal `var(--fs-2xl)` to use the token instead. Re-ran the full review matrix after all fixes: all 40 theme×width×tab combinations scroll-free, 130% zoom scroll-free on all 5 tabs, RTL/`.ph` correct, Esc still closes a sheet, the status chip relocates into every one of the 5 tabs correctly. Re-ran the full money-flow regression (vf transfer + InstaPay withdrawal + day close) on a fresh profile: "هتاخد من الزبون 505 … صافي ربحك 4", "هتدّي الزبون 198 … ربحك 2", close toast + tiles showing combined profit 6 / cash 307 — exact expected totals, zero console messages, zero exceptions. All 77 tests + precache check pass (`CACHE` bumped to `daftar-v13`, no new files). Shipped through a PR into `saeed-develop`; updated the existing `saeed-develop → main` release PR next, still not merged until the owner says "انشر". |
| 2026-11-15 | Release merge | The owner merged release PR #8 (`saeed-develop → main`, phases 6.5–12) directly on GitHub. `main` is now caught up through phase 12. |
| 2026-11-15 | Chore — repo cleanup | Deleted the 7 remote branches already merged into `saeed-develop` (`chore/github-automation`, `ui/p7-theme`, `ui/p8-shell`, `ui/p9-components`, `ui/p10-screens`, `ui/p11-review`, `ui/p12-polish`) — turned out `gh pr merge --delete-branch` had already removed all of them as each phase shipped, so `git push origin --delete` reported "remote ref does not exist" for every one; `git fetch --prune` confirmed none were left. Deleted the one stale **local-only** branch, `refactor/clean-arch` (merged into `saeed-develop` back in the track-1 merge, never had a remote counterpart). Checked the repo's actual branch list and collaborators via the API: only `main`/`saeed-develop` exist remotely, and the only two collaborators are the owner and the agent's account — no other person's branch exists to preserve or flag. Deleted 34 old GitHub Actions runs (17 `CI`, 5 `Build APK`, 16 `pages-build-deployment` minus the one kept of each) via `gh run list`/`gh run delete`, keeping exactly the latest successful run per workflow (3 runs total); confirmed via the artifacts API that no orphaned artifacts remained (only the 2 artifacts belonging to the kept runs). Found no committed screenshots/debug scripts/scratch output anywhere in the tracked tree — this project's scratch work had consistently stayed in the session scratchpad outside the repo — but found and removed one stray **untracked empty directory**, `styles/views/` (a leftover from some earlier abandoned restructuring, never had any files in it). The repo had **no `.gitignore` at all**; added one covering OS cruft, `node_modules/`, the local Capacitor/Android build output (`/app/`, `/www/`, `/android/`, matching what `build-apk.yml` generates if that build is ever run locally), and the debug-script/screenshot naming patterns this session's own UI-review tooling uses (`debug_*.mjs`, `cdp_*.mjs`, `/scratchpad/`, `/shots/`, `*.log`), so any future slip-up stays untracked automatically. |
| 2026-11-15 | Chore — direct-download APK releases | `build-apk.yml` now publishes to GitHub Releases instead of only the always-zipped workflow artifact (kept the artifact too, as a harmless backup — `actions/upload-artifact@v4` still has no unzipped-single-file mode, so there was nothing extra to switch on there). Added `permissions: contents: write` at the workflow level and one new step using the pre-installed `gh` CLI with `GITHUB_TOKEN`. On a push to `main`: creates release `v1.<run_number>` with `daftar-v1.<N>.apk` attached and `--generate-notes` for a short auto-generated changelog, then prunes old `v1.*` releases down to the latest 5 by `createdAt` (verified the keep/delete `jq` filter against a hand-built 6-release fixture before trusting it in CI). On a PR into `main` or a manual `workflow_dispatch` run: creates the single rolling `preview` pre-release the first time it's ever needed, then every run just `gh release upload preview daftar-preview.apk --clobber`s the one asset — so the release page and the asset's direct-download URL never change, and always serve the latest test build. Updated `AGENTS.md` with a new "Where to find a built APK" note under the repo-layout table. Verified `node --test` (77/77) and the precache check still pass (no `src/`/`styles/` files touched by this change). |
