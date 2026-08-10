---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
subsystem: database
plan: 07
tags: [firestore, personnel_user_ids, assignment-scoping, array-contains, proposal-modal, client-detail, engagement-create]

# Dependency graph
requires:
  - phase: 113-03
    provides: window._personnelAssignedCodes personnel-derived cache; getAssignedProjectCodes()/getAssignedServiceCodes() repointed onto it (null=see-all, []=see-nothing, [...]=see-exactly-these)
  - phase: 113-01
    provides: projects x client_code x personnel_user_ids and services x client_code x personnel_user_ids composite indexes (dev-deployed in 113-02)
provides:
  - "app/proposal-modal.js _loadModalDropdownData(skipProjects): Start-Proposal preselected path issues ZERO projects reads (list fetch skipped, single-project doc get() only when no lockedProjectCode is supplied); unpreselected path branches on getAssignedProjectCodes() with a bare personnel_user_ids array-contains query for scoped roles"
  - "app/views/clients.js showClientDetail(): both client_code lookups (projects, services) independently branch on their own getAssigned*Codes() helper, pairing client_code equality with personnel_user_ids array-contains for scoped actors, served by the 113-02 composite indexes"
  - "app/engagement-create.js: zero syncPersonnelToAssignments/syncServicePersonnelToAssignments call sites remain anywhere outside app/utils.js — the last 2 of the phase's 11 fire-and-forget sync invocations removed; onAfterCreate option removed entirely from createEngagement's contract (zero remaining consumers)"
