---
status: complete
phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs
source: [60-01-SUMMARY.md, 60-02-SUMMARY.md]
started: 2026-03-09T00:00:00Z
updated: 2026-03-09T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TR rejection does not change MRF status
expected: Go to Finance > Pending Approvals. Open a Transport Request and reject it (enter a reason, submit). After rejecting: check the parent MRF in Procurement — its status should still be "Approved". It must NOT change to "TR Rejected" or any other status. The MRF stays in its approved state.
result: pass

### 2. TR approval does not change MRF status
expected: Go to Finance > Pending Approvals. Open a Transport Request and approve it. After approving: check the parent MRF in Procurement — its status must NOT change to "Finance Approved". MRF status stays unchanged (Approved).
result: pass

### 3. Previously Rejected notice in Finance TR modal
expected: After a TR has been rejected once and then resubmitted by Procurement, open it again in Finance > Pending Approvals. The TR review modal should show a red "Previously Rejected" banner at the bottom showing the prior rejection reason, who rejected it, and the timestamp. Fresh TRs (never rejected) should show no such banner.
result: pass

### 4. PR rejection still cascades to MRF (unchanged)
expected: Go to Finance > Pending Approvals. Open a Purchase Request (not a TR) and reject it. The parent MRF should change to "PR Rejected" status in Procurement — this cascade behavior is intentional and must still work.
result: pass

### 5. Rejected TRs appear in Procurement's dedicated panel
expected: After Finance rejects a TR, go to Procurement > MRF Processing tab. The TR's parent MRF should NOT reappear in the Pending MRFs list. Instead, scroll down in the Pending Transportation Requests section — there should be a red "Rejected Transport Requests" sub-section showing the rejected TR card with its rejection reason and "Rejected by" info.
result: pass

### 6. Clicking rejected TR card shows details
expected: In the Procurement "Rejected Transport Requests" panel, click a rejected TR card. The right-side details panel should update to show the TR details: TR ID, rejection reason, rejected by, items table with quantities and costs, and a "Resubmit to Finance" button.
result: issue
reported: "there's no way to revise TR right now. Unlike MRFs you can directly revise it. kindly mirror how it works"
severity: major

### 7. Resubmit rejected TR to Finance
expected: In the Procurement rejected TR details panel, click "Resubmit to Finance" and confirm the dialog. The TR should disappear from the "Rejected Transport Requests" panel. In Finance > Pending Approvals, the same TR (same TR ID) should reappear in the pending list for re-review.
result: pass

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Clicking a rejected TR card shows an editable detail panel (mirroring MRF edit form) so Procurement can revise items before resubmitting"
  status: failed
  reason: "User reported: there's no way to revise TR right now. Unlike MRFs you can directly revise it. kindly mirror how it works"
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
