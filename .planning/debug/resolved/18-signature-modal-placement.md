---
status: resolved
trigger: "Signature canvas is placed directly inside the PR review modal (viewPRDetails). User expects that when they click 'Approve & Generate PO', a NEW separate approval modal should appear where they draw their signature -- not embedded in the review modal itself."
created: 2026-02-08T00:00:00Z
updated: 2026-02-08T00:00:00Z
---

## Current Focus

hypothesis: Signature canvas is rendered inline in the PR/TR review modal footer instead of in a separate dedicated approval modal
test: Read viewPRDetails and viewTRDetails to find where canvas is injected
expecting: Canvas is in the modal footer HTML, not spawned as a separate modal
next_action: Document root cause with line numbers

## Symptoms

expected: Clicking "Approve & Generate PO" should open a NEW separate approval modal with a signature canvas, keeping the review modal as read-only
actual: The signature canvas (`<canvas id="approvalSignatureCanvas">`) is rendered directly inside the `prModal` footer alongside the Approve/Reject buttons, making the review modal cluttered and mixing review concerns with approval concerns
errors: No runtime errors -- this is a UX/design issue
reproduction: Open Finance > Pending Approvals > click "Review" on any PR > signature canvas is visible in the modal footer immediately
started: Introduced in Phase 18-02 (signature embed implementation)

## Eliminated

(none -- root cause was identified on first investigation)

## Evidence

- timestamp: 2026-02-08T00:01:00Z
  checked: viewPRDetails function (lines 902-1051)
  found: |
    The signature canvas is rendered inside `prModalFooter` at lines 1006-1034.
    Specifically lines 1008-1021 inject the canvas HTML:
      - `<canvas id="approvalSignatureCanvas">` at line 1012
      - "Clear Signature" button at lines 1016-1020
    The "Approve & Generate PO" button (line 1028-1029) calls `approvePRWithSignature()`
    which validates the signature pad at line 1291. The signature pad is initialized
    at lines 1039-1043 via `requestAnimationFrame(() => initializeApprovalSignaturePad())`.
  implication: The review modal serves double duty as both review AND approval, violating separation of concerns

- timestamp: 2026-02-08T00:02:00Z
  checked: viewTRDetails function (lines 1056-1205)
  found: |
    Identical pattern -- signature canvas is rendered inside prModalFooter at lines 1160-1188.
    Canvas HTML at lines 1162-1175, "Approve Transport Request" button at line 1183.
    Signature pad initialized at lines 1193-1197 with the same requestAnimationFrame pattern.
  implication: Both PR and TR review modals have the same structural issue

- timestamp: 2026-02-08T00:03:00Z
  checked: render() function (lines 145-323) for existing modals
  found: |
    Three modals are defined in render():
      1. `prModal` (lines 282-291) -- PR/TR review modal (reused for both)
      2. `rejectionModal` (lines 294-309) -- Separate modal for rejection workflow
      3. `projectExpenseModal` (lines 312-322) -- Project expense breakdown
    There is NO dedicated approval/signature modal. The rejection workflow correctly
    uses a SEPARATE modal (rejectionModal) -- the approval workflow should follow
    the same pattern.
  implication: The rejection workflow is the correct UX pattern to follow -- it opens a separate modal

- timestamp: 2026-02-08T00:04:00Z
  checked: Module-level state and initialization
  found: |
    - `approvalSignaturePad` declared at line 17 (module state)
    - `initializeApprovalSignaturePad()` at lines 95-129 -- creates SignaturePad instance
    - `clearApprovalSignature()` at lines 134-138 -- clears the pad
    - `closePRModal()` at lines 1576-1585 -- cleans up signature pad on close
    - Window functions attached at lines 36-38: clearApprovalSignature, approvePRWithSignature, approveTRWithSignature
  implication: The signature infrastructure is correct; it just needs to be moved to a new modal

- timestamp: 2026-02-08T00:05:00Z
  checked: Rejection workflow as reference pattern
  found: |
    rejectPR() at line 1594-1610 demonstrates the correct UX flow:
      1. Closes the PR review modal: `window.closePRModal()` (line 1607)
      2. Opens a separate rejection modal: `document.getElementById('rejectionModal').classList.add('active')` (line 1609)
    The approval workflow should mirror this: close the review modal, then open a
    dedicated approval/signature modal.
  implication: The codebase already has the correct pattern implemented for rejection -- approval should follow suit

