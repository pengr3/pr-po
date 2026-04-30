# Phase 74: Optimize Material Request Tab for Mobile Use — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 74-optimize-material-request-tab-for-mobile-use-improve-items-table-layout-and-form-ux-for-small-screens
**Areas discussed:** Items table layout, My Requests tab, Tab navigation bar

---

## Areas to Discuss

| Option | Description | Selected |
|--------|-------------|----------|
| Items table layout | Card-per-item, 2-line table, or stacked inputs for mobile | ✓ |
| My Requests tab | Include 8-column table mobile optimization or defer | ✓ |
| Tab navigation bar | Pill bar upgrade vs keep current .tab-btn | ✓ |
| Other form sections | Request Type, Urgency, Basic Info tweaks | |

**User's choice:** Items table layout, My Requests tab, Tab navigation bar

---

## Items Table Layout

### Q: How should each item look on mobile screens?

| Option | Description | Selected |
|--------|-------------|----------|
| Card per item | CSS dual-mode, card + table in DOM, media query switches. Matches Phase 73.1. | ✓ |
| Compact 2-line table | Reorder columns, still a table | |
| Stacked inputs (no table) | Remove table entirely on mobile | |

**User's choice:** Card per item

---

### Q: Where should the Remove button go on each item card?

| Option | Description | Selected |
|--------|-------------|----------|
| Top-right [×] icon | Small × floating top-right, matches Finance cards | ✓ |
| Bottom red Remove button | Full-width red button at card bottom, mirrors desktop | |

**User's choice:** Top-right [×] icon

---

### Q: Should 'Add Another Item' span full width on mobile?

| Option | Description | Selected |
|--------|-------------|----------|
| Full-width | Easier tap target, consistent with Finance card action buttons | ✓ |
| Left-aligned, natural width | Same as desktop, no CSS change needed | |

**User's choice:** Full-width

---

## My Requests Tab

### Q: Include in Phase 74 or defer?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include it | Card-per-MRF via mrf-records.js, one complete phase | ✓ |
| Defer to its own phase | Smaller scope, easier to verify | |

**User's choice:** Yes, include it

---

### Q: What info should each MRF card show on mobile?

| Option | Description | Selected |
|--------|-------------|----------|
| MRF ID + Status + Date + Actions | 4 key fields, scannable | ✓ |
| All 8 columns in card form | Complete but verbose | |
| You decide | Claude picks the balance | |

**User's choice:** MRF ID + Status + Date + Actions

---

### Q: How should Edit/Cancel MRF actions work on mobile (no right-click)?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline action buttons on card | Always visible, no gesture needed | |
| Long-press to simulate context menu | Mimics desktop but hidden discoverability | |
| 3-dot menu icon on card | Familiar mobile pattern, extra tap for actions | ✓ |

**User's choice:** 3-dot (⋮) menu icon on card

---

## Tab Navigation Bar

### Q: Pill bar upgrade or keep current .tab-btn?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — same pill bar as Finance | .mrf-sub-nav-tab scoped class, scroll-hide/show | ✓ |
| Keep current .tab-btn style | Only 2 tabs, current style may be adequate | |

**User's choice:** Yes — same pill bar treatment as Phase 73.3 Finance

---

## Claude's Discretion

- CSS class naming for MRF item cards (`.mrf-item-card`, `.mrf-item-card-list`)
- 3-dot dropdown implementation (positioned div vs details/summary)
- Qty + Unit row proportions on item card
- Whether Project name or urgency appears as secondary info on My Requests cards

## Deferred Ideas

None.
