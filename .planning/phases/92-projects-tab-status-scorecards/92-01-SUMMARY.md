---
plan: 92-01
phase: 92-projects-tab-status-scorecards
status: complete
completed: 2026-05-18
commits:
  - 2676a86
  - 987080a
key-files:
  created:
    - styles/views.css (appended .project-scorecards CSS block)
  modified:
    - app/views/projects.js
---

# Plan 92-01 Summary: Status Scorecard Strip — Projects Tab

## What Was Built

Added a 6-column × 2-row scorecard strip to the Projects tab in `app/views/projects.js` and styled it in `styles/views.css`.

- **10 status cards** (one per entry in the updated `UNIFIED_STATUS_OPTIONS`) + **1 Total card** (spans 2 columns) rendered above the filter bar
- **Live counts** from `allProjects` — no new Firestore listener; counts refresh on every `onSnapshot` via `applyFilters() → renderScorecards()`
- **Click-to-filter**: clicking a card sets `activeStatusFilter`, highlights card (blue border + light blue bg), and filters the project table; clicking same card or Total clears filter
- **Click-outside clears filter**: `_scorecardClickOutside` document listener registered in `init()`, removed in `destroy()`

## Changes Made

### app/views/projects.js
- Added `let activeStatusFilter = null;` module-scope variable
- Removed `'Draft'` from `UNIFIED_STATUS_OPTIONS` → now exactly 10 entries in workflow order
- Added `renderScorecards()` function: tallies `allProjects` by status, updates DOM counts, applies active highlight via `data-status` attribute
- Added `handleScorecardClick(status)` function: toggles `activeStatusFilter`, calls `renderScorecards()` + `applyFilters()`
- Added `window.handleScorecardClick = handleScorecardClick` in `attachWindowFunctions()`
- Added `delete window.handleScorecardClick` in `destroy()`
- Deleted entire `#projectStatusFilter` `<select>` block from `render()` HTML
- Inserted scorecard strip HTML (`id="projectScorecards"`) above the filter-bar div in `render()`
- Updated `applyFilters()`: replaced `projectStatusFilter` DOM read with `activeStatusFilter` variable; added `renderScorecards()` call at end
- Deleted `rebuildStatusFilterOptions()` function entirely
- Deleted `rebuildStatusFilterOptions()` call from `renderProjectsTable()`
- Added `_scorecardClickOutside` click listener in `init()`; cleanup in `destroy()`

### styles/views.css
- Appended `.project-scorecards` CSS block: 6-col grid, 0.5rem gap, 1rem bottom margin
- `.project-scorecard-card`: white bg, 1px border, 6px radius, flex column, pointer cursor, transition
- `.project-scorecard-card:hover`: light blue tint
- `.project-scorecard-card--active`: blue border (#1a73e8) + light blue bg (#e8f0fe)
- `.project-scorecard-card--total`: `grid-column: span 2`
- `.scorecard-label`: 0.68rem, word-break: break-word (handles "Proposal for Internal Approval")
- `.scorecard-count`: 1.5rem bold
- `@media (max-width: 768px)`: reduced font sizes

## Deviations

None. All 12 changes applied exactly as specified in the plan.

## Self-Check: PASSED

- `'Draft'` not found in projects.js ✓
- `'projectStatusFilter'` not found in projects.js ✓
- `'rebuildStatusFilterOptions'` not found in projects.js ✓
- `renderScorecards` appears 4 times (function def + 2 calls in applyFilters/handleScorecardClick + call in _scorecardClickOutside body) ✓
- `handleScorecardClick` appears 5 times (function def + window reg + delete + onclick HTML × 2) ✓
- `_scorecardClickOutside` appears 5 times (assign + addEventListener + check-in-listener + removeEventListener + delete) ✓
- `projectScorecards` + `scorecard-count-total` appear 4 times ✓
- `UNIFIED_STATUS_OPTIONS` has 10 entries ✓
- views.css: all 8 required selectors present ✓
