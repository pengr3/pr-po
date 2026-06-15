---
phase: 26-security-roles-foundation
verified: 2026-02-18T00:00:00Z
status: gaps_found
score: 18/19 must-haves verified
re_verification: false
gaps:
  - truth: "SEC-08: Department field enforced on all new MRFs, PRs, POs, TRs going forward"
    status: failed
    reason: "SEC-08 is explicitly deferred to Phase 29 in all three plans and the RESEARCH.md. No department field validation exists in firestore.rules or any application code. The 26-03-SUMMARY.md frontmatter incorrectly lists 'requirements-completed: [SEC-07, SEC-08]', and REQUIREMENTS.md traceability marks SEC-08 as Complete for Phase 26. The implementation does not satisfy SEC-08 — no department field enforcement exists anywhere in the codebase."
    artifacts:
      - path: "firestore.rules"
        issue: "No department field validation in mrfs, prs, pos, or transport_requests collection rules"
      - path: ".planning/phases/26-security-roles-foundation/26-03-SUMMARY.md"
        issue: "Frontmatter 'requirements-completed: [SEC-07, SEC-08]' is incorrect; body correctly states SEC-08 is deferred"
      - path: ".planning/REQUIREMENTS.md"
        issue: "Traceability table marks SEC-08 as 'Complete' for Phase 26; should remain Pending until Phase 29"
    missing:
      - "Correct the 26-03-SUMMARY.md frontmatter: remove SEC-08 from requirements-completed"
      - "Correct REQUIREMENTS.md traceability: mark SEC-08 Phase 26 row as 'Pending (deferred to Phase 29)'"
      - "OR: Accept SEC-08 as a Phase 29 deliverable and update all tracking accordingly"
human_verification:
  - test: "Run npm test with firebase emulator to confirm all 41 tests pass"
    expected: "28 existing tests + 13 new services collection tests = 41 total passing, 0 failures"
    why_human: "Emulator not started during verification; test logic and seed data verified by code inspection only. The emulator run is required to confirm rules syntax is valid and all assertSucceeds/assertFails produce expected outcomes against the live rules."
---

# Phase 26: Security & Roles Foundation Verification Report

**Phase Goal:** Firebase Security Rules and role templates enable Services department isolation
**Verified:** 2026-02-18
**Status:** gaps_found (1 documentation gap — SEC-08 incorrectly marked as complete)
**Re-verification:** No — initial verification

## Goal Achievement

The core phase goal is substantially achieved: the services collection is protected by correct Firestore Security Rules, the two new role templates are seeded, the Super Admin UI supports assigning both new roles, the permission matrix shows the new roles and Services tab, and 13 automated tests cover all required scenarios. One requirement (SEC-08) is explicitly deferred to Phase 29 but is incorrectly marked as complete in planning documents — this is a documentation/tracking gap, not an implementation regression.

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | services_admin can CRUD documents in services collection | VERIFIED | firestore.rules lines 325-331: create/update/delete restricted to `hasRole(['super_admin', 'services_admin'])`; get at line 314 |
| 2 | services_user can read only assigned services (filtered by assigned_service_codes) | VERIFIED | firestore.rules lines 319-322: list rule uses `isRole('services_user') && isAssignedToService(resource.data.service_code)` short-circuit |
| 3 | Super Admin bypasses services role checks and can access both departments | VERIFIED | `super_admin` appears in all five services collection allow rules (get, list, create, update, delete) |
| 4 | Finance and Procurement can read services for cross-department workflows | VERIFIED | firestore.rules line 314: `finance`, `procurement` in get rule; line 320: in list rule |
| 5 | Security Rules tests pass for all services collection scenarios | VERIFIED (code inspection) | test/firestore.test.js lines 537-636: 13 tests in `describe("services collection - role access")` with correct assertSucceeds/assertFails; NEEDS human emulator run to confirm pass |

