---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 05
subsystem: database
tags: [firestore, personnel_user_ids, assignment-scoping, array-contains, expense-modal]

# Dependency graph
requires:
  - phase: 113-03
    provides: window._personnelAssignedCodes personnel-derived cache; getAssignedProjectCodes() repointed onto it (null=see-all, []=see-nothing, [...]=see-exactly-these)
  - phase: 113-01
    provides: projects x project_code x personnel_user_ids composite index (dev-deployed in 113-02)
provides:
  - "app/views/project-detail.js's project_code lookup branches on getAssignedProjectCodes(): see-all keeps the single-clause query, scoped roles pair project_code equality with personnel_user_ids array-contains on the SAME query; no-uid fail-closed to the empty state without attaching a listener"
  - "app/views/project-plan.js's identical structural-twin conversion (getDocs, not onSnapshot, so no listener concern)"
  - "app/views/project-detail.js: zero syncPersonnelToAssignments call sites remain (personnel add, personnel remove, code-issuance backfill all removed) — 3 more of the phase's 11 fire-and-forget sync invocations gone"
  - "app/expense-modal.js's showExpenseBreakdownModal accepts an optional projectCode option; when a project-mode caller supplies both budget and projectCode it performs ZERO projects queries, collapsing 3 identical where('project_name','==',identifier) projects lookups down to at most 1 (the finance.js see-all fallback)"
