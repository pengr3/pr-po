---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 08
subsystem: auth
tags: [firestore, personnel_user_ids, assignment-scoping, arrayUnion, arrayRemove, admin-ui]

# Dependency graph
requires:
  - phase: 113-03
    provides: window._personnelAssignedCodes personnel-derived cache; getAssignedProjectCodes()/getAssignedServiceCodes() repointed onto it (this plan's writes are what those reads now observe)
provides:
  - "app/views/assignments.js saveManageModal(): writes personnel_user_ids/personnel_names DIRECTLY onto projects/services documents via awaited arrayUnion/arrayRemove — the container document is now the sole record of an assignment, replacing the user-document assigned_project_codes/assigned_service_codes write + fire-and-forget reverse sync"
  - "app/views/assignments.js: syncAssignmentToPersonnel() deleted in full; modal selection state renamed code-keyed pendingModalCodes -> document-id-keyed pendingModalIds across every touch point (state, window mirror, checkbox data-id, inline onchange handler strings)"
  - "app/views/assignments.js: getAssignmentCount() and the cross-department row filter (both projects and services tabs) now derive from live personnel_user_ids membership via a shared getPersonnelMemberships() helper, closing the row-filter gap RESEARCH.md flagged as omitted from CONTEXT.md's D-10 list"
  - "app/views/user-management.js: assignedProjectsDisplay derives its count from projectsData personnel_user_ids membership instead of the frozen assigned_project_codes array"
  - "260706-mco's saveManageModal lock explicitly superseded in code (D-06), with the reason recorded inline"
affects: [113-09, 113-10, 113-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared membership helper (getPersonnelMemberships) as single source of truth for count display, row-visibility filter, and modal old/new-id diffing — prevents the count and the filter from ever disagreeing"
    - "Container-write-then-flag-clear as two independently-erroring write phases: the personnel arrayUnion/arrayRemove writes are one error-collecting loop with one toast, and the legacy all_* flag clear is its own try/catch with its own toast, so a cross-department flag-clear denial never gets misreported as an assignment-save failure"

key-files:
  created: []
  modified:
    - app/views/assignments.js
    - app/views/user-management.js

key-decisions:
  - "Modal checkbox key switched from container CODE to container DOCUMENT ID (data-code -> data-id, pendingModalCodes -> pendingModalIds) because the write target is a document ID and a codeless container has no code to key on — this also means a codeless project/service is now manageable in the grid (previously it could be checked but its identity was ambiguous under the code-based key)"
  - "saveManageModal's old-id set for diffing is recomputed from live personnel_user_ids membership over the currently-loaded projectsData/servicesData at Save time, NOT captured from the array the modal opened with and NOT read from the user document's legacy arrays — this means a concurrent admin's edit to the same user's assignments (rare, but possible with two admins in different departments) is respected rather than clobbered, on top of the arrayUnion/arrayRemove atomicity that already protects against clobbering different users' entries on the same container"
  - "The all_projects/all_services flag clear (D-09) is intentionally NOT folded into the container-write error-collection loop — it is its own awaited write, own try/catch, own toast, because it can be legitimately denied once the users-collection cross-department carve-out is dropped in plan 113-10 (D-17), and conflating that denial with a generic 'assignments failed' message would mislead the admin about what actually went wrong"
  - "When both addedIds and removedIds come out empty (no net change from what personnel membership already shows), the function returns immediately after the success toast without attempting the all_* flag clear either — followed literally per the plan's explicit action text ('If both are empty, toast the existing success message and return without any write'); in practice this only happens on a genuine no-op save since a user still holding all_projects===true will almost always have oldIds (real personnel membership) differ from the modal's migrate-on-edit pre-checked newIds (every current project), so the flag-clear path is not being starved in the realistic case"

patterns-established: []

requirements-completed: [D-05, D-06, D-09, D-10, D-11, D-12]

# Metrics
duration: ~15min
completed: 2026-08-10
---

# Phase 113 Plan 08: Assignments Tab Write-Path Repoint + Display Surface Conversion Summary

**`assignments.js`'s `saveManageModal` now writes `personnel_user_ids`/`personnel_names` directly onto `projects`/`services` documents via awaited `arrayUnion`/`arrayRemove` — replacing the old user-document `assigned_*_codes` write plus fire-and-forget `syncAssignmentToPersonnel` reverse sync (now deleted) — and both admin display surfaces (the Assignments grid's count/row-filter and `user-management.js`'s assigned-projects column) now read live personnel membership instead of the frozen code arrays.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-10
- **Tasks:** 3/3
- **Files modified:** 2 (`app/views/assignments.js`, `app/views/user-management.js`)

## Accomplishments

- `app/views/assignments.js` `saveManageModal()`: rewritten to compute `addedIds`/`removedIds` by diffing the modal's checked container document IDs against live `personnel_user_ids` membership (via the new `getPersonnelMemberships()` helper), then performs one **awaited** `updateDoc(doc(db, type, id), { personnel_user_ids: arrayUnion/arrayRemove(userId), personnel_names: arrayUnion/arrayRemove(userName) })` per affected container, collecting failures into a local array and surfacing an error toast stating how many container writes failed. `syncAssignmentToPersonnel` (the fire-and-forget reverse sync that used to swallow `PERMISSION_DENIED` errors — the defect class this whole phase exists to eliminate) is deleted in full, along with its call site and section banner.
- D-09 legacy-flag handling preserved: when the target user holds `all_projects === true` (projects tab) / `all_services === true` (services tab), the modal still pre-checks every item on open (migrate-on-edit), and Save still clears the flag — but now as its own awaited write with its own try/catch and a dedicated toast (`Could not clear the legacy "{flag}" flag — a Super Admin must clear it manually`) on failure, kept separate from the container-write error path per the plan's explicit instruction.
- D-06 supersede: added an inline comment above `saveManageModal` recording that Quick 260706-mco's lock on this function (`260706-mco-PLAN.md:142,296` — "the landmine source, do NOT change") is deliberately superseded, and why: that lock protected the `all_projects:false`/`all_services:false` write from silently scoping an admin out of their home department while `assigned_project_codes`/`assigned_service_codes` were still read for visibility; Phase 113 D-08 repointed `getAssignedProjectCodes()`/`getAssignedServiceCodes()` onto `personnel_user_ids` membership, so those arrays are no longer read anywhere, and the landmine no longer exists.
- Modal selection state renamed `pendingModalCodes` -> `pendingModalIds` (document-ID-keyed, not code-keyed) across every touch point: the module-scope declaration, `renderUsersTable`'s modal-open re-render guard, `openManageModal` (seed set + checkbox pre-check + label rendering, `window._pendingModalIds` mirror), the inline `onchange` handler strings (`data-id="${item.id}"`, `this.dataset.id`), the selection-count displays (footer span + `change`-event listener), `saveManageModal`, `closeManageModal`, and `destroy()`'s reset. Zero occurrences of `pendingModalCodes`/`_pendingModalCodes`/`data-code` remain anywhere in the file, including inside HTML string literals (verified — a partial rename here would have failed silently at runtime, not at parse time, per the plan's T-113-41 threat).
- Added `getPersonnelMemberships(itemsList, userId)`, a shared helper (`projectsData`/`servicesData` filtered on `Array.isArray(item.personnel_user_ids) && item.personnel_user_ids.includes(userId)`) used by four call sites: `getAssignmentCount` (count), the cross-department row filter (both projects-tab and services-tab predicates), `openManageModal` (checkbox pre-check seed), and `saveManageModal` (old-id diffing base) — a single source of truth so the displayed count and the row-visibility filter can never disagree.
- `renderUsersTable`'s cross-department row filter: the `services_user`/`services_admin` rows that stay visible on the Projects tab (and the mirror on the Services tab) now test personnel membership on `projectsData`/`servicesData` instead of `Array.isArray(u.assigned_project_codes) && u.assigned_project_codes.length > 0` — this was the site RESEARCH.md flagged as the one CONTEXT.md's D-10 list omitted, and the one that would have broken most silently: once the legacy arrays freeze, a newly cross-department-assigned user would have vanished from the admin's grid despite being correctly assigned via `personnel_user_ids`, making them un-unassignable through the UI.
- `app/views/user-management.js` `assignedProjectsDisplay`: replaced the `Array.isArray(user.assigned_project_codes) && ...` cross-reference with a direct count of `projectsData` entries whose `personnel_user_ids` includes `user.id`. The `all_projects === true` early branch, the exact output strings (`'All projects'`, `` `${validCount} projects` ``, `'No projects'`), the `user.role === 'operations_user'` gate, and the unscoped `projects` listener are all byte-identical to before.

## Task Commits

Both tasks touching `app/views/assignments.js` (Task 1: repoint `saveManageModal` + delete the reverse sync; Task 2: repoint the two display surfaces) were implemented together since they share the new `getPersonnelMemberships()` helper and the `pendingModalIds` rename, and were committed as a single atomic commit for that file. Task 3 (the disjoint `user-management.js` file) is its own commit:

1. **Task 1 + Task 2 (combined — same file, shared helper): Repoint `saveManageModal` + delete reverse sync + repoint `getAssignmentCount`/row filter** - `496f2a4` (feat)
2. **Task 3: Repoint the user-management assigned-projects display** - `7360626` (feat)

_Note: this deviates from strict 1-task-per-commit only in that Tasks 1 and 2 were combined into one commit — both target the same file and Task 2's row-filter/count rewrite depends on the same `getPersonnelMemberships()` helper introduced while rewriting `saveManageModal` for Task 1. No functional deviation occurred; both tasks' own `<verify>`/`<acceptance_criteria>` blocks were run independently against the resulting code and both passed._

## Files Created/Modified

- `app/views/assignments.js` - `saveManageModal()` rewritten to write `personnel_user_ids`/`personnel_names` on containers directly (awaited `arrayUnion`/`arrayRemove`, error-collected toast); `syncAssignmentToPersonnel()` deleted; `pendingModalCodes` -> `pendingModalIds` renamed everywhere; `getPersonnelMemberships()` helper added; `getAssignmentCount()` and the cross-department row filter repointed onto it; D-06 supersede comment added
- `app/views/user-management.js` - `assignedProjectsDisplay` block's counting mechanism repointed from `assigned_project_codes` cross-reference to `personnel_user_ids` membership count

## Listener / window-fn register-teardown counts

No new Firestore listeners or `window.*` registrations were added by this plan — it is a write-path repoint, not a new-surface addition.

- `app/views/assignments.js`: 3 `onSnapshot()` listeners (users, projects, services), all pushed to `listeners` in `init()` and unsubscribed via `listeners.forEach(unsub => unsub?.())` in `destroy()` — unchanged, register = teardown = 3. 5 `window.*` functions (`openManageModal`, `saveManageModal`, `closeManageModal`, `switchAssignmentSubTab`, `filterModalItems`) registered in `init()` and deleted in `destroy()` — unchanged, register = teardown = 5.
- `app/views/user-management.js`: not touched at the listener/window-fn level by this plan (Task 3 only edited the counting expression inside the existing row-render loop).

## Container-write failure surfacing (explicit, per success criteria)

- **Container writes (`personnel_user_ids`/`personnel_names` on `projects`/`services`):** each `updateDoc` call is inside its own `try/catch` inside a `for` loop; a caught error is logged (`console.error`) and pushed to a local `containerErrors` array with the container's label and action (`add`/`remove`). After both loops complete, if `containerErrors.length === 0` the existing `showToast('Assignments saved', 'success')` fires; otherwise `showToast(\`Assignments: ${containerErrors.length} container write(s) failed\`, 'error')` fires. No write in this path uses a bare `.catch(err => console.error(...))` tail — every write is `await`ed inside a `try` block that the surrounding function control flow cannot skip past silently.
- **Legacy `all_*` flag clear (`users/{userId}`):** its own `await updateDoc(...)` inside its own `try/catch`, entirely separate from the container-write loop above. On failure: `showToast(\`Could not clear the legacy "${allFlag}" flag — a Super Admin must clear it manually\`, 'error')`.
- **No-op save (nothing to write):** when `addedIds.length === 0 && removedIds.length === 0`, the function shows the standard `showToast('Assignments saved', 'success')` and returns before issuing any write — this is the literal "if both are empty, toast the existing success message and return without any write" instruction from the plan.

## Decisions Made

See `key-decisions` in frontmatter. Summarized: modal key switched from container code to container document ID (write target requires an ID, and a codeless container has no code); old-id diffing base recomputed live from `personnel_user_ids` membership at Save time rather than captured at modal-open time or read from the legacy arrays; the `all_*` flag clear is a fully independent write/error/toast from the container-write loop, per the plan's explicit reasoning about the D-17 carve-out removal in 113-10; the both-empty early return skips the flag clear too, followed literally from the plan's action text (this is a narrow theoretical edge case — in practice a user still holding the legacy flag will have non-empty `addedIds` on save because their real personnel membership essentially never already matches the migrate-on-edit "every current item" pre-check).

## Deviations from Plan

None — plan executed exactly as written for both files. All 3 tasks' explicit `<verify>` automated checks and `<acceptance_criteria>` bullets were run and passed (see command output above): `node --check` PASS on both files; zero occurrences of `syncAssignmentToPersonnel`, `pendingModalCodes`, `_pendingModalCodes`, and (outside explanatory comments) `assigned_project_codes`/`assigned_service_codes` in `assignments.js`; zero occurrences of `user.assigned_project_codes` in `user-management.js`; `260706-mco` supersede comment present; `All (legacy)` label preserved (D-09 regression guard); `saveManageModal` contains both `arrayUnion(userId)` and `arrayRemove(userId)` inside awaited `updateDoc` calls.

The only departure from the plan's literal task boundaries is the commit grouping documented above (Task 1 + Task 2 combined into one commit since they share a file and a helper) — not a functional or code deviation, and both tasks' verification blocks were still run and passed independently.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan is pure client-side JS; no Firestore rules/indexes were touched (the widened rule branches these writes rely on were landed in 113-01 and dev-deployed in 113-02). No deploy was executed.

## Next Phase Readiness

- The write-side half of Phase 113's D-05 (personnel_user_ids as sole assignment record) is now live in the client: the Assignments tab's checkbox grid is a thin editor directly over container `personnel_user_ids`, with zero remaining path that writes `assigned_project_codes`/`assigned_service_codes` to a user document.
- `syncAssignmentToPersonnel` (the assignments.js-local reverse sync) is deleted. The two `app/utils.js`-resident sync helpers (`syncPersonnelToAssignments`/`syncServicePersonnelToAssignments`, unrelated to this file, already stripped of all call sites by 113-04/113-05/113-07) remain scoped to plan 113-09 for deletion.
- Both admin display surfaces that read assignment state (`assignments.js`'s grid count + row filter, `user-management.js`'s assigned-projects column) are personnel-derived, closing the last two D-10 read sites this phase's RESEARCH.md catalogued.
- The `260706-mco` lock is now formally superseded in code, not just in planning docs — a future reader of `saveManageModal` will find the reasoning inline rather than needing to cross-reference the quick-fix plan.
- No stubs introduced. No threat surface beyond what `113-08-PLAN.md`'s `<threat_model>` already covers (T-113-36 through T-113-41 all verified in place above: T-113-36's role-gated write reachability unchanged; T-113-37's awaited+surfaced writes replace the swallowed fire-and-forget; T-113-38's independent flag-clear error path implemented; T-113-39's document-ID key accepted as-is; T-113-40's row-filter fix implemented; T-113-41's zero-stray-identifier rename verified).
- Ready for plan 113-09 (delete the now-fully-unreferenced `syncPersonnelToAssignments`/`syncServicePersonnelToAssignments` definitions from `app/utils.js`) and plan 113-10 (drop the transitional `isAssignedTo*` rule terms and the `users` update carve-out, D-17).

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-10*

## Self-Check: PASSED

All claimed files verified present and modified (`app/views/assignments.js`, `app/views/user-management.js`). Both task commit hashes (`496f2a4`, `7360626`) verified present in `git log --oneline -5`. `node --check` passed on both JS files. All plan-level `<verification>` checks (zero `syncAssignmentToPersonnel`/`pendingModalCodes`/`assigned_project_codes`/`assigned_service_codes` in `assignments.js`, zero `user.assigned_project_codes` in `user-management.js`, awaited `arrayUnion(userId)`/`arrayRemove(userId)` present, `260706-mco` supersede comment present) ran and passed as shown above. `git diff --diff-filter=D` confirmed zero file deletions across both commits.
