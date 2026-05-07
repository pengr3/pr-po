---
phase: 86.5-gantt-ui-polish-3-header-drag-back-excel
verified: 2026-05-07T14:00:00Z
status: human_needed
score: 4/4 must-haves logically verified in code; 4/4 require browser UAT to confirm runtime behavior
re_verification:
  previous_status: none
  previous_score: n/a
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "SC-1 — Gantt header alignment flush"
    expected: "The Frappe Gantt SVG top edge sits flush with the task-grid-rail thead row (#, Name, Duration, Start, End, Predecessors, Resources). No 8px vertical gap. Holds at narrow / mid / wide panel widths and during divider drag."
    why_human: "Visual layout test — pixel-level header alignment cannot be confirmed without rendering the page in a browser."
  - test: "SC-2a — Bar drag rightward to empty space extends end_date"
    expected: "Hover a non-parent task bar, drag from the blue dot rightward, release on empty timeline. Bar grows by N days (rounded). No error toast. DevTools console clean. project_tasks.{taskId}.end_date in Firestore reflects the new date."
    why_human: "Live drag gesture + Firestore round-trip + onSnapshot re-render cannot be exercised without a running app."
  - test: "SC-2b — Bar drag leftward to empty space silently cancels"
    expected: "Drag from the blue dot leftward and release on empty space. No bar change, no toast, no Firestore write."
    why_human: "Negative-path drag verification requires browser interaction."
  - test: "SC-2c — Bar-to-bar drag still creates FS predecessor link"
    expected: "Drag from the blue dot of bar A onto bar B. A predecessor link (FS) is created on B; existing Phase 86.1 behavior preserved. Cycle detection still triggers if applicable."
    why_human: "Regression check on existing 86.1 behavior — requires live drag."
  - test: "SC-3 — Back button navigates to project detail"
    expected: "From #/projects/{code}/plan, click the ‹ Back link. Browser navigates to #/projects/detail/{code}, NOT to #/projects."
    why_human: "Navigation-to-route round-trip requires a browser; router resolution cannot be verified statically."
  - test: "SC-4 — Excel-style continuous task entry"
    expected: "Click empty .tg-empty-row name input, type 'Task A', press Enter. Row commits and a fresh empty input row is auto-focused (cursor blinks in it). Type 'Task B', press Enter — same behavior repeats. No mouse clicks needed between entries."
    why_human: "Async Firestore write + onSnapshot re-render + setTimeout focus handoff is a runtime behavior; cannot be confirmed without exercising the keypress."
---

# Phase 86.5: Gantt UI Polish 3 — Verification Report

**Phase Goal:** Close four UX gaps from Phase 86.4 continued use — Gantt header misalignment, silent bar-drop cancel, wrong back-button target, and missing Excel-style continuous task entry.

**Verified:** 2026-05-07
**Status:** human_needed (code logically delivers all 4 SC; browser UAT required to confirm runtime behavior)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (per SC item)

| # | Truth (SC) | Code Verdict | Browser Verdict |
|---|------------|--------------|-----------------|
| SC-1 | Gantt header SVG flush with task-grid thead at all panel widths | PASS (code) | NEEDS-BROWSER-UAT |
| SC-2 | Rightward bar-drop extends end_date; leftward cancels; bar-to-bar still links | PASS (code) | NEEDS-BROWSER-UAT |
| SC-3 | Back link href targets `#/projects/detail/{code}` | PASS (code) | NEEDS-BROWSER-UAT |
| SC-4 | Enter in new-task input commits + focuses fresh row | PASS (code) | NEEDS-BROWSER-UAT |

**Code-side score:** 4 / 4 truths verified.
**Final phase verdict awaits browser UAT** (see punch list below).

---

## Per-SC Detailed Findings

### SC-1: Gantt header alignment flush — PASS (code) / NEEDS-BROWSER-UAT

**Plan:** Two CSS edits in `styles/views.css` — remove `padding-top: 8px` from `.gantt-pane #ganttPane` and change `#ganttHeaderOverlay` `top: 8px` → `top: 0`.

**Evidence — both edits present:**

`styles/views.css:2604`
```css
.gantt-pane #ganttPane { padding: 0 8px 8px 8px; position: relative; }
```

`styles/views.css:2612-2616`
```css
#ganttHeaderOverlay {
    position: absolute;
    top: 0;
    left: 8px;                         /* aligns with #ganttPane padding-left */
    right: 8px;                        /* aligns with #ganttPane padding-right */
```

