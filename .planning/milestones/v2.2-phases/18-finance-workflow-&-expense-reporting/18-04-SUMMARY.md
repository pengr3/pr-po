---
phase: 18-finance-workflow-&-expense-reporting
plan: 04
subsystem: finance-approval-workflow
tags: [modal, signature, approval-flow, UX]

dependency_graph:
  requires: [18-01]
  provides: [separate-approval-modal, simplified-tr-approval]
  affects: []

tech_stack:
  added: []
  patterns:
    - Two-step approval flow (review modal -> approval modal)
    - Module-level approval target tracking (currentApprovalTarget)

file_tracking:
  key_files:
    created: []
    modified:
      - app/views/finance.js

decisions:
  - id: "18-04-01"
    description: "Separate approval modal for PR signature capture (review and approval are distinct steps)"
    rationale: "UAT found signature canvas was embedded in review modal, making it hard to use. Separate modal provides focused signing experience."
  - id: "18-04-02"
    description: "TR approval uses simple confirm dialog with no signature capture"
    rationale: "Transport requests don't require signature capture -- simple approve/reject flow is sufficient."

metrics:
  duration: "~4 minutes"
  completed: "2026-02-08"
---

# Phase 18 Plan 04: PR Approval Modal & TR Signature Removal Summary

**One-liner:** Separate approval modal for PR signature capture, simplified TR to basic approve/reject

## What Was Done

### Task 1: Add approvalModal and restructure PR review modal footer
- Added new `approvalModal` HTML to `render()` with signature canvas, clear button, cancel/confirm buttons
- Removed signature canvas from PR review modal footer (was incorrectly embedded there)
- Changed "Approve & Generate PO" button to call `showApprovalModal(id, 'pr')` instead of `approvePRWithSignature()`
- Created `showApprovalModal()` -- closes review modal, opens approval modal, initializes signature pad
- Created `closeApprovalModal()` -- cleans up signature pad, closes modal, clears target
- Created `confirmApproval()` -- routes to `approvePRWithSignature()` based on target type
- Added `currentApprovalTarget` module-level state variable for tracking what is being approved
- Updated ESC key handler to support approvalModal (checked first in priority order)
- Updated `attachWindowFunctions()` with new functions, removed `approveTRWithSignature`
- Updated `destroy()` with cleanup for new functions and `currentApprovalTarget`
- Changed `approvePRWithSignature` success path to call `closeApprovalModal()` instead of `closePRModal()`

### Task 2: Remove TR signature capture and clean up approveTRWithSignature
- Replaced TR review modal footer to remove signature canvas HTML entirely
- Changed TR approve button from `approveTRWithSignature()` to simple `approveTR()`
- Deleted entire `approveTRWithSignature()` function (74 lines removed)
- Verified zero references to `approveTRWithSignature` remain in codebase

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

1. PR review modal footer: Reject, Approve & Generate PO, Close buttons only -- no signature canvas
2. Clicking "Approve & Generate PO" calls `showApprovalModal()` which closes review modal and opens separate approval modal
3. Approval modal contains signature canvas, clear button, cancel, and confirm buttons
4. ESC key handles approvalModal (checked first in priority chain)
5. TR review modal footer: Reject, Approve Transport Request, Close buttons -- no signature canvas
6. TR approve button calls original `approveTR()` (simple confirm dialog)
7. `approveTRWithSignature` completely eliminated (zero grep matches)
8. All window functions properly attached in `attachWindowFunctions()` and cleaned up in `destroy()`

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 3d3b300 | feat(18-04): add approval modal and restructure PR review modal footer |
| 2 | 3753185 | fix(18-04): remove TR signature capture and simplify to approve/reject |

## Next Phase Readiness

No blockers. The approval workflow is now correctly structured:
- **PR approval:** Review modal -> Approval modal (with signature) -> PO generation
- **TR approval:** Review modal -> Simple confirm dialog (no signature)
