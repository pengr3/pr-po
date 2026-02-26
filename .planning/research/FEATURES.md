# Feature Research: Services Department

**Domain:** Service management for repair/maintenance work (engineering firm)
**Researched:** 2026-02-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = Services department cannot function.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Service CRUD operations | Standard data management - create, edit, delete services | LOW | Mirror Projects CRUD exactly, reuse patterns |
| Service code generation | Unique identifier for tracking, shared CLMC_CLIENT_YYYY### sequence | LOW | Reuse generateProjectCode utility with sequence sharing |
| Service type differentiation | One-time vs recurring services have different tracking needs | LOW | Single field: service_type ('one-time' or 'recurring') |
| Client association | Services are performed for clients, same as Projects | LOW | Reuse existing clients collection and dropdown |
| Budget/contract cost tracking | Financial tracking essential for service profitability | LOW | Same fields as Projects (budget, contract_cost) |
| Active/inactive flag | Control which services can receive MRFs, prevent orphaned work | LOW | Exact mirror of Projects active flag logic |
| Service list view with filtering | Users need to find services quickly (by client, status, type) | LOW | Mirror Projects list view, add service_type filter |
| MRF-Service integration | MRFs must reference services, same as project-based workflow | LOW | Dropdown shows services (denormalized: service_code + service_name) |
| Role-based department isolation | Services users should NEVER see Projects data, vice versa | MEDIUM | Firestore Security Rules + UI filtering by role |
| Assignment-based access for services_user | Non-admin services users see only assigned services | MEDIUM | Reuse Projects assignment pattern exactly |
| Personnel tracking | Track who works on which services | LOW | Reuse multi-personnel selection with pill UI (v2.2 pattern) |
| Internal/project status fields | Same workflow states as Projects | LOW | Reuse exact status options from Projects |

### Differentiators (Competitive Advantage)

Features that set Services management apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Shared code sequence with Projects | Unified numbering (CLMC_CLIENT_2026001, 2026002...) prevents confusion | LOW | Requires single sequence counter across both collections |
| Sub-tabs for Services/Recurring | Immediate visual separation of work types without filtering | LOW | Router sub-route pattern: #/services/services, #/services/recurring |
| Recurring service visual indicators | At-a-glance identification in lists (icon, badge, color coding) | LOW | Display enhancement only, no data changes |
| Cross-department Finance/Procurement view | Finance approves PRs from both departments in single interface | MEDIUM | Filter PRs/POs by source (project_code vs service_code), display department tag |
| Automatic personnel-to-assignment sync | When services_user added to personnel, auto-assign access | LOW | Reuse v2.2 syncPersonnelToAssignments pattern |
| Service detail page with inline editing | Same UX efficiency as Projects detail page | LOW | Copy Projects detail page pattern exactly |
| Real-time collaboration on services | Multiple users see updates immediately (Firebase real-time) | LOW | Already working for Projects, extends naturally |
| Search by service code or name | Quick service lookup in large datasets | LOW | Mirror Projects search implementation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for v2.3.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Recurring service schedule automation | "Auto-generate monthly pest control MRFs" sounds efficient | Scope creep - requires scheduling engine, notification system, calendar integration; no user validation requested this | Defer to v3.0+; v2.3 tracks recurring services manually, users create MRFs when work is performed |
| Contract expiration reminders | Prevent missed renewals for recurring services | Notification system not in scope; email not validated; adds complexity without user request | Defer to v3.0+; users manage contract renewals manually |
| Service history timeline | View all MRFs/PRs/POs for a service | Already available via project detail expense breakdown; expensive to duplicate for services in v2.3 | Use existing expense breakdown in service detail (mirror Projects pattern exactly) |
| Separate supplier pools per department | Operations suppliers vs Services suppliers | No evidence this is needed; adds complexity; supplier database is centralized resource | Single supplier pool shared across departments (current model) |
| Department-specific roles for Finance/Procurement | Finance_Projects vs Finance_Services roles | Finance and Procurement explicitly cross-department in requirements; splitting creates permission complexity | Single Finance and Procurement roles approve work from both departments |
| Service type beyond one-time/recurring | Add "Emergency", "Preventive", "Corrective" types | Not validated in requirements; service_type is for workflow differentiation, not categorization | v2.3: Two types only (one-time, recurring); defer granular categorization to v3.0+ |
| Merge Projects and Services into single collection | Simplify data model with single "work" collection | Different user groups need complete isolation; shared collection requires complex filtering everywhere | Keep separate collections for clean role-based isolation |

