# Phase 105: Service Plan (Gantt) Parity - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring services to **functional parity** with the project plan / Gantt subsystem. Today projects have
a full native PM surface (`app/views/project-plan.js`, **4,803 lines**, built across Phases 86 → 86.12
+ 97); services have **nothing** — no task model, no schedule, no Gantt. This phase mirrors that
subsystem to services.

Three deliverables, all mirrors of their project-side origin:
1. **`service_tasks` data model** — a new top-level Firestore collection (parallel to `project_tasks`)
   + matching `firestore.rules` block. Services have no task/schedule data today.
2. **`service-plan.js` view** — a new split-pane plan view (left grid + right Frappe Gantt) at route
   `#/services/{service_code}/plan`, **copy-then-adapted** from `project-plan.js`.
3. **"Service Plan" summary card** on `service-detail.js` — mirror of the project-detail plan card
   (task count, % complete, highlights, "Open Plan" CTA).

**Guiding principle (this whole phase):** the project plan subsystem (Phases 86 → 86.12 + 97 — all
shipped, UAT-hardened, spike-validated) is the **locked baseline**. The default for every detail is
*mirror the project implementation 1:1*. This discussion only locks (a) the **build approach**, (b) the
**data model shape**, (c) the **v1 feature cutoff**, and (d) **recurring-vs-one-time** + **permission**
role mapping. Everything else (split-pane ratio, milestone diamond color, today-line color, ID format,
clientless-block copy, zoom defaults, summary-card semantics) is **inherited verbatim** from the
project plan's already-locked decisions (Phase 86 D-01..D-22).

**In scope (v1):**
- New top-level `service_tasks` collection + `firestore.rules` `match /service_tasks/{taskId}` block
  (two-tier WBS/progress write gates, mirror of `project_tasks` rules at firestore.rules:659–709).
- New `app/views/service-plan.js` (copy-adapt of `project-plan.js`) with **core editable Gantt**:
  inline grid editor, Frappe Gantt bars (Day/Week/Month zoom), unlimited hierarchy (indent/outdent +
  weighted leaf-only progress rollup), Finish-to-Start predecessors (+ cycle detection), milestones
  (diamond), inline progress edit, drag-resize/drag-reschedule, critical-path highlight, PDF export,
  copy/paste + shift-click multi-select, search/filter.
- Route `#/services/{service_code}/plan` (mirror `#/projects/{code}/plan`) + router handler + back-link.
- "Service Plan" summary card on `service-detail.js` (mirror project-detail plan card) + "Open Plan" CTA
  (blocked when service has no `service_code`, mirror Phase 78 clientless-block path).
- Service task ID generator `TASK-{service_code}-{seq}` (per-service sequential; mirror Phase 86 D-19).
- Assignee picker sourced from service `personnel_user_ids`.
- **Both** service types (`one-time` AND `recurring`) get the plan + route.
- Dev `firebase deploy --only firestore:rules` for UAT; joins the standing v3.3 → main prod-deploy debt.

**Out of scope (deferred → Phase 105.1):**
- **Baseline snapshot** (Phase 86.12) — needs a new `services/{serviceId}/baselines` subcollection +
  rules block + overlay UAT. Deferred to keep v1 collection/rules surface small.
- **Iterations / save-game** (Phase 97/97.1/97.2) — needs a new `service_iterations` top-level collection
  + rules + the diff/undo-toast flow (a 5-plan phase on its own). Deferred to 105.1.

**Out of scope (not this milestone):**
- Any Gantt capability projects don't already have (this is a *parity* phase, not an enhancement phase).
- Notifications on task assignment / milestone (mirror Phase 86 D-17 — none).
- Project-side changes — `project-plan.js`, `project_tasks`, and the project rules block stay
  **byte-untouched** (the whole point of the copy-adapt build choice).

</domain>

<decisions>
## Implementation Decisions

