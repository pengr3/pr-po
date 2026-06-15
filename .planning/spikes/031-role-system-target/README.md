---
spike: 031
name: role-system-target
type: standard
validates: "Given the consolidate decision + Management role + code-constant map, when the target role system is modeled across all 8 roles with a live guardrail, then each role's rights and responsibilities are correct, the map is the single source of truth, and a bad owner assignment is flagged not silently honored"
verdict: PENDING
related: [028, 029, 030]
tags: [roles, permissions, responsibility, management-role, target-state, code-constant, guardrail, consolidate]
---

# Spike 031: Target Role System

## What This Validates
Given the locked decisions — **Consolidate** scope, a new **Management** role, and the responsibility map
as a **code constant** — when the *proposed end state* is modeled across all 8 roles with a live guardrail,
then: (a) each role's "what's mine / what's guarded / what I can see" reads correctly, (b) the
`RESPONSIBILITY` map is the single source of truth, and (c) a misconfigured owner is **flagged** by the
cross-check rather than silently honored.

This is the forward-looking companion to **029** (which diagnosed *what's broken today*). 029 = problem,
031 = solution. 029 is intentionally left intact as the "before."

## What's New vs 029
- **The `management` role** is added to the templates (view-all read-only, approve proposals, no
  role_config, no ops edit) and opens as the default selected role — it's the headline change.
- Derivation switched from "`edit:true` + override" to the **explicit `RESPONSIBILITY` code constant**
  (action → owner), shown literally as code in the Source-of-truth panel.
- Adds the **guardrail**: every map owner is cross-checked against `role_templates`; a live simulator lets
  you reassign the Collectible owner and watch a bad pick (e.g. `procurement`, which has no `finance.edit`)
  get flagged.

## The Model (as built) — HYBRID (two classes)
Revised after the user's richer role definitions. CLMC is **not pure RBAC** — it's a hybrid:

```
RESPONSIBILITY = {
  // ----- APPROVAL — role owns a SHARED queue (RBAC) -----
  mrf_process / po_tracking / rfp_handle  → 'procurement'
  pr_approval / tr_approval / collectible / payables → 'finance'
  proposal_approval → ['management','super_admin']

  // ----- EXEC — scoped by ASSIGNMENT (users) / DEPARTMENT (admins) (ReBAC) -----
  new_assignment / project_plan / project_health / inspection / mrf_submit / proposal_work
    → operations & services families; users see THEIR assigned (personnel_user_ids),
      admins see the whole department, management oversees health (read-only)
}
```
- **Approval queues** = role-shared, first-come; **Guardrail:** owner must have `edit:true` on its tab.
- **Execution queues** = scoped by `personnel_user_ids` (users) or department (admins) — not tab-checked.

## Role profiles the spike surfaces (corrected)
- **Approver** — **Finance** (PR/TR/Collectible/Payables), **Procurement** (MRF/PO/RFP). Shared queues.
- **Executive overseer** — **Management**: approves proposals + tracks project health (read). Not super_admin.
- **Dept manager** — **Operations/Services Admin**: full execution set, **department-wide** scope.
- **Project handler** — **Operations/Services User**: same execution set, **scoped to assigned projects**.
  (Correction: these are NOT empty "doers" — their work is real, just assignment-scoped. This is the
  main reason the Action Center matters for them too.)
- **System** — **Super Admin**: implicitly oversees all; config + break-glass; boss does NOT use it.

## How to Run
Self-contained — just open the file:
```
.planning/spikes/031-role-system-target/spike.html
```

## What to Expect
- Opens on the **Management** role (the new tier) with a spotlight on *why it isn't super_admin*.
- Flip all 8 roles: each shows **What's mine** (Action Center tiles), **What's NOT mine** (guarded, owned
  by others), and **What I can see/touch** (access scope). Watch Finance vs Procurement vs Management own
  distinct queues; Ops/Services Users own nothing.
- **Source of truth** panel renders the `RESPONSIBILITY` constant as code (your chosen location).
- **Guardrail simulator**: change the Collectible owner to `procurement` → it flags `✗ procurement lacks
  finance.edit` instead of silently lying. Set it back to `finance` → ✓.

## Observability
Bottom-right log: role switches (with owned-queue count + profile type) and guardrail simulations.

## Investigation Trail
1. Added `management` to the verbatim 029 templates and made it the default view to foreground the one
   taxonomy change.
2. Replaced the `edit:true` derivation with the explicit `RESPONSIBILITY` code constant (the user's chosen
   source-of-truth location) and kept `role_templates` purely as the validation guardrail.
3. Built the guardrail + simulator to prove the cross-check catches a bad owner — the safety property that
   makes a code-constant map trustworthy.
4. Classified all 8 roles into Approver / Requester / Doer / Executive / System to make the Action Center's
   per-role emphasis obvious (and confirm Ops/Services Users need the fallback hero).

## Results
**Verdict: PENDING — awaiting browser UAT.**

Pre-UAT assessment: the target system reads cleanly — owners are correct, the guardrail catches
misconfiguration, and the Management role visibly solves the "what role for the up" problem without
super_admin. If it holds up in-browser, this is the blueprint the implementation plan consumes:
- Seed the `management` role_template; reassign the boss; drop `operations_admin` from proposal approval.
- Add a `RESPONSIBILITY` constant + `whatNeedsMe(user)` helper in a shared module, with a load-time
  cross-check that warns on owner/permission mismatch.
- Replace hardcoded role-name arrays in home.js / finance.js / procurement.js with the helper; the
  `procurement`/`procurement_staff` drift dies in the process.

Open questions for your verdict:
1. Management's exact access — view-all read-only as shown, or should it also *not* see some tab?
2. Confirm `operations_admin` is removed from proposal approval (target shows proposal approval =
   management + super_admin only).
3. Consolidation blast radius for the first implementation pass — home.js only, or home + finance +
   procurement together?
