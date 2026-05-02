---
phase: 74-optimize-material-request-tab-for-mobile-use
plan: "03"
subsystem: ui
tags: [mobile, cards, css, responsive, mrf, my-requests, dropdown, 3-dot-menu]

# Dependency graph
requires:
  - phase: 74-01
    provides: mobile MRF items table card layout foundation in views.css
  - phase: 74-02
    provides: .mrf-item-card CSS block and mrf-form.js mobile item card pattern
provides:
  - ".mrf-req-card* CSS block with scoped dual-mode hide/show for My Requests table at <=768px"
  - "mapMRFToDisplayData(mrf) shared helper inside createMRFRecordsController — single source of truth for displayId/dateNeeded/mrfStatusHtml"
  - "buildMRFRequestCard(mrf, displayData) card builder accepting pre-computed display data"
  - "Single-pass Promise.all returning {rowHtml, cardHtml} pairs — no duplicate computation (REVIEWS [MEDIUM])"
  - "onMobileAction option on createMRFRecordsController — 3-dot dropdown wired to existing Edit/Cancel window handlers"
  - "Scroll-close handler on 3-dot dropdown — dropdown auto-closes on scroll, no floating-detached menu (REVIEWS [LOW])"
affects:
  - future-mobile-ui
  - mrf-records.js consumers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS dual-mode visibility: element visible by default, @media query swaps which layer shows — no JS viewport detection"
    - "Scoped table-hide via #myRequestsContainer .table-scroll-container — only My Requests table hidden on mobile, Procurement MRF Records tables unaffected"
    - "mapMRFToDisplayData single-computation pattern: compute per-MRF display strings once, pass to both row builder and card builder"
    - "Single-pass Promise.all: one map iteration per MRF returns {rowHtml, cardHtml} pair — avoids dual-pass anti-pattern"
    - "position:fixed dropdown with viewport-clamp positioning and scroll-close handler for touch-safe menus"

key-files:
  created: []
  modified:
    - styles/views.css
    - app/views/mrf-records.js
    - app/views/mrf-form.js

key-decisions:
  - "Card HTML generation lives in mrf-records.js (buildMRFRequestCard) per D-10 — not in the caller mrf-form.js"
  - "mapMRFToDisplayData declared inside createMRFRecordsController scope to close over _subDataCache and imported helpers — no new module-level state"
  - "Single-pass map: mapMRFToDisplayData called once per MRF, result destructured for both rowHtml and cardHtml — REVIEWS [MEDIUM] fix"
  - "Scroll-close handler stored on window._mrfMobileMenuScrollHandler and removed on first fire or menu teardown — REVIEWS [LOW] fix"
  - "closeMyRequestsMobileMenu() centralized as window function so menu-item onclicks and scroll handler share identical teardown logic"
  - "3-dot dropdown reuses window._myRequestsEditMRF and window._myRequestsCancelMRF — no new Edit/Cancel logic"
  - "position:fixed dropdown positioned below 3-dot button with right-edge viewport clamp (Math.max/Math.min) for narrow screens"

patterns-established:
  - "Dual-tree render: container.innerHTML emits both .table-scroll-container and .mrf-req-card-list simultaneously; CSS decides which is visible per viewport width"
  - "Controller option onMobileAction(event, mrfDocId, mrfStatus) mirrors onContextMenu for touch devices — both can coexist on same controller instance"

requirements-completed: [MRFMYREQ-01, MRFMYREQ-02, MRFMYREQ-03, MRFMYREQ-04]

# Metrics
duration: multi-session (Tasks 1-3 executed, Task 4 human UAT approved)
completed: 2026-04-20
---

# Phase 74 Plan 03: My Requests Mobile Card Layout Summary

**Mobile-optimized My Requests view: 8-column scrollable table replaced by compact MRF summary cards (<=768px) with 3-dot dropdown wired to existing Edit/Cancel handlers; mapMRFToDisplayData shared helper eliminates duplicate display-string computation across table and card renderers**

## Performance

