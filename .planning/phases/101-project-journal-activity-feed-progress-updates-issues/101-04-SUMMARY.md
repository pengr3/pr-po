---
phase: 101-project-journal-activity-feed-progress-updates-issues
plan: "04"
subsystem: ui
tags: [javascript, firestore, realtime, project-detail, journal, progress-updates, issues, resolve-reopen]

# Dependency graph
requires:
  - phase: 101-03
    provides: "_addActivityEntry primitive, ensureJournalListeners, _buildJournalPanelHtml with placeholders, journalIssues/journalProgressUpdates/journalIssueFilter module state"
provides:
  - "Progress Updates tab: structured check-in form (pct, summary, blockers, next_milestone) + newest-first history list"
  - "Issues tab: filter chips (All/Open/Resolved) + log form + punch list with resolve/reopen workflow"
  - "resolveIssue() — requires notes via window.prompt, sets status:resolved, auto-posts system Feed entry (D-12)"
  - "reopenIssue() — clears resolution fields, auto-posts system Feed entry (D-13)"
  - "setIssueFilter(), submitNewIssue(), submitProgressUpdate() all window-registered and deleted in destroy()"
affects: [101-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Required-notes prompt gate: window.prompt + trim + early return on empty (mirroring finance.js rejectBillingRequest)"
    - "_issueSeqNum: ascending-sort + findIndex for stable #N display without storing a counter"
    - "Punch-list filter: journalIssues.filter() by journalIssueFilter state, re-rendered in place by _renderJournalPanelInPlace"

key-files:
  created: []
  modified:
    - app/views/project-detail.js

key-decisions:
  - "resolveIssue uses window.prompt for required notes — matches D-11 and existing rejectBillingRequest pattern in finance.js"
  - "_issueSeqNum derives #N by sorting journalIssues ascending and using 1-based index — stable without a separate counter field"
  - "All three journal listeners already running (Plan 03 D-18 simultaneous attach) — tab builders read from in-memory arrays with zero extra Firestore calls"

# Metrics
duration: ~15min
completed: 2026-06-10
---

# Phase 101 Plan 04: Progress Updates + Issues tabs Summary

**Full journal: Progress Updates tab (structured check-in form + history) and Issues tab (filter chips + punch list + required-notes resolve/reopen with system Feed auto-entries)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-10
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

### Task 1: Progress Updates tab
- Added `_renderProgressCard(u)` rendering pct badge, timestamp/author meta line, and escapeHTML-safe summary/blockers/next_milestone fields
- Added `_buildProgressTabHtml(project, isReadOnly)` — shows `.journal-progress-form` (4 fields + Submit button) when not read-only, followed by newest-first history from `journalProgressUpdates`
- Added `submitProgressUpdate()` — requires non-empty summary, clamps pct 0..100, writes to `projects/{id}/progress_updates` with `serverTimestamp()`
- Wired `_buildProgressTabHtml(project, isReadOnly)` into `_buildJournalPanelHtml` replacing `data-journal-placeholder="progress"`
- Registered `window.submitProgressUpdate`; deleted in `destroy()`

### Task 2: Issues tab
- Added `_issueSeqNum(issueId)` — sorts `journalIssues` ascending by created_at and returns 1-based index (#1 = oldest)
- Added `_renderIssueRow(issue, isReadOnly)` — renders type chip, title, description, status badge, optional resolution block; resolve/reopen action buttons omitted when isReadOnly; all user text escaped via `escapeHTML`
- Added `_buildIssuesTabHtml(project, isReadOnly)` — 3 filter chips (All/Open/Resolved), optional log form, filtered punch list; wired into `_buildJournalPanelHtml` replacing `data-journal-placeholder="issues"`
- Added `setIssueFilter(f)` — sets `journalIssueFilter` and calls `_renderJournalPanelInPlace()`
- Added `submitNewIssue()` — requires title, writes `status:'open'` with `resolution_notes:null`, `resolved_at:null`, `resolved_by_uid:null`
- Added `resolveIssue(issueId)` — `window.prompt` for required notes (blocks empty), `updateDoc` sets `status:'resolved'` + `resolved_at: serverTimestamp()`, then `await _addActivityEntry(...)` system entry (D-12)
- Added `reopenIssue(issueId)` — clears resolution fields to null, then `await _addActivityEntry(...)` system entry (D-13)
- Registered `window.setIssueFilter`, `window.submitNewIssue`, `window.resolveIssue`, `window.reopenIssue` in `attachWindowFunctions`; all deleted in `destroy()`

## Task Commits

1. **Task 1: Progress Updates tab** — `4374ed4` (feat)
2. **Task 2: Issues tab resolve/reopen workflow** — `7d79714` (feat)

## Files Created/Modified

- `app/views/project-detail.js` — Added 293 lines across both tasks: `_renderProgressCard`, `_buildProgressTabHtml`, `submitProgressUpdate`, `_issueSeqNum`, `ISSUE_TYPE_LABELS`, `_renderIssueRow`, `_buildIssuesTabHtml`, `setIssueFilter`, `submitNewIssue`, `resolveIssue`, `reopenIssue`; both tab placeholders replaced; 6 window registrations + 6 delete cleanups added

## Decisions Made

- **window.prompt for required notes:** D-11 mandates required resolution notes. `window.prompt` matches the existing `rejectBillingRequest` pattern in `finance.js` exactly — no new modal or DOM element needed.
- **_issueSeqNum via sort+index:** Stable display number without storing a counter field in Firestore. Ascending sort of the in-memory `journalIssues` array (already loaded by Plan 03 listeners) — no extra reads.
- **All 3 listeners simultaneous:** Inherited from Plan 03. Both tab builders read from `journalProgressUpdates` and `journalIssues` which are always live — no listener changes needed here.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both tabs are fully wired to Firestore.

## Threat Flags

None. No new network endpoints or auth paths. The `issues` subcollection Firestore rules (allow read/create/update: isActiveUser; allow delete: false) were deployed in Plan 02.

## Self-Check: PASSED

- `app/views/project-detail.js` exists and modified
- `node --check app/views/project-detail.js` exits 0
- Task 1 verification script: PASS (all 10 required strings present)
- Task 2 verification script: PASS (all 16 required strings present; _addActivityEntry >= 4 refs)
- Commit `4374ed4` exists (Task 1)
- Commit `7d79714` exists (Task 2)
- `_buildProgressTabHtml(project` wired into `_buildJournalPanelHtml`
- `_buildIssuesTabHtml(project` wired into `_buildJournalPanelHtml`
- `submitProgressUpdate` writes to `collection(db, 'projects', currentProject.id, 'progress_updates')` with `pct_complete`, `summary`, `created_at: serverTimestamp()`
- `resolveIssue` calls `window.prompt('Resolution notes (required):')` + early return on empty
- `resolveIssue` calls `_addActivityEntry` with `type: 'system'` (D-12)
- `reopenIssue` sets `resolution_notes: null`, `resolved_at: null`, `resolved_by_uid: null`
- `reopenIssue` calls `_addActivityEntry` with `type: 'system'` (D-13)
- `submitNewIssue` writes `status: 'open'` with `resolution_notes: null`
- 6 window registrations + 6 delete cleanups added symmetrically
