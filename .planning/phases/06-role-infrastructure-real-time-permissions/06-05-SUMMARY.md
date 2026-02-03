---
phase: 06-role-infrastructure-real-time-permissions
plan: 05
subsystem: permissions
tags: [rbac, permissions, ui-enforcement, view-only, procurement, finance, css]

# Dependency graph
requires:
  - phase: 06-01
    provides: Permission module with canEditTab function and role template listener
  - phase: 06-02
    provides: Permission integration in router and navigation
  - phase: 06-03
    provides: Super Admin role configuration UI with checkbox matrix
  - phase: 06-04
    provides: Edit permission pattern established in clients, projects, mrf-form

provides:
  - View-only CSS styles (.view-only-notice, .view-only-badge, disabled form elements)
  - Permission-aware procurement.js: all tabs enforce edit permissions with conditional rendering and guard functions
  - Permission-aware finance.js: approve/reject controls hidden for view-only users, guard functions on all mutation actions
  - Complete Phase 6 permission enforcement across all application views

affects: [07-user-approval-role-assignment, 08-mrf-details-processing, 09-procurement-finance-views, 10-route-security-fine-grained-enforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null-guarded dynamic button containers: getElementById check before innerHTML to survive view-only mode"
    - "Status badge fallback: colored text span replaces interactive select when showEditControls is false"
    - "Permission check in render-time callbacks: renderPRPORecords and renderPOTrackingTable capture canEdit at invocation"

key-files:
  created: []
  modified:
    - styles/views.css
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "PERM-29 (06-05): PO status dropdowns replaced with colored badges for view-only users rather than disabled selects"
  - "PERM-30 (06-05): mrfActions container null-checked in dynamic renderers because it is conditionally absent from DOM"
  - "PERM-31 (06-05): Permission matrix selectors use .tab-name/.permission-type classes instead of positional nth-child to survive rowspan layout"

patterns-established:
  - "Null-guard pattern for dynamically rendered containers: const el = getElementById(); if (el) el.innerHTML = ..."
  - "View-only status display: colored span badge with status-specific bg/color map replaces interactive select"
  - "Permission check at top of async render functions that run inside onSnapshot callbacks"

# Metrics
duration: 5min
completed: 2026-02-03
---

# Phase 6 Plan 5: Edit Permission Enforcement in Procurement and Finance Summary

**Procurement and finance views enforce edit permissions end-to-end: view-only notices, hidden controls, status-badge fallbacks, and guard functions on every mutation path**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-03T04:15:52Z
- **Completed:** 2026-02-03T04:21:00Z
- **Tasks:** 3 auto + 1 checkpoint (human-verify, approved)
- **Files modified:** 3
- **Commits:** 5 (3 task, 2 fix)

## Accomplishments

- View-only CSS styles added: `.view-only-notice` banner, `.view-only-badge` inline label, disabled form element overrides under `.view-only`
- Procurement view enforces `canEditTab('procurement')` across all three tabs (MRF Processing, Supplier Management, PR-PO Records)
- Finance view enforces `canEditTab('finance')` across all three tabs (Pending Approvals, Purchase Orders, Historical Data)
- All mutation action functions guarded with strict-equality permission check and toast feedback
- PO status columns render as colored text badges (not interactive dropdowns) for view-only users
- Dynamic MRF action buttons survive view-only mode without null-reference crashes
- Permission matrix checkbox alignment fixed for rowspan layout
- Human verification checkpoint passed: all 7 test scenarios confirmed working

## Task Commits

| # | Type | Hash | Description |
|---|------|------|-------------|
| 1 | style | fa3bd18 | Add view-only permission CSS styles to views.css |
| 2 | feat | af64703 | Add edit permission checks to procurement.js |
| 3 | feat | de28175 | Add edit permission checks to finance.js |
| fix | fix | 362bfef | Null-guard mrfActions and conditionally render PO status dropdowns |
| fix | fix | addf085 | Fix checkbox alignment in permission matrix (rowspan CSS selector bug) |

## Files Created/Modified

- `styles/views.css` -- Added VIEW-ONLY PERMISSION STYLES section: `.view-only-notice` (banner with icon, gray border), `.view-only-badge` (uppercase inline label), `.view-only` input/select/textarea overrides (pointer-events none, grayed), `.view-only` button.btn-primary/btn-danger hide rules. Fixed `.permission-matrix` selectors to use `.tab-name` and `.permission-type` classes instead of positional `td:first-child` / `td:nth-child(2)` which broke under rowspan.

- `app/views/procurement.js` -- Permission checks added in:
  - `render()`: `canEdit` / `showEditControls` at top; view-only notices on mrfs, suppliers, records sections; "New" MRF button and "Add Supplier" button conditionally rendered; MRF action button container conditionally rendered
  - `renderSuppliersTable()`: Edit/Delete buttons replaced with `.view-only-badge` when view-only
  - `renderPRPORecords()`: PO status select replaced with colored status badge when view-only
  - `renderPOTrackingTable()`: Same status select-to-badge pattern
  - `renderMRFDetails()`: Null-guard on `mrfActions` element before setting innerHTML (element absent for view-only)
  - `updateActionButtons()`: Same null-guard pattern
  - Guard functions on: `createNewMRF`, `saveNewMRF`, `saveProgress`, `deleteMRF`, `generatePR`, `generatePRandTR`, `submitTransportRequest`, `addSupplier`, `editSupplier`, `saveEdit`, `deleteSupplier`, `updatePOStatus`

- `app/views/finance.js` -- Permission checks added in:
  - `render()`: `canEdit` / `showEditControls` at top; view-only notices on approvals, pos, history sections
  - `viewPRDetails()`: Modal footer conditionally renders Approve/Reject buttons (Close only when view-only)
  - `viewTRDetails()`: Same conditional footer pattern
  - Guard functions on: `approvePR`, `approveTR`, `rejectPR`, `submitRejection`

## Decisions Made

**PERM-29 (06-05): PO status dropdowns replaced with colored badges for view-only users**
- Decision: Render a `<span>` with status-specific background/color instead of a disabled `<select>`
- Rationale: A disabled select is visually ambiguous -- users cannot tell whether it is permanently read-only or temporarily unavailable. A colored badge matches the status-badge pattern used elsewhere in the application and makes the view-only state immediately obvious
- Status color map: Pending/Pending Procurement = amber, Procuring/Processing = blue, Procured/Processed = green, Delivered = indigo

**PERM-30 (06-05): mrfActions container null-checked in dynamic renderers**
- Decision: `const el = document.getElementById('mrfActions'); if (el) el.innerHTML = ...` in both `renderMRFDetails` and `updateActionButtons`
- Rationale: The `mrfActions` div is inside a `${showEditControls ? ... : ''}` block in render(), so it does not exist in the DOM for view-only users. Both `renderMRFDetails` (called from `selectMRF`, which is not guarded -- view-only users can and should view MRF details) and `updateActionButtons` (called on category change) set its innerHTML unconditionally. Without the null check, clicking any MRF as a view-only user throws a TypeError

**PERM-31 (06-05): Permission matrix selectors use class selectors instead of positional nth-child**
- Decision: Replace `td:first-child` / `td:nth-child(2)` with `.tab-name` / `.permission-type` class selectors in `.permission-matrix` rules
- Rationale: The tab-name cell uses `rowspan="2"` to span both Access and Edit rows. This shifts the child index of subsequent cells in the Edit row, causing `nth-child(2)` to target the first checkbox cell instead of the Permission-type label. Class selectors are layout-independent and survive any row-spanning changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null-reference crash in renderMRFDetails and updateActionButtons**
- **Found during:** Task 2 verification -- tracing view-only user flow through selectMRF
- **Issue:** `document.getElementById('mrfActions').innerHTML = buttons` crashes with TypeError when `mrfActions` does not exist in the DOM. The element is conditionally rendered only for users with edit permission, but both `renderMRFDetails` and `updateActionButtons` set its innerHTML unconditionally. A view-only user clicking any MRF in the list would hit this crash immediately.
- **Fix:** Added null-guard: `const el = document.getElementById('mrfActions'); if (el) el.innerHTML = buttons;` in both functions
- **Files modified:** app/views/procurement.js
- **Commit:** 362bfef

**2. [Rule 2 - Missing Critical] PO status dropdowns interactive for view-only users**
- **Found during:** Task 2 verification -- reviewing rendered output of renderPRPORecords and renderPOTrackingTable
- **Issue:** Status select dropdowns rendered for all users. The `updatePOStatus` guard function would show an error toast if a view-only user changed the dropdown, but the dropdown itself was interactive and misleading. No permission check existed in the render path of either function.
- **Fix:** Added `canEdit` / `showEditControls` permission check at the top of both `renderPRPORecords` and `renderPOTrackingTable`. Conditionally render a colored status badge span when view-only, or the interactive select when edit is permitted.
- **Files modified:** app/views/procurement.js
- **Commit:** 362bfef

### Orchestrator Fix (post-checkpoint)

**3. [CSS] Permission matrix checkbox alignment under rowspan**
- **Applied by:** Orchestrator after human-verify checkpoint
- **Issue:** `.permission-matrix td:first-child` and `td:nth-child(2)` text-align rules targeted the wrong cells in Edit rows because `rowspan="2"` on the tab-name cell shifts child indices
- **Fix:** Replaced positional selectors with `.tab-name` and `.permission-type` class selectors
- **Files modified:** styles/views.css
- **Commit:** addf085

## Issues Encountered

None beyond the deviations documented above. All were resolved automatically or by the orchestrator.

## User Setup Required

None -- no external service configuration required. Human verification checkpoint was approved after manual testing of all 7 scenarios.

## Next Phase Readiness

**Phase 6 is now complete.** All 5 plans executed and verified.

**Ready for Phase 7 (User Approval & Role Assignment):**
- Permission system fully operational end-to-end: role templates, real-time propagation, navigation filtering, route blocking, edit enforcement in all views
- Super Admin can configure role permissions through the matrix UI
- All views (clients, projects, mrf-form, procurement, finance) enforce both access and edit permissions
- User approval flow can now assign roles with confidence that permissions take effect immediately

**Carried concerns (unchanged from prior plans):**
- Real-time listener performance with >10 projects -- Firestore `in` query limited to 10 items, may need batching (Phase 9)
- Permission caching strategy -- balance between real-time updates and query efficiency (Phase 9)
- Super Admin bootstrap process -- first admin account needs manual Firestore creation (Phase 7)

---
*Phase: 06-role-infrastructure-real-time-permissions*
*Completed: 2026-02-03*
