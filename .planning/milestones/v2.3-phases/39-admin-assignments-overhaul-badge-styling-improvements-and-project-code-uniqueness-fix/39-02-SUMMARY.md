---
phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix
plan: 02
subsystem: ui
tags: [vanilla-js, firebase, firestore, admin, assignments, modal]

# Dependency graph
requires:
  - phase: 28-services-view
    provides: service-assignments.js pattern (service user assignment management)
  - phase: 26-security-roles-foundation
    provides: services_admin/services_user roles and assigned_service_codes field
  - phase: 15-admin-panel
    provides: admin.js wrapper with SECTIONS dynamic-import pattern

provides:
  - Unified assignments.js module replacing project-assignments.js and service-assignments.js
  - Table + modal interface: users table with Name/Role/Count/Manage columns
  - Searchable per-user modal with checkboxes for project or service assignment
  - admin.js SECTIONS map reduced from 4 to 3 entries

affects:
  - Any phase that adds new assignable roles (would extend the user filter in renderUsersTable)
  - Any phase modifying the assignment data model (assigned_project_codes / assigned_service_codes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modal open guard in renderUsersTable(): if pendingModalCodes !== null, skip re-render to prevent modal disappearing on Firestore snapshot"
    - "window._pendingModalCodes exposes the Set to inline onchange handlers in modal checkbox items"
    - "Migrate-on-edit for legacy all_projects/all_services flag: pre-check all items in modal, write explicit array + clear flag on Save"

key-files:
  created:
    - app/views/assignments.js
  modified:
    - app/views/admin.js

key-decisions:
  - "users query uses where('status','==','approved') not role-based filter — all approved users loaded once, filtered client-side by sub-tab role scope"
  - "pendingModalCodes exposed on window._pendingModalCodes for inline onchange handlers (checkbox elements don't have access to module closure)"
  - "saveManageModal removes modal from DOM before await updateDoc — gives immediate feedback, avoids modal-open state race if save is slow"
  - "Reverse personnel sync fires only for type==='projects'; services intentionally asymmetric (per Phase 28 research decision)"
  - "project-assignments.js and service-assignments.js left as dead code — no risky file deletes; can be cleaned up in a future phase"

patterns-established:
  - "Modal re-render guard: check if pendingModalCodes !== null before overwriting table container from onSnapshot callbacks"
  - "Migrate-on-edit: open modal pre-checks all items for legacy all_* users; Save writes explicit array and clears flag"

requirements-completed:
  - ADMIN-01
  - ADMIN-02
  - ADMIN-03
  - ADMIN-04

# Metrics
duration: 18min
completed: 2026-02-24
---

# Phase 39 Plan 02: Admin Assignments Overhaul Summary

**Unified assignments.js replaces bloated per-user checkbox pages with table+modal interface — admin views O(users) rows, opens per-user modal with searchable checkboxes to assign projects or services**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-24T00:00:00Z
- **Completed:** 2026-02-24T00:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- New `assignments.js` view module with render/init/destroy lifecycle pattern — single module handles both Projects and Services sub-tabs
- Users table with Name, Role, Assignment Count (handles "All (legacy)" for old all_projects flag), and [Manage] button per row
- Searchable per-user modal: checkbox list of all projects or services, Save writes explicit codes to Firestore, Cancel discards changes
- Legacy `all_projects/all_services` flag migrated on first Save (pre-checks all items, writes explicit array, sets flag to false)
- Modal stays open during background Firestore snapshot updates (pendingModalCodes guard blocks renderUsersTable re-render)
- Reverse personnel sync preserved: on project assignment Save, project docs' `personnel_user_ids`/`personnel_names` updated via arrayUnion/arrayRemove
- `admin.js` SECTIONS reduced from 4 to 3 — "Service Assignments" tab removed, "Assignments" now loads `assignments.js`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unified assignments.js module** - `6ae8466` (feat)
2. **Task 2: Update admin.js SECTIONS map to use new assignments.js** - `76413b7` (feat)

## Files Created/Modified

- `app/views/assignments.js` — New unified assignments view module (render/init/destroy, users table, searchable modal, reverse sync)
- `app/views/admin.js` — SECTIONS map: assignments now loads assignments.js, service_assignments entry removed

## Decisions Made

- Used `where('status', '==', 'approved')` on the users query rather than a role-in filter — all approved users loaded, filtered client-side by sub-tab (operations roles for Projects, services roles for Services). Simpler than multiple separate queries.
- `pendingModalCodes` (a `Set`) is exposed on `window._pendingModalCodes` so inline `onchange` attribute handlers in the modal checkboxes can add/remove codes. Module closure is not accessible from inline handlers.
- Modal is removed from DOM before the `await updateDoc()` call in `saveManageModal()` — gives immediate UI feedback and avoids UI state inconsistency if the Firestore write is slow.
- `syncAssignmentToPersonnel()` fires only when `type === 'projects'`. Services have no reverse sync — this is the intentional asymmetry established in Phase 28.
- Old `project-assignments.js` and `service-assignments.js` are left as unreferenced dead code, not deleted — avoids risky deletes, can be cleaned up in a future tech debt phase.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all patterns were well-researched and the implementation followed the plan without unexpected blockers.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Unified Assignments tab is ready. Admin navigates to #/admin → Assignments to see the new table+modal interface.
- Plan 03 (Badge Styling Improvements) and Plan 04 (Project Code Uniqueness Fix) can proceed independently — no dependencies on this plan's changes.

---
*Phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix*
*Completed: 2026-02-24*
