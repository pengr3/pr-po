---
phase: 86-native-project-management-gantt
reviewed: 2026-05-05T00:00:00Z
depth: standard
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
  critical: 5
  warning: 11
  info: 4
  total: 20
status: issues_found
---

# Phase 86: Code Review Report

**Reviewed:** 2026-05-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 86 ships a substantial new project-management surface (5 plans, ~1100 lines of view code, new collection + rules, Frappe Gantt integration). Overall security posture is good — escapeHTML is applied broadly, the two-tier Firestore rule structure is sound on paper, and the destroy() lifecycle deletes window functions correctly. However, several **BLOCKER** defects are present:

1. **Loading-spinner state machine is broken in project-plan.js.** `showLoading()` is called with no argument in `init()`, `saveTaskFromModal()`, `deleteTaskNow()` — but `showLoading(show)` does `classList.toggle('active', show)`. With `show === undefined`, `toggle()` flips state. There is no `showLoading(false)` anywhere in the file, and the "snapshot first-callback paint" inverse the comment claims doesn't exist. Net effect: the global overlay either never hides on init paths, or alternates visibility between successive operations.
2. **Parent-task date wipe on save.** Editing a parent task in the modal sends `start_date: ''`, `end_date: ''` to Firestore (because date inputs are disabled and `saveTaskFromModal` reads `''` from disabled inputs). With `merge: true`, the empty strings overwrite the parent's previously-computed dates. Recompute does not run on the saved task itself, only on its parent.
3. **TASK-ID generator races and collides.** `generateTaskId` uses the same scan-then-write pattern Phase 65.4 documented as broken — concurrent writes both compute `maxNum + 1`. The file's own header comment claims per-project sequencing avoids the race, but the race is still in-project.
4. **Hardcoded escapeHTML in JS string literals.** Several event handlers use `'${escapeHTML(uid_or_taskId)}'` inside `onclick="..."`. escapeHTML's `&#039;` is HTML-decoded back to `'` by the browser, breaking out of the JS string for any value containing an apostrophe. Combined with the lack of validation on `project_code` upstream, this is a defense-in-depth gap (currently unreachable but fragile).
5. **firestore.rules tier-2 progress update fails on legacy/malformed tasks.** Tier-2 reads `request.auth.uid in resource.data.assignees`. If `assignees` is missing or non-list on a doc, the rule evaluation errors and denies — not a problem for Phase 86 documents (which always write the field), but any legacy task or hand-written doc breaks all ops_user progress writes.

In addition there are listener/state-leak issues from the `window._projectDetail*Handler` guard, a stale local-`tasks` window in `recomputeParentDates`, an off-by-timezone in the "today" computations, and several minor robustness gaps.

## Critical Issues

### CR-01: showLoading() never hidden in project-plan.js — global overlay stuck or toggled

**File:** `app/views/project-plan.js:67,141,924,1034`
**Issue:** `showLoading()` is invoked with no argument in `init()`, `saveTaskFromModal()`, `deleteTaskNow()`, etc. `utils.js:115` defines `showLoading(show)` as `loadingOverlay.classList.toggle('active', show)`. With `show === undefined`, the second argument is `undefined`, which makes `toggle()` flip-without-force — i.e. the overlay alternates state every call. Worse, the only `finally` clause in `init()` contains a comment claiming the inverse is "handled by snapshot first-callback paint", but **no `showLoading(false)` call exists anywhere in the snapshot callback**. On the empty-project-snapshot path (line 71) and the clientless-block path (line 84), `init()` returns early without ever hiding the spinner. `saveTaskFromModal` and `deleteTaskNow` lack `finally` blocks entirely — every save/delete leaves the overlay in toggled state.
**Fix:**
```javascript
// init() — wrap in try/finally that always hides on completion
showLoading(true);
try {
    // ... existing init body, including snapshot subscription
} finally {
    showLoading(false);  // hide as soon as init completes; snapshot can refresh later
}

// saveTaskFromModal()
showLoading(true);
try {
    // ... save body
} catch (err) {
    // ... existing error handling
} finally {
    showLoading(false);
}

