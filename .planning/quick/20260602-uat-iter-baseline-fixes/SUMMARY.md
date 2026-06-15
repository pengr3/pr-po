---
slug: uat-iter-baseline-fixes
date: 2026-06-02
status: complete
commit: 724f122
---

# Summary

Fixed 3 UAT blockers in the iteration/baseline feature (project-plan.js).

## Fix 1 — Active iteration indicator ✓
- `_loadedIterationId` + `_loadedIterationLabel` track the currently restored iteration
- `renderIterRail()` shows a green "✓ Current" badge on the matching rail card
- `#iterLoadedLabel` strip below the save button shows "On: <name>" in green

## Fix 2 — Save-before-switch prompt ✓
- `openIterConfirm()` detects when `_loadedIterationId` differs from the target
- Shows 3-button modal: [Save & Load] / [Load without saving] / [Cancel]
- "Save & Load" sets `_pendingLoadAfterSave` then calls `saveIteration(null)`
- `saveIteration()` chains into `openIterConfirm(targetId)` after successful save

## Fix 3 — Delete baselines ✓
- `deleteBaseline(id)`: styled red confirm modal + `deleteDoc` on `baselines` subcollection
- "Delete" button in toolbar (red, hidden when no baseline selected) calls `window.deleteBaseline`
- `updateBaselineToolbarUI()` shows/hides it via `_activeBaselineId`
- `window.deleteBaseline` wired in `init()`, removed in `destroy()`
