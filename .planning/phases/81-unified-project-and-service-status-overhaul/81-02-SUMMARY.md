---
phase: 81-unified-project-and-service-status-overhaul
plan: 02
subsystem: ui
tags: [services, status, unified-status, firestore, vanilla-js]

# Dependency graph
requires:
  - phase: 81-unified-project-and-service-status-overhaul
    provides: CONTEXT.md with D-01..D-06 decisions and UNIFIED_STATUS_OPTIONS list
provides:
  - Services list view with single unified Status dropdown (10 options) replacing dual Internal/Project Status
  - Services detail page with single Status dropdown and legacy fallback rendering
  - Dynamic legacy filter injection via rebuildServiceStatusFilterOptions()
  - CSV export with unified Status column header
affects: [home.js, edit-history.js]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - UNIFIED_STATUS_OPTIONS constant (10 values) defined locally per file — zero-build SPA pattern
    - Legacy value rendering: grey italic (legacy) suffix in table cells and filter dropdown
    - rebuildServiceStatusFilterOptions() scans allServices for unknown project_status values and appends Other (legacy) optgroup
    - Legacy fallback option in detail page select: pre-selected (legacy) option in grey italic when stored value not in new list

key-files:
  created: []
  modified:
    - app/views/services.js
    - app/views/service-detail.js

key-decisions:
  - "Per D-01: reuse project_status Firestore field — no new field, no migration script"
  - "Per D-04: internal_status field dropped from all UI reads and writes; orphaned docs retain old field value silently"
  - "Per D-03: legacy project_status values render as grey italic (legacy) in table cells; detail page shows pre-selected (legacy) option"
  - "rebuildServiceStatusFilterOptions() uses allServices (not servicesData stub) — corrected from plan template which referenced wrong variable name"
  - "Verification script false positive: 'Under Client Review' check adapted to quote-exact match because new value 'Proposal Under Client Review' contains the substring"

patterns-established:
  - "rebuildServiceStatusFilterOptions(): call as first line of renderServicesTable() to ensure filter reflects current data on every render"
  - "Legacy option in detail select: prepend as first option with value=raw-value, selected, italic grey style; normal options follow"

requirements-completed: [D-01, D-02, D-03, D-04]

# Metrics
duration: 4min
completed: 2026-04-27
---

# Phase 81 Plan 02: Services Unified Status Migration Summary

**Single unified Status dropdown (10 options) replaces dual Internal Status + Project Status fields in both services.js and service-detail.js, with dynamic legacy value injection in filter and grey italic (legacy) rendering in table cells and detail page**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-27T09:24:02Z
- **Completed:** 2026-04-27T09:28:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced `INTERNAL_STATUS_OPTIONS` (4 options) + `PROJECT_STATUS_OPTIONS` (7 options) with `UNIFIED_STATUS_OPTIONS` (10 options) in both files
- Services list page: single Status filter dropdown, single Status table column, single Status form-group in Add/Edit form, updated CSV headers
- Dynamic legacy filter injection: `rebuildServiceStatusFilterOptions()` scans `allServices` on every table render and appends an "Other (legacy)" optgroup listing any stored `project_status` values not in the unified list
- Service Detail page: Status & Assignment card collapsed from 2-column grid to single full-width Status dropdown; legacy values render as pre-selected (legacy) option in grey italic
- All Firestore writes in `addService()` and `saveServiceEdit()` omit `internal_status` entirely; `project_status` carries the unified value

## Task Commits

1. **Task 1: Migrate services.js** - `330d37d` (feat)
2. **Task 2: Migrate service-detail.js** - `64ffe67` (feat)

**Plan metadata:** (included in final commit below)

## Files Created/Modified

- `app/views/services.js` — UNIFIED_STATUS_OPTIONS replacing dual constants; form, filter, table column, CSV, validation, addDoc/updateDoc payloads, edit-history diffs, rebuildServiceStatusFilterOptions()
- `app/views/service-detail.js` — UNIFIED_STATUS_OPTIONS replacing dual constants; Status & Assignment card collapsed to single dropdown with legacy fallback option

## Decisions Made

- Used `allServices` (not the stub `servicesData` array declared at top of module) in `rebuildServiceStatusFilterOptions()` — `allServices` is the live data array populated by the onSnapshot listener; `servicesData` is an empty array used only for destroy() cleanup reset
- Adapted verification check for "Under Client Review" to use quote-exact match (`'Under Client Review'`) because the new option "Proposal Under Client Review" contains the substring and would have caused a false-positive failure
- Single full-width form-group for Status in service-detail.js (no grid container) — mirrors plan's spec of collapsing the 2-column grid, not just removing one column

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected servicesData variable reference in rebuildServiceStatusFilterOptions()**
- **Found during:** Task 1 (services.js migration)
- **Issue:** Plan template used `servicesData` in the function body, but services.js uses `allServices` as its live data array; `servicesData` is only declared as an empty array stub reset in `destroy()` — iterating it would always produce zero legacy values
- **Fix:** Changed loop to `for (const service of allServices)` so the function actually scans the real data
- **Files modified:** app/views/services.js
- **Verification:** Function correctly references live data array
- **Committed in:** 330d37d (Task 1 commit)

**2. [Rule 1 - Bug] Verification script adapted for substring false positive**
- **Found during:** Task 1 verification run
- **Issue:** Plan's automated check used `src.includes('Under Client Review')` which matched the new value 'Proposal Under Client Review', producing a false LINGERING error
- **Fix:** Adapted check to `src.includes("'Under Client Review'")` (quote-delimited) for the negative check; the new value passes because it is never stored as the bare string
- **Files modified:** (check only, not committed)
- **Verification:** Corrected check passes

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Known Stubs

None — all status dropdowns are fully wired to UNIFIED_STATUS_OPTIONS with legacy fallback. No placeholder or hardcoded empty values in the new code paths.

## Next Phase Readiness

- Services parity with Projects (Plan 81-01) achieved — both entities now use the single unified Status dropdown
- Plan 81-03 (home.js charts) and Plan 81-04 (edit-history.js labels) can proceed independently

---
*Phase: 81-unified-project-and-service-status-overhaul*
*Completed: 2026-04-27*
