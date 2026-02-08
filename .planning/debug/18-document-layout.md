---
status: diagnosed
trigger: "Multiple problems with PO and PR document templates: signature sections, hardcoded fields, PO access"
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:00:00Z
---

## Current Focus

hypothesis: Four distinct issues in document templates - all confirmed with evidence
test: Code review of procurement.js document generation functions
expecting: Specific line numbers for each issue
next_action: Return diagnosis to caller

## Symptoms

expected:
  1. PO document accessible directly from Purchase Orders tab
  2. PO document has only "Approved by" signature section (finance approval)
  3. PR document has only "Prepared by" signature section (procurement preparation)
  4. Payment Terms, Condition, Delivery Date are dynamic fields entered per document

actual:
  1. PO Tracking tab table rows have NO direct "View PO Document" button -- only a "Timeline" button. Document is only accessible by clicking PO ID link -> modal -> "View PO" button in modal footer (two clicks deep)
  2. PO document has BOTH "Prepared by" and "Approved by" signature sections
  3. PR document has BOTH "Prepared by" and "Approved by" signature sections
  4. Payment Terms, Condition, Delivery Date are hardcoded with fallback values

errors: No runtime errors -- these are design/template issues
reproduction: Generate any PR or PO document
started: Since document generation was implemented

## Evidence

- timestamp: 2026-02-08T00:01:00Z
  checked: PO Tracking table rendering (renderPOTrackingTable, lines 3601-3725)
  found: |
    Each PO table row (lines 3701-3720) renders only:
      - PO ID as clickable link -> opens viewPODetails modal (line 3703)
      - Supplier, Project, Amount, Date columns
      - Status dropdown (line 3710)
      - "Timeline" button (line 3718)
    There is NO "View PO Document" or "Download PO" button in the table row itself.
    The only way to access the PO document is:
      1. Click PO ID link in table -> opens viewPODetails modal
      2. Click "View PO" button in modal footer (line 4163)
    This is a two-step process that is not discoverable from the main table.
  implication: Users cannot quickly access PO documents from the Purchase Orders tab

- timestamp: 2026-02-08T00:02:00Z
  checked: PO document signature section (generatePOHTML, lines 4854-4872)
  found: |
    PO document has TWO signature boxes in a flex row:
      Line 4855-4860: "Prepared by:" box with PROCUREMENT_PIC name
      Line 4862-4871: "Approved by:" box with FINANCE_SIGNATURE_URL and FINANCE_APPROVER
    Per requirements, PO should ONLY have "Approved by" (finance) -- no "Prepared by" needed.
  implication: PO document shows an unnecessary "Prepared by" signature section

- timestamp: 2026-02-08T00:03:00Z
  checked: PR document signature section (generatePRHTML, lines 4632-4656)
  found: |
    PR document has TWO signature boxes in a flex row:
      Line 4638-4643: "Prepared by:" box with placeholder + PREPARED_BY name
      Line 4645-4655: "Approved by:" box with FINANCE_SIGNATURE_URL (if approved) and FINANCE_PIC
    Per requirements, PR should ONLY have "Prepared by" (procurement) -- no "Approved by" needed.
  implication: PR document shows an unnecessary "Approved by" signature section

- timestamp: 2026-02-08T00:04:00Z
  checked: PO document data assembly (generatePODocument, lines 4996-5010)
  found: |
    Three fields use hardcoded fallback values:
      Line 5004: PAYMENT_TERMS: po.payment_terms || 'As per agreement'
      Line 5005: CONDITION: po.condition || 'Standard terms apply'
      Line 5006: DELIVERY_DATE: formatDocumentDate(po.delivery_date || 'TBD')
    These fields read from Firestore (po.payment_terms, po.condition, po.delivery_date)
    but no UI exists anywhere to SET these values. The PO creation flow never captures
    payment_terms, condition, or delivery_date from the user, so they ALWAYS fall back
    to the hardcoded defaults.
  implication: Every PO document shows identical generic values instead of supplier/document-specific terms

- timestamp: 2026-02-08T00:05:00Z
  checked: PO HTML template field display (generatePOHTML, lines 4848-4851)
  found: |
    The template renders these three fields in the document body:
      Line 4849: Payment Terms: ${data.PAYMENT_TERMS}
      Line 4850: Condition: ${data.CONDITION}
      Line 4851: Delivery Date: ${data.DELIVERY_DATE}
    These are displayed but never have real data since no input mechanism exists.
  implication: Confirms the fields need dynamic input, not just different defaults

