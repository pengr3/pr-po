---
status: complete
phase: 22-bug-fixes-and-ux-improvements
source: 22-01-SUMMARY.md, 22-02-SUMMARY.md, 22-03-SUMMARY.md
started: 2026-02-10
updated: 2026-02-10
---

## Current Test

[testing complete]

## Tests

### 1. PO Date Rendering in Finance
expected: Go to Finance > Purchase Orders tab. The "PO Issued Date" column shows valid formatted dates for all POs. No "Invalid Date" entries.
result: pass

### 2. PO Document Blank Fields (Finance)
expected: In Finance > Purchase Orders, click "View PO" on a PO where procurement has NOT filled in payment terms, condition, or delivery date. The generated PO document should show blank/empty fields for those three items — not "As per agreement", "Standard terms apply", or "TBD".
result: pass

### 3. PO Document Blank Fields (Procurement)
expected: In Procurement > PO Tracking, view a PO document where payment terms, condition, or delivery date were not filled. Same as Finance — those fields should be blank, not showing hardcoded defaults.
result: pass

### 4. No Firestore Permission Errors for Procurement Users
expected: Log in as a procurement user (not super_admin). Navigate to the Projects tab. The page should load normally with project list visible. Open browser DevTools console — no "permission-denied" errors from Firestore should appear.
result: pass

### 5. Delivery Fee Included in PO Total
expected: In Procurement > PO Tracking, mark a PO as "Delivered" and enter a delivery fee (e.g., 500). After saving, the PO's total amount should now include the delivery fee added to the original amount.
result: issue
reported: "The expense is reflected in the total but when opening the expense breakdown it is not there. Delivery fees should enter the Transport Fees category."
severity: major

### 6. Delivery Fee in Project Expense Totals
expected: After adding a delivery fee to a PO (test 5), go to Finance > Project List and refresh. The project's "Total Expense" should reflect the delivery fee — it should be higher than before by the delivery fee amount.
result: issue
reported: "In finance it is accounted as material purchases. Delivery fees are lumped into Material Purchases (PO total_amount) instead of showing under Transport Fees category."
severity: major

### 7. Finance Project List — Sortable Headers
expected: In Finance > Project List tab, click a column header (e.g., "Total Expense"). Rows should sort by that column ascending. Click the same header again — rows sort descending. A blue arrow indicator shows next to the active sort column. Other columns show a gray double-arrow.
result: pass

### 8. Finance Purchase Orders — Sortable Headers
expected: In Finance > Purchase Orders tab, click a column header (e.g., "Supplier"). Rows sort by that column. Click again to reverse. Sort indicators update. Default sort is by Date Issued (newest first). After a real-time update (e.g., another user changes a PO), your sort selection is preserved.
result: pass

### 9. Clients — Sortable Headers
expected: Go to the Clients tab. Click "Company Name" header — rows sort alphabetically. Click again to reverse. Click "Client Code" — sorts by code. Sort indicators (blue active, gray inactive) update correctly. If there are multiple pages, sorting resets to page 1.
result: pass

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Delivery fees appear in expense breakdown under Transport Fees category"
  status: failed
  reason: "User reported: delivery fees added to PO total_amount are lumped into Material Purchases. Should appear under Transport Fees in both project-detail breakdown modal and Finance expense breakdown modal."
  severity: major
  test: 5, 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
