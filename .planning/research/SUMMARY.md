# Project Research Summary

**Project:** v2.3 Services Department Integration
**Domain:** Multi-department procurement workflow (engineering firm)
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

Adding Services department to the CLMC Procurement system is an architectural extension, not a technology addition. The existing zero-build vanilla JavaScript + Firebase Firestore v10.7.1 stack already provides all required capabilities: multi-collection isolation, role-based access control, shared sequence generation, and real-time listeners. No new libraries, SDK upgrades, or build tools are needed.

The recommended approach is to **mirror Projects patterns with strict department isolation**. Services department gets a parallel `services` collection (NOT a subcollection), separate view modules (`services.js`, `service-detail.js`), and dedicated roles (`services_admin`, `services_user`) that mirror existing `operations_admin` and `operations_user` patterns. The critical architectural decision is the shared code sequence: both Projects and Services use the same CLMC_CLIENT_YYYY### namespace, requiring parallel queries of both collections during code generation to prevent collisions.

The primary risk is **Security Rules enforcement with query constraints**. Firebase Security Rules cannot filter list queries by department without an explicit `department` field on documents. Attempting to filter by "has project_code OR service_code" fails because Rules cannot check field existence efficiently. This requires adding `department: 'projects'|'services'` to all MRFs, PRs, POs, and TRs, plus a data migration for existing documents. Secondary risks include ID generation race conditions (acceptable at current scale) and ensuring backward compatibility during the transition.

## Key Findings

### Recommended Stack

**No new stack dependencies required.** The v2.3 Services department addition extends existing Firebase Firestore v10.7.1 and Firebase Auth v10.7.1 capabilities already validated in v2.2. This is purely an architectural pattern extension within the proven zero-build vanilla JavaScript SPA.

