---
slug: osa-loss-ops-user-permission
status: resolved-on-dev-pending-uat-and-prod
trigger: "submitProjectLoss fails with FirebaseError: Missing or insufficient permissions for an operations_user assigned to the project; user expects assigned project members to be able to mark Loss"
created: 2026-06-15
updated: 2026-06-15
root_cause: "loss_reason missing from BOTH ops/services-user field-masks: (1) projects allow-update, (2) proposals allow-update BRANCH 2. PATH B trips on (1); PATH A (open proposal) trips on (2) because _applyProposalStateTransition's batch writes loss_reason onto the proposal doc."
fix: "Added 'loss_reason' to the projects ops_user hasOnly() allowlist AND the proposals BRANCH 2 ops/services field-mask in firestore.rules; validated + deployed to clmc-procurement-dev (two deploys). PROD (clmc-procurement) deploy pending user confirmation."
files_changed: [firestore.rules]
---

## UPDATE 2026-06-15 (5) — TRUE ROOT CAUSE: MCP deploy was a no-op; rules never went live
- Fetched the LIVE dev ruleset and grepped: `loss_reason` appeared ONLY in comments, NEVER inside any `hasOnly([...])` — i.e. NONE of my field-mask edits were actually deployed, despite three `firebase_deploy` (MCP) calls all returning {status:success}.
- The local firestore.rules was correct the whole time (loss_reason at L229 projects + L902 proposals). The rule logic was never the persisting problem after the first commit — the edits simply weren't live.
- FIX: deployed via the Firebase CLI instead — `firebase deploy --only firestore:rules --project clmc-procurement-dev`. CLI output: "rules file firestore.rules compiled successfully" + "released rules firestore.rules to cloud.firestore".
- VERIFIED: re-fetched live rules; `loss_reason` now present in BOTH hasOnly() masks (projects ops_user + proposals BRANCH 2).
- LESSON: the firebase MCP `firebase_deploy` tool silently did NOT push the edited firestore.rules on this setup (reported success, live rules unchanged). Use the Firebase CLI for rules deploys here.
- Awaiting user UAT on dev (should now pass for ops_user, both PATH A and B). PROD deploy still pending: `firebase deploy --only firestore:rules --project clmc-procurement` (use CLI, NOT MCP).

## UPDATE 2026-06-15 (4) — auth OK; isolated to PATH A (open proposal)
- `window.auth.currentUser` returned a real UserImpl (uid vqVHvwRP8...) → NOT logged out. Reverted hypothesis (3). The router "Unauthenticated" line was stale/timing noise.
- super_admin marks Loss fine (admin rule branch, no personnel check) → confirms the issue is the ops_user write branches specifically.
- Inspected data: ops_user vqVHvwRP8... IS in personnel_user_ids of ALL their assigned projects (incl. all 5 legacy). assigned_project_codes also lists them. So assignment is fully present in BOTH representations.
- PROOF PATH B works: zz-legacy-test-005 = Loss WITH loss_reason="adasd..." (a real Mark-as-Loss button write by ops_user, after the projects rule fix). zz-legacy-test-001/004 = Loss but NO loss_reason → set via the legacy status DROPDOWN (saveField), not the button.
- Open proposals exist for: CLMC-CLMC-2026001 (pending_client), CLMC-DEV-001 (draft), CLMC-LEGACY-001 (draft) → these force PATH A. No project has yet been marked Loss via PATH A by the ops_user.
- Verified _applyProposalStateTransition writes proposal keys {status, current_status_since, audit_log, updated_at, loss_reason} + project keys {project_status, status_changed_at, updated_at}. ALL keys are in the deployed dev field-masks (projects ops_user + proposals BRANCH 2, both patched with loss_reason). Assignment get()s resolve to personnel that include the uid. Rule analysis says PATH A SHOULD now pass.
- HYPOTHESIS: user's failing tests predate the proposals-rule (2nd) deploy, OR stale cache. NEXT: hard-refresh + retest Mark-as-Loss on CLMC-CLMC-2026001 (forces PATH A). If still failing, instrument the catch in submitProjectLoss (localhost = edit+refresh, no deploy) to log path + denied doc.

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
