# Phase 71: Revamp Expense Modal → Financial Breakdown + Payables Tab - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Revamp the existing shared Expense Breakdown modal (`app/expense-modal.js`) into a "Financial Breakdown" modal by:

1. Renaming all user-visible "Expense Breakdown" strings to "Financial Breakdown"
2. Adding a third tab labeled **Payables** alongside the existing "By Category" and "Transport Fees" tabs
3. Populating the Payables tab with a 4-column table (Particulars | Status | Total Payable | Total Paid) covering every payable entity associated with the project/service: POs, TRs, and Delivery Fees

**In scope:**
- The `showExpenseBreakdownModal()` function in `app/expense-modal.js` and every site that opens it (procurement view, finance view — project and service mode)
- User-visible string replacements across `app/views/procurement.js`, `app/views/finance.js`, and any related UI
- CSV export filename (track the user-facing rename)

**Out of scope (deferred):**
- Row actions (clicks, right-click menus) on Payables rows — read-only for v1
- Internal symbol rename (`showExpenseBreakdownModal`, DOM IDs, CSS classes, file path)
- Any new scoreboards or modification to existing Row 1/2/3 scoreboards
- Splitting multi-tranche POs into multiple Payables rows
- Per-line-item (SKU-level) granularity in Payables rows

</domain>

<decisions>
## Implementation Decisions

### Row Granularity
- **D-01:** One row per payable entity — one PO = one row, one TR = one row, one Delivery Fee = one row. A PO with a delivery fee produces two rows (the PO itself and the Delivery Fee).
- Multi-tranche POs collapse into a single row; tranche context lives in the Status column (not in separate rows).
- No SKU/line-item level rows — payment status is tracked at the RFP-scoped level (per PO / per TR / per Delivery Fee), matching how RFPs are filed throughout the app.

### Status Taxonomy
- **D-02:** Four status values, in display priority order:
  1. `Not Requested` — no RFP document exists for this payable (no `rfps` document with matching `po_id` / `tr_id` / delivery-fee tranche)
  2. `Requested` — RFP exists but has zero non-voided `payment_records`
  3. `Partial` — RFP has payment records and `totalPaid < amount_requested` (or, for multi-tranche POs, at least one tranche has recorded payment but the PO is not yet fully paid)
  4. `Fully Paid` — `totalPaid >= amount_requested` (or all tranches of a multi-tranche PO fully paid)
- **Partial label format:** `{TrancheLabel} — NN% Paid` (e.g. `50% Down Payment — 40% Paid`). Reuses the exact format established in Phase 65.3 (Current Active Tranche column in Finance Payables).
- **D-03:** For multi-tranche POs, the Status column shows the **currently active tranche** — the one the user needs to act on next. If tranche 1 is fully paid, Status reflects tranche 2 (`Not Requested` / `Requested` / `{tranche2_label} — NN% Paid`). This mirrors the "Current Active Tranche" model from Phase 65.3 so users have one mental model across the app.
- **D-04:** Delivery Fees use a three-state subset only: `Not Requested` / `Requested` / `Fully Paid`. Delivery fees are single-shot (Phase 65.9 created them as non-tranche RFPs with `tranche_percentage=0` and `tranche_label='Delivery Fee'`). A `Partial` delivery fee is technically possible but treated as an edge case — fall back to the generic `Partial` rendering if it occurs.
- **D-05:** Only **non-voided** `payment_records` count toward Total Paid. Consistent with Phase 69.1 (Remaining Payable formula). Voided records are filtered out at the same boundary.

### Sort Order
- **D-06:** Top-to-bottom status order: `Not Requested` → `Requested` → `Partial` → `Fully Paid`. Paid rows pinned to the bottom. Rationale: action-needed items appear first so the modal reads as a worklist.
- **D-07:** Secondary sort within each status bucket: **Total Payable descending** (biggest outstanding amount first). Surfaces highest-impact items in each bucket.

### Row Actions
- **D-08:** Payables tab is **read-only** in v1. No click handlers, no right-click context menus, no direct RFP-filing from this view. Users who want to act on a row use MRF Records (for RFP creation) or Finance Payables (for recording payments) — both already have the full action surface. Revisit actions in a follow-up phase if usage data shows users want them here.

