---
phase: 71-revamp-expense-modal-into-financials-modal
plan: 02
subsystem: expense-modal
tags: [payables-tab, financial-breakdown, rfp-status, sorting, read-only]
dependency_graph:
  requires:
    - "71-01 (Financial Breakdown rename)"
    - "Phase 65.3 (active-tranche derivation format)"
    - "Phase 65.9 (Delivery Fee RFP model)"
    - "Phase 69.1 (non-voided payment filter)"
  provides:
    - "Payables tab with 4-column worklist in Financial Breakdown modal"
  affects:
    - "app/expense-modal.js (modal shared by procurement.js and finance.js)"
tech_stack:
  added: []
  patterns:
    - "Active-tranche status derivation ported inline (avoids circular import from finance.js)"
    - "Map-based RFP grouping for O(1) per-payable lookup"
    - "bucketOrder sort — D-06/D-07 combined comparator"
key_files:
  created: []
  modified:
    - path: "app/expense-modal.js"
      description: "Added Payables tab button, container, switch handler extension, three derivation helpers, row construction, sort, and card render"
decisions:
  - "Imported escapeHTML from utils.js (it is exported there) rather than inlining a local escape helper"
  - "deriveStatusForPO/TR/DeliveryFee defined as nested functions inside showExpenseBreakdownModal to avoid circular imports from finance.js (per plan critical note)"
  - "poTotalForRow = total_amount - delivery_fee to exclude delivery fee from PO row amount (delivery fee is its own separate row per D-01)"
  - "Only Approved TRs pushed to payablesTRs — consistent with the existing transportRequests filter in the same function"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 1
---

# Phase 71 Plan 02: Add Payables Tab to Financial Breakdown Modal — Summary

**One-liner:** Payables tab added to Financial Breakdown modal — single collapsible card with PARTICULARS/STATUS/TOTAL PAYABLE/TOTAL PAID sorted action-first (Not Requested → Requested → Partial → Fully Paid).

## What Was Built

Added a third "Payables" tab to the existing Financial Breakdown modal (`app/expense-modal.js`). The tab shows a read-only worklist of every payable entity associated with the project/service:

- One row per PO (multi-tranche POs collapse to one row showing the currently active tranche status)
- One row per Delivery Fee (where `delivery_fee > 0` on the PO)
- One row per Approved TR

### Status Values

| Status | Color | Meaning |
|--------|-------|---------|
| Not Requested | Red (#991b1b) | No RFP filed yet |
| Requested | Blue (#1d4ed8) | RFP exists, no payments recorded |
| `{TrancheLabel} — NN% Paid` | Blue (#1d4ed8) | Partial payment (Phase 65.3 format) |
| Fully Paid | Green (#166534) | totalPaid >= totalPayable |

### Sort Order

1. Primary: `Not Requested` (0) → `Requested` (1) → `Partial` (2) → `Fully Paid` (3)
2. Secondary: Total Payable descending within each bucket

### Visual Parity

- Reuses `.category-card collapsible`, `.category-items`, `.modal-items-table`, `.category-toggle` CSS classes
- Card header wires to existing `window._toggleExpenseCategory` toggle handler
- Tab button reuses `.expense-tab` CSS class

## Tasks Completed

### Task 1 — Tab button, container, switch handler extension (commit `b0355f6`)

- Added third tab button `data-tab="payables"` after Transport Fees in the tab nav
- Added `<div id="expBreakdownPayablesTab">` container in modal body
- Extended `window._switchExpenseBreakdownTab` to handle `'payables'` key, including the guard `!payablesTab`
- Added `escapeHTML` to the import line from `./utils.js`

### Task 2 — Row derivation, sort, render (commit `c6e8d32`)

- Added `payablesPOs` and `payablesTRs` accumulators before the iteration loops
- Pushed raw PO data inside the existing `posSnapshot.forEach` block (after `fee` is computed)
- Pushed raw TR data inside the existing `trsSnapshot.forEach` block, inside the `finance_status === 'Approved'` gate
- Added `deriveStatusForPO` (ported from `app/views/finance.js:685` `derivePOSummary`, Phase 65.3)
- Added `deriveStatusForTR` (single-shot derivation for TRs)
- Added `deriveStatusForDeliveryFee` (3-state subset per D-04: Not Requested / Requested / Fully Paid)
- Grouped `rfpsForPayable` into three Maps: `rfpsByPoId`, `rfpsByTrId`, `deliveryFeeRfpsByPoId`
- Built `payablesRows` array with one entry per PO (poTotalForRow > 0), per Delivery Fee (delivery_fee > 0), per Approved TR
- Sorted with `bucketOrder` map (D-06) then Total Payable descending (D-07)
- Built `payablesHTML` — single collapsible `.category-card` with 4-column `.modal-items-table`
- Updated `${payablesHTML}` in the Payables tab container (removed `|| ''` fallback)

## Decisions Made

1. **escapeHTML source:** Imported from `./utils.js` (it is exported there as `export function escapeHTML`). No inline helper needed.
2. **Derivation helpers scope:** Defined as nested `function` declarations inside `showExpenseBreakdownModal`, not as module-level helpers. This avoids any circular import risk (view modules must not be imported by the modal module).
3. **PO total for row:** `poTotalForRow = po.total_amount - po.delivery_fee`. The PO row's Total Payable excludes the delivery fee, which gets its own separate row.
4. **TR filter gate:** Only Approved TRs are included in `payablesTRs`, consistent with the existing `transportRequests` filter in the same function.

## Deviations from Plan

None — plan executed exactly as written. All 10 decisions from CONTEXT.md honored:
- D-01: One row per entity (PO, TR, Delivery Fee) ✓
- D-02/D-03: Four status values, active-tranche derivation ✓
- D-04: Delivery Fee 3-state subset ✓
- D-05: Non-voided payment filter in every helper ✓
- D-06: bucketOrder sort (Not Requested first) ✓
- D-07: Secondary sort Total Payable descending ✓
- D-08: No onclick/oncontextmenu on rows ✓
- D-09: Internal symbols preserved (Plan 01 rename preserved) ✓
- D-10: Reuses .category-card, .modal-items-table, _toggleExpenseCategory ✓

## Known Stubs

None. All derivation logic is fully wired to real Firestore data already loaded by `showExpenseBreakdownModal`.

## Self-Check: PASSED

- `app/expense-modal.js` exists and modified: FOUND
- Task 1 commit b0355f6: FOUND
- Task 2 commit c6e8d32: FOUND
- `data-tab="payables"`: 1 occurrence ✓
- `expBreakdownPayablesTab`: 2 occurrences ✓
- `PARTICULARS`: 1 occurrence ✓
- `TOTAL PAYABLE`: 1 occurrence ✓
- `TOTAL PAID`: 1 occurrence ✓
- `tab === 'payables'`: 1 occurrence ✓
- `deriveStatusForPO`: 2 occurrences ✓
- `Financial Breakdown:`: 1 occurrence (Plan 01 rename preserved) ✓
- `status !== 'voided'`: 6 occurrences ✓
- No `onclick=` or `oncontextmenu=` in payablesRows.map block ✓
- Brace balance: 0 (balanced) ✓
