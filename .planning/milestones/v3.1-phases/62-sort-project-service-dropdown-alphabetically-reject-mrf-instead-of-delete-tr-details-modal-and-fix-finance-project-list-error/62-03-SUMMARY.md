---
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
plan: "03"
subsystem: finance
tags: [firestore, query, sorting, project-expenses]

requires:
  - phase: 62-01
    provides: Sort dropdowns alphabetically

provides:
  - Finance Project List fetches all projects (active and inactive) without filter
  - Client-side sort: active projects A-Z first, then inactive projects A-Z

affects: [finance]

tech-stack:
  added: []
  patterns:
    - "Client-side sort after unfiltered getDocs replaces server-side where filter for Finance project visibility"

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "Finance Project List uses getDocs(collection(db, 'projects')) unfiltered — where('active', '==', true) used wrong field name (field is 'status' not 'active') and excluded inactive projects Finance needs for historical tracking"
  - "Sort applied immediately after Promise.all resolves, before cache timestamp — active A-Z first, inactive A-Z last"

patterns-established:
  - "Fetch all, sort client-side pattern: when Finance needs full visibility, remove server-side filter and sort result in memory"

requirements-completed:
  - FINANCE-ERR-01

duration: 3min
completed: 2026-03-09
---

# Phase 62 Plan 03: Finance Project List Fix Summary

**Finance Project List now fetches all projects unfiltered from Firestore, sorted active A-Z first then inactive A-Z — previously hidden inactive projects are now visible for historical expense tracking.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:03:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed `where('active', '==', true)` filter that used the wrong field name (`active` boolean does not exist — schema uses `status` string)
- Finance Project List now fetches all projects from Firestore with `getDocs(collection(db, 'projects'))`
- Added client-side sort: active projects alphabetically first, inactive projects alphabetically last
- Finance users can now see inactive projects for historical expense analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix refreshProjectExpenses() — remove where filter, add client-side sort** - `6287f01` (fix)

**Plan metadata:** _(docs commit — pending)_

## Files Created/Modified

- `app/views/finance.js` - Replaced filtered query with unfiltered `getDocs(collection(db, 'projects'))`, added sort block after `Promise.all` resolves

## Decisions Made

- Finance Project List uses `getDocs(collection(db, 'projects'))` unfiltered. The previous `where('active', '==', true)` used the wrong field name (`active` boolean, not `status` string), so it always returned 0 results. Even if fixed to `where('status', '==', 'active')`, it would still hide inactive projects from Finance users who need historical tracking.
- Sort applied immediately after `Promise.all(projectPromises)` resolves, before `_projectExpensesCachedAt = Date.now()` — cached array is already sorted so `renderProjectExpensesTable()` can use it directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 62 gap closure plans complete — all four plans (01 alphabetical sort, 02 MRF reject + TR details modal, 03 finance project list) executed
- No blockers

---
*Phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error*
*Completed: 2026-03-09*
