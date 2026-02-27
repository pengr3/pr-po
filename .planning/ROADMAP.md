# Roadmap: CLMC Procurement System

## Milestones

- ✅ **v1.0 Core Projects Foundation** - Phases 1-4 (shipped 2026-01-30)
- ✅ **v2.0 Authentication & Permissions** - Phases 5-10 (shipped 2026-02-04)
- ✅ **v2.1 System Refinement** - Phases 11-13 (shipped 2026-02-06)
- ✅ **v2.2 Workflow & UX Enhancements** - Phases 15-25 (shipped 2026-02-10)
- ✅ **v2.3 Services Department Support** - Phases 26-40 (shipped 2026-02-26)
- 🚧 **v2.4 Productivity & Polish** - Phases 41-46 (in progress)

## Phases

<details>
<summary>✅ v1.0 Core Projects Foundation (Phases 1-4) - SHIPPED 2026-01-30</summary>

### Phase 1: Clients Management Foundation
**Goal**: Client database with uppercase codes, uniqueness validation, and real-time sync
**Plans**: 3 plans

Plans:
- [x] 01-01: Clients collection CRUD operations
- [x] 01-02: Client code validation and uppercase enforcement
- [x] 01-03: Clients tab UI with list view and forms

### Phase 2: Projects Tab Structure
**Goal**: Project lifecycle tracking from lead to completion with composite code generation
**Plans**: 3 plans

Plans:
- [x] 02-01: Projects collection with CLMC_CLIENT_YYYY### code generation
- [x] 02-02: Dual-status tracking (Internal Status + Project Status)
- [x] 02-03: Projects tab UI with list view, filtering, and search

### Phase 3: Project Detail & Inline Editing
**Goal**: Full-page project detail view with inline editing and auto-save
**Plans**: 2 plans

Plans:
- [x] 03-01: Project detail page with inline editing
- [x] 03-02: Focus preservation during real-time updates

### Phase 4: MRF-Project Integration
**Goal**: Project-anchored MRF workflow with dropdown integration
**Plans**: 2 plans

Plans:
- [x] 04-01: Project dropdown in MRF form with denormalized storage
- [x] 04-02: Display project info across 21 integration points

</details>

<details>
<summary>✅ v2.0 Authentication & Permissions (Phases 5-10) - SHIPPED 2026-02-04</summary>

### Phase 5: Authentication Foundation
**Goal**: Self-registration with invitation codes and persistent session management
**Plans**: 4 plans

Plans:
- [x] 05-01: Firebase Auth integration with email/password
- [x] 05-02: Invitation code generation with 3-hour expiration
- [x] 05-03: Self-registration with invitation code validation
- [x] 05-04: Persistent session with auto-logout for deactivated users

### Phase 6: Role-Based Access Control
**Goal**: 5-role RBAC system with real-time permission updates
**Plans**: 4 plans

Plans:
- [x] 06-01: Role templates collection with configurable permissions
- [x] 06-02: Permission system with hasTabAccess() and hasEditAccess()
- [x] 06-03: Real-time permission updates via Firestore listeners
- [x] 06-04: Super Admin role configuration interface

### Phase 7: Project Assignment System
**Goal**: Operations Users see only assigned projects with immediate filtering
**Plans**: 3 plans

Plans:
- [x] 07-01: User assignment data structure (assigned_project_codes array)
- [x] 07-02: Project assignments interface for Super Admin
- [x] 07-03: Assignment-based filtering across 4 views

### Phase 8: Firebase Security Rules
**Goal**: Server-side enforcement with 17/17 automated tests passing
**Plans**: 5 plans

Plans:
- [x] 08-01: Security Rules for clients, projects, mrfs collections
- [x] 08-02: Security Rules for prs, pos, transport_requests collections
- [x] 08-03: Security Rules for suppliers, deleted_mrfs collections
- [x] 08-04: Security Rules for users, invitation_codes, role_templates collections
- [x] 08-05: Automated testing with Firebase Emulator Suite

### Phase 9: Super Admin Dashboard
**Goal**: Complete user lifecycle management from invitation to deletion
**Plans**: 4 plans

