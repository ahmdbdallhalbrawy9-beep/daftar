# Daftar component recipes

All values come from `tokens.css`. RTL logical properties throughout. Each recipe lists the
states it must support. When you build a new reusable pattern, add it here.

## Buttons

| Variant | Use | Look |
|---|---|---|
| `.btn-primary` | The one main action of a screen | `--accent` bg, `--accent-fg`, 700, min-height 52px, `--r-md`, full width on phone |
| `.btn` (secondary) | Other actions (حفظ in settings cards) | `--surface-2` bg, `--fg`, 600, min-height 44px |
| `.btn-ghost` | Low-emphasis (السابق / التالي, cancel) | transparent, 1px `--line-strong`, 500 |
| `.btn-danger` | Destructive | transparent, `--bad` text + border; filled `--bad` only on the final confirm |
| `.btn-icon` | Icon-only | 44×44, `--r-pill`, needs `aria-label` |

States: `:hover` (only in `@media (hover:hover)`) → `--accent-hover` / `--surface-2`; `:active` → `transform: scale(.98)`;
`:focus-visible` → `outline: 2px solid var(--focus); outline-offset: 2px`; `:disabled` → opacity .45, `cursor:not-allowed`.
A busy state replaces the label with "جارٍ الحفظ…" and disables the button (no double-saves of a transaction).

## Segmented control (`.seg`)
Service switch (فودافون كاش / إنستا باي), theme switch (تلقائي / فاتح / داكن), filters with 2–4 options.
Container `--surface-2`, `--r-md`, padding 4px; options equal width; selected option = `--surface` bg + `--shadow-1` + 700 (light) / `--accent-soft` + `--accent` text (dark). `role="radiogroup"`, options `role="radio"` + `aria-checked`.

## Choice cards (`.kind`) — operation kind
2-column grid. Title (`--fs-lg`, 700) + one-line hint (`--fs-xs`, muted). Optional leading icon (in = arrow into wallet, out = arrow out).
Selected: `--accent` border 2px + `--accent-soft` bg + accent title (prefer this over a fully filled card, it keeps the hint readable).
Secondary kinds (`.kind.mini`: تعبئة / سحب كاش …) sit in a collapsible "عمليات تانية" row so the 4 main kinds dominate.

## Chips (`.chip`)
Quick picks (commission %, destination, filters, days). Height 32px, `--r-pill`, `--surface-2`. Selected: `--accent-soft` + `--accent` text + 1px `--accent` border. Horizontal scroll on phone (`overflow-x:auto; scrollbar-width:none`) rather than wrapping to 3+ lines.

## Form fields
```
<div class="field">
  <label for="x">العمولة (جنيه)</label>
  <input id="x" inputmode="decimal">
  <p class="hint">اختياري</p>          <!-- muted, --fs-xs -->
  <p class="err" hidden>…</p>            <!-- --bad, --fs-xs -->
</div>
```
Input: min-height 44px, `--surface-2` bg, 1px `--line-strong`, `--r-sm`, padding `--sp-3`. Focus: border `--accent` + focus ring. Invalid: border `--bad` + `.err` text.
Two fields side by side (`.f2`) only when both are short numbers; stack them under 360px.

### Money input (`input.big`)
`--fs-num`, 700, centered, `tabular-nums`, suffix "ج" in muted at inline-end. Live summary (`.sum`) directly below shows what will happen: total from customer, profit, wallet after.

## Stat tiles (`.tile`)
Label (`--fs-xs`, muted) above value (`--fs-2xl`, 700, tabular). Optional delta line colored good/bad with +/−. `.tile.hero` spans full width, `--accent` bg, value `--fs-num`. Grid: 2 columns phone, 4 columns desktop.

## Wallet card (`.wcard`)
Header: wallet name (600) + phone (`.ph`, ltr) + status tag. Balance big (`--fs-xl`, 700).
Limit bars: daily and monthly, label + "used / limit" on one line, 6px bar `--surface-2` track, fill `--accent`; ≥ 80% → `--warn`, ≥ 100% → `--bad`. Inactive wallet: opacity .55 + "موقوفة" tag. Whole card is a button opening the edit sheet.

## Wallet picker row (`.w`)
Selectable row for the suggested wallet. Recommended tag (`.tag.rec`). Selected: 2px `--accent` border. Not usable (limit/balance): opacity .6 + reason in `--bad` text — never just disabled with no reason.

## List row (`.tx`) — transaction
Inside one card, separated by 1px `--line`. Start: kind icon in a 36px `--surface-2` circle; title (600) + meta line (time · wallet · note, muted `--fs-xs`). End: amount (700, tabular; + green for money in, − for out) and profit underneath muted. Void action: overflow menu or swipe → confirm sheet; never a bare red text button on every row.
Group rows by hour or by close, with a sticky small group header.

## Banners / notices (`.notice`)
Full-width, `--r-md`, icon + text + optional action button at inline-end. Variants: info, warn (offline, unsynced, near limit), bad (cash shortage, sync error), good. One-line where possible; dismissible if not critical.

## Status pill (`.pill`)
Sync state: dot + word. متزامن (good), جارٍ الاتصال… (warn), بدون نت — محفوظ على الجهاز (warn), خطأ (bad). `role="status"`.

## Sheet / dialog
Phone (< 640px): bottom sheet, `--r-xl` top corners, drag handle 36×4px, max-height 92dvh, sticky footer with actions, safe-area bottom padding.
≥ 640px: centered dialog, max-width 480px, `--r-lg`, `--shadow-2`.
Both: `--scrim` backdrop, focus trapped, Esc + scrim tap close (except destructive confirms, which need an explicit button), title at top, primary action at the end of the footer.

## Toast
`--fg` bg, `--bg` text (inverted), `--r-md`, max-width 420px, 2.8s. Error toast `--bad` bg. Above bottom nav on phone.

## Empty state
Centered muted icon (40px) + one sentence + optional action. E.g. "لسه مفيش عمليات النهارده" + button "سجّل أول عملية".

## Loading
Skeleton blocks (`--surface-2`, shimmer only with no-reduced-motion) for tiles and lists while `S.ready` is false — not a blank screen.

## Settings layout
Group cards under section titles: الأسعار والعمولات · رسوم المحافظ · المظهر (theme) · الرسائل SMS · الحساب والمزامنة · النسخ الاحتياطي · منطقة الخطر (wipe, last, `--bad-soft` header strip).
