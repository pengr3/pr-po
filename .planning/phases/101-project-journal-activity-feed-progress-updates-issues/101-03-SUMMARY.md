---
phase: 101-project-journal-activity-feed-progress-updates-issues
plan: "03"
subsystem: ui
tags: [javascript, firestore, realtime, project-detail, journal, activity-feed, optimistic-ui]

# Dependency graph
requires:
  - phase: 101-01
    provides: CSS contract for journal panel (.project-journal-panel, .journal-tab-btn, .journal-composer, .journal-entry, etc.)
  - phase: 101-02
    provides: Firestore security rules for activity_entries, progress_updates, issues subcollections
provides:
  - "Journal panel shell (status-gated: For Mobilization / On-going / Completed) rendered in project-detail.js below #projectDetailBottomRow"
  - "_addActivityEntry(projectId, {type, text, is_system}) shared write primitive — callable by Plans 04/05"
  - "ensureJournalListeners() attaching all 3 subcollection onSnapshot listeners simultaneously"
  - "Activity Feed tab: tag-type composer (Update/Milestone/Issue/Client), optimistic post, system-vs-manual entry rendering"
  - "switchJournalTab() DOM-only tab switching (no listener churn)"
  - "window.switchJournalTab and window.postActivityEntry registered/deleted symmetrically"
  - "progress/issues tab panels with Plan 04 placeholders (data-journal-placeholder)"
