---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: PR/TR Routing Fix
status: unknown
last_updated: "2026-03-05T09:04:10.253Z"
progress:
  total_phases: 43
  completed_phases: 42
  total_plans: 118
  completed_plans: 115
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05 after v3.1 milestone start)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 57 complete — v3.1 shipped

## Current Position

Phase: 59.1 of 59.1 (Fix MRF Records Real-Time Rendering) — COMPLETE
Plan: 1 of 1 in Phase 59.1 — COMPLETE (59.1-01 done)
Status: Complete
Last activity: 2026-03-05 — Phase 59.1 Plan 01 complete — removed historical status filter + cache invalidation so Pending/Approved MRFs appear instantly in Records tab

Progress: [██████████] 97%

## Performance Metrics

**Velocity:**
- Total plans completed: 146 (v1.0: 10, v2.0: 26, v2.1: 11, v2.2: 23, v2.3: 34, v2.4: 24, v2.5: 12, v3.0: 4 + 2 untracked)
- Total milestones shipped: 9

**By Milestone:**

| Milestone | Phases | Days | Avg/Phase |
|-----------|--------|------|-----------|
| v1.0 | 4 | 59 | 14.8 |
| v2.0 | 6 | 64 | 10.7 |
| v2.1 | 3 | 2 | 0.7 |
| v2.2 | 11 | 5 | 0.5 |
| v2.3 | 15 | 8 | 0.5 |
| v2.4 | 10 | 3 | 0.3 |
| v2.5 | 7 | 2 | 0.3 |
| v3.0 | 3 | 1 | 0.3 |
| Phase 057 P01 | 1 | 2 tasks | 2 files |
| Phase 58 P02 | 45s | 2 tasks | 2 files |
| Phase 59 P01 | 2min | 2 tasks | 2 files |
| Phase 59 P04 | 1 | 1 tasks | 1 files |
| Phase 59-02 P02 | 5 | 2 tasks | 2 files |
| Phase 59 P03 | 2 | 2 tasks | 2 files |
| Phase 59 P05 | 3 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 46: Unified project/service dropdown uses native optgroup + data-type/data-name — same pattern applies to category dropdowns
- Phase 57 (pending): "DELIVERY BY SUPPLIER" must NOT appear in `transportCategories` array so routing stays in PR path
- [Phase 057]: DELIVERY BY SUPPLIER absent from transportCategories so routing stays in PR path and triggers existing supplier-required validation
- [Phase 057]: New category options inserted between HAULING & DELIVERY and OTHERS in all dropdowns, no new logic required
- [Phase 58]: Added https://www.gstatic.com to CSP connect-src in both _headers and netlify.toml to fix Firebase SDK source map fetch CSP violations
- [Phase 58]: TR Rejected status added to canEdit checks in renderMRFDetails() and updateActionButtons() — all resubmittable MRF statuses now consistent
- [Phase 58]: PR Rejected and TR Rejected added to histStatusFilter dropdown and historicalStatuses query so Records tab fetches and filters rejected MRFs
- [Phase 59]: TR finance_status fetched from transport_requests collection per-row; not stored on mrfs document — must be fetched separately for Transport rows
- [Phase 59]: Used minmax(280px, 320px) for .dashboard-grid left panel to gain ~30px vs fixed 350px and allow shrinkage on tight viewports
- [Phase 59-02]: Submitted event uses completed (green) only when finance_status=Approved AND no rejection history — keeps non-rejected approvals as single green entry
- [Phase 59-02]: Approved PRs with rejection history emit 4 events: Submitted + Rejected + Resubmitted + Approved with POs — full audit trail visible in chronological order
- [Phase 59]: Sort state in createMRFRecordsController closure resets naturally on controller re-creation — no explicit reset code needed
- [Phase 59-03]: window._myRequestsSort wired as thin bridge to controller.sort() — consistent with existing _myRequestsFilter/Reload/ExportCSV pattern
- [Phase 59]: Cache key is mrf.id (Firestore document ID) not mrf.mrf_id — consistent with onSnapshot pattern
- [Phase 59]: Loading placeholder guarded by _subDataCache.size === 0 so only shown on cold start, not sort/filter/page
- [Phase 59.1]: Remove server-side historicalStatuses filter from loadPRPORecords — all MRFs fetched, client-side filterPRPORecords() handles filtering; reset _prpoRecordsCachedAt = 0 in saveNewMRF success path so Records tab never serves stale cache after a create

### Roadmap Evolution

- Phase 58 added: Fix TR rejection not reappearing in procurement, PR rejection hiding MRF records, and CSP header violations blocking Firebase source maps
- Phase 59 added: Improve TR display on MRF Records and My Requests, add sortable headers to My Requests, enhance Timeline lifecycle logging, and optimize workspace responsiveness for laptop screens
- Phase 60 added: Fix TR rejection independence — decouple TR status from MRF, treat TRs as child records like PRs so rejected TRs return to procurement without rejecting the whole MRF
- Phase 59.1 inserted after Phase 59: Fix MRF Records real-time rendering - new MRFs should appear instantly in all records tables (Procurement and My Requests) (URGENT)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-05
Stopped at: Completed 59.1-01-PLAN.md — MRF Records real-time rendering fix (Pending/Approved now visible, cache busted on create)
Resume file: None
Next action: Phase 59.1 complete — proceed to Phase 60 (TR rejection independence)
