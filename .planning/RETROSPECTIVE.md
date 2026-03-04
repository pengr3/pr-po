# Project Retrospective

Living retrospective for the CLMC Procurement System — updated after each milestone.

---

## Milestone: v3.0 — Fixes

**Shipped:** 2026-03-04
**Phases:** 3 (54-56) | **Plans:** 4

### What Was Built

- PR/PO inline pairing in My Requests: `posByPrId` index maps each PR to its PO(s); null slot em-dash when no PO exists
- PR/PO inline pairing in Procurement MRF Records: same pattern with editable status dropdown per row; critical fix captured `pr_id: poData.pr_id` in poDataArray
- Finance Pending Approvals PR/TR tables restructured: Date Issued + Date Needed columns (from mrfCache lookup), Status column removed
- PR review modal: JUSTIFICATION row added between Delivery Address and Total Amount
- Approved This Month scoreboard: `updateStats()` counts POs by `date_issued` in current month with Timestamp/seconds/string fallback; `approvedTRsThisMonthCount` added once at init
- All sub-tab nav bars (Material Request, Procurement, Admin) standardized to 1600px matching Finance via two-level wrapper pattern
- MRF Processing content wrapper switched from `.container` class (1400px via main.css) to inline `max-width: 1600px`

### What Worked

- Milestone scope was tight and well-defined — 12 precise requirements, 3 independent phases, single day execution
- Finance tab as reference alignment (do not modify) provided a clear, unambiguous target for Phase 56
- mrfCache batch-lookup pattern (30-item chunks, Promise.all, warm-cache render) avoided N+1 queries cleanly
- Phase independence meant no cross-phase coordination or ordering dependency in actual code (only deployment ordering declared)

### What Was Inefficient

- Phase 54 required 3 fix commits (grid layout, collapsed-column revert, duplicate declaration) before stabilizing — initial plan underestimated the PR/PO column alignment complexity and needed iteration
- SUMMARY files in this project use `requirements-completed` (hyphen) but the gsd-tools `summary-extract` tool queries `requirements_completed` (underscore) — extraction returned empty arrays, hiding the fact that all requirements were listed
- SUMMARY descriptions for Phase 54 stated "6-column" table but actual implementation has 8 columns — the description described the intent, not the actual output; integration checker caught this discrepancy

### Patterns Established

- PR-PO pairing pattern: build `posByPrId` index from `poDataArray` keyed by `po.pr_id`; iterate `prDataArray`, look up `posByPrId[pr.pr_id]`, render PR badge + PO link inline with null-slot em-dash when empty
- Two-level sub-nav wrapper: outer div (background/border-bottom) → inner div (max-width: 1600px; margin: 0 auto; padding: 0 2rem) → `.tabs-nav`; Finance tab is the reference
- Content wrapper: `max-width: 1600px; margin: 2rem auto 0; padding: 0 2rem` as inline style — NOT `.container` class (which resolves to 1400px)
- mrfCache batch pattern: filter uncached IDs, chunk at 30, Promise.all getDocs, populate cache, re-render; module-level Map, reset in destroy()

### Key Lessons

- When modifying the same file across multiple phases (Phase 54 and 56 both touch procurement.js), verify no layer conflict — outer wrapper width and inner table content are orthogonal, but this needs explicit confirmation
- SUMMARY descriptions should reflect what was actually built, not the original plan intent — code-level deviations (8 vs 6 columns) should be documented accurately
- A "reference alignment" strategy (designate one tab as the target, normalize all others to it) is highly effective for UI consistency phases — zero ambiguity about the target state

### Cost Observations

- Sessions: 1 concentrated session (single day)
- Notable: Smallest milestone by scope (3 phases, 4 plans) but cleanest execution once plan stabilized

---

## Milestone: v2.5 — Data & Application Security

**Shipped:** 2026-03-02
**Phases:** 7 (49-53, including 51.1, 51.2, 52.1) | **Plans:** 12

### What Was Built

- escapeHTML() utility applied across all 12 view files with user-supplied innerHTML — systematic XSS hardening
- Firebase Security Rules audit across all 12 collections + 2 subcollections with field-level self-update restriction
- CSP headers hardened with 7 directives; SECURITY-AUDIT.md documenting all 11 findings (10 fixed, 1 accepted risk)
- Console log cleanup removing PII exposure from auth and permission modules
- Database safety toolkit: backup.js, restore.js, verify-integrity.js using Firebase Admin SDK
- Data wipe script with dry-run preview and typed confirmation safeguard for 10 collections
- CSV data migration script with auto-delimiter detection, multiline field parsing, and dry-run mode
- Clickable Active/Inactive status badges replacing separate Activate/Deactivate buttons
- Finance Services and Recurring sub-tabs with search bars, sortable columns, and expense modal

### What Worked

- Milestone audit with gap closure phase (Phase 53) caught 4 integration inconsistencies that would have shipped as tech debt
- Admin SDK script architecture was consistent from Phase 50 onward — shared init pattern, ES module syntax, createRequire for JSON loading
- Security audit methodology (classify data as safe/user-supplied, then protect user-supplied) was systematic and thorough
- Inserted phases (51.1, 51.2, 52.1) integrated cleanly without disrupting the planned phase sequence

### What Was Inefficient

- Phase 49 required a gap closure plan (49-05) because initial XSS review missed 9 locations in finance.js, mrf-records.js, procurement.js — should have used grep-based audit from the start
- Phase 53 gap closure found 3 onclick attrs in finance.js still using .replace() instead of escapeHTML() — these were introduced in Phase 52.1 after Phase 49's XSS hardening, showing that later phases can regress earlier fixes
- SUMMARY.md files lacked standardized one_liner field, making automated accomplishment extraction unreliable

### Patterns Established

- escapeHTML() wrapping pattern: import once, apply to all user-supplied data in innerHTML, including onclick attribute string interpolation
- Firebase Admin SDK script pattern: ES module, createRequire for JSON, typed confirmation gates, dry-run mode as default
- Milestone audit → gap closure → re-audit cycle as a standard quality gate before completion

### Key Lessons

- Later phases can regress earlier security fixes — any phase that modifies view files should re-check escapeHTML() usage
- Auto-delimiter detection (tab vs comma) in data scripts saves user friction with real-world data that rarely matches expectations
- Client-side aggregation is an acceptable trade-off when Firestore composite index creation is impractical for development velocity

### Cost Observations

- Sessions: ~6 execution sessions across 2 days
- Notable: Fastest milestone in calendar time (2 days) though smaller scope than v2.3/v2.4

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

| Metric | v1.0 | v2.0 | v2.1 | v2.2 | v2.3 | v2.4 | v2.5 |
|--------|------|------|------|------|------|------|------|
| Phases | 4 | 6 | 3 | 11 | 15 | 10 | 7 |
| Plans | 10 | 26 | 11 | 23 | 34 | 24 | 12 |
| Days | 59 | 64 | 2 | 5 | 8 | 3 | 2 |
| Days/Phase | 14.8 | 10.7 | 0.7 | 0.5 | 0.5 | 0.3 | 0.3 |
| Requirements | 32 | 51 | ~12 | ~25 | 65 | 30 | 23 |
| Audit Cycles | 1 | 1 | 1 | 1 | 3 | 1 | 2 |

**Trend:** Velocity sustained at 0.3 days/phase across v2.4 and v2.5. v2.5 required 2 audit cycles (gap closure phase inserted after first audit) — expected for a security-focused milestone with cross-cutting concerns. Total system: 7 milestones, 53 phases, 140 plans shipped.
