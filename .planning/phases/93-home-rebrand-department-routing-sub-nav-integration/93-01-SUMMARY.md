---
phase: 93-home-rebrand-department-routing-sub-nav-integration
plan: 01
subsystem: ui
tags: [css, grid, responsive, hero, home-page]

requires: []
provides:
  - .dept-cards flex column wrapper for 5-tile departmental grid
  - .dept-cards-row base grid class
  - .dept-cards-row--top (repeat(3,1fr) desktop)
  - .dept-cards-row--bottom (repeat(2,1fr) centered on desktop via calc())
  - Responsive overrides inside existing ≤1024px and ≤768px media query blocks

affects:
  - 93-02 (home.js render() will reference .dept-cards-row--top/.dept-cards-row--bottom class names)

tech-stack:
  added: []
  patterns:
    - "dept-cards-row modifier pattern: .dept-cards-row + --top/--bottom modifiers for row-level grid control"
    - "Centering 2-tile row under 3-tile row via calc((100% - 2rem) * 2/3 + 2rem) max-width"

key-files:
  created: []
  modified:
    - styles/hero.css

key-decisions:
  - "Appended .dept-cards/.dept-cards-row blocks immediately after the existing Navigation Cards section (before Quick Stats) — preserves .navigation-cards as-is per plan (no regression risk)"
  - "Inserted dept-* responsive overrides inside the EXISTING @media ≤1024px and ≤768px blocks rather than adding new media query blocks — keeps breakpoint logic co-located"
  - ".dept-cards-row--bottom .nav-card:last-child override added at ≤1024px to center lone Finance tile (mirrors the existing .nav-card:last-child pattern for .navigation-cards)"
  - "At ≤768px: both row modifiers collapse to 1fr; last-child margin/max-width reset to 0/100% to remove desktop centering"

patterns-established:
  - "Row-modifier CSS pattern: outer .dept-cards wrapper (display:flex) + inner .dept-cards-row grids with --top/--bottom variant modifiers"

requirements-completed: []

duration: 2min
completed: 2026-05-25
---

# Phase 93 Plan 01: Department Tile Grid CSS Summary

**3+2 centered department tile grid CSS added to hero.css — .dept-cards wrapper + .dept-cards-row--top/--bottom with three-breakpoint responsive overrides, no existing rules modified**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-25T02:57:45Z
- **Completed:** 2026-05-25T02:58:49Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `.dept-cards` flex column wrapper (max-width: 1200px, gap: 2rem, margin-bottom: 2rem) at base level in hero.css
- Added `.dept-cards-row` base grid class and `.dept-cards-row--top` (3-column desktop) + `.dept-cards-row--bottom` (2-column centered via calc()) at base level
- Added responsive overrides inside existing `@media (max-width: 1024px)` block: top row becomes 2-column, bottom row full-width, last tile gets grid-column:1/-1 + 500px max-width centered
- Added responsive overrides inside existing `@media (max-width: 768px)` block: both rows collapse to 1fr, last-child centering removed
- Existing `.navigation-cards`, `.nav-card`, `.nav-card:hover`, `.hs-*` rules are untouched

## Task Commits

1. **Task 1: Add .dept-cards and .dept-cards-row CSS to hero.css** - `afa5028` (feat)

## Files Created/Modified

- `styles/hero.css` - Three new CSS blocks appended/inserted: base dept-cards rules (after Navigation Cards section), ≤1024px overrides (inside existing media block), ≤768px overrides (inside existing media block)

## Decisions Made

- Inserted Block 2 and Block 3 inside the **existing** `@media` blocks rather than adding separate media query declarations — keeps all breakpoint overrides co-located with the existing `.navigation-cards` responsive rules for readability and maintainability.
- `.dept-cards-row--bottom .nav-card:last-child` at ≤1024px mirrors the existing `.nav-card:last-child` pattern already in that block — consistent centering approach across both the old 3-card grid and the new bottom row.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — this plan is CSS-only with no data flow or rendered output.

## Threat Flags

None — CSS-only addition, no network endpoints or data surfaces introduced.

## Next Phase Readiness

- `.dept-cards`, `.dept-cards-row--top`, `.dept-cards-row--bottom` class names are now available for Plan 02 to reference in `home.js` render()
- Plan 02 can write the 5-tile HTML template using `.dept-cards > .dept-cards-row.dept-cards-row--top` (3 tiles) and `.dept-cards > .dept-cards-row.dept-cards-row--bottom` (2 tiles) without any CSS discovery needed
- No blockers

## Self-Check: PASSED

- `styles/hero.css` exists and contains the new rules (verified via grep)
- Commit `afa5028` exists in git log
- `.dept-cards` appears 10 times (requirement: ≥8) — PASS
- `.navigation-cards` appears 3 times (same count as before edit, unchanged) — PASS
- `.dept-cards-row--bottom` shows calc() centering at base level and max-width:100% at ≤1024px — PASS
- No file deletions in commit afa5028 — PASS

---
*Phase: 93-home-rebrand-department-routing-sub-nav-integration*
*Completed: 2026-05-25*
