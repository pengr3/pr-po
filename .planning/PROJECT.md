# CLMC Procurement System - Projects & Auth Enhancement

## What This Is

A zero-build static SPA for managing engineering procurement workflows (MRFs, PRs, POs) with comprehensive project lifecycle tracking and role-based access control. All procurement activities are anchored to either projects (large-scale fit-outs) or services (repair/maintenance work) with auto-generated codes (CLMC_CLIENT_YYYY###), dual-status tracking, and complete client management. Multi-user system with 7 roles supporting two operational departments (Projects and Services), invitation-only registration, granular permissions, and assignment-based access for department users. Mobile-responsive with CSV data export, sortable tables, skeleton loading screens, and offline-first performance via Firebase IndexedDB persistence. Built with vanilla JavaScript and Firebase.

## Core Value

Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## Current Milestone: v3.2 Supplier Search, Proof of Procurement & Payables Tracking

**Goal:** Add supplier search in Procurement, document-backed proof of procurement via external storage, and a payables tracking system with Request for Payment workflow.

**Target features:**
- Supplier search bar in Procurement > Supplier Management (search by name and/or contact person)
- Proof of procurement — Procurement uploads supporting documents to Google Drive (or equivalent), link stored in Firestore
- Request for Payment — Procurement/Finance submits RFP with payment terms; system tracks outstanding payables per PO

## Current State

**Latest shipped:** v3.1 PR/TR Routing Fix & Procurement Workflow Improvements (2026-03-10)
**Active milestone:** v3.2 in progress

See `.planning/MILESTONES.md` for full milestone history.

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

**Validated (v2.1 System Refinement):**
- ✓ Supplier click opens modal showing all purchases from that supplier — v2.1 (Phase 13)
- ✓ Timeline button in PR-PO Records shows full audit trail (MRF → PRs → POs → Delivered) — v2.1 (Phase 13)
- ✓ PO viewing blocked until Payment Terms, Condition, Delivery Date are filled — v2.2 (Phase 18)
- ✓ Fix Transport Request Review button error (window.viewTRDetails is not a function) — v2.1 (Phase 12)
- ✓ Fix Material Purchase Request Review button error — v2.1 (Phase 12)
- ✓ Restore Project List tab with financial overview and expense breakdown modal — v2.1 (Phase 13)
- ✓ Allow Operations Admin role to receive project assignments — v2.1 (Phase 11)
- ✓ Fix Clients tab permission denied error for Super Admin — v2.1 (Phase 11)
- ✓ Fix Projects tab permission denied error for Super Admin — v2.1 (Phase 11)
- ✓ Ensure Super Admin has proper permission structure or Security Rules bypass — v2.1 (Phase 11)

**Validated (v2.2 Workflow & UX Enhancements):**
- ✓ Auto-populate user data in MRF forms for efficiency — v2.2 (Phase 15)
- ✓ Restrict project creation to admin roles only — v2.2 (Phase 15)
- ✓ Restructure project detail page with card-based layout — v2.2 (Phase 16)
- ✓ Comprehensive procurement status tracking with visual indicators (red/yellow/green) — v2.2 (Phase 17)
- ✓ PR creator tracking and side-by-side PR/PO display — v2.2 (Phase 17)
- ✓ Finance signature capture in approval workflow — v2.2 (Phase 18)
- ✓ Detailed project expense breakdown with category/material/transport views — v2.2 (Phase 18)
- ✓ Consolidated admin navigation (Settings/Assignments/Users merged) — v2.2 (Phase 19)
- ✓ Multi-personnel selection with pill UI and array storage — v2.2 (Phase 20)
- ✓ Automatic personnel-to-assignment sync for operations users — v2.2 (Phase 21)

### Validated (Shipped in v2.3)

**Services Management:**
- ✓ Services collection with CRUD operations mirroring Projects functionality — v2.3 (Phase 28)
- ✓ Service code generation sharing CLMC_CLIENT_YYYY### sequence with Projects — v2.3 (Phase 27)
- ✓ Services tab with sub-tabs: Services (one-time work), Recurring (contract-based work) — v2.3 (Phase 28)
- ✓ service_type field differentiation ('one-time' or 'recurring') — v2.3 (Phase 28)
- ✓ Same fields as Projects: budget, contract_cost, personnel, internal_status, project_status, active/inactive — v2.3 (Phase 28)
- ✓ Services detail page with inline editing and auto-save — v2.3 (Phase 28)
- ✓ Assignment system for services_user (see only assigned services) — v2.3 (Phase 28, 32, 39)
- ✓ Service detail page includes expense breakdown (MRFs/PRs/POs linked to service) — v2.3 (Phase 33, 36)

**Role & Permission System:**
- ✓ services_admin role with full Services tab access (create/edit/delete, manage assignments) — v2.3 (Phase 26)
- ✓ services_user role with assignment-based Services tab access — v2.3 (Phase 26)
- ✓ Department isolation: operations roles see only Projects tab, services roles see only Services tab — v2.3 (Phase 26, 28)
- ✓ Super Admin bypass for both departments — v2.3 (Phase 26)
- ✓ Finance and Procurement cross-department access — v2.3 (Phase 30)
- ✓ Firebase Security Rules enforcement for services collection — v2.3 (Phase 26, 32, 35)
- ✓ Role template configuration in Super Admin settings — v2.3 (Phase 26)

**MRF Integration:**
- ✓ Role-based dropdown visibility in MRF form (operations users see Projects, services users see Services) — v2.3 (Phase 29)
- ✓ Denormalized storage (service_code + service_name) for performance — v2.3 (Phase 29)
- ✓ Services appear in MRF lists, details, and procurement workflow — v2.3 (Phase 29, 30)
- ✓ Backward compatibility with existing project-based MRFs — v2.3 (Phase 29)

**Cross-Department & Dashboard:**
- ✓ Finance Pending Approvals shows PRs/TRs from both Projects and Services with department badges — v2.3 (Phase 30)
- ✓ Procurement PO Tracking shows POs from both Projects and Services with department indicators — v2.3 (Phase 30)
- ✓ Department filter dropdown in Finance and Procurement views — v2.3 (Phase 30, 34)
- ✓ Dashboard shows active services count and Services-linked MRFs count — v2.3 (Phase 31)
- ✓ Dashboard role-aware stats (operations sees Projects only, services sees Services only, dual-dept sees both) — v2.3 (Phase 31)

**Code Quality & UX (v2.3 Phase 36-40):**
- ✓ Unified expense breakdown modal (project + service modes in single showExpenseBreakdownModal) — v2.3 (Phase 36)
- ✓ getMRFLabel() and getDeptBadgeHTML() defined once in components.js — v2.3 (Phase 38)
- ✓ Admin Assignments overhaul with unified table+modal interface — v2.3 (Phase 39)
- ✓ Badge color standardization across all procurement statuses — v2.3 (Phase 39)
- ✓ generateProjectCode() queries both collections preventing code collisions — v2.3 (Phase 39)
- ✓ My Requests sub-tab for requestor MRF self-service tracking — v2.3 (Phase 40)
- ✓ Client detail modal with linked projects/services — v2.3 (Phase 40)
- ✓ Procurement timeline fixes (emoji removal, Invalid Date, PR->PO grouping) — v2.3 (Phase 40)

### Validated (Shipped in v2.4)

**Export & Data Portability:**
- ✓ CSV export for all major list views (MRFs, PRs/POs, PO Tracking, Projects, Services) — v2.4 (Phase 41)
- ✓ CSV export for project and service expense breakdowns — v2.4 (Phase 42)

**Responsive Design:**
- ✓ Mobile hamburger navigation at narrow viewport widths — v2.4 (Phase 43)
- ✓ Horizontal scroll containers for data tables — v2.4 (Phase 44)
- ✓ Split-panel vertical stacking and responsive modals — v2.4 (Phase 44)

**Visual Polish & Branding:**
- ✓ Company logo on login and registration pages — v2.4 (Phase 45, 47)
- ✓ Navigation standardized (no underlines, no emojis, uniform Admin button) — v2.4 (Phase 45)

**Code Cleanup:**
- ✓ Dead files removed (project-assignments.js, service-assignments.js, procurement-base.js) — v2.4 (Phase 46)
- ✓ Unified MRF creation dropdown in Procurement matching mrf-form.js — v2.4 (Phase 46)

**Sortable Tables:**
- ✓ Finance Pending Approvals tables sortable by column headers — v2.4 (Phase 47)
- ✓ Procurement MRF Records table sortable by column headers — v2.4 (Phase 47.1)

**Data Propagation & UX:**
- ✓ PR documents carry urgency_level from parent MRF — v2.4 (Phase 47)
- ✓ Create MRF requestor name auto-filled from logged-in user — v2.4 (Phase 47.2)

**Performance Optimization:**
- ✓ Firebase offline persistence via IndexedDB — v2.4 (Phase 48)
- ✓ Skeleton loading screens across all data views — v2.4 (Phase 48)
- ✓ Stale-while-revalidate for dashboard stats — v2.4 (Phase 48)
- ✓ Parallel data fetching and TTL-cached reference data — v2.4 (Phase 48)

### Validated (Shipped in v2.5)

**Security Audit:**
- ✓ XSS protection via escapeHTML() utility applied across all 12 view files — v2.5 (Phase 49)
- ✓ Injection risk review (Firestore query manipulation, eval usage) — v2.5 (Phase 49)
- ✓ Sensitive data exposure cleanup (console logs, PII leakage) — v2.5 (Phase 49)
- ✓ Firebase Security Rules audit across all 12 collections — v2.5 (Phase 49)
- ✓ Auth edge cases reviewed (session handling, token expiry, role escalation) — v2.5 (Phase 49)
- ✓ CSP headers hardened for production — v2.5 (Phase 49)

**Database Safety:**
- ✓ Backup export script for all Firestore collections to local JSON — v2.5 (Phase 50)
- ✓ Data integrity verification identifying orphaned references and schema issues — v2.5 (Phase 50)
- ✓ Restore procedure documented and verified — v2.5 (Phase 50)

**Data Management:**
- ✓ Standalone wipe script clearing all collections except users with dry-run and confirmation — v2.5 (Phase 51)
- ✓ CSV import script for projects and services with validation and error reporting — v2.5 (Phase 51.1)

**UI Enhancements (v2.5):**
- ✓ Clickable Active/Inactive badges for bulk project and service status toggling — v2.5 (Phase 51.2)
- ✓ Finance sub-tabs for Services and Recurring with search and sorting — v2.5 (Phase 52.1)

### Validated (Shipped in v3.0)

- ✓ MRF Tables (My Requests + Procurement MRF Records): PO ID displayed inline beside its corresponding PR ID with null-slot em-dash when no PO exists — v3.0 (Phase 54)
- ✓ Procurement MRF Records: Procurement Status dropdown aligned on the same row as its specific PR/PO pair — v3.0 (Phase 54)
- ✓ Finance Pending Approvals PR table: Date Issued + Date Needed columns added, Status column removed — v3.0 (Phase 55)
- ✓ Finance Pending Approvals TR table: "Date" renamed to "Date Issued", Date Needed column added, Status column removed — v3.0 (Phase 55)
- ✓ MRF Processing layout: full-width (1600px) with Pending MRFs and MRF Details spanning full content band — v3.0 (Phase 56)
- ✓ Sub-tab nav alignment: Material Request, Procurement, Admin bars all at 1600px matching Finance — v3.0 (Phase 56)
- ✓ Finance Approved This Month scoreboard: dynamically counts POs by date_issued in current calendar month plus approved TRs — v3.0 (Phase 55)

## Current State

**Latest shipped:** v3.1 PR/TR Routing Fix & Procurement Workflow Improvements (2026-03-10)
**Active milestone:** None — planning next milestone

### Validated (Shipped in v3.1)

- Item category "DELIVERY BY SUPPLIER" routes to PR/PO path (not TR) — v3.1 (Phase 57)
- TR rejection fully decoupled from MRF status with dedicated editing panel — v3.1 (Phase 60)
- MRF soft-reject replacing hard delete with full audit trail — v3.1 (Phase 62)
- TR details modal accessible from clickable TR badges in records tables — v3.1 (Phase 62)
- Add/delete line items on rejected TRs before resubmitting — v3.1 (Phase 62.1)
- MRF rejection event shown on Procurement Timeline — v3.1 (Phase 62.2)
- Project/service dropdowns sort alphabetically, codes use dash format — v3.1 (Phases 61, 62)
- Responsive workspace for 1366px laptops, sortable My Requests, real-time MRF Records — v3.1 (Phases 59, 59.1)

### Future (v4.0+)

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

**Shipped v2.3 (2026-02-26):**
- 15 phases, 34 plans, 142 files changed, +27,307/-895 lines
- New collections: services
- New files: app/views/services.js, app/views/service-detail.js, app/views/mrf-records.js, app/views/assignments.js, app/expense-modal.js, app/edit-history.js
- 65/65 requirements satisfied
- 7 roles (added services_admin, services_user)

**Shipped v2.4 (2026-03-01):**
- 10 phases, 24 plans, 28 code files changed, +1,515/-1,208 lines
- No new collections or files — focused on polish, exports, and performance
- 30/30 requirements satisfied
- Major additions: downloadCSV utility, skeleton screens, TTL caching, mobile hamburger nav, sortable headers
- Total JS codebase: 22,883 LOC

**Shipped v2.5 (2026-03-02):**
- 7 phases, 12 plans, 30 code files changed, +3,398/-557 lines
- No new collections — focused on security hardening, database tooling, and UI polish
- New scripts: backup.js, restore.js, verify-integrity.js, wipe.js, import.js
- 23/23 requirements satisfied
- Total JS codebase: 27,008 LOC

**Shipped v3.0 (2026-03-04):**
- 3 phases, 4 plans, 5 view files changed, +361/-157 lines
- No new collections or files — focused on display precision and layout consistency
- 12/12 requirements satisfied
- Total JS codebase: ~27,369 LOC (11,123 LOC across 5 modified files)

**Shipped v3.1 (2026-03-10):**
- 11 phases, 22 plans, 105 commits
- 84 files changed, +9,383 / -2,490 lines
- 6 days from first commit to ship (2026-03-05 → 2026-03-10)
- 18/18 requirements satisfied (100% coverage)

**Current Codebase State:**
- Auth System: app/auth.js, app/permissions.js
- Auth Views: register.js, login.js, pending.js
- Admin Views: role-config.js, user-management.js, assignments.js (unified, replaces project-assignments.js + service-assignments.js)
- Client/Project CRUD: clients.js, projects.js, project-detail.js
- Services CRUD: services.js, service-detail.js
- MRF/Procurement: mrf-form.js (with My Requests sub-tab), mrf-records.js, procurement.js
- Finance: finance.js (with cross-department dept badges and filters)
- Shared Modules: app/expense-modal.js (unified project+service modal), app/edit-history.js
- Security: firestore.rules (services rules deployed), test/firestore.test.js
- Utils: app/utils.js (generateServiceCode, generateProjectCode, getAssignedServiceCodes, syncServicePersonnelToAssignments)
- Components: app/components.js (getMRFLabel, getDeptBadgeHTML, skeletonTableRows as named exports)

**Technical Environment:**
- Frontend: Vanilla JavaScript ES6 modules, no framework
- Database: Firebase Firestore v10.7.1 (CDN), Project ID: clmc-procurement
- Storage: Firebase Storage (for future invoice uploads)
- Auth: Firebase Authentication v10.7.1 (implemented in v2.0)
- Deployment: Netlify (auto-deploy from git)

**User Feedback Themes:**
- v1.0: Project tracking working as expected
- v1.0: Need for access control (✓ delivered in v2.0)
- Desired: Document upload for project files (deferred to v2.5+)
- Desired: Activity logging on projects (deferred to v2.5+)
- Desired: Payment milestone tracking (deferred to v2.5+)

**Known Issues:**
- Role template seeding requires manual browser console step (one-time, 5 minutes)
- First Super Admin requires manual Firestore document edit (one-time, 2 minutes)
- Firestore 'in' query limited to 10 items (project assignments use client-side filtering)
- Firebase SDK IndexedDB reads ~500-850ms (known SDK limitation, not perceptibly faster than network)

## Constraints

- **Tech stack**: Must use Firebase (Firestore + Auth + Storage), pure JavaScript (no build system)
- **Deployment**: Netlify direct push, no CI/CD complexity
- **Browser**: Desktop-first with mobile-responsive support, modern browsers only (Chrome, Edge, Firefox)
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
| Phase 26: Services mirrors Projects (reuse patterns, duplicate UI modules) | Fastest path to parallel department — copy then adapt; avoids premature abstraction | ✓ Good - reduced Services build time significantly |
| Phase 27: Parallel query for shared sequence (acceptable race condition at current scale) | Promise.all on projects+services for max code number; collision probability negligible at current user count | ✓ Good - no collision observed in production |
| Phase 29: Department field stored as binary string discriminator ('projects'/'services') | Denormalized on MRF/PR/TR avoids joins in all display code; dual-condition check handles legacy docs without field | ✓ Good - consistent pattern across 20+ display locations |
| Phase 35: canEdit === true guard (treats undefined as read-only) eliminates flash of edit controls | Strict equality blocks renders during permission-loading race; services_user sees read-only from first render | ✓ Good - no edit-control flash observed |
| Phase 36: Unified showExpenseBreakdownModal with mode branching — single definition eliminates divergent implementations | Services modal was missing transport_requests; unified function fixed gap and prevents future divergence | ✓ Good - single export, 3 consumers, zero divergence |
| Phase 38: getMRFLabel/getDeptBadgeHTML extracted to components.js as named exports | Duplicate definitions in finance.js and procurement.js — single source of truth removes drift risk | ✓ Good - clean import pattern adopted |
| Phase 39: assignments.js replaces project-assignments.js + service-assignments.js — unified admin UI | Per-user assignment pages were bloated; table+modal pattern handles both departments in one view | ✓ Good - admin UX significantly improved |
| Phase 40: createMRFRecordsController factory with containerId-namespaced window functions — prevents cross-instance state leakage | My Requests and Procurement both need MRF records tables; factory isolates state per instance | ✓ Good - zero cross-instance interference |
| Phase 41: downloadCSV as shared utility in utils.js | Single implementation reused by 8 view files across 7 export requirements | ✓ Good - zero duplication, consistent CSV format |
| Phase 43: Mobile hamburger nav as sibling to desktop nav | Position:fixed without height constraint; max-height CSS transition for animation | ✓ Good - smooth animation, no layout impact |
| Phase 46: Unified project/service dropdown in Procurement Create MRF | Same pattern as mrf-form.js — native optgroup, data-type/data-name attributes | ✓ Good - consistent UX across both MRF creation paths |
| Phase 48: persistentLocalCache with singleTabManager for offline persistence | Correct v10.7.1 API (not deprecated enableIndexedDbPersistence); single-tab avoids coordination overhead | ✓ Good - IndexedDB cache works, though SDK reads are slow (~500-850ms) |
| Phase 48: TTL-cached reference data (5-min TTL) with destroy() timestamp reset | Guards check data.length > 0 AND timestamp freshness; prevents stale data on view re-entry | ✓ Good - measurably fewer Firestore reads on tab switching |

| Phase 49: escapeHTML() utility for XSS protection — single function handles all 5 HTML special chars | Only user-supplied data needs escaping; systematic classification avoids over-escaping static UI strings | ✓ Good - consistent pattern across all 12 view files |
| Phase 49: 'unsafe-inline' kept in CSP script-src | Hundreds of inline onclick handlers make nonce-based approach impractical; refactor deferred | ⚠️ Revisit - future refactor to event listeners would allow tighter CSP |
| Phase 50: Firebase Admin SDK scripts with ES module syntax | Modern Node.js pattern; createRequire() for JSON key loading; consistent across all 5 scripts | ✓ Good - clean, consistent script architecture |
| Phase 51: Typed confirmation gate for destructive wipe script | User must type exact word before irreversible action proceeds | ✓ Good - prevents accidental data loss |
| Phase 51.1: Auto-detect CSV delimiter (tab vs comma) | Real Excel exports use TSV not CSV; single parser handles both transparently | ✓ Good - zero user friction with real production data |
| Phase 52.1: Client-side TR aggregation instead of composite index | Avoids requiring uncreated Firestore composite index; acceptable at current data scale | ✓ Good - pragmatic trade-off, no performance issues |
| Phase 54: posByPrId index keyed on po.pr_id for O(1) PR-to-PO pairing | Maps each PR to its PO(s) in a single pass; null slot em-dash shown when no match | ✓ Good - clean lookup pattern, no schema change needed |
| Phase 54: Retain 8-column table structure with inline flex sub-rows | PRs, POs, Procurement Status stay in separate columns; per-PR pairing via flex rows within cells | ✓ Good - alignment correct, SUMMARY description inaccurate but code is correct |
| Phase 55: mrfCache Map populated via batch getDocs in onSnapshot callbacks | Avoids N+1 queries for date_needed; 30-item chunks with Promise.all; warm-cache path renders synchronously | ✓ Good - clean pattern, reused for both PRs and TRs |
| Phase 55: approvedTRsThisMonthCount loaded once at init() | TR approval count stable within session; recalculates on view reload | ✓ Good - by design; minor UX staleness accepted |
| Phase 56: Remove .container class from procurement.js content wrapper | .container resolves to 1400px via main.css; replaced with inline max-width: 1600px to match Finance reference | ✓ Good - root cause fix rather than override |
| Phase 56: Finance tab as reference alignment (do not modify) | All other tabs normalize to Finance's two-level sub-nav pattern and 1600px width | ✓ Good - clear single source of truth for layout |

---
*Last updated: 2026-03-13 after v3.2 milestone start*
