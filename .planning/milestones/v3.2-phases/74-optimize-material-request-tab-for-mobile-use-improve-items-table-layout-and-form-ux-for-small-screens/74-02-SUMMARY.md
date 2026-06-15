---
phase: 74-optimize-material-request-tab-for-mobile-use
plan: 02
subsystem: ui
tags: [css, mobile, card-layout, dual-mode, sync-handlers, mrf]

requires:
  - phase: 74-01
    provides: ".mrf-sub-nav pill bar in place; mrf-form.js module structure established"
provides:
  - "CSS dual-mode .mrf-item-card* block: hides .mrf-items-section table at <=768px, shows card stack"
  - "render() emits both itemsTableBody (desktop) and mrfItemCardList (mobile) simultaneously"
  - "addItem/removeItem keep both DOM trees in sync via data-item-index pairing"
  - "Scoped sync handlers (_mrfItemSyncHandler/_mrfItemSyncChangeHandler) on .mrf-items-section — no zombie handlers"
  - "buildItemCardHTML uses module-level UNIT_OPTIONS/CATEGORY_OPTIONS — no duplication"
  - "resetForm + post-submit reset clear both DOM trees"
affects: [74-03]

tech-stack:
  added: []
  patterns: [css-dual-mode, data-item-index-pairing, scoped-event-delegation, module-level-handler-refs]

key-files:
  created: []
  modified:
    - styles/views.css
    - app/views/mrf-form.js

key-decisions:
  - "Sync handlers attached to .mrf-items-section container (not document.body) — REVIEWS [HIGH] zombie handler fix"
  - "Module-level _mrfItemSyncHandler/_mrfItemSyncChangeHandler refs enable destroy() cleanup"
  - "buildItemCardHTML references module-level UNIT_OPTIONS/CATEGORY_OPTIONS — REVIEWS [MEDIUM] single source of truth"
  - "syncValue helper guards equality check before writing to prevent cursor-jump and loop risk — REVIEWS [LOW]"
  - "collectItems() unchanged — reads #itemsTableBody as source of truth for form submission"
  - "Card inputs NOT required (validation happens at desktop table level)"

patterns-established:
  - "CSS dual-mode: .mrf-items-section .table-scroll-container hidden at <=768px; .mrf-item-card-list shown"
  - "data-item-index pairing: each table row and card share same index for bidirectional sync"
  - "reindexItemRows(): called after add/remove/init to keep indices consistent"
  - "installItemSyncHandlers(): guarded by module-level null check; attaches to section container"

requirements-completed: [MRFITEMS-01, MRFITEMS-02, MRFITEMS-03, MRFITEMS-04]

duration: ~30min
completed: 2026-04-17
---

# Phase 74-02: MRF Items Table Mobile Card Layout Summary

**Replaced horizontal-scroll items table with CSS dual-mode card stack at ≤768px — addItem/removeItem keep both DOM trees in sync via data-item-index; scoped sync handlers prevent zombie listeners**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-04-17
- **Tasks:** 2 (+ checkpoint verified by user)
- **Files modified:** 2

## Accomplishments
- New `.mrf-item-card*` CSS block with dual-mode: desktop shows table, mobile shows card flex-column stack
- `render()` emits both `#itemsTableBody` (desktop) and `#mrfItemCardList` (mobile) simultaneously
- `addItem`/`removeItem` maintain paired DOM elements via `data-item-index`
- `installItemSyncHandlers()`: input/change delegation scoped to `.mrf-items-section`, not `document.body`
- `buildItemCardHTML()` references module-level `UNIT_OPTIONS`/`CATEGORY_OPTIONS` (no inline duplication)
- `syncValue()` helper guards equality before DOM write (prevents cursor-jump)
- Both `resetForm` and post-submit reset clear both table rows and card list
- Checkpoint human-verified and approved

## Task Commits

1. **Task 1: .mrf-item-card CSS dual-mode block** - `101035b` (feat)
2. **Task 2: Dual-mode HTML + addItem/removeItem + sync handlers** - `ca17c60` (feat)

## Files Created/Modified
- `styles/views.css` — New `.mrf-item-card*` block after `.mrf-sub-nav` block from 74-01
- `app/views/mrf-form.js` — `buildItemCardHTML`, `reindexItemRows`, `installItemSyncHandlers`, `syncValue` helpers; rewritten `addItem`/`removeItem`; `destroy()` cleanup; `resetForm` + post-submit dual-tree reset; `.mrf-items-section` outer wrapper class

## Decisions Made
- Scoped sync handlers to `.mrf-items-section` container (not `document.body`) per REVIEWS [HIGH]
- Used module-level `_mrfItemSyncHandler`/`_mrfItemSyncChangeHandler` refs for reliable `destroy()` cleanup
- `collectItems()` left completely unchanged — desktop table remains source of truth for submission

## Deviations from Plan
None — plan executed as specified. All REVIEWS feedback items addressed as planned.

## Issues Encountered
None

## Next Phase Readiness
- Wave 3 (74-03) can now proceed: `.mrf-items-section` wrapper in place, `#myRequestsContainer` is a separate container so CSS scoping for 74-03 won't interfere
- `mrf-records.js` `createMRFRecordsController` unchanged — wave 3 adds `onMobileAction` option

---
*Phase: 74-optimize-material-request-tab-for-mobile-use*
*Completed: 2026-04-17*
