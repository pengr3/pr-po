---
phase: 74-optimize-material-request-tab-for-mobile-use
plan: 01
subsystem: ui
tags: [css, mobile, sticky-nav, scroll-hide, mrf]

requires: []
provides:
  - ".mrf-sub-nav pill bar with scroll-hide/show sticky behavior in Material Request view"
  - "Module-level _mrfNavScrollHandler bound once in init(), cleaned in destroy()"
affects: [74-02, 74-03]

tech-stack:
  added: []
  patterns: [sticky-pill-nav, scroll-hide-show, module-level-scroll-handler-guard]

key-files:
  created: []
  modified:
    - app/views/mrf-form.js
    - styles/views.css

key-decisions:
  - "Mirrors Phase 73.3 Finance pill bar pattern exactly with mrf- prefix"
  - "top: 64px on sub-nav so it sticks below the main top-nav (not behind it)"
  - "Direction-based scroll detection (delta > 0 = down, delta < 0 = up) fixes edge cases with momentum scrolling"
  - "_mrfNavScrollHandler always updates lastScrollY to fix scroll-up show logic"

patterns-established:
  - "Pill nav pattern: .mrf-sub-nav > .mrf-sub-nav-inner > .mrf-sub-nav-tabs > .mrf-sub-nav-tab(--active)"
  - "Scroll guard: if (!_mrfNavScrollHandler) { ... window.addEventListener } in init(); removeEventListener in destroy()"

requirements-completed: [MRFNAV-01, MRFNAV-02, MRFNAV-03]

duration: ~25min
completed: 2026-04-17
---

# Phase 74-01: MRF Sub-Nav Pill Bar Summary

**Replaced generic .tab-btn sub-tab nav in Material Request view with sticky pill bar matching Finance Phase 73.3 pattern — scroll-hide on down, scroll-show on up, sticks at 64px below top-nav**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 2 (+ post-commit scroll fixes)
- **Files modified:** 2

## Accomplishments
- Added `.mrf-sub-nav*` CSS block to views.css (mirror of `.finance-sub-nav*` with mrf- prefix)
- Replaced `.tab-btn` / `.tabs-nav` nav in `renderSubTabNav()` with `<nav class="mrf-sub-nav" id="mrfSubNav">`
- Module-level `_mrfNavScrollHandler` bound once in `init()`, removed in `destroy()`
- Post-merge fixes: corrected sub-nav `top` to `64px` (sticks below top-nav); fixed direction-based delta detection; fixed lastScrollY always-update to repair scroll-up reveal

## Task Commits

1. **Task 1: .mrf-sub-nav CSS** - `0daf107` (feat)
2. **Task 2: renderSubTabNav + scroll handler** - `c42b081` (feat)
3. **Post-commit fix: direction-based scroll** - `6475f59` (fix)
4. **Post-commit fix: lastScrollY update** - `29089c8` (fix)
5. **Post-commit fix: sub-nav top 64px** - `bbe7203` (fix)

## Files Created/Modified
- `styles/views.css` — New `.mrf-sub-nav` block added after Finance pill bar rules
- `app/views/mrf-form.js` — `renderSubTabNav()` now returns pill bar HTML; `init()` binds scroll handler with guard; `destroy()` removes it

## Decisions Made
- Used `top: 64px` (not `top: 0`) so pill nav sticks below main nav bar, not behind it
- Applied same direction-delta logic as Finance scroll handler (delta < 5 = jitter ignored; currentY < 80 = always show)

## Deviations from Plan
None significant — post-commit scroll behavior fixes were discovered via manual UAT and corrected in follow-up commits.

## Issues Encountered
- Initial `top: 0` caused pill bar to render behind the fixed main nav — fixed to `64px`
- Scroll-up reveal didn't work until lastScrollY was updated unconditionally at end of handler

## Next Phase Readiness
- Wave 2 (74-02) can proceed: `.mrf-sub-nav` is in place; items table dual-mode cards are independent of nav
- Wave 3 (74-03) depends on both 74-01 and 74-02

---
*Phase: 74-optimize-material-request-tab-for-mobile-use*
*Completed: 2026-04-17*
