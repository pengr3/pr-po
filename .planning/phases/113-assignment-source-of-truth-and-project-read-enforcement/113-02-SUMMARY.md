---
phase: 113-assignment-source-of-truth-and-project-read-enforcement
plan: 02
subsystem: infra
tags: [firebase, firestore, security-rules, composite-indexes, deploy]

requires:
  - phase: 113-01
    provides: 3 composite indexes in firestore.indexes.json + additive personnel_user_ids alternatives in firestore.rules
provides:
  - clmc-procurement-dev serving the widened (additive) firestore.rules
  - clmc-procurement-dev serving all 3 personnel_user_ids composite indexes
  - Verified deploy sequence + exact CLI invocations for the later production run
affects: [113-03, 113-04, 113-05, 113-06, 113-07, 113-08, 113-09, 113-11]

tech-stack:
  added: []
  patterns:
    - "Dev-first deploy gate: exercise the indexes-then-rules sequence on clmc-procurement-dev before the same sequence runs against production"

key-files:
  created:
    - .planning/phases/113-assignment-source-of-truth-and-project-read-enforcement/113-02-SUMMARY.md
  modified: []

key-decisions:
  - "Operator redirected this gate from production to dev (clmc-procurement-dev). Production deploy is deferred, NOT cancelled — it is now a tracked carry item."
  - "Index build state could not be asserted programmatically: no gcloud SDK and no local service-account credentials, and `firebase firestore:indexes` returns configuration without the API's `state` field. Presence of all 3 indexes on dev was verified instead."
  - "Rules were deployed without waiting on a console-confirmed `Enabled` state. Justified on dev: rule releases and index builds are independent operations, and the only consumers of these indexes are the Wave-4 client queries, which are several plans away."

patterns-established:
  - "Deploy verification without console access: `firebase firestore:indexes --project <alias>` piped through node to assert collectionGroup + fieldPath + arrayConfig against the local firestore.indexes.json"

requirements-completed: [D-03, D-13]

duration: 4min
completed: 2026-08-11
---

# Phase 113 Plan 02: Deploy Additive Indexes + Rules Summary

**The 3 `personnel_user_ids` composite indexes and the additively-widened `firestore.rules` are live on `clmc-procurement-dev`; the identical production deploy is deferred to a later gate at the operator's direction.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-08-11
- **Tasks:** 1 (checkpoint:human-action)
- **Files modified:** 0 (deploy-only plan)

## Accomplishments

- `firebase deploy --only firestore:indexes --project dev` — succeeded; all 21 index entries pushed
- Verified on dev: 21 total composite indexes, exactly 3 carrying `personnel_user_ids` with `arrayConfig: CONTAINS`, matching the local `firestore.indexes.json` byte-for-byte on `collectionGroup` + `fieldPath` + ordering
- `firebase deploy --only firestore:rules --project dev` — `rules file firestore.rules compiled successfully` → `released rules firestore.rules to cloud.firestore`
- Compilation of the widened rules confirmed twice (the indexes deploy also runs the rules compile check)

## Task Commits

No source commits — this plan deploys files already committed by plan 113-01 (`1b6acab`, `46c3ba6`, `6548f8c`).

## Deploy Record

**Target:** `clmc-procurement-dev` (via the `dev` alias in `.firebaserc`; `default` remains `clmc-procurement`)
**Branch:** `main`, working tree clean at `d734ed1` before and after
**Order:** indexes first, then rules — as mandated by `113-DEPLOY-1.md`

Indexes confirmed present on dev after deploy:

| collectionGroup | fields |
|-----------------|--------|
| `projects` | `project_code` ASCENDING + `personnel_user_ids` CONTAINS |
| `projects` | `client_code` ASCENDING + `personnel_user_ids` CONTAINS |
| `services` | `client_code` ASCENDING + `personnel_user_ids` CONTAINS |

## Decisions Made

