---
phase: 22-bug-fixes-and-ux-improvements
plan: 02
subsystem: ui, database
tags: [firestore, permissions, canEditTab, delivery-fee, aggregation, total_amount]

# Dependency graph
requires:
  - phase: 20-personnel-field
    provides: "Personnel pill selector with users collection listener in projects.js"
  - phase: 17-procurement-workflow
    provides: "PO status tracking with delivery_fee field in procurement.js"
  - phase: 13-finance-dashboard
    provides: "Expense aggregation queries using sum('total_amount') in finance.js"
provides:
  - "Permission-guarded users collection listener in projects.js"
  - "Delivery fee included in PO total_amount for expense aggregation"
affects: [22-03-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canEditTab guard on Firestore listeners that require elevated permissions"
    - "Write-time denormalization of delivery fees into total_amount for aggregation"

key-files:
  created: []
  modified:
    - app/views/projects.js
    - app/views/procurement.js

key-decisions:
  - "Guard loadActiveUsers() with canEditTab check (users collection requires super_admin/operations_admin permissions)"
  - "Add delivery fee to total_amount at write time rather than modifying aggregation queries (simpler, no double-counting)"
  - "Preserve delivery_fee field separately for display purposes (PO details modal)"

patterns-established:
  - "Permission guard on Firestore listeners: check canEditTab before setting up onSnapshot on restricted collections"
  - "Error callback on onSnapshot as safety net for permission errors"

# Metrics
duration: 2min
completed: 2026-02-10
---

# Phase 22 Plan 02: Firestore Permissions & Delivery Fee Fix Summary

**Permission guard on Projects users listener for procurement users + delivery fee included in PO total_amount for expense aggregation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-10T02:37:14Z
- **Completed:** 2026-02-10T02:38:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Procurement users can now view Projects tab without Firestore permission-denied errors
- Users collection listener only fires for roles with edit permission (super_admin, operations_admin)
- Delivery fees are automatically captured in all project expense totals via total_amount inclusion
- No changes needed in finance.js -- aggregation queries automatically pick up the updated total_amount

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard users collection listener with edit permission check** - `8e148e9` (fix)
2. **Task 2: Include delivery fee in PO total_amount at write time** - `53ffbfc` (fix)

## Files Created/Modified
- `app/views/projects.js` - Added canEditTab guard and error callback on loadActiveUsers() onSnapshot listener
- `app/views/procurement.js` - Moved poRef declaration, added delivery fee to total_amount in Delivered branch of updatePOStatus()

## Decisions Made
- Guard loadActiveUsers() with `canEditTab('projects') === false` check, matching existing pattern throughout projects.js (uses `=== false` to allow `undefined` from loading permissions to pass through)
- Add delivery fee to total_amount at write time rather than modifying all aggregation queries across finance.js -- simpler approach, avoids double-counting, single point of change
- Preserve `delivery_fee` field separately for display purposes in PO details modal (procurement.js line ~4119)
- Added onSnapshot error callback as safety net even with the guard (defense in depth)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 22-02 bugs fixed, ready for plan 22-03 (wave 2, depends on 22-01 and 22-02)
- 22-03 covers sortable table headers in finance.js and clients.js
- No blockers for next plan

---
*Phase: 22-bug-fixes-and-ux-improvements*
*Completed: 2026-02-10*
