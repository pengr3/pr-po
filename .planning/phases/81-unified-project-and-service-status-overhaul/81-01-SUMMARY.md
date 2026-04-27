---
phase: 81-unified-project-and-service-status-overhaul
plan: 01
subsystem: ui
tags: [projects, status, dropdown, legacy, filter]

# Dependency graph
requires: []
provides:
  - "UNIFIED_STATUS_OPTIONS (10-item list) replacing dual INTERNAL_STATUS_OPTIONS + PROJECT_STATUS_OPTIONS in projects.js and project-detail.js"
  - "Single Status column in projects list table (Internal Status column removed)"
  - "rebuildStatusFilterOptions() helper for dynamic legacy value injection in Status filter dropdown"
  - "Legacy project_status values render with (legacy) grey italic suffix in table cells and filter dropdown"
  - "project_status Firestore writes no longer include internal_status field"
affects: [81-02, 81-03, 81-04, services, service-detail, home]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UNIFIED_STATUS_OPTIONS duplicated locally per file (zero-build SPA pattern — no shared import)"
    - "rebuildStatusFilterOptions() called at start of renderProjectsTable() to rebuild filter before any render"
    - "Legacy fallback: prepend (legacy) option with grey italic style when stored value not in unified list"
    - "allProjects array (not projectsData) is the live data source for legacy value scanning"

key-files:
  created: []
  modified:
    - "app/views/projects.js"
    - "app/views/project-detail.js"

key-decisions:
  - "D-03 legacy display: grey italic (legacy) suffix in both table cells and filter dropdown — visually guides users to clean up orphaned values without breaking display"
  - "rebuildStatusFilterOptions() uses allProjects (live snapshot) not projectsData (stale unused var) for accurate legacy discovery"
  - "Verify script false positive: 'Under Client Review' check fails because it is a substring of new option 'Proposal Under Client Review' — implementation is correct; plan verify script has substring match issue"
  - "skeletonTableRows count updated from 7 to 6 and colspan updated from 7 to 6 to match reduced column count"
  - "saveEdit() validation: client_id still required (unchanged from Phase 78 behavior for edit path)"

patterns-established:
  - "rebuildStatusFilterOptions(): scans allProjects for legacy values, rebuilds #projectStatusFilter innerHTML, restores previous selection"
  - "Legacy cell render: IIFE in template literal checks UNIFIED_STATUS_OPTIONS.includes(v) and renders grey italic span if not found"

requirements-completed: [D-01, D-02, D-03, D-04]

# Metrics
duration: 25min
completed: 2026-04-27
---

# Phase 81 Plan 01: Projects Status Overhaul Summary

**Dual Internal Status + Project Status dropdowns replaced with single 10-option unified Status dropdown across projects list and detail views, with legacy value grey italic display and dynamic filter injection.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-27T09:30:00Z
- **Completed:** 2026-04-27T09:55:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed `INTERNAL_STATUS_OPTIONS` and `PROJECT_STATUS_OPTIONS` from both files, replaced with single `UNIFIED_STATUS_OPTIONS` constant (10 options: For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss)
- Projects list view: removed Internal Status form field, filter dropdown, and table column; updated CSV headers from `['Code', 'Name', 'Client', 'Internal Status', 'Project Status', 'Active']` to `['Code', 'Name', 'Client', 'Status', 'Active']`
- Added `rebuildStatusFilterOptions()` — called at the start of `renderProjectsTable()` — which dynamically discovers legacy `project_status` values not in the unified list and injects them as an "Other (legacy)" optgroup in the Status filter dropdown, addressing REVIEWS Concern 2
- Legacy project_status values render in table cells as grey italic text with `(legacy)` suffix so users visually identify orphaned rows
- Project Detail page: collapsed 2-column Internal Status + Project Status grid to single Status dropdown; if stored value is legacy, a `(legacy)` option is prepended styled grey italic and pre-selected so the user can re-select a unified value
- Removed `internal_status` from `addProject()` and `saveEdit()` Firestore write payloads per D-04 (orphaned field left untouched on existing docs — no deleteField calls)
- Removed `internal_status` from edit history diff tracking in `saveEdit()`

