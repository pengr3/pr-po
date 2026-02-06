# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-05)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 15 - User Data & Permission Improvements (v2.2 Workflow & UX Enhancements)

## Current Position

**Milestone:** v2.2 Workflow & UX Enhancements
Phase: 15 of 19 (User Data & Permission Improvements)
Plan: 2 of 2 in phase
Status: Phase complete
Last activity: 2026-02-06 - Completed 15-02-PLAN.md

Progress: [████████████████████████████████████████░░░░░░░░] 78% (38/49 estimated plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 38 (v1.0: 10 plans, v2.0: 17 plans, v2.1: 9 plans, v2.2: 2 plans)
- v1.0 milestone: 10 plans completed in 59 days
- v2.0 milestone: 17 plans completed in 64 days
- v2.1 milestone: 9 plans completed in 2 days (2026-02-05 to 2026-02-06)
- v2.2 milestone: 2 plans completed (in progress)
- Average: ~2.4 plans per week

**By Milestone:**

| Milestone | Phases | Plans | Duration | Avg/Plan |
|-----------|--------|-------|----------|----------|
| v1.0 Projects | 4 | 10 | 59 days | 5.9 days |
| v2.0 Auth | 6 | 17 | 64 days | 3.8 days |
| v2.1 Refinement | 3 | 9 | 2 days | 0.2 days |
| v2.2 Enhancements | 5 | 2 | <1 day | <0.5 days |

**Recent Trend:**
- v2.1 dramatically improved velocity (0.2 days/plan vs 3.8 in v2.0)
- Phase 11 (2 plans) completed in <1 day (Security Rules fixes)
- Phase 12 (2 plans) completed in <1 day (Window function lifecycle)
- Phase 13 (5 plans) completed in 2 days (Finance dashboard features)
- Bug fix milestones execute faster than feature milestones

*Updated after v2.2 roadmap creation (2026-02-06)*

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
- v2.1 (13-02): Server-side aggregation for supplier purchase history (efficient for suppliers with many POs)
- v2.1 (13-02): Inline clickable supplier names in PR-PO records (maintains compact layout, easy drill-down)
- v2.1 (13-03): Timeline component reuse for audit trails (DRY principle, consistent visual presentation across app)
- v2.1 (13-03): Multi-collection audit trail queries by common identifier (mrf_id) for complete procurement workflow visibility
- v2.1 (13-05): Move supplier purchase history to Supplier Management tab as primary access point (matches user expectations, feature in logical location)
- v2.2 (15-01): Use readonly (not disabled) for auto-populated form fields (ensures value submits with form)
- v2.2 (15-01): Auto-populate user identity fields in init(), resetForm(), and post-submission (persistent across all form lifecycle events)
- v2.2 (15-02): Personnel field required for new project creation (enforces accountability)
- v2.2 (15-02): Store both personnel_user_id and personnel_name (denormalization avoids extra lookups, historical record)
- v2.2 (15-02): Migrate-on-edit strategy for personnel field (incremental data migration preserves backward compatibility)

### Pending Todos

**Future Enhancement (beyond v2.2 scope):**
- Multi-user personnel assignment with chip/tag UI - Transform personnel field from single-select to multi-select. Selected users appear as removable chips/pills (delete whole name, not character-by-character). Common pattern used in email recipients, tag inputs. Requires UI component work + schema change (personnel_user_ids array instead of single ID). User feedback from Phase 15 UAT.

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

Last session: 2026-02-06 (Phase 15 execution and verification)
Stopped at: Phase 15 verified and approved by user. All 5 success criteria passed. Minor UI fix applied (removed hint text). Multi-user personnel assignment identified as future enhancement (beyond Phase 15 scope).
Resume file: None
Next action: Plan Phase 16 (Project Detail Page Restructure)
