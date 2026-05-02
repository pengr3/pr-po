---
phase: 29-mrf-integration
plan: 01
subsystem: ui
tags: [firestore, firebase, mrf-form, role-based-access, services, dropdowns]

# Dependency graph
requires:
  - phase: 28-services-view
    provides: services Firestore collection with active boolean field and service_code field
  - phase: 27-code-generation
    provides: getAssignedServiceCodes() in utils.js exported to window
  - phase: 26-security-roles-foundation
    provides: services_user and services_admin roles in role system
provides:
  - role-aware dropdown visibility in mrf-form.js (projects vs services vs both)
  - loadServices() with real-time onSnapshot listener on services collection
  - populateServiceDropdown() with services_user assignment filtering
  - serviceNameGroup HTML block in render() with select#serviceName
affects: [29-02-PLAN, 29-03-PLAN, mrf submission flow, services users]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-aware dropdown visibility: show/hide divs by id in init() based on user.role"
    - "Mirror pattern: loadServices/populateServiceDropdown mirrors loadProjects/populateProjectDropdown exactly"
    - "Firestore boolean query: where('active', '==', true) -- services use boolean not status string"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js

key-decisions:
  - "projectNameGroup and serviceNameGroup are wrapper divs controlled via style.display in init() -- no required attribute on hidden selects avoids browser validation firing on hidden fields"
  - "loadProjects() called unconditionally for all roles (even services-only) to avoid listener gaps; projectGroup display:none hides it visually"
  - "services_admin gets null from getAssignedServiceCodes() (no filter applied) -- services_user gets array filter; mirrors operations role pattern exactly"
  - "assignmentChangeHandler now calls both populateProjectDropdown() and populateServiceDropdown() to handle simultaneous assignment refresh"

patterns-established:
  - "Dropdown group IDs: use id=projectNameGroup and id=serviceNameGroup as control targets, not the select elements directly"
  - "Role arrays are exhaustive include lists: showProjects checks 5 roles, showServices checks 5 roles, overlap is intentional for shared roles"

requirements-completed: [MRF-01, MRF-02, MRF-03, MRF-04, MRF-05, MRF-06]

# Metrics
duration: 15min
completed: 2026-02-18
---

# Phase 29 Plan 01: MRF Form Role-Based Dropdown Visibility Summary

**Role-gated project/service dropdowns in mrf-form.js: operations roles see Projects only, services roles see Services only, shared roles (super_admin, finance, procurement) see both — with live Firestore listener filtered by active boolean and sorted most-recent-first**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `id="projectNameGroup"` and `id="serviceNameGroup"` wrapper divs to `render()` HTML, enabling `init()` to show/hide each independently without touching the inner form-group structure
- Implemented `loadServices()` with `onSnapshot(where('active', '==', true))` — mirrors `loadProjects()` pattern exactly, with `created_at` descending sort (MRF-06)
- Implemented `populateServiceDropdown()` with `getAssignedServiceCodes()` filtering for services_user and "CLMC_CODE_YYYY### - Service Name" format (MRF-04)
- Updated `init()` with role detection: 5-role arrays for `showProjects` and `showServices`, DOM visibility toggled via `style.display`
- Updated `destroy()` to unsubscribe `servicesListener` and clear `cachedServices`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Services dropdown HTML block to render()** - `183bd20` (feat)
2. **Task 2: Add servicesListener, loadServices(), populateServiceDropdown(), role-aware init()** - `11bd3b9` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `app/views/mrf-form.js` - Added serviceNameGroup HTML, loadServices(), populateServiceDropdown(), role-based init() visibility logic, services destroy() cleanup

## Decisions Made
- `required` attribute removed from `#projectName` select (was present before) and not added to `#serviceName` -- browser native validation cannot be used on conditionally-hidden selects; Plan 02 handles JS validation
- `loadProjects()` is called for all roles (not just project-visible roles) to avoid a timing gap where the projects listener might not be set up if a super_admin switches to a role -- the group is simply hidden via CSS, but the listener runs
- Role arrays are explicit include lists rather than exclude lists for clarity and to avoid accidental access grants when new roles are added

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01 complete: services dropdown renders correctly for all 7 role types
- Plan 02 (form submission validation) can now reference `#serviceNameGroup` visibility to determine which dropdown to validate
- Plan 03 (MRF display/detail) can reference `service_code` field saved during submission

---
*Phase: 29-mrf-integration*
*Completed: 2026-02-18*
