---
status: fixing
trigger: "Supplier purchase history modal doesn't appear when clicking supplier names"
created: 2026-02-07T12:00:00Z
updated: 2026-02-07T12:10:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED - Modal inside hidden section
test: Move modal HTML outside tab-specific sections
expecting: Modal will appear when clicked from any tab
next_action: Apply fix to procurement.js

## Symptoms

expected: Clicking supplier name in Supplier Management tab opens purchase history modal
actual: Console shows activity but modal doesn't appear
errors: None reported (but console is "cooking something")
reproduction: Navigate to Procurement → Supplier Management, click any supplier name
started: Unknown - regression after Phase 17-04

## Eliminated

## Evidence

- timestamp: 2026-02-07T12:01:00Z
  checked: showSupplierPurchaseHistory function (lines 402-485)
  found: Function exists, queries Firebase correctly, builds modal content HTML
  implication: Function logic is sound, Firebase queries work

- timestamp: 2026-02-07T12:02:00Z
  checked: Window function attachment (line 83)
  found: window.showSupplierPurchaseHistory = showSupplierPurchaseHistory
  implication: Function is accessible from onclick handler

- timestamp: 2026-02-07T12:03:00Z
  checked: Supplier Management table rendering (line 1939)
  found: onclick="window.showSupplierPurchaseHistory('${supplier.supplier_name}')" is present
  implication: Click handler is wired correctly

- timestamp: 2026-02-07T12:04:00Z
  checked: Modal HTML (lines 333-343)
  found: supplierHistoryModal HTML exists in render() output
  implication: Modal structure is defined

- timestamp: 2026-02-07T12:05:00Z
  checked: Modal CSS (components.css lines 514-530)
  found: .modal.active { display: flex; } - requires 'active' class
  implication: Modal shows when 'active' class is added

- timestamp: 2026-02-07T12:06:00Z
  checked: Function adds 'active' class (line 477)
  found: document.getElementById('supplierHistoryModal').classList.add('active')
  implication: Code correctly attempts to show modal

- timestamp: 2026-02-07T12:07:00Z
  checked: Modal HTML location in render() (lines 333-343)
  found: Modal is inside #records-section (MRF Records tab section)
  implication: Modal HTML is hidden when Supplier Management tab is active

- timestamp: 2026-02-07T12:08:00Z
  checked: Section visibility CSS (components.css lines 911-917)
  found: .section { display: none; } and .section.active { display: block; }
  implication: Parent section's display:none prevents modal from appearing

## Resolution

root_cause: Modal HTML (#supplierHistoryModal) is placed inside #records-section which has display:none when Supplier Management tab is active. Even though modal gets 'active' class and should display:flex, its parent section's display:none takes precedence, preventing the modal from being visible. Modal should be outside any tab-specific section since it's used from multiple tabs.

fix: Move supplierHistoryModal HTML outside of records-section (after closing </section> tags, before closing container </div>)

verification: Navigate to Supplier Management tab, click supplier name, verify modal appears

files_changed: [app/views/procurement.js]
