---
spike: 027b
name: collectibles-billing-pipeline
type: comparison
validates: "Given approved billing requests not yet filed as COLL-xxx, when surfaced as: A (enhanced collapsible banner above table) vs B (ghost rows in the main table with a divider), then one approach makes the billing→COLL handoff more actionable for Finance without noise"
verdict: PENDING
related: [025-collectible-billing-footer-lifecycle, 026-financial-summary-revamp]
tags: [collectible, billing-requests, pipeline, finance, ux, ghost-rows, banner]
verdict: VALIDATED
---

# Spike 027b — Collectibles Billing Pipeline Visibility (Comparison)

## What This Validates

**The gap:** Once a billing request is approved by Finance, it opens a pre-filled Create Collectible modal (Phase 99 / `approveBillingRequest`). But if Finance approves and doesn't file the COLL immediately — or if they approve via the inline card on the project detail page — the Collectibles page has no way to see "what's been approved and is waiting to be filed."

**Current state:** A collapsible banner (`renderPendingBillingBanner`) shows pending (not yet reviewed) billing requests. This is a different state — it's the approval queue, not the "approved-but-not-filed" queue.

**The design question:** Should Finance see approved-but-not-filed billing requests as:
- **A:** A separate action section above the table (banner-style, enhanced from the existing pending pattern)
- **B:** Ghost rows at the bottom of the main table (same surface as COLLs, with a divider)

## Research

**Data shape for ghost rows:**
- Source: `billing_requests` where `status === 'approved'` AND no matching `collectibles` doc for same `project_code + tranche_index`
- Finance already subscribes to `billing_requests` via `brUnsub` in `initCollectiblesTab`
- Cross-referencing approved requests against `collectiblesData` is a simple `.find()` on `tranche_index + project_code`

**Approach A mechanics:**
- A second banner block separate from the existing pending banner
- Or replace the pending banner entirely (if the approve action opens the COLL modal immediately, "pending" never lasts long on the Finance side — only on the Ops side before Finance reviews)
- Label: "Approved — File as Collectible" vs "Pending Billing Requests"

**Approach B mechanics:**
- Ghost rows appended after real COLL rows with a divider: `--- Approved — awaiting COLL-xxx (N) ---`
- Ghost rows styled with lower opacity, italic ID placeholder, indigo "Approved" badge, "File COLL-xxx" button
- 4th scorecard chip: "Pending Pipeline" (indigo) shows total amount approved but not yet invoiced

## How to Run

Open `.planning/spikes/027b-collectibles-billing-pipeline/spike.html` in a browser.

## What to Expect

- Variant switcher at top: toggle between Variant A (banner) and Variant B (ghost rows)
- Both variants share the scorecard strip (with "Pending Pipeline" chip)
- Controls (bottom-left): set pending request count (0 / 2 / 4), add overdue row
- "File COLL-xxx" button shows an alert with the pre-fill context (production would call `window.openCreateCollectibleModal`)
- Try Variant B with 4 pending requests — does the table feel crowded? Does the divider separate cleanly?

## Investigation Trail

**Iteration 1:** Built full comparison with shared scaffolding.

Key observations:

**Variant A (banner):**
- Pro: Clear separation of concerns — the table is "real invoiced COLLs", the banner is "action queue"
- Pro: Consistent with the existing `renderPendingBillingBanner` pattern
- Con: Finance already has a pending banner above — two banners would require careful visual differentiation
- Con: Banner is easy to miss after Finance scrolls down past it

**Variant B (ghost rows):**
- Pro: Finance sees the full collection lifecycle in one surface — "these are my actual COLLs, and here's what's coming next"
- Pro: The "Pending Pipeline" scorecard chip reads naturally alongside the ghost rows
- Con: Mixing COLL docs and non-COLL rows in one table may confuse "what can I record payments for?"
- Con: At high pending counts (4+), the ghost section can feel heavy

**Key tension:** The existing pending billing banner handles *approval review* (pending → approved/rejected). Variant A would add a second banner for *post-approval action* (approved → file COLL). Two banners = cognitive load. Variant B avoids this by being table-native.

**Alternative not spiked:** A single unified banner that handles both states in one expandable section (pending rows + approved-not-filed rows, separated by a sub-header). This could be a third option if neither A nor B feels right.

## Results

VALIDATED ✓ (2026-06-05) — WINNER is neither pure A nor pure B, but the **unified banner** (the "Alternative not spiked" noted above): one collapsible block with **two sub-sections** — "Awaiting Your Review" (pending billing requests) + "Approved — File as Collectible" (approved, no COLL-xxx yet). Avoids the two-banner cognitive load of A and the mixed-row confusion of B. Sourced by reconciling `billing_requests(status='approved')` against `collectiblesData` on `project_code + tranche_index`. Cleared for implementation in `app/views/finance.js`.

**Note:** This surfaces a real silent orphan state in current Phase 99 code — `approveBillingRequest()` flips `status='approved'` *before* the COLL is created (D-12), so an abandoned create leaves an approved-but-unfiled request invisible on every screen. This banner section is its only recovery path.