**Negative checks:** `grep -c "padding: 8px; position: relative" styles/views.css` = 0 (old rule removed). The pre-existing `top: 8px` on the overlay rule has been replaced with `top: 0`.

**Diff scope:** `git diff --stat 693936a^ 693936a` = `styles/views.css | 4 ++--` (1 file, 2 insertions, 2 deletions). Surgical change, no collateral edits.

**Reasoning:** With `padding-top: 0` on `#ganttPane` the Frappe SVG origin moves to y=0 inside the pane, matching the task-grid thead. The overlay (still produced by `renderCustomGanttHeader()`) is `position: absolute` with `top: 0`, so it pins to the SVG origin instead of floating 8px below it. The CSS contract that produced the previous misalignment has been removed.

**Why browser UAT still required:** Visual flush-alignment is the actual SC. CSS values can be correct but other rules (margin, border, transform on ancestor) could still introduce a vertical offset. Only a render check confirms the goal.

---

### SC-2: Unified bar drag — extend on rightward empty drop — PASS (code) / NEEDS-BROWSER-UAT

**Plan:** Replace the `if (!toWrapper) return; // dropped on empty space — cancel silently` line in `initGanttDragLink()`'s svg `mouseup` handler with a guarded block that (1) computes bar-right edge in SVG coords, (2) silently cancels for leftward drops, (3) computes `daysToAdd = Math.max(1, Math.round((svgPt2.x - barRightX) / xPerDay2))` for rightward drops, (4) writes `end_date` via `updateDoc(project_tasks, ...)` + `recomputeParentDates`. Bar-to-bar branch must remain untouched.

**Evidence — block implemented:**

`app/views/project-plan.js:1607-1635` (full block, inside `svg.addEventListener('mouseup', async (e) => { ... })`):
```js
if (!toWrapper) {
    // Dropped on empty space — if dragged rightward, extend task duration
    if (!gantt || typeof gantt.config !== 'object') return;
    const fromTask = tasks.find(x => x.task_id === fromTaskId);
    if (!fromTask || !fromTask.end_date) return;
    const fromWrapper2 = svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(fromTaskId)}"]`);
    const fromBar2 = fromWrapper2?.querySelector('.bar');
    if (!fromBar2) return;
    const barRect2 = fromBar2.getBBox();
    const barRightX = barRect2.x + barRect2.width;
    const pt2 = svg.createSVGPoint();
    pt2.x = e.clientX;
    pt2.y = e.clientY;
    const svgPt2 = pt2.matrixTransform(svg.getScreenCTM().inverse());
    if (svgPt2.x <= barRightX) return; // dragged leftward — cancel silently
    const xPerDay2 = (gantt.config.column_width || 45) / (gantt.config.step || 1);
    const daysToAdd = Math.max(1, Math.round((svgPt2.x - barRightX) / xPerDay2));
    const newEndDate = addDays(fromTask.end_date, daysToAdd);
    try {
        await updateDoc(doc(db, 'project_tasks', fromTaskId), { end_date: newEndDate, updated_at: serverTimestamp() });
        const idx2 = tasks.findIndex(x => x.task_id === fromTaskId);
        if (idx2 >= 0) tasks[idx2] = { ...tasks[idx2], end_date: newEndDate };
        if (fromTask.parent_task_id) await recomputeParentDates(fromTask.parent_task_id);
    } catch (err) {
        console.error('[ProjectPlan] bar extend failed:', err);
        showToast('Could not extend task duration.', 'error');
    }
    return;
}
```

**Bar-to-bar predecessor branch preserved:** `app/views/project-plan.js:1636-1665` continues with `const toTaskId = toWrapper.dataset.id;` … `dependencies: newDeps` … `applyFsAutoSchedule(toTaskId, fromTaskId)` — Phase 86.1 link logic untouched.

**Identifier scope verified:**
- `addDays` defined at `app/views/project-plan.js:975`
- `recomputeParentDates` defined at `app/views/project-plan.js:1800`
- `updateDoc`, `doc`, `db`, `serverTimestamp` imported at `app/views/project-plan.js:7`
- `showToast`, `escapeHTML` imported at `app/views/project-plan.js:8`
- `CSS`, `e`, `svg`, `tasks`, `fromTaskId`, `gantt` all in closure/module scope

**Negative checks:** `grep -c "dropped on empty space — cancel silently"` = 0 (old line removed). `grep -c "bar extend failed"` = 1. `grep -c "dragged leftward — cancel silently"` = 1.

**Diff scope:** `git diff --stat c877b66^ c877b66` = `app/views/project-plan.js | 30 +++++++++++++++++++++++++++++-` (1 file, 29 insertions, 1 deletion). Single file, single block.

**Reasoning:** Identifiers in scope, write path identical to existing resize-handle flow, leftward drops short-circuit at `svgPt2.x <= barRightX`, rightward drops compute pixel→day via `xPerDay2 = column_width/step` (zoom-mode aware), `Math.max(1, ...)` floors at 1 day so a near-zero rightward nudge still produces a meaningful write. Bar-to-bar branch (lines 1636+) is reached only when `toWrapper` is truthy, so the new block does not affect existing link creation.

**Deviation noted (planner arithmetic, not code defect):** Plan 03's `<acceptance_criteria>` claimed `grep -c "daysToAdd" == 1` and `grep -c "xPerDay2" == 1`. Each identifier is declared on one line and immediately consumed on the next, so literal `grep -c` returns 2 for each. Logical-presence intent is satisfied — code is correct.

**Why browser UAT still required:** The drag gesture, SVG coord math against live mouse position, Firestore write, onSnapshot re-render, and parent-rollup are all runtime behaviors; the only way to confirm the bar visibly grows by the expected number of days (and that bar-to-bar still links / leftward still cancels) is a browser session.

---

### SC-3: Back link to project detail — PASS (code) / NEEDS-BROWSER-UAT

**Plan:** Single-line href swap in `render()` of `app/views/project-plan.js` from `#/projects` to `#/projects/detail/${escapeHTML(projectCode || '')}`.