// deleteTaskNow() — same pattern
showLoading(true);
try {
    // ... delete body
} finally {
    showLoading(false);
}
```
And update every caller of `showLoading()` in this file to pass an explicit `true`/`false` boolean (the `(show)` parameter is required by `classList.toggle`'s force-mode contract).

---

### CR-02: Editing a parent task wipes its persisted start_date/end_date

**File:** `app/views/project-plan.js:1010-1060`
**Issue:** When `isParentTask` is true, the modal disables the date inputs (`datesDisabled = true`). `saveTaskFromModal` then reads:
```javascript
const start_date = startInput?.disabled ? '' : (startInput?.value || '');
const end_date = endInput?.disabled ? '' : (endInput?.value || '');
```
`docData` is built with `start_date: ''`, `end_date: ''` and committed via `setDoc(..., { merge: true })`. Firestore merge **replaces** the field with the empty string — the previously-computed envelope is destroyed on disk.

`recomputeParentDates()` is then called for `oldParent` and `parent_task_id` (line 1066-1067) — i.e. the parent OF the saved task — but never for the saved task itself, so its persisted dates remain `''` until a child write triggers a recompute.

The only thing masking this in the Gantt UI is `getEnvelope()` (line 308), which **recomputes from children at render time**. But every consumer that reads persisted `start_date` / `end_date` (the project-detail summary card's `computeDurationDays`, future export jobs, the assignees-progress weighted rollup if the leaf check ever shifts) will treat the parent as a 1-day task with no real dates.

**Fix:** Strip start/end out of the merge payload when dates are computed:
```javascript
const docData = {
    task_id: taskId,
    project_id: currentProject.id,
    project_code: currentProject.project_code,
    parent_task_id,
    name,
    description,
    progress: modalEditingTaskId ? (tasks.find(x => x.task_id === modalEditingTaskId)?.progress ?? 0) : 0,
    is_milestone,
    dependencies,
    assignees,
    updated_at: serverTimestamp()
};
// Only persist dates if not a computed-parent task
if (!startInput?.disabled && start_date) docData.start_date = start_date;
if (!endInput?.disabled && end_date) docData.end_date = end_date;
if (!modalEditingTaskId) {
    // For NEW leaf tasks, dates ARE required
    docData.created_at = serverTimestamp();
    docData.created_by = userId;
    if (!docData.start_date || !docData.end_date) {
        showToast('Start and end dates are required for new tasks.', 'error');
        return;
    }
}
```

---

### CR-03: generateTaskId races and produces colliding task_ids

**File:** `app/task-id.js:37-60`
**Issue:** The function scans `project_tasks` for the project, computes `maxNum`, then returns `TASK-${projectCode}-${maxNum + 1}`. Two concurrent invocations (e.g., two PMs adding tasks at the same time, or one user double-clicking "Save Task") will both observe the same `maxNum` and both return the same id. The very Phase 65.4 collision the file's header comment claims to avoid still occurs — per-project counters are *less* contended than the global year counter, but they're not collision-proof.

The collision then becomes a **silent overwrite** in `saveTaskFromModal` (line 1060) because `setDoc` without `{merge:true}` replaces, and even with `merge:true` for the non-edit path the `merge: !!modalEditingTaskId` is `false`. Two users save → second user's setDoc clobbers the first.
**Fix:** Two viable options:
1. Switch to `addDoc()` and let Firestore generate the doc id; store an unscoped sequence in a separate counter doc updated via `runTransaction`.
2. Keep the current shape but use `setDoc(..., { merge: false })` inside a `runTransaction` that re-reads the max under transaction lock. Document-creation transactions on a query are not directly supported, so option 1 is simpler.

If neither is feasible immediately, mitigate by switching `setDoc` for new tasks to use `setDoc(..., { merge: false })` inside a try/catch that retries on `already-exists` with a re-generated id (and surface a toast on persistent collision).

---

### CR-04: escapeHTML output is HTML-decoded inside JS string contexts

**File:** `app/views/project-plan.js:234,236,238,247,250,601,899,1169` and `app/views/project-detail.js:1169`
**Issue:** Multiple inline event handlers use the form:
```html
onclick="window.selectTaskRow('${escapeHTML(t.task_id)}')"
onclick="window.toggleFilterAssignee('${escapeHTML(uid)}')"
onclick="window.deleteTaskNow('${escapeHTML(taskId)}')"
onclick="window.runCodeIssuance('${escapeHTML(clientId)}', '${escapeHTML(clientCode)}', '${escapeHTML(newProjectCode)}')"
```
escapeHTML emits `&#039;` for apostrophes. The browser HTML-decodes attribute values **before** passing them to the JS parser, so an attribute value `'&#039;); alert(1); //'` decodes to `'; alert(1); //'` — JS string broken, code injected.

