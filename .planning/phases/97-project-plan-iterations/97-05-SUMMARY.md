---
phase: "97"
plan: "05"
subsystem: "project-plan"
tags: [diff-view, computeDiff, renderDiffPanel, toggleIterDiff, closeIterDiff, window-lifecycle, XSS-escapeHTML]
dependency_graph:
  requires:
    - phase: "97-04"
      provides: "restoreIteration, undoIterRestore, init/destroy Phase 97 wiring base"
    - phase: "97-03"
      provides: "renderIterRail (called after diff toggle), _activeDiffIterationId module var, _iterations array"
    - phase: "97-02"
      provides: "#iterDiffPanel, #iterDiffTitle, #iterDiffSummary, #iterDiffBody DOM elements in render()"
  provides:
    - "computeDiff(liveTasks, snapTasks) — pure diff of two task arrays by id"
    - "renderDiffPanel(iter, diffRows) — fills #iterDiffBody with color-coded rows + old→new inline spans"
    - "toggleIterDiff(iterationId) — opens/closes diff panel, sets window._activeDiffIterationId"
    - "closeIterDiff() — hides diff panel, clears window._activeDiffIterationId"
    - "Phase 97 fully complete — all 4 spike requirements shipped"
  affects: [app/views/project-plan.js]
tech_stack:
  added: []
  patterns:
    - "computeDiff union-by-id pattern: allIds = Set union of live+snap task ids; per-id status classification"
    - "Array field normalization: join(',') before string comparison (handles dependencies[], assignees[])"
    - "window._activeDiffIterationId global: required for inline onclick in diff panel Load this button (Pitfall 6)"
    - "escapeHTML() on all Firestore-sourced strings in renderDiffPanel() innerHTML (T-97-05-01 mitigated)"
key_files:
  created: []
  modified:
    - app/views/project-plan.js
key_decisions:
  - "DIFF_FIELDS constant declared at module scope (not inside computeDiff) — single source of truth for all 9 compared fields; accessible if future code needs to enumerate them"
  - "window._activeDiffIterationId set synchronously in toggleIterDiff() BEFORE calling renderDiffPanel() — ensures the Load this button in the newly-shown panel already has the correct id at first render"
  - "closeIterDiff() calls renderIterRail() unconditionally — ensures the diff button active state clears even if the panel was already hidden when close was called"
  - "destroy() hides #iterDiffPanel directly (setAttribute hidden) in addition to deleting window functions — ensures panel does not flash visible during navigation if it was open"
requirements-completed:
  - Spike-018
duration: ~8min
completed: "2026-06-02"
---

# Phase 97 Plan 05: Diff View — computeDiff + renderDiffPanel + toggle/close functions Summary

**Inline diff view with computeDiff() union-by-id algorithm, color-coded renderDiffPanel() table rows (amber/green/red/grey), toggleIterDiff()/closeIterDiff() panel management, and window._activeDiffIterationId global for the Load this button — Phase 97 fully shipped.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-02T00:00:00Z
- **Completed:** 2026-06-02
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- computeDiff() correctly classifies all tasks as added/removed/changed/same by Firestore doc id union
- renderDiffPanel() renders color-coded rows with inline old-value strikethrough + new-value green for changed name/start/end fields; all user strings through escapeHTML()
- toggleIterDiff() opens/closes the diff panel, sets window._activeDiffIterationId so the diff panel's "Load this ->" button can call openIterConfirm() with the correct id
- closeIterDiff() hides the panel, clears the window global, re-renders the rail
- Both functions wired into init() and destroy() with full cleanup (delete + window._activeDiffIterationId = null + panel hidden)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement computeDiff() and renderDiffPanel()** - `1c928c7` (feat)
2. **Task 2: Implement toggleIterDiff() + closeIterDiff() wired into init()/destroy()** - `f354d07` (feat)

## Files Created/Modified
- `app/views/project-plan.js` — DIFF_FIELDS const + computeDiff() + renderDiffPanel() + toggleIterDiff() + closeIterDiff() + init() wiring + destroy() cleanup

## Decisions Made
- DIFF_FIELDS declared at module scope (not inside function) for single-source-of-truth
- window._activeDiffIterationId set synchronously before renderDiffPanel() so Load this button already has correct id on first render
- destroy() hides #iterDiffPanel directly to prevent flash during navigation

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All four spike requirements are now implemented:
- Spike-015c: auto-snapshot + undo toast (Plan 04)
- Spike-016: full-doc snapshot scope (Plan 02)
- Spike-017B: right-rail history panel (Plan 02/03)
- Spike-018: inline diff view (this plan)

## Threat Surface Scan

No new network endpoints or auth paths introduced. All operations are in-memory (computeDiff, renderDiffPanel) or leverage the existing project_iterations Firestore rules from Plan 01.

- T-97-05-01: renderDiffPanel() tbody innerHTML — escapeHTML() applied to all task.name, start_date, end_date, dependencies.join, assignees.join, progress values. Mitigated.
- T-97-05-02: window._activeDiffIterationId global — value is a Firestore auto-id (alphanumeric); consumed by openIterConfirm() which validates against _iterations. Accepted.
- T-97-05-03: computeDiff() accesses all task fields — operates on in-memory tasks[] already fetched via authorized onSnapshot; no new Firestore read. Accepted.

## Self-Check: PASSED

- `app/views/project-plan.js` contains `const DIFF_FIELDS = [` (line 3546)
- `app/views/project-plan.js` contains `function computeDiff(liveTasks, snapTasks)` (line 3548)
- `app/views/project-plan.js` contains `function renderDiffPanel(iter, diffRows)` (line 3566)
- `app/views/project-plan.js` contains `iter-diff-row-changed` in statusClass object (line 3581)
- `app/views/project-plan.js` contains `iter-diff-old` in getName/getStart/getEnd (line 3591-3593)
- `app/views/project-plan.js` contains `function toggleIterDiff(iterationId)` (line 3618)
- `app/views/project-plan.js` contains `function closeIterDiff()` (line 3632)
- `app/views/project-plan.js` contains `window._activeDiffIterationId = iterationId` in toggleIterDiff (line 3626)
- `app/views/project-plan.js` contains `window._activeDiffIterationId = null` in closeIterDiff (line 3634)
- `app/views/project-plan.js` contains `window._activeDiffIterationId = null` in destroy() (line 609)
- `app/views/project-plan.js` init() contains `window.toggleIterDiff = toggleIterDiff` (line 345)
- `app/views/project-plan.js` init() contains `window.closeIterDiff = closeIterDiff` (line 346)
- `app/views/project-plan.js` destroy() contains `delete window.toggleIterDiff` (line 607)
- `app/views/project-plan.js` destroy() contains `delete window.closeIterDiff` (line 608)
- Commits 1c928c7, f354d07 verified in git log

---
*Phase: 97-project-plan-iterations*
*Completed: 2026-06-02*
