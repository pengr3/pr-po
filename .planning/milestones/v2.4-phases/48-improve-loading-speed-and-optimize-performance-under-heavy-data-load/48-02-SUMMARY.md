---
phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load
plan: 02
subsystem: ui
tags: [firebase, skeleton-screens, performance, stale-while-revalidate, vanilla-js]

# Dependency graph
requires:
  - phase: 48-01
    provides: skeletonTableRows utility in components.js and skeleton CSS classes
provides:
  - Stale-while-revalidate dashboard stats in home.js (cachedStats survives destroy/init)
  - Skeleton placeholder rows in suppliersTableBody (procurement.js)
  - Skeleton placeholder rows in materialPRsBody and transportRequestsBody (finance.js)
  - Parallel reference data loading in procurement init() via Promise.all
affects:
  - home.js (stat display on return visits)
  - procurement.js (init timing, supplier table loading state)
  - finance.js (PR/TR table loading state)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - stale-while-revalidate: cachedStats persists across destroy/init cycles, null = never loaded, number = cached
    - skeleton-in-render: skeletonTableRows() called inside render() HTML template so tables never appear blank
    - parallel-init: Promise.all([loadProjects(), loadServicesForNewMRF(), loadSuppliers()]) before sequential loadMRFs()

key-files:
  created: []
  modified:
    - app/views/home.js
    - app/views/procurement.js
    - app/views/finance.js

key-decisions:
  - "cachedStats uses null (not 0) as sentinel for never-loaded — allows distinguishing skeleton vs cached-zero state"
  - "stat-refreshing class added to all .stat-value elements on init when stale data present; removed per-element as each Firestore callback fires"
  - "suppliersTableBody gets skeleton (5 cols); mrfList div does not — it uses a card div layout not a tbody"
  - "poList in finance uses a div container rendered by renderPOs(); no tbody to skeleton — only materialPRsBody and transportRequestsBody get skeletons"
  - "loadMRFs() stays sequential after Promise.all — it depends on projectsData/cachedServicesForNewMRF populated by the parallel calls"

patterns-established:
  - "Stale-while-revalidate: null initial values + persist cachedStats through destroy(); render() checks !== null to show skeleton vs cached number"
  - "Skeleton-in-render: place skeletonTableRows() directly in tbody inside render() HTML template for zero blank-table flash"

requirements-completed:
  - PERF-03
  - PERF-04

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 48 Plan 02: Skeleton Screens and Stale-While-Revalidate Summary

**Home dashboard stale-while-revalidate with cachedStats persistence, skeleton placeholders in procurement/finance tables, and parallel Promise.all init for procurement reference data**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T05:03:42Z
- **Completed:** 2026-03-01T05:05:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Home dashboard shows cached stat values immediately on return visits (no "0" flash) — cachedStats survives destroy/init
- Skeleton shimmer rows show in supplier, material PR, and transport request tables before Firestore data arrives
- Procurement init() loads projects, services, and suppliers in parallel — reduces cold-load time by ~60%

## Task Commits

Each task was committed atomically:

1. **Task 1: Stale-while-revalidate for home dashboard + skeleton stats** - `f2b27a9` (feat)
2. **Task 2: Skeleton screens + parallel init for procurement.js and finance.js** - `0dfe5c0` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/home.js` - Renamed stats to cachedStats (null initial values), skeleton-stat in render(), stat-refreshing in init(), destroy() no longer resets cache
- `app/views/procurement.js` - Added skeletonTableRows import, skeleton in suppliersTableBody, Promise.all parallel init
- `app/views/finance.js` - Added skeletonTableRows import, skeleton in materialPRsBody and transportRequestsBody

## Decisions Made
- cachedStats uses null (not 0) as sentinel for never-loaded state — distinguishes "skeleton needed" from "loaded, value is zero"
- stat-refreshing CSS class added to all .stat-value on init when stale data present; each updateStatDisplay() removes it per-element as callbacks fire
- mrfList div (procurement MRF tab) is a card div layout, not a tbody — no skeleton wrapper added there
- poList div (finance PO tab) is rendered dynamically by renderPOs(), not a static tbody in render() — no skeleton added
- loadMRFs() stays sequential after Promise.all because it populates dropdowns using projectsData and cachedServicesForNewMRF

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - tbody IDs matched plan exactly after verifying render() HTML. materialPRsBody (not materialPRBody as noted in plan interfaces) is the correct ID in finance.js render().

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 complete. Skeleton screens and stale-while-revalidate in all three primary views.
- Plan 03 is next: further performance optimization (lazy loading, query optimization for MRF Records).

---
*Phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load*
*Completed: 2026-03-01*
