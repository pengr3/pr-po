# Roadmap: CLMC Procurement System

## Milestones

- ✅ **v1.0 Projects & Tracking** - Phases 1-4 (shipped 2026-01-30)
- ✅ **v2.0 Authentication & Permissions** - Phases 5-10 (shipped 2026-02-04)
- ✅ **v2.1 System Refinement** - Phases 11-13 (shipped 2026-02-06)
- 🚧 **v2.2 Workflow & UX Enhancements** - Phases 15-19 (in progress)

## Overview

**v2.1** (shipped) fixed critical bugs and completed incomplete features from v2.0. Security foundation fixes enabled proper testing, finance workflow errors were resolved, and financial dashboards gained aggregation features.

**v2.2** (current) enhances workflows and UX across all major areas. User data auto-population improves efficiency, project detail pages get restructured for clarity, procurement gains comprehensive status tracking with visual indicators, finance gets signature capture and detailed expense breakdowns, and navigation consolidates for cleaner information architecture. Each phase delivers tangible workflow improvements and better data visibility.

## Phases

<details>
<summary>✅ v1.0 Projects & Tracking (Phases 1-4) - SHIPPED 2026-01-30</summary>

### Phase 1: Client Management Foundation
**Goal**: Users can create and manage client records
**Plans**: 2 plans

Plans:
- [x] 01-01: Clients collection and CRUD operations
- [x] 01-02: Client validation and list view

### Phase 2: Project Code Generation
**Goal**: Projects have unique auto-generated codes tied to clients
**Plans**: 3 plans

