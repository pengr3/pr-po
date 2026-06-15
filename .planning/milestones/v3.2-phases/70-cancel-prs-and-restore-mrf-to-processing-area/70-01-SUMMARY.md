---
phase: 70-cancel-prs-and-restore-mrf-to-processing-area
plan: 01
subsystem: ui
tags: [procurement, mrf, context-menu, firestore, javascript]

# Dependency graph
requires:
  - phase: 65.9-integrate-delivery-fees-rfp-support
    provides: showRFPContextMenu pattern (right-click context menu on PO rows)
provides:
  - recallMRF() function with dual-path PR cancellation and MRF restoration
  - showMRFContextMenu() right-click context menu on MRF list rows
  - blockedMRFIds cache preventing recall when POs have procurement progress
  - PR Generated MRFs now visible in MRF Processing left panel
affects: [procurement, mrf-processing, finance-approvals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - blockedMRFIds Set cached from background refreshBlockedMRFs() query after each MRF snapshot
    - currentMRF pre-populated from cachedAllMRFs in showMRFContextMenu to avoid async select before recall

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "PR Generated added to loadMRFs query filter so those MRFs appear in the left panel for right-click access"
  - "refreshBlockedMRFs uses mrf.id (Firestore doc ID) as Set key for O(1) lookup when mrfId is passed from oncontextmenu"
  - "showMRFContextMenu pre-sets currentMRF from cachedAllMRFs so recallMRF() has data without an extra async Firestore read"
  - "recallMRF dual-path: simple cancel (Pending/Rejected PRs only) vs force recall (Finance-Approved PRs with Pending Procurement POs)"

patterns-established:
  - "MRF context menu follows showRFPContextMenu pattern: position:fixed at clientX/clientY, close on next document click"
  - "blockedMRFIds refresh is non-blocking (.catch()) so MRF list renders immediately and blocking check catches up asynchronously"

requirements-completed:
  - CANPR-01
  - CANPR-02
  - CANPR-03
  - CANPR-04
  - CANPR-05
  - CANPR-06
  - CANPR-07

# Metrics
duration: 20min
completed: 2026-03-28
---

# Phase 70 Plan 01: Cancel PRs and Restore MRF to Processing Area Summary

**Right-click "Recall MRF" context menu on PR Generated rows — deletes linked PRs, voids Pending Procurement POs, blocks on in-progress POs, and restores MRF to In Progress**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-28T06:08:00Z
- **Completed:** 2026-03-28T06:28:22Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `recallMRF()` with full dual-path logic: simple cancel for Pending/Rejected PRs and force-recall for Finance-Approved PRs with linked POs
- Added `blockedMRFIds` Set populated by background `refreshBlockedMRFs()` query that runs after every MRF snapshot — prevents showing context menu for MRFs with in-progress POs
- Added `showMRFContextMenu()` right-click handler matching existing `showRFPContextMenu` pattern
- Added 'PR Generated' to loadMRFs query filter so those MRFs appear in the left panel and can be right-clicked
- Wired `oncontextmenu` to material and transport MRF list rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Add recallMRF() function with dual-path logic** - `cdeddd2` (feat)
2. **Task 2: Add blockedMRFIds cache, showMRFContextMenu(), and wire to MRF list rows** - `930f6c2` (feat)

## Files Created/Modified
- `app/views/procurement.js` - recallMRF, refreshBlockedMRFs, showMRFContextMenu, blockedMRFIds, loadMRFs filter update, oncontextmenu on MRF rows, window lifecycle

## Decisions Made
- PR Generated status added to the loadMRFs query filter — required for those MRFs to appear in the left panel where the right-click handler is wired
- `refreshBlockedMRFs` stores Firestore doc IDs (not mrf_id strings) in `blockedMRFIds` because the oncontextmenu template passes `mrf.id`
- `showMRFContextMenu` pre-sets `currentMRF` from `cachedAllMRFs` before showing the menu, avoiding an async Firestore read before `recallMRF()` executes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added 'PR Generated' to loadMRFs query filter**
- **Found during:** Task 2 (wire context menu to MRF list rows)
- **Issue:** The loadMRFs Firestore query only included Pending/In Progress/Rejected statuses — PR Generated MRFs were excluded from the left panel entirely, making the oncontextmenu handler unreachable for the primary use case
- **Fix:** Added 'PR Generated' to the statuses array in loadMRFs()
- **Files modified:** app/views/procurement.js
- **Verification:** PR Generated MRFs now appear in material/transport sections of the left panel
- **Committed in:** 930f6c2 (Task 2 commit)

**2. [Rule 1 - Bug] Pre-set currentMRF in showMRFContextMenu before menu click**
- **Found during:** Task 2 (reviewing recallMRF integration)
- **Issue:** recallMRF() uses currentMRF which is only populated when user clicks (selectMRF). Right-clicking without prior selection would leave currentMRF null or pointing to the wrong MRF
- **Fix:** Added `currentMRF = mrf` inside showMRFContextMenu when building the PR Generated menu item, using the MRF data already found in cachedAllMRFs
- **Files modified:** app/views/procurement.js
- **Verification:** recallMRF() will receive the correct MRF data regardless of click order
- **Committed in:** 930f6c2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct operation. Without the query filter fix, the feature would be completely inaccessible. Without the currentMRF fix, recalls would silently fail or operate on the wrong MRF.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Recall MRF feature is complete and ready for manual UAT
- Right-click on PR Generated MRF row shows context menu with "Recall MRF"
- Simple cancel and force-recall paths both implemented with confirm dialogs
- Blocked MRFs (POs at Procuring/Procured/Delivered) show no context menu at all

---
*Phase: 70-cancel-prs-and-restore-mrf-to-processing-area*
*Completed: 2026-03-28*
