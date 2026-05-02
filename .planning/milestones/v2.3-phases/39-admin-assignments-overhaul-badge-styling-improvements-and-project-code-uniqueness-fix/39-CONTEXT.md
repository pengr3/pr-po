# Phase 39: Admin Assignments Overhaul, Badge Styling Improvements, and Project Code Uniqueness Fix - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Three discrete improvements: (1) Replace the bloated per-user checkbox assignment pages with a compact table+modal interface in a single unified Assignments tab, (2) Standardize all status badge colors across every view and replace redundant PR status badges in MRF History with badge-styled PR codes, (3) Fix project/service code generation to query both collections and prevent code collisions.

</domain>

<decisions>
## Implementation Decisions

### Admin Assignments Overhaul
- **Unified single tab**: Merge all separate assignment tabs (project assignments, service assignments) into one "Assignments" tab
- **Toggle sub-tabs**: [Projects] and [Services] toggle tabs at the top of the unified Assignments tab switch the table content
- **Table layout**: Users listed in a table with columns: Name, Role, Assignment Count, Actions ([Manage] button)
- **Manage modal**: Clicking [Manage] opens a modal with a searchable list of all projects (or services). Checkboxes to assign/unassign. [Save] and [Cancel] buttons
- **Remove "All Projects" auto-assign**: No more "All Projects (includes future projects automatically)" checkbox. Only explicit assignments — new projects must be manually assigned
- **Saves on modal Save**: Changes apply when user clicks Save in the modal (not auto-save on checkbox toggle)

### Badge Styling Improvements
- **Remove redundant PR status badges** from MRF History PR columns — instead, style the PR code itself as a badge (colored background + text, same visual style as current badges, but the badge IS the code)
- **Color tells the status**: No tooltip or extra text needed — the color alone communicates status
- **Standardized color mapping across ALL views globally**:
  - Orange/amber = Pending states
  - Green = Approved/Complete/Delivered states
  - Red = Rejected/Failed states
  - Blue = In-progress states (Procuring, etc.)
- **Apply uniformly**: Sweep every table across Home, Procurement, Finance, Projects, Services — all status badges use the unified color scheme
- **Department badges unchanged**: Projects/Services department badges stay as-is
- **Exact shades**: Claude picks consistent shades that work with the existing CSS design system

### Project Code Uniqueness Fix
- **Fix the generator, not the UI**: Code generation must query BOTH projects and services collections when calculating the next sequence number — prevents collisions at the source
- **Shared sequence, collision-safe**: Keep the shared CLMC_CLIENT_YYYY### sequence. Generator uses Promise.all to query both collections and find the true max across both
- **No user-facing error needed**: Since codes are auto-generated, the fix ensures duplicates never happen. No validation dialogs or error messages required
- **Forward-looking only**: Don't audit or fix existing data — just prevent future collisions
- **No security rule enforcement**: Fix the generation logic only — no Firestore security rules for uniqueness

### Claude's Discretion
- Exact orange/green/red/blue hex values (must be cohesive with existing CSS variables)
- Table pagination for the user list in Assignments tab
- Modal search/filter implementation details
- How to handle the "All Projects" flag removal for users who currently have it set

</decisions>

<specifics>
## Specific Ideas

- Current assignment pages list EVERY project for EVERY user — "if we have 100 projects for 100 people that's over 10,000 lines of bullshit"
- PR codes in MRF History should look like badges themselves — same rounded-rect style as current status badges, but displaying the PR code text with status-colored background
- The fix for code generation already has a precedent: `generateServiceCode()` in Phase 27 uses `Promise.all` to query both collections — but the project-side generator may not do the same

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix*
*Context gathered: 2026-02-24*
