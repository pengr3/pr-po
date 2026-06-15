---
phase: 86-native-project-management-gantt
fixed_at: 2026-05-05T00:00:00Z
iteration: 2
fix_scope: critical_warning
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 86: Code Review Fix Report (CUMULATIVE — iter-1 + iter-2)

**Fixed at:** 2026-05-05T00:00:00Z
**Source review (iter-2):** `.planning/phases/86-native-project-management-gantt/86-REVIEW.md`
**Source review (iter-1):** preserved as `86-REVIEW.iter2.md`
**Iter-1 fix report:** preserved as `86-REVIEW-FIX.iter2.md`

This is the cumulative final report for Phase 86's auto code-review-fix loop. It covers both iterations:

- **Iter-1** fixed all 16 in-scope findings from the first review pass (5 Critical + 11 Warning).
- **Iter-2** re-reviewed the iter-1 patches and surfaced 4 residual/new Warnings; this report documents the iter-2 disposition for those 4, then appends the iter-1 per-finding sections for completeness.

**Cumulative totals across iter-1 + iter-2:**
- Findings addressed: 20 (16 from iter-1, 4 from iter-2)
- Fixed: 19
- Skipped: 1 (WR-01 iter-2 — user-acknowledged residual)
- Total commits: 19

---

## Iteration 2 (this iteration)

**Scope:** critical_warning (5 Info findings deferred)
**Findings in scope:** 4 (0 Critical + 4 Warning)
**Fixed:** 3
**Skipped:** 1
**Iter-2 commits:** 3

### WR-01: TASK-ID generation race only narrowed, not eliminated — Skipped (user-acknowledged)

**File:** `app/views/project-plan.js:1083-1092`
**Status:** skipped
**Reason:** Per the iter-1 REVIEW-FIX note and explicit user direction in iter-1, the user is aware that the 5-attempt retry loop only narrows — it does not eliminate — the race window between `getDoc()` and `setDoc()`. The full transactional fix requires exporting `runTransaction` from `app/firebase.js` and introducing a per-project counter document (`project_task_counters/{project_code}`) — out of scope for the auto-fix loop. Tracked here so a future phase can adopt the proper counter-doc + `runTransaction` pattern.
**Original issue:** Two concurrent creates can both observe a candidate `task_id` as missing in the gap between the pre-check `getDoc()` and the `setDoc()`, and both write the same id (the second silently overwriting the first). The retry only re-runs on observed collisions inside one client's window.

### WR-02: recomputeParentDates uses stale local parent dates when bubbling up

**File modified:** `app/views/project-plan.js`
**Commit:** `0144085`
**Applied fix:** After the successful `updateDoc` in `recomputeParentDates`, patch the in-memory `tasks[]` entry for the just-updated parent in place (replace `start_date` and `end_date` with the freshly-computed `minStart` / `maxEnd`) before recursing to the grandparent. Without this patch, the recursive call reads the parent's pre-recompute values from `tasks[]` and either short-circuits prematurely (`parent.start_date === minStart && parent.end_date === maxEnd` evaluated against stale data) or writes stale envelope to the grandparent, requiring a snapshot tick to converge for chains of depth >= 2.
**Note:** Logic change — recommend manual verification: build a 3-level parent -> child -> grandchild chain, edit the grandchild's end_date past the parent envelope, save, and confirm both the parent AND grandparent stored end_date update on the same save (no snapshot tick required for either level).

### WR-03: Missing CSS class `.personnel-pills-container`

**File modified:** `styles/views.css`
**Commit:** `83c2a01`
**Applied fix:** Added a `.personnel-pills-container` rule at the bottom of `views.css` with `display: flex; flex-wrap: wrap; gap: 6px; align-items: center;`. This provides consistent layout for the three render sites in `project-plan.js` that emit this container (filter-panel pill row at line 632, task-form modal at line 856, and the in-place re-render in `toggleTaskAssignee()` writes into the existing container). Pills wrap cleanly on narrow viewports instead of overflowing.

### WR-04: editTaskProgress writes NaN to Firestore on empty/garbage slider value

