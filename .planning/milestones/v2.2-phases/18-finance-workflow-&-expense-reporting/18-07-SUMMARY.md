---
phase: 18-finance-workflow-&-expense-reporting
plan: 07
subsystem: finance-view
tags: [po-document, finance, document-generation, view-po]

dependency_graph:
  requires: [18-06]
  provides: [finance-view-po-document-generation]
  affects: []

tech_stack:
  added: []
  patterns:
    - "Function duplication for independent view access (finance.js mirrors procurement.js PO document functions)"
    - "createModal/openModal/closeModal pattern for dynamic prompt modals in finance view"

file_tracking:
  key_files:
    created: []
    modified:
      - app/views/finance.js

decisions:
  - id: "18-07-01"
    decision: "Duplicate PO document functions from procurement.js to finance.js (Option A from debug analysis)"
    rationale: "Avoids restructuring working procurement code into shared module; duplication is simpler and safer for independent finance access"
  - id: "18-07-02"
    decision: "Replace 'View in Procurement' broken link with 'View PO' button calling promptPODocument"
    rationale: "Finance users need direct PO document access without navigating to Procurement view"

metrics:
  duration: "~3 minutes"
  completed: "2026-02-08"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 18 Plan 07: Finance View PO Document Generation Summary

**One-liner:** PO document generation duplicated from procurement.js to finance.js with View PO button replacing broken "View in Procurement" link.

## What Was Done

### Task 1: Copy PO document generation infrastructure to finance.js
- Added `createModal`, `openModal`, `closeModal` import from `components.js`
- Added `DOCUMENT_CONFIG` constant with company info
- Added `generateItemsTableHTML()`, `generatePOHTML()`, `openPrintWindow()`, `formatDocumentDate()` helper functions
- Added `generatePODocument()`, `promptPODocument()`, `generatePOWithFields()` main functions
- All functions copied with Plan 18-06 fixes already applied:
  - Skip-prompt logic: if all 3 fields (payment_terms, condition, delivery_date) exist, generates directly
  - Left-aligned "Approved by" section (justify-content: flex-start)
- Registered window functions in `attachWindowFunctions()` and cleanup in `destroy()`
- **Commit:** a6d86e6

### Task 2: Replace "View in Procurement" button with "View PO"
- Replaced broken `window.location.hash='#/procurement/tracking'` button with `promptPODocument('${po.id}')` call
- Button text changed from "View in Procurement" to "View PO"
- Updated overflow text to remove Procurement reference
- **Commit:** 10472ec

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `promptPODocument` found in finance.js: function definition, skip logic, window attach, window delete, and button onclick -- PASS
2. "View in Procurement" NOT found in finance.js -- PASS
3. `createModal/openModal/closeModal` import present -- PASS
4. `DOCUMENT_CONFIG` constant present -- PASS
5. `payment_terms && po.condition && po.delivery_date` skip check present in promptPODocument -- PASS

## Key Files Modified

| File | Changes |
|------|---------|
| `app/views/finance.js` | +477 lines (PO doc infrastructure), +2/-2 lines (button replacement) |

## Architecture Notes

The PO document generation code is now duplicated between `procurement.js` and `finance.js`. This is intentional per the debug analysis (Option A: duplication over shared module). If these functions need updates in the future, both files must be updated. Consider extracting to a shared module if the duplication becomes a maintenance burden.
