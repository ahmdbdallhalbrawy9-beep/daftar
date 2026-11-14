---
name: daftar-ui-review
description: Verify a UI change in the Daftar app across light/dark themes, phone/tablet/desktop widths, RTL, and core flows before committing. Use after any change to index.html styles, markup, or navigation.
---

# Daftar UI review

Run this after a UI change and before committing. Report findings as a short list: what you checked, what failed, what you fixed.

## 1. Serve

```bash
python3 -m http.server 8080
```
Open `http://localhost:8080`. Disable the service worker cache while reviewing (DevTools → Application → Service Workers → "Update on reload"), or you will see the old version.

If Playwright (Python or Node) is available, script the screenshots below; otherwise use the browser's device toolbar manually.

## 2. Matrix

Check every tab (عملية · المحافظ · اليوم · السجل · إعدادات) plus the login screen and one open sheet (add/edit wallet), at:

| Width | Device |
|---|---|
| 360 × 760 | small Android (the main target) |
| 412 × 915 | common Android |
| 768 × 1024 | tablet → rail layout |
| 1280 × 800 | desktop → sidebar layout |

× **light** and **dark** (set `document.documentElement.dataset.theme`), plus **system** with the OS in dark mode once.

## 3. Checklist

**Layout & RTL**
- [ ] No horizontal scroll at 360px (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] Navigation matches the width: bottom bar < 640, rail 640–1023, sidebar ≥ 1024. Active item is obvious.
- [ ] Nothing hidden behind the bottom bar or the phone's safe areas; last button on each tab is reachable.
- [ ] Everything reads right-to-left: icons, arrows (السابق/التالي), progress bars fill from the right, chevrons.
- [ ] Phone numbers and amounts don't flip or mix direction (`.ph` is ltr-isolated).

**Theme**
- [ ] No hard-coded colors leaked (grep the diff for `#` hex values and `rgb(` outside the token block).
- [ ] Text, borders, focus rings, tags and limit bars are readable in both themes; no white flash on reload in dark.
- [ ] `<meta name="theme-color">` follows the theme; theme choice persists after reload.

**Usability**
- [ ] Tap targets ≥ 44px (bottom nav ≥ 48px).
- [ ] One primary button per screen.
- [ ] Keyboard: Tab order is logical, focus ring visible, Esc closes sheets.
- [ ] 130% font size (Android "large text") — no overlapping or clipped labels.

**Function (must be unchanged)**
- [ ] Record one transfer and one withdrawal: summary, suggested wallet, saved row, wallet balance and today's tiles update as before.
- [ ] Switch service vf ↔ insta, change kind, change commission chips.
- [ ] Open/close a sheet; daily close card still computes differences.
- [ ] Console has no errors or warnings on any tab.

**Ship**
- [ ] `CACHE` in `sw.js` bumped.
- [ ] Any new file added to `sw.js` FILES and `build-apk.yml` copy line.
