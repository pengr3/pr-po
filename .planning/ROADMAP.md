# Roadmap: CLMC Procurement System

## Milestones

- ✅ **v1.0 Core Projects Foundation** — Phases 1–4 (shipped 2026-01-30)
- ✅ **v2.0 Authentication & Permissions** — Phases 5–10 (shipped 2026-02-04)
- ✅ **v2.1 System Refinement** — Phases 11–13 (shipped 2026-02-06)
- ✅ **v2.2 Workflow & UX Enhancements** — Phases 15–25 (shipped 2026-02-10)
- ✅ **v2.3 Services Department Support** — Phases 26–40 (shipped 2026-02-26)
- ✅ **v2.4 Productivity & Polish** — Phases 41–48 (shipped 2026-03-01)
- ✅ **v2.5 Data & Application Security** — Phases 49–53 (shipped 2026-03-02)
- ✅ **v3.0 Frontend Precision Fixes** — Phases 54–56 (shipped 2026-03-04)
- ✅ **v3.1 PR/TR Routing & Procurement Improvements** — Phases 57–62.2 (shipped 2026-03-10)
- ✅ **v3.2 Supplier Search, Proof of Procurement & Payables** — Phases 63–82 (shipped 2026-04-28)
- ✅ **v4.0 Procurement → Full Management Portal** — Phases 83–105 (shipped 2026-06-16)
- 🚧 **v4.2 Polish, Home Revamp & Mobile** — Phases 106–112 (in progress)

## Phases

🚧 **v4.2 Polish, Home Revamp & Mobile (Phases 106–112) — IN PROGRESS**

Started 2026-07-09. Numbering continues from v4.0 (last phase 105 — v4.1 shipped informally as `quick/` tasks, no formal phases). Six workstreams across 7 phases: a data-layer audit run as report → fix (findings land early to guide the UI, remediation lands last), the new role-aware Home (Command Center shell + per-role feeds + Executive Dashboard), entity Add/Edit modals, and mobile coverage for the high-traffic views plus a view-only Gantt. **43/43 v4.2 requirements mapped, 0 unmapped.**

| # | Phase | Goal | Requirements | Success criteria |
|---|-------|------|--------------|------------------|
| 106 | Data-Layer Audit — Findings Report | Severity-ranked audit of the whole Firestore SDK layer before new UI is layered on | AUDIT-01–05 | 4 |
| 107 | Home — Command Center Shell & Feed Engine | Replace the thin landing with a role-scoped "needs your attention" surface | HOME-01–08 | 4 |
| 108 | Home — Per-Role Attention Feeds | Populate the feed with the five role-specific definitions | HOME-09–13 | 4 |
| 109 | Home — Executive Dashboard | Role-gated Home sub-tab with KPI tiles + charts + portfolio-health table | DASH-01–07 | 4 |
| 110 | Entity Add/Edit Modals | Move Client/Project/Service Add + list-Edit to the shared modal pattern | MODAL-01–07 | 4 |
| 111 | Mobile — High-Traffic Views & View-Only Gantt | Phone layouts for Home, lists/details, Clients, MRF Records, Proposals, modals + scrollable read-only Gantt | MOBILE-01–07, GANTT-01–02 | 4 |
| 112 | Data-Layer Audit — Remediation & Backfill | Fix High/Medium behind a review gate, defer Low, backfill out-of-sync prod data | AUDIT-06–07 | 3 |

### Phase 106: Data-Layer Audit — Findings Report
**Goal**: Inventory and audit the entire Firestore SDK layer — every read, write, listener, and query across the views — and produce a single severity-ranked findings report, so data-layer issues are known and can guide the new UI before it is built on top.
**Depends on**: Nothing (first v4.2 phase; sequenced early so findings inform Phases 107–111)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05
**Success Criteria** (what must be TRUE):
  1. A findings report exists that inventories every Firestore read/write/listener/query across the views, each tagged High / Medium / Low.
  2. The report flags integrity issues — denormalized-field drift (`project_code` / `project_name` / `department` across MRFs·PRs·POs·TRs·RFPs), orphaned references, and status-derivation errors.
  3. The report states, per collection, whether security rules match actual access patterns, calling out any over- or under-permissioning.
  4. The report lists correctness issues (listener leaks, missing error handling, legacy-unsafe field reads) and efficiency issues (N+1, redundant reads/listeners, client-side filtering that should be queries, caching opportunities).
**Plans**: 7 plans in 3 waves

**Wave 1 (foundation, parallel):**
- [x] 106-01-PLAN.md — Extend verify-integrity.js with read-only drift-across-chain check + `--project` flag; run dev→prod; capture real counts → 106-DATA-RESULTS.md (AUDIT-02) *(script done, read-only; ⚠ data-pass PENDING serviceAccountKey.json)*
- [x] 106-02-PLAN.md — Exhaustive file:line SDK call-site inventory across the 35-file surface → 106-INVENTORY.md (AUDIT-01)

