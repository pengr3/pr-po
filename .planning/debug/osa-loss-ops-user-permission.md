---
slug: osa-loss-ops-user-permission
status: fixed-pending-prod-deploy
trigger: "submitProjectLoss fails with FirebaseError: Missing or insufficient permissions for an operations_user assigned to the project; user expects assigned project members to be able to mark Loss"
created: 2026-06-15
updated: 2026-06-15
root_cause: "loss_reason missing from BOTH ops/services-user field-masks: (1) projects allow-update, (2) proposals allow-update BRANCH 2. PATH B trips on (1); PATH A (open proposal) trips on (2) because _applyProposalStateTransition's batch writes loss_reason onto the proposal doc."
fix: "Added 'loss_reason' to the projects ops_user hasOnly() allowlist AND the proposals BRANCH 2 ops/services field-mask in firestore.rules; validated + deployed to clmc-procurement-dev (two deploys). PROD (clmc-procurement) deploy pending user confirmation."
files_changed: [firestore.rules]
---

## UPDATE 2026-06-15 (3) — error persisted on dev AFTER both rule fixes → NOT a rules issue
- Verified via `firebase_get_security_rules` (firestore): the DEPLOYED dev ruleset contains the `loss_reason` additions (grep: ≥2 occurrences). Rules on clmc-procurement-dev are correct.
- User confirmed testing on localhost:8000 → dev DB (where fixes are live), yet same permission error.
- DECISIVE new evidence: console shows `[Router] Unauthenticated access blocked: /projects` + repeated `Tracking Prevention blocked access to storage` (Edge).
- ROOT CAUSE (revised): the browser session is UNAUTHENTICATED — Edge Tracking Prevention blocks the storage Firebase Auth uses to persist/refresh the token, so `request.auth == null` server-side → every write denied regardless of rules. Reads still render from `persistentLocalCache` (firebase.js), masking the logged-out state.
- REMEDIATION (no code): disable Tracking Prevention for localhost (or set Edge to Basic / add Firebase auth-domain exceptions), hard-refresh, re-login; or test in Chrome. Then retry Loss.
- The two firestore.rules field-mask fixes remain correct + necessary (they were genuine latent gaps) and stay; they're just not the cause of THIS persisting error.
- Status: awaiting user re-test after re-auth. PROD rules deploy still pending.

## UPDATE 2026-06-15 — second blocker (PATH A)
First deploy (projects ops_user + loss_reason) fixed PATH B but the SAME error
persisted → the test project has an OPEN proposal, so submitProjectLoss takes
PATH A. `_applyProposalStateTransition` runs a writeBatch that updates the
PROPOSAL doc with `loss_reason` (extraProposalFields). The proposals BRANCH 2
field-mask (firestore.rules:902, 14-key allow-list for assigned ops/services
users) omitted `loss_reason` → batch denied atomically → permission error.
Latent in the proposal-card loss flow too (only ever exercised by admins, who
use BRANCH 1 with no field-mask). Added `loss_reason` to the BRANCH 2 list and
redeployed to dev.

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
