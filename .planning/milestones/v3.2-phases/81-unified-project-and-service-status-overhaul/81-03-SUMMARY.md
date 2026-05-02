---
phase: 81-unified-project-and-service-status-overhaul
plan: 03
subsystem: ui
tags: [chart.js, home-dashboard, status-charts, edit-history, css]

# Dependency graph
requires:
  - phase: 77.1-revise-home-stats-to-charts-and-graphs
    provides: Chart.js horizontal bar chart infrastructure (renderStatusBreakdown, chartInstances, color palette, chart size classes)
provides:
  - Home dashboard with single unified status chart per entity type (Projects: 1, Services: 2)
  - Updated 10-option color palette for new unified statuses (For Inspection through Loss)
  - New .hs-chart-status CSS class (320px desktop / 360px mobile) for 10-bar charts
  - Edit history modal showing 'Status' for project_status changes
  - Edit history modal showing 'Internal Status (Legacy)' for orphaned internal_status historical records
  - Fresh cachedStats literal with 3 status keys (projectsByStatus, servicesByStatusOneTime, servicesByStatusRecurring)
affects: [81-01, 81-02, home-view, edit-history-modal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single chart per entity type using UNIFIED_STATUS_OPTIONS — replaces dual internal/project chart pairs"
    - "Fresh cachedStats object literal on code change — prevents stale shape on hot-reload (REVIEWS Concern 4)"
    - "CSS size class .hs-chart-status in views.css — adjacent to related home chart styles in hero.css (orphaned rules kept for zero-risk cleanup)"

key-files:
  created: []
  modified:
    - app/views/home.js
    - app/edit-history.js
    - styles/views.css

key-decisions:
  - "Chart size class added to styles/views.css (not hero.css) per plan spec — hero.css retains old .hs-chart-internal/.hs-chart-project rules as harmless dead CSS"
  - "Internal Status (Legacy) label retained in edit-history.js fieldLabels (vs removing it per CONTEXT D-06 original suggestion) — per REVIEWS Suggestion 3: historical records render friendly label, not raw key"
  - "getChartSizeClass() simplified to always return hs-chart-status — unified status chart uses one class regardless of containerId"
  - "services onSnapshot counter uses project_status field (not internal_status) per D-04 — internal_status ignored entirely"

patterns-established:
  - "UNIFIED_STATUS_OPTIONS: single array of 10 statuses replaces two separate constant arrays per entity file"
  - "cachedStats fresh literal pattern: object literal fully redeclared (not spread/merged) so stale browser memory cannot retain old key shape after deployment"

requirements-completed:
  - D-05
  - D-06

# Metrics
duration: 15min
completed: 2026-04-27
---

# Phase 81 Plan 03: Home Dashboard Unified Status Charts + Edit History Label Fix Summary

**Home dashboard collapsed from 6 charts (2 Projects + 4 Services) to 3 charts (1 Projects + 2 Services) using 10-option UNIFIED_STATUS_OPTIONS, with new .hs-chart-status CSS class (320px/360px) eliminating label clipping, and edit-history labels updated to 'Status' / 'Internal Status (Legacy)'**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-27
- **Completed:** 2026-04-27
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Replaced dual Internal Status + Project Status chart sections per entity with a single Status chart per entity using all 10 UNIFIED_STATUS_OPTIONS (D-05)
- Added `.hs-chart-status` CSS size class (320px desktop / 360px mobile) to styles/views.css so 10 horizontal bars and long labels like "Proposal Under Client Review" render without clipping at 1366x768 or mobile (REVIEWS Concern 1 closed)
- Replaced stale 8-key cachedStats literal with fresh 6-key literal (projectsByStatus, servicesByStatusOneTime, servicesByStatusRecurring + 3 procurement keys) so old shape cannot survive hot-reload (REVIEWS Concern 4 closed)
- Updated color palette to cover all 10 unified statuses: 4 highlighted (brand colors) + 6 monochromatic (graduated slate)
- Renamed `project_status` fieldLabel in edit-history.js from 'Project Status' to 'Status' (D-06)
- Renamed `internal_status` fieldLabel from 'Internal Status' to 'Internal Status (Legacy)' — REVIEWS Suggestion 3 fix

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate home.js — single chart per entity, new color palette, new .hs-chart-status size class wired in CSS + JS** - `d660d01` (feat)
2. **Task 2: Update edit-history.js field-label map** - `fb81daa` (feat)

## Files Created/Modified

- `app/views/home.js` - Replaced INTERNAL_STATUS_OPTIONS + PROJECT_STATUS_OPTIONS with UNIFIED_STATUS_OPTIONS; collapsed projectsCardHtml/servicesCardHtml from 6 chart sections to 3; rewrote projects/services onSnapshot to use single byStatus counters; fresh cachedStats literal; updated color palette
- `app/edit-history.js` - Changed project_status label to 'Status'; changed internal_status label to 'Internal Status (Legacy)'
- `styles/views.css` - Added .hs-chart-status rule (320px desktop, 360px mobile) for 10-bar unified status charts

## Decisions Made

- **Chart CSS location:** Added `.hs-chart-status` to `styles/views.css` per plan spec. The existing `.hs-chart-internal` and `.hs-chart-project` rules in `styles/hero.css` were left as harmless dead CSS — no JS consumer references them after this plan. Sweeping them out would require a hero.css edit not in scope.
- **Internal Status (Legacy) retained:** CONTEXT.md D-06 suggested removing the `internal_status` entry from the fieldLabels map as "unnecessary clutter." The REVIEWS doc (Suggestion 3) correctly noted that removing it causes raw key ('internal_status') to show in historical edit-history records instead of a friendly label. Resolution: keep the entry but rename to 'Internal Status (Legacy)' — zero cost, auditor-friendly.
- **getChartSizeClass simplification:** Old function branched on containerId suffix (`-internal` → 4 bars, else 7 bars). New function always returns `'hs-chart-status'` — unified status is always 10 bars regardless of entity type or section.

## Deviations from Plan

### Deviation: CSS file location discovery

- **Found during:** Task 1 (reading plan spec)
- **Issue:** Plan specified adding `.hs-chart-status` to `styles/views.css`, but existing `.hs-chart-internal` and `.hs-chart-project` rules live in `styles/hero.css`. The automated verify script in the plan explicitly checks `styles/views.css`.
- **Resolution:** Added `.hs-chart-status` to `styles/views.css` as specified by the plan and its verify script. The existing hero.css rules remain as orphaned dead CSS — this is explicitly acceptable per the plan's Edit 10 note ("The legacy size classes hs-chart-internal / hs-chart-project may still be PRESENT in styles/views.css... they cause no harm").
- **Impact:** No functional impact — both files are loaded in the SPA. Slightly scattered chart CSS (hero.css for old, views.css for new), but the plan explicitly authorized this split.

---

**Total deviations:** 1 (discovery/documentation; plan-authorized resolution)
**Impact on plan:** Zero functional impact. All automated verifications pass.

## Issues Encountered

None — both tasks executed cleanly on first attempt.

## Known Stubs

None — all data is live from Firestore onSnapshot callbacks. Charts render with real data on first snapshot fire.

## Next Phase Readiness

- Home dashboard now reflects the unified status model — ready for Plans 81-01 and 81-02 to ship the actual status field changes to projects.js / services.js
- Edit history modal will show correct labels for any new project_status changes written by 81-01/81-02
- `styles/hero.css` dead rules (`.hs-chart-internal`, `.hs-chart-project`) can be swept in a future cleanup phase — currently harmless

---
*Phase: 81-unified-project-and-service-status-overhaul*
*Completed: 2026-04-27*
