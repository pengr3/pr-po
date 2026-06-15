---
phase: "97"
plan: "03"
subsystem: "project-plan"
tags: [iteration-history, firestore-data-layer, right-rail, load-save, init-destroy-wiring]
dependency_graph:
  requires: [97-02]
  provides: [97-03-loadIterations, 97-03-saveIteration, 97-03-renderIterRail, 97-03-toggleIterRail, 97-03-closeIterRail]
  affects: [app/views/project-plan.js]
tech_stack:
  added: []
  patterns: [getDocs-one-shot, addDoc-server-timestamp, module-scope-state-refresh, window-function-lifecycle]
key_files:
  created: []
  modified:
    - app/views/project-plan.js
decisions:
  - "loadIterations() uses getDocs (no onSnapshot) + client-side newest-first sort — avoids composite index requirement; consistent with RESEARCH.md Pattern 2"
  - "saveIteration() copies resolved Timestamp objects from in-memory tasks[] directly — never calls serverTimestamp() inside the tasks array (Pitfall 1 avoided)"
  - "label truncated to 60 chars before write per V5 security domain requirement"
  - "promptSaveIteration() added as explicit alias/entry point — plan requirement (must_haves.truths item 6)"
  - "dismissUndoToast() called in destroy() as a forward reference guarded by typeof check — function defined in Plan 04, but the cleanup must be centralized here so navigation-away never leaks the toast or its timer"
  - "renderIterRail() uses HTML entities (&#x25B6; &#x27F7; &#x2192;) for button symbols instead of raw Unicode — avoids encoding edge cases in template literals"
  - "_iterSeq updated inside renderIterRail() from non-auto iteration count (mirrors RESEARCH.md renderIterRail pattern) as well as in loadIterations()"
metrics:
  duration: "~10 min"
  completed: "2026-06-02"
  tasks: 2
  files: 1
---

# Phase 97 Plan 03: Iteration History Data Layer + Rail Render Summary

**One-liner:** Firestore data layer (loadIterations/saveIteration) and right-rail render functions (renderIterRail/toggleIterRail/closeIterRail) wired into init()/destroy() — users can now save named iteration snapshots and browse them in the history panel.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Implement loadIterations() and saveIteration() | 35e0868 | app/views/project-plan.js |
| 2 | Implement renderIterRail(), toggleIterRail(), closeIterRail() + wire into init()/destroy() | cd90e73 | app/views/project-plan.js |

## What Was Built

**Task 1 — loadIterations() and saveIteration():**
- `loadIterations()`: getDocs query on `project_iterations` with `where('project_id', '==', currentProject.id)`, client-side newest-first sort via `saved_at?.toMillis()`, populates `_iterations[]`, updates `_iterSeq` from non-auto count
- `saveIteration(label = null)`: `window.prompt()` for label when null, trim + 60-char truncation, full task snapshot via `tasks.map()` copying all 19 fields including resolved Timestamps (NOT serverTimestamp() inside the array), `addDoc(project_iterations)` with `saved_at: serverTimestamp()` on the doc itself, then `loadIterations()` + `renderIterRail()` + success toast
- `promptSaveIteration()`: explicit alias calling `saveIteration(null)` — plan-specified entry point

**Task 2 — renderIterRail(), toggleIterRail(), closeIterRail():**
- `renderIterRail()`: updates `#iterCountBadge`, renders empty-state if no iterations, else maps `_iterations` to timeline cards with `.iter-tl-dot` (`.auto` class for auto-snapshots), `escapeHTML(iter.label)` + `.iter-auto-tag` span, `.iter-tl-meta` with date + task count, Diff and Load action buttons
- `toggleIterRail()`: toggles `hidden` attribute on `#iterRail`, syncs `#iterHistoryBtn.active` class, updates `_iterRailOpen`
- `closeIterRail()`: sets `hidden` on `#iterRail`, clears `active` class, resets `_iterRailOpen`
- **init() wiring**: `window.saveIteration`, `window.toggleIterRail`, `window.closeIterRail` registered after `window.clearBaseline`; `await loadIterations()` + `renderIterRail()` called after `updateBaselineToolbarUI()`
- **destroy() wiring**: Phase 97 cleanup block before search cleanup — deletes 3 window functions, calls `dismissUndoToast()` (forward ref, typeof-guarded), resets `_autoSnapId`, `_iterations`, `_activeDiffIterationId`, `_iterRailOpen`, `_iterSeq`

## Deviations from Plan

None — plan executed exactly as written. The `dismissUndoToast()` forward reference in destroy() uses `typeof dismissUndoToast === 'function'` guard as specified in the plan action (Plan 03 task 2 action block).

## Known Stubs

- `window.toggleIterDiff` and `window.openIterConfirm` referenced in renderIterRail() button onclicks — not yet registered (Plan 04/05). Clicking Diff/Load buttons before those plans ship is a no-op (function not found on window).
- `dismissUndoToast()` called in destroy() via typeof guard — defined in Plan 04; guard prevents ReferenceError before that plan ships.

## Threat Surface Scan

No new network endpoints or auth paths. `project_iterations` collection used by `loadIterations()` (read) and `saveIteration()` (write):
- T-97-03-01 (XSS via iter.label): mitigated — `escapeHTML(iter.label)` applied in `renderIterRail()`
- T-97-03-03 (label tampering): mitigated — 60-char truncation in `saveIteration()` before write

## Self-Check: PASSED

- `app/views/project-plan.js` contains `async function loadIterations()` (line 3242)
- `app/views/project-plan.js` contains `async function saveIteration` (line 3265)
- `project_iterations` appears in loadIterations query + saveIteration addDoc (3 occurrences)
- `saved_at:   serverTimestamp()` appears exactly once inside saveIteration (line 3297) — NOT inside tasks.map()
- `app/views/project-plan.js` contains `function renderIterRail()` (line 3333)
- `app/views/project-plan.js` contains `function toggleIterRail()` (line 3368)
- `app/views/project-plan.js` contains `function closeIterRail()` (line 3383)
- `window.saveIteration = saveIteration` in init() (line 339)
- `window.toggleIterRail = toggleIterRail` in init() (line 340)
- `window.closeIterRail = closeIterRail` in init() (line 341)
- `await loadIterations()` in init() (line 346)
- `renderIterRail()` called after loadIterations() in init() (line 347)
- `delete window.saveIteration` in destroy() (line 596)
- `_iterations = []` in destroy() Phase 97 cleanup block (line 602)
- `escapeHTML(iter.label)` in renderIterRail() (line 3353)
- `.iter-auto-tag` span in renderIterRail() (line 3353)
- Commits 35e0868, cd90e73 verified in git log
