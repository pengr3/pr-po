# Spike Conventions

Patterns and stack choices established across spike sessions.

## Stack
- **Language:** Vanilla JS (ES6), no transpilers, no npm
- **Serving:** `python -m http.server 8000` from project root
- **Styling:** Inline `<style>` in spike.html — no external CSS deps
- **Colors:** Follow project design system — primary `#1a73e8`, dark `#1557b0`, text `#1e293b`, muted `#64748b`, border `#e2e8f0`

## Structure
- Each spike lives in `.planning/spikes/NNN-name/`
- Files: `spike.html` (runnable demo) + `README.md` (findings)
- Spikes are served at `http://localhost:8000/.planning/spikes/NNN-name/spike.html`

## Patterns
- **Self-contained:** spike.html works as a single file with no external imports
- **Interactive by default:** build something the user can feel, not just console output
- **Mock with app colors:** UX spikes mock the actual app nav/layout using project CSS vars
- **Controls overlay:** floating bottom-left panel for triggering demo states
