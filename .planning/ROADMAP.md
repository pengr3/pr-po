**Plans**: 4 plans / 4 waves (decomposed by gsd-planner 2026-06-13). projects.js and services.js are separate files; CSS lands first; projects.js plans are sequential among themselves (same file).
- [x] 103-01-PLAN.md — Shared `styles/views.css` block (view-mode toggle, feed urgency sections, feed/browse rows, stage-aware finance cells, collapsible stage groups; literal hex palette, no `var(--*)`) [Wave 1] ✅ `bb94453`
- [x] 103-02-PLAN.md — projects.js view-mode toggle (`vmSwitch`) + shared helpers (`normalizeUpdatedAt` D-08, `getProjectSignal`/`computeUrgencySignals` D-07, stage-aware `renderFinancial` D-06, `getDlpState` reuse D-05) + Priority Feed render; replaces flat table [Wave 2] ✅ `3a05b92`+`fd4374f`
- [x] 103-03-PLAN.md — projects.js Browse All stage-grouped collapsible (`STAGE_GROUPS` all 10 statuses, collapse persistence Completed+Loss default-collapsed D-03) + filter/scope/scorecard sharing across both modes [Wave 3] ✅ `961a36f`+`6f26ab5`
- [x] 103-04-PLAN.md — services.js mirror of the full D+B hybrid, coexisting with the one-time/recurring `service_type` sub-tab (outer filter) + Draft stage group; own localStorage keys [Wave 4] ✅ `5f1e81b`+`e350fcb`
**Status**: ✅ COMPLETE 2026-06-13 — 4/4 plans / 4 waves, inline sequential on v3.3. VERIFICATION passed (static gates + 3 browser-UAT gates approved). No new Firestore listener; no schema/rules change. W-2 (empty On-going mini-bar) accepted, deferred to a future billing-aware phase.
**Spike**: `.planning/spikes/033-project-table-redesign/` (README + `index.html` — all 5 options + D+B combo; authoritative visual contract). Blueprint: `.claude/skills/spike-findings-pr-po/references/project-portfolio-view.md`.
**UI hint**: yes — spike `index.html` (D+B combo tab) is the visual reference.

---

## Phase 103.1 — Priority Feed Signal Accuracy
**Goal**: Make the Phase 103 Priority Feed trustworthy. Its urgency rests on "days since `updated_at`", which (verified) is the wrong clock — corruptible by edits, blind to real activity, and absent for 3 statuses. Fix: two purpose-built clocks + a coherent two-tier funnel matrix.
- [ ] **`status_changed_at` spine** (both views) — stamp on every status transition (gates + proposal-modal + service-detail + status dropdown); all stage-duration signals read `status_changed_at ?? updated_at`; +1 `firestore.rules` allow-list field. Makes the existing For Inspection / Client Review / For Revision signals accurate too [D-01/D-02]
- [ ] `last_activity_at` for On-going (projects) — journal handlers fire-and-forget stamp the parent; +1 rules field [D-03]
- [ ] Two-tier funnel matrix + scoped ambient day-counts — fills the 3 silent statuses (For Proposal, Internal Approval, Client Approved) + retunes the existing ones; Internal Approval is the loudest/shortest-fuse; On-Track funnel rows show "In {stage} · {d}d" subtext [D-04]
- [ ] Tame services On-going-quiet (no journal; recurring quiet by design) [D-05 — pending nod]
- [ ] (opt) DLP "expiring soon" watch (both views) [D-06 — pending include/defer]
**Plans**: 4 plans / 3 waves (gsd-planner + gsd-plan-checker, 2026-06-13). Plan-checker: 1 blocker + 1 warning found and fixed in revision; all 13 reqs (SC-1..7, D-01..06) covered.
- [x] 103.1-01-PLAN.md — `status_changed_at` spine (proposal funnel + 4 gates + manual status) + firestore.rules +status_changed_at/+last_activity_at + dev deploy [Wave 1] ✅ `d8aa4d1`+`ab6540c`
- [x] 103.1-02-PLAN.md — `last_activity_at` (projects): fire-and-forget bump on the 3 journal handlers; postActivityEntry success-gated [Wave 2] ✅ `4e90171`
- [x] 103.1-03-PLAN.md — projects.js two-tier funnel matrix + On-going 7/14 on last_activity_at + DLP-soon + scoped ambient [Wave 2] ✅ `ef4957e`
- [x] 103.1-04-PLAN.md — services.js mirror + D-05 conservative On-going + DLP-soon [Wave 3] ✅ `af4d503`
**Status**: ✅ COMPLETE 2026-06-13 — 4/4 plans / 3 waves, inline sequential on v3.3. VERIFICATION passed; all 3 human gates approved (dev rules deploy + projects UAT + services UAT). Dev seed: `scripts/seed-dev-projects.js`. **Prod `firebase deploy --only firestore:rules` still pending at v3.3 → main merge** (carries the 103.1 allow-list + standing 87.4/99/100/101/102 debt). NO new portfolio listener. Cash/collection-risk signal deferred to a future billing-aware phase.

---

