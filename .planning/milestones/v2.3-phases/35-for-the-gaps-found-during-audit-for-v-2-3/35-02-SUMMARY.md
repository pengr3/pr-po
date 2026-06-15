---
phase: 35-for-the-gaps-found-during-audit-for-v-2-3
plan: 02
subsystem: ui
tags: [permissions, canEditTab, hasTabAccess, services, read-only, race-condition]

# Dependency graph
requires:
  - phase: 28-services-view
    provides: service-detail.js with inline editing and permission checks
  - phase: 26-security-roles-foundation
    provides: canEditTab(), hasTabAccess() permission functions and services_user role
provides:
  - Correct permission guard in renderServiceDetail() using canEdit === true
  - Correct save guard in saveServiceField() and toggleServiceDetailActive() using !== true
  - Defense-in-depth canReadTab guard in refreshServiceExpense() using hasTabAccess
affects: [35-03-plan, services_user role behavior, service-detail view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "canEdit === true (not !== false) for rendering edit controls — treats undefined as read-only"
    - "canEditTab !== true (not === false) for save guards — blocks undefined/loading state"
    - "hasTabAccess === false early-exit in expense aggregation — defense-in-depth against 403 noise"

key-files:
  created: []
  modified:
    - app/views/service-detail.js

key-decisions:
  - "canEdit === true in renderServiceDetail treats permission loading (undefined) as read-only, eliminating flash of edit controls for services_user"
  - "canEditTab !== true in saveServiceField and toggleServiceDetailActive blocks Firestore writes during permission load race"
  - "toggleServiceDetailActive also had the same === false bug — fixed as Rule 1 auto-fix alongside Task 1"
  - "hasTabAccess === false in refreshServiceExpense uses explicit false check (not !== true) so services_user (read access=true) is not blocked — only roles with zero services access skip aggregation"

patterns-established:
  - "Permission guard pattern: use === true for rendering controls (undefined = hidden); use !== true for save operations (undefined = blocked)"

requirements-completed: [SERV-04]

# Metrics
duration: 2min
completed: 2026-02-20
---

# Phase 35 Plan 02: Permission Guard Race Condition Fix Summary

**Tightened canEdit guards in service-detail.js so services_user sees read-only view from first render — no flash of editable controls during permission loading race condition**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-20T08:32:58Z
- **Completed:** 2026-02-20T08:34:12Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Fixed `canEdit !== false` → `canEdit === true` in renderServiceDetail() — undefined permission state now renders read-only instead of editable
- Fixed `canEditTab === false` → `!== true` in saveServiceField() and toggleServiceDetailActive() — undefined state now blocks Firestore writes
- Added `hasTabAccess === false` early-exit guard to refreshServiceExpense() — prevents 403 console noise for roles with no services tab access

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix canEdit guards in renderServiceDetail() and saveServiceField()** - `a6d62c1` (fix)
2. **Task 2: Add canReadTab guard to refreshServiceExpense()** - `61d0525` (fix)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `app/views/service-detail.js` - Three permission guard fixes: renderServiceDetail line 250, saveServiceField line 624, toggleServiceDetailActive line 693, refreshServiceExpense defense-in-depth guard

## Decisions Made
- `canEdit === true` in render function: undefined (permissions loading) → hidden controls. This is the correct rendering pattern for "unknown state = safe default = read-only."
- `!== true` in save/toggle functions: guards must block when either false OR undefined. A fast user could trigger a Firestore write before permissions resolve.
- `toggleServiceDetailActive` also had the same `=== false` bug — fixed as Rule 1 auto-fix alongside Task 1 (same defect, same file, plan verification required zero `=== false` matches).
- `hasTabAccess === false` (not `!== true`) in refreshServiceExpense: services_user has read access (returns true), so `!== true` would incorrectly block them. Only explicit `false` (no access at all) skips aggregation. This prevents 403 noise for pure ops/finance roles that navigate to a service detail URL directly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed same canEditTab === false guard in toggleServiceDetailActive()**
- **Found during:** Task 1 (Fix canEdit guards in renderServiceDetail() and saveServiceField())
- **Issue:** toggleServiceDetailActive() at line 693 had identical `=== false` bug — undefined permission state would allow active/inactive toggle for services_user during loading window
- **Fix:** Changed `canEditTab?.('services') === false` to `!== true` (same fix as saveServiceField)
- **Files modified:** app/views/service-detail.js
- **Verification:** `grep canEditTab.*=== false` returns 0 matches across entire file
- **Committed in:** a6d62c1 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — identical bug in adjacent function)
**Impact on plan:** Essential fix — same defect pattern, same file, plan verification required zero `=== false` matches. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Permission guards in service-detail.js are now correct for all roles
- services_user will see read-only view from first render without any flash of edit controls
- Plan 03 (Firestore rules) is the primary fix for services_user 403 errors on prs/pos queries
- No regressions: services_admin and super_admin retain full edit capability (canEditTab returns true)

---
*Phase: 35-for-the-gaps-found-during-audit-for-v-2-3*
*Completed: 2026-02-20*

## Self-Check: PASSED

- FOUND: app/views/service-detail.js (modified)
- FOUND: .planning/phases/35-for-the-gaps-found-during-audit-for-v-2-3/35-02-SUMMARY.md
- FOUND: commit a6d62c1 (Task 1 - canEdit guard fixes)
- FOUND: commit 61d0525 (Task 2 - refreshServiceExpense guard)
- FOUND: commit 8b189db (metadata - SUMMARY, STATE, ROADMAP)
