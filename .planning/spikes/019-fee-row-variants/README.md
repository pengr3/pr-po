---
spike: 019
name: fee-row-variants
type: comparison
validates: "Given a PO row with RFP fees, when the Payables tab renders, then A (flat grey sub-rows) vs B (expandable accordion) vs C (fee chip + popover) — which makes fees transparent without cluttering clean rows?"
verdict: PENDING
related: []
tags: [ux, fees, payables, expense-modal, design]
---

# Spike 019: Fee Row Variants

## What This Validates

Given the expense modal's Payables tab now shows RFP fees (phase 91.4-uat), when a PO or TR has fees attached to its RFPs, then we want the optimal visual treatment that:
- Makes fee amounts transparent (explains why Total Paid > Total Payable on base-amount rows)
- Doesn't clutter the table for the majority of rows that have no fees
- Feels consistent with the existing modal design language

## Research

No external deps — pure UI pattern exploration. Three canonical patterns for progressive disclosure in tables:

| Approach | Pattern | Pros | Cons |
|----------|---------|------|------|
| Flat sub-rows (A) | Inline grey rows always visible | Zero interaction needed | Adds rows even when unimportant; grey = easy to miss |
| Accordion (B) | Click row to expand fee detail | Clean by default; fee detail on demand; shows fee-inclusive totals | Requires click discovery; toggle icon adds complexity |
| Chip + popover (C) | Inline pill → dark tooltip | Flat table; chip signals "there's more"; dark popover = pro feel | Popover can get clipped; requires click or hover |

## How to Run

```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/019-fee-row-variants/spike.html
```

## What to Expect

A sticky variant switcher bar (A / B / C) sits atop a realistic mock of the expense modal in Payables tab. Switch freely. The ACME Hardware Supply PO has ₱600 in fees (₱500 transfer + ₱100 cash-out):

- **Variant A:** Grey sub-rows always visible below the ACME row. Total Payable = 123 (base), Total Paid = 723. Fee rows explain the gap.
- **Variant B:** ACME row has a ▶ expand icon. Click to reveal fee detail with blue accent styling. Total Payable and Total Paid on the parent row updated to fee-inclusive 723.
- **Variant C:** ACME row has a "+₱600 fees" pill chip. Click it for a dark popover listing Transfer fee / Cash-out fee. Parent row shows fee-inclusive 723.

Metro Construction and FastTrack Logistics have no fees — same treatment in all variants to confirm non-fee rows are unaffected.

## Investigation Trail

**Iteration 1:** Built all three variants. Key design decisions made:

- **Variant B** makes totalPayable fee-inclusive (723 = 723) — the "where did ₱600 go?" question is answered by expanding, not by an apparent overpayment. This is more logically satisfying.
- **Variant C** also shows fee-inclusive totals for the same reason — the chip tells you there are fees, so the total being 723 makes sense.
- **Variant A** keeps the current base-amount totalPayable (123) — the grey sub-rows answer the question but the gap between 123 and 723 is still visually jarring.
- All variants are non-destructive to fee-free rows (Metro, FastTrack look identical).

**Discovery:** B and C both require the parent row's totalPayable to update to fee-inclusive. This is an additional code change beyond just the visual treatment — but a correct one (D-11 says getRFPTotal is the source of truth for payable math).

## Results

**VALIDATED ✓ — Variant B (accordion) wins.**

- Variant A: grey sub-rows are always visible and readable but the parent row's mismatched totals (123 payable, 723 paid) are still jarring even with the explanation rows below
- Variant B: accordion keeps the table clean for fee-free rows; click-to-expand reveals blue-accented fee detail; crucially, the parent row shows fee-inclusive totals (723 = 723) which is logically correct and satisfying
- Variant C: chip is elegant and ultra-flat, but the popover requires more precise clicking and can feel fragile on narrow rows

**Key implication for the build:** Variant B requires updating `totalPayable` in `deriveStatusForPO` / `deriveStatusForTR` to be fee-inclusive, not just the sub-row visual treatment. This is a correct fix per D-11 (getRFPTotal is the source of truth). The grey sub-rows committed in the debug session are the interim solution; the real fix is B.
