---
slug: uat-iter-baseline-fixes
date: 2026-06-02
status: in_progress
---

# UAT Fixes: Iteration + Baseline UX (Phase 97.2 follow-up)

Three bugs found during browser UAT of the iteration/baseline feature.

## Fix 1 — Active iteration indicator
**Problem:** No UI shows which iteration is currently loaded.
**Changes:**
- Add `_loadedIterationId`, `_loadedIterationLabel` module vars; set in `restoreIteration()` after STEP 2; reset in `destroy()`
- Add `#iterLoadedLabel` div in the rail (below save-row); update from `renderIterRail()`
- Add `✓ Current` badge in the rail card for the loaded iteration

## Fix 2 — Unsaved changes lost when switching iterations
**Problem:** Loading a different named iteration deletes the auto-snapshot after 5s; edits are silently lost.
**Changes:**
- Add `_pendingLoadAfterSave` module var
- In `openIterConfirm()`: when `_loadedIterationId` differs from target, show 3-button modal: [Save & Load] / [Load without saving] / [Cancel]
- In `saveIteration()`: after successful save, if `_pendingLoadAfterSave` is set, call `openIterConfirm(targetId)`

## Fix 3 — No way to delete baselines
**Problem:** `clearBaseline()` only hides overlay; no Firestore delete exists.
**Changes:**
- Add `deleteBaseline(id)` with confirm modal + `deleteDoc`
- Add `#baselineDeleteBtn` in toolbar; visible when `_activeBaselineId` is set
- Wire `window.deleteBaseline` in `init()` / `destroy()`

## Files
- `app/views/project-plan.js`
- `styles/views.css` (`.iter-tl-loaded-badge`, `.iter-loaded-label`, `.plan-baseline-delete-btn`)
