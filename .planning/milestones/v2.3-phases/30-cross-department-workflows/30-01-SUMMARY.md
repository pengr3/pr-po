---
phase: 30-cross-department-workflows
plan: 01
subsystem: ui
tags: [finance, department-filter, badges, client-side-filter, javascript]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: getMRFLabel() helper and department/service_code fields on PR/TR/PO documents

provides:
  - Department badges (purple=Services, blue=Projects) in all three Finance tables
  - Department filter dropdown on Material PRs card-header filtering all three tables
  - getDeptBadgeHTML() helper function for consistent badge rendering
  - applyFinanceDeptFilter() window function for tab-switch-safe filter application
  - activeDeptFilter state variable that resets to empty on destroy()

affects: [finance-view, pending-approvals, purchase-orders, cross-department-workflows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side filter before slice: filter applied to full in-memory array before any pagination/slice to keep filtered count accurate"
    - "Window function registration pattern: applyFinanceDeptFilter registered in attachWindowFunctions() called on every init() for tab-switch safety"
    - "Dual-condition department detection: doc.department === 'services' || (!doc.department && doc.service_code) handles both new and legacy docs"

key-files:
  created: []
  modified:
    - app/views/finance.js

key-decisions:
  - "activeDeptFilter defaults '' (empty string) not null — simple truthiness check: activeDeptFilter ? filter : use all"
  - "Filter uses (pr.department || 'projects') === activeDeptFilter — treats missing department as 'projects' to match getDeptBadgeHTML logic"
  - "applyFinanceDeptFilter re-renders all three tables on every filter change (renderMaterialPRs + renderTransportRequests + renderPOs) — no selective render needed since filter is instant client-side"
  - "PR modal label changed from 'Project:' to 'Department:' with inline badge — communicates dual-department support"

patterns-established:
  - "getDeptBadgeHTML: reusable badge renderer for any PR/TR/PO document using department/service_code fields"
  - "activeDeptFilter destroyed in destroy() and deleted from window — prevents stale filter carrying over between navigation cycles"

requirements-completed: [CROSS-01, CROSS-03, CROSS-04, CROSS-05, CROSS-06]

# Metrics
duration: 2min
completed: 2026-02-18
---

# Phase 30 Plan 01: Finance Department Badges and Filter Summary

**Department-aware finance view with purple/blue inline badges on all PR/TR/PO rows and a client-side department filter dropdown that instantly filters all three Pending Approvals and Purchase Orders tables**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-18T00:14:46Z
- **Completed:** 2026-02-18T00:16:47Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `getDeptBadgeHTML()` helper rendering purple "Services" or blue "Projects" inline badge spans for any PR/TR/PO document
- Added department filter dropdown to Material PRs card-header wired to `applyFinanceDeptFilter()` that re-renders all three tables (Material PRs, Transport Requests, Purchase Orders) using client-side filtering of in-memory data
- Department badges appear in all three table rows and in PR detail modal and TR detail modal

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getDeptBadgeHTML helper, activeDeptFilter state, and applyFinanceDeptFilter window function** - `25f55bf` (feat)
2. **Task 2: Add dept filter dropdown to render() and dept badges + filtering to all three render functions** - `9b2d98f` (feat)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified
- `app/views/finance.js` - Added getDeptBadgeHTML(), activeDeptFilter state, applyFinanceDeptFilter(), filter dropdown in render(), updated renderMaterialPRs/renderTransportRequests/renderPOs with filter+badge, updated viewPRDetails/viewTRDetails modals with dept badge

## Decisions Made
- `activeDeptFilter` defaults to `''` (empty string) not null — simple truthiness check: `activeDeptFilter ? filter : use all`
- Filter uses `(pr.department || 'projects') === activeDeptFilter` — treats missing department field as 'projects' to match getDeptBadgeHTML logic and ensure legacy documents (without `department` field) are treated as Projects
- `applyFinanceDeptFilter` re-renders all three tables on every filter change — no selective render needed since filtering is instant client-side operation on in-memory arrays
- PR and TR detail modal labels changed from 'Project:' to 'Department:' with inline badge to communicate dual-department support

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Finance view now shows department context for all records — finance staff can distinguish Projects vs Services PRs/TRs/POs at a glance
- Filter resets to "All Departments" on navigate-away (destroy() clears activeDeptFilter = '')
- Tab switching within Finance does not break filter because applyFinanceDeptFilter is registered in attachWindowFunctions() which runs on every init()
- Ready for Phase 30 Plan 02 (cross-department workflow extensions)

---
*Phase: 30-cross-department-workflows*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: app/views/finance.js (modified with all changes)
- FOUND: 25f55bf (Task 1 commit — getDeptBadgeHTML, activeDeptFilter, applyFinanceDeptFilter)
- FOUND: 9b2d98f (Task 2 commit — filter dropdown, filter logic, badges in all tables and modals)
- FOUND: .planning/phases/30-cross-department-workflows/30-01-SUMMARY.md
