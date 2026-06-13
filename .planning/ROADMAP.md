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
**Status**: Scope near-ready (`103.1-CONTEXT.md`, D-04 deep-dived + resolved 2026-06-13: status_changed_at spine · two-tier matrix · scoped ambient subtext). Pending: confirm D-05/D-06 + sanity-check fuse lengths → `/gsd-plan-phase 103.1`. **Touches `firestore.rules`** (2 allow-list fields) → dev deploy for UAT + joins prod-rules-deploy debt. NO new portfolio listener. Cash/collection-risk signal explicitly deferred.