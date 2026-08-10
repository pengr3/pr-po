---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 06
subsystem: database
tags: [firestore, personnel_user_ids, assignment-scoping, array-contains, mrf-filing, po-delivered-journal]

# Dependency graph
requires:
  - phase: 113-03
    provides: window._personnelAssignedCodes personnel-derived cache; getAssignedProjectCodes()/getAssignedServiceCodes() repointed onto it (null=see-all, []=see-nothing, [...]=see-exactly-these)
  - phase: 113-01
    provides: additive personnel_user_ids OR-alternatives on services rule branches (transitional, legacy isAssignedTo* term still accepted)
provides:
  - "app/views/mrf-form.js loadProjects()/loadServices(): both converted to bare personnel_user_ids array-contains queries for scoped roles (no composite index needed), active re-applied client-side where dropped from the query; legacy service_code 'in' query retired"
  - "app/views/procurement.js loadServicesForNewMRF()/loadProjects(): identical conversion — loadProjects() was previously FULLY unscoped (D-16, disproving CONTEXT.md's preliminary projScope claim) and is now personnel-scoped, reachable by services_admin as a scoped role"
  - "app/views/procurement.js PO-Delivered project-journal block: getDoc(doc(db,'projects', mrfData.project_id)) replaces the where('project_name','==',...) list query; pre-Phase-78 MRFs without project_id skip the entry (logged) rather than falling back to a name query"
  - "isMrfInAssignedScope() (procurement.js:2980-2988): body byte-identical to pre-plan state, D-04 no-leak union logic untouched; one explanatory comment added above it"
