# Phase 104: Service Detail Parity (Lifecycle · Journal · DLP) - Context

**Gathered:** 2026-06-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring `app/views/service-detail.js` (1,748 lines) to **functional parity** with the overhauled
`app/views/project-detail.js` (4,018 lines) for the three detail-page subsystems services currently
lack. Full flow per surface — **UI + submit + listeners + Finance/back-office side**, not display-only.

Three subsystems, each a mirror of its project-side origin:
1. **Lifecycle accordion** — mirror Phase 100 (`project-detail.js` lifecycle card): 8-stage visual
   track + 4 document gates, replacing the service's current manual `project_status` dropdown.
2. **Activity Journal** — mirror Phase 101: 3-tab panel (Activity Feed · Progress Updates · Issues)
   backed by 3 new `services/{id}/…` subcollections.
3. **DLP / retention** — mirror Phase 102: inline tranche editor + Ret? toggle + Completion-gate DLP
   capture + 4-state finance bar + Finance-only Record Release, on the service detail page.

**Guiding principle (this whole phase):** the project-side designs (Phases 100/101/102 — all
spike-validated and shipped) are the **locked baseline**. The default for every detail is *mirror the
project implementation 1:1*. This discussion only locks where services must **deviate** — driven by
(a) the **recurring vs one-time** service distinction and (b) the leading **`Draft`** status.

**In scope:** lifecycle accordion + 4 gates on service-detail; 3 journal subcollections + panel +
auto-entries; DLP tranche-editor + Completion-gate capture + finance bar + Record Release on
service-detail; new DLP/lifecycle fields on `services` docs; `last_activity_at` bump on service
journal writes; one-time On-going signal upgrade in `services.js`; `firestore.rules` additions
(service subcollection blocks + Finance Record-Release branch + any service-doc field allow-listing).

**Out of scope (deferred):**
- **Service Plan / Gantt parity** → Phase 105 (separate; needs a service task data model). Already in ROADMAP.
- Services *portfolio* DLP states — **already shipped** in Phase 103 (`services.js` mirrors `getDlpState`,
  4-state rows, DLP-soon watch). This phase is **detail-page-only** for DLP.
- Recurring On-going "gone quiet" urgency — recurring stays 103.1-conservative (see D-13).

</domain>

<decisions>
## Implementation Decisions

### Lifecycle accordion (mirror Phase 100)
- **D-01:** **Full lifecycle mirror for BOTH service types.** One-time AND recurring services use the
  same 8-stage track + 4 document gates as projects, including the Completion gate. Recurring services
  complete identically (no trimmed/terminal-at-On-going variant). Operator chose maximum parity / least
  divergence over modelling recurring contracts as never-completing.
- **D-02:** **The lifecycle accordion replaces the manual `project_status` dropdown** currently in
  `service-detail.js` (~line 851, `<select data-field="project_status" onchange="saveServiceField(...)">`).
  Same removal Phase 100 performed for projects. The accordion becomes the only status-advancement surface;
  header shows a read-only status pill.
- **D-03:** **Same documents & labels as projects** — Gate 1 Inspection Report, Gate 2 NTP / Purchase
  Order, Gate 4 Completion Report + Certificate of Completion. Same `_url/_kind/_filename` field-naming
  pattern, now on `services` documents. No service-specific relabeling, no dropped gates.
- **D-04:** **Service roles mirror project roles** on the gates: `services_admin` + assigned
  `services_user` drive most gates; the **Completion gate is `services_admin`-only** (mirrors project
  D-08 where completion is `operations_admin`-only); `super_admin` always; Finance owns Record Release.
- **D-05:** **`Draft` status is handled by mirroring the project lifecycle's existing Draft branch.**
  Both projects and services carry `Draft` (Phase 88); the project lifecycle accordion already has a
  Draft body branch (10 status branches). Porting that branch covers services — no new Draft-specific
  design needed. (Services lead with Draft more often since engagements are created from the Proposals
  tab, but the rendering is identical.)
