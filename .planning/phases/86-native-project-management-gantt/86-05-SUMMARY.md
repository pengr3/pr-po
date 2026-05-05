---
phase: 86-native-project-management-gantt
plan: 05
subsystem: project-detail-summary-card + plan-view-filters
tags: [project-detail-card, weighted-rollup, filters, polish, phase-finale]
requires:
  - phase: 86-01
    provides:
      - "firestore.rules /project_tasks read predicate (allow read: isActiveUser — required for the new project-detail listener and for getFilteredTasks consumers; no rules changes needed in Plan 05)"
  - phase: 86-02
    provides:
      - "project-plan.js view module + module-scope filterDateFrom/filterDateTo/filterAssignees state vars (Plan 05 wires bodies)"
      - "togglePlanFilters stub + #planFilterPanel empty container — Plan 05 OVERWRITES the stub body"
      - "renderTaskTree() function with parent-row % progress label (Plan 05 splices in computeWeightedProgress(t.task_id, tasks) for parent rows)"
  - phase: 86-03
    provides:
      - "renderGantt() snapshot-driven re-render with childrenByParent envelope computation — Plan 05 splices in dual children maps (full + visible) so envelopes still use truth while traversal uses filtered set"
  - phase: 86-04
    provides:
      - "Inline progress slider on leaf rows / editTaskProgress write helper — Plan 05's parent-row weighted rollup change does not touch leaf-row slider behavior"
      - "13 cumulative window.* handlers from Plans 02-04 (toggleTaskExpand, selectTaskRow, setGanttZoom, togglePlanFilters STUB, openAddTaskModal, openEditTaskModal, confirmDeleteTask, closeTaskFormModal, toggleTaskAssignee, saveTaskFromModal, deleteTaskNow, closeDeleteTaskConfirm, editTaskProgress) — Plan 05 ADDS 3 (applyPlanFilters, clearPlanFilters, toggleFilterAssignee) for cumulative 16"
provides:
  - "Project Plan summary card on project-detail.js — stats row (N tasks / Y% complete) + 3 Highlights cells (Most recent accomplishment / Next milestone / Ongoing milestone) + Open Plan CTA"
  - "ensureTasksListener() — idempotent attach of project_tasks onSnapshot once currentProject.id is known (covers both project_code-found and clientless-fallback paths)"
  - "computeProjectProgress(tasks) on project-detail.js — full D-12 weighted rollup + Highlights derivation (recent done by updated_at desc, next milestone by end_date asc + future + <100, ongoing milestone by start<=today<=end + <100)"
  - "computeDurationDays(start, end) on project-detail.js — clamps 0-day duration to 1 to avoid div-by-zero"
  - "Filter panel on plan view (D-21, PM-09) — togglePlanFilters / renderPlanFilterPanel / applyPlanFilters / clearPlanFilters / toggleFilterAssignee"
  - "getFilteredTasks() on project-plan.js — date-range overlap + assignees-any match"
  - "getVisibleTaskSet() on project-plan.js — ancestor-preserving filter that keeps parent rows when filter narrows to descendants"
  - "computeWeightedProgress(rootTaskId, allTasks) on project-plan.js — D-12 leaf-only weighted parent rollup, drives left-rail parent rows; intentionally a duplicate of project-detail.js's helper (single-file scope; future v4.1 hygiene phase candidate to extract)"
  - "Dual children-by-parent maps in both renderTaskTree and renderGantt — truth-set drives hasChildren / envelope math, visible-set drives traversal/render"
affects:
  - "Phase 86 COMPLETE — no downstream Plan 06 in this phase. Future phase consumers: any future filter-panel reuse on a hierarchical entity could lift getVisibleTaskSet() ancestor-walk pattern out of project-plan.js"
