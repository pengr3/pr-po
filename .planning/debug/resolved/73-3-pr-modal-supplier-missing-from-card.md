---
status: resolved
trigger: "73-3-pr-modal-supplier-missing-from-card"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Focus

hypothesis: The modal-details-grid in viewPRDetails() is missing a Supplier detail-item entry
test: Read finance.js viewPRDetails function and locate modal-details-grid block
expecting: Find the grid block and confirm supplier_name is not rendered there
next_action: Read finance.js around line 3345 to locate viewPRDetails and modal-details-grid

## Symptoms

expected: The PR Details modal header card (modal-details-grid) shows "Supplier: [supplier_name]"
actual: After Phase 73.3, Supplier is not shown anywhere in the PR Details modal (removed from items table, not added to header card)
errors: None — visual omission, not a JS error
reproduction: Open Finance tab → Pending Approvals → click "Review" on any Material PR → observe modal header card does not show Supplier field
started: Introduced in Phase 73.3 (commit fec5a51) which removed the Supplier column from the items table

## Eliminated

## Evidence

- timestamp: 2026-04-15T00:00:00Z
  checked: finance.js viewPRDetails() modal-details-grid block (lines 3423-3462)
  found: Grid contains PR ID, MRF Reference, Department, Requestor, Urgency Level, Date Generated, Delivery Address, Justification, Total Amount — no Supplier entry
  implication: Confirms the visual omission; pr.supplier_name is available on the pr object and just needs a detail-item added

## Resolution

root_cause: The modal-details-grid in viewPRDetails() was never updated after Phase 73.3 removed Supplier from the items table — no Supplier detail-item was added to the header card
fix: Add a modal-detail-item for Supplier after the Total Amount entry in the modal-details-grid block
verification: Fix applied and committed (797dcfb). The new detail-item renders pr.supplier_name with escapeHTML fallback to 'N/A'.
files_changed: [app/views/finance.js]
