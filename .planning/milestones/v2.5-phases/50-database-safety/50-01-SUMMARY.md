---
phase: 50-database-safety
plan: 01
subsystem: database
tags: [firebase-admin, firestore, backup, restore, node-scripts]

# Dependency graph
requires:
  - phase: 49-security-audit
    provides: completed security audit, confirmed Firestore collections and schema
provides:
  - Firestore export script (scripts/backup.js) — all 13 collections + 2 subcollections to JSON
  - Firestore restore script (scripts/restore.js) — batch re-import with typed confirmation
  - JSON format contract shared between export and import (Timestamp markers, _id, _parentId)
affects: [51-data-wipe, 52-migration]

# Tech tracking
tech-stack:
  added: [firebase-admin@13.7.0 (devDependency)]
  patterns:
    - "ES module import in Node.js CLI scripts (import instead of require, createRequire for JSON)"
    - "Firestore Timestamp serialization: { __type: 'timestamp', value: ISO8601 } roundtrip"
    - "Batched Firestore writes: 500 docs/batch to stay within Firestore limit"
    - "SUBCOLLECTION_MAP for deterministic subcollection file classification"

key-files:
  created:
    - scripts/backup.js
    - scripts/restore.js
  modified:
    - package.json (firebase-admin added to devDependencies)
    - package-lock.json

key-decisions:
  - "ES module syntax used (import/export) instead of CommonJS require — package.json has type:module"
  - "createRequire() used to load serviceAccountKey.json (JSON file, cannot use import with assertion in all Node versions)"
  - "GOOGLE_APPLICATION_CREDENTIALS env var supported as alternative to serviceAccountKey.json location"
  - "Subcollection file naming: {parent}_{child}.json with _parentId field — deterministic decode via SUBCOLLECTION_MAP"
  - "--dry-run and --collections flags added to restore.js for safety and selective recovery"

patterns-established:
  - "Admin scripts: ESM syntax, firebase-admin SDK, serviceAccountKey.json in project root"
  - "Backup JSON: [{ _id, ...fields }] for collections; [{ _id, _parentId, ...fields }] for subcollections"
  - "Timestamp roundtrip: toDate().toISOString() on backup; Timestamp.fromDate(new Date(iso)) on restore"

requirements-completed: [DBS-01, DBS-03]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 50 Plan 01: Firestore Backup/Restore Scripts Summary

**Firebase Admin SDK backup/restore scripts: timestamped JSON export of all 13 collections + 2 subcollections with typed-confirmation restore and --dry-run safety mode**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-01T11:06:04Z
- **Completed:** 2026-03-01T11:09:38Z
- **Tasks:** 2
- **Files modified:** 4 (scripts/backup.js, scripts/restore.js, package.json, package-lock.json)

## Accomplishments
- `scripts/backup.js` exports all 13 top-level Firestore collections + 2 subcollections to a timestamped `backups/YYYY-MM-DDTHHMMSS/` directory, one JSON file per collection
- `scripts/restore.js` re-imports backup JSON files using batched writes (500 docs/batch), with typed confirmation ("RESTORE"), --dry-run mode, and --collections filter
- Consistent JSON format contract shared between both scripts: `_id` preserves document IDs, `_parentId` links subcollection entries, `{ __type: "timestamp", value: ISO8601 }` roundtrips Firestore Timestamps
- `firebase-admin` installed as devDependency so scripts are self-contained

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Firestore backup export script** - `5bcc873` (feat)
2. **Task 2: Create Firestore restore script** - `44d0a3d` (feat)

**Plan metadata:** (docs commit — see final commit below)

## Files Created/Modified
- `scripts/backup.js` - Node.js CLI using Firebase Admin SDK; exports all Firestore collections to timestamped JSON
- `scripts/restore.js` - Node.js CLI; re-imports backup JSON with batched writes, dry-run, and typed confirmation
- `package.json` - firebase-admin@13.7.0 added to devDependencies
- `package-lock.json` - Updated by npm install

## Decisions Made
- **ES module syntax** — `package.json` has `"type": "module"` so scripts use `import`/`export`. `createRequire()` used to load the JSON service account key file since dynamic `import()` with assertions is less portable across Node versions.
- **SUBCOLLECTION_MAP** — subcollection files detected by exact filename stem match rather than heuristics, ensuring correct parent/child routing without ambiguity.
- **--dry-run before live writes** — restore.js parses all files and counts totals before prompting for confirmation, so the user sees the full scope before committing.
- **Non-zero exit on any failure** — both scripts exit with code 1 if any collection fails, making them CI-safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Converted CommonJS require() to ES module import syntax**
- **Found during:** Task 1 (after writing backup.js with CommonJS syntax)
- **Issue:** `package.json` contains `"type": "module"`, so Node.js treats all `.js` files as ES modules. `require()` is not available, causing `ReferenceError: require is not defined`.
- **Fix:** Rewrote both scripts using `import` statements. Used `createRequire(import.meta.url)` for the JSON service account key file (JSON imports via `require()` are more portable than `import` with assert). Added `fileURLToPath` + `path.dirname` to reconstruct `__dirname` (not available in ESM).
- **Files modified:** scripts/backup.js, scripts/restore.js
- **Verification:** `node scripts/backup.js --help` and `node scripts/restore.js --help` both execute correctly.
- **Committed in:** 5bcc873 (Task 1), 44d0a3d (Task 2)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Fix was required for the scripts to run at all. No scope changes.

## Issues Encountered
None beyond the ES module compatibility issue, which was resolved via Rule 3.

## User Setup Required

Before running these scripts, the user must:

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key" → download JSON file
3. Save as `serviceAccountKey.json` in the project root (already .gitignored — safe to store locally)
4. Run `node scripts/backup.js` to export

The scripts check for the key file at startup and print clear instructions if it is missing.

## Next Phase Readiness
- Phase 50 Plan 01 complete — backup/restore infrastructure is ready
- Phase 51 (data wipe) can now safely proceed: backup first, wipe, verify, restore if needed
- Phase 52 (migration) can use restore.js --collections flag for selective re-import of specific collections

---
*Phase: 50-database-safety*
*Completed: 2026-03-01*
