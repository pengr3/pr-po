# Phase 43: Mobile Hamburger Navigation - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

The top navigation collapses into a hamburger icon at viewport widths below 768px. Tapping the hamburger opens a full-width dropdown menu with all role-accessible nav items. At 768px and above, the standard horizontal nav renders as-is. This phase covers only the top navigation — responsive layouts for view content (tables, modals, panels) are Phase 44.

</domain>

<decisions>
## Implementation Decisions

### Breakpoint
- Hamburger menu at viewport widths below 768px
- Desktop horizontal nav at 768px and above
- Breakpoint auto-closes menu and restores desktop nav when browser is resized from mobile to desktop

### Mobile header layout
- App name ("CLMC") on the left side of the mobile header
- Hamburger icon on the right side of the mobile header
- Regular nav links hidden on mobile

### Role-based visibility
- Mobile menu shows the same nav items as the desktop nav — role-based visibility rules are identical
- Finance tab only for finance role, Admin only for admins, etc.

### User info and logout
- User name and logout button appear inside the hamburger menu, at the bottom
- A horizontal line separator divides nav links from the user/logout section
- User name and logout are NOT shown in the mobile header bar

### Menu presentation
- Full-width dropdown that appears below the header bar (not a side drawer or full-screen overlay)
- Menu spans the full viewport width
- Menu sits above page content (not pushing content down)

### Menu content
- Top-level nav links only: Home, Procurement, Finance, Admin (per role)
- No sub-items for views that have tabs — sub-tabs remain as horizontal tab buttons inside the view content area
- Tapping "Procurement" opens Procurement on its default tab and closes the menu

### Active state
- Currently active page is indicated by a highlighted row (blue/accent background color matching the app's primary #1a73e8 or a lighter tint)

### On-tap behavior
- Tapping a nav item navigates to that view AND closes the menu simultaneously

### Animation
- Menu opens with a smooth slide-down animation (not instant)
- Hamburger icon transforms into an X (close icon) when menu is open; transforms back to ☰ when closed

### Visual style
- Menu background matches existing desktop nav (white/light background)
- Nav item rows have generous touch targets: at least 48–56px tall with appropriate padding

### Interaction behaviors
- Tapping outside the menu (on the backdrop or page content) closes the menu
- Semi-transparent backdrop behind the open menu dims the page content
- Page scroll is locked while the menu is open
- Browser back button navigates normally — does not close the menu (no history API manipulation)

### Claude's Discretion
- Exact CSS for active item highlight (blue background, lighter tint, or left accent border)
- Backdrop opacity level
- Exact animation duration and easing curve
- Box shadow on the open menu dropdown

</decisions>

<specifics>
## Specific Ideas

- The dropdown is a full-width panel that drops down from the top nav bar, overlapping the page content with a semi-transparent backdrop behind it
- The hamburger ☰ animates into an X when open — clear visual signal that tapping closes it
- Rows are large enough for comfortable thumb tapping (48–56px)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 43-mobile-hamburger-navigation*
*Context gathered: 2026-02-27*
