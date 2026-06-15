---
phase: 105-service-plan-gantt-parity
verified: 2026-06-15T08:00:00Z
status: passed
human_gate: acknowledged 2026-06-15 — operator approved all 3 plans' browser UAT (105-01 "deployed", 105-02 "UAT approved", 105-03 "approve") and confirmed formal gate closure
score: 14/14 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open #/services/{service_code}/plan and create/edit service tasks end-to-end"
    expected: "Split-pane grid + Frappe Gantt renders; task create writes TASK-{service_code}-N to service_tasks; indent/progress rollup/predecessor/milestone/drag/zoom/PDF export all function; no baseline toolbar, no iterations rail"
    why_human: "Browser UAT already performed and recorded as approved in 105-02-SUMMARY.md — this item is carried forward as the definitive human gate, not re-requiring re-test"
  - test: "Service Plan card on service-detail.js — live stats, Open Plan CTA, clientless-disable, same-view teardown"
    expected: "Card shows task count/percent/health/overdue; updates live via onSnapshot; 'Open Plan' CTA navigates to service plan; disabled when no service_code; no card data leaks on service-to-service navigation"
    why_human: "Browser UAT already performed and recorded as approved in 105-03-SUMMARY.md — this item is carried forward as the definitive human gate"
---

# Phase 105: Service Plan Gantt Parity — Verification Report

