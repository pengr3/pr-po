---
status: diagnosed
phase: 18-finance-workflow-&-expense-reporting
source: [18-04-SUMMARY.md, 18-05-SUMMARY.md]
started: 2026-02-08T13:00:00Z
updated: 2026-02-08T13:30:00Z
round: 2 (gap closure verification)
---

## Current Test

[testing complete]

## Tests

### 1. PR review modal has no signature canvas
expected: Go to Finance > Pending Approvals. Click "Review" on a PR. Modal opens with Reject, "Approve & Generate PO", and Close buttons. NO signature canvas visible in this modal.
result: pass

### 2. Separate approval modal opens with signature canvas
expected: Click "Approve & Generate PO" in the PR review modal. The review modal closes. A NEW approval modal opens with: signature canvas, "Clear Signature" button, "Cancel" button, and "Confirm Approval" button.
result: pass

### 3. Signature drawing and clearing in approval modal
expected: Draw a signature on the canvas in the approval modal. The stroke appears smoothly. Click "Clear Signature" — the canvas empties. Draw again to confirm it works after clearing.
result: pass

### 4. Approve PR with signature generates PO
expected: Draw a signature on the canvas. Click "Confirm Approval". PR status updates to Approved. PO is generated. You stay on the Pending Approvals tab (no redirect to Purchase Orders tab).
result: pass

### 5. ESC key closes approval modal
expected: Open the approval modal (click "Approve & Generate PO" on a PR review). Press ESC. The approval modal closes.
result: pass

### 6. TR review modal has no signature canvas
expected: Click "Review" on a Transport Request. Modal opens with Reject, "Approve Transport Request", and Close buttons. NO signature canvas visible.
result: pass

### 7. TR approval uses simple confirm dialog
expected: Click "Approve Transport Request" on a TR review modal. A simple confirm dialog appears (no signature required). Confirm to approve the TR.
result: pass

### 8. View PO button in PO Tracking table
expected: Go to Procurement > PO Tracking. Each PO row has a "View PO" button in the Actions column alongside the Timeline button.
result: issue
reported: "There's no PO Tracking in Procurement and i dont need that function in procurement too. I need this function in Finance since there's no function there that allows finance user to retrieve PO documents."
severity: major

### 9. PO document dynamic fields prompt
expected: Click "View PO" on any PO. A prompt modal appears with three fields: Payment Terms, Condition, and Delivery Date. Fields may be pre-filled if values were previously saved.
result: issue
reported: "Once fields are encoded, it shall not show the modal on the next time they try to view the PO. This will be one time input for each document. If they need to edit those details they may do so in the PO Details Modal."
severity: major

### 10. PO document shows only Approved by section
expected: Generate/view a PO document. At the bottom, only an "Approved by" section appears on the right side with finance signature (if available) and approver name. No "Prepared by" box.
result: issue
reported: "Put it on the left side of the document instead of the right alignment."
severity: cosmetic

### 11. PR document shows only Prepared by as text
expected: Generate/view a PR document. At the bottom, only "Prepared by: [creator name]" appears as simple text with an underline. No signature images, no "Approved by" section, no signature boxes.
result: issue
reported: "Remove the underline and keep the name inline with the text Prepared By: Francis Gerard Silva"
severity: cosmetic

### 12. Dynamic PO fields persist
expected: Click "View PO" on a PO that you previously filled in fields for. The Payment Terms, Condition, and Delivery Date values should still be saved.
result: pass

## Summary

total: 12
passed: 8
issues: 4
pending: 0
skipped: 0

## Gaps

- truth: "View PO button exists in Finance view for finance users to retrieve PO documents"
  status: failed
  reason: "User reported: View PO button placed in Procurement instead of Finance. Finance users need this function to retrieve PO documents."
  severity: major
  test: 8
  root_cause: "promptPODocument/generatePOWithFields/generatePODocument only exist in procurement.js. Finance PO table (renderPOs line 1838) has a 'View in Procurement' button pointing to non-existent route. Document generation functions need to be in finance.js or shared module."
  artifacts:
    - path: "app/views/finance.js"
      issue: "renderPOs() line 1838 has 'View in Procurement' button, no View PO functionality"
    - path: "app/views/procurement.js"
      issue: "promptPODocument/generatePOWithFields/generatePODocument only accessible from procurement"
  missing:
    - "Add View PO button to Finance Purchase Orders table"
    - "Move or share document generation functions so Finance can access them"
  debug_session: ".planning/debug/18-r2-view-po-location.md"

- truth: "Dynamic fields prompt appears only once per PO; subsequent views go directly to document generation"
  status: failed
  reason: "User reported: Once fields are encoded, prompt should not show again. One-time input per document. Edit via PO Details Modal if needed."
  severity: major
  test: 9
  root_cause: "promptPODocument() (line 4962) always shows modal regardless of whether fields already exist. No conditional check for existing payment_terms/condition/delivery_date. viewPODetails() modal has no editable fields for document details."
  artifacts:
    - path: "app/views/procurement.js"
      issue: "promptPODocument() line 4962 has no conditional check for existing fields"
    - path: "app/views/procurement.js"
      issue: "viewPODetails() line 4041 has no editable document details section"
  missing:
    - "Add conditional: if all 3 fields exist, skip prompt and generate directly"
    - "Add editable Document Details section to viewPODetails modal"
  debug_session: ".planning/debug/18-r2-dynamic-fields-oneshot.md"

- truth: "PO document Approved by section is left-aligned"
  status: failed
  reason: "User reported: Put it on the left side of the document instead of the right alignment."
  severity: cosmetic
  test: 10
  root_cause: "generatePOHTML() line 4796 has inline style 'justify-content: flex-end' which right-aligns the Approved by box."
  artifacts:
    - path: "app/views/procurement.js"
      issue: "Line 4796 justify-content: flex-end right-aligns signature section"
  missing:
    - "Change to justify-content: flex-start for left alignment"
  debug_session: ".planning/debug/18-r2-document-cosmetics.md"

- truth: "PR document Prepared by is inline text with no underline"
  status: failed
  reason: "User reported: Remove the underline and keep the name inline with the text 'Prepared By: Name'"
  severity: cosmetic
  test: 11
  root_cause: "generatePRHTML() has a duplicate Prepared by section at lines 4592-4598 with underline and separate name line. The correct inline format already exists at line 4570. The duplicate section needs to be removed."
  artifacts:
    - path: "app/views/procurement.js"
      issue: "Lines 4592-4598 duplicate Prepared by with underline and separate name"
    - path: "app/views/procurement.js"
      issue: "Line 4570 already has correct inline format"
  missing:
    - "Delete lines 4592-4598 (duplicate section with underline)"
  debug_session: ".planning/debug/18-r2-document-cosmetics.md"
