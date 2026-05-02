---
status: resolved
trigger: "delivery-fee-rfp-side-effects"
created: 2026-03-26T00:00:00Z
updated: 2026-03-26T12:00:00Z
---

## Current Focus

hypothesis: Both bugs confirmed by code inspection — proceeding with fixes.
test: Read and verified source code for both issues
expecting: Applying targeted fixes to procurement.js and finance.js
next_action: Fix Issue 1 (getPOPaymentFill excludes Delivery Fee RFPs) and Issue 2 (rfps onSnapshot triggers MRF Records re-render)

## Symptoms

expected:
  1. PO payment progress bar and current active tranche only account for po.total_amount (non-delivery-fee RFPs).
  2. Delivery fee dot updates immediately on modal close without page refresh.
actual:
  1. Delivery Fee RFP amount_requested is included in fill calculations, inflating payment totals.
  2. Dot stays red after submitting delivery fee RFP until manual refresh.
errors: None reported
reproduction:
  1. Submit a delivery fee RFP for a PO that has existing tranches. Observe fill bar changes.
  2. Submit a delivery fee RFP. Close the modal. Observe dot stays red.
started: After phase 65.9 delivery fee RFP feature was added.

## Eliminated

- hypothesis: Finance.js derivePOSummary uses rfpList including delivery fee RFPs, inflating totalAmount
  evidence: Finance.js D-10 comment says "Total Amount = sum of amount_requested across all RFPs" — but poTotalAmount param (from posAmountMap, which uses po.total_amount) overrides the sum when provided. The inflation is actually via totalPaid — all RFPs including Delivery Fee have their payment_records summed, and the "current active tranche" scan includes Delivery Fee RFPs as firstUnpaid candidates. Both are bugs.
  timestamp: 2026-03-26

## Evidence

- timestamp: 2026-03-26
  checked: procurement.js getPOPaymentFill (line 283-313)
  found: Iterates all rfps from rfpsByPO[poId] without filtering out tranche_label === 'Delivery Fee'. totalPaidAllRFPs accumulates delivery fee payments. totalRequested includes delivery fee amounts. allFullyPaid check includes delivery fee RFP. The "allFullyPaid" path returns 100% if ALL rfps (including delivery fee) are paid, even if regular tranches have balance.
  implication: Delivery fee payment amounts inflate the fill bar numerator; delivery fee RFP existence affects allFullyPaid check.

- timestamp: 2026-03-26
  checked: finance.js derivePOSummary (line 652-701)
  found: sorted = [...rfpList] includes Delivery Fee RFPs. firstUnpaid scan picks up Delivery Fee RFP as a candidate if it's unpaid, which shows it in the "Current Active Tranche" column. totalPaid sums payment_records across ALL rfps including delivery fee.
  implication: Delivery Fee RFP shows up as current active tranche; totalPaid is inflated by delivery fee payments.

- timestamp: 2026-03-26
  checked: rfps onSnapshot handler (line 5838-5859)
  found: After rebuilding rfpsByPO, handler checks for records-section.active and calls renderPOTrackingTable(poData). The MRF Records table (renderPRPORecordsTable) is NOT called. The dot lives in renderPRPORecordsTable (the MRF Records tab chips). PO Tracking table (finance tab) has its own separate dot rendering. The rfps onSnapshot correctly fires on Firestore write, but only re-renders the PO Tracking table, not the MRF Records chips.
  implication: submitDeliveryFeeRFP writes to Firestore -> rfps onSnapshot fires -> rfpsByPO updated -> renderPOTrackingTable called (wrong table) -> MRF Records chips (with delivery fee dot) not re-rendered.

## Resolution

root_cause:
  Issue 1: getPOPaymentFill iterates ALL rfps for a PO without excluding tranche_label === 'Delivery Fee', so delivery fee amounts inflate/affect the progress bar. finance.js derivePOSummary has the same problem — it includes Delivery Fee RFPs in sorted/firstUnpaid scan and in totalPaid sum.
  Issue 2: The rfps onSnapshot handler only calls renderPOTrackingTable (PO Tracking tab), not renderPRPORecordsTable (MRF Records tab). The delivery fee dot lives in the MRF Records chips. After a new delivery fee RFP is written, rfpsByPO updates but the records tab chips are never re-rendered.

fix:
  Issue 1: In getPOPaymentFill, filter out tranche_label === 'Delivery Fee' before iterating. In finance.js derivePOSummary, filter rfpList to exclude Delivery Fee before building sorted/firstUnpaid (for currentTranche computation) and before summing totalPaid.
  Issue 2: In the rfps onSnapshot handler, also check if the records section is active and call renderPRPORecordsTable() (or the appropriate refresh function) after rfpsByPO is rebuilt.

verification:
  - getPOPaymentFill: filter applied, confirmed Delivery Fee excluded from rfps array before iteration
  - derivePOSummary: regularRFPs filter applied, totalAmount fallback/totalPaid/overallStatus all use regularRFPs; sortedRFPs for sub-table still uses full rfpList
  - rfps onSnapshot: renderPRPORecords() added after renderPOTrackingTable when records section active
files_changed:
  - app/views/procurement.js (commits 38c93e3)
  - app/views/finance.js (commit 409f689)