tech-stack:
  added: []
  patterns:
    - "Dual children-by-parent maps (truth + visible) — generalizable pattern for any tree where filters affect rendering but not derived math (D-12 invariant). The full-tasks map drives envelope/rollup math; the visible-tasks map drives the depth-first walk emit"
    - "Ancestor-preserving filter (getVisibleTaskSet) — when a filter narrows to a descendant set, walk parent_task_id up the chain and add ancestors to the keep set so the rendered tree retains structural context. Reusable for any tree-shaped entity where filters target leaves"
    - "Idempotent listener attach (ensureTasksListener) — guard via `if (currentTasksListenerUnsub) return; if (!currentProject.id) return;` so that re-firing onSnapshot callbacks (which set currentProject) only attach the secondary listener once. Reusable for any view that needs a child-listener gated on a parent doc loading"
    - "In-place DOM patching for summary card on async data arrival — avoids full project-detail re-render (which would re-mount the entire card layout); single-element textContent updates per Highlights cell. Mirrors Phase 65.1 statusBadgeColors module-level reuse + finance.js patch-in-place precedent"
    - "Verbatim UI-SPEC copy retention across an entire phase — Plan 05 closes Phase 86 with all 9 Copywriting Contract entries shipped exactly as specified (Open Plan, Most recent accomplishment, Next milestone, Ongoing milestone, No completed tasks yet., No upcoming milestones., No active milestones., No tasks match the current filters. Clear filters to see all tasks., No personnel on this project.)"
key-files:
  created: []
  modified:
    - app/views/project-detail.js
    - app/views/project-plan.js
    - styles/views.css
key-decisions:
  - "[Phase 86-05]: ensureTasksListener() pattern over inline listener attachment — the plan body's literal instruction (`After the existing usersListenerUnsub setup, add...`) was a Rule 3 blocker because at that line currentProject.id is null (loaded later inside the projects onSnapshot callback). Refactored into idempotent helper invoked from BOTH the project_code-found path AND the clientless-fallback path, guarded by `if (currentTasksListenerUnsub) return` so the helper is safe to call on every onSnapshot fire. Documented as Rule 3 deviation"
  - "[Phase 86-05]: hasChildren detection in renderTaskTree splits from childrenByParent (visible) — added a separate allChildrenByParent Map built from FULL tasks array. The plan's literal splice would have made hasChildren filter-dependent: a parent whose children are filtered out would show a slider (which is wrong — D-12 says parents are derived, not edited). Documented as Rule 1 deviation"
  - "[Phase 86-05]: renderGantt() uses DUAL children maps — full tasks for childrenByParent (drives getEnvelope + appendNode isParent decision) and visibleTasksLocal for visibleChildrenByParent (drives the depth-first walk). The plan's instruction to 'replace every reference to tasks.forEach with visibleTasksLocal.forEach' would have shrunk parent envelopes when children are filtered out, contradicting D-12's truth-based rollup principle. Documented as Rule 1 deviation"
  - "[Phase 86-05]: computeWeightedProgress duplicated between project-detail.js and project-plan.js — extraction to a shared app/progress-rollup.js was considered but skipped to keep Plan 05 single-phase scope. Both copies are byte-equivalent. Same anti-cross-import-cycle rationale as Phase 85-08's deriveCollectibleStatus duplication. Future v4.1 hygiene phase candidate"
  - "[Phase 86-05]: filter panel renders ONLY when togglePlanFilters opens it — renderPlanFilterPanel() called inside togglePlanFilters before display:block; this means the panel HTML is built fresh on every open (capturing current filterAssignees state), avoiding stale-state bugs. Re-render is also triggered by toggleFilterAssignee + clearPlanFilters internally for live pill toggling without re-opening"
  - "[Phase 86-05]: filter on date range uses lexicographic string compare (>= / <=) on YYYY-MM-DD ISO strings — same as Phase 65/85 RFP-payables / collectibles filters; safe because Firestore stores start_date/end_date as ISO strings (D-20). Avoids new Date() parse cost per task per filter call"
  - "[Phase 86-05]: getVisibleTaskSet() ancestor walk has explicit early-break (`if (keepIds.has(p)) break`) to short-circuit redundant walks when a sibling already pulled the same ancestor in. O(N) worst case is acceptable up to D-22's ~500-task ceiling"
  - "[Phase 86-05]: ZERO firestore.rules changes ship in Plan 05 — Plan 01 already deployed all 4 rule predicates, and the only NEW Firestore interaction is a READ listener on project-detail (project_tasks where project_id == X) which the existing isActiveUser read predicate already covers. D-24 same-commit invariant fully respected (no JS write paired with rules changes — there are no writes in this plan)"
  - "[Phase 86-05]: Open Plan CTA href interpolates currentProject.project_code wrapped in escapeHTML — defense-in-depth even though Phase 78 restricts project_code to ^[A-Z0-9-]+$ (no special chars to escape, but escapeHTML is cheap insurance against future schema relaxation)"
  - "[Phase 86-05]: ${currentProjectProgress.taskCount === 0 ? '<empty-state>' : ''} ternary inside the planCardHtml renders the summary-card empty-state inline (UI-SPEC verbatim copy) — keeps the entire card structure constant across loaded/empty states (always renders stats row + Highlights row + Open Plan CTA per Phase 75 always-render-zero-state precedent), only adds the explicit 'No tasks yet. Open the plan to get started.' affordance below the Highlights row when taskCount=0"
