---
phase: 86-native-project-management-gantt
plan: 02
subsystem: ui
tags: [view-skeleton, listener, tree-render, split-pane, project-plan-view, frappe-gantt]
requires:
  - phase: 86-01
    provides:
      - "Frappe Gantt v1.2.2 CDN load (window.Gantt — consumed in Plan 03; not yet used here)"
      - "firestore.rules /project_tasks block (allow read: isActiveUser — required for onSnapshot subscription)"
      - "/project-plan route + #/projects/:code/plan hash parsing (router dispatches param=projectCode here)"
      - "app/task-id.js (imported but not yet called — Plan 04 invokes it)"
provides:
  - "app/views/project-plan.js view module with synchronous render(activeTab, param) + async init() + async destroy() lifecycle"
  - "Hierarchical task tree rendering (chevron + indent + selected/hover states) — D-06"
  - "onSnapshot subscription on project_tasks filtered by project_id (D-18 read scope at JS query layer)"
  - "Module-scope expandedTaskIds Set for chevron toggle state (UI-only, NOT Firestore — D-22)"
  - "7 window.* handlers attached in init() and deleted in destroy(): toggleTaskExpand, selectTaskRow, setGanttZoom, togglePlanFilters, openAddTaskModal, openEditTaskModal, confirmDeleteTask"
  - "Plan-view CSS (.plan-view-surface, .plan-toolbar, .plan-split-pane 35%/1fr, .task-tree, .task-tree-row, .zoom-pill-group) per UI-SPEC Layout Contract"
  - "Clientless-project block (D-19): project_code-null projects show empty-state copy + disable +Add Task button"
