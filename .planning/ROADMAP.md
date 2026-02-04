# Roadmap: CLMC Procurement System

## Milestones

- ✅ **v1.0 Core Projects Foundation** - Phases 1-4 (shipped 2026-01-30)
- 🚧 **v2.0 Authentication & Permissions** - Phases 5-10 (in progress)

## Phases

<details>
<summary>✅ v1.0 Core Projects Foundation (Phases 1-4) - SHIPPED 2026-01-30</summary>

### Phase 1: Foundation - Client Management
**Goal**: Establish client database as foundation for project tracking
**Plans**: 2 plans

Plans:
- [x] 01-01: Client CRUD operations
- [x] 01-02: Client code validation and uniqueness

### Phase 2: Core - Project Code Generation
**Goal**: Enable auto-generated project codes with client grouping
**Plans**: 2 plans

Plans:
- [x] 02-01: Composite project code generation (CLMC_CLIENT_YYYY###)
- [x] 02-02: Project CRUD operations with dual-status tracking

### Phase 3: Enhancement - Project Detail View
**Goal**: Full-page project detail view with inline editing
**Plans**: 3 plans

Plans:
- [x] 03-01: Project detail page with auto-save on blur
- [x] 03-02: Filtering, search, and sorting
- [x] 03-03: Active/inactive lifecycle management

### Phase 4: Integration - MRF-Project Connection
**Goal**: Anchor all MRFs to projects with denormalized storage
**Plans**: 3 plans

Plans:
- [x] 04-01: Project dropdown in MRF form
- [x] 04-02: Project display in MRF lists and details
- [x] 04-03: Backward compatibility for legacy MRFs

</details>

## 🚧 v2.0 Authentication & Permissions (In Progress)

**Milestone Goal:** Secure the foundation with role-based access control, enabling multiple users with granular permissions across procurement workflows.

**Phase Numbering:**
- Integer phases (5, 6, 7, etc.): Planned milestone work
- Decimal phases (5.1, 5.2): Urgent insertions (marked with INSERTED)

### Phase 5: Core Authentication
**Goal**: Users can register with invitation codes and authenticate securely
**Depends on**: Phase 4 (v1.0)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08, AUTH-09
**Success Criteria** (what must be TRUE):
  1. User can self-register with email, password, and invitation code
  2. Invalid or used invitation codes are rejected during registration
  3. User can log in with credentials and session persists across browser refresh
  4. User can log out from any page
  5. Pending users see "awaiting approval" message instead of main system
**Plans**: 4 plans

Plans:
- [x] 05-01: Firebase Auth foundation and auth utilities module
- [x] 05-02: Registration flow with invitation code validation
- [x] 05-03: Login page and session management
- [x] 05-04: Pending user page and logout integration

### Phase 6: Role Infrastructure & Real-time Permissions
**Goal**: Permission system exists with configurable role templates and immediate updates
**Depends on**: Phase 5
**Requirements**: PERM-01, PERM-02, PERM-03, PERM-04, PERM-05, PERM-06, PERM-07, PERM-13, PERM-14, PERM-15, PERM-16, PERM-17, PERM-18, PERM-19
**Success Criteria** (what must be TRUE):
  1. System has 5 role templates (Super Admin, Operations Admin, Operations User, Finance, Procurement) with default permissions
  2. Super Admin can view and edit role permissions via checkbox matrix
  3. Role configuration changes apply immediately to all users with that role (no logout required)
  4. Navigation menu shows only tabs permitted by user's role
  5. Edit mode vs view-only mode enforced within tabs based on role permissions
  6. Real-time listeners update permissions in active sessions when admin changes role or user role
**Plans**: 5 plans

Plans:
- [x] 06-01-PLAN.md — Role templates foundation and permissions module
- [x] 06-02-PLAN.md — Auth, router, and navigation permission integration
- [x] 06-03-PLAN.md — Role configuration admin UI (checkbox matrix)
- [x] 06-04-PLAN.md — Edit mode vs view-only enforcement (clients, projects, mrf-form)
- [x] 06-05-PLAN.md — Edit mode vs view-only enforcement (procurement, finance) + CSS

### Phase 7: Project Assignment System
**Goal**: Operations Users see only assigned projects with immediate filtering
**Depends on**: Phase 6
**Requirements**: PERM-08, PERM-09, PERM-10, PERM-11, PERM-12, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Super Admin can assign specific projects to Operations Users
  2. Operations Users with project assignments see only assigned projects in project list
  3. Operations Users can only create/edit MRFs for their assigned projects
  4. Operations Users can be assigned "all projects" (no filtering applied)
  5. Project assignment changes take effect immediately (no logout required)
**Plans**: 5 plans

Plans:
- [x] 07-01-PLAN.md — Assignment utility (getAssignedProjectCodes) and assignmentsChanged event dispatch
- [x] 07-02-PLAN.md — Project Assignments admin panel (view module + route + nav link)
- [x] 07-03-PLAN.md — Project list and detail assignment filtering
- [x] 07-04-PLAN.md — MRF form dropdown and procurement MRF list filtering
- [x] 07-05-PLAN.md — End-to-end verification checkpoint

### Phase 8: Security Rules Enforcement
**Goal**: Server-side Firebase Security Rules enforce all permissions and prevent client-side bypasses
**Depends on**: Phase 7
**Requirements**: PERM-20, PERM-21, PERM-22, PERM-23
**Success Criteria** (what must be TRUE):
  1. Firebase Security Rules validate user status (active) for all operations
  2. Firebase Security Rules validate user role permissions for all read/write operations
  3. Firebase Security Rules validate project assignments for data filtering
  4. Security Rules deployed and tested for all collections (users, roles, invitation_codes, projects, mrfs, prs, pos, transport_requests, suppliers)
  5. Attempting to bypass client-side checks via browser console is blocked by Security Rules
**Plans**: 4 plans

Plans:
- [ ] 08-01-PLAN.md — Firebase CLI infrastructure and test dependencies
- [ ] 08-02-PLAN.md — Complete Firestore Security Rules for all 9 collections
- [ ] 08-03-PLAN.md — Security rules test suite with emulator verification
- [ ] 08-04-PLAN.md — Production deployment and console bypass verification

### Phase 9: Super Admin User Management
**Goal**: Super Admin can manage users, approve registrations, and configure permissions
**Depends on**: Phase 8
**Requirements**: AUTH-10, AUTH-11, AUTH-12, AUTH-13, AUTH-14, AUTH-15, ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-07
**Success Criteria** (what must be TRUE):
  1. Super Admin can generate one-time invitation codes
  2. Super Admin can view pending user registrations and approve/reject
  3. Super Admin assigns role during user approval
  4. Super Admin can view list of all users with email, role, status, assigned projects
  5. Super Admin can deactivate or delete user accounts (with confirmation)
  6. System prevents deactivating last Super Admin account
**Plans**: TBD

Plans:
- [ ] 09-01: [To be planned]

### Phase 10: Route Protection & Session Security
**Goal**: Unauthenticated and unauthorized users cannot access the system
**Depends on**: Phase 9
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06
**Success Criteria** (what must be TRUE):
  1. Unauthenticated users are redirected to login page
  2. System saves intended route and restores after successful login (deep link support)
  3. Pending users cannot access main system (shown approval message)
  4. Deactivated users are automatically logged out when status changes
  5. System requires minimum 2 active Super Admin accounts
  6. System prevents operations that would violate minimum Super Admin requirement
**Plans**: TBD

Plans:
- [ ] 10-01: [To be planned]

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9 → 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Client Management | v1.0 | 2/2 | Complete | 2026-01-30 |
| 2. Project Code Generation | v1.0 | 2/2 | Complete | 2026-01-30 |
| 3. Project Detail View | v1.0 | 3/3 | Complete | 2026-01-30 |
| 4. MRF-Project Integration | v1.0 | 3/3 | Complete | 2026-01-30 |
| 5. Core Authentication | v2.0 | 4/4 | Complete | 2026-02-01 |
| 6. Role Infrastructure & Real-time Permissions | v2.0 | 5/5 | Complete | 2026-02-03 |
| 7. Project Assignment System | v2.0 | 5/5 | Complete | 2026-02-04 |
| 8. Security Rules Enforcement | v2.0 | 0/4 | Planned | - |
| 9. Super Admin User Management | v2.0 | 0/0 | Not started | - |
| 10. Route Protection & Session Security | v2.0 | 0/0 | Not started | - |