affects: [113-07, 113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bare array-contains, no paired where(): scoped branch drops the equality filter from the query entirely and re-applies it as a client-side post-filter in the snapshot/getDocs callback, avoiding any new composite index requirement"
    - "Doc-ID read via denormalized foreign key: PO-Delivered journal now resolves its project by mrfData.project_id (Phase 78 D-04) instead of a name-equality list query"

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js

key-decisions:
  - "loadServicesForNewMRF()/loadProjects() (procurement.js) and loadProjects()/loadServices() (mrf-form.js) all use ONE where() clause on the scoped branch (personnel_user_ids array-contains uid only) — active is re-applied client-side in the callback rather than paired in the query, per the plan's explicit instruction to avoid requiring a new composite index"
  - "rebuildPSOptions()'s codeless-container carve-outs (!p.project_code / !s.service_code) were KEPT, not removed — they remain load-bearing under the personnel-derived model since a codeless assigned container contributes no code to getAssignedProjectCodes()/getAssignedServiceCodes(); only their comments were updated to drop the now-false syncPersonnelToAssignments reference"
  - "PO-Delivered pre-Phase-78 MRF (no project_id): journal entry is skipped and logged, NOT backfilled by a name-based fallback query — the block is already best-effort inside a swallow try/catch, so this is the correct degradation per RESEARCH assumption A4"
  - "isMrfInAssignedScope() left completely untouched except for one comment line above the function — its projOk/svcOk/return lines are byte-identical, verified via git diff and the plan's literal verify regex"
  - "Phase 104 D-12 service journal traversal (where('service_code','==',serviceCode)) explicitly NOT converted — a comment was added recording why: it's reachable only by procurement_records edit-rights roles, all in the services list rule's exempt set, and there is no denormalized service_id on the MRF to key a doc-ID read on"

patterns-established: []

requirements-completed: [D-02, D-04, D-13, D-16]

# Metrics
duration: ~12min
completed: 2026-08-11
---

# Phase 113 Plan 06: MRF-Filing Surfaces + PO-Delivered Journal Read Conversion Summary

**Converted the dedicated MRF form's and Procurement tab's project/service pickers from unscoped-plus-equality (Shape B) and legacy `in` (Shape E) queries to bare personnel_user_ids array-contains queries, and replaced the PO-Delivered activity-journal's project name lookup with a doc-ID `getDoc` keyed on the MRF's denormalized `project_id` — while leaving the D-04 no-leak predicate in `isMrfInAssignedScope()` provably byte-identical.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-08-11
- **Tasks:** 3/3
- **Files modified:** 2 (`app/views/mrf-form.js`, `app/views/procurement.js`)

## Accomplishments

- `app/views/mrf-form.js` `loadProjects()`: branches on `window.getAssignedProjectCodes?.() === null`. See-all keeps the original `where('active','==',true)` query untouched. Scoped roles get a bare `query(projectsRef, where('personnel_user_ids','array-contains',uid))` with a fail-closed uid guard (no uid → return without attaching a listener). The dropped `active` filter is re-applied inside the existing `snapshot.forEach`, alongside the pre-existing `project_status === 'Draft'` skip.
- `app/views/mrf-form.js` `loadServices()`: collapsed to the same two-branch shape. The legacy `where('service_code','in',assignedCodes)` branch (Shape E) and its `assignedCodes.length === 0` early return are both gone — the array-contains query naturally yields nothing for a zero-assignment user, and keeping the listener attached means a later assignment appears live. `active` for the scoped branch stays enforced downstream in `rebuildPSOptions()` (unchanged behavior, per plan).
- `app/views/mrf-form.js` `rebuildPSOptions()`: both codeless-container carve-outs (`!p.project_code && ... personnel_user_ids.includes(uid)` / `!s.service_code && ...`) were kept verbatim — they are still load-bearing because a codeless assigned project/service is returned by the array-contains query but contributes no code to `getAssignedProjectCodes()`/`getAssignedServiceCodes()`. Only their comments were updated to explain this and drop the now-inaccurate `syncPersonnelToAssignments` reference.
- `app/views/procurement.js` `loadServicesForNewMRF()`: identical Shape E retirement — legacy `service_code in` query and its zero-length early return removed in favor of a bare array-contains `getDocs` (this function is a one-time fetch, not a listener) with a fail-closed uid guard; `active` re-applied in the `snapshot.forEach` for the scoped branch only.
- `app/views/procurement.js` `loadProjects()`: this function had **zero scoping of any kind** before this plan (confirmed — RESEARCH.md's Contradicts-CONTEXT.md #1, D-16). Converted identically to the Shape B pattern: see-all keeps `where('active','==',true)`, scoped roles get bare array-contains with a fail-closed uid guard, `active` re-applied client-side. `services_admin` — deliberately absent from `PROJECT_SEE_ALL_ROLES` — now reaches this query as a scoped role and gets exactly its assigned projects rather than the entire unfiltered collection. A new doc comment states plainly that the pre-existing `projScope` local inside `isMrfInAssignedScope()` (a different function, filtering MRF records client-side) was never wired to this query.
- `app/views/procurement.js` `isMrfInAssignedScope()`: NOT edited. One comment line was added directly above the function recording that Phase 113 deliberately left it untouched because plan 113-03 already repointed the two helpers it calls onto personnel-derived codes. Verified via `git diff` that the function body (the `projOk`/`svcOk`/`return projOk || svcOk;` lines) is unchanged.
- `app/views/procurement.js` PO-Delivered block: the project-journal traversal's `where('project_name','==',projectName)` list query is replaced with `getDoc(doc(db,'projects', mrfData.project_id))`, keyed on the MRF's Phase-78-denormalized `project_id`. When `project_id` is absent (pre-Phase-78 MRF), the entry is skipped with a `[Procurement]`-prefixed log line — no name-based fallback query was reintroduced. `getDoc`/`doc` were already present in the file's `../firebase.js` import list (no import change needed). The Phase 104 D-12 service journal traversal (`where('service_code','==',serviceCode)`) was left completely alone, with a new comment recording why: it's reachable only by `procurement_records` edit-rights roles (all in the `services` list rule's exempt set) and has no denormalized `service_id` to key a doc-ID read on.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scope both mrf-form.js loaders** - `074cc99` (feat)
2. **Task 2: Scope both procurement.js loaders without touching the no-leak predicate** - `c500b03` (feat)
3. **Task 3: Replace the PO-Delivered project name lookup with a doc-ID read** - `e62d178` (fix)

## Files Created/Modified

- `app/views/mrf-form.js` - `loadProjects()`/`loadServices()` converted to the personnel-scoped bare array-contains shape; `rebuildPSOptions()` codeless carve-out comments updated
- `app/views/procurement.js` - `loadServicesForNewMRF()`/`loadProjects()` converted identically; `isMrfInAssignedScope()` left untouched plus one explanatory comment; PO-Delivered project-journal block converted to a doc-ID `getDoc`; Phase 104 D-12 service journal block left untouched plus one explanatory comment

## Final branch structure of all four converted loaders

**`mrf-form.js` `loadProjects()`:**
```javascript
const assignedCodes = window.getAssignedProjectCodes?.();
let q;
if (assignedCodes === null) {
    q = query(projectsRef, where('active', '==', true));           // see-all
} else {
    const uid = window.getCurrentUser?.()?.uid;
    if (!uid) return;                                               // fail-closed
    q = query(projectsRef, where('personnel_user_ids', 'array-contains', uid));
}
// snapshot.forEach: skip Draft always; skip active!==true only when assignedCodes !== null
```

**`mrf-form.js` `loadServices()`:**
```javascript
const assignedCodes = window.getAssignedServiceCodes?.();
let q;
if (assignedCodes !== null) {
    const uid = window.getCurrentUser?.()?.uid;
    if (!uid) return;                                               // fail-closed
    q = query(servicesRef, where('personnel_user_ids', 'array-contains', uid));
} else {
    q = query(servicesRef, where('active', '==', true));            // see-all
}
// active enforced downstream in rebuildPSOptions() for the scoped branch, unchanged
```

**`procurement.js` `loadServicesForNewMRF()`:**
```javascript
const assignedServiceCodes = window.getAssignedServiceCodes?.();
let q;
if (assignedServiceCodes !== null) {
    const uid = window.getCurrentUser?.()?.uid;
    if (!uid) return;                                               // fail-closed
    q = query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', uid));
} else {
    q = query(collection(db, 'services'), where('active', '==', true));  // see-all
}
// snapshot.forEach (getDocs, one-time): skip Draft always; skip active!==true only when scoped
```

**`procurement.js` `loadProjects()`** (previously fully unscoped):
```javascript
const assignedCodes = window.getAssignedProjectCodes?.();
let q;
if (assignedCodes === null) {
    q = query(collection(db, 'projects'), where('active', '==', true));  // see-all
} else {
    const uid = window.getCurrentUser?.()?.uid;
    if (!uid) return;                                               // fail-closed
    q = query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid));
}
// onSnapshot: skip Draft always; skip active!==true only when assignedCodes !== null
```

## `isMrfInAssignedScope()` diff confirmation

```
$ git diff eaebb86 HEAD -- app/views/procurement.js | grep -n "isMrfInAssignedScope\|projOk\|svcOk\|return projOk"
50:+// local inside isMrfInAssignedScope() (below) is an unrelated function that filters MRF RECORDS
102: function isMrfInAssignedScope(mrf) {
```
Only two hits: one `+` line (a mention inside the NEW `loadProjects()` doc comment, not inside the function itself) and one unchanged (`' '` prefix, no `+`/`-`) context line showing the function signature. The function body — `projOk`, `svcOk`, and `return projOk || svcOk;` — produced zero diff lines, confirming the comment-only change asserted by the plan.

## Listener register/teardown symmetry

This plan added **zero new Firestore listeners** — it only changed which query object feeds into each file's existing `onSnapshot()` calls (or, for the two `getDocs`-based one-time fetches, which query is issued).

- `app/views/mrf-form.js`: `onSnapshot(` count unchanged at 2 (`projectsListener` line ~1064, `servicesListener` line ~1129). Both torn down in the cleanup path (lines 361-362) and in `destroy()` (lines 1873-1879). Register = 2, teardown = 2.
- `app/views/procurement.js`: `onSnapshot(` count unchanged at 6 (`listeners.push(...)` at lines 2983, 3076, 3106, 5052, 7456, and `rfpsUnsub` at 7485). All torn down by the single blanket `listeners.forEach(unsubscribe => ...); listeners = [];` in the module's destroy path (lines 2773-2778). Register = 6, teardown = 6 (all covered by the blanket forEach).
- Confirmed via `git diff eaebb86 HEAD -- app/views/mrf-form.js app/views/procurement.js | grep -c "onSnapshot("` on both `+` and `-` lines: 0 added, 0 removed.

## `window.*` function register/teardown symmetry

This plan added **zero new `window.*` function registrations**. All `window.*` references touched in this diff are calls to pre-existing helpers (`window.getAssignedProjectCodes`, `window.getAssignedServiceCodes`, `window.getCurrentUser`) already registered by earlier plans (113-03 and prior phases) — confirmed by grepping the full plan diff for added `window.` lines and finding none outside those three call sites. Register = 0 new, teardown = 0 new (nothing to add or remove).

## Plan-level verification (cross-file)

```
$ node --check app/views/mrf-form.js && node --check app/views/procurement.js
(both exit 0)

$ node -e "... zero where('service_code', 'in') and zero where('project_name', '==', projectName) across both files ..."
All plan-level cross-file checks PASS

$ grep -n "personnel_user_ids', 'array-contains'" app/views/mrf-form.js app/views/procurement.js
app/views/mrf-form.js:1061   (loadProjects)
app/views/mrf-form.js:1123   (loadServices)
app/views/procurement.js:2910 (loadServicesForNewMRF)
app/views/procurement.js:2960 (loadProjects)
```
All four are bare single-`where()` queries — none paired with a second `where(...)` clause on the same `query(...)` call, so no new composite index is required.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: every scoped-branch query uses exactly one `where()` clause (array-contains only), with `active` re-applied client-side rather than paired in the query, to avoid requiring a new composite index; the codeless-container carve-outs in `rebuildPSOptions()` were kept (not removed) because they remain the only mechanism that surfaces a codeless assigned container, which contributes no code to the personnel-derived code-list helpers; the PO-Delivered pre-Phase-78 legacy-MRF case is skipped and logged rather than falling back to a name-based query; `isMrfInAssignedScope()` and the Phase 104 D-12 service journal traversal were both left untouched by design, each with a one-line comment recording why.

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks' explicit `<verify>`/`<acceptance_criteria>` blocks were run and passed as specified (see command output above and in the per-task tool calls). `git diff` confirmed `isMrfInAssignedScope()`'s body is byte-identical to its pre-plan state and `procurement.js:3866`'s Create-MRF picker (explicitly out of scope per CONTEXT.md's `<deferred>`) was never touched.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan is pure client-side JS; no Firestore rules/indexes were touched (those landed in 113-01, dev-deployed in 113-02). No new composite index is needed — every array-contains query added here is a single-clause query, which Firestore serves with an automatic single-field index. Production rules deploy remains an outstanding carry item from 113-02, tracked separately.

## Next Phase Readiness

- Both MRF-filing surfaces (`mrf-form.js`, the Procurement tab's Create-MRF flow) and the PO-Delivered activity journal are now personnel-scoped or doc-ID direct, closing the phase's last Shape B, Shape E, and Shape D (name-lookup) sites named in this plan's `<interfaces>`.
- `procurement.js:3866`'s Create-MRF picker remains explicitly out of scope (CONTEXT.md `<deferred>`) — its own missing role gate is unfixed, though the data it draws from (`projectsData`, now populated by the converted `loadProjects()`) is narrower for scoped roles as a side effect.
- `isMrfInAssignedScope()`'s D-04 no-leak invariant carries forward unchanged and ready for whatever future plan needs it (e.g. 113-10's transitional-term removal, which operates on `firestore.rules`, not this function).
- No stubs introduced. No new threat surface beyond what `113-06-PLAN.md`'s `<threat_model>` already covers (T-113-26 through T-113-30 all verified in place above: T-113-27's doc-ID `getDoc` reads an id already visible to the actor via the readable MRF document; T-113-28's legacy-MRF skip is unchanged in kind, now logged; T-113-29's no-leak invariant provably untouched; T-113-30's `active` re-application asserted in all three converted loaders' code above).

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*

## Self-Check: PASSED

All claimed files verified present (`app/views/mrf-form.js`, `app/views/procurement.js`, this SUMMARY). All 3 task commit hashes (`074cc99`, `c500b03`, `e62d178`) verified present in `git log --oneline --all`. `node --check` passed on both JS files. Plan-level cross-file `<verification>` checks (zero legacy `service_code in`, zero `project_name`-lookup, `isMrfInAssignedScope` union lines verbatim, no array-contains query paired with a second `where(...)`) all passed as shown above.
