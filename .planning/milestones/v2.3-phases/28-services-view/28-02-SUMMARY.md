---
phase: 28-services-view
plan: 02
subsystem: ui
tags: [firebase, firestore, services, crud, pagination, personnel-pills, routing]

# Dependency graph
requires:
  - phase: 28-01
    provides: syncServicePersonnelToAssignments(), getAssignedServiceCodes(), assignmentsChanged event
  - phase: 27-code-generation
    provides: generateServiceCode() utility for CLMC code generation

provides:
  - app/views/services.js — full Services list view with CRUD, two sub-tabs, personnel pill UI, and assignment scoping
  - app/router.js — /services and /service-detail routes with detail hash handling in both handleHashChange and handleInitialRoute
  - index.html — Services nav link between Projects and Material Request

affects:
  - 28-03-PLAN (service-detail.js imports from services collection set up here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "services.js mirrors projects.js exactly — same module structure, state shape, pill UI, pagination, and edit-history recording"
    - "Sub-tab filtering by service_type stored in module-level currentActiveTab — persists across re-renders without router rebuild"
    - "All window functions use Service-prefixed names (e.g., addService not addProject) to prevent collision with projects.js when both views co-exist in the same JS environment"
    - "services_user scope via getAssignedServiceCodes() returning null (no filter) or string[] (scoped) in applyServiceFilters()"
    - "Detail hash routing: #/services/detail/CODE -> /service-detail handled in both handleHashChange and handleInitialRoute"

key-files:
  created:
    - app/views/services.js
  modified:
    - app/router.js
    - index.html

key-decisions:
  - "currentActiveTab is a module-level variable (not per-render param) so sub-tab state survives router re-renders without URL changes"
  - "services_admin and super_admin can create/delete; operations users see edit/toggle but no delete button (role check per button)"
  - "service-detail route registered even though service-detail.js does not exist yet — it will be created in 28-03; route defined here to enable #/services/detail/CODE links from the list"

patterns-established:
  - "Services view pattern: same card layout as projects but with sub-tab bar inside card header div alongside title and action button"
  - "Service type display: service_type='one-time' -> 'One-Time', 'recurring' -> 'Recurring' in table"

requirements-completed: [SERV-01, SERV-03, SERV-05, SERV-06, SERV-07, SERV-08, SERV-09, SERV-12, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, ASSIGN-01, ASSIGN-02, ASSIGN-04]

# Metrics
duration: 20min
completed: 2026-02-18
---

# Phase 28 Plan 02: Services View Summary

**Services list view (services.js ~1,277 lines) with two sub-tabs, personnel pills, role-scoped CRUD, and router/nav wiring for /services and /service-detail routes**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-02-18T04:52:15Z
- **Completed:** 2026-02-18T05:12:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `app/views/services.js` — full Services list view mirroring projects.js with two sub-tabs (Services/Recurring) that filter by `service_type='one-time'|'recurring'`, personnel pill UI with `#servicePillContainer` / `#servicePersonnelDropdown` / `#servicePersonnelSearchInput`, `services_user` scope via `getAssignedServiceCodes()`, `assignmentsChanged` listener registered/cleaned as `window._servicesAssignmentHandler`, all 15 window functions using Service-prefixed names (zero collision with projects.js)
- Updated `app/router.js` — added `'/services': 'services'` and `'/service-detail': 'services'` to `routePermissionMap`, added both route entries to `routes` object, added detail hash check in `handleHashChange()` and `handleInitialRoute()`
- Updated `index.html` — added `<a href="#/services" class="nav-link" data-route="services">Services</a>` as 4th nav item (after Projects, before Material Request)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create app/views/services.js — Services list view** - `be9756d` (feat)
2. **Task 2: Update app/router.js and index.html for Services routes** - `985570b` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified
- `app/views/services.js` - Services list view: render/init/destroy, CRUD, sub-tab filtering, personnel pills, pagination (1,277 lines)
- `app/router.js` - Added /services and /service-detail routes, detail hash routing in handleHashChange and handleInitialRoute
- `index.html` - Added Services nav link between Projects and Material Request

## Decisions Made
- `currentActiveTab` stored as module-level variable so sub-tab state persists when the router calls `render()` and `init()` with a new tab parameter — avoids losing state between re-renders
- `service-detail` route defined in router even though `service-detail.js` does not yet exist — this enables `#/services/detail/CODE` links to resolve correctly after 28-03 ships the view
- Delete button conditionally rendered (only for services_admin and super_admin) while Edit/Activate buttons are shown to all users with services edit permission

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `app/views/services.js` is complete and routed — navigating to `#/services` will load the two-sub-tab view
- Plan 28-03 can now create `app/views/service-detail.js` and `app/views/service-assignments.js` — the router route `/service-detail` is already registered

## Self-Check

- [x] `app/views/services.js` exists with render/init/destroy exports
- [x] `app/views/services.js` contains `generateServiceCode`, `getAssignedServiceCodes`, `syncServicePersonnelToAssignments` imports
- [x] `app/views/services.js` has `#servicePillContainer`, `#servicePersonnelDropdown`, `#servicePersonnelSearchInput` IDs
- [x] `app/views/services.js` has `assignmentsChanged` listener and `_servicesAssignmentHandler` cleanup
- [x] No bare `selectPersonnel`/`removePersonnel` window names — all Service-prefixed
- [x] `app/router.js` has `/services` in routePermissionMap, routes object, handleHashChange, handleInitialRoute
- [x] `index.html` has `data-route="services"` in correct nav position
- [x] Commits be9756d and 985570b verified in git log

## Self-Check: PASSED

---
*Phase: 28-services-view*
*Completed: 2026-02-18*
