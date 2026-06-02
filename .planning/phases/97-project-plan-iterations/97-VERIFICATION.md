---
phase: 97-project-plan-iterations
verified: 2026-06-02T00:00:00Z
status: human_needed
score: 22/23 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Save a named iteration snapshot"
    expected: "Prompt appears with default label 'Iteration 1'; after confirming, toast shows 'Iteration \"[name]\" saved.' and right rail shows the new card"
    why_human: "Requires live Firebase write to project_iterations; cannot verify Firestore write or toast render without browser"
  - test: "Browse iteration history in the right rail"
    expected: "Clicking 'History' toolbar button slides the 260px right rail open, showing timeline cards with label, date, task count, Diff and Load buttons; clicking History again closes it"
    why_human: "CSS transition (width 0.25s) and DOM toggle require browser; animation is not grep-verifiable"
  - test: "Restore an iteration with auto-snapshot + undo"
    expected: "Clicking 'Load ->' opens a confirm modal with the iteration label and the auto-save safety note; confirming triggers restore, auto-snapshot appears in rail, undo toast appears at bottom center with 5-second timer; clicking Undo reverts tasks, removes auto-snapshot, dismisses toast"
    why_human: "End-to-end Firestore batch-write (delete all project_tasks + write iteration tasks) requires live data and browser to observe"
  - test: "Inline diff view"
    expected: "Clicking 'Diff' on a rail card shows the diff panel at the bottom of the plan view (not clipped); amber rows for changed tasks, green for added, red for removed, grey for same; changed tasks show strikethrough old value + green new value for name/start/end; clicking 'Load this ->' opens the correct iteration's confirm modal"
    why_human: "Diff panel rendering and color-coding requires browser; window._activeDiffIterationId → openIterConfirm wiring requires live interaction"
  - test: "Navigate away mid-toast"
    expected: "No console errors; undo toast dismissed, #iterUndoToast removed from DOM, window functions deleted, _activeDiffIterationId cleared"
    why_human: "SPA routing lifecycle (destroy()) requires browser navigation to verify"
---

# Phase 97: Project Plan Iterations Verification Report

