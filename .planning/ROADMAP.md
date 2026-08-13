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
- ✅ **v4.1 Assignment Source-of-Truth & Read Enforcement** — Phase 113 (shipped 2026-08-12)
- 📋 **v4.2 Home Command Center & Mobile** — Phases 106–112, defined on branch `v4.2` (to be rebased onto main now that v4.1 has shipped)
- ◆ **v4.3 Observability & Error Handling** — Phases 114–120 (active)

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
<summary>✅ v4.1 Assignment Source-of-Truth & Read Enforcement (Phase 113) — SHIPPED 2026-08-12</summary>

1 phase, 11 plans / 7 waves. Makes `personnel_user_ids` the single authoritative record for
cross-department assignment visibility, retires both fire-and-forget sync pipelines, and enforces
`projects` read scoping server-side instead of as cosmetic client-side filtering.

Triggered by a live production defect — the fourth recurrence of a bug class three earlier quick
fixes had each patched at a different layer without auditing the write layer.

- 16/17 decisions delivered (D-14 explicitly deferred to its own phase).
- Emulator: 87 passing / 2 failing (both pre-existing, unrelated).
- Browser-verified against **dev** across all five roles, then against **production** post-deploy.
- **Shipped 2026-08-12** — 4 personnel indexes `READY`, `code_counters` seeded (49 pairs + `MALDOR_2026`),
  client bundle `f205889` live, tightened rules `c93d6dc` released. Rollback (`a0c4689`) never needed.

- Production UAT: all exercisable items PASS, zero rollbacks. Detail: `phases/113-*/113-HUMAN-UAT.md`
  and `113-11-SUMMARY.md`.

- Full detail: `milestones/v4.1-ROADMAP.md`
- Requirements: `milestones/v4.1-REQUIREMENTS.md`

Beyond the original scope: CLMC code generation moved from a cross-collection range scan to an
atomic counter document, which is what allowed `services_admin` to be scoped server-side (D-16).

</details>

<details>
<summary>◆ v4.3 Observability & Error Handling (Phases 114–120) — ACTIVE</summary>

7 phases, 34 requirements (OBS×8, ATTR×4, ERRC×9, UX×4, RETRO×5, GUARD×4). Adds a self-hosted,
version-pinned Sentry browser SDK plus an app-wide `reportError()` contract with severity tiering,
correlation IDs, and identity attribution — replacing 422 ad-hoc `console.error` calls and 57
fire-and-forget `.catch()` tails with an error path that reaches a dashboard instead of dying
silently in a browser console nobody reads.

Motivated by Phase 113's root cause: a fire-and-forget `.catch()` whose body only called
`console.error`. From the JS engine's perspective that promise **was handled**, so it structurally
never fires `unhandledrejection` — meaning Sentry's free global capture gives zero coverage for this
exact bug class. The milestone's value is concentrated in the contract and retrofit phases
(116, 118, 119), not the SDK install (114).

- **Hard dependency — MET 2026-08-12.** v4.1's plan 113-11 (production `firestore.rules` deploy)
  has shipped, so ERRC-03's read-vs-write `permission-denied` severity rule can now be calibrated
  against live post-113 rules behavior. Phase 114 is unblocked.

- **Milestone acceptance test (GUARD-04, Phase 120):** a deliberate cross-department write rejection,
  run in production, must produce exactly one error-tier Sentry event tagged with role, collection,
  and operation.

- Full phase detail: see `## Next` below — this milestone is defined directly in this file, not yet
  split to a separate `milestones/v4.3-*` snapshot (it hasn't shipped).

- Requirements: `.planning/REQUIREMENTS.md`
- Research: `.planning/research/SUMMARY.md`

</details>

## Next

**Active milestone: v4.3 Observability & Error Handling.** Start at **Phase 114** —
`/gsd:discuss-phase 114`.

**v4.1 shipped 2026-08-12.** The deploy ran in the load-bearing order recorded in
`113-10-SUMMARY.md:125`: indexes (4) → `code_counters` rules + client bundle → seed counters →
tightened rules. Plan 113-11 as written was stale on two of those four steps; the executed sequence
and the reasons are in `113-11-SUMMARY.md`.

`v4.2` (phases 106–112, Home command center / mobile / data-layer audit) is defined on its own
branch and is now **unblocked for rebase onto `main`** — not a merge of main into it. Phase 113
touched `firestore.rules`, `app/utils.js` and most view files, so expect conflicts there and resolve
them in v4.1's favour (the tightened rules and the personnel-derived getters are the newer
contract). Sequencing v4.2's rebase against v4.3's phases is an open call.

