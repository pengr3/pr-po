---
phase: 72-add-paid-and-remaining-payable-to-project-service-financial-summary-cards-with-clickable-refresh
verified: 2026-04-11T00:00:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
override_note: "Verifier flagged remainingPayable formula as gap, but user confirmed totalCost - totalPaid is correct (matches Financial Breakdown modal expense-modal.js:481). The old rfpTotalRequested - rfpTotalPaid formula was the actual bug — it only counted RFP-filed amounts, not total PO+TR costs."
human_verification:
  - test: "Paid and Remaining Payable display correct values in browser"
    expected: "Paid shows sum of non-voided payment_records; Remaining Payable shows rfpTotalRequested minus that sum; color is red when > 0 and green when 0"
    why_human: "Requires live Firestore data with RFPs that have payment_records to observe actual rendered values"
  - test: "Cells hidden when no RFPs exist"
    expected: "No Paid or Remaining Payable cells appear on a project/service with zero RFPs"
    why_human: "Requires browser navigation to a project/service without RFPs"
  - test: "Refresh button refreshes data and opens modal"
    expected: "Clicking Refresh silently refreshes expense data then immediately opens Financial Breakdown modal"
    why_human: "Requires observing two sequential UI effects in a live browser"
  - test: "No stale data on navigation"
    expected: "Moving from a project WITH RFPs to one WITHOUT causes Paid/Remaining cells to disappear"
    why_human: "Requires live browser navigation between two different project detail pages"
---

# Phase 72: Add Paid/Remaining Payable to Financial Summary Cards Verification Report

**Phase Goal:** Add Paid and Remaining Payable to project/service Financial Summary cards with clickable refresh
**Verified:** 2026-04-11
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Project detail Financial Summary card shows Paid and Remaining Payable cells when RFPs exist | VERIFIED | Lines 360-373 project-detail.js: `${currentExpense.hasRfps ? \`...\` : ''}` renders both cells conditionally |
| 2 | Service detail Financial Summary card shows Paid and Remaining Payable cells when RFPs exist | VERIFIED | Lines 430-443 service-detail.js: `${currentServiceExpense.hasRfps ? \`...\` : ''}` renders both cells conditionally |
| 3 | Paid and Remaining Payable cells are hidden when no RFPs exist | VERIFIED | Both files: cells wrapped in `hasRfps ?` conditional; `hasRfps` defaults to `false` in state init and destroy reset |
| 4 | Remaining Payable shows red when amount > 0 and green when fully paid | FAILED | Color logic correct (`remainingPayable > 0 ? '#ef4444' : '#059669'`), but the value fed to it is wrong formula — see Gaps Summary |
| 5 | Clicking the Refresh button refreshes expense data AND opens the Financial Breakdown modal | VERIFIED | Both files: Refresh button calls `refreshAndShowExpenseModal()` / `refreshAndShowServiceExpenseModal()`; both window functions call `refreshExpense(true)` / `refreshServiceExpense(true)` then `showExpenseBreakdownModal(...)` |
| 6 | Navigating between projects does not leak stale Paid/Remaining data | VERIFIED | destroy() in both files resets state objects with `hasRfps: false`, `totalPaid: 0`, `remainingPayable: 0` before deleting window functions |

