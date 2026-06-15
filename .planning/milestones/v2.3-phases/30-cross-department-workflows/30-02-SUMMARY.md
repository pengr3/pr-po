---
phase: 30-cross-department-workflows
plan: 02
subsystem: ui
tags: [procurement, department-filter, badges, timeline, po-tracking]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: getMRFLabel() helper and department field on MRF/PR/TR/PO documents
provides:
  - Department badge spans (purple=Services, blue=Projects) in PO Tracking table rows
  - Department filter dropdown (All/Projects/Services) in MRF Records card header
  - activePODeptFilter client-side filter state with destroy() cleanup
  - Timeline modal dept context: deptLabel+getMRFLabel for MRF, Dept: text for PR/TR/PO entries
affects:
  - 30-03 (finance view dept filter if planned)
  - Any future PO tracking enhancements

# Tech tracking
tech-stack:
  added: []
  patterns:
    - client-side filter before pagination using displayPos derived array
    - getDeptBadgeHTML() inline badge helper returning styled HTML spans
    - applyPODeptFilter() registered on window for tab-switch safety, cleaned in destroy()

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "activePODeptFilter state variable filters displayPos BEFORE pagination so page count reflects filtered total, not global total"
  - "Scoreboard counts remain calculated from the full unfiltered pos parameter (global totals are more useful than filtered totals in scoreboards)"
  - "getDeptBadgeHTML() uses dual-condition check (department==='services' OR service_code fallback) matching getMRFLabel() pattern from phase 29"
  - "Fixed pre-existing missing window. prefix bug on viewPODetails link in PO row template (Rule 1)"

patterns-established:
  - "displayPos pattern: derive filtered array from function param after scoreboard calculation, use for all pagination downstream"
  - "Badge helper returns inline-styled span (no CSS class dependency) for portability"

requirements-completed: [CROSS-02, CROSS-03, CROSS-04, CROSS-07]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 30 Plan 02: Department Filter and Badges for PO Tracking Summary

**Department-aware PO Tracking table with purple/blue inline badges, All/Projects/Services filter dropdown, and dept-context in procurement timeline modal**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-18T07:15:18Z
- **Completed:** 2026-02-18T07:18:01Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `getDeptBadgeHTML()` helper producing purple (Services) or blue (Projects) inline badge spans
- Added `activePODeptFilter` state with full `applyPODeptFilter()` window function and destroy() cleanup
- Added department filter dropdown in MRF Records card header (All Departments / Projects / Services)
- Applied `displayPos` derived array in `renderPOTrackingTable()` so pagination count reflects filtered results while scoreboards stay global
- Updated `showProcurementTimeline()` MRF entry to use `deptLabel + getMRFLabel(mrf)` instead of raw `project_name`
- Added dept text to PR, TR, and PO timeline entry descriptions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getDeptBadgeHTML helper, activePODeptFilter state, and applyPODeptFilter window function** - `9e0817f` (feat)
2. **Task 2: Add dept filter dropdown to render(), dept badges to renderPOTrackingTable(), and dept context to showProcurementTimeline()** - `d6e10c5` (feat)

**Plan metadata:** *(this summary commit)*

## Files Created/Modified
- `app/views/procurement.js` - getDeptBadgeHTML helper, activePODeptFilter state, applyPODeptFilter function, filter dropdown in render(), displayPos filter in renderPOTrackingTable(), dept context in showProcurementTimeline()

## Decisions Made
- `activePODeptFilter` filters `displayPos` BEFORE pagination so page count reflects filtered total, not global total. Scoreboards still use full `pos` to show meaningful global totals.
- `getDeptBadgeHTML()` uses the same dual-condition check (`department === 'services' || (!doc.department && doc.service_code)`) as `getMRFLabel()` to handle pre-existing documents without a `department` field.
- No new Firestore queries issued on filter change — purely client-side against `poData` already in memory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing window. prefix on viewPODetails link in PO row template**
- **Found during:** Task 2 (renderPOTrackingTable row template changes)
- **Issue:** `onclick="viewPODetails('${po.id}')"` lacked `window.` prefix — would fail after tab navigation when global scope lookup fails
- **Fix:** Changed to `onclick="window.viewPODetails('${po.id}')"`
- **Files modified:** app/views/procurement.js
- **Verification:** Grep confirmed `window.viewPODetails` present in row template
- **Committed in:** d6e10c5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for correctness when switching tabs. No scope creep.

## Issues Encountered
None — plan executed cleanly, all insertion points matched exactly.

## Next Phase Readiness
- PO Tracking table now surfaces department context visually and functionally
- Filter state resets to All on destroy() — correct for tab-away/return behavior
- Finance view dept filter (if planned in 30-03) can reuse the same getDeptBadgeHTML/activePODeptFilter pattern

## Self-Check: PASSED

- FOUND: app/views/procurement.js (modified)
- FOUND: commit 9e0817f (Task 1: getDeptBadgeHTML helper, state, applyPODeptFilter)
- FOUND: commit d6e10c5 (Task 2: render dropdown, table badges, timeline dept context)
- FOUND: .planning/phases/30-cross-department-workflows/30-02-SUMMARY.md

All success criteria met:
- activePODeptFilter resets to '' on destroy() and window.applyPODeptFilter deleted
- Department badges render in PO Tracking rows (purple = Services, blue = Projects)
- Filter applied to displayPos BEFORE pagination (page count reflects filtered total)
- Scoreboard counts still calculated from unfiltered pos parameter
- Timeline modal uses getMRFLabel(mrf) for MRF entry and dept text for PR/TR/PO entries
- No new Firestore queries on filter change (client-side only)
- Tab switching does not break filter dropdown (registered via attachWindowFunctions)

---
*Phase: 30-cross-department-workflows*
*Completed: 2026-02-18*
