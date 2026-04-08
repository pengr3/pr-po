---
phase: 260408-g2n
plan: 01
type: quick-task
subsystem: finance
tags: [void-payment, payables-tab, record-payment-modal, finance-ui]
dependency_graph:
  requires: []
  provides: [void-payment-ui-entry-point]
  affects: [finance.js/openRecordPaymentModal, finance.js/renderRFPTable, finance.js/renderPOSummaryTable]
tech_stack:
  added: []
  patterns: [modal-enhancement, conditional-form-rendering]
key_files:
  modified:
    - app/views/finance.js
decisions:
  - Enhance existing openRecordPaymentModal rather than create a separate history modal — keeps the void entry point co-located with payment recording, fewer window functions, less surface area
  - Close modal on Void click so user sees fresh state via rfps onSnapshot re-render — acceptable UX because voiding is a low-frequency corrective action
  - isFullyPaid computed inline from activeRecords sum vs amount_requested — mirrors deriveRFPStatus logic without importing/calling that function inside the modal builder
  - Manage Payments button shown at all times for Fully Paid RFPs so users can access the void flow without having to change the status filter first
metrics:
  duration_minutes: ~30
  completed_date: "2026-04-08"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Quick Task 260408-g2n: Restore Missing Void Button — Summary

**One-liner:** Restored Void button entry point inside Record Payment modal via an "Existing Payments" section, plus "Manage Payments" button for Fully Paid RFPs — no flat-table structural changes.

## Background

In Phase 65.1 (commit 468752d), the expandable payment history sub-table was removed per constraint D-02 (flat RFP list only). The `voidPaymentRecord` function and its `window.voidPaymentRecord` registration survived intact but the only UI trigger (the expandable sub-table row's Void button) was gone. Finance users had no way to void a mis-recorded payment without direct Firestore editing.

## What Changed

### File: `app/views/finance.js`

**Function modified: `openRecordPaymentModal` (line 275)**

Added logic before the `modalHtml` template literal:

1. Read `rfp.payment_records`, filter to `status !== 'voided'` to get `activeRecords`.
2. If `activeRecords.length > 0`: build `existingPaymentsHtml` — a separator-bordered section with header "Existing Payments (N)" and one row per active record showing date, formatted amount, reference, and a danger-styled Void button that calls `window.voidPaymentRecord(rfpDocId, paymentId)` and then removes the modal.
3. If `activeRecords.length === 0`: `existingPaymentsHtml = ''` — modal renders identically to pre-change version.
4. Compute `isFullyPaid` from `activeRecords` sum vs `rfp.amount_requested`.
5. If `isFullyPaid`: replace the Amount/Date/Reference inputs + green Record Payment footer with a note ("This RFP is fully paid. You can void...") and a single "Close" button.
6. If not fully paid: keep existing form + "Discard Payment" / "Record Payment" footer exactly as-is.

**Function modified: `renderRFPTable` (line ~590)**

Changed the `recordPaymentBtn` ternary:
- Previously: only rendered button when `status !== 'Fully Paid'`
- Now: always renders a button for users with edit access; Fully Paid gets grey outline "Manage Payments" button, all others keep the green primary "Record Payment" button.

**Function modified: `renderPOSummaryTable` sub-rows (debug fix — commit `3e64cc0`)**

The same "Manage Payments" pattern was missing from Table 2 (PO Payment Summary) sub-rows. RFP sub-rows inside `renderPOSummaryTable` still showed no action button for Fully Paid RFPs, preventing access to the void flow from that table. Applied the identical ternary: Fully Paid sub-rows now show a grey outline "Manage Payments" button; others retain "Record Payment".

**No other functions were touched.** `voidPaymentRecord`, `submitPaymentRecord`, and all filter/sort/pagination logic are unchanged.

## Why This Approach

Enhancing the existing modal is lower-risk than creating a separate "Payment History" modal:
- Reuses existing `window.voidPaymentRecord` as-is (zero changes to the void Firestore logic)
- Zero new window functions needed
- Zero new modal IDs to manage
- Users find the void flow naturally at the same place they'd record payments

## D-02 Compliance

The flat RFP table structure is preserved:
- `colspan="11"` empty-state cell unchanged (verified via grep)
- No new columns added to the table header or data rows
- No chevron elements or expand/collapse rows
- The only table change is the action cell content for Fully Paid rows (button label and style only)

## Verification Checks

```
grep -n "Existing Payments" app/views/finance.js
```
Returns 2 lines: one inline comment (`// Build "Existing Payments" section`) and one HTML label (`Existing Payments (${activeRecords.length})`). The HTML label is the single rendered header. Correct.

```
grep -n "voidPaymentRecord" app/views/finance.js
```
Returns 4 lines:
- Line 263: `window.voidPaymentRecord = voidPaymentRecord;` (registration)
- Line 313: `onclick="window.voidPaymentRecord(...)` (new Void button in modal)
- Line 435: `async function voidPaymentRecord(...)` (function definition)
- Line 2582: `delete window.voidPaymentRecord;` (destroy cleanup)

```
grep -n "Manage Payments" app/views/finance.js
```
Returns 2 lines: the Fully Paid action button in `renderRFPTable` (Table 1) and the equivalent button in `renderPOSummaryTable` sub-rows (Table 2) added in the debug fix.

## Commits

- `21a682c` — `fix(260408-g2n-01): restore Void button UI in Record Payment modal` — enhanced `openRecordPaymentModal` with Existing Payments section and Void buttons; added "Manage Payments" button for Fully Paid RFPs in `renderRFPTable` (Table 1).
- `3e64cc0` — debug fix: applied same "Manage Payments" button to `renderPOSummaryTable` sub-rows (Table 2) — missed in Task 1 because the plan's scope only referenced `renderRFPTable`.

## UAT Results

Task 2 (browser UAT) completed and approved by Finance user. All five cases verified:

| Case | Description | Result |
|------|-------------|--------|
| A | Pending RFP with zero payments — modal identical to pre-change | Passed |
| B | Partially Paid RFP — "Existing Payments (1)" section visible above form | Passed |
| C | Void a payment — toast shown, modal closes, table recomputes (Total Paid, Balance, badge) | Passed |
| D | Fully Paid RFP — "Manage Payments" outline button; modal shows payments only, no input form | Passed |
| E | D-02 preservation — no new columns, no chevrons, no expand rows in DevTools | Passed |

Zero JS console errors across all cases.

## Deviations from Plan

**[Rule 1 - Bug] Applied "Manage Payments" button to renderPOSummaryTable (Table 2) sub-rows**
- Found during: post-Task-1 debug review
- Issue: Plan only specified adding the button to `renderRFPTable` (Table 1). `renderPOSummaryTable` sub-rows (Table 2) still showed no action for Fully Paid RFPs, leaving the void path inaccessible from that table.
- Fix: Applied the identical Fully Paid / non-Fully-Paid ternary to Table 2 sub-row action cells.
- Files modified: `app/views/finance.js`
- Commit: `3e64cc0`

## Known Stubs

None — no placeholder data or hardcoded empty values introduced.

## Self-Check: PASSED

- `app/views/finance.js` modified and committed at `21a682c` and `3e64cc0`
- Both commits verified in git log
- Grep checks confirm correct occurrence counts for "Existing Payments", "voidPaymentRecord", and "Manage Payments"
- UAT approved by Finance user — all 5 cases passed, zero JS errors
