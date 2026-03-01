---
phase: 50-database-safety
plan: 02
subsystem: database
tags: [firebase, firestore, admin-sdk, data-integrity, node-script]

# Dependency graph
requires:
  - phase: 50-database-safety/50-01
    provides: Firebase Admin SDK pattern (backup.js) — verify-integrity follows same init approach
provides:
  - scripts/verify-integrity.js — standalone Node.js integrity check for all 13 Firestore collections
affects: [51-data-wipe, 52-data-migration, future-import-scripts]

# Tech tracking
tech-stack:
  added: [firebase-admin (required, not yet installed)]
  patterns:
    - CLI flags parsed before Firebase init so --help works without credentials
    - Lookup maps (Sets) for O(1) referential integrity checking
    - Three severity tiers: ERROR (hard violations), WARN (soft violations), INFO (orphans)
    - --json flag for programmatic output, --help flag for discoverability
    - Exit code 1 on any errors, 0 on clean / warnings-only

key-files:
  created:
    - scripts/verify-integrity.js
  modified: []

key-decisions:
  - "deleted_mrfs included in MRF ID lookup so PRs/POs/TRs referencing soft-deleted MRFs are not false errors"
  - "Supplier references reported as WARN not ERROR since suppliers may be intentionally deleted"
  - "project_code / service_code MRF refs reported as WARN since legacy data may not carry these fields"
  - "--help checked before Firebase init to avoid credential requirement for help text"

patterns-established:
  - "Node.js Admin SDK scripts: parse CLI flags first, then init Firebase, then execute async logic"

requirements-completed: [DBS-02]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 50 Plan 02: Data Integrity Verification Script Summary

**Node.js Firestore integrity checker with three-tier severity output (ERROR/WARN/INFO) covering referential chains (PR→MRF, PO→PR, PO→MRF, TR→MRF), supplier refs, schema fields, status enums, items_json parse validity, and orphan detection across all 13 collections**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T11:04:36Z
- **Completed:** 2026-03-01T11:07:09Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `scripts/verify-integrity.js` — 370-line standalone Node.js script using Firebase Admin SDK
- Referential integrity: checks PR→MRF, PO→PR, PO→MRF, TR→MRF as hard ERRORs; supplier/project_code/service_code refs as WARNINGs
- Schema consistency: validates required fields and status enum values across mrfs, prs, pos, transport_requests, projects, services, users
- JSON validity: detects malformed `items_json` fields in MRFs and PRs
- Orphan detection: identifies Approved MRFs with no PRs, finance-Approved PRs with no POs
- Supports `--json` flag for programmatic consumption and `--help` flag for discoverability
- Exits with code 1 on any hard errors, 0 on clean or warnings-only

## Task Commits

Each task was committed atomically:

1. **Task 1: Create data integrity verification script** - `2cb662f` (feat)

## Files Created/Modified

- `scripts/verify-integrity.js` — Firestore data integrity checker: loads all 13 collections, runs referential/schema/orphan checks, outputs ERROR/WARN/INFO tiers with summary

## Decisions Made

- **deleted_mrfs included in MRF ID lookup:** PRs/POs/TRs that reference soft-deleted MRFs should not be flagged as errors — they were valid at creation time. Including deleted_mrfs in the mrf lookup map prevents false positives.
- **Supplier refs as WARN not ERROR:** Suppliers can be intentionally removed from the directory; a missing supplier name in PRs/POs/TRs is a data quality concern, not a hard integrity violation.
- **project_code / service_code as WARN:** Legacy MRFs may predate project code fields; these warnings are informational, not blocking.
- **--help before Firebase init:** Moved argument parsing to top of file so `--help` works without a serviceAccountKey.json present, improving developer experience.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed --help requiring service account key**
- **Found during:** Task 1 verification step
- **Issue:** First draft placed Firebase Admin SDK initialization before CLI flag parsing, causing `node scripts/verify-integrity.js --help` to fail with "Service account key not found" error instead of displaying help text
- **Fix:** Restructured file to parse `args` / set `SHOW_HELP` first, exit if `--help` present, then proceed to Firebase init
- **Files modified:** scripts/verify-integrity.js
- **Verification:** `node scripts/verify-integrity.js --help 2>&1 | head -5` returns help text with exit 0
- **Committed in:** 2cb662f (Task 1 commit, folded into initial implementation)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug — ordering fix)
**Impact on plan:** Necessary for correct CLI behavior. No scope creep.

## Issues Encountered

- firebase-admin is not yet installed in node_modules. Script correctly detects and reports this with installation instructions. The firebase-admin prerequisite is shared with plan 50-01 (backup.js) — both scripts require the same `npm install firebase-admin` step.

## User Setup Required

None - no new external service configuration required beyond firebase-admin (shared with plan 50-01).

## Next Phase Readiness

- `scripts/verify-integrity.js` is ready to run once `npm install firebase-admin` and `serviceAccountKey.json` are in place (same prerequisites as backup.js)
- Script serves both pre-wipe audit (Phase 51) and post-import validation (Phase 52)
- All 13 collections verified, all referential chains covered

---
*Phase: 50-database-safety*
*Completed: 2026-03-01*
