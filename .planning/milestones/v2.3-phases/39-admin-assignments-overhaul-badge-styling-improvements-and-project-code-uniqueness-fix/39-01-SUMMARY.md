---
phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix
plan: 01
subsystem: ui
tags: [firestore, css, badges, code-generation, Promise.all, utils]

# Dependency graph
requires:
  - phase: 27-code-generation
    provides: generateServiceCode() with Promise.all dual-collection pattern (template for this fix)
provides:
  - generateProjectCode() queries both projects AND services to prevent code collisions
  - getStatusClass() maps all procurement and finance statuses to CSS classes
  - CSS badge infrastructure (.status-badge.procuring, .status-badge.delivered, .badge-secondary)
affects:
  - 39-03 (badge sweep plan — consumes getStatusClass extensions and new CSS classes)
  - Any future code using generateProjectCode (collision-safe from this point forward)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-collection Promise.all pattern: generateProjectCode now mirrors generateServiceCode exactly"
    - "Extend statusMap not switch: getStatusClass uses a flat map object — add entries, don't branch"

key-files:
  created: []
  modified:
    - app/utils.js
    - styles/components.css

key-decisions:
  - "generateProjectCode queries both projects AND services via Promise.all (mirrors Phase 27 generateServiceCode pattern)"
  - "procured maps to 'approved' CSS class (green = complete states); no new .procured class needed"
  - "pending procurement maps to 'pending' (orange); no new .pending-procurement class needed"
  - "delivered gets its own .status-badge.delivered class (same green as approved but separate for specificity)"
  - "procuring gets its own .status-badge.procuring class (blue = in-progress visual distinction)"
  - "badge-secondary defined as neutral gray for finance.js undefined class usage"

patterns-established:
  - "Promise.all dual-collection: both generateProjectCode and generateServiceCode query projects+services — the shared CLMC_CLIENT_YYYY### sequence is now collision-safe from both directions"
  - "CSS class over inline style: all procurement status badges use .status-badge.{class} pattern, not inline styles"

requirements-completed:
  - CODE-01
  - BADGE-01
  - BADGE-03

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 39 Plan 01: Project Code Uniqueness Fix + Badge CSS Infrastructure Summary

**generateProjectCode() collision-safe via Promise.all dual-collection query; getStatusClass() extended with all procurement/finance statuses; new CSS badge classes for procuring (blue), delivered (green), and badge-secondary (gray)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-24T14:45:48Z
- **Completed:** 2026-02-24T14:47:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `generateProjectCode()` now queries both `projects` and `services` collections via `Promise.all`, preventing CLMC code collisions between projects and services (closes CODE-01 gap that existed since Phase 27 fixed the service side but not the project side)
- `getStatusClass()` extended with 10 new status mappings: pending procurement, procuring, procured, delivered, finance approved/rejected, pr/tr rejected, pr generated, po issued
- Added `.status-badge.procuring` (blue), `.status-badge.delivered` (green), `.badge-secondary` (neutral gray) to components.css as CSS infrastructure for Plan 03 badge sweep

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix generateProjectCode + extend getStatusClass** - `ff2a452` (fix)
2. **Task 2: Add badge CSS classes for procurement statuses** - `9aea677` (feat)

**Plan metadata:** `[see below]` (docs: complete plan)

## Files Created/Modified
- `app/utils.js` - generateProjectCode() dual-collection Promise.all query; getStatusClass() extended with 10 new status entries
- `styles/components.css` - Added .status-badge.procuring, .status-badge.delivered, .badge-secondary

## Decisions Made
- `procured` maps to `'approved'` CSS class (green = complete states per user decision) — no new `.procured` CSS class needed since the existing `.status-badge.approved` already provides correct green styling
- `pending procurement` maps to `'pending'` (orange) — existing `.status-badge.pending` provides correct orange styling
- `delivered` gets its own `.status-badge.delivered` class despite same green tones as approved — enables independent styling adjustments later without affecting Approved badges
- `badge-secondary` added as standalone class (not `.status-badge.secondary`) to match usage pattern in finance.js which uses `class="badge-secondary"` directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Badge CSS infrastructure ready for Plan 03 (badge sweep across procurement.js, finance.js, and other views)
- `getStatusClass()` now returns correct class for every procurement status string encountered in the codebase
- `generateProjectCode()` is collision-safe — no further action needed on code generation

---
*Phase: 39-admin-assignments-overhaul-badge-styling-improvements-and-project-code-uniqueness-fix*
*Completed: 2026-02-24*
