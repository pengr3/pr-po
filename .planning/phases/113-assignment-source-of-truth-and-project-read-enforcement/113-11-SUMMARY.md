---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 11
subsystem: deployment
tags: [firestore, security-rules, production-deploy, migration, uat]

requires:
  - phase: 113-10
    provides: tightened projects/services rules, code_counters collection, seeding script
provides:
  - tightened firestore.rules live in production
  - 4 personnel composite indexes live and READY in production
  - code_counters seeded in production (49 client/year pairs + MALDOR_2026)
  - Phase 113 client bundle deployed (f205889)
  - recorded production UAT with per-item results
affects: []

tech-stack:
  added: []
  patterns:
    - "Staged rules deploy: ship an intermediate rules commit (additive only) so a data migration can run under permissive rules before the tightening lands"
    - "Verify a counter migration by reading the counter document itself (created_at vs updated_at, last_seq vs issued code) rather than trusting the write's return value"

key-files:
  created:
    - .planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/113-HUMAN-UAT.md
  modified: []

key-decisions:
  - "Plan 113-11 as written was STALE and was not followed literally. It claimed 'No index change ships in this deploy' and never mentioned counter seeding — both written before 113-09 and 113-10 expanded scope. The executed sequence follows 113-10-SUMMARY.md:125."
  - "UAT scoped to production-only checks. 113-DEV-VERIFICATION.md had already exercised all five roles against the TIGHTENED rules; re-running those against identical rules would prove nothing. Each excluded step is recorded with its evidence pointer."
  - "MALDOR_2026 counter created manually at last_seq: 1 rather than fixing the typo'd service_code. service_code is denormalized across ~6 child collections; renaming it is a multi-collection migration, not an edit."
  - "A5 (PO-Delivered to service journal) deferred rather than fabricated — exercising it would have written real production data for a check that was never a plan acceptance criterion."

requirements-completed: [D-01, D-03, D-04, D-05, D-16]
requirements-partial: [D-09]
requirements-deferred: [D-14]

duration: ~5h elapsed (incl. index build waits and UAT)
completed: 2026-08-12
---

# Phase 113 Plan 11: Production Deploy and UAT Summary

**The tightened rules are live in production, the phase's motivating defect is verified dead, and no rollback was needed.**

## Deploy record

| Item | Value |
|------|-------|
| Firebase target | `clmc-procurement` (verified before every deploy — the CLI was pointed at `clmc-procurement-dev` at session start) |
| **Rollback SHA** | **`a0c4689`** — verified to carry permissive `allow read: if isActiveUser()` |
| Tightened rules | `c93d6dc`, shipped within `f205889` |
| Client bundle | `f205889` → `origin/main`, verified live at `https://clmcop.netlify.app` |
| Counters seeded | 49/49 written + `MALDOR_2026`; re-verified 49/49 `OK` |
| Smoke check | PASS — scoped user saw assigned projects immediately after the tightening |
| Rollback exercised | **No** |

## The plan was stale — what was actually executed

Plan 113-11 described a one-command deploy. Three prerequisites it omitted would each have caused a production incident:

1. **Wrong target.** `firebase use` reported `clmc-procurement-dev`. The deploy would have silently gone to dev.
2. **65 unpushed commits.** `origin/main` lacked every Phase 113 client conversion, and its `firestore.indexes.json` had zero `personnel_user_ids` indexes. Deploying tightened rules against the pre-Phase-113 bundle — which reads `assigned_project_codes` and range-scans — would have produced total `list` denial for every scoped user at once. This is threat **T-113-55** exactly.
3. **No counter seeding, and a 4th index.** The plan asserted "No index change ships in this deploy"; 113-09 had since added a 4th composite index (dev-only), and 113-10 had added `code_counters` requiring production seeding before the tightening.

Executed sequence, per `113-10-SUMMARY.md:125`:

| # | Step | Result |
|---|------|--------|
| 0 | `firebase use default` → `clmc-procurement` | ✅ |
| 1 | Deploy 4 personnel indexes, wait for `READY` | ✅ all 4 `READY` (~8 min build) |
| 2 | Deploy `cf0fa92` rules (`code_counters` added, `projects` still permissive) + push client bundle | ✅ verified additive: 46 insertions, 0 deletions vs the production baseline `1b6acab` |
| 3 | Seed `code_counters` from the live production site as Super Admin | ✅ 49/49, dry-run reviewed first |
| 4 | Deploy tightened rules (`c93d6dc`) | ✅ |
| 5 | Smoke check + UAT | ✅ |

Step 2 deliberately deployed an **older** rules commit than HEAD. HEAD already contained the tightening, so deploying it there would have collapsed steps 2 and 4 and broken the ordering the seeding depends on.

## Counter seeding

Dry run scanned 57 projects and 125 services, producing 49 client/year pairs — all `CREATE`, none pre-existing.

**7 malformed codes** were excluded by the seeder's regex. Each was checked against its client's target before applying:

| Code | Reads as | Target | Risk |
|---|---|---|---|
| `CLMC-MDCP-202605`, `CLM- MDCP-202605` | MDCP #5 | 8 | covered |
| `CLMC - SPI - 2026010/011`, `CMC-SPI-2026012` | SPI #10/11/12 | 15 | covered |
| `PHASE 2 FIT-OUT` | not a code | — | none |
| **`CLMD-MALDOR-2026001`** | MALDOR #1 | **no row** | **gap** |

