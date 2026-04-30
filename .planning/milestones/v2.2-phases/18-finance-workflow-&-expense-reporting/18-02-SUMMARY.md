---
phase: 18-finance-workflow-&-expense-reporting
plan: 02
subsystem: document-generation
tags: [signature-embed, po-document, pr-document, print-template, user-attribution, audit-trail]

dependency_graph:
  requires: [17-01, 18-01]
  provides: [signature-in-po-document, creator-attribution-in-pr-document, two-column-signature-layout]
  affects: [18-03]

tech_stack:
  added: []
  patterns: [conditional-signature-rendering, two-column-signature-layout, base64-image-embed-in-print]

key_files:
  created: []
  modified: [app/views/procurement.js]

decisions:
  - id: 18-02-01
    decision: "Two-column signature layout (Prepared by left, Approved by right) for both PO and PR documents"
    rationale: "Standard procurement document format, clear visual separation of roles, consistent across document types"
  - id: 18-02-02
    decision: "Use finance_approver_name (Phase 18-01) with fallback to legacy finance_approver field"
    rationale: "Backward compatibility with documents approved before Phase 18-01 while using new attribution field"
  - id: 18-02-03
    decision: "PR creator name displayed in both document header and signature section"
    rationale: "Header provides quick reference, signature section provides formal attribution for audit trail"
  - id: 18-02-04
    decision: "Conditional signature image rendering (image when available, placeholder when not)"
    rationale: "Legacy POs without signatures show empty placeholder space, new POs show embedded signature"

metrics:
  duration: "~4 minutes"
  completed: "2026-02-07"
---

# Phase 18 Plan 02: Embed Signatures and Attribution in PO/PR Documents Summary

**One-liner:** Two-column signature sections in PO/PR print templates with embedded base64 signature images, finance approver names from Phase 18-01, and PR creator attribution from Phase 17.

## What Was Done

### Task 1: Update PO and PR document templates with signature sections

**PO Document (`generatePODocument` + `generatePOHTML`):**
- Updated `generatePODocument` to extract `finance_approver_name` (Phase 18-01 field) with fallback chain to legacy `finance_approver` field and `DOCUMENT_CONFIG.defaultFinancePIC`
- Added `FINANCE_SIGNATURE_URL` from `po.finance_signature_url` (base64 PNG stored during Phase 18-01 approval)
- Added `PROCUREMENT_PIC` from `po.procurement_pic` with fallback to `'Procurement Team'`
- Replaced single "Authorized By" section with two-column `.signature-section` layout using CSS flexbox
- Left column: "Prepared by" with placeholder space and procurement PIC name
- Right column: "Approved by" with conditional signature image (base64 `<img>` when available, placeholder `<div>` when not) and finance approver name
- `page-break-inside: avoid` prevents signature section from splitting across printed pages

**PR Document (`generatePRDocument` + `generatePRHTML`):**
- Added `PREPARED_BY` field using `pr.pr_creator_name` (Phase 17 field) with fallback to `pr.procurement_pic` then `'Procurement Team'`
- Updated `FINANCE_PIC` to use `pr.finance_approver_name` (Phase 18-01) with fallback to legacy `pr.finance_approver`
- Added `FINANCE_SIGNATURE_URL` from `pr.finance_signature_url`
- Added "Prepared by: [name]" field in PR document header section (alongside Document No., MRF Reference, Date)
- Replaced inline signature lines with two-column `.signature-row` layout
- Left column: "Prepared by" with placeholder and PR creator name
- Right column: "Approved by" with conditional signature image and finance approver name (or blank line when unapproved)
- Date approved shown below approver name when PR has been approved

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **Two-column signature layout:** Standard procurement document format with "Prepared by" (left) and "Approved by" (right) for clear role separation in both PO and PR documents
2. **Fallback chain for finance approver:** `finance_approver_name` (Phase 18-01) -> `finance_approver` (legacy) -> `DOCUMENT_CONFIG.defaultFinancePIC` ensures all existing documents render correctly
3. **PR creator in header and signature:** Dual placement - header for quick reference, signature section for formal audit trail attribution
4. **Conditional image rendering:** `FINANCE_SIGNATURE_URL ? <img> : <placeholder>` handles both legacy documents (no signature) and new documents (embedded base64 signature)

## Verification Results

1. `generatePOHTML` contains `data.FINANCE_SIGNATURE_URL` for conditional signature image rendering - VERIFIED (line ~4864)
2. `generatePOHTML` contains `data.FINANCE_APPROVER` for approver name display - VERIFIED (line ~4870)
3. `generatePOHTML` contains two-column `.signature-section` layout - VERIFIED (lines ~4854-4872)
4. `generatePODocument` maps `po.finance_approver_name` to `FINANCE_APPROVER` - VERIFIED (line ~5007)
5. `generatePODocument` maps `po.finance_signature_url` to `FINANCE_SIGNATURE_URL` - VERIFIED (line ~5008)
6. `generatePODocument` maps `po.procurement_pic` to `PROCUREMENT_PIC` - VERIFIED (line ~5009)
7. `generatePRHTML` contains `data.PREPARED_BY` in document header - VERIFIED (line ~4614)
8. `generatePRHTML` contains `data.PREPARED_BY` in signature section - VERIFIED (line ~4642)
9. `generatePRHTML` contains conditional finance signature rendering - VERIFIED (lines ~4647-4651)
10. `generatePRDocument` maps `pr.pr_creator_name` to `PREPARED_BY` - VERIFIED (line ~4951)
11. `generatePRDocument` maps `pr.finance_approver_name` to `FINANCE_PIC` - VERIFIED (line ~4953)
12. `generatePRDocument` maps `pr.finance_signature_url` to `FINANCE_SIGNATURE_URL` - VERIFIED (line ~4954)
13. PO signature section has `page-break-inside: avoid` - VERIFIED (line ~4782)
14. PR signature row has `page-break-inside: avoid` - VERIFIED (line ~4551)

## Success Criteria Assessment

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Generated PO document includes captured signature as visible image | PASS (conditional `<img>` with base64 src) |
| 2 | PO document shows finance approver name below signature | PASS (`data.FINANCE_APPROVER` from `finance_approver_name`) |
| 3 | Generated PR document shows PR creator name who prepared/generated the PR | PASS (`data.PREPARED_BY` from `pr_creator_name`) |
| 4 | Documents print correctly with signatures embedded in PDF | PASS (base64 data URLs embed directly, no external references) |

## Next Phase Readiness

Plan 18-03 can proceed. The document templates now display both signature images and user attribution. The signature data flow is complete: captured in Phase 18-01 (finance.js approval) -> stored in Firestore PO/PR documents -> rendered in Phase 18-02 print templates (procurement.js document generation).
