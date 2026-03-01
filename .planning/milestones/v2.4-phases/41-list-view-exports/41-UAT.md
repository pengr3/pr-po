---
status: complete
phase: 41-list-view-exports
source: 41-01-SUMMARY.md, 41-02-SUMMARY.md, 41-03-SUMMARY.md
started: 2026-02-27T09:30:00Z
updated: 2026-02-27T09:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Projects List — Export CSV button
expected: Open the Projects tab. An "Export CSV" button is visible next to the "Add Project" button. Clicking it downloads a file named projects-YYYY-MM-DD.csv with columns: Code, Name, Client, Internal Status, Project Status, Active.
result: pass

### 2. Projects List — Export respects filters
expected: Apply a status filter or search on the Projects list, then click Export CSV. The downloaded file should contain only the filtered rows (not the full unfiltered list).
result: pass

### 3. Services List — Export CSV button
expected: Open the Services tab. An "Export CSV" button is visible in the header. Clicking it downloads a file named services-YYYY-MM-DD.csv with the same column schema as Projects.
result: pass

### 4. My Requests — Export CSV button
expected: Open Material Request view → My Requests tab. An "Export CSV" button is visible in the card header. Clicking it downloads mrf-list-YYYY-MM-DD.csv with columns: MRF ID, Type, Project/Service, Requestor, Date Needed, Urgency, Status.
result: pass

### 5. Finance Purchase Orders — Export CSV button
expected: Open Finance view → Purchase Orders tab. An "Export CSV" button is visible in the card header. Clicking it downloads purchase-orders-YYYY-MM-DD.csv with columns: PO ID, PR ID, Supplier, Project/Service, Amount (PHP), Date Issued, Status. Exports all dept-filtered POs, not just the current page.
result: pass

### 6. Procurement MRF Records — Export MRF CSV button
expected: Open Procurement → MRF Records tab. An "Export MRF CSV" button is visible in the card header. Clicking it downloads a CSV with 12 columns including MRF ID, PR IDs, Suppliers, PR Total, PO IDs, PO Status for each filtered MRF.
result: pass

### 7. Procurement MRF Records — Export PO CSV button
expected: In the same MRF Records card header area, an "Export PO CSV" button is also visible. Clicking it downloads a 7-column CSV of PO tracking data: PO ID, Type, Supplier, Project/Service, Amount (PHP), Date Issued, Status. Respects the active dept filter.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
