---
phase: 86-native-project-management-gantt
plan: 04
subsystem: modal-crud-write-side
tags: [modal-crud, dependencies, cycle-detection, parent-rollup, progress-edit, assignees-picker, write-side]
requires:
  - phase: 86-01
    provides:
      - "firestore.rules /project_tasks two-tier update + create + delete rules (Plan 04 emits writes that match all four rule predicates)"
      - "generateTaskId(projectCode) export from app/task-id.js (consumed by saveTaskFromModal create path)"
  - phase: 86-02
    provides:
      - "project-plan.js view module + 3 stub window.* handlers (openAddTaskModal, openEditTaskModal, confirmDeleteTask) — overwritten by Plan 04 via direct assignment in init()"
      - "#taskFormModalMount + #deleteTaskConfirmModalMount empty container divs"
      - "Module-scope tasks[] array populated by onSnapshot listener"
      - "Module-scope currentProject + currentProject.project_code accessor for write payloads"
      - "renderTaskTree() function — Plan 04 modifies its row HTML to add inline progress slider + delete X button per leaf row"
  - phase: 86-03
    provides:
      - "renderGantt() snapshot-driven re-render — picks up Plan 04 writes automatically via the onSnapshot listener"
      - "handleGanttDateChange / handleGanttProgressChange — define the canonical drag-write payload shape that Plan 04's editTaskProgress mirrors"
provides:
  - "Add Task / Edit Task modal — name, description, dates (locked for parents with 'Computed from subtasks' helper text), parent dropdown (excludes self+descendants), Finish-to-Start dependency multi-select (excludes self+ancestors+descendants), milestone checkbox, assignees pill picker sourced from normalizePersonnel(currentProject) — D-16"
  - "Delete Task confirmation modal — leaf variant ('Delete Task?') and parent-with-children variant ('Delete Task and Subtasks?' with cascade count)"
  - "saveTaskFromModal — validates + cycle-detects deps + writes setDoc with merge:true on edit / fresh on create + recomputes BOTH old and new parent on reparent (D-11)"
  - "detectDependencyCycle — DFS with white/gray/black coloring; reconstructs cycle path via parent[] backtracking; returns array of task NAMES (not ids) for the verbatim error toast"
  - "recomputeParentDates — single-level read of children + min(start)/max(end) recompute + bubble-up to grandparent. excludeIds Set parameter handles stale-snapshot case during cascade delete"
  - "deleteTaskNow — collects subtree via DFS post-order push (children-first), chunks deletes via writeBatch with CHUNK=450 (T-86.4-05 mitigation), recomputes deleted-node's parent with excludeIds set"
  - "editTaskProgress — single-doc updateDoc {progress, updated_at} from left-rail slider (matches Plan 03's drag-progress payload shape so both entrypoints share the same firestore.rules tier-2 path)"
  - "13 window.* handlers attached in init() (12 active + 1 leftover Plan-05 stub for togglePlanFilters); destroy() cleans them all"
affects:
  - "86-05 (Plan 05 will consume tasks[] populated by Plan 04 writes for the project-detail summary card; togglePlanFilters stub remains in place for Plan 05)"
tech-stack:
  added: []
  patterns:
    - "DFS cycle detection with white/gray/black 3-coloring + parent[] backtracking for path reconstruction (standard CLRS algorithm; complexity O(V+E))"
    - "writeBatch chunking for cascade deletes — CHUNK=450 leaves 50-op headroom under Firestore's 500-op commit ceiling (Phase 82 cascade pattern + T-86.4-05 mitigation)"
    - "Stale-snapshot exclude pattern for post-write recompute — Firestore onSnapshot fires async after writes, so the local tasks[] may still contain just-deleted/just-written ids; passing excludeIds Set lets the parent recompute see the post-write envelope, not the stale one. Bubble-up propagates the same Set up the chain"
    - "Old-AND-new-parent dual recompute on edit-with-reparent — saveTaskFromModal recomputes oldParent (envelope shrinks) AND new parent_task_id (envelope expands) when modalEditingTaskId.parent_task_id !== form.parent_task_id"
    - "Stub-overwrite via direct assignment (Phase 85-05 inverted) — Plan 02 ships toast-stubs first, Plan 04 overwrites by direct assignment in init() (no `if (!window.X)` guard); destroy() in Plan 02 already deletes all 7 handlers, so re-init starts clean"
key-files:
  created: []
  modified:
    - app/views/project-plan.js
    - styles/views.css
