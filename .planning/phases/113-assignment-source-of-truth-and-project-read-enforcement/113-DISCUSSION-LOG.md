# Phase 113: Assignment Source-of-Truth and Project Read Enforcement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 113-assignment-source-of-truth-and-project-read-enforcement
**Areas discussed:** Enforcement boundary vs. D-1, Assignments tab's future, Fate of the legacy code arrays, Silent-failure surfacing

**Origin:** this phase was scoped directly out of a `/gsd:debug` session on branch `main`. Root cause was confirmed by RED/GREEN Firestore emulator reproduction before any discussion took place, so the discussion started from established fact rather than hypothesis.

---

## Pre-discussion scope selection

| Option | Description | Selected |
|--------|-------------|----------|
| Ship rules fix now, then plan the redesign | Deploy the verified 27-line carve-out as a stop-gap, then plan the structural work | |
| Skip the stop-gap, go straight to redesign | Leave prod on the super_admin workaround and fix it once, properly | ✓ |
| Stop-gap only | Deploy the carve-out and defer the structural question | |

**User's choice:** Skip the stop-gap — go straight to redesign.
**Notes:** Production remains unfixed. The user is running a `super_admin`-performs-the-assignment workaround meanwhile.

| Option | Description | Selected |
|--------|-------------|----------|
| Source of truth + retire sync | personnel_user_ids authoritative; both sync pipelines retired | |
| That, plus enforce projects server-side | Also tighten the projects read rule to match the services pattern | ✓ |
| Minimal: keep both records, fix the seams | Keep two-record design; surface failures; add reconciliation | |

**User's choice:** Source of truth + retire sync + server-side enforcement.
**Notes:** Chosen after evidence that `firestore.rules:229` (`allow read: if isActiveUser()`) makes projects scoping cosmetic while services scoping is genuinely enforced.

---

## Enforcement boundary vs. D-1

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve D-1 — admins unrestricted | Rules scope only `*_user` roles; see-all roles keep unrestricted project reads, mirroring the services rules | ✓ |
| Scope admins too — revisit D-1 | Cross-dept admins read only assigned projects; contradicts the existing Projects-tab grant | |
| You decide | Defer to Claude | |

**User's choice:** Preserve D-1 — admins unrestricted.
**Notes:** Accepts that server-side enforcement then binds `*_user` roles only — a correctness fix rather than a containment boundary against admins.

| Option | Description | Selected |
|--------|-------------|----------|
| Standardize on array-contains | All scoped reads use `where('personnel_user_ids','array-contains',uid)` | ✓ |
| Keep in-queries where they work | Leave `service_code 'in'` in place; convert only what's broken | |
| You decide | Defer to Claude | |

**User's choice:** Standardize on array-contains.
**Notes:** Motivated by the Firestore 30-value `in` ceiling that the derived-array approach silently carries.

| Option | Description | Selected |
|--------|-------------|----------|
| All read surfaces in this phase | Convert every projects read together | |
| Audit first, then convert all found | Inventory every projects read, then convert everything the audit turns up | ✓ |
| Convert list + MRF form only | Narrowest slice that fixes the reported bug | |

**User's choice:** Audit first, then convert all found.
**Notes:** The audit was run during discussion; results are recorded in CONTEXT.md `<code_context>`. Four surfaces have unconfirmed role exposure and are flagged ❓ for planning.

| Option | Description | Selected |
|--------|-------------|----------|
| Carry over unchanged — verify with tests | Treat the no-leak invariant as hard; add regression coverage | ✓ (Claude) |
| Carry over, revisit if it conflicts | Preserve by default, allow planning to flag conflict | |
| You decide | Defer to Claude | ✓ (user) |

**User's choice:** "You decide."
**Notes:** Claude resolved to carry it over unchanged with regression coverage — it is an existing security invariant and loosening it is outside this phase's remit. Planning should surface any genuine conflict rather than silently relaxing it.

---

## Assignments tab's future

**Questions were presented but dismissed** — the user opted out of further questioning and subsequently instructed: *"max effort — finish the discussion and write CONTEXT.md."* Options that had been presented are preserved below for the audit trail; the resolution was Claude's.

| Option | Description | Resolution |
|--------|-------------|----------|
| Repoint it to write personnel_user_ids | Tab keeps its UI but writes membership on the container docs; reverse sync deleted | ✓ (Claude) |
| Keep code arrays as an admin overlay | Membership and admin-granted access stay separate concepts | |
| Make the tab read-only | Personnel panels become the only writer | |

**Resolution:** Repoint (CONTEXT D-05). Rationale: `getVisibleSubTabs` already restricts each admin to their home-department sub-tab, so a repointed tab only writes personnel on a container that admin already owns — no new capability, no conflict with the cross-container-powers rule. Supersedes the mco `saveManageModal` lock (D-06).

| Option | Description | Resolution |
|--------|-------------|----------|
| Full parity — same model both sides | The documented services asymmetry dissolves | ✓ (Claude) |
| Projects only this phase | Leaves two different assignment models in the codebase | |
| You decide | — | |

**Resolution:** Full parity (D-07). With one authoritative record there is nothing left to sync in either direction, so the asymmetry disappears rather than being implemented.

| Option | Description | Resolution |
|--------|-------------|----------|
| Delete outright | Remove both helpers and all call sites | ✓ (Claude, gated on audit) |
| Keep writing arrays, stop reading them | Arrays stay populated as inert data | partial |
| You decide | — | |

**Resolution:** Split (D-08). Both helpers are deleted so nothing writes the arrays, but the *fields* are left in place as frozen, inert data — field deletion is an irreversible production write with no staging, and retaining them preserves a rollback path.

---

## Fate of the legacy code arrays

**Resolved by Claude** (user delegated). See CONTEXT D-08 through D-10.

- Stop reading and stop writing `assigned_project_codes` / `assigned_service_codes`; leave the fields in place as inert data.
- `all_projects` / `all_services` survive untouched — they are a role-independent *grant*, not assignment data, with no personnel equivalent.
- Display surfaces repoint to personnel-derived data: `user-management.js:487-489` (counts), `assignments.js:346,352` (code lists).

---

## Silent-failure surfacing

**Resolved by Claude** (user delegated). See CONTEXT D-11, D-12.

- Retiring the syncs *is* the fix — preferred over adding error plumbing to a code path that is being deleted. Afterwards exactly one write remains per assignment (the container's personnel array), already awaited and toasted at its call sites.
- Standing constraint added: no assignment-affecting write may be fire-and-forget; any residual `.catch(err => console.error(...))` on an assignment path is a defect.

---

## Claude's Discretion

- **D-04** — no-leak invariant resolution (user answered "You decide")
- **D-05 – D-07** — Assignments tab repointing, mco lock supersede, project↔service parity
- **D-08 – D-10** — fate of the legacy arrays, `all_projects` treatment, display-surface repointing
- **D-11 – D-12** — silent-failure resolution and the no-fire-and-forget constraint

Rationale is recorded per-decision in CONTEXT.md so each can be re-argued on evidence if the audit contradicts it.

## Deferred Ideas

- Reconcile `app/views/procurement.js:3866` — Create-MRF picker with no role gate and no assignment filter (own phase)
- Delete the legacy array fields once the personnel-authoritative model is proven in production
- Stop tracking `firestore-debug.log` — a generated emulator log committed to the repo
- Revisit whether admins should be scoped at all (kg0 D-1) — a separate security decision
