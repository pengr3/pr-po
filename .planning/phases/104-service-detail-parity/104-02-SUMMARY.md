---
phase: 104-service-detail-parity
plan: 02
subsystem: ui
tags: [service-detail, activity-journal, progress-updates, issues, last_activity_at, firestore]

requires:
  - phase: 104-01
    provides: services/{id}/activity_entries|progress_updates|issues|audit_log Firestore rules
  - phase: 101
    provides: project-detail.js Journal panel (the mirrored source design)
  - phase: 103.1
    provides: D-03 fire-and-forget last_activity_at landmine pattern
provides:
  - "Status-gated 3-tab service Journal panel (Activity Feed · Progress Updates · Issues)"
  - "Shared write primitives _addServiceActivityEntry (boolean) + addServiceAuditEntry — consumed by Plans 03/04"
  - "ensureServiceJournalListeners (3 simultaneous onSnapshot) + teardown"
  - "D-12 contract/budget cost-delta auto-entry in saveServiceField"
affects: [104-03, 104-04]

tech-stack:
  added: []
  patterns: ["copy-then-adapt project-detail.js journal into service-detail.js (Phase-26 mirror)", "D-14 fire-and-forget success-only last_activity_at bump", "scoped in-place panel re-render via replaceWith"]

key-files:
  created: []
  modified: [app/views/service-detail.js]

key-decisions:
  - "Kept literal CSS class strings (project-journal-panel, journal-*) and element id projectJournalPanel verbatim (Pattern 5 — renaming orphans the global styling)"
  - "Renamed only the cross-plan-consumed primitives: _addActivityEntry -> _addServiceActivityEntry, addProjectAuditEntry -> addServiceAuditEntry, _buildJournalPanelHtml -> _buildServiceJournalPanelHtml, _renderJournalPanelInPlace -> _renderServiceJournalPanelInPlace, ensureJournalListeners -> ensureServiceJournalListeners; all other journal handlers keep their names (service-detail and project-detail never mount together)"
  - "Plan-sanctioned extension beyond the project baseline: resolveIssue + reopenIssue also fire the D-14 success-only last_activity_at bump (project baseline only bumps on create-type writes). Behaviorally coherent — resolve/reopen ARE recent activity that should refresh the one-time On-going clock (D-13). Same fire-and-forget contract, zero risk."

patterns-established:
  - "Service journal subcollections hang off the Firestore doc id (currentServiceDocId), not service_code"

requirements-completed: []

duration: 35 min
completed: 2026-06-13
---

# Phase 104 Plan 02: Service Activity Journal Summary

**Ported the Phase 101 3-tab Activity Journal (Activity Feed · Progress Updates · Issues) into service-detail.js — status-gated panel, 3 live subcollection listeners, shared activity/audit write primitives for Plans 03/04, the D-14 fire-and-forget last_activity_at landmine, and the D-12 contract/budget cost-delta auto-entry.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 1 (service-detail.js)

## Accomplishments
- Imports extended (`orderBy`, `limit`, `arrayUnion`); 13 journal module-state vars added.
- Shared primitives `_addServiceActivityEntry` (returns boolean) + `addServiceAuditEntry` (audit_log) — the exact names Plans 03/04 consume.
- Full 3-tab panel: Activity Feed (composer + tag pills + optimistic post), Progress Updates (form + history cards + inline edit with `arrayUnion` history), Issues (filter chips + log form + resolve-with-required-notes + reopen, both auto-posting system Feed entries).
- `ensureServiceJournalListeners` attaches all 3 `onSnapshot` listeners simultaneously (`orderBy created_at desc, limit 50`), gated on visible status; scoped in-place re-render via `_renderServiceJournalPanelInPlace` (replaceWith on `#projectJournalPanel`).
- D-14 fire-and-forget success-only `last_activity_at` bump on all 5 write handlers (post / progress / issue-create / resolve / reopen), un-awaited + un-batched.
- D-12 contract/budget cost-delta auto-entry in `saveServiceField` (guarded on `isCostChange`, fires even with no notify-recipients).
- All 15 journal window functions register↔teardown symmetric; listeners + UI state reset in `destroy()`.

## Task Commits

1. **Task 1: primitives + Activity Feed + 3 listeners + panel** - `2211fa0` (feat)
2. **Task 2: Progress Updates + Issues tabs + toggles** - `56fd30d` (feat)
3. **Task 3: D-12 cost-delta auto-entry** - `974bb5f` (feat)

## Files Created/Modified
- `app/views/service-detail.js` - imports, journal state, primitives, panel + 3 tabs, listeners, init gate, panel injection, saveServiceField cost-delta auto-entry, attachWindowFunctions + destroy.

## Decisions Made
- See key-decisions. The one intentional deviation from a pure 1:1 mirror is the resolve/reopen D-14 bump (documented above), which the plan explicitly instructed and which improves D-13 signal accuracy.

## Deviations from Plan

None - plan executed as written. (The resolve/reopen `last_activity_at` bump is plan-instructed, not a deviation; it is a documented superset of the project baseline.)

## Issues Encountered
None.

## Verification
- `node --check app/views/service-detail.js` exit 0 after each task. PASS
- Primitives, panel builder, 3 listeners, both tab builders present; placeholders fully swapped (0 leftover markers). PASS
- 5 D-14 `last_activity_at: serverTimestamp()` bumps (un-awaited); D-12 cost-delta fire-and-forget. PASS
- 15/15 journal window fns register↔teardown symmetric (name-by-name). PASS

## User Setup Required
None directly — runtime writes require the Plan 01 DEV rules deploy (browser UAT).

## Next Phase Readiness
- `_addServiceActivityEntry` + `addServiceAuditEntry` are live for Plan 03 (lifecycle gates) and Plan 04 (Record Release). The `orderBy`/`limit`/`arrayUnion` imports are in place. Plan 03 (Wave 3) builds on this.

## Self-Check: PASSED

---
*Phase: 104-service-detail-parity*
*Completed: 2026-06-13*
