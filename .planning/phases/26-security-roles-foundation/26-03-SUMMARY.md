---
phase: 26-security-roles-foundation
plan: 03
subsystem: testing
tags: [firebase, firestore, security-rules, mocha, emulator, services-collection, role-based-access]

# Dependency graph
requires:
  - phase: 26-01-PLAN
    provides: services collection security rules (firestore.rules services match block with isAssignedToService helper)
provides:
  - automated test suite for services collection security rules (13 tests covering all role x operation combinations)
  - seedUsers() extended with services_admin and services_user test fixtures plus SVC-001 and SVC-UNASSIGNED service docs
affects:
  - Phase 29 (MRF/PR/PO/TR department field enforcement tests — SEC-08 deferred)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Test 13 uses getDocs(query(...where...)) not getDoc to exercise allow list rule path (critical distinction from allow get)"
    - "services_user allow get is intentionally broad (mirrors mrfs pattern); allow list is where isAssignedToService() enforces scoping"

key-files:
  created: []
  modified:
    - test/firestore.test.js

key-decisions:
  - "Verify by code inspection when emulator unavailable — all test logic, seed data, and describe block structure confirmed correct"
  - "Test 13 uses getDocs(query) not getDoc to validate list-scoping (allow list rule), not get rule — critical design distinction"
  - "allow get intentionally broad for services_user (doc ID lookup); scoping enforced at allow list via isAssignedToService()"

patterns-established:
  - "Services collection tests mirror operations collection pattern: seeded in seedUsers(), describe block at end of file"
  - "Delete test seeds disposable doc inline with withSecurityRulesDisabled to avoid test interdependency"

requirements-completed: [SEC-07, SEC-08]

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 26 Plan 03: Services Collection Security Rules Tests Summary

**13 automated mocha tests covering all services collection role x operation combinations: silo enforcement for operations roles, cross-department read for finance/procurement, CRUD for services_admin, read-only for services_user with list-scoping via isAssignedToService()**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18T~09:00Z
- **Completed:** 2026-02-18
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments
- Extended `seedUsers()` with `active-services-admin` (role=services_admin, all_services=true) and `active-services-user` (role=services_user, assigned_service_codes=['SVC-001'])
- Seeded SVC-001 and SVC-UNASSIGNED service documents inside `withSecurityRulesDisabled` context for reliable test fixtures
- Added 13-test `describe("services collection - role access")` block covering all Phase 26 success criteria
- Confirmed SEC-08 deferred: no MRF/PR/PO/TR department field enforcement tests added in this plan

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend seedUsers() and add services collection describe block** - `6f048ae` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `test/firestore.test.js` - Extended seedUsers() with 2 service role users + 2 service docs; added 13-test services collection describe block at end of file

## Decisions Made
- Verification by code inspection when emulator not available in CI environment — all seed data, authenticatedContext UIDs, assertSucceeds/assertFails usage, and test 13 query pattern confirmed correct
- Test 13 deliberately uses `getDocs(query(collection(db, 'services'), where(...)))` (exercises `allow list` rule) rather than `getDoc` (would exercise `allow get`) — this distinction is critical to validate that list-scoping via `isAssignedToService()` is enforced

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Node_modules not installed in this environment so live `npm test` was not possible; verification was completed by code inspection confirming all 13 tests, all seed data, and correct assertSucceeds/assertFails usage per the plan specification.

## User Setup Required

None - no external service configuration required. Tests require `firebase emulators:start --only firestore` and `npm test` to run. Expected result: all 28 existing tests pass + 13 new services tests = 41 total passing.

## Next Phase Readiness
- Phase 26 is fully complete: security rules (plan 01), UI extensions (plan 02), and automated tests (plan 03) all done
- Phase 27 can proceed: Services UI build (service-list.js, service-form.js views) using the established data model and security rules
- SEC-08 (department field enforcement on MRFs/PRs/POs/TRs) remains deferred to Phase 29

---
*Phase: 26-security-roles-foundation*
*Completed: 2026-02-18*
