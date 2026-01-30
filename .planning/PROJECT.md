# CLMC Procurement System - Projects & Auth Enhancement

## What This Is

A zero-build static SPA for managing engineering procurement workflows (MRFs, PRs, POs) with comprehensive project lifecycle tracking. All procurement activities are anchored to projects with auto-generated codes (CLMC_CLIENT_YYYY###), dual-status tracking, and complete client management. Built with vanilla JavaScript and Firebase.

## Core Value

Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## Current Milestone: Preparing v2.0

**v1.0 Status:** ✅ SHIPPED (2026-01-30)

**Next focus:** Authentication & permissions system to secure the foundation with role-based access control.

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

### Active (v2.0 - Planned)

#### Authentication & User Management
- User self-registration with invitation code validation
- One-time invitation code generation by Super Admin
- User account approval workflow (pending → active)
- Secure login/logout with session persistence
- Super Admin can deactivate users (with confirmation)
- Super Admin can delete user accounts (with confirmation)
- Super Admin can manage user credentials

#### Permission System
- Tab-based access control (show/hide tabs per user)
- Edit vs view-only permissions within tabs
- Project assignment to users (specific projects or "all projects")
- Permission changes take effect immediately
- Super Admin dashboard for user/permission management
- Operations Admin can edit all projects
- Operations Users can edit only assigned projects
- Operations Users see only assigned projects

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

**Current Codebase State:**
- Client CRUD: app/views/clients.js (371 lines)
- Project CRUD: app/views/projects.js (596 lines)
- Project Detail: app/views/project-detail.js (309 lines)
- MRF Form: app/views/mrf-form.js (updated with project integration)
- Procurement: app/views/procurement.js (updated with project display)
- Finance: app/views/finance.js (updated with project display)
- Utils: app/utils.js (generateProjectCode function)

**Technical Environment:**
- Frontend: Vanilla JavaScript ES6 modules, no framework
- Database: Firebase Firestore v10.7.1 (CDN), Project ID: clmc-procurement
- Storage: Firebase Storage (for future invoice uploads)
- Auth: Firebase Authentication (to be implemented in v2.0)
- Deployment: Netlify (auto-deploy from git)

**User Feedback Themes (v1.0):**
- Project tracking working as expected
- Need for access control (v2.0 priority)
- Document upload desired for project files

**Known Issues:**
- None - all v1.0 requirements satisfied
- No authentication (planned for v2.0)

## Constraints

- **Tech stack**: Must use Firebase (Firestore + Auth + Storage), pure JavaScript (no build system)
- **Deployment**: Netlify direct push, no CI/CD complexity
- **Browser**: Desktop-first, modern browsers only (Chrome, Edge, Firefox)
- **Security**: Invitation-only access (v2.0), granular permissions, confirmation dialogs for destructive actions
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

---
*Last updated: 2026-01-30 after v1.0 milestone completion*
