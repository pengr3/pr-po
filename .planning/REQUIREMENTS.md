# Requirements: CLMC Procurement System — v4.2 Polish, Home Revamp & Mobile

**Defined:** 2026-07-09
**Core Value:** Projects tab must work — it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v4.2 Requirements

Requirements for the v4.2 milestone. Each maps to a roadmap phase (numbering continues from 106).

### Home — Command Center (HOME)

The landing page becomes a role-aware "what should I do" surface. Every feed item is permission/assignment-scoped — a user only sees items they're allowed to act on.

- [ ] **HOME-01**: Landing shows a personalized greeting (name + date) and a one-line summary of how many items need the user's attention
- [ ] **HOME-02**: A "Needs your attention" feed surfaces only actionable items the user is permitted to see (permission + assignment scoped)
- [ ] **HOME-03**: Feed items are severity-ranked (critical / high / medium) and each links directly to the relevant record or action
- [ ] **HOME-04**: When nothing needs attention, the feed shows a calm "You're all caught up" empty state (no filler rows)
- [ ] **HOME-05**: Quick-KPI chips summarize the user's world, scoped by role (my counts / portfolio / financial / procurement)
- [ ] **HOME-06**: A "Your work" panel shows the user's own items (proposals in revision, assigned projects/services, submitted MRFs)
- [ ] **HOME-07**: A "Recent activity" panel shows the latest relevant events for the user's scope
- [ ] **HOME-08**: The five area nav cards/rail remain reachable from the landing
- [x] **HOME-09**: Super Admin feed = proposals awaiting approval · pending user registrations · most-overdue projects/services (both depts) · DLP windows expiring · overdue RFP payments
- [x] **HOME-10**: Operations/Services Admin feed = dept proposals awaiting approval · overdue in-stage items · DLP expiring · open issues & stale progress · own billing requests
- [x] **HOME-11**: Operations/Services User feed = my proposals For Revision · overdue stages on assigned items · open issues on my items · my rejected MRFs · projects with no progress update in 14 days
- [x] **HOME-12**: Finance feed = PRs pending · TRs pending · RFPs overdue/due this week · billing requests to decide · collectibles overdue · retention releases to record
- [x] **HOME-13**: Procurement feed = MRFs pending processing · aging POs to advance · rejected TRs to re-edit · delivered POs missing proof-of-procurement

### Home — Executive Dashboard (DASH)

A role-gated "how are we doing" overview, one click from the Command Center landing.

- [ ] **DASH-01**: A "Dashboard" sub-tab appears on Home only for Super Admin, Operations Admin, Services Admin, and Finance
- [ ] **DASH-02**: KPI tiles show active projects/services, contract value, payables owed, and collectibles due
- [ ] **DASH-03**: A project/service status-breakdown chart renders (Chart.js)
- [ ] **DASH-04**: A proposal-funnel chart renders
- [ ] **DASH-05**: A procurement spend-trend chart renders
- [ ] **DASH-06**: A portfolio-health table lists code · name · status · payable · collectible
- [ ] **DASH-07**: All dashboard data is scoped per role/department (Super Admin = both depts; dept admins = their dept; Finance = financial view across both)

### Entity Modals (MODAL)

Add and list-Edit for the three core entities move from the inline `.add-form` toggle to proper modals.

- [ ] **MODAL-01**: "Add Client" opens the create form in a modal (replacing the inline toggle form)
- [ ] **MODAL-02**: Editing a client from the list opens the same modal, pre-filled
- [ ] **MODAL-03**: "Add Project" opens the create form in a modal
- [ ] **MODAL-04**: Editing a project from the list opens the modal, pre-filled
- [ ] **MODAL-05**: "Add Service" opens the create form in a modal
- [ ] **MODAL-06**: Editing a service from the list opens the modal, pre-filled
- [ ] **MODAL-07**: All three modals reuse the shared `components.js` modal pattern (blur backdrop, validation, keyboard focus/Esc, mobile-responsive); project/service detail-page inline auto-save is unchanged

### Mobile — High-Traffic Views (MOBILE)

Extend the existing `≤768px` card-layout pattern (Finance/MRF already done) to the high-traffic views.

- [ ] **MOBILE-01**: Home (Command Center + Dashboard) is usable at ≤768px
- [ ] **MOBILE-02**: Projects and Services list views render mobile-friendly card layouts at ≤768px
- [ ] **MOBILE-03**: Project detail and Service detail pages are usable at ≤768px
- [ ] **MOBILE-04**: Clients list and client detail are usable at ≤768px
- [ ] **MOBILE-05**: Procurement MRF Records is usable at ≤768px
- [ ] **MOBILE-06**: Proposals views (Home Proposals sub-tab + proposal modal) are usable at ≤768px
- [ ] **MOBILE-07**: The new Add/Edit modals are usable at ≤768px

### Gantt — Mobile View-Only (GANTT)

- [ ] **GANTT-01**: The project/service plan (Gantt) renders readable and horizontally scrollable on phones (≤768px)
- [ ] **GANTT-02**: Task drag / resize / indent / inline-edit are disabled on mobile (view-only) — no broken touch interactions or accidental edits

### Data-Layer Audit & Optimization (AUDIT)

