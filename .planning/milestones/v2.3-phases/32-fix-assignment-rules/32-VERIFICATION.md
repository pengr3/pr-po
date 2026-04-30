---
phase: 32-fix-assignment-rules
verified: 2026-02-19T00:00:00Z
status: human_needed
score: 5/6 must-haves verified
re_verification: false
human_verification:
  - test: "services_admin assignment write — no permission error"
    expected: "Log in as services_admin, navigate to a service detail page, add a services_user as personnel, save. Browser console shows no FirebaseError: Missing or insufficient permissions."
    why_human: "End-to-end write against production Firebase cannot be verified programmatically; requires live browser session and console observation."
  - test: "services_user sees only assigned services in filtered list view"
    expected: "Log in as services_user who has been assigned to specific service(s). Navigate to Services tab. Only assigned services appear — unassigned services must not be visible."
    why_human: "Filtered list rendering depends on live Firestore data (assigned_service_codes array) and client-side applyServiceFilters(); requires a real browser session with actual user data."
  - test: "Real-time propagation — assignment change reflects without logout"
    expected: "With services_admin and services_user sessions open simultaneously, assign/unassign the services_user from a service. The services_user's list updates in real-time without requiring logout/login."
    why_human: "Real-time behavior requires live onSnapshot listeners and the assignmentsChanged event chain; cannot be traced statically."
  - test: "No regression on operations_admin assignment workflow"
    expected: "Log in as operations_admin. Navigate to a project's assignments. Assign/remove an operations_user. Confirm workflow succeeds — the rules change must not break operations department assignments."
    why_human: "Regression check against production behavior requires live session; structural rules analysis shows no changes to operations_admin conditions, but live verification is the contract."
---

# Phase 32: Fix Firestore Assignment Rules — Verification Report

**Phase Goal:** Add services_admin to users update rule so assignment sync writes succeed and all dependent requirements are satisfied
**Verified:** 2026-02-19
**Status:** human_needed — 5/6 truths verified programmatically; 1 truth (end-to-end sync + filtered view) requires human confirmation per PLAN checkpoint
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | services_admin can call updateDoc on a services_user document without a permission-denied error | VERIFIED | `firestore.rules` line 82: `(isRole('services_admin') && get(...).data.role == 'services_user')` in allow update. Rule uses fresh `get()` read, not `resource.data.role`. Commit `6b271d9`. |
| 2 | syncServicePersonnelToAssignments() completes without throwing a Firestore permission error | VERIFIED | Function at `app/utils.js` lines 678-741 calls `getDoc` (covered by allow get, line 66) then `updateDoc` (covered by allow update, line 82). Rule fix directly unblocks both calls. Both operations wired to correct collection path. |
| 3 | services_user's assigned_service_codes array is populated after services_admin assigns them via personnel field | ? HUMAN NEEDED | Rules enable the write; `syncServicePersonnelToAssignments()` uses `arrayUnion(serviceCode)` at line 716. Population of the array in live Firestore data requires production verification. |
| 4 | getAssignedServiceCodes() returns a non-empty array for a services_user who has been assigned | ? HUMAN NEEDED | `getAssignedServiceCodes()` at `app/utils.js` lines 313-322 reads `window.getCurrentUser()?.assigned_service_codes`. Depends on truth 3 (data written); cannot verify the live data value statically. |
| 5 | services_user sees only assigned services in the filtered list view (not unassigned services) | VERIFIED (structural) | `applyServiceFilters()` in `services.js` lines 755-779 calls `getAssignedServiceCodes()` and filters out unmatched service_codes. `loadServices()` (lines 868-900) scopes the Firestore query with `where('service_code', 'in', assignedCodes)` for services_user. `mrf-form.js` `populateServiceDropdown()` applies same scoping. Verified via grep. Live data requires human check. |
| 6 | All 6 new emulator tests pass (get, list, update-allowed, update-denied x3) | VERIFIED | `test/firestore.test.js` lines 638-690: describe block "services_admin user document access" with exactly 6 `it()` tests matching plan spec. Commit `3743f0b` message states "All 47 tests pass (41 existing + 6 new) — 0 failing" and "Deploy complete!". |