Plans:
- [x] 09-01: Invitation code generation and expiration tracking
- [x] 09-02: Pending approvals with role assignment
- [x] 09-03: User management (deactivate, reactivate, delete)
- [x] 09-04: Minimum 2 Super Admin safeguard

### Phase 10: Route Protection
**Goal**: Multi-layer authentication guards with deep-link support
**Plans**: 6 plans

Plans:
- [x] 10-01: Authentication guard with redirect to login
- [x] 10-02: Deep-link support (save and restore intended route)
- [x] 10-03: Pending user restriction to /pending page
- [x] 10-04: Navigation visibility control for unauthenticated users
- [x] 10-05: Tab visibility based on role permissions
- [x] 10-06: Comprehensive route protection testing

</details>

<details>
<summary>✅ v2.1 System Refinement (Phases 11-13) - SHIPPED 2026-02-06</summary>

### Phase 11: Security Foundation Fixes
**Goal**: Admin bypass logic and Operations Admin project assignment support
**Plans**: 3 plans

Plans:
- [x] 11-01: Super Admin bypass in Security Rules
- [x] 11-02: Operations Admin assignment support
- [x] 11-03: Comprehensive test coverage (8 clients tests, 3 assignment tests)

### Phase 12: Finance Review Workflow Restoration
**Goal**: Window function lifecycle management and event listener cleanup
**Plans**: 3 plans

Plans:
- [x] 12-01: attachWindowFunctions() pattern for PR review
- [x] 12-02: attachWindowFunctions() pattern for TR review
- [x] 12-03: AbortController for event listener cleanup

### Phase 13: Finance Dashboard Features
**Goal**: Project List tab with aggregated expense totals and breakdown modals
**Plans**: 5 plans

Plans:
- [x] 13-01: Project List tab with getAggregateFromServer
- [x] 13-02: Expense breakdown modal with category scorecards
- [x] 13-03: Supplier purchase history modal
- [x] 13-04: Procurement timeline using createTimeline component
- [x] 13-05: Composite indexes for multi-field Firestore queries

</details>

<details>
<summary>✅ v2.2 Workflow & UX Enhancements (Phases 15-25) - SHIPPED 2026-02-10</summary>

### Phase 15: MRF Form Efficiency
**Goal**: Auto-populated user data and permission-based project creation
**Plans**: 2 plans

Plans:
- [x] 15-01: Auto-populate requestor name with getCurrentUser()
- [x] 15-02: Restrict project creation to admin roles

### Phase 16: Project Detail Restructure
**Goal**: Card-based layout with financial summary and status cards
**Plans**: 2 plans

Plans:
- [x] 16-01: 3-card layout (Project Info, Financial Summary, Status)
- [x] 16-02: Manual expense calculation via aggregation

### Phase 17: Comprehensive Status Tracking
**Goal**: Color-coded MRF badges and PR creator attribution
**Plans**: 3 plans

Plans:
- [x] 17-01: Color-coded MRF badges (red/yellow/green)
- [x] 17-02: PR creator attribution across 3 generation paths
- [x] 17-03: serverTimestamp for millisecond-precision timeline tracking

### Phase 18: Finance Signature Capture
**Goal**: Canvas-based signature drawing with base64 PNG storage
**Plans**: 2 plans

Plans:
- [x] 18-01: signature_pad library integration
- [x] 18-02: Dual attribution (Prepared By + Approved By) in PO documents

### Phase 19: Consolidated Admin Navigation
**Goal**: Single dropdown replacing 3 separate tabs
**Plans**: 2 plans

Plans:
- [x] 19-01: Wrapper view pattern with _pendingAdminSection coordination
- [x] 19-02: Seamless section switching without logout

### Phase 20: Multi-Personnel Selection
**Goal**: Pill UI with array storage and normalizePersonnel handling
**Plans**: 3 plans

Plans:
- [x] 20-01: Parallel array storage (personnel_user_ids + personnel_names)
- [x] 20-02: normalizePersonnel() handling 4 legacy formats
- [x] 20-03: Pill UI with add/remove interactions

### Phase 21: Automatic Personnel-to-Assignment Sync
**Goal**: Real-time project visibility via arrayUnion/arrayRemove
**Plans**: 2 plans