### Build approach
- **D-01 — Copy-then-adapt into a NEW `app/views/service-plan.js`.** Duplicate `project-plan.js` and
  swap `project_tasks`→`service_tasks`, `project_id`→`service_id`, `projects`→`services`, the route
  segment, and the role helpers. The shipped `project-plan.js` stays **byte-untouched** — zero
  regression risk to the most complex, most-iterated, most-UAT-hardened file in the app (no automated
  test harness exists; it's a zero-build browser-UAT-only SPA). Matches the Phase 26 / Phase 104
  sanctioned parity default. **Accepted cost:** a second ~4,800-line file — future Gantt fixes must land
  in both files. (Operator rejected the shared-core-engine and parameterize-in-place options precisely
  because both rewrite the fragile shipped project plan with no safety net.)
  - Under copy-adapt the cheapest path is: copy the whole file, swap identifiers, then **remove only**
    the two deferred collection-backed subsystems (baseline + iterations) and their window functions /
    rail HTML. In-file features (critical path, PDF, copy/paste, multi-select, search) come along free.

### Data model
- **D-02 — Separate top-level `service_tasks` collection** (NOT a `task_owner` discriminator on
  `project_tasks`). Parallel schema to `project_tasks`: `service_id` (services doc id, for the
  `where('service_id','==',X)` onSnapshot query) + denormalized **`service_code`** (for
  `isAssignedToService` rule scoping, mirroring how `project_code` is denormalized on `project_tasks`).
  Clean new rules block; **zero risk** to existing `project_tasks` reads/writes/rules. The discriminator
  alt was rejected because it would force a `task_owner` filter onto every existing project_tasks query
  and rule (regression risk) and mix departments in one collection. Mirrors Phase 104's separation.
- **D-03 — `service_tasks` schema (mirror Phase 86 D-20, swap the parent keys):**
  ```
  task_id         'TASK-{service_code}-{n}'  (= doc ID; per-service sequential, mirror D-19)
  service_id      services doc id            (onSnapshot scope)
  service_code    'CLMC-SVC-001'             (denormalized — rule scoping + queries)
  parent_task_id  null | 'TASK-...'
  name, description
  start_date, end_date   ISO 'YYYY-MM-DD' (null on unlocked parents)
  progress        0–100  (leaf-only; parents derive-on-read weighted by duration)
  is_milestone    boolean (leaf-only)
  dependencies    ['TASK-...']  (FS deps — array of task_ids)
  assignees       ['firebase-uid']  (from service personnel_user_ids)
  resources       string (optional, free-form — Phase 86.1 grid column)
  created_at, updated_at, created_by
  ```
  Row order is NOT persisted (derived via depth-first flatten on read — mirror project plan). Parent
  dates auto-computed/locked (min/max of children, mirror D-11). Progress rollup duration-weighted,
  leaf-only, derive-on-read (mirror D-12).

### Recurring vs one-time scope
- **D-04 — BOTH service types get the plan.** One-time AND recurring services get a `service_tasks`
  plan + the `#/services/{service_code}/plan` route + the summary card. Mirrors Phase 104 D-01
  (maximum parity / least divergence). Recurring teams can use it for scheduled maintenance windows; an
  unused plan does no harm. No service-type gating on the plan surface. (Contrast 104 D-13, where
  recurring diverged on the *portfolio signal* only — that divergence does not extend to the plan.)

### Feature carryover cutoff (v1)
- **D-05 — Core editable Gantt in v1; defer the two collection-backed subsystems.** Mirror the full
  editable Gantt surface: inline grid editor (86.1), Frappe Gantt bars + Day/Week/Month zoom (86),
  hierarchy indent/outdent + weighted progress rollup (86/86.2/86.8), FS predecessors + cycle detection
  (86.1), milestone diamonds (86.11), inline progress edit + drag-resize/reschedule (86), drag-to-link
  arrows (86.8), critical-path highlight (86.8 F4), PDF export (86.9), copy/paste + shift-click
  multi-select (86.10), task search/filter (86.8 F6), curtain divider/resizable split-pane (86.9),
  overdue/at-risk status tints (86.11). **DEFER to Phase 105.1:**
  - **Baseline snapshot** (86.12) — would add a `services/{serviceId}/baselines` subcollection + rules +
    overlay UAT.
  - **Iterations / save-game** (97/97.1/97.2) — would add a `service_iterations` collection + rules +
    the diff panel + undo-toast restore flow.
  Rationale: each deferred item is collection-backed → new rules block (more prod-deploy debt) + a large
  independent UAT surface. Shipping the core plan first gets services a working Gantt fastest; the two
  rails layer on cleanly in 105.1.

### Permissions
- **D-06 — Exact mirror of project task rules with service roles.** `match /service_tasks/{taskId}`
  mirrors `project_tasks` (firestore.rules:659–709), swapping `operations_*`→`services_*` and
  `isAssignedToProject`→`isAssignedToService`:
  - **read/list:** `isActiveUser()` (project-scoping at the JS query layer, mirror D-18). *Researcher/
    planner verify:* whether to tighten `services_user` read to `isAssignedToService` to match the
    stricter `services` *list* rule (firestore.rules:514+) — default is the `project_tasks` `isActiveUser`
    pattern unless that conflicts with the services list-rule shape.
  - **create / WBS-update / delete:** `hasRole(['super_admin','services_admin'])` OR
    (`isRole('services_user')` AND `isAssignedToService(service_code)`). Field-team `services_user` owns
    their own plans — mirror of how `operations_user` works for projects (D-14).
  - **progress-only update** (`affectedKeys().hasOnly(['progress','updated_at'])`):
    `hasRole(['super_admin','services_admin'])` OR (`isRole('services_user')` AND
    `request.auth.uid in resource.data.assignees`). Mirror D-15.
  - **Assignee picker source:** service `personnel_user_ids` (mirror D-16 / `normalizePersonnel`).
  - Deploy rules in the SAME commit as the first `service_tasks` write (Phase 85 D-24 / 86 D-18 lesson).

### Claude's Discretion (inherited verbatim from the project plan — do NOT re-decide)
- Split-pane ratio (35/65 + resizable), milestone diamond color/size, today-line color, parent
  summary-bar style, zoom default (Week), empty-state copy, toast wording, native `<input type="date">`,
  ordering (start_date asc), no pagination — all locked by Phase 86 D-05..D-22 + Claude's-Discretion
  list. The service mirror inherits them; planner reuses the same CSS classes / Frappe options.
- Whether to mirror the project plan's CSS verbatim (likely reusable as-is — the `.gantt-*`, grid, and
  pane classes are not project-specific) vs. service-scoped duplicates — planner decides (mirror the
  104 CSS-reuse evaluation).
