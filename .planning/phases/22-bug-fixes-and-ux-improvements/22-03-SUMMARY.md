---
phase: 22-bug-fixes-and-ux-improvements
plan: 03
subsystem: ui
tags: [sortable-headers, finance, clients, sort-indicators, onSnapshot, ux]

# Dependency graph
requires:
  - phase: 22-01
    provides: "formatTimestamp for PO date rendering in finance.js"
  - phase: 22-02
    provides: "Permission-guarded listeners and delivery fee in total_amount"
  - phase: 4-projects
    provides: "Sort pattern (state vars, click handler, comparator, indicators) in projects.js"
provides:
  - "Sortable column headers in Finance Project List table (6 columns)"
  - "Sortable column headers in Finance Purchase Orders table (7 columns)"
  - "Sortable column headers in Clients table (3 columns)"
  - "Real-time onSnapshot updates preserve user sort selection"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sort state variables + click handler + comparator + indicator update pattern (replicated from projects.js)"
    - "Dynamic sort in onSnapshot callback preserves user sort selection across real-time updates"

key-files:
  created: []
  modified:
    - app/views/finance.js
    - app/views/clients.js

key-decisions:
  - "Follow projects.js sort pattern exactly for consistency across all sortable tables"
  - "PO sort defaults to date_issued descending (newest first) matching existing behavior"
  - "Project List sort defaults to projectName ascending"
  - "Clients sort defaults to company_name ascending"
  - "Pagination resets to page 1 on sort change (Clients)"
  - "Contact Details and Actions columns not sortable in Clients (freeform text / buttons)"

patterns-established:
  - "Sort indicator visual pattern: blue arrow for active column, gray double-arrow for inactive"
  - "onSnapshot sort uses dynamic state variables instead of hardcoded comparators"

# Metrics
duration: 3min
completed: 2026-02-10
---

# Phase 22 Plan 03: Sortable Table Headers Summary

**Click-to-sort column headers with visual indicators across Finance (Project List, Purchase Orders) and Clients views, replicating projects.js pattern**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-10T02:41:18Z
- **Completed:** 2026-02-10T02:44:31Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Finance Project List table has 6 sortable columns (Project Name, Client, Budget, Total Expense, Remaining, Status) with click-to-toggle ascending/descending
- Finance Purchase Orders table has 7 sortable columns (PO ID, PR ID, Supplier, Project, Amount, Date Issued, Status) with Firestore Timestamp-aware date comparator
- Real-time onSnapshot updates in PO list and Clients preserve user's current sort selection instead of reverting to hardcoded default
- Clients table has 3 sortable columns (Client Code, Company Name, Contact Person) with pagination reset on sort
- All tables show blue arrow for active sort column, gray double-arrow for inactive columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Add sortable headers to Finance Project List table** - `7ce283a` (feat)
2. **Task 2: Add sortable headers to Finance Purchase Orders table and fix onSnapshot sort** - `b638af1` (feat)
3. **Task 3: Add sortable headers to Clients table** - `79d013d` (feat)

## Files Created/Modified
- `app/views/finance.js` - Added sort state variables, sortProjectExpenses/sortPOs functions, clickable thead headers with sort indicators, dynamic sort in loadPOs() onSnapshot, window function attach/cleanup
- `app/views/clients.js` - Added sort state variables, sortClients function, clickable thead headers with sort indicators, dynamic sort in loadClients() onSnapshot, pagination reset on sort, window function attach/cleanup with state reset

## Decisions Made
- Replicated exact projects.js sort pattern (state vars, click handler, comparator, indicator update) for consistency
- PO sort defaults to `date_issued` descending to match existing newest-first behavior before user interacts
- Clients and Project List default to alphabetical ascending (company_name and projectName respectively)
- Contact Details and Actions columns intentionally not sortable in Clients (freeform text and action buttons)
- Pagination resets to page 1 on sort in Clients (follows projects.js Pitfall 3 guidance)
- Sort state resets on destroy() so next visit starts with default sort

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 22 plan 03 complete -- all 3 plans in Phase 22 are now done
- Phase 22 (Bug Fixes & UX Improvements) is the final phase in v2.2 milestone
- All milestones complete

---
*Phase: 22-bug-fixes-and-ux-improvements*
*Completed: 2026-02-10*