affects: [113-06, 113-07, 113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural-twin conversion kept in lockstep via cross-referencing comments (project-detail.js <-> project-plan.js) so future edits to one prompt a look at the other"
    - "Single-resolution-then-reuse: expense-modal.js resolves resolvedProjectCode once (either from caller-supplied projectCode or one projects lookup) and reuses it across the RFP and collectibles/billing_requests sections instead of re-querying per consumer"

key-files:
  created: []
  modified:
    - app/views/project-detail.js
    - app/views/project-plan.js
    - app/expense-modal.js

key-decisions:
  - "project-plan.js's project lookup uses getDocs (one-time fetch), not onSnapshot — when a scoped actor has no resolvable uid, the code short-circuits to a synthetic { empty: true, docs: [] } result instead of issuing a query, reusing the existing projSnap.empty 'Project not found' render path verbatim rather than duplicating it"
  - "The code-issuance backfill's syncPersonnelToAssignments call was deleted outright (not converted) — replaced with a comment explaining that under the personnel-authoritative model, personnel_user_ids on the project document was always written directly by the personnel handlers (never through the sync helper), so code issuance (which only touches project_code/client_code/client_id) needs no personnel backfill at all"
  - "expense-modal.js resolves budget + project_code ONCE per invocation (resolvedProjectCode local) and reuses it for the RFP lookup and the collectibles/billing_requests lookup, rather than doing three independent fetches — this was already the file's redundancy the plan called out, now collapsed regardless of whether the caller supplies projectCode or the fallback path runs"

patterns-established: []

requirements-completed: [D-02, D-08, D-11, D-12, D-16]

# Metrics
duration: ~6min
completed: 2026-08-11
---

# Phase 113 Plan 05: Project-Detail-Adjacent Read Conversion Summary

**`project-detail.js` and `project-plan.js` now pair their `project_code` equality lookup with a `personnel_user_ids array-contains` clause for scoped roles (served by the 113-02 composite index), `project-detail.js` drops all 3 of its `syncPersonnelToAssignments` call sites, and `expense-modal.js` collapses 3 identical `projects`-by-name lookups down to at most 1 by accepting a preloaded project document from the caller.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-08-11
- **Tasks:** 3/3
- **Files modified:** 3 (`app/views/project-detail.js`, `app/views/project-plan.js`, `app/expense-modal.js`)

## Accomplishments

- `app/views/project-detail.js`: the `project_code` lookup at what was line 220 now branches on `window.getAssignedProjectCodes?.()`. `null` (see-all) keeps the original single-clause `where('project_code', '==', projectCode)` query. Any scoped role (`operations_user`, `services_user`, `services_admin` — the branch decision is delegated entirely to `getAssignedProjectCodes()`, no role literal is hard-coded, satisfying D-16) reads `window.getCurrentUser?.()?.uid`; with no uid it renders the existing "Project not found." empty state directly into `#projectDetailContainer` and returns without ever attaching a listener (fail-closed); with a uid it builds `query(collection(db,'projects'), where('project_code','==',projectCode), where('personnel_user_ids','array-contains',uid))` — the exact shape the `projects` x `project_code` x `personnel_user_ids` composite index (deployed to dev in plan 113-02) serves. The `snapshot.empty` doc-ID `getDoc(doc(db,'projects',projectCode))` fallback a few lines below is byte-identical — a single-document `get()` needs no query-shape change and was left untouched, with a comment explaining why.
- Removed all 3 `syncPersonnelToAssignments` call sites and the now-unused import: `selectDetailPersonnel` (personnel add) lost its `previousUserIds`/`newUserIds` locals and the fire-and-forget sync call; `removeDetailPersonnel` (personnel remove) lost the sync-call-only `previousUserIds`/`newUserIds` locals inside the `try` block (the outer `previousState` stays — it also drives the catch-block rollback); the code-issuance backfill's sync call was deleted and replaced with a comment recording that the personnel-authoritative model never needed a backfill (D-08). What stayed byte-identical at both personnel sites: the single awaited `updateDoc` writing `personnel_user_ids`/`personnel_names`/nulled legacy fields, the `try`/`catch` with `showToast(..., 'error')`, the optimistic local-state rollback in the catch, and every `recordEditHistory(...).catch(...)` call.
- `window.openFullBreakdown` now calls `showExpenseBreakdownModal(currentProject.project_name, { mode: 'project', budget: currentProject.budget, projectCode: currentProject.project_code })`, handing the already-loaded project document to the modal instead of letting it re-fetch.
- `app/views/project-plan.js`'s `init()` project lookup (`project-plan.js:258` originally) received the identical branch: `getAssignedProjectCodes() === null` keeps the single-clause `getDocs(query(...))`; a scoped role with a resolvable uid gets the paired `array-contains` clause on the same query; a scoped role with no uid short-circuits to a synthetic `{ empty: true, docs: [] }` result so the existing `projSnap.empty` "Project not found" render path (into `#planViewSurface`) runs unmodified — no query is even issued. This file has no doc-ID fallback (unlike project-detail.js), and per plan scope none was added. Everything after the lookup — the D-19 clientless block, `currentProject` assignment, `#planTitle` update — is unchanged. A comment names `project-detail.js` as the twin site both files must stay in lockstep with.
- `app/expense-modal.js`'s `showExpenseBreakdownModal` gained an optional `projectCode` option (JSDoc'd alongside `budget`). In project mode, a single resolution step now runs before the `pos`/`transport_requests` fetch: if the caller supplied a non-empty `projectCode`, `budget` and `projectCode` are used directly and no `projects` query is constructed at all; otherwise the existing `where('project_name','==',identifier)` lookup runs exactly once, and its `project_code` result feeds a new `resolvedProjectCode` local that the RFP lookup and the collectibles/billing_requests lookup both reuse (previously each of those two sections re-ran its own independent `projects`-by-name lookup just to re-derive the same `project_code`). The `finance.js` see-all fallback path (`window.showProjectExpenseModal`, which supplies neither `budget` nor `projectCode`) is preserved verbatim with a comment explaining why it must stay.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scope the project-detail project_code lookup and remove its three sync call sites** - `a760e94` (feat)
2. **Task 2: Apply the identical conversion to project-plan.js** - `da1a8fb` (feat)
3. **Task 3: Let expense-modal accept a preloaded project instead of re-querying by name three times** - `f82a001` (feat)

## Files Created/Modified

