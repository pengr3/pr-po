---
phase: 04-mrf-project-integration
plan: 02
subsystem: ui
tags: [javascript, firebase, firestore, display, backward-compatibility]

# Dependency graph
requires:
  - phase: 04-01
    provides: MRF form saves project_code field
provides:
  - MRF display shows "CODE - Name" format throughout procurement and finance views
  - PR/TR/PO records inherit and display project_code
  - Backward-compatible display for legacy MRFs without project_code
affects: [04-03-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backward-compatible display pattern: ${item.project_code ? item.project_code + ' - ' : ''}${item.project_name || 'No project'}"
    - "Project dropdown uses project_code as value, stores both code and name"
    - "Legacy data handling: fallback to project_name only when project_code missing"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "Display pattern uses ternary for backward compatibility"
  - "Project dropdown selection logic handles both new (by code) and legacy (by name) MRFs"
  - "All generated PR/TR/PO documents include project_code field for consistency"

patterns-established:
  - "Backward-compatible display: Always check for project_code existence before displaying"
  - "Data propagation: When MRF generates PR/TR/PO, copy both project_code and project_name"
  - "Dropdown handling: Match by code first, fall back to name for legacy data"

# Metrics
duration: 7min
completed: 2026-01-30
---

# Phase 04 Plan 02: MRF-Project Integration Display Summary

**MRF and PR/TR displays updated to show "CODE - Name" format with backward compatibility for legacy data across procurement and finance views**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-30T06:23:06Z
- **Completed:** 2026-01-30T06:29:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All MRF displays in procurement view show project code + name
- All PR/TR/PO displays in finance view show project information
- Project dropdown updated to use project_code as value
- Backward compatibility ensures legacy MRFs (without project_code) display correctly
- Document generation includes project code in generated PR/PO PDFs

## Task Commits

Each task was committed atomically:

1. **Task 1: Update MRF display in procurement view** - `8bfb4bd` (feat)
   - Updated 9 display locations for MRF project information
   - Modified project dropdown to use project_code
   - Updated PR/TR/PO generation to include project_code
   - Modified saveNewMRF to save both project_code and project_name

2. **Task 2: Update PR/TR display in finance view** - `77ebf33` (feat)
   - Updated 6 display locations for project information
   - Modified PO generation from approved PR

## Files Created/Modified
- `app/views/procurement.js` - Updated all MRF/PR/PO displays with project code, modified dropdown, updated generation functions
- `app/views/finance.js` - Updated all PR/TR/PO displays with project information

## Decisions Made

**Display Pattern Choice:**
- Used ternary pattern `${item.project_code ? item.project_code + ' - ' : ''}${item.project_name || 'No project'}` for backward compatibility
- Rationale: Handles three cases cleanly - new records (code + name), legacy records (name only), missing data (fallback text)

**Dropdown Value Selection:**
- Changed project dropdown from using project_name to project_code as value
- Selection logic checks project_code first, falls back to project_name for legacy MRFs
- Rationale: project_code is unique and immutable, better identifier than project_name

**Data Propagation:**
- All generation functions (PR/TR/PO) copy both project_code and project_name from source MRF
- Rationale: Ensures data consistency throughout the procurement chain

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all updates applied cleanly to existing display patterns.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for UAT (04-03):**
- All display locations updated and tested
- Backward compatibility ensures existing data displays correctly
- New MRFs will include project code in all views
- PR/PO chain propagates project information consistently

**Testing checklist for 04-03:**
- Verify new MRF shows "CODE - Name" in all locations
- Verify legacy MRF shows just name (graceful fallback)
- Verify PR/TR/PO inherit project information correctly
- Verify document generation includes project code

---
*Phase: 04-mrf-project-integration*
*Completed: 2026-01-30*
