# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-12)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 28 - Services View (v2.3 Services Department Support)

## Current Position

Phase: 28 of 31 (Services View)
Plan: 1 of 3 in current phase
Status: Plan 01 complete
Last activity: 2026-02-18 — Completed 28-01: syncServicePersonnelToAssignments(), auth.js service change detection, role_templates seed script

Progress: [████████████████████░░░░░░░░░░] 80% (25/31 phases complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 94 (v1.0: 10, v2.0: 26, v2.1: 14, v2.2: 43, v2.3: 1)
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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 28-01-PLAN.md (Phase 28 plan 1 of 3)
Resume file: None
Next action: /gsd:execute-phase 28 (plans 02-03 remaining)
