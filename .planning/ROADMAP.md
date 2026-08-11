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
- ◆ **v4.1 Assignment Source-of-Truth & Read Enforcement** — Phase 113 (active; 10/11 plans, production deploy outstanding)
- 📋 **v4.2 Home Command Center & Mobile** — Phases 106–112, defined on branch `v4.2` (to be rebased onto main after v4.1 ships)

## Phases

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

<details>
<summary>◆ v4.1 Assignment Source-of-Truth & Read Enforcement (Phase 113) — ACTIVE</summary>

1 phase, 11 plans / 7 waves. Makes `personnel_user_ids` the single authoritative record for
cross-department assignment visibility, retires both fire-and-forget sync pipelines, and enforces
`projects` read scoping server-side instead of as cosmetic client-side filtering.

Triggered by a live production defect — the fourth recurrence of a bug class three earlier quick
fixes had each patched at a different layer without auditing the write layer.

- 16/17 decisions delivered (D-14 explicitly deferred to its own phase).
- Emulator: 87 passing / 2 failing (both pre-existing, unrelated).
- Browser-verified against **dev** across all five roles.
- **Not shipped** — production deploy (113-11) outstanding; nothing is live yet.
- Full detail: `milestones/v4.1-ROADMAP.md`
- Requirements: `milestones/v4.1-REQUIREMENTS.md`

Beyond the original scope: CLMC code generation moved from a cross-collection range scan to an
atomic counter document, which is what allowed `services_admin` to be scoped server-side (D-16).

</details>

## Next

**Active milestone: v4.1.** One item remains — plan 113-11, the production deploy. Its ordering is
load-bearing: indexes (4) → `code_counters` rules + client bundle → seed counters → tightened rules.
Deploying the rules before seeding makes the first service creation for an unseeded client/year
throw.

`v4.2` (phases 106–112, Home command center / mobile / data-layer audit) is already defined on its
own branch. Plan: **rebase `v4.2` onto `main` later**, once v4.1 has shipped — not merge main into
it now. Phase 113 touched `firestore.rules`, `app/utils.js` and most view files, so expect conflicts
there and resolve them in v4.1's favour (the tightened rules and the personnel-derived getters are
the newer contract).

Phase numbering continues from 114 (never reset).

### Phase 113: Assignment Source-of-Truth and Project Read Enforcement *(v4.1)*

**Goal:** Make `personnel_user_ids` the single authoritative record for cross-department assignment visibility, retire the two fire-and-forget sync pipelines that maintain the derived `assigned_project_codes` / `assigned_service_codes` arrays, and enforce `projects` read scoping server-side instead of as cosmetic client-side filtering.

**Why now:** Live production defect — a `services_user` assigned to a project via the Personnel panel could not see it on `#/projects` nor file MRFs against it. Root cause confirmed by RED/GREEN Firestore emulator reproduction: `firestore.rules` `users.update` permitted only same-department admin→user writes, so `syncPersonnelToAssignments`' cross-department `updateDoc` was PERMISSION_DENIED and swallowed by a fire-and-forget `.catch()`, leaving the derived array unpopulated with zero UI feedback. Fourth recurrence of this bug class — quick-260627-kg0, quick-260706-mco and quick-260722-msg each patched a different read/UI layer without ever auditing the write layer. Debug trail: `.planning/debug/services-user-project-hidden.md`.

**Requirements**: D-01 … D-17 (no formal REQ-IDs exist for this phase — the requirement set IS the `113-CONTEXT.md` locked decision set)
**Depends on:** None — independent of v4.2 phases 106–112
**Plans:** 10/11 plans executed

**Numbering note:** numbered 113 (not 106) deliberately. Main's ROADMAP is stale and says numbering continues from 106, but branch `v4.2` has already used 106–112. 113 avoids a collision when main merges into v4.2.

Plans:
**Wave 1**

- [x] 113-01-PLAN.md — W1: 3 composite indexes + ADDITIVE firestore.rules widening (services list/update, project_tasks, service_tasks accept a personnel predicate) + emulator coverage

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 113-02-PLAN.md — W2: deploy indexes (wait for Enabled) then rules to production — blocking human gate

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 113-03-PLAN.md — W3: repoint getAssignedProjectCodes/getAssignedServiceCodes to a personnel-derived, listener-backed, fail-closed cache (utils.js + auth.js + scoping harness)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 113-04-PLAN.md — W4: projects.js / services.js / service-detail.js — scoped portfolio listeners + 4 sync call sites removed
- [x] 113-05-PLAN.md — W4: project-detail.js / project-plan.js / expense-modal.js — paired project_code lookups + preloaded-doc breakdown + 3 sync call sites removed
- [x] 113-06-PLAN.md — W4: mrf-form.js / procurement.js — scoped MRF pickers, services Shape-E retirement, PO-Delivered doc-ID journal lookup
- [x] 113-07-PLAN.md — W4: proposal-modal.js / clients.js / engagement-create.js — last unscoped reads + last 2 sync call sites removed
- [x] 113-08-PLAN.md — W4: assignments.js / user-management.js — Assignments tab repointed to write personnel_user_ids (D-05/D-06), display surfaces repointed (D-10)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 113-09-PLAN.md — W5: delete both sync helpers, D-03 completeness audit + D-12 sweep, production verification BEFORE tightening — blocking human gate

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 113-10-PLAN.md — W6: services_admin rules-posture decision (D-01 vs D-16), projects get/list split scoped on personnel, users.update carve-out dropped (D-17), D-14 residual documented, emulator coverage

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 113-11-PLAN.md — W7: deploy tightened rules + 11-step browser UAT — blocking human gates