**Phase Goal:** Mirror the project plan / Gantt subsystem (project-plan.js + project-detail plan card) to services — a new service_tasks data model, an editable #/services/{service_code}/plan Gantt view, and a Service Plan summary card on service-detail.js. The two deferred collection-backed subsystems (baseline 86.12 + iterations 97) are intentionally OUT of scope (deferred to 105.1).
**Verified:** 2026-06-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A new top-level service_tasks Firestore collection is authorized by a dedicated rules block | VERIFIED | `match /service_tasks/{taskId}` block at firestore.rules:747; `allow read: if isActiveUser()` at :749; brace-balanced (79/79) |
| 2 | service_tasks rules mirror project_tasks two-tier write gates with services roles | VERIFIED | Tier 1 uses `hasRole(['super_admin','services_admin'])` + `isRole('services_user') && isAssignedToService`; Tier 2 uses `affectedKeys().hasOnly(['progress','updated_at'])` + uid-in-assignees check; 4 `isRole('services_user')` guards present in block |
| 3 | A service task ID generator produces TASK-{service_code}-{seq} per-service sequential IDs | VERIFIED | `app/service-task-id.js` exports `generateServiceTaskId(serviceCode)`; queries `where('service_code','==',serviceCode)`; returns `TASK-${serviceCode}-${maxNum+1}`; `node --check` passes |
| 4 | project_tasks rules block stays byte-untouched | VERIFIED | `git log ffd6e8c..HEAD -- app/task-id.js` empty; `git log ffd6e8c..HEAD -- app/views/project-plan.js` empty; project_tasks block at firestore.rules:688-720 unchanged by Phase 105 commits |
| 5 | Dev firestore rules deployed so service_tasks reads/writes succeed under UAT | VERIFIED | Operator confirmed "deployed" — recorded in 105-01-SUMMARY.md human-verify gate; UAT subsequently passed (105-02-SUMMARY.md) confirming deployment was live |
| 6 | User can open #/services/{service_code}/plan and see the split-pane grid + Frappe Gantt | VERIFIED (code) | `app/views/service-plan.js` (3692 lines); render() returns `plan-view-surface` with `plan-split-pane`, `task-grid-rail`, `gantt-pane`; route wired in router.js at 4 touchpoints; confirmed in UAT |
| 7 | User can create, edit, indent/outdent, and reschedule service tasks; progress rolls up duration-weighted leaf-only | VERIFIED (code + UAT) | All write-path guards use `currentService?.service_code`; `generateServiceTaskId` imported from `service-task-id.js`; core features (renderGantt, renderTaskGrid, criticalPath, exportPlanPdf, search) confirmed present (99 hits); UAT approved in 105-02-SUMMARY |
| 8 | Both one-time AND recurring services reach the plan (no service-type gating) | VERIFIED (code + UAT) | No service-type conditional in service-plan.js init() or render(); UAT explicitly verified "both one-time AND recurring service types reach the plan" — recorded in 105-02-SUMMARY |
| 9 | service-plan.js writes service_tasks with TASK-{service_code}-{seq} IDs via generateServiceTaskId | VERIFIED | 4 `generateServiceTaskId` calls in service-plan.js; 0 `project_code` leaks; 4 write guards check `currentService?.service_code`; UAT verified write produces TASK-{service_code}-1 then -2 |
| 10 | The deferred baseline (86.12) and iterations (97) subsystems are NOT ported | VERIFIED | `grep -ci "baseline"` returns 0; `grep -c "Iteration\|iterRail\|iterDiff\|undoIterRestore\|saveIteration\|loadIterations\|_autoSnapId"` returns 0; `renderTodayLine` confirmed present |
| 11 | project-plan.js stays byte-untouched | VERIFIED | `git log ffd6e8c..HEAD -- app/views/project-plan.js` returns empty — no Phase 105 commits touched project-plan.js |
| 12 | service-detail.js shows a Service Plan summary card mirroring the project-detail plan card | VERIFIED | `buildServicePlanCardHtml()` at service-detail.js:3592; `computeServiceProgress()` at :3527; `id="servicePlanCard"` in HTML output; `class="project-plan-card"` reused verbatim; "Service Plan" heading at :3599; Open Plan CTA links to `#/services/${encodeURIComponent(currentService?.service_code || '')}/plan` |
| 13 | The card updates live via a service_tasks onSnapshot scoped by service_id | VERIFIED | `ensureTasksListener()` at :398; `onSnapshot(query(collection(db,'service_tasks'), where('service_id','==',currentService.id)), ...)` at :401-402; error callback at :414; in-place replaceWith via `servicePlanCard` element id |
| 14 | New tasks listener torn down in BOTH init() (same-view re-init) and destroy() | VERIFIED | init() re-init block at line 147: `if (currentTasksListenerUnsub) { try { currentTasksListenerUnsub(); } catch (e) {} currentTasksListenerUnsub = null; }`; destroy() at lines 318-320: same pattern; `currentTasksListenerUnsub` appears 5 times total |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `firestore.rules` | `match /service_tasks/{taskId}` block — two-tier WBS/progress write gates | VERIFIED | Block at line 747; 79/79 brace balance; `affectedKeys().hasOnly(['progress','updated_at'])` present; 4 `isRole('services_user')` guards; 0 operations/project identifier leaks in executable rule code |
| `app/service-task-id.js` | `generateServiceTaskId(serviceCode)` per-service sequential ID generator | VERIFIED | Exports `generateServiceTaskId`; `where('service_code','==',serviceCode)` query; returns `TASK-${serviceCode}-${maxNum+1}`; throws on empty serviceCode; `node --check` passes; no `generateSequentialId` / `project_tasks` / `project_code` |
| `app/views/service-plan.js` | Copy-adapted split-pane service plan view (grid + Frappe Gantt) writing to service_tasks | VERIFIED | 3692 lines (>3500); 26 `service_tasks` references; 1 `where('service_id'` call; 4 `generateServiceTaskId` calls; 0 baseline/iterations symbols; render() div-balanced (16/16); 17/17 window register=teardown symmetry; `node --check` passes |
| `app/router.js` | `/service-plan` route entry + `#/services/{code}/plan` hash branches (runtime + initial-load) | VERIFIED | 4 `/service-plan` touchpoints: permission gate (line 15), route registry (line 76), runtime hash branch (lines 410-414), initial-load branch (lines 456-458); `node --check` passes |
| `app/views/service-detail.js` | `buildServicePlanCardHtml` + `computeServiceProgress` + `ensureTasksListener` + card insertion | VERIFIED | All four functions present; module state (`currentTasks`, `currentTasksListenerUnsub`, `currentServiceProgress`) at lines 63-65; `${planCardHtml}` inserted between `${proposalCardHtml}` and `${_buildServiceJournalPanelHtml}` in render tail (lines 998-1001); `syncServiceBottomRow()` at line 1805 (UAT-requested 2-col layout); `node --check` passes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| firestore.rules service_tasks block | `isAssignedToService` helper (firestore.rules:87) | `isAssignedToService(` pattern | WIRED | 3 calls: create (request.resource.data.service_code), update Tier 1 (resource.data.service_code), delete (resource.data.service_code) |
| `app/service-task-id.js` | service_tasks collection | `getDocs` filtered by `where('service_code','==',serviceCode)` | WIRED | Confirmed at service-task-id.js:42-43 |
| `app/views/service-plan.js` init() | service_tasks collection | `onSnapshot` filtered by `where('service_id'` | WIRED | Line 201: `query(collection(db,'service_tasks'), where('service_id','==',currentService.id))` |
| `app/views/service-plan.js` | `app/service-task-id.js` | `import { generateServiceTaskId }` | WIRED | Import confirmed; 4 call sites in write paths |
| `app/router.js` | `app/views/service-plan.js` | `import('./views/service-plan.js')` | WIRED | Route registry at line 78; runtime branch at line 412; initial-load at line 458 |
| service-detail.js `ensureTasksListener` | service_tasks collection | `onSnapshot` filtered by `where('service_id'` | WIRED | service-detail.js:402; error callback at :414 |
| service-detail.js Service Plan card Open Plan CTA | `#/services/{code}/plan` route | anchor href | WIRED | `planUrl = '#/services/${encodeURIComponent(currentService?.service_code || '')}/plan'` at :3594 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `service-plan.js` (task grid + Gantt) | `tasks` array (module state) | `onSnapshot(service_tasks, where('service_id','==',currentService.id))` | Yes — Firestore real-time query | FLOWING |
| `service-detail.js` plan card | `currentServiceProgress` | `ensureTasksListener()` → `computeServiceProgress(currentTasks)` → `buildServicePlanCardHtml()` | Yes — live service_tasks snapshot | FLOWING |
| `service-plan.js` — service lookup | `currentService` | `getDocs(services, where('service_code','==',serviceCode))` | Yes — Firestore query | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable server entry point for static SPA verification without a browser. Behavioral verification performed by operator UAT (recorded in SUMMARY files).

