---
phase: 61-fix-project-code-format-underscore-to-dash-fix-mrf-deletion-permission-error-in-procurement-and-fix-mrf-submission-permission-error-for-services-users
plan: 01
subsystem: database
tags: [firestore, security-rules, permissions, project-code, service-code]

# Dependency graph
requires: []
provides:
  - CLMC-CLIENT-YYYYnnn dash-separated project/service code generation
  - procurement role can delete MRFs (mrfs delete + deleted_mrfs create rules updated)
  - services_user can submit MRFs without permission error (mrfs list rule unrestricted)
affects: [projects, services, mrf-form, procurement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Firestore rules: move services_user to unrestricted hasRole() branch when unscoped getDocs needed for ID generation"
    - "Code format: CLMC-CLIENT-YYYYnnn uses dashes; range queries still work (- ASCII 45 sorts before digits)"

key-files:
  created: []
  modified:
    - app/utils.js
    - firestore.rules

key-decisions:
  - "services_user mrfs list rule moved to unrestricted hasRole() branch — scoped list caused generateMRFId() unscoped getDocs to fail when any project-type MRF doc failed the per-doc isAssignedToService check"
  - "Dash separator in CLMC codes (CLMC-CLIENT-YYYYnnn) — range query ordering preserved since dash (ASCII 45) sorts before digits just as underscore (ASCII 95) did"
  - "deleted_mrfs create rule gets procurement alongside mrfs delete rule — both needed since deleteMRF() writes audit record first then deletes the MRF"

patterns-established:
  - "Multi-step Firestore operations (soft-delete pattern): check EVERY collection touched — here both deleted_mrfs create AND mrfs delete needed the same role added"
  - "Unscoped getDocs for ID generation: any role that calls generateXxxId() must be in the unrestricted list branch, not a per-doc scoped branch"

requirements-completed: [CODE-FMT-01, PERM-DEL-01, PERM-SUB-01]

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 61 Plan 01: Fix Project Code Format, MRF Deletion Permission, and MRF Submission Permission Summary

**Dash-separated CLMC project/service codes (CLMC-CLIENT-YYYYnnn), procurement delete permission for MRFs, and unrestricted mrfs list for services_user to unblock MRF submission**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T05:38:41Z
- **Completed:** 2026-03-09T05:40:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed both `generateProjectCode()` and `generateServiceCode()` in utils.js to produce CLMC-ACME-2026001 format (dashes not underscores) including rangeMin, rangeMax, codeRegex, and return value
- Added `procurement` role to mrfs delete rule so Procurement users can delete MRFs without a FirebaseError
- Added `procurement` role to deleted_mrfs create rule so the soft-delete audit trail write succeeds (deleteMRF() writes to deleted_mrfs first, then deleteDoc on mrfs)
- Moved `services_user` from per-doc scoped list branch to unrestricted `hasRole()` branch in mrfs list rule so `generateMRFId()` unscoped `getDocs(collection(db, 'mrfs'))` succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix code generation format — underscore to dash in utils.js** - `3733e3d` (fix)
2. **Task 2: Fix Firestore rules — procurement delete MRF, services_user list MRFs** - `3c90be3` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/utils.js` - generateProjectCode and generateServiceCode: rangeMin/rangeMax/codeRegex/return all changed from CLMC_X_Y to CLMC-X-Y format; JSDoc examples updated
- `firestore.rules` - mrfs list rule: services_user added to unrestricted hasRole() branch; mrfs delete: added procurement; deleted_mrfs create: added procurement

## Decisions Made
- services_user mrfs list rule moved to unrestricted hasRole() branch — the per-doc scoped rule `isAssignedToService(resource.data.service_code)` caused Firestore to deny unscoped getDocs(mrfs) when any MRF doc (e.g. a project-type MRF with no service_code) failed the check; MRF metadata is not sensitive so unrestricted list is acceptable
- deleted_mrfs create rule must include the same roles as mrfs delete because deleteMRF() in procurement.js calls addDoc(deleted_mrfs) before deleteDoc(mrfs) — both operations independently checked against rules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Edit tool rejected initial mrfs list change because the same comment/pattern existed in multiple collections (prs, transport_requests). Resolved by providing more surrounding context (full match /mrfs/{mrfId} block) to uniquely identify the target.

## User Setup Required

**Firestore Security Rules require deployment.** After this commit is pushed and deployed to Netlify, run:
```bash
firebase deploy --only firestore:rules
```
Without deploying the rules, the permission fixes will not take effect in production.

## Next Phase Readiness
- All three bugs fixed; no remaining blockers in Phase 61 Plan 01
- Rules must be deployed via `firebase deploy --only firestore:rules` to take effect

---
*Phase: 61-fix-project-code-format-underscore-to-dash-fix-mrf-deletion-permission-error-in-procurement-and-fix-mrf-submission-permission-error-for-services-users*
*Completed: 2026-03-09*