Concretely exploitable values today:
- `t.task_id` — generated by `generateTaskId(projectCode)`. Format is `TASK-${projectCode}-${n}`. If an upstream project_code contains `'`, every task on that project becomes an XSS sink.
- `uid` (filter chips, assignee picker) — Firestore Auth UIDs are alphanumeric, safe in practice, but no defense-in-depth.
- `clientId` / `clientCode` / `newProjectCode` (project-detail.js:1169) — clientCode is user-entered upstream in `clients` admin; if clients allow apostrophes, the issue-code modal is the trigger.

**Fix:** Stop hand-rolling event handlers in template strings. Either:
1. Use `data-*` attributes + `addEventListener` after innerHTML assignment (idiomatic, defense-in-depth across the file):
```javascript
container.innerHTML = rows.join('');
container.querySelectorAll('.task-tree-row').forEach(row => {
    const id = row.dataset.taskId;
    row.addEventListener('click', () => window.selectTaskRow(id));
});
```
2. Or, if keeping inline onclick, JSON-stringify the value to produce a safely-escaped JS literal:
```javascript
onclick="window.selectTaskRow(${JSON.stringify(t.task_id)})"
```
(Note: still need escapeHTML on the SURROUNDING attribute value if any of the JSON output contains `<` or `>`.)

The `data-*` + `addEventListener` approach is cleaner and matches what the project already does for the personnel-pill click-outside handler.

---

### CR-05: firestore.rules tier-2 progress update breaks on legacy/missing assignees field