### Rename Scope
- **D-09:** User-visible rename only. All strings users read — modal title (`<h3>` at `app/expense-modal.js:341`), button labels, context menu items, tooltips, CSV export filename prefix — change from "Expense Breakdown" to "Financial Breakdown". Internal symbols remain unchanged: `showExpenseBreakdownModal()`, `window._exportExpenseBreakdownCSV`, `window._closeExpenseBreakdownModal`, `window._switchExpenseBreakdownTab`, `window._toggleExpenseCategory`, DOM IDs (`#expenseBreakdownModal`, `#expBreakdownCategoryTab`, `#expBreakdownTransportTab`), the `.expense-tab` CSS class, and the file path `app/expense-modal.js`. Rationale: zero risk to existing callers; small focused diff; internal cleanup can happen in a separate cosmetic phase if needed.

### Visual Parity with Existing Tabs
- **D-10:** Payables tab uses a **single collapsible card** wrapping the 4-column table, mirroring the CIVIL-style `.category-card` pattern already used in the By Category tab.
  - Card header: `PAYABLES` label on the left, sum of Total Payable on the right (same typography as CIVIL's "61,500.00")
  - Toggle arrow (▼/▶) wired to the existing `window._toggleExpenseCategory` handler
  - Card body: a single `.modal-items-table` with header row `PARTICULARS | STATUS | TOTAL PAYABLE | TOTAL PAID`
  - No grouping sub-cards per status — one flat sorted table inside the card
  - Sort order (D-06, D-07) is enforced within this single table

### Claude's Discretion
- Exact CSS color/padding for status cells (follow existing `.status-badge` conventions from Finance Payables if available, otherwise use the modal's existing palette: `#64748b` neutral, `#166534` green for paid, `#1d4ed8` blue for in-progress, `#991b1b` red for not-started — mirroring the Row 3 scoreboard colors)
- Exact implementation of the tab button (whether it's a third `.expense-tab` button inserted between "By Category" and "Transport Fees" or appended at the end — planner decides based on logical grouping)
- How to compute "currently active tranche" for a multi-tranche PO when some tranches are paid and others unrequested (planner must look at existing Phase 65.3 logic in Finance Payables and reuse the same derivation — do not duplicate)
- Whether to add a totals footer row inside the Payables card showing sum of Total Payable and Total Paid — nice-to-have, planner may include if the implementation cost is trivial, otherwise defer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Modal architecture
- `app/expense-modal.js` — the single shared modal file; all work happens here plus calling sites
- `app/views/procurement.js` — caller site #1 (project and service modes, MRF Records right-click → Expense Breakdown)
- `app/views/finance.js` — caller site #2 (project list → Expense Breakdown button)

### Prior phase context (decisions already locked)
- `.planning/phases/65-rfp-payables-tracking/65-01-PLAN.md` through `65-05-PLAN.md` — RFP data model, `rfps` collection shape, `payment_records` array structure, tranche builder
- `.planning/phases/65.3-fix-current-active-tranche-column-for-partially-paid-items-display-nn-paid-so-users-know-how-much-is-paid/65.3-01-PLAN.md` — the `{TrancheLabel} — NN% Paid` format and active-tranche derivation logic that Phase 71 must reuse
- `.planning/phases/65.9-integrate-delivery-fees-rfp-support/65.9-01-PLAN.md` — Delivery Fee RFP model (`tranche_percentage=0`, `tranche_label='Delivery Fee'`)
- `.planning/phases/65.1-finance-payables-tab-dual-table-revamp-rfp-po-payments/65.1-02-PLAN.md` — `derivePOSummary` / `buildPOMap` logic used in Finance Payables PO Payment Summary; Phase 71 Payables tab is conceptually similar and should reuse whatever is reusable
- `.planning/phases/69-revise-expense-modal-scoreboards-to-add-remaining-payable-tracking/69-01-PLAN.md` — Remaining Payable scoreboard added to this same modal; Phase 71 does NOT modify it
- `.planning/phases/69.1-fix-remaining-payable-calculation-to-include-un-rfp-d-po-costs-inserted/69.1-01-PLAN.md` — the `totalCost − totalPaid (non-voided)` formula; Phase 71 Total Paid calculation must be consistent

### Project-level
- `CLAUDE.md` — SPA patterns, Firestore schema, window function convention for onclick handlers, class-based DOM selection rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showExpenseBreakdownModal(identifier, { mode, displayName, budget })` at `app/expense-modal.js:17` — already loads POs, TRs, RFPs, payment_records, and delivery fees. All data needed for the Payables tab is **already in scope** inside this function. No new Firestore reads required.
- `window._toggleExpenseCategory` at `app/expense-modal.js:454` — the collapse/expand handler used by `.category-card` elements. Payables card reuses this directly.
- `window._switchExpenseBreakdownTab` at `app/expense-modal.js:432` — the tab switching logic; Phase 71 extends it to handle the new `'payables'` tab key.
- `.category-card`, `.category-items`, `.category-toggle`, `.modal-items-table` CSS classes — already styled and used by the By Category tab. The Payables card should reuse them verbatim for visual parity.
- `formatCurrency()` from `app/utils.js` — used throughout the modal; reuse for Total Payable / Total Paid cells.
- Phase 65.3 active-tranche derivation — likely lives in `app/views/finance.js` (Finance Payables rendering). Planner must locate and reuse rather than reimplement.

### Established Patterns
- Modal HTML is built as a template literal and injected with `document.body.insertAdjacentHTML('beforeend', modalHTML)` — Phase 71 follows this, no DOM mutation helpers needed.
- Tab switching uses `data-tab` attributes on buttons + `display: none/block` on tab container divs. Phase 71 adds a third button and a third container div with `id="expBreakdownPayablesTab"` (or similar — planner picks the exact ID but follows the `expBreakdown{TabName}Tab` convention).
- Payment totals are computed inline in the same function that builds the modal HTML. Phase 71 computes the Payables rows in the same function, after the existing PO/TR iteration but before the template-literal assembly.
- Only non-voided payments count: the existing code already filters voided records (Phase 69.1). Phase 71 reuses the same filter.

### Integration Points
- **Tab button insertion:** new button in the tab nav `<div>` at `app/expense-modal.js:396-405`. Position between "By Category" and "Transport Fees", or after "Transport Fees" — planner decides.
- **Tab body insertion:** new `<div id="expBreakdownPayablesTab" style="display: none; ...">` after the Transport Fees container at `app/expense-modal.js:413`.
- **Tab switch logic:** extend `window._switchExpenseBreakdownTab` at line 432 to handle the third tab key (read current logic, add parallel branch).
- **Rename targets:** grep for `Expense Breakdown` across `app/` (excluding `.planning/`) to find every user-visible string. Expect hits in `expense-modal.js`, `views/procurement.js`, `views/finance.js`, possibly `components.js`.
- **CSV export filename:** `app/expense-modal.js` around the `_exportExpenseBreakdownCSV` closure — the current filename pattern uses `exportTitle`; check whether there's a hardcoded `expense-breakdown` prefix and update to `financial-breakdown`.

</code_context>

<specifics>
## Specific Ideas

- **Screenshot reference (from discussion):** The existing "Expense Breakdown: Aircon Repair" modal layout is the visual spec. The Payables tab card must match the look of the CIVIL card in the By Category tab — same header styling, same table styling, same toggle arrow.
- **Mental model:** Users described the Payables tab as a "list of everything that needs to be paid" — a worklist. This is why D-06 sorts action-needed items first and D-08 keeps the tab read-only (a worklist is scanned, not edited).
- **Consistency anchor:** Phase 65.3's "Current Active Tranche" column in Finance Payables is the reference implementation for how multi-tranche POs should surface their active tranche. Phase 71 Status column must be visually and semantically consistent.

</specifics>

<deferred>
## Deferred Ideas

- **Row actions on Payables tab** — click to open PO/TR details, right-click to file RFPs. Deferred per D-08; add in a follow-up phase if users request it.
- **Internal symbol rename** — `showExpenseBreakdownModal()` → `showFinancialBreakdownModal()`, DOM IDs, CSS classes, file path. Pure cosmetic cleanup; can happen in a separate phase with zero functional change.
- **Status filter / search on Payables tab** — filter by status, search by PO ID. Not mentioned; out of scope for v1.
- **Totals footer row inside Payables card** — not explicitly asked; planner may add if trivial (see Claude's Discretion).
- **Group-by-status sub-cards** (Option b from Discussion #3/visual format) — rejected; single-card layout chosen instead.
- **Per-line-item granularity** (Option b from Discussion #1) — rejected; entity-level rows chosen instead.

</deferred>

---

*Phase: 71-revamp-expense-modal-into-financials-modal*
*Context gathered: 2026-04-07*
