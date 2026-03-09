---
status: complete
phase: 62-sort-project-service-dropdown-alphabetically-reject-mrf-instead-of-delete-tr-details-modal-and-fix-finance-project-list-error
source: [62-01-SUMMARY.md, 62-02-SUMMARY.md]
started: 2026-03-09T08:50:00Z
updated: 2026-03-09T08:50:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Alphabetical Sort — MRF Form Dropdowns
expected: Open the standalone MRF submission form. The Project/Service dropdown should list all projects and services in A-Z alphabetical order by name.
result: pass

### 2. Alphabetical Sort — Procurement Create MRF Dropdowns
expected: In Procurement > MRF Processing, open the Create MRF panel. The Project/Service dropdown should list all projects and services in A-Z alphabetical order by name.
result: pass

### 3. Finance Project List — Active Projects Only
expected: Go to Finance > Project List tab. The expense table should only show active projects — no inactive/deactivated projects should appear in the list.
result: issue
reported: "deactivated projects shall appear still, but on the end of the list all of inactive projects, so finance have the capacity to see finance related stuff on inactive projects."
severity: major

### 4. Reject MRF Button Replaces Delete MRF
expected: In Procurement > MRF Processing, select an approved MRF. The action button should say "Reject MRF" (not "Delete MRF"). Clicking it should show a confirmation prompt asking for a rejection reason.
result: pass
note: "User observed related gap: Rejected TRs in Procurement MRF Processing have no way to reject or soft-delete them — only 'Resubmit to Finance' is available. Logged separately as Gap 2."

### 5. Soft-Reject Preserves MRF
expected: After rejecting an MRF via the Reject MRF button, the MRF should remain visible in the MRF Records list with status "Rejected" — it should NOT disappear or be deleted.
result: pass

### 6. TR Badge Clickable in Procurement MRF Records
expected: In Procurement > MRF Records (or PR/PO tab showing TR rows), TR ID badges (e.g., TR-2026-001) should be clickable (cursor shows pointer). Clicking one opens a TR details modal showing: TR ID, MRF reference, supplier, finance status, total amount, items table, and rejection reason if applicable.
result: pass

### 7. TR Badge Clickable in My Requests
expected: In My Requests view, any MRF that has a TR linked should show the TR ID badge as clickable. Clicking it opens a TR details modal with the same information (TR ID, MRF ref, supplier, finance status, total amount, items).
result: pass

## Summary

total: 7
passed: 6
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Finance Project List shows all projects — active projects first, inactive projects at the end"
  status: failed
  reason: "User reported: deactivated projects shall appear still, but on the end of the list all of inactive projects, so finance have the capacity to see finance related stuff on inactive projects."
  severity: major
  test: 3
  artifacts: []
  missing: []

- truth: "Rejected TRs in Procurement MRF Processing can be soft-deleted or permanently removed by procurement"
  status: failed
  reason: "User reported: for Rejected TRs there is no way to reject or soft delete TRs — only 'Resubmit to Finance' button is available on rejected TR cards"
  severity: major
  test: 4
  artifacts: []
  missing: []
