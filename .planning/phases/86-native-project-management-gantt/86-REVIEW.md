---
phase: 86-native-project-management-gantt
reviewed: 2026-05-05T15:11:02Z
depth: standard
iteration: 2
files_reviewed: 7
files_reviewed_list:
  - app/router.js
  - app/task-id.js
  - app/views/project-detail.js
  - app/views/project-plan.js
  - firestore.rules
  - index.html
  - styles/views.css
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 86: Code Review Report (Iteration 2)

**Reviewed:** 2026-05-05T15:11:02Z
**Depth:** standard
**Iteration:** 2 (re-review of iter-1 fixes)
**Files Reviewed:** 7
**Status:** issues_found

## Summary

All 16 iter-1 fixes (CR-01..CR-05, WR-01..WR-11) were verified in code and correctly applied — no regressions in the patches themselves. The CR-04 onclick → data-attr + addEventListener refactor in `project-plan.js` and `project-detail.js` was performed correctly across all 5 surfaces (task tree rows, filter pills, modal pills, delete confirm, code-issuance confirm); event listeners are re-attached on every `innerHTML` rewrite so no listener leak.

This iteration surfaces a small set of residual / pre-existing issues that were either intentionally narrowed in iter-1 (CR-03 race, downgraded to warning per user direction) or made more visible by the refactors:

- 0 Critical
- 4 Warnings (one is the documented CR-03 residual; three are correctness issues — stale-data recursion in `recomputeParentDates`, missing CSS class, and a hidden NaN write path)
- 5 Info items (mostly minor consistency / dead code)

No new Critical issues were introduced by the iter-1 refactors.

## Critical Issues

None.

## Warnings

### WR-01: TASK-ID generation race only narrowed, not eliminated (residual CR-03)

**File:** `app/views/project-plan.js:1083-1092`
**Severity:** warning (downgraded from critical per user direction in iter-1)
**Issue:** The retry-loop mitigation reads via `getDoc()` and then writes via `setDoc()`. Two concurrent creates can both observe the candidate id as missing within the same window between `getDoc()` and `setDoc()`. With `merge: !!modalEditingTaskId` resolving to `merge: false` on the create path, two concurrent creates can still both write to the same `task_id` and one silently overwrites the other. The 5-attempt retry only narrows — it does not eliminate — the race.
**Acknowledged:** Per the iter-1 REVIEW-FIX note, the user is aware and chose the lowest-scope fix. Tracked here so a future iteration can adopt the proper counter-doc + `runTransaction` pattern, which requires exporting `runTransaction` from `firebase.js`.
**Fix:** Track as future work — implement a per-project counter document (e.g. `project_task_counters/{project_code}`) and use `runTransaction` to atomically read-increment-claim the next id. Then drop the retry loop.

### WR-02: recomputeParentDates uses stale local parent dates when bubbling up the chain

**File:** `app/views/project-plan.js:1166-1197`
**Issue:** After the parent's `updateDoc({ start_date, end_date, ... })` succeeds, the function recurses with `recomputeParentDates(parent.parent_task_id, exclude)`. But the **local** `tasks[]` entry for the just-updated parent is NOT patched in place — its `start_date`/`end_date` still hold the pre-recompute values. When the recursion processes the grandparent, it filters children where `parent_task_id === grandparentId` (which includes the parent we just updated) and reads stale `start_date`/`end_date` from that parent. As a result:
- The grandparent's no-change short-circuit (line 1182) may incorrectly return when the new envelope actually changed.
- Or the grandparent may be written with stale data, requiring an additional snapshot tick to converge.

This is the same class of bug as iter-1 WR-02 (which patched `tasks[]` in `saveTaskFromModal` before calling `recomputeParentDates`), but the recursive call inside `recomputeParentDates` itself reintroduces the symptom for chains of depth ≥ 2.
**Fix:** After the successful `updateDoc` in `recomputeParentDates`, patch the local `tasks[]` parent entry in place before recursing:
```javascript
const parentIdx = tasks.findIndex(t => t.task_id === parentTaskId);
if (parentIdx >= 0) {
    tasks[parentIdx] = { ...tasks[parentIdx], start_date: minStart, end_date: maxEnd };
}
if (parent?.parent_task_id) await recomputeParentDates(parent.parent_task_id, exclude);
```

### WR-03: Missing CSS class `.personnel-pills-container` — undefined layout for filter / modal pill rows

