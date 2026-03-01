---
phase: 46-code-cleanup-and-mrf-fix
plan: 01
subsystem: ui
tags: [cleanup, console-log, dead-code, git-tag]

# Dependency graph
requires: []
provides:
  - "Dead files removed: project-assignments.js, service-assignments.js, nul"
  - "Ad-hoc console.log calls removed from all live SPA files"
  - "Stale /project-assignments route removed from validate-permissions.js"
  - "pre-cleanup git tag for rollback safety"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Console log rule: only bracketed-prefix logs (e.g. [Module]) remain in SPA files; all module-load/init/destroy plain logs removed"

key-files:
  created: []
  modified:
    - "scripts/validate-permissions.js (stale route removed)"
    - "app/views/home.js (3 ad-hoc logs removed)"
    - "app/firebase.js (1 ad-hoc log removed)"
    - "app/components.js (1 ad-hoc log removed)"
    - "app/utils.js (1 ad-hoc log removed)"
    - "app/expense-modal.js (1 ad-hoc log removed)"
    - "app/edit-history.js (1 ad-hoc log removed)"
    - "app/router.js (3 ad-hoc logs removed)"
    - "app/views/procurement-base.js (6 ad-hoc logs removed)"
    - "app/views/finance.js (8 ad-hoc logs removed)"
    - "app/views/procurement.js (22 ad-hoc logs removed)"

key-decisions:
  - "nul file was untracked (never committed to git) and could not be staged via git add on Windows due to NUL being a reserved device name; deleted via Node.js fs.unlinkSync('./nul') — no git commit needed for its removal"
  - "seed-roles.js flagged for user review (not deleted): it is in app/ but only imported by scripts/sync-role-permissions.js, not the SPA. Recommend: keep in place or move to scripts/"
  - "edit-history.js was not in the original task file list but had one ad-hoc module-load log — removed as part of the 'scan any other app/ files not listed' directive"
  - "router.js had 3 ad-hoc logs (init/loaded/initialized) — removed, all [Router]-prefixed logs preserved"

patterns-established:
  - "Console log discipline: module-load messages ('X module loaded successfully'), init/destroy messages without brackets, and emoji-prefixed logs are ad-hoc and must be removed; only [BracketedModule] prefix logs are kept"

requirements-completed: [CLN-01]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 46 Plan 01: Code Cleanup — Dead Files and Console Log Removal Summary

**Removed 3 dead files (project-assignments.js, service-assignments.js, nul), fixed stale route in validate-permissions.js, and stripped ~47 ad-hoc console.log calls from 11 live SPA files while preserving all structured [Module]-prefixed logs**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T01:13:09Z
- **Completed:** 2026-02-28T01:19:04Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Created `pre-cleanup` git tag for one-command rollback safety before any destructive operations
- Deleted `app/views/project-assignments.js` and `app/views/service-assignments.js` (dead since Phase 39 when assignments.js superseded them) via `git rm`
- Deleted the accidental `nul` file from the repo root (was untracked; used Node.js `fs.unlinkSync` since Windows treats `nul` as a reserved device name)
- Removed stale `/project-assignments` route entry from `scripts/validate-permissions.js`
- Confirmed no unused CDN references in index.html (Firebase via ES modules, signature_pad self-hosted)
- Removed ~47 ad-hoc console.log calls from 11 live SPA files; all structured [Module]-prefixed logs and all console.error/warn calls preserved

## Task Commits

1. **Task 1: Create safety tag and remove dead files**
   - `c2784f3` — chore(46): remove dead project-assignments.js and service-assignments.js
   - `29235c9` — chore(46): remove stale /project-assignments route from validate-permissions.js
   - Note: nul file deletion was filesystem-only (untracked file, no git commit needed)
2. **Task 2: Remove ad-hoc console.log calls from all live SPA files** — `77c776d`

## Files Created/Modified
- `app/views/project-assignments.js` — DELETED (dead file, 0 imports)
- `app/views/service-assignments.js` — DELETED (dead file, 0 imports)
- `nul` (repo root) — DELETED (accidental file, was untracked)
- `scripts/validate-permissions.js` — removed stale `/project-assignments` entry from expectedRoutes
- `app/views/home.js` — removed init log, destroy log, module-load log
- `app/firebase.js` — removed "Firebase initialized successfully" log
- `app/components.js` — removed "Components module loaded successfully" log
- `app/utils.js` — removed "Utilities module loaded successfully" log
- `app/expense-modal.js` — removed "Expense modal module loaded successfully" log
- `app/edit-history.js` — removed "Edit history module loaded successfully" log
- `app/router.js` — removed "Initializing router...", "Router initialized...", "Router module loaded successfully" logs
- `app/views/procurement-base.js` — removed 6 ad-hoc logs (init, initialized successfully, destroying, destroyed, projects loaded, module loaded)
- `app/views/finance.js` — removed 8 logs (init success, 4 emoji-prefixed data-load logs, 2 more, module loaded)
- `app/views/procurement.js` — removed 22 ad-hoc logs (suppliers loaded, MRF records loading, PR/TR emoji logs, POs updated, PR/PO detail loading, document generation, module loaded)

## Decisions Made
- nul file could not be deleted via standard shell tools (Windows treats `nul` as NUL device). Used `node -e "fs.unlinkSync('./nul')"` to delete it as a real file. Since it was never tracked by git (untracked status), no git commit needed for its removal.
- seed-roles.js is flagged for user review (not deleted): it lives in `app/` but is only referenced by `scripts/sync-role-permissions.js`, not the SPA import chain. Recommendation: keep in place (scripts/ import can reach it via relative path) or move to `scripts/` for organizational clarity. User decision needed.
- edit-history.js was not listed in the task files but the plan said "scan any other app/ files not listed above." Found one ad-hoc module-load log and removed it.

## Deviations from Plan

None — plan executed exactly as written, with one minor technical note: the `nul` file deletion used a Node.js workaround instead of `git rm` (because git cannot stage a file named `nul` on Windows), but the end result is identical — the file no longer exists.

## Issues Encountered
- `nul` file could not be added to git staging on Windows (`git add nul` fails with "short read while indexing nul"). Resolved using `node -e "require('fs').unlinkSync('./nul')"`. Since the file was never tracked, its removal does not require a git commit.

## User Setup Required
None — no external service configuration required.

## Seed-roles.js User Decision Needed
`app/seed-roles.js` is in the `app/` directory but is **not imported by the SPA**. It is only referenced by `scripts/sync-role-permissions.js`.

**Options:**
1. **Keep in place** (current state) — `scripts/sync-role-permissions.js` can still import it via `../app/seed-roles.js`. No breakage.
2. **Move to `scripts/`** — Cleaner organization: all dev/admin scripts in one folder. Requires updating the import path in `sync-role-permissions.js`.

Either option is safe. No action required for SPA functionality.

## Next Phase Readiness
- Codebase cleaned: no dead files, no ad-hoc debug logs
- Plan 02 (Unified MRF dropdown) can proceed without interference from this cleanup

## Self-Check: PASSED

- FOUND: .planning/phases/46-code-cleanup-and-mrf-fix/46-01-SUMMARY.md
- FOUND: app/views/project-assignments.js deleted
- FOUND: app/views/service-assignments.js deleted
- FOUND: nul deleted
- FOUND: commit c2784f3 (dead JS removal)
- FOUND: commit 29235c9 (stale route fix)
- FOUND: commit 77c776d (console.log cleanup)

---
*Phase: 46-code-cleanup-and-mrf-fix*
*Completed: 2026-02-28*
