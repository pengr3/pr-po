---
phase: 105-service-plan-gantt-parity
plan: 01
subsystem: database
tags: [firestore, security-rules, service-tasks, id-generator]

# Dependency graph
requires:
  - phase: 104-service-detail-parity
    provides: isAssignedToService helper at firestore.rules:87 + services role vocabulary
  - phase: 86-gantt
    provides: project_tasks two-tier rules block (firestore.rules:677-709) — mirror template
  - phase: 65.4-rfp-payables
    provides: per-entity sequential ID scan pattern (avoid generateSequentialId race)
provides:
  - match /service_tasks/{taskId} Firestore rules block with two-tier write gates
  - app/service-task-id.js — generateServiceTaskId(serviceCode) producing TASK-{service_code}-{seq}
  - Dev Firestore rules deployed (service_tasks reads/writes unblocked for UAT)
affects: [105-02-service-plan-js, 105-03-service-detail-card, any future service_tasks writer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror pattern: new service_tasks rules block mirrors project_tasks two-tier gates with identifier swap (project→service roles)"
    - "D-06 read-scope default: isActiveUser() for service_tasks (JS-layer scoping), not assignment-scoped list rule"
    - "Per-entity sequential ID scan: getDocs filtered by service_code, parse trailing -N, return max+1 (mirrors task-id.js)"

key-files:
  created:
    - app/service-task-id.js
  modified:
    - firestore.rules

key-decisions:
  - "D-06: service_tasks read rule is isActiveUser() (mirrors project_tasks) — not an assignment-scoped list rule. Rationale: ID generator + card/view listeners query by service_code; assignment-scoped list rule would block cross-team viewers and break the max-seq scan."
  - "Separate app/service-task-id.js file (not extending task-id.js) — zero-touch principle for project generator per D-01."
  - "service_tasks rules block placed adjacent to project_tasks block per new-collection convention."

patterns-established:
  - "service_tasks Tier-2 progress-only update: affectedKeys().hasOnly(['progress','updated_at']) + uid in assignees — mirrors project_tasks exactly."
  - "isRole('services_user') && short-circuit in every branch prevents dereferencing assigned_service_codes on non-services_user docs."

requirements-completed: []

# Metrics
duration: multi-session (interrupted at dev deploy gate, resumed after human confirmed deploy)
completed: 2026-06-15
---

# Phase 105 Plan 01: Service-Tasks Foundation (Rules + ID Generator) Summary

**Firestore security-rules block for `service_tasks` collection (two-tier WBS/progress write gates, services roles) + `generateServiceTaskId` per-service sequential ID generator, with dev rules deployed for UAT**

## Performance

- **Duration:** multi-session (Tasks 1-2 executed inline, paused at human-verify deploy gate, resumed after operator confirmed "deployed")
- **Started:** 2026-06-15
- **Completed:** 2026-06-15
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 2

## Accomplishments
- Added `match /service_tasks/{taskId}` rules block mirroring `project_tasks` (two-tier create/update/delete with `services_admin`/`services_user` roles + `isAssignedToService` helper)
- Created `app/service-task-id.js` exporting `generateServiceTaskId(serviceCode)` producing `TASK-{service_code}-{seq}` per-service sequential IDs
- Dev Firestore rules deployed (`firebase deploy --only firestore:rules --project dev`) — confirmed `✔ Deploy complete!`, service_tasks reads/writes authorized for UAT

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the service_tasks firestore.rules block** - `ffd6e8c` (feat)
2. **Task 2: Create app/service-task-id.js generator** - `ffde043` (feat)
3. **Task 3: Dev deploy checkpoint** - human-verify gate; operator ran `firebase deploy --only firestore:rules --project dev`, confirmed success

## Files Created/Modified
- `firestore.rules` — new `match /service_tasks/{taskId}` block with `allow read: if isActiveUser()`, two-tier create/update/delete gates (services_admin/services_user + isAssignedToService), Tier-2 `affectedKeys().hasOnly(['progress','updated_at'])` + `uid in assignees` progress-only path; D-06 read-scope rationale in header comment
- `app/service-task-id.js` — exports `generateServiceTaskId(serviceCode)`; queries `service_tasks` collection filtered by `where('service_code','==',serviceCode)`, scans trailing `-N` from each `task_id`, returns `TASK-${serviceCode}-${maxNum+1}`; throws on empty serviceCode; no `generateSequentialId` (Phase 65.4 race lesson)

## Decisions Made
- **D-06 read-scope:** `allow read: if isActiveUser()` (mirrors project_tasks). The narrower `isAssignedToService`-scoped list rule was considered but rejected: it would break the ID generator's max-seq scan (which reads all service_code-filtered docs) and block cross-team viewers. Documented as a code comment in the rules block.
- **Separate file for ID generator:** `app/service-task-id.js` is a new file rather than an extension of `app/task-id.js`, keeping the project generator byte-untouched per D-01 zero-touch principle.
- **Execution pattern:** Plan executed inline on v3.3 (gsd-sdk unavailable, 2 stale locked agent worktrees — same pattern as Phases 98–104). Interrupted at the human-verify deploy gate; resumed after operator confirmed successful dev deploy.

## Deviations from Plan

None - plan executed exactly as written. The human-verify gate was the intended interruption point.

## Issues Encountered
None — rules compiled without errors on first deploy attempt. `node --check app/service-task-id.js` passed. All acceptance criteria met.

## User Setup Required
None — no external service configuration required beyond the dev deploy gate (which the operator completed).

## Next Phase Readiness
- `service_tasks` collection is authorized in dev Firestore — any `service_tasks` write from Phase 105-02 (service-plan.js) will succeed
- `generateServiceTaskId` is importable by `app/views/service-plan.js` (Wave 2)
- Prod `firebase deploy --only firestore:rules` still rides the standing v3.3 → main merge debt (87.4/99/100/101/102/103.1/104 + now 105-01)
- No blockers for 105-02

## Self-Check

**Files exist:**
- `app/service-task-id.js` — created in Task 2 commit `ffde043`
- `firestore.rules` — modified in Task 1 commit `ffd6e8c`

**Commits exist:**
- `ffd6e8c` — Task 1: service_tasks firestore.rules block
- `ffde043` — Task 2: generateServiceTaskId generator

**Self-Check: PASSED**

---
*Phase: 105-service-plan-gantt-parity*
*Completed: 2026-06-15*
