---
phase: 38-code-quality-dry-cleanup
plan: 01
subsystem: ui
tags: [javascript, components, dry, refactor, finance, procurement]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: getMRFLabel dual-condition logic (department field + service_code fallback)
  - phase: 30-cross-department-workflows
    provides: getDeptBadgeHTML and displayPos filter pattern established in finance.js
provides:
  - getMRFLabel and getDeptBadgeHTML as single-source named exports in components.js
  - PO Tracking scoreboard always reflects global totals (not filter-scoped)
affects:
  - Any future phase adding a new view that displays PRs, TRs, or POs with department badges

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source helpers: view-agnostic display helpers live in components.js, not in view files"
    - "Single-filter architecture: scoreboard calculations use full data array; display filtering applied once internally"

key-files:
  created: []
  modified:
    - app/components.js
    - app/views/finance.js
    - app/views/procurement.js

key-decisions:
  - "getMRFLabel and getDeptBadgeHTML moved to components.js with zero dependency additions — both functions only read object properties"
  - "applyPODeptFilter passes full poData to renderPOTrackingTable; internal displayPos derives the filtered subset — scoreboard always global"

patterns-established:
  - "View-agnostic display helpers belong in components.js, not duplicated per-view"
  - "Scoreboard/summary counts computed from full dataset before filtering for display"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 38 Plan 01: Code Quality DRY Cleanup Summary

**Eliminated 23-line getMRFLabel/getDeptBadgeHTML duplication across finance.js and procurement.js by extracting to components.js, and fixed PO Tracking scoreboard to always show global totals regardless of department filter.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T00:00:00Z
- **Completed:** 2026-02-24T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- getMRFLabel and getDeptBadgeHTML now have exactly one definition (in components.js) as named exports
- Both finance.js and procurement.js import these helpers from components.js instead of defining them locally
- PO Tracking scoreboard counts (Materials/Subcon status breakdown) no longer change when a department filter is applied — they always reflect all POs
- Single-filter architecture cleanly established: pos (full array) for scoreboards, displayPos (filtered subset) for table rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract getMRFLabel and getDeptBadgeHTML to components.js** - `771e576` (refactor)
2. **Task 2: Fix PO Tracking scoreboard to always show global totals** - `60c66fa` (fix)

## Files Created/Modified
- `app/components.js` - Added getMRFLabel and getDeptBadgeHTML as named exports (36 lines added)
- `app/views/finance.js` - Added import from components.js, removed 29-line local definition block
- `app/views/procurement.js` - Updated existing import to include getMRFLabel/getDeptBadgeHTML, removed 29-line local definition block; applyPODeptFilter simplified to 2 lines

## Decisions Made
- No dependency additions needed in components.js — both functions only read object properties (no Firestore, no formatCurrency)
- Local `doc` parameter in getMRFLabel/getDeptBadgeHTML does not shadow the Firestore `doc` import in procurement.js because they were in separate function scopes
- finance.js received a new import line (it previously had no components.js import); procurement.js had its existing import extended

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 38 plan 01 complete; no blockers
- Any new view that renders PRs/TRs/POs with department information should import getMRFLabel and getDeptBadgeHTML from components.js

---
*Phase: 38-code-quality-dry-cleanup*
*Completed: 2026-02-24*
