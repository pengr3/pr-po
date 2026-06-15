# Phase 86: Native Project Management & Gantt - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 86-native-project-management-gantt
**Areas discussed:** Surface placement & navigation, Gantt rendering tech, Dependency & date semantics, Permissions & write paths

---

## Surface Placement & Navigation

### Q1: Where should the task-management surface live?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone route per project | Full-screen view at `#/projects/:code/plan`. Project-detail gets a card+button entry. | ✓ |
| New card section inside project-detail | Embed list + small Gantt as a new card on project-detail. | |
| Tabbed sub-nav inside project-detail | Refactor project-detail into Overview/Tasks/Gantt tabs. | |
| Modal deep-dive (mirror Financial Breakdown) | Reuse `app/expense-modal.js` modal pattern. | |

**User's choice:** Standalone route per project (Recommended)
**Notes:** Mirrors how procurement.js MRF Records works as its own surface. Doesn't bloat project-detail page.

### Q2: How should the standalone surface be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Single route, split-pane | One URL renders both list + Gantt side by side. | ✓ |
| Two sibling routes (Tasks + Gantt) | Separate routes, toggle between them. | |
| Single route, view toggle | One URL, top-of-page List/Gantt toggle (one shown at a time). | |

**User's choice:** Single route, split-pane (Recommended)

### Q3: Entry point from project-detail?

| Option | Description | Selected |
|--------|-------------|----------|
| New card with task summary + button | Project Plan card with stats + "Open Plan" CTA. | ✓ |
| Button only (no summary card) | Single button somewhere on project-detail. | |
| Top-level nav link 'Plans' | Global Plans nav listing all projects. | |

**User's choice:** New card with task summary + button (Recommended)

### Q4: What should the summary card show?

| Option | Description | Selected |
|--------|-------------|----------|
| Total task count + overall % complete | Two big numbers — minimum status. | ✓ |
| Overdue task count | "N tasks overdue" with red tint. | |
| Next milestone preview | Name + date of next upcoming milestone. | |
| Mini timeline strip | Small visual strip of project span. | |

**User's choice:** Total task count + % complete (Recommended) PLUS user-added freeform: "Highlights, like what's accomplished most recently, next milestone, ongoing milestone"
**Notes:** User added a Highlights section combining: most recent accomplishment + next milestone + ongoing milestone. Captured in CONTEXT.md D-03 with concrete derivation rules.

### Q5: Services-side parity?

| Option | Description | Selected |
|--------|-------------|----------|
| Projects-only this phase | Schema mentions only `project_id`; ship narrow. | ✓ |
| Both projects and services | Mirror Phase 85 department-discriminator pattern. | |

**User's choice:** Projects-only this phase (Recommended)

---

## Gantt Rendering Tech

### Q1: Library or custom build?

| Option | Description | Selected |
|--------|-------------|----------|
| Frappe Gantt via CDN | MIT, ~50KB SVG-based, built-in drag/resize/deps/zoom. | ✓ |
| Custom HTML/CSS + SVG arrows | Hand-roll with absolute-positioned divs + native drag. | |
| JSGantt-Improved via CDN | BSD, more PM-tool-like, more dated visual style. | |
| DHTMLX Gantt (GPL/commercial) | Most feature-complete; license incompatible without paid seat. | |

**User's choice:** Frappe Gantt via CDN (Recommended)
**Notes:** Follows Chart.js Phase 77.1 CDN-load precedent. Library handles drag/resize/dependency-arrows out of box.

### Q2: Hierarchy rendering on Gantt?

| Option | Description | Selected |
|--------|-------------|----------|
| Indent in left rail + summary bar on Gantt | Tree on left with chevrons; parent summary bars + leaf bars on Gantt. | ✓ |
| Indent in left rail; leaf tasks only on Gantt | Tree on left; only leaves rendered as bars; parents implicit. | |
| Flat (single level) | Disallow nesting beyond one level. | |

**User's choice:** Indent in left rail + summary bar on Gantt (Recommended)
**Notes:** MS Project / ProjectLibre layout. Frappe `custom_class` used to style parent summary bars.

### Q3: Zoom levels and default?

| Option | Description | Selected |
|--------|-------------|----------|
| Day / Week / Month, default Week | Three Frappe built-ins; Week fits 1–6 month projects. | ✓ |
| Day / Week / Month / Quarter, default Month | Four views; Quarter rarely useful at this team's scale. | |
| Auto-fit to project span | Pick zoom automatically. | |

**User's choice:** Day / Week / Month, default Week (Recommended)

### Q4: Milestone diamond rendering?

| Option | Description | Selected |
|--------|-------------|----------|
| Custom CSS class + SVG diamond overlay | Frappe `custom_class` hides default bar; diamond renders at start_date. | ✓ |
| Force milestone duration to 0 | 1-pixel bar restyled via CSS. | |
| Render milestones in separate strip above Gantt | Strip on top + tasks Gantt below. | |

**User's choice:** Custom CSS class + SVG diamond overlay (Recommended)

### Q5: Today line and initial scroll?

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical today line + auto-scroll on open | Line rendered + chart scrolls to today centered. | ✓ |
| Today line, but no auto-scroll | Line rendered; opens at project start. | |
| No today indicator | Skip the marker. | |

**User's choice:** Vertical today line + auto-scroll to today on open (Recommended)

---

## Dependency & Date Semantics

### Q1: FS dependency enforcement when dragging tasks?