- `app/views/project-detail.js` - scoped `project_code` lookup branch; 3 `syncPersonnelToAssignments` call sites + import removed; `openFullBreakdown` passes `budget`/`projectCode`
- `app/views/project-plan.js` - scoped `project_code` lookup branch, structural twin of `project-detail.js`; fail-closed no-query short-circuit for a scoped uid-less actor
- `app/expense-modal.js` - `projectCode` option added to `showExpenseBreakdownModal`; project-mode `projects` lookup collapsed from 3 independent fetches to at most 1 resolution step, reused via `resolvedProjectCode`

## Final `showExpenseBreakdownModal` signature

```javascript
export async function showExpenseBreakdownModal(identifier, { mode = 'project', displayName, budget, projectCode } = {})
```

`projectCode` is read only inside the `mode !== 'service'` branch; ignored entirely in service mode.

## Firestore missing-index check

No manual browser exercise of the paired query was performed as part of this plan (all verification was static: `node --check` + `node -e` grep checks + `git diff` review). The composite index this query needs (`projects` x `project_code` ASC x `personnel_user_ids` CONTAINS) was declared and emulator-proven in plan 113-01 and confirmed `Enabled` on `clmc-procurement-dev` per the phase's deploy state — no missing-index console link has been observed against this shape in this or prior plans of the phase. If one surfaces during browser UAT, the console-generated definition is authoritative per the plan's threat model (T-113-23).

## Listener register/teardown symmetry

This plan added zero new Firestore listeners. `project-detail.js`'s single `onSnapshot(q, ...)` call site (the `listener` module variable) is unchanged in count — only the query object fed into it (`q`) gained a conditional branch. `project-plan.js`'s project lookup uses `getDocs` (a one-time fetch), not `onSnapshot`, so no listener is involved at all. `expense-modal.js` has zero `onSnapshot` calls (it is a one-shot modal, not a live view).

