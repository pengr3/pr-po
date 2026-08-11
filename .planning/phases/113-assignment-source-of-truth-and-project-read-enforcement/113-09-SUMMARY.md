---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 09
subsystem: database
tags: [firestore, security-rules, personnel-scoping, audit, uat]

requires:
  - phase: 113-04
    provides: portfolio list conversions that dropped the sync imports
  - phase: 113-05
    provides: project-detail-adjacent conversions that dropped the sync imports
  - phase: 113-06
    provides: MRF-filing surface conversions
  - phase: 113-07
    provides: the last two sync call sites removed from engagement-create.js
  - phase: 113-08
    provides: Assignments tab writing personnel_user_ids directly
provides:
  - A sync-free app/utils.js — both assignment pipelines deleted, definition and registration
  - 113-CONVERSION-AUDIT.md — 20-row D-03 completeness map plus the D-12 fire-and-forget sweep
  - Two gap-closure conversions found at this gate (service-detail.js, service-plan.js)
  - A fourth composite index, services x service_code x personnel_user_ids
  - A symmetric automated no-leak check for the D-04 / 260615-nlj invariant
  - An operator-verified behavioural baseline taken while the permissive projects rule is still in force
affects: [113-10, 113-11]

tech-stack:
  added: []
  patterns:
    - "Completeness auditing: derive the row set by enumerating read surfaces from the CODE, then reconcile against the research document — never the reverse, or the audit inherits the research's blind spots"

key-files:
  created:
    - .planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/113-CONVERSION-AUDIT.md
  modified:
    - app/utils.js
    - app/views/service-detail.js
    - app/views/service-plan.js
    - firestore.indexes.json
    - scripts/verify-crossdept-admin-scoping.js

key-decisions:
  - "Both sync helpers deleted in full; the frozen assigned_*_codes FIELDS deliberately left on user documents as inert rollback insurance (D-08). No migration, no cleanup script, no field delete."
  - "utils.js firebase.js import list pruned 14 -> 8 symbols; getDoc, updateDoc, doc, arrayUnion, arrayRemove had zero remaining references after the deletion."
  - "UAT step 4 resolved as intended design, not a defect: the Assignments tab lives under #/admin, gated on role_config, which seed-roles.js grants to super_admin only. The plan's attribution of steps 3-4 to operations_admin/services_admin was wrong. No config change made."
  - "UAT step 6 was already automated and nobody had noticed: verify-crossdept-admin-scoping.js Part 2 asserts services_admin cannot see a codeless projects-side item. Added the missing services-side mirror rather than building a new harness."
  - "Two unconverted read surfaces were found AT this gate, not before it. Both fixed here rather than deferred, because plan 113-10 converts a console error into a total list denial."

patterns-established:
  - "Code-derived surface enumeration as the independent check on a research-derived audit: grep every collection(db,'projects'|'services') call site and clear each one by role reachability"
  - "Services-side detail/plan lookups mirror their projects-side twins exactly — project-detail:project-plan :: service-detail:service-plan. Any change to one pair member belongs on all four."

requirements-completed: [D-03, D-04, D-08, D-11, D-12]

duration: 45min
completed: 2026-08-11
---

# Phase 113 Plan 09: Client-Side Closure, Audit, and Production Verification Summary

**Both assignment sync pipelines deleted, a 20-row completeness audit produced and then corrected when the browser gate exposed two read surfaces the research table never enumerated, plus a fourth composite index and a symmetric automated no-leak check.**

## Performance

- **Duration:** ~45 min including the gap-closure cycle
- **Completed:** 2026-08-11
- **Tasks:** 3 (2 auto + 1 blocking human-verify)
- **Files modified:** 5

## Accomplishments

- `syncPersonnelToAssignments` and `syncServicePersonnelToAssignments` no longer exist anywhere — definition, export, `window` registration, import and call site all gone. `git grep` across `app scripts index.html` returns only a stale reference inside `scripts/verify-phase-88.sh`, which targets a Phase-87.1-era state and is separately logged.
- All 15 files in the import graph parse. Independently confirmed the stronger property `node --check` cannot test: every named import from `utils.js` across all of `app/` resolves against an actual export, so no module is left referencing a deleted symbol.
- `113-CONVERSION-AUDIT.md` disposes of every RESEARCH.md MUST-CONVERT row — 11 CONVERTED, 2 NO CHANGE REQUIRED with stated reasons — plus 7 additional rows the research table omitted.
- D-12 sweep: zero assignment-affecting fire-and-forget writes across all three required searches.
- Operator verification passed on every applicable step, including the canonical acceptance narrative that motivated the entire phase.

## Task Commits

1. **Task 1: Delete both sync helpers from app/utils.js** — `c97108f` (feat)
2. **Task 2: D-03 completeness audit + D-12 inspection sweep** — `a21178a` (docs)
3. **Task 3: Browser verification gate** — no commit; produced the gap-closure work below

