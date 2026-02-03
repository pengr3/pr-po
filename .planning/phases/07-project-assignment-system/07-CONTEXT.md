# Phase 7: Project Assignment System - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Super Admin and Operations Admin can assign specific projects to Operations Users via a standalone admin panel. Operations Users then see only their assigned projects in the project list and MRF form. An "all projects" escape hatch exists per-user. Assignment changes propagate immediately via real-time listeners. Dashboard (home view) is explicitly out of scope.

</domain>

<decisions>
## Implementation Decisions

### Assignment UI & location
- Standalone admin panel — separate from the existing role config tab, not bolted onto the permission matrix
- Accessible by both Super Admin and Operations Admin
- Layout direction (user-centric vs project-centric) is Claude's discretion
- Save mechanism (auto-save vs batch) is Claude's discretion — choose based on what fits the data model and existing patterns best

### "All projects" option
- Per-user setting — each Operations User is independently set to "all projects" or specific assignments
- Data model for representing "all projects" is Claude's discretion (flag vs sentinel value — pick what's cleanest for Firestore)
- Whether the user sees a visual indicator of "all projects" state is Claude's discretion
- "All projects" should automatically include new projects as they are created (it's a dynamic state, not a snapshot)

### Real-time update UX
- Silent refresh — project list updates quietly when assignments change, no toast or notification. Consistent with how permission changes currently propagate
- If an Operations User is on a project detail page when that project is removed from their assignments: show an access denied message with a link back to the project list (not a silent redirect)
- Filtering applies to Operations Users only — all other roles (Super Admin, Operations Admin, Finance, Procurement) always see all projects
- Dashboard (home view) stats are NOT filtered and NOT modified in this phase — explicitly out of scope

### MRF form filtering
- Project dropdown in MRF form shows only assigned (active) projects for Operations Users — unassigned projects are completely hidden
- If an Operations User has zero assigned projects, the MRF form loads normally but the project dropdown is empty with a hint message (e.g., "No projects assigned — contact your admin")
- MRF list in procurement view is also filtered — Operations Users only see MRFs belonging to their assigned projects
- PR/TR generation, PO tracking, and supplier tabs do not need project-scoped filtering for Operations Users — tab-level permission enforcement from Phase 6 already gates access to those tabs appropriately

### Claude's Discretion
- Assignment panel layout direction (user-centric vs project-centric)
- Save mechanism for assignments (auto-save vs batch with confirm)
- Data model for "all projects" state (flag on user doc vs sentinel value in assignment array)
- Visual indicator for "all projects" state on the Operations User side
- Exact wording/styling of empty dropdown hint and access denied message

</decisions>

<specifics>
## Specific Ideas

- "All projects" is dynamic — new projects appear automatically, not a frozen snapshot
- Operations Users are scoped consistently: project list filtered, MRF creation filtered, MRF list filtered. Everything an Operations User touches reflects their assignments.
- Dashboard is intentionally untouched — user has separate plans for it

</specifics>

<deferred>
## Deferred Ideas

- Dashboard stats scoped to assigned projects — user has other plans for the dashboard, do not edit in this phase or future phases without explicit instruction
- Filtering within PR/TR and PO tabs by project assignment — not needed now since Operations Users don't access those tabs, but could be revisited if role permissions change

</deferred>

---

*Phase: 07-project-assignment-system*
*Context gathered: 2026-02-03*
