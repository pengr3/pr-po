---
phase: quick-260615-nzy
plan: 01
subsystem: projects-view, services-view
tags: [legacy-status, priority-feed, browse-all, portfolio]
dependency_graph:
  requires: []
  provides: [LEGACY-FEED, LEGACY-BROWSE]
  affects: [app/views/projects.js, app/views/services.js]
tech_stack:
  added: []
  patterns: [isLegacyStatus predicate, predicate-based group membership]
key_files:
  created: []
  modified:
    - app/views/projects.js
    - app/views/services.js
decisions:
  - "isLegacyStatus returns false for empty/null status so blank-status rows are never pulled into Legacy"
  - "Legacy Browse group uses #6b7280 (mid-grey), distinct from inspection group #94a3b8"
  - "Legacy Browse group is default-collapsed (same as completed/loss terminal groups)"
  - "Legacy Feed section has hideWhenEmpty:true so it does not appear in clean portfolios"
  - "LEGACY_GROUP has no statuses[] — predicate-based filter special-cased in renderBrowseAll map"
  - "SERVICE_LEGACY_GROUP mirrors LEGACY_GROUP; Draft remains canonical in services, is NOT legacy"
  - "No CSS added — tier-legacy class has no dedicated rule; rows still render via shared feed-row classes"
  - "Scorecards untouched — known accepted gap: legacy excluded from per-stage cells, still counted in Total"
metrics:
  duration: ~10min
  completed_date: 2026-06-15
---

# Quick 260615-nzy: Add Legacy Group to Priority Feed and Browse All — Summary

**One-liner:** `isLegacyStatus` predicate surfaces non-empty unmapped project_status values into a dedicated Legacy section in the Priority Feed and a default-collapsed Legacy / Unmapped group in Browse All, in both projects.js and services.js.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Legacy group to projects.js Feed + Browse All | `e80fe99` | app/views/projects.js |
| 2 | Mirror Legacy group into services.js | `59163ef` | app/views/services.js |

## What Was Built

### Task 1 — projects.js

**Predicate (near L47):**
```js
const isLegacyStatus = (s) => !!s && !UNIFIED_STATUS_OPTIONS.includes(s);
```

**getCollapseState** — `key === 'legacy'` added to the default-collapsed set alongside `completed` and `loss`.

**renderPriorityFeed** — `ok` partitioned into `okClean` + `legacy` immediately after destructuring from `computeUrgencySignals`. The `sections` array grows a 4th entry `{ tier: 'legacy', label: 'Legacy', icon: '🗂️', rows: legacy, hideWhenEmpty: true }` appended after On Track.

**renderBrowseAll** — `LEGACY_GROUP = { key: 'legacy', label: 'Legacy / Unmapped', color: '#6b7280' }` declared as a module-level constant. The map now iterates `[...STAGE_GROUPS, LEGACY_GROUP]` and special-cases `group.key === 'legacy'` to use `filteredProjects.filter(p => isLegacyStatus(p.project_status))` instead of `group.statuses.includes(...)`.

### Task 2 — services.js (mirror)

Exact same 4-point change applied:
- `isLegacyStatus` predicate added after `SCORECARD_STATUS_OPTIONS` (services' UNIFIED_STATUS_OPTIONS includes 'Draft' so Draft is canonical, not legacy)
- `getServiceCollapseState` default-collapse includes `key === 'legacy'`
- `renderServiceFeed` partitions `ok` → `okClean` + `legacy`; appends Legacy section after On Track
- `renderServiceBrowseAll` iterates `[...SERVICE_STAGE_GROUPS, SERVICE_LEGACY_GROUP]` with predicate-based legacy filter; localStorage key stays `'browse-collapse-services'` (isolated from projects)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data flows through the existing `filteredProjects` / `filteredServices` pools and the live `buildFeedRow` / `buildServiceRow` row builders.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- `app/views/projects.js` — `node --check` exits 0; `isLegacyStatus` defined at L49; `LEGACY_GROUP` at L1197; `getCollapseState` includes `key === 'legacy'`; `renderPriorityFeed` partitions `okClean`/`legacy`; `renderBrowseAll` uses spread + special-case predicate.
- `app/views/services.js` — `node --check` exits 0; `isLegacyStatus` at L57; `SERVICE_LEGACY_GROUP`; `getServiceCollapseState` includes `key === 'legacy'`; `renderServiceFeed` partitions; `renderServiceBrowseAll` uses spread + predicate.
- Commit `e80fe99` exists (Task 1).
- Commit `59163ef` exists (Task 2).
