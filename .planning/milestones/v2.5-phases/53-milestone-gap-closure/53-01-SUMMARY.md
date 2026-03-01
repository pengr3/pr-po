---
phase: 53-milestone-gap-closure
plan: 01
subsystem: security, documentation
tags: [xss, escapeHTML, onclick, security, documentation, traceability, data-migration, gap-closure]
dependency_graph:
  requires:
    - phase: 52.1-finance-services-tabs
      provides: finance.js with 3 onclick attrs that used .replace() instead of escapeHTML()
    - phase: 51.1-data-migration
      provides: scripts/import.js — verified implementation missing formal VERIFICATION.md
    - phase: 49-security-audit
      provides: 49-04-SUMMARY.md missing requirements-completed field for SEC-03
    - phase: 50-database-safety
      provides: restore.js and backup.js missing projectId from admin.initializeApp()
  provides:
    - "app/views/finance.js: XSS-consistent onclick attributes using escapeHTML()"
    - "scripts/restore.js: Consistent Admin SDK init with projectId: PROJECT_ID"
    - "scripts/backup.js: Consistent Admin SDK init with projectId: PROJECT_ID"
    - ".planning/phases/51.1-data-migration/51.1-VERIFICATION.md: MIG-01-04 verification document"
    - ".planning/phases/49-security-audit/49-04-SUMMARY.md: requirements-completed: [SEC-03] in frontmatter"
  affects:
    - app/views/finance.js
    - scripts/restore.js
    - scripts/backup.js
tech-stack:
  added: []
  patterns:
    - "escapeHTML() universally applied to all onclick attribute values containing user/Firestore data"
    - "admin.initializeApp({ credential, projectId: PROJECT_ID }) as standard pattern across all 4 Admin scripts"
key-files:
  created:
    - .planning/phases/51.1-data-migration/51.1-VERIFICATION.md
  modified:
    - app/views/finance.js
    - scripts/restore.js
    - scripts/backup.js
    - .planning/phases/49-security-audit/49-04-SUMMARY.md
key-decisions:
  - "escapeHTML() replaces .replace(/'/g, \"\\\\'\") in finance.js onclick attrs — handles all 5 HTML special chars, not just single-quotes"
  - "backup.js also fixed (same projectId omission as restore.js) — plan only listed restore.js but both had the gap"
  - "51.1-VERIFICATION.md: status=passed since implementation was human-verified during execution; this document formalizes that verification"
  - "requirements-completed field added to 49-04-SUMMARY.md frontmatter alongside existing provides field for full traceability"
requirements-completed: [MIG-01, MIG-02, MIG-03, MIG-04, SEC-01]
metrics:
  duration: "~2 minutes"
  completed_date: "2026-03-02"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  files_created: 1
---

# Phase 53 Plan 01: Milestone Gap Closure Summary

**XSS-consistent onclick attrs via escapeHTML() in finance.js, projectId added to restore.js/backup.js initializeApp, 51.1 VERIFICATION.md created confirming MIG-01-04, and SEC-03 traceability fixed in 49-04-SUMMARY.md frontmatter.**

## What Was Built

Closed all 4 tech debt items identified in the v2.5 milestone audit:

1. **finance.js XSS consistency (SEC-01):** Three `onclick` attributes on table rows in `renderProjectExpensesTable()`, `renderServiceExpensesTable()`, and `renderRecurringExpensesTable()` used `.replace(/'/g, "\\'")` instead of `escapeHTML()`. Replaced with `escapeHTML()` to match the Phase 49 standard established in procurement.js. `escapeHTML` was already imported at line 7 — a pure replacement, no new import needed.

2. **Admin SDK consistency (restore.js + backup.js):** `admin.initializeApp()` in `scripts/restore.js` was missing `projectId: PROJECT_ID`. Fixed to match the pattern in `scripts/wipe.js` and `scripts/import.js`. Discovered and fixed the same omission in `scripts/backup.js` (not in original plan but same gap).

3. **Phase 51.1 VERIFICATION.md:** Created formal verification document at `.planning/phases/51.1-data-migration/51.1-VERIFICATION.md` with `status: passed` and `score: 4/4`. Documents the evidence for MIG-01 through MIG-04 based on the human verification that occurred during 51.1-01-PLAN execution (Task 2 blocking checkpoint approved by user on 2026-03-01). Promotes all 4 MIG requirements from "partial" to fully documented "satisfied" status.

4. **SEC-03 traceability (49-04-SUMMARY.md):** Added `requirements-completed: [SEC-03]` to the frontmatter of `49-04-SUMMARY.md`. The file already had `provides: [SEC-03]` in `dependency_graph` but was missing the `requirements-completed` field used for traceability validation.

## Task Completion

### Task 1: Fix escapeHTML in finance.js onclick attrs and add projectId to restore.js

**Status:** Complete
**Commit:** a792776