Plans:
- [x] 21-01: syncPersonnelToAssignments() function
- [x] 21-02: Real-time listener for personnel changes

### Phase 22: Project Edit History (Foundation)
**Goal**: Audit trail foundation with instrumented mutation points
**Plans**: 3 plans

Plans:
- [x] 22-01: trackChange() utility for edit history
- [x] 22-02: 4 initial instrumentation points (inline editing)
- [x] 22-03: Firestore subcollection for edit history

### Phase 23: Rejection Reason Passthrough
**Goal**: Finance rejection attribution in procurement workflow
**Plans**: 2 plans

Plans:
- [x] 23-01: rejection_reason field on MRFs/PRs/TRs
- [x] 23-02: Display rejection reason in procurement views

### Phase 24: Edit History Instrumentation
**Goal**: Complete audit trail across all mutation points
**Plans**: 2 plans

Plans:
- [x] 24-01: 3 additional instrumentation points (form saves, assignments)
- [x] 24-02: Timeline modal showing field changes with old → new values

### Phase 25: Edit History Timeline Modal
**Goal**: User-facing timeline display in project detail
**Plans**: 2 plans

Plans:
- [x] 25-01: Timeline modal with user attribution
- [x] 25-02: Field-level change tracking with old → new values

</details>

<details>
<summary>✅ v2.3 Services Department Support (Phases 26-40) - SHIPPED 2026-02-26</summary>

### Phase 26: Security & Roles Foundation
**Goal**: Firebase Security Rules and role templates enable Services department isolation
**Plans**: 3 plans

Plans:
- [x] 26-01: Security Rules for services collection + isAssignedToService() + role templates
- [x] 26-02: User-management services role dropdowns + role-config ROLE_ORDER/TABS/ROLE_LABELS
- [x] 26-03: Firestore emulator tests — 12 services collection tests (SEC-07)

### Phase 27: Code Generation
**Goal**: Services and Projects share CLMC_CLIENT_YYYY### sequence without collisions
**Plans**: 1 plan

Plans:
- [x] 27-01: Add generateServiceCode() and getAssignedServiceCodes() to app/utils.js (SERV-02)

### Phase 28: Services View
**Goal**: Services CRUD with service_type differentiation and assignment system
**Plans**: 3 plans

Plans:
- [x] 28-01: syncServicePersonnelToAssignments() in utils.js + role_templates permissions seed script
- [x] 28-02: app/views/services.js list view with sub-tabs/CRUD/filtering + router.js routes + index.html nav link
- [x] 28-03: app/views/service-detail.js detail page + service-assignments.js admin panel + admin.js 4th section

### Phase 29: MRF Integration
**Goal**: Role-based dropdown visibility connects Services to procurement workflow
**Plans**: 3 plans

Plans:
- [x] 29-01: mrf-form.js role-based dropdown UI: Services dropdown HTML + loadServices() + role-aware init()
- [x] 29-02: mrf-form.js submission handler + department/service fields + procurement.js saveNewMRF() + PR/TR creation service fields
- [x] 29-03: getMRFLabel() helper + display locations in procurement.js + finance.js + PO addDoc service fields

### Phase 30: Cross-Department Workflows
**Goal**: Finance and Procurement approve work from both departments in unified interface
**Plans**: 2 plans

Plans:
- [x] 30-01: finance.js dept badges + filter dropdown for Material PRs, Transport Requests, POs + modal badge updates
- [x] 30-02: procurement.js dept badges + filter dropdown for PO Tracking + showProcurementTimeline dept-aware descriptions

### Phase 31: Dashboard Integration
**Goal**: Dashboard shows Services department statistics alongside Projects, with role-aware visibility
**Plans**: 1 plan

Plans:
- [x] 31-01: home.js role-aware stats (getDashboardMode, loadStats branching, both-mode group labels) + hero.css stat-group CSS

### Phase 32: Fix Firestore Assignment Rules
**Goal**: Add services_admin to users update rule so assignment sync writes succeed
**Plans**: 1 plan

Plans:
- [x] 32-01: firestore.rules: add services_admin to users get/list/update rules + 6 emulator tests + production deploy

### Phase 33: Service Expense Breakdown
**Goal**: Replace stub in service-detail.js with real aggregation query
**Plans**: 1 plan