**File modified:** `app/views/project-plan.js`
**Commit:** `0cb9e6d`
**Applied fix:** Added `const parsed = Number(valueRaw); if (!Number.isFinite(parsed)) return;` at the top of `editTaskProgress`, before the `Math.round(...)`. Previously, `Math.round(Number(''))` produced `NaN`, which propagated through `Math.min(100, NaN) -> NaN` and `Math.max(0, NaN) -> NaN`. The early-return guard `if (value === t.progress) return` is `false` for NaN (NaN !== anything, including itself), so the `updateDoc({ progress: NaN, ... })` call was reached and Firestore rejected the write with a generic permission/save-failed toast.

---

## Iteration 1 (preserved verbatim from `86-REVIEW-FIX.iter2.md`)

**Scope:** critical_warning (4 Info findings deferred)
**Findings in scope:** 16 (5 Critical, 11 Warning)
**Fixed:** 16
**Skipped:** 0
**Iter-1 commits:** 16

### CR-01: showLoading() never hidden — global overlay stuck or toggled

**File:** `app/views/project-plan.js`
**Commit:** `331b0f6`
**Applied fix:** Replaced bare `showLoading()` with `showLoading(true)` and added `showLoading(false)` in `finally` blocks across `init()`, `saveTaskFromModal()`, and `deleteTaskNow()`. The previous `// snapshot first-callback paint` comment was misleading — no such hide call existed.

### CR-02: Editing a parent task wipes its persisted start_date/end_date

**File:** `app/views/project-plan.js`
**Commit:** `7239fe1`
**Applied fix:** In `saveTaskFromModal()`, only include `start_date`/`end_date` in the merge payload when the inputs are enabled (i.e., not a computed parent task). Added explicit "dates required for new tasks" guard that toasts and returns rather than writing empty strings.
**Note:** Logic change — recommend manual verification: edit a parent task's name/assignees, confirm the persisted `start_date`/`end_date` remain intact post-save.

### CR-03: generateTaskId races and produces colliding task_ids

**File:** `app/views/project-plan.js`
**Commit:** `1fbecdd`
**Applied fix:** Per the user's directive to apply the lowest-scope option, added a 5-attempt retry loop in `saveTaskFromModal()` that pre-checks the candidate `task_id` with `getDoc()` before writing. On collision, calls `generateTaskId()` again. The full transactional fix (counter doc + `runTransaction`) is deferred — `runTransaction` is not currently exported from `firebase.js` and would expand scope.
**Note:** This narrows the race window but does NOT eliminate it (two concurrent reads can both see the candidate as missing, then both write). Iter-2 re-review reaffirmed this residual as WR-01 above; user acknowledged. Recommend manual verification under simulated concurrent load if the team wants stronger guarantees; otherwise the transactional fix should be tracked as future work.

### CR-04: escapeHTML output HTML-decoded inside JS string contexts

**Files modified:** `app/views/project-plan.js`, `app/views/project-detail.js`
**Commit:** `ee8ffe5`
**Applied fix:** Replaced inline `onclick="window.fn('${escapeHTML(id)}')"` patterns with `data-*` attributes + `addEventListener` after `innerHTML` assignment. Refactored:
- Task tree rows in `renderTaskTree()` (5 handlers: select, toggle-expand, open-edit, edit-progress, confirm-delete)
- Filter-panel personnel pills in `renderPlanFilterPanel()` (toggle-filter-assignee)
- Task-form-modal personnel pills in `renderTaskFormModal()` and the in-place re-render inside `toggleTaskAssignee()`
- Delete-confirm modal button in `confirmDeleteTask()` (delete-task)
- Code-issuance overlay confirm button in `startCodeIssuance()` (3 args via separate `data-client-id`/`data-client-code`/`data-new-project-code`)

### CR-05: firestore.rules tier-2 progress update breaks on legacy/missing assignees

**File:** `firestore.rules:520-523`
**Commit:** `bf55bca`
**Applied fix:** Added existence + type guards before the `in` membership check on `resource.data.assignees`:
```
resource.data.keys().hasAny(['assignees']) &&
resource.data.assignees is list &&
request.auth.uid in resource.data.assignees
```
**Note:** Rules change requires emulator/production deploy + tested-rules verification (manual). Recommend re-running the rules unit tests if any exist for project_tasks before deploying.

### WR-01 (iter-1): window._projectDetail*Handler guards prevent re-init handler tracking