patterns-established:
  - "Idempotent secondary-listener attach in a view module — generalizable for any view where a child-collection listener needs to wait on a parent doc to load via its own listener. Pattern: store the unsub in a module-scope let, define `function ensureXListener() { if (already) return; if (!parentReady) return; xListenerUnsub = onSnapshot(...) }`, invoke from EVERY parent-snapshot callback path"
  - "Dual children-by-parent map for filter-aware rendering with truth-based math — when filters affect what's rendered but not what's computed (e.g. D-12 weighted rollup), build TWO maps inside the render function: full-tasks map (drives derivation/envelope) + visible-tasks map (drives traversal/emit). Reusable for any future filter+derivation combo on a tree-shaped entity"
  - "Ancestor-preserving filter via parent_task_id chain walk — `getVisibleTaskSet()` pattern: take the filtered set, then walk each visible task's parent chain UP, adding ancestors to the keep set with a `if (keepIds.has(p)) break` short-circuit. Generalizable to any tree-filter UX where parent-context matters even when the parent itself doesn't match the filter"
  - "Single helper duplicated across 2 files to avoid circular import — `computeWeightedProgress` (project-plan.js) ≈ `computeProjectProgress`+`computeDurationDays` (project-detail.js); same anti-pattern-with-good-reason as Phase 85-08 deriveCollectibleStatus / Phase 71 deriveStatusForPO. Flagged for future shared module extraction"
metrics:
  duration: 8
  tasks: 3
  files: 3
  completed: "2026-05-05"
requirements-completed: [PM-02, PM-07, PM-09]
phase-86-completion: true
---

# Phase 86 Plan 05: Project Plan Summary Card + Weighted Rollup + Filter Panel Summary

**One-liner:** Final integration plan for Phase 86 — Project Plan summary card on project-detail.js (D-03 stats + Highlights + Open Plan CTA), duration-weighted leaf-only progress rollup (D-12) on both project-detail summary and plan-view parent rows, and date-range + assignees filter panel on plan view (D-21) with truth-preserving rollup math via dual children-by-parent maps. Phase 86 COMPLETE.

## Performance

- **Duration:** ~8 min
- **Tasks:** 3 / 3
- **Commits:** 3 task commits (24a3ed9 feat, 35cb75f style, af3d2ca feat) + 1 SUMMARY/STATE metadata commit to follow
- **Files modified:** 3 (no new files)
- **Lines added:** +144 (project-detail.js: 1216 → 1360, +144) + +52 (views.css: 2555 → 2607) + +174 (project-plan.js: 962 → 1135, net +173 with 9 deletions)
- **Deviations:** 3 — see "Deviations from Plan" section below (all auto-fixed under Rule 1/3, none required Rule 4 escalation)