- **D-06:** **Gate transitions must stamp `status_changed_at`** (mirror 103.1 D-02). Services already
  write `status_changed_at` on manual status change (`saveServiceField` ~line 1153); the new gate
  functions must write it too, so the priority-feed stage clock stays accurate. Prefer the same shared
  setter approach so no transition site is missed.

### DLP / retention (mirror Phase 102)
- **D-07:** **Pure mirror, gated by retention-tranche presence** (not by service_type). Add the inline
  tranche editor + "Ret?" toggle to `service-detail.js` (services already have `collection_tranches`
  **read-display** but no editor). DLP fieldset (retention % / DLP months / DLP start) is captured at
  the **Completion gate**, shown/required **only when a retention tranche exists**
  (`collection_tranches.some(t => t.is_retention)` — mirror project D-14). 4-state `getDlpState` finance
  bar + Finance-only Record Release (direct write of `retention_released_at`).
- **D-08:** DLP fields live on the **service document**, not the tranche (mirror 102 D-11): `dlp_months`,
  `dlp_start_date`, `dlp_expires_at`, `retention_percentage`, `retention_amount`, `retention_released_at`.
  Tranche carries only `is_retention`. All read with `|| null` for legacy safety.
- **D-09:** **Detail-page only.** The services portfolio already renders the 4 DLP states (Phase 103
  mirrored `getDlpState` into `services.js`). Do NOT re-do portfolio DLP work here.

### Activity Journal (mirror Phase 101)
- **D-10:** **Exact mirror.** Three Firestore subcollections under `services/{serviceId}/`:
  `activity_entries`, `progress_updates`, `issues` — same schemas, same `created_at desc` ordering,
  per-tab real-time `onSnapshot` listeners unsubscribed in `destroy()`.
- **D-11:** **Same status gate as projects:** journal panel is **writeable at For Mobilization +
  On-going**, **read-only at Completed**, **hidden** before mobilization and for Loss. Applies to both
  service types (recurring sits at On-going indefinitely — exactly when the journal is wanted).
- **D-12:** **Same auto-entry set:** status changes, contract/budget field edits (delta), the 4
  lifecycle gate transitions, and **PO Delivered** (traverse mrf → service → `services/{id}/activity_entries`,
  mirroring the project procurement.js trigger). Issue resolve/reopen auto-entries + required resolution
  notes carry over (101 D-11..D-14).

### On-going priority-feed signal (the one behavioral, non-mirror decision)
- **D-13:** **Upgrade one-time, keep recurring quiet.** Now that service journal writes provide
  `last_activity_at`, **one-time** services get the full project two-tier activity clock
  (🟠 quiet > 7d / 🔴 quiet > 14d, reading `last_activity_at ?? updated_at`) in `services.js`.
  **Recurring** services stay **103.1-conservative** (D-05: suppressed → always On Track) because
  recurring maintenance is quiet by design. This is the coherent extension of 103.1's own logic.
- **D-14:** **`last_activity_at` bump is fire-and-forget, error-swallowed, NOT batched** with the
  subcollection `addDoc` (mirror 103.1 D-03 landmine): a non-team active user can post a journal entry
  but their parent `services/{id}` write may be denied by rules — that denial must NOT roll back the
  journal entry.

### firestore.rules
- **D-15:** Add the **3 journal subcollection blocks** under `match /services/{serviceId}` mirroring the
  project blocks (create-only for active users, admin-delete; issues also allow update). Add the
  **Finance Record-Release branch** for `retention_released_at` on services (mirror 102 D-25). Confirm
  the new lifecycle/DLP service-doc fields are writable — NOTE: per 103.1, the services update rule is
  **role-only (not affectedKeys-masked)**, so service-doc field additions may need no allow-list change,
  unlike projects. Researcher/planner must verify the exact services rule shape. **Dev deploy** for UAT;
  joins the standing v3.3 → main prod-rules-deploy debt.

