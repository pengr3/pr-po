---
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
plan: 04
subsystem: ui
tags: [procurement, transport-requests, firestore, delete]

# Dependency graph
requires:
  - phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs
    provides: cachedRejectedTRs array, selectRejectedTR, resubmitRejectedTR, saveRejectedTRChanges
provides:
  - deleteRejectedTR() permanently removes a Finance-rejected TR from Firestore
  - Delete TR btn-danger button in rejected TR list card
  - Delete TR btn-danger button in rejected TR detail panel
  - confirm() guard before irreversible deleteDoc() call
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deleteRejectedTR uses same window.* registration pattern as resubmitRejectedTR; cleaned up in destroy()"
    - "cachedRejectedTRs.filter() splices removed TR in-memory before re-render, avoiding Firestore re-fetch"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "deleteRejectedTR splices cachedRejectedTRs and calls renderMRFList() — no Firestore listener re-fetch needed; the onSnapshot listener will catch the delete independently"
  - "confirm() guard uses plain browser dialog consistent with existing resubmitRejectedTR confirm() pattern"

patterns-established:
  - "Destructive actions on cached arrays: filter in-memory first, then re-render, let listener catch eventual consistency"

requirements-completed:
  - REJECT-MRF-01

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 62 Plan 04: Delete Rejected TR Summary

**Procurement users can now permanently delete Finance-rejected TRs via a confirm()-guarded deleteDoc() button in both the TR list card and detail panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T09:55:00Z
- **Completed:** 2026-03-09T10:00:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `deleteRejectedTR(trDocId)` function with browser `confirm()` guard that calls `deleteDoc()` on the `transport_requests` document
- Wired "Delete TR" btn-danger button in rejected TR list card alongside existing "Resubmit to Finance" button (flex row, `gap: 0.5rem`)
- Wired "Delete TR" btn-danger button as third action in rejected TR detail panel (alongside Save Changes and Resubmit to Finance)
- Registered `window.deleteRejectedTR` and added `delete window.deleteRejectedTR` cleanup in `destroy()`

## Task Commits

1. **Task 1: Add deleteRejectedTR() function and wire buttons in list card and detail panel** - `e0dd602` (feat)

## Files Created/Modified
- `app/views/procurement.js` - Added deleteRejectedTR function, buttons in list card and detail panel, window registration, and destroy() cleanup

## Decisions Made
- `deleteRejectedTR` splices `cachedRejectedTRs` in-memory and calls `renderMRFList()` directly — no need to wait for Firestore `onSnapshot` listener to propagate the delete; listener provides eventual consistency independently.
- `confirm()` uses plain browser dialog, consistent with existing `resubmitRejectedTR` confirm() pattern in the same file.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 62 plan 04 complete — all four gap-closure plans for Phase 62 are now done.
- The full Phase 62 feature set ships: alphabetical dropdowns, MRF soft-reject, TR details modal, Finance project list fix, and now Delete Rejected TR.

---
*Phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error*
*Completed: 2026-03-09*