affects: [113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skip-then-scope: a caller that already knows it will discard a list (dropdown locked to one project) skips the collection fetch entirely rather than scoping it — cheaper than any query, matches T-113-31's SECOND-choice-fix framing (scoping was explicitly the fallback, not the preferred fix)"
    - "Single-doc get() as a correctness bridge: when a list fetch is skipped but downstream code still needs one specific document's fields (not just its id), resolve that one document via getDoc() instead of re-adding the list query — cheaper than a list, and the projects collection's existing broad allow-read rule covers it with no personnel scoping needed"
    - "Independent per-dimension branching: a client-detail-style modal that surfaces two related but independently-scoped collections (projects, services) decides each dimension's query shape via its own getAssigned*Codes() helper call, never a single shared branch"

key-files:
  created: []
  modified:
    - app/proposal-modal.js
    - app/views/clients.js
    - app/engagement-create.js

key-decisions:
  - "proposal-modal.js: when preselectedProjectId is truthy AND lockedProjectCode is NOT supplied (project-detail.js's Start Proposal button, the exact path T-113-31 is about), a naive unconditional skip of the projects fetch would silently break saveProposal()'s project_code resolution — _modalProjectsData.find(p => p.id === projectId) would return undefined with no lockedProjectCode fallback, writing project_code: null onto every proposal created from that button. Auto-fixed (Rule 1 — broken behavior the plan's own literal instruction would have introduced) by resolving the single preselected project via getDoc(doc(db,'projects', preselectedProjectId)) and splicing it into _modalProjectsData plus a synthetic <option>, instead of the bare skip the plan's action text describes"
  - "createEngagement's onAfterCreate option removed entirely (not kept as a no-op parameter) — verified via grep across app/ that its only remaining consumer (this file's own Proposals-tab call, lines ~385-407) was the one being edited in this same task; projects.js/services.js already dropped it in 113-04, per that plan's SUMMARY"
  - "clients.js: the plan's own <interfaces> section suggested filtering an already-loaded assignment-scoped project set in-memory (Shape C-variant) as a cheaper alternative to a fresh query, but Task 2's own <action>/<verify> require exactly 2 fresh array-contains queries paired with client_code — followed the task's literal instruction (a Promise.all of two independently-scoped queries) since it is unambiguous and directly verified, over the looser interfaces-section suggestion"

patterns-established: []

requirements-completed: [D-02, D-08, D-11, D-12, D-13, D-16]

# Metrics
duration: ~15min
completed: 2026-08-11
---

# Phase 113 Plan 07: Proposal Modal + Client Detail Read Conversion + Last Sync-Tail Removal Summary

**`proposal-modal.js`'s worst-shaped query in the whole phase audit (`getDocs(collection(db,'projects'))` with zero predicates) now issues zero projects reads on the scoped Start-Proposal path and a personnel-scoped query everywhere else; `clients.js`'s client-detail modal pairs both its `projects` and `services` `client_code` lookups with an independently-decided `personnel_user_ids array-contains` clause; and `engagement-create.js` loses its last 2 fire-and-forget assignment-sync call sites, closing out all 11 identified in the phase's RESEARCH.md.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-11
- **Tasks:** 3/3
- **Files modified:** 3 (`app/proposal-modal.js`, `app/views/clients.js`, `app/engagement-create.js`)

## Accomplishments

- `app/proposal-modal.js` `_loadModalDropdownData(skipProjects = false)`: gained a `skipProjects` parameter. On the preselected-project path (`openCreateProposalModal`, called with `!!preselectedProjectId`), the projects fetch is skipped entirely — only `clients` is loaded — and `_modalProjectsLoaded` is deliberately left `false` so a later, unpreselected open still performs a real fetch. On the non-skip path, the query now branches on `window.getAssignedProjectCodes?.()`: `null` (see-all role/flag) keeps the original unscoped `getDocs(collection(db,'projects'))`; otherwise a bare `where('personnel_user_ids','array-contains',uid)` query runs (no second `where` clause, no new composite index needed); a scoped actor with no resolvable uid fails closed to an empty projects array rather than falling through to the unscoped fetch. The `project_status === 'Draft'` / `active === false` filters and the sort are unchanged.
- `app/proposal-modal.js` `openCreateProposalModal`: **Rule 1 auto-fix.** The plan's literal instruction ("the list is never used") is true only for the `lockedProjectCode` branch (service-detail.js's caller, which inserts a synthetic `<option>`). `project-detail.js`'s Start Proposal button — the exact scoped-role path named in this plan's `<objective>` — calls `openCreateProposalModal(parentDocId, callback)` with `lockedProjectCode` unset, and relies on `_modalProjectsData` actually containing the preselected project both for the dropdown display AND for `saveProposal()`'s `_modalProjectsData.find(p => p.id === projectId)` project_code resolution. A bare skip would silently write `project_code: null` onto every proposal created from that button. Fixed by resolving the single preselected project via `getDoc(doc(db,'projects', preselectedProjectId))` (a single-document get — not a list query, and the `projects` collection's existing broad `allow read: if isActiveUser();` rule already covers it with no personnel scoping needed) and splicing the result into `_modalProjectsData` plus a synthetic `<option>` carrying the real `data-code`/`data-name` attributes, mirroring the existing option-rendering shape.
- `app/views/clients.js` `showClientDetail()`: the two `client_code` lookups now branch **independently** — `getAssignedProjectCodes()` decides the projects query, `getAssignedServiceCodes()` decides the services query — because a single actor can be scoped on one dimension and see-all on the other (`services_admin` is scoped for projects, see-all for services; `operations_admin` is the mirror). Scoped branches pair `where('client_code','==',...)` with `where('personnel_user_ids','array-contains',uid)` on the SAME query, served by the `projects` and `services` `client_code`+`personnel_user_ids` composite indexes deployed to dev in 113-02. No resolvable uid on a scoped dimension resolves to `Promise.resolve(null)` (fail-closed, no query issued) rather than falling through to the unscoped form. The `Promise.all` shape, `showLoading` pairing, and every downstream render (`linkedProjects`/`linkedServices` consumption, table rows, empty states) are byte-identical.
- `app/engagement-create.js`: deleted the `onAfterCreate` callback body at the Proposals-tab `createEngagement` call (`syncPersonnelToAssignments`/`syncServicePersonnelToAssignments`) and its sync-only `userIds` local. Confirmed via `grep -rn "onAfterCreate" app/` that this file's own call site (line ~396) was the ONLY remaining consumer — `projects.js`/`services.js` already dropped the option in plan 113-04 (per that plan's SUMMARY: "removed as a property entirely, not kept as an empty function"). Since `onAfterCreate` now has zero consumers, removed it from `createEngagement`'s contract entirely: the destructured parameter, the `if (typeof onAfterCreate === 'function') { await onAfterCreate(...) }` invocation block, and the header-comment paragraph documenting the old mechanism (replaced with a paragraph recording that `personnel_user_ids` on the container document IS the assignment, written by `createEngagement`'s own awaited `addDoc`, per D-08). Removed `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` from the `./utils.js` named import list. `generateProjectCode`/`generateServiceCode` invocations and the personnel array written onto the new container document are unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop proposal-modal.js fetching the whole projects collection** - `d3a683b` (feat)
2. **Task 2: Pair both clients.js client_code lookups with the personnel predicate** - `3f01cd3` (feat)
3. **Task 3: Remove the last two sync call sites from the shared creation path** - `40ca29c` (fix)

