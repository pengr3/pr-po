---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 04
subsystem: database
tags: [firestore, personnel_user_ids, assignment-scoping, onSnapshot, fail-closed, portfolio-views]

# Dependency graph
requires:
  - phase: 113-03
    provides: window._personnelAssignedCodes personnel-derived cache; getAssignedProjectCodes()/getAssignedServiceCodes() repointed onto it (null=see-all, []=see-nothing, [...]=see-exactly-these)
  - phase: 113-01
    provides: widened services list rule branches accepting a personnel_user_ids predicate + 3 composite indexes (projects×project_code, projects×client_code, services×client_code) paired with array-contains
provides:
  - "app/views/projects.js loadProjects() branches on getAssignedProjectCodes(): null keeps the unscoped collection(db,'projects') listener, every scoped role (including services_admin per D-16) gets query(collection(db,'projects'), where('personnel_user_ids','array-contains',uid)) with a fail-closed uid guard"
  - "app/views/services.js loadServices() collapsed from a three-way branch to two: any scoped role (getAssignedServiceCodes() !== null) shares one query shape keyed on personnel_user_ids array-contains; the legacy service_code-in branch (hard-coded to role === 'operations_user' vs everyone else) is gone"
  - "app/views/projects.js, app/views/services.js, app/views/service-detail.js: zero fire-and-forget syncPersonnelToAssignments/syncServicePersonnelToAssignments call sites remain — 4 of the phase's 11 total call sites removed by this plan (addProject onAfterCreate, projects.js saveEdit, addService onAfterCreate, services.js saveServiceEdit; service-detail.js's 2 personnel-panel sites were already counted separately in the phase's 11 and are also removed here)"