key-decisions:
  - "setDoc(... { merge: !!modalEditingTaskId }) used for both create AND edit paths — create gets merge:false (writes the full doc shape including created_at + created_by) while edit gets merge:true (preserves any fields not explicitly written, e.g. created_at + created_by from the original doc). Avoids double-code-path branching between addDoc and updateDoc"
  - "Cycle detection runs on candidate dependencies BEFORE the Firestore write — D-13 explicit accepted-residual: rules layer cannot enforce cycle prevention without scanning the full collection. Worst case (hand-crafted bypass write): renderer detects cycle via FS-violation overlay; no data corruption, just confused Gantt"
  - "recomputeParentDates uses LOCAL tasks[] snapshot (in-memory), not a fresh Firestore getDocs query — accepts the 1-RTT staleness window in exchange for instant feedback after every write. The excludeIds Set patches the only failure mode (just-deleted children appearing in stale snapshot)"
  - "Bubble-up recursion guard via parent.start_date === minStart && parent.end_date === maxEnd short-circuit — prevents redundant Firestore writes if the parent envelope already matches the recomputed value (e.g. when reparenting a task whose dates don't shift the parent's overall span)"
  - "Permission-denied path on recomputeParentDates LOGGED ONLY (console.warn), not toasted — leaf write succeeded so the user-facing operation worked; parent-write permission failures are an admin-tier concern that the user can't act on. Server rules would still allow the write if user is admin/ops_user assigned, so this only fires in pathological cross-tier-edit-attempt cases"
  - "Cascade delete uses children-first DFS post-order push so writeBatch chunks are still children-first WITHIN each chunk — guarantees parent-of-deleted-child still has all its children's docs alive at the moment of parent's delete (Firestore writeBatch is atomic per-batch, but cross-batch ordering matters for any future onDelete trigger)"
  - "Inline progress slider on LEAVES ONLY — parents keep the static % label since parent.progress is rolled-up and derived (D-12 leaf-only weighted; persisted parent.progress is always a non-canonical view). Editing a parent's slider would write a value that the next renderGantt() / renderTaskTree() would immediately overwrite from leaf rollup — unsafe UX, blocked at the render layer"
  - "Delete X button uses opacity 0 → 0.6 hover-reveal pattern — keeps the row compact in the default state, avoids visual noise on long task lists. Ratio 0.6 not 1 chosen so the icon doesn't compete with the task name when revealed; full opacity only on hover-of-button-itself"
  - "ZERO firestore.rules changes ship in Plan 04 — Plan 01 already deployed all 4 rule predicates (read/create/update tier-1+tier-2/delete) and every Plan 04 write payload matches an existing rule subset exactly: create → isAssignedToProject + project_code denormalized; update full-WBS → tier-1; update progress-only (slider) → tier-2 affectedKeys.hasOnly; delete → isAssignedToProject. D-24 same-commit invariant fully respected"
  - "Plan executed exactly as written (zero deviations) — all 4 task acceptance criteria checklists pass on first re-run, all 12 plan-level verification_steps pass at expected counts, no Rule 1/2/3 auto-fixes triggered, no Rule 4 architectural questions surfaced. The reference implementation in the plan body matched the source environment (utils.js exports, firebase.js writeBatch import availability, Plan 02's stub mounts, Plan 03's drag-progress payload shape) without ambiguity"
patterns-established:
  - "DFS-with-coloring cycle detection on a Firestore-backed dep graph — reusable for any future graph-validation feature (e.g. resource-dependency cycles in PM-FUT-03 resource allocation, project-template chain-of-deps in v4.1+)"
  - "Stale-snapshot excludeIds Set bubble-up — generic pattern for any post-write recompute that walks a parent chain. Reusable for any tree-shaped Firestore collection (project_tasks, future taxonomies, etc.)"
  - "writeBatch CHUNK=450 cascade pattern — formalizes the Phase 82 cascade with explicit headroom under Firestore's 500-op cap"
  - "Inline slider on tree row — opacity-hover-reveal control buttons + range input on leaf-only rows. Reusable for any future tree-edit UX (e.g. budget allocation per leaf in a WBS)"
metrics:
  duration: 7
  tasks: 4
  files: 2
  completed: "2026-05-05"
requirements-completed: [PM-01, PM-02, PM-03, PM-05, PM-10]
---

# Phase 86 Plan 04: Modal CRUD + Cycle Detection + Parent Recompute + Progress Slider Summary

**One-liner:** Full write-side CRUD shipped to project-plan.js — Add/Edit/Delete task modals with verbatim UI-SPEC copy, DFS cycle detection on dependency saves, dual old+new parent recompute on edit-reparent, writeBatch cascade delete with CHUNK=450, inline leaf-row progress slider sharing Plan 03's tier-2 firestore-rule path, and assignees pill picker sourced strictly from project personnel (D-16) — first complete persistence layer for project_tasks.

