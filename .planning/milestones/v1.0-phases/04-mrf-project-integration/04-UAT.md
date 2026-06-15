---
status: complete
phase: 04-mrf-project-integration
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md
started: 2026-01-30T14:00:00Z
updated: 2026-01-30T14:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Navigate to MRF submission form
expected: Click "Procurement" in top navigation, then "MRF Submission" or navigate to #/mrf. Page loads showing "Material Request Form" with all fields including Project dropdown.
result: pass

### 2. Project dropdown shows correct format
expected: Open Project dropdown. Each option displays format "CLMC_CODE_YYYY### - Project Name" (e.g., "CLMC_ABC_2026001 - Office Renovation"). Code appears before name with hyphen separator.
result: pass

### 3. Only active projects in dropdown
expected: Only projects with active status appear in dropdown. If you have any inactive projects, they should not appear in the MRF form project dropdown.
result: pass

### 4. Projects sorted by most recent first
expected: Dropdown shows most recently created projects at the top. Latest project appears first in list.
result: pass

### 5. Submit MRF with project selected
expected: Select a project from dropdown, fill in other required fields, add at least one item. Click submit. Success toast appears. MRF is created in the system.
result: pass

### 6. MRF list shows project in CODE - Name format
expected: Navigate to Procurement > MRF Management tab. In the MRF list table, each row should display the project in "CODE - Name" format (e.g., "CLMC_ABC_2026001 - Office Renovation").
result: pass

### 7. MRF details shows project information
expected: Click on an MRF to view details. The MRF details panel should display the complete project information showing both code and name.
result: pass

### 8. Legacy MRF displays gracefully
expected: If you have any old MRFs created before project_code field was added, they should display with just the project name (no code prefix). No errors or "undefined" text should appear.
result: pass

### 9. Generate PR from MRF with project
expected: Select an MRF with a project assigned. Click "Generate PR" button. In the generated PR, project information should be included showing "CODE - Name" format.
result: pass

### 10. PR list displays project information
expected: Navigate to Finance > Pending Approvals tab. PR list should display project information in "CODE - Name" format for each PR that has an associated project.
result: pass

### 11. Generate PO from approved PR
expected: Approve a PR in Finance view. Generate a PO from it. The PO should inherit the project information from the PR, displaying "CODE - Name" format.
result: pass

### 12. PO list displays project information
expected: Navigate to Finance > Purchase Orders tab. PO list should display project information in "CODE - Name" format for each PO.
result: pass

### 13. Project dropdown in MRF edit (procurement view)
expected: In Procurement > MRF Management, click Edit on an MRF. The project dropdown should appear and be sorted by created_at descending (most recent first), same as the MRF submission form.
result: pass

### 14. Consistent dropdown sorting across views
expected: Compare project dropdown order in MRF submission form (#/mrf) and MRF edit form (Procurement > MRF Management > Edit). Both should show projects in the same order (most recent first).
result: pass

## Summary

total: 14
passed: 14
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