**Files:** `app/views/project-plan.js:632`, `app/views/project-plan.js:856`, `app/views/project-plan.js:887`, `styles/views.css`, `styles/components.css`
**Issue:** Three render sites in `project-plan.js` emit `<div class="personnel-pills-container">…</div>`, but no CSS rule for `.personnel-pills-container` exists in `styles/views.css` or `styles/components.css` (verified via Grep). Pills inside use `.personnel-pill` (`display: inline-flex`) so they line up inline, but the container has no padding, gap, max-width, or wrap behavior — visual layout falls back to default block flow. On narrow screens or with many pills, the toolbar/modal row can clip or push content overflow.
**Fix:** Add a rule to `styles/views.css` (or `components.css` if used by other views):
```css
.personnel-pills-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}
```

### WR-04: editTaskProgress writes NaN to Firestore on empty/garbage slider value

**File:** `app/views/project-plan.js:1201-1221`
**Issue:** `Math.round(Number(valueRaw))` returns `NaN` if `valueRaw` is `''`, `null`, or non-numeric. The subsequent `Math.min(100, NaN)` → `NaN`, `Math.max(0, NaN)` → `NaN`. The guard `if (value === t.progress) return;` is false (NaN !== anything), so `updateDoc({ progress: NaN, ... })` is sent. Firestore rejects NaN in numeric fields, surfacing a generic "Could not save task" toast that doesn't help the user diagnose. While the `<input type="range">` element constrains user input, programmatic invocation (e.g., from a buggy event listener or `e.target.value` when the slider is briefly detached) can hit this.
**Fix:** Add a finite-number guard at the top:
```javascript
const parsed = Number(valueRaw);
if (!Number.isFinite(parsed)) return;
const value = Math.max(0, Math.min(100, Math.round(parsed)));
```

## Info

### IN-01: detectDependencyCycle DFS reports cycles unrelated to candidate edit

**File:** `app/views/project-plan.js:995-1041`
**Issue:** The DFS rooted at the candidate `taskId` detects any cycle reachable from that node, not only cycles introduced by the candidate's new dependencies. If existing data already contains a cycle (shouldn't happen but isn't guarded), the user is blocked from saving an unrelated edit with a misleading "this dependency would create a cycle" toast.
**Fix:** Acceptable as-is; long-term, scope detection to cycles that include the candidate's new edges, or run a one-shot data-integrity check on init that flags pre-existing cycles separately.

### IN-02: detectDependencyCycle path reconstruction can be incomplete

**File:** `app/views/project-plan.js:1011-1034`
**Issue:** The cycle reconstruction walks `parent[]` from `node` upward looking for `nb`, but `parent.set(nb, node)` is recorded only when `nb` was first descended into. If the cycle revisits an earlier-grayed node via a different path, the parent map may not reach `nb` from `node` — the loop exits with a partial path. The toast can show a path like `A → B → A` even when the real cycle is `A → B → C → A`.
**Fix:** Use Tarjan's SCC algorithm or a dedicated cycle-extraction routine if cycle messages become a UX complaint. Acceptable as-is.

### IN-03: Dead CSS rule `.gantt-container .arrow.violation` after iter-1 WR-04 fix

**File:** `styles/views.css:2552-2555`
**Issue:** Iter-1 WR-04 dropped the count-match heuristic that tagged Frappe arrows as violations, so no arrow ever receives the `.violation` class now. The CSS rule is dead code.
**Fix:** Either restore violation tagging via a Frappe fork that adds `data-from`/`data-to` to arrow paths, or delete this rule.

### IN-04: `__candidate__` literal could shadow a real task_id

**File:** `app/views/project-plan.js:1065`
**Issue:** `const targetTaskId = modalEditingTaskId || '__candidate__'` uses a sentinel string for cycle detection on new tasks. If a task with id `__candidate__` ever exists (impossible via the generator but possible via direct Firestore manipulation or import), the cycle detection logic confuses the two.
**Fix:** Acceptable given the generator's id format. Defense-in-depth: use `Symbol('candidate')` or a per-call unique sentinel like `__candidate__${Date.now()}__`.

### IN-05: `tasks` re-assignment after Firestore write loses field shape

**File:** `app/views/project-plan.js:1145`
**Issue:** `tasks = tasks.filter(x => x.task_id !== taskId).concat([patched])` reassigns module state. The `patched` object lacks `created_at` and `updated_at` (these are server timestamps not yet returned). The next snapshot tick repaints with the full shape, but a parallel re-render between this assignment and that tick would see a partially-populated entry. Currently safe in this codebase; flagged for awareness if more parallel readers are added.
**Fix:** Acceptable as-is; consider a Map keyed by `task_id` for safer mutation semantics if this view grows.

---

_Reviewed: 2026-05-05T15:11:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2_
