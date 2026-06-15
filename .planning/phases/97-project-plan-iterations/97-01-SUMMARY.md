---
phase: 97-project-plan-iterations
plan: "01"
subsystem: database
tags: [firestore, security-rules, project-iterations]

# Dependency graph
requires:
  - phase: 86.12-project-plan-baselines
    provides: baselines subcollection security rules pattern (read=isActiveUser, create/delete=hasRole admin, update=false)
provides:
  - Firestore Security Rules block for project_iterations top-level collection
  - read=isActiveUser, create=hasRole(['super_admin','operations_admin']), update=false, delete=hasRole(['super_admin','operations_admin'])
affects:
  - 97-02 (first JS write to project_iterations from project-plan.js — will not be blocked by permissions)
  - 97-03
  - 97-04
  - 97-05

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Top-level Firestore collection security rules block with write-once update:false pattern"

key-files:
  created: []
  modified:
    - firestore.rules

key-decisions:
  - "project_iterations is a top-level collection (NOT a subcollection of projects) — project_id field handles project scoping at JS query layer"
  - "update: if false — iterations are write-once; no label or task field edits allowed server-side"
  - "delete: if hasRole(['super_admin', 'operations_admin']) — required for the Undo mechanic (auto-snapshot cleanup)"

patterns-established:
  - "Pattern: Top-level iteration collections follow baselines subcollection rule shape — read=isActiveUser, create/delete=hasRole admin, update=false"

requirements-completed:
  - Spike-015c
  - Spike-016
  - Spike-017B
  - Spike-018

# Metrics
duration: 5min
completed: 2026-06-02
---

# Phase 97 Plan 01: project_iterations Security Rules Summary

**Firestore Security Rules block for project_iterations top-level collection — write-once snapshots readable by all active users, createable/deletable by admin roles only**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-02T00:00:00Z
- **Completed:** 2026-06-02T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Inserted `match /project_iterations/{iterationId}` block at top-level scope in firestore.rules (after the `match /projects/{projectId}` closing brace, before `clients` collection)
- All four `allow` directives present: read=isActiveUser(), create=hasRole admin, update=false, delete=hasRole admin
- Block placed at correct indentation level — sibling of projects/clients/mrfs, NOT nested inside projects match

## Task Commits

Each task was committed atomically:

1. **Task 1: Insert project_iterations security rules block** - `0245dc6` (feat)

**Plan metadata:** *(pending — part of final docs commit)*

## Files Created/Modified
- `firestore.rules` — Added 15-line `project_iterations` security rules block at line 251 (after projects match close, before clients collection)

## Decisions Made
- `update: if false` enforces write-once semantics server-side — no client can edit iteration labels or tasks after save; this is the same pattern as baselines subcollection from Phase 86.12
- `delete: if hasRole([...])` is intentionally permissive for admin roles to support the Undo mechanic that must delete auto-snapshots from Firestore
- Block placed as a top-level collection (not subcollection) per RESEARCH.md and CONTEXT.md locked decision — project_id field handles project scoping at the JS query layer

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — firestore.rules changes take effect on next `firebase deploy --only firestore:rules`. Per STATE.md current tracking, this deploy is batched with v3.3 → main merge.

## Next Phase Readiness
- Plan 02 (project-plan.js data layer — module state vars, loadIterations, saveIteration, restoreIteration, undoRestore functions) can now proceed — the security rules are in place so the first JS write to project_iterations will not be blocked by permissions
- All four allow directives verified present and correct

## Self-Check: PASSED
- `match /project_iterations/{iterationId}` confirmed at lines 259–264 of firestore.rules
- Commit `0245dc6` confirmed in git log
- `allow read: if isActiveUser();` present
- `allow create: if hasRole(['super_admin', 'operations_admin']);` present
- `allow update: if false;` present
- `allow delete: if hasRole(['super_admin', 'operations_admin']);` present

---
*Phase: 97-project-plan-iterations*
*Completed: 2026-06-02*