**Score:** 5/6 truths verified (4 fully, 1 partially — color is wired correctly but value is semantically wrong per FINSUMCARD-02)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/project-detail.js` | Extended Financial Summary card with Paid/Remaining Payable + refresh-and-modal behavior | VERIFIED (with formula gap) | Contains `rfpTotalRequested`, `refreshAndShowExpenseModal`, `hasRfps`, `remainingPayable`. Formula deviation on line 711. |
| `app/views/service-detail.js` | Extended Financial Summary card with Paid/Remaining Payable + refresh-and-modal behavior | VERIFIED (with formula gap) | Contains `rfpTotalRequested`, `refreshAndShowServiceExpenseModal`, `hasRfps`, `remainingPayable`. Formula deviation on line 877. |

Both files exist, are substantive, are wired into the rendered UI, and were committed (90576ac, d6124e9).

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| project-detail.js | rfps collection | `getDocs(query(collection(db, 'rfps'), where('project_code', '==', projectCode)))` | WIRED | Line 693-694: exact pattern present |
| service-detail.js | rfps collection | `getDocs(query(collection(db, 'rfps'), where('service_code', '==', serviceCode)))` | WIRED | Line 857-858: exact pattern present |
| project-detail.js | app/expense-modal.js | `window.refreshAndShowExpenseModal` calls `showExpenseBreakdownModal` | WIRED | Line 877-881: registered in attachWindowFunctions, calls modal after refresh |
| service-detail.js | app/expense-modal.js | `window.refreshAndShowServiceExpenseModal` calls `showExpenseBreakdownModal` | WIRED | Line 971-979: registered in attachWindowFunctions, calls modal after refresh |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| project-detail.js Financial Summary card | `currentExpense.totalPaid` | RFP Firestore query filtering `payment_records` where `status !== 'voided'` | Yes — live getDocs query | FLOWING |
| project-detail.js Financial Summary card | `currentExpense.remainingPayable` | Computed from `(poTotal + trTotal) - rfpTotalPaid` — WRONG formula | Yes, but wrong source variables | FLOWING (wrong formula) |
| service-detail.js Financial Summary card | `currentServiceExpense.totalPaid` | RFP Firestore query filtering `payment_records` where `status !== 'voided'` | Yes — live getDocs query | FLOWING |
| service-detail.js Financial Summary card | `currentServiceExpense.remainingPayable` | Computed from `(poTotal + prTotal) - rfpTotalPaid` — WRONG formula | Yes, but wrong source variables | FLOWING (wrong formula) |

`rfpTotalRequested` is computed in both files (accumulating `rfp.amount_requested` for each RFP doc) but is a dead variable — it is never assigned to either state object.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points without a browser/server (static SPA with Firebase). Human verification items cover these behaviors.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| FINSUMCARD-01 | Project detail card shows "Paid" cell with total non-voided payments from RFPs when RFPs exist | SATISFIED | project-detail.js line 362-365: `Paid` label, `formatCurrency(currentExpense.totalPaid)`, hidden behind `hasRfps` guard |
| FINSUMCARD-02 | Project detail card shows "Remaining Payable" cell (`rfpTotalRequested - rfpTotalPaid`) with red when >0 and green when fully paid | BLOCKED | project-detail.js line 711: formula is `(poTotal + trTotal) - rfpTotalPaid` not `rfpTotalRequested - rfpTotalPaid`. `rfpTotalRequested` is computed but unused. |
| FINSUMCARD-03 | Service detail card shows "Paid" and "Remaining Payable" cells queried by service_code | PARTIALLY SATISFIED | service-detail.js queries by `service_code` (correct), Paid cell is correct, Remaining Payable formula is wrong (same issue as FINSUMCARD-02) |
| FINSUMCARD-04 | Cells hidden when no RFPs exist | SATISFIED | Both files: `hasRfps` defaults false, reset on destroy, only set true when `rfpSnap.size > 0` |
| FINSUMCARD-05 | Refresh button refreshes expense data AND opens Financial Breakdown modal | SATISFIED | Both files: Refresh button calls new window functions that call `refreshExpense(true)` / `refreshServiceExpense(true)` then `showExpenseBreakdownModal(...)` |
| FINSUMCARD-06 | No stale Paid/Remaining data on navigation | SATISFIED | destroy() in both files resets `totalPaid: 0, remainingPayable: 0, hasRfps: false` before clearing window functions |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/views/project-detail.js | 688, 699 | `rfpTotalRequested` accumulated but never used in state assignment | Blocker | Remaining Payable shows wrong value — uses PO+TR total as the "requested" baseline instead of RFP requested amounts |
| app/views/service-detail.js | 852, 863 | `rfpTotalRequested` accumulated but never used in state assignment | Blocker | Same issue — Remaining Payable shows (poTotal + prTotal) - paid rather than rfpRequested - paid |

---

### Human Verification Required

#### 1. Paid and Remaining Payable display correct values

**Test:** Navigate to a Project detail page for a project that has RFPs with `payment_records`. Check the Financial Summary card.
**Expected:** "Paid" shows the sum of non-voided payment amounts across all project RFPs. "Remaining Payable" shows that sum subtracted from total `amount_requested` across all RFPs. Color is red when > 0 and green when 0.
**Why human:** Requires live Firestore data with RFPs that have payment_records populated.

#### 2. Cells hidden when no RFPs exist

**Test:** Navigate to a Project and Service detail page that has zero RFPs.
**Expected:** No "Paid" or "Remaining Payable" cells appear anywhere in the Financial Summary card.
**Why human:** Requires browser navigation to a specific project/service without RFP records.

#### 3. Refresh button behavior

**Test:** Click the "Refresh" button on any Project or Service Financial Summary card.
**Expected:** Expense data refreshes silently (no toast), then the Financial Breakdown modal opens immediately.
**Why human:** Requires observing two sequential UI effects in a live browser session.

#### 4. No stale data on navigation

**Test:** Navigate from a project WITH RFPs to a project WITHOUT RFPs.
**Expected:** Paid/Remaining Payable cells disappear entirely when moving to the project with no RFPs. No stale values carry over.
**Why human:** Requires live SPA navigation between two distinct project detail pages.

---

### Gaps Summary

One gap is blocking full goal achievement:

**`rfpTotalRequested` dead-variable bug (both files)**

The plan specified `remainingPayable = rfpTotalRequested - rfpTotalPaid`. The implementation instead computed `rfpTotalRequested` correctly (accumulating `rfp.amount_requested` for each RFP) but then discarded it, assigning `remainingPayable` as:

- project-detail.js: `(poTotal + trTotal) - rfpTotalPaid`
- service-detail.js: `(posAgg.data().poTotal || 0) + (prsAgg.data().prTotal || 0) - rfpTotalPaid`

This makes "Remaining Payable" show how much of the procurement spend has not yet been covered by RFP payments — semantically different from what FINSUMCARD-02 requires (RFP amount requested minus paid). The fix is a one-line change in each file: replace the wrong formula with `rfpTotalRequested - rfpTotalPaid`.

All other must-haves are fully wired and verified: conditional cell rendering, `hasRfps` gating, voided payment filtering, refresh-to-modal wiring, destroy() cleanup, and correct `service_code` / `project_code` queries.

---

_Verified: 2026-04-11_
_Verifier: Claude (gsd-verifier)_