**Changes:**
- `app/views/finance.js` line 1161: `proj.projectName.replace(/'/g, "\\'")` → `escapeHTML(proj.projectName)`
- `app/views/finance.js` line 1415: `svc.serviceCode.replace(/'/g, "\\'")` → `escapeHTML(svc.serviceCode)`
- `app/views/finance.js` line 1502: `svc.serviceCode.replace(/'/g, "\\'")` → `escapeHTML(svc.serviceCode)`
- `scripts/restore.js`: Added `projectId: PROJECT_ID` to `admin.initializeApp()` call
- `scripts/backup.js`: Added `projectId: PROJECT_ID` to `admin.initializeApp()` call (same gap)

**Verification:** `grep -c "\.replace.*'/g" app/views/finance.js` returns 0. `grep -c "projectId: PROJECT_ID" scripts/restore.js` returns 1.

### Task 2: Create Phase 51.1 VERIFICATION.md and fix 49-04-SUMMARY.md frontmatter

**Status:** Complete
**Commit:** c79e506

**Changes:**
- Created `.planning/phases/51.1-data-migration/51.1-VERIFICATION.md` (104 lines, passed status, 4/4 score)
- Added `requirements-completed: [SEC-03]` to `.planning/phases/49-security-audit/49-04-SUMMARY.md` frontmatter

**Verification:** `test -f .planning/phases/51.1-data-migration/51.1-VERIFICATION.md && grep -c "MIG-0[1-4]" ...` returns 5. `grep "requirements-completed" .planning/phases/49-security-audit/49-04-SUMMARY.md` returns match.

## Files Created/Modified

- `app/views/finance.js` - Replaced 3 .replace() patterns with escapeHTML() in onclick attrs
- `scripts/restore.js` - Added projectId: PROJECT_ID to admin.initializeApp()
- `scripts/backup.js` - Added projectId: PROJECT_ID to admin.initializeApp()
- `.planning/phases/51.1-data-migration/51.1-VERIFICATION.md` - Created (new file)
- `.planning/phases/49-security-audit/49-04-SUMMARY.md` - Added requirements-completed field

## Decisions Made

- `escapeHTML()` replaces `.replace(/'/g, "\\'")` — handles all 5 HTML special characters (not just single-quotes), consistent with Phase 49 standard and procurement.js
- `scripts/backup.js` was also fixed (same projectId omission as restore.js) even though not listed in original plan — Rule 2 auto-fix (consistency requirement discovered during implementation)
- `51.1-VERIFICATION.md` uses `status: passed` because the implementation was genuinely human-verified during execution; this document formalizes the existing verification record
- `requirements-completed` added at same frontmatter level as other SUMMARY fields for consistent tooling behavior

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added projectId to backup.js (same omission as restore.js)**
- **Found during:** Task 1
- **Issue:** The plan specified fixing restore.js but backup.js had the identical omission (`admin.initializeApp()` missing `projectId: PROJECT_ID`)
- **Fix:** Added `projectId: PROJECT_ID` to `admin.initializeApp()` in `scripts/backup.js`
- **Files modified:** `scripts/backup.js`
- **Commit:** a792776

## Issues Encountered

None. All 4 gap items were straightforward fixes with clear before/after states. The 51.1-VERIFICATION.md required careful synthesis of evidence from 51.1-01-SUMMARY.md and the milestone audit document but all source information was available.

## User Setup Required

None — these are code and documentation fixes, no credentials or runtime verification needed.

## Next Phase Readiness

- All v2.5 milestone tech debt items from the audit are resolved
- MIG-01 through MIG-04 requirements now have complete traceability: REQUIREMENTS.md [x] + SUMMARY frontmatter + VERIFICATION.md
- SEC-01 defense-in-depth consistency restored: all onclick attrs across the codebase use escapeHTML()
- SEC-03 traceability gap closed: 49-04-SUMMARY.md has requirements-completed field
- Admin SDK init pattern is now consistent across all 4 scripts (backup, restore, wipe, import)
- v2.5 milestone can be marked complete with zero outstanding code/documentation gaps

## Self-Check: PASSED

- `app/views/finance.js`: `grep -c "\.replace.*'/g" app/views/finance.js` returns 0
- `scripts/restore.js`: `grep "projectId: PROJECT_ID" scripts/restore.js` returns match
- `scripts/backup.js`: `grep "projectId: PROJECT_ID" scripts/backup.js` returns match
- `.planning/phases/51.1-data-migration/51.1-VERIFICATION.md` exists with passed status and all 4 MIG IDs
- `.planning/phases/49-security-audit/49-04-SUMMARY.md` has `requirements-completed: [SEC-03]`
- Commit `a792776` (Task 1) exists in git log
- Commit `c79e506` (Task 2) exists in git log

---
*Phase: 53-milestone-gap-closure*
*Completed: 2026-03-02*
