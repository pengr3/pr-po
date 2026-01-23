# CLMC Procurement System - Projects & Auth Enhancement

## What This Is

An enhancement to the existing CLMC Engineering procurement management system that adds secure authentication, role-based permissions, and comprehensive project management capabilities. The system manages the complete procurement workflow from Material Request Forms (MRFs) through Purchase Orders (POs), now with everything anchored to tracked projects.

## Core Value

Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

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

### Active

<!-- New capabilities being added in this milestone -->

#### Authentication & User Management
- [ ] User self-registration with invitation code validation
- [ ] One-time invitation code generation by Super Admin
- [ ] User account approval workflow (pending → active)
- [ ] Secure login/logout with session persistence
- [ ] Super Admin can deactivate users (with confirmation)
- [ ] Super Admin can delete user accounts (with confirmation)
- [ ] Super Admin can manage user credentials

#### Permission System
- [ ] Tab-based access control (show/hide tabs per user)
- [ ] Edit vs view-only permissions within tabs
- [ ] Project assignment to users (specific projects or "all projects")
- [ ] Permission changes take effect immediately
- [ ] Super Admin dashboard for user/permission management

#### Projects Tab
- [ ] Create projects with: name, code, budget, personnel, client details, contract cost
- [ ] Internal status tracking (For Inspection, For Proposal, For Approval, Approved)
- [ ] Project status tracking (Pending, Awaiting Approval, Approved by Client, For Mobilization, On-going, Completed, Loss)
- [ ] Client information capture (company/client name, contact person, contact details)
- [ ] Payment milestone configuration (percentages, descriptions)
- [ ] Operations Admin can edit all projects
- [ ] Operations Users can edit only assigned projects
- [ ] Operations Users see only assigned projects
- [ ] Project list filtering and search

#### MRF-Project Integration
- [ ] Add project_code field to MRFs
- [ ] MRF form validates against active projects only
- [ ] Users can only select projects assigned to them (except "all projects" users)
- [ ] Display project code alongside project name throughout system

#### Payment Tracking
- [ ] PO payment status tracking (percentage paid)
- [ ] Payment terms on POs (Net 30, Net 60, custom)
- [ ] Payment due date calculation
- [ ] Operations can trigger collection milestones
- [ ] Finance receives collection milestone notifications

#### Invoice Management
- [ ] Procurement uploads supplier invoices to Firebase Storage
- [ ] Invoice attachment indicator in PR-PO records
- [ ] Finance can view uploaded invoices
- [ ] Invoice metadata tracking (date, amount, status)

#### Finance Dashboard Enhancements
- [ ] Payables calculation (total unpaid/partial POs by supplier)
- [ ] Payables detail view (breakdown by PO, payment status)
- [ ] Collectibles calculation (contract cost minus payments received by project)
- [ ] Collectibles detail view (breakdown by project, milestones)
- [ ] Payment milestone tracking and status updates

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
| Invitation codes (one-time use) over open registration | Security requirement - only authorized personnel should access system | — Pending |
| Super Admin assigns granular permissions vs predefined roles | Flexibility - different users need different combinations of access | — Pending |
| Start fresh with Projects collection vs migrating existing project_name data | Clean data model - existing MRFs have inconsistent project names, new system enforces validation | — Pending |
| Firebase Auth + Firestore rules vs custom auth | Leverage Firebase security, avoid building auth from scratch | — Pending |
| Desktop-first vs responsive design | Primary users work at desks, mobile usage rare, optimize for main use case | — Pending |
| Payment milestones configured at project creation | Operations knows contract structure upfront, Finance needs this for planning | — Pending |

---
*Last updated: 2026-01-23 after initialization*