Plans:
- [x] 33-01: service-detail.js: aggregation query (mrfs/prs/pos by service_code) + expense breakdown render

### Phase 34: Documentation & Minor Fixes
**Goal**: Phase 31 verification, REQUIREMENTS.md cleanup, and Finance PO department filter gap
**Plans**: 2 plans

Plans:
- [x] 34-01: Create 31-VERIFICATION.md + update REQUIREMENTS.md (checkboxes, coverage count, DASH-03 traceability)
- [x] 34-02: finance.js: add department filter dropdown to Purchase Orders tab (Tab 2)

### Phase 35: Fix Service Edit History Path Defect + UAT Gap Closure
**Goal**: Fix service edit history path defect and close UAT-identified gaps
**Plans**: 3 plans

Plans:
- [x] 35-01: edit-history.js collectionName param + service-detail.js Edit History button/call sites + firestore.rules subcollection rule + deploy
- [x] 35-02: service-detail.js: fix canEdit === true guard + saveServiceField !== true guard + canReadTab defense
- [x] 35-03: firestore.rules: add services_user branch to prs list rule + pos list rule + deploy

### Phase 36: Fix Expense Breakdown Modal
**Goal**: Unify expense breakdown modal — single showExpenseBreakdownModal with mode branching
**Plans**: 1 plan

Plans:
- [x] 36-01: Unify expense-modal.js and update three call sites (service-detail, project-detail, finance)

### Phase 37: Documentation & File Cleanup
**Goal**: Close documentation tech debt — Phase 28 VERIFICATION.md, Phase 26 SUMMARY.md fix, ROADMAP.md updates
**Plans**: 1 plan

Plans:
- [x] 37-01: Documentation cleanup: Phase 28 VERIFICATION.md + Phase 26 frontmatter fix + ROADMAP.md progress table + delete .continue-here files

### Phase 38: Code Quality & DRY Cleanup
**Goal**: Extract duplicate helpers to shared module, fix procurement scoreboard, remove dead code
**Plans**: 2 plans

Plans:
- [x] 38-01: Extract getMRFLabel()/getDeptBadgeHTML() to components.js + fix procurement scoreboard global totals
- [x] 38-02: Fix hardcoded approver name + add audit trail fields to all approval flows + dead code and debug log sweep

### Phase 39: Admin Assignments Overhaul, Badge Styling, and Project Code Fix
**Goal**: Replace bloated per-user assignment pages with compact table+modal interface, standardize badge colors, fix project code collisions
**Plans**: 3 plans

Plans:
- [x] 39-01: Fix generateProjectCode dual-collection query + badge CSS infrastructure
- [x] 39-02: Unified assignments.js module (table+modal) replacing project-assignments.js + service-assignments.js + admin.js update
- [x] 39-03: Badge sweep across procurement.js, finance.js, home.js

### Phase 40: UI/UX Revisions
**Goal**: MRF request type label, client detail modal, services tab cleanup, My Requests sub-tab, MRF search improvements, procurement timeline fixes
**Plans**: 7 plans

Plans:
- [x] 40-01: Trivial UI fixes: MRF label rename + MRF search improvements + Services tab column cleanup
- [x] 40-02: Client detail modal with linked projects/services and clickable detail links
- [x] 40-03: Procurement timeline fixes: emoji removal, Invalid Date fix, PR->PO grouping, procurement status per PO
- [x] 40-04: MRF tracking: shared MRF Records module extraction + My Requests sub-tab in Material Request view
- [x] 40-05: Gap closure: rewrite mrf-records.js to match full Procurement MRF Records table layout with async PR/PO sub-rows
- [x] 40-06: Gap closure: add clickable PR/PO detail modals and Timeline button to My Requests table
- [x] 40-07: View PR/PO document generation buttons in My Requests modals

</details>

### 🚧 v2.4 Productivity & Polish (In Progress)

**Milestone Goal:** Export data from key list views and detail pages, make the app usable at narrow viewport widths, remove dead code, polish branding and navigation UI, and fix MRF creation in Procurement.

## Phase Details

