---
phase: "97"
plan: "04"
subsystem: "project-plan"
tags: [iteration-restore, auto-snapshot, undo-toast, batch-write, confirm-modal, window-lifecycle]
dependency_graph:
  requires: [97-03]
  provides: [97-04-openIterConfirm, 97-04-confirmIterLoad, 97-04-restoreIteration, 97-04-showUndoToast, 97-04-dismissUndoToast, 97-04-undoIterRestore]
  affects: [app/views/project-plan.js]
tech_stack:
  added: []
  patterns: [writeBatch-chunked-450, addDoc-auto-snapshot, deleteDoc-undo-cleanup, custom-toast-dom-append, custom-confirm-modal]
key_files:
  created: []
  modified:
    - app/views/project-plan.js
decisions:
  - "OPS_PER_BATCH = 450 — leaves headroom below Firestore 500-op limit; same constant declared in both restoreIteration() and undoIterRestore() (each function is self-contained)"
  - "doc(db, 'project_tasks', t.id) used for batch.set on restore — original Firestore doc IDs preserved so dependencies[] references remain valid (Pitfall 2)"
  - "showUndoToast() appends a dedicated #iterUndoToast div to document.body — incompatible with shared #toast element (textContent, 3s, no button) per RESEARCH.md Pattern 6"
  - "openIterConfirm() uses custom modal (not window.confirm()) to show the safety note 'Your current plan will be auto-saved first' — matches spike-018 design and user confidence requirement"
  - "destroy() calls dismissUndoToast() directly (not via typeof guard) — Plan 04 defines it in the same file, so no forward-reference risk; the Plan 03 typeof guard is replaced"
  - "destroy() removes #iterConfirmModal — prevents stale confirm modal persisting after navigation"
  - "undoIterRestore() clears _autoSnapId = null AFTER successful deleteDoc — ensures undo state is consistent even if deleteDoc fails (error path leaves _autoSnapId set for potential manual retry)"
metrics:
  duration: "~12 min"
  completed: "2026-06-02"
  tasks: 2
  files: 1
---

# Phase 97 Plan 04: Restore Mechanic + Auto-Snapshot + Undo Toast Summary

**One-liner:** Full restore lifecycle — openIterConfirm() confirm modal, restoreIteration() auto-snapshot + chunked batch-write, showUndoToast() dedicated 5-second DOM toast, undoIterRestore() rollback + auto-snapshot cleanup.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Implement openIterConfirm(), confirmIterLoad(), restoreIteration() | 8266e86 | app/views/project-plan.js |
| 2 | Implement showUndoToast(), dismissUndoToast(), undoIterRestore() + wire init()/destroy() | 710c336 | app/views/project-plan.js |

## What Was Built

**Task 1 — openIterConfirm(), confirmIterLoad(), restoreIteration():**
- `openIterConfirm(iterationId)`: removes any existing #iterConfirmModal, injects a `.modal-overlay` div with title "Load Iteration", safety message ("Your current plan will be auto-saved first so you can undo within 5 seconds"), Cancel + Load buttons; `escapeHTML(iter.label)` guards modal HTML (T-97-04-02)
- `confirmIterLoad(iterationId)`: removes modal, calls `await restoreIteration(iterationId)`
- `restoreIteration(iterationId)`: Step 1 — auto-snapshots current tasks[] to `project_iterations` with `auto: true`, saves `_autoSnapId = autoRef.id`; Step 2 — getDocs all current `project_tasks`, builds allOps array of deletes + sets using `doc(db, 'project_tasks', t.id)` (Pitfall 2 avoided), loops in OPS_PER_BATCH=450 chunks committing each batch (Pitfall 3 avoided); Step 3 — `await loadIterations(); renderIterRail()`; Step 4 — `showUndoToast(...)`. try/catch shows error toast and nulls `_autoSnapId` on failure.