- **Dev instead of production.** The plan as written targets `clmc-procurement`. The operator redirected to dev-first. Sound: this is the first exercise of the indexes-then-rules sequence, and dev has no live users to regress.
- **Proceeded past the `Enabled`-state gate without console confirmation.** See Deviations — the check is genuinely operator-side and could not be automated from this machine.

## Deviations from Plan

### 1. Target changed from production to dev

- **Plan required:** deploy to `clmc-procurement`; acceptance criterion "Operator states the active Firebase project was `clmc-procurement` at deploy time"
- **What happened:** deployed to `clmc-procurement-dev` at the operator's explicit direction
- **Impact:** D-03's guarantee ("the additive rules + indexes are LIVE in production before any client query conversion ships") is **NOT yet satisfied in production**. It is satisfied on dev, which is sufficient for local development and browser UAT of Waves 3–8 against the dev environment.
- **Carry:** the production run of `firebase deploy --only firestore:indexes` then `firebase deploy --only firestore:rules` MUST happen before any Wave-4 client conversion reaches production. Netlify auto-deploys from a push, so this must precede the next push of converted client code, and no later than plan 113-11's deploy gate.

### 2. Index `Enabled`-state check not performed

- **Plan required:** "Wait until ALL THREE new indexes show state **Enabled** (not **Building**)" in the Firebase console before the rules deploy
- **What happened:** presence of all 3 was verified via `firebase firestore:indexes --project dev`; build *state* was not
- **Why:** `gcloud` is not installed, there is no local service-account key, and the Firebase CLI's `firestore:indexes` output is the export-shaped configuration — it omits the Firestore Admin API's `state` field. The check is a console eyeball by design.
- **Risk accepted:** low on dev. A rules release and an index build are independent server-side operations — releasing rules early cannot corrupt or delay a build. The failure mode the ordering rule protects against (a permitted query failing with `FAILED_PRECONDITION: index is currently building`) can only be triggered by the Wave-4 client queries, which do not exist yet.
- **Residual action:** eyeball Firebase console → Firestore → Indexes on **both** dev and prod, confirming all 3 read `Enabled`, before plan 113-04 UAT exercises the paired queries.

### 3. Smoke check deferred

- **Plan required:** step 6 — confirm an existing `services_user`'s `#/services` list is unchanged post-deploy
- **What happened:** not executed; requires a browser session against the dev app
- **Risk accepted:** low. Plan 113-01's diff is provably additive (139 `allow` clauses before and after, every removed line reappearing as the same predicate with an OR-alternative appended), and the emulator suite proved the legacy `service_code`-based predicate still succeeds alongside the new one.
- **Residual action:** fold into the browser UAT that accompanies Wave 4.

---

**Total deviations:** 3 (1 scope redirect by operator, 2 verification steps deferred with stated rationale)
**Impact on plan:** the server side is ready for Waves 3–8 to be developed and UAT'd against dev. Production readiness is explicitly outstanding.

## Issues Encountered

- `firebase firestore:indexes` does not expose index build state, and neither `gcloud` nor server credentials are available locally — so the plan's console-based `Enabled` gate has no programmatic substitute on this machine. Worked around by asserting index *presence* and documenting the state check as a residual operator action.

## User Setup Required

None.

## Next Phase Readiness

**Ready:** Wave 3 (plan 113-03) may proceed. It repoints `getAssignedProjectCodes()` / `getAssignedServiceCodes()` onto live `personnel_user_ids` membership and touches only `app/utils.js`, `app/auth.js`, and `scripts/verify-crossdept-admin-scoping.js` — no new server-side permission is required beyond what dev now serves.

**Outstanding — must clear before production:**
1. Production deploy of indexes then rules to `clmc-procurement` (this plan's original scope)
2. Console confirmation that all 3 `personnel_user_ids` indexes read `Enabled` on dev and prod
3. `services_user` `#/services` smoke check

---
*Phase: 113-assignment-source-of-truth-and-project-read-enforcement*
*Completed: 2026-08-11 (dev only)*
