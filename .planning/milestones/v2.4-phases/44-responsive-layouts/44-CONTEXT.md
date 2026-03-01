# Phase 44: Responsive Layouts - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make existing data tables, split panels, and modals work correctly at narrow viewport widths. This is a layout adaptation phase — no new features, only ensuring existing UI components render without overflow, clipping, or inaccessible buttons at mobile and tablet widths.

</domain>

<decisions>
## Implementation Decisions

### Minimum supported width
- Target: 375px (mobile) as the minimum supported viewport width
- MRF form (`/mrf-form`) is the priority view for full mobile treatment — this is the trial/prototype view
- MRF form line-item table: horizontal scroll container (not column stacking or card transformation)
- Procurement and Finance views: minimum bar — no overflow/clipping, everything reachable by scrolling. Full mobile optimization is secondary for these views

### Table behavior at narrow widths
- All data tables (MRF list, PR list, PO tracking, supplier list, etc.): wrap in `overflow-x: auto` scroll container
- Right-edge shadow/fade gradient to signal that the table scrolls horizontally
- Action buttons (Edit, Delete, View, etc.) stay inline in their table column — they scroll with the table, no sticky column
- No sticky header — standard header that scrolls with the table

### Split-panel stacking
- Breakpoint: 768px — below this, side-by-side panels stack vertically
- Stack order: list panel on top, detail panel below
- Detail panel hidden when no MRF is selected (not shown with a placeholder)
- When user selects an MRF on mobile, page auto-scrolls to the detail panel

### Modal sizing at narrow widths
- Near-full-screen: ~95% viewport width with small side margin
- Entire modal scrolls within the viewport (not inner-content-only scroll)
- Action buttons (Save/Cancel/Confirm) stack vertically as full-width buttons
- Backdrop (blur/dim) kept on mobile — consistent with desktop experience

### Claude's Discretion
- Exact CSS breakpoint values within the stated ranges (e.g., 375px floor, 768px split-panel)
- Which specific CSS properties to use for the scroll container and shadow fade
- Handling edge cases in views not specifically discussed (Finance tabs, home dashboard)
- Scroll indicator implementation details (gradient direction, opacity, width)

</decisions>

<specifics>
## Specific Ideas

- MRF form is explicitly the "trial section" — get this right first, then apply patterns to other views
- The horizontal scroll + right-edge shadow is a proven pattern; apply it consistently across all table views
- Auto-scroll to detail panel should be smooth (scroll behavior), not instant jump

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 44-responsive-layouts*
*Context gathered: 2026-02-27*
