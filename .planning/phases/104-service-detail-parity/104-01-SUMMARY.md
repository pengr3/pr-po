---
phase: 104-service-detail-parity
plan: 01
subsystem: infra
tags: [firestore-rules, security, journal, audit_log, retention, finance]

requires:
  - phase: 101
    provides: projects journal/audit subcollection rule blocks (the mirrored analog)
  - phase: 102
    provides: projects Finance Record-Release field-masked branch (the mirrored analog)
provides:
  - "3 service journal subcollection rule blocks (activity_entries, progress_updates, issues) under match /services/{serviceId}"
  - "audit_log subcollection rule block under match /services/{serviceId}"
  - "Finance Record-Release field-masked update branch on the services update rule"
  - "Confirmation that services-doc lifecycle/DLP field additions need NO allow-list change (role-only services update rule)"
affects: [104-02, 104-03, 104-04, 104-05]

tech-stack:
  added: []
  patterns: ["mirror projects subcollection rule blocks onto services (operations_admin -> services_admin)", "Finance field-masked retention-release branch"]

key-files:
  created: []
  modified: [firestore.rules]

key-decisions:
  - "D-15: audit_log + 3 journal blocks mirror the projects blocks verbatim, swapping operations_admin -> services_admin and projects/projectId -> services/serviceId"
  - "Finance branch ADDED (Finance was not in the services update roles); field-masked to retention_released_at + updated_at only"
  - "Services-doc field additions (lifecycle/DLP) need NO allow-list change — the services update rule is role-only, not affectedKeys-masked (verified :534-536)"
  - "D-14: journal create:isActiveUser() is intentionally decoupled from the parent role-only update rule and does not reference personnel_user_ids (so a denied parent last_activity_at bump never cascades to the journal entry)"

patterns-established:
  - "Service subcollection rule blocks live under match /services/{serviceId}, after edit_history, mirroring the projects layout"

requirements-completed: []

duration: 8 min
completed: 2026-06-13
---

# Phase 104 Plan 01: Service Journal/Audit Firestore Rules Summary

**Added the 3 journal subcollection blocks (activity_entries, progress_updates, issues) + an audit_log block + a Finance field-masked Record-Release branch under `match /services/{serviceId}`, mirroring the shipped projects rules — the security foundation all of Plans 02–05 depend on.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 1 of 2 complete (Task 2 = blocking DEV-deploy human gate, pending)
- **Files modified:** 1

## Accomplishments
- 4 new subcollection rule blocks under the services match (audit_log + activity_entries + progress_updates + issues), each mirroring its projects analog with `services_admin`/`services/$(serviceId)` swaps.
- Finance Record-Release branch appended to the services update rule (field-masked `affectedKeys().hasOnly(['retention_released_at','updated_at'])`) — Finance previously had no services update path.
- Verified the services update rule is role-only (no affectedKeys mask on the admin/user clause), so the new lifecycle/DLP service-doc fields need NO allow-list change.

## Task Commits

1. **Task 1: Service journal/audit blocks + Finance branch** - `c5d2feb` (feat)

## Files Created/Modified
- `firestore.rules` - Step A: Finance branch on services update rule (:534-539); Step B: 4 subcollection blocks after edit_history.

## Decisions Made
- None beyond plan — executed exactly as written. audit_log create uses `personnel_user_ids` (matching the projects analog and the client `_canAdvanceServiceStatus` gate logic), distinct from the parent `isAssignedToService(service_code)` rule.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- `match /activity_entries|progress_updates|issues|audit_log` each appear 2× (projects + services). PASS
- Finance branch: `hasRole(['finance'])` + `affectedKeys().hasOnly(['retention_released_at','updated_at'])` present. PASS
- services_user `isAssignedToService(service_code)` clause unchanged; no allow-list added to the admin/user clause. PASS
- Brace balance 77/77 (69 baseline + 8 from 4 new blocks — exact reconciliation). PASS

## User Setup Required
**Task 2 (blocking human gate) — DEV rules deploy is PENDING:**
Run `firebase deploy --only firestore:rules --project dev` (CLI active project is PROD — the `--project dev` flag is MANDATORY per project memory firebase-dev-prod-deploy.md). Without it, journal/audit/Record-Release writes are DENIED in DEV and browser UAT will fail. Prod deploy rides the standing v3.3 → main rules-deploy debt (87.4/99/100/101/102/103.1 + now 104). Surfaced in the phase's final combined gate.

## Next Phase Readiness
- Rules are in place for Plans 02–05's writes. The DEV deploy must complete before browser UAT.

## Self-Check: PASSED

---
*Phase: 104-service-detail-parity*
*Completed: 2026-06-13*
