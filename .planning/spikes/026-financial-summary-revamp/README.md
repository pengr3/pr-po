---
spike: 026
name: financial-summary-revamp
type: standard
validates: "Given the financial card's modal entry point is buried in the 'Projected Expense' chip and the modal lacks collectible scorecards, when we add (a) a dedicated 'Full Breakdown →' button to the card header and (b) scorecard chips at the modal top + collectibles tab top, then financial health is immediately readable without digging and the entry point is discoverable"
verdict: PENDING
related: [019-fee-row-variants, 020-fee-summary-card, 025-collectible-billing-footer-lifecycle]
tags: [financial-breakdown, entry-point, scorecards, collectible, modal, ux, project-detail, expense-modal]
---

# Spike 026 — Financial Summary Revamp (Entry + Scorecards)

## What This Validates

**Problems addressed:**
1. Modal entry point is non-obvious — only way in is clicking the Projected Expense number or 🔄 button
2. Modal has no summary scorecards for collectibles (jumps straight into a table)
3. Balance formula source mismatch: inline card uses billing_request amounts; modal uses collectible doc amounts — could diverge if finance adjusts the figure

## Research

**Balance formula audit (critical):**
- `billing_requests.amount_requested` = what ops requested to bill (frozen at submission)
- `collectibles.amount_requested` = what finance invoiced (FROZEN at collectible creation, D-13)
- `collectibles.payment_records` = actual cash received

**Current inline card formula:**
```
remainingCollectible = sum(billing_requests.amount_requested WHERE status='approved') - sum(payment_records)
```

**Current modal formula:**
```
balance = collectible.amount_requested - sum(payment_records)
```

**Finding:** These diverge if finance creates a collectible for a different amount than the billing request (e.g., billing request = ₱500k, finance invoices ₱480k due to adjustment). The inline card would show ₱500k billed, the modal shows ₱480k invoiced — different. Not a bug but potentially confusing.

**Recommendation:** Keep both formulas but surface both numbers. Inline card: show "Billed" (billing_requests) AND "Invoiced" (collectibles). This makes the distinction explicit.

## How to Run

Open `.planning/spikes/026-financial-summary-revamp/index.html` in a browser.

## What to Expect

**Left panel:** Current financial card — Projected Expense chip is the only entry point (click number or 🔄)
**Right panel:** Redesigned financial card — "Full Breakdown →" button in header; also "📊 Full Breakdown" link in footer; 3-chip collectibles row (Billed / Invoiced / Cash Received)
**Modal:** Click "Full Breakdown →" to open — shows scorecard strip at top of modal + scorecard chips at top of Collectibles tab + balance formula explanation

## Investigation Trail

**Iteration 1:** Built interactive before/after with working modal.

**Findings on entry point:**
- The `window.showExpenseModal` + `window.refreshAndShowExpenseModal` split is confusing — one shows stale data, one refreshes first. A single "Full Breakdown →" button should always refresh then show (the refresh takes ~300ms, not perceptible).
- Removing the click affordance from "Projected Expense" chip is a win — it was invisible (only the pointer cursor hinted at it).
- Best placement: right side of the "Financial Summary" card header. Consistent with how Phase 86.x handled action links in card headers.

**Findings on modal scorecards:**
- Spike 020 INVALIDATED a header fee card. But collectibles are different — they're revenue (inflow), not costs (outflow). A scorecard that shows Billed / Invoiced / Cash Received is a different signal than "total fees". 
- The 5-chip modal header scorecard (Expense / Rem. Payable / Billed / Invoiced / Received) is dense but scannable — each chip is a different color family.
- The per-tab collectibles scorecard (3 chips) is more focused and easier to justify.

**Findings on balance formula:**
- Inline card: use `billing_requests.amount_requested` (approved) as "Billed" — tells ops team how much they requested
- Modal collectibles tab: use `collectibles.amount_requested` as "Invoiced" — tells finance what was actually sent
- Both correct for their audience. The mismatch is a feature, not a bug, IF both are labeled clearly.
- Key: add an explanatory note in the modal (already in spike HTML).

## Results

PENDING — browser verification needed.
