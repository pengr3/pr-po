---
phase: 36-fix-the-expense-breakdown-modal-in-services-export-the-one-we-ve-been-using-in-projects
plan: 01
subsystem: ui
tags: [expense-modal, services, firestore, javascript, es6-modules]

# Dependency graph
requires:
  - phase: 33-service-detail-expense-aggregation
    provides: refreshServiceExpense aggregation and currentService data available in service-detail.js
  - phase: 29-mrf-integration
    provides: service_code field on pos and transport_requests collections
provides:
  - Unified showExpenseBreakdownModal(identifier, options) replacing two divergent implementations
  - Services expense modal with correct Material/Transport/Subcon scorecards and By Category/Transport Fees tabs
  - TRs now included in service expense breakdown (was omitted in old showServiceExpenseBreakdownModal)
affects: [service-detail, project-detail, finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-branching pattern: single exported function with { mode } option controlling only the Firestore query section; all display logic shared"
    - "Options destructuring with defaults: showExpenseBreakdownModal(identifier, { mode='project', displayName, budget } = {})"

key-files:
  created: []
  modified:
    - app/expense-modal.js
    - app/views/service-detail.js
    - app/views/project-detail.js
    - app/views/finance.js

key-decisions:
  - "Mode branching only at query level — all scorecard/tab/HTML display logic is shared verbatim; eliminates risk of future divergence"
  - "Budget label changed from 'Project Budget' to 'Budget' and 'Total Project Cost' to 'Total Cost' — neutral labels valid for both project and service context"
  - "showServiceExpenseBreakdownModal removed entirely; the old implementation omitted transport_requests queries — service mode now correctly includes TRs by service_code"
  - "window function name window.showServiceExpenseModal kept unchanged in service-detail.js — only the underlying showExpenseBreakdownModal call updated; no HTML template changes needed"

patterns-established:
  - "Unified modal with mode param: prefer single export with options object over two parallel exports for same UI pattern"

requirements-completed: []

# Metrics
duration: 12min
completed: 2026-02-23
---

# Phase 36 Plan 01: Fix Service Expense Breakdown Modal Summary

**Merged two divergent expense modal implementations into a single showExpenseBreakdownModal(identifier, options) that queries POs and TRs by service_code for services and shows the correct Material/Transport/Subcon scorecards and By Category/Transport Fees tabs**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-23T03:16:19Z
- **Completed:** 2026-02-23T03:28:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Rewrote app/expense-modal.js to export a single `showExpenseBreakdownModal(identifier, { mode, displayName, budget })` function
- Service mode now queries `pos` and `transport_requests` by `service_code` — TRs were entirely missing from the old service implementation
- Deleted `showServiceExpenseBreakdownModal`, `window._closeServiceExpenseBreakdownModal`, and `window._switchSvcExpBreakdownTab` entirely
- Updated all three call sites (service-detail.js, project-detail.js, finance.js) to use the unified function with correct mode options

## Task Commits

Each task was committed atomically:

1. **Task 1: Unify expense-modal.js** - `946d8b1` (feat)
2. **Task 2: Update three call sites** - `7ac4999` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/expense-modal.js` - Rewritten: single export, mode-branching query section, shared display logic; removed 198 lines of duplicate service code
- `app/views/service-detail.js` - Import changed to `showExpenseBreakdownModal`; window call updated to pass `{ mode: 'service', displayName, budget }`
- `app/views/project-detail.js` - window.showExpenseModal now passes `{ mode: 'project' }` explicitly
- `app/views/finance.js` - window.showProjectExpenseModal now passes `{ mode: 'project' }` explicitly

## Decisions Made
- Mode branching only at query level: all scorecard/tab/HTML display logic is shared verbatim to eliminate future divergence risk
- Budget label changed from "Project Budget" to neutral "Budget" and "Total Project Cost" to "Total Cost" — valid for both contexts
- Old service implementation omitted TRs entirely; service mode now correctly queries transport_requests by service_code
- window.showServiceExpenseModal name kept unchanged — only the underlying call updated; no HTML template edits needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Services expense modal is now functionally correct and consistent with projects modal
- No further expense modal work identified
- Phase 36 is the final identified gap-closure phase for v2.3

---
*Phase: 36-fix-the-expense-breakdown-modal-in-services-export-the-one-we-ve-been-using-in-projects*
*Completed: 2026-02-23*
