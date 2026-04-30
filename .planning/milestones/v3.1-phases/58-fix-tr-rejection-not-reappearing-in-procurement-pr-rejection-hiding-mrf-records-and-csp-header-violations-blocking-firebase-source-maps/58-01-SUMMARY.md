---
phase: 58-fix-tr-rejection-not-reappearing-in-procurement-pr-rejection-hiding-mrf-records-and-csp-header-violations-blocking-firebase-source-maps
plan: 01
subsystem: ui
tags: [procurement, mrf, tr-rejection, pr-rejection, filter, firestore-query]

# Dependency graph
requires:
  - phase: 57-delivery-by-supplier-category
    provides: procurement.js with existing TR Rejected in loadMRFs statuses array
provides:
  - TR Rejected MRFs now show action buttons so procurement users can resubmit to Finance
  - MRF Records filter dropdown includes PR Rejected and TR Rejected filter options
  - historicalStatuses Firestore query now fetches TR Rejected MRFs for Records table
affects: [procurement, finance, mrf-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canEdit boolean must include all resubmittable statuses (Pending, In Progress, PR Rejected, TR Rejected)"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "TR Rejected status added to canEdit checks in both renderMRFDetails() and updateActionButtons() so the action buttons render correctly for TR-rejected MRFs"
  - "PR Rejected and TR Rejected added to histStatusFilter dropdown after TR Submitted so users can filter Records by rejection type"
  - "TR Rejected added to historicalStatuses array so Firestore in-query fetches TR-rejected MRFs for the Records table"

patterns-established:
  - "canEdit pattern: mrf.status === Pending || In Progress || PR Rejected || TR Rejected — all resubmittable states"

requirements-completed: [BUG-01, BUG-02]

# Metrics
duration: 2min
completed: 2026-03-05
---

# Phase 58 Plan 01: Fix TR Rejected canEdit and MRF Records Filter Summary

**Fixed two procurement.js bugs: TR Rejected MRFs now show resubmit action buttons, and MRF Records filter includes PR Rejected and TR Rejected options backed by a complete historicalStatuses Firestore query**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-05T04:16:54Z
- **Completed:** 2026-03-05T04:18:22Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `mrf.status === 'TR Rejected'` to canEdit check in `renderMRFDetails()` so TR Rejected MRFs display the Submit/Generate action buttons
- Added `currentMRF.status === 'TR Rejected'` to canEdit check in `updateActionButtons()` so buttons remain visible when item categories change
- Added PR Rejected and TR Rejected options to `histStatusFilter` select dropdown in the MRF Records tab
- Added `'TR Rejected'` to `historicalStatuses` array in `loadPRPORecords()` so TR-rejected MRFs are fetched from Firestore and appear in the Records table

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TR Rejected canEdit checks in renderMRFDetails and updateActionButtons** - `de3bbb6` (fix)
2. **Task 2: Add PR Rejected and TR Rejected to status filter dropdown and historicalStatuses** - `0388417` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/procurement.js` - Fixed canEdit checks (lines 1037, 1346), dropdown options (line 359-368), historicalStatuses array (line 2323)

## Decisions Made
- No architectural decisions required — both bugs were simple missing status string additions in already-correct logic patterns
- Did not touch the `loadMRFs()` statuses array at line 717 (already included TR Rejected as specified in plan)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both production bugs fixed and committed
- Procurement users can now resubmit TR Rejected MRFs to Finance
- Records tab shows TR Rejected MRFs and allows filtering by PR Rejected or TR Rejected status

---
*Phase: 58-fix-tr-rejection-not-reappearing-in-procurement-pr-rejection-hiding-mrf-records-and-csp-header-violations-blocking-firebase-source-maps*
*Completed: 2026-03-05*
