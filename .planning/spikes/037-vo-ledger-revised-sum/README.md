---
spike: 037
name: vo-ledger-revised-sum
type: standard
validates: "Given a project with an original contract_cost, when additive/omissive VOs are entered into a ledger, then the contract value reads 'Original → Revised (Δ ±)' and only Approved VOs move the revised sum (pending shown as projected)"
verdict: PENDING
related: [034, 035, 036, 038, 039, 040]
tags: [variation-order, contract, ledger, revised-sum, project-detail, finance]
---

# Spike 037: VO Ledger + Revised Contract Sum

## What This Validates
Given a project carries a single `contract_cost` (the original contract sum), when variation orders are recorded in a ledger and approved/rejected, then the contract value can be displayed as **Original → Revised (Δ ±)** without losing the original, and the **Revised Contract Sum = Original + Σ(approved VOs)** is derived cleanly. This is the foundational data model and primary readout the rest of the series (038 tranche impact, 039 approval, 040 placement) builds on.

## Research

No external dependencies — pure UX/logic against existing app mechanics. Domain framing and codebase facts:

- **The gap (confirmed in code):** the only path to change contract value today is overwriting the `contract_cost` field directly (`project-detail.js:711` inline edit → `saveField('contract_cost', …)`). That overwrite: (1) keeps no record of *why* (edit-history logs old→new value only; Phase 101 NOTIF-19 emits a one-line journal cost-delta), (2) has no +/- itemization, (3) has no approval or supporting document, and (4) silently re-bases every downstream peso amount.
- **Why downstream cares:** `collection_tranches` are stored as **percentages**; peso amounts are derived at render time as `contract_cost × percentage / 100` (`project-detail.js:1016`, `procurement.js:1138/1569/1847`, billing requests, collectibles). `retention_amount = contract_cost × retention_pct / 100` (`computeDlpFields`, `project-detail.js:918`). So any change to the contract value cascades into tranches **and** retention — which is exactly why 038 exists.
- **Construction domain:** a project is awarded at an **Original Contract Sum**. During construction, Variation Orders (a.k.a. Change Orders) add scope (**addition**, +) or remove scope (**omission**, −). The **Revised Contract Sum** = original + Σ of *approved* VOs. Proposed/pending VOs do not change the contract value but are useful to show as a *projected* figure. Rejected VOs never count.

**Proposed data model (project document, additive — no migration; Firestore schemaless):**
```javascript
{
  contract_cost: 4200000,            // UNCHANGED — stays the ORIGINAL contract sum
  variation_orders: [                // NEW array on the project doc
    { vo_no:'VO-001', description:'…', type:'addition'|'omission',
      amount: 180000,                // always positive; sign comes from type
      status:'draft'|'pending'|'approved'|'rejected',
      // 039 adds: doc_url/doc_kind/doc_filename, approved_by, approved_at, decided_reason
    },
  ],
  // revised_contract_sum is DERIVED at read time, not stored (mirrors how tranche
  // peso amounts and dlp state are derived, never persisted — see 036 getDlpState)
}
```

**Key decision surfaced:** keep `contract_cost` as the immutable original; derive the revised sum. This preserves the audit story (you can always see what the deal started at) and means VOs become the single explanation for any contract-value movement. The alternative — overwriting `contract_cost` and storing VOs as a side-log — was rejected: it reintroduces the silent-rebase problem this whole feature exists to kill.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/037-vo-ledger-revised-sum/spike.html
```

## What to Expect
A mock project-detail context (header + Contract Value card + VO ledger):
- **Contract Value hero:** Original ₱4,200,000 → Revised ₱4,605,000, with a Δ chip (+₱405,000) and a breakdown (+₱500,000 additions · −₱95,000 omissions · 3 approved VOs).
- **Projected strip (amber):** "Projected ₱4,865,000 if 1 pending VO is approved (+₱260,000)" — pending influence without committing it.
- **VO ledger:** 5 seeded rows (3 approved, 1 For Approval, 1 Rejected). Approved rows are full-opacity; non-approved are dimmed.

Key interactions:
1. **Click any status pill** to cycle Draft → For Approval → Approved → Rejected. The Revised Sum and Δ react only on the Approved transition; the log shows the before→after.
2. **Add a VO** (description + type + amount) → lands as **Draft** → revised sum *unchanged*, projected updates.
3. **Approve all pending** → watch the jump.
4. Add an **omission** and approve it → revised sum *decreases*.

## Observability
Dark log pane (bottom): `vo-add` (green) / `vo-status` (blue, includes revised before→after) / `recompute` (muted) / `reset` (amber). Confirms only Approved transitions move the revised sum.

## Investigation Trail
- Sign is derived from `type` (addition/omission), amount always stored positive — avoids ambiguous negative-amount entry and makes the ledger readable.
- Revised sum is computed, never stored — consistent with the established pattern that tranche peso amounts and DLP state are derived at render time (Spike 036). No `revised_contract_sum` field to keep in sync.
- The "projected if pending approved" line earns its place: during construction there are usually VOs in flight, and management wants the likely landing figure, not just the committed one.

## Results
Verdict: **PENDING** — awaiting browser review.

Self-verified: data model represents +/- VOs cleanly; revised sum = original + Σ(approved) derives correctly; pending/rejected correctly excluded; live recompute works. Open question for the user: is **Original → Revised (Δ)** the right headline framing for the financial card, or should the card lead with the Revised Sum and tuck "Original" into a tooltip? (040 will test placement in the real layout.)
