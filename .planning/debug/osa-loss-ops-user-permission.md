---
slug: osa-loss-ops-user-permission
status: fixed-pending-prod-deploy
trigger: "submitProjectLoss fails with FirebaseError: Missing or insufficient permissions for an operations_user assigned to the project; user expects assigned project members to be able to mark Loss"
created: 2026-06-15
updated: 2026-06-15
root_cause: "loss_reason missing from operations_user field-mask in projects allow update rule"
fix: "Added 'loss_reason' to the ops_user hasOnly() allowlist in firestore.rules; validated + deployed to clmc-procurement-dev. PROD (clmc-procurement) deploy pending user confirmation."
files_changed: [firestore.rules]
---

# Debug: Mark-as-Loss denied for assigned operations_user

## Symptoms
- **Expected:** An `operations_user` assigned to a project (uid ∈ `personnel_user_ids`) can click "Mark as Loss" (quick task 260615-osa) and successfully set the project to Loss.
- **Actual:** Write fails with `FirebaseError: Missing or insufficient permissions.`
- **Error:** `[ProjectDetail] submitProjectLoss failed: FirebaseError: Missing or insufficient permissions.` at `project-detail.js:4009` (the catch in `window.submitProjectLoss`).
- **Timeline:** New — introduced with quick task 260615-osa (Mark as Loss button), commits 22fcbdf / 304a264. Never worked for ops users.
- **Repro:** Sign in as an `operations_user` assigned to a non-terminal project → open detail → Mark as Loss → enter reason → Confirm.

## Current Focus
- hypothesis: The `projects` update rule field-mask for `operations_user` (firestore.rules ~L225-242) does not include `loss_reason`. Both Loss write paths set `loss_reason`, so `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` evaluates false → whole update denied.
- test: Add `'loss_reason'` to the operations_user `hasOnly([...])` allowlist; redeploy rules to dev; re-run repro.
- expecting: Write succeeds; project status becomes Loss; no permission error.
- next_action: Apply rules fix + deploy to dev (and prod after confirmation).

## Evidence
- timestamp: 2026-06-15 — `firestore.rules:214-247` `match /projects/{projectId}` `allow update`. Three OR branches:
  1. `hasRole(['super_admin','operations_admin','finance'])` + code-lock preservation.
  2. `isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids && diff.affectedKeys().hasOnly([ 'project_status','updated_at','status_changed_at','last_activity_at', <lifecycle doc/timestamp fields>, 'dlp_*','retention_*', 'collection_tranches' ])` — **`loss_reason` ABSENT**.
  3. `hasRole(['finance'])` + `hasOnly(['retention_released_at','updated_at'])`.
- timestamp: 2026-06-15 — `project-detail.js` `submitProjectLoss`:
  - PATH B (no open proposal) writes `{ project_status:'Loss', loss_reason, status_changed_at, updated_at }` → trips the field-mask on `loss_reason`.
  - PATH A (open proposal) calls `_applyProposalStateTransition` (project_status/status_changed_at/updated_at — allowlisted, OK) THEN a parity `updateDoc(projects/{id}, { loss_reason, updated_at })` → that follow-up write ALSO trips the field-mask on `loss_reason`. So BOTH paths fail for ops users on the loss_reason write.
- timestamp: 2026-06-15 — Lifecycle gate writes (lcStartProject etc.) succeed for ops users because they only touch allowlisted keys → confirms the field-mask is the gate.

## Root Cause (high confidence)
`loss_reason` is missing from the `operations_user` field-mask allowlist in the `projects` `allow update` rule. Adding it (alongside the existing `project_status`/`status_changed_at`/`updated_at` keys the loss write already uses) unblocks assigned ops users. Rules must be redeployed to `clmc-procurement-dev` (test) and `clmc-procurement` (prod).

## Secondary check (verify, do not over-scope)
- `addProjectAuditEntry` / edit_history subcollection create rule (firestore.rules:258) allows `super_admin/operations_admin/services_admin/finance` — NOT `operations_user`. These calls in submitProjectLoss are fire-and-forget (`.catch`), so they do NOT cause the reported error, but an ops-user-initiated Loss may not write an audit/edit_history row. Decide whether the audit subcollection rule should also admit assigned ops users (consistency with NOTIF/activity), or leave as-is.

## Eliminated
- (none yet)

## Files likely involved
- firestore.rules (projects allow update — add 'loss_reason' to ops_user field-mask)
- app/views/project-detail.js (submitProjectLoss — reference only; behavior is correct, the rule is the gate)
