---
status: complete
phase: 65-rfp-payables-tracking
source: 65-01-SUMMARY.md, 65-02-SUMMARY.md, 65-03-SUMMARY.md, 65-04-SUMMARY.md
started: 2026-03-18T08:30:00Z
updated: 2026-03-18T09:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Tranche Builder in PO Edit Modal
expected: Open MRF Records, click a PO ID to open the PO Details modal. The Payment Terms section shows a structured tranche builder — rows with label + percentage inputs, Add Tranche / Remove buttons, running total turning green at 100% and red otherwise. Saving with total ≠ 100% shows an error toast and blocks the save.
result: pass

### 2. RFP Creation via Right-Click Context Menu
expected: In MRF Records, right-click a green PO ID link in the POs column. A small context menu appears with "Request Payment". Clicking it opens an RFP modal pre-filled with supplier, PO reference, department, and tranche selector. Selecting a tranche auto-fills the amount. Submitting creates an rfps document in Firestore and closes the modal.
result: pass

### 3. PO ID Payment Fill Colors
expected: After creating an RFP against a PO, the PO ID cell should show a colored background fill indicating payment progress: red fill when no RFPs exist, orange fill when RFPs exist but payment is partial, green fill when fully paid. Hovering the cell should show a tooltip with paid/balance/percentage details.
result: pass

### 4. Finance Payables Tab Loads
expected: Navigate to Finance view and click the Payables tab (or go to #/finance/payables). A table loads with all RFPs in real-time — columns include RFP ID, PO reference, supplier, department, amount requested, amount paid, balance, due date, status badge, and action buttons. Table updates automatically when new RFPs are created in another tab/window.
result: pass

### 5. RFP Status Badges
expected: The Payables table shows auto-derived status badges: Pending (no payments), Partially Paid (some payments but not full amount), Fully Paid (all paid), Overdue (unpaid/partial and past due date). A fully-paid RFP should show green "Fully Paid" even if its due date has passed.
result: issue
reported: "Table is sorted by RFP ID — each row is one RFP (one tranche). Should be sorted/grouped by PO Ref so all tranches under the same PO appear together."
severity: major

### 6. Overdue Row Highlighting
expected: An RFP with a past due date that is not fully paid should have a red-tinted row background (#fef2f2). Fully paid RFPs should not be highlighted even if overdue.
result: pass

### 7. Status and Department Filters
expected: The Payables tab has filter dropdowns for Status and Department. Selecting a status (e.g., "Pending") should instantly filter the table to show only matching rows without a page reload.
result: pass
reason: Works as built; will be revamped alongside the PO Ref grouping redesign.

### 8. Expandable Payment History
expected: Each RFP row has a chevron (▶) on the left. Clicking it expands the row to show payment history — individual payment records with date, method, reference, amount, and a Void button. Clicking again collapses it.
result: pass

### 9. Record Payment Modal
expected: In the Finance Payables tab, clicking the Record Payment button (or equivalent) for an RFP opens a modal. It shows the RFP ID in the title, a read-only amount field (pre-filled, not editable), a date input defaulting to today, a payment method dropdown (with an "Other" option that reveals a text field), and a reference number field. Submitting records the payment and the table refreshes automatically.
result: pass

### 10. Void Payment
expected: In an expanded payment history row, clicking Void on a payment record triggers a confirmation dialog. Confirming voids the record — it should remain visible in the history (for audit) but be excluded from the paid total, causing the status badge to revert (e.g., from Partially Paid back to Pending).
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Payables table should be sorted/grouped by PO Ref so all tranches under the same PO appear together"
  status: failed
  reason: "User reported: Table is sorted by RFP ID — each row is one RFP (one tranche). Should be sorted/grouped by PO Ref so all tranches under the same PO appear together."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