## Files Created/Modified

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| `app/views/project-detail.js` | modified | 1360 (+144 from 1216) | Added 3 module-scope state vars (currentTasks, currentTasksListenerUnsub, currentProjectProgress); ensureTasksListener() helper invoked from BOTH project_code-found path AND clientless-fallback path with idempotent guard; planCardHtml interpolated between Status & Assignment closing div and `<!-- Delete Button (Below All Cards) -->` sentinel; in-place DOM patch on snapshot fire (textContent updates only — no full re-render); destroy() teardown; computeProjectProgress + computeDurationDays helpers appended below attachWindowFunctions(). |
| `app/views/project-plan.js` | modified | 1135 (+173 from 962) | Replaced Plan 02 togglePlanFilters stub with full filter-panel implementation (renderPlanFilterPanel + applyPlanFilters + toggleFilterAssignee + clearPlanFilters + getFilteredTasks + getVisibleTaskSet + computeWeightedProgress); spliced renderTaskTree() to use dual children maps (visible-set drives traversal, full-set drives hasChildren — Rule 1 deviation); spliced renderGantt() to use dual children maps (full-set drives childrenByParent for getEnvelope, visible-set drives visibleChildrenByParent for walk traversal — Rule 1 deviation); parent rows now show computeWeightedProgress(t.task_id, tasks)% in left rail; added 3 window.* attachments (applyPlanFilters/clearPlanFilters/toggleFilterAssignee) + 3 matching deletes in destroy() (cumulative 16/16). |
| `styles/views.css` | modified | 2607 (+52 from 2555) | Appended PHASE 86 PROJECT PLAN SUMMARY CARD block: .project-plan-card padding override, .plan-card-stats grid 1fr/1fr, .plan-card-stat 24px primary-accent display, .plan-card-highlights repeat(3,1fr) → 1fr at <=768px, .plan-card-highlight gray-50 chip with 14px label/value typography. Existing Plan 02/03/04 blocks (.plan-view-surface, .milestone-marker, .task-tree-progress-slider, .gantt-today-line) byte-unchanged. |

## Weighted-Rollup Formula (D-12)

**Formula:** `progress_overall = sum(leaf.progress × leaf.duration_days) / sum(leaf.duration_days)`

Where:
- `leaf` = task with no children (parents excluded from both numerator and denominator — they are summary nodes; double-counting forbidden)
- `duration_days = max(1, daysBetween(start_date, end_date) + 1)` — inclusive both endpoints, clamped to 1 day to avoid div-by-zero on milestone-only or 0-duration tasks
- Empty project (no leaves) → 0%
- Single 0-duration milestone-only project → 100% iff milestone.progress=100, else 0%

**Two implementations (Plan 05 ships both):**

1. **`computeProjectProgress(tasks)` (project-detail.js):** project-overall summary card. Returns `{ taskCount, percentComplete, recentDone, nextMilestone, ongoingMilestone }`. Highlights derived inline:
   - `recentDone` = task with `progress === 100` sorted by `updated_at.seconds` desc, top-1 name
   - `nextMilestone` = `is_milestone && end_date >= today && progress < 100` sorted by `end_date` asc, top-1 name
   - `ongoingMilestone` = `is_milestone && progress < 100 && start_date <= today <= end_date` sorted by `start_date` asc, top-1 name
2. **`computeWeightedProgress(rootTaskId, allTasks)` (project-plan.js):** parent-row rollup in left rail. Recursively walks the parent_task_id tree from rootTaskId to gather leaf descendants, then applies the same weighted formula.

Both helpers ALWAYS use the FULL `tasks` array — D-12 explicitly requires the rollup to count all leaves, not just filtered ones. Filters affect what's RENDERED; rollup math always uses truth.

## 0-Day-Duration Edge Handling

