---
spike: 025
name: collectible-billing-footer-lifecycle
type: standard
validates: "Given a project with billing_requests + collectible docs at various lifecycle stages, when the billing footer in the inline financial card renders, then each tranche shows its full lifecycle (pending→approved→not-yet-invoiced→invoiced→collecting→collected) with cash % visible — distinguishing 'approved on paper' from 'invoiced' from 'cash received'"
verdict: VALIDATED
related: [024-billing-request-flow]
tags: [collectible, billing, lifecycle, ux, project-detail, finance]
---

# Spike 025 — Collectible Billing Footer Lifecycle

## What This Validates

**Current state:** `renderOwnBillingRequests()` shows only the billing_request `status` (pending/approved/rejected). It has no awareness of whether a collectible doc (COLL-xxx) was created by finance from the approved request, nor how much cash has been received.

**Gap:** The lifecycle has 5+ stages but the UI shows only stage 1. A user sees "approved" and can't tell if the invoice was actually sent out or if cash is flowing.

**This spike validates:** An interactive per-tranche lifecycle row design that surfaces all stages cleanly in the compact footer space.

## Research

No external dependencies. Pure HTML/CSS/JS demo using production data shape.

**Key data sources cross-referenced:**
- `billing_requests` — filed by ops, holds `status` (pending/approved/rejected), `tranche_index`, `amount_requested`
- `collectibles` — created by finance, holds `tranche_index`, `amount_requested` (FROZEN), `payment_records[]`
- Cross-reference: both docs share `project_code` + `tranche_index`

**Lifecycle stages derived:**
| Stage | Condition | Badge |
|---|---|---|
| No request | billingStatus = 'none' | hidden (clean) |
| Pending | billingStatus = 'pending' | amber "Pending Review" |
| Rejected | billingStatus = 'rejected' | red "Rejected" |
| Approved, no COLL | approved + !collectibleExists | indigo "Approved — Not Yet Invoiced" |
| Invoiced, no payments | approved + collectibleExists + pct=0 | teal "Invoiced — Awaiting Payment" |
| Collecting | approved + collectibleExists + 0<pct<100 | orange + progress bar |
| Fully Collected | approved + collectibleExists + pct=100 | green "Fully Collected ✓" |

## How to Run

Open `.planning/spikes/025-collectible-billing-footer-lifecycle/index.html` in a browser.

## What to Expect

- Scenario builder with 3 tranches (Mobilization 20%, Progress 50%, Final 30%)
- Each tranche has sliders for: billing request status, collectible doc existence, % collected
- Left panel = current design (only shows billing_request status)
- Right panel = redesigned lifecycle rows with stage badges and cash progress
- Summary bar shows the money flow: Contract → Billed → Invoiced → Collected → Outstanding

## Investigation Trail

**Iteration 1:** Built before/after comparison with interactive controls.

Key findings:
1. The 3-chip layout (Billed / Invoiced / Cash Received) in the redesigned financial card makes the money flow readable at a glance. The current 2-chip (Collected / Rem. Collectible) is ambiguous — "Collected" sounds like it means something was collected but it's actually just cash received against collectible docs.
2. Per-tranche lifecycle rows are compact enough to fit in the existing card space — each row is ~36px. Three tranches = ~108px vs current plain list of ~24px/row.
3. The "Approved — Not Yet Invoiced" stage is the key missing state. Users need to know: "Finance approved it but haven't created the COLL-xxx yet." Currently invisible.
4. Unfiled tranches hidden by default (clean slate) — only filed/actioned tranches show. Good UX.

**Implementation concerns:**
- `renderOwnBillingRequests()` currently only reads `currentBillingRequests` (billing_requests listener). To show collectible state, it would need cross-reference with collectibles data.
- Two options: (a) add a collectibles listener scoped to project_code in `ensureBillingRequestsListener()`, or (b) query collectibles on-demand when billing footer renders.
- Option (a) is cleaner (real-time) but adds a listener. Phase 99 already added the billing_requests listener pattern — follow same pattern.

## Results

VALIDATED ✓

**Confirmed design:**
- 4 lifecycle stages: Not Filed (grayed) → Pending → Approved → Billed → Collected ✓
- All tranches always visible; unfiled rows grayed out at 45% opacity with dashed "— Not Filed" badge
- Partial payments (edge case) shown as a note under "Billed" badge, not a separate stage — because tranche amounts are pre-determined, full payment is the expectation
- 2-chip scorecard: "Collected" + "Outstanding" (formula unified to collectible docs, not billing_requests)
- "Full Breakdown →" button in card header (only entry point — no bottom link)
- "Initiate Billing →" retained at footer right
