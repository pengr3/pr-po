---
quick_id: 20260531-mbl
slug: multi-baseline-selector-toggle
description: Phase 86.12 UAT follow-up — multi-baseline selector + Set/Clear toggle
related_phase: 86.12
date_completed: 2026-06-01
status: complete
commit: 0d39f80
files_changed:
  - app/views/project-plan.js
  - styles/views.css
---

# Quick Task 20260531-mbl — Summary

## What shipped

Closed the two UX gaps surfaced during Phase 86.12 browser UAT.

### Data layer (`app/views/project-plan.js`)

- `loadBaseline()` → `loadBaselines()` — fetches **all** baseline docs for the current
  project ordered `created_at desc`. Drops the `limit(1)` clause from the Firestore
  query, and the unused `limit` import along with it.
- Module state additions:
  - `_baselines: Array<{id, label, created_at, tasks}>` — full set, newest first.
  - `_activeBaselineId: string | null` — id of the doc currently driving the overlay.
    `null` = overlay hidden.
- `_baselineData` is now derived from `_activeBaselineId` (and kept in sync inside the
  three lifecycle helpers below), so all existing overlay code paths
  (`injectBaselineOverlay`, `renderSlipSummary`) work unchanged.
- `init()` calls `loadBaselines()` instead of `loadBaseline()`. On initial load, the
  most-recent baseline is auto-selected (preserves the previous single-baseline
  behavior for projects with exactly one saved baseline).
- `destroy()` clears `_baselines = []` and `_activeBaselineId = null` alongside the
  existing `_baselineData = null`.

### UI (`app/views/project-plan.js` + `styles/views.css`)

Toolbar markup change — replace the single `Set Baseline` button with a selector + a
state-aware toggle button:

```html
<select id="baselineSelect" class="plan-baseline-select"
        onchange="window.selectBaseline(this.value)" …>
  <option value="">— none —</option>
</select>
<button id="baselineToggleBtn" class="plan-export-btn plan-baseline-btn"
        onclick="window.toggleBaseline()">Set Baseline</button>
```

Four new functions, all module-scope:

- `toggleBaseline()` — single dispatcher. If `_activeBaselineId` is set, calls
  `clearBaseline()`; otherwise calls `saveBaseline()`.
- `selectBaseline(id)` — selector `change` handler. Empty value routes through
  `clearBaseline()`. Otherwise looks up the doc in `_baselines`, updates
  `_activeBaselineId` + `_baselineData`, and re-runs the overlay + summary + toolbar UI.
- `clearBaseline()` — hides the overlay (`_activeBaselineId = null`, removes overlay SVG
  elements, calls `renderSlipSummary()` which auto-hides because `_baselineData` is null).
  **Does not** call `deleteDoc` — saved baselines persist in Firestore.
- `updateBaselineToolbarUI()` — rebuilds the `<select>` options from `_baselines` (with
  `— none —` first, all labels through `escapeHTML`), and flips the toggle button label
  and title between "Set Baseline" / "Clear Baseline" based on `_activeBaselineId`.

`saveBaseline()` updated:
- Calls `loadBaselines()` instead of `loadBaseline()`.
- Calls `updateBaselineToolbarUI()` after the overlay refresh so the new baseline shows
  up in the selector + the button label flips to "Clear Baseline".

Window registrations: `window.toggleBaseline`, `window.selectBaseline`,
`window.clearBaseline` added in `init()`, deleted in `destroy()`.

CSS (`styles/views.css`) — added `.plan-baseline-select` styling so the dropdown sits
naturally between the Export button and the toggle button (1px gray-200 border, 6px
radius, 13px font, primary-blue focus ring). Total: 18 lines of CSS.

## Diff stat

```
 app/views/project-plan.js | 131 ++++++++++++++++++++++++++++++++++++++++------
 styles/views.css          |  18 +++++++
 2 files changed, 133 insertions(+), 16 deletions(-)
```

## Verification (must_haves)

- [x] `_baselines` array module state present and populated by `loadBaselines()`.
- [x] `_activeBaselineId` drives both the overlay and the toggle button label.
- [x] Toolbar contains `#baselineSelect` and `#baselineToggleBtn`.
- [x] `window.toggleBaseline`, `window.selectBaseline`, `window.clearBaseline` registered
      in `init()` and deleted in `destroy()`.
- [x] Clear Baseline does NOT call `deleteDoc` — baselines persist in Firestore (grep
      confirms `deleteDoc` is only used elsewhere for task ops, not baselines).
- [x] All baseline labels rendered via `escapeHTML()` (no XSS regression vs Phase 86.12).
- [x] No stale `loadBaseline()` callers remain (grep returned no matches).
- [x] Node syntax check passes.

## Browser UAT — still needed

The 7 browser-observable checks from `.planning/phases/86.12-project-plan-baseline-snapshot/86.12-VERIFICATION.md`
must be re-run. New checks added by this task:

1. **Multi-baseline accumulation** — save 3 baselines on a project. Selector lists
   `Baseline 3`, `Baseline 2`, `Baseline 1` newest-first. Baseline 3 preselected.
2. **Selector swap** — pick Baseline 1. Overlay updates to compare against Baseline 1's
   task dates. Slip badges and summary recompute. Button still reads "Clear Baseline".
3. **Clear preserves docs** — click Clear Baseline. Overlay disappears, selector resets
   to "— none —", button flips to "Set Baseline". Reload the page → all 3 baselines
   still in the dropdown (proves no `deleteDoc` ran).
4. **Set after clear** — from the cleared state, click "Set Baseline". A new
   `Baseline 4` doc is created, auto-selected. Button flips to "Clear Baseline".
5. **Existing single-baseline UAT** — checks 1–7 from `86.12-VERIFICATION.md` still pass.

## Decisions applied (from HANDOFF.json, 2026-05-31)

- Multi-baseline accumulation — `saveBaseline` always creates a new `Baseline N+1` doc;
  never overwrites.
- Toolbar has selector dropdown + Set↔Clear toggle button.
- Clear Baseline hides overlay + resets selector but does NOT delete Firestore docs.
- No per-baseline delete UI for now (deferred until accumulation becomes painful).

## Follow-ups / deferred

- Per-baseline delete affordance — explicitly deferred per HANDOFF.json. Revisit only
  if accumulation becomes a problem in the wild.
- Phase 86.12 close-out — after browser UAT passes, mark Phase 86.12 complete in
  ROADMAP.md and delete `.planning/HANDOFF.json`.
