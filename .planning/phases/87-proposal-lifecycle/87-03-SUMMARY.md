---
phase: 87
plan: 03
subsystem: proposals
tags: [proposals, writebatch, state-transitions, notifications, audit-trail-write]
dependency_graph:
  requires: [phase-87-01, phase-87-02]
  provides: [proposal-submit-handler, proposal-approve-handler, proposal-reject-handler, proposal-sent-to-client-handler, proposal-client-approved-handler, proposal-loss-handler]
  affects: [app/views/proposals.js]
tech_stack:
  added: []
  patterns:
    - Single writeBatch covering proposal doc + project doc for atomic status transitions
    - Fire-and-forget notification try/catch (Phase 83 D-13 contract)
    - Optimistic detail modal re-render after transition (_refreshDetailModalAfterTransition)
    - Shared state-transition helper centralizing audit_log spread + serverTimestamp invariants
key_files:
  created: []
  modified:
    - app/views/proposals.js
decisions:
  - "_applyProposalStateTransition(): single writeBatch for proposal + (optional) project. Mark Sent to Client passes newStatus=null and newProjectStatus=null — helper skips status change and project doc touch"
  - "audit_log uses [...(proposal.audit_log || []), newAuditEntry] spread — never arrayUnion (Pitfall 7: array elements cannot contain serverTimestamp sentinels)"
  - "ts field in audit entry uses new Date().toISOString() — Firestore rejects serverTimestamp() inside array elements"
  - "NOTIF-09 fan-out (super_admin + operations_admin, excludeActor=true) in isolated try/catch — notification failure cannot block the state transition (D-09 + Phase 83 D-13)"
  - "NOTIF-10 single-recipient (proposal.created_by) for both Approve and Reject decisions — in isolated try/catch"
  - "Loss reason (D-06): persisted as proposal.loss_reason AND mirrored to LOSS_RECORDED audit entry comment in same writeBatch — cannot drift"
  - "'Client Approved' is the canonical project_status target (not 'For Mobilization') — 87-RESEARCH.md verified"
  - "All 9 Plan 03 stubs in init() replaced with real function references via direct assignment"
metrics:
  duration_minutes: 25
  tasks_completed: 4
  files_modified: 1
  completed_date: "2026-05-11"
---

# Phase 87 Plan 03: State-Machine Transitions Summary

**One-liner:** Proposal lifecycle state-machine wired end-to-end — Submit/Approve/Reject/Sent/ClientApproved/Loss all write single atomic writeBatch (proposal + project), append spread-based audit entries, and fire NOTIF-09/NOTIF-10 in fire-and-forget try/catch.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend imports + add _applyProposalStateTransition + _refreshDetailModalAfterTransition helpers | 4dd4c3c | app/views/proposals.js |
| 2 | Implement submitProposalForApproval (NOTIF-09) + submitMarkSentToClient (audit-only) | 5d19fc2 | app/views/proposals.js |
| 3 | Implement Approve/Reject sub-modals + submitProposalApproval handler (NOTIF-10) | 6f70885 | app/views/proposals.js |
| 4 | Implement Loss + Client Approved modals + overwrite all Plan 03 stubs with real functions | c81cd9a | app/views/proposals.js |

## Final Line Count

- **Before Plan 03:** 1,276 lines (Phase 87 Plan 02 baseline)
- **After Plan 03:** 1,739 lines (+463 lines added)

## Phase 87 Functions Added (Plan 03)

### Shared helpers
- `_applyProposalStateTransition({ proposal, newStatus, newProjectStatus, auditAction, auditComment, extraProposalFields })` — single writeBatch for proposal + optional project update; returns the new audit entry object
- `_refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, statusUpdate, extraUpdates)` — optimistic detail modal re-render via setTimeout(0)

### State-transition handlers
- `submitProposalForApproval(proposalDocId)` — draft/for_revision → pending_internal + project->'Proposal for Internal Approval' + NOTIF-09 fan-out
- `submitMarkSentToClient(proposalDocId)` — audit-only SENT_TO_CLIENT entry; no status change, no project doc touch, no notification
- `openApproveModal(proposalDocId)` — thin delegator to _openApproveOrRejectModal('approve')
- `openRejectModal(proposalDocId)` — thin delegator to _openApproveOrRejectModal('reject')
- `_openApproveOrRejectModal(proposalDocId, mode)` — shared 480px sub-modal builder at z-index 1001
- `submitProposalApproval(proposalDocId, mode)` — validates 10-char comment; approve: pending_client + 'Proposal Under Client Review' + NOTIF-10; reject: for_revision + 'For Revision' + NOTIF-10
- `openLossModal(proposalDocId)` — 480px sub-modal with required Loss Reason free text
- `submitLoss(proposalDocId)` — validates 10-char reason; proposal->loss + project->'Loss' + loss_reason on doc + LOSS_RECORDED audit comment mirrors reason (D-06)
- `openClientApprovedModal(proposalDocId)` — 480px confirmation modal (no comment required)
- `submitClientApproved(proposalDocId)` — proposal->client_approved + project->'Client Approved' + CLIENT_APPROVED audit entry