**Phase Goal:** Implement project plan iteration history — save named snapshots of a plan, browse them in a right-rail timeline, restore any iteration (with auto-snapshot + 5s undo), and view inline diffs before restoring.
**Verified:** 2026-06-02
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Active users can read project_iterations documents | VERIFIED | `firestore.rules` line 260: `allow read: if isActiveUser();` inside `match /project_iterations/{iterationId}` at top-level scope |
| 2 | Only super_admin and operations_admin can create or delete project_iterations documents | VERIFIED | `firestore.rules` lines 261, 263: `allow create: if hasRole(['super_admin', 'operations_admin']);` and `allow delete: if hasRole(['super_admin', 'operations_admin']);` |
| 3 | No role can update a project_iterations document (iterations are write-once) | VERIFIED | `firestore.rules` line 262: `allow update: if false;` |
| 4 | Module-scope state variables for iteration history are declared at top of project-plan.js | VERIFIED | Lines 112–128: `_iterations`, `_autoSnapId`, `_undoToastTimer`, `_activeDiffIterationId`, `_iterRailOpen`, `_iterSeq` + 8 handler refs |
| 5 | render() output wraps plan-split-pane and iter-rail in a .plan-body-row flex row | VERIFIED | Lines 182–203: `<div class="plan-body-row" id="planBodyRow">` contains planSplitPane and iterRail as siblings |
| 6 | render() output includes the iter-diff-panel as a direct child of plan-view-surface, after plan-body-row | VERIFIED | Lines 204–226: `<div class="iter-diff-panel" id="iterDiffPanel" hidden>` is a sibling of plan-body-row, not nested inside plan-split-pane |
| 7 | Two new toolbar buttons (Save Iteration, History) appear between baselineToggleBtn and the search input | VERIFIED | Lines 164–172: both buttons inserted after baselineToggleBtn, before `.plan-toolbar-search` div |
| 8 | All iter-rail-* and iter-diff-* CSS classes are defined in views.css | VERIFIED | Lines 2354–2720: full Phase 97 CSS block with all 57+ selectors confirmed by grep |
| 9 | iter-undo-toast CSS is defined in views.css | VERIFIED | Line 2685: `.iter-undo-toast {` with fixed positioning, z-index:9999 |
| 10 | loadIterations() fetches project_iterations for the current project, sorts newest-first, stores in _iterations | VERIFIED | Lines 3272–3293: getDocs query with `where('project_id', '==', currentProject.id)`, client-side sort by `saved_at?.toMillis()` descending |
| 11 | saveIteration() prompts for a label, writes a full task snapshot to project_iterations, refreshes the rail | VERIFIED | Lines 3295–3338: `window.prompt()`, 60-char truncation, tasks.map() with resolved Timestamps (no serverTimestamp() inside array), addDoc with `saved_at: serverTimestamp()` on doc, then loadIterations()+renderIterRail() |
| 12 | renderIterRail() renders timeline cards from _iterations into #iterRailTimeline with Diff and Load buttons | VERIFIED | Lines 3345–3378: escapeHTML(iter.label), `.iter-auto-tag` span for auto-snapshots, diff-btn with active state class, load-btn |
| 13 | toggleIterRail() shows/hides #iterRail and updates #iterHistoryBtn.active state | VERIFIED | Lines 3380–3393: toggles `hidden` attribute, syncs `.active` class on btn, updates `_iterRailOpen` |
| 14 | closeIterRail() hides the rail and removes the active state from the toolbar button | VERIFIED | Lines 3395–3401: sets `hidden` attribute, clears `.active` class |
| 15 | promptSaveIteration() is defined as alias/entry point for saveIteration() | PARTIAL | Lines 3340–3342: function exists but is dead code — never registered on window, not called from any button. All buttons use `window.saveIteration()` directly. Function satisfies the "defined" requirement but is not wired as an entry point. |
| 16 | All 8 new window functions are registered in init() and deleted in destroy() | VERIFIED | Lines 339–346 (init): all 8 registered. Lines 601–608 (destroy): all 8 deleted. |
| 17 | loadIterations() is called from init() after loadBaselines() | VERIFIED | Line 351: `await loadIterations()` after `updateBaselineToolbarUI()` which follows loadBaselines() |
| 18 | openIterConfirm() shows a custom confirm modal with auto-save safety note before proceeding | VERIFIED | Lines 3405–3426: custom modal with `escapeHTML(iter.label)` and "Your current plan will be auto-saved first so you can undo within 5 seconds." |
| 19 | restoreIteration() auto-snapshots current state, uses chunked writeBatch (450 ops) to restore original doc IDs | VERIFIED | Lines 3433–3497: auto-snapshot with `auto:true`, `_autoSnapId=autoRef.id`, `OPS_PER_BATCH=450`, `doc(db,'project_tasks',t.id)` for set ops |
| 20 | showUndoToast()/dismissUndoToast() implement 5-second undo toast appended to document.body | VERIFIED | Lines 3499–3514: dedicated `#iterUndoToast` element, 5000ms setTimeout |
| 21 | undoIterRestore() rolls back to auto-snapshot, deletes auto-snapshot doc, dismisses toast | VERIFIED | Lines 3517–3547: chunked batch restore from autoSnap, `deleteDoc(doc(db,'project_iterations',_autoSnapId))`, `_autoSnapId=null`, dismissUndoToast() |
| 22 | computeDiff() compares live tasks[] to snapshot by task id, returning status for every task id in either set | VERIFIED | Lines 3554–3569: allIds union via Set, added/removed/changed/same classification, DIFF_FIELDS array normalization |
| 23 | toggleIterDiff()/closeIterDiff() manage diff panel and window._activeDiffIterationId for Load this button | VERIFIED | Lines 3618–3637: toggleIterDiff sets `window._activeDiffIterationId=iterationId` (critical for inline onclick); closeIterDiff clears to null and sets panel hidden |