**Wave 2 (dimension audits, parallel — all blocked on Wave 1's 106-02 inventory; each carries a coverage ledger):**
- [x] 106-03-PLAN.md — Integrity audit: denorm-drift write-paths, orphan cascades, status-derivation, ID-race → 106-SCRATCH-integrity.md (AUDIT-02)
- [x] 106-04-PLAN.md — Correctness audit: listener lifecycle/leaks, error handling, legacy-unsafe reads → 106-SCRATCH-correctness.md (AUDIT-04)
- [x] 106-05-PLAN.md — Efficiency audit: N+1, client-side filtering, missing limit(), redundant reads, caching → 106-SCRATCH-efficiency.md (AUDIT-05)
- [x] 106-06-PLAN.md — Security-rule reconciliation: rules vs access, over/under-permissioning, dead rules → 106-SCRATCH-security.md (AUDIT-03)

**Wave 3 (synthesis, blocked on Waves 1–2):**
- [ ] 106-07-PLAN.md — Synthesize the single ranked 106-FINDINGS.md (F-00N IDs, summary-table index, no drops) (AUDIT-01)

**Cross-cutting constraints** (truths shared across 2+ plans): all findings use the canonical D-07 schema (id/severity/category/collection/anchor/impact/recommendation/handling/target_phase) with the D-08 severity rubric; each dimension audit (03/04/05) must produce a per-item **coverage ledger** proving exhaustive surface coverage, not a sample; v4.0-collection *live* measurement is deferred to Phase 112 (D-04); the audit is read-only — no fixes, no prod writes (Phase 112 owns remediation).

### Phase 107: Home — Command Center Shell & Feed Engine
**Goal**: Replace the thin landing page with a role-aware Command Center — a personalized greeting, a permission/assignment-scoped "Needs your attention" feed (severity-ranked, deep-linked, with a calm empty state), quick-KPI chips, a "Your work" panel, a "Recent activity" panel, and the five reachable area nav cards.
**Depends on**: Phase 106 (audit findings inform the feed's data-layer reads)
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08
**Success Criteria** (what must be TRUE):
  1. On landing, a signed-in user sees a personalized greeting (name + date) and a one-line count of how many items need their attention.
  2. The "Needs your attention" feed shows only items the user is permitted and assigned to act on, each severity-ranked (high / medium) and clickable straight through to the relevant record or action.
  3. When nothing is pending, the feed shows a calm "You're all caught up" state with no filler rows.
  4. Quick-KPI chips, a "Your work" panel, and a "Recent activity" panel summarize the user's scope, and the five area nav cards remain reachable from the landing.
**Plans**: TBD
**UI hint**: yes

### Phase 108: Home — Per-Role Attention Feeds
**Goal**: Populate the Command Center feed with the five role-specific feed definitions so each role sees exactly the actionable items relevant to them, drawing on existing proposals, journal (issues / progress), DLP/retention, RFP, collectibles, billing-request, MRF, PR/TR, and PO data (no new collections).
**Depends on**: Phase 107 (feed engine + scoping framework)
**Requirements**: HOME-09, HOME-10, HOME-11, HOME-12, HOME-13
**Success Criteria** (what must be TRUE):
  1. A Super Admin sees proposals awaiting approval, pending user registrations, the most-overdue projects/services across both departments, expiring DLP windows, and overdue RFP payments.
  2. An Operations/Services Admin sees their department's proposals awaiting approval, overdue in-stage items, expiring DLP, open issues & stale progress, and their own billing requests.
  3. An Operations/Services User sees their proposals For Revision, overdue stages on assigned items, open issues on their items, their rejected MRFs, and projects with no progress update in 14 days.
  4. Finance sees pending PRs/TRs, RFPs overdue/due-this-week, billing requests to decide, overdue collectibles, and retention releases to record; Procurement sees MRFs pending processing, aging POs, rejected TRs to re-edit, and delivered POs missing proof-of-procurement.
**Plans**: TBD

### Phase 109: Home — Executive Dashboard
**Goal**: Add a role-gated "Dashboard" sub-tab to Home with KPI tiles and Chart.js visualizations (status breakdown, proposal funnel, spend trend) plus a portfolio-health table, all scoped per role/department — restoring and extending the Phase 77 charts.
**Depends on**: Phase 107 (Home shell hosts the sub-tab)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07
**Success Criteria** (what must be TRUE):
  1. Super Admin, Operations Admin, Services Admin, and Finance see a "Dashboard" sub-tab on Home; other roles do not.
  2. KPI tiles show active projects/services, contract value, payables owed, and collectibles due.
  3. Status-breakdown, proposal-funnel, and procurement spend-trend charts render via Chart.js.
  4. A portfolio-health table lists code · name · status · payable · collectible, and every figure is scoped to the viewer's role/department.
**Plans**: TBD
**UI hint**: yes

### Phase 110: Entity Add/Edit Modals
**Goal**: Convert Add and list-Edit for Client, Project, and Service from the inline `.add-form` toggle to proper modals that reuse the shared `components.js` pattern; project/service detail-page inline auto-save stays exactly as it is.
**Depends on**: Nothing hard (independent of the Home revamp; sequenced after it). MODAL-* must land before MOBILE-07 in Phase 111.
**Requirements**: MODAL-01, MODAL-02, MODAL-03, MODAL-04, MODAL-05, MODAL-06, MODAL-07
**Success Criteria** (what must be TRUE):
  1. "Add Client", "Add Project", and "Add Service" each open the create form in a modal (blur backdrop, keyboard focus/Esc) instead of the inline toggle form.
  2. Editing a client, project, or service from its list opens the same modal, pre-filled.
  3. All three modals validate input and reuse the shared `components.js` modal pattern.
  4. Project and service detail-page inline auto-save behaves exactly as before (unchanged).
**Plans**: TBD
**UI hint**: yes

### Phase 111: Mobile — High-Traffic Views & View-Only Gantt
**Goal**: Extend the existing ≤768px card-layout pattern to the high-traffic views (the new Home, Projects/Services lists & details, Clients, Procurement MRF Records, Proposals, and the new modals) and make the project/service plan (Gantt) readable + horizontally scrollable on phones with all editing disabled (view-only).
**Depends on**: Phases 107, 108, 109 (the new Home must exist to be made mobile) and Phase 110 (the new modals must exist for MOBILE-07)
**Requirements**: MOBILE-01, MOBILE-02, MOBILE-03, MOBILE-04, MOBILE-05, MOBILE-06, MOBILE-07, GANTT-01, GANTT-02
**Success Criteria** (what must be TRUE):
  1. At ≤768px the new Home (Command Center + Dashboard) is usable with no horizontal overflow.
  2. Projects/Services lists & details, Clients list & detail, Procurement MRF Records, and Proposals views render mobile-friendly card layouts at ≤768px.
  3. The new Add/Edit modals are usable at ≤768px.
  4. The project/service plan (Gantt) is readable and horizontally scrollable on phones, while drag / resize / indent / inline-edit are disabled so there are no broken touch interactions or accidental edits.
**Plans**: TBD
**UI hint**: yes

### Phase 112: Data-Layer Audit — Remediation & Backfill
**Goal**: Behind a review gate, remediate the High/Medium findings from Phase 106, record Low findings to a tracked deferral list, and correct any out-of-sync production data via one-time backfill scripts (built on `verify-integrity.js`) with dry-run + confirmation — sequenced last so fixes account for the patterns established by the new UI.
**Depends on**: Phase 106 (findings report); benefits from Phases 107–111 being in place so remediation covers the final data-layer surface
**Requirements**: AUDIT-06, AUDIT-07
**Success Criteria** (what must be TRUE):
  1. Every High/Medium finding is either fixed after review-gate approval or explicitly accepted, with the outcome recorded.
  2. Low-severity findings are captured on a tracked deferral list rather than silently dropped.
  3. Out-of-sync production data is corrected by one-time backfill scripts that support a dry-run preview and require explicit typed confirmation before writing.
**Plans**: TBD

<details>
<summary>✅ v4.0 Procurement → Full Management Portal (Phases 83–105) — SHIPPED 2026-06-16</summary>

53 phases, ~189 plans. Five capability areas: Project Management (Gantt/Tasks), In-app Notifications, Collectibles Tracking, Proposal Lifecycle, and a Super-Admin Management hub — plus portfolio redesign, DLP/retention, project journal, and full project↔service parity.

- 51/51 active requirements delivered. Audit verdict `tech_debt` (no code blockers).
- Full phase-by-phase detail: `milestones/v4.0-ROADMAP.md`
- Requirements snapshot: `milestones/v4.0-REQUIREMENTS.md`
- Audit + acceptances: `milestones/v4.0-MILESTONE-AUDIT.md`
- Shipped via PR #75 (v3.3 → main, merge `34f65e36`); prod rules deployed + live.

**Deferred to v4.1+:** Phase 105.1 (service baseline + plan iterations); v3.2 carry-overs Phase 68.1 (subcon scorecard) and Phase 70 rework (cancel-PR approval flow).

</details>

Earlier milestones (v1.0–v3.2) are archived under `.planning/milestones/`.

## Next

🚧 **v4.2 in progress** — Phases 106–112 are defined and 43/43 requirements are mapped. Start with **Phase 106: Data-Layer Audit — Findings Report** via `/gsd-plan-phase 106`. Phase numbering continues from 105 (never reset).
