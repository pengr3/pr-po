---
phase: 27-code-generation
plan: 01
subsystem: database
tags: [firestore, utils, service-codes, project-codes, shared-sequence]

# Dependency graph
requires:
  - phase: 26-security-roles-foundation
    provides: assigned_service_codes and all_services fields on users documents (written by user-management.js approval/role-change flows)
provides:
  - generateServiceCode() in app/utils.js — async function querying both projects and services collections via Promise.all to prevent code collisions
  - getAssignedServiceCodes() in app/utils.js — sync function mirroring getAssignedProjectCodes() for services_user role scoping
affects:
  - 28-services-ui (will call generateServiceCode() to create new service documents)
  - Any future view that reads services and needs to filter by assigned_service_codes

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Shared sequence counter via parallel getDocs queries (Promise.all across two collections) to prevent code collisions between related record types

key-files:
  created: []
  modified:
    - app/utils.js

key-decisions:
  - "generateServiceCode() queries both projects AND services collections to maintain a shared CLMC_CLIENT_YYYY### sequence (SERV-02) — prevents a service getting a code already used by a project for the same client/year"
  - "getAssignedServiceCodes() role guard uses services_user (not services_admin) — only services_user is scoped; services_admin falls through to null (no filter)"
  - "Service documents MUST store a client_code field for the range query to work — documented in Phase 28 prerequisite note in plan"

patterns-established:
  - "Parallel query pattern: Promise.all([getDocs(projectsQuery), getDocs(servicesQuery)]) for shared sequence generation across two Firestore collections"
  - "Role-scoped access helper: getAssigned*Codes() returns null (no filter) for non-scoped roles, array for scoped role, empty array for scoped role with zero assignments"

requirements-completed:
  - SERV-02

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase 27 Plan 01: Code Generation Summary

**generateServiceCode() and getAssignedServiceCodes() added to app/utils.js, sharing a CLMC_CLIENT_YYYY### sequence with the projects collection via Promise.all parallel query (SERV-02)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-18T11:41:19Z
- **Completed:** 2026-02-18T11:46:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `generateServiceCode(clientCode, year=null)` that queries both `projects` and `services` Firestore collections in parallel, ensuring no two records ever share the same CLMC code for a given client/year
- Added `getAssignedServiceCodes()` that returns null for all roles except `services_user`, and returns the user's assigned service codes array (or empty array) for scoped `services_user` accounts
- Both functions exported from `app/utils.js` and registered on `window.utils` and as standalone `window.generateServiceCode` / `window.getAssignedServiceCodes` properties

## Task Commits

Each task was committed atomically:

1. **Task 1: Add generateServiceCode() and getAssignedServiceCodes() to app/utils.js** - `0f9091b` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `app/utils.js` - Added 80 lines: two new exported functions (generateServiceCode, getAssignedServiceCodes), both entries in window.utils object, and two standalone window registrations

## Decisions Made
- Used `Promise.all` to query both collections in parallel rather than sequential queries — lower latency and cleaner code
- Role guard uses `user.role !== 'services_user'` (not `services_admin`) per plan constraint — services_admin gets no filter (null), which is intentionally correct
- `all_services === true` escape hatch mirrors the `all_projects` pattern from Phase 26

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 28 (Services UI) can now call `window.generateServiceCode(clientCode)` when creating new service documents
- Phase 28 MUST store `client_code` field on service documents for the range query in `generateServiceCode()` to return correct results
- `getAssignedServiceCodes()` is ready for Phase 28 services list view to apply role-based filtering

## Self-Check: PASSED

- FOUND: app/utils.js (modified, 80 lines added)
- FOUND: commit 0f9091b (feat(27-01): add generateServiceCode() and getAssignedServiceCodes() to utils.js)
- generateServiceCode exported at line 262, in window.utils at line 519, standalone window at line 535
- getAssignedServiceCodes exported at line 313, in window.utils at line 520, standalone window at line 536
- Promise.all pattern confirmed at lines 269-282 (projects + services parallel query)
- Role guard `user.role !== 'services_user'` confirmed at line 316

---
*Phase: 27-code-generation*
*Completed: 2026-02-18*