**Score:** 22/23 truths verified (1 partial — promptSaveIteration dead code, does not block goal)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `firestore.rules` | Security rules for project_iterations top-level collection | VERIFIED | Lines 259–264: correct top-level match block with all 4 allow directives |
| `app/views/project-plan.js` | State variables + HTML shell + all iteration functions | VERIFIED | 14 state vars (lines 112–128), HTML shell (lines 164–226), loadIterations through closeIterDiff (lines 3270–3637) |
| `styles/views.css` | All visual styling for right rail, diff panel, undo toast, and toolbar buttons | VERIFIED | Lines 2354–2720: 57+ selectors covering all required CSS classes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `project-plan.js` → `project_iterations` | Firestore Security Rules enforcement | `match /project_iterations/{iterationId}` | VERIFIED | Rules block confirmed at top-level scope, not nested inside projects |
| `loadIterations()` | project_iterations Firestore | `getDocs(query(collection(db, 'project_iterations'), where('project_id', '==', currentProject.id)))` | VERIFIED | Line 3276–3279 |
| `saveIteration()` | project_iterations addDoc | `addDoc(collection(db, 'project_iterations'), ...)` | VERIFIED | Lines 3324–3330 |
| `restoreIteration()` | project_iterations auto-snapshot | `_autoSnapId = autoRef.id` | VERIFIED | Line 3466 |
| `restoreIteration()` | project_tasks batch delete + set | `OPS_PER_BATCH=450`, `doc(db,'project_tasks',t.id)` | VERIFIED | Lines 3474–3484 |
| `showUndoToast()` | document.body | `el.id='iterUndoToast'; document.body.appendChild(el)` | VERIFIED | Lines 3502–3505 |
| `undoIterRestore()` | deleteDoc project_iterations | `deleteDoc(doc(db,'project_iterations',_autoSnapId))` | VERIFIED | Line 3539 |
| `toggleIterDiff()` | `window._activeDiffIterationId` | `window._activeDiffIterationId = iterationId` | VERIFIED | Line 3626 |
| `renderDiffPanel()` | `#iterDiffBody` tbody | `tbody.innerHTML = ...` with `iter-diff-row-changed` etc | VERIFIED | Lines 3591–3613 |
| `iter-diff-load-btn onclick` | `window.openIterConfirm(window._activeDiffIterationId)` | inline onclick reads window global at click time | VERIFIED | Line 209 in render() |
| `render() HTML` | `styles/views.css` | `.iter-rail`, `.iter-diff-panel`, `.plan-body-row` | VERIFIED | All CSS classes confirmed present in views.css |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderIterRail()` | `_iterations` | `loadIterations()` → `getDocs(project_iterations)` | Yes — live Firestore query with project_id filter | FLOWING |
| `renderDiffPanel()` | `diffRows` | `computeDiff(tasks, iter.tasks)` — tasks from live onSnapshot, iter.tasks from `_iterations[]` | Yes — in-memory tasks already populated by existing onSnapshot listener | FLOWING |
| `saveIteration()` | `tasks.map(...)` | `tasks[]` populated by project_tasks onSnapshot | Yes — tasks[] is live Firestore data, not static | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — this is a browser-only SPA with no runnable entry points outside a browser context. All key behaviors require a Firebase connection and DOM rendering.

### Probe Execution

Step 7c: No probe scripts declared in any PLAN.md or found in scripts/*/tests/probe-*.sh for this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| Spike-015c | 97-01, 97-04 | Auto-snapshot safety net before restore + 5-second undo toast | SATISFIED | `restoreIteration()` creates auto-snapshot before batch-write; `showUndoToast()` with 5000ms timer; `undoIterRestore()` rolls back |
| Spike-016 | 97-02, 97-03 | Full task-doc snapshot scope (all 19 fields) | SATISFIED | `saveIteration()` maps all 19 task fields including resolved Timestamps (not serverTimestamp()); same in `restoreIteration()` auto-snapshot |
| Spike-017B | 97-02, 97-03 | Right-rail history panel (260px, timeline cards) | SATISFIED | HTML shell in render() with `.iter-rail`, CSS `.iter-rail:not([hidden]) { width: 260px }`, renderIterRail() fills timeline |
| Spike-018 | 97-05 | Inline diff view — color-coded add/remove/change per task | SATISFIED | `computeDiff()`, `renderDiffPanel()` with `iter-diff-row-changed`, `iter-diff-row-added`, `iter-diff-row-removed`, `iter-diff-row-same`; `iter-diff-old`/`iter-diff-new` inline spans |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/project-plan.js` | 3491 + 3504 | Double-escape: `showUndoToast(escapeHTML(...))` then `escapeHTML(msg)` inside toast | Warning | Visual display corruption for labels containing `&`, `<`, `>` — `Design & Build` shows as `Design &amp; Build`. Functionality not affected. |
| `app/views/project-plan.js` | 3554–3555 | `snapTasks.map(...)` and `iter.tasks` used without null guard | Warning | If a `project_iterations` doc is corrupt (missing `tasks` field), `toggleIterDiff` throws `TypeError: Cannot read properties of undefined (reading 'map')`. `restoreIteration` also crashes. Low probability but crashes instead of graceful no-op. |
| `app/views/project-plan.js` | 3479–3495 | Multi-batch catch block says "No changes made" after potentially partial write | Warning | If Nth batch fails after earlier batches committed, the error message is misleading and `_autoSnapId` is cleared — preventing undo of a partially-completed restore. Identified in code review (WR-03). |
| `app/views/project-plan.js` | 3341 | `promptSaveIteration()` defined but dead — never registered on window, no caller | Info | The function exists but is never invoked. All buttons use `window.saveIteration()` directly. Dead code, not a stub — functionality works via the direct reference. |

