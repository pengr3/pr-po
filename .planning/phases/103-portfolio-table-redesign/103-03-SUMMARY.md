---
phase: 103-portfolio-table-redesign
plan: 03
subsystem: ui
tags: [projects, browse-all, stage-groups, collapse, localStorage]

requires:
  - phase: 103-02
    provides: "buildFeedRow, renderFinancial, getDlpState, filteredProjects, vmSwitch('browse') wiring, renderBrowseAll placeholder + seam"
  - phase: 103-01
    provides: ".stage-group/.stage-group-header/.stage-group-chevron/.stage-group-color/.stage-group-count/.stage-group-body CSS"
provides:
  - "projects.js Browse All grouped+collapsible renderer (completes the D+B hybrid)"
  - "STAGE_GROUPS map (6 groups, all 10 statuses)"
  - "Collapse persistence (getCollapseState/setCollapseState/toggleStageGroup) keyed to 'browse-collapse'"
affects: [103-04]

tech-stack:
  added: []
  patterns:
    - "Stage-grouped collapsible browse over the same filtered pool as the Feed"
    - "Per-group collapse persisted in localStorage; terminal groups default-collapsed"

key-files:
  created: []
  modified: [app/views/projects.js]

key-decisions:
  - "Browse rows reuse buildFeedRow verbatim (signal derived on demand) — identical to Feed rows"
  - "All 6 groups always rendered (browse skeleton); empty groups show .stage-group-empty"
  - "Rows sorted by project_code/name ascending; no pagination (D-03 / CONTEXT discretion)"

patterns-established:
  - "renderPortfolio() renders Feed + Browse together; vmSwitch('browse') re-renders Browse on demand"

requirements-completed: [SC-5, SC-6, SC-7, SC-9, D-02, D-03]

duration: 12min
completed: 2026-06-13
---

# Phase 103 Plan 03: projects.js Browse All Grouped Renderer Summary

**projects.js Browse All now renders six collapsible stage groups (On-going / Contracted & Mobilizing / Proposal Stage / For Inspection / Completed / Loss) over the same filtered+scoped pool as the Feed, with per-group collapse persisted and Completed+Loss collapsed by default — completing the D+B hybrid.**

## Performance
- **Duration:** ~12 min
- **Completed:** 2026-06-13
- **Tasks:** 2 auto (Task 3 = blocking browser-UAT checkpoint — pending)
- **Files modified:** 1 (app/views/projects.js)

## Accomplishments
- STAGE_GROUPS + collapse persistence + toggleStageGroup added; window fn symmetric
- Placeholder replaced with the real grouped renderer reusing buildFeedRow
- node --check + both task verify gates green; full projects.js consistency check passes

## Task Commits
1. **Task 1: STAGE_GROUPS + collapse helpers + toggleStageGroup** - `961a36f` (feat)
2. **Task 2: real renderBrowseAll grouped renderer** - `6f26ab5` (feat)

## Final projects.js symbol map (authoritative for Plan 04 to mirror into services.js)
- Constants: `URGENCY_THRESHOLDS`, `STAGE_GROUPS` (6 groups; **services adds a leading Draft group → 7**)
- Helpers: `normalizeUpdatedAt`, `getProjectSignal`, `getDefaultOkSignal`, `computeUrgencySignals`, `computeBillingPct`(→null), `renderFinancial`, `getDlpState`
- Renderers: `vmSwitch`, `renderPortfolio`, `renderPriorityFeed`, `buildFeedRow`, `renderBrowseAll`
- Collapse: `getCollapseState`/`setCollapseState`/`toggleStageGroup` keyed to `'browse-collapse'`
  → services uses **`'browse-collapse-services'`** (distinct key, D-04 isolation)
- localStorage view-mode key: `'projects-view-mode'` → services uses **`'services-view-mode'`**
- Window fns: `window.vmSwitch`, `window.toggleStageGroup` (register in attach, delete in destroy)
  → services prefixes: `window.vmSwitchService`, `window.toggleServiceStageGroup` (avoid collision)
- buildFeedRow detail link: `#/projects/detail/<code|id>` → services: `#/services/detail/<service_code>`

## Files Created/Modified
- `app/views/projects.js` - STAGE_GROUPS + collapse helpers + real renderBrowseAll; window symmetry extended

## Decisions Made
None beyond plan — followed D-03 mapping and buildFeedRow reuse exactly.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None. Visual confirmation is the blocking browser UAT (Task 3).

## Next Phase Readiness
- Plan 04 mirrors this + Plan 02 into services.js (adds a Draft group, service-specific localStorage keys, prefixed window fns, and renders within the one-time/recurring sub-tab pool).
- No new Firestore listener; no rules change.
- **Blocking browser-UAT checkpoint (Task 3) pending** — see 103-03-PLAN.md how-to-verify.

---
*Phase: 103-portfolio-table-redesign*
*Completed (code): 2026-06-13 — browser UAT pending*