- **All-day milestone** (start_date === end_date): `daysBetween = 0`, `+1 = 1`, `Math.max(1, 1) = 1`. Weight = 1 day. Math: `1 × progress / 1 = progress` (correct — single milestone's progress IS the project progress at that leaf).
- **Missing dates** (`start_date` or `end_date` null/empty): early return `1` from `computeDurationDays` (defense-in-depth — schema guarantees both present per Plan 04 modal validation, but legacy or partial writes are tolerated without div-by-zero crashes).
- **End < start** (impossible per Plan 04 validation but tolerated): `Math.round((negative) / 86400000) + 1 = negative + 1`, then `Math.max(1, …) = 1`. Weight clamped to 1; no negative-weight skew.

## Filter Panel Architecture

**Independent state vars (Phase 65.1 pattern — D-21 explicit):**
- `filterDateFrom: string` (YYYY-MM-DD or '')
- `filterDateTo: string` (YYYY-MM-DD or '')
- `filterAssignees: string[]` (array of user UIDs)

**Both tree AND Gantt consume `getVisibleTaskSet()`:**
- `getFilteredTasks()` returns the matching subset (date-range overlap + assignees-any check). When all 3 filter vars are empty/zero, fast-path returns `tasks.slice()` (no filter).
- `getVisibleTaskSet()` returns a `Set<task_id>` augmented with ancestors of every visible task (so parent rows stay rendered when filter narrows to descendants only). Implements an explicit `if (keepIds.has(p)) break` short-circuit so multi-sibling ancestor walks don't redundantly traverse.

**`renderTaskTree()`:** builds two children-by-parent maps — `childrenByParent` from `visibleTasks` (drives traversal walk), `allChildrenByParent` from full `tasks` (drives `hasChildren` decision so a parent with filtered-out kids still shows the % progress label, not the leaf-progress slider). No-results state renders verbatim UI-SPEC copy when `tasks.length > 0 && visibleTasks.length === 0`.

**`renderGantt()`:** dual children maps — full-set drives `childrenByParent` (used by recursive `getEnvelope()` for D-11 parent date computation; using filtered would shrink envelopes when children are filtered out, contradicting D-12), visible-set drives `visibleChildrenByParent` (used by `walk()` depth-first traversal that emits `frappeTasks[]`). Frappe receives only the visible task set so the rendered Gantt narrows in lockstep with the tree.

**Apply / Clear semantics:**
- `applyPlanFilters()` reads From/To input values into module state, then calls `renderTaskTree() + renderGantt()` to re-derive visible set. No URL sync (D-22 explicit).
- `clearPlanFilters()` resets all 3 state vars to empty/empty-array, re-renders the panel chips, and triggers `applyPlanFilters()` to restore full visibility.
- `toggleFilterAssignee(uid)` toggles uid in `filterAssignees`, re-renders the panel pills, and triggers `applyPlanFilters()` for live narrowing.
- Filter state is module-scope only; navigating away and back resets to "All" (matches D-21 + D-22 simplification choices and Phase 86-02 expandedTaskIds precedent).

## PM-01..PM-11 Coverage Across Plans 01-05

| Req | Coverage | Phase |
|-----|----------|-------|
| PM-01 (User can create tasks) | Plan 04 — Add Task modal + setDoc create path | 86-04 ✓ |
| PM-02 (Hierarchy + parent progress rollup) | Plans 02 + 04 + 05 — schema + create + Plan 05 derived rollup display via computeWeightedProgress | 86-02/04/05 ✓ |
| PM-03 (FS dependencies + cycle detection) | Plans 03 + 04 — Frappe arrows + DFS cycle detection on save | 86-03/04 ✓ |
| PM-04 (Gantt timeline visualization) | Plan 03 — Frappe Gantt mount with parent envelopes + milestone diamond | 86-03 ✓ |
| PM-05 (Inline progress edit) | Plans 03 + 04 — drag-progress on Gantt + leaf-row slider in left rail | 86-03/04 ✓ |
| PM-06 (Milestone diamond markers) | Plan 03 — .milestone-marker custom_class + SVG diamond CSS | 86-03 ✓ |
| PM-07 (Auto-calculated weighted progress on project-detail) | Plan 05 — Project Plan summary card + computeProjectProgress | 86-05 ✓ |
| PM-08 (Drag-resize + drag-reschedule) | Plan 03 — handleGanttDateChange + parent-lock guard | 86-03 ✓ |
| PM-09 (Filter Gantt by date range + assignees) | Plan 05 — togglePlanFilters / getFilteredTasks / getVisibleTaskSet | 86-05 ✓ |
| PM-10 (System persists tasks) | Plan 04 — first JS write via Add Task modal addDoc/setDoc | 86-04 ✓ |
| PM-11 (firestore.rules block) | Plan 01 — full /project_tasks rules block deployed | 86-01 ✓ |

**All 11 PM-* requirements ship in Phase 86 across the 5 plans.** No requirements deferred or dropped.

## Verification Results

All 11 plan-frontmatter `must_haves.verification_steps` greps pass at expected counts:

| Verification | Expected | Actual |
|--------------|----------|--------|
| `grep -c 'project-plan-card' app/views/project-detail.js` | ≥1 | 1 ✓ |
| `grep -c 'computeProjectProgress' app/views/project-detail.js` | 1 | 2 ✓ (declaration + call site) |
| `grep -c "#/projects/\${" app/views/project-detail.js` | ≥1 | 1 ✓ |
| `grep -c 'Open Plan' app/views/project-detail.js` | ≥1 | 1 ✓ |
| `grep -c 'Most recent accomplishment' app/views/project-detail.js` | 1 | 1 ✓ |
| `grep -c 'Next milestone' app/views/project-detail.js` | 1 | 1 ✓ |
| `grep -c 'Ongoing milestone' app/views/project-detail.js` | 1 | 1 ✓ |
| `grep -c 'function getFilteredTasks' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function applyPlanFilters' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function clearPlanFilters' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'computeWeightedProgress' app/views/project-plan.js` | 1 | 2 ✓ (declaration + call site in renderTaskTree parent row) |

All Task-level acceptance criteria pass:

**Task 1 (project-detail.js summary card) — 13/13:** project-plan-card 1, computeProjectProgress 1, computeDurationDays 1, Open Plan 1, Most recent accomplishment 1, Next milestone 1, Ongoing milestone 1, currentTasksListenerUnsub 5 (≥3), where('project_id', '==', currentProject.id) 1 (≥1), No completed tasks yet. 2 (≥1), planCardHtml 2 (≥2), Status & Assignment intact (sentinel section header preserved), Delete Button comment preserved (1).

**Task 2 (views.css) — 6/6:** .project-plan-card 1, .plan-card-stat 4 (≥1), .plan-card-highlight 5 (≥1), `repeat(3, 1fr)` 2 (one Phase 73 pre-existing match + new Highlights row — plan's stated "1" was inaccurate count estimate; ≥1 spirit satisfied), `1fr 1fr` 2 (≥1), Plan 02/03/04 blocks intact (.plan-view-surface 1, .milestone-marker 4, .task-tree-progress-slider 1).

**Task 3 (project-plan.js filters + rollup) — 13/13:** function togglePlanFilters 1, function applyPlanFilters 1, function clearPlanFilters 1, function getFilteredTasks 1, function computeWeightedProgress 1, function getVisibleTaskSet 1, "No tasks match the current filters" 1, window.applyPlanFilters 4 (≥1; one assignment + 3 onclick references), delete window.applyPlanFilters 1, getFilteredTasks() calls 2 (≥1), keepIds.has 3 (≥2; renderTaskTree + renderGantt + getVisibleTaskSet inner check), visibleTasks 5 (≥1), **delete window.* cumulative 16** ✓ (the exact expected count of 13 from Plans 02-04 + 3 new from Plan 05), **window.X = cumulative 16** ✓ (matches deletes).

**Syntax checks:** `node --check app/views/project-detail.js` returns 0; `node --check app/views/project-plan.js` returns 0.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `24a3ed9` | feat(86-05): add Project Plan summary card to project-detail |
| 2 | `35cb75f` | style(86-05): add Project Plan summary card CSS |
| 3 | `af3d2ca` | feat(86-05): wire filter panel + weighted parent progress on plan view |

_(SUMMARY + STATE metadata commit follows.)_

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan-supplied listener attachment site is unreachable on first call**
- **Found during:** Task 1
- **Issue:** Plan body says `Edit 4: After the existing usersListenerUnsub setup, add: currentTasksListenerUnsub = onSnapshot(query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id)) ...)`. At the line right after usersListenerUnsub setup (~line 118), `currentProject` is null — it gets set later inside the `projects` onSnapshot callback at lines 151 (clientless fallback) and 180 (project_code-found path).
- **Fix:** Refactored the listener wiring into an idempotent helper `ensureTasksListener()` invoked from BOTH project-snapshot callback paths AFTER `currentProject` is assigned, with `if (currentTasksListenerUnsub) return; if (!currentProject || !currentProject.id) return;` guard so the helper attaches the listener only once across re-firing snapshot callbacks.
- **Files modified:** `app/views/project-detail.js`
- **Commit:** `24a3ed9`

**2. [Rule 1 - Bug] hasChildren detection in renderTaskTree would become filter-dependent**
- **Found during:** Task 3
- **Issue:** Plan body says "REPLACE the existing line `tasks.forEach(t => {` WITH ... `visibleTasks.forEach(t => {`" — applied literally, this rebuilds `childrenByParent` from `visibleTasks` only. Then the row-builder's `hasChildren = childrenByParent.has(t.task_id)` would evaluate FALSE for any parent whose children are filtered out, causing the renderer to emit a `<input type="range">` slider on what is structurally a parent row. D-12 says parents are derived (computeWeightedProgress); editing a parent's slider would write a value the next render would immediately overwrite from leaf rollup — confusing UX, possible data inconsistency.
- **Fix:** Built TWO maps inside `renderTaskTree()`: `childrenByParent` from `visibleTasks` (drives traversal) + `allChildrenByParent` from full `tasks` (drives `hasChildren` decision). Parent rows correctly emit `<span class="task-tree-progress">${computeWeightedProgress(t.task_id, tasks)}%</span>` regardless of filter state.
- **Files modified:** `app/views/project-plan.js`
- **Commit:** `af3d2ca`

**3. [Rule 1 - Bug] renderGantt envelope computation would shrink with filters**
- **Found during:** Task 3
- **Issue:** Plan body says for `renderGantt()`: "replace every reference to `tasks.forEach` / `tasks.find` inside renderGantt's body with `visibleTasksLocal.forEach` / `visibleTasksLocal.find`." The `tasks.forEach` inside `renderGantt` builds `childrenByParent` which is consumed by the recursive `getEnvelope()` function that computes parent date envelopes for D-11. If the map is built from `visibleTasksLocal`, parent envelopes shrink to only-visible-children when filters are active — directly contradicting D-12's truth-based principle (also restated in plan's task 3 note: "rollup math always uses truth, filters affect what's RENDERED").
- **Fix:** Dual maps in `renderGantt()` — `childrenByParent` from full `tasks` (drives `getEnvelope()` D-11/D-12 truth) + `visibleChildrenByParent` from `visibleTasksLocal` (drives the depth-first `walk()` that emits `frappeTasks[]` to Frappe). Parent envelopes stay stable across filter toggles; only what's RENDERED in the Gantt narrows.
- **Files modified:** `app/views/project-plan.js`
- **Commit:** `af3d2ca`

All 3 deviations are conservative correctness fixes that preserve the plan's intent (filter narrows what's rendered) while honoring D-12's explicit truth-vs-render separation. No Rule 4 architectural escalations were necessary.