## Task Commits

1. **Task 1: Migrate projects.js** - `26e51a2` (feat)
2. **Task 2: Migrate project-detail.js** - `a4073c8` (feat)

## Files Created/Modified

- `app/views/projects.js` — Replaced dual status constants, removed Internal Status form/filter/column/CSV, added `rebuildStatusFilterOptions()`, updated validation + Firestore writes
- `app/views/project-detail.js` — Replaced dual status constants, collapsed Status & Assignment card to single Status dropdown with legacy fallback

## Decisions Made

- Used `allProjects` (the live data source) instead of `projectsData` (unused module-level variable) in `rebuildStatusFilterOptions()` — `projectsData` is declared but data flows through `allProjects` via the onSnapshot callback
- Updated `skeletonTableRows(7, 5)` to `skeletonTableRows(6, 5)` and `colspan="7"` to `colspan="6"` — reducing one column requires consistent count adjustments
- `saveEdit()` still requires `clientId` in its required-field check — this is correct because edit path (unlike create) still requires a client per Phase 78 design

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] skeletonTableRows and colspan counts updated**
- **Found during:** Task 1 (projects.js migration)
- **Issue:** The plan specified removing the Internal Status column from the table but did not mention updating the skeleton row column count or the empty-state colspan
- **Fix:** Updated `skeletonTableRows(7, 5)` → `skeletonTableRows(6, 5)` and `colspan="7"` → `colspan="6"` to match the 6-column table (Code, Name, Client, Status, Active, Actions)
- **Files modified:** `app/views/projects.js`
- **Committed in:** 26e51a2 (Task 1 commit)

**2. [Rule 1 - Bug] rebuildStatusFilterOptions() uses allProjects not projectsData**
- **Found during:** Task 1 (implementing rebuildStatusFilterOptions)
- **Issue:** Plan's code snippet used `for (const project of projectsData)` but `projectsData` is declared as a module-level variable that is never populated (data flows into `allProjects` via onSnapshot). Using `projectsData` would always produce an empty legacy set.
- **Fix:** Changed to `for (const project of allProjects)` which is the actual live data array
- **Files modified:** `app/views/projects.js`
- **Committed in:** 26e51a2 (Task 1 commit)

**3. [Noted] Verify script false positive on 'Under Client Review'**
- **Found during:** Task 1 verification
- **Issue:** The automated verify script checks `src.includes('Under Client Review')` expecting it to NOT be present, but the new option "Proposal Under Client Review" contains "Under Client Review" as a substring. The verify script produces a false positive.
- **Fix:** Not fixed — the implementation is correct. The old standalone option "Under Client Review" is gone. The substring appears only within "Proposal Under Client Review" which is the correct new value. Documented here for the reviewer.
- **Impact:** Zero — the implementation matches the plan's stated requirements exactly.

---

**Total deviations:** 2 auto-fixed (column count consistency), 1 noted (verify false positive)
**Impact on plan:** Both auto-fixes maintain correct UI behavior. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## Known Stubs

None — all dropdown options wire directly to UNIFIED_STATUS_OPTIONS, all Firestore reads/writes use `project_status`, and legacy display renders live stored values.

## Next Phase Readiness

- Plan 81-01 complete — projects.js and project-detail.js fully migrated
- Plan 81-02 (services.js + service-detail.js) can proceed in parallel
- Plan 81-03 (home.js + edit-history.js) can proceed in parallel
- Plan 81-04 (Wave 2 UAT checkpoint) depends on 81-01 + 81-02 + 81-03 all completing

---
*Phase: 81-unified-project-and-service-status-overhaul*
*Completed: 2026-04-27*
