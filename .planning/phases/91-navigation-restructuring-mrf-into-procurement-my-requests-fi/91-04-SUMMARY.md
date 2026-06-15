---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
plan: "04"
subsystem: procurement-records-filter
tags: [procurement, records, my-requests, project-scope, assignment-filter]
dependency_graph:
  requires: [91-03]
  provides: [my-requests-filter, records-project-scope, records-assignment-listener]
  affects: [app/views/procurement.js]
tech_stack:
  added: []
  patterns:
    - cachedAllPRPORecords module-level cache for re-filter without Firestore round-trip
    - assignmentsChanged listener dedup guard (_procurementRecordsAssignmentHandler)
    - reFilterAndRenderPRPORecords() helper mirroring reFilterAndRenderMRFs() shape
key_files:
  created: []
  modified:
    - app/views/procurement.js
decisions:
  - "My Requests filter is a client-side narrowing on requestor_user_id === currentUser.uid; legacy MRFs without the field do not match (explicit D-02 accept)"
  - "cachedAllPRPORecords stores raw post-fetch snapshot before project-scope filter; cache-hit branch re-applies scope to prevent stale assignment data leaking across re-entries"
  - "reFilterAndRenderPRPORecords() placed immediately after reFilterAndRenderMRFs() for co-location; not exported, not on window"
  - "assignmentsChanged listener registered unconditionally in init() (not inside activeTab==='records' branch) because tab switches do not call destroy()"
  - "typeof reFilterAndRenderPRPORecords === 'function' safe-call guard in listener body protects against bootstrap-order edge cases"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-13"
  tasks_completed: 3
  files_modified: 1
---

# Phase 91 Plan 04: My Requests + Records Project-Scope Filter Summary

**One-liner:** MRF Records dept dropdown gains "My Requests" option filtering by requestor_user_id, plus project-scope filtering via getAssignedProjectCodes() with assignmentsChanged re-filter — mirroring the Phase 7 MRF Management pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add My Requests dropdown option + filter branch + cachedAllPRPORecords var | 8c102e3 | app/views/procurement.js |
| 2 | Project-scope filtering in loadPRPORecords + reFilterAndRenderPRPORecords helper | 0f93528 | app/views/procurement.js |
| 3 | Wire assignmentsChanged listener for Records tab in init() + destroy cleanup | 646b77b | app/views/procurement.js |

## What Was Built

### Task 1
- Added `let cachedAllPRPORecords = [];` in module scope immediately after `let allPRPORecords = []`
- Added `<option value="my_requests">My Requests</option>` as 4th option in `#deptFilterPOTracking` select
- Updated `filterPRPORecords()` with `activePODeptFilter === 'my_requests'` branch reading `window.getCurrentUser?.()?.uid`; `uid` null/undefined yields `matchesDept = false` (empty table, no crash)
- Existing `''`, `'projects'`, `'services'` dept logic (`mrfDept === activePODeptFilter`) preserved verbatim

### Task 2
- `loadPRPORecords()` fresh-fetch path: caches raw sorted set into `cachedAllPRPORecords` before applying `getAssignedProjectCodes()` scope filter; legacy MRFs without `project_code` always pass the filter
- `loadPRPORecords()` cache-hit branch: re-applies scope filter from `cachedAllPRPORecords` on each access so stale assignment data does not leak when user re-enters the view after assignment changes
- Added `reFilterAndRenderPRPORecords()` adjacent to `reFilterAndRenderMRFs()`: reads `getAssignedProjectCodes()`, reassigns `allPRPORecords` from cache, calls `filterPRPORecords()` to re-apply all active filters
- `destroy()` resets `cachedAllPRPORecords = []`

### Task 3
- `init()` registers `_procurementRecordsAssignmentHandler` on `assignmentsChanged` using the same dedup guard pattern (`if (!window._procurementRecordsAssignmentHandler)`) as the Phase 7 MRF Management handler
- Handler body: `if (typeof reFilterAndRenderPRPORecords === 'function') reFilterAndRenderPRPORecords();`
- `destroy()` removes the listener and deletes the property — no orphaned globals
- Existing `_procurementAssignmentHandler` registration and cleanup unchanged

## Verification Results

All automated checks pass:
- `my_requests` — 3 hits in procurement.js (option value, filter branch, comment)
- `cachedAllPRPORecords` — 8 hits (declaration, cache write, cache-hit branch read x2, reFilter helper x2, destroy reset, filter in loadPRPORecords)
- `_procurementRecordsAssignmentHandler` — 5 hits (init guard, init addEventListener, init assignment, destroy removeEventListener, destroy delete)
- `reFilterAndRenderPRPORecords` — 3 hits (function definition, listener call, reFilter body)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all new functionality is fully wired. `reFilterAndRenderPRPORecords()` is live-connected to `cachedAllPRPORecords` and `filterPRPORecords()`. The `_procurementRecordsAssignmentHandler` listener is registered and cleaned up.

## Threat Flags

No new threat surface introduced beyond what was analyzed in the plan's threat model. The `cachedAllPRPORecords` cache is a narrowing-only mechanism; no new Firestore endpoints or auth paths were created.

## Self-Check: PASSED

- app/views/procurement.js modified: FOUND
- Commits 8c102e3, 0f93528, 646b77b: verified via git log
- All 7 Task 1 automated checks: OK
- All 7 Task 2 automated checks: OK
- All 5 Task 3 automated checks: OK
- Plan verification grep counts: all meet minimum thresholds