## Files Created/Modified

- `app/proposal-modal.js` - `_loadModalDropdownData(skipProjects)` scoped-branch + skip-branch; `openCreateProposalModal` passes `!!preselectedProjectId`; single-doc `getDoc` resolution + synthetic option for the no-`lockedProjectCode` preselected path
- `app/views/clients.js` - `showClientDetail()` both `client_code` lookups independently scoped and paired with `personnel_user_ids array-contains`
- `app/engagement-create.js` - `onAfterCreate` option removed from `createEngagement`'s contract; Proposals-tab call site's sync callback deleted; `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` import removed; header comment rewritten

## Final `_loadModalDropdownData` signature

```javascript
async function _loadModalDropdownData(skipProjects = false)
```

Called as `_loadModalDropdownData(!!preselectedProjectId)` from `openCreateProposalModal`; called with no argument (defaults to `false`) from `openEditProposalModal`.

## Listener / window-fn register-teardown counts

This plan added **zero new Firestore listeners** (`onSnapshot` count unchanged: `app/proposal-modal.js` has 0, `app/views/clients.js` has 1, `app/engagement-create.js` has 2 — all pre-existing, none touched by this plan's diff) and **zero new `window.*` registrations**. Confirmed via `git diff -- app/proposal-modal.js app/views/clients.js app/engagement-create.js | grep -n "^+.*window\."`: every added `window.` reference is a call to a pre-existing helper already registered by earlier phases (`window.getAssignedProjectCodes`, `window.getAssignedServiceCodes`, `window.getCurrentUser` — all registered by plan 113-03 and prior phases). No `window.X = ...` assignment lines were added or removed.

## Zero sync call sites outside app/utils.js — proof

```
$ grep -rn "syncPersonnelToAssignments(\|syncServicePersonnelToAssignments(" app/ --include=*.js | grep -v "app/utils.js"
(no output — exit code 1, zero matches)

$ grep -rn "syncPersonnelToAssignments\|syncServicePersonnelToAssignments" app/ --include=*.js
app/utils.js:788:window.syncServicePersonnelToAssignments = syncServicePersonnelToAssignments;
app/utils.js:854:export async function syncPersonnelToAssignments(projectCode, previousUserIds, newUserIds) {
app/utils.js:928:export async function syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds) {
```

Only the two definitions (plus one `window.*` registration) in `app/utils.js` remain, exactly as plan 113-09 expects to find and delete. Every fire-and-forget sync invocation catalogued in RESEARCH.md and removed across plans 113-04, 113-05, and this plan is now gone from the codebase — this plan's grep is a whole-codebase scan (`app/**/*.js`, not just this plan's 3 files), so it independently confirms the phase-wide zero-call-site state regardless of the exact per-plan running totals recorded in prior SUMMARYs.

## `node --check` — all 3 files

```
$ node --check app/proposal-modal.js && node --check app/views/clients.js && node --check app/engagement-create.js
(exit 0, no output)
```

## Decisions Made

See `key-decisions` in frontmatter. Summarized: the Rule 1 auto-fix in Task 1 (single-doc `getDoc` resolution for the no-`lockedProjectCode` preselected path) was necessary because the plan's literal "skip unconditionally" instruction, if followed verbatim, would have broken `saveProposal()`'s `project_code` resolution for exactly the scoped-role Start Proposal flow the task set out to fix — this was verified by reading `project-detail.js`'s actual call site (2 call sites total via grep: `project-detail.js` with no `lockedProjectCode`, `service-detail.js` with one) before implementing, not assumed from the plan's `<interfaces>` prose; `onAfterCreate` was removed as a contract option entirely (not left as a dead parameter) since grepping `app/` confirmed zero remaining consumers after this task; `clients.js` followed Task 2's literal two-independent-fresh-queries instruction over the `<interfaces>` section's looser in-memory-filter suggestion since the task's own `<verify>`/`<acceptance_criteria>` are unambiguous and were run as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] proposal-modal.js: preserved `saveProposal()`'s `project_code` resolution on the no-`lockedProjectCode` preselected path**

