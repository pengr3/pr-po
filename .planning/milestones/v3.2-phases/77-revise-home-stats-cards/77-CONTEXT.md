# Phase 77: Revise Home Stats Cards — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the `quick-stats` section at the bottom of the Home page (`.quick-stats` div) from the current flat stat row into 3 domain-specific stat cards: **Procurement**, **Projects**, and **Services**.

The 3 navigation cards above (Material Request / Procurement / Finance Dashboard) are **out of scope** — do not touch them.

</domain>

<decisions>
## Implementation Decisions

### D-01: Procurement Card — Pipeline Metrics

Show the MRF procurement workflow as a left-to-right pipeline:

| Stat | Source | Label |
|------|--------|-------|
| Pending MRFs | `mrfs` where `status == 'Pending'` | Pending MRFs |
| Pending PRs | `prs` where `finance_status == 'Pending'` | Pending PRs |
| Active POs | `pos` where `procurement_status != 'Delivered'` | Active POs |

Department filtering follows the existing `getDashboardMode()` pattern (MRFs filtered client-side by `department` field as currently done).

### D-02: Projects Card — Status Breakdown

Show two grouped stat sections inside the Projects card:

**Internal Status** (4 values — count of projects per value):
- For Inspection
- For Proposal
- For Internal Approval
- Ready to Submit

**Project Status** (7 values — count of projects per value):
- Pending Client Review
- Under Client Review
- Approved by Client
- For Mobilization
- On-going
- Completed
- Loss

Source: `projects` collection, all docs (no active filter — statuses span active and inactive).

### D-03: Services Card — Status Breakdown Split by Type

Same internal + project status breakdown as Projects, but split into two sub-sections:

**One-time** (service_type === 'one-time'):
- Internal Status: 4 counts
- Project Status: 7 counts

**Recurring** (service_type === 'recurring'):
- Internal Status: 4 counts
- Project Status: 7 counts

Source: `services` collection, all docs. Split client-side by `service_type`.

### D-04: Card Visual Style

Use white shadow card style matching the 3 navigation cards above. The stats cards should feel like a second tier of cards, visually consistent with the nav cards but clearly secondary/informational (e.g., no "Enter →" button, slightly smaller heading).

### D-05: Role Awareness

Preserve the existing `getDashboardMode()` logic:
- `operations_admin` / `operations_user` → show **Procurement + Projects** cards only
- `services_admin` / `services_user` → show **Procurement + Services** cards only
- `super_admin` / `finance` / `procurement_staff` / unknown → show **all 3 cards**

The Procurement card is always shown regardless of role (it shows cross-cutting pipeline stats).

### Claude's Discretion

- Whether to hide zero-count status rows or show them as "0" — planner decides based on readability.
- Whether Projects and Services status rows use a compact 2-column grid or a vertical list within each section — planner decides.
- Whether the Services card uses tabs (One-time | Recurring) or stacked sections to separate the two types — planner decides.
- Exact spacing, font-size, and color treatment within the new cards — follow existing design system variables.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Home view (primary target)
- `app/views/home.js` — Full current implementation: `getDashboardMode()`, `loadStats()`, `cachedStats`, `updateStatDisplay()`, listener management pattern. New code extends this file.

### Status enums (hardcoded in projects.js — replicate in home.js)
- `app/views/projects.js` lines 28–43 — `INTERNAL_STATUS_OPTIONS` (4 values) and `PROJECT_STATUS_OPTIONS` (7 values). Home.js must either import or inline these arrays for the status breakdown queries.

### Design system
- `styles/main.css` — CSS variables: colors, spacing, border-radius
- `styles/components.css` — Existing `.nav-card`, `.quick-stats`, `.stat-item`, `.stat-group` styles that may be extended or replaced

### Services schema reference
- `app/views/services.js` lines 693–730 — confirms `service_type: 'one-time'|'recurring'`, `internal_status`, `project_status` field names on services documents.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getDashboardMode()` — returns `'projects'|'services'|'both'`; drives which cards render
- `cachedStats` object — extend with new keys for project/service status counts
- `updateStatDisplay(elementId, value)` — already exists; reuse for new stat elements
- `statsListeners[]` — existing listener array; new listeners push into same array

### Established Patterns
- All stats use `onSnapshot` real-time listeners (not one-time `getDocs`)
- Department filtering for MRFs: client-side filter on `d.data().department || 'projects'` — no composite index needed
- Stale-while-revalidate: `cachedStats` values preserved on `destroy()`, cleared only on role change
- Status filtering for projects/services is always client-side (full collection fetch, then `.filter()`)

### Integration Points
- `.quick-stats` div in `render()` — replace its contents with 3-card layout
- `loadStats(mode)` — extend to also subscribe to `projects` and `services` collections
- `cachedStats` object — add keys: `projectsByInternalStatus`, `projectsByProjectStatus`, `servicesByInternalStatusOneTime`, `servicesByProjectStatusOneTime`, `servicesByInternalStatusRecurring`, `servicesByProjectStatusRecurring`
- `updateStatDisplay` can stay as-is; new dynamic renders may need a `renderStatusBreakdown(containerId, countsMap)` helper

</code_context>

<specifics>
## Specific Ideas

- The Procurement card mirrors the existing pipeline stats (Pending MRFs → Pending PRs → Active POs) but presented as its own named card rather than in a flat row under a "Projects" group label.
- Projects and Services cards are information-dense (11 data points each; Services card 22 total across two type sections). Visual hierarchy within each card is important — planner should group internal status and project status clearly.
- Services card should visually communicate the one-time vs recurring split prominently (not buried), since that was explicitly called out as a requirement.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 77-revise-home-stats-cards*
*Context gathered: 2026-04-23*