| Option | Description | Selected |
|--------|-------------|----------|
| Visual + warn | Drag allowed; arrow turns red + toast if FS violated. | ✓ |
| Auto-cascade dependents | Multi-doc batch writes; dependents auto-shift. | |
| Block the drag | Refuse drops that would violate any FS dep. | |
| No dependency enforcement at all | Save dates, render arrow, ignore violations. | |

**User's choice:** Visual + warn (Recommended)
**Notes:** Lowest-risk MVP. No auto-cascade machinery (cycle detection, undo, conflict resolution) needed.

### Q2: Parent task date semantics?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-computed (locked) | parent.start = min(children.start), parent.end = max(children.end). | ✓ |
| Independently editable | Parent and children dates fully independent. | |
| Hybrid (default-computed, override-able) | "Detach from children" toggle. | |

**User's choice:** Auto-computed (locked) (Recommended)

### Q3: Progress rollup formula (PM-02 + PM-07)?

| Option | Description | Selected |
|--------|-------------|----------|
| Duration-weighted, leaf-only | sum(leaf.progress × leaf.duration) / sum(leaf.duration). | ✓ |
| Equal-weight average across direct children | Ignores duration. | |
| Duration-weighted, all tasks | Includes parents — risks double-counting. | |

**User's choice:** Duration-weighted, leaf-only (Recommended)

### Q4: How does a user create/edit a dependency?

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-select dropdown on task edit form | Pick from list of other tasks. | ✓ |
| Drag-from-bar-edge on Gantt | Connector handle appears on hover; drag to target bar. | |
| Right-click context menu on Gantt bar | Right-click → "Add dependency to..." picker. | |

**User's choice:** Multi-select dropdown on task edit form (Recommended)
**Notes:** Frappe Gantt doesn't natively support drag-from-bar-edge. Form picker is simplest + accessible.

---

## Permissions & Write Paths

### Q1: Who can CREATE / EDIT tasks (the WBS)?

| Option | Description | Selected |
|--------|-------------|----------|
| Admins + ops_user-on-assigned-projects | super_admin, operations_admin, plus operations_user on assigned projects. | ✓ |
| Admins only | Only super_admin + operations_admin. | |
| All active users on the project | Anyone in project personnel. | |

**User's choice:** Admins + ops_user-on-assigned-projects (Recommended)
**Notes:** Reuses `isAssignedToProject()` helper in `firestore.rules`.

### Q2: What does 'assignee' mean for the progress-write rule (PM-11)?

| Option | Description | Selected |
|--------|-------------|----------|
| User in the task's assignees array | Strict per-task ownership; rule checks `request.auth.uid in resource.data.assignees`. | ✓ |
| User assigned to the project (broader) | Any project member can update any task's progress. | |
| Admins only | Only super_admin + operations_admin. | |

**User's choice:** User in the task's assignees array (Recommended)
**Notes:** Matches PM-11 wording exactly. Admins also allowed (super_admin, operations_admin).

### Q3: Where does the assignee picker pull users from?

| Option | Description | Selected |
|--------|-------------|----------|
| Project's assigned personnel only | Picker shows only users in project.personnel_user_ids. | ✓ |
| All active users | Picker shows all active users. | |
| Project personnel + admins (escape hatch) | Project personnel by default; admins can switch to all-users. | |

**User's choice:** Project's assigned personnel only (Recommended)

### Q4: Should TASK_ASSIGNED notifications fire (Phase 83 plumbing exists)?

| Option | Description | Selected |
|--------|-------------|----------|
| No notifications this phase | Roadmap doesn't list notifications — keep scope clean. | ✓ |
| Fire TASK_ASSIGNED only | One notification per added assignee. | |
| Fire TASK_ASSIGNED + MILESTONE_REACHED | Both: assignment + milestone-progress-100. | |

**User's choice:** No notifications this phase (Recommended)
**Notes:** TASK_ASSIGNED, MILESTONE_REACHED, OVERDUE_DIGEST captured as Deferred Ideas for a future notifications batch.

---

## Claude's Discretion

The user delegated the following implementation choices to Claude — all captured in CONTEXT.md `### Claude's Discretion` block. Highlights:

- Exact split-pane proportions (default 35/65 left/right; user-resizable optional)
- Collapse/expand chevron styling on left rail tree
- Parent summary bar styling (lean thin charcoal)
- Milestone diamond color/size (lean filled #f59e0b warning yellow, ~14px)
- Today line color (lean #ef4444 red)
- Empty-state copy (plan view + summary card)
- Toast wording for FS violation + cycle detection
- Confirmation modal copy for task delete (especially parents-with-subtasks)
- Whether Gantt task-bar color reflects status / overdue (keep simple this phase)
- Whether to add a Today / Reset zoom toolbar button
- Default left-rail ordering (start_date asc within each level — no manual drag-reorder in MVP)
- Date input control (lean native `<input type="date">`)

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` block. Summary:

**Locked-deferred per REQUIREMENTS.md:** PM-FUT-01 (per-task billable + auto-trigger collectibles), PM-FUT-02 (.pod import), PM-FUT-03 (resource allocation), PM-FUT-04 (critical path), PM-FUT-05 (baseline vs actual variance).

**Surfaced during Phase 86 discussion:** Cascading dep auto-shift, hybrid parent dates, drag-from-bar-edge dep creation, right-click context menu, auto-fit zoom, mini timeline strip on summary card, services-side parallel surface, TASK_ASSIGNED / MILESTONE_REACHED / OVERDUE_DIGEST notifications, task description rich text, file attachments, CSV/print export, manual drag-reorder, pagination for >500-task projects, edit history / audit trail, soft-delete, inline keyboard shortcuts, Today / Reset zoom toolbar buttons.
