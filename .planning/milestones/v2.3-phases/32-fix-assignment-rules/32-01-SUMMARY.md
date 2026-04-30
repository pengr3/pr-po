---
phase: 32-fix-assignment-rules
plan: 01
subsystem: database
tags: [firestore, security-rules, services, roles, permissions, emulator-tests]

# Dependency graph
requires:
  - phase: 31-dashboard-integration
    provides: services roles added to mrfs/prs/pos/transport_requests rules; getDashboardMode() for role-aware dashboard
  - phase: 28-services-view
    provides: syncServicePersonnelToAssignments(), service-assignments.js, loadServiceActiveUsers() — all blocked by the permission gap fixed here
provides:
  - firestore.rules with services_admin get + list + update access on services_user documents (role-scoped)
  - 6 emulator tests verifying services_admin user document access (3 assertSucceeds, 3 assertFails)
  - services_user Firestore query scoping in services.js and mrf-form.js
  - services_admin added to edit_history create rule
  - Role template documents for services_admin and services_user created in Firestore
affects:
  - 33-services-admin-assignment-ui
  - 34-services-user-filtered-views
  - Any phase using services_admin write operations or services_user filtered queries

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "services_admin update access scoped via get().data.role == 'services_user' — prevents privilege escalation to other roles (mirrors operations_admin pattern)"
    - "services_user query scoping: where('service_code', 'in', assignedCodes) for services_user; unfiltered for other roles"

key-files:
  created: []
  modified:
    - firestore.rules
    - test/firestore.test.js
    - app/views/services.js
    - app/views/mrf-form.js

key-decisions:
  - "services_admin update rule uses get(/databases/$(database)/documents/users/$(userId)).data.role — a fresh document read, NOT resource.data.role — prevents bypassing the scope by changing the role field during the update"
  - "services_user Firestore list rule evaluates isAssignedToService() per document; an unscoped query returns docs the user is not assigned to, causing Firestore to deny the entire query — fix is to scope the query at the call site with where('service_code', 'in', assignedCodes)"
  - "services_admin added to edit_history create rule — services.js reuses recordEditHistory() which writes to projects subcollection; rule was missing services_admin"

patterns-established:
  - "Role-scoped update pattern: isRole('X') && get(...).data.role == 'Y' — safe against role-change bypass, mirrors ops_admin"
  - "Query-side scoping for services_user: never rely solely on Firestore rules to filter list results — scope the query with 'in' clause at call site"

requirements-completed: [ASSIGN-03, ASSIGN-04, ASSIGN-06, ROLE-06, ROLE-11, SEC-03]

# Metrics
duration: ~60min (spread across verification session)
completed: 2026-02-19
---

# Phase 32 Plan 01: Fix Assignment Rules Summary

**Firestore Security Rules updated to grant services_admin get + list + update on services_user documents, unblocking the 6 cascading assignment requirements that were denied since Phase 28**

## Performance

- **Duration:** ~60 min (including verification and additional fixes)
- **Started:** 2026-02-19 (continuation from Phase 31 completion)
- **Completed:** 2026-02-19
- **Tasks:** 3 (including human-verify checkpoint — approved)
- **Files modified:** 4 (firestore.rules, test/firestore.test.js, app/views/services.js, app/views/mrf-form.js)

## Accomplishments

- Updated firestore.rules users block with 3 targeted additions: services_admin added to allow get, allow list, and allow update (update scoped to role == 'services_user' documents only)
- Added 6 new emulator tests covering services_admin user document access (3 assertSucceeds, 3 assertFails) — all passing
- Deployed updated rules to production Firebase
- Fixed services_user query scoping in services.js and mrf-form.js to prevent Firestore denying unscoped collection queries
- Fixed edit_history create rule to include services_admin (services.js reuses recordEditHistory() which writes to the subcollection)
- Created missing services_admin and services_user role template documents in Firestore
- Human verification: all 4 end-to-end checks passed (assignment write, filtered view, real-time propagation, operations_admin regression)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update firestore.rules — services_admin to users collection rules** - `6b271d9` (fix)
2. **Task 2: Add 6 emulator tests + run tests + deploy rules** - `3743f0b` (test)
3. **Task 3: Human verify (approved)** — no commit (verification checkpoint)

**Additional fixes during verification:**
- **services_user query scoping** — `9ffc0f1` (fix)
- **edit_history create rule — services_admin** — `6e6daac` (fix)

## Files Created/Modified

- `firestore.rules` — Added services_admin to users allow get, allow list, allow update; added services_admin to edit_history allow create
- `test/firestore.test.js` — New describe block "services_admin user document access" with 6 emulator tests
- `app/views/services.js` — Scope loadServices() query to assignedCodes for services_user role
- `app/views/mrf-form.js` — Scope services dropdown query to assignedCodes for services_user role; added active===true client-side filter for services_user path