Phase numbering continues from 114 (never reset).

### Phase 113: Assignment Source-of-Truth and Project Read Enforcement *(v4.1)*

**Goal:** Make `personnel_user_ids` the single authoritative record for cross-department assignment visibility, retire the two fire-and-forget sync pipelines that maintain the derived `assigned_project_codes` / `assigned_service_codes` arrays, and enforce `projects` read scoping server-side instead of as cosmetic client-side filtering.

**Why now:** Live production defect — a `services_user` assigned to a project via the Personnel panel could not see it on `#/projects` nor file MRFs against it. Root cause confirmed by RED/GREEN Firestore emulator reproduction: `firestore.rules` `users.update` permitted only same-department admin→user writes, so `syncPersonnelToAssignments`' cross-department `updateDoc` was PERMISSION_DENIED and swallowed by a fire-and-forget `.catch()`, leaving the derived array unpopulated with zero UI feedback. Fourth recurrence of this bug class — quick-260627-kg0, quick-260706-mco and quick-260722-msg each patched a different read/UI layer without ever auditing the write layer. Debug trail: `.planning/debug/services-user-project-hidden.md`.

**Requirements**: D-01 … D-17 (no formal REQ-IDs exist for this phase — the requirement set IS the `113-CONTEXT.md` locked decision set)
**Depends on:** None — independent of v4.2 phases 106–112
**Plans:** 11/11 plans executed — **COMPLETE**

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

- [x] 113-11-PLAN.md — W7: deploy tightened rules + production UAT — blocking human gates *(shipped 2026-08-12; plan was stale, executed per `113-10-SUMMARY.md:125` — see `113-11-SUMMARY.md`)*

---

**ACTIVE MILESTONE: v4.3 Observability & Error Handling.** Phases 114–120, scoped from
`.planning/REQUIREMENTS.md` (34 requirements) and `.planning/research/SUMMARY.md`. The hard
prerequisite — v4.1's plan 113-11, the production deploy of the tightened `firestore.rules` — was
**met on 2026-08-12**, so Phase 114 is unblocked and ERRC-03's read-vs-write `permission-denied`
severity rule can be calibrated against live post-113 behavior.

**Goal:** Make production failures visible, attributable, and diagnosable — a broken workflow should
surface on a dashboard with the user, role, and stack trace attached, instead of dying silently in a
browser console nobody reads. Motivated by Phase 113's root cause: a fire-and-forget `.catch()` whose
body only called `console.error` — invisible to Sentry's global handlers because a promise with *any*
`.catch()` attached is "handled" from the JS engine's perspective and structurally never fires
`unhandledrejection`. Installing the Sentry SDK (Phase 114) is cheap and mechanical; the milestone's
real value is concentrated in the error contract (Phase 116) and the targeted retrofit (Phases
118–119).

**v4.3 Phases:**

- [ ] Phase 114: Observability Foundation
- [ ] Phase 115: Identity Attribution
- [ ] Phase 116: Error Contract & Correlation ID UX
- [ ] Phase 117: Global Handlers, Router Choke Point & Alert Retrofit
- [ ] Phase 118: Retrofit Audit
- [ ] Phase 119: Retrofit Conversion
- [ ] Phase 120: Guardrail, Alerting & Milestone Acceptance

### Phase 114: Observability Foundation *(v4.3)*

