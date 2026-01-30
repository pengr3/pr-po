# Roadmap: CLMC Procurement System - Projects Foundation

## Overview

Transform the CLMC procurement system by adding comprehensive project lifecycle tracking. Start with client management as the foundation, build complete project CRUD with dual-status tracking and code generation, add powerful filtering and search capabilities, then integrate existing MRF workflows with the new project structure. Each phase delivers a complete, verifiable capability that moves the system closer to full project-anchored procurement management.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Clients Foundation** - Client CRUD and database
- [x] **Phase 2: Projects Core** - Project creation and editing
- [x] **Phase 3: Projects Management** - Filtering, search, and views
- [ ] **Phase 4: MRF-Project Integration** - Connect MRFs to projects

## Phase Details

### Phase 1: Clients Foundation
**Goal**: Users can create, view, edit, and delete clients with standardized codes
**Depends on**: Nothing (first phase)
**Requirements**: CLIENT-01, CLIENT-02, CLIENT-03, CLIENT-04, CLIENT-05
**Success Criteria** (what must be TRUE):
  1. User can create new client with client_code, company_name, contact_person, and contact_details
  2. User can view list of all clients
  3. User can edit existing client information
  4. User can delete clients (with confirmation)
  5. Client codes are validated for uniqueness when entered
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Create clients view module with CRUD operations
- [x] 01-02-PLAN.md — Integrate clients into SPA navigation

### Phase 2: Projects Core
**Goal**: Users can create and edit projects with auto-generated codes and dual-status tracking
**Depends on**: Phase 1 (clients must exist to reference)
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, PROJ-07, PROJ-08, PROJ-17, PROJ-18
**Success Criteria** (what must be TRUE):
  1. User can create project with auto-generated code format CLMC_CLIENT_YYYY###
  2. Project creation form requires project_name and client dropdown
  3. Project creation form accepts optional budget, contract_cost, personnel fields
  4. User can select Internal Status from 4 predefined options
  5. User can select Project Status from 7 predefined options
  6. User can toggle project active/inactive status
  7. User can edit all project fields
  8. User can delete projects (with confirmation)
  9. Budget and contract_cost validation enforces positive numbers
  10. Project code uniqueness is enforced per client per year
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Create projects view module with CRUD and composite ID generation
- [x] 02-02-PLAN.md — Integrate projects into SPA navigation
- [x] 02-03-PLAN.md — Add toggle button for project active/inactive (gap closure)

### Phase 3: Projects Management
**Goal**: Users can find, filter, and view projects through powerful list management
**Depends on**: Phase 2
**Requirements**: PROJ-09, PROJ-10, PROJ-11, PROJ-12, PROJ-13, PROJ-14, PROJ-15, PROJ-16
**Success Criteria** (what must be TRUE):
  1. User can click any project in list to view full details
  2. Project list displays columns: Code, Name, Client, Internal Status, Project Status
  3. User can filter projects by Internal Status
  4. User can filter projects by Project Status
  5. User can filter projects by Client
  6. User can search projects by code or name
  7. Project list displays most recent projects first by default
  8. Create/edit uses new page UI with back navigation (not modal)
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Router extension and project detail view with inline editing
- [x] 03-02-PLAN.md — List enhancements: filtering, search, sorting, row navigation

### Phase 4: MRF-Project Integration
**Goal**: MRF workflow fully integrated with project tracking
**Depends on**: Phase 3
**Requirements**: MRF-01, MRF-02, MRF-03, MRF-04, MRF-05, MRF-06, MRF-07, MRF-08, MRF-09
**Success Criteria** (what must be TRUE):
  1. MRF form displays project dropdown
  2. Project dropdown shows format "CLMC_CODE_YYYY### - Project Name"
  3. Project dropdown shows only active projects (inactive excluded)
  4. Project dropdown sorted by most recent first
  5. MRF documents store project_code field
  6. MRF list view displays project code and name
  7. MRF details view shows complete project information
  8. User can create MRFs for completed projects (warranty work scenario)
  9. User cannot create MRFs for inactive projects
**Plans**: 3 plans

Plans:
- [x] 04-01-PLAN.md — MRF form integration with project dropdown and storage
- [x] 04-02-PLAN.md — Display updates across procurement and finance views
- [ ] 04-03-PLAN.md — Fix project dropdown sorting in procurement.js (gap closure)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Clients Foundation | 2/2 | Complete | 2026-01-25 |
| 2. Projects Core | 3/3 | Complete | 2026-01-26 |
| 3. Projects Management | 2/2 | Complete | 2026-01-26 |
| 4. MRF-Project Integration | 2/3 | In Progress | - |