## Resolution

root_cause: |
  The signature canvas is embedded directly in the PR/TR review modal footer
  (`prModalFooter`) instead of being presented in a separate dedicated approval modal.

  **Specifically:**

  1. In `viewPRDetails()` (line 1006-1034), the footer HTML includes both the
     signature canvas AND the approve/reject buttons in the same `prModalFooter` div.
     The canvas is at lines 1012-1015, the "Approve & Generate PO" button at line 1028-1029.

  2. In `viewTRDetails()` (line 1160-1188), identical pattern -- signature canvas
     at lines 1166-1169, "Approve Transport Request" button at line 1183.

  3. There is NO `approvalModal` defined in the `render()` function (lines 145-323).
     Only `prModal`, `rejectionModal`, and `projectExpenseModal` exist.

  4. The rejection workflow (rejectPR, lines 1594-1610) correctly uses a SEPARATE
     modal -- it closes prModal first, then opens rejectionModal. The approval
     workflow should follow this same pattern but currently does not.

  **The fix pattern should be:**
  - Remove the signature canvas from viewPRDetails() and viewTRDetails() footer HTML
  - Add a new `approvalModal` in the render() function (similar to rejectionModal)
  - The "Approve & Generate PO" button should close prModal and open approvalModal
  - approvalModal contains the signature canvas, a "Confirm Approval" button, and a "Cancel" button
  - approvePRWithSignature/approveTRWithSignature called from the new modal

fix: (not applied -- root cause analysis only)
verification: (not applied -- root cause analysis only)
files_changed: []

## Detailed Line Reference

### File: `app/views/finance.js` (1,893 lines)

| What | Lines | Description |
|------|-------|-------------|
| `approvalSignaturePad` state | 17 | Module-level variable holding SignaturePad instance |
| `initializeApprovalSignaturePad()` | 95-129 | Creates SignaturePad with high-DPI support |
| `clearApprovalSignature()` | 134-138 | Clears signature canvas |
| `render()` -- prModal definition | 282-291 | The review modal shell (no separate approval modal exists) |
| `render()` -- rejectionModal definition | 294-309 | Separate rejection modal (CORRECT pattern to follow) |
| `viewPRDetails()` -- signature canvas in footer | 1006-1034 | **ROOT CAUSE** -- canvas at 1012, approve button at 1028 |
| `viewPRDetails()` -- pad initialization | 1039-1043 | requestAnimationFrame initialization of SignaturePad |
| `viewTRDetails()` -- signature canvas in footer | 1160-1188 | **ROOT CAUSE** -- canvas at 1166, approve button at 1183 |
| `viewTRDetails()` -- pad initialization | 1193-1197 | requestAnimationFrame initialization of SignaturePad |
| `approvePRWithSignature()` | 1278-1349 | PR approval handler (validates signature at 1291) |
| `approveTRWithSignature()` | 1502-1571 | TR approval handler (validates signature at 1515) |
| `closePRModal()` | 1576-1585 | Cleans up signature pad on modal close |
| `rejectPR()` | 1594-1610 | **REFERENCE PATTERN** -- closes prModal, opens rejectionModal |

### What Needs to Change

1. **render() function** (after line 309): Add a new `<div id="approvalModal" class="modal">` with:
   - Modal header: "Approve & Sign"
   - Modal body: signature canvas + instructions
   - Modal footer: "Clear Signature", "Cancel", and "Confirm Approval" buttons

2. **viewPRDetails()** (lines 1006-1034): Remove signature canvas from footer. Keep only:
   - "Reject" button (calls rejectPR)
   - "Approve & Generate PO" button (but now calls a new `showApprovalModal()` function instead of `approvePRWithSignature` directly)
   - "Close" button

3. **viewTRDetails()** (lines 1160-1188): Same changes as viewPRDetails.

4. **New function `showApprovalModal()`**: Mirrors `rejectPR()` pattern:
   - Close prModal
   - Open approvalModal
   - Initialize signature pad in the new modal

5. **ESC key handler** (line 76): Add approvalModal to the escape key handler chain.

6. **Window functions** (line 36-38): Add `window.showApprovalModal` and `window.closeApprovalModal`.