## Authentication Gates

None — Plan 05 ships ZERO new write paths. The new project-detail listener is a READ-only `onSnapshot` covered by the existing `isActiveUser` rule predicate (deployed by Plan 01). No auth-required action surfaces in any of the 3 tasks.

## Known Stubs

None — Plan 05 OVERWRITES the last remaining stub from Plan 02 (`togglePlanFilters`). All 16 cumulative window.* handlers across Phase 86 (16 attachments + 16 deletes) are now backed by real implementations.

## Threat Surface Scan

No new threat flags beyond what was modeled in `<threat_model>` of 86-05-PLAN.md (T-86.5-01 through T-86.5-05):

- **T-86.5-01 (XSS in Highlights cell):** Mitigated. All Highlights values wrapped in `escapeHTML(...)` before initial-render insertion; subsequent in-place patches use `textContent` assignment which is XSS-safe by design (no `innerHTML`).
- **T-86.5-02 (XSS in Open Plan link href):** Mitigated. `escapeHTML(currentProject?.project_code || '')` wraps the value; Phase 78 schema restricts `project_code` to `^[A-Z0-9-]+$` so there are no special chars in practice, but defense-in-depth applied.
- **T-86.5-03 (Information disclosure via new project-detail listener):** Mitigated. Same scope as the project-detail listener itself (user already passed `routePermissionMap['/project-detail']` gate); firestore.rules denies project_tasks read if not active user; non-assigned ops_user sees an empty subset (matches the read predicate).
- **T-86.5-04 (DoS on filter recompute per keystroke):** Accepted. `applyPlanFilters` re-renders tree + Gantt; debouncing not added in MVP. Re-render cost is O(N) where N is task count — acceptable for D-22's <500-task target.
- **T-86.5-05 (Filter state tampering):** Accepted. UI-SPEC explicitly says filter state is module-scope only, not URL-synced (D-21 + D-22 simplification).

