---
phase: 69-revise-expense-modal-scoreboards-to-add-remaining-payable-tracking
plan: 01
subsystem: expense-modal
tags: [expense-modal, rfp, payables, scoreboard, ui]
requirements: [EXPPAY-01, EXPPAY-02]

dependency_graph:
  requires: []
  provides: [remaining-payable-scoreboard, projected-cost-label]
  affects: [finance.js, project-detail.js, service-detail.js]

tech_stack:
  added: []
  patterns:
    - getDocs query on rfps collection filtered by project_code (project mode) or service_code (service mode)
    - payment_records.reduce() pattern for summing paid amounts (mirrors finance.js)
    - Conditional CSS styling (red/neutral) based on remainingPayable > 0

key_files:
  created: []
  modified:
    - app/expense-modal.js

decisions:
  - Use separate projectSnapshot2 query for project_code lookup to avoid scoping issue with `project` const inside the else block
  - Project mode queries rfps by project_code (not project_name) — RFP documents store project_code, not project_name
  - Re-fetch project doc in RFP block rather than restructuring existing query scope (minimal change, correct result)

metrics:
  duration_seconds: 53
  completed_date: "2026-03-25"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 69 Plan 01: Revise Expense Modal Scoreboards — Remaining Payable Tracking Summary

**One-liner:** Added RFP-derived "Remaining Payable" card alongside renamed "Projected Cost" in expense modal Row 3 using project_code/service_code queries on the rfps collection.

## What Was Built

Modified `app/expense-modal.js` (single file) with three targeted changes:

1. **RFP query block** inserted after the existing PO/TR query block. Service mode queries `rfps` by `service_code`. Project mode re-fetches the project document to get `project_code`, then queries `rfps` by `project_code`. Both branches push raw data into `rfpsForPayable[]`, compute `totalRequested` and `totalPaid` via `payment_records.reduce()`, and derive `remainingPayable = totalRequested - totalPaid`.

2. **"Total Cost" label renamed to "Projected Cost"** — only the display string changed; the `totalCost` JavaScript variable is untouched.

3. **Row 3 converted from single full-width card to 2-column grid.** Left card: Projected Cost (blue border `#3b82f6`, background `#eff6ff`). Right card: Remaining Payable with red styling (`#fca5a5` border, `#fef2f2` bg) when `remainingPayable > 0`, neutral (`#e2e8f0` border, `#ffffff` bg) when zero or no RFPs.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename Total Cost + add Remaining Payable card | be5c314 | app/expense-modal.js |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Scope] Re-fetch project doc for project_code lookup**
- **Found during:** Task 1
- **Issue:** The plan's interface note stated "`project` variable available after the projectSnapshot query," but `project` is declared as `const` inside the `else` block (lines 34-45) and is not accessible in the subsequent RFP block.
- **Fix:** Added `projectSnapshot2` query to fetch the project document again within the RFP block. This incurs one additional Firestore read in project mode but avoids any structural refactor.
- **Files modified:** app/expense-modal.js
- **Commit:** be5c314

## Verification

All 14 automated checks from the plan pass:
- `collection(db, 'rfps')` present
- `where('project_code', '==', projectCode)` present (not project_name)
- `where('service_code', '==', identifier)` with rfps present
- `totalRequested`, `remainingPayable` variables present
- `payment_records` with `.reduce` present
- `Projected Cost` label present
- `Remaining Payable` label present
- `grid-template-columns: 1fr 1fr` present
- `#fca5a5`, `#fef2f2`, `#ef4444` conditional colors present
- `Total Cost` string absent from display labels
- No `where('project_name', '==', projectCode)` on rfps query

## Known Stubs

None. All data is wired to live Firestore queries. The Remaining Payable card shows real-time computed values from the `rfps` collection.

## Self-Check: PASSED

- File exists: `app/expense-modal.js` — FOUND
- Commit exists: `be5c314` — FOUND
- All 14 verification checks passed