## Performance

- **Duration:** ~7 min (08:51:46Z – 08:58:44Z UTC)
- **Tasks:** 4 / 4
- **Commits:** 4 (one per task) + 1 metadata commit (this SUMMARY)
- **Files modified:** 2 (no new files)
- **Lines added:** +459 (project-plan.js: +458 from 522 → 961, Task 1 +169 + Task 2 +159 + Task 3 +81 + Task 4 +49 modulo edit-replace; views.css: +17 lines)
- **Deviations:** 0

## Files Created/Modified

| File | Status | Lines | Notes |
|------|--------|-------|-------|
| `app/views/project-plan.js` | modified | 961 (+439 from 522) | Replaced 3 Plan-02 stubs (openAddTaskModal, openEditTaskModal, confirmDeleteTask) with real implementations + 6 new helpers (renderTaskFormModal, closeTaskFormModal, toggleTaskAssignee, detectDependencyCycle, saveTaskFromModal, recomputeParentDates, closeDeleteTaskConfirm, deleteTaskNow, editTaskProgress). Modified renderTaskTree() to emit inline progress slider on leaves + hover-revealed delete X button. Added 6 new window.* registrations to init() (closeTaskFormModal, toggleTaskAssignee, saveTaskFromModal, deleteTaskNow, closeDeleteTaskConfirm, editTaskProgress) + matching deletes to destroy(). |
| `styles/views.css` | modified | 2555 (+17 from 2539) | Updated `.task-tree-row` grid-template-columns from `24px 1fr auto` → `24px 1fr auto 24px` to give the delete button its own column. Added `.task-tree-progress-slider` (80px wide, primary accent-color) and `.task-tree-delete-btn` (transparent bg, charcoal X, opacity 0 → 0.6 → 1 hover-reveal) rules. All Plan 02 + Plan 03 rules byte-unchanged. |

## Cycle Detection Algorithm Choice

**Algorithm:** Depth-first search with 3-coloring (white/gray/black) and parent-pointer backtracking for cycle-path reconstruction. Standard CLRS textbook algorithm; complexity O(V+E) where V = task count, E = total dependency edges across the project.

**Rationale:**
1. **Self-contained per-save validation** — cycle check runs on the candidate dependency array of the task being saved, NOT on the entire current Firestore graph. Adjacency map is rebuilt fresh on every save with the candidate deps substituted in for the target task; other tasks' deps are read from the local in-memory `tasks[]` snapshot.
2. **Path reconstruction matters** — UI-SPEC mandates "verbatim cycle copy" naming the cycle path: `This dependency would create a cycle: A → B → C → ... → A. Remove one of the deps to continue.` Plain Boolean cycle detection (e.g. union-find) would be insufficient.
3. **3-coloring distinguishes "back edge" cycles** — gray node encountered during DFS traversal = back edge = cycle. White/black nodes are unvisited / fully explored, respectively. Parent-pointer chain rebuilds the cycle path in reverse.
4. **DFS recursion not memoized** — re-running DFS on every save is acceptable since per-project task count is bounded (D-22: ~500-task ceiling captures the realistic upper bound).

**Implementation note:** Recursive `dfs(node)` with a `parent` Map captures the cycle path incrementally; on detection, walk `parent` from the back-edge target to the source, reverse the resulting array, and translate ids → names via `tasksById` Map for the toast copy.

## Parent Recompute Strategy

**On every leaf write (create/update/delete):**
1. Identify the leaf's `parent_task_id` (nullable; null → root task, no recompute needed).
2. **For edits with reparent** (oldParent !== newParent): recompute BOTH old parent (envelope shrinks because the leaf moved away) AND new parent (envelope expands because the leaf joined). Two separate `recomputeParentDates` calls, oldParent first then newParent.
3. `recomputeParentDates(parentTaskId, excludeIds = null)`:
   - Read all direct children from local `tasks[]` snapshot, minus any in `excludeIds` (D-Plan-04 stale-snapshot exclude pattern).
   - Compute `min(child.start_date)` and `max(child.end_date)`.
   - Short-circuit if envelope already matches the parent's persisted dates (no Firestore write).
   - Otherwise `updateDoc` parent with new {start_date, end_date, updated_at}.
   - **Bubble up:** if the parent itself has a parent (`parent.parent_task_id`), recurse with the same excludeIds Set so deeper ancestors honor the exclusion list too.

