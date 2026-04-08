---
phase: 260408-g2n
plan: 01
type: quick-task
subsystem: finance
tags: [void-payment, payables-tab, record-payment-modal, finance-ui]
dependency_graph:
  requires: []
  provides: [void-payment-ui-entry-point]
  affects: [finance.js/openRecordPaymentModal, finance.js/renderRFPTable]
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
  duration_minutes: 8
  completed_date: "2026-04-08"
  tasks_completed: 1
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
Returns exactly 1 line (line 628): the Fully Paid action button in `renderRFPTable`.

## Task 1 Commit

- `21a682c` — `fix(260408-g2n-01): restore Void button UI in Record Payment modal`
  - `app/views/finance.js` — 58 insertions, 20 deletions

## UAT Status

Task 2 (browser UAT) is a `checkpoint:human-verify` — awaiting manual verification of cases A-E (see PLAN.md Task 2 for full test script).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or hardcoded empty values introduced.

## Self-Check: PASSED

- `app/views/finance.js` modified and committed at `21a682c`
- Commit verified: present in git log
- Grep checks confirm correct occurrence counts for "Existing Payments", "voidPaymentRecord", and "Manage Payments"