**Score:** 5/6 truths verified (truth 3 and 4 collapse to same human dependency — live data; grouped as one human item)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `firestore.rules` | Updated users collection rules granting services_admin get + list + update access scoped to services_user documents | VERIFIED | Lines 61-88. Contains all 3 additions. get (line 66), list (line 71), update (line 82). All use `get(...).data.role == 'services_user'` pattern. create/delete rules unchanged (lines 73-88). |
| `test/firestore.test.js` | 6 new emulator tests covering services_admin user document access | VERIFIED | Lines 638-690. Describe block "services_admin user document access" with 6 `it()` tests: 3 assertSucceeds (get, list, update), 3 assertFails (ops_admin, finance, super_admin). 690 total lines. |
| `app/views/services.js` (additional fix) | Query scoped to assignedCodes for services_user role | VERIFIED | Lines 868-900 (`loadServices()`): `where('service_code', 'in', assignedCodes)` branch for services_user. Lines 742-832 (`applyServiceFilters()`): client-side filter using `getAssignedServiceCodes()`. 1298 lines total. |
| `app/views/mrf-form.js` (additional fix) | Services dropdown query scoped to assignedCodes for services_user; active===true client-side filter | VERIFIED | Lines 367-435: `populateServiceDropdown()` and query scoping. `assignedCodes !== null` branch uses `where('service_code', 'in', assignedCodes)`, then `active === true` client-side filter. 770 lines total. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `firestore.rules` users allow update (line 82) | `syncServicePersonnelToAssignments()` in `app/utils.js` line 715 | updateDoc on services_user document | WIRED | Rule: `isRole('services_admin') && get(...).data.role == 'services_user'`. Function calls `updateDoc(doc(db, 'users', userId), { assigned_service_codes: arrayUnion(serviceCode) })`. Path is direct. |
| `firestore.rules` users allow get (line 66) | `syncServicePersonnelToAssignments()` getDoc call at line 705 | get permission on target user document | WIRED | Rule: same `isRole('services_admin') && get(...).data.role == 'services_user'` pattern. Function calls `getDoc(doc(db, 'users', userId))` inside try/catch. |
| `firestore.rules` users allow list (line 71) | `loadServiceActiveUsers()` onSnapshot query in `services.js` | where query on users collection | WIRED | Rule: `isRole('super_admin') \|\| isRole('operations_admin') \|\| isRole('services_admin')`. `services.js` imports `getAssignedServiceCodes` from `utils.js` (line 9). `loadServices()` issues scoped onSnapshot at line 883. |
| `auth.js` assigned_service_codes onSnapshot (lines 230, 301) | `assignmentsChanged` event dispatch (line 304) | JSON.stringify comparison triggering CustomEvent | WIRED | `auth.js` lines 230, 301-304: detects change in `assigned_service_codes` and dispatches `assignmentsChanged`. `services.js` line 308-312: listens for `assignmentsChanged` and calls `applyServiceFilters()`. |
| `firestore.rules` projects/edit_history allow create (line 143) | `recordEditHistory()` called from `services.js` | services_admin added to hasRole array | WIRED | Line 143: `hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance'])`. Commit `6e6daac`. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ASSIGN-03 | 32-01-PLAN.md | Personnel changes automatically sync to user's assigned_service_codes array | VERIFIED (structural) | `syncServicePersonnelToAssignments()` uses `arrayUnion`/`arrayRemove` — unblocked by rules fix. Rule in place. Live data confirmation: human needed. |
| ASSIGN-04 | 32-01-PLAN.md | services_user filtered views show only assigned services | VERIFIED (structural) | `loadServices()` scopes query with `where('service_code', 'in', assignedCodes)`; `applyServiceFilters()` applies client-side filter; `populateServiceDropdown()` in `mrf-form.js` does same. Live data: human needed. |
| ASSIGN-06 | 32-01-PLAN.md | Assignment changes propagate via real-time listeners (no logout required) | VERIFIED (structural) | `auth.js` detects `assigned_service_codes` change via onSnapshot, dispatches `assignmentsChanged`. `services.js` and `mrf-form.js` listen and re-filter. Chain is complete in code. Live behavior: human needed. |
| ROLE-06 | 32-01-PLAN.md | services_user sees only assigned services | VERIFIED (structural) | Depends on ASSIGN-03 and ASSIGN-04. Code path complete. Live data: human needed. |
| ROLE-11 | 32-01-PLAN.md | Permission changes take effect immediately (real-time updates) | VERIFIED (structural) | `assignmentsChanged` event chain established in `auth.js` and consumed by `services.js`. No page refresh required by design. Live behavior: human needed. |
| SEC-03 | 32-01-PLAN.md | services_user can read only assigned services | VERIFIED | `firestore.rules` services collection list rule (line 323-326): `(isRole('services_user') && isAssignedToService(resource.data.service_code))`. Query-side scoping in `services.js` ensures the `in` clause prevents unassigned documents from reaching the rule. |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps ASSIGN-03, ASSIGN-04, ASSIGN-06, ROLE-06, ROLE-11, SEC-03 all to Phase 32. All 6 are covered by the plan. No orphaned requirements.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TODO, FIXME, placeholder, stub, or empty-return anti-patterns found in any of the four modified files (`firestore.rules`, `test/firestore.test.js`, `app/views/services.js`, `app/views/mrf-form.js`).

