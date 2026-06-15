---
phase: 86.10-left-pane-polish-smart-indent-auto-group-shift-click-multi-s
reviewed: 2026-05-12T00:00:00Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - app/views/project-plan.js
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 86.10: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** deep
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `app/views/project-plan.js` (3,585 lines) focusing on the three feature areas shipped in Phase 86.10: smart-indent inheritance in `handleNewRowCommit`, shift+click multi-select with `_selectedRowIds`, and the copy/paste/group-operation cluster (`gridCopyRows`, `gridPasteRows`, `gridGroupIndent`, `gridGroupOutdent`, `gridGroupDelete`).

Two blockers found: `gridGroupIndent` can create a parent-child cycle in Firestore, and `gridGroupDelete` double-deletes Firestore documents when the selection contains a parent and one of its own descendants. Both corrupt the task tree in production.

---

## Critical Issues

### CR-01: `gridGroupIndent` skips cycle detection — can permanently corrupt tree

**File:** `app/views/project-plan.js:1644–1655`

**Issue:** The single-row `gridIndentTask` guards against cycles with `isDescendant(newParent.task_id, taskId)` (line 1347). `gridGroupIndent` performs the same reparenting loop but has **no cycle check at all**.

Concrete scenario: Select two tasks — call them C and D, both children of root task A. The root of the selection is C (its parent A is not in the selection). The anchor search walks backwards through `byOrder` (sorted by `row_order`). If a previously-indented descendant of C happens to have a lower `row_order` value than C itself (which is possible after any drag-reorder), that descendant is a valid anchor candidate that is not in `idSet`. The code would then write `parent_task_id = descendant_of_C` for C, creating a cycle. `isDescendant` is never called.

There is also a secondary mismatch: `topmostRootId` is identified via DFS `visualOrder` (line 1631) but the anchor search uses `byOrder` (raw `row_order` sort, line 1635). These two orderings diverge whenever a parent and its children don't occupy consecutive `row_order` values — which is normal after paste or drag-reorder. The `byOrder` index of `topmostRootId` may place it below visually earlier tasks, causing an unexpected anchor to be selected.

**Fix:**
```javascript
// After `const anchor = ...` is resolved, add before showLoading():
for (const id of rootIds) {
    if (isDescendant(anchor.task_id, id)) {
        showToast(`Can't indent — anchor is inside the selection's subtree.`, 'warning');
        return;
    }
}
```

For the visual-vs-row_order mismatch, derive `idx` from the same `visualOrder` array that identified `topmostRootId`, or replace the `byOrder` backward scan with a backward scan of `visualOrder` itself:

```javascript
// Replace the byOrder block entirely:
const idx = visualOrder.indexOf(topmostRootId);
if (idx <= 0) { showToast(`Can't indent — already at the top.`, 'warning'); return; }
let anchor = null;
for (let i = idx - 1; i >= 0; i--) {
    if (!idSet.has(visualOrder[i])) {
        anchor = tasks.find(x => x.task_id === visualOrder[i]);
        break;
    }
}
```

---

### CR-02: `gridGroupDelete` double-deletes when selection includes a parent and its descendant

**File:** `app/views/project-plan.js:1700–1708`

**Issue:** `deleteTaskNow` cascades: it deletes the entire subtree rooted at `taskId` in a single batch (lines 3307–3324), then calls `recomputeParentDates(t.parent_task_id, new Set(allIds))` with the `allIds` exclusion set (line 3331).

When `gridGroupDelete` iterates over `ids` and calls `await deleteTaskNow(id)` for each, the Firestore onSnapshot callback (which refreshes `tasks[]`) has **not yet fired** between calls. So `tasks[]` still contains children that were already batch-deleted by an earlier iteration. A subsequent `deleteTaskNow(childId)` therefore:

1. Finds the child in the stale `tasks[]` (line 3295 succeeds).
2. Rebuilds `childrenByParent` from the stale array.
3. Issues a second batch delete containing the already-deleted child (silent no-op in Firestore, but still a write).
4. Calls `recomputeParentDates(child.parent_task_id)` on stale data, potentially writing incorrect date envelopes to Firestore for the (also already-deleted) parent.

The symptom: after a group delete of a parent + some of its children, parent date fields may be rewritten with stale values at the moment the parent no longer exists — corrupting any surviving ancestor's computed dates.

**Fix:** Pre-expand the full set of IDs to delete (including all descendant cascades) before iterating, then skip any ID already covered:

```javascript
async function gridGroupDelete(taskIdsJson) {
    const ids = JSON.parse(taskIdsJson);
    if (!ids.length) return;

    // Expand each selected ID to its full subtree, dedup.
    const allToDelete = new Set();
    function collectSubtree(taskId) {
        allToDelete.add(taskId);
        tasks.filter(x => x.parent_task_id === taskId)
             .forEach(x => collectSubtree(x.task_id));
    }
    ids.forEach(collectSubtree);

    const confirmed = confirm(
        `Delete ${ids.length} selected task(s) and their subtasks (${allToDelete.size} total)?`
    );
    if (!confirmed) return;

    // Only call deleteTaskNow for IDs not already covered as a descendant.
    const idSet = new Set(ids);
    const topLevel = ids.filter(id => {
        const t = tasks.find(x => x.task_id === id);
        return !t?.parent_task_id || !idSet.has(t.parent_task_id);
    });
    for (const id of topLevel) {
        await deleteTaskNow(id);
    }
}
```

---

## Warnings

### WR-01: `JSON.parse` in group-operation entry points is unguarded — will throw on crafted input

**File:** `app/views/project-plan.js:1504, 1621, 1667, 1701`

**Issue:** Four functions that are exposed on `window` parse their first argument with `JSON.parse` without a try-catch:

```
gridCopyRows   — line 1504: const ids = typeof taskIds === 'string' ? JSON.parse(taskIds) : taskIds;
gridGroupIndent — line 1621: const ids = JSON.parse(taskIdsJson);
gridGroupOutdent — line 1667: const ids = JSON.parse(taskIdsJson);
gridGroupDelete  — line 1701: const ids = JSON.parse(taskIdsJson);
```

These functions are called from `onclick` attributes where the JSON is embedded as a literal string. Any encoding quirk in the `escapeHTML(JSON.stringify(...))` pipeline (e.g., a task ID that contains characters that HTML-decode to JSON-breaking characters) produces an unhandled exception that is invisible to the user and leaves the UI in a broken state with no feedback.

In addition, after `JSON.parse` succeeds there is no validation that the result is an array — if it is `null` or an object, the subsequent `.filter` / `for...of` will throw.

**Fix:** Wrap each entry point in a try-catch and validate the parsed value:

```javascript
async function gridGroupIndent(taskIdsJson) {
    let ids;
    try { ids = JSON.parse(taskIdsJson); } catch { return; }
    if (!Array.isArray(ids) || ids.length === 0) return;
    // ...rest of function
}
```

Apply the same pattern to `gridGroupOutdent`, `gridGroupDelete`, and the string-path branch of `gridCopyRows`.

---

### WR-02: `gridPasteRows` uses `hasInternalHierarchy` to preserve original `parent_task_id` from source, which can write a dangling foreign key

**File:** `app/views/project-plan.js:1547–1577`

**Issue:** When `hasInternalHierarchy` is true, root clipboard items (those whose original parent is NOT in the clipboard) receive `newParentId = item.parent_task_id ?? null` (line 1577). This is the **original** task ID of the source parent from the time of the Copy operation.

If the source parent has since been deleted (or if the user pastes into a session after a page reload where the parent is gone), the new Firestore document gets `parent_task_id` set to a task ID that no longer exists. The tree renderer (`flattenTreeDepthFirst`) will silently orphan the task because it won't appear under `__root__` and won't appear under a valid parent — the task disappears from the grid and Gantt until the user manually repairs it.

This is a latent data-integrity issue every time the clipboard survives a delete operation (clipboard is only cleared on `destroy()`, not on task deletion).

**Fix:** At paste time, validate that each `item.parent_task_id` referred to by a root clipboard item still exists in `tasks[]`. If it does not, fall back to `pasteParentId` regardless of `hasInternalHierarchy`:

```javascript
const newParentId = (item.parent_task_id && origIdSet.has(item.parent_task_id))
    ? oldToNew[item.parent_task_id]
    : (hasInternalHierarchy
        ? (item.parent_task_id && tasks.some(x => x.task_id === item.parent_task_id)
            ? item.parent_task_id
            : pasteParentId)
        : pasteParentId);
```

---

## Info

### IN-01: Clipboard is not cleared when copied tasks are deleted

**File:** `app/views/project-plan.js:92, 486`

**Issue:** `_clipboardTasks` is populated by `gridCopyRows` and cleared only in `destroy()` (line 486). If the user copies tasks, deletes them (via `gridDeleteRow`, `gridGroupDelete`, or cascade delete), and then pastes, the clipboard entries reference task IDs that no longer exist in Firestore. `gridPasteRows` uses `item.parent_task_id` (the original source parent) and `item._orig_id` to allocate new IDs — these are disconnected from Firestore, so the paste itself succeeds. However, the `hasInternalHierarchy` path (WR-02 above) is exacerbated: a stale clipboard with a deleted original parent produces dangling `parent_task_id` values.

**Fix:** Either clear `_clipboardTasks = []` in `deleteTaskNow` when any deleted ID is found in the clipboard, or document the known limitation as user-facing guidance. The former is safer:

```javascript
// Inside deleteTaskNow, after allIds is built:
if (_clipboardTasks.some(c => allIds.includes(c._orig_id))) {
    _clipboardTasks = [];
}
```

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
