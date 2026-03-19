---
phase: quick
plan: 260319-gkf
subsystem: procurement-ui
tags: [color, fill, badge-consistency, getPOPaymentFill]
dependency_graph:
  requires: []
  provides: [badge-aligned PO payment fill colors]
  affects: [MRF Records PO column, PO Tracking table]
tech_stack:
  added: []
  patterns: [badge-palette light-variant colors at 0.7 opacity for data-driven cell fills]
key_files:
  modified:
    - app/views/procurement.js
decisions:
  - "Use light-variant badge hex values (#f8d7da, #d4edda, #fff3cd) at 0.7 opacity rather than computing RGB from CSS variables — keeps logic in JS without runtime CSS parsing"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-19"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260319-gkf: Align PO Payment Fill Colors with Status Badge Palette

**One-liner:** Replaced Google-brand colors in getPOPaymentFill with danger/success/warning badge-light variants at 0.7 opacity for visual consistency across the app.

## What Was Done

Updated three color/opacity pairs inside `getPOPaymentFill()` in `app/views/procurement.js` (line 260):

| State | Old color | Old opacity | New color | New opacity | Matches |
|-------|-----------|-------------|-----------|-------------|---------|
| No RFPs | `#ea4335` | 0.20 | `#f8d7da` | 0.7 | Rejected/danger badges |
| Fully paid | `#34a853` | 0.35 | `#d4edda` | 0.7 | Approved/success badges |
| Partially paid | `#fbbc04` | 0.35 | `#fff3cd` | 0.7 | Pending/warning badges |

No logic was changed — only `color` and `opacity` values in the three return objects. Percentage calculation, tooltip content, and fill-width logic are untouched.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update getPOPaymentFill colors to badge palette | e369df7 | app/views/procurement.js |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- app/views/procurement.js modified: FOUND
- commit e369df7: FOUND
- #f8d7da, #d4edda, #fff3cd present in getPOPaymentFill: FOUND
- #ea4335, #34a853, #fbbc04 absent from getPOPaymentFill: CONFIRMED
