# Phase 26: Security & Roles Foundation - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Firebase Security Rules and role templates that enable Services department isolation. This phase adds two new roles (`services_admin`, `services_user`) to the role_templates collection and wires Security Rules to enforce who can read/write the `services` collection. No Services UI is built in this phase — that's Phase 28. The decisions here define the access model that all subsequent v2.3 phases depend on.

</domain>

<decisions>
## Implementation Decisions

### Services role permission scope
- services_admin and services_user navigation: Claude's Discretion — mirror operations roles pattern (Services tab + MRF form + Dashboard)
- services_user CAN submit MRFs for their assigned services (same as operations_user can submit for assigned projects)
- services roles do NOT get Finance or Procurement tab access — Finance/Procurement are cross-department roles only
- Only Super Admin manages users; services_admin has no user management capabilities

### Department silo model
- Full silo in both directions: operations roles (ops_admin, ops_user) are blind to Services department; services roles (services_admin, services_user) are blind to Projects department
- Neither department's roles can see the other's tab in navigation
- Finance and Procurement roles: read-only access to services collection (they can see services data for cross-department workflows, but cannot write to the services collection)
- MRF-level silo enforcement (preventing services roles from writing department='projects' MRFs) is deferred to Phase 29 — Phase 26 Security Rules focus on the services collection only

### all_services flag & admin bypass
- Claude's Discretion on implementation approach (flag in user doc vs role check in rules) — use whatever is most consistent with how Phase 8 Security Rules were structured
- Claude's Discretion on whether services_admin sees all services or only assigned — mirror the operations_admin vs operations_user pattern from Phase 7
- Super Admin sees ALL services by default when Services tab is built — no filtering required
- Defer updating existing Super Admin user documents with any new flags until Phase 28 (when Services UI is built and the flags matter)

### Role template defaults
- Add BOTH services_admin and services_user as new documents in the role_templates collection, following the existing pattern from Phase 6
- services_admin default permissions mirror operations_admin exactly (same tab access, same edit rights) — just scoped to Services instead of Projects
- Claude's Discretion on whether to surface these new role templates in the existing Super Admin role config UI or keep them read-only until Phase 28
- Registration/approval flow is unchanged — services roles appear as additional options in the Super Admin role assignment dropdown (7 total roles instead of 5)

### Claude's Discretion
- Whether to use `all_services: true` flag in user doc or rely purely on role-based checks in Security Rules
- Whether services_admin sees all services (unrestricted) or only assigned ones — apply whatever pattern operations_admin follows
- Whether new role templates are immediately editable in the Super Admin UI or deferred to Phase 28
- Exact navigation tab visibility implementation for services roles

</decisions>

<specifics>
## Specific Ideas

- Services department isolation is symmetric and strict — neither department leaks into the other at the role level
- The silo is enforced at the collection level for Phase 26 (services collection); MRF-level department field enforcement comes in Phase 29
- Finance and Procurement intentionally cross both silos — they see everything but only modify what's in their workflow domain

</specifics>

<deferred>
## Deferred Ideas

- MRF department-level Security Rules enforcement (services roles blocked from writing department='projects' MRFs) — Phase 29
- Updating existing Super Admin user documents with new flags (all_services etc.) — Phase 28
- Services role template UI configuration in Super Admin — Phase 28 (if needed at all)

</deferred>

---

*Phase: 26-security-roles-foundation*
*Context gathered: 2026-02-18*
