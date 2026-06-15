---
phase: 35-for-the-gaps-found-during-audit-for-v-2-3
plan: 03
subsystem: database
tags: [firestore, security-rules, services_user, prs, pos, aggregation]

# Dependency graph
requires:
  - phase: 35-02
    provides: permission guard fixes in service-detail.js that call refreshServiceExpense()
  - phase: 33
    provides: refreshServiceExpense() calling getAggregateFromServer on prs/pos collections
  - phase: 31
    provides: services_user branch pattern in mrfs/transport_requests list rules
provides:
  - services_user service-scoped list rule in prs collection
  - services_user service-scoped list rule in pos collection
  - All 4 cross-department collections (mrfs, prs, pos, transport_requests) consistent for services_user
affects:
  - service-detail.js refreshServiceExpense()
  - any future plan adding services_user aggregation queries on prs or pos

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "services_user branch pattern: (isRole('services_user') && isAssignedToService(resource.data.service_code)) — now consistently applied across all 4 cross-department procurement collections"

key-files:
  created: []
  modified:
    - firestore.rules

key-decisions:
  - "services_user prs/pos list rule matches mrfs/transport_requests pattern exactly — intentional consistency, not accidental duplication"
  - "Only list rule modified — create/update/delete rules for prs and pos remain unchanged (services_user is read-only for procurement docs)"

patterns-established:
  - "Parallel branch pattern: every cross-department procurement collection (mrfs, prs, pos, transport_requests) should have both operations_user project-scoped and services_user service-scoped branches in its list rule"

requirements-completed: [SERV-04]

# Metrics
duration: 8min
completed: 2026-02-20
---

# Phase 35 Plan 03: Firestore Rules — services_user prs/pos List Access Summary

**services_user service-scoped list branch added to prs and pos Firestore rules, enabling getAggregateFromServer expense aggregation for the services department without 403 errors**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-20T08:37:31Z
- **Completed:** 2026-02-20T08:45:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `(isRole('services_user') && isAssignedToService(resource.data.service_code))` branch to the prs list rule — matching the pattern already present in mrfs and transport_requests
- Added same branch to the pos list rule — completing the set of 4 cross-department collections
- Deployed updated rules to production Firebase (clmc-procurement) with "Deploy complete!" confirmation
- refreshServiceExpense() in service-detail.js can now run getAggregateFromServer on prs and pos without a 403 Forbidden error for services_user

## Task Commits

Each task was committed atomically:

1. **Task 1: Add services_user branch to prs and pos list rules** - `a5fc13b` (feat)
2. **Task 2: Deploy updated Firestore rules to production** - (no separate commit — deploy is an operation, not a file change; Task 1 commit contains the deployed artifact)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `firestore.rules` - Added services_user service-scoped list branch to prs and pos rules (6 insertions, 4 deletions — two comment line updates + two added branch lines)

## Decisions Made
- services_user list branch in prs/pos is identical to the branch in mrfs/transport_requests — intentional pattern consistency, not copy-paste without thought
- Only the list rule modified in each collection — create/update/delete rules unchanged because services_user is and remains read-only for procurement documents

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Firebase CLI was already authenticated. Rules compiled without syntax errors on first attempt.

## User Setup Required

None - no external service configuration required. Firestore rules are deployed to production automatically via Firebase CLI.

## Self-Check: PASSED

- `firestore.rules` — FOUND
- `.planning/phases/35-for-the-gaps-found-during-audit-for-v-2-3/35-03-SUMMARY.md` — FOUND
- Commit `a5fc13b` — FOUND (feat(35-03): add services_user branch to prs and pos list rules)

## Next Phase Readiness
- Phase 35 gap closure is now complete: edit history path (35-01), permission guard race (35-02), and services_user prs/pos access (35-03) all resolved
- services_user navigating to a service detail page will see the expense breakdown section render correctly with PR/PO aggregation totals and no console errors
- No further blockers — v2.3 audit gaps are closed

---
*Phase: 35-for-the-gaps-found-during-audit-for-v-2-3*
*Completed: 2026-02-20*
