# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## delivery-fee-rfp-side-effects — Delivery Fee RFPs inflate payment fill bar and dot does not update live
- **Date:** 2026-03-26
- **Error patterns:** delivery fee, RFP, progress bar, fill, dot, tranche, payment, onSnapshot, re-render, rfpsByPO
- **Root cause:** (1) getPOPaymentFill and finance.js derivePOSummary iterated all RFPs for a PO without excluding tranche_label === 'Delivery Fee', so delivery fee amounts inflated the fill bar and polluted the current-active-tranche calculation. (2) The rfps onSnapshot handler only called renderPOTrackingTable (PO Tracking tab) and did not call renderPRPORecordsTable (MRF Records tab), so the delivery fee status dot in MRF Records chips never refreshed after a new delivery fee RFP was written.
- **Fix:** (1) Filter out tranche_label === 'Delivery Fee' in getPOPaymentFill before iterating, and apply the same regularRFPs filter in derivePOSummary for totalPaid and firstUnpaid scan. (2) In rfps onSnapshot, also trigger renderPRPORecords() after rfpsByPO is rebuilt when the records section is active.
- **Files changed:** app/views/procurement.js, app/views/finance.js
---

## duplicate-tranche-name-rfp-blocked — Filing RFP for one tranche blocks duplicate-named tranche
- **Date:** 2026-03-27
- **Error patterns:** RFP, tranche, duplicate, label, progress billing, blocked, disabled, usedTrancheLabels, Set, deduplication
- **Root cause:** openRFPModal() built a Set of tranche_label strings from existing RFPs (usedTrancheLabels) and disabled any tranche option whose label was in that Set. Two tranches with the same label (e.g., two "Progress billing" at 30% each) are indistinguishable by name alone, so filing the first caused the second to appear as already filed and get disabled.
- **Fix:** Changed deduplication to use tranche_index (0-based position) instead of label. In openRFPModal(), usedTrancheIndices is built from r.tranche_index on existing RFPs, with a legacy fallback for old RFPs lacking the field (label-based first-match). In submitRFP(), added tranche_index: idx to the rfpDoc written to Firestore so future deduplication uses position.
- **Files changed:** app/views/procurement.js
---