---

## Human Verification Required

### 1. services_admin Assignment Write — No Permission Error

**Test:** Log in as a services_admin account. Navigate to a service detail page. Add a new personnel member (a services_user account). Save. Open browser DevTools Console before saving.
**Expected:** No `FirebaseError: Missing or insufficient permissions` appears in the console. The personnel member is saved successfully.
**Why human:** End-to-end write against production Firebase requires a live browser session and actual user accounts. The rules are deployed (commit `3743f0b` message confirms "Deploy complete!") but live confirmation is the contract per PLAN Task 3 checkpoint.

### 2. services_user Filtered View — Only Assigned Services Visible

**Test:** Log in as the services_user account that was just assigned. Navigate to the Services tab. Inspect the list.
**Expected:** Only the service(s) the user was assigned to appear. Services they are not assigned to must not appear in the list.
**Why human:** Requires live Firestore data (the `assigned_service_codes` array populated by step 1). The filter logic is verified in code, but the data dependency requires a running end-to-end scenario.

### 3. Real-Time Propagation — No Logout Required

**Test:** With both services_admin and services_user sessions open in separate browser windows simultaneously: in the admin session, assign or unassign the services_user from a service. Watch the services_user session's list without refreshing.
**Expected:** The services_user's list updates automatically to reflect the change.
**Why human:** Real-time event propagation (onSnapshot → `assignmentsChanged` → `applyServiceFilters`) requires live Firestore listener behavior that cannot be verified statically.

### 4. No Regression — operations_admin Workflow Unaffected

**Test:** Log in as an operations_admin account. Navigate to a project's assignments. Assign or remove an operations_user. Confirm the action completes without errors.
**Expected:** The operations_admin workflow is unaffected. The users collection rules change only added OR conditions; no existing conditions were modified.
**Why human:** While static analysis confirms the operations_admin conditions (lines 65, 81) are identical to the pre-phase state, regression confirmation against production is best practice for rule changes.

---

## Summary of Findings

**All programmatically verifiable truths pass.**

The phase delivered exactly what the plan required plus two additional fixes discovered during the human verification checkpoint:

1. **Core fix — users collection rules:** `firestore.rules` lines 61-88 contain all three additions (allow get line 66, allow list line 71, allow update line 82), all using the `get(...).data.role == 'services_user'` pattern with fresh document reads. create/delete rules are unchanged.

2. **Additional fix — edit_history create rule:** `firestore.rules` line 143 adds `services_admin` to the projects subcollection create rule, unblocking `recordEditHistory()` called from `services.js`.

3. **Additional fix — query-side scoping:** `app/views/services.js` and `app/views/mrf-form.js` scope Firestore queries with `where('service_code', 'in', assignedCodes)` for services_user, preventing the per-document `isAssignedToService()` rule evaluation from denying unscoped queries.

4. **Test coverage:** 6 new emulator tests at `test/firestore.test.js` lines 638-690 cover all rule paths (3 assertSucceeds, 3 assertFails). Commit message confirms 0 failing tests across 47 total.

5. **Deployment:** Rules deployed to production (commit `3743f0b` message: "Deploy complete!").

6. **Human verification checkpoint (Task 3):** SUMMARY.md records "Human verification: all 4 end-to-end checks passed (assignment write, filtered view, real-time propagation, operations_admin regression)." This is a SUMMARY claim. The PLAN's Task 3 checkpoint is `type: "checkpoint:human-verify" gate: "blocking"` — the human must confirm. Since this verifier cannot observe past human sessions, the 4 human items are listed for confirmation.

The structural code analysis supports that all 6 requirements are satisfied. Human verification of the live end-to-end scenario is required to close the gate.

---

*Verified: 2026-02-19*
*Verifier: Claude (gsd-verifier)*
