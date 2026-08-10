---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 03
subsystem: auth
tags: [firestore, personnel_user_ids, assignment-scoping, onSnapshot, fail-closed]

# Dependency graph
requires:
  - phase: 113-01
    provides: additive personnel_user_ids OR-alternatives on services/project_tasks/service_tasks rule branches + 3 composite indexes (dev-deployed via 113-02)
provides:
  - "getAssignedProjectCodes()/getAssignedServiceCodes() now derive their scoped return value from live personnel_user_ids membership on projects/services documents, not from the frozen user.assigned_project_codes/assigned_service_codes arrays"
  - "window._personnelAssignedCodes personnel-derived assignment cache with initAssignedCodesListeners()/destroyAssignedCodesListeners() bootstrap/teardown API"
  - "auth.js lifecycle wiring: cache populated before first route render, rebuilt on role change, torn down on deactivation and sign-out"
  - "scripts/verify-crossdept-admin-scoping.js updated to exercise the new cache-backed helper source, including 2 new fail-closed assertions"
affects: [113-04, 113-05, 113-06, 113-07, 113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Personnel-derived assignment cache on window (not module scope), listener-backed, resolved-on-first-snapshot, fail-closed to [] on load/error"
    - "Idempotent-per-uid cache bootstrap awaited before initial route render to avoid an empty-cache flash"

key-files:
  created: []
  modified:
    - app/utils.js
    - app/auth.js
    - scripts/verify-crossdept-admin-scoping.js

key-decisions:
  - "Cache lives on window._personnelAssignedCodes rather than module scope, specifically so scripts/verify-crossdept-admin-scoping.js's extract-and-eval technique (which strips getAssignedProjectCodes/getAssignedServiceCodes out of app/utils.js as standalone text) keeps working without ReferenceError — module-scope unsubscribe handles stay module-scope since the eval'd bodies never reference them"
  - "initAssignedCodesListeners attaches a listener per dimension ONLY when the actor is actually scoped for that dimension (role not in PROJECT_SEE_ALL_ROLES/SERVICE_SEE_ALL_ROLES AND all_projects/all_services !== true) — a see-all role never issues the scoped query at all (T-113-15)"
  - "assignmentsChanged dispatch on cache change is suppressed on each dimension's FIRST snapshot (initial render already happens through the normal view init path) and only fires on subsequent changes, mirroring the existing auth.js idiom"
  - "Listener error callbacks keep the last known cache value and log with an [AssignedCodes] prefix — never clear to null, which would silently mean 'see everything' (T-113-14)"
  - "app/auth.js imports initAssignedCodesListeners/destroyAssignedCodesListeners as a real ES import from utils.js (no circular dependency: utils.js does not import auth.js) rather than routing through window, per the plan's stated preference"

patterns-established:
  - "Fail-closed cache bootstrap: window._personnelAssignedCodes is set to { projects: [], services: [] } BEFORE any listener is attached, so a load failure or a still-loading state defaults to 'sees nothing', never 'sees everything'"

requirements-completed: [D-02, D-04, D-07, D-08, D-09]

# Metrics
duration: ~7min
completed: 2026-08-11
---

# Phase 113 Plan 03: Assignment Source of Truth — Personnel-Derived Cache Summary

**Repointed `getAssignedProjectCodes()`/`getAssignedServiceCodes()` onto a live, listener-backed `window._personnelAssignedCodes` cache derived from `personnel_user_ids` membership, fixing all ~10 downstream consumers (including `procurement.js`'s `isMrfInAssignedScope()`, untouched) from a single central repoint.**

## Performance

- **Duration:** ~7 min (commit-to-commit, `bb2a5d0` → `95b1885`)
- **Completed:** 2026-08-11
- **Tasks:** 3/3
- **Files modified:** 3 (`app/utils.js`, `app/auth.js`, `scripts/verify-crossdept-admin-scoping.js`)

## Accomplishments

- `app/utils.js`: added `onSnapshot` to the existing `./firebase.js` import; introduced a personnel-derived assignment cache (`window._personnelAssignedCodes`, an object with `projects`/`services` string-array properties) with `initAssignedCodesListeners(user)` (idempotent per uid, fail-closed default before anything attaches, one `where('personnel_user_ids','array-contains',uid)` listener per scoped dimension, resolves once every attached dimension's first snapshot has arrived) and `destroyAssignedCodesListeners()` (unsubscribes both, resets the cache to the fail-closed default).
- Repointed `getAssignedProjectCodes()`/`getAssignedServiceCodes()`: the `null`-means-see-all short-circuits (`PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES` role check, then `all_projects === true`/`all_services === true`) are byte-identical and still evaluated FIRST, before any cache access. Only the final line changed — from reading `user.assigned_project_codes`/`user.assigned_service_codes` to reading `window._personnelAssignedCodes.projects`/`.services`, defaulting to `[]` when the cache is missing or malformed.
- `app/auth.js`: added a real ES import of the two new functions from `utils.js` (no circular dependency). Inside `initAuthObserver`'s `isFirstSnapshot` block, the cache is bootstrapped and **awaited** for active users (`userData.status === 'active'`) right after the notifications bootstrap, wrapped in try/catch (`[Auth]`-prefixed log on failure, never blocks sign-in) — this await happens before `window.dispatchEvent('authStateChanged')` and before `window.handleInitialRoute()`, closing the race where a view could render before the first personnel snapshot arrives. The cache is torn down and rebuilt inside the existing `if (previousRole !== userData.role)` block (role determines which dimensions are scoped), and torn down in both the deactivated-user path (first-snapshot branch) and the signed-out branch, so listeners never survive a logout or deactivation.
- `scripts/verify-crossdept-admin-scoping.js`: matrix fixtures now populate `global.window._personnelAssignedCodes` instead of setting `assigned_project_codes`/`assigned_service_codes` on the stubbed user object (role/uid/`all_*` fields kept — the helpers still read those). Both mco landmine assertions preserved verbatim. Two new assertions prove the fail-closed posture: an undefined cache yields `[]` for a scoped role (`services_user` for projects, `operations_user` for services), never `null`/`undefined`. Header comment documents the new `window._personnelAssignedCodes` dependency.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the personnel-derived assignment cache to app/utils.js and repoint both helpers** - `bb2a5d0` (feat)
2. **Task 2: Bootstrap and tear down the cache from the auth observer** - `bb473ca` (feat)
3. **Task 3: Keep the cross-department scoping matrix harness executable** - `95b1885` (test)

## Files Created/Modified

- `app/utils.js` - `onSnapshot` import; `initAssignedCodesListeners`/`destroyAssignedCodesListeners` exports + module-scope unsubscribe handles; `getAssignedProjectCodes`/`getAssignedServiceCodes` repointed onto `window._personnelAssignedCodes`; both new functions registered on `window`
- `app/auth.js` - ES import of the two new functions; await bootstrap in `isFirstSnapshot` block (line 22 import, line ~253 await call — before `window.handleInitialRoute` at line ~308, confirmed by the plan's own ordering verify check); role-change re-init inside the existing `previousRole !== userData.role` block; teardown in the deactivated-user path (line ~281) and the signed-out branch (line ~411); comment added above the `assignmentsChanged` dispatch documenting its legacy-array half is now vestigial (D-08) while `all_projects`/`all_services` keep it live (D-09)
- `scripts/verify-crossdept-admin-scoping.js` - `ROLE_STUBS` stripped of `assigned_project_codes`/`assigned_service_codes`; new `PERSONNEL_CACHE_BY_ROLE` fixture map; both matrix loops (Part 1 scope-helper matrix, Part 2 MRF-visibility matrix) now set `global.window._personnelAssignedCodes` per case; landmine assertions preserved; 2 new fail-closed assertions; header comment updated

## Exact shape of `window._personnelAssignedCodes`

```javascript
window._personnelAssignedCodes = {
    projects: string[],   // project_code values from projects docs where personnel_user_ids array-contains the actor's uid
    services: string[]    // service_code values from services docs where personnel_user_ids array-contains the actor's uid
};
```
Set to `{ projects: [], services: [] }` (fail-closed default) before any listener attaches, on every `destroyAssignedCodesListeners()` call, and whenever `initAssignedCodesListeners()` is (re-)invoked. A codeless assigned project/service contributes no entry to its array (handled by existing consumer-site carve-outs, not by this cache).

## Where the await was placed in `app/auth.js`

The bootstrap call — `await initAssignedCodesListeners(currentUser);` (wrapped in try/catch) — sits inside `initAuthObserver`'s `isFirstSnapshot` block, immediately after the Phase 83 notifications bootstrap block and immediately before the "Status-based routing (AUTH-08)" comment (source line ~253 in the post-edit file). This is before `window.dispatchEvent(new CustomEvent('authStateChanged', ...))` and before the `if (!initialRouteHandled && window.handleInitialRoute)` call (line ~308), which was confirmed programmatically: `initAssignedCodesListeners`'s first occurrence in the file is at a lower character offset than `window.handleInitialRoute`'s first occurrence.

## Harness output (`node scripts/verify-crossdept-admin-scoping.js`)

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
```
Exit code 0.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: cache lives on `window` (not module scope) purely to keep the eval-based verification harness working; per-dimension listener attachment (not a single combined listener) so see-all roles never issue the scoped query; error callbacks preserve last-known-good rather than clearing to `null`; `assignmentsChanged` dispatch suppressed on first snapshot per dimension to avoid a duplicate render on initial load.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks' explicit `<verify>`/`<acceptance_criteria>` blocks were run and passed as specified (see command output above and in the per-task tool calls). `git diff --stat app/views/procurement.js` confirmed empty throughout — `isMrfInAssignedScope()` (D-04's no-leak invariant) was never touched.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan is pure client-side JS + a Node verification script; no Firestore rules/indexes were touched (those landed in 113-01 and were dev-deployed in 113-02). Production rules deploy remains an outstanding carry item from 113-02, tracked separately.

## Next Phase Readiness

- All ~10 documented consumers of `getAssignedProjectCodes()`/`getAssignedServiceCodes()` (`projects.js:152,805`, `services.js:144,831`, `project-detail.js:562`, `service-detail.js:773`, `mrf-form.js:1150,1179`, `procurement.js:2898,2981-2982`) now receive personnel-derived, live-updating, fail-closed data with zero edits to those files.
- `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` are untouched and still exported (5 other modules import them) — their deletion is scoped to plan 113-09, not this plan.
- The `PROJECT_SEE_ALL_ROLES`/`SERVICE_SEE_ALL_ROLES` escape hatches and the see-all role lists are byte-identical to their pre-task values (verified programmatically).
- **Critical correctness note carried forward:** the three-state contract (`null` = see-all, `[]` = see-nothing, `[...]` = see-exactly-these) is preserved verbatim in both helpers and proven by the harness's fail-closed assertions — a scoped user with an unpopulated/broken cache resolves to `[]`, never `null`.
- Ready for the next wave's client query conversions (the Shape A/B/C/E conversions cataloged in `113-PATTERNS.md`), which can now call these two helpers and trust the returned codes are personnel-membership-accurate rather than frozen-array-accurate.

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*

## Self-Check: PASSED

All claimed files verified present and modified (`app/utils.js`, `app/auth.js`, `scripts/verify-crossdept-admin-scoping.js`). All 3 task commit hashes (`bb2a5d0`, `bb473ca`, `95b1885`) verified present in `git log --oneline -5`. `node --check` passed on both JS files; `node scripts/verify-crossdept-admin-scoping.js` exited 0 with all assertions passed.
