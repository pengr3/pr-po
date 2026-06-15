---
phase: 28-services-view
plan: 03
subsystem: ui
tags: [firebase, firestore, javascript, spa, services, admin, personnel-pills]

# Dependency graph
requires:
  - phase: 28-01
    provides: syncServicePersonnelToAssignments, getAssignedServiceCodes in utils.js; seed data for roles
  - phase: 28-02
    provides: services.js list view, router.js /service-detail route, services Firestore collection
provides:
  - app/views/service-detail.js — full-page service detail with inline editing, personnel pills, expense stub
  - app/views/service-assignments.js — admin panel assigning services to services_user accounts
  - admin.js SECTIONS extended with service_assignments (4th section)
affects:
  - phase-29 (MRF-Service integration will replace expense stub in Financial Summary card)
  - any phase touching services_user permission scoping

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service detail mirrors project-detail.js pattern: 3-card layout with onblur/onchange inline saves"
    - "Personnel pill IDs prefixed serviceDetail* to avoid collision with project-detail.js"
    - "Expense stub pattern: placeholder message rather than real aggregation until integration phase"
    - "checkServiceAccess() mirrors checkProjectAccess() — null = no filter, array = scoped services_user"
    - "Admin section data-driven from SECTIONS object — adding entry auto-generates nav button"

key-files:
  created:
    - app/views/service-detail.js
    - app/views/service-assignments.js
  modified:
    - app/views/admin.js

key-decisions:
  - "recordEditHistory called with service doc ID — reuses same subcollection pattern as projects (projects/{id}/edit_history pattern stays consistent)"
  - "Expense breakdown is a stub with Phase 29 message — no aggregation query needed now"
  - "service-assignments.js queries all services (not filtered by active) — admin needs to assign inactive services too"
  - "Service Assignments section placed 4th in SECTIONS after assignments (project-assignments) for logical grouping"

patterns-established:
  - "Personnel pill container IDs: serviceDetailPillContainer, serviceDetailPersonnelDropdown, serviceDetailPersonnelSearch"
  - "Window functions in service-detail: saveServiceField, toggleServiceDetailActive, selectDetailServicePersonnel, removeDetailServicePersonnel, filterDetailServicePersonnelDropdown, showDetailServicePersonnelDropdown"
  - "Window functions in service-assignments: handleAllServicesChange, handleServiceCheckboxChange"

requirements-completed: [SERV-04, SERV-10, SERV-11, ASSIGN-01, ASSIGN-02, ASSIGN-03, ASSIGN-05]

# Metrics
duration: 25min
completed: 2026-02-18
---

# Phase 28 Plan 03: Service Detail and Service Assignments Summary

**Service detail page with 3-card inline editing, personnel pill management, and admin service-assignments panel for services_user role scoping**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-18T04:59:51Z
- **Completed:** 2026-02-18T05:25:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created service-detail.js (729 lines) — full-page detail loaded via #/services/detail/CODE route, 3-card layout with inline editing saving to Firestore services collection
- Created service-assignments.js (263 lines) — admin panel showing services_user/services_admin accounts with per-service checkboxes; saves to assigned_service_codes on Firestore users documents
- Updated admin.js SECTIONS with service_assignments 4th entry — Service Assignments button auto-renders via Object.entries(SECTIONS) iteration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create app/views/service-detail.js** - `5079e45` (feat)
2. **Task 2: Create service-assignments.js and update admin.js** - `9f660c4` (feat)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `app/views/service-detail.js` — 3-card service detail: Service Info (service_code locked, service_name editable, service_type badge, client locked, personnel pills), Financial Summary (budget, contract_cost, expense stub), Status & Assignment (internal_status, project_status selects). Inline saves via onblur/onchange, recordEditHistory on each save, syncServicePersonnelToAssignments on personnel change.
- `app/views/service-assignments.js` — Admin panel for services_user/services_admin. Two onSnapshot listeners (users, services). handleAllServicesChange writes all_services flag. handleServiceCheckboxChange writes full assigned_service_codes array. destroy() cleans up both listeners and window functions.
- `app/views/admin.js` — Added service_assignments entry to SECTIONS object; Service Assignments label appears automatically in admin nav.

## Decisions Made
- Used `recordEditHistory(currentServiceDocId, action, changes)` with service doc ID — the edit-history module writes to `projects/{id}/edit_history` collection path but accepts any doc ID as the first argument. This reuses the existing pattern without code changes.
- Expense breakdown rendered as stub message per plan spec — real aggregation deferred to Phase 29 MRF-Service integration.
- service-assignments.js queries all services (not filtered by `active === true`) so admin can assign inactive services too.
- checkServiceAccess() returns null from getAssignedServiceCodes() for non-services_user roles (no filtering), mirrors checkProjectAccess() pattern exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 28 complete: services list view, service detail, service assignments admin panel all shipped
- Phase 29 (MRF-Service integration) can replace the expense stub in service-detail.js Financial Summary card
- #/services/detail/CODE routing already wired in router.js (from 28-02), so service rows in services.js can now link to detail pages

---
*Phase: 28-services-view*
*Completed: 2026-02-18*
