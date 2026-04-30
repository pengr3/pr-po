---
phase: 72-add-paid-and-remaining-payable-to-project-service-financial-summary-cards-with-clickable-refresh
plan: "01"
subsystem: project-detail, service-detail
tags: [financial-summary, rfp-payables, paid, remaining-payable, refresh-modal]
dependency_graph:
  requires: [app/expense-modal.js, rfps collection]
  provides: [Paid/Remaining Payable cells in Financial Summary cards, refresh-to-modal button]
  affects: [app/views/project-detail.js, app/views/service-detail.js]
tech_stack:
  added: []
  patterns: [RFP payables query via getDocs+where, conditional card cell rendering, window function lifecycle]
key_files:
  created: []
  modified:
    - app/views/project-detail.js
    - app/views/service-detail.js
decisions:
  - "RFP query uses project_code (not project_name) for projects and service_code for services — consistent with expense-modal.js pattern"
  - "Cells hidden when hasRfps === false to avoid misleading zero display on projects/services with no RFP activity"
  - "Refresh button changed to refreshAndShowExpenseModal — single click refreshes data and opens Financial Breakdown modal"
  - "destroy() resets all three new fields (totalPaid, remainingPayable, hasRfps) to prevent stale data leaks across navigation"
  - "Voided payments excluded via r.status !== 'voided' filter — consistent with expense-modal.js Phase 69 reference implementation"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-11"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Phase 72 Plan 01: Add Paid/Remaining Payable to Financial Summary Cards Summary

**One-liner:** Extended project-detail and service-detail Financial Summary cards with RFP-derived Paid/Remaining Payable cells and refresh-to-modal button behavior.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend project-detail.js with Paid/Remaining Payable and refresh-to-modal | 90576ac | app/views/project-detail.js |
| 2 | Extend service-detail.js with Paid/Remaining Payable and refresh-to-modal | d6124e9 | app/views/service-detail.js |

## What Was Built

Both Project Detail and Service Detail Financial Summary cards now include:

1. **Paid cell** — shows sum of non-voided payment_records amounts across all RFPs for the project/service, styled green always
2. **Remaining Payable cell** — shows total amount_requested minus total paid; styled red when > 0, green when 0 (fully paid)
3. Both cells are hidden when no RFPs exist (`hasRfps === false`) to prevent confusing zero displays
4. **Refresh button** now calls `refreshAndShowExpenseModal` / `refreshAndShowServiceExpenseModal` — refreshes expense data (silent, no toast) then immediately opens the Financial Breakdown modal

## Implementation Notes

- RFP query uses `project_code` field (not `project_name`) for projects, `service_code` for services — matching Phase 69 expense-modal.js reference implementation
- State objects extended with `totalPaid`, `remainingPayable`, `hasRfps` fields (defaulting to 0/false)
- destroy() resets all new fields to prevent stale data on navigation between projects/services
- `refreshExpense(true)` / `refreshServiceExpense(true)` called with silent=true so refresh happens without success toast before modal opens

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All new fields are wired to live RFP Firestore data.

## Awaiting Verification

Task 3 (checkpoint:human-verify) requires browser verification:
- Navigate to a Project/Service detail page WITH RFPs — verify Paid and Remaining Payable cells appear
- Navigate to a Project/Service WITHOUT RFPs — verify cells are hidden
- Click Refresh button — verify data refreshes and Financial Breakdown modal opens
- Navigate between projects WITH and WITHOUT RFPs — verify no stale data leaks

## Self-Check: PASSED

Files modified confirmed:
- app/views/project-detail.js — contains `rfpTotalRequested`, `refreshAndShowExpenseModal`, `hasRfps`, `remainingPayable`
- app/views/service-detail.js — contains `rfpTotalRequested`, `refreshAndShowServiceExpenseModal`, `hasRfps`, `remainingPayable`

Commits confirmed:
- 90576ac — feat(72-01): extend project-detail Financial Summary
- d6124e9 — feat(72-01): extend service-detail Financial Summary
