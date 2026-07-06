---
phase: quick-260706-mco
plan: 01
status: code-complete-pending-uat
commits:
  - 93734f1 (Task 1 — RED baseline logic-assertion script)
  - a826cb5 (Task 2 — app/utils.js per-department see-all branches)
  - 2ea10ed (Task 3 — app/views/procurement.js department-keyed null-handling)
  - 6ac4509 (Task 4 — firestore.rules symmetric assigned-member branches)
  - 41c4272 (Task 5 — UI/data affordances: project-detail.js, service-detail.js, assignments.js)
files_modified:
  - scripts/verify-crossdept-admin-scoping.js
  - app/utils.js
  - app/views/procurement.js
  - firestore.rules
  - app/views/project-detail.js
  - app/views/service-detail.js
  - app/views/assignments.js
completed: 2026-07-06
uat: PENDING — Task 6 (browser UAT + firestore.rules deploy) not executed by this run
---

# Quick 260706-mco — Cross-department admin scoping (mirror kg0)

Extends quick 260627-kg0's assignment-driven access model onto the two
department-admin roles kg0 left as see-all. An assigned cross-department
admin (`operations_admin` assigned to a service, `services_admin` assigned to
a project) now behaves EXACTLY like an assigned cross-department `*_user`
under kg0: home department unchanged (see-all + full admin), cross department
= assignment-scoped visibility + full member write rights, with
container-level powers (create/delete the container, edit personnel)
staying home-only.

Tasks 1–5 (all `type="auto"`) executed and committed. **Task 6
(`checkpoint:human-verify gate="blocking"`) was NOT executed** per
instructions — no browser UAT was run and `firestore.rules` was NOT deployed
(no `firebase deploy` command was run at any point in this session).

## Task-by-task

### Task 1 — RED baseline logic-assertion script (`93734f1`)
Created `scripts/verify-crossdept-admin-scoping.js`. Extracts the REAL
`getAssignedProjectCodes` / `getAssignedServiceCodes` / `isMrfInAssignedScope`
functions from source text (brace/bracket-counted, since a plain ESM `import`
is impossible — those modules reach the Firebase CDN), plus every top-level
`UPPER_SNAKE_CASE` const array (name-agnostic — works before and after the
Task 2 rename) so the extracted functions close over their module-scope role
lists instead of throwing `ReferenceError`. Ran against unmodified source:

```
FAILURES:
  - [scope] operations_admin.getAssignedServiceCodes(): expected ["S1"], got null
  - [scope] services_admin.getAssignedProjectCodes(): expected ["P1"], got null
  - [visibility] operations_admin x S9: expected false, got true
  - [visibility] services_admin x P9: expected false, got true
  - [visibility] services_admin x codeless: expected false, got true
  - [visibility] services_admin x LEGACY: expected false, got true

6 assertion(s) failed.
EXIT_CODE=1
```
RED confirmed as a real assertion mismatch (not a crash) — extraction/eval
wiring is sound.

### Task 2 — `app/utils.js` per-department see-all branches (`a826cb5`)
Replaced the shared `SCOPE_EXEMPT_ROLES` const with `PROJECT_SEE_ALL_ROLES`
(`super_admin, finance, procurement, operations_admin`) and
`SERVICE_SEE_ALL_ROLES` (`super_admin, finance, procurement, services_admin`).
`services_admin` is intentionally absent from `PROJECT_SEE_ALL_ROLES` (falls
through to the `all_projects` escape hatch + fail-closed
`assigned_project_codes` default); symmetric for `operations_admin` on
`SERVICE_SEE_ALL_ROLES`. The explicit role branch is checked BEFORE the
`all_projects`/`all_services` flag, defusing the Manage-save landmine.

Static gates: `node --check app/utils.js` OK. `SCOPE_EXEMPT_ROLES` count = 0
(old name fully removed). `PROJECT_SEE_ALL_ROLES|SERVICE_SEE_ALL_ROLES` count
= 8 (>= 4 required).

