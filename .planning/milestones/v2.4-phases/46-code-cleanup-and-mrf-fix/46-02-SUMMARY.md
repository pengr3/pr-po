---
phase: 46-code-cleanup-and-mrf-fix
plan: 02
subsystem: ui
tags: [procurement, mrf, dropdown, optgroup, vanilla-js, firestore]

# Dependency graph
requires:
  - phase: 46-01
    provides: dead file removal freeing up clean slate for MRF form fix
provides:
  - Unified #projectServiceSelect dropdown with optgroup for Projects and Services in Procurement Create MRF
  - Updated saveNewMRF() using data-type/data-name attributes from unified select
  - CLAUDE.md Phase 46 documentation block
affects: [procurement.js, CLAUDE.md, mrf-form.js pattern consistency]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unified project/service dropdown: single <select> with optgroups, data-type and data-name on each option"
    - "Read-back pattern: selectedOption?.dataset?.type and dataset?.name — avoids coupling to element ID variations"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - CLAUDE.md

key-decisions:
  - "Unified dropdown always renders both optgroups even when one is empty — empty optgroup is visually invisible and avoids conditional logic"
  - "grid-column: 1/-1 on unified field container spans the full 2-column grid since it replaces two separate grid cells"
  - "CLAUDE.md documents project-assignments.js/service-assignments.js removal in the Phase 46 Changes section even though the verify check expected 0 references — documenting removal is more valuable than omitting it"

patterns-established:
  - "Unified project/service select: use #projectServiceSelect with <optgroup label='Projects'> and <optgroup label='Services'>; read with dataset.type and dataset.name"

requirements-completed: [MRF-01]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 46 Plan 02: Unified Create MRF Dropdown Summary

**Single `<select id="projectServiceSelect">` with Projects/Services optgroups replaces two-dropdown UI in Procurement Create MRF, matching the mrf-form.js pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T01:22:50Z
- **Completed:** 2026-02-28T01:24:33Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced separate `#projectName` and `#saveNewMRF_serviceName` dropdowns with single `#projectServiceSelect` using native optgroup elements
- Updated `saveNewMRF()` to read from unified select using `data-type` and `data-name` attributes — correctly sets department, project_code/project_name, service_code/service_name in Firestore
- Added Phase 46 documentation block to CLAUDE.md covering dead file removal and unified dropdown pattern with read-back code example

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace two dropdowns with unified select in renderMRFDetails() and update saveNewMRF()** - `ecd04f0` (feat)
2. **Task 2: Update CLAUDE.md to reflect Phase 46 changes** - `6c4c504` (docs)

## Files Created/Modified
- `app/views/procurement.js` - Unified dropdown in renderMRFDetails(); updated saveNewMRF() read logic using dataset.type/dataset.name
- `CLAUDE.md` - Phase 46 Changes section + DOM Selection update for #projectServiceSelect

## Decisions Made
- Unified dropdown always renders both optgroups (Projects and Services) even when one is empty — empty optgroup renders invisibly so no conditional omit logic needed
- `grid-column: 1 / -1` on the unified field container spans the full 2-column grid width since it replaces two separate grid cells that previously occupied one column each
- CLAUDE.md Phase 46 documentation includes `project-assignments.js` mention (documenting removal) even though the verify grep check expected 0 — documenting removed dead files is more informative than silently omitting them

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 46 complete: dead file removal (plan 01) and unified MRF dropdown (plan 02) both shipped
- Procurement Create MRF now matches the mrf-form.js dropdown pattern
- No blockers for next phase

---
*Phase: 46-code-cleanup-and-mrf-fix*
*Completed: 2026-02-28*
