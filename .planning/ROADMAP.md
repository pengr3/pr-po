# Roadmap: CLMC Procurement System

## Milestones

- ✅ **v1.0 Core Projects Foundation** - Phases 1-4 (shipped 2026-01-30)
- ✅ **v2.0 Authentication & Permissions** - Phases 5-10 (shipped 2026-02-04)
- ✅ **v2.1 System Refinement** - Phases 11-13 (shipped 2026-02-06)
- ✅ **v2.2 Workflow & UX Enhancements** - Phases 15-25 (shipped 2026-02-10)
- 🚧 **v2.3 Services Department Support** - Phases 26-31 (in progress)

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
**Plans**: 3 plans

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

### 🚧 v2.3 Services Department Support (In Progress)

**Milestone Goal:** Enable parallel workflows for Projects and Services departments with complete role-based isolation and shared procurement pipeline.

#### Phase 26: Security & Roles Foundation
**Goal**: Firebase Security Rules and role templates enable Services department isolation
**Depends on**: Phase 25
**Requirements**: ROLE-01 to ROLE-11, SEC-01 to SEC-08
**Success Criteria** (what must be TRUE):
  1. services_admin role can create, read, update, delete documents in services collection
  2. services_user role can read only assigned services (filtered by assigned_service_codes array)
  3. Super Admin bypasses services role checks and can access both departments
  4. Finance and Procurement roles can read services collection for cross-department workflows
  5. Security Rules tests pass for all services collection scenarios (automated emulator tests)
**Plans**: TBD

Plans:
- [ ] 26-01: TBD
- [ ] 26-02: TBD

#### Phase 27: Code Generation
**Goal**: Services and Projects share CLMC_CLIENT_YYYY### sequence without collisions
**Depends on**: Phase 26
**Requirements**: SERV-02
**Success Criteria** (what must be TRUE):
  1. generateServiceCode() queries both projects and services collections for max sequence number
  2. Creating a service immediately after a project increments the shared sequence correctly
  3. getAssignedServiceCodes() utility returns services_user's assigned service codes
  4. Users collection includes assigned_service_codes array and all_services boolean flag
**Plans**: TBD

Plans:
- [ ] 27-01: TBD

#### Phase 28: Services View
**Goal**: Services CRUD with service_type differentiation and assignment system
**Depends on**: Phase 27
**Requirements**: SERV-01, SERV-03 to SERV-12, UI-01 to UI-08, ASSIGN-01 to ASSIGN-06
**Success Criteria** (what must be TRUE):
  1. services_admin can create services with service_type selection (one-time or recurring)
  2. Services tab appears in navigation for services roles and has two sub-tabs (Services, Recurring)
  3. Services sub-tab shows only service_type='one-time', Recurring shows only service_type='recurring'
  4. Service detail page shows comprehensive information with card-based layout (mirrors Projects)
  5. services_admin can assign personnel to services via multi-personnel selection UI
  6. Personnel changes automatically sync to user's assigned_service_codes array (no logout required)
  7. services_user sees only assigned services in filtered views
  8. Active/inactive flag controls whether service appears in MRF dropdown
  9. Services list supports filtering by service_type, status, client and search by code or name
  10. Service detail page includes expense breakdown showing linked MRFs/PRs/POs
**Plans**: TBD

Plans:
- [ ] 28-01: TBD
- [ ] 28-02: TBD
- [ ] 28-03: TBD

#### Phase 29: MRF Integration
**Goal**: Role-based dropdown visibility connects Services to procurement workflow
**Depends on**: Phase 28
**Requirements**: MRF-01 to MRF-10
**Success Criteria** (what must be TRUE):
  1. operations_admin and operations_user see Projects dropdown in MRF form (Services dropdown hidden)
  2. services_admin and services_user see Services dropdown in MRF form (Projects dropdown hidden)
  3. Super Admin, Finance, Procurement see both Projects and Services dropdowns with clear labels
  4. Services dropdown displays format "CLMC_CODE_YYYY### - Service Name" and shows only active services
  5. MRF stores denormalized service_code and service_name plus department field ('projects' or 'services')
  6. Service code and name display correctly in MRF lists and detail views
  7. Services-linked MRFs appear in procurement workflow (PR generation works)
**Plans**: TBD

Plans:
- [ ] 29-01: TBD
- [ ] 29-02: TBD

#### Phase 30: Cross-Department Workflows
**Goal**: Finance and Procurement approve work from both departments in unified interface
**Depends on**: Phase 29
**Requirements**: CROSS-01 to CROSS-07
**Success Criteria** (what must be TRUE):
  1. Finance Pending Approvals shows PRs/TRs from both Projects and Services with department badges
  2. Procurement PO Tracking shows POs from both Projects and Services with department indicators
  3. Optional department filter dropdown allows filtering by Projects or Services (or show all)
  4. PR generation works for Services-linked MRFs (generates PRs with service_code)
  5. PO creation works for Services-linked PRs (issues POs with correct department context)
  6. Timeline audit trail shows department context (Projects badge vs Services badge)
**Plans**: TBD

Plans:
- [ ] 30-01: TBD
- [ ] 30-02: TBD

#### Phase 31: Dashboard Integration
**Goal**: Dashboard shows Services department statistics alongside Projects
**Depends on**: Phase 30
**Requirements**: DASH-01 to DASH-03
**Success Criteria** (what must be TRUE):
  1. Dashboard shows active services count (separate from projects count)
  2. Dashboard shows Services-linked MRFs count with status breakdown
  3. Dashboard shows department breakdown chart (Projects vs Services work distribution)
**Plans**: TBD

Plans:
- [ ] 31-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 26 → 27 → 28 → 29 → 30 → 31

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
| 26. Security & Roles Foundation | v2.3 | 0/2 | Not started | - |
| 27. Code Generation | v2.3 | 0/1 | Not started | - |
| 28. Services View | v2.3 | 0/3 | Not started | - |
| 29. MRF Integration | v2.3 | 0/2 | Not started | - |
| 30. Cross-Department Workflows | v2.3 | 0/2 | Not started | - |
| 31. Dashboard Integration | v2.3 | 0/1 | Not started | - |
