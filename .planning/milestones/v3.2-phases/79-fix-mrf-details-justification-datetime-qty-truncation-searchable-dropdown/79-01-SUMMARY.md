---
phase: 79-fix-mrf-details-justification-datetime-qty-truncation-searchable-dropdown
plan: "01"
subsystem: procurement-view
tags: [ui, mrf-details, css, fix]
dependency_graph:
  requires: []
  provides: [justification-display, date-submitted-display, qty-min-width]
  affects: [app/views/procurement.js, styles/views.css]
tech_stack:
  added: []
  patterns: [conditional-template-literal, css-min-width]
key_files:
  modified:
    - app/views/procurement.js
    - styles/views.css
decisions:
  - "Used !isNew conditional so new-MRF creation panel is completely unchanged"
  - "grid-column: 1 / -1 on Justification cell to span full 2-column grid"
  - "escapeHTML() used directly on mrf.date_submitted (plain YYYY-MM-DD string) — no date formatting"
  - "min-width: 60px chosen to accommodate 5-digit quantities without excessive column widening"
metrics:
  duration_minutes: 5
  completed: "2026-04-27"
  tasks_completed: 2
  files_modified: 2
---

# Phase 79 Plan 01: Add Justification + Date Submitted to MRF Details; Fix QTY Min-Width Summary

**One-liner:** Added Date Submitted and Justification read-only fields to the MRF Details info grid for existing MRFs, and set min-width: 60px on QTY inputs to prevent 5-digit number truncation.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Add Justification and Date Submitted to renderMRFDetails() info grid | Done | f2d0eb0 |
| 2 | Add min-width: 60px to .table-input-sm in views.css | Done | f2d0eb0 |

## What Was Done

### Task 1 — renderMRFDetails() in procurement.js

Inside the 2-column info grid in `renderMRFDetails()` (line ~3009), two new read-only cells were inserted immediately before the grid's closing `</div>`, wrapped in `${!isNew ? ... : ''}`:

- **Date Submitted** — single column cell displaying `mrf.date_submitted` (YYYY-MM-DD string) or `—` for legacy MRFs
- **Justification** — full-width cell (`grid-column: 1 / -1`) displaying `mrf.justification` with `white-space: pre-wrap` to preserve line breaks, or `—` for legacy MRFs

Both cells use `escapeHTML()` which is already in scope. The `!isNew` guard ensures the new-MRF creation form is completely unaffected.

### Task 2 — styles/views.css

Added `min-width: 60px` to the existing `.items-table .table-input-sm` rule at line 278. This ensures the Qty column input is always wide enough to display 5-digit quantities (e.g. 10000) without truncation.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- app/views/procurement.js — modified, contains `mrf.justification` at line 3073
- styles/views.css — modified, contains `min-width: 60px` at line 280
- Commit f2d0eb0 — verified present in git log
