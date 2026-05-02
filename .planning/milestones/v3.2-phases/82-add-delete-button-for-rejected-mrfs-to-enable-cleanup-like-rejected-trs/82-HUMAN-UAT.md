---
status: partial
phase: 82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs
source: [82-VERIFICATION.md]
started: 2026-04-28T00:00:00Z
updated: 2026-04-28T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual button presence + confirm dialog text
expected: Clicking a soft-rejected MRF (status === 'Rejected') in MRF Processing left panel renders a red `🗑️ Delete MRF` button (btn-danger) at the right end of the action-button row, after the Reject MRF button. Clicking it opens a native confirm() dialog whose first line reads `Delete rejected MRF MRF-YYYY-NNN?` and whose second line reads `This will permanently delete the MRF and N linked PR(s), N PO(s), N TR(s). This cannot be undone.` with the actual cascade counts substituted.
result: [pending]

### 2. Re-render persistence across line-item edits
expected: With a rejected MRF still selected, editing any line item field (changing a category dropdown or clicking 'Add Line Item') keeps the `🗑️ Delete MRF` button visible after the action-buttons re-render. Validates the dual-site render — site #2 in `updateActionButtons` at procurement.js:3452-3454.
result: [pending]

### 3. End-to-end cascade against live Firebase
expected: Clicking `🗑️ Delete MRF` and confirming triggers a children-first cascade (prs → pos → transport_requests → mrfs). Firebase console shows (a) the MRF doc gone from `mrfs`, (b) every PR/PO/TR doc with matching `mrf_id` also gone, (c) NO new doc added to `deleted_mrfs`. Details panel resets to the 'Select an MRF...' placeholder and a success toast `MRF MRF-YYYY-NNN deleted (N PR / N PO / N TR cascaded).` appears.
result: [pending]

### 4. Negative eligibility for non-soft-rejected statuses
expected: Selecting an MRF with status === 'PR Rejected' (or 'TR Rejected' / 'Finance Rejected') does NOT show the Delete MRF button at initial render. Changing a line-item category does NOT cause it to appear after the re-render either. Validates D-03 strict eligibility at both render sites.
result: [pending]

### 5. Permission gate runtime behaviour
expected: Signed in as a user without procurement edit permission (e.g., finance role), if a Rejected MRF is selectable, clicking `🗑️ Delete MRF` shows the toast `You do not have permission to edit procurement data` and runs no Firestore deletion.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
