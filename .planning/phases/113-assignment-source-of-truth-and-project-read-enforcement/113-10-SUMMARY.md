---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 10
subsystem: database
tags: [firestore, security-rules, personnel-scoping, code-generation, transactions]

requires:
  - phase: 113-09
    provides: client-side conversion complete, audited, and browser-verified against dev
provides:
  - projects allow get / allow list split, both scoped on personnel_user_ids
  - services_admin scoped server-side on projects (D-16 satisfied, D-01 overridden by operator decision)
  - Atomic counter-document CLMC code generation, replacing the cross-collection range scan
  - code_counters collection with monotonic, delete-proof rules
  - users.update cross-department carve-out removed, pinned by 4 inverted tests
  - D-14 subcollection residual documented in firestore.rules itself
affects: [113-11]

tech-stack:
  added: [firestore runTransaction]
  patterns:
    - "Counter-document sequence allocation: read-modify-write inside runTransaction, with a rules-level monotonic guard (last_seq must strictly increase) and delete forbidden"
    - "Hoisted escape-hatch terms must be explicitly status-gated — a term that inherited isActiveUser() from an isRole()-gated caller loses it when lifted to a top-level OR"

key-files:
  created:
    - scripts/seed-code-counters.js
  modified:
    - firestore.rules
    - app/utils.js
    - app/firebase.js
    - test/firestore.test.js

key-decisions:
  - "OPTION B selected by the operator: services_admin is SCOPED on projects, not exempt. Verbatim rationale recorded below."
  - "Option B was unblocked by doing the counter-document work in-phase rather than queuing it — the operator explicitly chose 'do the counter-document fix now' over 'exempt now, queue it'."
  - "A missing counter throws rather than starting at 001. A blocked create is recoverable; a duplicate CLMC code referenced by MRFs/PRs/POs is not."
  - "operations_admin deliberately KEPT in the services exempt set, preserving procurement.js:8018's PO-Delivered journal traversal — the constraint pinned during 113-09."

patterns-established:
  - "Falsification-test a security guard: temporarily break the rule, confirm the test fails, restore via git checkout, confirm it passes again"

requirements-completed: [D-01, D-02, D-09, D-14, D-15, D-16, D-17]

duration: 90min
completed: 2026-08-11
---

# Phase 113 Plan 10: Server-Side Tightening Summary

**`personnel_user_ids` is now the enforced read authority on `projects` for every scoped role including `services_admin`, made possible by replacing CLMC code generation's cross-collection range scan with an atomic counter document.**

## Task 1 — the D-01 vs D-16 decision, recorded verbatim

The plan surfaced a contradiction between two locked decisions: D-01 lists `services_admin` among the projects see-all roles; D-16 says to read D-01 as "*_user roles **and** the cross-department admin role are scoped".

**Operator selection: Option B — `services_admin` SCOPED.** When offered "exempt now + queue the counter-document work" versus "do the counter-document fix now", the operator chose:

> "Do the counter-document fix now"

Option B had been blocked by RESEARCH.md's highest-severity finding: `generateServiceCode()` range-scanned the whole `projects` collection for CLMC collision avoidance, so every service creation by a `services_admin` needed LIST access to `projects`. Scoping without fixing that would have hard-blocked service creation. The operator's choice was to remove the blocker rather than accept the exemption.

Recorded in `firestore.rules` above the `projects` block, citing D-01, D-15 and D-16 by ID.

## Commits

1. `cf0fa92` (feat) — counter-document code generation + `code_counters` rules + seeding migration
2. `a0c4689` (fix) — seeding script made immune to ES-module staleness
3. `c93d6dc` (feat) — the rules tightening itself
4. `571fbcb` (test) — emulator coverage

## What changed

**Code generation (the enabler).** `generateProjectCode()` and `generateServiceCode()` shared one sequence per client/year by range-scanning BOTH collections on every create. Both now increment `code_counters/{clientCode}_{year}` inside `runTransaction` and read no other collection at all. Side effects beyond D-16: the simultaneous-create race the old JSDoc documented and accepted is closed, and the rules forbid `last_seq` moving backwards or the document being deleted, so a replay cannot re-issue a used code.

Integrity contract: a missing counter does NOT start at 001. It derives a starting point from the legacy scan (retained solely for that bootstrap), and if the caller is scoped and the scan is denied it throws an actionable "run the seeding migration" error.

