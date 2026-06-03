---
sketch: 002
name: downstream-fee-display
question: "How should the 'incl. fees' cue + breakdown read in the dense Payables table, and the full itemization in the RFP detail modal?"
winner: "A"
tags: [rfp, payables, fees, table, disclosure]
---

> **Winner: Variant A — "incl. fees" pill + tooltip.** Keeps the dense table single-line; pill signals fee-bearing totals with a hover breakdown. Full itemization still lives in the RFP detail modal (locked).
>
> **⚠ Open question for planning — touch fallback:** the hover tooltip doesn't fire on mobile/touch, but Phase 91.3 must be mobile-friendly (SC #4). On touch, the pill should either tap-toggle the tooltip or fall back to opening the RFP detail modal. Resolve during UI planning.

# Sketch 002: Downstream Fee Display

## Design Question
Locked decision (91.3-CONTEXT D-06/07/08): dense Finance Payables tables/cards show a **collapsed fee-inclusive total** with a **subtle "incl. fees" cue**, while the **full itemization lives in the RFP detail modal**. This sketch tests *how* the table cue should behave and confirms the detail-modal breakdown.

## How to View
open .planning/sketches/002-downstream-fee-display/index.html

Toggle **Phone** (bottom-right) to see the mobile card rendering. Click an RFP ID (or the cue/info control) to open the detail modal with the full itemization.

## Variants
- **A: Pill + hover tooltip** — a small "incl. fees" pill sits next to fee-bearing totals; hovering reveals a compact breakdown tooltip. Table stays single-line; quick peek without leaving the row.
- **B: Inline expandable** — a ▸ caret on fee-bearing rows expands an inline sub-row with the itemized breakdown. No modal needed for a quick check; adds row height when opened.
- **C: Info icon → detail modal** — table shows the total + a small ⓘ that opens the canonical RFP detail modal. Cleanest table; routes all detail to one place.

The **RFP detail modal** (shared, bottom of file) shows the full itemization — Base → Transfer fee → Cash-out fee → Grand total `incl. fees`, plus Paid / Remaining — and is the same in every variant (that itemization location is locked).

## What to Look For
- Which cue is **least noisy** in the dense table yet still signals "this total includes fees"?
- **Discoverability vs clutter:** is the hover tooltip (A) discoverable enough, or is the explicit ⓘ (C) / caret (B) clearer?
- **Mobile (Phone):** how does each cue degrade into the card layout where hover doesn't exist? (Note A's tooltip is hover-only — weak on touch.)
- Does the collapsed total + cue read correctly against the status pills (Partially Paid / Pending / Fully Paid) without competing?
