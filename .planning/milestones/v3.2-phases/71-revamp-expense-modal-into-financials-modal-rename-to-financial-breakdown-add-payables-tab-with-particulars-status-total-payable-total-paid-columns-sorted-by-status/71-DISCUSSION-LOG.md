# Phase 71: Financial Breakdown Modal + Payables Tab - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 71-revamp-expense-modal-into-financials-modal
**Areas discussed:** Row Granularity, Status Taxonomy, Sort Order, Row Actions, Rename Scope, Visual Format

---

## 1. Row Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| (a) One row per payable entity | One row per PO, one row per TR, one row per Delivery Fee. Multi-tranche POs collapse into one row with tranche context in Status column. | ✓ |
| (b) One row per PO line item | Each SKU inside each PO becomes its own row. Denser, harder to track payment status at the line level. | |
| (c) Hybrid: one row per RFP-able unit | Multi-tranche POs split into one row per tranche. More precise but adds rows. | |

**User's choice:** Option (a)
**Notes:** Cleaner at-a-glance view; matches how RFPs are scoped throughout the app (per PO / TR / Delivery Fee). Payment status is tracked at entity level, not SKU level.

---

## 2. Status Taxonomy

### 2a. Status values and labels
| Option | Description | Selected |
|--------|-------------|----------|
| `Not Requested` / `Requested` / `Partial` / `Fully Paid` (default) | Four states with `{TrancheLabel} — NN% Paid` format for partial (Phase 65.3 parity) | ✓ |

**User's choice:** Accepted without objection.

### 2b. Multi-tranche PO handling
| Option | Description | Selected |
|--------|-------------|----------|
| (i) Show active tranche | Status reflects the tranche the user needs to act on next. Matches Phase 65.3 "Current Active Tranche" column. | ✓ |
| (ii) Show aggregate percentage | Overall `totalPaid/totalCost` percentage, ignoring tranche structure. | |
| (iii) Hybrid: active tranche + overall % | `50% Final — 50% Paid overall` | |

**User's choice:** Option (i) — "option 1"
**Notes:** Surfaces the next action; consistent mental model with Finance Payables.

### 2c. Delivery fee state subset
**User's choice:** 3-state subset (`Not Requested` / `Requested` / `Fully Paid`) accepted without objection. Delivery fees are single-shot per Phase 65.9.

### 2d. Non-voided payments only
**User's choice:** Accepted without objection. Consistent with Phase 69.1 Remaining Payable formula.

---

## 3. Sort Order

### 3a. Top-to-bottom status order
| Option | Description | Selected |
|--------|-------------|----------|
| (a) Action-needed first | `Not Requested` → `Requested` → `Partial` → `Fully Paid` | ✓ |
| (b) In-progress first | `Partial` → `Requested` → `Not Requested` → `Fully Paid` | |
| (c) Chronological | Sort by creation date, paid items still at bottom | |

**User's choice:** Option (a)
**Notes:** Reads as a worklist top-down; paid items pinned to bottom per original user instruction.

### 3b. Secondary sort within each bucket
| Option | Description | Selected |
|--------|-------------|----------|
| Amount descending | Biggest outstanding amount first | ✓ (recommendation accepted implicitly) |
| PO/TR ID ascending | Stable, predictable | |
| Creation date ascending | Oldest first | |

**User's choice:** Amount descending (Claude recommendation, not explicitly pushed back on).

---

## 4. Row Actions

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Read-only | No click handlers, no context menus. Users act via MRF Records or Finance Payables. | ✓ |
| (b) Click-to-view | Left-click opens the relevant details modal (PO/TR). | |
| (c) Full parity with MRF Records | Left-click + right-click context menu with RFP/cancel/payment actions. | |

**User's choice:** Option (a)
**Notes:** V1 is intentionally minimal — modal is an overview, not a workflow surface. Deferred to a future phase if usage data supports it.

---

## 5. Rename Scope — "Expense Breakdown" → "Financial Breakdown"

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Modal title only | Just change the `<h3>` at `app/expense-modal.js:341` | |
| (b) All user-visible strings | Modal title + button labels + context menus + tooltips + CSV filename. Internal symbols unchanged. | ✓ |
| (c) (b) + internal rename | Also rename function, DOM IDs, CSS classes, file path. | |

**User's choice:** Option (b)
**Notes:** Complete user-facing consistency with zero risk to existing callers. Internal rename deferred as cosmetic cleanup phase.

---

## 6. Visual Format Parity (added after initial gray area list)

Triggered by user's request: "Ensure the format is similar to the first two tabs."

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Single collapsible card | One `.category-card` wrapping the 4-column `.modal-items-table`. Card header: PAYABLES label + sum total. | ✓ |
| (b) Grouped by status | One card per status bucket, each with its own sub-table. Fragments the view. | |

**User's choice:** Option (a)
**Notes:** Matches the CIVIL card in the By Category tab. Reuses `.category-card`, `.category-items`, `.modal-items-table` CSS classes already in the codebase.

---

## Claude's Discretion

- Exact status cell styling (color/padding) — follow existing `.status-badge` or Row 3 scoreboard palette
- Third tab button position (before or after "Transport Fees")
- Active-tranche derivation reuse from Phase 65.3 Finance Payables code
- Optional totals footer row inside Payables card (add if trivial)

## Deferred Ideas

- Row actions on Payables tab (click/right-click) — future phase
- Internal symbol rename (`showExpenseBreakdownModal` etc.) — future cosmetic phase
- Status filter / search on Payables tab — not in scope
- Group-by-status sub-cards — rejected in favor of single card
- Per-line-item (SKU-level) granularity — rejected in favor of entity-level rows
