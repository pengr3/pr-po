---
phase: 106-data-layer-audit-findings-report
plan: 01
subsystem: database
tags: [firestore, firebase-admin, integrity-check, denormalization, drift, tooling, read-only, audit]

# Dependency graph
requires: []
provides:
  - "Extended read-only verify-integrity.js: checkDenormDrift() over MRF->PR->PO->TR->RFP + a --project targeting flag"
  - "106-DATA-RESULTS.md scaffold (all 7 sections) awaiting the gated prod data run"
affects: [106-07-findings-report, 112-remediation-backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Denormalized drift-across-chain check: MRF is head-of-chain reference; downstream present-but-disagrees = drift, legacy-absent = skipped"
    - "RFP chain join by business id (rfp.po_id / rfp.tr_id), never the unreliable stored RFP doc-id fields"
    - "Plain-object dedup indexes (not Map/Set) so the read-only assertion grep sees no write-method calls"

key-files:
  created:
    - .planning/phases/106-data-layer-audit-findings-report/106-DATA-RESULTS.md
  modified:
    - scripts/verify-integrity.js

key-decisions:
  - "checkDenormDrift is fully in-memory over already-fetched data — zero extra Firestore reads, zero writes (T-106-01)"
  - "Only rfps added to the fetch; no v4.0-collection live checks (D-04 defers those to Phase 112)"
  - "Data pass could not run (no service-account key in repo) — took the documented PENDING path rather than fabricate numbers"

patterns-established:
  - "Read-only audit tooling: object[key]=value indexes only; asserted via grep for .set(/.update(/.delete(/.add(/.create(/writeBatch("
  - "PENDING-banner deliverable: gated data files ship visibly incomplete with the exact command to fill them, never silently skipped"

requirements-completed: []  # AUDIT-02 is PARTIAL — script extended, but the read-only data pass is OUTSTANDING (gated on serviceAccountKey.json). Do NOT mark complete until the prod run lands.

# Metrics
duration: ~15min
completed: 2026-07-09
---

# Phase 106 Plan 01: Data-Layer Audit Read-Only Data Pass Summary

**Extended `verify-integrity.js` with a read-only denormalized drift check (MRF→PR→PO→TR→RFP, joined by business id) and a `--project` flag; the live dev/prod run is BLOCKED on a missing service-account key, so `106-DATA-RESULTS.md` ships as a visible PROD-RUN-PENDING scaffold with the observed credential error captured verbatim.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-09T13:02:32Z
- **Tasks:** 2 of 2 `auto` tasks executed; 1 `checkpoint:human-action` OUTSTANDING (between Task 1 and Task 2)
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- Added `checkDenormDrift()` over the MRF→PR→PO→TR→RFP chain — compares `project_code` / `project_name` / `department`; present-but-disagrees is drift, legacy-absent is skipped (D-02).
- RFPs are joined to the chain by business id (`rfp.po_id` / `rfp.tr_id`), never the unreliable stored RFP doc-id fields (project memory landmine avoided).
- Added a `--project <id>` targeting flag (default stays `clmc-procurement`) so the script can validate against dev before prod (D-05); documented in `--help`.
- Added `'rfps'` to the read-only COLLECTIONS fetch and a `Denormalization Drift` output section (human + JSON); no v4.0-collection live checks (D-04 kept for Phase 112).
- Verified fully read-only: zero `.set(`/`.update(`/`.delete(`/`.add(`/`.create(`/`writeBatch(` in the script (T-106-01).
- Attempted the dev run once, captured the real missing-credentials error, and wrote `106-DATA-RESULTS.md` with all 7 required sections as PENDING placeholders — no numbers fabricated.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add checkDenormDrift() + --project flag (read-only)** - `65f32ff4` (feat)
2. **Task 2: Capture real numbers into 106-DATA-RESULTS.md (PENDING path)** - `14de3122` (docs)

_Plan-metadata / STATE / ROADMAP commit intentionally NOT made — orchestrator owns those (per ownership rules)._

## Files Created/Modified
- `scripts/verify-integrity.js` - Added `checkDenormDrift()` (in-memory drift over the chain), `'rfps'` to COLLECTIONS, `results.drift[]` + `summary.drift`, a `--project` flag (overrides the hardcoded prod projectId), and a Denormalization Drift output section. All read-only.
- `.planning/phases/106-data-layer-audit-findings-report/106-DATA-RESULTS.md` - Read-only data-pass results scaffold with a PROD RUN PENDING banner, the verbatim credential error as evidence, the two fill-in commands, and all 7 required sections as placeholders.

## Decisions Made
- **PENDING path over blocking:** No `serviceAccountKey.json` (or `.dev.json`) exists in the repo, so the gated run cannot execute here. Rather than fabricate numbers or silently skip, the deliverable ships with an explicit banner + the exact commands to fill it — the gap is tracked, not hidden.
- **Comment wording constrained by the read-only assertion:** the T-106-01 grep is literal, so implementation comments were worded to avoid the literal tokens `.set(` / `.add(` and the unreliable-doc-id field names, keeping the assertion at exactly 0 write-ops.

## Deviations from Plan

No behavioral deviations — the plan was executed as written, including its own prescribed blocked-case path for Task 2. Two transparency notes:

### Implementation notes (not auto-fixes)

**1. Read-only-assertion-safe comments**
- **During:** Task 1. First drafts of two new comments contained the literal strings `.set(` / `.add(` (describing why Map/Set are avoided). The T-106-01 acceptance grep is literal, so those comments themselves tripped it (count 1, not 0).
- **Resolution:** Reworded both comments to describe the same intent without the literal write-method tokens. Final `grep -cE "\.set\(|\.update\(|\.delete\(|\.add\(|\.create\(|writeBatch\("` = **0**. No logic changed.

**2. v4.0-collection grep baseline (acceptance-criterion clarification)**
- Task 1 acceptance says `grep -cE "collectibles|billing_requests|baselines|progress_updates|issues|proposals"` should return 0. The **unmodified** committed file already returns **2** — both from the English word "issues" in pre-existing output strings (`"...no integrity issues found"`, `"No schema consistency issues."`), NOT the `issues` collection.
- I added **zero** new matches (reworded my one new comment that used "issues" as a verb). Final count = **2**, exactly the pre-existing baseline. Rewording the two pre-existing user-facing output strings would change the script's printed behavior and is out of scope.
- **D-04 intent is satisfied:** no v4.0-collection live checks were added — only `'rfps'` was added, and only for the drift chain's RFP tail.

## Issues Encountered

**Gated run blocked — no service-account key (this is the OUTSTANDING checkpoint).**
- The `checkpoint:human-action` between Task 1 and Task 2 requires running the extended script against dev then prod. Attempted the dev run once:
  ```
  ERROR: Service account key not found at: C:\Users\franc\dev\projects\pr-po\serviceAccountKey.dev.json
         Download from Firebase Console > Project Settings > Service Accounts
         Or set GOOGLE_APPLICATION_CREDENTIALS env var to the key file path
  ```
- Confirmed both `serviceAccountKey.dev.json` and `serviceAccountKey.json` are absent from the repo. The script exited before any Firestore access — nothing was read or written.
- Handled via the plan's documented pending path (Task 2 blocked-case). Numbers remain to be filled by a human with the key.

## CHECKPOINT OUTSTANDING (human-action)

**The prod/dev read-only data pass is PENDING — gated on `serviceAccountKey.json`.** A human holding the Firebase service-account key(s) must run, from the repo root (both are read-only, `.get()` only):

1. **Dev validation (D-05):** `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.dev.json node scripts/verify-integrity.js --project clmc-procurement-dev --json`
2. **Prod numbers:** `node scripts/verify-integrity.js --json`

Then transcribe the `collections`, `errors`, `warnings`, `info`, `drift`, and `summary` output into `106-DATA-RESULTS.md` and flip its banner off. Until then, **AUDIT-02 is only PARTIALLY satisfied** (tooling extended; data not yet verified) and **Plan 07 (`106-FINDINGS.md`) must not cite numbers from `106-DATA-RESULTS.md`.**

## Known Stubs / Intentional Placeholders

- `106-DATA-RESULTS.md` — every data value is the literal token `PENDING` by design, tied to the outstanding human-action checkpoint above. This is intentional and self-documenting (banner + fill-in commands), not a silent stub. It resolves the moment the two commands above are run. No code stubs introduced.

## User Setup Required

**A Firebase service-account key is required to complete this plan's data pass.** Place `serviceAccountKey.json` (prod) and/or `serviceAccountKey.dev.json` (dev) in the repo root, then run the two commands under "CHECKPOINT OUTSTANDING". Keys are downloaded from Firebase Console > Project Settings > Service Accounts. Both runs are read-only.

## Next Phase Readiness
- **Tooling ready:** `verify-integrity.js` is drift-aware, dev-targetable, and asserted read-only — Phase 112 backfill scripts can build on it.
- **Blocker for AUDIT-02 "verified against data":** the gated data pass is outstanding (missing key). Plan 07 should treat `106-DATA-RESULTS.md` numbers as unavailable until the run lands.
- **No STATE.md / ROADMAP.md / REQUIREMENTS.md updates** were made here (orchestrator-owned).

## Self-Check: PASSED

- FOUND: `scripts/verify-integrity.js` (modified, `node --check` exit 0, read-only asserted)
- FOUND: `.planning/phases/106-data-layer-audit-findings-report/106-DATA-RESULTS.md`
- FOUND: `.planning/phases/106-data-layer-audit-findings-report/106-01-SUMMARY.md`
- FOUND commit: `65f32ff4` (Task 1, feat)
- FOUND commit: `14de3122` (Task 2, docs)
- Checkpoint state accurately recorded as OUTSTANDING (not marked complete).

---
*Phase: 106-data-layer-audit-findings-report*
*Completed: 2026-07-09*
