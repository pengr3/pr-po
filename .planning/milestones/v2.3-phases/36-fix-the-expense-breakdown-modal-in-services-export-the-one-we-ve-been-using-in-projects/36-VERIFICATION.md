---
phase: 36-fix-the-expense-breakdown-modal-in-services-export-the-one-we-ve-been-using-in-projects
verified: 2026-02-23T04:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Open a service detail page and click the expense total figure"
    expected: "Modal opens with service name in header, shows Material Purchases / Transport Fees / Subcon Cost scorecards, and By Category / Transport Fees tabs with item-level breakdown"
    why_human: "Cannot verify DOM rendering and Firebase query results against live Firestore data programmatically"
  - test: "Open a project detail page and click the expense figure"
    expected: "Modal behavior unchanged — same three scorecards, same two tabs, project budget fetched from Firestore"
    why_human: "Regression confirmation requires live data"
  - test: "Open Finance view, expand a project row's expense modal"
    expected: "showProjectExpenseModal still triggers correctly with mode: 'project'"
    why_human: "Requires live Firestore data to confirm no regression"
---

# Phase 36: Fix Service Expense Breakdown Modal — Verification Report

**Phase Goal:** Unify expense breakdown modal — delete showServiceExpenseBreakdownModal and merge into one showExpenseBreakdownModal(identifier, options) with mode branching; services modal now shows Material/Transport/Subcon scorecards and By Category/Transport Fees tabs identical to projects modal
**Verified:** 2026-02-23T04:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1 | Service expense modal shows Material Purchases / Transport Fees / Subcon Cost scorecards | VERIFIED | Lines 261, 266, 271 of expense-modal.js contain the exact scorecard label strings in shared HTML |
| 2 | Service modal tabs labeled By Category and Transport Fees | VERIFIED | Lines 288, 292 of expense-modal.js; tab buttons use `_switchExpenseBreakdownTab('category')` and `_switchExpenseBreakdownTab('transport')` |
| 3 | By Category tab shows collapsible item-level category rows | VERIFIED | `category-card collapsible` div structure with `_toggleExpenseCategory` onclick handler present at lines 136-159 |
| 4 | Service modal queries POs and TRs by service_code | VERIFIED | Lines 31-32: `where('service_code', '==', identifier)` for both `pos` and `transport_requests` collections |
| 5 | Project detail expense modal still works identically | VERIFIED | `project-detail.js` line 781: `showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' })` — same query path, same HTML |
| 6 | Finance view showProjectExpenseModal still works | VERIFIED | `finance.js` line 129: `showExpenseBreakdownModal(name, { mode: 'project' })` |
| 7 | showServiceExpenseBreakdownModal no longer exists as an export | VERIFIED | Zero grep hits for `showServiceExpenseBreakdownModal` across entire `app/` directory; only one export in expense-modal.js |
| 8 | No dead window functions (_closeServiceExpenseBreakdownModal, _switchSvcExpBreakdownTab) | VERIFIED | Zero grep hits for `_closeServiceExpenseBreakdownModal` or `_switchSvcExpBreakdownTab` anywhere in codebase |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/expense-modal.js` | Unified showExpenseBreakdownModal(identifier, options) with mode branching; single export | VERIFIED | 356 lines; single `export async function showExpenseBreakdownModal`; mode branch at lines 27-45; shared display logic lines 51-311; window registrations for `_closeExpenseBreakdownModal`, `_switchExpenseBreakdownTab`, `_toggleExpenseCategory` only |
| `app/views/service-detail.js` | Updated import and window.showServiceExpenseModal call site | VERIFIED | Line 10: `import { showExpenseBreakdownModal } from '../expense-modal.js'`; lines 860-865: call passes `{ mode: 'service', displayName: currentService.service_name, budget: currentService.budget }`; destroy() at line 224 deletes `window.showServiceExpenseModal` |
| `app/views/project-detail.js` | window.showExpenseModal passes { mode: 'project' } | VERIFIED | Line 781: `showExpenseBreakdownModal(currentProject.project_name, { mode: 'project' })` |
| `app/views/finance.js` | window.showProjectExpenseModal passes { mode: 'project' } | VERIFIED | Line 129: `showExpenseBreakdownModal(name, { mode: 'project' })` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/views/service-detail.js` | `app/expense-modal.js` | `import { showExpenseBreakdownModal }` | WIRED | Line 10 import confirmed; line 861 call confirmed |
| `app/expense-modal.js` | Firestore `pos` collection | `where('service_code', '==', identifier)` when mode === 'service' | WIRED | Line 31 confirmed |
| `app/expense-modal.js` | Firestore `transport_requests` collection | `where('service_code', '==', identifier)` when mode === 'service' | WIRED | Line 32 confirmed — TRs were missing from old service implementation; now included |
| `app/views/project-detail.js` | `app/expense-modal.js` | `import { showExpenseBreakdownModal }` | WIRED | Line 8 import; line 781 call with `{ mode: 'project' }` |
| `app/views/finance.js` | `app/expense-modal.js` | `import { showExpenseBreakdownModal }` | WIRED | Line 8 import; line 129 call with `{ mode: 'project' }` |

### Requirements Coverage

No formal requirement IDs declared for this phase (technical fix phase).

### Anti-Patterns Found

None. No TODO/FIXME/PLACEHOLDER comments in `app/expense-modal.js`. No stub implementations. No empty handlers. No dead window function registrations.

### Human Verification Required

#### 1. Service Expense Modal Visual Rendering

**Test:** Navigate to any service detail page. Click the expense total figure (or the Expense Breakdown button).
**Expected:** Modal opens with service name in the header; three scorecards show "Material Purchases", "Transport Fees", "Subcon Cost" with peso amounts; tabs show "By Category" and "Transport Fees"; By Category tab shows collapsible rows per category.
**Why human:** Cannot verify DOM rendering and live Firestore query results programmatically; requires a browser session against the Firebase project.

#### 2. Project Expense Modal Regression Check

**Test:** Navigate to any project detail page. Click the expense figure.
**Expected:** Modal behavior unchanged from before phase 36 — same scorecard layout, budget fetched from Firestore projects collection, By Category / Transport Fees tabs, collapsible rows.
**Why human:** Requires live data to confirm project mode query path produces correct results.

#### 3. Finance View Expense Modal Regression Check

**Test:** Open Finance view. Navigate to a tab that shows project expense data. Trigger a project expense modal.
**Expected:** `window.showProjectExpenseModal` fires, calls `showExpenseBreakdownModal(name, { mode: 'project' })`, modal renders correctly.
**Why human:** Requires live Firestore data to confirm no regression in Finance view rendering.

### Gaps Summary

No gaps. All 8 must-have truths are verified by static code inspection:

- The `showServiceExpenseBreakdownModal` export is fully deleted from `app/expense-modal.js` (confirmed by grep returning zero results).
- The unified `showExpenseBreakdownModal` has exactly one export path, correctly branches on `mode`, and uses identical display HTML for both modes.
- All three call sites pass the correct mode option.
- Transport requests are now queried by `service_code` in the service branch — the bug from the old implementation (TRs entirely omitted for services) is resolved at the code level.
- No dead window function registrations remain.

The three human verification items are confirmation-of-behavior checks, not blocking gaps — the static wiring is complete and correct.

---

_Verified: 2026-02-23T04:00:00Z_
_Verifier: Claude (gsd-verifier)_