**File:** `firestore.rules:520-523`
**Issue:** The tier-2 update predicate is:
```
request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress', 'updated_at']) &&
(hasRole(['super_admin', 'operations_admin']) ||
 (isRole('operations_user') && request.auth.uid in resource.data.assignees))
```
For ops_user, the rule reads `resource.data.assignees`. If the field is **missing** on the doc (e.g., a legacy task created via the Firestore console, a future migration that introduces tasks without the field, a partial write that didn't include it), the `in` operator on an undefined value raises a runtime error and the rule evaluation denies.

This is admin-bypassable today because the first half of the inner `||` short-circuits. But:
- Any ops_user assigned to a project where a task pre-dates the assignees field can't write progress.
- If the schema ever evolves (e.g., assignees becomes optional, or a denormalization regression drops the field), every ops_user is silently locked out of progress writes — a feature that's intentionally separable from full-edit permission.

**Fix:** Add an existence guard:
```
(isRole('operations_user') &&
  resource.data.keys().hasAny(['assignees']) &&
  resource.data.assignees is list &&
  request.auth.uid in resource.data.assignees)
```
Apply the same guard to tier-1's `isAssignedToProject` chain by extending `isLegacyOrAssigned()` (currently only used by mrfs/prs/pos) to project_tasks for symmetry, or accept the gap by documenting that all tasks must have a non-null `assignees: []` array on disk.

---

## Warnings

### WR-01: window._projectDetail*Handler guards prevent re-init handler tracking

**File:** `app/views/project-detail.js:74-94`
**Issue:** On `init()`:
```javascript
const permissionChangeHandler = () => { renderProjectDetail(); };
window.addEventListener('permissionsChanged', permissionChangeHandler);
if (!window._projectDetailPermissionHandler) {
    window._projectDetailPermissionHandler = permissionChangeHandler;
}
```
The `if (!...)` guard means: on the FIRST init, the handler is stored. On the second init (e.g., navigate away to another project, then back), a NEW closure is created and `addEventListener`-attached, but the guard skips storing it. `destroy()` removes only the OLD handler — the NEW one stays listening, with a stale `currentProject` closure. After N navigations there are N-1 leaked listeners, each pointing at successively older state.
**Fix:**
```javascript
// Always overwrite — destroy() removes whatever the latest stored ref is
window.addEventListener('permissionsChanged', permissionChangeHandler);
window._projectDetailPermissionHandler = permissionChangeHandler;
```
Same fix needed for `_projectDetailAssignmentHandler` two blocks below.

### WR-02: recomputeParentDates uses stale local tasks[] for the just-saved task

**File:** `app/views/project-plan.js:1066-1067, 1081-1110`
**Issue:** After `setDoc(..., { merge: true })`, the local `tasks[]` array is unchanged until the next snapshot callback fires (the await resolves before Firestore round-trips the snapshot). `recomputeParentDates(parent_task_id)` is then called and reads `tasks.filter(t => t.parent_task_id === parentTaskId)` — but the freshly-saved task is either (a) absent from `tasks[]` if it's brand new, or (b) still showing the OLD parent_task_id if it was reparented.

For case (a): the new child is missed → the parent envelope is computed without it → if the new child's date range exceeds the existing envelope, the parent's stored dates are wrong until the next manual edit triggers another recompute.

For case (b): the moved task is double-counted (still counts in old parent's children) on the OLD parent recompute path (line 1066), causing the OLD parent's envelope to remain unchanged when it should shrink.

**Fix:** Either (1) re-fetch children via `getDocs(query(...))` inside `recomputeParentDates`, or (2) adjust `tasks[]` locally before calling recompute:
```javascript
// In saveTaskFromModal, after successful setDoc but before recomputeParentDates:
const localPatched = tasks.filter(t => t.task_id !== taskId).concat([{ id: taskId, ...docData }]);
// pass localPatched into recomputeParentDates instead of relying on module-state tasks[]
```
Option (1) is cleaner; trade an extra read for correctness.

### WR-03: ISO-string date comparison races user timezone for "today"

**File:** `app/views/project-detail.js:1335,1343,1347` and `app/views/project-plan.js:512-516,540-544`
**Issue:** `today = new Date().toISOString().slice(0, 10)` produces UTC-day. Task `start_date`/`end_date` are stored as YYYY-MM-DD strings (presumably local-day from the date picker). For users in PHT (UTC+8) between 00:00 and 08:00 local time, `new Date().toISOString().slice(0, 10)` returns YESTERDAY's date. A milestone with end_date = today LOCAL would be misclassified as "past".

The Gantt today-line uses `new Date()` (local) but compares to `gantt.gantt_start` which Frappe stores in local — that path is OK. The mismatch is only in the project-detail summary card and `computeProjectProgress`.
**Fix:**
```javascript
// Use local-day rather than UTC-day
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const today = todayLocal();
```

### WR-04: applyFsViolationStyles position-match heuristic mis-tags arrows

**File:** `app/views/project-plan.js:498-500`
**Issue:** The current heuristic — "mark all arrows red iff `arrows.length === violations.length`" — is acknowledged as pragmatic in the source comment. But it produces silently-wrong UI:
- Two violations + two non-violations among four arrows → length doesn't match → no arrows tagged → user gets the toast but no visual cue on which arrow is broken.
- One violation among one arrow → length matches → correctly tagged.
- Three violations among three arrows → length matches → correctly tagged.

The behavior is non-monotonic with the user's intuition. **Fix (preferred):** patch Frappe's render to add `data-from`/`data-to` data attributes on arrow paths (a one-line fork) and select arrows by id pair. **Fix (interim):** drop the `arrows.length === violations.length` guard and tag NO arrows — the toast is the only signal; this is at least consistent.

### WR-05: cycle reconstruction may produce duplicate first/last node in displayed path

**File:** `app/views/project-plan.js:976-1001`
**Issue:** When DFS detects a back-edge to GRAY ancestor `nb` from `node`, the reconstruction walks `parent[]` from `node` until `cur === nb`. The push sequence yields `[nb, node, ..., nb]` (after the loop terminates at `cur === nb`, which has been pushed). After `path.reverse()` the path is `[nb, ..., node, nb]`. The toast then concatenates with `' → '` plus appends `cycleNames[0]` separately:
```javascript
showToast(`This dependency would create a cycle: ${pathStr} → ${cycleNames[0]}. ...`)
```
Result for A→B→A: `"A → B → A → A. Remove one of the deps..."` — duplicate trailing A.
**Fix:** Either (a) deduplicate the path before joining: `path.filter((id, i) => i === 0 || id !== path[i-1])`, or (b) drop the explicit `→ ${cycleNames[0]}` suffix and let the path speak for itself:
```javascript
showToast(`This dependency would create a cycle: ${cycleNames.join(' → ')}. Remove one of the deps to continue.`, 'error');
```

### WR-06: refreshSummaryHighlights() reference is a no-op; comment misleads

**File:** `app/views/project-plan.js:112`
**Issue:** `if (typeof refreshSummaryHighlights === 'function') refreshSummaryHighlights();` — there is no such symbol declared anywhere in scope. The check is always false and the call never fires. The trailing comment `// Plan 05` makes it look like an intentional cross-plan integration point, but it's dead code.
**Fix:** Remove the line, or implement the function if the integration was actually intended (the project-detail.js Plan 05 summary card already self-listens via its own onSnapshot on project_tasks, so cross-view callbacks aren't needed).

### WR-07: Open Plan link uses escapeHTML where encodeURIComponent is required

**File:** `app/views/project-detail.js:384`
**Issue:** `<a href="#/projects/${escapeHTML(currentProject?.project_code || '')}/plan">` — escapeHTML is the wrong tool for URL fragments. A project_code containing `&` becomes `&amp;` in the href, which the browser then URL-decodes to `&amp;` (literal) — corrupting the route. URL fragments should use `encodeURIComponent`. Existing project code patterns (e.g., `CLMC-ACME-001`) don't trigger this today, but defensive encoding is cheap.
**Fix:**
```javascript
<a href="#/projects/${encodeURIComponent(currentProject?.project_code || '')}/plan" class="btn btn-primary">
```
Same pattern applies anywhere a Firestore-stored value is interpolated into an `href="#/..."`.

### WR-08: recomputeParentDates silently swallows permission errors

**File:** `app/views/project-plan.js:1106-1110`
**Issue:** If the recompute write hits `permission-denied` (e.g., ops_user assigned to a project but the rules layer rejects an updated_at-only mutation because hasOnly fails), the function logs `console.warn` and returns. The user receives no toast — the parent task's dates stay stale and the user has no way to know the recompute didn't run.
**Fix:**
```javascript
} catch (err) {
    console.warn('[ProjectPlan] recomputeParentDates: write failed for parent', parentTaskId, err?.code);
    if (err?.code === 'permission-denied') {
        showToast('Parent task dates could not be updated — your account may not have edit permission.', 'warning');
    }
}
```

### WR-09: confirmDeleteTask body double-encodes content via escapeHTML inside template

**File:** `app/views/project-plan.js:887-888,896`
**Issue:** `body` is constructed as a string containing already-escaped content:
```javascript
const body = hasChildren
    ? `Delete '${escapeHTML(t.name || taskId)}' and its ${totalSubtaskCount} subtask${totalSubtaskCount > 1 ? 's' : ''}? This cannot be undone.`
    : `Delete '${escapeHTML(t.name || taskId)}'? This cannot be undone.`;
```
Then `body` is interpolated into `mount.innerHTML` template — the escaped entities (`&#039;` for apostrophes) survive the second pass and render correctly as plain text. NOT a XSS bug, but the rendering is inconsistent with `title`/`confirmLabel` which are static strings — a maintenance trap. Also note `subtaskCount === 1 ? '' : 's'` is correct, but `totalSubtaskCount > 1 ? 's' : ''` would render "1 subtask" vs "0 subtasks" inconsistently if hasChildren is true with totalSubtaskCount === 1 (impossible here because hasChildren guards that path, but fragile).
**Fix:** Use `${count !== 1 ? 's' : ''}` for the plural and add a JSDoc reminder that `body` is HTML-trusted at the call site.

### WR-10: __snapshotCount toast suppression doesn't preserve toasts on re-mount

**File:** `app/views/project-plan.js:102,110`
**Issue:** `__snapshotCount` is declared as `let __snapshotCount = 0` inside `init()`. On a route nav-away/nav-back cycle, init() runs again with `__snapshotCount = 0` — so the next first snapshot once again skips the violation toast. That's the documented behavior. But `__lastViolationFingerprint` is a MODULE-level variable, reset only in `destroy()`. If `destroy()` doesn't run between init calls (router does call destroy on view change but not tab change), the suppression is asymmetric: count says "first paint, suppress" but fingerprint says "we've seen this before". Net effect on the happy path is benign but the dual-state makes future debugging harder.
**Fix:** Promote `__snapshotCount` to module scope alongside `__lastViolationFingerprint`, reset both in `destroy()`.

### WR-11: writeBatch in deleteTaskNow chunks at 450 but cascade collect uses unbounded recursion

**File:** `app/views/project-plan.js:911-934`
**Issue:** `collect()` is a recursive helper that `tasks.filter(...)` for each level. For deeply-nested trees (say 100+ levels), this is O(depth × n) and grows the call stack. JavaScript engines typically allow ~10K stack frames so this isn't a hang, but it's quadratic per level on the `tasks.filter` scan. A flat 1000-task project arranged as a single chain of parents would do 1M comparisons. Not a v1 blocker (out of perf scope), but the code complexity flags it as future tech debt.
**Fix:** Pre-build `childrenByParent` once at the top of `deleteTaskNow`:
```javascript
const childrenByParent = new Map();
tasks.forEach(t => {
    const k = t.parent_task_id || '__root__';
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k).push(t);
});
function collect(id) {
    (childrenByParent.get(id) || []).forEach(k => collect(k.task_id));
    allIds.push(id);
}
```

## Info

### IN-01: Frappe Gantt loaded from CDN without SRI

**File:** `index.html:15,22`
**Issue:** Both the CSS and UMD JS for `frappe-gantt@1.2.2` are loaded from `cdn.jsdelivr.net` with no `integrity=` SRI hash. The phase context notes this is intentional (matching prior Chart.js precedent), but it means a CDN compromise injects code into the SPA. The `.umd.js` bundle runs with full DOM access.
**Fix:** Add SRI hashes generated from the pinned 1.2.2 release:
```html
<link rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.css"
      integrity="sha384-..."
      crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.umd.js"
        integrity="sha384-..."
        crossorigin="anonymous"></script>
```

### IN-02: ensureTasksListener doesn't react to currentProject identity change

**File:** `app/views/project-detail.js:205-227`
**Issue:** `ensureTasksListener()` returns early if `currentTasksListenerUnsub` is already set. In the doc-ID-fallback re-bind path (line 137), `currentProject` is replaced with a different document (different `currentProject.id`). If the user navigates between two project codes that happen to resolve to different docs without `destroy()` firing — currently impossible due to router behavior, but defensive — the listener stays attached to the OLD project_id and the new project's tasks never appear.
**Fix:** Capture the project_id when subscribing and tear-down + re-subscribe if it changes:
```javascript
let currentTasksListenerProjectId = null;
function ensureTasksListener() {
    const newId = currentProject?.id || null;
    if (currentTasksListenerProjectId === newId && currentTasksListenerUnsub) return;
    if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch(e) {} }
    if (!newId) return;
    currentTasksListenerProjectId = newId;
    currentTasksListenerUnsub = onSnapshot(...);
}
```

### IN-03: runCodeIssuance backfill omits project_tasks collection

**File:** `app/views/project-detail.js:1139-1252`
**Issue:** The clientless-issuance backfill writes to `mrfs`, `prs`, `pos`, `transport_requests`, `rfps` but not `project_tasks`. Phase 86's clientless block (project-plan.js:84) prevents tasks from being created on a clientless project, so this is currently safe. But if that block is ever weakened (e.g., to allow drafting plans before clients are assigned), tasks created without project_code wouldn't be backfilled here, leaving them orphaned for ops_user filtering.
**Fix:** Add project_tasks to the count + backfill arrays defensively:
```javascript
const tasksSnap = await getDocs(query(collection(db, 'project_tasks'), where('project_id', '==', projectId)));
// ... in totalChildren and writes loop
tasksSnap.forEach(d => writes.push({ ref: doc(db, 'project_tasks', d.id), data: childUpdate }));
```

### IN-04: Module-level state `__ganttInitialScrollDone` and `__lastViolationFingerprint` use double-underscore prefix

**File:** `app/views/project-plan.js:274-275`
**Issue:** Naming convention `__name` traditionally signals "private/internal" in some ecosystems but is just convention in JS. Mixed with regular `let` variable names elsewhere, it adds noise without enforcement. Pre-existing pattern in this file (matches `__snapshotCount`), so consistency overrides — flag for future refactor only.
**Fix:** Optional. Convert to a single `state = {}` object if the file undergoes broader cleanup.

---

_Reviewed: 2026-05-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
