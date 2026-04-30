---
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
plan: 01
subsystem: ui
tags: [firestore, dropdown, sort, finance, projects]

# Dependency graph
requires: []
provides:
  - "Alphabetical A-Z sort for project/service dropdowns in mrf-form.js and procurement.js"
  - "Active-only filter for Finance Project List expense table"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "localeCompare for alphabetical dropdown sort instead of created_at recency sort"
    - "where('active', '==', true) filter on projects query in Finance view"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "All four recency sorts replaced with localeCompare — consistent alphabetical ordering across both dropdown surfaces"
  - "Finance Project List uses where('active', '==', true) — query and where already imported, no new imports"

patterns-established:
  - "Dropdown sort pattern: (a.field || '').localeCompare(b.field || '') for null-safe alphabetical sort"

requirements-completed: [SORT-ALPHA-01, FINANCE-ERR-01]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 62 Plan 01: Sort dropdowns alphabetically and fix Finance active-project filter

**Replaced created_at recency sort with localeCompare in four dropdown functions; Finance Project List now queries only active projects via where('active', '==', true)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T08:30:00Z
- **Completed:** 2026-03-09T08:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- All project/service dropdowns in mrf-form.js and procurement.js now show options A-Z by name
- Finance Project List tab no longer includes inactive/deactivated projects in the expense table
- No new imports required — query and where were already in finance.js line 6

## Task Commits

Each task was committed atomically:

1. **Task 1: Sort project/service dropdowns alphabetically in mrf-form.js and procurement.js** - `0de405c` (feat)
2. **Task 2: Fix Finance Project List to show only active projects** - `2d52583` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/mrf-form.js` - loadProjects() and loadServices() sort by localeCompare instead of created_at
- `app/views/procurement.js` - loadServicesForNewMRF() and loadProjects() sort by localeCompare instead of created_at
- `app/views/finance.js` - refreshProjectExpenses() adds where('active', '==', true) filter to projects query

## Decisions Made
- All four recency sorts replaced with localeCompare — consistent alphabetical ordering across both dropdown surfaces
- Finance Project List uses where('active', '==', true) — query and where already imported, no new imports needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01 complete. Remaining plans in Phase 62: MRF soft-reject (plan 02), TR details modal (plan 03), finance project list improvements (already addressed here).
- No blockers.

## Self-Check: PASSED

All files verified present. All task commits verified in git history.

---
*Phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error*
*Completed: 2026-03-09*