**Evidence:**

`app/views/project-plan.js:65`
```js
<a href="#/projects/detail/${escapeHTML(projectCode || '')}" class="plan-back-link">‹ Back</a>
```

**Negative check:** `grep -c 'href="#/projects" class="plan-back-link"'` = 0 (old href removed).

**Router supports the route:** `app/router.js:378`
```js
// Handle detail routes: #/projects/detail/CODE -> navigate to /project-detail with param
navigate('/project-detail', null, subpath);
```
And `app/router.js:69` registers `/project-detail` → `views/project-detail.js`.

**Scope of `projectCode`:** declared at `app/views/project-plan.js:13` (`let projectCode = null;`) and assigned at top of `render()` from the route param. `escapeHTML(projectCode || '')` guards against null on early-return paths.

**Reasoning:** href is a static string interpolated at render time. The router has a confirmed handler for the destination route. XSS-mitigated via `escapeHTML`. No runtime branching can prevent this from firing on click.

**Why browser UAT still required:** Confirms the actual click → navigation → project-detail render loop completes successfully (e.g., the project-detail view also has its own data-load that could fail).

---

### SC-4: Excel-style continuous task entry — PASS (code) / NEEDS-BROWSER-UAT

**Plan:** Module-scope `_focusNewRowAfterRender` flag set in `handleNewRowKeydown`'s Enter branch, read+reset in `renderTaskGrid` after `container.innerHTML = ...`, reset in `destroy()`.

**Evidence — all 4 logical sites present:**

`app/views/project-plan.js:34` — module-scope declaration:
```js
let _focusNewRowAfterRender = false; // Phase 86.5: Excel-style continuous entry
```

`app/views/project-plan.js:664-667` — flag set in keydown Enter branch (BEFORE async commit):
```js
if (event.key === 'Enter') {
    event.preventDefault();
    _focusNewRowAfterRender = true;  // Phase 86.5: Excel-style continuous entry
    handleNewRowCommit(input);
}
```

`app/views/project-plan.js:401-406` — post-innerHTML focus block (in non-empty-path):
```js
// Phase 86.5: Excel-style continuous entry — auto-focus new row after commit
if (_focusNewRowAfterRender) {
    _focusNewRowAfterRender = false;
    const newRowInput = container.querySelector('.tg-empty-row .tg-name-input');
    if (newRowInput) setTimeout(() => newRowInput.focus(), 0);
}
```

`app/views/project-plan.js:193` — destroy() reset:
```js
_focusNewRowAfterRender = false; // Phase 86.5
```

**Reasoning:** The flag is module-scope so it survives the async Firestore write + onSnapshot → renderTaskGrid round-trip. After the new innerHTML lays down a fresh `.tg-empty-row .tg-name-input`, the deferred `setTimeout(focus, 0)` fires once the layout settles. `destroy()` resets the flag on view unmount so a stale `true` cannot leak into a re-entry. `event.preventDefault()` still suppresses default Enter handling.

