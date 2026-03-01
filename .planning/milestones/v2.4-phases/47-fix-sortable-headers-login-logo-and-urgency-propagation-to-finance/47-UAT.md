---
status: complete
phase: 47-fix-sortable-headers-login-logo-and-urgency-propagation-to-finance
source: 47-01-SUMMARY.md, 47-02-SUMMARY.md, 47-03-SUMMARY.md
started: 2026-02-28T16:00:00Z
updated: 2026-03-01T00:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Sort Material PRs by Column Header
expected: Navigate to Finance > Pending Approvals. Click a column header in the Material Purchase Requests table (e.g., "PR Number", "Total Cost", or "Urgency"). Rows reorder by that column. A blue arrow indicator appears on the clicked header. Other headers show a gray neutral arrow.
result: pass

### 2. Sort Transport Requests by Column Header
expected: On Finance > Pending Approvals, click a column header in the Transport Requests table (e.g., "TR Number" or "Total Cost"). Rows reorder by that column with a blue arrow on the active header and gray arrows on inactive headers.
result: pass

### 3. Toggle Sort Direction
expected: Click the same column header twice in either the Material PRs or Transport Requests table. First click sorts ascending (up arrow), second click sorts descending (down arrow). Rows reverse order on the second click.
result: pass

### 4. Login Page Shows Company Logo
expected: Navigate to the login page (log out if needed). The CLMC company logo image is displayed where the blue "CL" text placeholder used to be. The logo matches the one on the registration page.
result: pass

### 5. Urgency Badge on Newly Generated PRs
expected: Generate a new PR from an approved MRF that has an urgency level set (e.g., "High" or "Critical"). Navigate to Finance > Pending Approvals. The newly generated PR row shows the correct urgency badge matching the MRF's urgency level.
result: pass

### 6. Sort Persists After Real-Time Update
expected: On Finance > Pending Approvals, sort the Material PRs table by a column (e.g., "Total Cost"). Then trigger a data change (e.g., approve a PR in another tab or generate a new PR). After the table refreshes from the real-time update, the sort order and arrow indicator remain — rows are not reset to default order.
result: pass

### 7. Sort Persists Across Tab Switches
expected: On Finance > Pending Approvals, sort Material PRs by "Total Cost". Switch to Finance > Purchase Orders tab, then switch back to Pending Approvals. The Material PRs table retains the "Total Cost" sort with the blue arrow indicator and correct row order.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