**Core technologies (unchanged):**
- **Firebase Firestore v10.7.1**: Multi-collection database with real-time listeners — already handles 9 collections, adding `services` as 10th follows established pattern
- **Firebase Auth v10.7.1**: Role-based authentication with session persistence — already supports 5 roles, adding 2 new roles (`services_admin`, `services_user`) extends existing role_templates structure
- **Vanilla JavaScript ES6 Modules**: Zero-build SPA with hash routing — router already supports sub-routes (#/procurement/mrfs), extends to #/services/services and #/services/recurring
- **Firebase Security Rules (rules_version 2)**: Server-side permission enforcement — existing 247 lines expand ~30 lines to add services collection block

**Critical capabilities already validated:**
- Parallel collection queries: `generateProjectCode()` uses range queries with composite keys (lines 192-226 in utils.js)
- Role-scoped filtering: `getAssignedProjectCodes()` implements assignment filtering for operations_user (lines 237-246)
- Real-time permission updates: `permissionsChanged` event propagates role changes without logout (permissions.js)
- Multi-collection Security Rules: 9 collection blocks already working with helper function reuse

### Expected Features

**Must have (table stakes) — v2.3 launch blockers:**
- **Services CRUD with service_type field** — distinguishes one-time vs recurring services (LOW complexity, mirrors Projects CRUD)
- **Service code generation sharing CLMC_CLIENT_YYYY### sequence** — prevents duplicate codes across departments (LOW complexity, requires parallel query of projects + services collections)
- **Role-based department isolation** — operations_user never sees Services tab, services_user never sees Projects tab (MEDIUM complexity, requires Security Rules + UI filtering)
- **Assignment system for services_user** — non-admin services users see only assigned services (MEDIUM complexity, reuses existing assignment pattern from operations_user)
- **MRF dropdown role-based filtering** — Operations sees Projects dropdown, Services sees Services dropdown, never mixed (MEDIUM complexity, conditional rendering in mrf-form.js)
- **Services tab with sub-tabs (Services, Recurring)** — visual separation via router sub-routes (LOW complexity, router pattern already supports #/procurement/mrfs)

**Should have (competitive) — adds after core works:**
- **Cross-department Finance/Procurement view** — Finance approves PRs from both departments in unified interface (MEDIUM complexity, requires department tagging)
- **Automatic personnel-to-assignment sync** — services_user added to personnel → auto-assign access (LOW complexity, reuses v2.2 syncPersonnelToAssignments pattern)
- **Service detail page with inline editing** — same UX efficiency as Projects detail (LOW complexity, duplicate project-detail.js)
- **Search by service code or name** — quick lookup in large datasets (LOW complexity, mirrors Projects search)

**Defer (v2+) — not validated by users:**
- **Recurring service schedule automation** — auto-generate monthly MRFs for recurring work (HIGH complexity, requires scheduling engine, notification system)
- **Contract expiration tracking** — remind when recurring service contracts expire (MEDIUM complexity, needs notification system not in scope)
- **Service history timeline** — view all MRFs/PRs/POs for a service (MEDIUM complexity, already available via expense breakdown in service detail)
- **Service categories/tags** — group services by type (HVAC, electrical, pest control) (LOW complexity but not validated as needed)

### Architecture Approach

**Parallel collections with shared utilities, department-scoped role isolation.** Services is NOT a subcollection of Projects — both are root collections with independent lifecycles. The key pattern is **duplicate UI modules, share business logic**: `services.js` duplicates `projects.js` structure but queries `services` collection, while utilities like `generateServiceCode()` and `getAssignedServiceCodes()` in utils.js are shared across departments.

**Major components:**
1. **View layer (duplicated)** — `services.js` and `service-detail.js` mirror Projects structure with service_code and client_code fields, separate router paths (#/services, #/service-detail)
2. **Shared utilities (extended)** — `generateServiceCode()` queries BOTH projects and services collections for max sequence number to prevent code collisions across departments
3. **Permission system (extended, not replaced)** — Existing permissions.js unchanged, role_templates add `services` tab with access/edit flags, router filters navigation by hasTabAccess('services')
4. **Security Rules (parallel blocks)** — `services` collection rules mirror `projects` structure, new helper `isAssignedToService()` parallels `isAssignedToProject()`, mrfs/prs/pos rules extended with department filtering
5. **Conditional form rendering** — `mrf-form.js` renders Projects dropdown for operations roles, Services dropdown for services roles, based on `hasTabAccess('projects')` and `hasTabAccess('services')` checks
6. **Denormalized department field** — MRFs, PRs, POs, TRs store explicit `department: 'projects'|'services'` field for efficient Security Rules filtering (cannot filter by field existence)

**Critical architectural decision:** Shared code sequence (CLMC_CLIENT_YYYY###) requires `generateProjectCode()` to query both collections in parallel using `Promise.all()`. Race condition risk acknowledged as acceptable for v2.3 (same as existing v1.0 comment line 191: "Race condition possible with simultaneous creates - acceptable for v1.0"). Future optimization: distributed counter if >1000 work items per client per year.

### Critical Pitfalls

1. **Security Rules query constraints with department filtering** — Firebase Security Rules cannot efficiently filter list queries by "has project_code OR service_code" because checking field existence requires `resource.data.keys().hasAny(['project_code'])` which is expensive. MUST use explicit `department` field on all workflow documents (MRFs, PRs, POs, TRs). Requires data migration: add `department: 'projects'` to all existing documents before deploying rules that enforce department filtering. Test with emulator first.

2. **ID generation race conditions with shared sequence** — When generateProjectCode() and generateServiceCode() run simultaneously for same client/year, both query current max, both calculate maxNum+1, resulting in duplicate codes. Current implementation acknowledges this (utils.js line 191 comment). Acceptable risk for v2.3 at current scale (<1000 work items/year), but monitor for duplicates. Prevention: distributed counter pattern (Firebase sharded counters) if race conditions occur in production.

3. **Window function lifecycle during tab navigation** — Router already implements fix (lines 257-266: skip destroy() for same-view tab switches), but Services view must follow same pattern. Window functions like `window.selectService()` must persist during sub-tab navigation (#/services/services ↔ #/services/recurring). Verify listeners array cleanup in services.js destroy() without removing window functions needed by persistent DOM.

4. **Backward compatibility during migration** — Existing code assumes `mrf.project_code` exists. After Services addition, must check `mrf.department === 'projects' ? mrf.project_code : mrf.service_code`. High-risk files: procurement.js (8 functions), finance.js (3 tabs), home.js (dashboard stats). Mitigation: add backward-compatible field accessors: `getMRFCode(mrf)` helper that checks department field.

5. **Floating-point precision in financial aggregations** — When aggregating PO amounts by project/service, JavaScript floating-point errors accumulate (`totalAmount = items.reduce((sum, item) => sum + item.cost, 0)` produces `-300046.7899999998`). Already a risk in v2.2, exacerbated in v2.3 when aggregating across both departments. Prevention: convert to integer cents before calculation (`Math.round(item.cost * 100)`), aggregate as integers, convert back for display. Apply to expense breakdown modals in both project-detail.js and service-detail.js.

## Implications for Roadmap

Based on research, suggested phase structure with **7 phases** to minimize risk and enable incremental validation:

### Phase 1: Foundation (Backend Structure)
**Rationale:** Security Rules and role templates must exist before any UI work. Adding services collection rules is low-risk because it doesn't modify existing Projects rules (additive only). Enables parallel development of Services UI in Phase 3.

**Delivers:**
- Firebase Security Rules with `services` collection block (mirror `projects` structure)
- Helper functions: `isAssignedToService()`, `canAccessDepartment()`
- Role templates: `services_admin` and `services_user` with services tab permissions
- Security Rules deployed and tested with emulator

**Addresses features:**
- Role-based department isolation (Security Rules enforcement)
- Assignment system for services_user (isAssignedToService helper)

**Avoids pitfall:**
- Security Rules blocking admin access (verify Super Admin can CRUD services before proceeding)
- Missing Security Rules enforcement (server-side validation in place before UI exists)

**Research flag:** Standard pattern — Security Rules mirror existing projects collection block. No additional research needed.

---

### Phase 2: Shared Utilities (Code Generation)
**Rationale:** Services view cannot create documents without code generation. Must implement parallel query pattern before UI development. Modifies existing `generateProjectCode()` function, so requires careful testing for backward compatibility.

**Delivers:**
- Modified `generateProjectCode()` queries both collections (projects + services)
- New `generateServiceCode()` wrapper function
- New `getAssignedServiceCodes()` utility (mirrors getAssignedProjectCodes)
- Users collection schema extended: `assigned_service_codes` array, `all_services` boolean

**Addresses features:**
- Service code generation sharing CLMC_CLIENT_YYYY### sequence

**Avoids pitfalls:**
- ID generation race conditions (acknowledge as acceptable risk, add monitoring log)
- Backward compatibility (keep existing generateProjectCode() signature, extend implementation)

**Research flag:** Standard pattern — mirrors existing generateProjectCode() with parallel query. No additional research needed.

---

### Phase 3: Services View (Isolated Department UI)
**Rationale:** Core department functionality in isolated new module. Does NOT modify existing Projects code, so zero risk to v2.2 functionality. Allows services_admin to create and manage services before MRF integration in Phase 4.

**Delivers:**
- `services.js` view module (duplicate projects.js structure)
- `service-detail.js` view module (duplicate project-detail.js)
- Router paths: `/services` and `/service-detail`
- Navigation menu item with conditional visibility (hasTabAccess check)
- Sub-tabs: #/services/services and #/services/recurring

**Addresses features:**
- Services CRUD with service_type field
- Services tab with sub-tabs
- Service detail page with inline editing
- Personnel tracking (reuse multi-personnel selection)
- Automatic personnel-to-assignment sync

**Avoids pitfalls:**
- Window function lifecycle (implement listeners array cleanup in destroy(), verify sub-tab navigation doesn't call destroy())

**Research flag:** Standard pattern — duplicates existing projects.js and project-detail.js patterns. No additional research needed.

---

### Phase 4: MRF Form Integration (Conditional Dropdowns)
**Rationale:** Enables services_user to create MRFs linked to services. Modifies existing mrf-form.js (higher risk than new modules), so comes after Services view is validated. Requires department field on MRFs.

**Delivers:**
- Conditional dropdown rendering in mrf-form.js (showProjectsDropdown vs showServicesDropdown)
- Services dropdown population with assignment filtering
- Department field added to MRF submission logic (`department: 'services'`)
- Security Rules updated: mrfs collection allows operations_user + services_user creates

**Addresses features:**
- MRF dropdown role-based filtering
- MRF-Service integration

**Avoids pitfalls:**
- Security Rules query constraints (explicit department field added to MRFs)
- Backward compatibility (existing MRFs get department: 'projects' in Phase 5 migration)

**Research flag:** Conditional form rendering pattern validated in ARCHITECTURE.md. Standard approach.

---

### Phase 5: Data Migration (Existing Documents)
**Rationale:** MUST happen before Procurement/Finance integration (Phase 6) because those views query by department field. High-risk bulk update of production data, so isolated phase with rollback plan.

**Delivers:**
- Migration script adds `department: 'projects'` to all existing MRFs, PRs, POs, TRs where field is missing
- Verification script confirms 100% coverage before proceeding
- Security Rules enforcement: require department field on create going forward

**Addresses features:**
- (Enables Phase 6) Cross-department Finance/Procurement view requires department field for filtering

**Avoids pitfalls:**
- Security Rules query constraints (department field now exists on all documents)
- Backward compatibility (existing documents updated to new schema before code expects it)

**Research flag:** Data migration requires careful planning. Use Firebase Admin SDK for batch updates (writeBatch max 500 per batch). Test on copy of production data first.

---

### Phase 6: Procurement/Finance Integration (Cross-Department Workflows)
**Rationale:** Finance and Procurement approve work from both departments. Depends on department field existing (Phase 5 migration). Modifies critical approval workflows, so comes late in roadmap after Services workflow validated.

**Delivers:**
- Department badge rendering in MRF/PR/PO lists (Projects badge vs Services badge)
- Department filter controls (optional dropdown to filter by department)
- Updated queries include department field (no change if showing all)
- PR generation works for Services MRFs
- PO issuance works for Services PRs

**Addresses features:**
- Cross-department Finance/Procurement view

**Avoids pitfalls:**
- Backward compatibility (getMRFCode(mrf) helper checks department field to access correct code)
- Floating-point precision (audit aggregations, apply integer arithmetic pattern)

**Research flag:** Standard pattern — extend existing procurement.js and finance.js with department filtering. No additional research needed.

---

### Phase 7: Dashboard Integration (Services Stats)
**Rationale:** Lowest priority — dashboard is informational only, not critical workflow. Enables visibility into services workload after Services department is fully operational.

**Delivers:**
- Services stats queries (count active services, count services MRFs, etc.)
- Services stats cards on dashboard
- Department breakdown chart (Projects vs Services)

**Addresses features:**
- (Enhancement) Dashboard shows services activity alongside projects

**Avoids pitfalls:**
- Real-time aggregation performance degradation (use write-time aggregation if stats are expensive)

**Research flag:** Standard pattern — mirrors existing dashboard stats for projects. No additional research needed.

---

### Phase Ordering Rationale

1. **Backend before frontend** — Phase 1 (Security Rules) enables Phase 3 (Services UI) without blocking
2. **Shared utilities before consumers** — Phase 2 (code generation) required by Phase 3 (Services view)
3. **Isolated modules before integrations** — Phase 3 (Services view) isolated, Phase 4 (MRF form) modifies existing code
4. **Migration before reliance** — Phase 5 (data migration) MUST precede Phase 6 (Procurement/Finance) because queries depend on department field
5. **Critical workflows before enhancements** — Phase 6 (approval workflows) before Phase 7 (dashboard stats)

This order **minimizes risk to existing v2.2 functionality** by deferring modifications to procurement.js and finance.js until Services department is validated independently.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 5 (Data Migration):** Requires migration script development. Research: Firebase Admin SDK batch updates, writeBatch constraints (500 docs max), rollback strategy if migration fails mid-process.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Security Rules mirror existing projects collection block. Well-documented Firebase Security Rules patterns.
- **Phase 2 (Shared Utilities):** Code generation pattern already exists (generateProjectCode). Extension with parallel query is straightforward.
- **Phase 3 (Services View):** Duplicate projects.js structure. No new patterns, just different collection name.
- **Phase 4 (MRF Form Integration):** Conditional rendering pattern documented in ARCHITECTURE.md. Standard approach.
- **Phase 6 (Procurement/Finance Integration):** Department filtering is simple field check. No complex logic.
- **Phase 7 (Dashboard Integration):** Mirror existing dashboard stats. Standard Firestore queries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from existing v2.2 codebase analysis. No new technologies required. Firebase v10.7.1 already handles 9 collections, adding 10th follows established pattern. |
| Features | HIGH | Features mirror existing Projects department with minor extensions (service_type field, sub-tabs). Multi-source validation from service management research (8 external sources) aligns with requirements. |
| Architecture | HIGH | Parallel collection pattern validated in existing codebase (9 collections already working). Security Rules helper function reuse confirmed in firestore.rules (247 lines). All recommended patterns already in use for Projects. |
| Pitfalls | HIGH | Critical pitfalls derived from existing codebase issues (CLAUDE.md documents window function errors, Security Rules permission denied bugs). Floating-point precision and listener lifecycle pitfalls are general JavaScript/Firebase patterns, not Services-specific. |

**Overall confidence:** HIGH

This is an architectural extension of validated patterns, not exploration of new territory. The v2.2 codebase already demonstrates all required capabilities: multi-collection access, role-based filtering, assignment systems, real-time listeners, and Security Rules enforcement. Services department extends these patterns with parallel structure.

### Gaps to Address

**Minor gaps requiring validation during implementation:**

1. **Code generation race condition monitoring** — Current implementation acknowledges race condition as acceptable (utils.js line 191). Need to monitor for duplicate codes in production logs. If duplicates occur >1% of creates, implement distributed counter pattern (Firebase sharded counters). Acceptable gap: can add monitoring in Phase 2, optimize in v2.4 if needed.

2. **Department field migration testing** — Migration script (Phase 5) needs testing on production data snapshot to estimate duration and verify no data loss. Acceptable gap: migration script development is part of Phase 5 planning, not research blocker.

3. **Conditional dropdown UX with mixed roles** — Super Admin, Finance, and Procurement see both Projects and Services tabs. Which dropdown appears in MRF form? Research recommends "default to Projects" or "show both dropdowns in sections". Acceptable gap: UX decision during Phase 4 planning, not architecture blocker.

4. **Expense breakdown modal code reuse** — Projects detail page has expense breakdown modal (shows all MRFs/PRs/POs for project). Services detail should mirror this. Need to verify modal code can be extracted to shared component or duplicated with service_code parameter. Acceptable gap: implementation detail in Phase 3.

**No critical gaps blocking roadmap creation.** All major architectural decisions have validated precedents in existing codebase.

## Sources

### Primary (HIGH confidence)
- **CLMC Procurement codebase** — v2.2 production codebase analysis (firestore.rules 247 lines, app/utils.js 267 lines, app/permissions.js 133 lines, app/router.js 300+ lines, 14 view modules)
- **Firebase Firestore documentation** — [Distributed counters](https://firebase.google.com/docs/firestore/solutions/counters), [Write-time aggregations](https://firebase.google.com/docs/firestore/solutions/aggregation), [Security Rules structure](https://firebase.google.com/docs/firestore/security/rules-structure)
- **Firebase Auth documentation** — [Custom claims and Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims), [Rules and Auth](https://firebase.google.com/docs/rules/rules-and-auth)
- **Existing test suite** — test/firestore.test.js (336 lines, 17 tests passing) validates Security Rules patterns for role-based access

### Secondary (MEDIUM confidence)
- **Service management patterns** — 8 external sources on recurring services, maintenance workflows, contract-based services, project vs service management differences (see FEATURES.md sources section)
- **Multi-tenant architecture** — WorkOS SaaS multi-tenant guide, AWS tenant isolation whitepaper, Medium articles on secure data isolation (see ARCHITECTURE.md sources section)
- **JavaScript pitfalls** — Floating-point precision in financial apps (3 dev.to/medium articles), event listener memory leaks (2 articles), window function lifecycle (1 SitePoint discussion) — general JavaScript patterns applicable to this project

### Tertiary (LOW confidence)
- None. All recommendations grounded in either existing codebase patterns or official Firebase documentation.

---
*Research completed: 2026-02-12*
*Ready for roadmap: yes*
