---
phase: 21-personnel-assignment-sync
plan: 01
subsystem: project-user-sync
tags: [firestore, arrayUnion, arrayRemove, personnel, assignments, sync]

dependency-graph:
  requires: [phase-20, phase-9, phase-7]
  provides: [automatic-personnel-assignment-sync]
  affects: []

tech-stack:
  added: []
  patterns:
    - "arrayUnion/arrayRemove for atomic array field operations"
    - "Fire-and-forget sync pattern with .catch() error collection"
    - "Diff-based add/remove computation using Set for O(n) performance"

file-tracking:
  key-files:
    created: []
    modified:
      - app/firebase.js
      - app/utils.js
      - app/views/projects.js
      - app/views/project-detail.js

decisions:
  - id: "21-01-01"
    decision: "Use arrayUnion/arrayRemove instead of writeBatch or read-modify-write"
    reason: "Atomic, idempotent, no race conditions -- ideal for 1-3 user updates per operation"
  - id: "21-01-02"
    decision: "Skip all_projects users only during additions, not removals"
    reason: "arrayRemove on non-existent value is a no-op, so removal is safe without the check"
  - id: "21-01-03"
    decision: "Fire-and-forget pattern -- sync errors do not block or roll back personnel save"
    reason: "Personnel save is the primary operation; sync is secondary enhancement"

metrics:
  duration: "~3 minutes"
  completed: "2026-02-09"
  tasks: 2
  commits: 2
---

# Phase 21 Plan 01: Personnel-Assignment Sync Summary

**Automatic sync between project personnel field and user assigned_project_codes using Firestore arrayUnion/arrayRemove, called fire-and-forget from all 4 mutation paths.**

## What Was Done

### Task 1: Firebase exports + syncPersonnelToAssignments utility
- Added `arrayUnion` and `arrayRemove` to firebase.js in 3 locations: CDN import, ES module export block, and `window.firestore` object
- Expanded utils.js import to include `getDoc`, `updateDoc`, `doc`, `arrayUnion`, `arrayRemove`
- Created `syncPersonnelToAssignments(projectCode, previousUserIds, newUserIds)` in utils.js:
  - Guards against missing projectCode (legacy projects without codes)
  - Computes diff using Set for O(n) add/remove detection
  - Checks `all_projects === true` before adding project code to user
  - Wraps each operation in try/catch, collects errors without throwing
  - Returns errors array for caller inspection (but callers use fire-and-forget)

### Task 2: Wired sync into all 4 personnel mutation paths
- **projects.js `addProject()`**: All personnel are new (previous = []), sync after addDoc
- **projects.js `saveEdit()`**: Captures old personnel via `normalizePersonnel()` before save, syncs diff after updateDoc
- **project-detail.js `selectDetailPersonnel()`**: Captures previousUserIds before push, syncs after updateDoc
- **project-detail.js `removeDetailPersonnel()`**: Uses existing `previousState` variable, syncs after updateDoc
- All 4 paths use `.catch()` fire-and-forget pattern -- sync failures never block the UI

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 21-01-01 | arrayUnion/arrayRemove over writeBatch | Atomic, idempotent, simpler for 1-3 user updates |
| 21-01-02 | Skip all_projects check on removals | arrayRemove on non-existent value is a no-op |
| 21-01-03 | Fire-and-forget sync pattern | Personnel save is primary; sync is secondary |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Checklist

- [x] arrayUnion and arrayRemove exported from firebase.js (import + ES module + window.firestore)
- [x] syncPersonnelToAssignments exported from utils.js with diff logic
- [x] projects.js addProject calls sync after successful addDoc
- [x] projects.js saveEdit calls sync after successful updateDoc
- [x] project-detail.js selectDetailPersonnel calls sync after successful updateDoc
- [x] project-detail.js removeDetailPersonnel calls sync after successful updateDoc
- [x] Users with all_projects: true are skipped during sync additions
- [x] Projects without project_code trigger warning log, no error
- [x] Sync failures do not block or roll back personnel save
- [x] Project Assignments admin panel (project-assignments.js) is unmodified

## Commits

| Hash | Message |
|------|---------|
| 7ad174c | feat(21-01): add arrayUnion/arrayRemove exports and syncPersonnelToAssignments utility |
| 6deacb9 | feat(21-01): wire syncPersonnelToAssignments into all 4 personnel mutation paths |