- **Found during:** Task 1, while reading `project-detail.js:2520`'s actual `openCreateProposalModal(parentDocId, callback)` call site per the task's own `read_first` instruction to check `project-detail.js` around line 2486-2510
- **Issue:** The plan's Task 1 action ("Skip the fetch on the preselected path... the dropdown is locked to one project three lines later, so the list is never used") is only true when `lockedProjectCode` is supplied (a synthetic `<option>` is inserted). `project-detail.js`'s Start Proposal button — the exact reachable-by-`operations_user`/`services_user`/`services_admin` path the plan's `<objective>` names as the reason for this task — calls `openCreateProposalModal` WITHOUT `lockedProjectCode`. Its post-open code (`projectSelectEl.value = preselectedProjectId`) and `saveProposal()`'s `_modalProjectsData.find(p => p.id === projectId)` both depend on `_modalProjectsData` actually containing that project. A bare unconditional skip (as literally instructed) would leave `_modalProjectsData` empty on that path, so `saveProposal()` would resolve `projectCode = project?.project_code || _createModalLockedProjectCode || null` → `null` (since `_createModalLockedProjectCode` is also unset on this path) — silently writing every proposal created via this button with `project_code: null`.
- **Fix:** In `openCreateProposalModal`, when `preselectedProjectId` is truthy, `lockedProjectCode` is falsy, and `parentCollection === 'projects'`, resolve the single preselected project via `getDoc(doc(db,'projects', preselectedProjectId))` — a single-document read, not a list query, already covered by the `projects` collection's existing broad `allow read: if isActiveUser();` rule with no personnel scoping required — and splice the result into `_modalProjectsData` plus insert a synthetic `<option>` carrying real `data-code`/`data-name` attributes matching the standard option shape.
- **Files modified:** `app/proposal-modal.js`
- **Verification:** `node --check app/proposal-modal.js` passes; the plan's own automated verify (bare-unscoped-fetch-must-be-guarded check) still passes; manually traced `saveProposal()`'s `_modalProjectsData.find(...)` call against the new code path to confirm `project` now resolves correctly.
- **Committed in:** `d3a683b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug the plan's own literal instruction would have introduced).
**Impact on plan:** Necessary for correctness of the exact Start-Proposal flow this task set out to secure. T-113-31's mitigation intent (eliminate the unscoped list read) is still fully achieved — the fix uses a single-doc `get()`, not a list query, so zero `projects` collection reads occur on the scoped path either way. No scope creep: the fix stays entirely inside `app/proposal-modal.js`, the file this task was authorized to modify.

## Issues Encountered

None beyond the documented Rule 1 auto-fix above.

## User Setup Required

None - no external service configuration required. This plan is pure client-side JS; no Firestore rules/indexes were touched (the composite indexes these queries depend on were declared in 113-01 and dev-deployed in 113-02). No deploy was executed.

## Next Phase Readiness

- Every MUST-CONVERT read site catalogued in RESEARCH.md's audit is now converted (113-04 through 113-07 combined close all of Shape A/B/C/D/E), and all 11 fire-and-forget `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` invocations are gone from the codebase outside their two `app/utils.js` definitions — plan 113-09's D-03 completeness check can now run against a fully-converted surface.
- `app/utils.js`'s `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` definitions (plus the one `window.syncServicePersonnelToAssignments` registration) remain, exactly as scoped: their deletion belongs to plan 113-09, not this plan.
- No stubs introduced. No new threat surface beyond what `113-07-PLAN.md`'s `<threat_model>` already covers (T-113-31 through T-113-35 all verified in place above: T-113-31's unscoped fetch eliminated on the scoped path and personnel-scoped elsewhere; T-113-32's narrowed client-detail posture recorded in-code; T-113-33's independent per-dimension branching implemented in `clients.js`; T-113-34's `_modalProjectsLoaded` guard coherence verified — skip path never sets it true; T-113-35's `onAfterCreate` removal was confirmed via grep before deleting, not guessed).
- Ready for plan 113-08 and onward (rules tightening / transitional-term removal), which can now assume the client-side read surface and the write-time sync mechanism are both fully converted.

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*

## Self-Check: PASSED

All claimed files verified present (`app/proposal-modal.js`, `app/views/clients.js`, `app/engagement-create.js`, this SUMMARY). All 3 task commit hashes (`d3a683b`, `3f01cd3`, `40ca29c`) verified present in `git log --oneline --all`. `node --check` passed on all 3 JS files. Plan-level `<verification>` checks (zero sync CALL sites outside `app/utils.js`, 2 `array-contains` clauses in `clients.js` each paired with `client_code` on the same query, no bare `getDocs(collection(db,'projects'))` outside a see-all guard in `proposal-modal.js`) all passed as shown above.
