---
phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance
plan: 03
subsystem: ui
tags: [firestore, sorting, real-time, finance, onSnapshot]

# Dependency graph
requires:
  - phase: 47-01
    provides: sortable headers for Material PRs and Transport Requests with prSortColumn/prSortDirection and trSortColumn/trSortDirection state variables
provides:
  - Sort order persistence across Firestore real-time updates in prListener and trListener onSnapshot callbacks
affects: [finance.js, pending-approvals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sort re-application block placed between array population and render call inside onSnapshot callbacks — matches poListener pattern"

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "No special date handling needed for PR date_generated or TR date_submitted — both are ISO date strings that sort correctly via localeCompare (unlike PO date_issued which is a Firestore Timestamp requiring .toDate() conversion)"
  - "Comparator is identical to sortMaterialPRs() and sortTransportRequests() functions — no new logic introduced, only placement inside the onSnapshot callbacks"

patterns-established:
  - "onSnapshot sort pattern: populate array → sort with current state vars → render (never render before sorting)"

requirements-completed: [SORT-01, SORT-02, BRD-02, URG-01]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 47 Plan 03: Sort Persistence in Finance onSnapshot Callbacks Summary

**Sort order now persists across Firestore real-time updates in Finance Pending Approvals — materialPRs and transportRequests are re-sorted inside their onSnapshot callbacks before each render call, closing the SORT-01/SORT-02 gap**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T12:49:21Z
- **Completed:** 2026-02-28T12:52:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added sort re-application block inside `prListener` onSnapshot callback using `prSortColumn`/`prSortDirection` state variables
- Added sort re-application block inside `trListener` onSnapshot callback using `trSortColumn`/`trSortDirection` state variables
- Both blocks placed between the array population loop and the render call, matching the existing `poListener` pattern from lines 2063-2087
- Sort order now persists when Firestore triggers a snapshot (new PR approved, new TR generated, etc.)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sort re-application to prListener and trListener onSnapshot callbacks** - `03caae4` (fix)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `app/views/finance.js` - Added sort re-application blocks inside prListener (line 1119) and trListener (line 1149) onSnapshot callbacks

## Decisions Made

- No special date handling needed for PR `date_generated` or TR `date_submitted` — both are ISO date strings (e.g., "2026-02-28") that sort correctly via `localeCompare`, unlike PO `date_issued` which is a Firestore Timestamp requiring `.toDate()` conversion
- Comparator is identical to existing `sortMaterialPRs()` and `sortTransportRequests()` functions — no new logic introduced, only moved into the onSnapshot callbacks to run on every Firestore update

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 47 complete: all 3 plans delivered (47-01 sortable headers, 47-02 login logo + urgency propagation, 47-03 sort persistence on snapshot)
- Requirements SORT-01, SORT-02, BRD-02, URG-01 all satisfied

---
*Phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance*
*Completed: 2026-02-28*

## Self-Check: PASSED

- `app/views/finance.js` modified: FOUND
- Commit `03caae4` exists: FOUND (grep: `03caae4 fix(47-03): re-apply sort order in prListener and trListener onSnapshot callbacks`)
- Sort blocks verified: 2 occurrences of "Re-apply current sort order" at lines 1119 and 1149
