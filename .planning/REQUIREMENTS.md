# Requirements: CLMC Procurement System v2.0

**Defined:** 2026-01-31
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v2.0 Requirements

Requirements for Authentication & Permissions milestone. Each maps to roadmap phases.

### Authentication & User Management

- [ ] **AUTH-01**: User can self-register with email, password, and invitation code
- [ ] **AUTH-02**: System validates invitation code is active and unused before registration
- [ ] **AUTH-03**: System marks invitation code as used after successful registration
- [ ] **AUTH-04**: New user account starts with status "pending" (awaiting Super Admin approval)
- [ ] **AUTH-05**: User can login with email and password
- [ ] **AUTH-06**: User session persists across browser refresh
- [ ] **AUTH-07**: User can logout
- [ ] **AUTH-08**: Pending users see "awaiting approval" message (cannot access main system)
- [ ] **AUTH-09**: Deactivated users are automatically logged out when status changes
- [ ] **AUTH-10**: Super Admin can generate one-time invitation codes
- [ ] **AUTH-11**: Super Admin can view pending user registrations
- [ ] **AUTH-12**: Super Admin can approve pending user (assign role during approval)
- [ ] **AUTH-13**: Super Admin can deactivate user account (with confirmation)
- [ ] **AUTH-14**: Super Admin can delete user account (with confirmation)
- [ ] **AUTH-15**: System prevents deactivating last Super Admin account

### Permission System - Role Templates

- [ ] **PERM-01**: System has 5 configurable role templates: Super Admin, Operations Admin, Operations User, Finance, Procurement
- [ ] **PERM-02**: Each role template stores configurable permissions (tab access, edit rights)
- [ ] **PERM-03**: Super Admin can view role configuration matrix (all roles and their permissions)
- [ ] **PERM-04**: Super Admin can edit role permissions via checkboxes (which tabs each role can access)
- [ ] **PERM-05**: Super Admin can configure edit vs view-only permission per tab for each role
- [ ] **PERM-06**: Role configuration changes apply to all users with that role immediately
- [ ] **PERM-07**: System initializes with sensible default permissions for each role template

### Permission System - Project Assignments

- [ ] **PERM-08**: Super Admin can assign specific projects to Operations Users
- [ ] **PERM-09**: Operations Users with project assignments see only assigned projects in list
- [ ] **PERM-10**: Operations Users with project assignments can only edit/create MRFs for assigned projects
- [ ] **PERM-11**: Operations Users can be assigned "all projects" (no filtering)
- [ ] **PERM-12**: Project assignment changes take effect immediately (no logout required)

### Permission System - Enforcement

- [ ] **PERM-13**: Navigation menu shows only tabs permitted by user's role template configuration
- [ ] **PERM-14**: Attempting to access unpermitted tab redirects to dashboard or shows access denied
- [ ] **PERM-15**: Edit mode vs view-only mode enforced within tabs based on role template permissions
- [ ] **PERM-16**: Role template changes take effect immediately for all users with that role (no logout required)
- [ ] **PERM-17**: User role changes take effect immediately (no logout required)
- [ ] **PERM-18**: Real-time listener on role template updates permissions in active sessions
- [ ] **PERM-19**: Real-time listener on user document updates role/projects in active session
- [ ] **PERM-20**: Firebase Security Rules validate user status (active) for all operations
- [ ] **PERM-21**: Firebase Security Rules validate user role template permissions for all operations
- [ ] **PERM-22**: Firebase Security Rules validate project assignments for data filtering
- [ ] **PERM-23**: Firebase Security Rules deployed and tested for all collections (users, roles, invitation_codes, projects, mrfs, prs, pos, etc.)

### Super Admin Dashboard

- [ ] **ADMIN-01**: Super Admin can view list of all users (email, role, status, assigned projects)
- [ ] **ADMIN-02**: Super Admin can view pending approval queue
- [ ] **ADMIN-03**: Super Admin can generate invitation codes from dashboard
- [ ] **ADMIN-04**: Super Admin can view invitation code usage (active/used/expired status)
- [ ] **ADMIN-05**: Super Admin can assign role to user
- [ ] **ADMIN-06**: Super Admin can assign projects to Operations Users
- [ ] **ADMIN-07**: Super Admin can change user status (activate/deactivate)

### Route Protection & Security

- [ ] **SEC-01**: Unauthenticated users are redirected to login page
- [ ] **SEC-02**: System saves intended route and restores after successful login (deep link support)
- [ ] **SEC-03**: Pending users cannot access main system (shown approval message)
- [ ] **SEC-04**: Deactivated users cannot access main system (force logout on status change)
- [ ] **SEC-05**: System requires minimum 2 active Super Admin accounts
- [ ] **SEC-06**: System prevents operations that would violate minimum Super Admin requirement

## Future Requirements (v2.1+)

Deferred to future milestones. Tracked but not in current roadmap.

### Advanced Admin Features

- **ADMIN-08**: Super Admin dashboard shows user activity metrics
- **ADMIN-09**: Super Admin can bulk assign projects to multiple users
- **ADMIN-10**: Super Admin can export user list and permissions matrix
- **ADMIN-11**: Advanced permission matrix editor with drag-and-drop interface

### Activity Logging

- **LOG-01**: Structured activity entries on projects (Inspection, Meeting, Proposal Submitted, Site Visit, Other)
- **LOG-02**: Activity fields: type, description, date, logged by (auto), attachments
- **LOG-03**: Activity visible to personnel assigned to project
- **LOG-04**: Activity visible to users with sufficient permissions

