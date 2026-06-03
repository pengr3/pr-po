# Sketch Manifest

## Design Direction
Previews for **Phase 91.3 — RFP Fees** (add Transfer / Cash-Out / Miscellaneous fees at RFP creation). The aesthetic is locked to the **existing CLMC Procurement SPA** — these sketches reuse the live app's real modal markup, design tokens, and component styles (primary `#1a73e8`, sectioned form labels, `.form-control`, `.btn-primary`/`.btn-outline`, 12px modal radius). Goal: let the operator *see* what the overhauled RFP creation flow and downstream fee display will look like before any real code is written. Decisions are locked in `.planning/phases/91.3-rfp-add-fees/91.3-CONTEXT.md`.

## Reference Points
- The live app itself — `app/views/procurement.js` RFP modal (`openRFPModal`, line ~1102) and `app/views/finance.js` Payables tables.
- New fee accent: a subtle sky-blue (`#0ea5e9`) so fees read as *additive*, distinct from the red error/required color.

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | rfp-creation-modal | How should the new Fees section sit in the overhauled sectioned modal, and how should the live running total read? (incl. mobile 375px) | **B — Progressive disclosure** | rfp, modal, fees, form, mobile |
| 002 | downstream-fee-display | How should the "incl. fees" cue + breakdown read in the dense Payables table and the RFP detail modal? | **A — pill + tooltip** (needs touch fallback) | rfp, payables, fees, table, disclosure |
| 003 | other-rfp-modals | Does the progressive-fees pattern fit the no-tranche Delivery-Fee & TR modals; 4-section vs compact 3-section? | TBD | rfp, modal, fees, delivery-fee, transport, consistency |
| 004 | po-summary-fee-rollup | How should fees roll up in the PO Payment Summary / Financial Breakdown — fee-inclusive total + cue, or explicit Base/Fees/Total? | TBD | rfp, payables, fees, po-summary, aggregate |
| 005 | fee-edge-validation-states | How should fee controls behave in edge/error states (positive-only validation + existing blocked-RFP guards)? | behavior ref (no fork) | rfp, fees, validation, edge-states, behavior |
