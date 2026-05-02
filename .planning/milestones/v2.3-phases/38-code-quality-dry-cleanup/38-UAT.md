---
status: complete
phase: 38-code-quality-dry-cleanup
source: [38-01-SUMMARY.md, 38-02-SUMMARY.md]
started: 2026-02-24T04:15:00Z
updated: 2026-02-24T04:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Department badges on Finance view
expected: Navigate to Finance > Pending Approvals. Each PR/TR row should show a department badge — purple "Services" or blue "Projects" — rendering correctly with no errors in the console.
result: pass

### 2. Department badges on Procurement view
expected: Navigate to Procurement > MRF Records. Each MRF row should show a department badge and a project/service label. No console errors.
result: skipped
reason: Test description inaccurate — MRF Records tab uses department dropdown filter, not per-row badges. Project column labels from getMRFLabel() render correctly.

### 3. PO Tracking scoreboard — global totals without filter
expected: Navigate to Procurement > PO Tracking. Note the scoreboard numbers (Materials/Subcon counts by status). These are baseline numbers with "All Departments" selected.
result: pass

### 4. PO Tracking scoreboard — department filter controls both scoreboards and table
expected: On MRF Records, switch the department filter dropdown. Scoreboards should update to show only that department's PO counts. MRF Records table should filter to show only that department's MRFs. Both update in sync.
result: pass
note: Fixed during UAT — 3 commits (null guard, filter both, load PO data on records tab)

### 5. Section header reads "MRF Records"
expected: On Procurement > MRF Records tab, the section header should read "MRF Records" (not "PR-PO Records" or anything else).
result: pass

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1

## Gaps

[none — all issues resolved during UAT]