affects:
  - 86-03 (mounts Frappe Gantt into #ganttPane mount point; replaces setGanttZoom stub body)
  - 86-04 (replaces openAddTaskModal/openEditTaskModal/confirmDeleteTask stub bodies with modal CRUD; first JS write to project_tasks)
  - 86-05 (replaces togglePlanFilters stub body with date-range + assignee multi-select; project-detail.js summary card consumes the same tasks read shape)
tech-stack:
  added: []
  patterns:
    - "View module synchronous render() returning shell HTML; async init() does Firestore + DOM hydration (mirrors project-detail.js Loading shell pattern but renders the full toolbar+pane shell up-front so the empty-state can paint immediately)"
    - "listeners[] array unsub-in-destroy pattern (CLAUDE.md SPA + Phase 85/65 finance.js precedent)"
    - "Plan-N stub bridge: Plan 02 ships idempotent showToast no-ops for openAddTaskModal/openEditTaskModal/confirmDeleteTask wired to window.* — Plan 04 will overwrite by direct assignment in init() (mirrors Phase 85-05 stub pattern)"
    - "Module-scope expandedTaskIds Set reset on destroy() — re-entering view starts fresh; UI-SPEC interaction contract"
    - "parent_task_id-keyed children Map for depth-first tree walk (rebuild-on-snapshot) — O(N) tree render; acceptable up to ~500 tasks per CONTEXT D-22"
key-files:
  created:
    - app/views/project-plan.js
  modified:
    - styles/views.css
key-decisions:
  - "render(activeTab, projectCode) is SYNCHRONOUS (not async) — router.js inserts the return value as innerHTML immediately; init() does the async work. Confirms plan acceptance criterion `grep -c 'export async function render' == 0`"
  - "Empty-state copy verbatim from UI-SPEC Copywriting Contract (`No tasks yet.` heading, `Click + Add Task to get started.` body) — zero residual creative choices left at execution time"
  - "Clientless-block message verbatim from UI-SPEC + CONTEXT D-19 — single source of truth, copy-pasted (literal apostrophe in 'doesn't' kept, since escapeHTML is applied at render time only on user-supplied data, not static UI copy)"
  - "expandedTaskIds Set resets on destroy() — chevron state is UI-only (D-22) and does NOT persist across tab/page navigation; matches UI-SPEC interaction contract verbatim"
  - "Window-function teardown deletes ALL 7 handlers in destroy() (5 stubs + 2 active) — even unused stubs are cleaned to keep the global namespace tidy and to give Plan 03/04 a known-clean slate when their init() reattaches"
  - "Single onSnapshot listener pushed into listeners[] (only one this plan); Plan 04 may add a second listener for users (assignee picker) — pattern accommodates without refactor"
  - "Frappe Gantt instance teardown: try { gantt.destroy?.() } catch + null the ref — defensive even though Plan 02 doesn't instantiate Gantt; lets Plan 03 add new Gantt(...) without changing destroy()"
  - "showLoading() called at init() start; the spinner is hidden when the snapshot first-callback paints renderTaskTree() — no try/finally hideLoading because that would race the snapshot; mirrors finance.js + project-detail.js pattern"
  - "Routes table import './views/project-plan.js' was registered in Plan 01 (Wave 1 prereq); navigation to #/projects/CODE/plan now resolves to this file with no router changes needed"
  - "ZERO writes to project_tasks ship in Plan 02 (read-only listener + tree render only); D-24 same-commit invariant fully respected — firestore.rules untouched"
patterns-established:
  - "Plan-N stub bridge: stub bodies wired to window.* in init() with toast-only feedback so users navigating to the route between Plan 02 ship and Plan 04 ship see informative toasts instead of console errors. Plan 04 overwrites by direct assignment."
  - "Optional-call hook: `if (typeof renderGantt === 'function') renderGantt()` in the snapshot callback — Plan 03 will define renderGantt() in the same module file and the hook fires automatically without changing the listener body. Same idiom for refreshSummaryHighlights() (Plan 05)."
  - "Task-tree depth-first walk: build parent_task_id Map once, sort siblings by start_date asc, recurse with depth*16+8px indent. Reusable pattern if other entities need hierarchy (e.g. future PR/PO subtasks)."
requirements-completed: []  # PM-01, PM-02 marked in plan frontmatter but PARTIAL only — strict-read says PM-01 ("User can create tasks") + PM-02 ("User can create task hierarchy ... parent task progress is rolled up from subtasks") require actual creation + rollup. Plan 02 ships read/list + hierarchy DISPLAY only. Per Plan 01 precedent (PM-10 deferred to first-write plan), PM-01 deferred to Plan 04 (Add Task modal create); PM-02 split: hierarchy-create deferred to Plan 04, rollup-display deferred to Plan 05.
requirements-partial: [PM-01, PM-02]
duration: 3min
completed: 2026-05-05
---

# Phase 86 Plan 02: View Skeleton + Tree Summary

**`project-plan.js` view module shipped with synchronous render() + async init/destroy lifecycle, onSnapshot-driven hierarchical task tree, 7 window.* handlers (2 active, 5 stubbed for Plans 03–05), and full toolbar/split-pane CSS — read-only; zero writes to project_tasks, zero Gantt rendering.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-05T08:27:51Z
- **Completed:** 2026-05-05T08:30:55Z
- **Tasks:** 2 / 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- New `app/views/project-plan.js` (225 lines) — view module skeleton wired to `/project-plan` route registered by Plan 01; loads project by `project_code`, subscribes to `project_tasks where project_id == currentProject.id`, renders hierarchical tree in left rail, leaves right pane as empty `#ganttPane` mount point for Plan 03.
- Toolbar UI complete: back link, project-name title, zoom-pill segmented control (Day/Week/Month — Week active by default), Filters toggle button, +Add Task button.
- Hierarchical task tree: chevron toggle (`›` collapsed / `⌄` expanded), indent-by-depth, selected/hover row states, milestone diamond marker via `.task-tree-name.is-milestone::before`, progress percentage right-aligned.
- Empty-state and clientless-block copy verbatim from UI-SPEC.
- 5 stub window.* handlers wired so future-plan navigations don't error: `setGanttZoom` (Plan 03 wires), `togglePlanFilters` (Plan 05 wires), `openAddTaskModal` / `openEditTaskModal` / `confirmDeleteTask` (Plan 04 wires). Stubs show informative toasts ("modal coming in Plan 04").
- 2 active window.* handlers: `toggleTaskExpand` (chevron toggle), `selectTaskRow` (left-rail row select).
- 120 lines of CSS appended to `styles/views.css` — split-pane grid, task-tree row layout, zoom-pill segmented control, mobile carve-out (`<= 768px` collapses to single column, hides Gantt pane).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create app/views/project-plan.js — module skeleton** — `53c76b7` (feat)
2. **Task 2: Append plan-view shell + task-tree CSS to styles/views.css** — `1ef2abb` (feat)

_(SUMMARY + STATE/ROADMAP commit follows.)_

## Files Created/Modified

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| `app/views/project-plan.js` | **created** | 225 | Module-scope state + listeners[] + lifecycle (render/init/destroy) + tree render + 7 window.* handlers (2 active, 5 stubbed). Imports from firebase.js / utils.js / task-id.js. NO writes, NO Gantt code. |
| `styles/views.css` | modified | +120 | Appended after the existing `.hs-chart-canvas.hs-chart-status` mobile-media rule (line 2368). New rules: `.plan-view-surface`, `.plan-toolbar`, `.plan-back-link`, `.plan-title`, `.plan-toolbar-spacer`, `.zoom-pill-group`, `.zoom-pill[.active]`, `.plan-filter-panel`, `.plan-split-pane`, `.task-tree`, `.task-tree-row[:hover|.selected]`, `.task-tree-chevron[.clickable]`, `.task-tree-name[.is-milestone::before]`, `.task-tree-progress`, `.gantt-pane`, `.gantt-container`, `@media (max-width:768px)` mobile collapse. Existing rules byte-unchanged. |

## Window Functions: Owner Map

| Window function | Active in Plan 02? | Body owner | Notes |
|-----------------|--------------------|------------|-------|
| `window.toggleTaskExpand` | YES | Plan 02 | Adds/removes from `expandedTaskIds` Set, re-renders tree |
| `window.selectTaskRow` | YES | Plan 02 | Sets `selectedTaskId`, re-renders tree (Plan 03 will scroll-sync the Gantt) |
| `window.setGanttZoom` | stub (no-op) | **Plan 03** | Will call `gantt.change_view_mode(mode)` and toggle `.zoom-pill.active` |
| `window.togglePlanFilters` | stub (no-op) | **Plan 05** | Will toggle `#planFilterPanel` visibility, populate date-range + assignee picker |
| `window.openAddTaskModal` | stub (toast) | **Plan 04** | Will mount `#taskFormModal` in Add mode (D-19 — disabled if `project_code` null) |
| `window.openEditTaskModal` | stub (toast) | **Plan 04** | Will mount `#taskFormModal` in Edit mode pre-populated with the clicked task |
| `window.confirmDeleteTask` | stub (toast) | **Plan 04** | Will mount `#deleteTaskConfirmModal` with cascade-aware copy |

All 7 are deleted in `destroy()` so re-entering the view starts with a known-clean slate; Plan 04 will use unconditional assignment in its init() to overwrite the stubs (Phase 85-05 stub-bridge precedent).

## Decisions Made

- **render() is synchronous, not async.** Router contract: the return value of render() is inserted as innerHTML immediately, then init() runs. Plan acceptance criterion `grep -c 'export async function render' == 0` enforced this.
- **Empty-state and clientless-block copy taken verbatim from UI-SPEC.** Zero residual creative choices at execution time.
- **`expandedTaskIds` is a module-scope `Set`, NOT persisted to Firestore.** Per CONTEXT D-22 + UI-SPEC interaction contract.
- **All 7 window.* handlers (active + stubs) deleted in destroy().** Tidy global namespace; Plan 04 will overwrite stubs by direct assignment in init().
- **Single `onSnapshot` on `project_tasks` filtered by `project_id`.** D-18 project-scoping at the JS query layer (mirrors `mrfs`/`prs`/`pos` shape).
- **Optional-call hook for Plan-3+ extensions.** `if (typeof renderGantt === 'function') renderGantt()` inside the snapshot callback — Plan 03 defines `renderGantt` in this same file later, no listener body change needed.
- **Plan 02 ships ZERO writes to `project_tasks`.** D-24 same-commit invariant respected; `firestore.rules` untouched in Plan 02.

## Deviations from Plan

None — plan executed exactly as written. All 2 task acceptance criteria met on first pass; no Rule 1/2/3 auto-fixes triggered; no Rule 4 architectural questions surfaced.

The reference implementation in the plan body matched the source environment (utils.js exports, firebase.js exports, project-detail.js patterns, components.css `.empty-state` rule, CLAUDE.md SPA contract) without ambiguity, so no inline adjustments were needed.

## Issues Encountered

None.

## Authentication Gates

None — no auth-required actions in Plan 02. The view will subscribe to Firestore via existing auth posture (read rule on `project_tasks` is `isActiveUser`, deployed in Plan 01); any unauthenticated state is handled by the existing global auth shell, not Plan 02 code.

## Known Stubs

Three stubs that **must** be wired in Plan 04 (toasts inform users that a feature is coming):

1. `openAddTaskModal()` — toast: "Add Task — modal coming in Plan 04"
2. `openEditTaskModal(taskId)` — toast: "Edit Task — modal coming in Plan 04"
3. `confirmDeleteTask(taskId)` — toast: "Delete Task — modal coming in Plan 04"

Two stubs that **must** be wired in Plans 03 and 05:

4. `setGanttZoom(mode)` — Plan 03 (Gantt zoom switcher)
5. `togglePlanFilters()` — Plan 05 (filter panel slide-down)

These are intentional, documented, and explicitly bounded by the plan-frontmatter Window Functions list. They are NOT placeholder data that prevents the plan's goal — Plan 02's goal is read-only viewing, which is achieved by the active `toggleTaskExpand` + `selectTaskRow` + `renderTaskTree()` path.

The Add/Edit/Delete modal mount points (`#taskFormModalMount`, `#deleteTaskConfirmModalMount`) are present as empty divs — Plan 04 will populate them on demand.

## Threat Surface Scan

No new threat surface beyond what was modeled in `<threat_model>` of 86-02-PLAN.md (T-86.2-01 through T-86.2-04):

- **T-86.2-01 (XSS in tree row HTML):** Mitigated. All user-supplied strings (`t.task_id`, `t.name`, `currentProject.project_name`, `projectCode`) wrapped in `escapeHTML(...)` from utils.js before innerHTML insertion. Static UI copy (clientless-block message, empty-state copy, "Plan — ", "(unnamed)", percentage suffix) is hard-coded literal — no user input.
- **T-86.2-02 (URL projectCode for unauthorised project):** Accepted. Read rule on `project_tasks` is `isActiveUser`; ops_user not in `assigned_project_codes` will see an empty task list (no leak — query satisfies neither create nor update path; rule denies on those when relevant in future plans).
- **T-86.2-03 (10K-task DoS):** Accepted. Per CONTEXT D-22: tree render is O(N) DOM string concat; >500 tasks captured as deferred lazy-render. Typical projects <100 tasks per CONTEXT.
- **T-86.2-04 (URL hash spoof on `getDocs`):** Mitigated. `where('project_code', '==', projectCode)` is gated by Firestore rules on `projects` for active users; missing project shows the "Project not found" empty state without leaking existence info.

No additional threat flags introduced.

## Self-Check: PASSED

**Files exist:**
- `C:\Users\franc\dev\projects\pr-po\app\views\project-plan.js` — FOUND (created, 225 lines)
- `C:\Users\franc\dev\projects\pr-po\styles\views.css` — FOUND (modified, 2488 lines, +120 from 2368)

**Commits exist:**
- `53c76b7` — FOUND (feat 86-02 project-plan.js view skeleton)
- `1ef2abb` — FOUND (feat 86-02 plan-view CSS)

**Verification greps (all 8 plan-frontmatter `verification_steps`):**

| Verification | Expected | Actual |
|--------------|----------|--------|
| `grep -c 'export function render' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'export async function render' app/views/project-plan.js` | 0 | 0 ✓ |
| `grep -c 'export async function init' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'export async function destroy' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c "where('project_id', '==', currentProject.id)" app/views/project-plan.js` | ≥1 | 1 ✓ |
| `grep -c 'listeners.forEach' app/views/project-plan.js` | ≥1 | 1 ✓ |
| `grep -c 'No tasks yet.' app/views/project-plan.js` | ≥1 | 1 ✓ |
| `grep -c 'class="task-tree"' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'id="ganttPane"' app/views/project-plan.js` | 1 | 1 ✓ |

**Task-2 CSS greps:**

| Verification | Expected | Actual |
|--------------|----------|--------|
| `grep -c '.plan-view-surface' styles/views.css` | ≥1 | 1 ✓ |
| `grep -c '.plan-split-pane' styles/views.css` | ≥1 | 2 ✓ |
| `grep -c '.task-tree-row' styles/views.css` | ≥1 | 3 ✓ |
| `grep -c '.zoom-pill' styles/views.css` | ≥1 | 3 ✓ |
| `grep -c 'grid-template-columns: 35% 1fr' styles/views.css` | 1 | 1 ✓ |
| Existing rules untouched (line 1 of file) | unchanged | unchanged ✓ |

Manual browser smoke-check is deferred to user UAT (per the plan's `verification_steps` final bullet — "Browser smoke check: navigate to `#/projects/{any-code}/plan`"); the file-level grep gate is the executor's pass criterion.

## Next Plan Readiness

Plan 03 (Wave 3 — Gantt mount + drag-edit dates/progress) is unblocked:
- `#ganttPane` mount point is present in the DOM
- `window.Gantt` constructor is available (Plan 01)
- `tasks` array is populated by the `onSnapshot` callback (this plan)
- Snapshot callback already invokes `if (typeof renderGantt === 'function') renderGantt();` — Plan 03 defines `renderGantt` in this same file with no listener-wiring change needed
- `setGanttZoom` stub is wired to `window.setGanttZoom` — Plan 03 just replaces the function body
- `gantt` module-state slot exists; `destroy()` already nullifies it

Plan 04 (Wave 3/4 — Add/Edit/Delete task modals + first writes) is unblocked:
- Mount-point divs (`#taskFormModalMount`, `#deleteTaskConfirmModalMount`) present
- 3 stub functions (`openAddTaskModal`, `openEditTaskModal`, `confirmDeleteTask`) attached to `window.*` and replaceable by direct assignment
- `generateTaskId` already imported from `../task-id.js`
- `currentProject` module state populated; `currentProject.project_code` + `currentProject.id` both available for write payloads

Plan 05 (Wave 5 — filter panel + project-detail summary card) is unblocked:
- Filter state vars already declared at module scope (`filterDateFrom`, `filterDateTo`, `filterAssignees`)
- `togglePlanFilters` stub wired to `window.*`
- `#planFilterPanel` empty container present in the DOM (`display: none` initial)
- Snapshot callback already invokes `if (typeof refreshSummaryHighlights === 'function') refreshSummaryHighlights();` — Plan 05's project-detail summary card refresh hook lands automatically

No blockers carried forward.

---
*Phase: 86-native-project-management-gantt*
*Completed: 2026-05-05*
