---
status: diagnosed
trigger: "TR approval modal has signature capture but should NOT - should be simple approve/reject"
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:00:00Z
---

## Current Focus

hypothesis: TR approval modal was incorrectly given signature capture during Phase 18-02 (signature embed feature), copying the PR modal pattern without considering that TRs don't generate POs and don't need signatures
test: Compare viewTRDetails() modal footer with viewPRDetails() modal footer
expecting: Both have identical signature canvas markup - confirming copy-paste from PR pattern
next_action: Return diagnosis with specific line numbers for all affected code

## Symptoms

expected: TR approval modal should have simple Approve/Reject buttons (no signature canvas)
actual: TR approval modal has full signature capture canvas identical to PR modal
errors: No errors - functional but incorrect UX behavior
reproduction: Navigate to Finance > Pending Approvals > click "Review" on any Transport Request
started: Phase 18-02 implementation (commit 19ba3b0 - embed signatures in PO/PR documents)

## Eliminated

(none - root cause identified on first hypothesis)

## Evidence

- timestamp: 2026-02-08T00:00:00Z
  checked: viewTRDetails() function in finance.js (lines 1056-1205)
  found: Lines 1161-1176 contain signature canvas HTML identical to PR modal. Line 1183 calls approveTRWithSignature() instead of simple approveTR(). Lines 1193-1196 initialize SignaturePad for the TR modal.
  implication: TR modal was given signature capture during Phase 18-02, mirroring PR modal pattern.

- timestamp: 2026-02-08T00:00:00Z
  checked: viewPRDetails() function in finance.js (lines 902-1051)
  found: Lines 1007-1022 contain signature canvas (CORRECT - PR needs signature for PO generation). Line 1028 calls approvePRWithSignature(). Lines 1039-1042 initialize SignaturePad.
  implication: PR modal signature is correct because PR approval generates POs with embedded signature.

- timestamp: 2026-02-08T00:00:00Z
  checked: approveTRWithSignature() function (lines 1502-1571)
  found: Function validates signature, exports as base64 PNG, stores finance_signature_url on the TR document. This is unnecessary because TR approval does NOT generate POs.
  implication: Signature data stored on TR documents serves no downstream purpose.

- timestamp: 2026-02-08T00:00:00Z
  checked: approveTR() function (lines 1442-1496)
  found: Original simple approval function still exists at lines 1442-1496. It uses confirm() dialog and updates finance_status to 'Approved' without signature. This is the CORRECT function for TR approval.
  implication: The original approveTR() is the correct handler. viewTRDetails() should call approveTR() not approveTRWithSignature().

- timestamp: 2026-02-08T00:00:00Z
  checked: Window function attachments (lines 24-54)
  found: Line 38 attaches window.approveTRWithSignature. Line 32 still attaches window.approveTR (original). Both exist.
  implication: The original simple function is still wired up but not called by the TR modal.

- timestamp: 2026-02-08T00:00:00Z
  checked: destroy() cleanup (lines 669-719)
  found: Line 716 deletes window.approveTRWithSignature. This cleanup entry should also be removed.
  implication: Cleanup code references the function that should be removed.

## Resolution

root_cause: |
  During Phase 18-02 (signature embed in PO/PR documents, commit 19ba3b0), the viewTRDetails()
  function was incorrectly given a signature canvas and the approveTRWithSignature() handler,
  copying the pattern from viewPRDetails(). This is wrong because:

  1. PR approval NEEDS signature - it generates POs with embedded finance signature
  2. TR approval does NOT need signature - it simply marks the TR as approved (no PO generation)

  The original simple approveTR() function (lines 1442-1496) already handles TR approval correctly
  with a simple confirm dialog.

fix: |
  Six changes needed in app/views/finance.js:

  1. **viewTRDetails() modal footer (lines 1160-1188):** Remove the signature canvas section
     (lines 1161-1176) and change the approve button from calling approveTRWithSignature()
     to calling approveTR() (line 1183).

  2. **viewTRDetails() signature pad init (lines 1192-1197):** Remove the SignaturePad
     initialization block since TR modal no longer has a canvas.

  3. **approveTRWithSignature() function (lines 1498-1571):** Remove entire function -
     no longer needed.

  4. **attachWindowFunctions() (line 38):** Remove window.approveTRWithSignature assignment.

  5. **destroy() cleanup (line 716):** Remove delete window.approveTRWithSignature.

  6. **approvalSignaturePad variable:** No change needed - still used by PR modal.

verification: pending
files_changed:
  - app/views/finance.js
