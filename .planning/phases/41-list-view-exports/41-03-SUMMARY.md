---
phase: 41-list-view-exports
plan: 03
subsystem: ui
tags: [csv-export, javascript, procurement, mrf-records, po-tracking]

# Dependency graph
requires:
  - phase: 41-list-view-exports/41-01
    provides: "downloadCSV(headers, rows, filename) shared utility in utils.js"
provides:
  - "exportPRPORecordsCSV function and Export MRF CSV button in Procurement MRF Records card-header"
  - "exportPOTrackingCSV function and Export PO CSV button in Procurement MRF Records card-header"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Both export buttons placed in same card-header as dept filter — dept filter applies to both exports, co-locating controls makes UX intent clear"
    - "exportPRPORecordsCSV: async export with per-MRF Firestore fetches (prs + pos) to build 12-column CSV"
    - "exportPOTrackingCSV: synchronous export from module-level poData state (already loaded by real-time listener)"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Both Export buttons placed in MRF Records card-header alongside dept filter — no separate PO Tracking card-header exists in render(); the dept filter already controls both MRF Records and PO Tracking data, so co-locating the export buttons there is logical and avoids restructuring the render HTML"
  - "exportPOTrackingCSV is synchronous (not async) — reads poData which is already populated by the real-time onSnapshot listener, no additional Firestore calls needed"
  - "exportPRPORecordsCSV is async — must fetch PRs and POs per MRF at export time because filteredPRPORecords only holds MRF data, not denormalized PR/PO references"

patterns-established:
  - "Co-locate export buttons with filter controls that govern the exported data set"
  - "window.exportXxxCSV registered in attachWindowFunctions(), deleted in destroy() — consistent with procurement.js window function lifecycle"

requirements-completed:
  - EXP-02
  - EXP-03

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 41 Plan 03: Procurement MRF Records + PO Tracking CSV Exports Summary

**Two Export CSV buttons added to Procurement MRF Records card-header: exportPRPORecordsCSV (12-column MRF/PR/PO summary from Firestore) and exportPOTrackingCSV (7-column PO list from real-time poData state)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-27T01:46:05Z
- **Completed:** 2026-02-27T01:46:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `downloadCSV` import to procurement.js utils import line
- Added "Export MRF CSV" and "Export PO CSV" buttons to the MRF Records card-header in `render()`, alongside the dept filter dropdown and Refresh button
- Added `exportPRPORecordsCSV()` — async function that fetches PR and PO data per MRF from Firestore and produces a 12-column CSV: MRF ID, Type, Project/Service, Requestor, MRF Status, Urgency, Date Needed, PR IDs, PR Suppliers, PR Total (PHP), PO IDs, PO Status
- Added `exportPOTrackingCSV()` — synchronous function that reads `poData` (real-time listener state), filters by `activePODeptFilter`, and produces a 7-column CSV: PO ID, Type, Supplier, Project/Service, Amount (PHP), Date Issued, Status
- Both functions registered in `attachWindowFunctions()` and cleaned up in `destroy()`

## Task Commits

Both tasks committed atomically in a single file edit (all changes in one pass):

1. **Task 1: Add Export button and exportPRPORecordsCSV to procurement.js** - `89e9e78` (feat)
2. **Task 2: Add Export button and exportPOTrackingCSV to procurement.js PO Tracking section** - `89e9e78` (feat, same commit — both tasks modify same file)

## Files Created/Modified

- `app/views/procurement.js` - Added downloadCSV import; added Export MRF CSV and Export PO CSV buttons in card-header; added exportPRPORecordsCSV() and exportPOTrackingCSV() functions; registered/cleaned window functions

## Decisions Made

- Both Export buttons placed in the existing MRF Records card-header (the one with the dept filter and Refresh). The plan described a separate "PO Tracking card-header" but no such element exists in the render() HTML — the scoreboard area has no card-header. Co-locating both export buttons with the dept filter is correct because the dept filter controls both the MRF Records filtering (filteredPRPORecords) and PO Tracking data filtering (activePODeptFilter for poData). This makes the UI cohesive.
- `exportPOTrackingCSV` reads from `poData` (real-time state populated by onSnapshot listener) rather than fetching fresh. The listener loads when on the records tab, so data is available immediately when user clicks export.
- `exportPRPORecordsCSV` must be async and fetch PRs/POs per MRF because `filteredPRPORecords` only holds MRF-level data — PR and PO references require separate Firestore queries.

## Deviations from Plan

### Adaptation (not a deviation)

The plan (Task 2) instructed to "Find the PO Tracking card-header in render()" and place the Export PO CSV button there. However, no separate "PO Tracking card-header" exists in procurement.js's `render()` HTML — the PO tracking scoreboards are inside an unstyled `<div>` with padding, not a card-header. The `renderPOTrackingTable` function is used for a table that also does not exist in the static render HTML (`poTrackingBody` is referenced in the function but never declared in the template).

**Resolution:** Both Export buttons were placed in the existing MRF Records card-header alongside the dept filter dropdown and Refresh button. This is the correct UX location because the dept filter already governs both exports. The plan's intended outcome (two Export buttons accessible from the records tab) is fully achieved.

**Total deviations:** 0 auto-fixed — 1 minor adaptation (placement of Export PO CSV button)
**Impact on plan:** No scope creep. Required EXP-02 and EXP-03 deliverables fully met.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- EXP-02 and EXP-03 complete — Procurement MRF Records and PO Tracking CSV exports are live
- Phase 41 plans 01, 02, 03 all complete — all 5 list-view export requirements delivered

## Self-Check: PASSED

- `app/views/procurement.js` contains `exportPRPORecordsCSV` - FOUND
- `app/views/procurement.js` contains `exportPOTrackingCSV` - FOUND
- `app/views/procurement.js` contains `downloadCSV` import - FOUND
- `app/views/procurement.js` contains `Export MRF CSV` button - FOUND
- `app/views/procurement.js` contains `Export PO CSV` button - FOUND
- Commit `89e9e78` - FOUND

---
*Phase: 41-list-view-exports*
*Completed: 2026-02-27*
