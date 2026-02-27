---
status: complete
phase: 42-detail-page-exports
source: 42-01-SUMMARY.md, expense-modal.js (session addition)
started: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Project detail — Export CSV button visible
expected: Navigate to a project detail page with POs. In the Financial Summary card, an "Export CSV ↡" button appears to the right of the "Financial Summary" heading.
result: pass

### 2. Project CSV download and filename
expected: Clicking Export CSV silently downloads a file named like `ProjectName-expenses-2026-02-27.csv` (spaces in project name become hyphens, no loading spinner or toast appears on success).
result: pass

### 3. Project CSV content
expected: Open the downloaded file. Header row is exactly: `DATE,CATEGORY,SUPPLIER/SUBCONTRACTOR,ITEMS,QTY,UNIT,UNIT COST,TOTAL COST,REQUESTED BY,REMARKS`. DATE values are YYYY-MM-DD, UNIT COST and TOTAL COST are plain numbers like `1500.00` (no ₱ symbol), REQUESTED BY shows the MRF requestor name, REMARKS column is blank.
result: pass

### 4. Service detail — Export CSV button visible
expected: Navigate to a service detail page with POs. Same "Export CSV ↡" button appears in the Financial Summary card header.
result: pass

### 5. Service CSV download and filename
expected: Clicking Export CSV downloads a file named like `ServiceName-expenses-2026-02-27.csv`. Same silent download, same column format.
result: pass

### 6. Disabled state — no POs
expected: Navigate to a project or service that has no POs. The Export CSV button is visible but grayed out (lower opacity) and cannot be clicked.
result: pass

### 7. Expense Breakdown Modal — Export CSV button visible
expected: Open the Expense Breakdown modal from any view (Finance view → click a project row, or Project/Service detail → click the expense amount). An "Export CSV ↡" button appears in the modal header, to the left of the × close button.
result: pass

### 8. Expense modal CSV download
expected: Clicking Export CSV in the modal downloads a file named `EntityName-expenses-2026-02-27.csv`. The CSV uses the same 10-column format. Rows include material line items (by category), transportation & hauling items, delivery fee entries, and transport requests. REMARKS is blank, REQUESTED BY is blank.
result: pass

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
