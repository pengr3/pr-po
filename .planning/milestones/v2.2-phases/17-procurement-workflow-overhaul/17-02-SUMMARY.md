---
phase: 17-procurement-workflow-overhaul
plan: 02
subsystem: ui
tags: [procurement, table-restructure, ui-clarity]

# Dependency graph
requires:
  - phase: 17-01
    provides: PR creator field added to PRs collection
provides:
  - Tab renamed from "PR-PO Records" to "MRF Records" for clarity
  - Table columns restructured: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions
  - MRF Status column placeholder added (ready for Plan 03 population)
affects: [17-03-mrf-status-badges, 17-04-combined-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Tab renamed to 'MRF Records' to center view on MRF as source of truth"
  - "Removed 'PO Timeline' column (timeline button remains in Actions column)"
  - "MRF Status column added with placeholder for future badge implementation"
  - "Column order follows workflow: MRF → PRs → POs → Status → Actions"

patterns-established:
  - "Table headers and body rows must match exactly (8 columns)"
  - "PRs and POs displayed in aligned side-by-side columns with vertical-align: top"

# Metrics
duration: 8min
completed: 2026-02-07
---

# Phase 17 Plan 02: Tab Rename & Table Restructure Summary

**MRF Records tab with restructured 8-column table: Date Needed, Procurement Status, MRF Status placeholder, aligned PR-PO columns**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-07T05:45:54Z
- **Completed:** 2026-02-07T05:54:19Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Renamed "PR-PO Records" tab to "MRF Records" across all user-facing text
- Restructured table columns for workflow clarity (8 columns)
- Removed "PO Timeline" column (timeline button remains in Actions)
- Added "MRF Status" column with placeholder (—) for Plan 03 implementation
- Reordered columns to follow logical workflow: MRF ID → Project → Date Needed → PRs → POs → MRF Status → Procurement Status → Actions

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename tab label from "PR-PO Records" to "MRF Records"** - `0c24793` (refactor)
2. **Task 2: Restructure table columns and rename headers** - `ea642a3` (refactor)

Combined commit: `ea642a3` (refactor: rename tab and restructure MRF Records table)

## Files Created/Modified
- `app/views/procurement.js` - Renamed tab label, restructured table headers and tbody rows

## Decisions Made
- **Tab name change:** "MRF Records" centers the view on MRFs as the source of truth in the procurement workflow, rather than focusing on PR-PO relationships
- **Column order:** Follows workflow logic - MRF data first, then generated documents (PRs, POs), then status tracking, then actions
- **PO Timeline column removal:** Timeline button already exists in Actions column, dedicated column was redundant
- **MRF Status placeholder:** Added as "—" to establish column structure for Plan 03 badge implementation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - straightforward table restructure with no blocking issues.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 03:** MRF Status column structure is in place with placeholder. Plan 03 will populate it with color-coded badges (Awaiting PR, 0/n PO Issued, n/n PO Issued).

**Integration verified:** Table restructure preserves all existing functionality:
- PR and PO view modals still functional
- Timeline button still accessible in Actions column
- Supplier drill-down links preserved in PR/PO cells
- Aligned side-by-side PR-PO columns maintain visual relationship

---
*Phase: 17-procurement-workflow-overhaul*
*Completed: 2026-02-07*
