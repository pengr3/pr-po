---
phase: 51-data-wipe
plan: 01
subsystem: database
tags: [firebase-admin, firestore, nodejs, data-management, wipe]

# Dependency graph
requires:
  - phase: 50-database-safety
    provides: Admin SDK init pattern (createRequire for JSON key, ESM imports, serviceAccountKey.json)
provides:
  - Firestore data wipe script with dry-run preview and typed confirmation (scripts/wipe.js)
affects: [52-data-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Firestore batched deletion: fetch all doc refs, delete in BATCH_SIZE=500 chunks via db.batch().delete()"
    - "Readline confirmation gate: prompt user to type exact word before irreversible action"
    - "Scan-then-delete: fetch all snapshots upfront, reuse stored refs for deletion to avoid double-fetch"

key-files:
  created: [scripts/wipe.js]
  modified: []

key-decisions:
  - "Wipe exactly 10 collections: mrfs, prs, pos, transport_requests, suppliers, clients, projects, services, deleted_mrfs, invitation_codes — users/role_templates/deleted_users never touched"
  - "Dry-run mode is the safe default; live mode requires explicit --dry-run absence AND typing WIPE"
  - "Scan pass reuses snapshot refs for deletion to avoid double-fetching large collections"

patterns-established:
  - "Admin script confirmation gate: scan first, print totals, then prompt for typed word before any mutation"

requirements-completed: [WIP-01, WIP-02, WIP-03]

# Metrics
duration: 8min
completed: 2026-03-01
---

# Phase 51 Plan 01: Data Wipe Script Summary

**Standalone Node.js Firestore wipe script with dry-run preview (--dry-run), typed WIPE confirmation gate, and batched deletion across exactly 10 targeted collections — users never touched**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-01T11:12:54Z
- **Completed:** 2026-03-01T11:20:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `scripts/wipe.js` using Firebase Admin SDK with same init pattern as backup.js/restore.js
- `--dry-run` mode fetches and prints per-collection document counts and total with no deletions
- Live mode prints warning banner, scans all 10 collections, prompts for exact string "WIPE", aborts on wrong input
- Batched deletion in chunks of 500 (Firestore batch write limit)
- Dry-run verified against live Firestore: 129 documents across 10 collections successfully counted

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Firestore wipe script** - `fa84e1f` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `scripts/wipe.js` - Firestore wipe script: dry-run preview, typed confirmation, batched deletion of 10 targeted collections

## Decisions Made
- Dry-run mode provides complete scan output without any --confirm or extra flag, matching the plan spec
- Live mode reuses snapshots from the scan pass for deletion rather than re-fetching, saving one Firestore round-trip per collection
- Wrong confirmation input exits with code 0 (clean abort) not code 1 (error) since no failure occurred

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — the script connected to Firestore successfully on first run and dry-run returned correct counts (129 documents across 10 collections).

## User Setup Required
None - `serviceAccountKey.json` already present from Phase 50 backup script work.

## Next Phase Readiness
- `scripts/wipe.js` is ready to use before Phase 52 data migration
- Recommended workflow: `node scripts/backup.js` then `node scripts/wipe.js --dry-run` then `node scripts/wipe.js`
- Phase 52 (import/migration) can proceed after wipe confirms 0 documents in all 10 targeted collections

---
*Phase: 51-data-wipe*
*Completed: 2026-03-01*
