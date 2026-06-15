---
spike: 029
name: responsibility-map
type: standard
validates: "Given 3 divergent role systems, when 'what needs me' is derived from role_templates (edit:true on owning tab + a small override table), then a live 7-role demo shows the correct queue set per role and flags every drift before any refactor"
verdict: PENDING
related: [028, 030]
tags: [roles, permissions, responsibility, consolidate, action-center, home, refactor, drift]
---

# Spike 029: Responsibility Map

## What This Validates
Given CLMC has three divergent role systems — the canonical `role_templates` vs. hardcoded role-name
arrays in `home.js` / `finance.js` / `procurement.js` — when "what needs me" is **derived** from
`role_templates` (`edit:true` on the owning tab, plus a small override table for cross-cutting actions),
then a live 7-role demo shows the correct action-queue set per role **and** flags every place the current
hardcoded code drifts — *before* committing to the refactor.

This is the "stir up the roles" spike, scoped to **Consolidate** (the user confirmed: roles are correct,
enforcement is the problem; responsibility is role-level, not per-person).

## Why This Gates the Action Center (from Spike 028)
The Action Center is a *responsibility surface*: every tile claims "this is yours to act on." If that claim
comes from hardcoded role names, it's wrong the moment an admin adds a role via `/admin`, and it already
drifts today. So the responsibility set must derive from the one source of truth that's runtime-mutable
and router-enforced: `role_templates`.

## The Model Being Tested
- **Derivation rule:** `responsibility(queue) = role has edit:true on queue.owningTab`.
- **Override table:** cross-cutting actions that aren't a single tab. Today the only real one is
  **proposal approval** → `['super_admin','operations_admin']` (ported from `home.js` `canApproveQueue`).
- **Anchored on the user's stated model:** PR + Collectible → Finance; Proposal → Boss (super_admin).
  The spike's Findings panel sanity-checks that the derived Finance set matches this exactly.

## Fidelity (this is not a mock of the rules)
- `ROLE_TEMPLATES` in `spike.html` is **verbatim** from `app/seed-roles.js` (all 7 roles, 12 tabs each).
- `CURRENT_getDashboardMode()` and `CURRENT_getHomeSubTabConfig()` are **verbatim ports** of the live
  `home.js` functions — so the "Today" column shows exactly what the app does right now, drift and all.

## How to Run
Self-contained — just open the file:
```
.planning/spikes/029-responsibility-map/spike.html
```

## What to Expect
Three columns, switchable across all 7 roles:
1. **Source of truth** — the role's real `role_templates` tabs (view/edit badges); tabs the role "◆ acts"
   on are marked.
2. **Derived "what needs me"** (proposed) — the action queues computed live from the rule, each showing
   its derivation (`finance.edit === true`, or `OVERRIDE`).
3. **Today** — the actual output of the live `home.js` role functions, with bugs flagged red.

Plus a **Findings** panel computed across all roles, and an event log.

### The money moment
Click **Procurement (⚠)**. The "Today" column flags a **live bug**: `home.js` excludes
`'procurement_staff'`, but the real role id is `'procurement'`, so the exclusion never fires and a
Procurement user **wrongly sees the Proposals sub-tab**. The Derived column can't have this class of bug —
it reads real permissions, not a name string. That single contrast is the whole argument for Consolidate.

## Observability
Bottom-right log: role switches (with derived queue count + drift flag) and the findings computation.

## Investigation Trail
1. Ported the 7 real role templates and the 2 real `home.js` role functions verbatim, so any divergence
   shown is a property of the *actual* code, not the spike.
2. Built the derivation (`edit:true` + override) and ran it across all roles. Confirmed it reproduces the
   user's stated model for Finance (PR/TR/collectibles) and for Boss (proposal approval via override).
3. Surfaced the structural findings the refactor must handle: the `procurement_staff` drift bug; proposal
   approval as the lone non-derivable override; `services_admin` can *see* but not *approve* proposals (no
   action tile); and roles with empty action sets (`operations_user`, `services_user`) that need a
   fallback hero rather than a dead action strip.

## Results
**Verdict: PENDING — awaiting browser UAT.**

Pre-UAT assessment: the derivation reproduces the intended responsibility model for every role with a
**single** override (proposal approval), and it structurally cannot reproduce the `procurement_staff`
class of drift. If that holds up in-browser, the Consolidate refactor is greenlit:
- Replace `getDashboardMode` / `getHomeSubTabConfig` / `filterProposalsForUser` hardcoded arrays with a
  derived `whatNeedsMe(user)` + a one-entry override table.
- Same treatment for the role checks in `finance.js` / `procurement.js`.
- The `procurement`/`procurement_staff` bug is fixed for free.

## Refinement (from user context, post-build)
The user's explicit approver list refined the model away from "pure `edit:true` derivation" toward an
**explicit action→owner map, cross-checked against permissions**:

| Action | Owner | Note |
|--------|-------|------|
| MRF (process) | Procurement | ops/services admins can *edit* MRFs but the queue is Procurement's — proof that responsibility ≠ edit-access |
| PR approval | Finance | |
| TR approval | Finance | |
| Collectible | Finance | billing requests raised by project/ops, filed by Finance |
| Proposal approval | **Management** (new role) | + super_admin fallback; ops/services submit but don't approve |
| Proposal revision | Submitter (ops/services admin) | rejected → bounce back; a "needs you" tile, not an approval |

**New `Management` role** ("the up"): sees all departments read-only, approves proposals, no role_config,
no ops-data edit. Proposal override → `['super_admin','management']`. Separates business authority from
system authority (the reason not to just hand the boss `super_admin`).

**Model conclusion:** the map is the single source of truth; `role_templates` is the *guardrail*
(a mapped owner who lacks edit on the relevant tab = permission bug). `super_admin` is implicitly in every
queue. This still eliminates the hardcoded-name drift and matches how the user actually reasons about
ownership. The 029 spike.html demonstrates the *derivation mechanic*; it predates the Management role and
the explicit-map framing — update it if a refreshed demo is wanted before the build.

Resolved (were open questions):
1. Empty action sets for operations_user / services_user are correct — they're doers, get the fallback hero.
2. Proposal approval is NOT the only special case — MRF-process and proposal-revision are also explicit
   (not pure edit-derivations), which is why the model is an explicit map, not a derivation + 1 override.