**File:** `app/views/project-detail.js`
**Commit:** `1e0739f`
**Applied fix:** Removed the `if (!window._projectDetail*Handler)` guards. Now `init()` always detaches the previously-stored handler before `addEventListener`-attaching the new one and overwrites the stored reference. Applied symmetrically to both the permissions handler and the assignment handler.

### WR-02 (iter-1): recomputeParentDates uses stale local tasks[] for the just-saved task

**File:** `app/views/project-plan.js`
**Commit:** `f3ca7f2`
**Applied fix:** After the successful `setDoc`, patch the module-level `tasks[]` in place (replace the matching entry, or append if new) with the just-written `docData` before calling `recomputeParentDates()`. This prevents the recompute from missing newly-created children or double-counting reparented ones.
**Note:** Logic change — recommend manual verification: create a child whose end_date exceeds the parent's current envelope, then confirm the parent's persisted end_date updates immediately on the same save (without waiting for the next snapshot). Iter-2 follow-up patch (WR-02 above) extends the same fix into `recomputeParentDates`'s recursive call so the bubble-up also sees fresh local state.

### WR-03 (iter-1): ISO-string date comparison races user timezone for "today"

**File:** `app/views/project-detail.js`
**Commit:** `932e694`
**Applied fix:** Added a `todayLocal()` helper at the bottom of the file and replaced the `new Date().toISOString().slice(0, 10)` call inside `computeProjectProgress()`. The Gantt today-line code in `project-plan.js` already uses `new Date()` with local-day comparisons against `gantt.gantt_start`, which the review marked as OK — so no project-plan.js changes were needed for this finding.

### WR-04 (iter-1): applyFsViolationStyles position-match heuristic mis-tags arrows

**File:** `app/views/project-plan.js`
**Commit:** `63bc8ae`
**Applied fix:** Per the review's interim recommendation, removed the `arrows.length === violations.length` guard so no arrows are tagged as violations. The toast remains the single source of UX signal until a Frappe fork can add `data-from`/`data-to` attributes on arrow paths.

### WR-05: cycle reconstruction may produce duplicate first/last node in displayed path

**File:** `app/views/project-plan.js`
**Commit:** `bbfa7ba`
**Applied fix:** Per the review's option (b), dropped the redundant `-> ${cycleNames[0]}` suffix from the cycle toast. The path already wraps from `nb` back to `nb` via reconstruction, so the bare `cycleNames.join(' -> ')` reads correctly.

### WR-06: refreshSummaryHighlights() reference is a no-op; comment misleads

**File:** `app/views/project-plan.js`
**Commit:** `bf35b58`
**Applied fix:** Removed the dead `if (typeof refreshSummaryHighlights === 'function') refreshSummaryHighlights();` line from the snapshot callback. project-detail.js's summary card already self-listens via its own onSnapshot, so no cross-view callback is needed.

### WR-07: Open Plan link uses escapeHTML where encodeURIComponent is required

**File:** `app/views/project-detail.js:384`
**Commit:** `7927b5c`
**Applied fix:** Switched `${escapeHTML(currentProject?.project_code || '')}` to `${encodeURIComponent(currentProject?.project_code || '')}` inside the `href="#/projects/.../plan"` template.

### WR-08: recomputeParentDates silently swallows permission errors

**File:** `app/views/project-plan.js`
**Commit:** `de27148`
**Applied fix:** Added `showToast(..., 'warning')` for `permission-denied` errors in the `catch` block of `recomputeParentDates()`, while preserving the `console.warn` for diagnostics.

### WR-09: confirmDeleteTask body double-encodes / plural inconsistency

**File:** `app/views/project-plan.js`
**Commit:** `38c9b96`
**Applied fix:** Switched the plural test from `> 1 ? 's' : ''` to `!== 1 ? 's' : ''` for consistency with how plurals are written in the rest of the codebase. Added a JSDoc-style comment that `body` is HTML-trusted at the call site (escapeHTML already applied to `t.name` before interpolation).

### WR-10: __snapshotCount toast suppression doesn't preserve toasts on re-mount

**File:** `app/views/project-plan.js`
**Commit:** `4b7b55f`
**Applied fix:** Promoted `__snapshotCount` from a function-local `let` inside `init()` to a module-scope `let` alongside `__lastViolationFingerprint` and `__ganttInitialScrollDone`. Reset to `0` at the top of the snapshot subscription block in `init()` and inside `destroy()`. Both reset paths now stay in sync.

