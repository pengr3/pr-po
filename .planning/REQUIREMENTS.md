# Requirements: CLMC Procurement System v1.0

**Defined:** 2026-01-25
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v1.0 Requirements

Requirements for Core Projects Foundation. Each maps to roadmap phases.

### Clients Management

- [ ] **CLIENT-01**: User can create client with client_code, company_name, contact_person, contact_details
- [ ] **CLIENT-02**: User can edit existing client information
- [ ] **CLIENT-03**: Super Admin can delete clients (v1.0: anyone can delete, role enforcement in v2.0)
- [ ] **CLIENT-04**: User can view list of all clients
- [ ] **CLIENT-05**: Client code is manually entered by admin (validated for uniqueness)

### Projects Management

- [ ] **PROJ-01**: User can create project with auto-generated project code (CLMC_CLIENT_YYYY###)
- [ ] **PROJ-02**: Project creation requires project_name and client (dropdown)
- [ ] **PROJ-03**: Project creation allows optional: budget, contract_cost, personnel (freetext)
- [ ] **PROJ-04**: User can select Internal Status from dropdown (For Inspection, For Proposal, For Internal Approval, Ready to Submit)
- [ ] **PROJ-05**: User can select Project Status from dropdown (Pending Client Review, Under Client Review, Approved by Client, For Mobilization, On-going, Completed, Loss)
- [ ] **PROJ-06**: User can toggle project active/inactive status
- [ ] **PROJ-07**: User can edit existing projects
- [ ] **PROJ-08**: Super Admin can delete projects (v1.0: anyone can delete, role enforcement in v2.0)
- [ ] **PROJ-09**: User can view full project details by clicking project in list
- [ ] **PROJ-10**: User can view project list with columns: Code, Name, Client, Internal Status, Project Status
- [ ] **PROJ-11**: User can filter projects by Internal Status
- [ ] **PROJ-12**: User can filter projects by Project Status
- [ ] **PROJ-13**: User can filter projects by Client
- [ ] **PROJ-14**: User can search projects by project code or project name
- [ ] **PROJ-15**: Project list displays most recent projects first
- [ ] **PROJ-16**: Project create/edit uses new page UI (not modal) with back navigation
- [ ] **PROJ-17**: Budget and contract_cost must be positive numbers if provided
- [ ] **PROJ-18**: Project code uniqueness is enforced per client per year

### MRF-Project Integration

- [ ] **MRF-01**: User can select project from dropdown in MRF form
- [ ] **MRF-02**: Project dropdown displays format: "CLMC_CODE_YYYY### - Project Name"
- [ ] **MRF-03**: Project dropdown shows only active projects (inactive excluded)
- [ ] **MRF-04**: Project dropdown is sorted by most recent first
- [ ] **MRF-05**: Project code is stored in MRF document
- [ ] **MRF-06**: MRF list displays project code and project name
- [ ] **MRF-07**: MRF details view displays project information
- [ ] **MRF-08**: User can create MRFs for completed projects (warranty work)
- [ ] **MRF-09**: User cannot create MRFs for inactive projects

## v2.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Authentication & User Management

- **AUTH-01**: User can self-register with invitation code
- **AUTH-02**: Super Admin can generate one-time invitation codes
- **AUTH-03**: Super Admin can approve pending user accounts
- **AUTH-04**: User can login with email and password
- **AUTH-05**: User session persists across browser refresh
- **AUTH-06**: User can logout
- **AUTH-07**: Super Admin can deactivate user accounts
- **AUTH-08**: Super Admin can delete user accounts
- **AUTH-09**: Super Admin can manage user credentials

### Permission System

- **PERM-01**: Tab visibility is controlled by user permissions
- **PERM-02**: Tab access level (edit vs view-only) is controlled by permissions
- **PERM-03**: Users can be assigned specific projects or "all projects"
- **PERM-04**: Permission changes take effect immediately
- **PERM-05**: Super Admin has dashboard for user/permission management
- **PERM-06**: Operations Admin can edit all projects
- **PERM-07**: Operations Users can edit only assigned projects
- **PERM-08**: Operations Users see only assigned projects

### Activity Logging

- **ACT-01**: User can log structured activity on projects
- **ACT-02**: Activity types include: Inspection, Meeting, Proposal Submitted, Site Visit, Other
- **ACT-03**: Activity entry captures: type, description, date, logged by, attachments
- **ACT-04**: Activity logs visible to personnel assigned to project
- **ACT-05**: Activity logs respect user permissions

### Document Management

- **DOC-01**: User can upload BOQ files to projects
- **DOC-02**: User can upload contract documents to projects
- **DOC-03**: User can upload inspection reports/photos to projects
- **DOC-04**: User can upload milestone reports to projects
- **DOC-05**: User can view and download uploaded documents
- **DOC-06**: Documents are stored in Firebase Storage

### Payment Milestones

- **PAY-01**: User can configure payment milestones at project creation
- **PAY-02**: Milestones include: percentage, description, auto-calculated amount
- **PAY-03**: Operations Admin can trigger milestones with supporting documents
- **PAY-04**: Milestone status tracked: pending, triggered, paid
- **PAY-05**: Finance sees triggered milestones in dashboard

### Payment Tracking

- **POTR-01**: PO tracks payment status (percentage paid)
- **POTR-02**: PO includes payment terms (Net 30, Net 60, custom)
- **POTR-03**: PO calculates payment due date
- **POTR-04**: Operations can trigger collection milestones
- **POTR-05**: Finance receives collection milestone notifications

### Invoice Management

- **INV-01**: Procurement can upload supplier invoices to Firebase Storage
- **INV-02**: PR-PO records show invoice attachment indicator
- **INV-03**: Finance can view uploaded invoices
- **INV-04**: Invoice metadata tracked (date, amount, status)

### Finance Dashboard Enhancements

- **FIN-01**: Finance dashboard calculates total payables by supplier
- **FIN-02**: Finance can view payables detail (breakdown by PO)
- **FIN-03**: Finance dashboard calculates total collectibles by project
- **FIN-04**: Finance can view collectibles detail (breakdown by milestone)
- **FIN-05**: Finance can update payment milestone status

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email notifications | Security and simplicity; all communication happens in-app |
| Mobile app | Desktop-first for operational efficiency; mobile deferred to future |
| OAuth/SSO login | Email/password sufficient for v1; complexity not warranted yet |
| Real-time chat/comments | Not core to procurement workflow |
| Automated email verification | Invitation codes provide sufficient security control |
| BOQ creation/editing in system | BOQ created externally, only uploaded for reference |
| Automated expense tracking | Manual MRF creation provides oversight and control |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

**Coverage:**
- v1.0 requirements: 27 total
- Mapped to phases: TBD (pending roadmap)
- Unmapped: TBD

---
*Requirements defined: 2026-01-25*
*Last updated: 2026-01-25 after initial definition*
