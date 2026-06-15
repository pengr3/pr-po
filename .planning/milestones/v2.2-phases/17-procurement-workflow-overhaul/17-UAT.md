---
status: diagnosed
phase: 17-procurement-workflow-overhaul
source: 17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md
started: 2026-02-07T06:15:00Z
updated: 2026-02-07T12:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. PR Creator Attribution
expected: When you generate a PR from an MRF, the system captures your identity (the logged-in user who clicked the Generate PR button). When you view the PR Details modal, a "Prepared By" field displays your name (or "Unknown User" for old PRs created before this feature).
result: issue
reported: "prepared by displays 'Unknown User' in PR Modal"
severity: major

### 2. MRF Records Tab Name
expected: The tab that was previously called "PR-PO Records" is now renamed to "MRF Records" throughout the interface.
result: pass

### 3. MRF Records Table Structure
expected: The MRF Records table has 8 columns in this order: MRF ID, Project, Date Needed, PRs, POs, MRF Status, Procurement Status, Actions. The "PO Timeline" column has been removed (but the timeline button still exists in the Actions column).
result: pass

### 4. Color-Coded MRF Status Badges
expected: In the MRF Status column, you see color-coded badges showing workflow progress. Red "Awaiting PR" appears when no PRs generated yet. Yellow badges show partial progress like "0/2 PO Issued" or "1/2 PO Issued". Green badges show completion like "2/2 PO Issued". Transport requests show a dash (—) instead of status.
result: pass

### 5. Aligned PR-PO Display
expected: The PRs and POs columns are displayed side-by-side with vertical alignment so related PRs and POs line up visually in the same row.
result: pass

### 6. Supplier Links Removed from MRF Records
expected: In the MRF Records table, the PRs column shows only PR IDs (no supplier names), and the POs column shows only PO IDs with SUBCON badge if applicable (no supplier names). Supplier names are NOT clickable links in these columns.
result: pass

### 7. Supplier Purchase History Single Access Point
expected: Clicking a supplier name in the Supplier Management tab opens the purchase history modal showing all purchases from that supplier. This is the only place you can access supplier purchase history (not from MRF Records table).
result: issue
reported: "Basically i can click the suppliers and the console seems to be cooking something, but no modal appears"
severity: major

### 8. PR and PO View Buttons Still Work
expected: In the MRF Records table Actions column, clicking View button on PRs or POs opens the details modal showing complete information including supplier name (non-clickable).
result: pass

### 9. Timeline Button Accessibility
expected: In the MRF Records table Actions column, the Timeline button is still present and opens the procurement timeline modal showing MRF → PRs → POs → Delivered workflow.
result: pass

### 10. Timestamp Precision for PO Status
expected: When you update a PO status (Procuring, Procured, Delivered, Processing, Processed), the system captures millisecond-precision timestamps for efficiency measurement. This is not visible in the UI but ensures timeline accuracy for future analytics.
result: pass

### 11. Backward Compatibility
expected: Old PRs created before this phase show "Unknown User" in the Prepared By field instead of crashing or showing blank. All existing functionality continues to work.
result: pass

## Summary

total: 11
passed: 9
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "When you generate a PR from an MRF, the system captures your identity and displays your name in the Prepared By field"
  status: failed
  reason: "User reported: prepared by displays 'Unknown User' in PR Modal"
  severity: major
  test: 1
  root_cause: "Phase 17-01 implementation incomplete - user attribution fields (pr_creator_user_id, pr_creator_name) only added for NEW PRs, missing in rejected PR update path (lines 3086-3092) and approved PR merge path (lines 3109-3115)"
  artifacts:
    - path: "app/views/procurement.js"
      issue: "Lines 3086-3092: Rejected PR update missing pr_creator_user_id and pr_creator_name"
    - path: "app/views/procurement.js"
      issue: "Lines 3109-3115: Approved PR merge missing pr_creator_user_id and pr_creator_name"
  missing:
    - "Add pr_creator_user_id and pr_creator_name to rejected PR update path"
    - "Add pr_creator_user_id and pr_creator_name to approved PR merge path"
  debug_session: ".planning/debug/pr-creator-shows-unknown-user.md"

- truth: "Clicking a supplier name in the Supplier Management tab opens the purchase history modal"
  status: failed
  reason: "User reported: Basically i can click the suppliers and the console seems to be cooking something, but no modal appears"
  severity: major
  test: 7
  root_cause: "Modal HTML (#supplierHistoryModal) incorrectly placed inside #records-section (lines 333-343), which has display:none when Supplier Management tab is active. Parent's display:none prevents modal from being visible despite modal.active class"
  artifacts:
    - path: "app/views/procurement.js"
      issue: "Lines 333-343: supplierHistoryModal nested inside records-section instead of at section level"
  missing:
    - "Move supplierHistoryModal HTML outside all tab-specific sections (after line 344)"
  debug_session: ".planning/debug/supplier-modal-not-appearing.md"