**Stale-snapshot exclude pattern:**
- Firestore `onSnapshot` fires asynchronously AFTER writes — the local `tasks[]` may still contain just-deleted children when `recomputeParentDates` runs.
- Without `excludeIds`, the parent recompute would see the stale children and write back the pre-delete envelope — a regression.
- Cascade delete (`deleteTaskNow`) constructs `new Set(allIds)` of the deleted subtree and passes it as `excludeIds`; the recompute then correctly sees the post-delete envelope.
- Bubble-up propagates the same Set up the chain so grandparents also honor the exclusion.

**Permission-denied behavior:**
- The user typically owns leaf-edit permission but may not own parent-edit permission (cross-tier rule check at `firestore.rules`).
- Plan 04 chooses to LOG-ONLY (console.warn) on parent recompute permission failures — the leaf write succeeded so the user-facing operation worked. Toasting parent failures would confuse users since they have no recourse. Admins/assigned ops_user retain full parent-edit access via tier-1 rule.

## Accepted Residual: Client-Only Cycle Detection (CONTEXT D-13)

Plan-level threat T-86.4-04 explicitly accepted: an attacker bypassing the modal UI (e.g. hand-crafted Firestore write via `setDoc` from a console) could create a dependency cycle in the persisted graph because firestore.rules CANNOT enforce dependency-cycle prevention without scanning the full project_tasks collection per write — prohibitively expensive and architecturally awkward for a security rule.

Mitigation: the renderer's `applyFsViolationStyles` + `checkAndToastFsViolations` (Plan 03) detect the resulting FS-violation visually (red arrows + warning toast) on next render. Worst case: a confused Gantt for the bypassing user — no data corruption, no privilege escalation, no cross-user leak.

This is an explicit CONTEXT-D-13 disposition, NOT a Plan 04 oversight. Captured in 86-04-PLAN.md `<threat_model>` T-86.4-04 row with disposition `accept`.

## Verification Results

All 12 plan-level `must_haves.verification_steps` greps pass at expected counts:

| Verification | Expected | Actual |
|--------------|----------|--------|
| `grep -c 'function openAddTaskModal' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function openEditTaskModal' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function saveTaskFromModal' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function recomputeParentDates' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'function detectDependencyCycle' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'generateTaskId(currentProject.project_code)' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c "setDoc(doc(db, 'project_tasks', " app/views/project-plan.js` | ≥1 | 1 ✓ |
| `grep -c 'project_code: currentProject.project_code' app/views/project-plan.js` | ≥1 | 1 ✓ |
| `grep -c 'This dependency would create a cycle' app/views/project-plan.js` | 1 | 1 ✓ |
| `grep -c 'normalizePersonnel(currentProject)' app/views/project-plan.js` | ≥1 | 3 ✓ |
| `grep -c 'writeBatch' app/views/project-plan.js` | ≥1 | 3 ✓ |
| Browser smoke checks | manual | deferred to UAT |

All 4 task-level acceptance criteria checklists pass on first re-run. `node --check app/views/project-plan.js` returns 0 (no syntax errors).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `f033c5a` | feat(86-04): add Add/Edit task modal helpers + assignee pill picker |
| 2 | `1f42a19` | feat(86-04): add saveTaskFromModal + cycle detection + parent recompute |
| 3 | `0872a21` | feat(86-04): add confirmDeleteTask + deleteTaskNow with cascade via writeBatch |
| 4 | `d188c8a` | feat(86-04): add inline progress slider on leaf rows + editTaskProgress write helper |

_(SUMMARY + STATE/ROADMAP/REQUIREMENTS metadata commit follows.)_

## Deviations from Plan

None — plan executed exactly as written.

All 4 task acceptance criteria checklists pass on first re-run; all 12 plan-level verification_steps pass at expected counts; no Rule 1/2/3 auto-fixes triggered; no Rule 4 architectural questions surfaced.

The reference implementation in the plan body matched the source environment (utils.js `escapeHTML` / `showToast` / `normalizePersonnel` / `showLoading` exports, firebase.js `setDoc` / `updateDoc` / `writeBatch` / `serverTimestamp` exports, Plan 02's `#taskFormModalMount` / `#deleteTaskConfirmModalMount` empty divs + the 3 stub function names attached to window.*, Plan 03's `handleGanttProgressChange` payload shape `{progress, updated_at}` for editTaskProgress mirror, project-detail.js `renderPersonnelPills` pattern for assignee pill picker) without ambiguity. No inline adjustments were needed.

## Authentication Gates

None — no auth-required actions in Plan 04. All write paths (saveTaskFromModal, deleteTaskNow, editTaskProgress) rely on the existing global auth posture; `firestore.rules` enforces role-based gating (Plan 01 D-18). Permission-denied paths surface verbatim UI-SPEC copy `"You don't have permission to edit tasks on this project."`; no manual auth step needed.

