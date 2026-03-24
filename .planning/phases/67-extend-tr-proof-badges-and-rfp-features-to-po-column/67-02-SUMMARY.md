---
phase: 67-extend-tr-proof-badges-and-rfp-features-to-po-column
plan: 02
subsystem: payments
tags: [firebase, rfp, transport-requests, finance-payables]

requires:
  - phase: 67-01
    provides: rfpsByTR module-level state and getTRPaymentFill helper

provides:
  - Right-click RFP creation workflow for TR badges (showTRRFPContextMenu, openTRRFPModal, submitTRRFP, generateTRRFPId)
  - TR-linked RFP documents written to rfps collection with tr_id field, RFP-{TR-ID}-{n} ID format
  - Finance Payables guard: renderRFPTable shows TR ID when rfp.po_id is empty
  - buildPOMap groups TR-linked RFPs by tr_id (not blank string); isTR flag propagated to summary table
  - PO Payment Summary table displays TR IDs as plain text instead of clickable PO links

affects:
  - finance-payables
  - procurement-records

tech-stack:
  added: []
  patterns:
    - TR RFP functions mirror PO RFP pattern but fetch TR document from Firestore on demand (not from in-memory array)
    - isTR flag on poMap entries controls conditional rendering in renderPOSummaryTable
    - groupKey = rfp.po_id || rfp.tr_id || '' prevents empty-key grouping collision for TR-linked RFPs

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "openTRRFPModal and submitTRRFP fetch TR from Firestore on demand (not in-memory) because TRs are not pre-loaded into poData"
  - "TR RFPs use Full Payment tranche (100%) with no tranche selector — TRs have no tranche structure like POs"
  - "rfp.po_id set to empty string on TR RFPs to distinguish from PO RFPs in buildPOMap without schema breakage"
  - "buildPOMap groupKey = rfp.po_id || rfp.tr_id || '' prevents all TR RFPs collapsing under empty-string key"
  - "isTR flag propagated from buildPOMap through poEntries to renderPOSummaryTable row rendering for conditional link vs plain text"

patterns-established:
  - "TR RFP ID format: RFP-{TR-ID}-{n} (e.g. RFP-TR-2026-001-1) — scoped sequence per TR"
  - "Finance table guard pattern: rfp.po_id ? PO link : rfp.tr_id ? TR plain text : dash"

requirements-completed:
  - TRRFP-01
  - TRRFP-02
  - TRRFP-03

duration: 5min
completed: 2026-03-24
---

# Phase 67 Plan 02: TR RFP Context Menu and Finance Payables Guard Summary

**Right-click RFP creation for TR badges and Finance Payables rendering guard for TR-linked RFPs using isTR flag and conditional groupKey in buildPOMap**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-24T06:04:30Z
- **Completed:** 2026-03-24T06:08:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `generateTRRFPId`, `showTRRFPContextMenu`, `openTRRFPModal`, `submitTRRFP` to procurement.js — right-click on TR badges opens RFP creation modal
- TR RFP documents saved to rfps collection with `tr_id`, `tr_doc_id`, `po_id: ''`, `po_doc_id: ''` fields and `RFP-{TR-ID}-{n}` ID format
- Finance Payables `renderRFPTable` conditionally shows TR ID when `rfp.po_id` is empty, preventing blank cells
- `buildPOMap` uses `rfp.po_id || rfp.tr_id || ''` as grouping key and adds `isTR` flag to prevent TR RFPs from collapsing under empty string key
- PO Payment Summary table displays TR IDs as plain text instead of broken clickable PO links

## Task Commits

1. **Task 1: Add TR RFP context menu, modal, submission, and window function registration** - `2e7eecb` (feat)
2. **Task 2: Guard Finance Payables for TR-linked RFPs** - `506a5f5` (feat)

## Files Created/Modified

- `app/views/procurement.js` - Added generateTRRFPId, showTRRFPContextMenu, openTRRFPModal, submitTRRFP; registered TR RFP window functions; added oncontextmenu to both Transport-type and Material+TR mixed TR badges
- `app/views/finance.js` - Updated renderRFPTable PO Ref column, buildPOMap groupKey and isTR flag, renderPOSummaryTable isTR propagation and conditional refDisplay

## Decisions Made

- `openTRRFPModal` and `submitTRRFP` fetch TR from Firestore on demand rather than from in-memory data because `poData` only holds PO documents
- TR RFPs use a fixed "Full Payment" tranche (100%) with no tranche selector — TRs have no tranche structure
- `rfp.po_id` explicitly set to empty string on TR RFPs so Finance table can distinguish PO-linked vs TR-linked RFPs without a new schema field
- `buildPOMap` `groupKey = rfp.po_id || rfp.tr_id || ''` prevents all TR-linked RFPs (which have empty `po_id`) from grouping under the same blank key
- `isTR` flag propagated from `buildPOMap` through `poEntries` to `renderPOSummaryTable` so the row knows to render plain text instead of a PO detail link

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 67 plans 01 and 02 complete: TR proof badges, TR payment fill bars, and TR RFP creation are all functional
- Finance Payables correctly handles both PO-linked and TR-linked RFPs in both table views
- Ready for milestone completion or further extension to PO column

---
*Phase: 67-extend-tr-proof-badges-and-rfp-features-to-po-column*
*Completed: 2026-03-24*
