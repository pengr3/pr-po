# Phase 16: Project Detail Page Restructure - Context

**Gathered:** 2026-02-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganize the project detail page from a two-column form layout into a clearer card-based structure with better information hierarchy. Transform the current single-card inline editing view into 3 vertically-stacked cards with logical field groupings: (1) Project Info, (2) Financial Summary, (3) Status & Assignment. Move Active toggle to prominent top position and Delete button to bottom.

</domain>

<decisions>
## Implementation Decisions

### Card Structure & Layout
- **3 cards in vertical stack** — full-width cards stacked vertically (Card 1, Card 2, Card 3)
- **No explicit card headers** — field grouping is self-explanatory, reference expense modal structure (from screenshot) for visual approach
- **Visual separation** — subtle gaps with borders between cards (consistent with current card styling)
- **Field layout within cards** — Claude's discretion to optimize based on field types per card

### Card 1: Project Information
- **Fields:** Project Code (display-only), Project Name (editable), Client (display-only), Assigned Personnel (editable datalist)
- **Metadata placement:** Created/Updated timestamps at top of Card 1

### Card 2: Financial Summary
- **Fields:** Budget (editable), Contract Cost (editable), Expense (calculated, read-only), Remaining Budget (calculated, read-only)
- **Expense calculation:** Sum of all project expenses (POs, Transport Requests, delivery fees)
- **Expense interactivity:** Click expense amount/row to open detailed breakdown modal (like Finance expense modal in screenshot)
- **Update behavior:** Calculate on page load + provide refresh button to recalculate (not real-time listener)
- **Remaining Budget:** Show Budget - Expense calculation

### Card 3: Status & Assignment
- **Fields:** Internal Status (dropdown), Project Status (dropdown)
- **Note:** Personnel moved to Card 1 per success criteria grouping

### Active Toggle (Above All Cards)
- **Placement:** Separate row above all cards — very prominent position
- **UI Control:** Badge with click-to-toggle (not checkbox or switch)
- **Badge style:** Consistent with app status badge format but prominent/noticeable since it controls MRF creation
- **Toggle behavior:**
  - Deactivating (Active → Inactive): Show confirmation modal "Deactivate this project?"
  - Activating (Inactive → Active): No confirmation, instant toggle with toast feedback
- **Delete button:** Moved to bottom of page (below all cards) to prevent accidental clicks

### Field Interactivity
- **Editable fields (inline auto-save):** Project Name, Budget, Contract Cost, Internal Status, Project Status, Personnel
- **Locked fields (display-only):** Project Code, Client — show as plain text with labels, NOT as disabled input fields
- **Calculated fields:** Expense, Remaining Budget — display-only, Claude's discretion for styling but avoid AI-like appearance (keep it clean and business-like)

### Claude's Discretion
- Exact field layout within each card (single-column vs 2-column grid optimization)
- Styling for calculated fields (Expense, Remaining Budget) — clean, professional, not AI-like
- Refresh button placement and icon for Expense recalculation
- Expense breakdown modal implementation (can reuse/adapt Finance modal patterns)

</decisions>

<specifics>
## Specific Ideas

- **Expense modal reference:** User provided screenshots of Finance expense breakdown modal showing scorecards (Material Purchases, Transport Fees, etc.) with detailed tables below grouped by category. This modal pattern should inspire/inform the project expense breakdown modal.
- **"Avoid AI-like style":** Keep UI clean, business-focused, professional — no excessive icons, emojis, or over-designed elements that feel artificial.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-project-detail-page-restructure*
*Context gathered: 2026-02-07*
