@AGENTS.md

## Claude Code notes

- `/next` runs the next unfinished phase of `docs/ROADMAP.md`. That's the normal way to work here.
- Project skills live in `.claude/skills/`: `daftar-ui` (design system — load before any UI change), `daftar-ui-review` (check a UI change), `frontend-design` (visual direction for redesigns).
- `index.html` is a thin shell (markup + stylesheet links + one module script tag). Styling lives in `styles/*.css`; behavior lives in `src/`. See `docs/ARCHITECTURE.md` for the full layer map before working in `src/`.
