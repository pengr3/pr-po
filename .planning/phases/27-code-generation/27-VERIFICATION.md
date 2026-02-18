---
phase: 27-code-generation
verified: 2026-02-18T12:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 27: Code Generation Verification Report

**Phase Goal:** Services and Projects share CLMC_CLIENT_YYYY### sequence without collisions
**Verified:** 2026-02-18T12:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | A service created after a project for the same client/year receives the next sequence number without collision — generateServiceCode queries both projects and services collections in parallel via Promise.all | VERIFIED | `app/utils.js` line 269: `const [projectsSnap, servicesSnap] = await Promise.all([...])`. Both `collection(db, 'projects')` (line 271) and `collection(db, 'services')` (line 277) queried. `maxNum` computed across both result sets (lines 287–294). Return at line 297 increments and pads. |
| 2 | getAssignedServiceCodes() returns null for all roles except services_user (and for services_user with all_services=true), and returns an array for scoped services_user | VERIFIED | `app/utils.js` line 313–322. Guard at line 315: not logged in → null. Guard at line 316: `user.role !== 'services_user'` → null. Guard at line 318: `user.all_services === true` → null. Otherwise returns `user.assigned_service_codes` array or empty array. |
| 3 | Both functions are exported from app/utils.js and registered on window | VERIFIED | `export async function generateServiceCode` (line 262), `export function getAssignedServiceCodes` (line 313). Both in `window.utils` object (lines 519–520). Standalone: `window.generateServiceCode = generateServiceCode` (line 535), `window.getAssignedServiceCodes = getAssignedServiceCodes` (line 536). |
| 4 | Users collection assigned_service_codes and all_services fields pre-exist from Phase 26 — Phase 27 reads them via getAssignedServiceCodes() | VERIFIED | Phase 27 only reads `user.all_services` and `user.assigned_service_codes` from the user object returned by `window.getCurrentUser?.()` (line 314). Writing these fields is Phase 26's responsibility (SUMMARY confirms ROLE-01 through ROLE-11, SEC-01 through SEC-07 all complete). Phase 27 adds the read-side utility only. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/utils.js` | generateServiceCode() and getAssignedServiceCodes() functions | VERIFIED | Both functions present. generateServiceCode at line 262 (41 lines, substantive async body with Promise.all, regex parsing, max computation). getAssignedServiceCodes at line 313 (10 lines, substantive sync body with three conditional guards). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/utils.js generateServiceCode()` | Firestore projects collection | getDocs parallel query in Promise.all | WIRED | `Promise.all` at line 269; `collection(db, 'projects')` at line 271 inside the Promise.all |
| `app/utils.js generateServiceCode()` | Firestore services collection | getDocs parallel query in Promise.all | WIRED | `collection(db, 'services')` at line 277 inside the same Promise.all |
| `app/utils.js` | window | `window.generateServiceCode = generateServiceCode` | WIRED | Line 535 confirmed by grep |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SERV-02 | 27-01-PLAN.md | Service code generation shares sequence with Projects (global counter per client/year) | SATISFIED | generateServiceCode() queries both `projects` and `services` via Promise.all and takes max across both result sets before incrementing. A project code CLMC_ACME_2026001 already in Firestore means the next service code will be CLMC_ACME_2026002, not CLMC_ACME_2026001. REQUIREMENTS.md traceability table marks SERV-02 as Complete at Phase 27. |

No orphaned requirements. REQUIREMENTS.md traceability table maps only SERV-02 to Phase 27.

### Anti-Patterns Found

No anti-patterns found. Grep for TODO/FIXME/PLACEHOLDER/placeholder/coming soon returned zero matches in `app/utils.js`. No empty implementations (`return null`, `return {}`, `return []`, `=> {}`) in the new functions. No console.log-only implementations.

### Human Verification Required

#### 1. Firestore Composite Index Requirement

**Test:** Open browser console at http://localhost:8000, ensure a test user is logged in or not, then run:
```javascript
window.generateServiceCode('TEST').then(code => console.log(code)).catch(e => console.error(e));
```
**Expected:** A string matching `/^CLMC_TEST_\d{4}\d{3}$/` logged, no 400/failed-precondition errors. A 404 or index-building error from Firestore for the `services` collection is acceptable if the collection has no documents yet (empty snapshot is handled). A `failed-precondition` error mentioning a required index is NOT acceptable and would require creating composite indexes in Firebase console for (`client_code` + `service_code` range).

**Why human:** Cannot verify Firestore composite index existence programmatically without connecting to the live Firebase project.

#### 2. Role Guard Behaviour for services_user with No Assignments

**Test:** In user management, create or find a `services_user` account with no assigned services and `all_services` not set to true. Log in as that user. Open console and run:
```javascript
console.log(window.getAssignedServiceCodes()); // expected: []
```
**Expected:** Empty array `[]`, not null.

**Why human:** Requires a live user session with the correct role; cannot simulate `window.getCurrentUser()` return value programmatically in this verification.

### Gaps Summary

No gaps. All four must-have truths are verified by direct code inspection of `app/utils.js`. All key links are present and wired. SERV-02 is the only requirement mapped to Phase 27 and it is satisfied. No blocker anti-patterns detected.

The only open items are routine human smoke-tests for Firestore index availability and live role-guard behaviour — neither is a gap in the implementation.

---

## Detailed Evidence

### generateServiceCode() — Full Implementation (lines 262–302)

- Signature: `export async function generateServiceCode(clientCode, year = null)` — matches plan spec
- `rangeMin`/`rangeMax` computed for year-scoped range query (lines 265–266)
- `Promise.all` at line 269 issues two concurrent `getDocs` calls:
  - Query 1: `projects` where `client_code == clientCode` AND `project_code` in range (lines 270–275)
  - Query 2: `services` where `client_code == clientCode` AND `service_code` in range (lines 276–281)
- Shared `maxNum` initialised to 0 (line 285)
- `projectsSnap.forEach` extracts sequence number from `project_code` via regex (lines 287–290)
- `servicesSnap.forEach` extracts sequence number from `service_code` via regex (lines 292–295)
- Return: `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}` (line 297)
- Error path: `console.error` + rethrow (lines 299–301)

### getAssignedServiceCodes() — Full Implementation (lines 313–322)

- Signature: `export function getAssignedServiceCodes()` — sync, no parameters, mirrors getAssignedProjectCodes
- Guard 1 (line 315): not logged in → `return null`
- Guard 2 (line 316): `user.role !== 'services_user'` → `return null` (all non-scoped roles pass through here)
- Guard 3 (line 318): `user.all_services === true` → `return null` (escape hatch)
- Default (line 321): returns `user.assigned_service_codes` array if array, else `[]`

### Imports — No New Imports Added

Line 6: `import { db, collection, getDocs, getDoc, updateDoc, doc, query, where, orderBy, limit, arrayUnion, arrayRemove } from './firebase.js';`

`getDocs`, `collection`, `query`, and `where` were all already imported. Plan constraint satisfied — no new imports added.

### No Existing Functions Modified

`generateProjectCode()` (lines 192–226) and `getAssignedProjectCodes()` (lines 237–246) are unchanged. The window.utils block gained two new entries (`generateServiceCode` at line 519, `getAssignedServiceCodes` at line 520) via insertion only.

---

_Verified: 2026-02-18T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
