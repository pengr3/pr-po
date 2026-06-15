---
phase: 100-project-detail-lifecycle-rebuild
plan: 03
subsystem: ui
tags: [vanilla-js, firestore, project-detail, lifecycle, gates, attach-zone]

requires:
  - phase: 100-02
    provides: toggleLifecycleAccordion, buildLifecycleTrack, renderLifecycleCard, lc-body placeholder

provides:
  - buildAttachZone(project, which, label, simFilename) — attach/remove doc zone for 4 doc types
  - buildPATrack(project) — post-approval mini-track (Client Approved → Completed)
  - buildDocRollup(project) — 4-slot doc summary shown in all expanded bodies
  - buildLifecycleBody(project, currentUser) — returns correct HTML for all 10 project_status values
  - buildLifecycleBodyInPlace(project, currentUser) — populates #lcBody + refreshes track + badge
  - 4 window functions: lcAttachLink, lcAttachFile, lcRemoveDoc, lcSwitchTab (optimistic local update)
  - LC_DOC_KEYS module constant mapping 4 doc types to prefix/L
  - toggleLifecycleAccordion updated to call buildLifecycleBodyInPlace on open

affects: [100-04]

tech-stack:
  added: []
  patterns:
    - Gate body: wrap(gateTitle, inner) inline helper inside buildLifecycleBody
    - Attach zone: 2-tab (link/file) UI with optimistic local update; Firestore write deferred to Plan 04
    - Window functions call buildLifecycleBodyInPlace for re-render after attach/remove

key-files:
  created: []
  modified:
    - app/views/project-detail.js

key-decisions:
  - "Attach functions do optimistic local update to currentProject + re-render; Firestore write wired in Plan 04"
  - "LC_DOC_KEYS declared at module scope for reuse across buildAttachZone, buildDocRollup, and window.lc* functions"
  - "Gate 4 isAdmin check disables Mark as Completed button for non-admins at UI level; server-side gate in Plan 04"
  - "buildLifecycleBodyInPlace updates track and badge alongside body for consistent state"
  - "Loss and default branches return informational panels — no new buttons needed"

patterns-established:
  - "Gate body structure: gate-label + gate content + buildDocRollup always at end"
  - "Disabled gate buttons show .action-note explaining what is needed to enable"
  - "Post-approval PA track shown in Gates 2, 3, 4 for orientation"

requirements-completed: [SC-3, SC-4, SC-5, SC-6, SC-7, SC-8, SC-9]

duration: ~20min
completed: 2026-06-08
---

# Phase 100-03: Lifecycle Gate Body Builder for All 10 Statuses

**buildLifecycleBody() handles all 10 project_status values with correct gate panels, attach zones, PA track, and doc rollup; 4 attach window functions update state optimistically**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-08
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- buildAttachZone() renders link-paste / file-simulate 2-tab UI; shows az-ok state when doc attached
- buildPATrack() renders 4-node post-approval track (Client Approved → Completed) with pa-done/pa-active/pa-future classes
- buildDocRollup() renders 4-slot doc summary with filled (file/link icon + Open ↗) and empty (—) states
- buildLifecycleBody() covers all 10 statuses: 4 gated panels (Gates 1-4) + 4 "built" info panels + Completed summary grid + Loss panel + default fallback
- buildLifecycleBodyInPlace() populates #lcBody, refreshes #lcTrack, calls updateLifecycleBadge
- 4 window functions (lcAttachLink, lcAttachFile, lcRemoveDoc, lcSwitchTab) registered + deleted symmetrically
- toggleLifecycleAccordion updated to call buildLifecycleBodyInPlace when _lcOpen becomes true

## Task Commits

1. **Task 1: Add buildAttachZone, buildPATrack, buildDocRollup + 4 window functions** - `8d7f783` (feat(100-03))
2. **Task 2: Add buildLifecycleBody and buildLifecycleBodyInPlace** - `8d7f783` (feat(100-03))

## Files Created/Modified
- `app/views/project-detail.js` — LC_DOC_KEYS, 3 helper functions, buildLifecycleBody (10 branches), buildLifecycleBodyInPlace, 4 window lc* functions

## Decisions Made
- Attach functions mutate currentProject optimistically then call buildLifecycleBodyInPlace — Firestore write wired in Plan 04
- Gate 4 isAdmin check at UI level disables button; server-side rule enforced by Plan 04's _canAdvanceProjectStatus
- All user-sourced fields (filenames, URLs, dates, project.id in onclick) wrapped in escapeHTML()
- Post-approval PA track shown in Gates 2, 3, 4 for spatial orientation during execution phase

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- All 10 status gate panels render correctly when accordion is opened
- Gate buttons reference Plan 04 window functions by name (lcAdvanceToForProposal, lcStartMobilization, lcStartProject, lcMarkProjectComplete) — these don't exist yet, which is correct
- Attach zone DOM IDs (az${L}Link, az${L}LinkP, az${L}FileP, az${L}TabL, az${L}TabF) match the selectors used in lcSwitchTab + lcAttachLink
- Ready for Plan 04 to wire Firestore writes and gate transitions

---
*Phase: 100-project-detail-lifecycle-rebuild*
*Completed: 2026-06-08*