### Phase 41: List View Exports
**Goal**: Users can export data from all major list views as CSV files
**Depends on**: Phase 40
**Requirements**: EXP-01, EXP-02, EXP-03, EXP-04, EXP-05
**Success Criteria** (what must be TRUE):
  1. User can click an Export button on the MRF Records list and download a CSV containing all visible rows
  2. User can click an Export button on the PR/PO Records list and download a CSV with PR and PO data
  3. User can click an Export button on the PO Tracking list and download a CSV of PO tracking records
  4. User can click an Export button on the Projects list and download a CSV of all projects
  5. User can click an Export button on the Services list and download a CSV of all services
**Plans**: 3 plans

Plans:
- [ ] 41-01-PLAN.md — downloadCSV utility + Projects export (EXP-04) + Services export (EXP-05)
- [ ] 41-02-PLAN.md — MRF list export in mrf-records.js/mrf-form.js (EXP-01) + Finance PO export (EXP-03)
- [ ] 41-03-PLAN.md — PR/PO Records export in procurement.js (EXP-02)

### Phase 42: Detail Page Exports
**Goal**: Users can export expense breakdown data from project and service detail pages
**Depends on**: Phase 41
**Requirements**: EXP-06, EXP-07
**Success Criteria** (what must be TRUE):
  1. User can click Export on a project's expense breakdown and download a CSV with MRF, PR, and PO line items for that project
  2. User can click Export on a service's expense breakdown and download a CSV with MRF, PR, and PO line items for that service
**Plans**: TBD

### Phase 43: Mobile Hamburger Navigation
**Goal**: Top navigation collapses into a hamburger menu at narrow viewport widths so the app is usable on small screens
**Depends on**: Phase 40
**Requirements**: RES-01
**Success Criteria** (what must be TRUE):
  1. At viewport widths below the breakpoint, the navigation items are hidden and a hamburger icon is visible
  2. Tapping the hamburger icon opens a menu showing all navigation items the user has access to
  3. Tapping a menu item navigates to that view and closes the menu
  4. At full desktop width, the navigation renders as a standard horizontal bar with no hamburger icon
**Plans**: TBD

### Phase 44: Responsive Layouts
**Goal**: Data tables, split panels, and modals remain functional and readable at any viewport width
**Depends on**: Phase 43
**Requirements**: RES-02, RES-03, RES-04, RES-05
**Success Criteria** (what must be TRUE):
  1. Data tables with many columns scroll horizontally instead of clipping or breaking the page layout
  2. Split-panel views (MRF list and MRF detail side by side) stack vertically at narrow widths so both panels are fully readable
  3. Modals and dialogs fit within the viewport at narrow widths and do not overflow or clip action buttons
  4. All views are functional and readable at the minimum supported browser window size
**Plans**: TBD

### Phase 45: Visual Polish
**Goal**: Registration page shows the company logo and navigation is visually consistent across all views
**Depends on**: Phase 40
**Requirements**: BRD-01, NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. The registration page displays the company logo image instead of the "CL" text placeholder
  2. No navigation link or tab label in any view has an underline or emoji
  3. The Admin button in the top navigation is styled identically to all other top navigation items
  4. Navigation appearance is consistent when switching between any two tabs or sub-tabs
**Plans**: TBD

