---
name: 86-CONTEXT
description: Decisions for Phase 86 — Native Project Management & Gantt. New project_tasks Firestore collection with hierarchy + FS dependencies + milestones + drag-editable Gantt rendered via Frappe Gantt CDN. Standalone split-pane route per project; projects-only this phase; visual+warn dep enforcement; locked-parent dates; duration-weighted leaf-only progress rollup; permissive task creation for assigned ops_user, strict per-task assignee writes for progress.
type: phase-context
---

# Phase 86: Native Project Management & Gantt - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can plan and run a project's work natively in CLMC — task hierarchy, FS dependencies, milestones, weighted progress rollup, and an interactive drag-editable Gantt view anchored to existing project records. Phase 86 is the **first build of native PM** in CLMC; no prior implementation exists. Independent slice — does not depend on Phase 83/84 notifications, Phase 85 collectibles, or Phase 87/88/89 Mgmt Tab work.

**In scope (PM-01..PM-11):**
- New Firestore collection `project_tasks` with fixed schema (project_id, task_id, parent_task_id, name, description, start_date, end_date, progress, is_milestone, dependencies array, assignees array)
- Standalone full-screen route per project — split-pane layout (task list left, interactive Gantt right)
- Hierarchy (unlimited nesting) + Finish-to-Start dependencies + milestone diamond markers
- Drag-resize (bar edges) + drag-reschedule (bar body) on the Gantt
- Inline progress edit from both task list and Gantt
- Filters: date range + assigned personnel
- Auto-rolled-up parent progress + weighted-by-duration project-overall progress on project-detail
- New "Project Plan" summary card on `project-detail.js` (task count, % complete, Highlights: most recent accomplishment + next milestone + ongoing milestone) with "Open Plan" button
- `firestore.rules` for `project_tasks` (read: any active user assigned to project; write: admins + assigned ops_user; progress write: also any user in task.assignees array)
- Frappe Gantt library loaded via CDN (mirrors Chart.js Phase 77.1 precedent)

**Out of scope (deferred):**
- Auto-trigger collectibles when task progress crosses billable thresholds (`PM-FUT-01`) → v4.1+
- ProjectLibre `.pod` file import (`PM-FUT-02`) → future phase
- Resource allocation view — workload across personnel (`PM-FUT-03`) → future
- Critical path highlighting (`PM-FUT-04`) → future
- Baseline vs actual variance reporting (`PM-FUT-05`) → future
- Cascading dependency auto-shift (Visual+warn ships in 86; revisit if users find manual reschedule painful)
- Hybrid parent date semantics (computed-but-overridable) — current is locked-computed
- Drag-from-bar-edge dependency creation (Frappe lacks native support; revisit if form picker is too slow)
- Right-click context menu for task ops (alternate UX if needed later)
- Services-side parallel surface — Phase 86 is projects-only
- Notifications: TASK_ASSIGNED, MILESTONE_REACHED, OVERDUE_DIGEST — defer to a follow-up notifications batch
- Task description rich text / file attachments
- CSV / print export of task list (likely useful; not asked, captured as Deferred)

</domain>

<decisions>
## Implementation Decisions

### Surface Placement & Navigation

- **D-01 — Standalone full-screen route per project:** New route `#/projects/:code/plan`. Project-detail page is NOT modified to host the Gantt directly — too cramped, would force a refactor of the existing single-scroll card layout. Mirrors how MRF Records works as its own surface (`#/procurement/records`).
- **D-02 — Single route, split-pane layout:** One URL renders BOTH the hierarchical task list (left rail) AND the interactive Gantt (right pane), always in sync. Like ProjectLibre / MS Project. Editing a task in the list reflects on the Gantt instantly and vice versa. No view-toggle, no sibling routes. Default split: ~35/65 (list/Gantt) — Claude's discretion on exact ratio + whether to make it user-resizable.
- **D-03 — Project Plan summary card on project-detail:** Add a new card on `project-detail.js` between "Status & Assignment" (line ~472) and the Delete button. Card content (top to bottom):
  - **Stats row:** Big numbers — `{N} tasks` and `{Y}% complete` (Y = duration-weighted overall, per D-12).
  - **Highlights section:** Three sub-cells — "Most recent accomplishment" (latest task to flip to 100%), "Next milestone" (earliest is_milestone=true with end_date >= today), "Ongoing milestone" (any is_milestone=true with progress < 100 AND start_date <= today <= end_date).
  - **CTA:** "Open Plan" button → navigates to `#/projects/:code/plan`.
  - Always-rendered for zero-state visibility (Phase 75 pattern). Empty-state copy: "No tasks yet — open the plan to get started."
