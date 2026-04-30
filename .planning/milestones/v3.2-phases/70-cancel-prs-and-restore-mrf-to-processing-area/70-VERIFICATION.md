---
phase: 70-cancel-prs-and-restore-mrf-to-processing-area
status: passed
verified: 2026-04-20
verified_by: claude
---

# Phase 70 Verification: Cancel PRs and Restore MRF

## Requirements Verified

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PRCANCEL-01 | passed | `showMRFContextMenu(event, mrfDocId, mrfStatus)` at procurement.js:589-611 shows right-click menu on MRF ID with "Cancel PRs" option for MRFs with PR Generated status |
| PRCANCEL-02 | passed | SIMPLE cancel path at procurement.js:731-737 deletes linked Pending/Rejected PRs and restores MRF status to `'In Progress'` at lines 749-755 |
| PRCANCEL-03 | passed | FORCE-RECALL path at procurement.js:707-730 voids POs to Cancelled status and deletes all PRs when linked PRs are Finance-Approved with POs at Pending Procurement |
| PRCANCEL-04 | passed | BLOCK path at procurement.js:660-665 blocks cancellation when any linked PO has Procuring/Procured/Delivered status; additional payment guard at lines 677-699 blocks when any linked RFP has non-voided payments |
| PRCANCEL-05 | passed | MRF Processing left panel is not explicitly modified — `filterPRPORecords()` called at line 766 re-filters records view; MRF status change to `'In Progress'` triggers the MRF `onSnapshot` listener to update the left panel reactively |

## Code Evidence

| Function | Location | Purpose |
|----------|----------|---------|
| `showMRFContextMenu()` | procurement.js:589-611 | Right-click context menu on MRF ID |
| `cancelMRFPRs(mrfDocId)` | procurement.js:634-768 | Three-path cancel logic (block / force-recall / simple) |
| MRF restoration | procurement.js:749-755 | `updateDoc(doc(db, 'mrfs', mrfDocId), { status: 'In Progress', pr_ids: [], tr_id: null })` |

### Three Cancel Paths

| Path | Condition | Lines |
|------|-----------|-------|
| BLOCK | PO has Procuring/Procured/Delivered OR any RFP has non-voided payments | 660-699 |
| FORCE-RECALL | Pending Procurement POs exist | 707-730 |
| SIMPLE | No POs or only cancelled POs | 731-737 |

## Verification Commands

```bash
grep -c "cancelMRFPRs" app/views/procurement.js      # >= 4
grep -c "showMRFContextMenu" app/views/procurement.js # >= 3
grep -c "status: 'In Progress'" app/views/procurement.js  # >= 1
grep -c "blockedStatuses" app/views/procurement.js    # >= 2
```

## UAT Evidence

70-UAT.md: 8/8 tests pass — all three cancel paths verified plus TR edge case.

## Status

All 5 requirements verified via direct codebase inspection on 2026-04-20.
