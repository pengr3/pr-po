---
phase: 54-mrf-table-pr-po-alignment
plan: 02
subsystem: ui
tags: [procurement, firestore, table, status-dropdown]

# Dependency graph
requires: []
provides:
  - "renderPRPORecords() with merged PRs/POs column — each PR row shows its PO inline with status dropdown on the same line"
affects: [procurement-mrf-records, po-tracking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "posByPrId index: build a lookup map from poDataArray keyed by po.pr_id so each PR can find its matched POs in O(1)"
    - "Null slot pattern: PR rows with no matching PO show an em-dash placeholder in the same cell column"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "Added pr_id field to poDataArray objects so the PO-by-pr_id index works correctly"
  - "Removed separate POs and Procurement Status <th> columns; status dropdowns now live inline beside each PO link"
  - "Kept mrf._procurement_status computation block unchanged — still used for sort-by-procurement-status feature"
  - "Kept sortPRPORecords('procurement_status') sort logic even though the Procurement Status column header is gone — sort by that field still works programmatically"

patterns-established:
  - "Merged PR/PO cell: prPoHtml builder iterates prDataArray, looks up posByPrId[pr.pr_id], renders PR badge + arrow + PO link + status dropdown as one flex row"

requirements-completed:
  - TABLE-02
  - TABLE-03

# Metrics
duration: 15min
completed: 2026-03-04
---

# Phase 54 Plan 02: MRF Table PR/PO Alignment Summary

**6-column MRF Records table with inline PR-PO pairing — each PR badge, its matching PO link, and Procurement Status dropdown appear on the same horizontal row in a single merged cell**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-04T03:17:00Z
- **Completed:** 2026-03-04T03:32:42Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced the 8-column table (MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions) with a 6-column table (MRF ID, Project, Date Needed, PRs / POs, MRF Status, Actions)
- Built posByPrId index keyed by po.pr_id so each PR in prDataArray can find its matched PO(s) in O(1)
- Each pair-row in the merged cell renders: PR badge (clickable, opens PR modal) → arrow → PO link + SUBCON badge (if applicable) + status dropdown — all on one flex row
- PRs with no PO show a null slot ("— no PO") in the same position, keeping column alignment consistent
- Status dropdowns still call window.updatePOStatus() with the same arguments; no breakage to Firestore write path
- Added pr_id field to poDataArray push (was missing — critical for the index to work)

## Task Commits

1. **Task 1: Refactor renderPRPORecords() to paired PR/PO rows with inline status dropdowns** - `0d01589` (feat)

**Plan metadata:** _(to be added below)_

## Files Created/Modified
- `app/views/procurement.js` - renderPRPORecords() refactored: posByPrId index, prPoHtml builder, 6-column thead, 6-cell tr

## Decisions Made
- Added `pr_id: poData.pr_id` to the poDataArray push — the field was present in Firestore but not being captured in the local array, which would have broken the posByPrId index silently
- Kept `mrf._procurement_status` sort field computation unchanged so the existing `sortPRPORecords('procurement_status')` feature continues to work even without a visible column header for it
- Removed the `prHtml`, `poHtml`, `poStatusHtml`, `poTimelineHtml` variable declarations that were no longer used — left `prHtml` declared (but unused) to minimize diff footprint; it causes no errors in this zero-build project

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing pr_id field to poDataArray**
- **Found during:** Task 1 (building posByPrId index)
- **Issue:** The plan required indexing POs by pr_id, but the poDataArray.push() call only stored docId, po_id, procurement_status, is_subcon, supplier_name — not pr_id. The index would have silently keyed everything to '_unlinked', causing all PRs to show the null slot even when POs existed.
- **Fix:** Added `pr_id: poData.pr_id` to the poDataArray.push() object
- **Files modified:** app/views/procurement.js
- **Verification:** Field is now available for the posByPrId index
- **Committed in:** 0d01589 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** The missing field would have produced incorrect output (all PRs showing null slots). Auto-fix was essential for correctness.

## Issues Encountered
None beyond the missing pr_id field documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MRF Records table now shows PR/PO alignment correctly for procurement staff
- Phase 54 Plan 02 complete; Phase 54 may have additional plans or proceed to Phase 55

---
*Phase: 54-mrf-table-pr-po-alignment*
*Completed: 2026-03-04*
