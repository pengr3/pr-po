---
status: complete
phase: 38-code-quality-dry-cleanup
source: [38-01-SUMMARY.md, 38-02-SUMMARY.md]
started: 2026-02-24T04:15:00Z
updated: 2026-02-24T04:28:00Z
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

### 4. PO Tracking scoreboard — global totals with department filter
expected: On PO Tracking, switch the department filter to "Services" (or "Projects"). The scoreboard numbers at the top should remain exactly the same as Test 3 — only the table rows below should filter. Switch back to "All" — still the same numbers.
result: issue
reported: "procurement.js:3735 Uncaught TypeError: Cannot set properties of null (setting 'innerHTML') at renderPOTrackingTable (procurement.js:3735:25) at applyPODeptFilter (procurement.js:46:5) — error fires when changing dropdown to Projects and also when changing to Services"
severity: blocker

### 5. Section header reads "MRF Records"
expected: On Procurement > MRF Records tab, the section header should read "MRF Records" (not "PR-PO Records" or anything else).
result: pass

## Summary

total: 5
passed: 3
issues: 1
pending: 0
skipped: 1

## Gaps

- truth: "PO Tracking scoreboard remains stable and no errors when changing department filter dropdown"
  status: failed
  reason: "User reported: procurement.js:3735 Uncaught TypeError: Cannot set properties of null (setting 'innerHTML') at renderPOTrackingTable (procurement.js:3735:25) at applyPODeptFilter (procurement.js:46:5) — error fires when changing dropdown to Projects and also when changing to Services"
  severity: blocker
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