**Goal:** Production errors are visible on the Sentry dashboard with zero PII leakage and zero user-facing dependency on Sentry being reachable.
**Why:** Installing the SDK is cheap and mechanical, but its two failure modes here are silent — a CSP block throws no catchable error ("dashboard is quiet" looks identical to "no errors occurred"), and default console breadcrumbs would echo 422 existing `console.error` calls (plausibly containing supplier/PO/bank data) into Sentry the instant `init()` runs, with zero new code. Both must close in this phase, verified empirically in production, not assumed from the diff.
**Note:** the SDK version pin (research found `10.70.0`, disputed by one patch against `10.69.0`) and its SRI hash must be re-verified against the live CDN at phase kickoff — do not carry forward either number as final.
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06, OBS-07
**Depends on:** v4.1 plan 113-11 (production `firestore.rules` deploy) — **met 2026-08-12**. No dependency on v4.2 (separate branch, separate rebase).
**Success Criteria** (what must be TRUE):

  1. Sentry SDK loads from a self-hosted, version-pinned bundle and initializes before the app's ES-module bootstrap; a deliberately triggered error in production appears in the Sentry dashboard with a readable stack trace
  2. The app functions identically — every view loads, every write succeeds — when the Sentry bundle is blocked or fails to load; no feature checks or depends on `window.Sentry` existing
  3. CSP permits the Sentry ingest host in all four occurrences (`netlify.toml` + `_headers`, each duplicated across a `/*` block and a `/*.html` block), verified against live production response headers, and the two files remain byte-identical
  4. No supplier name, client name, PO/PR/RFP contents, line-item amounts, or bank/payment details appear in any captured Sentry event or breadcrumb — `sendDefaultPii` disabled and scrubbing shipped in the same commit as `Sentry.init()`
  5. Every event carries a `release` string and an `environment` tag, with localhost traffic tagged `development`

**Plans**: 6 plans in 5 waves

Plans:
**Wave 1**

- [x] 114-01-PLAN.md — W1: Sentry org + DSN human gate, SDK version resolved empirically, `lib/obs.min.js` pinned *(blocking human gate)*

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 114-02-PLAN.md — W2: `app/sentry-init.js` — init + beforeSend/beforeBreadcrumb scrubbing (one commit), env/release tagging, `window.__sentryTest()`
- [x] 114-03-PLAN.md — W2: CSP ingest host in all four occurrences (one atomic commit) + recurring gates written into `HEADERS-README.md`

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 114-04-PLAN.md — W3: two classic `<script>` tags in `index.html` head above the ESM bootstrap + `CLAUDE.md` notes

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 114-05-PLAN.md — W4: localhost pipeline verification against dev Firebase, then deploy + live CSP read-back *(blocking human gate)*

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 114-06-PLAN.md — W5: production test event + blocked-bundle degradation *(blocking human gates)*

### Phase 115: Identity Attribution *(v4.3)*

**Goal:** Every Sentry event answers "whose error is this and what were they doing," without a new subscription.
**Requirements**: ATTR-01, ATTR-02, ATTR-03, ATTR-04
**Depends on:** Phase 114
**Success Criteria** (what must be TRUE):

  1. Every Sentry event includes the acting user's Firebase uid and email
  2. Every Sentry event carries the acting user's role and department as filterable tags
  3. When a user's role or permissions change mid-session, subsequent events reflect the new role — reusing the existing `onSnapshot(users/{uid})` role-diff branch already computed in `app/auth.js`, no new subscription
  4. After logout, no subsequent event is attributed to the previous session's user

**Plans**: TBD

### Phase 116: Error Contract & Correlation ID UX *(v4.3)*

**Goal:** A single `reportError()` in `app/errors.js` is the only path from application code to Sentry, classifies every error into a documented severity tier, and always gives the user a correlation ID they can read back — whether or not Sentry is reachable.
**Why:** This is the load-bearing design phase. The severity-tiering rule (especially the read-vs-write `permission-denied` split) and the correlation-ID/toast round-trip must be settled and reviewed here — before any mechanical catch-block conversion begins in Phases 118–119 — or the retrofit risks reproducing either quota exhaustion or the exact invisibility this milestone exists to fix.
**Requirements**: ERRC-01, ERRC-02, ERRC-03, ERRC-04, ERRC-05, ERRC-06, ERRC-07, ERRC-08, ERRC-09, UX-02, UX-03, UX-04
**Depends on:** Phase 115
**Success Criteria** (what must be TRUE):

  1. `reportError()` in `app/errors.js` is the only path application code uses to report to Sentry; it classifies each error into report/breadcrumb/console-only tiers using the Firebase `.code` field, never `.message`
  2. A write-path `permission-denied` always reports at error tier; a read-path `permission-denied` reports at breadcrumb tier only
  3. Every reported error generates a correlation ID before any Sentry-availability check, shown in a non-auto-dismissing toast with no raw exception text or stack trace, and attached as a searchable tag on the same Sentry event
  4. `reportError()` always writes to console and always surfaces a toast to the user, with or without Sentry available; reported errors carry structured context (`operation: read|write`, collection, acting role)
  5. A reviewed triage table classifies representative catch sites by tier and read/write path before any conversion work begins; a correlation ID read back verbally by a user is enough for the developer to locate that exact event in Sentry

