# Project Retrospective

Living retrospective for the CLMC Procurement System — updated after each milestone.

---

## Milestone: v2.4 — Productivity & Polish

**Shipped:** 2026-03-01
**Phases:** 10 (41-48, including 47.1, 47.2) | **Plans:** 24

### What Was Built

- CSV export for all major list views and detail page expense breakdowns via shared downloadCSV utility
- Mobile hamburger navigation with slide-down menu, role-based visibility, and scroll lock
- Responsive layouts: horizontal scroll containers, modal footer stacking, split-panel auto-collapse
- Company logo on login and registration pages replacing "CL" placeholder
- Navigation standardized: removed underlines, emojis, uniform Admin button styling
- Dead code removed: project-assignments.js, service-assignments.js, procurement-base.js, ad-hoc console.logs
- Unified MRF creation dropdown in Procurement matching mrf-form.js pattern
- Sortable column headers in Finance (Material PRs, Transport Requests) and Procurement (MRF Records) tables
- Firebase offline persistence, skeleton loading screens across 13 views, stale-while-revalidate dashboard, TTL-cached reference data
- Urgency propagation from MRFs to PRs; Create MRF requestor auto-fill

### What Worked

- Small focused phases (1-3 plans each) shipped extremely fast — entire milestone in 3 days
- Shared utility approach (downloadCSV, skeletonTableRows) meant later phases had zero duplication
- Milestone audit at 30/30 requirements passed on first try — previous milestones needed multiple audit cycles
- Gap closure phases (47.1, 47.2, 48-05) inserted quickly when audit or UAT surfaced issues

### What Was Inefficient

- Phase 48 TTL cache early-return bug (stuck skeleton) required a gap closure plan (48-05) — should have tested tab-switch scenarios during initial implementation
- Phase 41-48 progress table in ROADMAP.md had formatting inconsistencies (missing milestone column for v2.4 phases) — cosmetic but required manual fixup during audit
- Firebase SDK IndexedDB persistence doesn't provide perceptible speed improvement (~500-850ms reads) — investment delivered correctness (offline support) but not the hoped-for speed gain

### Patterns Established

- TTL cache pattern: module-level `_cachedAt` timestamp + `data.length > 0` guard; `destroy()` resets timestamps to 0
- Listener dedup guards: module-level boolean (`_listenerActive`) prevents duplicate onSnapshot registrations
- Sort state pattern for tables: `sortColumn/sortDirection` module variables, `getSortIndicator()` for header arrows, scoped to table via `tbody.closest('table')`
- Skeleton-first rendering: `render()` emits skeleton HTML, `init()` replaces with real data on first snapshot

### Key Lessons

- Always test TTL cache early-return path with a fresh DOM (tab switch scenario) — stale data in memory doesn't mean DOM elements exist
- Skeleton screens are high-impact for perceived performance even when actual load times don't change
- Sort functions should sort source arrays, not filtered subsets — filter functions rebuild from source, so sort order flows through automatically

### Cost Observations

- Sessions: ~8 execution sessions across 3 days
- Notable: Fastest milestone to date (3 days for 10 phases, 24 plans)

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

| Metric | v1.0 | v2.0 | v2.1 | v2.2 | v2.3 | v2.4 |
|--------|------|------|------|------|------|------|
| Phases | 4 | 6 | 3 | 11 | 15 | 10 |
| Plans | 10 | 26 | 11 | 23 | 34 | 24 |
| Days | 59 | 64 | 2 | 5 | 8 | 3 |
| Days/Phase | 14.8 | 10.7 | 0.7 | 0.5 | 0.5 | 0.3 |
| Requirements | 32 | 51 | ~12 | ~25 | 65 | 30 |
| Audit Cycles | 1 | 1 | 1 | 1 | 3 | 1 |

**Trend:** Velocity continues to improve — v2.4 at 0.3 days/phase is the fastest milestone yet. Single audit cycle (30/30 first pass) indicates requirement definition and phase execution quality have matured. Total system: 6 milestones, 48 phases, 128 plans shipped.
