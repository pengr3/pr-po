---
spike: 038
name: tranche-rebasing-model
type: comparison
validates: "Given approved VOs change the revised contract sum, when tranches are %-based, then compare A (auto-rebase all) / B (VO billed separately) / C (freeze billed + rebase remaining) against an already-billed Mobilization tranche — which model is non-destructive and matches CLMC billing"
verdict: PENDING
related: [035, 036, 037, 040]
tags: [variation-order, tranche, billing, rebasing, finance, comparison]
---

# Spike 038: Tranche Re-basing Model (A / B / C)

## What This Validates
This is the core financial fork of the whole VO feature — the user's "a change on the original contract cost and **tranche payments** of course." Given approved VOs move the Revised Contract Sum (from Spike 037), and `collection_tranches` are stored as **percentages** (peso amounts derived as `contract_cost × % / 100`), how should the tranche payments react? Three models are built side-by-side against a realistic scenario where the **first tranche is already billed and collected**, because that is exactly where the models diverge and where a naive choice does damage.

The user chose "build the comparison" — no model was pre-selected.

## Research

No external dependencies. Codebase facts that make this the high-risk spike:

- Tranche peso amounts are **never stored** — they are recomputed at render as `contract_cost × percentage / 100` everywhere (`project-detail.js:1016`, `procurement.js:1138/1569/1847`, finance collectibles, billing requests). So if the contract value the tranches read from changes, *every* derived amount changes silently — including tranches that have already been invoiced/collected.
- Collectibles (`COLL-xxx`) and billing requests capture the **amount at the time of billing** (services.js:1189 / projects.js:1111 already warn "Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches"). So the system *already has a precedent*: changing tranches must not retroactively re-price what's been billed.
- `retention_amount = contract_cost × retention_pct / 100`. A revised sum therefore also changes retention — each model handles this differently.

**The three models:**

| Model | Rule | Already-billed tranche | Retention | Verdict signal |
|-------|------|------------------------|-----------|----------------|
| **A — Auto-rebase all** | every `% × revised_sum` | **Reopened** — Mobilization jumps ₱840k→₱921k, a phantom ₱81k under-collection on a closed tranche | silently grows | simplest formula, **destructive** |
| **B — VO billed separately** | tranches frozen on original; net VO becomes its own collectible line | untouched | retention-on-VO is a separate question | clean, but **decouples** VO cash from milestones |
| **C — Freeze billed + rebase remaining** | locked tranches stay at invoiced amount; `(revised − Σfrozen)` redistributed across remaining tranches by original weight | **locked** at ₱840k ✓ | grows naturally on the remaining/retention tranches | **non-destructive**, milestone-aligned |

**The elegant demonstration (the toggle):** when *nothing* is billed yet, Model A and Model C are mathematically identical (frozen set is empty → C reduces to `% × revised`). The divergence appears *only* once a tranche is closed. The "Mobilization collected" toggle lets the user feel this directly — flip it off and A/C converge, flip it on and A reopens a settled tranche while C protects it. That gap is the entire argument.

**Worked numbers** (Original ₱4,200,000 → Revised ₱4,605,000, Δ +₱405,000; Mobilization collected at ₱840,000):
- **A:** 921,000 / 1,381,500 / 1,381,500 / 921,000 → Mobilization over-bills a closed tranche by 81,000.
- **B:** 840,000 / 1,260,000 / 1,260,000 / 840,000 **+ VO Settlement 405,000** (separate line).
- **C:** 840,000 (locked) / 1,411,875 / 1,411,875 / 941,250 — all reconcile to the revised 4,605,000.

## How to Run
```
python -m http.server 8000
# Open: http://localhost:8000/.planning/spikes/038-tranche-rebasing-model/spike.html
```

## What to Expect
- Context strip: Original → Revised (Δ) + the "Mobilization collected at ₱840,000" scenario.
- Three-button model switcher. Each model re-renders the tranche table with **Original → New amount → Δ badge**, a per-model callout explaining the tradeoff, and a footer reconciling the total to the revised sum.
- **Model A** tints the Mobilization row red with a "reopen" warning. **Model B** appends a blue "VO Settlement" collectible line. **Model C** locks Mobilization green and absorbs the VO into remaining tranches.
- Controls: toggle whether Mobilization is collected (feel A↔C convergence); "Log all-three compare" dumps every model's amounts to the log pane.

## Observability
Log pane: `switch` (model change, blue), `calc` (computed totals + reconciliation check, muted), `toggle` (collected flag, amber). Every model's footer asserts `total billable = revised ✓`.

## Investigation Trail
- Model A is the "obvious" implementation (just change `contract_cost`) — and it's exactly what the system does *today* via the field overwrite. Seeing it reopen a collected tranche makes concrete why VOs need a real model, not a field edit.
- Model B mirrors a real-world practice (VOs invoiced on their own progress claim) and is the cleanest to *implement* (no tranche recompute at all), but it splits a project's billing into two tracks and raises a fresh "is retention withheld on VO value?" question.
- Model C respects the existing "billed amounts are frozen" precedent already coded into the tranche-edit warnings — it feels like the natural extension of how the app already thinks about billed-vs-future tranches.
- Distribution-by-original-weight in C keeps the *relative* shape of the remaining schedule intact (a 30/30/20 tail stays 30/30/20 of the remaining value), which matches how a PM would intuitively re-spread.

## Results
Verdict: **PENDING** — awaiting browser review. This is the decision spike: which model becomes a requirement drives 039 (does approval recompute tranches?) and 040 (how much the financial card must show). Self-verified: all three reconcile to the revised sum; A↔C convergence when nothing is billed holds; the destructive case in A is real, not contrived.