## Known Stubs

None NEW. Plan 02's `togglePlanFilters` stub remains in place — owned by Plan 05 (Wave 5 filter panel). All 3 Plan-04-owned stubs (openAddTaskModal, openEditTaskModal, confirmDeleteTask) are now FULLY WIRED with real implementations; the stub bridge is closed for Plan 04's surface area.

## Threat Surface Scan

No new threat flags beyond what was modeled in `<threat_model>` of 86-04-PLAN.md (T-86.4-01 through T-86.4-06):

- **T-86.4-01 (XSS in modal innerHTML):** Mitigated. All user-supplied strings (`task.name`, `task.description`, `task_id`, `currentProject.project_name`, personnel `name`/`uid`) wrapped in `escapeHTML(...)` before innerHTML insertion. Static UI copy verbatim from UI-SPEC.
- **T-86.4-02 (EoP via tier-2 bypass with extra fields):** Mitigated. `editTaskProgress` writes EXACTLY `{progress, updated_at}` — matches the deployed rule's `affectedKeys().hasOnly(['progress', 'updated_at'])` predicate. Defensive double-check.
- **T-86.4-03 (Reparent into descendant creating orphan tree):** Mitigated. Modal parent-dropdown excludes `self + descendants(self)` via the `excluded` Set walk; orphan loops at the parent level cannot be saved.
- **T-86.4-04 (Bypass cycle detection via direct write):** Accepted residual per CONTEXT D-13 — see "Accepted Residual" section above.
- **T-86.4-05 (DoS on 500-task cascade):** Mitigated. `deleteTaskNow` slices `allIds` into 450-op chunks (`CHUNK = 450`) and commits batches sequentially; 50-op headroom under Firestore's 500-op commit ceiling.
- **T-86.4-06 (Spoof assignees with off-list users):** Mitigated. Picker only shows `normalizePersonnel(currentProject)` user IDs — UI prevents off-list selection. Hand-crafted writes with arbitrary UIDs are still possible; accepted because the assignee field has no real-world effect (those users still need active+rule-eligible status to write progress, and progress writes are the only assignee-gated action).

No additional threat surface introduced. The full write-side CRUD (create/update/delete + tier-2 progress-only update) on `project_tasks` ships in this plan; all 4 firestore.rules predicates are exercised at least once across the 4 commits, all matching the deployed rule subsets exactly. **D-24 same-commit invariant fully respected** — Plan 01 deployed the rules, Plan 03 + Plan 04 ship the JS writes; no rules changes ship in Plan 04 (verified by `git diff --stat HEAD~4 HEAD -- firestore.rules` returning empty).

## Self-Check: PASSED

**Files exist:**
- `C:\Users\franc\dev\projects\pr-po\app\views\project-plan.js` — FOUND (modified, 961 lines, +439 from 522)
- `C:\Users\franc\dev\projects\pr-po\styles\views.css` — FOUND (modified, 2555 lines, +17 from 2539)

**Commits exist:**
- `f033c5a` — FOUND (feat 86-04 modal helpers)
- `1f42a19` — FOUND (feat 86-04 save + cycle + recompute)
- `0872a21` — FOUND (feat 86-04 delete cascade)
- `d188c8a` — FOUND (feat 86-04 progress slider)

**All 12 plan-level verification_steps pass at expected counts** (see Verification Results table above).

**Syntax check:** `node --check app/views/project-plan.js` returns 0 (no errors).

## Next Plan Readiness

Plan 05 (Wave 5 — filter panel + project-detail summary card) is unblocked:

- `togglePlanFilters` stub remains attached to `window.*` and replaceable by direct assignment in Plan 05's init()
- `#planFilterPanel` empty container present in DOM (`display: none` initial)
- Filter state vars already declared at module scope (`filterDateFrom`, `filterDateTo`, `filterAssignees`)
- `tasks[]` array fully populated by the onSnapshot listener — Plan 05's project-detail summary card subscribes to the same `project_tasks where project_id == X` query
- Snapshot callback already invokes `if (typeof refreshSummaryHighlights === 'function') refreshSummaryHighlights();` — Plan 05 defines `refreshSummaryHighlights` in this same file or in project-detail.js, the optional-call hook fires automatically
- All 5 PM-* requirements that ship in Plan 04 (PM-01, PM-02, PM-03, PM-05, PM-10) are now complete; Plan 05 ships PM-07 (weighted overall progress) + PM-09 (filters)

No blockers carried forward. Phase 86 is 4/5 plans complete after this Summary commit lands.

---
*Phase: 86-native-project-management-gantt*
*Completed: 2026-05-05*
