---
phase: 68-fix-expense-breakdown-modal-remove-document-count-from-scoreboard-and-show-line-items-instead-of-po-id
plan: 01
subsystem: ui
tags: [expense-modal, javascript, firestore]

requires: []
provides:
  - Expense breakdown modal Total Cost card shows amount only with no document count subtitle
  - Category item tables show Item/Qty/Unit/Unit Cost/Subtotal columns instead of PO ID first
  - Transportation & Hauling table shows same item-focused columns instead of PO ID first
  - Delivery Fees table shows Supplier column instead of PO ID column
affects: [expense-modal, project-detail, service-detail, finance]

tech-stack:
  added: []
  patterns:
    - "Display line item details (item name, qty, unit) in expense tables — not document IDs (PO IDs)"

key-files:
  created: []
  modified:
    - app/expense-modal.js

key-decisions:
  - "PO ID excluded from display tables only — CSV export retains PO ID, date, supplier for spreadsheet analysis"
  - "Qty and Unit split into separate columns (from combined 'Qty Unit' cell) for cleaner tabular alignment"
  - "Delivery Fees table uses supplier field already present on deliveryFeeItems — no data model change needed"

patterns-established:
  - "Expense breakdown tables prioritize what was purchased (item name) over procurement document reference (PO ID)"

requirements-completed:
  - EXPMOD-01
  - EXPMOD-02

duration: 5min
completed: 2026-03-25
---

# Phase 68 Plan 01: Expense Breakdown Modal Cleanup Summary

**Removed misleading document count from Total Cost scoreboard and replaced PO ID columns with item name and unit details across all expense breakdown tables**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T02:40:00Z
- **Completed:** 2026-03-25T02:40:33Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Total Cost scoreboard card now shows only the peso amount — no "N documents" subtitle
- By Category tab tables now show Item | Qty | Unit | Unit Cost | Subtotal (no PO ID column)
- Transportation & Hauling table now shows the same item-focused column layout
- Delivery Fees table now shows Supplier | Amount (no PO ID column)
- CSV export and Transport Requests (TR ID / Supplier / Amount) section are unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove document count from Total Cost and replace PO ID columns with line item details** - `bfb8564` (fix)

**Plan metadata:** (docs commit — follows below)

## Files Created/Modified
- `app/expense-modal.js` - Removed document count div, updated four table headers and row templates

## Decisions Made
- PO ID is excluded from the modal display tables only. The CSV export retains PO ID along with date and supplier because spreadsheet users benefit from the document reference for reconciliation.
- Qty and Unit are now in separate `<td>` columns rather than a combined "3 pcs" cell, providing cleaner tabular alignment.
- The `supplier` field was already collected on `deliveryFeeItems` at data collection time (line 73), so the Delivery Fees table change required no data model modifications.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 68 complete. Expense breakdown modal is clean and user-friendly.
- No blockers for next work item.

---
*Phase: 68-fix-expense-breakdown-modal-remove-document-count-from-scoreboard-and-show-line-items-instead-of-po-id*
*Completed: 2026-03-25*