- `app/views/project-detail.js`: `onSnapshot(` appears 9 times before and after this plan (confirmed via `git diff HEAD~3 -- app/views/project-detail.js | grep -c "onSnapshot("` on both `+` and `-` lines: 0 added, 0 removed). All 9 are torn down in `destroy()` (the `listener` variable specifically at `destroy()` line 440-441, unchanged). Register = teardown, symmetry preserved.
- `app/views/project-plan.js`: 1 `onSnapshot(` call site (unrelated to this plan's edit — the `project_tasks` subscription later in `init()`), unchanged by this plan.
- `app/expense-modal.js`: 0 `onSnapshot(` call sites, unchanged (module has no listeners to register or tear down).

## Sync call site removal proof

```
$ grep -rn "syncPersonnelToAssignments" app/views/project-detail.js app/views/project-plan.js app/expense-modal.js
(no output — zero matches, all 3 sync call sites in project-detail.js removed; project-plan.js and expense-modal.js never had any)
```

## Decisions Made

See `key-decisions` in frontmatter. Summarized: project-plan.js's no-uid scoped case short-circuits to a synthetic empty snapshot object rather than issuing an `in: []`-style query or duplicating the empty-state render logic; the code-issuance backfill's sync call was deleted outright (not converted to a direct write) because the personnel-authoritative model never needs a backfill — personnel_user_ids was always written directly by the personnel handlers, never through the now-removed sync helper; expense-modal.js resolves `budget`/`project_code` exactly once per invocation regardless of which code path (caller-supplied vs. fallback fetch) populates them, and reuses that single resolution for both downstream sections.

## Deviations from Plan

### Documented, not auto-fixed (verify-script false positive)

**1. [Scope boundary — flawed literal verify check] Plan's Task 3 automated verify counts `pos`/`transport_requests` occurrences it explicitly forbids touching**
- **Found during:** Task 3, running the plan's literal `<verify><automated>` command for `app/expense-modal.js`
- **Issue:** The plan's verify script counts ALL occurrences of the literal substring `where('project_name', '==', identifier)` anywhere in the file and asserts `n <= 1`. That substring is also used, unchanged, by the `pos` and `transport_requests` queries a few lines below the `projects` lookup — queries the plan's own `<action>` explicitly says "Do not change." Baseline (pre-task) file had 5 total occurrences of this substring (3 on `projects`, 1 on `pos`, 1 on `transport_requests`); after collapsing the 3 `projects`-collection lookups down to 1 (the correct, intended change — confirmed via a collection-scoped check: `collection(db, 'projects'), where('project_name', '==', identifier)` now matches exactly once, down from 3), the file-wide literal count is 3 (1 projects + 1 pos + 1 transport_requests) — still `>1`, so the plan's literal verify command throws `expected at most 1 projects-by-name lookup, found 3` even though the actual acceptance-criteria intent ("down from three", referring to the 3 `projects` lookups named in the plan's `<objective>`) is fully satisfied.
- **Why not fixed:** Fixing the pos/transport_requests query text (e.g. reformatting to dodge the regex) would be an edit to collections the plan explicitly forbids touching, purely to satisfy an overly-broad grep pattern — that is worse than leaving the false positive documented. Per this executor's authority to recognize genuine problems vs. inventing unrequested defensive code, the literal check is treated as a landmine in the plan's verify script, not a real defect (same class of issue documented in Phase 103.1's SUMMARY: "several of the plan's literal verify gates had false-positives... all code confirmed correct via corrected checks; no behavioral impact").
- **Action taken:** Verified the true acceptance-criteria intent with a collection-scoped grep (`collection(db, 'projects'), where('project_name', '==', identifier)` count: 1, down from 3) and confirmed via `git diff app/expense-modal.js` that zero lines inside any `mode === 'service'` block changed and the `pos`/`transport_requests`/`rfps`/`collectibles`/`billing_requests` query shapes are byte-identical (only the local variable feeding `rfps`/`collectibles`/`billing_requests` was renamed from three separately-fetched locals to one shared `resolvedProjectCode`).
- **Verification impact:** `node --check app/expense-modal.js` passes; `projectCode` option is present; service-mode branch and all non-`projects` queries are unchanged. The literal plan verify command's numeric assertion does not pass as written, but the acceptance criteria's actual intent is met.

---

**Total deviations:** 1 documented-not-fixed (verify-script false positive), 0 auto-fixed.
**Impact on plan:** No code changes were affected or withheld. The false-positive verify check does not indicate any correctness problem in the shipped code.

## Issues Encountered

None beyond the documented verify-script false positive above.

## User Setup Required

None - no external service configuration required. No Firestore rules/indexes touched by this plan (the composite index this plan's queries depend on was declared in 113-01 and dev-deployed in 113-02). No deploy was executed.

## Next Phase Readiness

- Every equality-lookup read on the project-detail side (`project-detail.js`, `project-plan.js`) is now either personnel-paired, a direct doc `get()`, or eliminated — matching the phase's Shape C conversion goal for the project side.
- 3 more of the phase's 11 fire-and-forget `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` call sites removed (all 3 from `project-detail.js`). Combined with plan 113-04's 4, that's 7 of 11 gone; remaining sites are out of this plan's scope for a future wave.
- `expense-modal.js`'s scoped-role Full Breakdown path (reached via `project-detail.js`'s `openFullBreakdown`) now issues zero `projects` queries; the see-all `finance.js` path keeps exactly one, down from three redundant fetches per modal open.
- No stubs introduced. No new threat surface beyond what `113-05-PLAN.md`'s `<threat_model>` already covers (T-113-21 through T-113-25 mitigations verified in place above: array-contains clause added, caller-supplied budget treated as display-only per T-113-22 `accept` disposition, composite index confirmed deployed, backfill-removal reasoning recorded in-code, branch decision delegated to `getAssignedProjectCodes()` with no role literal).
- Ready for the next wave's remaining Shape A/B/D/E conversions cataloged in `113-PATTERNS.md`.

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*

## Self-Check: PASSED

All claimed files verified present (`app/views/project-detail.js`, `app/views/project-plan.js`, `app/expense-modal.js`, this SUMMARY). All 3 task commit hashes (`a760e94`, `da1a8fb`, `f82a001`) verified present in `git log --oneline --all`.
