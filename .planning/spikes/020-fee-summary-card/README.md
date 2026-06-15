---
spike: 020
name: fee-summary-card
type: standard
validates: "Given RFP fees are real project costs, when the modal summary loads, then adding a fee card or annotation in the header makes fee impact immediately scannable — or is it unnecessary noise?"
verdict: INVALIDATED — no header change needed; 019 accordion answers the question at the right level
related: [019-fee-row-variants]
tags: [ux, fees, expense-modal, summary, design]
---

# Spike 020: Fee Summary Card

## What This Validates

Given the expense modal header shows Budget / Remaining Budget (large) and Material Purchases / Transport Fees / Subcon Cost (small strip), when RFP fees exist, then adding fee visibility in the header may make the fee impact immediately scannable without drilling into the Payables tab.

## Research

No external deps — UI layout exploration. Three insertion points tested:
- A: 4th card in the summary strip (adds column, amber color)
- B: Annotation pill under Projected Cost card (minimal surface change)
- C: 3-card math narrative replacing the bottom 2-card layout (most radical)

## How to Run

```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/020-fee-summary-card/spike.html
```

## What to Expect

Variant switcher bar with Before / A / B / C. All "after" variants use Spike 019's accordion in Payables (the canonical row treatment). The difference is only in the header summary section.

## Investigation Trail

**Iteration 1:** Built Before state and three header variants:
- Before: fee invisible in header — must open Payables tab and click accordion
- A: 4th amber card in strip — immediately visible but adds a 4th element to a 3-item visual group; feels wedged in
- B: amber pill under Projected Cost — subtle, requires reading fine print
- C: Subtotal + Fees = Total Cost math story — cleanest narrative but restructures the entire bottom area; feels heavy for ₱600 in fees

**Discovery:** The accordion from spike 019 already creates a discoverable path to fees. The header is for high-level financial position (budget vs. cost vs. payable). Fees are a detail-level concern best surfaced in the detail-level tab where the user is already in "investigation mode."

## Results

**INVALIDATED — no header change needed.**

The Payables accordion (Spike 019 winner) answers the question at the right level of detail. Adding a fee card in the header:
- Promotes a detail-level concern to a summary-level position
- Clutters the header for the common case where projects have no fees at all
- The math is already shown correctly once you expand an accordion row

**Decision:** Leave the header unchanged. Ship Spike 019's accordion implementation only.
