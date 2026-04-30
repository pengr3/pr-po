---
phase: 07-project-assignment-system
plan: 01
subsystem: project-assignment-core
tags: [utils, auth, event-dispatch, project-scope, operations_user]

dependency-graph:
  requires:
    - 06-role-infrastructure-real-time-permissions (permission system, currentUser, onSnapshot pattern)
    - 05-core-authentication (auth observer, user document listener, getCurrentUser)
  provides:
    - getAssignedProjectCodes utility for all downstream views
    - assignmentsChanged real-time event for reactive UI updates
  affects:
    - 07-02 through 07-05 (all views that filter by project assignment)
    - Any future view that needs to scope data to user-assigned projects

tech-stack:
  added: []
  patterns:
    - CustomEvent dispatch for cross-module communication (extends existing authStateChanged / permissionsChanged pattern)
    - Null-returns-no-filter convention for scope utility (null = show all, array = filter, empty array = show none)

key-files:
  created: []
  modified:
    - app/utils.js (added getAssignedProjectCodes export and window exposures)
    - app/auth.js (added previousAssignedCodes/previousAllProjects capture and assignmentsChanged dispatch)

decisions:
  - ASSIGN-01: getAssignedProjectCodes returns null for "no filter" -- null is the sentinel meaning "do not apply project scope filter"; all roles except operations_user get null, and operations_user with all_projects=true also gets null
  - ASSIGN-02: Empty array (not null) for operations_user with no assignments -- distinguishes "show nothing" from "show everything"; missing or malformed assigned_project_codes defaults to empty array
  - ASSIGN-03: JSON.stringify comparison for array change detection -- array reference equality is always false after Firestore deserialization; stringify correctly handles undefined vs missing vs empty transitions
  - ASSIGN-04: assignmentsChanged event fires on ANY change to either field -- includes first-time assignment on new operations_user documents; downstream listeners must be idempotent

metrics:
  duration: 90s
  completed: 2026-02-03
---

# Phase 7 Plan 1: Project Assignment Core Utilities Summary

**One-liner:** Shared project-scope utility and real-time assignment-change event dispatch powering all Phase 7 view filters.

## What Was Built

Two purely additive pieces that every downstream plan in Phase 7 depends on:

1. **`getAssignedProjectCodes()`** in `app/utils.js` -- A single function call that any view can use to determine the current user's project scope. Returns `null` when no filtering is needed (all roles except `operations_user`, or `operations_user` with `all_projects === true`). Returns the `assigned_project_codes` array for scoped users. Returns `[]` when the user has zero assignments.

2. **`assignmentsChanged` event dispatch** in `app/auth.js` -- Added to the existing user-document `onSnapshot` callback. Captures the previous assignment state before `currentUser` is reassigned, then compares and dispatches a `CustomEvent` on `window` when either `assigned_project_codes` or `all_projects` changes. Placement is deliberate: after the role-change block (PERM-19), before the AUTH-09 deactivation block.

## Decisions Made

- **ASSIGN-01:** `null` return = no filter. Keeps downstream code simple: `if (codes !== null) applyFilter(codes)`.
- **ASSIGN-02:** Missing/malformed `assigned_project_codes` on an `operations_user` yields `[]`, not `null`. A missing field is zero access, not unconstrained access.
- **ASSIGN-03:** `JSON.stringify` comparison for arrays. Firestore `onSnapshot` always produces new object references; reference equality would fire the event on every snapshot.
- **ASSIGN-04:** Event fires on first assignment too (undefined -> array). Downstream listeners will see the event immediately when an admin assigns projects to a new operations_user.

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- 07-02 (Projects view filter) can proceed: `getAssignedProjectCodes` is available and `assignmentsChanged` event is in place.
- All plans in Phase 7 depend on these two artifacts. No blockers identified.