affects: [113-05, 113-06, 113-07, 113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Query-source branch precedes onSnapshot attachment: compute projectsSource/servicesQuery (either the unscoped collection or a scoped query) before calling onSnapshot, so the listener callback body stays untouched and only the feed changes"
    - "Fail-closed uid guard: a scoped role with no resolvable uid empties the local array, calls the filter/render function, and returns WITHOUT attaching any listener — never falls through to the unscoped source"

key-files:
  created: []
  modified:
    - app/views/projects.js
    - app/views/services.js
    - app/views/service-detail.js

key-decisions:
  - "createEngagement's onAfterCreate callback was REMOVED as a property (not kept as an empty function) from both addProject and addService's options objects — engagement-create.js checks `typeof onAfterCreate === 'function'` before invoking it, so omitting the property entirely is safe and was confirmed by reading engagement-create.js before editing"
  - "Locals computed solely to feed the deleted sync call were removed too: projects.js's oldNormalized/oldUserIds (saveEdit) and newUserIds/projectCode (saveEdit); services.js's identical pair in saveServiceEdit; service-detail.js's previousUserIds in both selectDetailServicePersonnel and removeDetailServicePersonnel. Locals that also feed the updateDoc payload or local-state sync (newUserIds/newNames in service-detail.js) were left untouched since they are not solely sync-call inputs"
  - "services.js's old assignedCodes.length === 0 early-return was deliberately NOT reintroduced when collapsing to two branches — the array-contains query naturally returns nothing for a user with zero assignments, and removing the length-check keeps the listener attached so a later assignment appears live without a reload (T-113-18)"

patterns-established: []

requirements-completed: [D-02, D-07, D-08, D-11, D-12, D-13, D-16]

# Metrics
duration: ~10min
completed: 2026-08-11
---

# Phase 113 Plan 04: Portfolio Query Scoping + Sync-Tail Removal Summary

**`projects.js` and `services.js` portfolio listeners now branch on the personnel-derived `getAssignedProjectCodes()`/`getAssignedServiceCodes()` helpers instead of an unscoped collection query or a hard-coded role check, and 4 of the phase's 11 fire-and-forget `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` call sites are gone from the projects/services/service-detail trio.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-08-11
- **Tasks:** 3/3
- **Files modified:** 3 (`app/views/projects.js`, `app/views/services.js`, `app/views/service-detail.js`)

## Accomplishments

- `app/views/projects.js` `loadProjects()`: added a branch before the `onSnapshot` call — `assignedCodes === null` (a `PROJECT_SEE_ALL_ROLES` member or an `all_projects === true` holder) keeps the existing unscoped `collection(db, 'projects')` source; every other role (`operations_user`, `services_user`, and `services_admin`, which is deliberately absent from `PROJECT_SEE_ALL_ROLES` per D-16) gets `query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid))`. A missing uid empties `allProjects`, calls `applyFilters()`, and returns before any listener attaches (fail-closed, T-113-16). `applyFilters()`, the `listeners.push(listener)` line, and the portfolio-wide collectibles listener that follows are byte-identical to before.
- `app/views/services.js` `loadServices()`: collapsed the pre-existing three-way branch (`role === 'operations_user'` → array-contains; `else if (assignedCodes !== null)` → legacy `service_code in` query; `else` → unscoped) into two branches. The legacy `service_code in assignedCodes` branch — which would have left a `services_user` assigned after 113-09 deletes the sync helpers unable to see their own new service — is deleted. Every scoped role now shares `getAssignedServiceCodes() !== null` as the branch condition and the identical `where('personnel_user_ids', 'array-contains', uid)` query; no role literal decides the query shape any more. The fail-closed uid guard is preserved verbatim. The old `assignedCodes.length === 0` early-return is gone (T-113-18) — the listener stays attached for a zero-assignment user so a later assignment appears live.
- Removed 4 fire-and-forget sync call sites and their locals: `projects.js` `addProject`'s `onAfterCreate` callback (removed as a property, not kept empty — confirmed safe by reading `engagement-create.js`'s `typeof onAfterCreate === 'function'` guard) and `saveEdit`'s personnel-diff sync tail (plus `oldNormalized`/`oldUserIds`/`newUserIds`/`projectCode` locals that became unused); `services.js` mirrors both sites identically. `service-detail.js`'s add/remove personnel handlers lost their `syncServicePersonnelToAssignments(...).catch(...)` tails plus the `previousUserIds` local each computed solely for that call — the awaited `updateDoc` writing `personnel_user_ids`/`personnel_names`, the surrounding try/catch with `showToast(..., 'error')`, and the `recordEditHistory` calls are all untouched.
- All 3 named imports (`syncPersonnelToAssignments` from `projects.js`; `syncServicePersonnelToAssignments` from `services.js` and `service-detail.js`) removed. `normalizePersonnel` stays imported in all three files (still used elsewhere: `projects.js:1279`, `services.js:1300`, `service-detail.js:1055`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Scope the projects portfolio listener and remove its two sync call sites** - `92e6fda` (feat)
2. **Task 2: Make the services portfolio listener uniformly personnel-scoped and remove its two sync call sites** - `b96a5d4` (feat)
3. **Task 3: Strip the two personnel-panel sync tails from service-detail.js** - `9e37a3e` (feat)

## Files Created/Modified

- `app/views/projects.js` - `loadProjects()` query-source branch (array-contains for scoped roles, unscoped for see-all); `addProject`/`saveEdit` sync-tail removal; import list trimmed
- `app/views/services.js` - `loadServices()` collapsed to 2 branches keyed uniformly on `getAssignedServiceCodes() !== null`; legacy `service_code in` branch deleted; `addService`/`saveServiceEdit` sync-tail removal; import list trimmed
- `app/views/service-detail.js` - `selectDetailServicePersonnel`/`removeDetailServicePersonnel` sync-tail removal; import list trimmed

## Final branch structure

**`projects.js` `loadProjects()`:**
```javascript
const currentUser = window.getCurrentUser?.();
const assignedCodes = window.getAssignedProjectCodes?.();
let projectsSource;
if (assignedCodes === null) {
    projectsSource = collection(db, 'projects');                 // see-all
} else {
    const uid = currentUser?.uid;
    if (!uid) { allProjects = []; applyFilters(); return; }      // fail-closed
    projectsSource = query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid));
}
const listener = onSnapshot(projectsSource, (snapshot) => { /* unchanged callback */ });
```

**`services.js` `loadServices()`:**
```javascript
const currentUser = window.getCurrentUser?.();
const assignedCodes = getAssignedServiceCodes();
let servicesQuery;
if (assignedCodes !== null) {
    const uid = currentUser?.uid;
    if (!uid) { allServices = []; applyServiceFilters(); return; }  // fail-closed
    servicesQuery = query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', uid));
} else {
    servicesQuery = collection(db, 'services');                     // see-all
}
const listener = onSnapshot(servicesQuery, (snapshot) => { /* unchanged callback */ }, (error) => { /* unchanged */ });
```

## `createEngagement`'s `onAfterCreate` callback

Removed as a property entirely from both `addProject` and `addService`'s `createEngagement({...})` call — not kept as an empty function. Verified safe before editing by reading `app/engagement-create.js:129` (`if (typeof onAfterCreate === 'function') { ... }`), which treats the callback as optional. Neither call site needed the property for anything else (both bodies contained only the now-deleted sync call).

## Decisions Made

See `key-decisions` in frontmatter. Summarized: `onAfterCreate` removed as a property rather than emptied; locals removed only when they became unused solely due to the sync-call deletion (verified per-variable via grep before removal — e.g. `newUserIds`/`newNames` in `service-detail.js` were kept because they also feed the `updateDoc` payload and local-state sync, only `previousUserIds` was sync-call-only); the services `length === 0` early-return was deliberately not reintroduced per the plan's explicit T-113-18 guidance.

## Deviations from Plan

None - plan executed exactly as written. All 3 tasks' `<verify>`/`<acceptance_criteria>` blocks were run and passed as specified.

## Listener register/teardown symmetry

This plan added zero new `onSnapshot()` calls — it only changed which query source (unscoped `collection(...)` vs scoped `query(...)`) feeds into each file's existing `onSnapshot()` call. Listener counts are therefore unchanged from pre-plan state and symmetry (already correct) is preserved:

- `app/views/projects.js`: 4 `onSnapshot()` call sites, all pushed to the module `listeners` array (`listeners.push(...)` ×4 at lines 443, 479, 874, 899) and unsubscribed via `listeners.forEach(unsubscribe => unsubscribe?.()); listeners = [];` in `destroy()` (lines 379-380). Register = teardown = 4.
- `app/views/services.js`: 3 `onSnapshot()` call sites, all pushed to `listeners` (lines 462, 497, 910) and unsubscribed identically in `destroy()` (lines 397-398). Register = teardown = 3.
- `app/views/service-detail.js`: 8 `onSnapshot()` call sites — untouched by this plan (Task 3 only edited the two personnel-panel handlers, not listener registration/teardown code).

## Sync call site removal proof

```
$ grep -rn "syncPersonnelToAssignments\|syncServicePersonnelToAssignments" app/views/projects.js app/views/services.js app/views/service-detail.js
(no output — zero matches)
```

```
$ grep -n "where('service_code', 'in'" app/views/services.js
(no output — zero matches, legacy branch fully removed)
```

```
$ grep -n "where('personnel_user_ids', 'array-contains'" app/views/projects.js app/views/services.js
app/views/projects.js:861:            projectsSource = query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid));
app/views/services.js:893:            servicesQuery = query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', uid));
```

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No Firestore rules/indexes touched by this plan (those landed in 113-01, dev-deployed in 113-02). No new Firestore listener added, so no new composite index is needed beyond the 3 already deployed to dev in Wave 2.

## Next Phase Readiness

- The two main portfolio list surfaces (`#/projects`, `#/services`) now issue a query every scoped role can satisfy under the rule that plan 113-10 will tighten — both use the identical `personnel_user_ids array-contains uid` shape, closing the last structural difference between the two sides (D-07).
- `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` remain exported from `app/utils.js` and are still imported by other modules not in this plan's scope (`app/engagement-create.js`'s own `onAfterCreate` callbacks in `submitNewEngagement`, plus `project-detail.js`/other call sites tracked separately in the phase). Their deletion is scoped to plan 113-09, not this plan.
- 4 of the phase's 11 fire-and-forget sync invocations removed by this plan; 7 remain in files out of this plan's scope for future waves.
- No stubs introduced; no new threat surface beyond what `113-04-PLAN.md`'s `<threat_model>` already covers (T-113-16 through T-113-20 mitigations all verified in place above).

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*

## Self-Check: PASSED

All claimed files verified present and modified (`app/views/projects.js`, `app/views/services.js`, `app/views/service-detail.js`). All 3 task commit hashes (`92e6fda`, `b96a5d4`, `9e37a3e`) verified present in `git log --oneline -5`. `node --check` passed on all 3 JS files. All plan-level `<verification>` grep checks (zero sync references, zero legacy `service_code in` query, `array-contains` present in both list views) passed as shown above.