## Phase 104 — Service Detail Parity (Lifecycle · Journal · DLP)
**Goal**: Bring `service-detail.js` to functional parity with the overhauled `project-detail.js` for the three detail-page subsystems services currently lack. Full flow per surface (UI + submit + listeners + Finance/back-office side), not display-only. Project-side origins: Phase 100 (lifecycle), Phase 101 (journal), Phase 102 (DLP). The other detail features (info card, financial summary, personnel, collection tranches, billing-request modal, proposal inline card, edit history, status dropdown, CSV export) are already at parity.
**Scope (locked in `/gsd-discuss-phase 104` — D-01..D-15 in 104-CONTEXT.md):**
- [ ] **Lifecycle accordion** (D-01..D-07) — full 8-stage track + 4 doc gates for BOTH service types; replaces the manual `project_status` dropdown; Completion gate `services_admin`-only; Draft handled by the existing proposal-card fall-through; gates stamp `status_changed_at` + audit + activity + `last_activity_at`.
- [ ] **Activity Journal** (D-10..D-12, D-14) — 3-tab panel (Activity feed · Progress updates · Issues) on services; new `services/{id}/activity_entries|progress_updates|issues` subcollections; status-gated; fire-and-forget `last_activity_at` bump; PO-Delivered auto-entry.
- [ ] **DLP / retention** (D-07..D-09, D-15) — inline tranche editor + Ret? toggle + Completion-gate DLP capture + 4-state finance bar + Finance-only Record Release on `service-detail.js`; DLP fields on the service doc; detail-page only (portfolio done in 103).
- [ ] **Cross-cutting** (D-13) — one-time On-going priority-feed signal upgraded to two-tier on `last_activity_at`; recurring stays conservative. firestore.rules service subcollection + Finance branch (D-15).
**Plans**: 5 plans / 4 waves (gsd-planner 2026-06-13). Copy-then-adapt parity (Phase-26 pattern); all analogs verified in 104-PATTERNS.md. CSS unchanged (Phase 100/101/102 classes reused verbatim). The three service-detail.js subsystems share one file → sequential (Waves 2→3→4); cross-cutting independent-file work parallelizes in Wave 2.
- [x] 104-01-PLAN.md — `firestore.rules`: 3 service journal subcollection blocks + `audit_log` block + Finance Record-Release branch under `match /services/{serviceId}` + DEV deploy. Foundation for all journal/DLP writes [D-15/D-04/D-10] [Wave 1]
- [x] 104-02-PLAN.md — service-detail.js Activity Journal: `orderBy`/`limit` imports, shared write primitives (`_addServiceActivityEntry` boolean + `addServiceAuditEntry`), 3 onSnapshot listeners, status-gated 3-tab panel, post/progress/issue handlers, D-14 fire-and-forget bump [D-10/D-11/D-12/D-14] [Wave 2]
- [x] 104-03-PLAN.md — service-detail.js Lifecycle accordion: LC_STAGES + track/card/badge/toggle + attach zone + 10 body branches (incl. DLP fieldset + Draft fall-through) + `_canAdvanceServiceStatus` (Completion services_admin-only) + 4 gate transitions (status_changed_at + audit + activity + bump) + dropdown→pill; adds `computeDlpFields` [D-01..D-07/D-12/D-14] [Wave 3]
- [x] 104-04-PLAN.md — service-detail.js DLP: `getDlpState`/`isRetentionCollected` + 4-state finance bar + inline tranche editor (Ret? toggle) in the Financial card + Finance-only `recordServiceRetentionRelease`; service-doc DLP fields `|| null` [D-07/D-08/D-09/D-15] [Wave 4]
- [x] 104-05-PLAN.md — procurement.js PO-Delivered service auto-entry (join on `service_code`) + services.js one-time On-going two-tier signal on `last_activity_at`; recurring conservative [D-12/D-13] [Wave 2, parallel with 02]
**Deferred:** Service Plan / Gantt → Phase 105 (separate; needs a service task data model).
**Status**: ✅ COMPLETE 2026-06-13 — 5/5 plans, inline sequential on v3.3. DEV rules deployed; **12/12 browser UAT approved**. VERIFICATION `passed`. `service-detail.js` now at functional parity with `project-detail.js` (lifecycle accordion + activity journal + DLP/retention). All `node --check`/grep gates green; firestore.rules braces 77/77; 33/33 window fns symmetric. **Carry:** prod `firebase deploy --only firestore:rules` rides the standing v3.3 → main debt (87.4/99/100/101/102/103.1 + now 104).

---

## Phase 105 — Service Plan (Gantt) Parity
**Goal**: Mirror the project plan / Gantt subsystem (`project-plan.js`, ~4,800 lines; Phases 86 → 86.12) to services. Largest parity piece — requires a new service task data model (services have no `project_tasks` equivalent today) and a `#/services/{code}/plan` route.
**Plans**: 3 plans / 3 waves
Plans:
- [x] 105-01-PLAN.md — firestore.rules `match /service_tasks/{taskId}` two-tier block (mirror project_tasks, services roles) + `app/service-task-id.js` `generateServiceTaskId` (TASK-{service_code}-{seq}) + dev rules deploy [D-01/D-02/D-03/D-06] [Wave 1]
- [~] 105-02-PLAN.md — `app/views/service-plan.js` copy-adapt of project-plan.js (id swap; remove deferred baseline 86.12 + iterations 97) + router `#/services/{code}/plan` wiring [D-01/D-03/D-04/D-05] [Wave 2, dep 01] — CODE COMPLETE 2026-06-15, paused at browser UAT gate (792057d/40b8345/4560b3f)
- [ ] 105-03-PLAN.md — service-detail.js "Service Plan" summary card + live service_tasks listener (teardown in init re-init + destroy) + Open Plan CTA (clientless-disabled) [D-01/D-05] [Wave 3, dep 02]
**Status**: 🔄 EXECUTING 2026-06-15 — 2/3 plans (01 COMPLETE, 02 code-complete/UAT-pending). Copy-then-adapt parity phase (D-01): project plan subsystem stays byte-untouched. W1 rules+ID foundation → W2 service-plan.js view+route (first service_tasks write) → W3 service-detail card. Deferred to 105.1: baseline snapshot + iterations/save-game (D-05). DEV `firebase deploy --only firestore:rules` for UAT; prod deploy rides standing v3.3→main debt.