- **D-04 — Projects-only this phase:** PM-10 schema mentions only `project_id`. Roadmap entry says "project's tasks" throughout. Service-detail is NOT modified; `services` collection does NOT get a parallel `service_tasks` surface in Phase 86. Captured in Deferred Ideas if services teams ask later.

### Gantt Rendering Tech

- **D-05 — Frappe Gantt via CDN:** Use `frappe-gantt` (MIT licensed, ~50KB minified, SVG-based). Loaded via CDN in `index.html` — pin to a specific version (researcher confirms latest stable; do NOT use `@latest`). Follows Chart.js Phase 77.1 CDN-load precedent. Built-in features used: bar drag-reschedule (PM-08), edge drag-resize (PM-08), FS dependency arrows (PM-03), zoom views (Day/Week/Month). Customization needed: hierarchy summary bars, milestone diamonds, today line.
- **D-06 — Hierarchy: indent in left rail + summary bar on Gantt for parents:** Left rail (task list) shows tree with indentation + collapse/expand chevrons (chevron styling = Claude's discretion). Gantt shows BOTH parents (rendered via Frappe `custom_class: 'parent-summary-bar'` — thin top-bar style spanning min(child.start) → max(child.end)) AND leaf children (default styling). Standard MS Project / ProjectLibre layout. Unlimited nesting depth allowed (no fixed cap).
- **D-07 — Zoom: Day / Week / Month, default Week:** Three of Frappe's built-in views. Toolbar control to switch. Week is the default for typical 1–6 month construction-style projects. No Quarter view; no Half-Day view; no auto-fit.
- **D-08 — Milestone marker: custom CSS class + SVG diamond overlay:** Tasks with `is_milestone === true` get `custom_class: 'milestone-marker'`. CSS hides the default rectangular bar (`display: none` on `.bar-progress` + `.bar`) and renders an absolutely-positioned SVG diamond at the task's `start_date` (size + color = Claude's discretion; lean filled-yellow or filled-blue). Stays inside the chart row; lines up with task in the left rail.
- **D-09 — Today line + auto-scroll to today on open:** Render a thin vertical line (color = Claude's discretion; lean red `#ef4444` or accent blue) at today's date across all Gantt rows. On view init, horizontally scroll the Gantt so today is centered (or left-aligned if project starts in the future). Standard PM-tool affordance. Implementation: SVG overlay anchored to today's x-coordinate after Frappe renders.

### Dependency & Date Semantics

- **D-10 — Visual + warn (no cascade) on FS violation:** When user drags Task A and Task B has a FS dependency on A, the drag is ALLOWED. After the drop:
  - Re-render Frappe Gantt with the new dates (single Firestore write for Task A).
  - If `A.end_date > B.start_date`, the dependency arrow is highlighted red AND a toast fires: "Task B now starts before Task A finishes — reschedule manually if needed."
  - User decides whether to fix manually. NO auto-cascade. NO multi-doc batch writes per drag. Keeps writes atomic, scope contained, no cycle-detection / conflict-resolution / undo machinery needed.
  - Rationale: matches MVP scope; users keep agency; Phase 86 is the first PM build — over-engineering cascade now risks breaking the "ship cleanly" goal.
- **D-11 — Parent task dates auto-computed (locked):** `parent.start_date = min(children.start_date)`, `parent.end_date = max(children.end_date)`. Recomputed and persisted on EVERY child write (in the same transaction or via read-modify-write of the parent doc). Parent bar's drag handles are DISABLED on the Gantt (Frappe `custom_class: 'parent-summary-bar'` with CSS `pointer-events: none` on the resize handles). Parent edit form's date fields are read-only with helper text: "Computed from subtasks". Standard PM-tool semantics. No "phase frame can differ from sum-of-tasks" inconsistency.
  - **Edge case:** Leaf task created with no parent → behaves as own root. Parent created with NO children yet → user-entered dates are seed values; first child write triggers auto-compute and overrides them.
- **D-12 — Progress rollup: duration-weighted, leaf-only:** Both parent.progress AND project-overall progress = `sum(leaf.progress × leaf.duration_days) / sum(leaf.duration_days)`. Parents are summary nodes — their progress reflects work done in their leaves. Matches PM-07 "weighted by duration" wording exactly. NO double-counting (parents are NOT included in either sum). Computed in JS on read; not persisted (mirror Phase 65 D-44 / Phase 85 D-19 derive-on-read pattern). Project-detail summary card (D-03) and the "% complete" cell on the plan view both use this formula.
  - **Edge cases:** Empty project (no leaves) → 0%. Single 0-duration milestone-only project → 100% if milestone.progress=100, else 0% (avoid div-by-zero).
- **D-13 — Dependency editing via multi-select dropdown on task edit form:** Task edit form has a "Depends on" multi-select listing all OTHER tasks in the same project (filter out: self, descendants of self, ancestors of self — to prevent obvious cycles). User adds/removes entries; Frappe Gantt redraws arrows from the resulting `dependencies[]` array. NO drag-from-bar-edge gesture (Frappe doesn't support natively; building it custom is significant scope creep). NO right-click on Gantt bar this phase.
  - **Cycle detection:** Validate before save — if A depends on B and B depends on A (transitively), reject the save with a clear error toast naming the cycle path.

### Permissions & Write Paths

- **D-14 — Task CREATE / EDIT / DELETE permissions:** `super_admin`, `operations_admin`, AND `operations_user` (only on projects in their `assigned_project_codes`) can create / edit / delete tasks. Mirrors how MRFs work today. Reuses the existing `isAssignedToProject(projectCode)` helper in `firestore.rules` (lines 70–82). Lets project managers in the field own their plans without admin bottleneck. `services_admin`, `services_user`, `finance`, `procurement` → READ-ONLY (no create/edit/delete).
- **D-15 — Progress UPDATE permissions (strict per-task assignee):** `super_admin`, `operations_admin`, OR (`operations_user` AND `request.auth.uid in resource.data.assignees`). Matches PM-11 wording exactly: "admins + assignees write progress". Security rule must check the assignees array on the task doc, not the project's personnel. Means: even if you're on the project, you can't update progress on a task you're not personally assigned to (unless you're an admin).
- **D-16 — Assignee picker source: project's personnel only:** When creating/editing a task, the "Assignees" picker shows ONLY users currently in the project's personnel pills (`project.personnel_user_ids` / equivalent — reuse `normalizePersonnel(currentProject)` from `app/utils.js`). Tight scope: prevents assigning random users to project tasks; reuses existing personnel workflow. If you need a new assignee, add them to the project's personnel first. Multi-select pill picker pattern (mirror `renderPersonnelPills` in `project-detail.js`).
- **D-17 — No notifications this phase:** Phase 83 plumbing exists, but the Phase 86 roadmap entry doesn't list notifications. Ship the PM/Gantt feature clean. TASK_ASSIGNED / MILESTONE_REACHED / OVERDUE_DIGEST → captured in Deferred Ideas for a future notifications batch. No new entries to `NOTIFICATION_TYPES`, no `createNotificationForUsers` calls in this phase.

### Security Rules (locked by PM-11; ships in same commit as first JS write — Phase 85 D-24 lesson)

- **D-18 — `project_tasks` collection rules:** Add new `match /project_tasks/{taskId}` block in `firestore.rules`. Use the "ADDING NEW COLLECTIONS" template at the top of the file. Without rules, even Super Admin will be denied (Phase 11 / Phase 65 D-71 lesson). Specifics:
  - **read / list:** any active user (consistent with how `mrfs` / `prs` / `pos` allow active-user read-by-default; project-scoping for ops_user happens at the JS query level via `where('project_id', '==', X)` rather than at the rule level — matches existing collections' pattern).
  - **create:** `hasRole(['super_admin', 'operations_admin'])` OR (`isRole('operations_user')` AND `isAssignedToProject(request.resource.data.project_code)`).
  - **update:** Two-tier check —
    1. **WBS field updates** (name, description, dates, parent_task_id, dependencies, is_milestone, assignees): same as create rule.
    2. **Progress-only updates** (only `progress` field changes): `hasRole(['super_admin', 'operations_admin'])` OR (`request.auth.uid in resource.data.assignees`).
    Implementation: rule uses `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress'])` to differentiate the two tiers.
  - **delete:** `hasRole(['super_admin', 'operations_admin'])` OR (`isRole('operations_user')` AND `isAssignedToProject(resource.data.project_code)`).
  - Deploy rules in the SAME commit as the first `addDoc` / `setDoc` in JS (Phase 85 D-24 lesson). Test with Super Admin first, then ops_user.

### ID Format & Persistence

- **D-19 — Task ID format: project-scoped sequential:** `task_id = TASK-{PROJECT-CODE}-{n}` where n is per-project sequential (e.g., `TASK-CLMC-ACME-001-1`, `TASK-CLMC-ACME-001-2`). Custom inline generator queries `project_tasks where project_id == X` for max n. Do NOT use `generateSequentialId()` — Phase 65.4 lesson learned (year-counter caused collisions). Mirrors Phase 85 D-20 COLL-{PROJECT-CODE}-{n}. Firestore document ID = task_id (not auto-ID), so docs are easy to look up by URL params and references.
  - **Clientless project handling:** If `project.project_code` is null (Phase 78 deferred-issuance), BLOCK task creation with: "This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks." Mirrors Phase 85 D-20 clientless-block path exactly.
- **D-20 — Schema (locked by PM-10) + denormalized fields:** Document shape:
  ```
  {
    task_id: 'TASK-{PROJECT-CODE}-{n}',          // also = doc ID
    project_id: 'firestore-id-of-project',
    project_code: 'CLMC-ACME-001',                // denormalized for security rule + queries
    parent_task_id: null | 'TASK-...',
    name: string,
    description: string,
    start_date: 'YYYY-MM-DD',                     // ISO date string (not timestamp — consistent with mrfs.date_needed)
    end_date: 'YYYY-MM-DD',
    progress: number,                              // 0–100
    is_milestone: boolean,
    dependencies: ['TASK-...', ...],               // FS dep — array of task_ids
    assignees: ['firebase-uid', ...],              // user UIDs from auth
    created_at: serverTimestamp,
    updated_at: serverTimestamp,
    created_by: 'firebase-uid'
  }
  ```
  `project_code` is denormalized so security rules can check `isAssignedToProject()` without an extra `get(/projects/...)` (mirrors how `mrfs.project_code` is denormalized in lines 264–267 of firestore.rules). Status is NEVER persisted — derived on read (mirror Phase 85 D-19).

### Filters & List Behaviour

- **D-21 — Filter set on the plan view:** Two filters per PM-09: (1) date range (from–to) — applies to task.start_date OR task.end_date overlapping the range; (2) assigned personnel — multi-select user picker from project's personnel. Independent filter state vars (Phase 65.1 pattern — no shared state). Filters apply to BOTH the left rail list AND the Gantt simultaneously. "All" defaults — no narrowing until user picks.
- **D-22 — No pagination on plan view:** Most projects have <100 tasks; pagination would break the Gantt's continuous timeline. If a project hits >500 tasks, defer to a follow-up (lazy-render rows). Don't pre-optimize.

### Claude's Discretion

- Exact split-pane proportions (default 35/65 left/right; whether to make it user-resizable via drag-handle)
- Collapse/expand chevron styling on left rail tree
- Parent summary bar styling: color, height differential vs leaf bars (lean charcoal/dark-gray thin top bar)
- Milestone diamond color and size (lean filled `#f59e0b` warning yellow or `#1a73e8` primary blue, ~14px)
- Today line color (lean `#ef4444` red or `#1a73e8` blue)
- Empty-state copy on plan view ("No tasks yet — click + to create your first task")
- Empty-state copy on project-detail summary card ("No tasks yet — open the plan to get started")
- Toast wording when FS dep is violated by drag (per D-10)
- Toast wording when cycle is detected on dep save (per D-13)
- Confirmation modal copy for task delete (especially for parents with subtasks: "Delete this task and its N subtasks?")
- Whether Gantt task-bar color reflects status / overdue / progress range — keep simple this phase (single project-color), revisit if user asks
- Whether to add a "Today" / "Reset zoom" toolbar button alongside zoom switcher
- Ordering in the left rail: by start_date ascending within each level (default), or alphabetical, or manual drag-reorder (defer manual drag if not asked — out of MVP)
- Date input control: native `<input type="date">` vs a date picker library (lean native — consistent with mrf-form.js)
- Whether to show a "Recompute parent dates" button on parent edit form (likely not needed since auto-compute fires on every child write; debug-only utility if added)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (always mandatory)
- `CLAUDE.md` — SPA Patterns: Window Functions for onclick (every Gantt action that hits HTML must be on `window`), Hash-Based Routing (sub-routes parsing — `#/projects/:code/plan` is a NEW shape, router needs param extraction), Firebase Listener Management (init/destroy lifecycle), status case-sensitive matching, Sequential ID Generation (custom inline per D-19), "ADDING NEW COLLECTIONS" template at top of `firestore.rules` (D-18).
- `.planning/PROJECT.md` — Out of Scope: Email notifications (in-app only), Mobile app, OAuth/SSO, Cloud Functions. Constraints: Firebase-only, no build system, zero-build static site.
- `.planning/REQUIREMENTS.md` §PM (lines 13–23) — PM-01..PM-11 locked requirements. PM-FUT-01..05 deferred enhancements (lines 87–91). PM trade-offs documented (lines 118–120).
- `.planning/ROADMAP.md` Phase 86 entry (lines 321–332) — goal, success criteria, requirements list, dependencies (none).

### Phase 85 Collectibles (most recent collection-introduction precedent — READ FIRST)
- `.planning/phases/85-collectibles-tracking/85-CONTEXT.md` — All 27 D-* decisions: D-19 derive-on-read status, D-20 custom inline ID generator + clientless-project block, D-24 security-rules-same-commit deploy. Phase 86 reuses the same patterns for derive-on-read computed values, project-scoped IDs, and rules-with-first-write deploy.
- `.planning/phases/85-collectibles-tracking/85-PATTERNS.md` — patterns mapping for new collection introduction.

### Phase 65 RFP/Payables (parent template for arrays-of-records-on-doc and security rules)
- `.planning/milestones/v3.2-phases/65-rfp-payables-tracking/65-CONTEXT.md` — D-44 derive-on-read status; D-71 security-rules-or-deny lesson (Phase 86 D-18 mirrors); read-modify-write pattern for array fields (relevant if we adopt for assignees array updates).
- `.planning/milestones/v3.2-phases/65.4-improve-rfp-code-generation-as-sometimes-i-get-duplicate-or-non-unique-codes-instead-lets-do-this-rfp-po-id-n/` — ID-format collision lesson informing D-19 project-scoped choice.

### Phase 78 clientless project handling (for D-19 block path)
- `.planning/milestones/v3.2-phases/78-allow-clientless-project-creation-with-deferred-project-code-issuance/` — Project-code deferral; task creation must block until `project_code` is issued. Block-message copy mirrors Phase 85 D-20 path.

### Phase 7 Assignments (for D-14, D-15, D-16 personnel + isAssignedToProject helper)
- `.planning/milestones/v2.0-phases/` (search for assignments phase) — `assignments` collection, `assigned_project_codes` field on user, `isAssignedToProject()` security helper. The `firestore.rules` helper at lines 70–82 is reused directly in D-18.
- `app/views/project-detail.js` — `renderPersonnelPills()` (lines ~496–530), `normalizePersonnel(currentProject)` from `app/utils.js`. Reuse for D-16 assignee picker.

### Phase 75 Always-render zero-state cells (for D-03 summary card)
- `.planning/milestones/v3.2-phases/75-paid-remaining-payable-cells-on-project-and-service-detail-financial-summary/` — Cells always-rendered for zero-state visibility. Project Plan card on project-detail follows same pattern.

### Phase 77.1 Chart.js CDN precedent (for D-05 Frappe Gantt CDN load)
- `index.html` lines 17–18 — `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js">`. Phase 86 follows the same pattern for `frappe-gantt`. Pin to a specific version, not `@latest`.

### Frappe Gantt (external library)
- `https://github.com/frappe/gantt` — MIT license. Researcher should pin the specific stable version, fetch upstream README for current API surface (`new Gantt(wrapper, tasks, options)`, `on_date_change`, `on_progress_change`, `change_view_mode`, `custom_class` per task, etc.). Confirm SVG diamond + today-line implementation patterns from issues / wiki.

### Trigger / integration sites (read these source files before planning)
- `app/views/project-detail.js` — Insert the new "Project Plan" summary card around line 472 (after Status & Assignment, before Delete). Reuse `formatDate`, `formatCurrency`, `escapeHTML` from `app/utils.js`.
- `app/views/projects.js` — Reference for project schema and personnel pill pattern.
- `app/router.js` — Add new sub-route `#/projects/:code/plan`. Param extraction for `:code` already supported (project-detail uses it).
- `app/firebase.js` — `db` instance and Firestore method exports.
- `app/utils.js` — `formatDate`, `formatCurrency`, `escapeHTML`, `normalizePersonnel`, `showToast`, `showLoading`, `downloadCSV` (deferred CSV export uses this).
- `app/components.js` — Status badges (likely reused for task progress / overdue indicators if added).
- `firestore.rules` — Template at top (lines 6–39); helper `isAssignedToProject()` (lines 70–82); existing collection patterns to mirror — `mrfs` (lines 255–277) for the project-scoped read pattern, `projects` (lines 200–233) for project-edit perms.
- `index.html` — Add Frappe Gantt `<script>` + CSS `<link>` near the Chart.js include (line 17).
- New file: `app/views/project-plan.js` — standalone view module with `render()` / `init()` / `destroy()`. Split-pane layout. Hosts the Gantt + task list.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getCurrentUser()`** (`app/auth.js`, `window.getCurrentUser`) — for `created_by`, `actor_id`, and progress-write permission checks at JS layer.
- **`canEditTab(tabName)`** (`window.canEditTab` from auth.js) — for show/hide of edit controls in render.
- **`formatDate(value)`** / **`formatCurrency(value)`** (`app/utils.js`) — table + summary card rendering.
- **`escapeHTML(value)`** (`app/utils.js`) — XSS-safe interpolation in HTML strings.
- **`normalizePersonnel(currentProject)`** (`app/utils.js`) — pulls `{ names[], userIds[] }` from project doc. Reuse for D-16 assignee picker source.
- **`showToast(message, type)`** (`app/utils.js`) — for D-10 violation warning, D-13 cycle error, success/failure feedback.
- **`showLoading()`** / `hideLoading()` (`app/utils.js`) — overlay during multi-doc writes.
- **Personnel pill rendering pattern** (`app/views/project-detail.js` `renderPersonnelPills`, lines ~496–530) — multi-select pill picker. Mirror exactly for the assignees picker on task edit form.
- **`downloadCSV(filename, headers, rows)`** (`app/utils.js`, Phase 41) — for deferred CSV export.
- **Status badge classes** — Phase 64+ — reuse for task overdue / in-progress / complete badges if added.
- **Right-click context menu pattern** — `app/views/procurement.js` / Phase 65.10 — captured as Claude's Discretion alternative for task ops if form-only proves slow.

### Established Patterns
- **Window functions for onclick** (CLAUDE.md): every onclick handler in HTML strings must be `window.fnName`. Attach in `init()`, delete in `destroy()`. Critical for the plan view since it's a single sub-route.
- **Firebase listener cleanup** (CLAUDE.md SPA): `let listeners = []`; push onSnapshot returns; in `destroy()`, `listeners.forEach(u => u?.())`. Same for `usersListenerUnsub`.
- **Hash-based sub-route parsing** (`app/router.js`): existing `#/projects/:code` already extracts `:code` as the param. New `#/projects/:code/plan` follows the same pattern; ensure router doesn't choke on the extra segment.
- **Tab-switch destroy() bypass** (CLAUDE.md): NOT relevant here since `#/projects/:code/plan` is its own view, not a tab within project-detail. Navigating from project-detail → plan triggers `destroy()` on project-detail and `init()` on project-plan. Navigating back triggers the inverse. Window functions must be cleaned up properly to avoid leak.
- **Case-sensitive status strings** (CLAUDE.md) — relevant for project status (`'On-going'`, etc.) referenced in summary card filters; not directly for tasks since task progress is numeric.
- **Custom inline sequential ID generator** (Phase 65.4 + Phase 85 D-20): `getDocs(query(collection(db, 'project_tasks'), where('project_id', '==', X)))`, parse max n from existing task_ids, increment + zero-pad. Project-scoped, not year-scoped.
- **Derive-on-read for computed values** (Phase 65 D-44, Phase 85 D-19): rolled-up parent.progress + project-overall progress are computed in JS on snapshot load — never persisted. Same applies to milestone status if added later.
- **Read-modify-write for parent date recompute** (Phase 65 array-of-records pattern): on child write, fetch parent doc, recompute min/max from all children, updateDoc parent with new dates. Atomic per-doc; cascades up the parent chain.
- **Always-render zero-state cells** (Phase 75): summary card on project-detail renders even with 0 tasks (empty-state copy).

### Integration Points
- **`app/router.js`** — Add `#/projects/:code/plan` sub-route. Likely a new top-level entry (not a tab inside `/projects` view), since the plan is a full-screen experience. Verify how project-detail's `#/projects/:code` is currently routed (path: /projects, param: code) and follow the same pattern with an extra `/plan` segment.
- **`app/views/project-detail.js`** lines ~452–472 — Insert new "Project Plan" card between "Status & Assignment" card and the Delete button. New module-scope state: `currentTasks = []`, `currentTaskListenerUnsub = null`. Init: subscribe to `query(collection(db, 'project_tasks'), where('project_id', '==', currentProject.id))`. Render computes summary stats (count, weighted %, highlights). Destroy: unsubscribe.
- **New file `app/views/project-plan.js`** — Standalone view. ~600–900 lines estimate. Sections:
  - State: `currentProject`, `tasks[]`, `users[]` (project personnel only), `listeners[]`, `gantt` (Frappe Gantt instance), `filters` (dateFrom, dateTo, assignees[]).
  - `render(activeTab, projectCode)` → returns split-pane HTML (left rail container + right Gantt container + toolbar with zoom switcher + filter panel + Add Task button).
  - `init()` → loads project, sets up onSnapshot listeners (project_tasks + project doc + users), computes hierarchy, renders left rail tree + initializes Frappe Gantt instance, attaches window functions, scrolls to today.
  - `destroy()` → unsubscribe listeners, destroy Gantt instance (`.destroy()` if Frappe exposes; else null the ref), delete window functions.
- **`firestore.rules`** — New `match /project_tasks/{taskId}` block per D-18. Two-tier update rule using `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress'])`.
- **`index.html`** — Add Frappe Gantt CDN script + CSS link near line 17 (Chart.js neighborhood). Pin specific version.
- **No changes to `app/views/services.js` / `app/views/service-detail.js`** — projects-only this phase per D-04.
- **No changes to `app/notifications.js`** — no notifications this phase per D-17.

</code_context>

<specifics>
## Specific Ideas

- **Summary card "Highlights" semantics:**
  - "Most recent accomplishment" = task whose `progress` last flipped to 100 (use `updated_at` desc, filter `progress === 100`, take top 1). If none: "No completed tasks yet."
  - "Next milestone" = `is_milestone === true`, `end_date >= today`, `progress < 100`, sorted by `end_date` asc, take top 1. If none: "No upcoming milestones."
  - "Ongoing milestone" = `is_milestone === true`, `progress < 100`, `start_date <= today <= end_date`. Could be more than one — show top 1 by earliest `start_date`. If none: "No active milestones."
- **Visual+warn copy** (D-10): "Task '{B.name}' now starts before Task '{A.name}' finishes. Reschedule manually if needed."
- **Cycle copy** (D-13): "This dependency would create a cycle: {A.name} → {B.name} → ... → {A.name}. Remove one of the deps to continue."
- **Clientless-project block copy** (D-19): "This project doesn't have a project code yet. Assign a client to issue the code, then return to plan tasks."
- **Empty-state on plan view** (Claude's discretion lean): "No tasks yet. Click + Add Task to get started."
- **Today line color** lean: `#ef4444` red (matches existing danger color in CLAUDE.md UI Design System).
- **Milestone diamond color** lean: `#f59e0b` warning yellow (distinct from primary blue task bars; matches existing warning color).
- **Parent summary bar style** lean: thin (4px tall), `#475569` charcoal, no progress fill — purely a "phase bracket" affordance.
- **Frappe Gantt version** — researcher pins to a specific stable version (avoid `@latest` per CDN-pinning convention from Chart.js Phase 77.1).
- **Plan view full-screen layout** — top toolbar (zoom Day/Week/Month + Add Task + Filter dropdown), then the split-pane (list left, Gantt right). Mirror procurement.js MRF Records full-screen feel.

</specifics>

<deferred>
## Deferred Ideas

### Locked-deferred per REQUIREMENTS.md (cross-reference here for traceability)
- **`PM-FUT-01`** — Per-task billable flag with auto-trigger of collectibles when task progress crosses thresholds (deferred from v4.0 to keep scope contained).
- **`PM-FUT-02`** — ProjectLibre `.pod` file import.
- **`PM-FUT-03`** — Resource allocation view (workload across personnel).
- **`PM-FUT-04`** — Critical path highlighting on Gantt.
- **`PM-FUT-05`** — Baseline vs actual variance reporting.

### Surfaced during Phase 86 discussion (new — capture for future phases)
- **Cascading dependency auto-shift** — current is visual+warn (D-10). Revisit if users find manual reschedule painful. Would need: cycle detection on cascade path, multi-doc batch writes, undo affordance.
- **Hybrid parent date semantics** (computed-but-overridable via "Detach from children" toggle) — current is locked-computed (D-11). Revisit if "phase frame can differ from sum-of-tasks" use case emerges.
- **Drag-from-bar-edge dependency creation** — current is form-picker (D-13). Revisit if form is too slow. Frappe Gantt doesn't support natively; would require custom pointer handling on top of the SVG.
- **Right-click context menu on Gantt bar** for task ops (edit / delete / mark milestone / quick-add dep) — alternate UX. Reuses Phase 65.10 right-click pattern.
- **Auto-fit zoom** to project span on first load — current is "default Week, user picks" (D-07). Revisit if multi-year projects appear.
- **Mini timeline strip on Project Plan summary card** — visual polish. Defer.
- **Services-side parallel surface** — Phase 86 is projects-only (D-04). Revisit if services teams ask. Would mirror Phase 85 department-discriminator pattern (`task_owner: 'projects' | 'services'`) or carve a sibling `service_tasks` collection.
- **TASK_ASSIGNED notifications** — defer to a future notifications batch (D-17). Add `TASK_ASSIGNED` enum + `createNotificationForUsers` call when assignee added.
- **MILESTONE_REACHED notifications** — same batch. Fire when `is_milestone && progress` flips to 100.
- **OVERDUE_DIGEST notification** — daily digest of overdue tasks per assignee. Needs scheduler — Cloud Functions out of scope per PROJECT.md, so requires client-side derive on view-load + dedup. Lower priority.
- **Task description rich text** (markdown / WYSIWYG) and file attachments — current is plain text. Revisit if users ask.
- **CSV / print export of task list** — likely useful; not asked. Reuse `downloadCSV` from `app/utils.js`. Defer.
- **Manual drag-reorder of tasks within parent** — not in MVP. Default ordering = `start_date` asc. Add manual reorder if users request a specific WBS layout.
- **Pagination / lazy-render for >500-task projects** — not pre-optimized (D-22). Add if a real project hits the wall.
- **Edit history / audit trail on tasks** — Phase 25 `edit_history` subcollection pattern exists for projects. Could extend to project_tasks. Defer until users ask for accountability traces.
- **Soft-delete for tasks** (move to `deleted_project_tasks`) — current is hard-delete. Mirror `deleted_mrfs` pattern if users need recovery.
- **Inline keyboard shortcuts** (Tab to indent, Shift-Tab to outdent, Enter to add sibling) — power-user UX. Defer.
- **Today / Reset zoom toolbar buttons** — likely needed; Claude's discretion to add inline.

</deferred>

---

*Phase: 86-native-project-management-gantt*
*Context gathered: 2026-05-05*