**`projects` get/list split (D-15).** Both bodies verified character-identical apart from the keyword. Exempt roles: `super_admin`, `finance`, `procurement`, `operations_admin`. Scoped: `operations_user`, `services_user`, `services_admin`.

**Legacy predicates removed (D-02/D-08).** All 22 transitional `isAssignedTo*` alternatives added in plan 113-01 deleted across services list/update, `project_tasks` and `service_tasks`. No rule branch reads the frozen arrays. Helper definitions retained — `isLegacyOrAssigned` still calls one.

**T-113-55 status gate.** `all_projects` / `all_services` survive as top-level OR terms, status-gated in every branch. Verified by the automated check that rejects any `allow` statement mentioning either flag without `isActiveUser()`, across all 144 allow statements.

**Carve-out removed (D-17).** The two cross-department `users.update` branches — added at the start of this session as `8591740` to fix `services-user-project-hidden` — are gone. Every client path that constructed those writes was deleted by plans 113-08 and 113-09, so the grant was unreachable.

**D-14 residual documented.** The six `projects` subcollections keep `allow read: if isActiveUser()`, with a comment block in the rules file stating plainly that a scoped user who knows a project's doc ID can still read its journal and audit trail.

## Test counts

- **Pre-Task-3** (rules already tightened): 56 passing / 7 failing — the 2 pre-existing plus 5 the tightening correctly invalidated
- **Post-Task-3**: **81 passing / 2 failing**, independently re-run and confirmed by the orchestrator
- Net **+20 passing** versus the 61 baseline; **zero tests deleted**
- The 2 remaining failures are exactly the pre-existing stale assertions in `deferred-items.md`. The second was explicitly re-checked: `services` `allow get` was untouched by this plan, so its outcome is unchanged — still stale, not a new regression.

**Carve-out suite count:** 9 tests, not the 8 RESEARCH.md claimed. 4 inverted to `assertFails` with rewritten titles; the other 5 already asserted failure. Zero `assertSucceeds` remain in those three suites.

## T-113-55 falsification check

The plan required proof that case 10 is a real guard rather than a tautology:

1. Baseline — case 10 passes
2. Removed only `isActiveUser() && ` from the `projects` `allow get` rule
3. Re-ran — case 10 **failed**: `Error: Expected request to fail, but it succeeded.`
4. Restored via `git checkout firestore.rules`, confirmed with `git diff --exit-code`
5. Final run — case 10 passes again

Independently verified afterwards: `git diff c93d6dc HEAD -- firestore.rules` is empty, so the temporary edit left no trace.

## Deviations from Plan

**1. Scope expanded by the Task 1 decision.** The plan anticipated this: its Task 1 acceptance criteria state that if Option B is selected, "the plan is re-scoped before proceeding rather than shipping a known service-creation block". The counter-document work (`cf0fa92`, `a0c4689`) is that re-scoping — a new collection, its rules, a rewritten generator, and a seeding migration.

**2. Task 3 gained a `code_counters` suite** (8 tests) not in the plan, because the collection did not exist when the plan was written. Covers the monotonic guard, delete-proofing, non-creator denial, and type rejection.

**3. Task 3 case 9 inverted in meaning.** The plan wrote it as "succeeds or fails per the Task 1 decision". Under Option B it asserts the old range-scan shape is DENIED for `services_admin` — correct, because code generation no longer issues that query at all.

## Issues Encountered

The seeding script initially failed with `clmcCounterId is not a function`. Root cause was ES-module caching — the browser held a pre-Phase-113 `app/utils.js`, which also meant the tab was running the old generators. Fixed on both sides: hard refresh, and `a0c4689` made the script self-contained with a cross-check that doubles as a staleness probe.

## Next Phase Readiness

**Dev is seeded.** The operator ran the migration against `clmc-procurement-dev`: 6 client/year pairs (ALV, AYA, DMC, MEG, RLC, SMD — all 2026), 6/6 written, no malformed codes, no pre-existing duplicates.

**Production deploy sequence for 113-11 — order is now load-bearing:**
1. `firebase deploy --only firestore:indexes` (**4** personnel indexes) and wait for `Enabled`
2. Deploy the `code_counters` rules and the client bundle — but NOT yet the tightened `projects` rules
3. **Run `scripts/seed-code-counters.js` against production as Super Admin** — dry run, review, then apply
4. Only then deploy the tightened rules

Step 3 must precede step 4. Tightening first would scope `services_admin` off `projects` while a client/year still lacks a counter, and the next service creation for that client would throw.

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11*
