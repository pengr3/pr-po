---
status: complete
phase: 13-finance-dashboard-&-audit-trails
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md]
started: 2026-02-05T20:50:00Z
updated: 2026-02-05T21:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Finance Project List Tab Visibility
expected: Log in as a Finance user and navigate to the Finance view. You should see a "Project List" tab in the Finance navigation (alongside existing tabs like Pending Approvals, Purchase Orders, etc.).
result: issue
reported: "Error detected: webchannel_connection.ts:169 POST https://firestore.googleapis.com/v1/projects/clmc-procurement/databases/(default)/documents:runAggregationQuery 400 (Bad Request) logger.ts:209 [2026-02-05T17:25:51.516Z] @firebase/firestore: Firestore (10.7.1): RestConnection RPC 'RunAggregationQuery' 0x3611c05d failed with error: {\"code\":\"failed-precondition\",\"name\":\"FirebaseError\"} url: https://firestore.googleapis.com/v1/projects/clmc-procurement/databases/(default)/documents:runAggregationQuery request: {\"structuredAggregationQuery\":{\"aggregations\":[{\"alias\":\"aggregate_0\",\"sum\":{\"field\":{\"fieldPath\":\"total_amount\"}}},{\"alias\":\"aggregate_1\",\"count\":{}}],\"structuredQuery\":{\"from\":[{\"collectionId\":\"pos\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"project_name\"},\"op\":\"EQUAL\",\"value\":{\"stringValue\":\"TEST OFFICE RENOVATION\"}}}}}} finance.js:392 [Finance] Error loading project expenses: FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore..."
severity: major

### 2. Project Expense Dashboard
expected: Click the Project List tab. You should see a table displaying all projects with columns showing project name, total expenses (calculated from all POs), and PO count. Numbers should be formatted as currency.
result: issue
reported: "This is the only thing that appears on the UI, Loading project expenses... meaning project lists do not load."
severity: major

### 3. Manual Refresh Button
expected: In the Project List tab, you should see a "Refresh" button. Click it and observe a loading state or visual feedback indicating the dashboard is updating.
result: issue
reported: "when clicking refresh button nothing happens and this appears on the console: [Finance] 🔄 Refreshing project expenses... finance.js:350 [Finance] Found 6 projects finance.js:359 [Finance] Aggregating expenses for: TEST OFFICE RENOVATION webchannel_connection.ts:169 POST https://firestore.googleapis.com/v1/projects/clmc-procurement/databases/(default)/documents:runAggregationQuery 400 (Bad Request) ... finance.js:392 [Finance] Error loading project expenses: FirebaseError: The query requires an index."
severity: major

### 4. Project Expense Breakdown Modal
expected: Click on a project name in the Project List table. A modal should open showing that project's expenses broken down by category (e.g., Materials, Transport, Services) with amounts and percentages for each category.
result: skipped
reason: can't test without the project list loading

### 5. Close Expense Modal
expected: With the expense breakdown modal open, press the ESC key. The modal should close and return you to the Project List view.
result: skipped
reason: same reason - can't test without modal being openable

### 6. Clickable Supplier Names in PR-PO Records
expected: Navigate to Procurement view → PR-PO Records tab. In the table, supplier names should appear as clickable links (not just plain text).
result: issue
reported: "No you got this wrong, what i want to happen is in Procurement, Supplier Management Tab, every row corresponding to a certain supplier shall be clickable and all previous expenses from that supplier shall be seen with a total year spend information something like that. Not in PR-PO records tab because there is no supplier there in the first place"
severity: major

### 7. Supplier Purchase History Modal
expected: Click on a supplier name in the PR-PO Records table. A modal should open showing that supplier's purchase history including total purchases amount, PO count, and a detailed table of all POs from that supplier (PO ID, Project, Date, Amount, Status).
result: skipped
reason: same issue - wrong location, should be in Supplier Management tab

### 8. Close Supplier History Modal
expected: With the supplier purchase history modal open, click the Close button or press ESC. The modal should close.
result: skipped
reason: can't test - modal can't be opened due to feature being in wrong location

### 9. Timeline Button in PR-PO Records
expected: In the PR-PO Records tab, you should see a Timeline button (📅) in an Actions column for each MRF row.
result: issue
reported: "Showed: Failed to load procurement timeline and in the console showed: procurement.js:4262 [Procurement] Error loading timeline: FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore... I clicked the timeline button"
severity: major

### 10. Procurement Timeline Modal - Complete Audit Trail
expected: Click the Timeline button for an MRF. A modal should open displaying the complete procurement workflow chronologically: MRF submission → PRs generated → TRs (if any) → POs created → Status updates. Each step should show dates, amounts, suppliers, and color-coded status indicators (green for completed, yellow for pending, red for rejected, blue for active).
result: skipped
reason: timeline doesn't load due to index error

### 11. Close Timeline Modal
expected: With the procurement timeline modal open, click the Close button. The modal should close and return you to the PR-PO Records view.
result: skipped
reason: can't open the modal due to index error

## Summary

total: 11
passed: 0
issues: 5
pending: 0
skipped: 6

## Gaps

- truth: "Finance Project List tab loads without errors and displays project expense data"
  status: failed
  reason: "User reported: Error detected: aggregation query requires Firebase index - FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore..."
  severity: major
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Project List tab displays table with project names, total expenses, and PO counts"
  status: failed
  reason: "User reported: This is the only thing that appears on the UI, Loading project expenses... meaning project lists do not load."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Refresh button updates project expense dashboard when clicked"
  status: failed
  reason: "User reported: when clicking refresh button nothing happens and this appears on the console: [Finance] 🔄 Refreshing project expenses... [Finance] Error loading project expenses: FirebaseError: The query requires an index."
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Supplier purchase history feature is in Supplier Management tab where suppliers are listed, not PR-PO Records tab"
  status: failed
  reason: "User reported: No you got this wrong, what i want to happen is in Procurement, Supplier Management Tab, every row corresponding to a certain supplier shall be clickable and all previous expenses from that supplier shall be seen with a total year spend information something like that. Not in PR-PO records tab because there is no supplier there in the first place"
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Timeline button loads procurement timeline modal without errors"
  status: failed
  reason: "User reported: Showed: Failed to load procurement timeline and in the console showed: procurement.js:4262 [Procurement] Error loading timeline: FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/clmc-procurement/firestore..."
  severity: major
  test: 9
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