Every malformed sequence sat *below* its client's counter, so none could be stranded above it. `MALDOR` was the exception: its only code has a typo'd `CLMD` prefix, so the client vanished from the plan entirely.

**MALDOR resolved by creating the counter, not by renaming the code.** `service_code` is denormalized onto `mrfs`, `prs`, `pos`, `transport_requests`, `collectibles`, `rfps`, `service_tasks` and proposal records — ~16 write sites across 6 files. Renaming the parent without cascading would orphan every child; Phase 78 built exactly such a cascade for projects and treated it as a migration. `code_counters/MALDOR_2026` was created at `last_seq: 1`, making the next code `CLMC-MALDOR-2026002` — which cannot collide with the existing `CLMD-` document under any reading.

One **pre-existing duplicate** was surfaced and left alone: `CLMC-MPIR-2026013` is held by both a project and a service. Seeding to 13 steps past it; it is not repaired.

## UAT results

Full detail in `113-HUMAN-UAT.md`. Scoped to production-only checks — `113-DEV-VERIFICATION.md` had already exercised all five roles against the tightened rules, and each excluded step carries an evidence pointer rather than being silently dropped.

| Item | Result |
|---|---|
| **A1** — canonical acceptance narrative (D-05) | ✅ PASS — both `#/projects` and MRF picker |
| **A2** — no migration required | ✅ PASS — both scoped roles |
| **A3** — service creation as `services_admin` (D-16) | ✅ PASS — `CLMC-AFTMC-2026002` |
| **A4** — MRF form pickers | ✅ PASS — both scoped roles |
| **A5** — PO-Delivered → service journal | ⏸ deferred, not exercisable |
| **A6** — Assignments tab round trip (D-05/D-10) | ✅ PASS — both sub-tabs + personnel-only row |
| **A7.1** — plan-task writes (T-113-59) | ✅ PASS — create, rename, delete |
| **A7.2** — see-all roles (D-01) | ✅ PASS |
| **A7.3** — escape hatch (D-09) | ⬜ not run — vacuous if no flagged account; dev §7 verified the branch |

**No console errors reported.** No `permission-denied`, no `The query requires an index` across the exercised surfaces.

### The two results that carry the phase

**A1 + A2 together.** A1 proves a *new* assignment propagates with both sync pipelines deleted. A2 proves *pre-existing, un-migrated* assignments still resolve with no backfill. Either alone would be weak; together they establish that `personnel_user_ids` genuinely reconstructs what the retired derived arrays carried. A1 was also the first exercise of the canonical narrative under the tightened rules on **any** environment.

**A3 with counter evidence.** `code_counters/AFTMC_2026` was read directly from production: `last_seq` 1→2, `created_at` at seeding, `updated_at` at the service creation, issued code `...002`. That single document proves the seed derived the right value, the `runTransaction` increment fired in production, code and counter agree, no duplicate was minted, and the monotonic rule permitted the forward move. It also proves the trade the phase exists to make: `services_admin` scoped off `projects` **and** service creation still working — mutually exclusive before the counter existed.

## Deviations

1. **Plan not followed literally** — see above. The plan's own Task 1 permitted this: it required confirming 113-09 passed before deploying, and 113-09's summary is what surfaced the 4th index and the seeding requirement.
2. **UAT reduced from 11 steps to 7 items**, with a coverage map citing `113-DEV-VERIFICATION.md` sections per exclusion.
3. **Plan 113-11 repeated 113-09's Assignments-tab role misattribution** (steps 6c/7 assigned to `operations_admin`/`services_admin`; the tab is `role_config`-gated to `super_admin`). Corrected in the UAT doc; A6 run as `super_admin`.

## Findings recorded, none blocking

1. **Cross-department Services access gap** — an assigned `operations_user` cannot reach an assigned service: `services` `allow get` omits the role, and the route is permission-blocked. Verified byte-identical pre/post tightening → **not** a Phase 113 regression. → `BACKLOG.md`
2. **`seed-services-role-permissions.js` writes an inert field path** — `tabs.*` instead of `permissions.tabs.*` (`app/permissions.js:97` reads `roleData.permissions`). Every write it makes is dead, and it has created a stray shadow structure that *contradicts* the operative one. This directly caused a wrong diagnosis during the UAT. → `BACKLOG.md`
3. **Stale production URL** — `MIGRATION-STATUS.md:220` names `clmc-procurement.netlify.app`, which 404s; the real site is `clmcop.netlify.app`. This broke the first deploy-verification attempt.
4. **Role-template listener is live `onSnapshot`** — rapid account switching can leave a previous role's permissions in memory, producing transient false observations. One occurred during this UAT and did not reproduce after a hard refresh.

## Accepted, unchanged

- **D-14** — journal subcollections remain readable by known document ID. Knowingly accepted, noted in `firestore.rules`, booked as its own phase. Not re-tested.
- **T-113-60** — Procurement Create-MRF picker remains unscoped. Explicitly excluded from A4's pass criteria.
- **MPIR duplicate** — pre-existing shared CLMC code, stepped past rather than repaired.

## Verification

- Production rules read back directly and confirmed to carry the tightened `projects` `get`/`list` split
- All 4 personnel indexes confirmed `READY` via the Firestore admin API before the rules deploy
- Deployed client bundle confirmed by fetching `app/utils.js` from the live site (`clmcCounterId` present, `syncPersonnelToAssignments` absent)
- `code_counters/AFTMC_2026` read directly from production after A3
- Rollback path recorded before deploying and never needed
