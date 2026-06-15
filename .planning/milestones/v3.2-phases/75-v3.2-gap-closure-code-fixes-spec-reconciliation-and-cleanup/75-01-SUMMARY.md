---
phase: 75-v3.2-gap-closure-code-fixes-spec-reconciliation-and-cleanup
plan: 01
subsystem: finance-summary-card + procurement-lifecycle
tags:
  - bugfix
  - lifecycle-cleanup
  - gap-closure
  - v3.2-audit
requirements:
  - FINSUMCARD-03
  - TRCLEANUP-01
dependency-graph:
  requires:
    - app/views/project-detail.js (read-only reference for TR aggregate pattern at lines 672-680, 709)
    - app/views/finance.js (read-only reference confirming service_code is the canonical TR filter at lines 2472, 2537)
    - Phase 67 (TR-RFP feature — registers the 3 window handlers being cleaned up)
    - Phase 72.1 (always-render Paid/Remaining Payable cells — preserves hasRfps field unchanged)
  provides:
    - Correct Remaining Payable formula on Service detail Financial Summary card (parity with Project detail)
    - Clean destroy() lifecycle for TR-RFP state and window handlers (no stale state, no orphan globals)
  affects:
    - Service detail page Financial Summary card (Remaining Payable cell)
    - Procurement view re-entry (TR-RFP state map and global handlers)
tech-stack:
  added: []
  patterns:
    - getAggregateFromServer + sum + count pattern reused (no new APIs)
    - Bare delete window.X destroy() pattern (matches existing style — no if-guards)
key-files:
  created: []
  modified:
    - app/views/service-detail.js (14 insertions, 1 deletion — FINSUMCARD-03)
    - app/views/procurement.js (4 insertions, 0 deletions — TRCLEANUP-01)
decisions:
  - Variable naming follows service-detail conventions (trsAgg, not trsAggregate from project-detail) but aggregate field aliases (totalAmount/trCount) mirror project-detail.js for behavioral parity per plan
  - service_code chosen as TR filter (over service_name) per finance.js:2472, 2537 convention — service-side TRs use service_code throughout the codebase
  - prTotal/prCount fields preserved on currentServiceExpense literal for backward compatibility with any downstream consumer (bug was only in the formula, not in field exposure)
  - 3 TR-RFP window deletes grouped contiguously after delete window.submitDeliveryFeeRFP for logical co-location with sibling RFP cleanup
metrics:
  duration_minutes: 2
  completed_date: "2026-04-18"
  tasks: 2
  files_modified: 2
  total_insertions: 18
  total_deletions: 1
---

# Phase 75 Plan 01: v3.2 Gap Closure — Code Fixes Summary

**One-liner:** Fixed Service detail Remaining Payable double-count bug by adding a transport_requests aggregate to refreshServiceExpense() (parity with project-detail.js), and completed procurement.js destroy() lifecycle for TR-RFP state (rfpsByTR reset) and 3 orphan window handlers (showTRRFPContextMenu, openTRRFPModal, submitTRRFP).

## Outcome

Both gap-closure code fixes from the v3.2 milestone audit landed surgically, verified via grep, with reference files (project-detail.js, finance.js) untouched.

- **FINSUMCARD-03 closed:** Service detail Financial Summary card now reads `(poTotal + trTotal) - rfpTotalPaid` instead of the buggy `(poTotal + prTotal) - rfpTotalPaid`. TR total sourced from a new `transport_requests` aggregate query inside `refreshServiceExpense()` filtered by `service_code` (matching finance.js:2472, 2537 convention) and aliased `totalAmount`/`trCount` (matching project-detail.js:677-679).
- **TRCLEANUP-01 closed:** procurement.js destroy() now resets `rfpsByTR = {}` alongside `rfpsByPO = {}`, and removes `window.showTRRFPContextMenu`, `window.openTRRFPModal`, and `window.submitTRRFP` from the global namespace. Re-entering the procurement view starts with a clean TR-RFP map and no orphan global handlers.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | FINSUMCARD-03 — Add TR aggregate to refreshServiceExpense() and fix Remaining Payable formula | `da69bc3` | app/views/service-detail.js |
| 2 | TRCLEANUP-01 — procurement.js destroy() cleanup (rfpsByTR + 3 TR-RFP window functions) | `2d22754` | app/views/procurement.js |