**Task 2 — showUndoToast(), dismissUndoToast(), undoIterRestore() + wiring:**
- `showUndoToast(msg)`: calls `dismissUndoToast()` first, creates `<div id="iterUndoToast" class="iter-undo-toast">` with message span + Undo button (`onclick="window.undoIterRestore()"`), appends to `document.body`, sets `_undoToastTimer = setTimeout(..., 5000)` to auto-dismiss and null `_autoSnapId`
- `dismissUndoToast()`: `clearTimeout(_undoToastTimer)`, removes `#iterUndoToast`
- `undoIterRestore()`: guards `if (!_autoSnapId) return`, `clearTimeout(_undoToastTimer)`, finds auto-snapshot in `_iterations[]`, same chunked batch-write as restore (but WITHOUT creating another auto-snapshot), `await deleteDoc(doc(db, 'project_iterations', _autoSnapId))`, `_autoSnapId = null`, `dismissUndoToast()`, refreshes rail
- **init() wiring**: `window.openIterConfirm`, `window.confirmIterLoad`, `window.undoIterRestore` added after Plan 03's 3 entries (line 342–344)
- **destroy() wiring**: `delete window.openIterConfirm`, `delete window.confirmIterLoad`, `delete window.undoIterRestore`; `dismissUndoToast()` called directly (Plan 03's typeof guard replaced — function now defined in same file); `document.getElementById('iterConfirmModal')?.remove()` added for navigation-away safety (Pitfall 4 fully resolved)

## Deviations from Plan

None — plan executed exactly as written.

The destroy() block in Plan 03 used `if (typeof dismissUndoToast === 'function') dismissUndoToast()` as a forward reference guard. Since Plan 04 now defines `dismissUndoToast()` in the same file, the guard was replaced with a direct `dismissUndoToast()` call. This is a correctness improvement (no runtime typeof overhead) consistent with the plan's intent.

## Known Stubs

- `window.toggleIterDiff` and `window.closeIterDiff` are still referenced in `renderIterRail()` button onclicks — not yet registered (Plan 05). Clicking Diff buttons before that plan ships is a no-op.
- `window._activeDiffIterationId` is module-scope only — Plan 05 will expose it on window for the diff panel "Load this →" button (per RESEARCH.md Pitfall 6).

## Threat Surface Scan

No new network endpoints or auth paths introduced. All writes go through existing `project_iterations` collection (rules from Plan 01) and `project_tasks` (existing rules from Phase 86).

- T-97-04-01: restoreIteration() batch-write to project_tasks — gated by Firestore rules (hasRole); confirm modal adds human intent confirmation. Mitigated.
- T-97-04-02: openIterConfirm() modal innerHTML — `escapeHTML(iter.label)` applied. Mitigated.
- T-97-04-03: showUndoToast() innerHTML — `escapeHTML(msg)` applied; msg is constructed from `escapeHTML(iter.label)`. Mitigated.
- T-97-04-04: 500-op batch limit — OPS_PER_BATCH=450 chunk loop in both restoreIteration() and undoIterRestore(). Mitigated.
- T-97-04-05: undoIterRestore() reads project_tasks — same isActiveUser() gate as all project_tasks reads. Accepted.

## Self-Check: PASSED

- `app/views/project-plan.js` contains `async function restoreIteration(` (line 3421)
- `app/views/project-plan.js` contains `_autoSnapId = autoRef.id` (line 3454)
- `app/views/project-plan.js` contains `const OPS_PER_BATCH = 450` in restoreIteration (line 3462)
- `app/views/project-plan.js` contains `doc(db, 'project_tasks', t.id)` in batch set (line 3465)
- `app/views/project-plan.js` contains `function openIterConfirm(` (line 3393)
- `app/views/project-plan.js` contains `iterConfirmModal` in openIterConfirm + confirmIterLoad + destroy()
- `app/views/project-plan.js` contains `function showUndoToast(` (line 3493)
- `app/views/project-plan.js` contains `el.id = 'iterUndoToast'` (line 3496)
- `app/views/project-plan.js` contains `_undoToastTimer = setTimeout(...)` 5000ms (line 3500)
- `app/views/project-plan.js` contains `function dismissUndoToast()` (line 3506)
- `app/views/project-plan.js` contains `async function undoIterRestore()` (line 3511)
- `app/views/project-plan.js` contains `deleteDoc(doc(db, 'project_iterations', _autoSnapId))` (line 3533)
- `app/views/project-plan.js` init() contains `window.openIterConfirm = openIterConfirm` (line 342)
- `app/views/project-plan.js` init() contains `window.confirmIterLoad = confirmIterLoad` (line 343)
- `app/views/project-plan.js` init() contains `window.undoIterRestore = undoIterRestore` (line 344)
- `app/views/project-plan.js` destroy() contains `delete window.openIterConfirm` (line 602)
- `app/views/project-plan.js` destroy() contains `delete window.undoIterRestore` (line 604)
- `app/views/project-plan.js` destroy() contains `dismissUndoToast()` (line 605)
- `app/views/project-plan.js` destroy() contains `document.getElementById('iterConfirmModal')?.remove()` (line 606)
- Commits 8266e86, 710c336 verified in git log
