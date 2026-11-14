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
8. **Never `git push`.** The owner pushes and merges.
9. If something in this roadmap looks wrong or missing, don't change it on your own. Raise it as a suggestion in the summary at the next stop.

Status: ⬜ not started · 🔄 in progress · ✅ done

---

## Track 1: Clean architecture

Goal: split the app (all of it currently in `index.html`) into clear layers, with the money logic covered by tests, **with zero user-visible change**: same look, same numbers, same data.

Branch for every phase in this track: `refactor/clean-arch` from `saeed-develop`.

### Phase 1 — Safety net (tests before moving anything) 🔄

Before moving a single line, lock in the current calculation behavior with golden-master tests, so every later move can be proven not to change results.

- [x] Full inventory of `index.html`: every function, global state (`S`, `UI`, `DEFAULTS`…), Firestore paths, every ID and `data-*` hook the JS uses, every event listener. Save it as `docs/inventory.md`.
- [ ] A harness in `tests/harness/` that loads the current functions as they are, **without editing `index.html`**.
- [ ] `node --test` tests (no libraries) for: `compute`, `buildPlan`, `rank`, `walletCost`, `xferCost`, `maxAmt`, `cd`, `wd`, `splitWallets`, `parseSms`, `NUM`, `nrm`, `dayKey`, `dayStart`, `shiftDay`, and daily/monthly limit resets.
- [ ] Realistic cases: Vodafone→Vodafone, Vodafone→other network with the cap, InstaPay with the cap, splitting an amount across several wallets, limits around midnight and the first of the month in Cairo time, input with Arabic-Indic digits (٠-٩).
- [ ] One command runs everything: `node --test tests/`.

**Done when:** all tests pass against the current code · `index.html` is untouched (`git diff index.html` is empty).

### Phase 2 — Architecture plan ⬜

- [ ] Write `docs/ARCHITECTURE.md` with:
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

### Phase 3 — Domain layer ⬜

- [ ] Move pure logic into `src/domain/`: operation kinds, money and fees, limits, time and day keys in Cairo time, split planning, wallet ranking, SMS parsing, number normalization.
- [ ] Every function: inputs in, values out, no globals.
- [ ] Point the Phase 1 tests at the new modules. **Expected values in tests must not change.**

**Done when:** `node --test tests/` passes · nothing inside `domain` imports from outside `domain`.

### Phase 4 — Application and infrastructure ⬜

- [ ] Use cases: record transaction(s), void transaction, close day, suggest wallet, manage wallets, settings, backup/restore, wipe, import SMS, login/logout.
- [ ] Ports (JSDoc interfaces) + adapters: Firestore, local DB (offline fallback), write queue, Firebase Auth, SMS plugin, localStorage, clock.
- [ ] Sync and write-queue behavior stay exactly the same.
- [ ] Use-case tests with fake adapters.

**Done when:** all tests pass · `application` never imports from `infrastructure`.

### Phase 5 — Presentation and CSS split ⬜

- [ ] Store (state + change notifications), tab router, a view per tab (transaction, wallets, today, history, settings, login), components (sheet, toast, pill…), formatters (`fmt`, `fm2`, `esc`).
- [ ] Split the CSS into `styles/` with **exactly the same values** (no visual change).
- [ ] `index.html` becomes a thin shell.
- [ ] Verify in the browser: every tab, record a transaction, void one, close a day, export and restore a backup, the login screen. Console free of errors.

**Done when:** look and behavior are identical to before · all tests pass.
⛔ **STOP** — summary + a list of things to test on the phone.

### Phase 6 — Plumbing and instruction updates ⬜

