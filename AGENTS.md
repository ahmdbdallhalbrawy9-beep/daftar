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
- **Tabs:** عملية (new operation) · المحافظ (wallets) · اليوم (today: tiles, cash count & daily close) · السجل (history) · إعدادات (settings, backup, wipe, account).
- **Sync:** Firebase Auth + Firestore (collections `ledger`, `wallets`, `settings`, `closes`), offline-first with a local DB fallback. Several phones can share one ledger.
- **Android:** `.github/workflows/build-apk.yml` wraps the web app with Capacitor 6 and adds a native `SmsReader` plugin that reads Vodafone Cash SMS (`parseSms`, `scanSms`).

## Repo layout

| File | Role |
|---|---|
| `index.html` | The whole app: markup, `<style>` (design tokens + components), and one `<script>` IIFE |
| `sw.js` | Service worker. Caches app files + Firebase SDK for offline |
| `manifest.webmanifest` | PWA manifest (`lang: ar`, `dir: rtl`, theme `#0d6b54`) |
| `firebase-config.js` | Public Firebase web config (not a secret; security is in Firestore rules) |
| `icon-*.png` | App icons |
| `.github/workflows/build-apk.yml` | Manual (`workflow_dispatch`) debug APK build |

There is **no build step, no bundler, no package.json**. Firebase compat SDK 10.12.2 loads from gstatic.

> This single-file layout is **temporary**. Roadmap track 1 (phases 1–6) moves it to a clean architecture
> (`src/domain`, `src/application`, `src/infrastructure`, `src/presentation`, `styles/`) with native ES modules
> and still no build step. During that track, `docs/ARCHITECTURE.md` (once approved) overrides rule 10 below.
> Phase 6 rewrites this section.

## Hard rules

1. **Bump the cache on every shipped change.** Any change to a cached file → increment `CACHE` in `sw.js` (`daftar-vN` → `daftar-vN+1`), or installed phones keep the old version.
2. **New files must be registered in two places:** the `FILES` array in `sw.js` and the `cp ...` line in `build-apk.yml`. Otherwise they will be missing offline and in the APK.
3. **Don't change stored data shapes casually.** Ledger records, wallets, settings and closes are synced between devices and exist in users' backups. If a field must change, read the old shape too (backward compatible) — never break `restoreData` on old backup files.
4. **Never break offline.** No runtime dependency on a CDN except the already-cached Firebase SDK. Fonts, icons, and images must be local files (and added per rule 2). Inline SVG is preferred for icons.
5. **RTL first.** `<html lang="ar" dir="rtl">`. Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align:start`). Never hard-code `left`/`right` for layout.
6. **Numbers:** displayed with Western digits via `fmt` / `fm2` (`en-US`), with `font-variant-numeric: tabular-nums`. Input accepts Arabic-Indic digits via `NUM()` / `nrm()` — keep that. Phone numbers are `dir="ltr"` + `unicode-bidi:isolate` (`.ph`).
7. **Copy is Egyptian Arabic**, short and practical, matching the existing voice ("الزبون بيدّيني كاش وأنا أحوّل"). Don't switch to formal MSA or English in the UI.
8. **Money logic is load-bearing.** `compute`, `buildPlan`, `rank`, `walletCost`, `xferCost`, `maxAmt`, `cd`, `wd` decide balances and profit. UI work must not change their behavior; if a change is required, state it explicitly and verify the totals before and after with the same inputs.
9. **Destructive actions** (void a tx, wipe transactions, wipe all, restore backup) keep their confirmation step and the `--bad` styling.
10. Keep the JS style of the file: one IIFE, `"use strict"`, `var`, small helpers (`$`, `$$`, `esc`). **Always `esc()` user text** before putting it in `innerHTML`.

## UI work

For any change to layout, styling, navigation, theming, or components, **load the `daftar-ui` skill first** (`.claude/skills/daftar-ui/`). It is the design system for this app: tokens, light/dark/system theme, responsive shell (bottom nav → rail → sidebar), and component recipes.
After a UI change, run the `daftar-ui-review` skill to check it across themes and screen sizes.
For a bigger visual direction (redesign, new screen), `frontend-design` helps pick a deliberate look — but `daftar-ui` rules win where they conflict.

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

- Service workers need `localhost` or https. When testing CSS/JS changes, use DevTools → Application → "Update on reload", or bump `CACHE`.
- Without Firebase reachable, the app falls back to the local DB.
- Check the browser console: it should be free of errors on every tab.

## Git

- Work on the branch the roadmap phase names (branched off `saeed-develop`); `main` is what ships.
- **Never `git push`** — the owner pushes and merges.
- Small, focused commits; message says what changed for the user (e.g. "ui: sidebar navigation on wide screens").