### Must-Have Truths (from Plan 01 frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | firestore.rules has match /services/{serviceId} block with separate get, list, create, update, delete | VERIFIED | Lines 311-332 in firestore.rules |
| 2 | services_admin can create, update, delete in services collection | VERIFIED | Lines 325-331: `hasRole(['super_admin', 'services_admin'])` on create/update/delete |
| 3 | services_user is in allow get but absent from allow create/update/delete | VERIFIED | Line 314: services_user in get; absent from lines 325, 328, 331 |
| 4 | finance and procurement appear in services allow get and allow list | VERIFIED | Lines 314, 320: both roles present |
| 5 | operations_user and operations_admin are NOT in any services collection allow rule | VERIFIED | Searched entire services block — neither appears |
| 6 | isAssignedToService() helper is present in HELPER FUNCTIONS section, guarded by isRole('services_user') in the list rule | VERIFIED | Lines 49-55: function defined; line 321: `isRole('services_user') && isAssignedToService(...)` |
| 7 | super_admin appears in all services collection allow rules | VERIFIED | Lines 314, 320, 325, 328, 331: super_admin in every rule |
| 8 | sync-role-permissions.js defaultRoleTemplates contains services_admin and services_user objects | VERIFIED | Lines 69-97: both objects present with `services` tab and no `projects` tab |
| 9 | sync-role-permissions.js uses setDoc (not updateDoc) for NOT FOUND branch | VERIFIED | Lines 145-161: `await setDoc(doc(db, 'role_templates', roleId), {...})` in the NOT FOUND branch |

### Must-Have Truths (from Plan 02 frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super Admin can assign services_admin/services_user roles via approval dropdown | VERIFIED | user-management.js lines 648-649: both options in approvalRoleSelect (7 options total) |
| 2 | Super Admin can change active user's role to services_admin/services_user via role-edit modal | VERIFIED | Lines 1515-1516: both options in roleEditSelect with selected binding |
| 3 | Approving as services_admin sets all_services: true on user document | VERIFIED | Lines 729-731: `roleSpecificFields.all_services = true` for services_admin in confirmApproval() |
| 4 | Approving as services_user sets all_services: false on user document | VERIFIED | Lines 732-734: `roleSpecificFields.all_services = false` for services_user in confirmApproval() |
| 5 | handleEditRole() also sets all_services correctly for role changes | VERIFIED | Lines 1416-1421: same roleSpecificFields pattern in handleEditRole() |
| 6 | role-config.js ROLE_ORDER contains services_admin and services_user | VERIFIED | Line 32: `['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'finance', 'procurement']` — 7 entries |
| 7 | role-config.js TABS array contains a services entry | VERIFIED | Line 25: `{ id: 'services', label: 'Services' }` — 8 entries total |
| 8 | role-config.js ROLE_LABELS maps both roles | VERIFIED | Lines 38-39: services_admin and services_user mapped |
| 9 | Permission matrix renders Services row and new columns | VERIFIED (structural) | renderPermissionMatrix() at line 57-90 is data-driven from ROLE_ORDER x TABS; getPermissionValue() at line 148 uses `|| false` fallback |
| 10 | roleLabels in user-management.js render human-readable labels for both roles | VERIFIED | Lines 430-431 (renderUserRow) and lines 1483-1484 (showRoleEditModal) |

