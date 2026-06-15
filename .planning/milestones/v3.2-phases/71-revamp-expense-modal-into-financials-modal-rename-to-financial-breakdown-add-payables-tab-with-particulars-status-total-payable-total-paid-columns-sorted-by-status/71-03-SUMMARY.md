---
phase: 71-revamp-expense-modal-into-financials-modal-rename-to-financial-breakdown-add-payables-tab-with-particulars-status-total-payable-total-paid-columns-sorted-by-status
plan: 03
subsystem: ui
tags: [firestore, expense-modal, payables, status-derivation]

# Dependency graph
requires:
  - phase: 71-02
    provides: "deriveStatusForPO with !firstUnpaid fallback branch (the block being patched)"
provides:
  - "deriveStatusForPO fallback branch formats percentage label ('NN% Paid') instead of literal 'Partial'"
affects: [71-UAT, payables-tab, finance-payables]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline percentage derivation: Math.round(totalPaid / totalPayable * 100) for fallback status labels — mirrors finance.js:derivePOSummary:719-722"

key-files:
  created: []
  modified:
    - app/expense-modal.js

key-decisions:
  - "statusBucket stays 'Partial' — only statusLabel changes so D-06 sort order is unaffected"
  - "fallbackLabel uses 'Requested' (not 'Partial') when totalPaid === 0 — semantically accurate: an RFP exists but no payments recorded yet"

patterns-established:
  - "Fallback percentage label pattern: const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0; const fallbackLabel = totalPaid > 0 ? `${pctPaid}% Paid` : 'Requested';"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-04-07
---

# Phase 71 Plan 03: Format Partial PO Fallback Label as Percentage in deriveStatusForPO Summary

**deriveStatusForPO !firstUnpaid fallback now returns '50% Paid' instead of literal 'Partial' — fixes UAT Test 5 (PO_2026_03-002-ELECTIX displaying raw bucket name)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-07T10:00:00Z
- **Completed:** 2026-04-07T10:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced 4-line `!firstUnpaid` fallback block in `deriveStatusForPO` with a 6-line version that computes a readable percentage label
- UAT Test 5 case (₱13,875 total / ₱6,937.50 paid = 50%) will now render "50% Paid" instead of the literal word "Partial"
- `statusBucket` preserved as `'Partial'` — D-06 sort order unaffected

## Task Commits

1. **Task 1: Format Partial PO fallback label as percentage in deriveStatusForPO** - `5cee1b6` (fix)

**Plan metadata:** (included in final docs commit)

## Files Created/Modified
- `app/expense-modal.js` — `deriveStatusForPO` `!firstUnpaid` branch: replaced `statusLabel: 'Partial'` literal with computed `fallbackLabel` using `Math.round(totalPaid / totalPayable * 100)`

## Code Change

**BEFORE (4 lines, lines 271-274):**
```javascript
if (!firstUnpaid) {
    // All individual RFPs closed but PO not fully paid (data edge case)
    return { statusBucket: 'Partial', statusLabel: 'Partial', totalPayable, totalPaid };
}
```

**AFTER (6 lines):**
```javascript
if (!firstUnpaid) {
    // All individual RFPs closed but PO not fully paid (data edge case)
    // Mirror finance.js:derivePOSummary lines 719-722 — format a readable label
    const pctPaid = totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0;
    const fallbackLabel = totalPaid > 0 ? `${pctPaid}% Paid` : 'Requested';
    return { statusBucket: 'Partial', statusLabel: fallbackLabel, totalPayable, totalPaid };
}
```

## Grep Verification Results

All 5 checks passed after the edit:

| Check | Command | Expected | Actual | Result |
|-------|---------|----------|--------|--------|
| 1 | `grep -c "statusLabel: 'Partial'" app/expense-modal.js` | 0 | 0 | PASS |
| 2 | `grep -c "fallbackLabel" app/expense-modal.js` | >= 2 | 2 | PASS |
| 3 | `grep -c 'pctPaid}% Paid' app/expense-modal.js` | >= 3 | 4 | PASS |
| 4 | `grep -c "deriveStatusForTR" app/expense-modal.js` | unchanged | 2 | PASS |
| 5 | `grep -c "deriveStatusForDeliveryFee" app/expense-modal.js` | unchanged | 2 | PASS |

## Decisions Made
- `statusBucket` stays `'Partial'` per D-06 — sort order must not change
- `fallbackLabel` uses `'Requested'` (not `'Partial'`) when `totalPaid === 0`, matching the semantics: an RFP exists for the active tranche but has no recorded payments

## Deviations from Plan
None — plan executed exactly as written. Single surgical 4→6 line replacement, zero other files touched.

## Issues Encountered
None. Buggy line located at line 273 via grep (not hardcoded line number), exactly as the plan required.

## UAT Re-Verification

**UAT Test 5 (downstream — not gated by this plan):**
Navigate to PO_2026_03-002-ELECTIX → Financial Breakdown modal → Payables tab.
STATUS column must now show `50% Paid` (Total Payable ₱13,875 / Total Paid ₱6,937.50).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 71 gap closure (Plan 03) complete — Payables tab STATUS column now shows meaningful percentage labels for the edge case
- UAT re-verification of Test 5 is the only remaining downstream step
- Phase 71 is ready to be marked complete once UAT Test 5 passes

---
*Phase: 71-revamp-expense-modal-into-financials-modal*
*Completed: 2026-04-07*
