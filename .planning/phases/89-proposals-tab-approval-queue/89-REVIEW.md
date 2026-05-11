---
phase: 89-proposals-tab-approval-queue
status: clean
files_reviewed: 1
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
---

# Code Review — Phase 89: Proposals Tab Approval Queue

**Depth:** standard
**Files reviewed:** `app/views/proposals.js`
**Phase 89 insertion:** ~250 lines (`renderApprovalQueue()`, `_openQueueActionModal()`, `queueOpenApproveModal()`, `queueOpenRejectModal()`, `queueCancelModal()`, `queueConfirmAction()`)

## Result: Clean — No issues at or above the 80-confidence threshold

### Candidates evaluated and ruled out

1. **Operator precedence in sort key** — `?? seconds * 1000 ?? 0` is safe because `*` binds tighter than `??`; in practice `current_status_since` is always a full Firestore `Timestamp` with `.toMillis()`. Confidence: 55.

2. **Optimistic `renderApprovalQueue()` call after transition** — The approved row may briefly reappear until `onSnapshot` fires. Matches the project's established optimistic-render pattern (Phase 87's `_refreshDetailModalAfterTransition`). Confidence of UX regression: 50.

3. **Stale in-memory pre-flight check in `_openQueueActionModal`** — Concurrent approvals could bypass the `pending_internal` guard. Pre-existing architectural characteristic identical to `submitProposalApproval`. Not a Phase 89 regression. Confidence: 45.

### Correctness checks that passed

- `window.queue*` functions registered in `init()` and deleted in `destroy()` ✓
- Single `onSnapshot` listener for `proposals` collection — no second listener added ✓
- `_applyProposalStateTransition` called with correct named params for both approve and reject ✓
- NOTIF-10 block mirrors `submitProposalApproval` lines 1682-1698 verbatim ✓
- `escapeHTML()` applied to all user-data fields in queue table and `onclick` attributes ✓
- `proposal-queue-action-modal` de-duplicated before insert (remove-before-insertAdjacentHTML) ✓
- `#proposal-queue-mount` visibility set to `''` in both empty-state and populated branches ✓
- Comment minimum-10-chars guard implemented and wired to error div ✓
- `ageStyle` is hardcoded, never interpolated from Firestore data ✓