- Exact service-namespace window-function names; whether `service-task-id.js` is a new file or extends
  the existing `app/views/task-id.js`.
- Summary-card placement on `service-detail.js` (mirror project-detail's plan card slot) — planner picks
  the analogous insertion point.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The locked source designs being mirrored (READ FIRST — these ARE the contract)
- `.planning/phases/86-native-project-management-gantt/86-CONTEXT.md` — **the master design.**
  D-01..D-22: route shape, split-pane, summary card (D-03), Frappe Gantt CDN (D-05), hierarchy (D-06),
  zoom (D-07), milestones (D-08), today line (D-09), visual+warn deps (D-10), locked parent dates (D-11),
  weighted leaf-only progress (D-12), dep multi-select + cycle detection (D-13), permissions D-14..D-16,
  rules D-18, ID format D-19, **schema D-20**, filters D-21, no pagination D-22.
- `.planning/phases/86-native-project-management-gantt/86-PATTERNS.md` — analog file map for the
  original build (new-collection introduction, view module, rules block).
- `.planning/phases/104-service-detail-parity/104-CONTEXT.md` — the copy-then-adapt parity precedent
  this phase follows; establishes the Phase-26 mirror default and the recurring-vs-one-time framing.

### Target + reference code files
- `app/views/project-plan.js` (**4,803 lines — the reference implementation to copy-adapt**). Module
  shape: `render`(135) / `init`(251) / `destroy`(472). Window-fn registrations 333–374. Feature blocks:
  inline grid 823–1018, auto-group/flatten 1018–1186, predecessors 1224–1238, indent/outdent 1520–1565,
  multi-select/copy-paste 1685–1946, Gantt render 2048–2260, milestone diamonds 2260, drag-to-link
  2458–2612, PDF export 2612–2639, critical path 2765–2953, **baseline 3161–3347 (DEFER — do not port)**,
  **iterations ~3450–3850 (DEFER — do not port)**, status compute 3925–4005. Reads via
  `onSnapshot(query(collection(db,'project_tasks'), where('project_id','==',id)))` at :292.
- `app/views/service-detail.js` — host for the new "Service Plan" summary card + "Open Plan" CTA;
  service lookup `where('service_code','==',param)` (~183); `service_type` handling; `personnel_user_ids`.
- `app/views/project-detail.js` — the project plan summary card (`buildPlanCardHtml` ~3925; "Open Plan"
  link ~3927) to mirror; `normalizePersonnel` assignee-picker pattern.
- `app/router.js` — project plan route handler (`#/projects/{code}/plan` → `navigate('/project-plan')`
  at 398–402, 441–443); service-detail route handler (`#/services/detail/{code}` at 393–396) — add a
  parallel `#/services/{code}/plan` → `service-plan.js` branch.
- `app/views/task-id.js` — `TASK-{project_code}-{seq}` generator to mirror for `TASK-{service_code}-{seq}`.
- `firestore.rules` — `match /project_tasks/{taskId}` block (**659–709**, the two-tier rule to mirror);
  `match /services/{serviceId}` block (**514–588**) for `isAssignedToService` + the services read/list
  shape; `isAssignedToService` helper.
- `index.html` — Frappe Gantt + html2pdf CDN includes already present (project plan uses them) — the
  service plan reuses the same loaded libraries; no new `<script>` needed.
- `styles/views.css` — existing `.gantt-*` / grid / pane CSS blocks (Phase 86 → 86.12) — evaluate
  verbatim reuse vs service-scoped duplicate (mirror the 104 CSS-reuse decision).

### Project conventions / blueprint
- `CLAUDE.md` — SPA view module structure (`render`/`init`/`destroy`), window-functions-on-onclick,
  Firebase listener cleanup, hash sub-route parsing, status case-sensitivity, "ADDING NEW COLLECTIONS"
  template at top of `firestore.rules`, custom inline sequential ID generation.
- `Skill("spike-findings-pr-po")` — implementation blueprint (project journal / lifecycle / PM patterns).

### Deferred-feature source designs (for Phase 105.1, NOT this phase)
- `.planning/phases/86.12-project-plan-baseline-snapshot/` — baseline subcollection + overlay design.
- `.planning/phases/97-project-plan-iterations/97-CONTEXT.md` — iterations schema (`project_iterations`),
  diff panel, auto-snapshot + 5s undo-toast restore.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`project-plan.js` itself** — ~95% reusable per architectural scout; the mirror is mostly identifier
  swaps (`project_tasks`/`project_id`/`projects` → service equivalents) + removing the two deferred
  subsystems. Grid (~800 lines), Gantt integration (~400), deps/hierarchy (~300), critical path (~200),
  copy/paste/group (~200), search (~100) port with only field-name changes.
- **`app/utils.js`** — `escapeHTML`, `formatCurrency`, `formatDate`, `normalizePersonnel`, `showToast`,
  `showLoading` — same helpers the project plan uses.
- **`isAssignedToService(service_code)`** (firestore.rules) — already exists (Phase 104 / services list
  rule); the new `service_tasks` rules reuse it directly, mirroring `isAssignedToProject`.
- **Frappe Gantt + html2pdf** — already CDN-loaded in `index.html` for the project plan; service plan
  reuses them, no new includes.
- **`styles/views.css`** Gantt/grid/pane blocks — likely reusable verbatim (not project-specific).

### Established Patterns
- **Phase 26 (Key Decision):** Services mirror Projects via copy-then-adapt duplicate modules — the
  sanctioned approach; Phases 103 / 103.1 / 104 executed it for portfolio / signal / detail layers.
- **New-collection introduction** (Phase 85 / 86 D-18): rules block ships in the SAME commit as the
  first JS write; test Super Admin first, then the scoped role; without rules even Super Admin is denied.
- **Custom inline per-{code} sequential ID** (Phase 86 D-19 / 85 D-20): query the collection filtered by
  the parent, parse max n, increment — NOT `generateSequentialId()` (year-counter collision lesson).
- **Derive-on-read** for parent dates + weighted progress (never persisted).
- **Window-fn register↔teardown symmetry** + listener cleanup in `destroy()` (zero-build SPA static gate).
- **`node --check` + grep static gates** are the only automated checks; everything else is browser UAT.

### Integration Points
- `app/router.js` — add `#/services/{service_code}/plan` → `navigate('/service-plan', null, code)` +
  a `/service-plan` route entry loading `app/views/service-plan.js` (mirror the `/project-plan` entry).
- `app/views/service-detail.js` — inject the "Service Plan" summary card + "Open Plan" CTA (disabled
  when `service_code` is null — mirror Phase 78 clientless block); subscribe to
  `query(collection(db,'service_tasks'), where('service_id','==',currentService.id))` for the card stats.
- `firestore.rules` — new `match /service_tasks/{taskId}` block (two-tier WBS/progress gates, D-06).
- `app/views/service-plan.js` (new) — the copied-and-adapted plan view.
- **No changes to** `app/views/project-plan.js`, `project_tasks`, or the project rules block (D-01).

</code_context>

<specifics>
## Specific Ideas

- Operator consistently chose **maximum parity / pure mirror** across every decision (matching the
  Phase 104 pattern). The only intentional scope reductions are the two **deferred** collection-backed
  subsystems (baseline + iterations → 105.1) — and that's a sequencing choice, not a design divergence.
- The copy-adapt build choice (D-01) was explicitly motivated by protecting the shipped project plan:
  it's the largest, most-iterated, most-fragile file in the app, with a documented trail of subtle UAT
  bugs (phantom drag, scroll-sync, row-alignment — see `.planning/debug/gantt-*`), and there is no
  automated test harness to catch a regression from a shared-core refactor.
- Because everything visual/interaction is inherited from the project plan's locked decisions, the
  planner should NOT re-open color/ratio/zoom/ID questions — copy the project plan's choices verbatim.

</specifics>

<deferred>
## Deferred Ideas

### → Phase 105.1 (Service Plan baseline + iterations)
- **Baseline snapshot for services** (mirror Phase 86.12) — `services/{serviceId}/baselines`
  subcollection + rules + overlay. Deferred from v1 to keep the collection/rules/UAT surface small.
- **Iterations / save-game for services** (mirror Phase 97/97.1/97.2) — `service_iterations` collection
  + rules + diff panel + auto-snapshot + 5s undo-toast restore. A 5-plan flow on its own — deferred.

### Beyond this milestone (not 105.x)
- Any Gantt capability projects don't have yet (resource allocation, ProjectLibre import, billable-task
  auto-collectibles) — these are PM-FUT-01..05 in REQUIREMENTS.md, future enhancements for BOTH surfaces.
- Task-assignment / milestone notifications for services — mirror Phase 86 D-17 (none this phase).
- **Prod `firestore.rules` deploy** — dev-only this phase; rides the standing v3.3 → main merge debt
  (Phase 87.4 / 99 / 100 / 101 / 102 / 103.1 / 104 carry-over).

</deferred>

---

*Phase: 105-service-plan-gantt-parity*
*Context gathered: 2026-06-15*