Plans:
- [x] 02-01: Project code generation logic (CLMC_CLIENT_YYYY###)
- [x] 02-02: Projects collection and CRUD operations
- [x] 02-03: Project list with filtering and search

### Phase 3: Project Detail View
**Goal**: Users can view and edit complete project information
**Plans**: 2 plans

Plans:
- [x] 03-01: Full-page detail view with inline editing
- [x] 03-02: Auto-save and focus preservation

### Phase 4: MRF-Project Integration
**Goal**: MRFs are anchored to projects throughout the system
**Plans**: 3 plans

Plans:
- [x] 04-01: Project dropdown in MRF form with active filter
- [x] 04-02: Project display in MRF lists and details
- [x] 04-03: Backward compatibility for legacy MRFs

</details>

<details>
<summary>✅ v2.0 Authentication & Permissions (Phases 5-10) - SHIPPED 2026-02-04</summary>

### Phase 5: User Registration & Invitation System
**Goal**: Users can register with invitation codes and await approval
**Plans**: 4 plans

Plans:
- [x] 05-01: Firebase Auth setup and registration form
- [x] 05-02: Invitation code generation and validation
- [x] 05-03: User collection structure and pending approval workflow
- [x] 05-04: Registration error handling and validation

### Phase 6: Login & Session Management
**Goal**: Approved users can securely log in and maintain sessions
**Plans**: 3 plans

Plans:
- [x] 06-01: Login form and Firebase Auth integration
- [x] 06-02: Session persistence and auto-logout for deactivated users
- [x] 06-03: Login error handling and validation

### Phase 7: User Management Dashboard
**Goal**: Super Admin can manage users and invitation codes
**Plans**: 4 plans

Plans:
- [x] 07-01: Super Admin dashboard with tabs
- [x] 07-02: Pending approvals workflow with role assignment
- [x] 07-03: User list with deactivate/reactivate/delete
- [x] 07-04: Invitation code list with status tracking

### Phase 8: Role-Based Permissions System
**Goal**: Users see only tabs and actions allowed by their role
**Plans**: 5 plans

Plans:
- [x] 08-01: Role templates collection and permission structure
- [x] 08-02: Permission checking utilities (hasTabAccess, canEditTab)
- [x] 08-03: Navigation filtering by role permissions
- [x] 08-04: View-level permission enforcement (edit vs view-only)
- [x] 08-05: Real-time permission updates via Firestore listeners

### Phase 9: Project Assignments for Operations Users
**Goal**: Operations Users see only assigned projects
**Plans**: 3 plans

Plans:
- [x] 09-01: Project assignments UI for Super Admin
- [x] 09-02: Project filtering logic in MRF and Project views
- [x] 09-03: Real-time assignment updates

### Phase 10: Route Protection & Session Security
**Goal**: Unauthenticated users are redirected and sessions are secure
**Plans**: 4 plans

Plans:
- [x] 10-01: Router authentication checks and redirection
- [x] 10-02: Deep link support (save and restore intended route)
- [x] 10-03: Pending user restrictions
- [x] 10-04: Minimum Super Admin safeguard

</details>

<details>
<summary>✅ v2.1 System Refinement (Phases 11-13) - SHIPPED 2026-02-06</summary>

### Phase 11: Security & Permission Foundation
**Goal**: Super Admin can access all tabs and Operations Admin can be assigned to projects
**Depends on**: Phase 10
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Super Admin can view and edit Clients tab without permission denied errors
  2. Super Admin can view and edit Projects tab without permission denied errors
  3. Operations Admin role can be selected in project assignments UI
  4. Operations Admin assigned to project sees it in filtered project lists
  5. Firebase Security Rules emulator tests pass for admin bypass scenarios
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Add clients collection Security Rules and tests
- [x] 11-02-PLAN.md — Enable Operations Admin project assignment support

### Phase 12: Finance Review Workflow
**Goal**: Finance can review and approve PRs and TRs without errors
**Depends on**: Phase 11
**Requirements**: FIN-01, FIN-02
**Success Criteria** (what must be TRUE):
  1. Finance user clicks Review button on Material Purchase Request and modal opens
  2. Finance user clicks Review button on Transport Request and modal opens
  3. Review modals close properly when user presses ESC key
  4. Finance user can approve PR and status updates in real-time
  5. Finance user can approve TR and status updates in real-time
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md — Fix window function lifecycle for PR/TR review buttons
- [x] 12-02-PLAN.md — Add modal ESC key handling with AbortController

### Phase 13: Finance Dashboard & Audit Trails
**Goal**: Finance can view project expenses, supplier purchase history, and procurement timelines
**Depends on**: Phase 12
**Requirements**: FIN-03, PROC-01, PROC-02
**Success Criteria** (what must be TRUE):
  1. Finance user sees Project List tab with all projects and their expense totals
  2. Finance user clicks project name and expense breakdown modal opens showing all POs by category
  3. Procurement user clicks supplier name and modal opens showing all purchases from that supplier
  4. Procurement user clicks Timeline button and modal shows MRF → PRs → POs → Delivered workflow
  5. Dashboard totals use manual refresh (not real-time - aggregation queries don't support listeners)
**Plans**: 5 plans

Plans:
- [x] 13-01-PLAN.md — Finance Project List tab with server-side aggregation
- [x] 13-02-PLAN.md — Supplier purchase history modal in Procurement
- [x] 13-03-PLAN.md — Procurement timeline modal using createTimeline component
- [x] 13-04-PLAN.md — Add Firebase composite indexes for aggregation and timeline queries
- [x] 13-05-PLAN.md — Move supplier purchase history to Supplier Management tab

</details>

## 🚧 v2.2 Workflow & UX Enhancements (In Progress)

**Milestone Goal:** Enhance workflows and UX across all major areas with auto-population, restructured interfaces, comprehensive status tracking, signature capture, and consolidated navigation.

### Phase 15: User Data & Permission Improvements
**Goal**: Auto-populate user data and enforce proper project creation permissions
**Depends on**: Phase 13
**Success Criteria** (what must be TRUE):
  1. MRF form auto-populates "Your Name" from logged-in user (field removed from form)
  2. Only operation_admin and super_admin roles can create new projects
  3. Personnel field is required when creating projects
  4. Personnel field functions as proper user assignment (type name/email and select)
  5. Project assignments work seamlessly with the new personnel selection
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md — Auto-populate MRF requestor name from logged-in user
- [x] 15-02-PLAN.md — Project creation permission guards and personnel user datalist

### Phase 16: Project Detail Page Restructure
**Goal**: Reorganize project detail page for clarity and better information hierarchy
**Depends on**: Phase 15
**Success Criteria** (what must be TRUE):
  1. Active status toggle appears at top of detail page
  2. Card 1 displays: Project Code, Name, Client, Assigned Personnel
  3. Card 2 displays: Budget, Contract Cost, Expense
  4. Card 3 displays: Internal Status, Project Status
  5. Layout avoids redundancy and presents information logically
**Plans**: 1 plan

Plans:
- [ ] 16-01-PLAN.md — Restructure into 3-card layout with expense calculation and breakdown modal

### Phase 17: Procurement Workflow Overhaul
**Goal**: Rename tabs, track PR creators, fix supplier modals, implement comprehensive MRF status tracking with visual indicators
**Depends on**: Phase 15
**Success Criteria** (what must be TRUE):
  1. MRF Processing: Generated PRs bear the name of user who clicked Generate PR button
  2. Supplier Management: Clicking supplier name always opens historical purchases modal
  3. PR-PO tab renamed to "MRF Records"
  4. MRF Records: Clickable supplier names removed from PRs/POs columns
  5. MRF Records: "DATE" column renamed to "Date Needed"
  6. MRF Records: "PO Timeline" column removed (timeline button remains in Actions)
  7. MRF Records: PR and corresponding PO displayed side by side
  8. MRF Records: MRF Status shows "Awaiting PR" (red), "0/n PO Issued" (yellow), "n/n PO Issued" (green)
  9. MRF Records: "PO Status" column renamed to "Procurement Status"
  10. MRF Records: Timeline captures timestamps (not just dates) for efficiency measurement
  11. MRF Records: Columns ordered: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions
**Plans**: TBD

Plans:
- [ ] 17-01: TBD

### Phase 18: Finance Workflow & Expense Reporting
**Goal**: Add signature capture, improve approval flow, remove unused tabs, create comprehensive project expense breakdown
**Depends on**: Phase 15
**Success Criteria** (what must be TRUE):
  1. Pending Approvals: Approval modal includes signature capture
  2. Pending Approvals: After PO generation, user stays on Pending Approvals tab (no auto-redirect)
  3. Pending Approvals: Generated PO document includes captured signature
  4. PR documents capture and display the name of Procurement user who prepared/generated the PR from MRF
  5. PO documents capture and display the name of Finance user who approved and created the PO
  6. Historical Data tab removed from Finance navigation
  7. Project List table shows: Project Name (Code + Name), Client Name, Total Expense, Budget, Remaining Budget, Status
  8. Clicking project row opens expense breakdown modal
  9. Expense modal scorecards show: Project Budget, Remaining Budget, Material Purchases, Transport Fees, Subcon Cost, Total Project Cost
  10. Expense modal has view switcher: Category / Materials / Transport
  11. All project expenses accurately accounted (materials, transport, delivery fees)
**Plans**: TBD

Plans:
- [ ] 18-01: TBD

### Phase 19: Navigation Consolidation
**Goal**: Merge admin tabs into single navigation item for cleaner interface
**Depends on**: Phase 16, 17, 18
**Success Criteria** (what must be TRUE):
  1. Settings, Assignments, and Users tabs merged into single "Admin" navigation item
  2. Admin navigation item opens submenu or dedicated page with 3 sections
  3. All existing functionality preserved (no features lost)
  4. Navigation is cleaner and less cluttered
  5. Role-based visibility still enforced (only admins see Admin nav item)
**Plans**: TBD

Plans:
- [ ] 19-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 15 → 16 → 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Client Management | v1.0 | 2/2 | Complete | 2026-01-30 |
| 2. Project Codes | v1.0 | 3/3 | Complete | 2026-01-30 |
| 3. Project Detail View | v1.0 | 2/2 | Complete | 2026-01-30 |
| 4. MRF-Project Integration | v1.0 | 3/3 | Complete | 2026-01-30 |
| 5. Registration & Invitations | v2.0 | 4/4 | Complete | 2026-02-04 |
| 6. Login & Sessions | v2.0 | 3/3 | Complete | 2026-02-04 |
| 7. User Management | v2.0 | 4/4 | Complete | 2026-02-04 |
| 8. Role Permissions | v2.0 | 5/5 | Complete | 2026-02-04 |
| 9. Project Assignments | v2.0 | 3/3 | Complete | 2026-02-04 |
| 10. Route Protection | v2.0 | 4/4 | Complete | 2026-02-04 |
| 11. Security Foundation | v2.1 | 2/2 | Complete | 2026-02-05 |
| 12. Finance Workflow | v2.1 | 2/2 | Complete | 2026-02-05 |
| 13. Finance Dashboard | v2.1 | 5/5 | Complete | 2026-02-06 |
| 15. User Data & Permissions | v2.2 | 2/2 | Complete | 2026-02-06 |
| 16. Project Detail Restructure | v2.2 | 1/1 | Ready | - |
| 17. Procurement Overhaul | v2.2 | 0/0 | Not started | - |
| 18. Finance Expense Reporting | v2.2 | 0/0 | Not started | - |
| 19. Navigation Consolidation | v2.2 | 0/0 | Not started | - |
