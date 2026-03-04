---
phase: 54-mrf-table-pr-po-alignment
plan: 01
subsystem: ui
tags: [firestore, mrf-records, table, pr, po, paired-rows]

# Dependency graph
requires: []
provides:
  - "mrf-records.js renderTable() with merged PRs/POs paired column and null-slot behavior"
  - "posByPrId index built from poDataArray using po.pr_id field"
affects: [mrf-form, my-requests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["PR-PO pairing via posByPrId index keyed on po.pr_id; null-slot em-dash when no PO linked to a PR"]

key-files:
  created: []
  modified:
    - app/views/mrf-records.js

key-decisions:
  - "Collapsed separate PRs, POs, and Procurement Status columns into single PRs / POs column with per-PR pair rows"
  - "Used posByPrId[pr.pr_id] index built after poDataArray sort to map each PR to its PO(s)"
  - "Null slot shown as em-dash (&#8212;) when no PO exists for a PR"
  - "Used HTML entity &#8594; (arrow) and &#8212; (em-dash) instead of Unicode literals to avoid encoding issues"

patterns-established:
  - "PR-PO pairing pattern: index poDataArray by po.pr_id then look up per PR in pairRows.map()"
  - "First pair row gets border-top removed via .replace() on the generated HTML string"

requirements-completed: [TABLE-01]

# Metrics
duration: 2min
completed: 2026-03-04
---

# Phase 54 Plan 01: MRF Table PR/PO Alignment Summary

**My Requests table collapsed from 8 to 6 columns: each PR row now shows its PO ID inline with procurement status badge, with em-dash null slot when no PO exists yet**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-04T03:30:45Z
- **Completed:** 2026-03-04T03:32:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Removed separate "POs" and "Procurement Status" columns from My Requests table
- Each PR now renders as a paired row showing PR badge -> PO link + status badge on the same line
- PRs with no PO show an em-dash null slot in the PO position
- `posByPrId` index built from `poDataArray` using `po.pr_id` field enables O(1) lookup per PR
- 6-column thead matches the 6-column tbody (MRF ID, Project, Date Needed, PRs / POs, MRF Status, Actions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor renderTable() to paired PR/PO rows with null-slot behavior** - `90d3ce1` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/mrf-records.js` - Replaced separate PRs/POs/Procurement Status columns with unified PRs / POs paired-row column; added posByPrId index; updated thead from 8 to 6 columns

## Decisions Made
- Collapsed three columns into one for clarity: requestors no longer need to cross-reference separate columns to understand which PO belongs to which PR
- Used HTML entity codes (&#8212; and &#8594;) rather than Unicode literals to avoid any potential encoding issues in template literals
- `po.pr_id` is already stored in Firestore PO documents, so no schema change needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- My Requests table now shows PR/PO alignment — TABLE-01 complete
- Ready for Phase 55 (Finance Pending Approvals Fixes)

---
*Phase: 54-mrf-table-pr-po-alignment*
*Completed: 2026-03-04*
