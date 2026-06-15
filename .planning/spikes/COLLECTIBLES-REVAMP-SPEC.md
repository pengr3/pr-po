---
title: Collectibles (Money-In) Revamp — Consolidated Spike Spec
source_spikes: [025, 026, 027a, 027b, 027c]
status: VALIDATED — ready for /gsd-phase --add + /gsd-plan-phase
created: 2026-06-06
target_files: [app/views/finance.js, app/views/project-detail.js, app/views/service-detail.js, app/expense-modal.js]
schema_change: none
depends_on: Phase 99 (billing_requests) — recommend closing first
---

# Collectibles (Money-In) Revamp — Consolidated Spec

Consolidates spikes **025 → 026 → 027a → 027b → 027c** (all VALIDATED) into one
implementation-ready contract. This is the input for `/gsd-plan-phase`.

## 1. What this delivers

A complete overhaul of how the system surfaces the **money-in (collectibles)
lifecycle** — billing a client per tranche, invoicing it as a COLL-xxx, and
collecting cash against it. The series makes one currently-invisible concept
visible across three screens: the **"approved but not yet invoiced"** state.

It splits across **two UI surfaces** (4 files; **no Firestore schema change**):

| Surface | Spikes | Files |
|---------|--------|-------|
| Project/Service detail — inline financial card + Full Breakdown modal | 025, 026 | `project-detail.js`, `service-detail.js` (parity), `expense-modal.js` |
| Finance standalone Collectibles tab | 027a, 027b, 027c | `finance.js` (+ new CSS) |

## 2. Shared vocabulary (must stay consistent across all screens)

| Term | Source | Meaning |
|------|--------|---------|
| **Billed** | `billing_requests.amount_requested` where `status='approved'` | What ops requested to bill the client |
| **Invoiced** | `collectibles.amount_requested` (FROZEN at creation, D-13) | What Finance actually invoiced as a COLL-xxx |
| **Collected** | sum of non-voided `payment_records[].amount` | Cash actually received |
| **Outstanding** | Invoiced − Collected | Open receivable |

Reconciliation key between the two collections: **`project_code + tranche_index`**
(both docs carry both fields → simple client-side `.find()`).

## 3. Surface 1 — Project/Service detail (025 + 026)

### 025 — Billing lifecycle footer
Replace `renderOwnBillingRequests()` (status-only) with **per-tranche lifecycle rows**:
- **4 stages, all tranches always visible:** Not Filed → Pending → Approved → Billed → Collected
- Unfiled tranches grayed at **45% opacity** with a dashed "— Not Filed" badge
- Partial payments shown as a **note under the Billed badge**, not a separate stage
- **2-chip** scorecard on the card: **Collected + Outstanding** (both sourced from collectible docs)
- "Initiate Billing →" retained at footer right

### 026 — Entry point + scorecards
- **Single "Full Breakdown →" button in the card header** that always refresh-then-opens
  (collapse the confusing `showExpenseModal` / `refreshAndShowExpenseModal` split into one)
- Remove the hidden click affordance on the "Projected Expense" number
- **Modal header strip — 5 chips:** Expense / Rem. Payable / Billed to Client / Invoiced (COLLs) / Cash Received
- **Modal Collectibles tab — 3 chips:** Total Billed / Cash Collected / Outstanding + a formula note
  + a **"awaiting COLL-xxx" ghost row** for approved-but-not-yet-invoiced tranches

## 4. Surface 2 — Finance Collectibles tab (027a + 027b + 027c)

### 027a — Aggregate scorecard strip
- **4 reactive chips** above the table: Total Invoiced / Cash Collected / Outstanding / **Overdue**
- Overdue chip **kept** (red, hidden when ₱0)
- Chips always reflect the **currently-filtered rows**, not the full dataset

### 027b — Approved-not-filed pipeline (the winning design)
- **Unified collapsible banner** with **two independent sub-sections:**
  1. "Awaiting Your Review" (amber) — `billing_requests` where `status='pending'`
  2. "Approved — File as Collectible" (blue) — `status='approved'` with **no matching collectible**
- Source #2 by reconciling approved `billing_requests` against `collectiblesData` on
  `project_code + tranche_index`. "File COLL-xxx" button → existing `openCreateCollectibleModal(preselectKey)`.

### 027c — Table redesign (10 cols → 5)
| Col | Content |
|-----|---------|
| Project · Tranche | name + tranche label + COLL id + dept chip merged |
| Collection Progress | 6px bar + "₱X of ₱Y · Z%" (color tracks urgency) |
| Due / Urgency | relative: "65 days overdue ‼" / "Due in 5 days ⚠" / "Due in 40 days" |
| Last Payment | "₱1M · Jun 1 · Bank Transfer" or "No payments yet" (italic) |
| Actions | Record Payment (non-paid) / View History (paid) |

- **4px urgency left-borders:** critical (30+ overdue, red) / overdue (1–29, orange) /
  near-due (≤7, amber) / partial (blue) / healthy (grey) / fully-paid (green, de-emphasized)
- **Fully-paid rows hidden by default** behind a "Show N completed" toggle

## 5. Implementation notes & gaps (from the gap pass)

- **Data backing — CONFIRMED, zero schema change.** `collectibles` (Phase 85) already has
  `amount_requested`, `payment_records[{amount,date,method,status}]`, `due_date`, `department`,
  `tranche_index`, `project_code`, `deriveCollectibleStatus()`.
- **New listener required (025):** the detail-page footer needs collectible state, not just
  `billing_requests` — add a `collectibles` listener scoped to `project_code` (follow the
  Phase 99 `billing_requests` listener pattern).
- **Mobile (027c):** collectibles is the **one Finance table Phase 73.1 skipped** — no card
  variant, no dedicated CSS (all inline). The redesign must add a ≤768px card layout AND a
  real CSS block (rich visuals: progress bars, urgency borders) rather than inline styles.
- **Build-time correctness:** "Last Payment" must filter `status !== 'voided'`; one shared
  "overdue" definition between 027a's chip and 027c's tiers; "hide fully-paid" must recompute
  pagination totals; decide whether CSV export follows the 5-col view or keeps all fields.

## 6. Dependency & sequencing

- **Close Phase 99 first.** 027b reads `billing_requests`, and the orphan state it surfaces
  (`approveBillingRequest()` flips `status='approved'` *before* the COLL exists, per D-12 —
  abandoned create = invisible request) is arguably a **Phase 99 completeness defect**. Either
  fold the "approved-not-filed" visibility into closing Phase 99, or own it in Surface 2.
- **Consider the UX risk:** Approve commits the status flip irreversibly with no undo path if
  the create is abandoned — make approve+create atomic, or guarantee the orphan stays visible.

## 7. Suggested phase breakdown (for /gsd-phase --add)

Given the 4-file / two-surface split, recommend **two phases** rather than one:
- **Phase α — Detail-page collectibles revamp** (025 + 026): `project-detail.js`,
  `service-detail.js`, `expense-modal.js` + new collectibles listener.
- **Phase β — Finance Collectibles page revamp** (027a + 027b + 027c): `finance.js` + new CSS
  + mobile card layout. Owns the approved-not-filed banner (unless folded into Phase 99 closure).

All work is **browser-UAT-gated** (zero-build, no test harness) — budget explicit UAT
scaffolding, especially for the approved-minus-filed reconciliation logic.