### Document Management

- **DOC-01**: Upload BOQ files to projects
- **DOC-02**: Upload contract documents to projects
- **DOC-03**: Upload inspection reports/photos to projects
- **DOC-04**: Upload milestone reports to support payment triggers
- **DOC-05**: View and download uploaded documents

### Payment Milestones

- **PAY-01**: Configure milestones at project creation (percentage, description, amount)
- **PAY-02**: Operations Admin can trigger milestones with supporting documents
- **PAY-03**: Track milestone status (pending, triggered, paid)
- **PAY-04**: Finance sees triggered milestones in dashboard

### Payment Tracking

- **PAY-05**: Track PO payment status (percentage paid)
- **PAY-06**: Configure payment terms on POs (Net 30, Net 60, custom)
- **PAY-07**: Calculate payment due dates automatically
- **PAY-08**: Operations can trigger collection milestones
- **PAY-09**: Finance receives collection milestone notifications

### Invoice Management

- **INV-01**: Procurement uploads supplier invoices to Firebase Storage
- **INV-02**: Invoice attachment indicator in PR-PO records
- **INV-03**: Finance can view uploaded invoices
- **INV-04**: Track invoice metadata (date, amount, status)

### Finance Dashboard Enhancements

- **FIN-01**: Payables calculation (total unpaid/partial POs by supplier)
- **FIN-02**: Payables detail view (breakdown by PO, payment status)
- **FIN-03**: Collectibles calculation (contract cost minus payments received by project)
- **FIN-04**: Collectibles detail view (breakdown by project, milestones)
- **FIN-05**: Payment milestone tracking and status updates

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Email notifications | Requires Cloud Functions or external service; security and simplicity priority - all communication happens in-app |
| Automated email verification | Invitation codes provide sufficient security control; manual approval prevents abuse |
| OAuth/SSO login | Email/password sufficient for internal system; complexity not warranted yet |
| Two-factor authentication | Enhanced security not critical for internal procurement system initially; can add later |
| Mobile app | Desktop-first for operational efficiency; mobile deferred to future |
| Real-time chat/comments | Not core to procurement workflow; focus on structured data |
| Comprehensive audit logging | Adds complexity; can use Firestore triggers later if compliance requires |
| Password reset custom UI | Firebase provides built-in email reset; custom UI not critical for v2.0 |
| BOQ creation/editing in system | BOQ created externally, only uploaded for reference |
| Automated expense tracking | Manual MRF creation provides oversight and control |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

**Summary:**
- Authentication & User Management: 15 requirements
- Permission System - Role Templates: 7 requirements
- Permission System - Project Assignments: 5 requirements
- Permission System - Enforcement: 11 requirements
- Super Admin Dashboard: 7 requirements
- Route Protection & Security: 6 requirements

**Coverage:**
- v2.0 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

### Phase Mapping

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 5 | Pending |
| AUTH-02 | Phase 5 | Pending |
| AUTH-03 | Phase 5 | Pending |
| AUTH-04 | Phase 5 | Pending |
| AUTH-05 | Phase 5 | Pending |
| AUTH-06 | Phase 5 | Pending |
| AUTH-07 | Phase 5 | Pending |
| AUTH-08 | Phase 5 | Pending |
| AUTH-09 | Phase 5 | Pending |
| AUTH-10 | Phase 9 | Pending |
| AUTH-11 | Phase 9 | Pending |
| AUTH-12 | Phase 9 | Pending |
| AUTH-13 | Phase 9 | Pending |
| AUTH-14 | Phase 9 | Pending |
| AUTH-15 | Phase 9 | Pending |
| PERM-01 | Phase 6 | Pending |
| PERM-02 | Phase 6 | Pending |
| PERM-03 | Phase 6 | Pending |
| PERM-04 | Phase 6 | Pending |
| PERM-05 | Phase 6 | Pending |
| PERM-06 | Phase 6 | Pending |
| PERM-07 | Phase 6 | Pending |
| PERM-08 | Phase 7 | Pending |
| PERM-09 | Phase 7 | Pending |
| PERM-10 | Phase 7 | Pending |
| PERM-11 | Phase 7 | Pending |
| PERM-12 | Phase 7 | Pending |
| PERM-13 | Phase 6 | Pending |
| PERM-14 | Phase 6 | Pending |
| PERM-15 | Phase 6 | Pending |
| PERM-16 | Phase 6 | Pending |
| PERM-17 | Phase 6 | Pending |
| PERM-18 | Phase 6 | Pending |
| PERM-19 | Phase 6 | Pending |
| PERM-20 | Phase 8 | Pending |
| PERM-21 | Phase 8 | Pending |
| PERM-22 | Phase 8 | Pending |
| PERM-23 | Phase 8 | Pending |
| ADMIN-01 | Phase 9 | Pending |
| ADMIN-02 | Phase 9 | Pending |
| ADMIN-03 | Phase 9 | Pending |
| ADMIN-04 | Phase 9 | Pending |
| ADMIN-05 | Phase 9 | Pending |
| ADMIN-06 | Phase 7 | Pending |
| ADMIN-07 | Phase 9 | Pending |
| SEC-01 | Phase 10 | Pending |
| SEC-02 | Phase 10 | Pending |
| SEC-03 | Phase 10 | Pending |
| SEC-04 | Phase 10 | Pending |
| SEC-05 | Phase 10 | Pending |
| SEC-06 | Phase 10 | Pending |

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after roadmap creation - 100% requirement coverage achieved*
