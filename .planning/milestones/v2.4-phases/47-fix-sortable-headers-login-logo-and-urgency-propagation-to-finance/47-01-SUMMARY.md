---
phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance
plan: 01
subsystem: ui
tags: [finance, sorting, tables, pending-approvals]

# Dependency graph
requires:
  - phase: 46-code-cleanup-and-mrf-fix
    provides: clean finance.js baseline with existing sort pattern for POs and Project Expenses
provides:
  - sortable column headers for Material PRs table in Finance Pending Approvals
  - sortable column headers for Transport Requests table in Finance Pending Approvals
  - prSortColumn/prSortDirection and trSortColumn/trSortDirection module-level sort state
affects: [finance, pending-approvals]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sortMaterialPRs/sortTransportRequests follow sortPOs() pattern: toggle direction on same column, set asc on new column, sort source array directly, call render"
    - "Sort indicator updates scoped via tbody.closest('table') to prevent cross-table contamination"
    - "renderMaterialPRs/renderTransportRequests restructured to if/else instead of early return so indicator update runs unconditionally"

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "Sort functions sort the source array (materialPRs / transportRequests) directly, not the filtered subset — renderMaterialPRs/renderTransportRequests re-apply the dept filter, so sorting the source is the correct approach matching sortPOs() pattern"
  - "tbody.closest('table') used to scope sort-indicator querySelector to each table individually — prevents TR table indicators from matching PR table spans or vice versa"
  - "renderMaterialPRs/renderTransportRequests restructured from early-return pattern to if/else so indicator update always executes after both the empty and non-empty branches"
  - "Service Type column left as static header (no sort) — value is derived from items_json[0].category, not a direct Firestore field"

patterns-established:
  - "Finance sort pattern: 4 state vars (column + direction per table), sort function sorts source array, render function updates indicators via closest('table') scope"

requirements-completed:
  - SORT-01
  - SORT-02

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 47 Plan 01: Sortable Headers for Finance Pending Approvals Summary

**Sortable column headers with toggle arrows added to Material PRs and Transport Requests tables in Finance > Pending Approvals, matching existing PO sort pattern**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-28T05:36:13Z
- **Completed:** 2026-02-28T05:37:54Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added prSortColumn/prSortDirection and trSortColumn/trSortDirection sort state at module level (default desc on date columns for newest-first)
- Added sortMaterialPRs() and sortTransportRequests() functions following the existing sortPOs() pattern
- Replaced all static `<th>` elements in both Pending Approvals tables with clickable sortable headers (6 sortable on PRs, 5 on TRs)
- Sort indicator spans scoped to each table — no cross-table contamination
- Both render functions restructured to if/else (no early return) so sort indicators update even when tables are empty
- Full window registration and destroy cleanup added

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sort state variables and sort functions for Material PRs and Transport Requests** - `d358504` (feat)
2. **Task 2: Replace static headers with sortable headers and add sort indicator updates** - `4b50f76` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/finance.js` - Added 4 sort state variables, 2 sort functions, sortable thead cells with sort-indicator spans, indicator update logic in both render functions, window registration and destroy cleanup

## Decisions Made
- Sort functions sort the source array directly (not the filtered subset) — this matches sortPOs() and works correctly because renderMaterialPRs/renderTransportRequests re-apply the dept filter when generating tbody HTML
- tbody.closest('table') used for sort-indicator scoping — avoids needing unique IDs on each table's thead
- Restructured to if/else instead of early return — simplest approach to guarantee indicator update runs in all code paths
- Service Type header left static — value is derived from items_json parsing, not a sortable Firestore field

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sortable headers on both Pending Approvals tables complete and ready for UAT
- Remaining plans in Phase 47 (login logo, urgency propagation to finance) are independent and can proceed

---
*Phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance*
*Completed: 2026-02-28*
