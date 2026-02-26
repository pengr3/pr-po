# Project Retrospective

Living retrospective for the CLMC Procurement System — updated after each milestone.

---

## Milestone: v2.3 — Services Department Support

**Shipped:** 2026-02-26
**Phases:** 15 (26-40) | **Plans:** 34

### What Was Built

- Firebase Security Rules and role templates for services_admin and services_user roles
- Services collection with CRUD, dual status tracking, and service_type differentiation
- Shared CLMC_CLIENT_YYYY### code sequence across Projects and Services
- Role-based MRF form dropdown visibility (operations sees Projects, services sees Services)
- Cross-department Finance and Procurement workflows with department badges and filters
- Dashboard role-aware statistics for Services department
- Unified expense breakdown modal (project + service modes in single function)
- Admin Assignments overhaul with unified table+modal interface replacing per-user pages
- Badge color standardization across all procurement statuses
- My Requests sub-tab in MRF form for requestor self-service tracking with PR/PO modals and timeline

### What Worked

- Mirror-first approach: building Services as a copy of Projects and then adapting saved significant time
- Phase-level gap closure (Phases 32-38) was effective at catching and fixing audit gaps before milestone completion
- Integration checker agent as a final cross-phase wiring validation step
- Keeping Services roles isolated from Projects tab from day one (no backfill required)

### What Was Inefficient

- Phase 26 Firestore rules deployed but not tested live — Phase 31 discovered rules were never actually deployed, causing cascading permission-denied errors for 5 phases of development
- Multiple audit cycles required (Phase 35 UAT gaps, Phase 36 expense modal, Phase 38 code quality) before milestone passed — better pre-audit checklist could catch these earlier
- project-assignments.js and service-assignments.js left as dead code rather than deleted

### Patterns Established

- `canEdit === true` (strict equality) for permission guards that must treat undefined as read-only — eliminates flash of edit controls
- Mode-branching unified modal (single export, options object) preferred over two separate exported functions
- `createMRFRecordsController` factory pattern with containerId-namespaced window functions — reusable across any tab that needs an MRF records table
- Local-suffix document generation helpers for self-contained modules that can't depend on procurement.js

### Key Lessons

- Deploy Firebase Security Rules immediately after writing them — do not proceed to UI development until rules are confirmed live
- Run a quick live test of each new Firestore collection rule before marking a phase complete
- When building a "mirror" feature (Services mirrors Projects), do a code diff to confirm all patterns were truly copied

### Cost Observations

- Sessions: ~16 execution sessions across 8 days
- Notable: High velocity maintained (8 days for 15 phases) by reusing Projects patterns

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 | v2.1 | v2.2 | v2.3 |
|--------|------|------|------|------|------|
| Phases | 4 | 6 | 3 | 11 | 15 |
| Days | 59 | 64 | 2 | 5 | 8 |
| Days/Phase | 14.8 | 10.7 | 0.7 | 0.5 | 0.5 |
| Requirements | 32 | 51 | ~12 | ~25 | 65 |
| Audit Cycles | 1 | 1 | 1 | 1 | 3 |

**Trend:** Velocity stabilized at ~0.5 days/phase (v2.1 onward). Complexity increasing but pace maintained.