**Gap closure arising from Task 3:**
- `e859d55` (fix) — `service-detail.js` paired query + 4th composite index
- `4db612e` (test) — symmetric no-leak case in the scoping harness
- `9f527da` (fix) — `service-plan.js` paired query
- `2a5e4f8` (docs) — audit corrected with rows 19-20, the enumeration evidence, and the 113-10 constraint

## Operator Verification Results

| Step | Result | Notes |
|------|--------|-------|
| 1 — canonical narrative (`operations_admin` assigns a `services_user`, who then sees the project without re-save) | **PASS** | This is the defect the phase exists to eliminate |
| 2 — no migration required | **PASS** | Pre-existing assignments resolve on all four surfaces with zero backfill |
| 3 — Assignments tab round trip | **PASS** | Console error surfaced here was the service-detail defect below, not an Assignments fault |
| 4 — cross-department row visibility | **N/A — not a defect** | The Assignments tab is `super_admin`-only by role config; the plan mis-attributed this step to dept admins |
| 5 — `services_admin` service creation | **PASS** | Code assigned correctly |
| 6 — D-04 no-leak invariant | **PASS, now automated** | Was already covered by the harness; the services-side mirror was added |
| 7 — `all_projects`/`all_services` escape hatch | **PASS** | |
| 8 — console sweep across converted surfaces | **FAIL → fixed → re-verified PASS** | Exposed the service-detail defect; see below |

## Deviations from Plan

### 1. Two unconverted read surfaces found at the gate

**Found during:** Task 3 step 8 (`service-detail.js`) and the follow-up code enumeration (`service-plan.js`).

**Issue:** both issued a bare `where('service_code','==',X)` LIST query. Every scoped branch of the `services` allow-list rule is a per-document predicate on `personnel_user_ids`, which such a query cannot satisfy, so Firestore denied the whole listener. An `operations_user` could not open a service detail page at all.

**Not a Phase 113 regression.** The `operations_user` rule branch landed in `494c526`, and `service-detail.js`'s query was byte-identical at the pre-phase baseline `8591740`. The flow had never worked. `113-RESEARCH.md`'s MUST-CONVERT table enumerated the projects-side read surfaces and the services-side *write* paths but neither services-side *detail* lookup, so no plan in waves 3-5 was ever pointed at them.

**Fix:** the same paired-query shape `project-detail.js` and `project-plan.js` received in plan 113-05, gated on `getAssignedServiceCodes()` with a fail-closed uid guard. Required a **4th composite index**, `services × service_code × personnel_user_ids`, which plan 113-01's set of three did not cover — added and deployed to dev.

**Why fixed here rather than deferred:** plan 113-10 tightens the rules further, and Firestore list denial is total rather than partial. Deferring would have converted a console error into a blank page.

### 2. Audit corrected after the fact

The audit's first pass claimed a completeness it did not have, while being the document that authorises 113-10's irreversible tightening. It was rebuilt with rows 19-20, the full 41-site code enumeration and per-site reachability reasoning, and an explicit method lesson. Recorded honestly rather than quietly amended.

### 3. Forward-looking constraint pinned for 113-10

`procurement.js:8018` (Phase 104 D-12 PO-Delivered service-journal traversal) carries a comment asserting it is safe "both before and after this phase's scoping tightening." The first half is verified — `procurement_records.edit` is granted to exactly `super_admin`, `operations_admin`, `services_admin`, `procurement`, all four in the rule's exempt set. The second half is a claim about a plan that has not run. If 113-10 removes `operations_admin` from the `services` allow-list exempt set, this query breaks silently inside a best-effort `try/catch`, and the call site has no denormalized `service_id` to convert to a `getDoc`. Recorded in the audit as a hard input to 113-10.

## Issues Encountered

- The plan's own UAT instructions said to serve "against production Firebase." That is wrong for this repo: `app/firebase.js:56` routes `localhost`/`127.0.0.1` to `clmc-procurement-dev` and everything else to prod. Since the widened rules are deployed to dev only, running the UAT against the deployed site would have produced misleading failures. Verification was run at `http://localhost:8000` against dev, which is the correct target.
- UAT steps 3-4 assume `operations_admin`/`services_admin` can reach the Assignments tab. They cannot — it is `super_admin`-only. Steps were re-attributed rather than the config widened.

## User Setup Required

None.

## Next Phase Readiness

**Ready:** plan 113-10 may proceed. The client side is converted, audited against a code-derived surface enumeration rather than a research table, and behaviourally verified against dev while the permissive `projects` rule is still in force.

**Hard inputs 113-10 must honour:**
1. Keep `operations_admin` in the `services` allow-list exempt set, or add a denormalized `service_id` and convert `procurement.js:8018` — otherwise PO-Delivered silently loses its service journal entry.
2. `generateServiceCode`'s whole-collection range scan (audit row 12) still needs its rules-level exemption; converting it client-side would break collision detection, not fix a leak.

**Outstanding — blocks 113-11, not 113-10:**
1. Production deploy of indexes then rules to `clmc-procurement` — production currently serves none of Phase 113, and now needs **4** indexes, not 3
2. Console confirmation that all 4 `personnel_user_ids` indexes read `Enabled`

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*