- timestamp: 2026-02-08T00:06:00Z
  checked: Where PO document buttons exist
  found: |
    window.viewPODocument (line 89) and window.downloadPODocument (line 90) are attached
    but NEVER called from any table row or visible UI element. They are only used in:
      - viewPODetails modal footer "View PO" button (line 4163) -- calls generatePODocument
      - generateAllPODocuments batch function (line 5060) -- not exposed in any UI
    The viewPODocument and downloadPODocument wrapper functions exist (lines 5031-5054)
    but are orphaned -- no onclick handler references them.
  implication: Document access functions exist but are not wired to the main PO Tracking UI

- timestamp: 2026-02-08T00:07:00Z
  checked: MRF Records tab PO display (lines 2536-2553)
  found: |
    In the MRF Records (PR/PO Records) tab, PO entries show:
      - PO ID as clickable link -> viewPODetails modal (line 2538)
      - Status dropdown (line 2542)
      - Timeline button (line 2551)
    Same pattern as PO Tracking tab -- no direct document button here either.
  implication: Consistent absence of direct document access across all tabs

## Eliminated

(none -- all hypotheses confirmed)

## Resolution

root_cause: |
  Four confirmed issues in `app/views/procurement.js`:

  **ISSUE 1: PO Document Not Directly Accessible from Purchase Orders Tab**
  - File: `C:\Users\franc\dev\projects\pr-po\app\views\procurement.js`
  - Location: `renderPOTrackingTable()` function, lines 3701-3720
  - Problem: PO table rows only have PO ID link (opens modal) and "Timeline" button.
    No "View Document" or "Print PO" button in the table row actions column.
    Document access requires: click PO ID -> modal opens -> click "View PO" in modal footer.
  - Fix direction: Add a "View PO" document button in the Actions column (line 3718 area)
    alongside the existing "Timeline" button.

  **ISSUE 2: PO Document Has Unnecessary "Prepared by" Section**
  - File: `C:\Users\franc\dev\projects\pr-po\app\views\procurement.js`
  - Location: `generatePOHTML()` function, lines 4854-4872
  - Problem: The signature-section div contains two signature-box divs:
    - Lines 4855-4860: "Prepared by:" with PROCUREMENT_PIC (should be REMOVED)
    - Lines 4862-4871: "Approved by:" with FINANCE_SIGNATURE_URL (should be KEPT)
  - Fix direction: Remove the "Prepared by" signature-box (lines 4855-4860), keep only
    "Approved by". May need to adjust CSS from flex to centered single box.

  **ISSUE 3: PR Document Has Unnecessary "Approved by" Section**
  - File: `C:\Users\franc\dev\projects\pr-po\app\views\procurement.js`
  - Location: `generatePRHTML()` function, lines 4632-4656
  - Problem: The signatures div contains:
    - Lines 4638-4643: "Prepared by:" with placeholder (should be KEPT)
    - Lines 4645-4655: "Approved by:" with finance signature (should be REMOVED)
  - Fix direction: Remove the "Approved by" signature-box (lines 4645-4655), keep only
    "Prepared by". The procurement creator signature (pr_creator_signature_url from Phase 18-02)
    should be embedded in the "Prepared by" box.

  **ISSUE 4: Payment Terms, Condition, Delivery Date Are Hardcoded**
  - File: `C:\Users\franc\dev\projects\pr-po\app\views\procurement.js`
  - Location: `generatePODocument()` function, lines 5004-5006
  - Hardcoded defaults:
    - Line 5004: `po.payment_terms || 'As per agreement'`
    - Line 5005: `po.condition || 'Standard terms apply'`
    - Line 5006: `po.delivery_date || 'TBD'`
  - Problem: No UI exists to capture these values. PO creation never asks for payment_terms,
    condition, or delivery_date, so the Firestore documents never have these fields, and
    every PO document shows the same generic defaults.
  - Fix direction: Add input fields for these three values. Options:
    a) Add to the PO details modal with an "Edit PO Details" feature
    b) Add a prompt/dialog when "View PO Document" is clicked (before generation)
    c) Add to the PO creation flow when PRs are approved and POs are generated
    These fields should be saved to Firestore on the PO document so they persist.

fix: (not applied -- diagnosis only)
verification: (not applied -- diagnosis only)
files_changed: []
