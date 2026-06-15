---
phase: "97"
plan: "02"
subsystem: "project-plan"
tags: [iteration-history, right-rail, diff-panel, css-scaffolding, state-vars]
dependency_graph:
  requires: []
  provides: [97-02-state-vars, 97-02-html-shell, 97-02-css-classes]
  affects: [app/views/project-plan.js, styles/views.css]
tech_stack:
  added: []
  patterns: [module-scope-state, render-html-shell, css-class-block-insertion]
key_files:
  created: []
  modified:
    - app/views/project-plan.js
    - styles/views.css
decisions:
  - "All 14 state variable declarations placed at end of module-scope state block, before // ---- Lifecycle ---- comment"
  - "iter-diff-panel placed as sibling of plan-body-row (not inside plan-split-pane) to avoid overflow:hidden clipping — per Pitfall 5 in RESEARCH.md"
  - "iter-rail uses hidden attribute + :not([hidden]) CSS selector for width transition — avoids JS class toggle overhead"
  - "CSS block inserted verbatim from 97-RESEARCH.md between .plan-divider:hover block and Phase 86.1 comment"
metrics:
  duration: "~10 min"
  completed: "2026-06-02"
  tasks: 3
  files: 2
---

# Phase 97 Plan 02: Iteration History Scaffolding Summary

**One-liner:** HTML/CSS/state-variable scaffolding for the 260px iteration history right rail, inline diff panel, undo toast, and toolbar buttons — foundation for Plans 03–05.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add Phase 97 state variables to project-plan.js | a56e77c | app/views/project-plan.js |
| 2 | Update render() with iteration HTML shell + toolbar buttons | 9230046 | app/views/project-plan.js |
| 3 | Add iteration CSS blocks to views.css | adc7efe | styles/views.css |

## What Was Built

**Task 1 — State Variables (14 new declarations):**
- 6 feature state vars: `_iterations`, `_autoSnapId`, `_undoToastTimer`, `_activeDiffIterationId`, `_iterRailOpen`, `_iterSeq`
- 8 window function handler refs for destroy() cleanup: `_iterSaveHandler`, `_iterToggleRailHandler`, `_iterCloseRailHandler`, `_iterOpenConfirmHandler`, `_iterToggleDiffHandler`, `_iterCloseIterDiffHandler`, `_iterUndoRestoreHandler`, `_iterConfirmLoadHandler`

**Task 2 — render() HTML Shell:**
- Two toolbar buttons ("Save Iteration" with `class="plan-iter-save-btn"`, "History" with `id="iterHistoryBtn" class="plan-iter-history-btn"`) inserted between the Set Baseline button and the search input
- `<div class="plan-body-row" id="planBodyRow">` wraps planSplitPane and iterRail as a flex row
- `<div class="iter-rail" id="iterRail" hidden>` with head (History + count badge + close button), save-row button, and empty timeline div
- `<div class="iter-diff-panel" id="iterDiffPanel" hidden>` with head (title, summary, Load/Close buttons), legend (4 color dots), and diff table (thead Status/Task/Start/End/Deps/Assignees/Progress + empty tbody#iterDiffBody)
- diff panel is a direct child of plan-view-surface (sibling of plan-body-row), NOT inside plan-split-pane

**Task 3 — CSS (57 new selectors, ~370 lines):**
- `.plan-body-row` flex row + `> .plan-split-pane` flex grow rules
- Full right rail: `.iter-rail`, `.iter-rail:not([hidden])` (260px width), head, badge, close, save-row, save-btn, timeline
- Timeline cards: `.iter-timeline-item` with connector line pseudo-element, dot (+ .auto variant), content, name, meta, auto-tag, action buttons (.diff-btn/.load-btn with hover/active states)
- Diff panel: `.iter-diff-panel`, `[hidden]` override, head, title, summary, load-btn, close, legend, dot colors (chg/add/del/same), table (th sticky headers, row status backgrounds)
- Diff badges: `.iter-diff-badge` (.changed/.added/.removed/.same), `.iter-diff-old`, `.iter-diff-new`
- Undo toast: `.iter-undo-toast` (fixed position, bottom:90px, 5s window), `.iter-undo-btn`
- Toolbar active state: `.plan-iter-history-btn.active`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `id="iterRailTimeline"` div is intentionally empty — renderIterRail() (Plan 03) fills it
- `id="iterDiffBody"` tbody is intentionally empty — renderDiffPanel() (Plan 05) fills it
- `id="iterCountBadge"` shows 0 — updateable by renderIterRail() in Plan 03
- `id="iterDiffTitle"` shows "Comparing with …" — Plan 05 sets actual label
- All onclick handlers (`window.saveIteration`, `window.toggleIterRail`, `window.closeIterRail`, `window.openIterConfirm`, `window.closeIterDiff`) are no-ops until Plan 03 registers them — clicking before init() completes is a no-op (acceptable per plan threat model)

These stubs are intentional scaffolding — Plans 03–05 wire the functions.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced in this plan. The HTML shell contains onclick references to window functions that are not yet registered (Plans 03–05 register them). The `window._activeDiffIterationId` exposed on window (for inline onclick in diff panel) is addressed in Plan 05.

## Self-Check: PASSED

- `app/views/project-plan.js` exists and contains `let _iterations = [];` (line 113), `let _iterRailOpen = false;` (line 117), `let _iterConfirmLoadHandler = null;` (line 128), `class="plan-body-row"` (line 182), `id="iterRail"` (line 193), `id="iterDiffPanel"` (line 205), `class="plan-iter-save-btn"` (line 165)
- `styles/views.css` exists and contains `.iter-rail {` (line 2373), `.iter-diff-panel {` (line 2534), `.iter-undo-toast {` (line 2685), `.plan-body-row {` (line 2360), `.iter-diff-row-removed td` (line 2646)
- Commits a56e77c, 9230046, adc7efe all verified in git log
