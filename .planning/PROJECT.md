# CLMC Procurement System - Projects & Auth Enhancement

## What This Is

A zero-build static SPA for managing engineering procurement workflows (MRFs, PRs, POs) with comprehensive project lifecycle tracking and role-based access control. All procurement activities are anchored to projects with auto-generated codes (CLMC_CLIENT_YYYY###), dual-status tracking, and complete client management. Multi-user system with 5 roles, invitation-only registration, granular permissions, and project assignments for Operations Users. Built with vanilla JavaScript and Firebase.

## Core Value

Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## Current State

**Shipped:** v2.1 System Refinement (2026-02-06)

**Current Milestone:** v2.2 Workflow & UX Enhancements

See `.planning/MILESTONES.md` for full milestone history.

## Current Milestone: v2.2 Workflow & UX Enhancements

**Goal:** Enhance workflows and UX across all major areas with auto-population, restructured interfaces, comprehensive status tracking, signature capture, and consolidated navigation.

**Target enhancements:**
- Auto-populate user data in MRF forms for efficiency
- Restrict project creation to admin roles only
- Restructure project detail page with card-based layout
- Comprehensive procurement status tracking with visual indicators (red/yellow/green)
- PR creator tracking and side-by-side PR/PO display
- Finance signature capture in approval workflow
- Detailed project expense breakdown with category/material/transport views
- Consolidated admin navigation (Settings/Assignments/Users merged)

## Requirements

### Validated (Shipped in v1.0)

**Existing System (Pre-v1.0):**
- ✓ MRF submission with dynamic line items — existing
- ✓ MRF approval workflow (Pending/Approved/Rejected) — existing
- ✓ PR/TR generation from approved MRFs — existing
- ✓ Supplier database management — existing
- ✓ Finance approval workflow for PRs/TRs — existing
- ✓ PO creation and tracking — existing
- ✓ Real-time dashboard with procurement statistics — existing
- ✓ Sequential ID generation (MRF-YYYY-###, PR-YYYY-###, PO-YYYY-###) — existing

**Clients Management (v1.0):**
- ✓ Create clients with client_code, company_name, contact_person, contact_details — v1.0
- ✓ Edit existing clients — v1.0
- ✓ Delete clients — v1.0
- ✓ List view of all clients — v1.0
- ✓ Client code uniqueness validation — v1.0

**Projects Tab (v1.0):**
- ✓ Create projects with auto-generated code (CLMC_CLIENT_YYYY###) — v1.0
- ✓ Required fields: project_name, client (dropdown) — v1.0
- ✓ Optional fields: budget, contract_cost, personnel (freetext) — v1.0
- ✓ Internal status tracking (4 options) — v1.0
- ✓ Project status tracking (7 options) — v1.0
- ✓ Active/inactive flag to control MRF creation — v1.0
- ✓ Edit existing projects — v1.0
- ✓ Delete projects — v1.0
- ✓ Project list view with columns: Code, Name, Client, Internal Status, Project Status — v1.0
- ✓ Filter by: Internal Status, Project Status, Client — v1.0
- ✓ Search by project code or project name — v1.0
- ✓ Sort by most recent first — v1.0
- ✓ Click row to view full project details — v1.0
- ✓ New page UI (not modal) for create/edit with back navigation — v1.0
- ✓ Budget/contract_cost positive number validation — v1.0
- ✓ Full-page detail view with inline editing and auto-save — v1.0

**MRF-Project Integration (v1.0):**
- ✓ Add project_code dropdown to MRF form — v1.0
- ✓ Dropdown displays: "CLMC_CODE_YYYY### - Project Name" — v1.0
- ✓ Dropdown shows only active projects (inactive excluded) — v1.0
- ✓ Dropdown sorted by most recent first — v1.0
- ✓ Display project code and name in MRF lists — v1.0
- ✓ Display project info in MRF details view — v1.0
- ✓ Denormalized storage (project_code + project_name) for performance — v1.0
- ✓ Backward compatible display for legacy MRFs — v1.0

### Validated (Shipped in v2.0)

**Authentication & User Management:**
- ✓ Self-registration with invitation code validation (generic codes) — v2.0
- ✓ Super Admin generates one-time invitation codes with 3-hour expiration — v2.0
- ✓ Account approval workflow (pending → active, role assigned during approval) — v2.0
- ✓ Secure login/logout with Firebase Auth session persistence — v2.0
- ✓ User management (deactivate, delete, reactivate with confirmations) — v2.0
- ✓ Auto-logout for deactivated users via real-time listener — v2.0
- ✓ Super Admin dashboard (invitation codes, pending approvals, all users) — v2.0

**Permission System:**
- ✓ 5 role templates (Super Admin, Operations Admin, Operations User, Finance, Procurement) — v2.0
- ✓ Tab-based access control (navigation shows only permitted tabs by role) — v2.0
- ✓ Edit vs view-only permissions enforced within tabs — v2.0
- ✓ Project assignment for Operations Users (see only assigned projects) — v2.0
- ✓ Permission changes take effect immediately (no logout required) — v2.0
- ✓ Real-time permission updates via Firestore listeners — v2.0
- ✓ Super Admin can configure role permissions via checkbox matrix — v2.0

**Security Rules:**
- ✓ Firebase Security Rules validate user status (active) for all operations — v2.0
- ✓ Firebase Security Rules validate role permissions for all operations — v2.0
- ✓ Firebase Security Rules validate project assignments for filtering — v2.0
- ✓ 17/17 automated tests passing, production deployed — v2.0
- ✓ Console bypass protection verified — v2.0

**Route Protection:**
- ✓ Unauthenticated users redirected to login page — v2.0
- ✓ Deep link support (saves and restores intended route) — v2.0
- ✓ Pending users restricted to /pending page — v2.0
- ✓ Minimum 2 Super Admin safeguard prevents lockout — v2.0
- ✓ Navigation visibility control for unauthenticated users — v2.0

### Active (v2.1 System Refinement)

**Procurement Workflow Fixes:**
- [ ] Supplier click opens modal showing all purchases from that supplier
- [ ] Timeline button in PR-PO Records shows full audit trail (MRF → PRs → POs → Delivered)
- [ ] PO viewing blocked until Payment Terms, Condition, Delivery Date are filled

**Finance Workflow Fixes:**
- [ ] Fix Transport Request Review button error (window.viewTRDetails is not a function)
- [ ] Fix Material Purchase Request Review button error
- [ ] Restore Project List tab with financial overview and expense breakdown modal

**Operations Workflow Fixes:**
- [ ] Allow Operations Admin role to receive project assignments (assignable by Super Admin or Operations Admin)

**Security & Permissions Fixes:**
- [ ] Fix Clients tab permission denied error for Super Admin
- [ ] Fix Projects tab permission denied error for Super Admin
- [ ] Ensure Super Admin has proper permission structure or Security Rules bypass permission checks for admin roles

### Future (v2.1+)

#### Activity Logging
- Structured activity entries on projects
- Activity types: Inspection, Meeting, Proposal Submitted, Site Visit, Other
- Fields: activity type, description, date, logged by (auto), attachments
- Visible to all personnel assigned to project
- Visible to users with sufficient permissions

#### Document Management
- Upload BOQ files to projects
- Upload contract documents
- Upload inspection reports/photos
- Upload milestone reports (to support payment triggers)
- View/download uploaded documents

#### Payment Milestones
- Configure milestones at project creation (percentage, description, amount)
- Operations Admin can trigger milestones (with supporting documents)
- Track milestone status (pending, triggered, paid)
- Finance sees triggered milestones in dashboard

#### Payment Tracking
- PO payment status tracking (percentage paid)
- Payment terms on POs (Net 30, Net 60, custom)
- Payment due date calculation
- Operations can trigger collection milestones
- Finance receives collection milestone notifications

#### Invoice Management
- Procurement uploads supplier invoices to Firebase Storage
- Invoice attachment indicator in PR-PO records
- Finance can view uploaded invoices
- Invoice metadata tracking (date, amount, status)

#### Finance Dashboard Enhancements
- Payables calculation (total unpaid/partial POs by supplier)
- Payables detail view (breakdown by PO, payment status)
- Collectibles calculation (contract cost minus payments received by project)
- Collectibles detail view (breakdown by project, milestones)
- Payment milestone tracking and status updates

### Out of Scope

- Email notifications — Security and simplicity; all communication happens in-app
- Mobile app — Desktop-first for operational efficiency; mobile deferred to future
- OAuth/SSO login — Email/password sufficient for v1; complexity not warranted yet
- Real-time chat/comments — Not core to procurement workflow
- Automated email verification — Invitation codes provide sufficient security control
- BOQ creation/editing in system — BOQ created externally, only uploaded for reference
- Automated expense tracking — Manual MRF creation provides oversight and control

## Context

**System Architecture:**
- Zero-build static SPA (pure JavaScript ES6 modules)
- Firebase Firestore for data, no backend server
- Hash-based routing with lazy-loaded views
- Deployed on Netlify with direct push

**Shipped v1.0 (2026-01-30):**
- 9,312 lines of JavaScript across 9 core files
- Collections: clients, projects, mrfs, prs, pos, transport_requests, suppliers, deleted_mrfs
- 4 phases, 10 plans, 17 feature commits
- 59 days from first commit to ship
- 100% requirements coverage (32/32), zero tech debt

**Shipped v2.0 (2026-02-04):**
- 14,264 lines of JavaScript total (+20,115 / -178 lines in v2.0)
- New collections: users, invitation_codes, role_templates, deleted_users
- 6 phases, 26 plans, 84 files modified
- 64 days from first v2.0 commit to ship (2025-12-02 → 2026-02-04)
- 100% requirements coverage (51/51), all phases verified
- Firebase Security Rules: 247 lines, 17/17 tests passing

**Current Codebase State:**
- Auth System: app/auth.js (416 lines), app/permissions.js (133 lines)
- Auth Views: register.js (320 lines), login.js (176 lines), pending.js (219 lines)
- Admin Views: role-config.js (430 lines), user-management.js (1758 lines), project-assignments.js (255 lines)
- Client/Project CRUD: clients.js (371 lines), projects.js (596 lines), project-detail.js (309 lines)
- MRF/Procurement: mrf-form.js (updated with assignments), procurement.js (updated with permissions)
- Finance: finance.js (updated with permissions)
- Security: firestore.rules (247 lines), test/firestore.test.js (336 lines, 17 tests)
- Utils: app/utils.js (includes getAssignedProjectCodes, generateProjectCode)

**Technical Environment:**
- Frontend: Vanilla JavaScript ES6 modules, no framework
- Database: Firebase Firestore v10.7.1 (CDN), Project ID: clmc-procurement
- Storage: Firebase Storage (for future invoice uploads)
- Auth: Firebase Authentication v10.7.1 (implemented in v2.0)
- Deployment: Netlify (auto-deploy from git)

**User Feedback Themes:**
- v1.0: Project tracking working as expected
- v1.0: Need for access control (✓ delivered in v2.0)
- Desired: Document upload for project files (deferred to v2.1+)
- Desired: Activity logging on projects (deferred to v2.1+)
- Desired: Payment milestone tracking (deferred to v2.1+)

**Known Issues:**
- Role template seeding requires manual browser console step (one-time, 5 minutes)
- First Super Admin requires manual Firestore document edit (one-time, 2 minutes)
- Firestore 'in' query limited to 10 items (project assignments use client-side filtering)

## Constraints

- **Tech stack**: Must use Firebase (Firestore + Auth + Storage), pure JavaScript (no build system)
- **Deployment**: Netlify direct push, no CI/CD complexity
- **Browser**: Desktop-first, modern browsers only (Chrome, Edge, Firefox)
- **Security**: Invitation-only access (v2.0 ✓), granular permissions (v2.0 ✓), Firebase Security Rules (v2.0 ✓), confirmation dialogs for destructive actions
- **Data continuity**: Existing MRFs/PRs/POs must remain functional during v2.0 auth migration
- **Performance**: Real-time listeners already in use, maintain responsiveness

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Projects first, auth/permissions later (v2.0) | Core value is project tracking; get foundation working before securing it | ✓ Good - v1.0 shipped successfully, foundation solid |
| Project lifecycle starts at lead stage | Track all expenses from first contact, measure what you pursue vs win | ✓ Good - complete visibility achieved |
| Two status fields (Internal + Project Status) | Internal status tracks Operations steps, Project Status tracks client relationship | ✓ Good - clear separation working well |
| Project codes include client: CLMC_CLIENT_YYYY### | Group projects by client, see win/loss rates per client over time | ✓ Good - enables valuable client analytics |
| Active/inactive flag controls MRF creation | Can create MRFs for completed projects (warranty work) but not lost opportunities | ✓ Good - flexible workflow validated |
| Freetext personnel field in v1.0 | No user system yet; structured assignment deferred to v2.0 when auth exists | ✓ Good - pragmatic interim solution |
| New page UI (not modal) for project create/edit | Projects have many fields; full page provides better UX than cramped modal | ✓ Good - detail view with inline editing highly effective |
| Start fresh with Projects collection | Clean data model - existing MRFs are test data, no migration needed | ✓ Good - clean slate enabled fast development |
| Desktop-first vs responsive design | Primary users work at desks, mobile usage rare, optimize for main use case | ✓ Good - focus on primary use case validated |
| Denormalize project_code + project_name in MRFs | Performance optimization - no join needed for display, historical accuracy preserved | ✓ Good - 21 display points work efficiently |
| Composite ID generation with regex parsing | Handles client codes with underscores, per-client per-year uniqueness | ✓ Good - robust implementation |
| Inline editing with auto-save on blur | Efficient editing workflow without save buttons for every field | ✓ Good - UX improvement validated |
| Focus preservation during real-time updates | Prevents cursor jump when typing and Firestore update arrives | ✓ Good - smooth editing experience |
| Generic invitation codes (not role-specific) | Simpler UX - Super Admin assigns role during approval step, not during code generation | ✓ Good - streamlined approval workflow |
| Operations User sees only assigned projects | Clean, focused view - users don't need to see unrelated projects | ✓ Good - immediate filtering in 4 views |
| Finance creates POs (not Procurement) | Finance controls spending after PR/TR approval, maintains separation of duties | ✓ Good - permission enforcement verified |
| 5 roles instead of 3 | Added Finance and Procurement roles for granular access control aligned with workflows | ✓ Good - configurable role templates working |
| Real-time permission updates via Firestore listeners | Changes take effect immediately without logout | ✓ Good - permissionsChanged and assignmentsChanged events |
| Firebase Security Rules server-side enforcement | Client-side checks can be bypassed, server validation required | ✓ Good - 17/17 tests passing, console bypass blocked |
| UUID invitation codes with 3-hour expiration | Balance security with reasonable signup window | ✓ Good - auto-cleanup prevents code accumulation |
| Minimum 2 Super Admin safeguard | Prevents complete system lockout | ✓ Good - enforced at deactivation and role change |
| Two-step deletion (deactivate first) | Reversible action before permanent deletion | ✓ Good - safety mechanism validated |
| Strict equality (=== false) for permission checks | Distinguishes no permission from loading state | ✓ Good - prevents UI flickering |

---
*Last updated: 2026-02-05 after v2.1 milestone planning*