- **Duration:** Multi-session (code committed across prior session; UAT approved 2026-04-20)
- **Started:** prior session
- **Completed:** 2026-04-20
- **Tasks:** 4 (3 auto + 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- Added `.mrf-req-card*` CSS block with `#myRequestsContainer .table-scroll-container` scoped hide rule — only the My Requests table is hidden on mobile; Procurement MRF Records tables are unaffected
- Introduced `mapMRFToDisplayData(mrf)` helper inside `createMRFRecordsController` that computes `{type, displayId, dateNeeded, mrfStatusHtml}` once per MRF and feeds both the desktop table row and the mobile card — REVIEWS [MEDIUM] fix; data parity guaranteed by construction
- Single-pass `Promise.all(pageItems.map(...))` returns `{rowHtml, cardHtml}` pairs; `container.innerHTML` emits both `.table-scroll-container` and `.mrf-req-card-list` in one write
- `onMobileAction` option added to `createMRFRecordsController`; `mrf-form.js` wires it to a position:fixed 3-dot dropdown with viewport clamp, scroll-close handler (REVIEWS [LOW]), and outside-click/touchstart dismissal — reuses existing `window._myRequestsEditMRF` / `window._myRequestsCancelMRF` handlers
- Human UAT approved: cards visible on mobile, 3-dot opens Edit/Cancel for Pending MRFs and "No actions available" otherwise, scroll auto-closes dropdown, desktop table + right-click unaffected, no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add .mrf-req-card CSS + dual-mode hide/show rules to views.css** - `376d177` (feat)
2. **Task 2: Add onMobileAction + mapMRFToDisplayData + buildMRFRequestCard to createMRFRecordsController** - `356b2e9` (feat)
3. **Task 3: Wire onMobileAction in mrf-form.js with 3-dot dropdown and scroll-close handler** - `cd049b0` (feat)
4. **Task 4: Human UAT — My Requests cards verified** - No code commit (human-verify checkpoint; approved by user 2026-04-20)

## Files Created/Modified

- `styles/views.css` — Appended `.mrf-req-card*` CSS block after `.mrf-item-card` block; desktop default hides `.mrf-req-card-list`; `@media (max-width: 768px)` hides `#myRequestsContainer .table-scroll-container` and shows card stack
- `app/views/mrf-records.js` — Added `onMobileAction = null` to controller options; added `mapMRFToDisplayData(mrf)` helper; added `buildMRFRequestCard(mrf, displayData)` helper; refactored row loop to single-pass `{rowHtml, cardHtml}` pairs; updated `container.innerHTML` to include `.mrf-req-card-list`; registered/destroyed `_mrfRecordsMobileAction_{containerId}` window function
- `app/views/mrf-form.js` — Added `onMobileAction` callback to `createMRFRecordsController` call in `initMyRequests`; defined `window.closeMyRequestsMobileMenu` for centralized teardown; added destroy() cleanup for mobile menu, scroll handler, and `closeMyRequestsMobileMenu`

## Decisions Made

- Card HTML lives in `mrf-records.js` (`buildMRFRequestCard`) per D-10 architecture decision — caller `mrf-form.js` provides only the action callback
- `mapMRFToDisplayData` is declared inside the controller closure so it automatically accesses `_subDataCache` and module-level helpers without new parameters or imports
- Single-pass map pattern (one `Promise.all` returning `{rowHtml, cardHtml}`) prevents the REVIEWS [MEDIUM] anti-pattern where two separate map passes could diverge if display formatting is updated in only one
- Dropdown uses `position:fixed` (not `position:absolute`) so it isn't clipped by `overflow:hidden` parents; right-edge clamped with `Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))`
- `closeMyRequestsMobileMenu` defined as a named `window` function so `onclick` strings in dropdown items can reference it without closure gymnastics

## Deviations from Plan

None — plan executed exactly as written. The Firebase permissions error noted during UAT (`auth.js:333` + `mrf-records.js:1189 'Missing or insufficient permissions'`) is a pre-existing issue unrelated to Phase 74-03 changes; not flagged as a gap.

## Issues Encountered

None during implementation. Human UAT (Task 4) passed on first review; user noted only a pre-existing Firebase permissions console error that predates this phase and is unrelated to the mobile card layout changes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 74-03 complete; all four MRFMYREQ requirements fulfilled
- Phase 74 can be closed if no further plans remain; otherwise subsequent plans can build on the established `onMobileAction` / `mapMRFToDisplayData` patterns
- The `createMRFRecordsController` API is backward-compatible — all existing callers (Procurement MRF Records) continue to work unchanged with no `onMobileAction` passed

---
*Phase: 74-optimize-material-request-tab-for-mobile-use*
*Completed: 2026-04-20*