No `TBD`, `FIXME`, or `XXX` markers found in modified files.

### Human Verification Required

#### 1. Save a Named Iteration Snapshot

**Test:** Open a project plan view with at least one task, click "Save Iteration" in the toolbar
**Expected:** Prompt appears with default label "Iteration 1"; enter a name and confirm; toast shows 'Iteration "[name]" saved.'; History button badge increments; right rail shows the new timeline card with label, date, task count
**Why human:** Requires live Firebase write to project_iterations; toast render and badge update require browser DOM

#### 2. Browse Iteration History Right Rail

**Test:** Click the "History" toolbar button; then click it again
**Expected:** First click: 260px right rail slides open (smooth animation), "History" button gains active blue styling, timeline shows saved iterations; second click: rail closes, button loses active state
**Why human:** CSS transition animation and DOM visibility require browser observation; active class requires visual verification

#### 3. Restore an Iteration — Full Lifecycle

**Test:** With at least two iterations saved, click "Load ->" on a rail card
**Expected:** (a) Custom modal appears with iteration label and "Your current plan will be auto-saved first so you can undo within 5 seconds."; (b) clicking "Load" triggers restore; (c) auto-snapshot card (tagged "auto") appears in the rail; (d) undo toast appears at bottom-center with "Undo" button; (e) task grid and Gantt reflect the restored tasks; (f) clicking "Undo" within 5 seconds: tasks revert, auto-snapshot removed from rail, toast dismissed; (g) waiting 5 seconds: toast auto-dismisses, undo no longer available
**Why human:** End-to-end Firestore batch-write and live data observation requires browser + real Firebase

#### 4. Inline Diff View

**Test:** With at least two iterations, click "Diff" (symbol character) on a rail card
**Expected:** (a) Diff panel opens at the bottom of the plan (not clipped under the Gantt overflow); (b) header shows "Comparing with [label]" and "N changed · M added · K removed" summary; (c) rows are amber/green/red/grey based on status; (d) changed tasks show strikethrough old value + green new value inline for name/start/end fields; (e) clicking "Diff" again on same card closes panel; (f) clicking "Load this ->" in diff panel opens the correct iteration's confirm modal
**Why human:** Diff panel visibility (outside overflow:hidden), color rendering, and button wiring require browser

#### 5. Navigation Cleanup (destroy())

**Test:** Open a project plan with history rail open and a diff panel visible, then navigate to a different page
**Expected:** No console errors; #iterRail hidden, #iterDiffPanel hidden, #iterUndoToast removed from DOM, #iterConfirmModal removed, window.saveIteration et al. are undefined
**Why human:** SPA routing lifecycle requires browser-level navigation to trigger destroy()

### Gaps Summary

No blocking gaps. All 22/23 must-have truths verified in code. The 23rd (promptSaveIteration as active entry point) is functionally satisfied by `window.saveIteration` — the alias exists but is dead code, which does not affect user-observable behavior.

Three warnings from the code review (WR-01 through WR-03) are known issues that do not block the phase goal but should be addressed in a follow-up. None involves missing functionality — they are correctness/robustness issues in edge cases.

Five human verification items remain before the phase can be marked fully passed. These require browser + Firebase to exercise the full interactive flow.

---

_Verified: 2026-06-02_
_Verifier: Claude (gsd-verifier)_
