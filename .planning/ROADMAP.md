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
**Goal**: Make the Phase 103 Priority Feed trustworthy. The urgency rests on "days since `updated_at`", which (verified) is the wrong clock — the On-going "gone quiet" 🔴 fires on healthy projects because journal/progress/issue writes go to subcollections and never bump the parent doc; and 3 statuses get no signal at all.
- [ ] Fix On-going false-quiet (projects) — denormalize `last_activity_at` (journal handlers stamp the parent; signal reads `last_activity_at ?? updated_at`; +1 `firestore.rules` allow-list field) [D-02]
- [ ] For Mobilization accuracy (projects) — use existing `mobilization_started_at` [D-03]
- [ ] Fill silent statuses (both views) — For Proposal / Proposal for Internal Approval / Client Approved [D-04]
- [ ] Tame services On-going-quiet (no journal/timestamps; recurring is quiet by design) [D-05]
- [ ] (opt) DLP "expiring soon" watch (both views) [D-06]
**Status**: DRAFT scope (`103.1-CONTEXT.md`, 2026-06-13) — pending operator review of open decisions (D-04 tiers, D-05 services treatment, D-06 include?). Next: confirm → `/gsd-plan-phase 103.1`. **Touches `firestore.rules`** (one allow-list field) → dev deploy for UAT + joins prod-rules-deploy debt. NO new portfolio listener. Cash/collection-risk signal explicitly deferred to a separate phase.