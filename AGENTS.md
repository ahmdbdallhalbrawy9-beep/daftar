# AGENTS.md — دفتر المحفظة (Daftar)

Instructions for any coding agent (Claude Code, Codex, Cursor, …) working in this repo.

> **Work follows [`docs/ROADMAP.md`](docs/ROADMAP.md)** — one phase per session, in order, stopping at every ⛔.
> Talk to the project owner in **Egyptian Arabic**. Code, identifiers and commit messages stay in English.

## What this app is

A ledger for a small mobile-wallet service point in Egypt (نقطة خدمات محافظ إلكترونية).
The shop owner records every customer operation and the app tracks wallet balances,
wallet limits, profit, and the cash drawer.

- **Services:** Vodafone Cash wallets (`vf`) and InstaPay (`insta`).
- **Operation kinds** (`data-k`): `out` تحويل, `in` سحب, `iout`/`iin` (InstaPay), `topup`, `cashout`, `itopup`, `icashout`.
- **Money model:** customer commission (`f`) is profit; wallet fees charged to the owner (`c`) reduce profit.
  Wallets have daily and monthly limits that reset at midnight / first of month, **Cairo time**.
- **Tabs:** عملية (new operation) · المحافظ (wallets, with balance totals) · اليوم (today: profit tiles, wallet balances, cash count & daily close) · الآجل (customer deferred-cash accounts) · السجل (history). إعدادات (settings, backup, wipe, account) opens from the gear icon in each page header on phones, and stays in the nav on wider screens.
- **Limits:** a wallet may carry `pre: {mk, i, o}` (usage this month before the app was used, entered as "remaining" in the wallet sheet); it counts only while `mk` is the current month.
- **Sync:** Firebase Auth + Firestore (collections `ledger`, `wallets`, `settings`, `closes`), offline-first with a local DB fallback. Several phones can share one ledger.
- **Android:** `.github/workflows/build-apk.yml` wraps the web app with Capacitor 6 and adds a native `SmsReader` plugin that reads Vodafone Cash SMS (`parseSms`, `scanSms`).

## Repo layout

Clean architecture, native ES modules, **still no build step**. `index.html` is a thin shell: markup,
`<link>`s to `styles/*.css`, and one `<script type="module" src="src/main.js">`. The full layer-by-layer
map (every function, every piece of state, where it lives and why) is `docs/ARCHITECTURE.md`; the
pre-refactor snapshot of the old single-file app is `docs/inventory.md`.

| Path | Role |
|---|---|
| `index.html` | Thin shell: markup + stylesheet links + the one module script tag |
| `styles/` | `tokens.css` (design tokens, light/dark), `base.css`, `layout.css`, `components.css` — exactly the old `<style>` block's rules, split, not redesigned |
| `src/domain/` | Pure logic: money/fees, limits, Cairo time/day-keys, split planning, wallet ranking, SMS parsing, number normalization. Imports nothing outside `domain/` |
| `src/application/` | Use cases (record/void a tx, close day, manage wallets/settings, wipe, backup, SMS import, auth, sync) + JSDoc ports (`DbPort`, `AuthPort`, `SmsPort`, `ClockPort`) in `ports.js`. Never imports `infrastructure` |
| `src/infrastructure/` | Adapters implementing those ports: Firestore, the local-DB fallback, Firebase Auth, the SMS plugin bridge, `localStorage`, file download/read, service worker registration, the install prompt |
| `src/presentation/` | The store (reactive state, replaces the old `S`/`UI`/`changed()`), router, `dom.js`/`formatters.js`, `views/` (one per tab), `components/` (sheet, toast, pill, bars, txRow, pendingCard) |
| `src/main.js` | Composition root: picks the local or Firestore adapter, wires every use case to it, mounts the views, owns the delegated click handler and the boot sequence. The only module allowed to import from every layer |
| `tests/` | `node --test` suite: `unit/` (domain + application, real code against fake adapters), `helpers/fakeAdapters.mjs` |
| `scripts/check-precache.mjs` | Fails if any file under `src/`/`styles/` is missing from `sw.js`'s `FILES` |
| `sw.js` | Service worker. Caches app files + Firebase SDK for offline |
| `manifest.webmanifest` | PWA manifest (`lang: ar`, `dir: rtl`, theme `#0d6b54`) |
| `firebase-config.js` | Public Firebase web config (not a secret; security is in Firestore rules) |
| `assets/icon-*.png` | App icons |
| `.github/workflows/build-apk.yml` | Debug APK build — manual (`workflow_dispatch`), and automatic on push/PR into `main` |
| `.github/workflows/ci.yml` | `node --test` + `node scripts/check-precache.mjs` on every PR and on push to `saeed-develop`/`main` |
| `README.md` | Minimal GitHub landing page |

### Where to find a built APK

`build-apk.yml` publishes to GitHub Releases (not just the zipped workflow artifact, which needs an
extra unzip step):

- **Push to `main`** → a new release tagged `v1.<run number>`, APK attached as `daftar-v1.<N>.apk`,
  with auto-generated release notes. Only the latest 5 `v1.*` releases are kept; older ones are deleted
  automatically.
- **Any PR into `main`, or a manual `workflow_dispatch` run** → the single rolling pre-release tagged
  `preview` gets its `daftar-preview.apk` asset replaced. The release page URL and the asset's direct
  download URL never change, so that link always serves the latest test build.
