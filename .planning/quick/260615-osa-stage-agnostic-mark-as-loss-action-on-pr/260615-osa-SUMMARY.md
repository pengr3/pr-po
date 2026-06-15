---
phase: quick-260615-osa
plan: 01
subsystem: project-detail
tags: [lifecycle, loss, proposal-transition, permissions]
dependency_graph:
  requires: [proposals.js::_applyProposalStateTransition, notifications.js::createNotificationForUsers, edit-history.js::recordEditHistory]
  provides: [window.openProjectLossModal, window.submitProjectLoss]
  affects: [app/views/project-detail.js]
tech_stack:
  added: []
  patterns: [dual-path-writer, canDrive-gate, defense-in-depth-window-fn, fire-and-forget-side-effects]
key_files:
  created: []
  modified: [app/views/project-detail.js]
decisions:
  - OSA-LOSS-01 (locked): Mark as Loss available for ALL non-terminal statuses (every status except Loss and Completed)
  - canDrive gate reused verbatim from loadProposalCard (adminRoles + assignedRoles+personnel) for permission consistency between the two Loss entry points
  - Loss button placed in .lc-footer OUTSIDE #lcBody so it survives buildLifecycleBodyInPlace re-renders on accordion toggle
  - PATH A follow-up updateDoc for loss_reason: _applyProposalStateTransition writes project_status/status_changed_at/updated_at only (confirmed by reading proposals.js); a follow-up updateDoc adds loss_reason to the project doc for direct-stage parity
  - PATH B NOTIF-11 mirrors saveField project_status side-effects exactly (same recipient filter, same message shape, fire-and-forget .catch)
  - Both paths call addProjectAuditEntry + _addActivityEntry for T-osa-03 repudiation mitigation
metrics:
  duration: ~20 min
  completed: 2026-06-15T09:58:39Z
  tasks_completed: 2
  files_changed: 1
---

# Quick 260615-osa: Stage-Agnostic Mark as Loss Action on Project Detail

**One-liner:** Danger button + reason modal on the lifecycle card chrome lets ops drive any non-terminal project directly to Loss, routing through the canonical `_applyProposalStateTransition` batch when an open proposal exists, or writing the project doc directly when none does.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Render gated Mark as Loss button + project loss modal in lifecycle card chrome | `22fcbdf` | app/views/project-detail.js |
| 2 | Implement dual-path submitProjectLoss writer (open-proposal transition vs. direct project write) | `304a264` | app/views/project-detail.js |

## What Was Built

### Task 1 — Lifecycle card chrome button + modal opener

- **`renderLifecycleCard`** now computes the same canDrive gate used in `loadProposalCard` (adminRoles / assignedRoles + personnel_user_ids). When `!terminalStatuses.includes(status) && canDrive`, a `.lc-footer` div is rendered after `#lcBody` containing a `btn btn-danger "Mark as Loss"` button. The footer is outside `#lcBody` so it is not wiped by `buildLifecycleBodyInPlace` on accordion toggle.
- **`window.openProjectLossModal(projectId)`** — defense-in-depth re-check of canDrive + non-terminal status; removes any existing `#projectLossModal`; inserts a `#projectLossModal` mirroring proposal-modal.js's `#proposalLossModal` markup (same copy, textarea, 10-char validation surface, cancel + confirm buttons). Confirm calls `window.submitProjectLoss(projectId)`.
- **`destroy()`** — `delete window.openProjectLossModal`, `delete window.submitProjectLoss`, `document.getElementById('projectLossModal')?.remove()` added alongside existing cleanup.

### Task 2 — Dual-path loss writer

**`window.submitProjectLoss(projectId)`**:

1. Guard + canDrive re-check (defense in depth, T-osa-01).
2. Reason validation: `reason.length < 10` → inline error in `#projectLossReasonError`, early return.
3. `showLoading(true)` / try-catch-finally.
4. Proposal detection: `getDocs(query(collection(db,'proposals'), where('project_id','==',projectId)))` → find a doc whose `status` is NOT in `{client_approved, loss}`.

**PATH A — open proposal found:**
- `await _applyProposalStateTransition({ proposal, newStatus:'loss', newProjectStatus:'Loss', auditAction:'LOSS_RECORDED', auditComment:reason, extraProposalFields:{loss_reason:reason} })` — atomic batch marks proposal `status:'loss'` + project `project_status:'Loss'`.
- Follow-up `updateDoc` adds `loss_reason` + `updated_at` to the project doc (the helper does not write `loss_reason` to the project doc — confirmed by reading proposals.js L262-290).
- `loadProposalCard(projectId, ...)` called to refresh the inline proposal card.

**PATH B — no open proposal:**
- Single `updateDoc(doc(db,'projects',projectId), { project_status:'Loss', loss_reason:reason, status_changed_at, updated_at })`.
- `recordEditHistory` (fire-and-forget `.catch`).
- NOTIF-11: `createNotificationForUsers` to `personnel_user_ids` with `PROJECT_STATUS_CHANGED` type, same message + link shape as `saveField`.

**Both paths:**
- `addProjectAuditEntry(projectId, 'LOSS_RECORDED', cu?.uid, cu?.full_name, reason)` (fire-and-forget `.catch`).
- `_addActivityEntry(projectId, { type:'system', is_system:true, text:'Project marked as Loss by ...' })` (fire-and-forget `.catch`).
- `document.getElementById('projectLossModal')?.remove()`.
- `showToast('Project marked as Loss.', 'success')`.
- Existing `onSnapshot` listener re-renders the detail page; lifecycle card shows the terminal Loss branch automatically.

## Verification

- `node --check app/views/project-detail.js` — PASS (both tasks).
- `grep -c "window.openProjectLossModal"` → 3 (render call, registration, delete in destroy).
- `grep -c "projectLossModal"` → 5 (render, modal HTML ×3, destroy cleanup).
- `grep -c "delete window.openProjectLossModal"` → 1.
- `grep -c "window.submitProjectLoss"` → 3 (modal HTML confirm, registration, delete in destroy).
- `grep -c "_applyProposalStateTransition"` → 5 (import line + existing uses + new PATH A call).
- `grep -c "client_approved"` → 4 (new open-proposal detection + existing refs).
- No edits outside `app/views/project-detail.js`.

**PAUSED at Task 3 — checkpoint:human-verify.** Browser UAT required (4 test groups: direct path, proposal path, validation, gating). See PLAN.md Task 3 for full steps.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The loss write paths are fully wired end-to-end.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond what was planned. The T-osa-01 (EoP) mitigation is implemented: both `openProjectLossModal` and `submitProjectLoss` re-check canDrive + non-terminal status before proceeding. T-osa-02 (tampering/divergence) is mitigated: PATH A uses the atomic batch helper + single follow-up for `loss_reason`; PATH B is a single atomic `updateDoc`. T-osa-03 (repudiation) mitigated: both paths call `addProjectAuditEntry` + `_addActivityEntry`.

## Follow-up (Out of Scope)

Port the same stage-agnostic "Mark as Loss" action to `service-detail.js`. The pattern is identical — same canDrive gate, same dual-path writer shape, same audit/activity entries. Deferred to a future quick task or phase.

## Self-Check

- [x] `22fcbdf` exists in git log
- [x] `304a264` exists in git log
- [x] `app/views/project-detail.js` contains `openProjectLossModal`
- [x] `app/views/project-detail.js` contains `submitProjectLoss`
- [x] `app/views/project-detail.js` contains `projectLossModal`
- [x] `node --check` passes
