---
status: awaiting_human_verify
trigger: "mrf-tr-cancel-no-actions"
created: 2026-03-28T00:00:00Z
updated: 2026-03-28T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Two root causes found
test: Traced all MRF status values set by generatePR, generatePRandTR, submitTransportRequest
expecting: n/a — root cause confirmed, applying fix
next_action: Fix showMRFContextMenu to include 'PR Submitted' and 'TR Generated' (if applicable); fix cancelMRFPRs to also cancel TRs

## Symptoms

expected: Right-clicking MRF-2026-010 (Transport Request type) should show "Cancel PRs" action since it has PR and TR generated
actual: Shows "No actions available" — context menu treats MRF as having no cancellable state
errors: None — logic bug, not a crash
reproduction: Right-click any Transport Request type MRF ID in MRF Records that has PRs/TRs generated
started: Just implemented Phase 70 (Cancel PRs feature). Works for Material MRFs, not Transport MRFs.

## Eliminated

- hypothesis: Transport MRFs use 'TR Generated' status
  evidence: No such status exists in the codebase. submitTransportRequest() does NOT update MRF status at all (line 5275 comment: "do NOT change MRF status"). generatePRandTR() sets status to 'PR Submitted' (not 'PR Generated').
  timestamp: 2026-03-28

## Evidence

- timestamp: 2026-03-28
  checked: showMRFContextMenu (line 425-457)
  found: cancellableStatuses = ['PR Generated', 'Finance Approved', 'PO Issued'] — only 3 values
  implication: Any MRF with a different status shows "No actions available"

- timestamp: 2026-03-28
  checked: generatePR() line 5555
  found: Sets mrf.status = 'PR Generated' — this IS in cancellableStatuses
  implication: Pure Material MRFs (generate PR only) work correctly

- timestamp: 2026-03-28
  checked: generatePRandTR() line 5889
  found: Sets mrf.status = 'PR Submitted' — this is NOT in cancellableStatuses
  implication: MRFs that used generatePRandTR (mixed material+transport) show "No actions available"

- timestamp: 2026-03-28
  checked: submitTransportRequest() line 5275-5281
  found: Does NOT update mrf.status at all — only updates tr_id and items_json
  implication: Pure Transport MRFs keep their pre-submission status (e.g. 'Pending', 'In Progress', 'Approved') — these also won't match cancellableStatuses

- timestamp: 2026-03-28
  checked: cancelMRFPRs() line 464-543
  found: Only fetches/deletes prs collection, then sets mrf.status = 'In Progress'. Does NOT fetch or delete transport_requests.
  implication: Even if context menu shows the option, cancellation for MRFs with TRs would leave orphan TR documents in transport_requests collection

## Resolution

root_cause: Two issues: (1) cancellableStatuses in showMRFContextMenu does not include 'PR Submitted' (the status set by generatePRandTR), so MRFs with both PR+TR never show the cancel option. (2) cancelMRFPRs does not cancel/delete TRs linked to the MRF, leaving orphan documents if triggered.
fix: (1) Added 'PR Submitted' to cancellableStatuses array (line 432). Renamed menu label to "Cancel PRs / TRs". (2) Updated cancelMRFPRs to fetch transport_requests by mrf_id and delete them alongside PRs. Updated empty-check to cover both PRs and TRs. Updated confirm dialog messages to include TR counts. Restored MRF with tr_id: null to clear the TR link. Updated local state to clear tr_id. Updated toast message to reflect actual docs deleted.
verification: awaiting human verification
files_changed: [app/views/procurement.js]
