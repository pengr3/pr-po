---
phase: 106-data-layer-audit-findings-report
plan: 06
subsystem: security
tags: [firestore-rules, security-rules, access-control, audit, firestore]

# Dependency graph
requires:
  - phase: 106-02
    provides: "106-INVENTORY.md § Per-Collection Access Map — the code-access side of the reconciliation"
provides:
  - "106-SCRATCH-security.md — per-collection rule-vs-access reconciliation table (33 match blocks vs 28 code-accessed collections)"
  - "S-01 (High): invitation_codes public read + public update (firestore.rules:185,191)"
  - "S-02 (Medium): edit_history/baselines create-gate excludes assigned non-admin editors → silent audit-trail gap"
  - "Resolution: 0 dead rule blocks (deleted_users + audit_log leads both live); 6/6 subcollection nesting confirmed (D-10)"
affects: [106-07, 112]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical D-07 finding schema with S- temp IDs (severity/category/collection/anchor/impact/recommendation/handling/target_phase)"
    - "Rule-vs-access reconciliation table: union of firestore.rules match blocks and inventory code-access, one row per collection/subcollection path"

key-files:
  created:
    - ".planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-security.md"
  modified: []

key-decisions:
  - "invitation_codes flagged despite documented ACCEPTED RISK (firestore.rules:102) — narrow re-eval of public UPDATE for Phase 112, not raised as a fresh bug"
  - "edit_history under-permissioning rated Medium (not the rubric-default High): denied write is a fire-and-forget audit sidecar, so the primary flow commits — impact is audit-trail completeness, not blocked access"
  - "Both dead-rule leads (deleted_users, audit_log) resolved LIVE via non-collection() access paths → 0 dead blocks; no rule trimmed"

patterns-established:
  - "Reconciliation by access PATH (doc-ref + subcollection), not just collection(db,'X') literals — the D-10 trap that makes grep-blind rules look dead"

requirements-completed: [AUDIT-03]

# Metrics
duration: 11min
completed: 2026-07-09
---

# Phase 106 Plan 06: Security-Rule Coverage Reconciliation (AUDIT-03) Summary

**Read-only reconciliation of all 33 firestore.rules match blocks against the 28 code-accessed collections in 106-INVENTORY.md — surfaced 1 High (invitation_codes public read/update) + 1 Medium (edit_history create-gate audit gap), resolved both dead-rule leads as live, and confirmed 6/6 subcollection nesting (D-10).**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-09T21:56:00+08:00
- **Completed:** 2026-07-09T22:07:00+08:00
- **Tasks:** 2
- **Files modified:** 1 created (`106-SCRATCH-security.md`)

