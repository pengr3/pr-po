---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 01
subsystem: database
tags: [firestore-rules, firestore-indexes, personnel_user_ids, security-rules, emulator-tests]

# Dependency graph
requires: []
provides:
  - "3 composite indexes in firestore.indexes.json pairing an equality field with personnel_user_ids array-contains (projects x project_code, projects x client_code, services x client_code)"
  - "Additive personnel_user_ids OR-alternatives on services allow list/update, project_tasks create/update-Tier1/delete, service_tasks create/update-Tier1/delete — every isAssignedTo*-gated write/list branch now also accepts a personnel-derived predicate"
  - "Emulator regression suite proving the widened branches accept both the legacy and the new predicate, honour the all_services escape hatch, and grant nothing to a non-member role"
  - "113-DEPLOY-1.md operator runbook for the Wave-2 deploy gate"
affects: [113-02, 113-03, 113-04, 113-05, 113-06, 113-07, 113-08, 113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive rule widening: OR-in a new predicate alongside the legacy one, legacy term first for short-circuit, so no currently-permitted request shape is denied"
    - "Guarded parent-document get() from a child task doc: check ('<id-field>' in data) && data.<id-field> != '' && exists(parent) && uid in get(parent).data.personnel_user_ids, sourced from resource.data on update/delete (not attacker-supplied request.resource.data) and from request.resource.data only on create"

key-files:
  created:
    - .planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/113-DEPLOY-1.md
    - .planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/deferred-items.md
  modified:
    - firestore.indexes.json
    - firestore.rules
    - test/firestore.test.js

key-decisions:
  - "Personnel-derived predicate OR-ed into every isAssignedTo*-gated services/project_tasks/service_tasks branch, legacy term listed first so extra document reads only happen when it misses (D-07/D-08)"
  - "all_services == true hoisted to a top-level OR term on the services allow list rule so the escape hatch is honoured uniformly (D-09)"
  - "No new firestore.rules helper function added — the parent-document personnel check is inlined at every OR-in site (9 places) rather than factored into a new function, per the plan's explicit constraint"
  - "2 pre-existing, unrelated test/firestore.test.js failures (confirmed present in the pre-task baseline, unchanged after) logged to deferred-items.md rather than fixed — outside this plan's additive-only, services/project_tasks/service_tasks-only scope"

patterns-established:
  - "Transitional dual-predicate rule shape: every OR-widened branch carries an inline comment naming Phase 113 and stating the personnel term is the forward path while the isAssignedTo* term is transitional and scheduled for removal in plan 113-10"

requirements-completed: [D-02, D-07, D-08, D-09, D-13]

# Metrics
duration: ~35min
completed: 2026-08-10
---

# Phase 113 Plan 01: Additive Indexes + Widened Assignment Rule Branches Summary

**Added 3 composite Firestore indexes and OR-widened every array-reading services/project_tasks/service_tasks rule branch to also accept a personnel_user_ids predicate, proven by 7 new emulator tests with zero regressions on any branch this plan touched.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-10T12:58:00Z (approx.)
- **Completed:** 2026-08-10T13:04:48Z
- **Tasks:** 3/3
- **Files modified:** 3 (firestore.indexes.json, firestore.rules, test/firestore.test.js); 2 new docs (113-DEPLOY-1.md, deferred-items.md)

## Accomplishments

- `firestore.indexes.json` grew from 18 to 21 entries: 3 new composite indexes pairing an equality field with `personnel_user_ids` `arrayConfig: CONTAINS`, ready for the Wave-4 client query conversions.
- `firestore.rules`: every `isAssignedTo*`-gated branch in `services` (`allow list`, `allow update`), `project_tasks` (`allow create`, `allow update` Tier 1, `allow delete`), and `service_tasks` (same three) now additionally accepts `request.auth.uid in <container>.personnel_user_ids` as an OR alternative — 9 branches widened in total, all with the legacy term listed first for short-circuiting.
- `services` `allow list`'s `all_services == true` escape hatch hoisted to a top-level OR term (D-09), so it applies uniformly rather than only inside `isAssignedToService()`.
- New emulator suite `"Phase 113 — additive personnel predicate (transitional)"` (7 tests, all passing): proves the new predicate, proves the legacy predicate still works (additivity), proves the `all_services` escape hatch, proves the widened `services` update branch and both task-collection Tier-1 update branches grant authority via personnel alone (no legacy array entry), and proves a non-member role (`procurement`) gains nothing.
- `113-DEPLOY-1.md` operator runbook created for the Wave-2 human-verify deploy gate (indexes-then-rules order, `Enabled` index-state check, `firebase use` confirmation, MCP `firebase_deploy` no-op caveat, verbatim index definitions, standing-rules-debt diff reminder). No deploy was executed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare the 3 composite indexes and widen every array-reading rule branch** - `1b6acab` (feat)
2. **Task 2: Emulator coverage proving the widened branches accept BOTH predicates** - `46c3ba6` (test)
3. **Task 3: Record the deploy manifest for the Wave-2 gate** - `6548f8c` (docs)

_No plan-metadata commit yet — STATE.md/ROADMAP.md/REQUIREMENTS.md updates land in a separate final commit after this SUMMARY is written._

## Files Created/Modified

- `firestore.indexes.json` - 3 new composite indexes: `projects` × (`project_code`, `personnel_user_ids` CONTAINS), `projects` × (`client_code`, `personnel_user_ids` CONTAINS), `services` × (`client_code`, `personnel_user_ids` CONTAINS)
- `firestore.rules` - additive `personnel_user_ids` OR-alternatives on `services` list/update and `project_tasks`/`service_tasks` create/update-Tier1/delete; `all_services` hoisted on `services` list; Phase 113 scope comments added above each widened block
- `test/firestore.test.js` - new `describe("Phase 113 — additive personnel predicate (transitional)")` suite, 7 `it` cases, appended at end of file; no pre-existing `describe` block touched
- `.planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/113-DEPLOY-1.md` - Wave-2 deploy runbook (new)
- `.planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/deferred-items.md` - logs the 2 pre-existing, out-of-scope test failures (new)

## Exact 3 Index Definitions (verbatim from `firestore.indexes.json`)

```json
{
  "collectionGroup": "projects",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "project_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```
```json
{
  "collectionGroup": "projects",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "client_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```
```json
{
  "collectionGroup": "services",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "client_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```

## Rule Branches Widened (with new line numbers, post-Task-1 `firestore.rules`)

| Block | Branch | New line range | What was OR-ed in |
|---|---|---|---|
| `services` | `allow list` | 605-616 (see specifically 610, 612) | Top-level `getUserData().all_services == true`; `services_user` branch gains `\|\| request.auth.uid in resource.data.personnel_user_ids` |
| `services` | `allow update` | 621-633 (see 625, 627, 629) | `services_user`, `operations_user`, `operations_admin` branches each gain `\|\| request.auth.uid in resource.data.personnel_user_ids` |
| `project_tasks` | `allow create` | 783-802 | `operations_user`, `services_user`, `services_admin` branches each gain a guarded `get()` on the parent project via `request.resource.data.project_id` |
| `project_tasks` | `allow update` (Tier 1) | 810-833 | Same 3 role branches, guarded `get()` via `resource.data.project_id` |
| `project_tasks` | `allow delete` | 856-875 | Same 3 role branches, guarded `get()` via `resource.data.project_id` |
| `service_tasks` | `allow create` | 907-926 | `services_user`, `operations_user`, `operations_admin` branches each gain a guarded `get()` on the parent service via `request.resource.data.service_id` |
| `service_tasks` | `allow update` (Tier 1) | 934-957 | Same 3 role branches, guarded `get()` via `resource.data.service_id` |
| `service_tasks` | `allow delete` | 984-1003 | Same 3 role branches, guarded `get()` via `resource.data.service_id` |

Untouched, byte-identical to pre-task state (confirmed via `git diff` hunk boundaries, all confined to line 579+): the `projects` block's `allow read: if isActiveUser();` and the `users` `allow update` carve-out (`hasOnly(['assigned_project_codes','all_projects'])` / `hasOnly(['assigned_service_codes','all_services'])`).

## Emulator Verification — pre/post mocha counts

Java **is** available on this machine (contrary to prior phases' recorded environment note) — the emulator suite ran successfully both times.

| Run | Passing | Failing | Notes |
|---|---|---|---|
| **Pre-task baseline** (before any Task 1/2/3 edits, at commit `8591740`) | 54 | 2 | Both failures pre-existing (see below) |
| **Post-task** (after Task 1 + Task 2) | 61 | 2 | Same 2 failures, unchanged; +7 new passing, 0 new failures |

Net result: exactly the 7 new Phase 113 tests added, and every one of them passes. The overall command exit code is 2 (mocha reports the suite as failing) solely because of 2 pre-existing failures unrelated to this plan's scope — see "Deviations from Plan" below.

## Decisions Made

- Followed the plan's explicit "Do NOT add or remove any helper function" constraint literally: the guarded parent-document personnel check is inlined at all 9 OR-in sites in `project_tasks`/`service_tasks` rather than factored into a new rules function, even though this produces repetition. Verbosity was accepted over introducing a new helper the plan didn't authorize.
- `all_services == true` hoisted to the `services` `allow list` top-level OR (per plan instruction) even though `isAssignedToService()` already checks it internally — the hoist matters because the new `services_user` OR-branch's second disjunct (`request.auth.uid in resource.data.personnel_user_ids`) doesn't consult `all_services` at all, so without the hoist an `all_services` services_user relying purely on the escape hatch (no legacy array entry, not personally listed) would lose nothing new here (their `isAssignedToService()` call still catches it), but the hoist makes the intent explicit and uniform across every role that reaches this branch, matching the plan's literal instruction.

## Deviations from Plan

### Documented, not auto-fixed (SCOPE BOUNDARY — pre-existing, unrelated failures)

**1. [Scope boundary] 2 pre-existing `test/firestore.test.js` failures carry through unchanged**
- **Found during:** Task 2, pre-task baseline run (before any Phase 113 edits)
- **Issue:** `users collection > operations_admin CANNOT read super_admin/finance/procurement docs` and `services collection - role access > operations_admin CANNOT read services collection (department silo)` both fail — in both cases the assertion expects a deny but the current rules (by design, per existing code comments: Phase 84 D-12 for the first, `generateProjectCode()` CODE-01 support for the second) now allow the request. Confirmed identical failure, identical error text, in the baseline run captured before Task 1 touched anything.
- **Why not fixed:** Neither failing assertion touches `services` list/update, `project_tasks`, or `service_tasks` — the only surfaces Plan 01's task list authorizes editing. Per the executor's SCOPE BOUNDARY rule, pre-existing failures unrelated to the current task are out of scope; fixing the `users` `allow get` rule, the `services` `allow get` rule, or rewriting the two stale test assertions would all exceed this plan's authorized diff.
- **Action taken:** Logged to `.planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/deferred-items.md` with full root-cause citations and a recommendation for a future `/gsd:quick` cleanup pass.
- **Verification impact:** Task 2's literal acceptance bars "the emulator command exits 0" and "zero failing tests" are not met for the whole-suite exit code, solely because of these 2 unrelated failures. The substantive intent of Task 2's acceptance criteria — at least 7 net-new passing tests, zero NEW failures, the new suite exercises both predicates, contains an `assertFails` case, and no pre-existing `describe` block was edited — is fully met (see table above and `git diff test/firestore.test.js` showing a single end-of-file addition hunk).

---

**Total deviations:** 1 logged-not-fixed (scope boundary), 0 auto-fixed.
**Impact on plan:** No code changes were affected. The 2 pre-existing failures existed before this plan touched the repository and are unrelated to every file/branch this plan is authorized to change.

## Issues Encountered

- The environment notes anticipated Java/the Firestore emulator might be unavailable on this machine (per prior-phase records). It was available this session (`openjdk 25.0.2`), so the emulator command ran to completion both times — no blocked-verification fallback was needed.

## User Setup Required

None - no external service configuration required. `113-DEPLOY-1.md` documents the Wave-2 deploy steps but no deploy was executed as part of this plan.

## Next Phase Readiness

- The 3 composite indexes and the widened rule branches are committed and emulator-proven, ready for the Wave-2 `firebase deploy --only firestore:indexes` / `firebase deploy --only firestore:rules` human gate per `113-DEPLOY-1.md`.
- Nothing in this plan narrows any existing permission or query shape, so it carries zero risk of breaking a live flow if deployed as-is.
- Plan 113-10 (scheduled to remove the transitional `isAssignedTo*` terms) can proceed once the Wave-4 client conversions have shipped and been verified in production against the widened-but-still-legacy-accepting rules landed here.
- Carry-forward: the 2 pre-existing test failures logged in `deferred-items.md` remain open; recommend folding their cleanup into whichever future pass revisits `test/firestore.test.js` stale assertions.

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-10*

## Self-Check: PASSED

All claimed files verified present (`firestore.indexes.json`, `firestore.rules`, `test/firestore.test.js`, `113-DEPLOY-1.md`, `deferred-items.md`, this SUMMARY). All 3 task commit hashes (`1b6acab`, `46c3ba6`, `6548f8c`) verified present in `git log --all`.
