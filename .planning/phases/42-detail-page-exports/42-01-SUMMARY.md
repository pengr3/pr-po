---
phase: 42-detail-page-exports
plan: 01
subsystem: ui
tags: [csv-export, firestore, javascript, project-detail, service-detail]

# Dependency graph
requires:
  - phase: 41-list-view-exports
    provides: downloadCSV utility in utils.js (shared CSV download function used by both new export functions)
provides:
  - Export CSV button on project detail Financial Summary card (exportProjectExpenseCSV)
  - Export CSV button on service detail Financial Summary card (exportServiceExpenseCSV)
  - One-row-per-PO-line-item CSV with DATE, CATEGORY, SUPPLIER/SUBCONTRACTOR, ITEMS, QTY, UNIT, UNIT COST, TOTAL COST, REQUESTED BY, REMARKS columns
affects: [future filter additions to project-detail or service-detail must update export functions to apply filter state]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MRF lookup via Firestore 'in' query with 30-item chunking for requestor_name join"
    - "Disabled button via inline opacity/pointer-events when poCount === 0 (no DOM query — driven by module state)"
    - "Filename sanitisation: spaces to hyphens, strip non-alphanumeric-hyphen-underscore, append YYYY-MM-DD"

key-files:
  created: []
  modified:
    - app/views/project-detail.js
    - app/views/service-detail.js

key-decisions:
  - "Service export queries POs using service_code (the actual PO field), not service_name — CONTEXT.md phrasing was imprecise; querying by service_code is consistent with how refreshServiceExpense already works"
  - "No loading spinner or info toast on export — silent browser download with error-only toast on Firestore failure"
  - "Filter compliance satisfied by definition: neither detail page has user-facing filter controls on the Financial Summary card, so querying all POs for the entity IS the filtered set"
  - "MRF chunking handles >30 unique mrf_ids via 30-item batch queries to stay within Firestore 'in' operator limit"

patterns-established:
  - "Detail page CSV export: query pos by entity key, chunk-fetch mrfs for requestor_name, explode items_json into rows, downloadCSV"
  - "Export button disabled state driven by module-level poCount variable rendered inline — no post-render DOM manipulation required"

requirements-completed: [EXP-06, EXP-07]

# Metrics
duration: ~15min
completed: 2026-02-27
---

# Phase 42 Plan 01: Detail Page Exports Summary

**Export CSV buttons on project and service detail Financial Summary cards that fetch POs, explode items_json into one row per line item, join requestor_name from MRFs, and download via shared downloadCSV utility**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-27T03:00:00Z
- **Completed:** 2026-02-27T03:34:42Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Added `exportProjectExpenseCSV` function to project-detail.js with Export CSV button in Financial Summary card header
- Added `exportServiceExpenseCSV` function to service-detail.js with Export CSV button in Financial Summary card header
- Both exports produce correctly formatted CSV with 10 columns (DATE, CATEGORY, SUPPLIER/SUBCONTRACTOR, ITEMS, QTY, UNIT, UNIT COST, TOTAL COST, REQUESTED BY, REMARKS), dates in YYYY-MM-DD, costs as plain decimals, and filename with spaces-to-hyphens sanitisation
- Button disabled state (opacity 0.45, pointer-events none) when poCount is 0 — driven by module-level state, no post-render DOM work required
- User verified both exports end-to-end and confirmed correct output

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Export CSV to project-detail.js** - `f2f408f` (feat)
2. **Task 2: Add Export CSV to service-detail.js** - `05b2970` (feat)
3. **Task 3: User verification of CSV export output** - human-verify checkpoint (approved)

## Files Created/Modified
- `app/views/project-detail.js` - Added `downloadCSV` import, Export CSV button in Financial Summary heading row, `exportProjectExpenseCSV` async function, window registration in `attachWindowFunctions()`, and cleanup in `destroy()`
- `app/views/service-detail.js` - Added `downloadCSV` import, Export CSV button in Financial Summary heading row, `exportServiceExpenseCSV` async function, window registration in `attachWindowFunctions()`, and cleanup in `destroy()`

## Decisions Made
- Service export queries POs by `service_code` (the correct PO field), not `service_name` — CONTEXT.md's phrasing was imprecise; using `service_code` is consistent with how `refreshServiceExpense()` already queries POs
- No loading spinner or info toast on export — silent browser download, only error toast if Firestore query throws
- Filter compliance: neither page has user-facing filter controls on Financial Summary, so querying all POs for the entity IS the filtered set; if filters are added in a future phase, export functions must be updated
- MRF lookup uses Firestore `in` operator with 30-item chunking to handle projects/services with >30 unique MRF IDs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 42 is the only plan in this phase — phase complete
- EXP-06 and EXP-07 satisfied; detail page exports are fully delivered
- No blockers or concerns for subsequent phases

---
*Phase: 42-detail-page-exports*
*Completed: 2026-02-27*