A report → fix pass over the Firestore SDK layer (the "API between frontend and DB"). Findings first, then remediation behind a review gate.

- [x] **AUDIT-01**: All Firestore reads/writes/listeners/queries across the views are inventoried and audited, producing a severity-ranked findings report *(Phase 106: 106-INVENTORY.md + 106-FINDINGS.md, 25 findings F-001–F-025)*
- [x] **AUDIT-02**: Integrity — denormalized-field consistency (`project_code` / `project_name` / `department` across MRFs·PRs·POs·TRs·RFPs), orphaned references, and status-derivation correctness are verified *(static code audit ✓ — F-001–F-004 etc.; live data-pass PENDING serviceAccountKey.json → carried to Phase 112)*
- [x] **AUDIT-03**: Security-rule coverage is verified against actual access patterns (every collection covered; no over- or under-permissioning) *(Phase 106: 33 rule blocks ↔ 28 code-accessed collections reconciled; F-005 over-perm, F-019 under-perm)*
- [x] **AUDIT-04**: Correctness — listener lifecycle (no leaks), read/write error handling, and legacy-safe field handling are verified *(Phase 106: 61-listener ledger; F-006–F-009, F-011)*
- [x] **AUDIT-05**: Efficiency — N+1 query patterns, redundant listeners/reads, client-side filtering that should be queries, and caching opportunities are identified *(Phase 106: 136-getDocs ledger; F-010, F-012–F-018, F-024–F-025)*
- [ ] **AUDIT-06**: High/Medium findings are remediated behind a review gate; Low findings are recorded to a tracked deferral list
- [ ] **AUDIT-07**: Production data found out-of-sync is corrected via one-time backfill scripts (built on `verify-integrity.js`) with dry-run + confirmation

## Future Requirements

Deferred — tracked but not in the v4.2 roadmap.

### Carry-overs

- **SUBCON-01** (Phase 68.1): Subcon cost scorecard sums subcon `items_json` items even when the PO `is_subcon` flag is unset
- **RECALL-01** (Phase 70 rework): Cancel-PR flow gains a proper approval workflow, audit trail, soft-delete, and role-based access
- **SVCPLAN-01** (Phase 105.1): Service Gantt gains baseline-snapshot + plan-iterations parity with Projects

### Deferred mobile / Gantt

- **MOBILE-FUT-01**: Mobile layouts for admin, assignments, role-config, user-management, and auth pages
- **GANTT-FUT-01**: Full mobile touch-editing of the Gantt (drag/resize/indent/inline-edit)

## Out of Scope

Explicitly excluded for v4.2. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New collections / new domain features | Polish + hygiene milestone — no schema growth expected |
| Email / push notifications | Standing exclusion — all communication stays in-app |
| Full mobile editing of the Gantt | View-only on mobile this milestone; touch-editing is its own future phase |
| Mobile for admin / assignments / role-config | Low-traffic back-office views — deferred to keep mobile effort focused |
| Phase 68.1 / Phase 70 / Phase 105.1 | Carry-overs deferred by decision — not folded into v4.2 |
| Re-architecting inline `onclick` → event listeners (CSP tightening) | Out of scope; tracked separately since Phase 49 |

## Traceability

Which phases cover which requirements. Roadmap created 2026-07-09.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUDIT-01 … AUDIT-05 | Phase 106 — Data-Layer Audit (Findings Report) | Complete (report verified 4/4; AUDIT-02 live data-pass → Phase 112) |
| HOME-01 … HOME-08 | Phase 107 — Home Command Center (Shell & Feed Engine) | Pending |
| HOME-09 … HOME-13 | Phase 108 — Home Per-Role Attention Feeds | ✅ Complete (browser UAT 5/5, 2026-07-13) |
| DASH-01 … DASH-07 | Phase 109 — Home Executive Dashboard | Pending |
| MODAL-01 … MODAL-07 | Phase 110 — Entity Add/Edit Modals | Pending |
| MOBILE-01 … MOBILE-07 | Phase 111 — Mobile High-Traffic Views & View-Only Gantt | Pending |
| GANTT-01 … GANTT-02 | Phase 111 — Mobile High-Traffic Views & View-Only Gantt | Pending |
| AUDIT-06 … AUDIT-07 | Phase 112 — Data-Layer Audit (Remediation & Backfill) | Pending |

**Coverage:**
- v4.2 requirements: 43 total (HOME×13, DASH×7, MODAL×7, MOBILE×7, GANTT×2, AUDIT×7)
- Mapped to phases: 43
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-09*
*Last updated: 2026-07-09 — roadmap created; all 43 v4.2 requirements mapped to Phases 106–112 (0 unmapped). HOME split across Phases 107 (shell/engine, HOME-01–08) + 108 (per-role feeds, HOME-09–13); AUDIT split across Phase 106 (report, AUDIT-01–05) + 112 (remediation, AUDIT-06–07); GANTT folded into the Phase 111 mobile pass.*
*2026-07-13 — Phase 108 complete: HOME-09–13 validated (browser UAT 5/5). Milestone v4.2 at 3/7 phases (106 ✅, 107 ✅, 108 ✅). Next: Phase 109 (DASH-01–07).*
