---
phase: 65-rfp-payables-tracking
plan: 01
subsystem: database, ui
tags: [firestore, security-rules, rfps, tranches, payment-terms, procurement, po-tracking]

# Dependency graph
requires: []
provides:
  - rfps Firestore collection security rules (procurement create, finance update, all active read)
  - Tranche builder UI in PO edit modal (renderTrancheBuilder, readTranchesFromDOM, recalculateTranches, addTranche, removeTranche)
  - savePODocumentFields writes structured tranches array + backward-compat payment_terms string to Firestore
  - Legacy PO fallback: missing tranches field defaults to single Full Payment 100% row
affects:
  - 65-02 (RFP creation reads tranches from PO to pick which tranche this RFP targets)
  - Finance payables tracking (rfps collection now has rules before any write code)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tranche builder: array-of-{label,percentage} stored as pos.tranches; backward-compat pos.payment_terms string always co-written
    - Legacy PO fallback: Array.isArray(po.tranches) && po.tranches.length > 0 ? po.tranches : [{ label: po.payment_terms || 'Full Payment', percentage: 100 }]
    - Tranche validation: Math.abs(total - 100) > 0.01 guard before any Firestore write; showToast error if fails
    - Window functions for dynamic HTML onclick: registered in attachWindowFunctions(), removed in destroy()

key-files:
  created: []
  modified:
    - firestore.rules
    - app/views/procurement.js

key-decisions:
  - "Tranche builder uses poId as scoping key for all DOM element IDs (trancheBuilder_{poId}, trancheTotal_{poId}, etc.) to allow multiple modals coexisting without ID collisions"
  - "savePODocumentFields always writes tranches array unconditionally (not guarded by if block) so tranches always persists even if condition/deliveryDate are empty"
  - "PAYMENT_TERMS template variable in generatePODocument prefers po.tranches array, falls back to po.payment_terms string for legacy POs that predate this plan"
  - "promptPODocument skip condition updated to accept po.tranches presence OR po.payment_terms string so legacy POs still auto-generate without re-prompting"

patterns-established:
  - "Tranche builder pattern: render HTML via renderTrancheBuilder(tranches, id), read back via readTranchesFromDOM(id), validate via recalculateTranches(id)"

requirements-completed: [RFP-01]

# Metrics
duration: 22min
completed: 2026-03-18
---

# Phase 65 Plan 01: Security Rules + Tranche Builder Summary

**Firestore rfps collection security rules deployed and PO edit modal payment_terms text input replaced with structured add/remove tranche builder that writes a tranches array to Firestore**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-03-18T06:59:00Z
- **Completed:** 2026-03-18T07:21:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `match /rfps/{rfpId}` block to `firestore.rules` with role-appropriate rules: procurement creates, finance+procurement update, all active users read, super_admin deletes
- Added 5 tranche builder helper functions: `renderTrancheBuilder`, `readTranchesFromDOM`, `recalculateTranches`, `addTranche`, `removeTranche`
- Registered tranche window functions in `attachWindowFunctions()` and cleaned up in `destroy()`
- Replaced free-text Payment Terms input in PO Details modal with a dynamic tranche builder (add/remove rows, running total with green/red validation)
- Same replacement in the `promptPODocument` quick-fill modal
- Updated `savePODocumentFields` to validate total equals 100% before saving, write `tranches` array + backward-compat `payment_terms` string
- Updated `generatePOWithFields` with the same tranche validation and write pattern
- Updated `PAYMENT_TERMS` template variable in `generatePODocument` to prefer `po.tranches` array, fall back to `po.payment_terms` string for legacy POs

## Task Commits

Each task was committed atomically:

1. **Task 1: Add rfps security rules to firestore.rules** - `1640d57` (feat)
2. **Task 2: Replace payment_terms text input with tranche builder in PO edit modal** - `1db0bd4` (feat)

**Plan metadata:** (pending final metadata commit)

## Files Created/Modified
- `firestore.rules` - Added rfps collection security rules block after services block
- `app/views/procurement.js` - Tranche builder helpers, window registration, modal replacements, savePODocumentFields and generatePOWithFields rewrites, PAYMENT_TERMS template var update

## Decisions Made
- Tranche builder uses poId as scoping key for all DOM element IDs so multiple modals can coexist without collisions
- `savePODocumentFields` always writes `tranches` unconditionally (not guarded by `if` block) so the structured array always persists even when condition/deliveryDate fields are empty
- `promptPODocument` skip condition updated to `(po.tranches || po.payment_terms) && po.condition && po.delivery_date` so legacy POs still auto-generate without re-prompting
- Tranche total color: green (#059669) at exactly 100%, red (#ef4444) otherwise — uses `Math.abs(total - 100) < 0.01` for floating-point safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Firestore rules are deployed via `firebase deploy --only firestore:rules` (manual step or CI).

## Next Phase Readiness
- rfps collection is now writable by procurement role — Plan 65-02 can implement `addDoc(collection(db, 'rfps'), ...)` without permission errors
- PO documents now store a structured `tranches` array — Plan 65-02 can display per-tranche RFP status inline on PO Tracking
- Legacy POs without `tranches` field gracefully fall back to a single "Full Payment 100%" row in the edit modal

---
*Phase: 65-rfp-payables-tracking*
*Completed: 2026-03-18*