### Claude's Discretion
- **Code structure:** copy-then-adapt the project lifecycle/journal/DLP code into `service-detail.js`
  per the established Phase-26 pattern (Services mirrors Projects via duplicate modules; 103/103.1 just
  did this). Planner/researcher MAY extract small shared helpers opportunistically where it reduces risk,
  but copy-adapt is the sanctioned default — do not block on an abstraction redesign.
- Exact window-function names within the service namespace; CSS reuse (the `.lc-*`, `.tranche-editor`,
  `.finance-bar.state-*`, `.project-journal` blocks in `styles/views.css` are likely reusable as-is or
  with a service-scoped selector — planner decides reuse vs duplicate).
- Plan/wave decomposition (lifecycle / journal / DLP are largely independent surfaces → natural wave or
  plan split; CSS-foundation-first then JS, as Phases 100–102 did).
- Whether the 4 gate functions and the journal `_addActivityEntry` share the `status_changed_at` setter.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The locked source designs being mirrored (READ FIRST — these ARE the contract)
- `.planning/phases/100-project-detail-lifecycle-rebuild/100-CONTEXT.md` — lifecycle accordion design
  (8 stages, 4 gates, doc rollup, PA track, attach-zone pattern, role gates). D-01..D-16.
- `.planning/phases/101-project-journal-activity-feed-progress-updates-issues/101-CONTEXT.md` — journal
  3-tab design, subcollection schemas, status gate, auto-entry scope, issue workflow. D-01..D-20.
- `.planning/phases/102-dlp-retention-management/102-CONTEXT.md` — tranche editor, Ret? toggle,
  Completion-gate DLP capture, `getDlpState`, 4-state finance bar, Record Release. D-01..D-25.
- `.planning/phases/103.1-priority-feed-signal-accuracy/103.1-CONTEXT.md` — `status_changed_at` /
  `last_activity_at` clocks, D-03 fire-and-forget landmine, D-05 services-conservative On-going signal.

### Spike artifacts (authoritative visual + interaction contracts referenced by 100/101/102)
- `.planning/spikes/031-lifecycle-accordion-card/spike.html` — PRIMARY lifecycle reference (all stages/gates).
- `.planning/spikes/032-ongoing-activity-panel/` README + spike.html — journal 3-tab prototype.
- `.planning/spikes/035-tranche-editor-in-detail/` README + spike.html — inline tranche editor + Ret? toggle.
- `.planning/spikes/034-dlp-entry-placement/` README + spike.html — hybrid DLP-at-completion-gate.
- `.planning/spikes/036-dlp-states-finance-bar/` README + spike.html — 4-state model + Record Release.

### Target + source code files
- `app/views/service-detail.js` — **the target file**. Read fully: current `render`/`init`/`destroy`,
  the manual `project_status` dropdown (~851, to be replaced), `saveServiceField` (~1076, status_changed_at
  at ~1153), `collection_tranches` read-display (4 refs), proposal inline card / STATUS_META / TRACK_NODES
  (~1452), service_type handling (~728).
- `app/views/project-detail.js` — **the reference implementation** to mirror: lifecycle gates (~3767–3832),
  journal handlers (`_addActivityEntry`/`postActivityEntry`/`submitProgressUpdate`/`submitNewIssue`
  ~3014/3046/3203/3392), tranche editor + `getDlpState` + `renderDlpFinanceBar` + `lcMarkProjectComplete`
  (~3408) + `recordRetentionRelease`, accordion build helpers, init/destroy window-fn registration.
- `app/views/services.js` — On-going signal (D-13): `getServiceSignal`, `URGENCY_THRESHOLDS`,
  `getServiceStageAmbient`; already mirrors `getDlpState` + SERVICE_STAGE_GROUPS from Phase 103.
- `app/views/procurement.js` — PO Delivered auto-entry trigger site (D-12) for the service traversal.
- `styles/views.css` — existing `.lc-*` (Phase 100), `.project-journal` (Phase 101), tranche-editor /
  `.finance-bar` 4-state / `.dlp-strip` (Phase 102) blocks — evaluate reuse vs service-scoped duplicate.
