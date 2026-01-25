# CLMC Procurement System - Projects & Auth Enhancement

## What This Is

An enhancement to the existing CLMC Engineering procurement management system that adds secure authentication, role-based permissions, and comprehensive project management capabilities. The system manages the complete procurement workflow from Material Request Forms (MRFs) through Purchase Orders (POs), now with everything anchored to tracked projects.

## Core Value

Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## Current Milestone: v1.0 - Core Projects Foundation

**Goal:** Establish project lifecycle tracking from lead to completion, with structured client management and MRF integration.

**Target features:**
- Client collection with standardized client codes
- Full project CRUD with dual status tracking (internal + client-facing)
- Project code generation (CLMC_CLIENT_YYYY###)
- MRF-Project integration (link all procurement to projects)
- Project filtering, search, and list management

## Requirements

### Validated

<!-- Existing capabilities from current system -->

- ✓ MRF submission with dynamic line items — existing
- ✓ MRF approval workflow (Pending/Approved/Rejected) — existing
- ✓ PR/TR generation from approved MRFs — existing
- ✓ Supplier database management — existing
- ✓ Finance approval workflow for PRs/TRs — existing
- ✓ PO creation and tracking — existing
- ✓ Real-time dashboard with procurement statistics — existing
- ✓ Sequential ID generation (MRF-YYYY-###, PR-YYYY-###, PO-YYYY-###) — existing

### Active (v1.0)

<!-- Core Projects + MRF Integration -->

#### Clients Management
- [ ] Create clients with client_code, company_name, contact_person, contact_details
- [ ] Edit existing clients
- [ ] Delete clients (Super Admin only - future role, for now anyone can delete)
- [ ] List view of all clients

#### Projects Tab
- [ ] Create projects with auto-generated code (CLMC_CLIENT_YYYY###)
- [ ] Required fields: project_name, client (dropdown)
- [ ] Optional fields: budget, contract_cost, personnel (freetext)
- [ ] Internal status tracking (For Inspection, For Proposal, For Internal Approval, Ready to Submit)
- [ ] Project status tracking (Pending Client Review, Under Client Review, Approved by Client, For Mobilization, On-going, Completed, Loss)
- [ ] Active/inactive flag to control MRF creation
- [ ] Edit existing projects
- [ ] Delete projects (Super Admin only - future role, for now anyone can delete)
- [ ] Project list view with columns: Code, Name, Client, Internal Status, Project Status
- [ ] Filter by: Internal Status, Project Status, Client
- [ ] Search by project code or project name
- [ ] Sort by most recent first
- [ ] Click row to view full project details
- [ ] New page UI (not modal) for create/edit with back navigation

#### MRF-Project Integration
- [ ] Add project_code dropdown to MRF form
- [ ] Dropdown displays: "CLMC_CODE_YYYY### - Project Name"
- [ ] Dropdown shows only active projects (inactive projects excluded)
- [ ] Dropdown sorted by most recent first
- [ ] Display project code and name in MRF lists
- [ ] Display project info in MRF details view

### v2.0 (Deferred)

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

## Context

**Existing System:**
- Zero-build static SPA (pure JavaScript ES6 modules)
- Firebase Firestore for data, no backend server
- Hash-based routing with lazy-loaded views
- Collections: mrfs, prs, pos, transport_requests, suppliers, projects (minimal), deleted_mrfs
- Deployed on Netlify with direct push

**Technical Environment:**
- Frontend: Vanilla JavaScript ES6 modules, no framework
- Database: Firebase Firestore v10.7.1 (CDN)
- Storage: Firebase Storage (for invoices)
- Auth: Firebase Authentication (to be implemented)
- Deployment: Netlify (auto-deploy from git)

**User Knowledge:**
- System already in use for procurement workflow
- Users familiar with MRF → PR → PO process
- Projects collection exists but no UI/management
- Currently no authentication - open access to all features

**Key Requirements:**
- High security emphasis (confirmations for critical operations)
- Desktop-optimized UI (mobile secondary concern)
- Maintain existing workflow patterns (don't break current usage)
- Everything connects to projects via name + code

## Constraints

- **Tech stack**: Must use Firebase (Firestore + Auth + Storage), pure JavaScript (no build system)
- **Deployment**: Netlify direct push, no CI/CD complexity
- **Browser**: Desktop-first, modern browsers only (Chrome, Edge, Firefox)
- **Security**: Invitation-only access, granular permissions, confirmation dialogs for destructive actions
- **Data continuity**: Existing MRFs/PRs/POs must remain functional during migration
- **Performance**: Real-time listeners already in use, maintain responsiveness

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Projects first, auth/permissions later (v2.0) | Core value is project tracking; get foundation working before securing it | ✓ Good - pragmatic approach |
| Project lifecycle starts at lead stage (not just won projects) | Track all expenses from first contact, measure what you pursue vs win | ✓ Good - complete visibility |
| Two status fields (Internal + Project Status) | Internal status tracks Operations steps, Project Status tracks client relationship | ✓ Good - clear separation |
| Project codes include client: CLMC_CLIENT_YYYY### | Group projects by client, see win/loss rates per client over time | ✓ Good - valuable analytics |
| Active/inactive flag controls MRF creation | Can create MRFs for completed projects (warranty work) but not lost opportunities | ✓ Good - flexible |
| Freetext personnel field in v1.0 | No user system yet; structured assignment deferred to v2.0 when auth exists | — Pending |
| New page UI (not modal) for project create/edit | Projects have many fields; full page provides better UX than cramped modal | — Pending |
| Start fresh with Projects collection vs migrating existing project_name data | Clean data model - existing MRFs are test data, no migration needed | ✓ Good - clean slate |
| Desktop-first vs responsive design | Primary users work at desks, mobile usage rare, optimize for main use case | — Pending |

---
*Last updated: 2026-01-25 after v1.0 milestone definition*