## Exact Changes

### Task 1: app/views/service-detail.js — `refreshServiceExpense()`

**Edit 1 — Inserted new transport_requests aggregate block immediately after the existing POs aggregate block (lines 849-858 in current file):**

```javascript
// TRs: sum total_amount + count (mirrors project-detail.js:672-680)
// Filter by service_code per finance.js:2472, 2537 convention
const trsQuery = query(
    collection(db, 'transport_requests'),
    where('service_code', '==', code)
);
const trsAgg = await getAggregateFromServer(trsQuery, {
    totalAmount: sum('total_amount'),
    trCount: count()
});
```

**Edit 2 — Modified `currentServiceExpense` object literal (lines 878-889 in current file):**

BEFORE:
```javascript
currentServiceExpense = {
    mrfCount: mrfsAgg.data().mrfCount || 0,
    prTotal: prsAgg.data().prTotal || 0,
    prCount: prsAgg.data().prCount || 0,
    poTotal: posAgg.data().poTotal || 0,
    poCount: posAgg.data().poCount || 0,
    totalPaid: rfpTotalPaid,
    remainingPayable: (posAgg.data().poTotal || 0) + (prsAgg.data().prTotal || 0) - rfpTotalPaid,
    hasRfps
};
```

AFTER:
```javascript
currentServiceExpense = {
    mrfCount: mrfsAgg.data().mrfCount || 0,
    prTotal: prsAgg.data().prTotal || 0,
    prCount: prsAgg.data().prCount || 0,
    poTotal: posAgg.data().poTotal || 0,
    poCount: posAgg.data().poCount || 0,
    trTotal: trsAgg.data().totalAmount || 0,
    trCount: trsAgg.data().trCount || 0,
    totalPaid: rfpTotalPaid,
    remainingPayable: (posAgg.data().poTotal || 0) + (trsAgg.data().totalAmount || 0) - rfpTotalPaid,
    hasRfps
};
```

**Diff:** +14, -1 (10 new lines for TR aggregate block including blank padding, 2 new fields in literal, 1 line modified for the formula change).

### Task 2: app/views/procurement.js — destroy() block

**Edit 1 — Added `rfpsByTR = {}` reset immediately after `rfpsByPO = {}` (line 2102):**

```javascript
rfpsData = [];
rfpsByPO = {};
rfpsByTR = {};        // NEW
allPRPORecords = [];
```

**Edit 2 — Added 3 TR-RFP window deletes between `delete window.submitDeliveryFeeRFP` and `delete window.showAltBank` (lines 2164-2166):**

```javascript
delete window.submitDeliveryFeeRFP;
delete window.showTRRFPContextMenu;   // NEW
delete window.openTRRFPModal;          // NEW
delete window.submitTRRFP;             // NEW
delete window.showAltBank;
```

**Diff:** +4, -0.

## Convention Confirmations

- **TR aggregate filter field:** `service_code` (NOT `service_name`, NOT `project_name`). Matches finance.js:2472 (`refreshServiceExpenses`) and finance.js:2537 (`refreshRecurringExpenses`).
- **TR aggregate alias names:** `totalAmount` for the sum, `trCount` for the count. Mirrors project-detail.js:677-679 — readable as `trsAgg.data().totalAmount` and `trsAgg.data().trCount`.
- **TR aggregate variable name:** `trsAgg` (matches service-detail.js style: `mrfsAgg`, `prsAgg`, `posAgg`). Project-detail.js uses `trsAggregate` style — service-detail keeps its own conventions for local naming consistency.
- **Bare destroy delete style:** `delete window.X;` with no `if (window.X)` guard. Matches the existing 60+ destroy entries in procurement.js.

## Verification (Acceptance Grep)

All checks passed:

| Check | Expected | Actual |
| ----- | -------- | ------ |
| Buggy formula `(posAgg.data().poTotal \|\| 0) + (prsAgg.data().prTotal \|\| 0) - rfpTotalPaid` removed | 0 | 0 |
| Correct formula `(posAgg.data().poTotal \|\| 0) + (trsAgg.data().totalAmount \|\| 0) - rfpTotalPaid` present | 1 | 1 |
| `collection(db, 'transport_requests')` added | 1 | 1 |
| `where('service_code', '==', code)` count | ≥4 | 4 |
| `trsAgg.data().totalAmount` references | ≥2 | 2 |
| `trsAgg.data().trCount` references | 1 | 1 |
| `trTotal: trsAgg.data().totalAmount` field | 1 | 1 |
| `prTotal: prsAgg.data().prTotal` field preserved | 1 | 1 |
| project-detail.js `(poTotal + trTotal) - rfpTotalPaid` reference unchanged | 1 | 1 |
| project-detail.js git diff | empty | empty |
| finance.js git diff | empty | empty |
| `rfpsByTR = {}` in destroy() (line above is `rfpsByPO = {}`) | yes | yes (line 2102, preceded by line 2101) |
| `delete window.showTRRFPContextMenu` | 1 | 1 |
| `delete window.openTRRFPModal` | 1 | 1 |
| `delete window.submitTRRFP` | 1 | 1 |
| Init-side `window.showTRRFPContextMenu = showTRRFPContextMenu` preserved | 1 | 1 |
| Init-side `window.openTRRFPModal = openTRRFPModal` preserved | 1 | 1 |
| Init-side `window.submitTRRFP = submitTRRFP` preserved | 1 | 1 |
| procurement.js diff | 4 0 | 4 0 |
| service-detail.js diff | ~11 1 | 14 1 |

**Note on `rfpsByTR = {}` count:** Plan expected count of 1 in the destroy() block — that holds. Total file count is now 3 occurrences (line 63 declaration, line 2102 destroy reset, line 6255 pre-existing parallel reset inside another code path that already paired with `rfpsByPO = {}` before this fix). All occurrences are intentional and consistent with the rfpsByPO pattern.

## Deviations from Plan

None. Plan executed exactly as written. No Rule 1-4 deviations triggered. No authentication gates encountered. No analysis paralysis. No CLAUDE.md conflicts (vanilla ES6, no build/lint commands needed, window function lifecycle pattern followed).

## REQUIREMENTS.md Status (handoff to Plan 75-02)

Plan 75-02 owns the REQUIREMENTS.md edit per the gap-closure orchestrator design. The following traceability rows are now ready to flip from "Pending" to "Complete" in REQUIREMENTS.md:

- **FINSUMCARD-03** — Service detail Remaining Payable formula bug (closed by commit `da69bc3`, app/views/service-detail.js:884 final formula line)
- **TRCLEANUP-01** — procurement.js destroy() lifecycle for TR-RFP state and window handlers (closed by commit `2d22754`, app/views/procurement.js:2102 + 2164-2166)

## UAT

**No manual UAT required.** Both fixes are verifiable via:
1. **grep** (all checks above pass deterministically against the source).
2. **Browser console inspection** (after navigating away from Procurement, `window.showTRRFPContextMenu` returns `undefined` — handlers cleaned up).
3. **Optional smoke test** (post-deploy):
   - Open a Service detail page with a PR + derived PO and no RFP → Remaining Payable equals (PO total + 0 TR) - 0 = PO total (was previously double-counting PR + PO).
   - Open a Service detail page with independent TRs → Remaining Payable now includes TR amounts (previously excluded entirely).
   - Navigate Procurement → Home → Procurement → right-click TR badge → "Cancel {RFP-ID}" appears correctly (rfpsByTR repopulated cleanly after re-entry).

## Self-Check: PASSED

- [x] app/views/service-detail.js modified: FOUND
- [x] app/views/procurement.js modified: FOUND
- [x] Commit `da69bc3` (Task 1 FINSUMCARD-03): FOUND
- [x] Commit `2d22754` (Task 2 TRCLEANUP-01): FOUND
- [x] Reference file app/views/project-detail.js unchanged: VERIFIED (empty git diff)
- [x] Reference file app/views/finance.js unchanged: VERIFIED (empty git diff)
- [x] All 19 acceptance grep checks pass