### WR-11: writeBatch in deleteTaskNow chunks at 450 but cascade collect uses unbounded recursion

**File:** `app/views/project-plan.js`
**Commit:** `5f1960d`
**Applied fix:** Pre-built `childrenByParent` Map at the top of `deleteTaskNow()`. The recursive `collect()` now reads from the map (O(1) per parent) rather than repeating `tasks.filter()` (O(n) per parent) at every level. Net cascade complexity drops from O(depth x n) to O(n).

---

## Verification Notes (cumulative)

- **Tier 1** (re-read modified files): performed for every fix in both iterations.
- **Tier 2** (syntax check): both `app/views/project-plan.js` and `app/views/project-detail.js` pass `node --check` cleanly after all 19 patches. `firestore.rules` change (CR-05) is syntax-checked at deploy time via `firebase deploy --only firestore:rules` — should be run before merging to production. `styles/views.css` (WR-03 iter-2) has no automated CSS validator in this project's stack; rule was Tier-1 verified (rule visible, surrounding rules intact, brace count balanced).

## Findings Recommended for Manual Verification (cumulative)

These fixes contain logic changes whose runtime correctness cannot be confirmed by syntax check alone. The orchestrator / phase verifier should manually exercise them:

1. **CR-02** — edit a parent task and confirm its persisted start/end dates remain intact post-save.
2. **CR-03 / WR-01 (iter-2)** — task ID retry path narrows but does not eliminate the race; user acknowledged. At minimum, confirm normal task-create still works in the happy path.
3. **CR-05** — firestore.rules tier-2 update: deploy to a test project and exercise progress updates as `operations_user` against (a) a doc with valid assignees, (b) a doc with missing assignees field, (c) a doc with non-list assignees. Confirm (a) succeeds and (b)/(c) deny gracefully (no rule-evaluation crashes).
4. **WR-02 (iter-1)** — create a child whose end_date exceeds the current parent envelope and confirm the parent's stored end_date updates immediately on save (no snapshot tick required).
5. **WR-02 (iter-2)** — same as above but with a 3-level chain; confirm BOTH parent and grandparent envelopes update on the same save.
6. **CR-04** — verify the refactored event handlers still fire correctly on user clicks across all 5 surfaces (task tree rows, filter pills, modal pills, delete confirm, code-issuance confirm).
7. **WR-04 (iter-2)** — exercise the inline progress slider with a normal drag (happy path) and confirm percent updates persist; non-finite path is defensive and unlikely to trigger via UI.

## Out-of-Scope (Info findings, not addressed in either iteration)

**Iter-1 Info (4):**
- IN-01 (iter-1): Frappe Gantt CDN SRI hash
- IN-02 (iter-1): ensureTasksListener identity-change guard
- IN-03 (iter-1): runCodeIssuance project_tasks backfill
- IN-04 (iter-1): __ prefix naming convention

**Iter-2 Info (5):**
- IN-01 (iter-2): detectDependencyCycle DFS reports cycles unrelated to candidate edit
- IN-02 (iter-2): detectDependencyCycle path reconstruction can be incomplete
- IN-03 (iter-2): Dead CSS rule `.gantt-container .arrow.violation` (after iter-1 WR-04 fix)
- IN-04 (iter-2): `__candidate__` literal could shadow a real task_id
- IN-05 (iter-2): `tasks` re-assignment after Firestore write loses field shape

## Future Work Tracker

- **Counter-doc + runTransaction** for task-id generation (replaces both CR-03 iter-1 and WR-01 iter-2). Requires exporting `runTransaction` from `app/firebase.js` and introducing the `project_task_counters/{project_code}` collection with corresponding security rules.
- **Frappe Gantt fork** that adds `data-from`/`data-to` attributes to arrow paths so violation tagging can be re-introduced (would also let IN-03 iter-2's dead CSS rule become live again).
- **Tarjan's SCC or scoped cycle extraction** for `detectDependencyCycle` if cycle messages become a UX complaint (IN-01 + IN-02 iter-2).

---

_Fixed: 2026-05-05T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iterations covered: 1 + 2_