**Plans**: TBD

### Phase 117: Global Handlers, Router Choke Point & Alert Retrofit *(v4.3)*

**Goal:** Uncaught errors, every lazy-loaded view's load failure, and every remaining raw `alert()` call all route through the `reportError()`/toast contract, without ever clobbering Sentry's own default handlers.
**Requirements**: GUARD-03, RETRO-05, OBS-08, UX-01
**Depends on:** Phase 116
**Success Criteria** (what must be TRUE):

  1. Supplementary global listeners are registered via `addEventListener('error'/'unhandledrejection', ...)`, never by assigning `window.onerror`/`window.onunhandledrejection`, and never call `captureException` themselves
  2. The `navigate()` catch in `app/router.js` routes through `reportError()`, covering every lazy-loaded view's load failure app-wide, including stale-module failures
  3. Every hash-based navigation appears as a breadcrumb on subsequent Sentry events
  4. All 19 bare `alert()` calls across the codebase are replaced with `showToast()` carrying a correlation ID

**Plans**: TBD

### Phase 118: Retrofit Audit *(v4.3)*

**Goal:** Every fire-and-forget `.catch()` tail and every bare-`console.error`-only catch block is classified in a reviewed artifact, before a single line of mechanical conversion happens.
**Why:** No automated test coverage exists for this layer (the only suite is Firestore rules tests) and there is no staging environment — the audit and the conversion must be separate, reviewed steps, never collapsed into one pass.
**Requirements**: RETRO-01
**Depends on:** Phase 116
**Success Criteria** (what must be TRUE):

  1. An audit artifact lists all 57 fire-and-forget `.catch()` tails, each classified by severity tier and read/write path
  2. The same artifact lists every catch block whose entire body is a bare `console.error`, classified by severity tier and read/write path
  3. The artifact is reviewed and signed off before Phase 119 conversion work begins

**Plans**: TBD

### Phase 119: Retrofit Conversion *(v4.3)*

**Goal:** The audited write-path catch sites — the direct fix for the Phase 113 bug class — route through `reportError()`, batched per file, risk-ascending, financial write-path files last.
**Requirements**: RETRO-02, RETRO-03, RETRO-04
**Depends on:** Phase 118
**Success Criteria** (what must be TRUE):

  1. Every write-path `.catch()` tail (`updateDoc`/`setDoc`/`addDoc`/`deleteDoc`/`writeBatch`/`runTransaction`) routes through `reportError()` *(Pass A)*
  2. Every write-path catch block whose only statement is `console.error` routes through `reportError()` *(Pass B)*
  3. `app/views/project-plan.js` and `app/views/service-plan.js` are converted together as a single reviewed diff, with their ~28 inline `permission-denied` ternaries routed through the contract *(Pass C)*

**Plans**: TBD

### Phase 120: Guardrail, Alerting & Milestone Acceptance *(v4.3)*

**Goal:** The systemic fix is verified against the exact bug class that motivated the milestone, with alerting in place and a documented convention preventing regression.
**Requirements**: GUARD-01, GUARD-02, GUARD-04
**Depends on:** Phase 119
**Success Criteria** (what must be TRUE):

  1. At least one Sentry alert rule notifies on a new production issue
  2. CLAUDE.md documents the `reportError()` convention and the `window.onerror =` clobbering anti-pattern, written from converted examples that actually shipped in Phases 117 and 119
  3. A deliberate cross-department write rejection, run in production, produces exactly one error-tier Sentry event tagged with role, collection, and operation — sufficient to diagnose without reproducing

**Plans**: TBD