## Stub Overwrite Confirmation

All 9 Plan 03 stubs replaced — `grep -c "_stubP03('Submit for Internal Approval')" == 0`, `grep -c "_stubP03('Approve Proposal')" == 0`, `grep -c "_stubP03('Mark as Loss')" == 0` (all 0).

The `_stubP03()` function definition itself remains in the file as dead code (harmless; no window function calls it). Plans 04 + 05 stubs remain untouched: `_stubP04` count == 3, `_stubP05` count == 3 (1 definition + 2 window assignments each).

## Sample Successful State Transition Trace

**Submit for Internal Approval:**
```
writeBatch:
  proposals/{id}  ← { status: 'pending_internal', current_status_since: serverTimestamp(), audit_log: [...existing, { entry_id: uuid, ts: ISO, actor_id: uid, actor_name: 'Admin', action: 'SUBMITTED', comment: null }], updated_at: serverTimestamp() }
  projects/{project_id}  ← { project_status: 'Proposal for Internal Approval', updated_at: ISO }
batch.commit()

createNotificationForRoles({
  roles: ['super_admin', 'operations_admin'],
  type: 'PROPOSAL_SUBMITTED',
  message: 'Proposal <title> submitted for approval by <actor>',
  link: '#/proposals?id=PROP-2026-001',
  source_collection: 'proposals',
  source_id: 'PROP-2026-001',
  excludeActor: true
})  // in isolated try/catch — failure is logged, not re-thrown
```

## Deviations from Plan

None — plan executed exactly as written. All 4 task acceptance criteria met on first pass. No Rule 1/2/3 auto-fixes triggered. No Rule 4 architectural questions surfaced.

## Known Stubs

The following remain intentional documented stubs:

| Stub | Location | Reason |
|------|----------|--------|
| `window.saveProposalAttachment` | init() | Firebase Storage logic ships in Plan 04 |
| `window.removeProposalAttachment` | init() | Firebase Storage logic ships in Plan 04 |
| `window.toggleAddCommsForm` | init() | Comms log writes ship in Plan 05 |
| `window.saveCommsEntry` | init() | Comms log writes ship in Plan 05 |
| Attachment widget | `buildAttachmentSection()` in detail modal | Ships in Plan 04 |
| Add Comms Entry form | `buildCommsLogSection()` — hidden div | Ships in Plan 05 |

## Coverage

- PROP-03 (approve/reject workflow) — `openApproveModal` + `openRejectModal` + `submitProposalApproval` ship the full mandatory-comment approve/reject flow with audit trail
- PROP-04 (audit trail write side) — `_applyProposalStateTransition` appends SUBMITTED / APPROVED / REJECTED / SENT_TO_CLIENT / CLIENT_APPROVED / LOSS_RECORDED entries
- PROP-07 (sent-to-client, client-approved, loss actions) — `submitMarkSentToClient`, `submitClientApproved`, `submitLoss` all implemented
- PROP-11 (proposals collection with rules from Plan 01 + writes from Plans 02/03) — Plan 01 rules deployed, Plan 02 create/edit writes shipped, Plan 03 status-transition writes shipped
- NOTIF-09 (submit fan-out) — `createNotificationForRoles` to super_admin + operations_admin with excludeActor:true
- NOTIF-10 (decided single-recipient) — `createNotification` to proposal.created_by on both approve and reject paths

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes beyond what the plan's threat model already covers. All user-supplied strings (comment, loss_reason) rendered via `escapeHTML()` in Plan 02's `renderAuditTrail()` (T-87.3-01 mitigate). writeBatch atomicity prevents proposal+project drift (T-87.3-02 mitigate). actor_id captured from window.getCurrentUser()?.uid (T-87.3-03 mitigate).

## Self-Check: PASSED

- app/views/proposals.js exists and contains all Plan 03 functions: CONFIRMED (1739 lines)
- Commit 4dd4c3c (Task 1 — imports + helpers): FOUND
- Commit 5d19fc2 (Task 2 — submit + sent-to-client): FOUND
- Commit 6f70885 (Task 3 — approve/reject + NOTIF-10): FOUND
- Commit c81cd9a (Task 4 — loss/client-approved + stub overwrite): FOUND
- node --check app/views/proposals.js: SYNTAX OK
- No _stubP03 window assignments remain (all replaced with real functions): CONFIRMED
- _stubP04 count == 3 (2 window assignments + 1 definition): CONFIRMED
- _stubP05 count == 3 (2 window assignments + 1 definition): CONFIRMED
- delete window.submitProposalForApproval present in destroy(): CONFIRMED
- No unexpected file deletions across all 4 commits: CONFIRMED (only proposals.js modified)
