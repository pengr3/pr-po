---
phase: 103-portfolio-table-redesign
plan: 02
subsystem: ui
tags: [projects, priority-feed, urgency, finance, dlp, view-mode-toggle, localStorage]

requires:
  - phase: 103-01
    provides: "shared .vm-toggle/.feed-section/.feed-row/.fin-*/.stage-group CSS classes"
  - phase: 102-dlp-retention-management
    provides: "getDlpState() + .portfolio-dlp-tag visuals (reused, not duplicated)"
provides:
  - "projects.js view-mode toggle (vmSwitch) + #pdb-feed/#pdb-browse containers"
  - "Shared computation layer: normalizeUpdatedAt, getProjectSignal, getDefaultOkSignal, computeUrgencySignals, computeBillingPct, renderFinancial"
  - "Priority Feed renderer (renderPriorityFeed) + shared buildFeedRow row builder"
  - "renderPortfolio dispatcher wired into applyFilters()"
  - "URGENCY_THRESHOLDS tunable constants (D-07)"
affects: [103-03, 103-04]

tech-stack:
  added: []
  patterns:
    - "Two display modes at one URL toggled by a toolbar button pair, persisted in localStorage"
    - "Shared row builder (buildFeedRow) used by both Feed and (Plan 03) Browse All"
    - "updated_at dual-shape normalization (Timestamp + ISO string) degrading to On Track"

key-files:
  created: []
  modified: [app/views/projects.js]

key-decisions:
  - "buildFeedRow derives the signal on demand (p.signal || getProjectSignal(p, Date.now())) so Plan 03 browse rows (no pre-attached signal) reuse it cleanly"
  - "Empty Needs Attention / Worth Watching sections are HIDDEN; On Track always shows (confirm-in-plan)"
  - "Feed is NOT paginated (CONTEXT discretion)"
  - "Full W-3 removal of flat-table + sort + pagination machinery (D-03 drops per-column sort)"

patterns-established:
  - "Phase 103 portfolio render architecture: applyFilters → renderPortfolio → renderPriorityFeed + renderBrowseAll → vmSwitch(persisted)"

requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-8, SC-9, D-04, D-05, D-06, D-07, D-08]

duration: 25min
completed: 2026-06-13
---

# Phase 103 Plan 02: projects.js Priority Feed + View-Mode Toggle Summary

**projects.js now renders the default Priority Feed (urgency-partitioned rows with stage-aware 4-state finance + reused Phase 102 DLP accents) behind a persisted [🔥 Priority Feed][≡ Browse All] toggle, with the entire flat-table/sort/pagination machinery removed.**

## Performance
- **Duration:** ~25 min
- **Completed:** 2026-06-13
- **Tasks:** 2 auto (Task 3 is the blocking browser-UAT checkpoint — pending)
- **Files modified:** 1 (app/views/projects.js)

## Accomplishments
- Added the shared computation layer + Feed renderer; replaced the flat table with the toggle + dual containers
- Removed all dead flat-table machinery atomically (W-3 discipline — no dangling call left behind)
- node --check passes; both task verify gates green

## Task Commits
1. **Task 1: urgency/finance helpers** - `3a05b92` (feat)
2. **Task 2: Priority Feed + toggle + flat-table removal** - `fd4374f` (feat)

## Symbol contract for Plan 03 (call these exact names — do NOT redeclare)
Module-scope helpers in app/views/projects.js (all function declarations, hoisted):
- `URGENCY_THRESHOLDS` — const object (PROPOSAL_STALE_DAYS 14, INSPECTION_OVERDUE_DAYS 30, ONGOING_QUIET_DAYS 7, REVISION_DAYS 5, MOBILIZATION_DAYS 3)
- `normalizeUpdatedAt(v)` → epoch-ms | null (handles Timestamp .toDate/.seconds, ISO string, millis)
- `getProjectSignal(p, now)` → `{ level:'urgent'|'watch'|'ok', text, hint }`
- `getDefaultOkSignal(p)` → string
- `computeUrgencySignals(projects)` → `{ urgent, watch, ok }` (each row is `{ ...p, signal }`)
- `computeBillingPct(project)` → **null** (no billed data without a listener — W-2)
- `renderFinancial(project)` → HTML string (4-state stage-aware finance cell)
- `getDlpState(project)` → 'active'|'in-dlp'|'expired'|'released' (Phase 102, reused)
- **`buildFeedRow(p)`** → HTML string for a `.feed-row` (REUSE THIS for browse rows; it derives the signal on demand via `p.signal || getProjectSignal(p, Date.now())`, so it works with un-tagged projects)
- `vmSwitch(mode)`, `renderPortfolio()`, `renderPriorityFeed()` — Plan-02-owned, do NOT alter
- `renderBrowseAll()` — **placeholder** to replace in Plan 03. Seam marker comment present:
  `// Plan 03: Browse All (stage-grouped collapsible) renderer goes here — replaces this placeholder.`
- Module state to reuse: `filteredProjects`, `clientsData`, `UNIFIED_STATUS_OPTIONS`, `escapeHTML`, `formatCurrency`
- Window registration: `window.vmSwitch` registered in attachWindowFunctions, deleted in destroy (add `window.toggleStageGroup` next to it in Plan 03)

## Files Created/Modified
- `app/views/projects.js` - helpers + toggle + Feed; flat-table/sort/pagination removed; orphaned `skeletonTableRows` import dropped

## Decisions Made
- buildFeedRow signal-on-demand fallback (see key-decisions) — makes Plan 03 reuse a one-liner per group
- Hide-when-empty for urgent/watch sections; always-show On Track

## Deviations from Plan
None of substance — plan executed as written. Two zero-risk tidy-ups during the W-3 removal: dropped the now-orphaned `skeletonTableRows` import (its only consumer was the deleted flat table) and reworded one dispatcher comment so it no longer contains the literal `renderProjectsTable` (the grep gate uses a naive substring match).

## Issues Encountered
None.

## ⚠ Known partial (W-2, CONTEXT-sanctioned — DO NOT re-flag as incomplete D-06)
The On-going **mini utilization bar ships EMPTY** (no fill, no paid-%). `collection_tranches`
records only `{label, percentage, is_retention}` — it does NOT record which tranches are billed,
and the portfolio is forbidden from loading billing_requests/collectibles (D-05: no new listener).
`computeBillingPct()` therefore returns `null` and `renderFinancial` shows the contract value +
`"{N} tranches defined"` with an empty mini-bar track. Full utilization-% is deferred to a future
billing-aware phase. This is the conscious sign-off item at the Plan 02 checkpoint.

## User Setup Required
None - no external service configuration. Visual confirmation is the blocking browser UAT (Task 3).

## Next Phase Readiness
- Plan 03 can replace the `renderBrowseAll` placeholder and reuse `buildFeedRow` + `renderFinancial` + `getDlpState` directly.
- No new Firestore listener added; no rules change.
- **Blocking browser-UAT checkpoint (Task 3) pending** — see 103-02-PLAN.md how-to-verify.

---
*Phase: 103-portfolio-table-redesign*
*Completed (code): 2026-06-13 — browser UAT pending*
