---
plan: 92-02
phase: 92-projects-tab-status-scorecards
status: complete
completed: 2026-05-18
commits:
  - 39657eb
key-files:
  modified:
    - app/views/home.js
---

# Plan 92-02 Summary: Remove Projects Chart from Home Page

## What Was Built

Removed the Projects status chart from the Home page (`app/views/home.js`) as specified in D-10.

## Changes Made

### app/views/home.js — 4 deletions

1. **cachedStats**: Removed `projectsByStatus: null` field from the object literal; remaining fields unchanged
2. **`projectsCardHtml()` function**: Deleted entirely (was ~14 lines returning the Projects stat card with Chart.js canvas)
3. **`render()`**: Deleted the conditional block `if (mode === 'projects' || mode === 'both') { statsContent += projectsCardHtml(); }`
4. **`loadStats()`**: Deleted the `// ---- Projects card (D-02) ----` if-block (the `projectsListener` onSnapshot on the `projects` collection, ~20 lines)

### What was preserved (untouched)
- `UNIFIED_STATUS_OPTIONS` local copy (still used by services onSnapshot)
- `renderStatusBreakdown()`, `buildStatusBreakdownContainer()`, `getBarColor()`, `getChartSizeClass()`
- `HIGHLIGHTED_STATUS_COLORS`, `MONOCHROMATIC_STATUS_COLORS`, `MONOCHROMATIC_FALLBACK`
- `procurementCardHtml()` and all 3 procurement onSnapshot blocks (MRF, PR, PO)
- `servicesCardHtml()` and the services onSnapshot block
- `destroy()` (chart teardown still correct for services charts)

## Deviations

None. All 4 changes applied exactly as specified in the plan.

## Self-Check: PASSED

- `projectsCardHtml` not found in home.js ✓
- `projectsListener` not found in home.js ✓
- `projectsByStatus` not found in home.js ✓
- `stat-projects-status` not found in home.js ✓
- `servicesCardHtml` still present (2 occurrences — function def + render call) ✓
- `renderStatusBreakdown` still present (3 occurrences — services chart calls) ✓
- `procurementCardHtml` still present (2 occurrences — function def + render call) ✓