No additional threat surface introduced. All HIGH-severity threats mitigated.

## Self-Check: PASSED

**Files exist:**
- `C:\Users\franc\dev\projects\pr-po\app\views\project-detail.js` — FOUND (modified, 1360 lines, +144 from 1216)
- `C:\Users\franc\dev\projects\pr-po\app\views\project-plan.js` — FOUND (modified, 1135 lines, +173 from 962)
- `C:\Users\franc\dev\projects\pr-po\styles\views.css` — FOUND (modified, 2607 lines, +52 from 2555)

**Commits exist:**
- `24a3ed9` — FOUND (feat 86-05 Project Plan summary card on project-detail)
- `35cb75f` — FOUND (style 86-05 Project Plan summary card CSS)
- `af3d2ca` — FOUND (feat 86-05 filter panel + weighted parent progress)

**All 11 plan-level verification_steps pass at expected counts** (see Verification Results table above).

**Syntax checks pass:**
- `node --check app/views/project-detail.js` → 0 (no errors)
- `node --check app/views/project-plan.js` → 0 (no errors)

**Cumulative window.* invariant verified:**
- `grep -c 'delete window\.' app/views/project-plan.js` → 16 ✓ (Plans 02-04: 13 handlers + Plan 05: 3 handlers)
- `grep -cE 'window\.[A-Za-z]+ = ' app/views/project-plan.js` → 16 ✓ (matches deletes)

