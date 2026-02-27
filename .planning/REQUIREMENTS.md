# Requirements: CLMC Procurement System

**Defined:** 2026-02-26
**Milestone:** v2.4 — Productivity & Polish
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v2.4 Requirements

### Export

- [x] **EXP-01**: User can export the MRF list as a CSV file
- [x] **EXP-02**: User can export the PR/PO Records list as a CSV file
- [x] **EXP-03**: User can export the PO Tracking list as a CSV file
- [x] **EXP-04**: User can export the Projects list as a CSV file
- [x] **EXP-05**: User can export the Services list as a CSV file
- [x] **EXP-06**: User can export a project's expense breakdown as a CSV file
- [x] **EXP-07**: User can export a service's expense breakdown as a CSV file

### Responsive Design

- [x] **RES-01**: Top navigation collapses into a hamburger menu at narrow viewport widths
- [x] **RES-02**: Data tables scroll horizontally rather than overflowing or clipping content
- [ ] **RES-03**: Split-panel layouts (e.g. MRF list + MRF Details) stack vertically at narrow widths
- [x] **RES-04**: Modals and dialogs resize to remain fully visible and usable at any viewport width
- [x] **RES-05**: All views remain functional and readable at minimum browser window size

### Code Cleanup

- [ ] **CLN-01**: Dead files project-assignments.js and service-assignments.js are removed from the codebase
- [ ] **CLN-02**: Any other unreferenced/orphaned view or utility files are identified and removed

### Branding

- [ ] **BRD-01**: Registration page displays company logo instead of the "CL" text placeholder

### Navigation UI

- [ ] **NAV-01**: All navigation links are standardized (no underlines, no emojis) across all views
- [ ] **NAV-02**: Navigation appearance is consistent across all tabs and sub-tabs
- [ ] **NAV-03**: Admin button is visually uniform with the rest of the top navigation items

### MRF Processing Fix

- [ ] **MRF-01**: Procurement > MRF Processing "Create MRF" form uses a single unified dropdown listing both projects and services together, replacing the current separated sections

## Future Requirements (v2.5+)

### Activity Logging
- Activity types: Inspection, Meeting, Proposal Submitted, Site Visit, Other
- Fields: activity type, description, date, logged by (auto), attachments
- Visible to assigned personnel and users with sufficient permissions

### Document Management
- Upload BOQ files, contract documents, inspection reports/photos, milestone reports to projects
- View/download uploaded documents

### Payment Milestones
- Configure milestones at project creation (percentage, description, amount)
- Operations Admin triggers milestones with supporting documents
- Finance sees triggered milestones in dashboard

### Invoice Management
- Procurement uploads supplier invoices to Firebase Storage
- Finance can view uploaded invoices with metadata tracking

### Finance Dashboard Enhancements
- Payables and collectibles calculations with detail views

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email notifications | Security and simplicity; all communication happens in-app |
| Mobile app | Desktop-first; mobile deferred |
| OAuth/SSO login | Email/password sufficient; complexity not warranted |
| Real-time chat/comments | Not core to procurement workflow |
| Automated email verification | Invitation codes provide sufficient security |
| BOQ creation/editing in system | BOQ created externally, only uploaded for reference |
| Automated expense tracking | Manual MRF creation provides oversight and control |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXP-01 | Phase 41 | Complete |
| EXP-02 | Phase 41 | Complete |
| EXP-03 | Phase 41 | Complete |
| EXP-04 | Phase 41 | Complete |
| EXP-05 | Phase 41 | Complete |
| EXP-06 | Phase 42 | Complete |
| EXP-07 | Phase 42 | Complete |
| RES-01 | Phase 43 | Complete |
| RES-02 | Phase 44 | Complete |
| RES-03 | Phase 44 | Pending |
| RES-04 | Phase 44 | Complete |
| RES-05 | Phase 44 | Complete |
| CLN-01 | Phase 46 | Pending |
| CLN-02 | Phase 46 | Pending |
| BRD-01 | Phase 45 | Pending |
| NAV-01 | Phase 45 | Pending |
| NAV-02 | Phase 45 | Pending |
| NAV-03 | Phase 45 | Pending |
| MRF-01 | Phase 46 | Pending |

**Coverage:**
- v2.4 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-26*
*Last updated: 2026-02-26 after roadmap creation*
