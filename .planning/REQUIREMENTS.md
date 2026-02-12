# Requirements: v2.3 Services Department Support

**Defined:** 2026-02-12
**Core Value:** Enable parallel workflows for Projects and Services departments with complete role-based isolation

## v2.3 Requirements

Requirements for Services department integration. Each maps to roadmap phases.

### Services Management

- [ ] **SERV-01**: Admin can create services with auto-generated code (CLMC_CLIENT_YYYY###)
- [ ] **SERV-02**: Service code generation shares sequence with Projects (global counter per client/year)
- [ ] **SERV-03**: Service record includes service_type field ('one-time' or 'recurring')
- [ ] **SERV-04**: Admin can edit existing services with inline editing and auto-save
- [ ] **SERV-05**: Admin can delete services (with confirmation)
- [ ] **SERV-06**: Admin can view list of all services with sorting and filtering
- [ ] **SERV-07**: Admin can filter services by service_type, status, client
- [ ] **SERV-08**: Admin can search services by service code or name
- [ ] **SERV-09**: Service has same fields as Projects (budget, contract_cost, personnel, internal_status, project_status, active/inactive)
- [ ] **SERV-10**: Service detail page shows comprehensive information with card-based layout
- [ ] **SERV-11**: Service detail page includes expense breakdown (MRFs/PRs/POs linked to service)
- [ ] **SERV-12**: Active/inactive flag controls whether service appears in MRF dropdown

### Services Tab UI

- [ ] **UI-01**: Services tab appears in navigation for services_admin and services_user roles
- [ ] **UI-02**: Services tab has two sub-tabs: Services and Recurring
- [ ] **UI-03**: Services sub-tab shows only services with service_type='one-time'
- [ ] **UI-04**: Recurring sub-tab shows only services with service_type='recurring'
- [ ] **UI-05**: Services list view displays: Code, Name, Client, Service Type, Internal Status, Project Status
- [ ] **UI-06**: Clicking service row navigates to full service detail page
- [ ] **UI-07**: Services tab hidden from operations_admin and operations_user roles
- [ ] **UI-08**: Projects tab hidden from services_admin and services_user roles

### Role & Permission System

- [ ] **ROLE-01**: services_admin role created with same permissions as operations_admin (for Services scope)
- [ ] **ROLE-02**: services_user role created with same permissions as operations_user (for Services scope)
- [ ] **ROLE-03**: services_admin can create, edit, delete services
- [ ] **ROLE-04**: services_admin can manage service assignments
- [ ] **ROLE-05**: services_admin sees all services regardless of assignment
- [ ] **ROLE-06**: services_user sees only assigned services
- [ ] **ROLE-07**: Super Admin can configure services_admin and services_user permissions in Settings
- [ ] **ROLE-08**: Super Admin sees both Projects and Services tabs
- [ ] **ROLE-09**: Finance role sees both Projects and Services department work
- [ ] **ROLE-10**: Procurement role sees both Projects and Services department work
- [ ] **ROLE-11**: Permission changes take effect immediately (real-time updates)

### Security Rules

- [ ] **SEC-01**: Firebase Security Rules enforce services collection access by role
- [ ] **SEC-02**: services_admin can read/write all services
- [ ] **SEC-03**: services_user can read only assigned services
- [ ] **SEC-04**: services_user cannot write to services collection
- [ ] **SEC-05**: Super Admin bypasses services role checks
- [ ] **SEC-06**: Finance and Procurement can read services for cross-department workflows
- [ ] **SEC-07**: Security Rules validated with automated tests (emulator)
- [ ] **SEC-08**: Department field enforced on all new MRFs, PRs, POs, TRs going forward

### Assignment System

- [ ] **ASSIGN-01**: services_admin can assign services_user to services via personnel field
- [ ] **ASSIGN-02**: Multi-personnel selection UI with pill display (reuse Projects pattern)
- [ ] **ASSIGN-03**: Personnel changes automatically sync to user's assigned_service_codes array
- [ ] **ASSIGN-04**: services_user filtered views show only assigned services
- [ ] **ASSIGN-05**: User management page allows assigning services_user to specific services
- [ ] **ASSIGN-06**: Assignment changes propagate via real-time listeners (no logout required)

### MRF Integration

- [ ] **MRF-01**: MRF form shows Projects dropdown for operations_admin and operations_user
- [ ] **MRF-02**: MRF form shows Services dropdown for services_admin and services_user
- [ ] **MRF-03**: Super Admin, Finance, Procurement see both Projects and Services dropdowns
- [ ] **MRF-04**: Services dropdown displays format: "CLMC_CODE_YYYY### - Service Name"
- [ ] **MRF-05**: Services dropdown shows only active services (inactive excluded)
- [ ] **MRF-06**: Services dropdown sorted by most recent first
- [ ] **MRF-07**: MRF stores denormalized service_code and service_name for performance
- [ ] **MRF-08**: MRF stores department field ('projects' or 'services')
- [ ] **MRF-09**: Services-linked MRFs appear in procurement workflow (PR generation)
- [ ] **MRF-10**: Service code and name displayed in MRF lists and detail views

### Cross-Department Workflows

- [ ] **CROSS-01**: Finance Pending Approvals shows PRs/TRs from both Projects and Services
- [ ] **CROSS-02**: Procurement PO Tracking shows POs from both Projects and Services
- [ ] **CROSS-03**: Department badge/indicator visible in Finance and Procurement lists
- [ ] **CROSS-04**: Optional department filter dropdown in Finance and Procurement views
- [ ] **CROSS-05**: PR generation works for Services-linked MRFs
- [ ] **CROSS-06**: PO creation works for Services-linked PRs
- [ ] **CROSS-07**: Timeline audit trail shows department context

### Dashboard Integration

- [ ] **DASH-01**: Dashboard shows Services department statistics (active services count)
- [ ] **DASH-02**: Dashboard shows Services-linked MRFs count
- [ ] **DASH-03**: Dashboard shows department breakdown (Projects vs Services)

## Future Requirements

Deferred to v2.4+

### Recurring Service Automation
- **REC-01**: Auto-generate monthly MRFs for recurring services
- **REC-02**: Contract expiration tracking and reminders
- **REC-03**: Recurring service schedule management
- **REC-04**: Next service due date tracking

### Service Categories
- **CAT-01**: Service categories/tags (HVAC, electrical, pest control, etc.)
- **CAT-02**: Filter services by category
- **CAT-03**: Category-based reporting

## Out of Scope

Explicitly excluded from v2.3:

| Feature | Reason |
|---------|--------|
| Data migration for existing documents | All existing MRFs/PRs/POs/TRs are sample/practice data — fresh start with v2.3 |
| Recurring service scheduling automation | Not validated as needed; manual MRF creation sufficient for v2.3 |
| Contract expiration reminders | Notification system not in scope; defer to v2.4+ |
| Service history timeline | Already available via expense breakdown modal in service detail |
| Service categories/tags | Not validated as needed; can add later if users request |
| Separate Finance/Procurement roles per department | Finance and Procurement are cross-department by design |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROLE-01 | Phase 26 | Pending |
| ROLE-02 | Phase 26 | Pending |
| ROLE-03 | Phase 26 | Pending |
| ROLE-04 | Phase 26 | Pending |
| ROLE-05 | Phase 26 | Pending |
| ROLE-06 | Phase 26 | Pending |
| ROLE-07 | Phase 26 | Pending |
| ROLE-08 | Phase 26 | Pending |
| ROLE-09 | Phase 26 | Pending |
| ROLE-10 | Phase 26 | Pending |
| ROLE-11 | Phase 26 | Pending |
| SEC-01 | Phase 26 | Pending |
| SEC-02 | Phase 26 | Pending |
| SEC-03 | Phase 26 | Pending |
| SEC-04 | Phase 26 | Pending |
| SEC-05 | Phase 26 | Pending |
| SEC-06 | Phase 26 | Pending |
| SEC-07 | Phase 26 | Pending |
| SEC-08 | Phase 26 | Pending |
| SERV-02 | Phase 27 | Pending |
| SERV-01 | Phase 28 | Pending |
| SERV-03 | Phase 28 | Pending |
| SERV-04 | Phase 28 | Pending |
| SERV-05 | Phase 28 | Pending |
| SERV-06 | Phase 28 | Pending |
| SERV-07 | Phase 28 | Pending |
| SERV-08 | Phase 28 | Pending |
| SERV-09 | Phase 28 | Pending |
| SERV-10 | Phase 28 | Pending |
| SERV-11 | Phase 28 | Pending |
| SERV-12 | Phase 28 | Pending |
| UI-01 | Phase 28 | Pending |
| UI-02 | Phase 28 | Pending |
| UI-03 | Phase 28 | Pending |
| UI-04 | Phase 28 | Pending |
| UI-05 | Phase 28 | Pending |
| UI-06 | Phase 28 | Pending |
| UI-07 | Phase 28 | Pending |
| UI-08 | Phase 28 | Pending |
| ASSIGN-01 | Phase 28 | Pending |
| ASSIGN-02 | Phase 28 | Pending |
| ASSIGN-03 | Phase 28 | Pending |
| ASSIGN-04 | Phase 28 | Pending |
| ASSIGN-05 | Phase 28 | Pending |
| ASSIGN-06 | Phase 28 | Pending |
| MRF-01 | Phase 29 | Pending |
| MRF-02 | Phase 29 | Pending |
| MRF-03 | Phase 29 | Pending |
| MRF-04 | Phase 29 | Pending |
| MRF-05 | Phase 29 | Pending |
| MRF-06 | Phase 29 | Pending |
| MRF-07 | Phase 29 | Pending |
| MRF-08 | Phase 29 | Pending |
| MRF-09 | Phase 29 | Pending |
| MRF-10 | Phase 29 | Pending |
| CROSS-01 | Phase 30 | Pending |
| CROSS-02 | Phase 30 | Pending |
| CROSS-03 | Phase 30 | Pending |
| CROSS-04 | Phase 30 | Pending |
| CROSS-05 | Phase 30 | Pending |
| CROSS-06 | Phase 30 | Pending |
| CROSS-07 | Phase 30 | Pending |
| DASH-01 | Phase 31 | Pending |
| DASH-02 | Phase 31 | Pending |
| DASH-03 | Phase 31 | Pending |

**Coverage:**
- v2.3 requirements: 54 total
- Mapped to phases: 54/54 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-02-12*
*Last updated: 2026-02-12 after roadmap creation (6 phases, 100% coverage)*
