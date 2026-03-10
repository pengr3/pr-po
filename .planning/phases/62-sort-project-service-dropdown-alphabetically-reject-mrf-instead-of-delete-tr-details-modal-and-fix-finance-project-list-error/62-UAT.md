---
status: passed
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
source: [62-01-SUMMARY.md, 62-02-SUMMARY.md, 62-03-SUMMARY.md, 62-04-SUMMARY.md]
started: 2026-03-09T08:50:00Z
updated: 2026-03-10T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete — all gaps closed]

## Tests

### 1. Alphabetical Sort — MRF Form Dropdowns
expected: Open the standalone MRF submission form. The Project/Service dropdown should list all projects and services in A-Z alphabetical order by name.
result: pass

### 2. Alphabetical Sort — Procurement Create MRF Dropdowns
expected: In Procurement > MRF Processing, open the Create MRF panel. The Project/Service dropdown should list all projects and services in A-Z alphabetical order by name.
result: pass

### 3. Finance Project List — Active + Inactive Sort
expected: Go to Finance > Project List tab. Active projects appear first (A-Z), inactive projects at the end (A-Z). Both are visible so Finance can access inactive project data.
result: pass (after gap fix)
note: "Original test expected active-only. User corrected: inactive projects should appear at end of list. Fixed in 62-03."

### 4. Reject MRF Button Replaces Delete MRF
expected: In Procurement > MRF Processing, select an approved MRF. The action button should say "Reject MRF" (not "Delete MRF"). Clicking it should show a confirmation prompt asking for a rejection reason.
result: pass

### 5. Soft-Reject Preserves MRF
expected: After rejecting an MRF via the Reject MRF button, the MRF should remain visible in the MRF Records list with status "Rejected" — it should NOT disappear or be deleted.
result: pass

### 6. TR Badge Clickable in Procurement MRF Records
expected: In Procurement > MRF Records (or PR/PO tab showing TR rows), TR ID badges (e.g., TR-2026-001) should be clickable (cursor shows pointer). Clicking one opens a TR details modal showing: TR ID, MRF reference, supplier, finance status, total amount, items table, and rejection reason if applicable.
result: pass

### 7. TR Badge Clickable in My Requests
expected: In My Requests view, any MRF that has a TR linked should show the TR ID badge as clickable. Clicking it opens a TR details modal with the same information (TR ID, MRF ref, supplier, finance status, total amount, items).
result: pass

## Gap Re-tests

### Gap 1: Finance Project List — Active + Inactive Sort
expected: Active projects first (A-Z), inactive projects at end (A-Z), both visible.
result: pass

### Gap 2: Delete Rejected TRs
expected: Red "Delete TR" button on rejected TR cards, confirm dialog, TR removed on confirm.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Finance Project List shows all projects — active projects first, inactive projects at the end"
  status: closed
  reason: "Fixed in 62-03. Active projects sorted A-Z first, inactive at end."
  severity: major
  test: 3

- truth: "Rejected TRs in Procurement MRF Processing can be soft-deleted or permanently removed by procurement"
  status: closed
  reason: "Fixed in 62-04. Delete TR button with confirm() guard added to list card and detail panel."
  severity: major
  test: 4

## Feature Requests (logged during UAT)

- "Add line item capability in rejected TRs so Procurement can adjust items before resubmitting to Finance"
  source: gap-test-2 feedback
  severity: enhancement
