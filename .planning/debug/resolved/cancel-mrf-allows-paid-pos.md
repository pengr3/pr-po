---
status: awaiting_human_verify
trigger: "cancel-mrf-allows-paid-pos"
created: 2026-03-28T00:00:00Z
updated: 2026-03-28T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — cancelMRFPRs block check only inspects procurement_status; never queries rfps collection for payment_records
test: read full cancelMRFPRs function (lines 464-564) and deriveRFPStatus (lines 267-276)
expecting: add rfps queries for po_id and tr_id before the procurement_status block; compute payment totals using same arithmetic as deriveRFPStatus; block if any RFP has totalPaid >= amount_requested
next_action: apply fix to cancelMRFPRs in procurement.js

## Symptoms

expected: MRF cancellation should be BLOCKED when any linked PO has been paid (has RFPs with approved/paid status)
actual: MRF cancellation is allowed even when POs have been fully paid — user can delete PRs and restore MRF to In Progress despite money having already been disbursed
errors: No error shown — the cancel proceeds when it shouldn't
reproduction: Right-click an MRF ID in MRF Records where the MRF has POs with paid RFPs, click "Cancel MRF" — it allows cancellation
started: Just implemented Phase 70 cancel feature. The block check only considers procurement_status, not payment status.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-28T00:01:00Z
  checked: cancelMRFPRs function (lines 464-564)
  found: Block check at line 491-495 only inspects procurement_status against ['Procuring','Procured','Delivered','Processing','Processed']. No query to rfps collection anywhere in the function. At line 522-525, the function actually DELETES rfps unconditionally for pendingPOs — meaning a paid PO at 'Pending Procurement' status would have its RFPs silently deleted.
  implication: An MRF with POs that have disbursed payments can be cancelled and all evidence (RFP records) deleted

- timestamp: 2026-03-28T00:01:00Z
  checked: deriveRFPStatus (lines 267-276) and getPOPaymentFill (lines 283-314)
  found: Payment status is NOT stored in Firestore — it is always computed from payment_records array. A "Fully Paid" RFP has totalPaid >= amount_requested where payment_records entries with status !== 'voided' are summed. Same arithmetic used in finance.js deriveRFPStatus.
  implication: To check if any RFP is paid, must query rfps collection and apply the same arithmetic inline

- timestamp: 2026-03-28T00:01:00Z
  checked: TR RFP structure (lines 1182-1206)
  found: TR RFPs have tr_id set and po_id = ''. They are in the same rfps collection, queryable by where('tr_id', '==', tr.tr_id). The cancelMRFPRs function fetches TRs (line 476-478) but never checks their RFP payment status before deleting TRs at line 540-542.
  implication: TR payments are also unguarded — a fully-paid TR can be deleted during MRF cancellation

## Resolution

root_cause: cancelMRFPRs (procurement.js ~line 490) only blocked cancellation based on procurement_status. It never queried the rfps collection. Because RFP payment status is computed (never stored), there was no field to check — the function had a structural gap: it needed async Firestore reads of rfps documents plus inline arithmetic to detect paid amounts.

fix: Added two sequential guard loops immediately after the procurement_status block check (lines 497-529). Each PO's po_id is used to query rfps where po_id matches; each TR's tr_id is used to query rfps where tr_id matches. For each RFP document found, payment_records are summed (excluding voided entries). If any total > 0, cancellation is blocked with a specific message naming the paid PO or TR ID.

verification: (awaiting human verify)
files_changed: [app/views/procurement.js]