- [ ] `sw.js`: precache every file in `src/` and `styles/`, and bump `CACHE`.
- [ ] `scripts/check-precache.mjs`: fails if any file in `src/` or `styles/` is missing from `FILES`.
- [ ] `.github/workflows/build-apk.yml`: copies `src/`, `styles/` and any new file into `www/`.
- [ ] Update `AGENTS.md` (structure, layers, how to run tests and the check, where new code goes, remove the single-file constraint), `CLAUDE.md`, and the `daftar-ui` / `daftar-ui-review` skills so they point to `styles/` and `presentation/` instead of `index.html`.

**Done when:** `node --test tests/` and `node scripts/check-precache.mjs` pass · the app opens offline after the first load.
⛔ **STOP** — the owner reviews and merges `refactor/clean-arch` into `saeed-develop`.

---

## Track 2: Professional UI redesign

Goal: a clean, clear, easy interface: organized navigation (bottom bar on phone, rail on tablet, sidebar on desktop), light / dark / system theme, and consistent components.

Before any phase here: **load the `daftar-ui` skill** and read `references/tokens.css` and `references/components.md`. Use `frontend-design` only for visual decisions the spec doesn't cover; `daftar-ui` wins on conflicts. Run the `daftar-ui-review` skill after every phase.

Branch: `ui/redesign` from `saeed-develop` (after Track 1 is merged).
Not allowed: changing any calculation or data shape. Font: the system font stack from `tokens.css` (no font files for now).

### Phase 7 — Foundation: colors and theme ⬜

- [ ] Replace the tokens with `tokens.css` (both themes).
- [ ] A tiny script in `<head>` that applies the theme before first paint (no white flash).
- [ ] An "المظهر" section in settings: تلقائي / فاتح / داكن, saved per device in `localStorage` (`daftar-theme`), not synced.
- [ ] `<meta name="theme-color">` follows the theme.

**Done when:** no hex color outside the tokens file · the theme survives a reload.

### Phase 8 — App shell and navigation ⬜

- [ ] One `<nav>` restyled by width: bottom bar (< 640px), rail (640–1023px), sidebar (≥ 1024px).
- [ ] Inline SVG icons (sprite) + labels, `aria-current` on the active tab.
- [ ] A header per page (title + short subtitle + actions).
- [ ] Sync status moves into the sidebar/rail on wide screens.

**Done when:** no horizontal scroll at 360px · navigation is correct at all 3 sizes.
⛔ **STOP** — the owner checks the look on the phone.

### Phase 9 — Components ⬜

- [ ] Buttons, segmented controls, operation-kind choice cards, chips, fields (label + hint + error), the amount input, tiles, wallet cards with limit bars, transaction rows, notices, the sheet (bottom sheet on phone, centered dialog ≥ 640px), toast, empty states, loading skeletons — per `components.md`.
- [ ] Every component: hover / focus / pressed / disabled / selected, in both themes.

**Done when:** every component follows `components.md` · touch targets ≥ 44px.

### Phase 10 — Screens ⬜

- [ ] عملية: two columns on desktop (the form + the suggested wallet and summary).
- [ ] اليوم: tiles on top, cash count and close next to today's operations.
- [ ] المحافظ: grid.
- [ ] إعدادات: grouped sections, with the danger zone (wipe) last and separated.
- [ ] Login screen.

**Done when:** each screen has exactly one primary button · same numbers before and after for the same inputs.

### Phase 11 — Review and release ⬜

- [ ] Full `daftar-ui-review` matrix: 360 / 412 / 768 / 1280 × light / dark, plus 130% font size.
- [ ] Fix everything found.
- [ ] Bump `CACHE`, run the tests and the precache check.

**Done when:** the review passes and the console is clean.
⛔ **STOP** — the owner merges into `saeed-develop`, pushes, builds the APK from GitHub Actions, and tests it on the phone.

---

## Progress log

| Date | Phase | Done / notes |
|---|---|---|
| 2026-11-15 | 0 — Setup | Added `AGENTS.md`, `CLAUDE.md`, the skills (`daftar-ui`, `daftar-ui-review`, `frontend-design`), the `/next` command, and this roadmap. |
