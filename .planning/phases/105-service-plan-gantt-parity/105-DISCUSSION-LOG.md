# Phase 105: Service Plan (Gantt) Parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 105-service-plan-gantt-parity
**Areas discussed:** Build approach, Service task data model, Recurring vs one-time scope, Feature carryover cutoff, Permissions

---

## Build approach

| Option | Description | Selected |
|--------|-------------|----------|
| Copy-adapt new file | Duplicate project-plan.js → service-plan.js, swap identifiers. Phase 26/104 precedent. Shipped project plan byte-untouched (zero regression risk). Cost: a second 4,800-line file to maintain. | ✓ |
| Shared core engine | Extract parameterized gantt-plan-core.js; thin project/service wrappers. Lowest long-term maintenance. Cost: biggest refactor, rewrites the shipped project plan with no test harness. | |
| Parameterize in place | Make project-plan.js serve both routes via a mode param. One file. Cost: invasive edits to the most fragile file; high regression risk to shipped projects. | |

**User's choice:** Copy-adapt new file (Recommended)
**Notes:** Motivated by protecting the shipped project plan — largest, most-iterated, most-fragile file in the app; no automated test harness (browser-UAT-only SPA). Operator rejected both refactor options because they rewrite shipped project code with no safety net.

---

## Service task data model

| Option | Description | Selected |
|--------|-------------|----------|
| Separate service_tasks collection | New top-level service_tasks (parallel to project_tasks): service_id + denormalized service_code, same schema. Plus deferred service_iterations + services/{id}/baselines. Clean new rules block; zero risk to existing project_tasks. | ✓ |
| task_owner discriminator | Reuse project_tasks with task_owner: 'projects'|'services'. One collection. Cost: every existing project_tasks query + rule needs a task_owner filter (regression risk); departments mixed. | |

**User's choice:** Separate service_tasks collection (Recommended)
**Notes:** Mirrors Phase 104's separation; protects existing project_tasks reads/writes/rules from change.

---

## Recurring vs one-time scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both types | One-time AND recurring services get the plan + route. Mirrors 104 D-01 (max parity). Recurring teams can use it for scheduled maintenance windows. | ✓ |
| One-time only | Only one-time services get a plan; recurring keeps just the journal. Smaller surface, but a parity gap (echoes 104 D-13 recurring divergence). | |

**User's choice:** Both types (Recommended)
**Notes:** Consistent with the operator's maximum-parity pattern. The 104 D-13 recurring divergence applies to the portfolio signal only, not the plan surface.

---

## Feature carryover cutoff

| Option | Description | Selected |
|--------|-------------|----------|
| Core Gantt, defer baseline+iterations | Mirror the full editable Gantt (grid, hierarchy, deps, milestones, progress, critical path, PDF, copy/paste, multi-select, search) + summary card. Defer baseline (86.12) + iterations (97) to 105.1. Fewer new collections/rules/UAT. | ✓ |
| Full 1:1 mirror now | Everything including baseline + iterations. Adds service_iterations + services/{id}/baselines + 2 rules blocks + their UAT (incl. the 97 diff/undo flow). | |
| Minimal core only | Also strip critical path / PDF / copy-paste / multi-select. Leanest, but means deleting working code from the copied file and a bigger parity gap. | |

**User's choice:** Core Gantt, defer baseline + iterations (Recommended)
**Notes:** Under copy-adapt, in-file features (critical path, PDF, copy/paste, multi-select, search) come along free; only the two collection-backed subsystems carry real added cost (new collection + rules + independent UAT), so those are the natural deferral to 105.1.

---

## Permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror exactly with service roles | super_admin + services_admin = full task CRUD; assigned services_user (isAssignedToService) = full CRUD; progress-only tier = admins OR uid in task.assignees. Assignee picker from service personnel_user_ids. | ✓ |
| Admins build, assignees update progress | Only admins create/edit/delete; services_user read-only on structure, progress-only on assigned tasks. More top-down divergence. | |

**User's choice:** Mirror exactly with service roles (Recommended)
**Notes:** Direct swap of project D-14/D-15 (operations→services, isAssignedToProject→isAssignedToService). Field-team services_user owns their own plans, matching how project ops_user works.

---

## Claude's Discretion

Inherited verbatim from the project plan's already-locked decisions (Phase 86 D-05..D-22 + Claude's-Discretion list) — the planner copies these, does NOT re-decide:
- Split-pane ratio (35/65 + resizable), milestone diamond color/size, today-line color, parent summary-bar style, zoom default (Week), empty-state copy, toast wording, native date inputs, ordering (start_date asc), no pagination.
- CSS verbatim-reuse vs service-scoped duplicate (mirror the 104 CSS-reuse evaluation).
- Service-namespace window-function names; whether service-task-id is a new file or extends task-id.js.
- Summary-card insertion point on service-detail.js.
- Whether to tighten service_tasks read to isAssignedToService for services_user vs. the project_tasks isActiveUser default (researcher/planner verify against the services list-rule shape).

## Deferred Ideas

- **Phase 105.1:** Baseline snapshot for services (mirror 86.12; services/{id}/baselines subcollection) + Iterations/save-game (mirror 97/97.1/97.2; service_iterations collection + diff/undo flow).
- **Beyond milestone:** PM-FUT-01..05 enhancements (resource allocation, ProjectLibre import, billable-task auto-collectibles) for both surfaces; task/milestone notifications for services (mirror 86 D-17 none).
- **Carry debt:** prod firestore.rules deploy — dev-only this phase; rides the standing v3.3 → main merge debt (87.4/99/100/101/102/103.1/104).
