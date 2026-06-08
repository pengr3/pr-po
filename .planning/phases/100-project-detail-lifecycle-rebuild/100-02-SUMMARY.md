---
phase: 100-project-detail-lifecycle-rebuild
plan: 02
subsystem: ui
tags: [vanilla-js, firestore, project-detail, lifecycle, accordion]

requires:
  - phase: 100-01
    provides: Lifecycle accordion CSS block in views.css

provides:
  - LC_STAGES constant (8-stage lifecycle definition) at module scope
  - _lcOpen accordion open/close state
  - buildLifecycleTrack(project) — renders 8-node track with correct classes per status
  - renderLifecycleCard(project, currentUser) — full accordion shell HTML
  - updateLifecycleBadge(project) — live badge/header updates
  - toggleLifecycleAccordion() — toggle open state, registered on window
  - Status dropdown removed from renderProjectDetail() — replaced with read-only hdrStatusBadge
  - Lifecycle card injected above the 2-col info/financial grid

affects: [100-03, 100-04]

tech-stack:
  added: []
  patterns:
    - Module-level _lcOpen state for accordion toggle
    - LC_STAGES constant (not STAGES) to avoid future import collision
    - Reuse _getProjectStatusColor() — no duplicate STATUS_COLOR map

key-files:
  created: []
  modified:
    - app/views/project-detail.js

key-decisions:
  - "Named constant LC_STAGES (not STAGES) to avoid collision with any future import"
  - "Reused _getProjectStatusColor() helper instead of adding a new STATUS_COLOR map"
  - "lc-body left empty as placeholder — Plan 03 fills gate body content"
  - "Status dropdown IIFE removed from renderProjectDetail(); replaced with read-only hdrStatusBadge span"
  - "toggleLifecycleAccordion defers body build to Plan 03's buildLifecycleBodyInPlace"

patterns-established:
  - "Lifecycle window functions: registered in attachWindowFunctions(), deleted in destroy() symmetrically"
  - "Loss status: curIdx = 4 (Client Approved node shown as s-loss) + red badge appended after track"
  - "For Revision maps to index of Proposal Under Client Review in LC_STAGES"

requirements-completed: [SC-1, SC-2, SC-9]

duration: ~15min
completed: 2026-06-08
---

# Phase 100-02: Lifecycle Accordion Shell and Track Renderer

**Accordion shell with 8-stage track renderer, status badge, and header chrome added to project-detail.js; status dropdown removed**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-06-08
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- LC_STAGES constant (8 stages) and _lcOpen state added at module scope
- buildLifecycleTrack() renders correct node classes for all 10 project statuses including Loss and For Revision edge cases
- renderLifecycleCard() returns full accordion HTML with header badge, track wrap, and empty body placeholder
- Status dropdown removed from renderProjectDetail(); replaced with read-only `<span id="hdrStatusBadge">` 
- toggleLifecycleAccordion() wired to window, deleted in destroy() with _lcOpen reset

## Task Commits

1. **Task 1: Add STAGES constant and module-level _lcOpen state** - `93946a8` (feat(100-02))
2. **Task 2: Add buildLifecycleTrack, renderLifecycleCard, updateLifecycleBadge, toggleLifecycleAccordion** - `93946a8` (feat(100-02))

## Files Created/Modified
- `app/views/project-detail.js` — LC_STAGES, _lcOpen, 4 lifecycle functions, status dropdown removal, accordion injection above 2-col grid

## Decisions Made
- LC_STAGES named to avoid collision with any future import of a "STAGES" export
- _getProjectStatusColor() reused for badge styling — no duplicate color map
- lc-body left as empty comment placeholder — Plan 03 fills gate body content

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- Accordion shell and track render correctly for all 10 statuses
- lc-body empty placeholder ready for Plan 03's buildLifecycleBody() to fill
- toggleLifecycleAccordion ready to call buildLifecycleBodyInPlace() once Plan 03 adds it

---
*Phase: 100-project-detail-lifecycle-rebuild*
*Completed: 2026-06-08*