- `firestore.rules` — `match /services/{serviceId}` update rule + the project subcollection blocks
  (`activity_entries`/`progress_updates`/`issues`) and the projects Finance Record-Release branch to mirror.

### Project conventions / blueprint
- `CLAUDE.md` — SPA view module structure (`render`/`init`/`destroy`), window-function-on-onclick,
  real-time `onSnapshot`, status case-sensitivity, `#lineItemsBody` DOM-by-class rule.
- `Skill("spike-findings-pr-po")` — implementation blueprint for lifecycle/activity/tranche/DLP patterns
  (references/project-journal.md, references/dlp-retention-tranche.md).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/utils.js` → `escapeHTML`, `formatCurrency`, `formatDate` — required on all user text + money/date.
- `app/views/project-detail.js` shared helpers to mirror: `_attachDocumentToProject`,
  `addProjectAuditEntry`, `_canAdvanceProjectStatus`, `getDlpState`, `computeDlpFields`,
  `_addActivityEntry`, `renderDlpFinanceBar`, `recordRetentionRelease` — service equivalents.
- CSS blocks already shipped in `styles/views.css` for all three subsystems (`.lc-*`, `.project-journal`,
  tranche-editor / `.finance-bar.state-*` / `.dlp-strip`) — likely reusable, reducing this phase to
  mostly JS + rules.
- `app/edit-history.js` — `saveServiceField` already routes through edit-history (`'services'` arg).

### Established Patterns
- **Phase 26 (Key Decision):** Services mirrors Projects via copy-then-adapt duplicate modules. This is
  the sanctioned approach; Phases 103 / 103.1 just executed it for the portfolio + signal layers.
- **Subcollection listener + window-fn symmetry:** push listeners to array, unsubscribe in `destroy()`;
  register window functions in `init()`, delete in `destroy()` — symmetric (project precedent).
- **Legacy-safe reads (`|| null`)** so legacy service docs without the new fields never crash.
- **`node --check` + grep static gates** are the only automated gates (zero-build SPA); UAT is browser-gated.

### Integration Points
- Service lifecycle gate functions → must (a) write the doc/status update, (b) stamp `status_changed_at`
  (D-06), (c) write a system `activity_entries` doc (D-12), (d) bump `last_activity_at` fire-and-forget (D-14).
- `procurement.js` PO-Delivered block → add the service-side traversal to `services/{id}/activity_entries`.
- `services.js` On-going signal → read `last_activity_at` for one-time only (D-13).
- Shared `proposal-modal.js` already drives the Draft→Client Approved funnel for services (and stamps
  `status_changed_at` per 103.1) — the lifecycle accordion defers to it for those stages (mirror project D-04).

</code_context>

<specifics>
## Specific Ideas

- Operator consistently chose **maximum parity / pure mirror** across all four areas — the only
  intentional divergence from the project implementation is **D-13** (recurring On-going stays quiet).
- The one structural difference operators will see vs projects: services lead with `Draft` far more
  often (created from the Proposals tab), so the lifecycle accordion's Draft body branch is more
  load-bearing for services than it is for projects.
- CSS-foundation-first then JS, mirroring how Phases 100–102 sequenced (CSS block → track/accordion →
  bodies/gates → wiring) — but most CSS already exists, so this phase may be able to reuse and skip the
  CSS-foundation plan.

</specifics>

<deferred>
## Deferred Ideas

- **Service Plan / Gantt parity** → Phase 105 (separate phase; needs a service task data model + a
  `#/services/{code}/plan` route). Already in ROADMAP.
- **Full upgrade of recurring On-going signal** — if real usage shows recurring services DO want a
  "gone quiet" urgent flag once they have an activity clock, revisit D-13 against production data.
- **Prod `firestore.rules` deploy** — dev-only this phase; rides the standing v3.3 → main merge debt
  (Phase 87.4 / 99 / 100 / 101 / 102 / 103.1 carry-over).
- None of the above are blockers for Phase 104.

</deferred>

---

*Phase: 104-service-detail-parity*
*Context gathered: 2026-06-13*