## Accomplishments
- Built a per-collection **rule-vs-access reconciliation table** — one row per collection/subcollection (22 top-level + 11 nested rule blocks, cross-checked against the inventory's code-access map), with `firestore.rules:<line>` anchors and an OK/OVER/UNDER/nesting verdict per row.
- **S-01 (High):** confirmed `invitation_codes allow read: if true` (firestore.rules:185) + `allow update: if true` (firestore.rules:191) — world-writable with no auth; flagged for Phase 112 re-eval of the public UPDATE specifically, explicitly acknowledging the prior documented ACCEPTED RISK (firestore.rules:102) so 112 does not treat a recorded decision as a fresh bug.
- **S-02 (Medium):** found the `edit_history` create-gate (firestore.rules:268 projects / :600 services) excludes assigned `operations_user`/`services_user` who can legitimately mutate the parent (e.g. mark a project Loss, project-detail.js:4181); because `recordEditHistory` is fire-and-forget (edit-history.js:98), the audit write is denied silently → append-only trail gap. `baselines` create (firestore.rules:278) is the same asymmetry class.
- **Resolved both dead-rule leads:** `deleted_users` (accessed via `doc(db,'deleted_users',uid)`) and `audit_log` (nested subcollection) are both LIVE — 0 dead blocks; no rule to trim.
- **Confirmed subcollection nesting (D-10):** all 6 (activity_entries, progress_updates, issues, baselines, audit_log, edit_history) nest under the same parent the code accesses them through; the dynamic `edit_history` parent resolves only to `projects`/`services`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the rule-vs-access reconciliation table** — `3bec1d7e` (docs)
2. **Task 2: Flag over/under-permissioning, dead rules, and nesting** — `644637f7` (docs)

**Plan metadata:** this SUMMARY (docs: complete plan)

## Files Created/Modified
- `.planning/phases/106-data-layer-audit-findings-report/106-SCRATCH-security.md` - Rule-vs-access reconciliation table + S-01/S-02 findings (D-07 schema) + dead-rule resolution + D-10 nesting confirmation + Plan 07 handoff

## Decisions Made
- **invitation_codes framed as re-evaluation, not a new bug** — the block carries a documented ACCEPTED RISK (firestore.rules:102/174-182). S-01 keeps the public READ as plausibly-required for the pre-auth register flow and narrows the ask to public UPDATE (mark-used tampering), which can now be a single-use field-mask.
- **S-02 rated Medium, not the rubric-default High** — the denied `edit_history` write is a fire-and-forget audit sidecar; the primary user action (e.g. Loss) still commits, so the impact is audit-trail completeness (Repudiation surface), not blocked access or data exposure. Noted for Phase 112 to escalate if the lifecycle audit trail is integrity-critical.
- **Both dead-rule leads resolved live** — reconciled by access PATH (doc-ref + subcollection), not `collection(db,'X')` literals; confirms the inventory's 1:1 surface match and that no rule block is dead.

## Deviations from Plan

None - plan executed exactly as written. This is a read-only audit; no `firestore.rules`, `app/`, or `scripts/` source was modified. One investigation lead (a suspected `services.js:1566` wrong-parent routing bug) was checked and **cleared** — the 4th arg `'services'` is present on the following line, so no nesting-routing mismatch exists; recorded as nesting-OK rather than a finding.

## Issues Encountered
None. The `edit_history` dynamic-parent question (could it write under a third, unruled parent?) was resolved by reading `edit-history.js:87-90` and all 16 caller sites — `collectionName` is only ever `'projects'` or `'services'`, both of which have a nested rule block.

## Threat Model Compliance
- **T-106-12** (invitation_codes over-permission) → mitigated: S-01 flags firestore.rules:185,191, High, Phase 112.
- **T-106-13** (un-ruled access path / Elevation) → mitigated: reconciliation confirms 0 unruled collections; the one UNDER case (S-02) is rule-stricter-than-access, documented.
- **T-106-14** (finding without a rule line anchor) → mitigated: every finding carries a `firestore.rules:<line>` anchor.
- **T-106-SC** (dependency installs) → honored: no installs, no rules edits, no rules-test suite (read-only grep + rules read).

## Known Stubs
None — this deliverable is an audit document, not code. No hardcoded/placeholder data paths introduced.

## Next Phase Readiness
- **Plan 07 (106-FINDINGS.md):** S-01/S-02 ready to merge and re-ID to F-00N by severity; the reconciliation table + handoff table are the AUDIT-03 section source.
- **Phase 112 (AUDIT-06/07):** both findings are `handling: code-fix, target_phase: 112` (rules-only, no backfill scripts); accepted broad-gate notes (users.list, billing_requests, notifications/client_errors) flow to the AUDIT-06 deferral list.
- No blockers.

## Self-Check: PASSED

- `106-SCRATCH-security.md` — FOUND
- `106-06-SUMMARY.md` — FOUND
- Task 1 commit `3bec1d7e` — FOUND
- Task 2 commit `644637f7` — FOUND

---
*Phase: 106-data-layer-audit-findings-report*
*Completed: 2026-07-09*
