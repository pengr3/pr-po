---
phase: 31-dashboard-integration
plan: 01
subsystem: ui
tags: [firebase, firestore, firestore-rules, dashboard, role-based-access]

# Dependency graph
requires:
  - phase: 29-mrf-integration
    provides: department field on MRFs ('projects'/'services') used by stats filters
  - phase: 28-services-view
    provides: services collection with active field used by Active Services count
  - phase: 26-security-roles-foundation
    provides: services_admin/services_user roles used by getDashboardMode()

provides:
  - Role-aware dashboard stats: operations roles see 3 Projects stats, services roles see 2 Services stats, dual-dept roles see 5 stats in two labeled groups
  - getDashboardMode() helper returning 'projects' | 'services' | 'both'
  - Services collection Firestore Security Rules deployed (services block + isAssignedToService helper)
  - services_admin/services_user added to mrfs/prs/pos/transport_requests security rules

affects: home.js, firestore.rules, any future phase adding dashboard widgets

# Tech tracking
tech-stack:
  added: []
  patterns:
    - getDashboardMode() reads window.getCurrentUser().role and returns 'projects'/'services'/'both' — use this pattern for any future role-branched rendering

key-files:
  created: []
  modified:
    - app/views/home.js
    - styles/hero.css
    - firestore.rules

key-decisions:
  - "getDashboardMode() returns 'both' for super_admin/finance/procurement (cross-dept) and 'projects'/'services' for single-dept roles — unknown roles default to 'both'"
  - "Active MRFs for Projects mode uses (department || 'projects') === 'projects' client-side filter — legacy MRFs without department field count as Projects"
  - "Active Services count uses active !== false client-side filter — handles legacy docs without active field"
  - "In both-mode, two separate Pending MRFs listeners registered (one for projects count, one for services count) — single-responsibility, acceptable overhead at current scale"
  - "Label for single-dept roles is 'Active MRFs' (not prefixed with dept name)"
  - "services collection rules never deployed since Phase 26 — root cause of all permission-denied errors on services collection"
  - "services roles added to mrfs/prs/pos/transport_requests rules in same deploy — prevents services user permission errors when those roles are activated"

patterns-established:
  - "getDashboardMode() pattern: read role from getCurrentUser().role, return mode string — reuse for any role-branched rendering"
  - "Stat HTML helpers (projectsStatsHtml/servicesStatsHtml): module-level functions returning HTML string — reuse for incremental stat expansion"

requirements-completed:
  - DASH-01
  - DASH-02

# Metrics
duration: ~20min (execution) + 1 session gap
completed: 2026-02-19
---

# Phase 31-01: Dashboard Integration Summary

**Role-aware dashboard stats with getDashboardMode() branching: operations sees 3 Projects stats, services sees 2 Services stats, dual-dept sees both grouped with department labels**

## Performance

- **Duration:** ~20 min execution (split across sessions)
- **Completed:** 2026-02-19
- **Tasks:** 2 code tasks + 1 security rules hotfix
- **Files modified:** 3

## Accomplishments

- `getDashboardMode()` reads role and returns `'projects'`/`'services'`/`'both'` — single function determines all branching
- `loadStats(mode)` registers only the listeners needed for the role: Projects listeners (MRF/PR/PO), Services listeners (services collection + services MRFs), or both
- `render()` builds mode-appropriate HTML: single-dept shows flat stat items, both-mode wraps in `.stat-group` divs with department labels and a divider
- `hero.css` `.stat-group` / `.stat-group-items` / `.stat-group-label` / `.stat-group-divider` rules + `.quick-stats` widened to 1200px for 5-stat both-mode layout
- Deployed `services` collection Firestore Security Rules (missing since Phase 26) — fixed all permission-denied errors across home/services/MRF-form/procurement tabs

## Task Commits

1. **Task 1: Role-aware stats rendering in home.js** — `81b408b` (feat)
2. **Task 2: stat-group CSS in hero.css** — `8a78504` (feat)
3. **Hotfix: Deploy services rules + services roles in procurement collections** — `83c364a` (fix)

## Files Created/Modified

- `app/views/home.js` — Added `getDashboardMode()`, `projectsStatsHtml()`, `servicesStatsHtml()`, mode-branched `render()` and `loadStats(mode)`, services stats keys in state
- `styles/hero.css` — Added `.stat-group*` CSS rules, widened `.quick-stats` max-width to 1200px
- `firestore.rules` — Added `services` collection block, `isAssignedToService()` helper, services roles in mrfs/prs/pos/transport_requests — deployed to Firebase

## Decisions Made

- Two separate Pending MRFs listeners in `both` mode (one counts projects, one counts services) rather than one shared listener — keeps callbacks single-responsibility
- `(department || 'projects') === 'projects'` client-side filter for legacy-safe projects MRF count — avoids composite Firestore index requirement
- `active !== false` client-side filter for services count — handles legacy services docs without the field

## Deviations from Plan

### Auto-fixed Issues

**1. [Hotfix] Deployed missing Firestore Security Rules for services collection**
- **Found during:** Post-execution browser testing
- **Issue:** `services` collection rules added in Phase 26 locally but never deployed to Firebase — every read on `services` collection returned permission-denied for all roles including super_admin
- **Fix:** Updated firestore.rules to also add services_admin/services_user to mrfs/prs/pos/transport_requests rules (pre-fixing services user gaps), validated with Firebase MCP, deployed via `firebase deploy --only firestore:rules`
- **Files modified:** `firestore.rules`
- **Committed in:** `83c364a`

---

**Total deviations:** 1 auto-fixed (missing deployment)
**Impact on plan:** Essential fix — without it, entire Services department workflow was broken. No scope creep.

## Issues Encountered

None beyond the rules deployment gap.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 31 is the final phase of v2.3 Services Department Support milestone
- Dashboard now accurately reflects the two-department system
- All Firestore Security Rules deployed and correct for all 7 roles
- v2.3 milestone ready for audit and completion

---
*Phase: 31-dashboard-integration*
*Completed: 2026-02-19*