### Phase 46: Code Cleanup and MRF Fix
**Goal**: Dead files are removed from the codebase and MRF creation in Procurement uses the same unified project/service dropdown as the MRF form view
**Depends on**: Phase 40
**Requirements**: CLN-01, CLN-02, MRF-01
**Success Criteria** (what must be TRUE):
  1. project-assignments.js and service-assignments.js no longer exist in the repository
  2. No other unreferenced view or utility files remain in the codebase
  3. The Create MRF form in Procurement > MRF Processing shows a single dropdown listing both active projects and active services, in the same format used by the standalone MRF form view
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 41 → 42 → 43 → 44 → 45 → 46

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Clients Management Foundation | v1.0 | 3/3 | Complete | 2026-01-30 |
| 2. Projects Tab Structure | v1.0 | 3/3 | Complete | 2026-01-30 |
| 3. Project Detail & Inline Editing | v1.0 | 2/2 | Complete | 2026-01-30 |
| 4. MRF-Project Integration | v1.0 | 2/2 | Complete | 2026-01-30 |
| 5. Authentication Foundation | v2.0 | 4/4 | Complete | 2026-02-04 |
| 6. Role-Based Access Control | v2.0 | 4/4 | Complete | 2026-02-04 |
| 7. Project Assignment System | v2.0 | 3/3 | Complete | 2026-02-04 |
| 8. Firebase Security Rules | v2.0 | 5/5 | Complete | 2026-02-04 |
| 9. Super Admin Dashboard | v2.0 | 4/4 | Complete | 2026-02-04 |
| 10. Route Protection | v2.0 | 6/6 | Complete | 2026-02-04 |
| 11. Security Foundation Fixes | v2.1 | 3/3 | Complete | 2026-02-06 |
| 12. Finance Review Workflow Restoration | v2.1 | 3/3 | Complete | 2026-02-06 |
| 13. Finance Dashboard Features | v2.1 | 5/5 | Complete | 2026-02-06 |
| 15. MRF Form Efficiency | v2.2 | 2/2 | Complete | 2026-02-10 |
| 16. Project Detail Restructure | v2.2 | 2/2 | Complete | 2026-02-10 |
| 17. Comprehensive Status Tracking | v2.2 | 3/3 | Complete | 2026-02-10 |
| 18. Finance Signature Capture | v2.2 | 2/2 | Complete | 2026-02-10 |
| 19. Consolidated Admin Navigation | v2.2 | 2/2 | Complete | 2026-02-10 |
| 20. Multi-Personnel Selection | v2.2 | 3/3 | Complete | 2026-02-10 |
| 21. Automatic Personnel-to-Assignment Sync | v2.2 | 2/2 | Complete | 2026-02-10 |
| 22. Project Edit History (Foundation) | v2.2 | 3/3 | Complete | 2026-02-10 |
| 23. Rejection Reason Passthrough | v2.2 | 2/2 | Complete | 2026-02-10 |
| 24. Edit History Instrumentation | v2.2 | 2/2 | Complete | 2026-02-10 |
| 25. Edit History Timeline Modal | v2.2 | 2/2 | Complete | 2026-02-10 |
| 26. Security & Roles Foundation | v2.3 | 3/3 | Complete | 2026-02-18 |
| 27. Code Generation | v2.3 | 1/1 | Complete | 2026-02-18 |
| 28. Services View | v2.3 | 3/3 | Complete | 2026-02-18 |
| 29. MRF Integration | v2.3 | 3/3 | Complete | 2026-02-18 |
| 30. Cross-Department Workflows | v2.3 | 2/2 | Complete | 2026-02-18 |
| 31. Dashboard Integration | v2.3 | 1/1 | Complete | 2026-02-19 |
| 32. Fix Firestore Assignment Rules | v2.3 | 1/1 | Complete | 2026-02-19 |
| 33. Service Expense Breakdown | v2.3 | 1/1 | Complete | 2026-02-19 |
| 34. Documentation & Minor Fixes | v2.3 | 2/2 | Complete | 2026-02-19 |
| 35. Fix Service Edit History + UAT Gap Closure | v2.3 | 3/3 | Complete | 2026-02-20 |
| 36. Fix Expense Breakdown Modal | v2.3 | 1/1 | Complete | 2026-02-23 |
| 37. Documentation & File Cleanup | v2.3 | 1/1 | Complete | 2026-02-24 |
| 38. Code Quality & DRY Cleanup | v2.3 | 2/2 | Complete | 2026-02-24 |
| 39. Admin Assignments Overhaul, Badge Styling, Code Fix | v2.3 | 3/3 | Complete | 2026-02-24 |
| 40. UI/UX Revisions | v2.3 | 7/7 | Complete | 2026-02-26 |
| 41. List View Exports | 3/3 | Complete    | 2026-02-27 | - |
| 42. Detail Page Exports | 1/1 | Complete   | 2026-02-27 | - |
| 43. Mobile Hamburger Navigation | v2.4 | 0/TBD | Not started | - |
| 44. Responsive Layouts | v2.4 | 0/TBD | Not started | - |
| 45. Visual Polish | v2.4 | 0/TBD | Not started | - |
| 46. Code Cleanup and MRF Fix | v2.4 | 0/TBD | Not started | - |
