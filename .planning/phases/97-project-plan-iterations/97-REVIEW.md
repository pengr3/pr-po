---
phase: "97"
plan: all
status: findings
files_reviewed: 3
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
reviewed_at: "2026-06-02"
depth: standard
---

# Code Review — Phase 97: Project Plan Iterations

**Files reviewed:** `firestore.rules`, `app/views/project-plan.js`, `styles/views.css`

---

## Summary

No critical issues. Three warnings found — one visual display bug (double-escape), one crash path on missing `iter.tasks`, and one misleading error message on partial batch failure. XSS audit passed: all Firestore-sourced strings in innerHTML contexts go through `escapeHTML()`. Security rules are correct.

---

## Findings

### WR-01 — Double-escape in undo toast: visual display corruption

**Severity:** Warning
**File:** `app/views/project-plan.js`
**Lines:** ~3491 (restoreIteration call) and ~3504 (showUndoToast innerHTML)

`restoreIteration` passes a pre-escaped string to `showUndoToast`:
```js
showUndoToast(`Loaded "${escapeHTML(iter.label)}". Previous state auto-saved.`);
```
`showUndoToast` then escapes `msg` again before inserting into innerHTML:
```js
el.innerHTML = `<span>${escapeHTML(msg)}</span><button ...>Undo</button>`;
```
Result: labels containing HTML-special characters display double-encoded. `Design & Build` shows as `Design &amp; Build`.

**Fix:** Pass the raw label to `showUndoToast` and let the function escape once:
```js
showUndoToast(`Loaded "${iter.label}". Previous state auto-saved.`);
```

---

### WR-02 — computeDiff / restoreIteration crash if iter.tasks is undefined

**Severity:** Warning
**File:** `app/views/project-plan.js`
**Lines:** ~3554–3555 (computeDiff), ~3473 (restoreIteration)

`computeDiff` calls `snapTasks.map(...)` with no null guard. If an iteration document lacks a `tasks` array (corrupt doc, manual admin write, partial write failure), `toggleIterDiff` passes `iter.tasks` (undefined), throwing `TypeError: Cannot read properties of undefined (reading 'map')`.

Same risk in `restoreIteration`: `const toWrite = iter.tasks` followed by `toWrite.map(...)` throws if `iter.tasks` is missing.

**Fix — computeDiff:**
```js
function computeDiff(liveTasks, snapTasks) {
    const safeSnap = Array.isArray(snapTasks) ? snapTasks : [];
    // use safeSnap instead of snapTasks throughout
```

**Fix — restoreIteration:**
```js
const toWrite = Array.isArray(iter.tasks) ? iter.tasks : [];
```

---

### WR-03 — Non-atomic multi-batch restore: misleading error message on partial failure

**Severity:** Warning
**File:** `app/views/project-plan.js`
**Lines:** ~3479–3495

On a multi-batch restore, if the Nth batch fails after earlier batches committed, the catch block shows `'Restore failed. No changes made.'` — which is false. Some tasks were already deleted/written. `_autoSnapId` is also cleared in the catch path, making the undo mechanic unavailable even though the auto-snapshot doc exists in Firestore.

**Fix:** Preserve `_autoSnapId` on error and update the message to reflect partial state:
```js
} catch (e) {
    console.error('[Plan] restoreIteration error:', e);
    // Do NOT clear _autoSnapId — auto-snapshot may have been saved
    showToast('Restore failed. Plan may be partially updated — check history rail.', 'error');
    await loadIterations();
    renderIterRail();
}
```

---

## Verification Checks

**XSS:** All Firestore-sourced strings in innerHTML contexts use `escapeHTML()`. No surface introduced. ✓

**Firestore security rules:** `project_iterations` block correctly enforces read=isActiveUser, create=admin roles, update=false (write-once), delete=admin roles. ✓

**Chunked writeBatch:** OPS_PER_BATCH=450 correct in both restoreIteration and undoIterRestore. Chunk/commit loop logic is correct. ✓

**Window function lifecycle:** All Phase 97 window functions registered in `init()` and deleted in `destroy()`. ✓

**CSS:** No issues found in the 370-line Phase 97 CSS block. ✓
