---
phase: 105-service-plan-gantt-parity
plan: 03
subsystem: ui
tags: [service-detail, service-tasks, plan-card, onSnapshot, parity]

# Dependency graph
requires:
  - phase: 105-02
    provides: service-plan.js view + #/services/{code}/plan route
  - phase: 86-native-project-management-gantt
    provides: project-detail.js buildPlanCardHtml + computeProjectProgress + ensureTasksListener (analogs)

provides:
  - app/views/service-detail.js — buildServicePlanCardHtml + computeServiceProgress + ensureTasksListener (card stats) + card insertion in render tail

affects: [105 UAT, service-detail.js, service_tasks collection reads]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror project-detail.js Phase 86 plan card: computeServiceProgress (pure fn) + buildServicePlanCardHtml (HTML builder)"
    - "Idempotent onSnapshot listener (ensureTasksListener) torn down in BOTH init() re-init block AND destroy() (same-view-nav gotcha)"
    - "CSS class project-plan-card reused verbatim (generic, not project-namespaced)"
    - "iterStrip/currentIterationLabel omitted (D-05 deferred to Phase 105.1)"
    - "Private helpers _computeDurationDaysLocal/_todayLocalService avoid naming collision with project-detail scope"

key-files:
  created: []
  modified:
    - app/views/service-detail.js

key-decisions:
  - "Private helper names (_computeDurationDaysLocal, _todayLocalService) used instead of bare computeDurationDays/todayLocal to avoid potential future naming conflicts within the same module scope"
  - "ensureTasksListener placed before ensureServiceBillingRequestsListener in file — follows the existing idempotent-listener convention"
  - "planCardHtml built in renderServiceDetail() alongside proposalCardHtml, inserted immediately after it in the render template"

requirements-completed: []

# Metrics
duration: ~30min
completed: 2026-06-15
---

# Phase 105 Plan 03: Service Plan Card on Service Detail Summary

**"Service Plan" summary card added to service-detail.js — live task stats from service_tasks onSnapshot, Open Plan CTA to #/services/{code}/plan, mirroring project-detail's plan card (D-01)**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-15
- **Completed:** 2026-06-15 (auto tasks complete; checkpoint:human-verify pending)
- **Tasks:** 2 auto + 1 checkpoint:human-verify (browser UAT gate)
- **Files modified:** 1

## Accomplishments
- Added module-level state: `currentTasks = []`, `currentTasksListenerUnsub = null`, `currentServiceProgress = { ...default shape... }` (mirror project-detail.js:42)
- Mirrored `computeProjectProgress` as `computeServiceProgress(tasks)` — pure function over tasks array, returns `{taskCount, leafCount, doneCount, percentComplete, health, overdueCount, overdueMore, overdueTasks[], upcomingTasks[], recentDone}`. Added private helpers `_computeDurationDaysLocal` and `_todayLocalService`.
- Mirrored `buildPlanCardHtml` as `buildServicePlanCardHtml()` with all required identifier swaps: `currentServiceProgress`, `currentService`, `service_code`, element id `servicePlanCard`, heading "Service Plan", CTA disabled-title "No service code". CSS class `project-plan-card` kept verbatim. `iterStrip`/`currentIterationLabel` block omitted (D-05).
- Added `const planCardHtml = buildServicePlanCardHtml()` near `proposalCardHtml` construction in `renderServiceDetail()`.
- Inserted `${planCardHtml}` into the render tail between `${proposalCardHtml}` and `${_buildServiceJournalPanelHtml(currentService)}`.
- Added `ensureTasksListener()` — idempotent onSnapshot on `service_tasks` where `service_id == currentService.id`. On snapshot: rebuilds `currentTasks`, recomputes `currentServiceProgress = computeServiceProgress(currentTasks)`, then re-renders `servicePlanCard` in-place via `replaceWith`.
- Wired `ensureTasksListener()` call in init() after `currentService` is set (alongside `ensureServiceBillingRequestsListener` + `ensureServiceCollectiblesListener`).
- Added `currentTasksListenerUnsub` teardown in init() re-init block (same-view-nav gotcha — router skips `destroy()` on service→service navigation).
- Added `currentTasksListenerUnsub` teardown in `destroy()` (normal navigation teardown).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add computeServiceProgress + buildServicePlanCardHtml + module state** — `43281d4` (feat)
2. **Task 2: Wire service_tasks listener + teardown + insert card in render tail** — `b743b60` (feat)
3. **Task 3: Browser UAT checkpoint** — awaiting human verification

## Files Created/Modified
- `app/views/service-detail.js` (MODIFIED) — 3 groups of additions:
  - Module state block: `currentTasks`, `currentTasksListenerUnsub`, `currentServiceProgress`
  - `ensureTasksListener()` function + `_computeDurationDaysLocal()` + `_todayLocalService()` + `computeServiceProgress()` + `buildServicePlanCardHtml()` (161 lines added in Task 1, 32 lines added in Task 2)
  - Render tail: `${planCardHtml}` inserted between proposal card and journal panel

## Decisions Made
- Used private helper names `_computeDurationDaysLocal` and `_todayLocalService` (underscore prefix) to avoid ambiguity if the project-detail analogs are ever merged into a shared module — keeps naming distinct in the single-file SPA context.
- `ensureTasksListener` placed before `ensureServiceBillingRequestsListener` in the file (Phase 105 section header precedes Phase 99.1 section).
- Card HTML built in `renderServiceDetail()` synchronously (same pattern as `proposalCardHtml` — built inline before the template literal, not async).

## Deviations from Plan

None — plan executed exactly as written. All identifier swaps applied correctly; no `project_*` identifiers leaked in the new code (`grep` confirms 0 hits for `currentProjectProgress`, `currentProject`, `project_tasks`, `project_code` in new additions).

## Known Stubs
None — `buildServicePlanCardHtml()` renders all states (empty, in-progress, complete) from live `service_tasks` data. The card is not a stub; it is fully wired to the onSnapshot listener.

## Threat Flags
None — T-105-09 (information disclosure via service_tasks read) mitigated: query scoped `where('service_id','==',currentService.id)`. T-105-10 (orphaned listener DoS) mitigated: listener torn down in both init() re-init block AND destroy(). No new network endpoints or schema changes.

## Browser UAT Gate (Task 3 — checkpoint:human-verify)

All 2 auto tasks are complete and committed. Browser UAT must verify:

1. Open a service detail page that has service_tasks (create a couple in the plan first). Confirm the "Service Plan" card shows the correct task count, % complete, health badge, and overdue/upcoming highlights.
2. Open a service with NO tasks → the card shows the empty-state ("No tasks yet. Open the plan to get started.") + enabled "Open Plan" CTA.
3. Click "Open Plan" → navigates to `#/services/{service_code}/plan`.
4. With the detail page open, edit a task's progress in another tab/window → the card updates live (onSnapshot re-render in place).
5. Open a service WITHOUT a service_code (if any) → "Open Plan" is disabled (greyed, "No service code" title).
6. Navigate service → service (same view) → confirm the prior service's card data does NOT leak (re-init teardown works); navigate away to another view and back → no duplicate/orphaned listener, zero console errors.
7. Confirm NO iterations/save-game strip appears on the card (deferred to 105.1).

Reply "approved" or list failures.

## Self-Check

**Files exist:**
- `app/views/service-detail.js` — modified in commits `43281d4` and `b743b60`

**Commits exist:**
- `43281d4` — Task 1: computeServiceProgress + buildServicePlanCardHtml + module state
- `b743b60` — Task 2: wire service_tasks listener + teardown + insert card

## Self-Check: PASSED
