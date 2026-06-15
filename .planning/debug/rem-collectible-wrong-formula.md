---
status: investigating
trigger: "Rem. Collectible shows 0.00 even though Approved billing rows total more than what is shown as Collected. Everything Approved but only partial amount shows as Collected."
created: 2026-06-05T00:00:00Z
updated: 2026-06-05T00:00:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. The Financial Summary panel reads from the `collectibles` Firestore collection (Phase 85), but the billing rows displayed (COMPLETION/MILESTONE/MOB · Approved) are from the separate `billing_requests` collection (Phase 99). Approving a billing_request does NOT create a collectibles document automatically — Finance must manually open the Create Collectible modal after approval. Until that manual step is taken, no `collectibles` documents exist, so totalRequested=0, totalCollected=0, and remainingCollectible=0. The "Collected: 183k" showing in the screenshot is therefore from separately created collectibles records that only partially reflect the billing_requests, while the Approved billing_requests are entirely invisible to the formula.
test: Confirmed by reading the full code path — refreshExpense() queries `collectibles` collection; approveBillingRequest() opens the create-collectible modal but does NOT call submitCollectible() automatically.
expecting: N/A — root cause confirmed
next_action: DIAGNOSED — return structured report

## Symptoms

expected: Rem. Collectible = Contract Value - sum(amounts where billing_request is Collected/Paid). Approved billing requests that have not yet been paid in cash should still count as "filed/pending collection" not "remaining to bill".
actual: Screenshot shows COLLECTED: 183,163.20 and REM. COLLECTIBLE: 0.00, with 3 Approved billing rows totaling 183k+137k+45k = ~366k. Only 183k is Collected but Rem. Collectible shows 0.00 instead of the outstanding ~183k.
errors: No JS errors reported — purely a formula logic bug
reproduction: Open any project detail page that has multiple Approved billing requests summing to more than what has been paid
started: Unknown — likely since billing feature was introduced

## Eliminated

## Evidence

- timestamp: 2026-06-05T00:10:00Z
  checked: project-detail.js lines 1230-1249
  found: refreshExpense() queries the `collectibles` Firestore collection (not `billing_requests`) to compute totalRequested, totalCollected, and remainingCollectible. Collected = sum of non-voided payment_records inside collectibles docs. Rem. Collectible = totalRequested - totalCollected.
  implication: The Collected/Remaining math is entirely decoupled from the billing_requests collection.

- timestamp: 2026-06-05T00:11:00Z
  checked: project-detail.js lines 629-648 (renderOwnBillingRequests)
  found: The billing rows shown in the screenshot (COMPLETION · Approved, etc.) are rendered from currentBillingRequests, which is populated by a real-time listener on `billing_requests` collection. These rows sit BELOW the Collectibles summary panel but belong to a completely separate data path.
  implication: The user is seeing Approved billing_requests in the list, but the summary figures are computed from `collectibles` — there is no data bridge between the two.

- timestamp: 2026-06-05T00:12:00Z
  checked: finance.js approveBillingRequest() lines 1649-1663
  found: Approving a billing_request does two things: (1) opens the Create Collectible modal pre-filled, and (2) sets billing_requests.status = 'approved'. The comment explicitly states "Approve does NOT auto-create the collectible — Finance still sets the due date + submits" (D-12). submitCollectible() is only called if Finance manually submits the modal.
  implication: A billing_request in status='approved' does NOT guarantee a corresponding collectibles document exists. If Finance closes the modal without submitting, or if the collectible was created for only one tranche, the other Approved billing_requests have no collectibles counterpart.

- timestamp: 2026-06-05T00:13:00Z
  checked: finance.js submitCollectible() lines 1953-2028
  found: submitCollectible() writes to `collectibles` with amount_requested set from tranche percentage × contract_cost, and payment_records: []. No reference to billing_requests doc id is stored in the collectibles document.
  implication: Even when the workflow is followed correctly, there is no foreign-key link between billing_requests and collectibles, making it impossible to detect orphaned/unapplied billing approvals.

## Resolution

root_cause: The Financial Summary "Collected" and "Rem. Collectible" figures are computed exclusively from the `collectibles` Firestore collection (Phase 85 feature). The billing rows displayed below the summary are from the separate `billing_requests` collection (Phase 99 feature). Approving a billing_request only opens a pre-filled Create Collectible modal — it does NOT automatically create a collectibles document. If Finance closes that modal without submitting, or if any of the Approved billing_requests have no corresponding collectibles document, those billed amounts are completely invisible to the Collected/Remaining formula. The result: "Rem. Collectible" stays at 0.00 (because no collectibles docs = totalRequested 0 − totalCollected 0 = 0), or shows a partial/wrong balance, regardless of how many billing_requests have been approved.
fix: (diagnose only — no fix applied)
verification: (diagnose only)
files_changed: []
