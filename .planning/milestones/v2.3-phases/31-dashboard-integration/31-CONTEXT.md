# Phase 31: Dashboard Integration - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing home.js dashboard (app/views/home.js) to show Services department statistics alongside Projects department statistics. Phase covers DASH-01 (active services count) and DASH-02 (services-linked MRFs count). Navigation cards are unchanged. Department breakdown chart (DASH-03) is deferred.

</domain>

<decisions>
## Implementation Decisions

### Stats layout & presentation
- Add new Services stats to the **same row** as existing stats (extend `.quick-stats`)
- All stat items look **identical** — no color or badge difference between departments
- Services adds **2 new stat items**: Active Services count + Services-linked MRFs count
- "Active Services" = services documents where `active === true`
- "Services MRFs" = MRFs where `department === 'services'` AND `status === 'Pending'` (mirrors existing Active MRFs logic exactly)

### Role-aware visibility
- **Mirror the operations_user / operations_admin pattern for services roles:**
  - `operations_admin` + `operations_user` → see Projects stats only (existing 3 stats, now filtered to Projects MRFs)
  - `services_admin` + `services_user` → see Services stats only (Active Services + Services MRFs)
  - `super_admin`, `finance`, `procurement_staff` → see both departments' stats
- Existing stats are **also filtered by department** for single-department roles (operations roles see Projects MRFs only, not all MRFs)
- Labels for single-department roles remain unchanged ("Active MRFs", not "Projects MRFs")
- For dual-department viewers (Super Admin, Finance, Procurement): stats are **grouped with small department labels** ("Projects" above the first group, "Services" above the second group) within the same stats bar

### MRF status breakdown detail
- "Services MRFs" stat = **single number** in the stat card (no expanded breakdown)
- Count logic: `department === 'services'` AND `status === 'Pending'`

### Navigation cards
- Navigation cards (MRF, Procurement, Finance) remain unchanged for all roles

### Claude's Discretion
- Exact HTML/CSS for the small department group labels (for dual-dept viewers)
- How to pass role context to home.js (use existing getCurrentUser() / getRole() patterns)
- Listener management for the new stats queries

</decisions>

<specifics>
## Specific Ideas

- Role visibility pattern should mirror exactly how operations_user vs services_user work — same isolation logic, applied to dashboard stats

</specifics>

<deferred>
## Deferred Ideas

- **Department breakdown chart (DASH-03)** — CSS two-bar visualization of Projects vs Services work distribution. User confirmed this is deferred to a future phase. Not in scope for this plan.

</deferred>

---

*Phase: 31-dashboard-integration*
*Context gathered: 2026-02-18*
