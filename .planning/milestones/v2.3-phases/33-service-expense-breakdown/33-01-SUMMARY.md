---
phase: 33-service-expense-breakdown
plan: 01
subsystem: ui
tags: [firestore, aggregation, services, expense, getAggregateFromServer]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: service_code field stored on MRF/PR/PO documents enabling cross-collection queries
  - phase: 28-services-view
    provides: service-detail.js view with Financial Summary card stub and renderServiceDetail pattern
provides:
  - refreshServiceExpense() aggregation function querying mrfs/prs/pos by service_code
  - currentServiceExpense module variable (mrfCount, prTotal, prCount, poTotal, poCount)
  - Expense scorecard HTML in Financial Summary card (3 tiles: MRFs Linked, PR Total, PO Total)
  - Refresh button wired to window.refreshServiceExpense()
affects:
  - any future phase that reads service expense totals (summary dashboards, service reporting)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getAggregateFromServer with named aggregates (count, sum) on filtered queries"
    - "async onSnapshot callback pattern — await aggregation before first render"
    - "cached module variable (currentServiceExpense) populated by aggregation, read by render (no circular call)"
    - "silent=true parameter for automatic load vs. Refresh button (shows toast on manual only)"

key-files:
  created: []
  modified:
    - app/views/service-detail.js

key-decisions:
  - "refreshServiceExpense calls renderServiceDetail — renderServiceDetail never calls refreshServiceExpense (same anti-loop pattern as project-detail.js)"
  - "onSnapshot callback made async; refreshServiceExpense(true) awaited before render so initial load shows real data not zeros"
  - "Em dash shown when prTotal/poTotal is 0 — handles services with no linked Phase-29 documents cleanly"
  - "destroy() resets currentServiceExpense to zeros — prevents stale expense data appearing on next service navigation"
  - "Refresh button calls window.refreshServiceExpense() (not silent) so user sees Expense refreshed toast on demand"

patterns-established:
  - "Cached expense variable pattern: module-level variable reset in destroy(), populated by aggregation function, read-only in render"
  - "Three-collection expense aggregation: mrfs (count only, no total_amount), prs (sum + count), pos (sum + count)"

requirements-completed: [SERV-11]

# Metrics
duration: 15min
completed: 2026-02-19
---

# Phase 33 Plan 01: Service Expense Breakdown Summary

**Real-time expense aggregation via getAggregateFromServer wired into service-detail.js Financial Summary card, replacing Phase-28 stub with three live scorecards (MRFs Linked, PR Total, PO Total) filtered by service_code.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-19T08:48:24Z
- **Completed:** 2026-02-19T09:03:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Removed static stub "Expense tracking requires MRF-Service integration" from service-detail.js
- Added refreshServiceExpense() with three parallel getAggregateFromServer calls (mrfs count, prs sum+count, pos sum+count) filtered by service_code
- Updated onSnapshot callback to async; expense data loaded silently on every service load before first render
- Financial Summary card now shows three scorecards: MRFs Linked, PR Total (PHP), PO Total (PHP) with Refresh button
- currentServiceExpense module variable properly reset in destroy() to prevent cross-service data bleed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add refreshServiceExpense() and module variable** - `389b5a6` (feat)
2. **Task 2: Replace stub with expense scorecard HTML in renderServiceDetail()** - `33669c6` (feat)

**Plan metadata:** (docs commit — in progress)

## Files Created/Modified
- `app/views/service-detail.js` - Added refreshServiceExpense(), currentServiceExpense variable, updated imports, onSnapshot callback, destroy(), attachWindowFunctions(), and replaced stub with scorecard HTML

## Decisions Made
- refreshServiceExpense calls renderServiceDetail; renderServiceDetail never calls refreshServiceExpense (anti-loop rule, same as project-detail.js)
- onSnapshot callback made async so initial load awaits real aggregation data before rendering
- Em dash shown when totals are 0 — handles pre-Phase-29 docs with no service_code cleanly
- destroy() resets currentServiceExpense to zeros — prevents stale expense data on service navigation
- window.refreshServiceExpense assigned in attachWindowFunctions and deleted in destroy (standard window function lifecycle)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SERV-11 satisfied: service detail page now shows real expense breakdown
- Phase 33 plan 01 complete; remaining phases in phase 33 (if any) can proceed
- Any future reporting/dashboard phases can reference currentServiceExpense pattern for aggregation

---
*Phase: 33-service-expense-breakdown*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: app/views/service-detail.js
- FOUND: .planning/phases/33-service-expense-breakdown/33-01-SUMMARY.md
- FOUND commit: 389b5a6 (Task 1 — refreshServiceExpense + module variable)
- FOUND commit: 33669c6 (Task 2 — expense scorecard HTML)
