---
phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned
plan: 01
subsystem: database
tags: [firestore, firestore-rules, projects, project-creation, security-rules]

# Dependency graph
requires: []
provides:
  - "addProject() accepts no client — writes project_code/client_id/client_code as null to Firestore"
  - "firestore.rules D-12 immutability guard: project_code/client_id/client_code locked once non-null"
affects:
  - "78-02 (MRF dropdown clientless projects)"
  - "78-03 (projects list em-dash display + project-detail code issuance flow)"
  - "78-04 (UAT deployment)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "clientless project: project_code/client_id/client_code stored as null at creation; code issued on client assignment"
    - "D-12 Firestore rule guard: resource.data.project_code == null OR request preserves locked fields"

key-files:
  created: []
  modified:
    - app/views/projects.js
    - firestore.rules

key-decisions:
  - "D-01/D-03 enforcement: client is now optional in addProject() — only project_name, internal_status, project_status remain required"
  - "D-04: generateProjectCode() is skipped (returns null) when clientCode is absent; syncPersonnelToAssignments also gated behind non-null project_code"
  - "D-12 DB-level lock: firestore.rules update rule requires either project_code == null (pre-issuance) OR all three locked fields are unchanged in the request"

patterns-established:
  - "Clientless addDoc pattern: use || null fallbacks for optional code/id fields so Firestore receives explicit nulls (not undefined which Firestore omits)"
  - "Firestore rule immutability: (resource.data.field == null || request.resource.data.field == resource.data.field) for one-time-set fields"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-04-27
---

# Phase 78 Plan 01: Relax addProject() + D-12 Firestore Rule Summary

**addProject() now accepts clientless projects writing null project_code/client_id/client_code, and firestore.rules enforces D-12 permanent lock on those fields once a code is issued**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-27T03:56:30Z
- **Completed:** 2026-04-27T03:58:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed `clientId` from addProject() required-field guard so projects can be created with no client selected
- Changed project_code generation to conditional: `clientCode ? await generateProjectCode(clientCode) : null`
- addDoc payload now uses explicit null fallbacks for `project_code`, `client_id`, `client_code`
- syncPersonnelToAssignments gated behind non-null project_code (avoids syncing null code to assignments)
- Success toast appended with "(no code yet — assign a client to issue code)" when no client
- Added Phase 78 D-01 comment to firestore.rules documenting clientless create allowance
- Replaced single-line `allow update` in /projects/{projectId} with multi-line D-12 guard: pre-issuance (project_code == null) allows any update; post-issuance requires project_code/client_id/client_code unchanged in request

## Task Commits

Each task was committed atomically:

1. **Task 1: Relax addProject() to allow clientless creation and skip code generation** - `01060d1` (feat)
2. **Task 2: Add D-12 immutability guard to firestore.rules /projects/{projectId} update rule** - `5694c0c` (feat)

**Plan metadata:** _(docs commit below)_

## Files Created/Modified
- `app/views/projects.js` - addProject() relaxed: client optional, null-safe code/id/client fields, gated sync
- `firestore.rules` - /projects/{projectId} update rule tightened with D-12 post-issuance lock

## Decisions Made
- `clientCode || null` pattern used in addDoc payload (not conditional) to ensure explicit null vs undefined for Firestore storage — Firestore omits `undefined` values but stores `null` correctly
- recordEditHistory `client` field also uses `clientCode || null` for consistency in audit trail
- Firestore rule uses `resource.data.project_code == null` (not `!= null`) as the "pre-issuance allowed" branch — when null, any update passes; when non-null, the three equality checks must hold

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- The `!clientId || !project_name || ...` validation block existed identically in both `addProject()` (line 634) and `editProject()` (line 1003). Edit required unique surrounding context to target only the addProject instance. Resolved by including the preceding `contractCost` line as context anchor.

## User Setup Required
None — no external service configuration required. Firestore rules deployment is deferred to Plan 04 UAT step (user deploys via Firebase CLI).

## Next Phase Readiness
- Wave 1 foundation complete: Firestore accepts clientless project docs; D-12 rule prevents post-issuance overwrite
- Plan 02 (MRF project dropdown — show clientless projects with "(No code yet)" suffix) can proceed
- Plan 03 (projects list em-dash display + project-detail.js runCodeIssuance flow) can proceed
- Plan 04 (UAT deployment + rule push) depends on Plans 02 and 03

---
*Phase: 78-allow-creating-projects-without-a-client-defer-project-code-issuance-until-client-is-assigned*
*Completed: 2026-04-27*

## Self-Check: PASSED
- app/views/projects.js: FOUND
- firestore.rules: FOUND
- 78-01-SUMMARY.md: FOUND
- commit 01060d1: FOUND
- commit 5694c0c: FOUND
