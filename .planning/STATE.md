# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 13 - Finance Dashboard & Audit Trails

## Current Position

Phase: 13 of 14 (Finance Dashboard & Audit Trails)
Plan: 1 of 3 complete
Status: In progress
Last activity: 2026-02-05 - Completed 13-01-PLAN.md (Project List tab with server-side aggregation)

Progress: [████████████████████████████████████████████░░░░] 84% (32/38 plans complete across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 32 (v1.0: 10 plans, v2.0: 17 plans, v2.1: 5 plans)
- v1.0 milestone: 10 plans completed in 59 days
- v2.0 milestone: 17 plans completed in 64 days
- Average: ~2.2 plans per week

**By Milestone:**

| Milestone | Phases | Plans | Duration | Avg/Plan |
|-----------|--------|-------|----------|----------|
| v1.0 Projects | 4 | 10 | 59 days | 5.9 days |
| v2.0 Auth | 6 | 17 | 64 days | 3.8 days |
| v2.1 Refinement | 4 | 5 complete | In progress | - |

**Recent Trend:**
- Velocity improved from v1.0 to v2.0 (5.9 → 3.8 days/plan)
- Phase 11 (2 plans) completed in <1 day (Security Rules fixes)
- Phase 12 (2 plans) completed in <1 day (Window function lifecycle + ESC key handling)
- Phase 13 (1 plan) completed in 3 min (Project List with aggregation)
- v2.1 focuses on bug fixes and workflow improvements (faster execution)

*Updated after Phase 13 Plan 01 completion (13-01)*

## Accumulated Context

### Decisions

Recent decisions affecting current work (see PROJECT.md for full log):

- v2.0: Firebase Security Rules server-side enforcement required (client-side can be bypassed)
- v2.0: Real-time permission updates via Firestore listeners (no logout needed for permission changes)
- v2.0: Minimum 2 Super Admin safeguard prevents system lockout
- v2.0: Two-step deletion (deactivate first) for reversible actions
- v2.1 (11-01): Follow projects collection pattern for clients Security Rules (consistency across admin-managed collections)
- v2.1 (11-02): Use Firestore 'in' operator for multi-role queries instead of client-side filtering (more efficient, follows best practices)
- v2.1 (12-01): attachWindowFunctions() pattern prevents window function lifecycle bugs (router skips destroy on tab switch)
- v2.1 (12-02): AbortController pattern for event listeners (single abort() call, prevents memory leaks, idempotent)
- v2.1 (13-01): Use getAggregateFromServer for dashboard totals (1 read per 1000 entries vs 1 per PO, cost-efficient)
- v2.1 (13-01): Manual refresh button for aggregation instead of real-time listener (Firebase doesn't support real-time aggregation queries)

### Pending Todos

None yet.

### Blockers/Concerns

**Known from v2.0:**
- Role template seeding requires manual browser console step (one-time, 5 minutes)
- First Super Admin requires manual Firestore document edit (one-time, 2 minutes)
- Firestore 'in' query limited to 10 items (project assignments use client-side filtering)

**v2.1 Focus Areas:**
- ✅ Security Rules missing admin bypass logic (Phase 11) - COMPLETE
- ✅ Window function lifecycle management in finance.js (Phase 12) - COMPLETE
- ✅ Financial aggregation cost concerns (Phase 13) - COMPLETE (getAggregateFromServer implemented)

**v2.1 Testing Notes:**
- Firebase emulator required for Security Rules tests
- Test suites added in Phase 11 (11-01: 8 clients tests, 11-02: 3 assignment tests)
- Requires manual setup: firebase-tools, emulator start, npm test
- All tests follow @firebase/rules-unit-testing pattern from Phase 8

## Session Continuity

Last session: 2026-02-05 (Phase 13 Plan 01 execution)
Stopped at: Completed 13-01-PLAN.md (Project List tab with server-side aggregation), created 13-01-SUMMARY.md, updated STATE.md
Resume file: None