**Diff scope:** `git diff --stat 01ec8d2^ 01ec8d2` = `app/views/project-plan.js | 12 +++++++++++-` (1 file, 11 insertions, 1 deletion) — covers both SC-3 (1 line) and SC-4 (4 sites = 5 net lines + 1 modified).

**Deviations noted (planner arithmetic, not code defect):**
- Plan 02 said `grep -c "_focusNewRowAfterRender" == 4`; literal count is 5 because CHANGE 3 has the flag in the `if` predicate AND on the next line (`= false` reset).
- Plan 02 said `grep -c "_focusNewRowAfterRender = false" == 2`; literal count is 3 because the declaration `let _focusNewRowAfterRender = false` also matches.
The plan's parenthetical correctly enumerates 4 logical sites (declaration, keydown set, renderTaskGrid check+reset, destroy reset) — all 4 sites are present in code. Code is correct.

**Why browser UAT still required:** The whole point is the focus handoff — a hidden timing bug (e.g., onSnapshot debounce, Firestore latency, container.querySelector returning null because the empty-row HTML branch wasn't taken) can only be exposed by typing → Enter → typing again in a real browser.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `styles/views.css` (line ~2604) | `padding: 0 8px 8px 8px` on `.gantt-pane #ganttPane` | VERIFIED | Present at line 2604 |
| `styles/views.css` (line ~2614) | `top: 0` on `#ganttHeaderOverlay` | VERIFIED | Present at line 2614 |
| `app/views/project-plan.js` (line 65) | Back link href = `#/projects/detail/${escapeHTML(projectCode \|\| '')}` | VERIFIED | Present |
| `app/views/project-plan.js` (line 34) | `let _focusNewRowAfterRender = false;` declaration | VERIFIED | Present |
| `app/views/project-plan.js` (line 666) | Flag set to `true` in keydown Enter branch | VERIFIED | Present |
| `app/views/project-plan.js` (lines 402-406) | Post-innerHTML focus block reads + resets flag | VERIFIED | Present |
| `app/views/project-plan.js` (line 193) | Flag reset in `destroy()` | VERIFIED | Present |
| `app/views/project-plan.js` (lines 1607-1635) | `if (!toWrapper) { ... }` rightward-extend block | VERIFIED | 29-line block matches plan verbatim |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `.gantt-pane #ganttPane` (CSS) | Frappe SVG top edge | `padding: 0 ...` removes top offset | WIRED | CSS rule present, no override found |
| `#ganttHeaderOverlay` | SVG y=0 origin | `top: 0` matches removed padding-top | WIRED | Rule present at line 2614 |
| Back link href | router `/project-detail` | `#/projects/detail/CODE` -> `app/router.js:378` -> `navigate('/project-detail', null, subpath)` | WIRED | Confirmed in router.js |
| keydown Enter | `_focusNewRowAfterRender = true` | direct assignment before `handleNewRowCommit` | WIRED | Line 666 |
| `_focusNewRowAfterRender = true` | `.tg-empty-row .tg-name-input` focus | renderTaskGrid post-innerHTML check + setTimeout focus | WIRED | Lines 402-406 |
| `destroy()` | `_focusNewRowAfterRender = false` | reset on view unmount | WIRED | Line 193 |
| svg mouseup empty-space | `updateDoc(project_tasks).end_date` | `xPerDay2` -> `daysToAdd` -> `addDays` -> `updateDoc` | WIRED | Lines 1622-1626; `addDays` at line 975, `recomputeParentDates` at line 1800 |
| svg mouseup bar-to-bar | predecessor `dependencies` write | unchanged Phase 86.1 path | WIRED | Lines 1636-1665, untouched by this phase |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TODO/FIXME/PLACEHOLDER markers introduced. No `console.log`-only stubs. No empty handlers. |

The new code uses real Firestore writes, real DOM queries, and real SVG coord math. No stub patterns detected.

---

## Deviations from Plan

1. **Plan 02 — `_focusNewRowAfterRender` grep count off by 1 in acceptance criteria.** Planner expected 4 textual matches; literal `grep -c` returns 5. The plan's parenthetical enumerates 4 logical sites correctly; code matches plan's `<action>` byte-for-byte. **Documentation-only — no code defect.**
2. **Plan 02 — `_focusNewRowAfterRender = false` count off by 1.** Planner expected 2; literal count is 3 because the declaration `let _focusNewRowAfterRender = false` matches the same regex. **Documentation-only — no code defect.**
3. **Plan 03 — `daysToAdd` and `xPerDay2` grep counts off.** Planner expected 1 each; literal count is 2 each because each identifier is declared on one line and consumed on the next. **Documentation-only — no code defect.**

All three deviations are planner arithmetic errors. Code matches plan `<action>` blocks verbatim in all three cases.

---

## Behavioral Spot-Checks

SKIPPED — this is a static SPA with no build/test runner; no headless way to exercise drag gestures, navigation, or focus handoff without a browser. All behavioral verification is delegated to the browser UAT punch list below.

---

## Browser UAT Punch List (for the user)

Copy-paste this list while you UAT. Tick each as you go.

### Setup
- [ ] Start dev server: `python -m http.server 8000`
- [ ] Open `http://localhost:8000/#/projects` in the browser
- [ ] Open DevTools Console — leave it open to catch errors

### SC-1 — Header alignment
1. [ ] Navigate to a project plan view: click any project, then the plan link, OR go directly to `#/projects/{any-existing-code}/plan`
2. [ ] Confirm the Frappe Gantt header row (timeline dates) sits **flush** with the left-rail thead (#, Name, Duration, Start, End, Predecessors, Resources). No 8px gap above the SVG.
3. [ ] Drag the panel divider narrow → wide → mid; confirm the headers remain flush at every width.
4. [ ] Switch zoom Day → Week → Month using the zoom pills; confirm headers stay flush in every mode.

### SC-2 — Unified bar drag
5. [ ] Pick a non-parent task that has a visible bar in the Gantt.
6. [ ] Hover the bar — confirm the **blue dot** appears at its right edge.
7. [ ] Drag from the blue dot **rightward** and release on empty timeline space → bar **grows** by the expected number of days. **No** error toast. After a moment (onSnapshot re-render), End column in the left rail also reflects the new date.
8. [ ] Drag from the blue dot **leftward** and release on empty space → **nothing changes**. No toast, no Firestore write. (Open the Network tab if you want to confirm zero PATCH requests.)
9. [ ] Drag from the blue dot of bar A onto bar B → **FS predecessor link** is created (Predecessors column on B updates; the dependency arrow appears). Existing 86.1 behavior preserved.
10. [ ] Try the cycle case: link A → B, then drag B → A → confirm the cycle-rejection toast still fires.
11. [ ] Confirm DevTools console is clean — no `[ProjectPlan] bar extend failed` errors.

### SC-3 — Back button
12. [ ] On the plan view (`#/projects/{code}/plan`), click the **‹ Back** link.
13. [ ] Confirm the URL becomes `#/projects/detail/{code}` (NOT `#/projects`).
14. [ ] Confirm the project detail page renders correctly with the right project loaded.

### SC-4 — Excel-style continuous entry
15. [ ] Scroll to the bottom of the task grid; click the empty row's Name input.
16. [ ] Type a task name (e.g., `Task A`) and press **Enter**.
17. [ ] Confirm: row commits (Task A appears), AND the **fresh empty input row is auto-focused** (cursor blinks in it without any click).
18. [ ] Type `Task B` and press Enter — same behavior repeats. Both rows now exist and the cursor lands in the next empty row.
19. [ ] Press **Escape** in the empty input — the value clears, focus blurs (regression check on the cancel branch).

### Optional regression spot-checks
20. [ ] Re-open `#/projects/{code}/plan` — confirm the existing Phase 86.1 / 86.2 / 86.4 features still work (drag-to-link arrows, indent/outdent, duration recalc, scroll-sync between Gantt and grid).
21. [ ] Navigate away (Back, then back into plan) and repeat SC-4 step 17 — confirm the destroy() flag reset works (no stale focus weirdness).

If any step **fails**, capture: (1) which step, (2) what you saw vs expected, (3) any console errors, (4) screenshot of the Gantt + DevTools.

---

## Phase Verdict

**Code-side: PASS.** All four SC items are logically delivered by the committed code. The committed diffs are surgical (each commit touches only the planned file) and match the plan's `<action>` blocks verbatim. The three documented deviations are all plan-side `grep -c` arithmetic errors with zero functional impact.

**Final verdict: pending browser UAT.** Status is `human_needed` because (a) the SC items are inherently visual or runtime-behavior gated (header alignment, drag gesture, navigation, async focus handoff) and (b) this project has no automated test harness or headless runner. Run the punch list above to convert this to a final PASS.

---

*Verified: 2026-05-07*
*Verifier: Claude (gsd-verifier)*