### Probe Execution

Step 7c: No probes declared or conventionally present. SKIPPED.

### Requirements Coverage

No requirement IDs declared in any plan (`requirements: []` in all three PLANs). No REQUIREMENTS.md entries mapped to Phase 105.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/views/service-plan.js` | 170, 178 | `projSnap`, `projDoc` local variable names (services query) | Info | Internal-only binding names; correct collection (`services`) and assignment (`currentService`) — cosmetic only; IN-01 in code review, accepted as non-functional |

No TBD / FIXME / XXX debt markers found in Phase 105 modified files. No unreferenced debt markers.

**Review findings status (105-REVIEW.md):**
- CR-01 (unclosed divs): RESOLVED in commit `2b7d4cd` — render() now 16/16 div-balanced
- WR-01 (PDF "Project Plan" string): RESOLVED in `2b7d4cd` — PDF header now "Service Plan"
- WR-02 (milestone toast "this project"): RESOLVED in `2b7d4cd` — now "on this service"
- WR-03 (arrow toast "the project plan"): RESOLVED in `2b7d4cd` — now "service plan"
- IN-03 (missing error callback): RESOLVED in `2b7d4cd` — error callback at service-detail.js:414
- IN-01 (projSnap/projDoc variable names): Accepted as-is (non-functional, cosmetic only)
- IN-02 (created_by schema comment vs writes): Accepted as pre-existing parity gap; mirrored from project_tasks

**UAT-discovered defects confirmed fixed:**
- `f4fdc3a`: Write guards swapped from `project_code` to `service_code` — all 4 guards confirmed using `currentService?.service_code`
- `1712450`: 2-col bottom-row layout (`syncServiceBottomRow`) — confirmed at service-detail.js:1805
- `2b7d4cd`: CR-01 + WR-01/02/03 + IN-03 — all confirmed resolved above

### Human Verification Required

The automated verification has confirmed all 14 must-have truths via static code analysis. The browser UAT for all three plans was already performed by the operator and recorded as approved in the SUMMARY files (105-02-SUMMARY.md "UAT — APPROVED", 105-03-SUMMARY.md "UAT — APPROVED"). These items are surfaced here to close the formal gate:

#### 1. Service Plan Gantt View — Full Feature UAT (Plan 02)

**Test:** Open `#/services/{service_code}/plan` for a service with a valid service_code. Create a task, indent it, set progress. Add a predecessor. Mark a milestone. Drag a bar edge. Switch zoom. Run search. Toggle critical path. Export PDF. Open for both a one-time and a recurring service.
**Expected:** All features functional. Title shows "Plan — {service_name}". Task writes `TASK-{service_code}-1`. PDF shows "{service_name} — Service Plan". No baseline toolbar, no iterations rail, no diff/undo toast anywhere.
**Why human:** Split-pane Gantt interaction, drag behavior, PDF rendering, and dependency arrows cannot be verified by static code analysis.
**Recorded result:** APPROVED by operator on 2026-06-15 (105-02-SUMMARY.md)

#### 2. Service Plan Card on Service Detail — Live Stats, CTA, Teardown (Plan 03)

**Test:** Open a service detail page with tasks. Check card stats. Navigate service-to-service. Navigate away and back. Click "Open Plan". Open a service without service_code.
**Expected:** Card shows live task count/percent/health/overdue. No data leaks on same-view nav. "Open Plan" navigates to plan. CTA disabled (greyed, "No service code" title) when no service_code. No orphaned listener. No iterations/save-game strip on card.
**Why human:** Live onSnapshot re-render, same-view teardown correctness, and UI card state cannot be verified by static analysis.
**Recorded result:** APPROVED by operator on 2026-06-15 (105-03-SUMMARY.md)

### Gaps Summary

No gaps. All 14 must-have truths are verified in the codebase. All code-review findings (CR-01, WR-01/02/03, IN-03) are resolved in commit `2b7d4cd`. All UAT-discovered defects are fixed (`f4fdc3a`, `1712450`, `2b7d4cd`). Status is `human_needed` only because the formal UAT gate must be acknowledged; the recorded operator approvals in both SUMMARY files satisfy this requirement.

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
