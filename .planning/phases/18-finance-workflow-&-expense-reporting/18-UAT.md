---
status: diagnosed
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
  root_cause: "Signature canvas is embedded directly in prModal footer (viewPRDetails lines 1006-1034) instead of a separate approval modal. The rejection workflow correctly uses a separate rejectionModal (rejectPR lines 1594-1610) but the approval workflow does not follow this pattern."
  artifacts:
    - path: "app/views/finance.js"
      issue: "viewPRDetails() lines 1006-1034 embed signature canvas in prModal footer"
    - path: "app/views/finance.js"
      issue: "No approvalModal defined in render() lines 282-322"
  missing:
    - "Add approvalModal to render() function (follow rejectionModal pattern)"
    - "Remove signature canvas from viewPRDetails() footer"
    - "Approve button should close prModal and open approvalModal"
    - "Initialize signature pad in new modal"
  debug_session: ".planning/debug/18-signature-modal-placement.md"

- truth: "TR approval has no signature capture, just simple approve/reject buttons"
  status: failed
  reason: "User reported: TR approval should NOT have signature capture. Just a simple approval modal with approve/reject buttons. Signature is only needed for PR approval (which generates POs)."
  severity: major
  test: 5
  root_cause: "viewTRDetails() (lines 1160-1188) was given identical signature canvas markup as PR modal during Phase 18-02. TR approval doesn't generate POs so signatures are unnecessary. Original simple approveTR() function (lines 1442-1496) still exists and is the correct handler."
  artifacts:
    - path: "app/views/finance.js"
      issue: "viewTRDetails() lines 1161-1176 contain signature canvas HTML"
    - path: "app/views/finance.js"
      issue: "approveTRWithSignature() lines 1502-1571 is unnecessary"
  missing:
    - "Remove signature canvas from viewTRDetails() footer"
    - "Change approve button to call approveTR() instead of approveTRWithSignature()"
    - "Remove approveTRWithSignature() function"
    - "Remove window.approveTRWithSignature from attachWindowFunctions and destroy"
  debug_session: ".planning/debug/18-tr-signature-removal.md"

- truth: "PO document has only 'Approved by' section with signature; PR document has only 'Prepared by' section without signature; Payment Terms/Condition/Delivery Date are dynamic fields"
  status: failed
  reason: "User reported: Multiple issues: (1) PO document cannot be accessed from Purchase Orders tab. (2) PO document should only have 'Approved by' section - no 'Prepared by' needed. (3) PR document should only have 'Prepared by' section (by procurement) - no 'Approved by' needed. (4) Payment Terms, Condition, Delivery Date are hardcoded but these should be dynamic fields asked from procurement/finance as they vary per document and supplier."
  severity: major
  test: 6
  root_cause: "Four issues: (1) renderPOTrackingTable() lines 3701-3720 has no direct 'View PO Document' button - only accessible via PO ID click -> modal -> View PO (two steps). (2) generatePOHTML() lines 4855-4860 has unnecessary 'Prepared by' box. (3) generatePRHTML() lines 4645-4655 has unnecessary 'Approved by' box. (4) generatePODocument() lines 5004-5006 hardcodes payment_terms, condition, delivery_date with no UI to set them."
  artifacts:
    - path: "app/views/procurement.js"
      issue: "renderPOTrackingTable() lines 3701-3720 missing View PO Document button"
    - path: "app/views/procurement.js"
      issue: "generatePOHTML() lines 4855-4860 has unnecessary 'Prepared by' section"
    - path: "app/views/procurement.js"
      issue: "generatePRHTML() lines 4645-4655 has unnecessary 'Approved by' section"
    - path: "app/views/procurement.js"
      issue: "generatePODocument() lines 5004-5006 hardcoded payment terms/condition/delivery date"
  missing:
    - "Add 'View PO' button to PO Tracking table actions column"
    - "Remove 'Prepared by' signature box from PO document template"
    - "Remove 'Approved by' signature box from PR document template"
    - "Add UI for payment terms, condition, delivery date before PO document generation"
  debug_session: ".planning/debug/18-document-layout.md"

- truth: "PR document shows only 'Prepared by' with creator name, no signature image, no 'Approved by' section"
  status: failed
  reason: "User reported: PR documents should NOT have signature capture at all. Only need the name auto-filled from the account details of the user who generated the PR. Signatures are only for PO documents (finance approval). PR just needs 'Prepared by' with the creator's name - no signature image, no 'Approved by' section."
  severity: major
  test: 7
  root_cause: "generatePRHTML() (lines 4430-4662) was implemented with same dual-signature layout as PO template. CSS for signatures (lines 4543-4591), 'Approved by' box (lines 4645-4655), and unnecessary data fields FINANCE_PIC/FINANCE_SIGNATURE_URL/DATE_APPROVED/IS_APPROVED (lines 4953-4956) all need removal. PR header already correctly shows 'Prepared by' at line 4614."
  artifacts:
    - path: "app/views/procurement.js"
      issue: "generatePRHTML() lines 4543-4591 has unnecessary signature CSS"
    - path: "app/views/procurement.js"
      issue: "generatePRHTML() lines 4632-4657 has full signature section that should be text-only"
    - path: "app/views/procurement.js"
      issue: "generatePRDocument() lines 4953-4956 passes unnecessary signature data fields"
  missing:
    - "Remove signature CSS from PR template"
    - "Replace signature section with simple 'Prepared by' text"
    - "Remove FINANCE_PIC, FINANCE_SIGNATURE_URL, DATE_APPROVED, IS_APPROVED from PR data assembly"
  debug_session: ".planning/debug/18-pr-signature-removal.md"
