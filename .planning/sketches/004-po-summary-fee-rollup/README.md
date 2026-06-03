---
sketch: 004
name: po-summary-fee-rollup
question: "How should supplementary fees roll up across multiple RFPs into the PO Payment Summary / Financial Breakdown — a fee-inclusive total with a cue, or an explicit Base/Fees/Total breakdown?"
winner: null
tags: [rfp, payables, fees, po-summary, financial-breakdown, aggregate]
---

# Sketch 004: PO Summary / Expense Breakdown Fee Roll-up

# Design Question
SC #3 requires fees to surface in the **expense/financial breakdown**. Sketch 002 covered a single RFP row + detail; this is the **aggregate** view (`derivePOSummary` → PO Payment Summary / Financial Breakdown) where fees from multiple tranche RFPs roll up into a fee-inclusive **Total / Paid / Remaining**. How explicit should that roll-up be?

## How to View
open .planning/sketches/004-po-summary-fee-rollup/index.html

Hover the "incl. fees" cue (variant A) for the per-RFP breakdown; toggle **Phone** for the card layout.

## Variants
- **A: Fee-inclusive total + cue** — least disruptive: today's Total / Paid / Remaining tiles just become fee-inclusive, with a small "incl. ₱1,250 fees" note and the sketch-002 pill on fee-bearing sub-rows. Keeps the current layout; fees are a footnote.
- **B: Explicit Base / Fees / Total** — the header spells out `PO base + fees = total payable`, and the sub-table gains a dedicated **Fees** column. Most transparent for finance reconciliation; costs a column and a calc block (denser, more mobile pressure).

## What to Look For
- **Reconciliation clarity vs density:** does finance need the explicit Fees column (B), or is the fee-inclusive total + cue (A) enough at the PO level?
- Consistency with sketch 002 — A reuses the same "incl. fees" pill; B introduces a new column. Pick the one that keeps the system coherent.
- **Mobile:** B's extra column is the real stress test — check the Phone cards. A degrades more gracefully.
- Does "Total payable = PO base + fees" read correctly, and is "Remaining" obviously fee-inclusive?
- Edge: a not-yet-raised tranche row (shown muted in A) — does the projected total read sensibly before all RFPs exist?