### Must-Have Truths (from Plan 03 frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | npm test passes with all existing tests still passing | NEEDS HUMAN | Cannot run emulator; verified by code inspection |
| 2 | New services collection describe block contains at least 13 tests | VERIFIED | Lines 537-636: exactly 13 `it()` blocks in the services describe |
| 3 | services_admin and services_user test users seeded in seedUsers() | VERIFIED | Lines 130-147: both users seeded with correct role, all_services, assigned_service_codes |
| 4 | SVC-001 and SVC-UNASSIGNED service docs seeded | VERIFIED | Lines 149-161: both documents seeded in withSecurityRulesDisabled context |
| 5 | Test confirms operations_user cannot read services collection | VERIFIED | Lines 617-620: `assertFails(getDoc(...))` for active-ops-user |
| 6 | Test confirms operations_admin cannot read services collection | VERIFIED | Lines 622-625: `assertFails(getDoc(...))` for active-ops-admin |
| 7 | Test confirms services_admin can create service documents | VERIFIED | Lines 550-559: `assertSucceeds(setDoc(...))` for active-services-admin |
| 8 | Test confirms services_user can get individual service but cannot write | VERIFIED | Lines 582-595: assertSucceeds for getDoc, assertFails for setDoc |
| 9 | Test confirms finance can read services | VERIFIED | Lines 597-600 |
| 10 | Test confirms procurement can read services | VERIFIED | Lines 612-615 |
| 11 | Test confirms finance CANNOT write to services | VERIFIED | Lines 602-610 |
| 12 | SEC-08 is NOT tested in Phase 26 | VERIFIED | No department field tests exist in test/firestore.test.js |

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `firestore.rules` | services collection access control with isAssignedToService() | VERIFIED | 334-line file; services block at lines 308-332; helper at lines 49-55 |
| `scripts/sync-role-permissions.js` | role template seeding for services_admin and services_user | VERIFIED | Lines 69-97: both templates; setDoc at lines 147-161 |
| `app/views/user-management.js` | services role options in approval and role-edit modals | VERIFIED | 1800+ line file; all 6 required insertion sites confirmed |
| `app/views/role-config.js` | permission matrix with services roles and services tab | VERIFIED | TABS (8 entries), ROLE_ORDER (7 entries), ROLE_LABELS (7 keys) |
| `test/firestore.test.js` | automated test suite for services collection security rules | VERIFIED (code inspection) | Lines 537-636: 13-test describe block; seedUsers extended at lines 129-162 |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| firestore.rules isAssignedToService() | allow list rule for services_user | isRole('services_user') && isAssignedToService(...) | VERIFIED | Line 321: exact pattern present |
| scripts/sync-role-permissions.js NOT FOUND branch | Firestore role_templates collection | setDoc (upsert) | VERIFIED | Lines 147-161: setDoc called with correct schema |
| user-management.js confirmApproval() | Firestore users/{userId} | updateDoc sets all_services based on selected role | VERIFIED | Lines 728-741: roleSpecificFields spread into updateDoc |
| user-management.js handleEditRole() | Firestore users/{userId} | updateDoc sets all_services based on new role | VERIFIED | Lines 1415-1431: same roleSpecificFields pattern |
| role-config.js ROLE_ORDER | permission matrix columns | ROLE_ORDER.map() in renderPermissionMatrix() | VERIFIED | Line 58: `ROLE_ORDER.map(roleId => ...)` drives column generation |
| test/firestore.test.js seedUsers() | testEnv.withSecurityRulesDisabled | seeds active-services-admin and SVC-001 | VERIFIED | Lines 129-162: all four documents seeded |
| test/firestore.test.js services describe block | firestore.rules services match block | testEnv.authenticatedContext('active-services-admin').firestore() | VERIFIED | Line 546: correct UID used in authenticatedContext |

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ROLE-01 | 26-01 | services_admin role created | VERIFIED | sync-role-permissions.js lines 69-81; firestore.rules line 314 |
| ROLE-02 | 26-01 | services_user role created | VERIFIED | sync-role-permissions.js lines 83-97; firestore.rules line 314 |
| ROLE-03 | 26-01 | services_admin can create, edit, delete services | VERIFIED | firestore.rules lines 325-331 |
| ROLE-04 | 26-01 | services_admin can manage service assignments | VERIFIED (partial) | Security rules allow services_admin full write access; actual assignment UI deferred to Phase 28 |
| ROLE-05 | 26-01 | services_admin sees all services (all_services flag) | VERIFIED | isAssignedToService() returns true when all_services == true (line 53) |
| ROLE-06 | 26-01 | services_user sees only assigned services | VERIFIED | firestore.rules line 321: isAssignedToService() scopes list queries |
| ROLE-07 | 26-02 | Super Admin can configure services roles in Settings | VERIFIED | user-management.js: both dropdowns + approval logic; role-config.js: matrix columns |
| ROLE-08 | 26-01 | Super Admin sees both departments | VERIFIED | super_admin in all services rules AND all existing project/MRF rules |
| ROLE-09 | 26-01 | Finance sees both departments | VERIFIED | firestore.rules lines 314, 320: finance in get and list |
| ROLE-10 | 26-01 | Procurement sees both departments | VERIFIED | firestore.rules lines 314, 320: procurement in get and list |
| ROLE-11 | 26-02 | Permission changes take effect immediately | VERIFIED (structural) | Permission matrix is data-driven; ROLE_ORDER/TABS/ROLE_LABELS additions sufficient; onSnapshot infrastructure from Phase 6 picks up new role_templates automatically |
| SEC-01 | 26-01 | Firebase Security Rules enforce services collection access by role | VERIFIED | firestore.rules lines 308-332 |
| SEC-02 | 26-01 | services_admin can read/write all services | VERIFIED | firestore.rules lines 314, 320, 325, 328, 331 |
| SEC-03 | 26-01 | services_user can read only assigned services | VERIFIED | firestore.rules lines 314 (get), 321 (list scoped) |
| SEC-04 | 26-01 | services_user cannot write to services collection | VERIFIED | services_user absent from create/update/delete rules |
| SEC-05 | 26-01 | Super Admin bypasses services role checks | VERIFIED | super_admin in all five services rules |
| SEC-06 | 26-01 | Finance and Procurement can read services for cross-department | VERIFIED | firestore.rules lines 314, 320 |
| SEC-07 | 26-03 | Security Rules validated with automated tests | VERIFIED (code inspection) | 13-test describe block exists with correct logic; emulator run needed |
| SEC-08 | 26-03 (claimed) | Department field enforced on all new MRFs, PRs, POs, TRs | FAILED | No implementation exists. Correctly deferred to Phase 29 in all plan bodies, but INCORRECTLY marked complete in 26-03-SUMMARY.md frontmatter and REQUIREMENTS.md traceability table |

