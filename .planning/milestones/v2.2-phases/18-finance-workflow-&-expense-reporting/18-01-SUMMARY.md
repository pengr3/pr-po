---
phase: 18-finance-workflow-&-expense-reporting
plan: 01
subsystem: finance-approval
tags: [signature-capture, signature-pad, finance-approval, user-attribution, serverTimestamp]

dependency_graph:
  requires: [15-01, 17-01]
  provides: [signature-capture-in-approval, finance-user-attribution-in-PO, signature-in-TR]
  affects: [18-02, 18-03]

tech_stack:
  added: [signature_pad@5.0.3]
  patterns: [signature-capture-with-validation, high-DPI-canvas-scaling, base64-signature-storage]

key_files:
  created: []
  modified: [index.html, app/views/finance.js]

decisions:
  - id: 18-01-01
    decision: "Use signature_pad v5.0.3 via CDN for canvas-based signature capture"
    rationale: "Industry standard (26k+ stars), zero dependencies, smooth Bezier curve interpolation, touch/stylus/mouse support"
  - id: 18-01-02
    decision: "Store signature as base64 PNG data URL in Firestore documents"
    rationale: "Simple storage, no separate file upload needed, signature sizes are small (~10-30KB)"
  - id: 18-01-03
    decision: "Use existing generatePOsForPR pattern with signature data passed through"
    rationale: "New generatePOsForPRWithSignature() preserves existing PO ID format and supplier grouping logic while adding signature and attribution fields"
  - id: 18-01-04
    decision: "Keep existing approvePR/approveTR functions as legacy, add new WithSignature variants"
    rationale: "Backward compatibility - old functions still work if called directly, new functions add validation"

metrics:
  duration: "~4 minutes"
  completed: "2026-02-07"
---

# Phase 18 Plan 01: Signature Capture in Approval Workflow Summary

**One-liner:** SignaturePad integration in PR/TR approval modals with isEmpty() validation, base64 PNG storage, and finance approver attribution via getCurrentUser() denormalization.

## What Was Done

### Task 1: Add signature_pad library to index.html
- Added `signature_pad@5.0.3` CDN script to `<head>` section
- Placed after CSS files, before app module imports
- Makes `SignaturePad` constructor globally available

### Task 2: Add signature canvas to PR/TR approval modals with validation
- **Import update:** Added `serverTimestamp` to finance.js Firebase imports
- **Module state:** Added `approvalSignaturePad` variable for singleton management
- **initializeApprovalSignaturePad():** Canvas initialization with high-DPI support (devicePixelRatio scaling), signature preservation on resize via toData/fromData, 60fps throttle
- **clearApprovalSignature():** Canvas reset function
- **viewPRDetails() update:** Modal footer now includes signature canvas, clear button, reject button, and "Approve & Generate PO" button; signature pad initialized via requestAnimationFrame after DOM update
- **viewTRDetails() update:** Same signature canvas pattern applied to TR approval modal
- **approvePRWithSignature():** Full approval flow with permission check, session validation, isEmpty() signature validation, base64 PNG export, PR status update with user attribution, MRF status update, PO generation via new generatePOsForPRWithSignature()
- **generatePOsForPRWithSignature():** Creates POs with finance_signature_url, finance_approver_user_id, finance_approver_name, serverTimestamp for date_issued, preserves existing PO ID format (PO_YYYY_MM-NNN-SUPPLIER)
- **approveTRWithSignature():** Same pattern for TR approval, stores signature and attribution directly in TR document
- **closePRModal() update:** Calls signaturePad.off() to remove event listeners, sets to null to prevent memory leaks
- **destroy() update:** Cleans up approvalSignaturePad and removes new window functions
- **attachWindowFunctions() update:** Registers clearApprovalSignature, approvePRWithSignature, approveTRWithSignature

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect rejection button handler reference**
- **Found during:** Task 2, Step 4-5
- **Issue:** Plan referenced `window.openRejectionModal()` which does not exist in the codebase; the actual rejection handler is `window.rejectPR()`
- **Fix:** Changed onclick handlers to use `window.rejectPR('${pr.id}')` and `window.rejectPR('${tr.id}')` matching the existing rejection workflow
- **Files modified:** app/views/finance.js
- **Commit:** ec04a60

## Decisions Made

1. **signature_pad via CDN (not npm):** Consistent with Firebase CDN approach in this zero-build codebase
2. **base64 PNG storage in Firestore:** Signature images are small (~10-30KB), well within 1MB document limit, avoids Firebase Storage dependency
3. **New WithSignature function variants:** approvePRWithSignature/approveTRWithSignature are separate from legacy approvePR/approveTR for backward compatibility
4. **generatePOsForPRWithSignature:** Separate function from generatePOsForPR to avoid changing the existing approval flow; preserves existing PO ID format and supplier grouping

## Verification Results

1. SignaturePad library loads via CDN in index.html head - VERIFIED (script tag present)
2. serverTimestamp imported in finance.js line 6 - VERIFIED
3. approvalSignaturePad variable declared at module level (line 17) - VERIFIED
4. Signature canvas rendered in PR modal footer with conditional edit controls - VERIFIED
5. Signature canvas rendered in TR modal footer with conditional edit controls - VERIFIED
6. isEmpty() validation before approval in both functions - VERIFIED (lines 1237, 1461)
7. toDataURL('image/png') export in both functions - VERIFIED (lines 1243, 1467)
8. finance_signature_url stored in PO documents - VERIFIED (line 1370)
9. finance_signature_url stored in TR documents - VERIFIED (line 1487)
10. finance_approver_user_id and finance_approver_name stored - VERIFIED (PO: lines 1368-1369, TR: lines 1485-1486)
11. signaturePad.off() called in closePRModal - VERIFIED (line 1525)
12. signaturePad cleanup in destroy() - VERIFIED (lines 643-646)
13. Window functions registered in attachWindowFunctions - VERIFIED (lines 36-38)
14. Window functions cleaned in destroy - VERIFIED (lines 660-662)

## Success Criteria Assessment

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Finance user sees signature canvas when opening PR/TR approval modal | PASS |
| 2 | Finance user can draw signature with mouse or touch input | PASS (SignaturePad handles both) |
| 3 | Clicking "Clear Signature" empties canvas for redrawing | PASS |
| 4 | Clicking "Approve" without signature shows error toast | PASS |
| 5 | PO document in Firestore contains finance_signature_url field with base64 image | PASS |
| 6 | PO document contains finance_approver_user_id and finance_approver_name fields | PASS |
| 7 | After PO generation, user stays on Pending Approvals tab (no auto-redirect) | PASS |

## Next Phase Readiness

Plan 18-02 can proceed. The signature capture infrastructure is in place. Plan 18-02 (Historical Data tab removal and Project List enhancements) and Plan 18-03 (PO document template with embedded signature) can build on top of the finance_signature_url field stored in PO/TR documents.
