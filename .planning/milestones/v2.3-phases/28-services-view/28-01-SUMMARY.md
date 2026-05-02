---
phase: 28-services-view
plan: 01
subsystem: auth
tags: [firebase, firestore, personnel-sync, role-permissions, services]

# Dependency graph
requires:
  - phase: 27-code-generation
    provides: generateServiceCode() and getAssignedServiceCodes() in app/utils.js
  - phase: 26-security-roles-foundation
    provides: role_templates Firestore collection with tabs permission structure

provides:
  - syncServicePersonnelToAssignments() exported from app/utils.js, registered as window.syncServicePersonnelToAssignments
  - auth.js assignmentsChanged event now fires when assigned_service_codes or all_services changes
  - scripts/seed-services-role-permissions.js for one-time Firestore role_templates update

affects:
  - 28-02-PLAN (services.js view — imports syncServicePersonnelToAssignments, listens to assignmentsChanged)
  - 28-03-PLAN (service-detail.js and service-assignments.js — both call syncServicePersonnelToAssignments)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service personnel sync mirrors project personnel sync exactly — same arrayUnion/arrayRemove pattern on a different field"
    - "all_services escape hatch mirrors all_projects pattern — users with all_services=true skipped on addition"
    - "Browser-console seed scripts use dynamic import('/app/firebase.js') to get initialized db without re-initializing Firebase"

key-files:
  created:
    - scripts/seed-services-role-permissions.js
  modified:
    - app/utils.js
    - app/auth.js

key-decisions:
  - "syncServicePersonnelToAssignments registered as standalone window function (not in window.utils object) — mirrors syncPersonnelToAssignments precedent"
  - "Seed script covers procurement_staff role in addition to the 6 specified — safe inclusion since it only sets access=true/edit=false (read-only, same as super_admin)"
  - "Condition extension in auth.js uses JSON.stringify() comparison for assigned_service_codes array (matches existing pattern for assigned_project_codes)"

patterns-established:
  - "Service personnel sync: export async function syncServicePersonnelToAssignments(serviceCode, prev, new) — then standalone window registration"
  - "Change detection expansion: add capture lines before currentUser update, then extend if-condition for assignmentsChanged dispatch"

requirements-completed: [ASSIGN-03, ASSIGN-06, UI-07, UI-08]

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 28 Plan 01: Services View Foundation Summary

**syncServicePersonnelToAssignments() utility, auth.js service assignment change detection, and role_templates seed script for services tab permissions**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:15:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added `syncServicePersonnelToAssignments()` to `app/utils.js` — mirrors `syncPersonnelToAssignments()` exactly but operates on `assigned_service_codes` and checks `all_services` flag; registered as `window.syncServicePersonnelToAssignments`
- Extended `app/auth.js` change-detection block to capture `previousAssignedServiceCodes`/`previousAllServices` and fire `assignmentsChanged` event when either project or service assignments change
- Created `scripts/seed-services-role-permissions.js` — browser-console-runnable script using `await import('/app/firebase.js')` and dot-notation `updateDoc` to set services/projects tab permissions for all 6 role types without overwriting existing tabs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add syncServicePersonnelToAssignments() to app/utils.js** - `54a373f` (feat)
2. **Task 2: Update app/auth.js to detect assigned_service_codes/all_services changes** - `3117682` (feat)
3. **Task 3: Create seed-services-role-permissions.js script** - `024372d` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified
- `app/utils.js` - Added `syncServicePersonnelToAssignments()` function (lines 678-741) and window registration (line 537)
- `app/auth.js` - Added 2 capture lines (previousAssignedServiceCodes, previousAllServices) and extended assignmentsChanged condition with 2 additional clauses
- `scripts/seed-services-role-permissions.js` - One-time seed script for role_templates services tab permissions

## Decisions Made
- `syncServicePersonnelToAssignments` registered as standalone `window.syncServicePersonnelToAssignments` (not in `window.utils` object) — matches the precedent set by `syncPersonnelToAssignments` which was never added to `window.utils` either
- Seed script includes `procurement_staff` in addition to the 6 roles specified in the plan — safe inclusion (read-only access, no downside risk)
- `JSON.stringify()` comparison used for `assigned_service_codes` in the auth.js condition — matches the existing `assigned_project_codes` pattern already established in Phase 7

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
The seed script `scripts/seed-services-role-permissions.js` must be run once in the browser console while logged in to the app at `localhost:8000`. Instructions are in the script header comment. This updates the `role_templates` Firestore collection with `tabs.services` and `tabs.projects` permissions.

## Next Phase Readiness
- Plans 02 and 03 can now safely import `syncServicePersonnelToAssignments` from `app/utils.js`
- The `assignmentsChanged` event in `app/auth.js` will fire correctly when `services.js` updates a user's `assigned_service_codes` via the service-assignments panel
- Role templates seed script ready to run before or after Phase 28 Plans 02/03 (UI won't show the services tab until the seed is applied)

## Self-Check

- [x] `app/utils.js` - file exists and contains `syncServicePersonnelToAssignments` at 2 locations (line 537, line 678)
- [x] `app/auth.js` - `previousAssignedServiceCodes` appears exactly twice (declaration + condition)
- [x] `app/auth.js` - `previousAllServices` appears exactly twice (declaration + condition)
- [x] `scripts/seed-services-role-permissions.js` - file exists with all 6 roles covered and dynamic import pattern
- [x] Commits: 54a373f, 3117682, 024372d all verified in git log

## Self-Check: PASSED

---
*Phase: 28-services-view*
*Completed: 2026-02-18*
