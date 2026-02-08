# Phase 19: Navigation Consolidation - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge Settings, Assignments, and Users tabs into a single "Admin" navigation item with a dropdown submenu. All existing functionality preserved, role-based visibility enforced. No new admin capabilities added.

</domain>

<decisions>
## Implementation Decisions

### Admin entry point
- Dropdown submenu from a single "Admin" nav item (not a dedicated page)
- Positioned after main workflow tabs (Home, Procurement, Finance, etc.) — same row, no special separation
- Simple text links in dropdown — no icons, no descriptions
- Click to toggle dropdown open/closed (not hover)
- No visual chevron/arrow indicator — just the text "Admin"
- When any admin section is active, the "Admin" nav item stays highlighted (no breadcrumb)

### Section organization
- Clicking a dropdown link navigates directly to that section's view (same content as current standalone tabs)
- Sections renamed to fit admin context — Claude picks descriptive names (e.g., Role Templates, Project Access, User Management)
- Order: most used first — User Management at top, then Assignments, then Settings
- Each section keeps its full existing functionality intact

### Navigation feel
- Dropdown style: flat, minimal — same background as nav, subtle divider, consistent with existing design system
- Remaining nav items stay compact (don't spread out to fill freed space)
- Dropdown closes on outside click or when navigating away

### Transition behavior
- Dropdown auto-closes when navigating to any non-admin section
- Single route: #/admin (no individual deep links like #/admin/users)
- Default section when navigating to #/admin: User Management (most frequently used)
- Old routes (#/settings, #/users, #/assignments) removed entirely — no redirects

### Claude's Discretion
- Exact dropdown CSS (positioning, animation, z-index)
- Section rename choices (descriptive names that fit admin context)
- How role-based visibility filters the Admin nav item
- Dropdown close timing and animation

</decisions>

<specifics>
## Specific Ideas

- Dropdown should feel native to the existing nav — not a bolted-on component
- "Admin" text only, no chevron — discovery happens on first click, then muscle memory
- Keep it simple: three plain links, click-to-navigate, done

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 19-navigation-consolidation*
*Context gathered: 2026-02-08*
