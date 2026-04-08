---
quick_id: 260408-ikv
phase: quick
plan: 260408-ikv
subsystem: procurement
tags: [po-details, rfp, lock, document-details]
dependency_graph:
  requires: [rfpsByPO, viewPODetails]
  provides: [locked-document-details-when-active-rfp]
  affects: [app/views/procurement.js]
tech_stack:
  added: []
  patterns: [conditional-html-branch, rfpsByPO-lookup]
key_files:
  created: []
  modified:
    - app/views/procurement.js
decisions:
  - Lock predicate uses po.po_id (human-readable) not po.id (Firestore doc ID) to match rfpsByPO keys
  - Delivery Fee RFPs excluded from lock check via tranche_label !== 'Delivery Fee'
  - documentDetailsHTML ternary defined before modalBodyContent template to keep template clean
  - No new Firestore listeners — rfpsByPO already live-updated by existing onSnapshot in loadPOTracking
metrics:
  duration: ~10 minutes
  completed_date: "2026-04-08"
  tasks_completed: 1
  tasks_total: 2
  files_modified: 1
---

# Quick Task 260408-ikv: Lock PO Document Details When Active RFP Exists

One-liner: Conditionally renders Document Details in PO modal as read-only with an amber lock notice when `rfpsByPO[po.po_id]` contains at least one non-Delivery-Fee RFP.

## What Was Built

Modified `viewPODetails` in `app/views/procurement.js` to compute a `hasActiveRFP` flag and branch on it when rendering the Document Details section of the PO Details modal.

### Lock predicate (lines ~6998-6999)

```js
const hasActiveRFP = (rfpsByPO[po.po_id] || [])
    .some(r => r.tranche_label !== 'Delivery Fee');
```

### documentDetailsHTML branches

**Locked** (`hasActiveRFP === true`):
- Amber notice: "Locked: Document Details cannot be edited while an active RFP is in progress. Cancel all RFPs for this PO to edit again."
- Read-only `<ul>` of payment tranches (label — percentage%)
- Plain `<span>` for Condition value
- Plain `<span>` for Delivery Date value
- No Save button

**Editable** (`hasActiveRFP === false`):
- Existing `renderTrancheBuilder(poTranches, po.id)` unchanged
- Existing `<input>` for Condition unchanged
- Existing `<input type="date">` for Delivery Date unchanged
- Existing "Save Document Details" button unchanged

### Line range modified in viewPODetails

Lines 6996-7061 (original) — inserted `hasActiveRFP` + `documentDetailsHTML` after `poTranches`, replaced 25-line literal Document Details block with `${documentDetailsHTML}`.

### Functions NOT modified

- `savePODocumentFields` (line ~8119) — definition untouched
- `renderTrancheBuilder` (line 75) — definition untouched

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f67d545 | fix(260408-ikv): lock Document Details in PO modal when active RFP exists |

## UAT Results (Task 2)

Status: Awaiting human verification

Steps to verify:
1. Start `python -m http.server 8000`
2. Procurement > MRF Records tab
3. PO with no RFPs — Document Details editable (tranches, Condition, Delivery Date, Save button)
4. PO with active regular RFP — Document Details locked (amber notice, read-only fields, no Save button)
5. Cancel all regular RFPs on locked PO, reopen modal — editable again
6. PO with only Delivery Fee RFP — Document Details editable (Delivery Fee does NOT lock)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check

- [x] `hasActiveRFP` uses `po.po_id` (matches rfpsByPO key format)
- [x] `documentDetailsHTML` variable exists in file
- [x] `rfpsByPO[po.po_id]` lookup present
- [x] `savePODocumentFields` definition at line 8119 — untouched
- [x] `renderTrancheBuilder` definition at line 75 — untouched
- [x] Commit f67d545 exists

## Self-Check: PASSED
