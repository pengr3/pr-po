---
phase: 41-list-view-exports
plan: 01
subsystem: ui
tags: [csv-export, javascript, utils, projects, services]

# Dependency graph
requires: []
provides:
  - "downloadCSV(headers, rows, filename) shared utility in utils.js — reusable by Plans 02 and 03"
  - "Export CSV button on Projects list page"
  - "Export CSV button on Services list page"
affects:
  - 41-list-view-exports/41-02
  - 41-list-view-exports/41-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared CSV export utility in utils.js — import downloadCSV in any view that needs exports"
    - "filteredXxx module-level variables used for export (respects active filters)"
    - "window.exportXxxCSV registered in init(), cleaned up in destroy() — consistent with window function lifecycle"

key-files:
  created: []
  modified:
    - app/utils.js
    - app/views/projects.js
    - app/views/services.js

key-decisions:
  - "downloadCSV placed in utils.js as shared utility so Plans 02 and 03 import the same function (no duplication)"
  - "Export uses filteredProjects / filteredServices (not raw projectsData / servicesData) to respect active filters"
  - "Client name resolved via clientsData lookup by client_id, with fallback to client_code"

patterns-established:
  - "CSV escape: wrap in double-quotes if value contains comma, double-quote, or newline; double-escape internal double-quotes"
  - "Export button placed as btn-secondary alongside existing btn-primary (Add X) in suppliers-header"
  - "window.exportXxxCSV lifecycle: assigned at module level AND in init(), deleted in destroy()"

requirements-completed:
  - EXP-04
  - EXP-05

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 41 Plan 01: List View Exports (Projects + Services) Summary

**Shared downloadCSV utility in utils.js plus one-click CSV export buttons on Projects and Services list views using filtered data**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-27T09:14:19Z
- **Completed:** 2026-02-27T09:16:37Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `downloadCSV(headers, rows, filename)` export to `app/utils.js` — handles CSV escaping, creates Blob, triggers browser download
- Projects list now has an "Export CSV" button that downloads `projects-YYYY-MM-DD.csv` with columns: Code, Name, Client, Internal Status, Project Status, Active
- Services list now has an "Export CSV" button that downloads `services-YYYY-MM-DD.csv` with the same column schema
- Both exports respect active filters (use `filteredProjects` / `filteredServices`) and resolve client names from `clientsData`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add downloadCSV utility to utils.js** - `25fd66b` (feat)
2. **Task 2: Add Export button and exportProjectsCSV to projects.js** - `d9205ae` (feat)
3. **Task 3: Add Export button and exportServicesCSV to services.js** - `1af0665` (feat)

## Files Created/Modified

- `app/utils.js` - Appended `downloadCSV` export function (CSV escaping + Blob download trigger)
- `app/views/projects.js` - Import downloadCSV; add "Export CSV" btn in suppliers-header; add `exportProjectsCSV()` function; register/clean window.exportProjectsCSV
- `app/views/services.js` - Import downloadCSV; add "Export CSV" btn in suppliers-header alongside tab-bar; add `exportServicesCSV()` function; register/clean window.exportServicesCSV

## Decisions Made

- `downloadCSV` placed in `utils.js` as shared utility so Plans 02 and 03 can import the same function without duplicating CSV logic.
- Exports use `filteredProjects`/`filteredServices` (the filtered subset shown in the table), not the raw unfiltered data arrays — so applying a status filter before exporting gives the user exactly what they see.
- Client name resolved via `clientsData.find(c => c.id === project.client_id)?.company_name` with fallback to `project.client_code || ''` for records that may lack a linked client.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `downloadCSV` is ready to import in Plans 02 and 03 (MRF, PO, PR/TR exports)
- Pattern established: import from `'../utils.js'`, call with headers array, rows 2D array, filename string

## Self-Check: PASSED

- `app/utils.js` exists and contains `export function downloadCSV` - FOUND
- `app/views/projects.js` exists and contains `exportProjectsCSV` - FOUND
- `app/views/services.js` exists and contains `exportServicesCSV` - FOUND
- Commit `25fd66b` (Task 1) - FOUND
- Commit `d9205ae` (Task 2) - FOUND
- Commit `1af0665` (Task 3) - FOUND

---
*Phase: 41-list-view-exports*
*Completed: 2026-02-27*
