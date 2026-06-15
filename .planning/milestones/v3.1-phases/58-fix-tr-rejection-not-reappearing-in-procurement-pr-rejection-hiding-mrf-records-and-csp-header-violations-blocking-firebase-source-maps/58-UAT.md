---
status: complete
phase: 58-fix-tr-rejection-not-reappearing-in-procurement-pr-rejection-hiding-mrf-records-and-csp-header-violations-blocking-firebase-source-maps
source: [58-01-SUMMARY.md, 58-02-SUMMARY.md]
started: 2026-03-05T04:30:00Z
updated: 2026-03-05T04:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TR Rejected MRF shows resubmit action buttons
expected: In Procurement Processing Area, select a TR Rejected MRF from the Pending MRFs list. The action buttons (Submit as TR or Generate PR & TR) should appear in the MRF details panel, allowing the procurement user to resubmit to Finance.
result: pass

### 2. MRF Records filter includes PR Rejected and TR Rejected options
expected: In the MRF Records tab, open the MRF Status filter dropdown. It should contain "PR Rejected" and "TR Rejected" as selectable filter options (in addition to the existing ones).
result: pass

### 3. TR Rejected MRFs appear in the Records table
expected: In the MRF Records tab with no filter applied (or with "TR Rejected" selected), MRFs that were rejected as TRs should appear as rows in the table — they should not be missing.
result: pass

### 4. No CSP console errors for gstatic.com
expected: Open the deployed production site in browser DevTools (Console tab). There should be NO errors about "Connecting to 'https://www.gstatic.com/firebasejs/...' violates Content Security Policy". The console should be clean of those specific CSP violations.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
