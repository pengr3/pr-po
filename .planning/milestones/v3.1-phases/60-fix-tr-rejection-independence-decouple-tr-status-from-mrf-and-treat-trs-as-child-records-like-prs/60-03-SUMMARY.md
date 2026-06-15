---
phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs
plan: 03
subsystem: ui
tags: [procurement, transport-requests, firestore, editable-table]

# Dependency graph
requires:
  - phase: 60-02
    provides: cachedRejectedTRs listener, selectRejectedTR panel, resubmitRejectedTR function
provides:
  - Editable #lineItemsBody table in rejected TR detail panel
  - saveRejectedTRChanges() writes updated items_json + total_amount to Firestore
  - calculateSubtotal/calculateGrandTotal work without currentMRF guard
affects: [procurement-view, tr-rejection-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse #lineItemsBody id and class names across MRF edit form and rejected TR panel so calculateSubtotal works unchanged"
    - "cachedRejectedTRs in-place update after Firestore write avoids waiting for onSnapshot round-trip"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "calculateSubtotal() and calculateGrandTotal() guards removed (if !currentMRF return) so they work in rejected TR panel where currentMRF is null"
  - "No delete-row button in TR editable panel — TR items are correction-only, not structural edits"
  - "saveRejectedTRChanges does not change finance_status — TR stays Rejected until explicit Resubmit"

patterns-established:
  - "TR editable panel reuses exact same #lineItemsBody id and CSS class names as MRF detail form — calculateSubtotal requires no changes"

requirements-completed: [TR-INDEP-03]

# Metrics
duration: 15min
completed: 2026-03-09
---

# Phase 60 Plan 03: Editable Rejected TR Detail Panel Summary

**Editable item table in rejected TR panel using #lineItemsBody pattern — Procurement can revise qty, cost, category, supplier before resubmitting to Finance**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-09T00:00:00Z
- **Completed:** 2026-03-09T00:15:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced static read-only table in selectRejectedTR() with full editable #lineItemsBody table (same inputs/selects as renderMRFDetails)
- Added saveRejectedTRChanges(trDocId) that reads DOM, writes to Firestore, and refreshes cachedRejectedTRs in-place
- Both Save Changes and Resubmit to Finance buttons appear side by side in the panel
- calculateSubtotal() and calculateGrandTotal() now work for the TR panel (removed currentMRF guard)

## Task Commits

Each task was committed atomically:

1. **Tasks 1 + 2: Editable TR panel + saveRejectedTRChanges** - `d241f5d` (feat)

## Files Created/Modified
- `app/views/procurement.js` - Replaced static TR item table with editable #lineItemsBody, added saveRejectedTRChanges(), registered/deregistered on window, removed currentMRF guards from calculateSubtotal/calculateGrandTotal

## Decisions Made
- Removed `if (!currentMRF) return;` from `calculateSubtotal()` and `calculateGrandTotal()` — these functions are pure DOM operations; the guard was a defensive check that also prevented them from working in the rejected TR panel where currentMRF is intentionally null
- No delete-row button in TR panel — TR items need corrections, not structural changes; keeps implementation simple
- `saveRejectedTRChanges` does not reset `finance_status` or clear `rejection_reason` — only persists item edits; Resubmit button remains the explicit action to re-enter Finance queue

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed currentMRF guard from calculateSubtotal() and calculateGrandTotal()**
- **Found during:** Task 1 (editable table implementation)
- **Issue:** Both functions had `if (!currentMRF) return;` at the top. When a rejected TR is selected, `currentMRF` is null, so editing qty/unit cost would not update subtotal cells or grand total
- **Fix:** Removed the guard from both functions. They only do DOM reads/writes — no dependency on currentMRF data
- **Files modified:** app/views/procurement.js
- **Verification:** Functions still work for MRF form (currentMRF set), and now also work for TR panel (currentMRF null)
- **Committed in:** d241f5d (task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correctness. Without this fix, the editable table would render but qty/cost edits would not update subtotals or grand total. No scope creep.

## Issues Encountered
None beyond the currentMRF guard (documented above).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 60 gap closure complete — all three plans (60-01, 60-02, 60-03) delivered full TR rejection independence
- Procurement can now review, edit items, and resubmit rejected TRs entirely within the Procurement view
- Finance sees resubmitted TRs with prior rejection history visible in the modal
- No blockers

---
*Phase: 60-fix-tr-rejection-independence-decouple-tr-status-from-mrf-and-treat-trs-as-child-records-like-prs*
*Completed: 2026-03-09*
