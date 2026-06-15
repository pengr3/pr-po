---
phase: 40-ui-ux-revisions
plan: 04
subsystem: ui
tags: [mrf, requestor-tracking, shared-module, sub-tabs, firebase-firestore]

# Dependency graph
requires:
  - phase: 40-01
    provides: requestor_name and service_name search fields added to MRF Records in procurement.js
provides:
  - Shared mrf-records.js module with createMRFRecordsController (simpler MRF-level table)
  - My Requests sub-tab in Material Request view showing user's own MRFs
  - Sub-tab routing for mrf-form route with defaultTab: 'form'
affects: [mrf-form, procurement, future-phases-adding-mrf-list-views]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controller pattern: createMRFRecordsController returns {load, filter, destroy} object"
    - "Instance-scoped pagination: window._mrfRecordsGoToPage_{containerId} namespacing prevents cross-instance collisions"
    - "Dynamic import: mrf-form.js uses import('./mrf-records.js') for lazy loading on My Requests tab"
    - "Sub-tab listener cleanup: init() unsubscribes previous sub-tab's listeners before switching"

key-files:
  created:
    - app/views/mrf-records.js
  modified:
    - app/views/mrf-form.js
    - app/router.js

key-decisions:
  - "Simpler MRF-level table for My Requests (not full PR/PO sub-query table) — plan explicitly allowed this; eliminates 300-line async extraction risk and zero regressions in procurement.js"
  - "filterFn option in controller allows My Requests to scope to requestor_name === currentUser without special casing in shared module"
  - "statusFilter: null fetches ALL MRF statuses for My Requests — requestors need to see Pending/Approved too, not just historical statuses"
  - "paginationId defaults to containerId + 'Pagination' — keeps controller API clean while allowing custom override"
  - "Dynamic import('./mrf-records.js') in initMyRequests() — only loads module when user navigates to My Requests tab"

patterns-established:
  - "Sub-tab cleanup pattern: init() checks activeTab before branching, cleans up the OTHER sub-tab's resources first"

requirements-completed: [UX-06]

# Metrics
duration: 25min
completed: 2026-02-25
---

# Phase 40 Plan 04: MRF Tracking for Requestors Summary

**My Requests sub-tab added to Material Request view via shared mrf-records.js controller with per-instance pagination, search, and requestor filter**

## Performance

- **Duration:** 25 min
- **Started:** 2026-02-25T13:02:49Z
- **Completed:** 2026-02-25T13:27:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Created `app/views/mrf-records.js` shared module with `createMRFRecordsController` — instance-scoped state, search/status/urgency filters, pagination namespaced to containerId
- Material Request view now has 2 sub-tabs: "Material Request Form" (default) and "My Requests"
- My Requests tab shows all MRFs where `requestor_name === currentUser.full_name` with search, filter, and pagination
- Tab switching properly cleans up previous sub-tab's listeners/controllers (no listener leaks)
- router.js `defaultTab: 'form'` ensures `#/mrf-form` always opens the form tab

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared MRF Records rendering module** - `4eb2c88` (feat)
2. **Task 2: Add My Requests sub-tab to Material Request view** - `03b9625` (feat)

**Plan metadata:** (created after state update)

## Files Created/Modified

- `app/views/mrf-records.js` - Shared MRF table rendering module with createMRFRecordsController
- `app/views/mrf-form.js` - Updated with sub-tab routing, My Requests tab, activeTab params in render/init/destroy
- `app/router.js` - Added defaultTab: 'form' to mrf-form route

## Decisions Made

- **Simpler My Requests table**: Plan Task 1 described extracting the full Procurement MRF Records table (300 lines, async PR/PO per-row queries). The plan explicitly noted a simpler alternative was acceptable: a table showing only MRF-level data. This was chosen because it eliminates regression risk in a complex function, serves the core requestor need (visibility into their own MRF lifecycle), and procurement.js stays unchanged.
- **filterFn callback**: My Requests uses `filterFn: (mrf) => mrf.requestor_name === userName` to scope results — the shared module doesn't need to know about requestor filtering.
- **statusFilter: null**: My Requests fetches ALL statuses (including Pending, Approved) so requestors can track their MRFs from submission through delivery.
- **Dynamic import**: `import('./mrf-records.js')` in `initMyRequests()` keeps the module lazy — only loaded when the My Requests tab is actually visited.

## Deviations from Plan

### Alternative Approach Taken (Within Plan Scope)

**Task 1: Simpler My Requests table instead of full procurement extraction**
- **Context:** Plan Task 1 explicitly included an "Alternative approach if the extraction proves too complex" note
- **Why taken:** `renderPRPORecords` in procurement.js is ~300 lines with async per-row Firestore queries for PRs and POs; extracting it risks regressions in Procurement MRF Records tab
- **Approach:** Created `mrf-records.js` with a simpler MRF-level table (no PR/PO sub-rows) — still satisfies the user need (tracking MRF lifecycle via status column)
- **procurement.js:** Unchanged — zero regression risk
- **Impact:** My Requests shows MRF status (Pending, PR Generated, Finance Approved, etc.) but not PR/PO IDs inline. This is acceptable since requestors primarily need to know "what happened to my request", not the procurement document IDs.

## Issues Encountered

None - implementation went smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- My Requests tab is functional for all roles that can submit MRFs
- If richer My Requests view (with PR/PO links) is desired in future, mrf-records.js can be enhanced with async sub-row queries
- Procurement.js MRF Records tab is completely unchanged and unaffected

---
*Phase: 40-ui-ux-revisions*
*Completed: 2026-02-25*