After Task 2 the scope-helper half of the matrix went GREEN; the
`isMrfInAssignedScope` AND-collapse bug remained (fixed in Task 3).

### Task 3 — `app/views/procurement.js` department-keyed null-handling (`2ea10ed`)
Rewrote the tail of `isMrfInAssignedScope`: a null scope dimension now
matches every record of THAT dimension's department (via the established
`mrfDept = mrf.department || (mrf.service_code ? 'services' : 'projects')`
idiom) instead of contributing `false` to the union. Preserves the 260615-nlj
no-leak invariant structurally — a cross-dept admin's cross dimension is
always a non-null assigned-codes array, so unassigned/codeless cross-dept
items match neither branch.

Static gates: `node --check app/views/procurement.js` OK.
`node scripts/verify-crossdept-admin-scoping.js` → **GREEN, exit 0.**

### Task 4 — `firestore.rules` symmetric assigned-member branches (`6ac4509`)
Added the mirrored admin to every kg0 assigned-member branch with the
IDENTICAL assigned-member constraint (never blanket):
- PROJECTS side: `services_admin` added to projects-update BRANCH 2
  (field-masked lifecycle write), `projects/audit_log` create,
  `project_tasks` create/update-Tier1/update-Tier2/delete, and `proposals`
  create-BRANCH-B + update-BRANCH-2 (project-parented).
- SERVICES side: `operations_admin` added to the services update assigned
  branch, `services/edit_history` create (fixes the documented asymmetry),
  `services/audit_log` create, `service_tasks`
  create/update-Tier1/update-Tier2/delete, and `proposals` create-BRANCH-B +
  update-BRANCH-2 (service-parented, redundant-but-symmetric given
  `operations_admin`'s existing blanket BRANCH-A/1 power — noted inline).

**LOCKED sections asserted byte-unchanged (grep line + text match):**
```
projects create   (line 206): allow create: if hasRole(['super_admin', 'operations_admin']);
projects delete   (line 260): allow delete: if hasRole(['super_admin', 'operations_admin']);
services create   (line 579): allow create: if hasRole(['super_admin', 'services_admin']);
services delete   (line 593): allow delete: if hasRole(['super_admin', 'services_admin']);
```

Static gates:
- `node scripts/verify-crossdept-admin-scoping.js` brace-balance check:
  `{ count = 81, } count = 81` — balanced, GREEN overall.
- `operations_admin.*isAssignedToService|isRole('operations_admin')` count =
  11 (>= 4 required).
- `isRole('services_admin')` count = 10 (>= 4 required).

**Not deployed.** No `firebase deploy` command was run.

### Task 5 — UI/data affordances (`41c4272`)
Admitted the cross-dept admin into member-action gates ONLY when assigned
(personnel/assigned-code) — moved from blanket `adminRoles` to
assignment-gated `assignedRoles`:

- `app/views/project-detail.js`: `canDrive` — `services_admin` moved
  `adminRoles` → `assignedRoles`; `LOSS_ASSIGNED_ROLES` gains
  `services_admin`; `_canAdvanceProjectStatus` assignment branch gains
  `services_admin` (drives every gate incl. Completed — project side has no
  Completion exclusion). `canEditPersonnel` (super_admin||operations_admin)
  LOCKED, untouched.
- `app/views/service-detail.js`: `saveServiceField` + `toggleServiceDetailActive`
  role-gate arrays gain `operations_admin`; `canDrive` — `operations_admin`
  moved `adminRoles` → `assignedRoles`; `_canAdvanceServiceStatus` assignment
  branch gains `operations_admin` (Completed exclusion, D-04
  services_admin-only, unchanged for everyone); `LOSS_ASSIGNED_ROLES` gains
  `operations_admin`. `canEditPersonnel` (super_admin||services_admin) and
  the container-level admin-only gate (line 173,
  services_admin||super_admin) LOCKED, untouched.
- `app/views/assignments.js`: Projects/Services grid filters gain a
  cross-dept-admin-with-codes row, mirroring the existing `*_user`-with-codes
  rows. `getVisibleSubTabs` and `saveManageModal` LOCKED, untouched.

Static gates:
- `node --check` PASS on `project-detail.js`, `service-detail.js`,
  `assignments.js`.
- `operations_admin` count in `service-detail.js` = 10 (>= 5 required).
- `services_admin` count in `project-detail.js` = 6 (>= 3 required).
- Cross-dept admin grid rows in `assignments.js` = 4 (>= 2 required).

## Final RED→GREEN verification (all 5 files, current state)

```
=== Role x Scope-Helper Matrix ===
  operations_admin   projects=null           services=["S1"]
  services_admin     projects=["P1"]         services=null
  operations_user    projects=["P1"]         services=["S1"]
  services_user      projects=["P1"]         services=["S1"]
  super_admin        projects=null           services=null
  finance            projects=null           services=null
  procurement        projects=null           services=null

=== Role x MRF-Visibility Matrix ===
                    P1        P9        codeless  LEGACY    S1        S9
  operations_admin  true      true      true      true      true      false
  services_admin    true      false     false     false     true      true
  operations_user   true      false     false     false     true      false
  services_user     true      false     false     false     true      false
  super_admin       true      true      true      true      true      true

=== firestore.rules brace balance ===
  { count = 81, } count = 81

All assertions passed. Full role x visibility matrix holds.
EXIT_CODE=0
```

`node --check` PASS on all 6 touched/created files:
`app/utils.js`, `app/views/procurement.js`, `app/views/project-detail.js`,
`app/views/service-detail.js`, `app/views/assignments.js`,
`scripts/verify-crossdept-admin-scoping.js`.

## Deviations from Plan

None — plan executed exactly as written (interface line anchors from the
plan's `<interfaces>` block matched the live source at time of execution;
minor line-number drift from the plan's cited numbers due to unrelated prior
commits did not affect any edit's correctness, confirmed via re-read before
each edit).

## Known Stubs

None.

## Threat Flags

None — this quick task adds no new network endpoints, auth paths, or schema
fields; it only extends existing role-based rule branches to mirror an
already-shipped pattern (kg0). See the plan's `<threat_model>` (T-mco-01
through T-mco-06) for the full disposition table; all threats there are
`mitigate`/`accept` and are addressed by the Task 4/5 changes described
above.

