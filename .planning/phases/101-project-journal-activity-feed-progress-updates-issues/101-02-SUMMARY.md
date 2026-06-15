---
phase: 101-project-journal-activity-feed-progress-updates-issues
plan: 02
subsystem: database
tags: [firestore, security-rules, firebase]

# Dependency graph
requires:
  - phase: 86.12-gantt-baseline
    provides: baselines subcollection rule pattern (admin-delete via hasRole, append-only block structure)
provides:
  - "Firestore security rules for activity_entries subcollection (create-only for active users, admin-delete)"
  - "Firestore security rules for progress_updates subcollection (create-only for active users, admin-delete)"
  - "Firestore security rules for issues subcollection (create+update for active users, admin-delete)"
  - "Rules deployed to clmc-procurement-dev — journal writes will succeed from Plans 03/04/05"
affects: [101-03, 101-04, 101-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subcollection rule block — append-only (allow update: if false) + admin-delete (hasRole(['super_admin', 'operations_admin'])) nested inside match /projects/{projectId}"

key-files:
  created: []
  modified:
    - firestore.rules

key-decisions:
  - "Admin-delete uses hasRole(['super_admin', 'operations_admin']) — the existing expression from the baselines block; no new isAdmin() helper introduced"
  - "activity_entries and progress_updates are append-only (allow update: if false) per spike-032 audit-trail contract"
  - "issues allows update for any active user (open↔resolved transitions per D-13/D-14)"
  - "All three blocks use isActiveUser() for read/create — D-15 no role-gating within journal"

patterns-established:
  - "Journal subcollection block pattern: read+create=isActiveUser, update=false (or isActiveUser for mutable), delete=hasRole([admin roles]), nested inside match /projects/{projectId}"

requirements-completed: []

# Metrics
duration: ~5min
completed: 2026-06-10
---

# Phase 101 Plan 02: Firestore Rules — activity_entries, progress_updates, issues subcollections Summary

**Three append-only journal subcollection rule blocks added to firestore.rules and deployed to clmc-procurement-dev, unblocking all Phase 101 journal write operations**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-10
- **Completed:** 2026-06-10
- **Tasks:** 2 (1 code + 1 deploy checkpoint)
- **Files modified:** 1

## Accomplishments
- Added `match /activity_entries/{entryId}` block inside `match /projects/{projectId}` — create-only for active users, admin-delete only
- Added `match /progress_updates/{updateId}` block — same append-only contract
- Added `match /issues/{issueId}` block — create + update for any active user (open↔resolved), admin-delete only
- Rules deployed to clmc-procurement-dev (`firebase deploy --only firestore:rules`) with no compile errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add three subcollection rule blocks inside match /projects/{projectId}** - `9a21940` (chore)
2. **Task 2: Deploy Firestore rules** - (CLI ran by orchestrator — no code commit, deploy only)

## Files Created/Modified
- `firestore.rules` — Three new subcollection match blocks appended after the `audit_log` block, before the closing brace of `match /projects/{projectId}` (lines ~269–299)

## Decisions Made
- Admin-delete reuses `hasRole(['super_admin', 'operations_admin'])` — the identical expression the `baselines` block uses — rather than introducing a new `isAdmin()` helper (no such helper exists in this file)
- `activity_entries` and `progress_updates`: `allow update: if false` enforces the append-only audit philosophy from spike-032
- `issues`: `allow update: if isActiveUser()` to allow open↔resolved transitions per D-13/D-14 without admin friction

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Rules are deployed.

## Next Phase Readiness

- All three subcollections are rules-live in clmc-procurement-dev
- Plans 03/04/05 (panel render, CRUD, auto-entries) can proceed — `addDoc` calls to `activity_entries`, `progress_updates`, and `issues` will no longer throw "Missing or insufficient permissions"
- No additional rules work required before Phase 101 is complete

---
*Phase: 101-project-journal-activity-feed-progress-updates-issues*
*Completed: 2026-06-10*