### Orphaned Requirements Check

All 19 requirement IDs declared in the three plans (ROLE-01 through ROLE-11, SEC-01 through SEC-08) are mapped to Phase 26 in REQUIREMENTS.md. No orphaned requirements found.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/phases/26-security-roles-foundation/26-03-SUMMARY.md` | 38 | `requirements-completed: [SEC-07, SEC-08]` in frontmatter contradicts plan body which says "SEC-08 deferred" | Warning | Tracking inconsistency — REQUIREMENTS.md marks SEC-08 as Phase 26 Complete, which is false |
| `.planning/REQUIREMENTS.md` | 151 | `SEC-08 \| Phase 26 \| Complete` in traceability table | Warning | SEC-08 has no implementation in Phase 26 code; will cause confusion when Phase 29 attempts to implement it |

No code-level anti-patterns (TODOs, stubs, empty implementations) were found in the modified source files.

## Human Verification Required

### 1. Firebase Emulator Test Run

**Test:** Start Firebase emulator (`firebase emulators:start --only firestore`) then run `npm test` from project root.
**Expected:** 28 existing tests + 13 new services collection tests = 41 total passing, 0 failures. The `describe("services collection - role access")` block should show 13 green tests.
**Why human:** Emulator was not running during verification. Test logic, seed data, and assertSucceeds/assertFails usage were verified by code inspection and are correct per the plan specification. The emulator run is required to confirm:
  - Rules syntax compiles without errors
  - The `allow list` scoping for services_user (Test 13) actually fails as expected (getDocs query behavior with isAssignedToService())
  - No async or import errors in the test runner

## Gaps Summary

One gap exists — it is a documentation and tracking error, not a code implementation failure:

**SEC-08** ("Department field enforced on all new MRFs, PRs, POs, TRs going forward") was always scoped out of Phase 26. All three plan bodies, the RESEARCH.md, and the plan's `must_haves.truths` (which explicitly say "SEC-08 is NOT tested in Phase 26") correctly reflect this. However:

1. The `26-03-SUMMARY.md` frontmatter at line 38 claims `requirements-completed: [SEC-07, SEC-08]` — this is incorrect.
2. The `REQUIREMENTS.md` traceability table marks `SEC-08 | Phase 26 | Complete` — this is incorrect.

The practical consequence: if a future planning pass reads REQUIREMENTS.md and sees SEC-08 as complete, it will not schedule the Phase 29 work needed to actually implement department field enforcement on MRFs/PRs/POs/TRs. This is a planning integrity gap.

**Resolution options (choose one):**
- Correct the 26-03-SUMMARY.md frontmatter and REQUIREMENTS.md traceability to mark SEC-08 as deferred/pending Phase 29
- Accept that SEC-08 is entirely Phase 29 scope and ensure the Phase 29 plan includes it

The 18 remaining must-haves (all code implementation items) are fully verified. The phase goal of "Firebase Security Rules and role templates enable Services department isolation" is achieved.

---

*Verified: 2026-02-18*
*Verifier: Claude (gsd-verifier)*
