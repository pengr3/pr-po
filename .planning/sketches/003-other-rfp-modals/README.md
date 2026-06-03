---
sketch: 003
name: other-rfp-modals
question: "Does the winning progressive-fees + sectioned pattern fit the no-tranche Delivery-Fee and TR RFP modals, and should those collapse to a compact 3-section layout?"
winner: null
tags: [rfp, modal, fees, delivery-fee, transport, consistency]
---

# Sketch 003: Fees on the Delivery-Fee & TR Modals

## Design Question
Decision D-01 locked supplementary fees on **all 3 RFP types**, but sketch 001 only proved the pattern on the standard PO modal (which has a Tranche → Base mechanic). The Delivery-Fee and TR modals have **no tranche** — a single read-only base amount. Does the sectioned + progressive-fee pattern still fit, and is a compact (3-section) layout better for these simpler modals?

Grounded in the real code: `openDeliveryFeeRFPModal` (one-per-PO, base = fixed delivery fee) and `openTRRFPModal` (base = full TR amount), both `procurement.js`.

## How to View
open .planning/sketches/003-other-rfp-modals/index.html

Reveal fees with the chips; the live total works the same as sketch 001. Use the **view** toggle for mobile.

## Variants
- **A: Delivery-Fee, 4 sections** — keeps the same Reference → Base Amount → Fees → Payment structure as the PO modal; section 2 is just one read-only Delivery Fee line. Structurally consistent across all RFP types.
- **B: Transport (TR), 4 sections** — same structure; differs only in header, "TR Reference" label, and base = full TR amount. Confirms the pattern is type-agnostic.
- **C: Compact, 3 sections** — folds the single base amount into the Reference card as a prominent figure, dropping the standalone Base section. Tighter for these one-amount modals.

## What to Look For
- Does the 4-section structure feel **over-structured** when "Base Amount" is a single read-only line (A/B), making the compact C preferable for these modals?
- Cross-type consistency: should the PO modal (sketch 001) and these share the *exact* same shell, or is it fine for the simpler modals to use the compact variant?
- Semantics: does adding a **Transfer/Cash-out fee onto a Delivery Fee** read sensibly? (It does — the disbursement still incurs bank/cash-out costs.)
- Mobile: chips wrap and the single base line reads cleanly at 390px.
