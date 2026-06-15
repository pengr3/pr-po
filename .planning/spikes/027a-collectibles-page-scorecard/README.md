---
spike: 027a
name: collectibles-page-scorecard
type: standard
validates: "Given N collectible docs shown in the Finance Collectibles tab, when a 3-chip scorecard strip (Total Invoiced / Cash Collected / Outstanding) is added above the table, then Finance reads aggregate financial health at a glance — and the strip reacts to filter changes"
verdict: PENDING
related: [026-financial-summary-revamp, 025-collectible-billing-footer-lifecycle]
tags: [collectible, scorecard, finance, ux, dashboard, aggregates]
verdict: VALIDATED
---

# Spike 027a — Collectibles Page Aggregate Scorecard Strip

## What This Validates

**Current state:** The Finance Collectibles page opens to a filter bar + table. Finance must mentally total up the Amount/Paid/Balance columns to understand collection health. No summary exists.

**Spike 026 validated** a scorecard strip inside the expense breakdown modal's Collectibles tab. That design hasn't been applied to the standalone Collectibles page.

**This spike validates:** Whether a 4-chip header strip (Total Invoiced / Cash Collected / Outstanding / Overdue) adds scannable value at the top of the standalone page — and whether it updates meaningfully when filters are applied.

## Research

No external dependencies. Pure HTML/CSS/JS demo using production data shape.

**Chips and formulas:**
| Chip | Formula | Color |
|---|---|---|
| Total Invoiced | `sum(coll.amount_requested)` for visible rows | Green (#059669) |
| Cash Collected | `sum(non-voided payment_records)` for visible rows | Blue (#0369a1) |
| Outstanding | Invoiced − Collected | Orange (#c2410c) |
| Overdue | Outstanding across rows where `due_date < today` | Red (#991b1b) — hidden when 0 |

The 4th chip (Overdue) was added for the full-page context — the modal didn't need it because it was already scoped to one project. For Finance viewing all projects, "how much is past due" is a distinct question worth surfacing.

**Key design choices from 026:**
- Chip colors use light background + colored border + dark text (not filled pills)
- Sub-label shows context: "5 collectibles", "31% of invoiced", "4 open items"
- Filter reaction: chips always reflect the currently-displayed rows (not the full dataset)

## How to Run

Open `.planning/spikes/027a-collectibles-page-scorecard/spike.html` in a browser.

## What to Expect

- Left panel: current design (no scorecard, table directly below filter bar)
- Right panel: revamped design with 4-chip scorecard strip + progress bar on each row status cell
- Filter by status or project — both panels sync, scorecards update
- Scenario switcher (bottom-left): "All 5 collectibles" / "Heavy overdue" / "All collected" / "Single project"
- Toggle button: show/hide the 4th Overdue chip (validate if it adds value or creates noise)

## Investigation Trail

**Iteration 1:** Built before/after comparison with reactive scorecard.

Notable decisions made during build:
1. **Progress bar added to rows in the "after" panel** — the before panel uses just a status badge. The progress bar (3px height, under the badge) adds visual weight without taking table column space. It's a secondary signal, not the primary.
2. **Overdue chip color:** Red was the natural choice but it creates alarm even when the amount is small. Considered amber but red is consistent with the existing `badge-overdue` in the table.
3. **Sub-labels are key:** "31% of invoiced" under Cash Collected tells Finance instantly if collection velocity is acceptable. Without the sub-label the chips are just raw numbers.
4. **Filter reaction:** When the "Fully Paid" filter is applied, Outstanding = ₱0 and Overdue = ₱0. The page correctly reads as clean. This confirms the reactive design is more valuable than static chips.

## Results

VALIDATED ✓ (2026-06-05) — 4-chip reactive scorecard confirmed; **Overdue chip kept** (adds value, not noise). Chips reflect currently-filtered rows, not the full dataset. Cleared for implementation into the Finance Collectibles tab in `app/views/finance.js`.