## Task 6 — PENDING / blocked-on-user

**NOT executed by this run.** Task 6 is `checkpoint:human-verify
gate="blocking"` and requires:

1. `firebase deploy --only firestore:rules --project dev` (rules changes are
   NOT live until deployed — the executor did not run this).
2. Browser UAT scenarios 1–6 per the plan (`260706-mco-PLAN.md` Task 6):
   home see-all, cross assigned-only view, cross member writes, cross
   container powers blocked, `*_user`/other-role regression, and the
   Manage-save landmine guard.
3. Final flagged manual step (after dev UAT approval):
   `firebase deploy --only firestore:rules` to PROD (rides the standing
   v3.3 → main rules-deploy debt already tracked in STATE.md, now also
   including this quick's rules change).

Reply "approved" (optionally "prod-deployed" once the prod deploy is run) or
describe any failing scenario to continue.

## Self-Check

- `scripts/verify-crossdept-admin-scoping.js` exists: FOUND
- `app/utils.js` modified (PROJECT_SEE_ALL_ROLES/SERVICE_SEE_ALL_ROLES present): FOUND
- `app/views/procurement.js` modified (department-keyed isMrfInAssignedScope): FOUND
- `firestore.rules` modified (mirrored branches, brace-balanced 81/81): FOUND
- `app/views/project-detail.js` / `service-detail.js` / `assignments.js` modified: FOUND
- Commits `93734f1`, `a826cb5`, `2ea10ed`, `6ac4509`, `41c4272` all present in `git log`: FOUND

## Self-Check: PASSED
