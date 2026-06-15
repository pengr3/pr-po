---
spike: 027c
name: collectibles-table-redesign
type: standard
validates: "Given a Finance user opening the Collectibles tab, when the table is redesigned from 10 flat columns to 5 rich columns with urgency accents, collection progress bars, relative due dates, and last-payment indicators, then actionable items surface immediately without scanning every row"
verdict: VALIDATED
related: [027a-collectibles-page-scorecard, 027b-collectibles-billing-pipeline]
tags: [collectible, table, redesign, finance, ux, urgency, progress, dashboard]
---

# Spike 027c — Collectibles Table Redesign

## What This Validates

The current 10-column table surfaces data but communicates nothing about urgency or collection velocity. Finance must mentally compute relationships across three number columns, decode static date strings, and scan identical-looking rows to find what needs action.

**10 gaps identified:**
1. Three number columns (Amount / Paid / Balance) require arithmetic to understand status
2. Static due date — "2026-04-01" doesn't say "65 days overdue"
3. Overdue and Pending rows look nearly identical (badge color only)
4. No collection velocity — when did the last payment arrive?
5. Fully Paid rows clutter the active-work view
6. Dept column wastes a column — fits inline as a chip
7. No urgency hierarchy — critical overdue rows don't jump out
8. Banner only handles Ops-submitted pending requests, not the approved-not-filed gap
9. ID column dominates visually but is least actionable
10. No "near due" warning state — Finance can't see what's about to become overdue

## Research

No external dependencies. Design builds on established patterns:
- Urgency left-border accent: established in Spike 005 (unread notifications) — 4px colored border signals state without adding a column
- Progress bar: validated in Spike 027a as the right way to compress Amount/Paid/Balance
- Relative dates: standard finance dashboard pattern ("35 days overdue" vs "2026-05-01")
- Unified banner: extends Spike 027b Variant A to include both pending-from-ops AND approved-not-filed sections

## How to Run

Open `.planning/spikes/027c-collectibles-table-redesign/spike.html` in a browser.

## What to Expect

**Switcher at top:** Toggle "Before (10 cols)" vs "After (5 cols)"

**After design — 5 columns:**
1. **Project · Tranche** — project name + tranche label + COLL ID + dept chip merged into one cell
2. **Collection Progress** — 6px progress bar + "₱X collected of ₱Y · Z%"
3. **Due / Urgency** — "65 days overdue ‼" (red) / "Due in 5 days ⚠" (amber) / "Due in 40 days" (muted)
4. **Last Payment** — "₱1M · Jun 1, 2026 · Bank Transfer" or "No payments yet"
5. **Actions** — "Record Payment" (primary) + payment count chip / "View History" only for fully paid

**Urgency left-border accents (4px):**
- Critical (30+ days overdue): red #ef4444 + subtle red tint
- Overdue (1–29 days): orange #f97316 + orange tint
- Near due (≤7 days): amber #f59e0b + yellow tint
- Partially paid, not overdue: blue #3b82f6
- Pending / healthy: grey #e5e7eb
- Fully paid: green #059669, row de-emphasized

**Unified banner (two sections):**
- "Awaiting Your Review" (amber) — Ops-submitted billing requests, pending Finance approval
- "Approved — File as Collectible" (blue) — Finance-approved, COLL-xxx not yet created
Both sections are collapsible independently.

**Controls (bottom-left):**
- Scenario: Real mix / Crisis (4 overdue) / Mostly collected
- Banner: Both / Pending only / Approved only / None
- "Show/hide X completed" toggle at bottom of table (Fully Paid rows hidden by default)

## Investigation Trail

**Iteration 1:** Built the full redesign with before/after toggle.

Key design decisions made during build:

1. **4px left-border urgency accent** chosen over row background tinting alone. The border provides a scannable vertical signal even when rows wrap or the table is wide. Background tint is added as a secondary reinforcement only for the two most critical states (overdue + near-due).

2. **"Fully Paid" rows hidden by default** with a "Show N completed" toggle. The most important job of this page is showing what needs action. Fully Paid rows are archive, not action items.

3. **Progress bar color encodes urgency:** Blue = collecting normally, Red = collecting but overdue, Green = complete. The % chip below the bar uses the same color family so the message is redundant (reinforced, not contradicted).

4. **"No payments yet"** in muted italic is deliberately distinct from having a ₱0 value. Finance can see at a glance which overdue COLLs have never received a single peso vs which are partially collected.

5. **Last payment date + method** in one line. Method (Bank Transfer / Check / Cash) tells Finance the collection channel, which matters for reconciliation without opening the history modal.

6. **Actions column:** "Record Payment" is the primary button only for non-fully-paid rows. Fully paid rows get "View History" only — removes the temptation to accidentally add payments to completed items.

## Results

VALIDATED (2026-06-06) — user reviewed the redesign in-browser (Edge) and approved the 5-column layout, urgency left-border accents, collection progress bars, relative due dates, last-payment column, and fully-paid-hidden-by-default behavior. Cleared for implementation into `app/views/finance.js`.
