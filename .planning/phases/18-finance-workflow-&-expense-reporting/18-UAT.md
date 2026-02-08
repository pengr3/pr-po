---
status: complete
phase: 18-finance-workflow-&-expense-reporting
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md]
started: 2026-02-07T14:00:00Z
updated: 2026-02-08T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Signature canvas in PR approval modal
expected: Go to Finance > Pending Approvals. Click "Review" on a PR. Modal opens with signature canvas at bottom, "Clear Signature" button, "Reject" button, and "Approve & Generate PO" button.
result: issue
reported: "Signature canvas should NOT be in the review modal. When user clicks 'Approve & Generate PO', a NEW separate approval modal should appear where the user draws their signature."
severity: major

### 2. Signature drawing and clearing
expected: In the PR approval modal, draw a signature on the canvas with your mouse. The stroke appears smoothly. Click "Clear Signature" — the canvas empties. Draw again to confirm it works after clearing.
result: skipped
reason: Blocked by test 1 issue - signature placement needs redesign

### 3. Approve without signature shows error
expected: In the PR approval modal, leave the signature canvas blank (don't draw anything). Click "Approve & Generate PO". An error toast appears saying a signature is required. No PO is generated.
result: skipped
reason: Blocked by test 1 issue - signature placement needs redesign

### 4. Approve PR with signature generates PO
expected: Draw a signature on the canvas. Click "Approve & Generate PO". PR status updates to Approved. PO is generated. You stay on the Pending Approvals tab (no redirect to Purchase Orders tab).
result: skipped
reason: Blocked by test 1 issue - signature placement needs redesign

### 5. Signature canvas in TR approval modal
expected: Click "Review" on a Transport Request. The modal opens with the same signature canvas, clear button, reject button, and approve button at the bottom.
result: issue
reported: "TR approval should NOT have signature capture. Just a simple approval modal with approve/reject buttons. Signature is only needed for PR approval (which generates POs)."
severity: major

### 6. PO document shows signature and approver name
expected: Go to Purchase Orders tab. Find the PO you just approved. Click to generate/view the PO document. The document shows a two-column signature section at the bottom: "Prepared by" on the left (with procurement team name), "Approved by" on the right with your embedded signature image and your name below it.
result: issue
reported: "Multiple issues: (1) PO document cannot be accessed from Purchase Orders tab. (2) PO document should only have 'Approved by' section - no 'Prepared by' needed. (3) PR document should only have 'Prepared by' section (by procurement) - no 'Approved by' needed. (4) Payment Terms, Condition, Delivery Date are hardcoded ('As per agreement', 'Standard terms apply', 'TBD') but these should be dynamic fields asked from procurement/finance as they vary per document and supplier."
severity: major

### 7. PR document shows creator name
expected: Generate/view a PR document. The document header shows "Prepared by: [name]" field. The signature section at the bottom has two columns: "Prepared by" (left) with the PR creator's name, and "Approved by" (right) with signature image (if approved).
result: issue
reported: "PR documents should NOT have signature capture at all. Only need the name auto-filled from the account details of the user who generated the PR. Signatures are only for PO documents (finance approval). PR just needs 'Prepared by' with the creator's name - no signature image, no 'Approved by' section."
severity: major

### 8. Historical Data tab removed
expected: Go to Finance view. You see only 3 tabs: "Pending Approvals", "Purchase Orders", and "Project List". There is no "Historical Data" tab.
result: pass

### 9. Project List table with expense columns
expected: Click the "Project List" tab in Finance. The table shows columns: Project Name (code + name), Client, Budget, Total Expense, Remaining Budget, Status. Projects with expenses exceeding budget are highlighted in red with a warning icon.
result: pass

### 10. Project expense breakdown modal
expected: Click on any project row in the Project List table. A modal opens with 6 scorecards: Project Budget, Remaining Budget, Material Purchases, Transport Fees, Subcon Cost, Total Project Cost. Values are formatted as currency with peso sign.
result: pass

## Summary

total: 10
passed: 3
issues: 4
pending: 0
skipped: 3

## Gaps

- truth: "Signature canvas appears in a separate approval modal after clicking Approve & Generate PO"
  status: failed
  reason: "User reported: Signature canvas should NOT be in the review modal. When user clicks 'Approve & Generate PO', a NEW separate approval modal should appear where the user draws their signature."
  severity: major
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "TR approval has no signature capture, just simple approve/reject buttons"
  status: failed
  reason: "User reported: TR approval should NOT have signature capture. Just a simple approval modal with approve/reject buttons. Signature is only needed for PR approval (which generates POs)."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "PO document has only 'Approved by' section with signature; PR document has only 'Prepared by' section without signature; Payment Terms/Condition/Delivery Date are dynamic fields"
  status: failed
  reason: "User reported: Multiple issues: (1) PO document cannot be accessed from Purchase Orders tab. (2) PO document should only have 'Approved by' section - no 'Prepared by' needed. (3) PR document should only have 'Prepared by' section (by procurement) - no 'Approved by' needed. (4) Payment Terms, Condition, Delivery Date are hardcoded but these should be dynamic fields asked from procurement/finance as they vary per document and supplier."
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "PR document shows only 'Prepared by' with creator name, no signature image, no 'Approved by' section"
  status: failed
  reason: "User reported: PR documents should NOT have signature capture at all. Only need the name auto-filled from the account details of the user who generated the PR. Signatures are only for PO documents (finance approval). PR just needs 'Prepared by' with the creator's name - no signature image, no 'Approved by' section."
  severity: major
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
