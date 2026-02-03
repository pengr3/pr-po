# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-30)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 7 - Project Assignment System

## Current Position

Phase: 7 of 10 (Project Assignment System)
Plan: 4 of 5 in current phase — In progress
Status: Phase 7 in progress
Last activity: 2026-02-03 — Completed 07-04-PLAN.md (Assignment-scoped MRF form dropdown and procurement MRF list)

Progress: [███████░░░] 86% (22 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 22 (10 from v1.0, 12 from v2.0)
- Average duration: 3.5 min
- Total execution time: 21.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-clients-foundation | 2/2 | 5min | 2.5min |
| 02-projects-core | 3/3 | 6min | 2.0min |
| 03-projects-management | 2/2 | 7min | 3.5min |
| 04-mrf-project-integration | 3/3 | 12.7min | 4.2min |
| 05-core-authentication | 4/4 | 21 hours | 5.2 hours |
| 06-role-infrastructure-real-time-permissions | 5/5 | 17min | 3.4min |
| 07-project-assignment-system | 4/5 | 8.5min | 2.1min |

**Recent Trend:**
- Last 5 plans: 3min, 3min, 5min, 2min, 3min
- Trend: Consistent 2-5min velocity after Phase 5

*Updated: 2026-02-03 after 07-04 completion*

## Accumulated Context

### Decisions

Recent decisions affecting current work (full log in PROJECT.md):

- **AUTH-01 (05-01)**: Firebase Auth v10.7.1 - Same version as Firestore for SDK consistency
- **AUTH-02 (05-01)**: browserLocalPersistence - 1-day session requirement
- **AUTH-03 (05-01)**: Invitation codes in separate collection - Track usage and prevent reuse
- **AUTH-04 (05-01)**: New users default to pending status with null role - Super Admin assigns during approval
- **AUTH-05 (05-03)**: Generic login error messages - Security best practice, prevents account enumeration
- **AUTH-06 (05-03)**: Custom authStateChanged event - Event-driven auth state management
- **AUTH-07 (05-03)**: Real-time user document listener - Enables AUTH-09 deactivation enforcement
- **AUTH-08 (05-03)**: Store Firestore user data, not just Firebase Auth - Need role and status for routing
- **AUTH-09 (05-03)**: Auto-logout deactivated users - Real-time enforcement of account deactivation
- **LOGOUT-01 (05-04)**: Logout requires confirmation modal - Prevent accidental sign-out
- **LOGOUT-02 (05-04)**: Confirmation modal created dynamically - Keep index.html clean
- **PENDING-01 (05-04)**: Manual status checking via button - Give users control without auto-polling
- **PENDING-02 (05-04)**: Show rejection/deactivation messages on pending page - Centralize non-active states
- **ROUTING-01 (05-04)**: Status-based routing in auth observer - Automatically direct pending users on login
- **ROUTING-02 (05-04)**: No route blocking yet for active users - Full protection deferred to Phase 10
- **REG-01 (05-02)**: Combined form and submission in single commit - Tightly coupled view module pattern
- **REG-02 (05-02)**: Pre-filled invitation codes are disabled - Prevent user editing when code from URL
- **REG-03 (05-02)**: Auth styles in views.css - Consistent with existing view-specific styling pattern
- **PERM-13 (06-02)**: Navigation filtered based on tab access permissions - Clean separation between routing logic and permission enforcement
- **PERM-14 (06-02)**: Router blocks access to unpermitted routes with Access Denied page - Strict equality (hasAccess === false) distinguishes no permission from pending state
- **PERM-16 (06-02)**: Permissions initialize automatically on login for active users with roles - Automatic setup ensures permissions ready before navigation
- **PERM-17 (06-02)**: Permission listener skipped for pending/rejected/deactivated users - Avoids unnecessary Firestore queries
- **PERM-18 (06-02)**: permissionsChanged event listener at module level updates navigation in real-time - Module-level registration persists for application lifetime
- **PERM-19 (06-02)**: Role changes detected and trigger permission listener reinitialization - Enables automatic permission reload when Super Admin changes user's role
- **PERM-20 (06-03)**: Checkbox matrix displays all 5 roles x 7 tabs x 2 permissions (70 checkboxes) - Complete visibility of all permissions in single view
- **PERM-21 (06-03)**: Pending changes tracked locally before save - Enables discard functionality without side effects
- **PERM-22 (06-03)**: Batch writes for atomic role updates - Ensures consistency, prevents partial updates
- **PERM-23 (06-03)**: Super Admin's role_config permissions disabled in UI - Prevents lockout scenario
- **PERM-24 (06-03)**: Visual change indicators show pending edits - Clear visual feedback prevents accidental data loss
- **PERM-25 (06-04)**: Strict equality (=== false) distinguishes no permission from loading state - Prevents UI flickering, backwards compatible with undefined
- **PERM-26 (06-04)**: Guard functions double-check permissions before executing actions - Defense in depth beyond UI hiding
- **PERM-27 (06-04)**: MRF form blocked entirely for view-only users - Create form irrelevant for users who can't submit
- **PERM-28 (06-04)**: Backwards compatible with undefined permission state - Defaults to showing controls when permissions not loaded
- **PERM-29 (06-05)**: PO status dropdowns replaced with colored badges for view-only users - Disabled selects are visually ambiguous, badges match app-wide status pattern
- **PERM-30 (06-05)**: mrfActions container null-checked in dynamic renderers - Element is conditionally absent from DOM for view-only; selectMRF is intentionally unguarded so users can view details
- **PERM-31 (06-05)**: Permission matrix selectors use .tab-name/.permission-type classes - Positional nth-child breaks under rowspan="2" on tab-name cells
- **ASSIGN-01 (07-01)**: getAssignedProjectCodes returns null for "no filter" - null sentinel means do not scope; applies to all roles except operations_user without all_projects
- **ASSIGN-02 (07-01)**: Missing/malformed assigned_project_codes on operations_user yields empty array - Missing field is zero access, not unconstrained access
- **ASSIGN-03 (07-01)**: JSON.stringify comparison for array change detection - Firestore always produces new references; stringify handles undefined vs empty transitions
- **ASSIGN-04 (07-01)**: assignmentsChanged event fires on first assignment too - Downstream listeners must be idempotent
- **v2.0 Planning**: Generic invitation codes (not role-specific) - Super Admin assigns role during approval step, simpler UX
- **v2.0 Planning**: Operations User sees only assigned projects - Clean, focused view without unrelated projects
- **v2.0 Planning**: Finance creates POs (not Procurement) - Finance controls spending after PR/TR approval, separation of duties
- **v2.0 Planning**: 5 roles instead of 3 - Added Finance and Procurement for granular access control aligned with workflows

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 5 (Core Authentication) - COMPLETE:**
- ✅ Firebase version compatibility - Using 10.7.1 for SDK consistency (AUTH-01)
- ✅ Migration risk - 05-01 added auth without breaking existing v1.0 functionality (verified)
- ✅ Registration flow complete - Users can register with invitation codes, creates pending users (05-02)
- ✅ Login page complete - Authentication working with persistent sessions (05-03)
- ✅ AUTH-09 implemented - Deactivated users automatically logged out via real-time listener (05-03)
- ✅ Pending user experience - Approval page with status checking and logout (05-04)
- ✅ Logout functionality - Header button with confirmation modal (05-04)
- ⚠️ Super Admin bootstrap process - first admin account needs manual Firestore creation (carried to Phase 6)

**Phase 6 (Role Infrastructure & Real-time Permissions) - COMPLETE:**
- ✅ Permission module with role template listener (06-01)
- ✅ Permission integration with auth observer, router, and navigation (06-02)
- ✅ Super Admin role configuration UI with checkbox matrix (06-03)
- ✅ Batch writes for atomic permission updates (06-03)
- ✅ Real-time permission propagation to all users (06-03)
- ✅ Edit permission checks for clients, projects, mrf-form views (06-04)
- ✅ View-only mode with conditional rendering and guard functions (06-04)
- ✅ View-only CSS styles (06-05)
- ✅ Permission enforcement in procurement and finance views (06-05)
- ✅ Human verification of end-to-end permission system (06-05 checkpoint)
- Real-time listener performance with >10 projects - Firestore 'in' query limited to 10 items, may need batching (carried to Phase 9)
- Permission caching strategy - Balance between real-time updates and query efficiency (carried to Phase 9)

**Phase 8 (Security Rules):**
- Complex rules testing strategy - Need Firebase Emulator Suite setup
- Data backfill timing - Existing records lack project_code field required by strict rules
- Graceful degradation pattern - Allow null values temporarily during migration

## Session Continuity

Last session: 2026-02-03 (07-04 execution)
Stopped at: Completed 07-04-PLAN.md - Assignment-scoped MRF form dropdown and procurement MRF list filtering.
Resume file: None
