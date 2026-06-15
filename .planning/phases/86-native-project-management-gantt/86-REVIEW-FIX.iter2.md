---
phase: 86-native-project-management-gantt
fixed_at: 2026-05-05T00:00:00Z
review_path: .planning/phases/86-native-project-management-gantt/86-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 16
fixed: 16
skipped: 0
status: all_fixed
---

# Phase 86: Code Review Fix Report

**Fixed at:** 2026-05-05T00:00:00Z
**Source review:** `.planning/phases/86-native-project-management-gantt/86-REVIEW.md`
**Iteration:** 1
**Fix scope:** critical_warning (Info findings deferred)

**Summary:**
- Findings in scope: 16 (5 Critical, 11 Warning)
- Fixed: 16
- Skipped: 0
- Status: all_fixed

All Critical and Warning findings were resolved. No findings were skipped. Each fix was committed atomically with a `fix(86): <ID> <description>` message.

## Fixed Issues

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
**Note:** This narrows the race window but does NOT eliminate it (two concurrent reads can both see the candidate as missing, then both write). Recommend manual verification under simulated concurrent load if the team wants stronger guarantees; otherwise the transactional fix should be tracked as future work.

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

### WR-01: window._projectDetail*Handler guards prevent re-init handler tracking

**File:** `app/views/project-detail.js`
**Commit:** `1e0739f`
**Applied fix:** Removed the `if (!window._projectDetail*Handler)` guards. Now `init()` always detaches the previously-stored handler before `addEventListener`-attaching the new one and overwrites the stored reference. Applied symmetrically to both the permissions handler and the assignment handler.

### WR-02: recomputeParentDates uses stale local tasks[] for the just-saved task

**File:** `app/views/project-plan.js`
**Commit:** `f3ca7f2`
**Applied fix:** After the successful `setDoc`, patch the module-level `tasks[]` in place (replace the matching entry, or append if new) with the just-written `docData` before calling `recomputeParentDates()`. This prevents the recompute from missing newly-created children or double-counting reparented ones.
**Note:** Logic change — recommend manual verification: create a child whose end_date exceeds the parent's current envelope, then confirm the parent's persisted end_date updates immediately on the same save (without waiting for the next snapshot).

### WR-03: ISO-string date comparison races user timezone for "today"

**File:** `app/views/project-detail.js`
**Commit:** `932e694`
**Applied fix:** Added a `todayLocal()` helper at the bottom of the file and replaced the `new Date().toISOString().slice(0, 10)` call inside `computeProjectProgress()`. The Gantt today-line code in `project-plan.js` already uses `new Date()` with local-day comparisons against `gantt.gantt_start`, which the review marked as OK — so no project-plan.js changes were needed for this finding.

### WR-04: applyFsViolationStyles position-match heuristic mis-tags arrows

**File:** `app/views/project-plan.js`
**Commit:** `63bc8ae`
**Applied fix:** Per the review's interim recommendation, removed the `arrows.length === violations.length` guard so no arrows are tagged as violations. The toast remains the single source of UX signal until a Frappe fork can add `data-from`/`data-to` attributes on arrow paths.

### WR-05: cycle reconstruction may produce duplicate first/last node in displayed path

**File:** `app/views/project-plan.js`
**Commit:** `bbfa7ba`
**Applied fix:** Per the review's option (b), dropped the redundant `→ ${cycleNames[0]}` suffix from the cycle toast. The path already wraps from `nb` back to `nb` via reconstruction, so the bare `cycleNames.join(' → ')` reads correctly.

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
**Applied fix:** Pre-built `childrenByParent` Map at the top of `deleteTaskNow()`. The recursive `collect()` now reads from the map (O(1) per parent) rather than repeating `tasks.filter()` (O(n) per parent) at every level. Net cascade complexity drops from O(depth × n) to O(n).

## Skipped Issues

None.

---

## Verification Notes

- Tier 1 (re-read modified files): performed for every fix.
- Tier 2 (syntax check): both `app/views/project-plan.js` and `app/views/project-detail.js` parse cleanly via Node.js dynamic import (errors only from CDN-URL imports, which is expected for browser-side ES modules).
- `firestore.rules` change is syntax-checked at deploy time via `firebase deploy --only firestore:rules` — should be run before merging to production.

## Findings Recommended for Manual Verification

These fixes contain logic changes whose runtime correctness cannot be confirmed by syntax check alone. The orchestrator / phase verifier should manually exercise them before considering this iteration complete:

1. **CR-02** — edit a parent task and confirm its persisted start/end dates remain intact post-save.
2. **CR-03** — task ID retry path: hard to test without simulating concurrent creates; at minimum, confirm normal task-create still works in the happy path.
3. **CR-05** — firestore.rules tier-2 update: deploy to a test project and exercise progress updates as `operations_user` against (a) a doc with valid assignees, (b) a doc with missing assignees field, (c) a doc with non-list assignees. Confirm (a) succeeds and (b)/(c) deny gracefully (no rule-evaluation crashes).
4. **WR-02** — create a child whose end_date exceeds the current parent envelope and confirm the parent's stored end_date updates immediately on save (no snapshot tick required).
5. **CR-04** — verify the refactored event handlers still fire correctly on user clicks across all 5 surfaces (task tree rows, filter pills, modal pills, delete confirm, code-issuance confirm).

## Out-of-Scope (Info findings, not addressed in this iteration)

- IN-01: Frappe Gantt CDN SRI hash
- IN-02: ensureTasksListener identity-change guard
- IN-03: runCodeIssuance project_tasks backfill
- IN-04: __ prefix naming convention

---

_Fixed: 2026-05-05T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
