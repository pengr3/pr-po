---
phase: 26-security-roles-foundation
plan: 01
subsystem: auth
tags: [firebase, firestore-rules, security, roles, rbac]

# Dependency graph
requires: []
provides:
  - Firestore security rules for services collection (get, list, create, update, delete)
  - isAssignedToService() helper function for scoped list access
  - services_admin role template in defaultRoleTemplates
  - services_user role template in defaultRoleTemplates
  - setDoc upsert fix for sync-role-permissions.js (creates missing role documents)
affects:
  - 26-02 (role config UI needs services roles to exist)
  - 27-services-ui (services collection access depends on these rules)
  - 28-services-mrf-integration (services_user write restriction enforced here)
  - 29-mrf-services-extension (same)
  - 30-services-reporting (finance/procurement read access enabled here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Department silo pattern: services roles absent from operations collections, operations roles absent from services collection"
    - "Short-circuit isRole() guard before expensive isAssignedToService() call in allow list"
    - "isAssignedToService() mirrors isAssignedToProject() with all_services flag and assigned_service_codes map"
    - "setDoc upsert pattern: create document if not found, updateDoc if found with changes"

key-files:
  created: []
  modified:
    - firestore.rules
    - scripts/sync-role-permissions.js

key-decisions:
  - "isAssignedToService() placed after isLegacyOrAssigned() in HELPER FUNCTIONS to mirror existing project helper structure"
  - "services_user excluded from create/update/delete (SEC-04: read-only for services_user)"
  - "finance and procurement can get and list services (SEC-06) but cannot write"
  - "operations roles completely absent from services block to enforce department silo"
  - "setDoc used (not updateDoc) for NOT FOUND case to create role_templates documents that do not yet exist"
  - "finance_user and viewer legacy stubs retained in defaultRoleTemplates as expected orphaned entries"

patterns-established:
  - "Department silo: new department roles must not appear in other department collection rules"
  - "Assignment-scoped list: isRole('X_user') && isAssignedToX() short-circuit pattern"

requirements-completed:
  - ROLE-01
  - ROLE-02
  - ROLE-03
  - ROLE-04
  - ROLE-05
  - ROLE-06
  - ROLE-08
  - ROLE-09
  - ROLE-10
  - SEC-01
  - SEC-02
  - SEC-03
  - SEC-04
  - SEC-05
  - SEC-06

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 26 Plan 01: Security Roles Foundation Summary

**Firestore security rules for services collection with role-scoped access control, isAssignedToService() assignment filter, and services_admin/services_user role templates seeded via setDoc upsert**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `isAssignedToService()` helper function to firestore.rules that mirrors the existing `isAssignedToProject()` pattern with `all_services` flag support
- Added complete `match /services/{serviceId}` security block with correct access patterns: super_admin and services_admin can write; services_user is read-only and list-scoped by assignment; finance and procurement can read; operations roles fully excluded (department silo)
- Added `services_admin` and `services_user` objects to `defaultRoleTemplates` in sync-role-permissions.js (both have `services` tab, no `projects` tab to enforce silo)
- Fixed `NOT FOUND` branch in sync-role-permissions.js to use `setDoc` (upsert) instead of skipping — new role documents are now created automatically when running the sync as Super Admin

## Task Commits

Each task was committed atomically:

1. **Task 1: Add services collection Security Rules block and isAssignedToService() helper** - `5ce87d7` (feat)
2. **Task 2: Add services_admin and services_user to sync-role-permissions.js with setDoc fix** - `315e791` (feat)

**Plan metadata:** _(final commit hash to be filled after docs commit)_

## Files Created/Modified
- `firestore.rules` - Added `isAssignedToService()` helper in HELPER FUNCTIONS section and `match /services/{serviceId}` block at end of file
- `scripts/sync-role-permissions.js` - Added `services_admin` and `services_user` role templates, fixed NOT FOUND branch to use `setDoc`, added `setDoc` to import

## Decisions Made
- `isRole('services_user') && isAssignedToService(resource.data.service_code)` short-circuit guard in allow list prevents `isAssignedToService()` from being evaluated for users who don't have the services_user role (Pitfall 1 from RESEARCH.md avoided)
- `allow get` for services is more permissive than `allow list`: services_user can get individual documents without assignment check, while list queries require the assignment scope
- `isActiveUser()` is used as the outer guard in allow list (not as the only condition) — avoids the Pitfall 5 silo-breaking anti-pattern from RESEARCH.md
- `finance_user` and `viewer` legacy stubs retained in defaultRoleTemplates since removing them was out of scope and noted as orphaned-but-acceptable in the plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

When a Super Admin runs `await syncRolePermissions()` in the browser console (from the app), it will:
1. Create `role_templates/services_admin` document in Firestore (setDoc upsert)
2. Create `role_templates/services_user` document in Firestore (setDoc upsert)
3. Also create orphaned `role_templates/finance_user` and `role_templates/viewer` documents (legacy stubs — acceptable)

## Next Phase Readiness
- Security rules foundation is complete — the services collection is protected by Firestore rules
- Role templates for services_admin and services_user are defined in the sync script and will be seeded to Firestore on next sync run
- Phase 26 Plan 02 (role-config UI) can proceed: it adds services roles to the UI selection dropdowns

## Self-Check: PASSED

- FOUND: firestore.rules (contains isAssignedToService() and match /services/{serviceId})
- FOUND: scripts/sync-role-permissions.js (contains services_admin, services_user, setDoc)
- FOUND: commit 5ce87d7 (Task 1 - security rules)
- FOUND: commit 315e791 (Task 2 - role templates)

---
*Phase: 26-security-roles-foundation*
*Completed: 2026-02-18*
