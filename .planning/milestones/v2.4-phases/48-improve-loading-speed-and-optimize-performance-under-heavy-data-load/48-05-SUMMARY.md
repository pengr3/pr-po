---
phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load
plan: 05
subsystem: ui
tags: [performance, firestore, caching, procurement, tab-switching]

# Dependency graph
requires:
  - phase: 48-04
    provides: TTL cache guards on loadProjects/loadServicesForNewMRF/loadSuppliers in procurement.js

provides:
  - loadSuppliers() renders cached data immediately on tab switch (no stuck skeleton)
  - loadMRFs() dedup guard prevents duplicate onSnapshot listeners across tab switches
  - loadPOTracking() dedup guard prevents duplicate onSnapshot listeners across tab switches
  - loadPRPORecords() TTL cache eliminates loading overlay flash on revisit within 5 minutes

affects: [procurement.js, tab-switching performance, UAT-3, UAT-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Listener dedup guard: boolean flag (_mrfListenerActive, _poTrackingListenerActive) checked at function entry; set true before registering onSnapshot; reset to false in destroy()"
    - "TTL early-return with render: TTL guard that returns early MUST call the relevant render function first to paint cached data onto fresh DOM"
    - "getDocs TTL cache: allPRPORecords.length > 0 AND timestamp freshness check before getDocs; renders synchronously on cache hit"

key-files:
  created: []
  modified:
    - app/views/procurement.js

key-decisions:
  - "loadSuppliers() TTL early-return calls renderSuppliersTable() before return — without this, cached suppliersData[] existed but fresh DOM had no rows after tab switch (stuck skeleton bug)"
  - "Dedup guards use module-level booleans (not listener ref checks) — simpler than checking if listeners array contains the specific listener, and destroy() already unsubscribes all listeners"
  - "loadPRPORecords() cache guard placed before showLoading(true) — ensures loading overlay never appears on cache hit, preserving the instant-feel UX"
  - "_prpoRecordsCachedAt set inside try block after successful data load — failure leaves timestamp at 0 so next call always re-fetches"

patterns-established:
  - "TTL early-return pattern: always call render function before returning when DOM is fresh but in-memory data is valid"
  - "Listener dedup pattern: boolean flag checked at function entry, set before listener registration, reset in destroy()"

requirements-completed: [PERF-02, PERF-05]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 48 Plan 05: Fix TTL Cache Early-Return Bugs and Listener Leaks Summary

**TTL early-return render fix and onSnapshot dedup guards eliminating stuck skeleton and duplicate listener accumulation in procurement tab switching**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-01T05:30:44Z
- **Completed:** 2026-03-01T05:32:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `loadSuppliers()` TTL early-return now calls `renderSuppliersTable()` so cached supplier data paints onto the fresh DOM after tab switch (fixes stuck skeleton — UAT Test 3)
- `loadMRFs()` dedup guard (`_mrfListenerActive`) prevents duplicate `onSnapshot` registrations on every tab switch; re-renders from `cachedAllMRFs` on dedup hit
- `loadPOTracking()` dedup guard (`_poTrackingListenerActive`) prevents duplicate `onSnapshot` registrations; re-renders from `poData` on dedup hit
- `loadPRPORecords()` TTL cache guard renders from `allPRPORecords` without `showLoading()` or Firestore fetches on revisit within 5 minutes (fixes loading overlay flash — UAT Test 7)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix TTL early-return rendering and add listener dedup guards** - `1cadaa9` (fix)
2. **Task 2: Add in-memory caching to loadPRPORecords** - `b4e1f99` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `app/views/procurement.js` — Added `_mrfListenerActive`, `_poTrackingListenerActive`, `_prpoRecordsCachedAt` state variables; fixed `loadSuppliers()` TTL early-return; added dedup guards to `loadMRFs()` and `loadPOTracking()`; added TTL cache to `loadPRPORecords()`; updated `destroy()` to reset all new flags and timestamps

## Decisions Made

- `loadSuppliers()` TTL early-return calls `renderSuppliersTable()` before `return` — without this, `suppliersData[]` had data but the fresh DOM after tab switch had no rows (root cause of stuck skeleton)
- Dedup guards use module-level booleans, not listener reference checks — simpler, and `destroy()` already handles unsubscribing all listeners in the `listeners[]` array
- `loadPRPORecords()` cache guard placed before `showLoading(true)` — ensures loading overlay never appears on cache hit
- `_prpoRecordsCachedAt` set inside `try` block after successful load — failure leaves timestamp at 0, next call always re-fetches fresh data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 procurement view load functions now use proper caching patterns
- Phase 48 gap-closure complete: UAT Tests 3 and 7 should now pass
- No blockers for subsequent phases

## Self-Check

**Files verified:**
- `app/views/procurement.js` modified (confirmed via git log)

**Commits verified:**
- `1cadaa9` — fix(48-05): fix TTL early-return rendering and add listener dedup guards
- `b4e1f99` — fix(48-05): add in-memory TTL caching to loadPRPORecords

## Self-Check: PASSED

---
*Phase: 48-improve-loading-speed-and-optimize-performance-under-heavy-data-load*
*Completed: 2026-03-01*