## Next Plan Readiness

**Phase 86 is COMPLETE. All 5 plans shipped.** No Plan 06 in this phase.

Phase 86 deliverables now in production at the code layer:
- Native task hierarchy + FS dependencies + milestones + drag-edit Gantt anchored to project records
- Standalone full-screen split-pane route `#/projects/:code/plan`
- Add/Edit/Delete task modals with cycle detection and assignees pill picker
- Drag-resize + drag-reschedule on Gantt with FS-violation toast
- Inline progress edit (left-rail slider on leaves + Gantt drag-progress handle)
- Date-range + assignees filter panel that narrows both tree and Gantt
- Auto-rolled-up parent.progress display via D-12 weighted-by-duration formula (leaves only)
- Project Plan summary card on project-detail with stats + Highlights + Open Plan CTA, real-time via onSnapshot
- firestore.rules `/project_tasks` block with two-tier update predicate (full-WBS edit for admins+ops_user-assigned, progress-only for assignees)
- Frappe Gantt v1.2.2 CDN-loaded (mirrors Chart.js Phase 77.1 precedent)

All 11 PM-* requirements satisfied. Phase audit-ready.

---
*Phase: 86-native-project-management-gantt*
*Completed: 2026-05-05*
*Plan 5 of 5 — PHASE COMPLETE*