- The zipped `daftar-apk` workflow artifact (Actions tab) is also still produced on every run, as a
  harmless backup — prefer the release download link day to day.

There is **no build step, no bundler, no package.json**. Firebase compat SDK 10.12.2 loads from gstatic.
Every `.js` file: plain JS, `// @ts-check` + JSDoc (no TypeScript compiler runs — it's for editor
hints and documentation).

## Hard rules

1. **Bump the cache on every shipped change.** Any change to a cached file → increment `CACHE` in `sw.js` (`daftar-vN` → `daftar-vN+1`), or installed phones keep the old version.
2. **New files must be registered in two places:** the `FILES` array in `sw.js` and the `cp -r` lines in `build-apk.yml` (which copy all of `src/`/`styles/` — a new file inside an existing folder needs no workflow change, but a new top-level file does). Run `node scripts/check-precache.mjs` — it fails if anything under `src/`/`styles/` is missing from `sw.js`.
3. **Don't change stored data shapes casually.** Ledger records, wallets, settings and closes are synced between devices and exist in users' backups. If a field must change, read the old shape too (backward compatible) — never break `restoreData` on old backup files.
4. **Never break offline.** No runtime dependency on a CDN except the already-cached Firebase SDK. Fonts, icons, and images must be local files (and added per rule 2). Inline SVG is preferred for icons.
5. **RTL first.** `<html lang="ar" dir="rtl">`. Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align:start`). Never hard-code `left`/`right` for layout.
6. **Numbers:** displayed with Western digits via `fmt` / `fm2` (`en-US`), with `font-variant-numeric: tabular-nums`. Input accepts Arabic-Indic digits via `NUM()` / `nrm()` — keep that. Phone numbers are `dir="ltr"` + `unicode-bidi:isolate` (`.ph`).
7. **Copy is Egyptian Arabic**, short and practical, matching the existing voice ("الزبون بيدّيني كاش وأنا أحوّل"). Don't switch to formal MSA or English in the UI.
8. **Money logic is load-bearing.** `compute`, `buildPlan`, `rank`, `walletCost`, `xferCost`, `maxAmt`, `cd`, `wd` decide balances and profit. UI work must not change their behavior; if a change is required, state it explicitly and verify the totals before and after with the same inputs.
9. **Destructive actions** (void a tx, wipe transactions, wipe all, restore backup) keep their confirmation step and the `--bad` styling.
10. **Respect the layer boundaries** (see `docs/ARCHITECTURE.md` §1): `domain` imports nothing; `application` imports `domain` and its own `ports.js` shapes, never `infrastructure`; `infrastructure` implements those ports; `presentation` calls `application` use cases and never constructs a `db.collection(...)` call itself. Only `src/main.js` (the composition root) imports from every layer. New code goes in the layer it belongs to — new money/time/kind logic in `domain/`, a new user action in `application/` (+ an adapter in `infrastructure/` if it needs one), new markup/rendering in `presentation/`. **Always `esc()` user text** (from `presentation/formatters.js`) before putting it in `innerHTML`.

## UI work

For any change to layout, styling, navigation, theming, or components, **load the `daftar-ui` skill first** (`.claude/skills/daftar-ui/`). It is the design system for this app: tokens, light/dark/system theme, responsive shell (bottom nav → rail → sidebar), and component recipes.
After a UI change, run the `daftar-ui-review` skill to check it across themes and screen sizes.
For a bigger visual direction (redesign, new screen), `frontend-design` helps pick a deliberate look — but `daftar-ui` rules win where they conflict.

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
node --test                   # the domain + application test suite
node scripts/check-precache.mjs
```

- Service workers need `localhost` or https. When testing CSS/JS changes, use DevTools → Application → "Update on reload", or bump `CACHE`.
- Without Firebase reachable, the app falls back to the local DB.
- Check the browser console: it should be free of errors on every tab.
- `node --test tests/` fails on at least one Node install (`MODULE_NOT_FOUND` on the bare directory path,
  reproducible even outside this repo); bare `node --test` uses the same default discovery and works.

## Git

- Branches: `main` = what users get (live app + APK). `saeed-develop` = integration. Every phase works on its own branch from the latest `saeed-develop`, named in the roadmap.
- **You own the GitHub flow** (with the `gh` CLI, authenticated as the owner). After each phase (or a meaningful chunk):
  1. `git push -u origin <branch>`
  2. Open (or update) a PR into `saeed-develop` with `gh pr create --base saeed-develop` — English title; body = what changed, how it was verified, roadmap phase.
  3. Wait for checks: `gh pr checks --watch`. Fix anything red on the same branch.
  4. When green: `gh pr merge --merge --delete-branch`, then `git checkout saeed-develop && git pull`.
- **`main` is never pushed to directly.** At a ⛔ stop, or when the owner asks, open a release PR `saeed-develop → main` and give the owner its link. **Merge it only after the owner explicitly says so in chat** (e.g. "انشر" / "merge to main"), because merging `main` ships to users.
- Keep `saeed-develop` up to date with `main`: if `main` has commits that `saeed-develop` lacks, merge `origin/main` into `saeed-develop` (via a small PR) before starting a phase.
- Never force-push, never rewrite pushed history, never delete `main` or `saeed-develop`, never touch other people's branches or PRs unless the owner asks.
- If `gh` is missing or not logged in, stop and tell the owner (in Egyptian Arabic) to run `gh auth login` — don't work around it.
- Small, focused commits; message says what changed for the user (e.g. "ui: sidebar navigation on wide screens").
