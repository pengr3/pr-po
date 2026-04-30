---
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
plan: 02
subsystem: ui
tags: [firestore, procurement, transport-requests, soft-reject, modal]

# Dependency graph
requires:
  - phase: 62-01
    provides: "Alphabetical dropdown sort; Finance active-project filter"
provides:
  - "rejectMRF() soft-reject flow replacing hard-delete in procurement MRF Processing"
  - "viewTRDetails() modal in procurement.js accessible from TR badges in MRF Records"
  - "viewTRDetailsLocal() fallback in mrf-records.js for My Requests context"
  - "Clickable TR ID badges (cursor:pointer + onclick) in both MRF Records tables"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft-reject via updateDoc(status='Rejected') preserves audit trail — no deleteDoc on MRF"
    - "viewTRDetails registered on window from procurement.js; mrf-records.js registers fallback only if not already defined"
    - "Local modal function pattern: module-level async function + window registration inside createMRFRecordsController"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/mrf-records.js

key-decisions:
  - "rejectMRF() sets status='Rejected' via updateDoc with rejection_reason, rejected_by, rejected_at — MRF preserved in Firestore for audit trail, not moved to deleted_mrfs"
  - "window.viewTRDetails registered from procurement.js in attachWindowFunctions(); mrf-records.js only registers viewTRDetailsLocal if window.viewTRDetails is not already defined — procurement context wins"
  - "TR badge onclick uses tr.docId (Firestore document ID) not tr.tr_id — consistent with PR badge pattern using pr.docId"

patterns-established:
  - "Soft-reject pattern: updateDoc with status+reason fields, reset UI to empty state, no cascade to child records"
  - "Fallback window function pattern: if (!window.fn) { window.fn = localFn; } in controller factory"

requirements-completed: [REJECT-MRF-01, TR-MODAL-01]

# Metrics
duration: 10min
completed: 2026-03-09
---

# Phase 62 Plan 02: MRF Soft-Reject and TR Details Modal Summary

**Replaced hard MRF deletion with a soft-reject flow via updateDoc(status='Rejected'), and added a TR details modal triggered by clicking TR ID badges in both MRF Records and My Requests tables**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-09T08:36:57Z
- **Completed:** 2026-03-09T08:47:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- "Delete MRF" button replaced with "Reject MRF" in both renderMRFDetails() and updateActionButtons() — calls rejectMRF() which soft-rejects via updateDoc, preserving the MRF and all linked PRs/TRs
- viewTRDetails() modal added to procurement.js showing TR ID, MRF reference, supplier, finance status, total amount, items table, and rejection reason
- TR ID badges in procurement.js renderPRPORecords (Transport rows + Material mixed) are now clickable — cursor:pointer + onclick=window.viewTRDetails(tr.docId)
- viewTRDetailsLocal() added to mrf-records.js as fallback for My Requests context; registered on window only if procurement.js hasn't already claimed window.viewTRDetails
- TR ID badges in mrf-records.js createMRFRecordsController are also clickable with same pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Add rejectMRF() and replace Delete MRF buttons in procurement.js** - `1a5562f` (feat)
2. **Task 2: Add viewTRDetails() modal in procurement.js and make TR badges clickable in both records tables** - `dd89cc0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/procurement.js` - rejectMRF() function, viewTRDetails() function, both registered/cleaned on window; Delete MRF buttons changed to Reject MRF; TR badge spans in renderPRPORecords now clickable
- `app/views/mrf-records.js` - viewTRDetailsLocal() function; TR badge spans in createMRFRecordsController now clickable; window.viewTRDetails registered as fallback

## Decisions Made
- rejectMRF() uses updateDoc not deleteDoc — MRF stays in Firestore with status='Rejected', rejection_reason, rejected_by, rejected_at fields for audit trail
- window.viewTRDetails registered from procurement.js's attachWindowFunctions(); mrf-records.js uses `if (!window.viewTRDetails)` guard so procurement.js's richer version wins in combined context
- TR badge onclick uses tr.docId (Firestore document ID) not tr.tr_id string — consistent with PR badge docId pattern in both files

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 62 plans 01 and 02 complete. Phase 62 is fully executed — all four features delivered: alphabetical dropdown sort (plan 01), Finance active-project filter (plan 01), MRF soft-reject (plan 02), TR details modal (plan 02).
- No blockers.

## Self-Check: PASSED

- `app/views/procurement.js` — verified: rejectMRF() at line 2402, window.rejectMRF registered line 104, deleted line 615, both Reject MRF buttons at lines 1430 and 1743, viewTRDetails() at line 4969, window.viewTRDetails registered line 129, deleted line 635, TR badges clickable at lines 3469 and 3486
- `app/views/mrf-records.js` — verified: viewTRDetailsLocal() at line 805, window.viewTRDetails fallback registration at line 1660-1661, TR badges clickable at lines 1472 and 1490
- Task commits verified: 1a5562f and dd89cc0 in git history

---
*Phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error*
*Completed: 2026-03-09*