## Feature Dependencies

```
[Service CRUD]
    └──requires──> [Clients collection] (already exists)
    └──requires──> [Users collection] (already exists, v2.0)

[Service detail page with inline editing]
    └──requires──> [Service CRUD]
    └──requires──> [Personnel multi-select] (already exists, v2.2)

[Assignment-based access]
    └──requires──> [Service CRUD]
    └──requires──> [Role system] (already exists, v2.0)
    └──requires──> [Firebase Security Rules for services collection]

[MRF-Service integration]
    └──requires──> [Service CRUD]
    └──requires──> [Role-based dropdown filtering]

[Role-based department isolation]
    └──requires──> [Role templates for services_admin, services_user]
    └──requires──> [Firebase Security Rules for services collection]
    └──requires──> [UI visibility logic by role]

[Sub-tabs for Services/Recurring]
    └──requires──> [Service CRUD with service_type field]
    └──enhances──> [Service list view] (provides pre-filtered views)

[Cross-department Finance/Procurement view]
    └──requires──> [MRF-Service integration] (MRFs reference services)
    └──requires──> [Department tagging] (identify source: project or service)
```

### Dependency Notes

- **Service CRUD requires Clients and Users:** Same dependencies as Projects, collections already exist
- **Assignment-based access requires Security Rules:** Cannot rely on UI-only filtering for security; server-side enforcement critical
- **MRF integration requires role-based filtering:** Operations users must never see Services in dropdown, vice versa; UI + Security Rules enforcement
- **Sub-tabs enhance list view:** Router pattern already supports sub-routes (#/procurement/mrfs); extend to #/services/services and #/services/recurring
- **Cross-department Finance/Procurement requires source tagging:** PRs/POs need to display which department originated the work

## MVP Definition (v2.3 Services Department)

### Launch With (v2.3)

Minimum viable Services department — what's needed to enable parallel workflows.

- [x] **Services collection with service_type field** — Core data model; distinguishes one-time vs recurring
- [x] **Services CRUD operations (create, edit, delete)** — Standard management operations mirroring Projects
- [x] **Service code generation sharing CLMC_CLIENT_YYYY### sequence** — Unified numbering across Projects and Services
- [x] **Services tab with sub-tabs (Services, Recurring)** — Visual separation of work types via router sub-routes
- [x] **Role templates for services_admin and services_user** — Two new roles mirroring operations roles
- [x] **Assignment system for services_user** — Non-admin services users see only assigned services
- [x] **Firebase Security Rules for services collection** — Server-side enforcement of role-based access
- [x] **Role-based MRF dropdown filtering** — Operations sees Projects, services sees Services, never mixed
- [x] **Department isolation in navigation** — Operations roles never see Services tab, vice versa (except Super Admin, Finance, Procurement)
- [x] **Service detail page with inline editing** — Same UX as Projects detail page (v1.0 pattern)
- [x] **Multi-personnel selection for services** — Reuse v2.2 pill UI for personnel tracking
- [x] **Automatic personnel-to-assignment sync** — services_user added to personnel → auto-assign access

### Add After Validation (v2.3.x)

Features to add once Services department is working and users provide feedback.

- [ ] **Search by service code or name** — Triggered by: "We have too many services to scroll through"
- [ ] **Advanced filtering (by date range, budget)** — Triggered by: "I need to find services from Q4 2025"
- [ ] **Service expense breakdown modal** — Triggered by: "How much have we spent on this service?" (mirror Projects expense breakdown)
- [ ] **Recurring service visual indicators** — Triggered by: "Hard to tell one-time from recurring at a glance"
- [ ] **Bulk assignment operations** — Triggered by: "Assigning services one by one is tedious"

### Future Consideration (v3.0+)

Features to defer until Services department is validated and usage patterns emerge.

- [ ] **Recurring service schedule automation** — Defer until: Users request "auto-generate MRFs for monthly services"
- [ ] **Contract expiration tracking** — Defer until: Users request "remind me when pest control contract expires"
- [ ] **Service history timeline** — Defer until: Users request "show all work performed for this service"
- [ ] **Service performance metrics** — Defer until: "Track on-time completion rates for recurring services"
- [ ] **Service-specific document types** — Defer until: "Upload service contracts separate from MRFs"
- [ ] **Service categories/tags** — Defer until: "Group services by type (HVAC, electrical, pest control)"

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Services CRUD operations | HIGH | LOW | P1 |
| Service code generation (shared sequence) | HIGH | LOW | P1 |
| Service type differentiation (field) | HIGH | LOW | P1 |
| Role templates (services_admin, services_user) | HIGH | LOW | P1 |
| Firebase Security Rules (services collection) | HIGH | MEDIUM | P1 |
| MRF dropdown role-based filtering | HIGH | MEDIUM | P1 |
| Department isolation (UI visibility) | HIGH | MEDIUM | P1 |
| Assignment system for services_user | HIGH | MEDIUM | P1 |
| Services tab with sub-tabs | MEDIUM | LOW | P1 |
| Service detail page with inline editing | MEDIUM | LOW | P1 |
| Multi-personnel selection | MEDIUM | LOW | P1 |
| Auto personnel-to-assignment sync | MEDIUM | LOW | P1 |
| Search by service code/name | MEDIUM | LOW | P2 |
| Advanced filtering (date, budget) | MEDIUM | LOW | P2 |
| Service expense breakdown modal | MEDIUM | MEDIUM | P2 |
| Recurring service visual indicators | LOW | LOW | P2 |
| Bulk assignment operations | MEDIUM | MEDIUM | P2 |
| Recurring schedule automation | HIGH | HIGH | P3 |
| Contract expiration tracking | MEDIUM | MEDIUM | P3 |
| Service history timeline | MEDIUM | MEDIUM | P3 |
| Service performance metrics | LOW | HIGH | P3 |
| Service-specific document types | LOW | MEDIUM | P3 |
| Service categories/tags | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Must have for v2.3 launch — Services department cannot function without these
- P2: Should have, add when possible — Improves UX but not blocking
- P3: Nice to have, future consideration — Defer until usage patterns validate need

## Comparison: Services Management vs Project Management

| Feature | Projects (existing) | Services (v2.3) | Implementation Notes |
|---------|---------------------|-----------------|----------------------|
| Code generation | CLMC_CLIENT_YYYY### sequence | Same shared sequence | Single counter, type determined by collection |
| CRUD operations | Full create/edit/delete | Mirror exactly | Reuse Projects patterns, swap collection name |
| Detail page | Inline editing with auto-save | Mirror exactly | Copy Projects detail page pattern |
| List view | Filter by status, client, active flag | Add service_type filter | Extend existing filtering logic |
| Role isolation | Operations roles only | Services roles only | New: Department-level isolation, not just tab-level |
| Assignment system | operations_user sees assigned projects | services_user sees assigned services | Reuse exact assignment pattern |
| Personnel tracking | Multi-select pill UI (v2.2) | Mirror exactly | Reuse v2.2 implementation |
| MRF integration | Dropdown shows active projects | Dropdown shows active services (role-based) | New: Role determines which collection to query |
| Sub-routes | #/projects (no sub-routes) | #/services/services, #/services/recurring | New: Sub-tab navigation via router |
| Security Rules | projects collection rules | services collection rules (mirror) | Copy-paste Projects rules, swap collection name |
| Finance/Procurement view | View project-based PRs/POs | View both project and service PRs/POs | New: Cross-department display with source tagging |

## User Workflow Analysis

### Services Admin Workflow

1. **Create service record**
   - Click "Add New Service" button
   - Select client from dropdown (reuse clients collection)
   - Enter service name (e.g., "AC Repair - Building A")
   - Select service type (one-time or recurring)
   - Optional: Enter budget, contract cost
   - Optional: Select personnel
   - System auto-generates service code (CLMC_CLIENT_YYYY###)
   - Save → Service created with active flag = true

2. **Assign service to services_user**
   - Open service detail page
   - Multi-select personnel (includes services_user accounts)
   - Auto-sync: services_user role gets assignment record

3. **Services user creates MRF**
   - Navigate to MRF form
   - Service dropdown shows ONLY services assigned to them (or all if services_admin)
   - Select service → auto-populate service_code and service_name
   - Complete MRF → standard procurement workflow

### Recurring Service Workflow

1. **Create recurring service**
   - Same as one-time service creation
   - Select service_type = "recurring"
   - Enter contract cost (e.g., monthly pest control fee)
   - Add personnel (technicians who perform work)

2. **Perform recurring work**
   - Each time work is performed, create new MRF
   - Select same recurring service from dropdown
   - MRF tracks individual work instance
   - Expense breakdown shows all MRFs for that service

3. **Track recurring expenses**
   - Service detail page shows total expenses across all MRFs
   - Finance sees all PRs/POs tagged to recurring service
   - Budget vs actual comparison (same as Projects)

### Cross-Department Finance Workflow

1. **Finance reviews pending PRs**
   - Finance tab → Pending Approvals
   - List shows PRs from BOTH Projects and Services departments
   - Each PR displays source tag (Project: CLMC_AAA_2026001 or Service: CLMC_BBB_2026002)
   - Finance approves/rejects regardless of source department
   - No workflow changes from v2.2

2. **Procurement tracks POs**
   - Procurement tab → PO Tracking
   - List shows POs from BOTH departments
   - Update status (Pending → Procuring → Procured → Delivered)
   - No workflow changes from v2.2

## Sources

**Service Management Systems & Features:**
- [Recurring Billing Software and Solutions for 2026](https://www.agencyhandy.com/recurring-billing-software/) — One-time vs recurring patterns
- [Field Service Management Software in 2026](https://buildops.com/resources/field-service-management-software/) — AC repair and maintenance workflows
- [Maintenance Agreement & Recurring Service Scheduling](https://www.housecallpro.com/features/recurring-service-plans/) — Recurring service automation patterns
- [Service Contract Management Software](https://www.commusoft.com/en-us/features/service-contract-management-software/) — Contract-based recurring services
- [Preventive Maintenance Scheduling](https://ftmaintenance.com/cmms-features/preventive-maintenance/) — Quarterly PM workflows

**Project vs Service Management:**
- [Project Management vs. Service Management: Key Differences](https://www.motadata.com/blog/project-management-vs-service-management/) — Temporary vs ongoing nature
- [IT Project Management vs. Service Management](https://www.manageengine.com/products/service-desk/itsm/project-management-vs-it-service-management.html) — Process differences
- [Integrating Project Management and Service Management](https://www.pmi.org/learning/library/integrating-project-service-management-6328) — Integration patterns

**Role-Based Access & Multi-Department:**
- [Role-Based Access Control Best Practices for 2026](https://www.techprescient.com/blogs/role-based-access-control-best-practices/) — RBAC patterns
- [Role-Based Access Control: A Comprehensive Guide 2026](https://www.zluri.com/blog/role-based-access-control) — Granular permissions
- [Separation of Duties Policy Examples for 2026](https://www.zluri.com/blog/separation-of-duties-policy-example) — Cross-department access patterns

**Maintenance & Repair Workflows:**
- [Maintenance Management System Best Practices 2026](https://www.getsockeye.com/blog/best-maintenance-scheduling-software/) — Recurring maintenance patterns
- [Pest Control Work Order Software](https://www.maintenancecare.com/pest-control-work-order-software) — Recurring service workflows
- [HVAC Preventive Maintenance Checklist 2026](https://oxmaint.com/industries/hvac/hvac-preventive-maintenance-checklist-2026) — Quarterly maintenance patterns
- [Service Maintenance Contracts: Key Elements & Best Practices](https://www.servicegeeni.com/blog/understanding-service-maintenance-contracts) — Contract-based services

---
*Feature research for: Services Department (CLMC Procurement System)*
*Researched: 2026-02-12*
*Research confidence: HIGH — Based on verified service management patterns, existing Projects implementation analysis, and validated user requirements*
