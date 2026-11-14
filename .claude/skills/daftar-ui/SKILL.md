---
name: daftar-ui
description: Design system for the Daftar wallet-ledger app (Arabic RTL PWA). Load before ANY change to layout, CSS, navigation, theme (light/dark/system), sidebar, menus, cards, forms, sheets, or new screens — markup in index.html, styles in styles/*.css, rendering in src/presentation/.
---

# Daftar UI — design system

The app is used **all day, standing at a counter, on a cheap Android phone**, often one-handed,
sometimes in bright light, by a shop owner who must record an operation in seconds and never
make a money mistake. Every UI decision serves that: **fast to scan, hard to mis-tap, calm, trustworthy.**
It also opens on tablets and desktops (back-office review), where it must use the space well instead of
showing a stretched phone column.

Read `references/tokens.css` for the exact token values and `references/components.md` for component recipes.

## 1. Principles (in priority order)

1. **Money is the hero.** Amounts, balances, profit and differences are the largest, boldest text on a screen, `tabular-nums`, Western digits. Labels are small and muted.
2. **One primary action per screen.** Exactly one `.btn-primary` visible per view (e.g. "تسجيل العملية", "حفظ الجرد وإقفال اليوم"). Everything else is secondary/ghost.
3. **State is always visible.** Sync status, selected service, selected operation kind, selected wallet — never hidden behind a tap.
4. **Color means something.** `--good` = money in / balanced, `--bad` = shortage / destructive, `--warn` = needs attention / offline / near limit, `--accent` = brand + selection. Never use these for decoration. Never rely on color alone — pair with a sign (+/−), icon, or word.
5. **Consistency over novelty.** Reuse a recipe from `components.md` before inventing a new one. A new pattern gets added to `components.md` in the same change.

## 2. Theme: light / dark / system

- Tokens live on `:root`. Dark values apply under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and always under `:root[data-theme="dark"]`. Never write a raw color in a component — only `var(--token)`.
- User choice is three-state — **تلقائي (system) / فاتح / داكن** — shown as a segmented control in إعدادات, and optionally a quick icon toggle in the app header.
- Persist in `localStorage` key `daftar-theme` (`"light" | "dark"`, absent = system), **wrapped in try/catch**. It is a per-device preference — do NOT sync it through Firestore settings.
- Apply it **before first paint** with a tiny inline script in `<head>` (prevents a white flash on dark phones):
  ```html
  <script>try{var t=localStorage.getItem('daftar-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
  ```
- When the effective theme changes, update `<meta name="theme-color">` to the current `--surface` (so the Android status bar matches) and `color-scheme`.
- Dark mode is not inverted light mode: surfaces get lighter as they rise (`--bg` < `--surface` < `--surface-2`), shadows are replaced by borders, accent is the lighter `#4cc29b`, and text on accent uses `--accent-fg`.
- Contrast: body text ≥ 4.5:1, large numbers and icons ≥ 3:1, in **both** themes. Check `--muted` on `--surface-2` especially.

## 3. App shell & navigation (responsive)

Five destinations, always in this order: **عملية · المحافظ · اليوم · السجل · إعدادات**. Each gets an inline SVG icon + label. Same `data-t` values and `showTab()` — only the presentation changes by width.

| Width | Navigation | Content |
|---|---|---|
| `< 640px` (phone) | Fixed **bottom bar**, icon over label, 5 equal items, safe-area padding, active item = accent-soft pill behind icon | One column, `max-width: 560px`, page padding 16px |
| `640–1023px` (tablet) | **Nav rail** on the inline-start side (right in RTL), 80px wide, icon over label | One column up to 720px, centered in remaining space |
| `≥ 1024px` (desktop) | **Sidebar** 248px on inline-start: app name + sync pill at top, nav items (icon + label in a row), account / theme toggle at the bottom | Max 1120px; screens may use 2 columns (see §4) |

Rules:
- One `<nav>` element restyled by media queries — do not duplicate nav markup per breakpoint.
- Active item: `aria-current="page"`, accent-soft background, accent text, 3px indicator bar on the inline-start edge (sidebar) or a pill (bottom bar).
- Touch targets ≥ 48×48px on the bottom bar; ≥ 44px everywhere else.
- Body bottom padding must clear the bottom bar + safe area on phones only; remove it at ≥ 640px.
- Toasts sit above the bottom bar on phones; bottom-center of the content area on wide screens.

### Page header
Every tab starts with a **page header**: title (`--fs-xl`, 700) + optional one-line muted subtitle on the start side, and the screen's secondary actions (e.g. "+ محفظة", date navigation) on the end side. The global header (app name, date, sync pill) shows only on phones; on rail/sidebar layouts that info lives in the sidebar/rail.

## 4. Layout grid & spacing

- Spacing scale (4px base): `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 20, `--sp-6` 24, `--sp-8` 32. Use only these.
- Gap between sections in a page: `--sp-4` (phone) / `--sp-6` (desktop). Gap inside a card: `--sp-3`.
- Group related controls into one card with a small card title; don't let loose inputs float between cards.
- Section titles (`h2`) are small, muted, 600 — they label a group, not shout.
- Desktop two-column pages (≥ 1024px):
  - **عملية:** form (service, kind, amount, fees, note, save) on the start column; suggested wallet picker + summary on the end column, sticky.
  - **اليوم:** tiles across the top; cash count / close card and the day's operations side by side.
  - **المحافظ:** wallet cards in an auto-fill grid, `minmax(260px, 1fr)`.
  - **إعدادات:** settings grouped into sections with a sticky in-page section list, or a 2-column card masonry. Danger zone (wipe) always last, visually separated.
- Long lists (transactions) use row separators inside one card, never one card per row.

## 5. Typography

- Font stack (offline-safe): `system-ui, "Segoe UI", Roboto, "Noto Sans Arabic", Tahoma, sans-serif`. If a custom Arabic font is adopted (e.g. a self-hosted `woff2`), it must be a local file registered in `sw.js` FILES and `build-apk.yml`, with `font-display: swap`, ≤ 2 weights.
- Scale: `--fs-xs` 12, `--fs-sm` 13, `--fs-md` 15 (body), `--fs-lg` 17, `--fs-xl` 20, `--fs-2xl` 26, `--fs-num` 30 (hero amount input / hero tile).
- Arabic needs line-height ≥ 1.5 for body and ≥ 1.25 for big numbers. Never use letter-spacing on Arabic text.
- Weight carries hierarchy: 400 body, 500 labels, 600 titles/active, 700 amounts and primary buttons.

## 6. Components (summary — details in `references/components.md`)

Buttons (primary / secondary / ghost / danger / icon), segmented control, choice cards (operation kind), chips, inputs with label + hint + error, money input, stat tiles, wallet card with limit bars, list rows (transaction), banners/notices, status pill, bottom sheet (phone) ↔ centered dialog (≥ 640px), toast, empty state, skeleton loading.

Every interactive component must have: hover (pointer devices only, `@media (hover:hover)`), `:focus-visible` ring (`--focus`), active/pressed, disabled, and — where relevant — selected state, in both themes.

## 7. Icons

- Inline SVG, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="1.75"`, `fill="none"`, rounded caps/joins, 20–24px. Define once in a hidden `<svg><symbol id="i-…">` sprite and reference with `<use href="#i-…">`.
- Directional icons (back, next, arrows for in/out) must be mirrored correctly for RTL: "next day" points left (←) in RTL.
- Icon-only buttons need `aria-label` in Arabic.

## 8. Motion

Short and functional: 120–200ms, `ease-out`. Tab fade, sheet slide-up, toast fade. Everything wrapped in `@media (prefers-reduced-motion: no-preference)`. No motion on numbers changing.

## 9. Accessibility & input

- Every input has a visible `<label for>`. Money inputs: `inputmode="decimal"`, numeric ones `inputmode="numeric"`, `autocomplete="off"`.
- Error messages appear next to the field in `--bad`, in words, not just a red border.
- `role="status"` on toasts and sync pill updates; sheets/dialogs trap focus and close on Esc and scrim tap.
- Text must survive 130% font scaling without overlap — test with large Android font size.

## 10. Implementation checklist for any UI change

1. Use tokens only; add a token to `references/tokens.css` (and `styles/tokens.css`) if one is truly missing — in both themes.
2. Logical properties only (no `left`/`right`/`margin-left` for layout).
3. Keep all element IDs and `data-*` hooks the JS uses (`data-t`, `data-k`, `data-s`, `data-svc`, IDs listed in markup). If you rename one, update every `$('#…')` reference in `src/presentation/` (mainly `views/` and `components/`) and `src/main.js`.
4. Don't touch money functions (see AGENTS.md rule 8; they live in `src/domain/`).
5. Bump `CACHE` in `sw.js`; run `node scripts/check-precache.mjs` if you added a file.
6. Run the `daftar-ui-review` skill.
