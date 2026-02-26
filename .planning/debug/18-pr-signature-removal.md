---
status: diagnosed
trigger: "PR documents should NOT have signature capture at all. Only need the name auto-filled from the account details of the user who generated the PR."
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:00:00Z
---

## Current Focus

hypothesis: PR document template (generatePRHTML) incorrectly includes both "Approved by" signature section and signature placeholder for "Prepared by" - should only show creator name text, no signature imagery
test: Compare PR template vs PO template signature sections
expecting: PR template has full signature infrastructure that should be PO-only
next_action: Document root cause and exact lines to change

## Symptoms

expected: PR documents show only "Prepared by: [creator name]" with no signature image, no "Approved by" section. Signatures are exclusively for PO documents (finance approval).
actual: PR documents render a full two-column signature row with (1) "Prepared by" placeholder box for a signature image, and (2) "Approved by" column with conditional finance signature image rendering.
errors: No runtime errors - this is a design/requirements violation
reproduction: Generate any PR document via the "Generate PR" button in PO Tracking tab
started: Implemented in phase 18-02 (commit 19ba3b0) which embedded signatures in both PR and PO documents

## Eliminated

(none - root cause identified on first hypothesis)

## Evidence

- timestamp: 2026-02-08T00:01:00Z
  checked: generatePRHTML function (procurement.js lines 4430-4662)
  found: Full signature infrastructure in PR template including CSS for .signatures, .signature-row, .signature-box, .sig-label, .sig-line, .sig-placeholder, and img styling (lines 4543-4591). The HTML body contains a "signatures" div (lines 4632-4657) with two signature boxes side by side.
  implication: PR template was built with the same signature pattern as PO template, violating the requirement that PRs only need creator name.

- timestamp: 2026-02-08T00:02:00Z
  checked: PR signature section HTML (lines 4632-4657)
  found: |
    Two sections in the signature row:
    1. "Prepared by:" box (lines 4638-4643) - has sig-placeholder (empty 60px box), sig-line (underline), and name text. This creates a visual signature capture area even though no actual signature is captured.
    2. "Approved by:" box (lines 4645-4655) - conditionally renders finance_signature_url as an <img> when IS_APPROVED && FINANCE_SIGNATURE_URL are truthy, otherwise renders empty placeholder. Shows finance approver name or underscores.
  implication: Both sections are wrong for PR. "Approved by" should not exist at all on PR. "Prepared by" should just be text, not a signature box.

- timestamp: 2026-02-08T00:03:00Z
  checked: generatePRDocument data assembly (lines 4924-4973)
  found: |
    The data object passed to generatePRHTML includes signature-related fields that should be PO-only:
    - FINANCE_PIC (line 4953): pr.finance_approver_name || pr.finance_approver || DOCUMENT_CONFIG.defaultFinancePIC
    - FINANCE_SIGNATURE_URL (line 4954): pr.finance_signature_url || ''
    - DATE_APPROVED (line 4955): pr.date_approved formatted or 'Pending'
    - IS_APPROVED (line 4956): pr.finance_status === 'Approved' || pr.date_approved
    The only field that SHOULD remain is PREPARED_BY (line 4951): pr.pr_creator_name || pr.procurement_pic || 'Procurement Team'
  implication: Data assembly prepares unnecessary signature data for PRs.

- timestamp: 2026-02-08T00:04:00Z
  checked: PO template for comparison (generatePOHTML, lines 4669-4877)
  found: PO template correctly uses signature-section (lines 4854-4872) with "Prepared by" and "Approved by" boxes. The "Approved by" box renders finance_signature_url as an img when available. This is the CORRECT place for signatures.
  implication: Confirms PO is the only document type that should have signature rendering.

- timestamp: 2026-02-08T00:05:00Z
  checked: PR header section in template (line 4614)
  found: The document header already shows "Prepared by:" as a text field: `<div class="field"><span class="label">Prepared by:</span> ${data.PREPARED_BY}</div>`. This is the CORRECT way to show creator attribution on PR.
  implication: The header already has the right "Prepared by" display. The bottom signature section is entirely redundant and incorrect for PRs.

- timestamp: 2026-02-08T00:06:00Z
  checked: Finance view signature capture (finance.js lines 92-136, 1275-1335)
  found: Signature pad (SignaturePad library) is used in finance.js for the approval workflow. When finance approves a PR, the signature is captured and stored as base64 in the resulting PO document (finance_signature_url field). The signature is stored on the PO, not the PR itself (line 1424: `finance_signature_url: signatureDataURL`).
  implication: The finance signature capture workflow correctly targets POs. But the PR template still tries to render a signature section that references finance signature data from the PR record itself.

- timestamp: 2026-02-08T00:07:00Z
  checked: PR record signature data origin
  found: PR records can have finance_signature_url set if they were approved (the approval process in finance.js updates the PR's finance_status but the signature URL is stored on the PO, not the PR). However, the PR template data assembly at line 4954 still tries to read pr.finance_signature_url, which would be empty/undefined for most PRs.
  implication: Even if the signature data is usually empty on PRs, the template structure is wrong - it should not have the "Approved by" section at all.

## Resolution

root_cause: |
  The `generatePRHTML()` function (procurement.js lines 4430-4662) was implemented with the same dual-signature layout as the PO template. This violates the business requirement that PR documents should only display the creator's name (no signature images, no "Approved by" section).

  Specifically:
  1. **CSS (lines 4543-4591):** 13 CSS rules for signature styling (.signatures, .signature-row, .signature-box, .sig-label, .sig-line, .sig-placeholder, img) that are unnecessary for PR
  2. **HTML "Prepared by" box (lines 4638-4643):** Renders as a signature-style box with placeholder and underline instead of simple text
  3. **HTML "Approved by" box (lines 4645-4655):** Entire section should not exist on PR documents - includes conditional signature image rendering and finance approver name
  4. **Data assembly (lines 4953-4956):** Four unnecessary fields passed to template: FINANCE_PIC, FINANCE_SIGNATURE_URL, DATE_APPROVED, IS_APPROVED

  The PR header at line 4614 already correctly shows "Prepared by: [name]" as plain text, making the bottom signature section entirely redundant.

fix: |
  In `generatePRHTML()`:
  1. Remove all signature-related CSS (lines 4543-4591)
  2. Replace the entire `<div class="signatures">` block (lines 4632-4657) with a simple "Prepared by" text line showing only the creator name, or remove it entirely since the header already has "Prepared by" at line 4614
  3. In `generatePRDocument()`, remove unnecessary data fields: FINANCE_PIC, FINANCE_SIGNATURE_URL, DATE_APPROVED, IS_APPROVED (lines 4953-4956)
  4. Keep PREPARED_BY field (line 4951) as it correctly pulls pr_creator_name

  The PO template (generatePOHTML, lines 4669-4877) should remain UNCHANGED - it correctly implements the dual-signature layout for PO documents.

verification: |
  Not yet verified - diagnosis only mode.
  To verify fix:
  1. Generate a PR document - should show only "Prepared by: [name]" as text, no signature boxes
  2. Generate a PO document - should still show both "Prepared by" and "Approved by" with signature image support
  3. Approve a PR via finance view - signature should still be captured and stored on the resulting PO

files_changed: []
