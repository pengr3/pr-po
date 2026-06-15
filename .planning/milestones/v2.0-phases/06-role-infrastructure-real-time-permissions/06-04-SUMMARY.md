---
phase: 06-role-infrastructure-real-time-permissions
plan: 04
subsystem: permissions
tags: [rbac, firestore, permissions, ui-enforcement, view-only]

# Dependency graph
requires:
  - phase: 06-01
    provides: Permission module with canEditTab function
  - phase: 06-02
    provides: Permission integration in router and navigation
  - phase: 06-03
    provides: Super Admin role configuration UI

provides:
  - Permission-aware clients.js view with edit controls conditionally rendered
  - Permission-aware projects.js view with edit controls conditionally rendered
  - Permission-aware mrf-form.js view blocking create form for view-only users
  - View-only notices for restricted users
  - Guard functions preventing unauthorized actions

affects: [06-05, 07-project-detail-dashboard, 08-mrf-details-processing, 09-procurement-finance-views]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Permission checking pattern: canEditTab('tab_name') === false for view-only"
    - "Strict equality check to distinguish undefined (not loaded) vs false (no permission)"
    - "Conditional rendering: showEditControls = canEdit !== false (backwards compatible)"
    - "Guard functions: Check permission at function entry, show toast, early return"
    - "View-only badges replace action buttons for restricted users"
    - "Form blocking: mrf-form returns different HTML when canEdit === false"

key-files:
  created: []
  modified:
    - app/views/clients.js
    - app/views/projects.js
    - app/views/mrf-form.js

key-decisions:
  - "PERM-25 (06-04): Strict equality (=== false) distinguishes no permission from loading state"
  - "PERM-26 (06-04): Guard functions double-check permissions before executing actions"
  - "PERM-27 (06-04): MRF form blocked entirely for view-only users (not just disabled)"
  - "PERM-28 (06-04): Backwards compatible - undefined permission defaults to showing controls"

patterns-established:
  - "Permission checking in render(): const canEdit = window.canEditTab?.('tab'); const showEditControls = canEdit !== false;"
  - "Conditional rendering: ${showEditControls ? `<button>Edit</button>` : `<span>View Only</span>`}"
  - "View-only notice: ${canEdit === false ? `<div class='view-only-notice'>...</div>` : ''}"
  - "Guard pattern: if (window.canEditTab?.('tab') === false) { showToast('No permission', 'error'); return; }"

# Metrics
duration: 3min
completed: 2026-02-02
---

# Phase 6 Plan 4: Edit Permission Checks for Clients, Projects, MRF Form Summary

**Clients, projects, and MRF form views enforce edit permissions with conditional UI rendering and guard functions**

## Performance

- **Duration:** 3 min (171 seconds)
- **Started:** 2026-02-02T06:16:57Z
- **Completed:** 2026-02-02T06:19:48Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Clients view respects edit permissions with view-only mode
- Projects view respects edit permissions with view-only mode
- MRF form blocked entirely for users without edit permission
- All action handlers guarded against unauthorized execution
- Backwards compatible with undefined permissions (loading state)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add edit permission checks to clients.js** - `c5dd54c` (feat)
2. **Task 2: Add edit permission checks to projects.js and mrf-form.js** - `3cd1894` (feat)

## Files Created/Modified
- `app/views/clients.js` - Permission checks in render(), renderClientsTable(), and all action functions (toggleAddClientForm, addClient, editClient, saveEdit, deleteClient)
- `app/views/projects.js` - Permission checks in render(), renderProjectsTable(), and all action functions (toggleAddProjectForm, addProject, editProject, saveEdit, deleteProject, toggleProjectActive)
- `app/views/mrf-form.js` - Permission check in render() blocks entire form for view-only users

## Decisions Made

**PERM-25 (06-04): Strict equality (=== false) distinguishes no permission from loading state**
- Rationale: `canEdit === false` means explicit no permission, `canEdit === undefined` means permissions not loaded yet
- Backwards compatibility: `showEditControls = canEdit !== false` defaults to showing controls when undefined
- Prevents UI flickering during permission load

**PERM-26 (06-04): Guard functions double-check permissions before executing actions**
- Rationale: Even if buttons hidden, functions could be called via console or URL manipulation
- Pattern: Check permission at function entry, show toast error, early return
- Defense in depth: UI hiding + function guarding = robust protection

**PERM-27 (06-04): MRF form blocked entirely for view-only users**
- Rationale: MRF form is specifically for creating NEW requests, not viewing existing ones
- Viewing happens in procurement.js MRF details panel
- Users with mrf_form.access=true, edit=false should not see create form at all
- Shows friendly message with "Back to Dashboard" button

**PERM-28 (06-04): Backwards compatible with undefined permission state**
- Rationale: During permission loading (async operation), canEditTab returns undefined
- `canEdit !== false` pattern means show controls unless explicitly false
- Prevents blank screens during loading
- Degrades gracefully if permission system disabled or broken

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Phase 6 Plan 5 (CSS styles for view-only elements):**
- View-only notices and badges are rendered but need CSS styling
- `.view-only-notice` class added to render() functions
- `.view-only-badge` class added to table cells
- Plan 06-05 will style these elements with appropriate colors and icons

**Ready for Phase 7 (Project Detail Dashboard):**
- Projects view enforces edit permissions
- Edit/Delete/Toggle buttons hidden for view-only users
- Project detail dashboard can build on same permission pattern

**Ready for Phase 8 (MRF Details Processing):**
- MRF form blocks unauthorized creation
- Procurement.js MRF processing will use same canEditTab pattern for approve/reject actions

**Blockers:**
- None - all three views successfully enforce permissions
- CSS styling deferred to 06-05 as planned

**Permission pattern established:**
```javascript
// In render()
const canEdit = window.canEditTab?.('tab_name');
const showEditControls = canEdit !== false;

// View-only notice
${canEdit === false ? `<div class="view-only-notice">...</div>` : ''}

// Conditional buttons
${showEditControls ? `<button>Edit</button>` : `<span>View Only</span>`}

// In action handlers
if (window.canEditTab?.('tab_name') === false) {
    showToast('No permission', 'error');
    return;
}
```

This pattern can be replicated in:
- `app/views/procurement.js` (06-05 or later) - approve/reject/generate PR/PO actions
- `app/views/finance.js` (06-05 or later) - approve/reject financial documents
- `app/views/home.js` - dashboard can remain view-only for all users (no edit actions needed)

---
*Phase: 06-role-infrastructure-real-time-permissions*
*Completed: 2026-02-02*
