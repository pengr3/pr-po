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

## edit-mrf-modal-add-item-missing-cols — Add Item in Edit MRF modal silently inserts no row
- **Date:** 2026-04-08
- **Error patterns:** add item, edit MRF, modal, missing columns, qty, unit, category, remove button, tr, div, innerHTML, firstElementChild, tbody, foster parenting
- **Root cause:** The Add Item click handler used `document.createElement('div')` as a temporary container to parse the `<tr>` HTML string. Browsers apply foster-parenting rules and strip `<tr>` when injected into a `<div>` via innerHTML, leaving `tempDiv.firstElementChild` as null. The subsequent `tbody.appendChild(null)` was a silent no-op — no row was ever added.
- **Fix:** Changed the temp container from `document.createElement('div')` to `document.createElement('tbody')`. A `<tbody>` is a valid parent for `<tr>`, so innerHTML parsing correctly produces a `<tr>` as firstElementChild that can be appended.
- **Files changed:** app/views/mrf-form.js
---

## 73-3-pr-modal-supplier-missing-from-card — Supplier field missing from PR Details modal header card
- **Date:** 2026-04-15
- **Error patterns:** supplier, PR Details, modal, modal-details-grid, header card, missing field, visual omission, items table, column removed
- **Root cause:** The modal-details-grid in viewPRDetails() was never updated after Phase 73.3 removed Supplier from the items table — no Supplier detail-item was added to the header card, leaving supplier invisible in the modal.
- **Fix:** Added a modal-detail-item for Supplier (using pr.supplier_name with escapeHTML fallback to 'N/A') after the Total Amount entry in the modal-details-grid block inside viewPRDetails().
- **Files changed:** app/views/finance.js
---

