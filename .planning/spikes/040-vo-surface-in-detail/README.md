---
spike: 040
name: vo-surface-in-detail
type: standard
validates: "Given the VO ledger + revised-sum readout + approval actions, when placed in the real project-detail layout (financial card / lifecycle accordion / dedicated card), then placement feels natural without overloading the financial card"
verdict: PENDING
related: [031, 035, 036, 037, 038, 039]
tags: [variation-order, project-detail, layout, placement, ux, integration]
---

# Spike 040: VO Surface Placement in Project-Detail

## What This Validates
037–039 proved the VO *mechanics* (ledger, revised sum, billing model, approval). This integration spike answers *where it lives* in the real project-detail page without breaking the layout that Spikes 008/031/035/036/101 already established. The risk: the Financial card is already the busiest card on the page (finance bar + tranches + billing footer + the just-shipped Phase 102 DLP states). Bolting a VO ledger onto it could tip it into overload.

## Research

No external dependencies — this is layout/feel against the known project-detail structure:

- **Established layout (Spikes 008, 031, 101):** header strip → lifecycle accordion (above) → 2-col **Info | Financial** → bottom row (Project Journal: Feed/Progress/Issues). The spike reproduces this faithfully.
- **Financial card load today:** `renderDlpFinanceBar` (4-state bar), `renderTrancheDisplay` (tranche list), the billing footer (Phase 99/99.1 collectible lifecycle), and the inline tranche editor (Phase 102). It is already tall.
- **Lifecycle accordion (Spike 031):** a collapsible command-center; On-going is the current node. VOs are literally an On-going construction-phase activity, so this is a conceptually defensible home.

**Three placements built:**

| Placement | Pro | Con |
|-----------|-----|-----|
| **Inside Financial card** | contract value + tranches + billing + VOs in one money place | makes the already-heavy Financial card the tallest, busiest thing on the page |
| **In Lifecycle accordion** | matches the mental model (VOs are an On-going activity); inside the command-center | financial impact hidden behind a collapsed accordion, away from the money |
| **Dedicated VO card (bottom row)** | room for the full ledger + revised-sum headline; one clear home; peer to Journal | revised-sum delta is one card away from the Financial card — mitigated by echoing "(revised)" in the finance bar |

**Cross-cutting detail surfaced:** wherever the VO module lives, the **finance bar should read the revised sum** once VOs exist (the dedicated-card option labels it "Contract Cost (revised)"), and the tranche list should note "on revised ₱4.605M". So even with a separate card, the financial card cannot stay naïve about VOs — it must consume the revised sum. This is the integration contract between the VO surface and the existing finance display, and it ties straight back to the 038 model choice.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/040-vo-surface-in-detail/spike.html
```

## What to Expect
The real project-detail layout (header + lifecycle accordion + Info|Financial + Journal) with a 3-button placement switcher on top. Each option drops the **same VO module** (revised-sum headline, 3 recent VO rows, New VO / Manage buttons) into a different location and annotates the tradeoff:
- **Inside Financial card** → VO ledger appended under the tranches; feel how tall/busy the card gets; finance bar shows the *original* contract cost (the tension).
- **In Lifecycle accordion** → accordion auto-expands; VO module sits under the On-going node; note the money story is now hidden when the accordion is collapsed.
- **Dedicated VO card** → a new bottom-row card; finance bar switches to "Contract Cost (revised)" and tranches note "on revised ₱4.605M".

## Observability
Log pane: `switch` (placement change, blue), `info` (current placement, muted). The spike is primarily about *feel*, so the observable is the rendered layout itself, not event volume.

## Investigation Trail
- The Financial card is genuinely close to overloaded already (Phase 102 just added DLP). Stacking the VO ledger inside it is the most "logical" spot on paper but the worst on the page.
- The lifecycle-accordion option reads well conceptually but buries the contract-value change — the one thing management most wants visible — behind a click.
- The dedicated card keeps each card single-purpose (Financial = current money state; VO = contract-value changes; Journal = activity) and gives the ledger room to grow, at the cost of a one-card hop. Echoing the revised sum in the finance bar closes most of that gap.
- Whatever wins, the finance bar + tranche display must consume the **revised** sum (not original) once VOs exist — confirming the 038 model is a hard dependency of this surface, not just a billing detail.

## Results
Verdict: **PENDING** — awaiting browser review. Self-verified: all three placements render in the real layout; the VO module is reusable across them; the finance-bar/tranche "revised sum" coupling is visible. Open question for the user: dedicated card (recommended for breathing room + single-purpose cards) vs inside-Financial (everything-money-together) — to be decided in browser.
