# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 37 - Documentation & File Cleanup (v2.3 Tech Debt Closure)

## Current Position

Phase: 38 of 38 (Code Quality DRY Cleanup) — COMPLETE
Plan: 2 of 2 in current phase
Status: Phase 38 plan 02 complete — hardcoded personal name removed; approved_by_name/approved_by_uid added to all 4 finance approval/rejection flows; debug log sweep done
Last activity: 2026-02-24 — Completed 38-02: Code Quality DRY Cleanup (all plans done)

Progress: [██████████████████████████████] 100% (38/38 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 96 (v1.0: 10, v2.0: 26, v2.1: 14, v2.2: 43, v2.3: 3)
- Average duration: Not yet tracked systematically
- Total execution time: ~95+ days across 4 milestones

**By Milestone:**

| Milestone | Phases | Days | Avg/Phase |
|-----------|--------|------|-----------|
| v1.0 | 4 | 59 | 14.8 |
| v2.0 | 6 | 64 | 10.7 |
| v2.1 | 3 | 2 | 0.7 |
| v2.2 | 11 | 5 | 0.5 |
| v2.3 | 6 | - | - |

**Recent Trend:**
- v2.1: 0.2 days per plan (dramatic improvement from v2.0)
- v2.2: 0.14 days per plan (sustained high velocity)
- Trend: Stable - high velocity maintained

*Updated after v2.3 roadmap creation*
| Phase 26-security-roles-foundation P03 | 15 | 1 tasks | 1 files |
| Phase 27-code-generation P01 | 5 | 1 tasks | 1 files |
| Phase 28-services-view P01 | 15 | 3 tasks | 3 files |
| Phase 28-services-view P02 | 20 | 2 tasks | 3 files |
| Phase 28-services-view P03 | 25 | 2 tasks | 3 files |
| Phase 29-mrf-integration P01 | 15 | 2 tasks | 1 files |
| Phase 29-mrf-integration P02 | 20 | 2 tasks | 2 files |
| Phase 29-mrf-integration P03 | 15 | 2 tasks | 2 files |
| Phase 30-cross-department-workflows P01 | 2 | 2 tasks | 1 files |
| Phase 30-cross-department-workflows P02 | 3 | 2 tasks | 1 files |
| Phase 34-documentation-minor-fixes P01 | 15 | 2 tasks | 2 files |
| Phase 35-for-the-gaps-found-during-audit-for-v-2-3 P03 | 8 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v2.3 work:

- Phase 26: Services mirrors Projects (reuse patterns, duplicate UI modules)
- Phase 26: Security Rules and role templates come first (foundation before UI)
- Phase 27: Parallel query pattern for shared sequence (acceptable race condition risk at current scale)
- Phase 29: MRF form integration modifies existing code (higher risk, comes after Services UI validated)
- v2.3 General: No data migration needed (existing data is sample/practice data)
- 26-01: isRole('services_user') short-circuit guard before isAssignedToService() prevents evaluation on non-services_user docs (Pitfall 1 avoided)
- 26-01: services_user excluded from create/update/delete — read-only (SEC-04); finance/procurement can read but not write services
- 26-01: setDoc used (not updateDoc) in sync script NOT FOUND branch to create missing role_template documents
- 26-02: Reuse roleSpecificFields spread pattern from operations roles for services roles (both confirmApproval and handleEditRole)
- 26-02: ROLE_ORDER/TABS/ROLE_LABELS are single source of truth for permission matrix — adding entries is sufficient
- 26-02: getPermissionValue || false fallback handles missing services key in existing role templates — no migration needed
- [Phase 26-security-roles-foundation]: Test 13 uses getDocs(query) not getDoc to validate list-scoping (allow list rule) — critical distinction from allow get, which is intentionally broad for services_user
- 27-01: generateServiceCode() queries both projects AND services via Promise.all for shared CLMC_CLIENT_YYYY### sequence (SERV-02) — prevents collision between service and project codes
- 27-01: getAssignedServiceCodes() role guard uses services_user (not services_admin) — services_admin gets null (no filter), which is intentionally correct
- 27-01: Service documents MUST store client_code field for range query to work — Phase 28 prerequisite
- 28-01: syncServicePersonnelToAssignments registered as standalone window function (not in window.utils) — mirrors syncPersonnelToAssignments precedent
- 28-01: Seed script covers procurement_staff in addition to the 6 specified roles — safe inclusion (read-only access=true/edit=false)
- 28-01: JSON.stringify() comparison used for assigned_service_codes in auth.js condition — matches existing assigned_project_codes pattern
- [Phase 28]: currentActiveTab is module-level variable in services.js so sub-tab state persists across router re-renders
- [Phase 28]: service-detail route defined in router.js before service-detail.js exists — enables #/services/detail/CODE links from list view to resolve after 28-03
- [Phase 28-services-view]: recordEditHistory called with service doc ID — reuses same subcollection pattern as projects
- [Phase 28-services-view]: service-assignments.js queries all services (not filtered by active) so admin can assign inactive services
- [Phase 28-services-view]: Expense breakdown is stub with Phase 29 message — no aggregation query until MRF-Service integration
- 29-01: projectNameGroup/serviceNameGroup are wrapper divs controlled via style.display in init() — no required attribute on hidden selects avoids browser native validation firing on hidden fields
- 29-01: loadProjects() called for all roles (even services-only) to avoid listener gaps; projectGroup display:none hides it visually
- 29-01: services_admin gets null from getAssignedServiceCodes() (no filter) — services_user gets array filter; mirrors operations role pattern exactly
- 29-02: department field is binary string discriminator ('projects' vs 'services') stored denormalized on MRF/PR/TR — avoids joins in display code
- 29-02: cachedServicesForNewMRF uses getDocs (one-time fetch) not onSnapshot — services change rarely, inline form doesn't need real-time updates
- 29-02: submitTransportRequest() TR addDoc also needed service fields (4th path) — was not in plan, auto-fixed under Rule 2
- [Phase 29-mrf-integration]: getMRFLabel() uses dual-condition check (department === 'services' OR service_code fallback) to handle both new docs and pre-existing docs without department field
- [Phase 29-mrf-integration]: Dropdown builder (projectOptions map) left with old ternary intentionally — it maps projectsData array, not MRF/PR/PO documents, so getMRFLabel() is inappropriate there
- [Phase 30]: activeDeptFilter defaults '' (empty string) not null; filter uses (pr.department || 'projects') for legacy-doc compatibility
- [Phase 30]: applyFinanceDeptFilter re-renders all three tables on every filter change (client-side, instant, no new Firestore queries)
- 30-02: displayPos pattern — derive filtered array from function param AFTER scoreboard calculation; scoreboards always show global totals from full pos array
- 30-02: getDeptBadgeHTML() uses same dual-condition as getMRFLabel() to handle legacy docs without department field
- 30-02: Fixed pre-existing missing window. prefix on viewPODetails PO row link (Rule 1 auto-fix)
- [Phase 31]: getDashboardMode() returns 'both' for cross-dept roles (super_admin/finance/procurement) — unknown roles default to 'both' (safe fallback)
- [Phase 31]: services Firestore Security Rules never deployed since Phase 26 — root cause of all permission-denied errors on services collection for every role
- [Phase 31]: services roles (services_admin/services_user) added to mrfs/prs/pos/transport_requests rules — services_admin unrestricted list, services_user scoped via isAssignedToService(resource.data.service_code)
- [Phase 32]: services_admin update rule uses get().data.role (fresh read) not resource.data.role — prevents bypassing role scope by changing role field in same update; mirrors ops_admin pattern
- [Phase 32]: services_user Firestore list rule evaluates isAssignedToService() per document — unscoped queries are denied entirely; fix is query-side scoping with where('service_code', 'in', assignedCodes) at call site
- [Phase 32]: services_admin missing from edit_history create rule — services.js reuses recordEditHistory() writing to projects subcollection; added services_admin to the create condition
- [Phase 33]: refreshServiceExpense calls renderServiceDetail; renderServiceDetail never calls refreshServiceExpense — anti-loop pattern, same as project-detail.js
- [Phase 33]: onSnapshot callback made async; refreshServiceExpense(true) awaited before render so initial load shows real aggregation data, not zeros
- [Phase 33]: Em dash shown when prTotal/poTotal is 0 — handles services with no Phase-29 linked documents cleanly
- [Phase 33]: destroy() resets currentServiceExpense to zeros — prevents stale expense data when navigating between services
- [Phase 34-02]: deptFilterPOs uses unique id to avoid DOM collision with Tab 1's deptFilterApprovals — both call same applyFinanceDeptFilter() handler which was already registered in Phase 30
- [Phase 34-02]: No new window registrations added — HTML-only gap closure when filter logic pre-exists is the correct pattern
- [Phase 34-01]: DASH-01/DASH-02 traceability points to Phase 31 (implementing phase), not Phase 34 (verifying phase)
- [Phase 34-01]: SEC-08 traceability corrected to Phase 29 where department field was added to mrf-form.js, procurement.js, finance.js
- [Phase 35-01]: edit-history.js collectionName defaults to 'projects' — zero changes at project-detail.js call sites (backward-compatible optional param)
- [Phase 35-01]: services_user gets read access to services/edit_history — audit trail visibility needed for assigned services, not just admin roles
- [Phase 35-01]: No data migration for orphaned history at projects/{serviceDocId}/edit_history — low-value testing/development records
- [Phase 35-02]: canEdit === true in renderServiceDetail treats permission loading (undefined) as read-only — eliminates flash of edit controls for services_user
- [Phase 35-02]: canEditTab !== true in saveServiceField/toggleServiceDetailActive blocks Firestore writes during permission load race (undefined state = blocked)
- [Phase 35-02]: hasTabAccess === false (not !== true) in refreshServiceExpense — services_user has read access (true), so !== true would incorrectly block them; only explicit false skips aggregation
- [Phase 35-for-the-gaps-found-during-audit-for-v-2-3]: services_user prs/pos list rule matches mrfs/transport_requests pattern exactly — intentional consistency across all 4 cross-department procurement collections

### Roadmap Evolution

- Phase 35 added: for the gaps found during audit for v 2.3
- Phase 36 added: fix the Expense Breakdown modal in services, export the one we've been using in projects
- [Phase 36-01]: Unified showExpenseBreakdownModal eliminates divergent implementations — mode branching only at query level, all display logic shared; services modal now correct
- [Phase 36-01]: showServiceExpenseBreakdownModal removed; old implementation omitted transport_requests from service expense breakdown — now included via service_code query
- [Phase 37-01]: 21 individual requirement IDs verified for Phase 28 (not 17) — ROADMAP.md range notation "SERV-03-10" counted as one entry, actual IDs are 10 SERV + 8 UI + 3 ASSIGN = 21
- [Phase 37-01]: Phase 26 26-03-SUMMARY.md already correct with [SEC-07] only — no modification needed

- [Phase 38-01]: getMRFLabel/getDeptBadgeHTML extracted to components.js as named exports — single definition, zero new dependencies (functions only read object properties)
- [Phase 38-01]: applyPODeptFilter passes full poData to renderPOTrackingTable; displayPos derived internally — scoreboards always reflect global totals, single-filter architecture
- [Phase 38-02]: approved_by_name/approved_by_uid written on BOTH approval and rejection finance paths — approved_by_* captures "who acted", finance_status distinguishes the action type; enables single-field actor queries
- [Phase 38-02]: DOCUMENT_CONFIG.defaultFinancePIC uses 'Finance Approver' not personal name — generic fallback for POs missing finance_approver_name field
- [Phase 38-02]: Per-item loop console.log removed from loadPRs and loadMRFs — inner-loop logs fire once per Firestore document per snapshot update; high noise, no debugging value over count-level logs

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed Phase 38-02: Code Quality DRY Cleanup (phase complete, all plans done)
Resume file: None