## Decisions Made

1. **Fresh document read in update rule** — Used `get(...).data.role` instead of `resource.data.role`. `resource.data` is the doc before the write; a malicious actor could have changed the role field in the same update. Fresh `get()` ensures the check is against the actual persisted role, preventing privilege escalation. Mirrors the existing operations_admin pattern.

2. **Query-side scoping for services_user** — The `isAssignedToService()` rule function evaluates per document. An unscoped query requesting all services documents causes Firestore to evaluate the function against every document, denying the whole query for unassigned docs. Fix: scope the query at the call site with `where('service_code', 'in', assignedCodes)` for services_user. Same pattern applied in both services.js and mrf-form.js.

3. **edit_history create rule gap** — services.js reuses `recordEditHistory()` which writes to the `projects/{docId}/edit_history` subcollection. The subcollection create rule only covered operations_admin; services_admin was missing, causing a permission-denied error when services_admin updated service personnel. Added services_admin to the create condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] services_user query scoping in services.js and mrf-form.js**
- **Found during:** Task 3 (human verification — services_user filtered view check)
- **Issue:** services_user Firestore list rule evaluates isAssignedToService() per document. Unscoped queries return documents the user is not assigned to; Firestore denies the entire query. services_user saw no services at all.
- **Fix:** Added `where('service_code', 'in', assignedCodes)` scoping for services_user path in both services.js and mrf-form.js. Added active===true client-side filter for the services_user path (the 'in' query omits the active status filter).
- **Files modified:** app/views/services.js, app/views/mrf-form.js
- **Verification:** services_user session showed only assigned services after fix
- **Committed in:** 9ffc0f1

**2. [Rule 1 - Bug] services_admin missing from edit_history create rule**
- **Found during:** Task 3 (human verification — services_admin assignment write check)
- **Issue:** services.js calls `recordEditHistory()` which writes to `projects/{docId}/edit_history` subcollection. The create rule did not include services_admin, causing permission-denied even after the users collection fix passed.
- **Fix:** Added `|| isRole('services_admin')` to the edit_history create rule in firestore.rules.
- **Files modified:** firestore.rules
- **Verification:** services_admin assignment save succeeded with no console errors
- **Committed in:** 6e6daac

**3. [Rule 2 - Missing Critical] Missing services_admin and services_user role template documents**
- **Found during:** Task 3 (human verification — pre-condition for assignment workflow)
- **Issue:** Role templates for services_admin and services_user were absent from Firestore, preventing the permission matrix from loading correctly.
- **Fix:** Created role template documents directly in Firestore (via admin console or seed script).
- **Files modified:** Firestore data only (no code files)
- **Verification:** Role templates visible in Firestore; permission matrix loaded correctly

---

**Total deviations:** 3 auto-fixed (1 missing critical query scoping, 1 bug in rules, 1 missing critical data)
**Impact on plan:** All three fixes were required for the end-to-end assignment workflow to function. The original plan correctly identified the users collection rule gap; verification revealed two additional permission gaps that were blocking the same user story. No scope creep.

## Issues Encountered

The plan identified one root cause (users collection missing services_admin). Verification revealed two additional permission gaps in the same change surface (edit_history subcollection rule, and query-side scoping). All three gaps were in the same domain (services_admin assignment workflow) and required coordinated fixes before the end-to-end story was complete.

## User Setup Required

None - no external service configuration required. Role template documents created directly in Firestore during verification.

## Next Phase Readiness

- Firestore security rules fully support the services_admin assignment workflow
- services_user filtered view is functional (query scoped at call site)
- All 6 requirements (ASSIGN-03, ASSIGN-04, ASSIGN-06, ROLE-06, ROLE-11, SEC-03) satisfied
- Ready for Phase 33 (services_admin assignment UI polish) and Phase 34 (services_user filtered views)

---
*Phase: 32-fix-assignment-rules*
*Completed: 2026-02-19*

## Self-Check: PASSED

- FOUND: .planning/phases/32-fix-assignment-rules/32-01-SUMMARY.md
- FOUND: firestore.rules
- FOUND: test/firestore.test.js
- FOUND: app/views/services.js
- FOUND: app/views/mrf-form.js
- FOUND commit 6b271d9 (fix 32-01 users rules)
- FOUND commit 3743f0b (test 32-01 emulator tests + deploy)
- FOUND commit 9ffc0f1 (fix services_user query scoping)
- FOUND commit 6e6daac (fix edit_history create rule)
- FOUND commit d75f631 (docs 32-01 complete metadata)
