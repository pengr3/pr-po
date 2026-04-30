---
phase: 59-improve-tr-display
plan: 05
subsystem: ui
tags: [procurement, mrf-records, my-requests, status-badge, caching, firestore]

# Dependency graph
requires:
  - phase: 59-improve-tr-display
    provides: sortable headers in My Requests (plan 03) and UAT gap identification (gap closure plan 05)
provides:
  - TR finance_status badges use status-badge CSS class in both mrf-records.js and procurement.js
  - Sub-data Map cache in createMRFRecordsController eliminates Firestore re-fetch on sort/filter/page-change
  - Module-level _prpoSubDataCache in procurement.js eliminates Firestore re-fetch on sort/filter/page-change
affects: [mrf-records, procurement, my-requests, mrf-records-tab]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-row sub-data Map cache keyed by mrf.id with fresh-load invalidation]

key-files:
  created: []
  modified:
    - app/views/mrf-records.js
    - app/views/procurement.js

key-decisions:
  - "Cache key is mrf.id (Firestore document ID) not mrf.mrf_id — consistent with onSnapshot pattern"
  - "Loading placeholder guarded by _subDataCache.size === 0 so only shown on cold start, not sort/filter/page"
  - "Cache cleared in load() and destroy() — invalidated on fresh MRF fetch and on view navigation"
  - "procurement.js Transport block stores trCost separately from totalCost to allow items_json fallback calculation"

patterns-established:
  - "TR badge pattern: status-badge CSS class + getStatusClass() — no inline background/color styles"
  - "Sub-data cache pattern: Map keyed by mrf.id, cleared on fresh load, checked before Firestore, stored after fetch"

requirements-completed: [TR-01, TR-02, SORT-01]

# Metrics
duration: 3min
completed: 2026-03-05
---

# Phase 59 Plan 05: TR Badge CSS Fix and Sub-Data Cache Summary

**TR finance_status badges switched to status-badge CSS class and per-row sub-data Map cache added to eliminate loading flash on sort/filter/page-change in My Requests and Procurement MRF Records**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-05T09:11:19Z
- **Completed:** 2026-03-05T09:14:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced hand-rolled inline-style TR badge spans (badgeColors map + bc variable) with `<span class="status-badge {getStatusClass(financeStatus)}">` in both mrf-records.js and procurement.js — TR badges now visually match all other status badges
- Added `_subDataCache` Map inside `createMRFRecordsController` closure: cache hit skips Firestore PR/PO/TR fetches; cache cleared on `load()` fresh fetch; loading placeholder only shown when cache is empty
- Added `_prpoSubDataCache` module-level Map in procurement.js: same pattern — guards loading text, caches per-row sub-data, cleared in both `loadPRPORecords()` and `destroy()`

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace inline-style TR badges with status-badge CSS class** - `a2378d6` (fix)
2. **Task 2: Add sub-data cache to eliminate loading flash on sort/filter/page-change** - `0ae367d` (perf)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified

- `app/views/mrf-records.js` - _subDataCache Map in closure, TR badge CSS class fix, cache-guarded loading placeholder
- `app/views/procurement.js` - _prpoSubDataCache module-level Map, TR badge CSS class fix, cache-guarded loading placeholder in renderPRPORecords()

## Decisions Made

- Cache key is `mrf.id` (Firestore document ID) not `mrf.mrf_id` — matches the `onSnapshot` doc.id convention used throughout the codebase
- Loading placeholder guarded by `_subDataCache.size === 0` so it only appears on cold start (initial load), not on sort/filter/page-change where the table is already rendered
- `_prpoSubDataCache` cleared in both `loadPRPORecords()` (new MRF data) and `destroy()` (view navigation) to prevent stale data after re-entry
- In procurement.js Transport block, `trCost` is stored separately from `totalCost` in the cache so the items_json fallback path (which modifies `trCost`) is correctly replicated on cache restoration via the `totalCost = trCost` assignment

## Deviations from Plan

None — plan executed exactly as written. The only structural addition was restoring the HTML-building block (posByPrId indexing, prHtml/poHtml/procStatusHtml construction) outside the cache check so it runs for both cache hit and miss paths, which matches the plan's intent.

## Issues Encountered

During Task 2 for mrf-records.js, the replacement edit accidentally introduced an extra `if (type === 'Material') {` line at the end of the else block (left over from the replacement ending), which was immediately caught by code inspection and removed before commit. The HTML-building section (PRs/POs sub-row construction) was confirmed to be correctly placed after the cache check block so it runs for both cache hits and misses.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 59 all 5 plans complete. Both UAT gaps (TR badge CSS mismatch and sort flash) are resolved. No blockers.

---
*Phase: 59-improve-tr-display*
*Completed: 2026-03-05*
