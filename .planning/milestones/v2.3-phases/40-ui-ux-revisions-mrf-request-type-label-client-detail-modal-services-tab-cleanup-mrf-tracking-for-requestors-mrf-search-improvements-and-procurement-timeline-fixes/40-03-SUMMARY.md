---
phase: 40-ui-ux-revisions
plan: 03
subsystem: ui
tags: [procurement, timeline, firestore-timestamp, css]

# Dependency graph
requires:
  - phase: 38-refactoring-and-shared-modules
    provides: getMRFLabel, getDeptBadgeHTML in components.js
  - phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix
    provides: getStatusClass with procuring/delivered CSS class mappings
provides:
  - showProcurementTimeline with PR->PO grouped nesting and procurement status badges
  - formatTimestamp used consistently for all Firestore date fields in procurement.js
  - CSS for .timeline-item.active/.pending/.rejected and .timeline-child-item suite
affects: [procurement timeline, PO tracking table, viewPOTimeline alert]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Build custom nested timeline HTML directly (posByPR map) instead of flat createTimeline() component when nesting is required"
    - "formatTimestamp() preferred over new Date() / formatDate() for any Firestore Timestamp field"

key-files:
  created: []
  modified:
    - app/views/procurement.js
    - styles/views.css

key-decisions:
  - "posByPR map groups POs by pr_id with '_unlinked' sentinel for orphan POs — avoids null-key collisions"
  - "createTimeline() import retained but not called in showProcurementTimeline — custom HTML needed for nesting"
  - "Timeline CSS added to views.css (not components.css) — kept adjacent to existing .timeline-item rules already there"
  - "date_needed uses formatDate() (plain string); date_issued/date_generated/date_submitted/created_at use formatTimestamp() (Firestore Timestamp)"

patterns-established:
  - "PR->PO parent-child nesting: .timeline-children container with .timeline-child-item entries, dot via ::before pseudo-element"
  - "Status badge per PO in timeline: getStatusClass(po.procurement_status) drives status-badge class"

requirements-completed:
  - UX-05

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 40 Plan 03: Procurement Timeline Fixes Summary

**Procurement timeline rewritten with PR->PO grouped nesting, Invalid Date bug fixed via formatTimestamp(), all emojis removed, and CSS added for rejected/pending/active status dot states.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T12:56:35Z
- **Completed:** 2026-02-25T12:59:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed all emoji prefixes (📝🛒🚚📄📅) from timeline titles and the "Timeline" button in MRF Records
- Fixed the Invalid Date bug on PO entries by replacing `new Date(po.date_issued).toLocaleDateString()` and `formatDate()` with `formatTimestamp()` at all Firestore Timestamp call sites across procurement.js
- Rewrote `showProcurementTimeline()` to group PRs with their child POs using a `posByPR` map, rendering nested `.timeline-children` blocks instead of a flat list
- Each PO child item now shows its current `procurement_status` as a styled badge via `getStatusClass()`
- TRs rendered as standalone items; orphan POs (no pr_id) rendered as standalone fallback items
- Added CSS for `.timeline-item.active`, `.timeline-item.pending`, `.timeline-item.rejected` and the full `.timeline-child-item` suite with colored dot states

## Task Commits

1. **Task 1 + Task 2: Fix timeline date handling, remove emojis, rewrite with PR->PO grouping** - `4d69724` (feat)

## Files Created/Modified

- `app/views/procurement.js` - formatTimestamp() at all Firestore date sites; showProcurementTimeline() rewritten with posByPR grouping; emojis removed; procurement status badge per PO child
- `styles/views.css` - Added .timeline-item.active/.pending/.rejected and .timeline-child-item suite CSS

## Decisions Made

- `posByPR` uses `'_unlinked'` sentinel key for POs where `po.pr_id` is absent/null — avoids null-key collisions when looking up child POs
- `createTimeline()` import is retained but not called in the rewritten function — the flat component cannot support nesting
- Timeline CSS additions placed in `views.css` (not `components.css`) to keep them adjacent to the existing `.timeline-item` rules already defined there
- `date_needed` field uses `formatDate()` (stored as plain date string); all Firestore Timestamp fields (`date_issued`, `date_generated`, `date_submitted`, `created_at`) use `formatTimestamp()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed additional formatDate(po.date_issued) call in PO history table (~line 495)**
- **Found during:** Task 1 review
- **Issue:** A PO display table used `formatDate(po.date_issued)` which would produce Invalid Date for Firestore Timestamps
- **Fix:** Replaced with `formatTimestamp(po.date_issued) || 'N/A'`
- **Files modified:** app/views/procurement.js
- **Verification:** No remaining formatDate() calls on date_issued fields
- **Committed in:** 4d69724

**2. [Rule 2 - Missing Critical] Fixed date fallback in MRF Records table (~line 2693)**
- **Found during:** Task 1 review
- **Issue:** `new Date(mrf.date_needed || mrf.date_submitted || mrf.created_at).toLocaleDateString()` would produce Invalid Date when fallback was a Firestore Timestamp
- **Fix:** Replaced with `mrf.date_needed ? formatDate(mrf.date_needed) : (formatTimestamp(mrf.date_submitted || mrf.created_at) || 'N/A')`
- **Files modified:** app/views/procurement.js
- **Verification:** Plain date string path uses formatDate; Timestamp path uses formatTimestamp
- **Committed in:** 4d69724

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical date fix coverage at adjacent call sites)
**Impact on plan:** Both fixes necessary for complete Invalid Date elimination. Same task scope, same commit. No scope creep.

## Issues Encountered

None - plan executed cleanly. The existing `formatTimestamp` import was already present in the procurement.js import line.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Procurement timeline now shows PR->PO hierarchy with status badges and valid dates
- All remaining procurement timeline plans (40-04, 40-05, etc.) can build on the clean timeline foundation
- No blockers

---
*Phase: 40-ui-ux-revisions*
*Completed: 2026-02-25*
