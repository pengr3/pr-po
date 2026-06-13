# Phase 104: Service Detail Parity (Lifecycle · Journal · DLP) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 104-service-detail-parity
**Areas discussed:** Lifecycle stages & gates, DLP / retention scope, Journal visibility, On-going signal upgrade

---

## Lifecycle stages & gates

### Q1 — Recurring service end state

| Option | Description | Selected |
|--------|-------------|----------|
| Recurring = no completion gate | One-time mirrors projects fully; recurring terminal at On-going, no completion/DLP | |
| Both complete identically | Recurring AND one-time use the full 8-stage track + Completion gate w/ dual docs | ✓ |
| Recurring completes, simpler docs | Recurring completes via a lighter single-doc closeout gate | |

**User's choice:** Both complete identically.
**Notes:** Maximum parity / least code divergence. Recurring services get the same Completion gate as
one-time; no trimmed lifecycle variant.

### Q2 — Gate documents for services

| Option | Description | Selected |
|--------|-------------|----------|
| Same docs & labels as projects | Inspection Report, NTP/PO, Completion Report + Certificate of Completion | ✓ |
| Relabel for services | Same 4 gates/slots, service vocabulary labels | |
| Fewer gates for services | Drop one or more document requirements | |

**User's choice:** Same docs & labels as projects.

### Q3 — Gate roles

| Option | Description | Selected |
|--------|-------------|----------|
| Service roles mirror project roles | services_admin + assigned services_user; Completion = services_admin-only; Finance for Release | ✓ |
| All gates admin-only | Only services_admin/super_admin drive gates; services_user read-only | |
| services_user can drive all gates | services_user drives every gate incl. Completion | |

**User's choice:** Service roles mirror project roles.

---

## DLP / retention scope

| Option | Description | Selected |
|--------|-------------|----------|
| Pure mirror, gated by retention tranche | Tranche editor + Ret? toggle + Completion-gate DLP + 4-state bar + Finance Record Release; surfaces only when a retention tranche is flagged | ✓ |
| One-time services only | DLP surfaces only for service_type === 'one-time' | |
| Skip DLP for services entirely | Don't port DLP this phase | |

**User's choice:** Pure mirror, gated by retention tranche.
**Notes:** Detail-page only — services portfolio already renders the 4 DLP states (Phase 103).

---

## Journal visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror projects exactly | Write at For-Mobilization/On-going, read-only Completed, hidden before/Loss; same auto-entry set | ✓ |
| Always-on while active | Show journal for any active non-Loss service regardless of stage | |
| On-going only | Journal only at On-going | |

**User's choice:** Mirror projects exactly.
**Notes:** 3 subcollections under services/{id}/; auto-entries: status changes, contract/budget edits,
4 lifecycle gate transitions, PO Delivered.

---

## On-going signal upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade one-time, keep recurring quiet | One-time gets two-tier activity clock (🟠>7d/🔴>14d on last_activity_at); recurring stays 103.1-conservative | ✓ |
| Full upgrade, both types | Both types read last_activity_at, two-tier 7/14 | |
| Wire-only, no signal change | Bump last_activity_at but leave 103.1 conservative signal as-is | |

**User's choice:** Upgrade one-time, keep recurring quiet.
**Notes:** Coherent extension of 103.1's own logic — recurring maintenance is quiet by design.
last_activity_at bump on journal writes must be fire-and-forget / not batched (103.1 D-03 landmine).

---

## Claude's Discretion

- Code structure: copy-then-adapt into service-detail.js per established Phase-26 pattern (default);
  opportunistic shared-helper extraction allowed but not required.
- Window-function names, CSS reuse vs service-scoped duplicate, plan/wave decomposition.
- Whether gate functions and the journal `_addActivityEntry` share the `status_changed_at` setter.

## Deferred Ideas

- Service Plan / Gantt parity → Phase 105 (needs a service task data model).
- Full upgrade of recurring On-going signal — revisit against production data if recurring services
  turn out to want a "gone quiet" flag.
- Prod firestore.rules deploy — dev-only this phase; rides the v3.3 → main merge debt.
