---
phase: quick-260722-msg
plan: 01
subsystem: ui
tags: [firestore, rbac, mrf-form, cross-department-scoping]

# Dependency graph
requires:
  - phase: quick-260706-mco
    provides: department-keyed assignment-scoping contract (getAssignedProjectCodes/getAssignedServiceCodes, PROJECT_SEE_ALL_ROLES/SERVICE_SEE_ALL_ROLES) that this plan's picker-visibility fix now plugs into on the MRF form
provides:
  - services_admin added to app/views/mrf-form.js showProjects role list
  - operations_admin added to app/views/mrf-form.js showServices role list
  - Both cross-dept admin roles can now file MRFs against their assigned cross-department items on the dedicated MRF form, matching the *_user roles already there
affects: [procurement-create-mrf-picker-followup]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - app/views/mrf-form.js

key-decisions:
  - "Two-line additive edit only — no new filtering code written. The existing rebuildPSOptions() assignment-scoping block (gated by psShowProjects/psShowServices) already calls getAssignedProjectCodes()/getAssignedServiceCodes(); it was simply never reached for services_admin/operations_admin because the role-visibility arrays excluded them."
  - "No firestore.rules change: mrfs create already allow-lists both admin roles (firestore.rules:399) — the gap was purely client-side picker visibility, not a server permission gap."
  - "app/views/procurement.js:3866 (Procurement-tab Create MRF) remains explicitly out of scope — it builds projectOptions unscoped (no role gate, no assignment filter) and needs its own follow-up task to reconcile with this assignment-scoped model."

patterns-established: []

requirements-completed: [MSG-01-crossdept-admin-mrf-picker]

# Metrics
duration: 5min
completed: 2026-07-22
---

# Quick 260722-msg: Cross-Dept Admin MRF Filing Picker Summary

**Added `services_admin` to the MRF form's `showProjects` role list and `operations_admin` to `showServices`, so both cross-department admin roles now see (and can file against) their assigned cross-dept projects/services — completing the 260706-mco assignment model on the last surface it hadn't reached.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-22T16:31:11+08:00
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `services_admin` now included in `showProjects`, `operations_admin` now included in `showServices` in `app/views/mrf-form.js` (~lines 406-407)
- Downstream `rebuildPSOptions()` assignment-scoping (via `getAssignedProjectCodes()`/`getAssignedServiceCodes()`) now actually runs for these two roles instead of being gated out — no new filtering logic was needed or added
- Updated the mco-lineage comment above the two arrays to record that department admins are cross-dept assignment-scoped on this picker too, so the omission isn't reintroduced later
- All other roles' picker behavior (super_admin, finance, procurement, operations_user, services_user) is untouched — same array membership as before for those roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Add services_admin to showProjects and operations_admin to showServices in the MRF form** - `1b55dee` (fix)

_Note: single-task plan; no plan-metadata commit is created by the executor per this quick task's constraints (orchestrator handles the docs commit separately)._

## Files Created/Modified
- `app/views/mrf-form.js` - Added `services_admin` to the `showProjects` role-visibility array and `operations_admin` to the `showServices` role-visibility array (~lines 406-407); updated the lineage comment above them (~lines 404-407)

## Decisions Made
- Placed `services_admin` adjacent to `operations_admin` in `showProjects`, and `operations_admin` adjacent to `services_admin` in `showServices`, per the plan's explicit placement instruction — existing entries were not reordered or removed.
- Extended (rather than replaced) the existing 260627-kg0 lineage comment, appending a new comment block attributing the admin-inclusion change to 260706-mco/260722-msg, so history of the picker's evolution stays legible in-place.

## Deviations from Plan

None - plan executed exactly as written. Both edits were additive-only; no other line in the task's diff hunk changed except the two array literals and the comment directly above them.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Human Verification Required (flagged, not blocking per plan)

The plan explicitly marks browser UAT as a non-blocking human follow-up (production Firebase, no automated test harness). Recommended checks on `#/mrf-form`:
1. A `services_admin` assigned to exactly one project: Project picker offers only that project; Service picker still offers all services; MRF submits successfully against the project.
2. An **unassigned** `services_admin`: Project picker offers no projects (no leak).
3. Symmetric checks for `operations_admin` (assigned to one service → sees only that service + all projects; unassigned → sees no services).
4. Confirm `super_admin`/`finance`/`procurement`/`operations_user`/`services_user` picker behavior is unchanged.

## Known Follow-up (out of scope, not a stub in this plan's own deliverable)

`app/views/procurement.js:3866` (Procurement-tab "Create MRF" surface) builds `projectOptions` from `projectsData.map(...)` with no role gate and no assignment filter — it is unscoped/over-permissive (shows all active projects to everyone, including a services_admin). This was explicitly called out as OUT OF SCOPE in the plan and intentionally not touched here. A separate follow-up task should reconcile that surface with the assignment-scoped model completed by this change and 260706-mco.

## Next Phase Readiness

- The MRF-filing picker assignment-scoping model (started in 260706-mco) is now consistent across the dedicated MRF form for all six operationally-relevant roles.
- Outstanding debt: `procurement.js:3866` Create-MRF surface reconciliation (noted above).
- Standing carried debt (unrelated to this task, from STATE.md): `firebase deploy --only firestore:rules` for the v3.3 → main rules-deploy backlog (87.4/99/100/101/102/103.1/104/105-01) — this task made no `firestore.rules` change and does not add to that list.

---
*Phase: quick-260722-msg*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: app/views/mrf-form.js
- FOUND: .planning/quick/260722-msg-let-assigned-cross-dept-admins-file-mrfs/260722-msg-SUMMARY.md
- FOUND: 1b55dee (task commit, `git log --oneline --all`)