affects: [101-04, 101-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Simultaneous listener attach for all 3 subcollections — avoids per-tab churn (D-18 intentional improvement)"
    - "Optimistic DOM append before Firestore confirm — array-replace reconciliation on snapshot"
    - "Status gate via JOURNAL_VISIBLE_STATUSES constant — returns '' for hidden statuses"
    - "In-place panel re-render via replaceWith (mirrors projectPlanCard pattern)"

key-files:
  created: []
  modified:
    - app/views/project-detail.js

key-decisions:
  - "All THREE journal listeners attach simultaneously in ensureJournalListeners() rather than one-per-active-tab (D-18 intentional deviation) — tab switching is pure DOM show/hide with zero listener churn"
  - "Optimistic array-replace reconciliation accepted: _optimistic placeholder replaced wholesale by next Firestore snapshot; no manual de-dup required"
  - "Activity Feed composer omitted entirely in Completed (read-only) mode — CSS .project-journal-panel--readonly also hides write surfaces as defense-in-depth"
  - "Progress and issues panels use data-journal-placeholder attribute — Plan 04 replaces inner content without touching panel shell"

patterns-established:
  - "_addActivityEntry(projectId, {type, text, is_system}): shared subcollection addDoc write primitive — mirror of addProjectAuditEntry"
  - "ensureJournalListeners(): idempotent guard pattern matching ensureBillingRequestsListener/ensureCollectiblesListener"
  - "_renderJournalPanelInPlace(): replaceWith pattern for in-place snapshot-driven re-render (same as projectPlanCard)"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-06-10
---

# Phase 101 Plan 03: Project Journal panel shell + Activity Feed tab Summary

**Status-gated Project Journal panel with 3 simultaneous real-time listeners, Activity Feed composer (optimistic post + escapeHTML-safe rendering), and shared _addActivityEntry write primitive for Plans 04/05**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-10
- **Completed:** 2026-06-10
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `orderBy`/`limit` to firebase.js import; added 10 journal module-scope vars including `_activeJournalTab` and `journalIssueFilter`
- Added `_addActivityEntry(projectId, {type, text, is_system})` — the shared write primitive that Plans 04/05 call for issue resolution and auto-entries
- Added `ensureJournalListeners()` attaching all 3 subcollection onSnapshot listeners simultaneously (activity_entries/progress_updates/issues) with `orderBy('created_at','desc'), limit(50)` — D-18 intentional improvement over per-tab attach
- Journal panel injected into `renderProjectDetail()` after `#projectDetailBottomRow`, hidden for pre-mobilization/Loss/inspection statuses (returns `''`), read-only for Completed
- Activity Feed composer (tag selector + textarea + Post button) with optimistic `journalActivityEntries.unshift()` before `await _addActivityEntry` — snapshot array-replace reconciles the `_optimistic` entry
- All 3 listeners torn down in `destroy()`; `window.switchJournalTab` and `window.postActivityEntry` registered and deleted symmetrically
- Progress/Issues panels render with `data-journal-placeholder` hooks for Plan 04

## Task Commits

1. **Task 1: Imports, module state, _addActivityEntry helper, and listener attach/teardown** - `bccc72d` (feat)
2. **Task 2: Panel builders, status gating, tab switching, and Activity Feed composer + CRUD** - `8102e30` (feat)

## Files Created/Modified

- `app/views/project-detail.js` — Added 272 lines: journal module vars, `_addActivityEntry`, `ensureJournalListeners`, `_buildJournalPanelHtml`, `_renderFeedEntry`, `_renderJournalPanelInPlace`, `switchJournalTab`, `postActivityEntry`; extended `attachWindowFunctions` and `destroy()`; injected panel into `renderProjectDetail()`

## Decisions Made

- **All 3 listeners attach simultaneously:** D-18 says "onSnapshot per active tab" but simultaneously attaching all 3 is strictly better — zero listener churn on tab switch, synchronous `switchJournalTab`, no flicker. Documented in plan `<notes>` as intentional deviation.
- **Optimistic array-replace accepted:** The `_optimistic` placeholder is replaced by the full snapshot array on next Firestore response. No de-dup logic needed. Brief `<1s` gap on slow networks is acceptable given typical sub-100ms Firestore propagation.
- **Default tab = Activity Feed:** Per Claude's Discretion in CONTEXT.md; most active tab is the natural landing.
- **escapeHTML on all user-supplied text in feed entries:** `entry.text` and `entry.created_by_name` both wrapped in `escapeHTML()` per CLAUDE.md pattern.

## Deviations from Plan

None — plan executed exactly as written. The D-18 simultaneous listener approach was already documented in the plan `<notes>` as an intentional improvement, not a deviation discovered during execution.

## Known Stubs

- `data-journal-placeholder="progress"` and `data-journal-placeholder="issues"` — intentional placeholders for Plan 04; both tabs render an empty div. Activity Feed is fully functional.

## Threat Flags

None. No new network endpoints or auth paths introduced. Firestore subcollections (`activity_entries`, `progress_updates`, `issues`) are already covered by rules deployed in Plan 02.

## Self-Check: PASSED

- `app/views/project-detail.js` exists and modified ✓
- `node --check app/views/project-detail.js` exits 0 ✓
- 30/30 acceptance criteria checks pass ✓
- Commit `bccc72d` exists (Task 1) ✓
- Commit `8102e30` exists (Task 2) ✓
- `_addActivityEntry` targets `collection(db, 'projects', projectId, 'activity_entries')` with `created_at: serverTimestamp()` ✓
- `ensureJournalListeners` uses `orderBy('created_at', 'desc')` and `limit(50)`, all 3 listeners ✓
- `journalActivityUnsub`, `journalProgressUnsub`, `journalIssuesUnsub` each assigned and `= null` in destroy() ✓
- `_activeJournalTab = 'activity'` and `journalIssueFilter = 'all'` in destroy() ✓
- `_buildJournalPanelHtml` returns `''` for hidden statuses ✓
- `project-journal-panel--readonly` class applied for Completed ✓
- `_buildJournalPanelHtml(currentProject)` injected in `renderProjectDetail()` ✓
- `escapeHTML(entry.text)` and `escapeHTML(entry.created_by_name)` present ✓
- `journalActivityEntries.unshift(` before `await _addActivityEntry` ✓
- `window.switchJournalTab` and `window.postActivityEntry` registered (1x each) and deleted (1x each) ✓
