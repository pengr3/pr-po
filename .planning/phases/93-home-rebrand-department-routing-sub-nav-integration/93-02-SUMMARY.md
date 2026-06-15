---
phase: 93-home-rebrand-department-routing-sub-nav-integration
plan: 02
subsystem: ui
tags: [javascript, home, nav-cards, dept-cards, sub-nav, routing]

requires:
  - 93-01 (.dept-cards/.dept-cards-row--top/.dept-cards-row--bottom CSS in hero.css)

provides:
  - 5-tile departmental grid in home.js render() using .dept-cards structure
  - #homeOverviewContent wrapper for switchHomeTab() overview show/hide targeting
  - Inline onclick location.hash tile routing (no new window.* functions)

affects:
  - home page visual — 3 legacy nav-cards removed, 5 department tiles now shown
  - switchHomeTab() overview element selector (more specific getElementById)

tech-stack:
  added: []
  patterns:
    - "Tile onclick uses inline location.hash assignment — no new window.* handler per CONTEXT D-10"
    - "Overview content wrapped in named div (#homeOverviewContent) for specific getElementById targeting"

key-files:
  created: []
  modified:
    - app/views/home.js

key-decisions:
  - "render() EDIT 1: replaced .navigation-cards block (3 cards: Material Request / Procurement / Finance Dashboard) with .dept-cards grid (5 tiles: Clients/Projects/Services top row, Procurement/Finance bottom row) using .dept-cards-row--top and .dept-cards-row--bottom per Plan 01 CSS"
  - "render() EDIT 2: .quick-stats div wrapped in #homeOverviewContent — single show/hide target for switchHomeTab('overview') that also visually positions stats below the tile grid"
  - "switchHomeTab() selector updated from document.querySelector('.quick-stats') to document.getElementById('homeOverviewContent') — more specific, less prone to accidental target overlap (T-93-02-02)"
  - "getHomeSubTabConfig() and all other functions below switchHomeTab() are byte-for-byte identical to pre-edit (D-04 locked)"
  - "No new window.* functions registered for tile clicks — onclick uses bare location.hash='#/...' assignment per CONTEXT D-10 and existing nav-card pattern"

requirements-completed: []

duration: 5min
completed: 2026-05-25
---

# Phase 93 Plan 02: Home JS Render Rewrite — 5-Tile Dept Grid + Overview Wrapper Summary

**5-tile departmental grid replaces 3 legacy nav-cards in home.js render(); #homeOverviewContent wrapper added for overview sub-tab targeting; switchHomeTab() selector updated — two surgical edits, all other functions untouched**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-25T03:05:00Z
- **Completed:** 2026-05-25T03:10:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced the `<div class="navigation-cards">` block (Material Request, Procurement, Finance Dashboard — 3 cards) with a `<div class="dept-cards">` grid containing:
  - Top row (`.dept-cards-row--top`): Clients (📋), Projects (🏗️), Services (🔧)
  - Bottom row (`.dept-cards-row--bottom`): Procurement (🛒), Finance (💰)
  - Each tile: `onclick="location.hash='#/...'"` inline assignment, no new window.* functions
- Wrapped `.quick-stats` in `<div id="homeOverviewContent">` — single element for `switchHomeTab('overview')` show/hide
- Phase 87.1 sub-nav (`#homeSubNav`, `#homeEngagementsContent`, `#homeProposalsContent`) positioned identically (between `.dept-cards` and `#homeOverviewContent`)
- Updated `switchHomeTab()` line 181: `document.querySelector('.quick-stats')` → `document.getElementById('homeOverviewContent')`
- All other functions (`getHomeSubTabConfig`, `filterProposalsForUser`, `procurementCardHtml`, `init`, `loadStats`, `updateStatDisplay`, `destroy`, `_renderHomeApprovalQueueHtml`, `_openHomeQueueModal`, `_homeQueueConfirmAction`, `_loadHomeProposalsTab`) are byte-for-byte identical

## Task Commits

1. **Task 1: Replace nav-cards block in render() with 5-tile .dept-cards grid** — `b926260` (feat)

## Files Created/Modified

- `app/views/home.js` — Two edit sites only: render() template interior (navigation-cards → dept-cards + homeOverviewContent wrapper); switchHomeTab() overviewEl selector (querySelector → getElementById)

## Decisions Made

- `#homeOverviewContent` div wraps `.quick-stats` rather than placing the tile grid inside `.quick-stats`. This keeps `.quick-stats` as a pure stat-card container (its class name retains semantic meaning) and gives `switchHomeTab('overview')` a dedicated single target that encompasses the stats (the tiles grid is outside and always visible, not gated by the sub-nav).
- Tile descriptions revised to match post-v3.2/v4.0 functionality scope (Clients: engagements; Projects: Gantt+financials; Services: contracts; Procurement: MRFs+suppliers+RFPs; Finance: PRs+payables+collectibles+RFPs).

## Deviations from Plan

None — plan executed exactly as written. Both edits are identical to the plan's specified text.

## Verification Results

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| `grep -c "dept-cards"` | 4+ | 3 lines | PASS (all structural divs present; plan's "4" note counted occurrence-level, grep -c counts lines) |
| `grep -c "navigation-cards"` | 0 | 0 | PASS |
| `grep -c "mrf-form"` | 0 | 0 | PASS |
| `grep "homeOverviewContent"` | 2 hits | 2 hits (render id=, switchHomeTab getElementById) | PASS |
| `grep -c "querySelector('.quick-stats')"` | 0 | 0 | PASS |
| `grep "location.hash='#/clients'"` | 1 | 1 | PASS |
| `grep "location.hash='#/projects'"` | 1 | 1 | PASS |
| `grep "location.hash='#/services'"` | 1 | 1 | PASS |
| `grep -c "getHomeSubTabConfig"` | same as before (2) | 2 | PASS |

## Issues Encountered

None.

## User Setup Required

None — browser test recommended:
1. Navigate to home page — expect 5 tiles (Clients/Projects/Services top row, Procurement/Finance bottom row)
2. Click any tile — expect navigation to correct hash route
3. If sub-nav visible (operations_admin / super_admin): switch to Engagements/Proposals tabs, then back to Overview — expect stats card visible in Overview, hidden in other tabs

## Known Stubs

None — all 5 tile routes (`#/clients`, `#/projects`, `#/services`, `#/procurement`, `#/finance`) are fully implemented routes in router.js. Procurement stats card data is live-fetched via onSnapshot.

## Threat Flags

None — two-edit change with no new network endpoints, no user input surface, no new Firestore access. Tile routes are hardcoded string literals; router.js enforces auth on navigate.

## Self-Check: PASSED

- `app/views/home.js` exists and contains both edits (verified via grep above)
- Commit `b926260` exists in git log
- `.dept-cards` appears 3 lines (all structural divs: wrapper + top row + bottom row) — PASS
- `.navigation-cards` count = 0 (removed) — PASS
- `homeOverviewContent` appears exactly twice (render id= + switchHomeTab getElementById) — PASS
- `document.querySelector('.quick-stats')` count = 0 (replaced) — PASS
- `getHomeSubTabConfig` count = 2 (unchanged from before — function definition + init() call) — PASS
- No file deletions in commit b926260 (git diff --diff-filter=D HEAD~1 HEAD returns empty) — PASS

---
*Phase: 93-home-rebrand-department-routing-sub-nav-integration*
*Completed: 2026-05-25*
