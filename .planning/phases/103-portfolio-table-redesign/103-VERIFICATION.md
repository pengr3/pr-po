---
status: passed
phase: 103-portfolio-table-redesign
verified: 2026-06-13
method: static (node --check + grep gates + cross-view contract) + human browser UAT (3 gates approved)
plans_verified: [01, 02, 03, 04]
requirements: [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7, SC-8, SC-9, D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08]
---

# Phase 103: Portfolio Table Redesign — Verification

**Verdict: PASSED.** All 4 plans delivered the Spike-033 D+B hybrid (Priority Feed + Browse All)
in both projects.js and services.js, sharing one CSS block. All automated gates green; all 3
blocking browser-UAT checkpoints approved by the operator 2026-06-13.

## Goal check (goal-backward)

Phase goal: replace the flat sortable portfolio table in BOTH projects.js and services.js with a
Priority Feed (urgency-ranked) + Browse All (stage-grouped collapsible) toggle at the same URL,
reusing Phase 102 DLP visuals and Phase 92 scorecards, with no new Firestore reads. **Achieved.**

## Must-have verification

| # | Must-have | Evidence | Status |
|---|-----------|----------|--------|
| 1 | Shared CSS block (toggle, feed sections, feed rows, stage-aware finance, stage groups), literal hex, W-1 DLP div-row overrides after tier rules | `bb94453`; Plan-01 verify (markers + no `var(--*)` + ordering) exits 0; brace-balanced 62/62 | ✓ |
| 2 | projects.js view-mode toggle persisted to `projects-view-mode`, first-time Feed | `fd4374f`; `vmSwitch` + localStorage; UAT-02 approved | ✓ |
| 3 | Priority Feed partitions Needs Attention / Worth Watching / On Track via getProjectSignal, signal text + hint | `fd4374f`; UAT-02 approved | ✓ |
| 4 | Stage-aware finance 4 states (pre/contracted/active/done) incl. Phase 102 DLP reuse | `3a05b92` renderFinancial; UAT-02 approved | ✓ |
| 5 | updated_at normalized for BOTH Timestamp + ISO string; missing → On Track (D-08) | `3a05b92` normalizeUpdatedAt (.toDate/.seconds/new Date) | ✓ |
| 6 | getDlpState REUSED (projects) / mirrored render-only (services); no new listener/read (D-05) | onSnapshot count unchanged (3 each); no billing_requests/collectibles load; UAT Network checks clean | ✓ |
| 7 | Browse All: 6 collapsible stage groups, all 10 statuses mapped to exactly one, Completed+Loss collapsed by default, collapse persisted (`browse-collapse`) | `6f26ab5`; Plan-03 grep gate (all 10 statuses); UAT-03 approved | ✓ |
| 8 | Both modes share the SAME filtered+scoped pool; scorecards above both (D-02); Phase-7/ASSIGN-04 scope intact | `fd4374f`/`e350fcb`; applyFilters/applyServiceFilters retain renderScorecards + scope; UAT-03/04 approved | ✓ |
| 9 | services.js mirrors the full hybrid within the one-time/recurring sub-tab (outer filter), 7 groups incl. Draft, own localStorage keys (D-01) | `5f1e81b`/`e350fcb`; Plan-04 grep gate (all 11 statuses incl. Draft); UAT-04 approved | ✓ |

## Automated gates
- `node --check app/views/projects.js` → exits 0
- `node --check app/views/services.js` → exits 0
- All plan verify commands (CSS markers, helper presence, W-3 no-dangling-ref gates, window register↔teardown symmetry) → OK
- Cross-view contract: both JS files reference all 12 shared CSS classes (identical look, D-01)
- No new Firestore listener anywhere (onSnapshot count unchanged); no schema/rules change

## Human UAT (3 blocking gates — all approved 2026-06-13)
- Plan 02 — Projects Priority Feed: **approved** (after a stale-stylesheet hard-refresh; no code defect — CSS was correct on disk, the hash-SPA had cached the pre-103 views.css)
- Plan 03 — Projects Browse All: **approved**
- Plan 04 — Services mirror: **approved**

## Known partial (accepted, not a gap)
- **W-2** — On-going "mini utilization bar" ships empty (no paid-%). `collection_tranches` doesn't
  record billed state and the portfolio is forbidden from loading billing data (D-05: no new
  listener); `computeBillingPct`/`computeServiceBillingPct` return null and the cell shows the
  contract value + "{N} tranches defined". Full utilization-% deferred to a future billing-aware
  phase. CONTEXT-sanctioned; do NOT re-flag as an incomplete D-06.

## Regression
- No automated test suite (zero-build static SPA). `node --check` on both changed modules passes.
  No prior-phase behavior touched beyond the projects/services portfolio render path.

## Notes / carried debt (unchanged by this phase)
- No firestore.rules change. The standing prod-rules-deploy debt (Phase 87.4 / 99 / 100 / 101 / 102)
  is NOT affected by Phase 103.

---
*Phase: 103-portfolio-table-redesign*
*Verified: 2026-06-13 — PASSED (static + 3 human UAT gates approved)*
