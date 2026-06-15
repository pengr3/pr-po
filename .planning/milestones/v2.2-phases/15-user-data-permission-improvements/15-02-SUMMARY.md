---
phase: 15-user-data-permission-improvements
plan: 02
subsystem: auth
tags: [permissions, role-based-access-control, user-datalist, html5-datalist, firebase-firestore, real-time-listeners]

# Dependency graph
requires:
  - phase: 08-role-permission-system
    provides: getCurrentUser() helper and role-based permission checks
  - phase: 10-users-collection
    provides: users collection with full_name, email, status fields
provides:
  - Role-guarded project creation (only super_admin and operations_admin can create projects)
  - Personnel field transformed from freetext to validated user selection using HTML5 datalist
  - personnel_user_id and personnel_name fields for referential integrity (migrate-on-edit strategy)
  - Real-time user datalist via onSnapshot listener
affects: [16-procurement-data-integrity, 17-reporting-enhancements, future-project-assignment-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HTML5 datalist pattern for user selection with backward compatibility"
    - "Migrate-on-edit strategy: new projects use new fields, editing existing projects migrates to new fields when datalist match occurs"
    - "Freetext fallback preserves legacy field when user types non-datalist value"

key-files:
  created: []
  modified:
    - app/views/projects.js
    - app/views/project-detail.js

key-decisions:
  - "Personnel field required for new project creation (enforces accountability)"
  - "Store both personnel_user_id (for queries) and personnel_name (for display) to avoid extra lookups"
  - "Migrate-on-edit strategy preserves backward compatibility while migrating data incrementally"
  - "Freetext fallback allows edge cases where non-users might be assigned (contractors, external)"

patterns-established:
  - "Role-specific button visibility: canCreateProject checks super_admin || operations_admin (more specific than generic canEditTab)"
  - "Validation before Firestore write: validatePersonnelSelection() prevents invalid data at client level"
  - "Duplicate loadActiveUsers() and populatePersonnelDatalist() between views is intentional (each view manages own listener lifecycle)"

# Metrics
duration: 15min
completed: 2026-02-06
---

# Phase 15 Plan 02: Project Creation Permissions & Personnel Datalist Summary

**Role-guarded project creation restricted to super_admin/operations_admin with HTML5 datalist-backed personnel selection storing user IDs for referential integrity**

## Performance

- **Duration:** ~15 minutes
- **Started:** 2026-02-06 (timestamp not captured)
- **Completed:** 2026-02-06
- **Tasks:** 3/3
- **Files modified:** 2

## Accomplishments
- Restricted project creation to operations_admin and super_admin roles (button visibility + function guards)
- Transformed personnel field from freetext to validated user selection using HTML5 datalist
- Implemented migrate-on-edit strategy: new projects use personnel_user_id + personnel_name; existing projects migrate when edited
- Real-time user datalist populated via onSnapshot listener for active users
- Backward compatible: existing freetext personnel displays correctly via personnel_name || personnel fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add role-based permission guard for project creation** - `443b59a` (feat)
2. **Task 2: Transform personnel field to user datalist with validation** - `0677ed1` (feat)
3. **Task 3: Add personnel user datalist to project-detail inline editing** - `42de579` (feat)

## Files Created/Modified
- `app/views/projects.js` - Added role guards for project creation, personnel datalist with validation, migrate-on-edit logic
- `app/views/project-detail.js` - Added personnel datalist to inline editing with migrate-on-edit strategy

## Decisions Made

**1. Personnel required for new projects**
- Rationale: Enforces accountability and establishes good data hygiene from the start
- Existing projects with null personnel remain valid (backward compatible)

**2. Store both personnel_user_id and personnel_name**
- Rationale: Denormalization avoids extra user lookups on every project display
- Trade-off: If user changes name, personnel_name becomes stale (acceptable - personnel_name is historical record)

**3. Migrate-on-edit strategy (not immediate migration)**
- Rationale: Incremental migration avoids risk of breaking existing workflows
- New projects: Only use new fields (no legacy `personnel` field)
- Edit existing: Datalist match migrates to new fields + clears legacy; freetext keeps legacy + clears new; clearing nulls all three
- Display: Always prefer `personnel_name || personnel` for backward compatibility

**4. Freetext fallback preserved in edit mode**
- Rationale: Allows edge cases (contractors, external consultants) who might not be in the users collection
- User experience: If they type something not in the list, it's stored as legacy freetext

**5. Role check at button level AND function level**
- Rationale: Defense in depth - button hidden for non-admins, but functions also guard against console manipulation
- User experience: Non-admins see friendly error toast if they attempt creation via console

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation was straightforward. HTML5 datalist works well with onSnapshot real-time updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Project creation permissions enforced (server-side via Firestore Security Rules line 119, client-side UX via role guards)
- Personnel field now references users collection, enabling future features:
  - Project assignment notifications (user has email from users collection)
  - Workload reports by personnel_user_id
  - Personnel-based project filtering and scoping
- Ready for Phase 15-03: Further user data and permission improvements

**Blockers/Concerns:** None

---
*Phase: 15-user-data-permission-improvements*
*Completed: 2026-02-06*
