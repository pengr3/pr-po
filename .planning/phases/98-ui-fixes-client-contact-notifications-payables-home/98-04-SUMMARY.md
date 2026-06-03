---
phase: 98-ui-fixes-client-contact-notifications-payables-home
plan: 04
subsystem: ui
tags: [home, hero, css, layout, responsive]

# Dependency graph
requires:
  - phase: 93-home-dept-tiles
    provides: .dept-cards 3+2 tile grid + .nav-card styling
provides:
  - Vertically compressed hero + nav-card + dept-card desktop sizing so all 5 tiles + hero title fit above the fold on >=1080px-tall viewports
affects: [home]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Above-the-fold fit via vertical compression only (no width/grid change)"]

key-files:
  created: []
  modified: [styles/hero.css]

key-decisions:
  - "Fit achieved by reducing padding/font/icon/gap (height fix), not width — biggest single saving is .hero-subtitle margin-bottom 4rem -> 1.5rem (D-15)"
  - "Preserved 3+2 grouping (repeat(3,1fr)/repeat(2,1fr)), max-width:1200px caps, bottom-row centering calc, and the 1024/768/480 media blocks (D-14/D-16)"
  - ".quick-stats (overview card, not a hero tile) and .navigation-cards legacy block left structurally untouched (only their preserved invariants matter)"

patterns-established:
  - "Compress desktop base values; existing smaller-breakpoint media overrides still cascade sensibly"

requirements-completed: []

# Metrics
duration: ~6min
completed: 2026-06-03
---

# Phase 98 Plan 04: Home Hero Fit Summary

**Vertically compressed the home hero header, nav-card, and dept-card grid (padding, font, icon, and gap reductions only) so all 5 department tiles plus the hero title fit above the fold on a wide monitor — with the 3+2 grouping, 1200px width caps, bottom-row centering, and all responsive breakpoints preserved.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-06-03
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `.hero-section` padding 4rem→2rem; `.hero-title` 3rem→2.25rem; `.hero-subtitle` 1.25rem→1.05rem + margin-bottom 4rem→1.5rem (largest vertical saving)
- `.nav-card` padding/icon/h3/p/btn all compressed; `.dept-cards` + `.dept-cards-row` gaps 2rem→1rem, dept-cards margin-bottom 2rem→1rem
- Preserved (verified): `repeat(3,1fr)`/`repeat(2,1fr)`, two+ `max-width:1200px`, `calc((100% - 4rem) * 2 / 3 + 2rem)`, and the 1024/768/480 `@media` blocks; `.quick-stats` untouched

## Task Commits

1. **Task 1 (vertical compression of hero + nav-card + dept-card grid)** — `fbc1ae2` (fix)

## Files Created/Modified
- `styles/hero.css` — desktop base sizing compressed; width/grid/responsive invariants preserved

## Decisions Made
See key-decisions frontmatter. Followed plan values exactly.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- Task 1 verify (preservation invariants AND compression-applied): PASS
- max-width:1200px declarations present (3); hero-title no longer 3rem; all 3 media blocks present; quick-stats grid unchanged
- Manual browser UAT (load `#/` on a ≥1080px-tall display; confirm all 5 tiles + hero title visible without scroll; bottom 2 not clipped) pending. Per plan, may fine-tune `.nav-card` padding / `.dept-cards` gap further within Claude's Discretion if still clipped on a specific display.

## Self-Check: PASSED
- `styles/hero.css` modified and present
- Commit `fbc1ae2` present in git log

## Next Phase Readiness
Independent slice. Browser UAT outstanding — viewport-height dependent; values tuned for ~1080px-tall.

---
*Phase: 98-ui-fixes-client-contact-notifications-payables-home*
*Completed: 2026-06-03*
