# UI audit — phase 12

Method: screenshots + computed-style measurements over a real headless Chrome (CDP), every tab +
login + an open sheet, light/dark, 360px/1280px, plus a 130% font-zoom pass (reusing the phase 11
review matrix). Code read of every view/component file for inline-style and copy drift. All items
below were fixed in this phase unless marked "kept as-is" with a reason.

## Findings

1. **Global top app bar duplicates info and wastes space on phones.** `.top` (app name, date, sync
   pill) stays fixed above every tab. On phones its sync status duplicates nothing yet (the sidebar's
   `.nav-head` copy only exists at ≥1024px) but it costs ~70-80px of scroll space before any tab's own
   content starts, on every single tab. **Fixed:** removed `.top`; the date+sync pill now lives in each
   tab's `.page-head` (a single pair of DOM nodes relocated by `router.js` on every tab switch — no
   duplication), hidden at ≥1024px where the sidebar's `.nav-head` already shows the same thing.

2. **"InstaPay" spelled two different ways.** "إنستاباي" (no space) is used in 15+ places (kind labels,
   tiles, tags, settings labels, kinds.js) but `transaction.js`'s `svcHTML` (the service switch shown on
   both عملية and المحافظ) and `history.js`'s filter chips used "إنستا باي" (with a space). **Fixed:**
   standardized to "إنستاباي" in both places.

3. **Four different ad hoc inline button-size overrides.** To make a primary button look balanced next
   to a secondary one in a `<div class="row">` footer, four call sites each hand-rolled a slightly
   different `padding` override: `ocSave` (`11px`), `sSave` (`11px`), `data-pok` (`9px`), and
   `data-oc` (the opening-cash-card button, `10px 14px` + `font-size:14px` — not a token value
   anywhere). Separately, `installBtn`'s `padding:11px` override was dead code: `.btn-primary`'s own
   `min-height:52px` already forces the same box height regardless. **Fixed:** added one rule
   (`.row .btn-primary{min-height:44px;padding:0 14px}`) for paired footer rows and deleted all four
   inline overrides plus the dead one on `installBtn`.

4. **A text-link button was below the 44px touch-target minimum.** `.more` (used for "نسيت كلمة السر؟")
   had no `min-height` at all, and `#resetBtn`'s inline `padding:4px` shrank its tappable height to
   about 30px — under the skill's own 44px rule. **Fixed:** `.more` now has `min-height:44px`; the inline
   override is gone.

5. **Hardcoded font-size duplicating a token's value.** `#auth h1{font-size:26px}` in `layout.css`
   happens to equal `var(--fs-2xl)` today but would silently drift if that token ever changed.
   **Fixed:** now reads `var(--fs-2xl)`.

6. **إعدادات doesn't use the extra width on tablet/desktop.** Every other screen gets a deliberate
   multi-column layout at ≥1024px (`.screen-split` on عملية/اليوم, an auto-fill grid on المحافظ), but
   settings stayed one ~1120px-wide column — cards with a 2-field grid ended up with huge dead
   horizontal space, and the plain-text cards (قراءة الرسائل، مكان البيانات) looked stretched and
   empty. The daftar-ui skill explicitly suggests "a 2-column card masonry" for this screen. **Fixed:**
   settings' cards now sit in a `.settings-grid` that becomes a 2-column CSS-columns masonry at
   ≥1024px (`break-inside:avoid` per card); the danger zone spans both columns and stays last.

7. **Dark mode read as "inverted light mode," not deliberate.** `--bg:#0d1311` sits right at the edge of
   pure black, and because `--shadow-1` is `none` in dark mode, cards/sheets had almost no visible lift
   off the page — separation relied entirely on `--line`, which was barely distinguishable from
   `--surface`. Confirmed in screenshots: the wallet-edit bottom sheet was nearly invisible against the
   scrim-darkened background. **Fixed:** lightened `--bg`/`--surface`/`--surface-2` and firmed up
   `--line`/`--line-strong` for a calmer, clearly-layered dark palette (ratios below); gave the
   phone-width bottom sheet a subtle top border in dark mode for definition it didn't have before.

8. **Checked, no change needed:** card recipe (14px padding, 12px radius, shadow-1, 10px internal gap)
   is identical across all 5 tabs and the sheet; section-title (`h2`) styling is identical everywhere;
   every *standalone* primary button is the same size; nav icons are all 22px via the shared sprite; no
   hardcoded border-radius or icon-size values exist outside the token/component files; empty states
   (`.empty`) share the same wording pattern and styling; "exactly one primary button per screen" holds
   on every tab (history and the SMS-pending card intentionally have none/zero, as a browse-only and a
   per-row list don't need one); RTL layout, `.ph` phone-number isolation, and the spacing scale (4/8/
   12/16/20/24/32px, no stray values) are all correct and consistent; no raw hex colors leak into any
   JS/CSS file outside `styles/tokens.css` (the two hex values in `manifest.webmanifest` and the
   `<meta theme-color>` fallback in `index.html` are necessarily static and already match the tokens).
   **Kept as-is, reviewed and not a bug:** السجل's day-picker area shows the same day three ways (a
   native date input, a row of quick-pick day chips, and a full text label) — intentionally three
   different, genuinely useful navigation affordances rather than copy drift; trimming any of them
   would reduce usability, not fix an inconsistency.

## Contrast ratios (WCAG relative luminance)

All ratios below meet the ≥4.5:1 body-text target and the ≥3:1 large-text/icon target in both themes.

| Pair | Light | Dark (new) |
|---|---|---|
| `--fg` on `--bg` | 15.45 | 15.19 |
| `--fg` on `--surface` | 16.78 | 13.70 |
| `--muted` on `--surface-2` | 4.98 | 5.91 |
| `--muted` on `--bg` | 5.19 | 7.32 |
| `--accent-fg` on `--accent` | 6.47 | 7.15 |
| `--accent` on `--surface` (icons/numbers) | 6.47 | 7.34 |
| `--good`/`--warn`/`--bad`/`--info` on their own `-soft` | 6.7–7.4 (light unchanged) | 6.77–7.21 |
| `--accent` on `--accent-soft` (selected chip/card text) | — | 6.01 |

`--line`/`--line-strong` border visibility is a deliberately soft, low-contrast hairline in both themes
(by design, same as before) — card separation now also comes from the `--surface`/`--surface-2` fill
step itself, not the border alone.
