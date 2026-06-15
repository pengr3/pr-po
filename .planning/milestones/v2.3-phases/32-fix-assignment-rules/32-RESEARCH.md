# Phase 32: Fix Firestore Assignment Rules - Research

**Researched:** 2026-02-19
**Domain:** Firestore Security Rules — users collection update permissions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- `services_admin` update access is restricted to user documents where `role == 'services_user'` — cannot update documents for other roles (operations_admin, finance, super_admin, etc.)
- Field-level restriction within that document: Claude decides based on how existing assignment rules handle similar writes (e.g., whether assigned_project_codes writes are field-restricted)
- Get permission for `services_admin` on user docs: Claude decides based on whether `syncServicePersonnelToAssignments()` requires a preceding read, and what the existing operations_admin pattern does
- The services_user document scope restriction takes priority over mirroring operations_admin (which has no such restriction)
- Add emulator tests to `firestore.test.js` for the new users collection rules
- Automated tests must pass first (emulator), then production deploy with manual checklist

### Claude's Discretion

- Exact field restriction syntax in the rules (if any)
- Whether services_admin needs get/read permission on user docs (based on syncServicePersonnelToAssignments implementation)
- Which specific test cases cover the new rules
- Which manual verification steps to include in the plan checklist

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ASSIGN-03 | Personnel changes automatically sync to user's assigned_service_codes array | Rule fix enables `syncServicePersonnelToAssignments()` to call `updateDoc` without permission-denied error |
| ASSIGN-04 | services_user filtered views show only assigned services | Populated `assigned_service_codes` array enables `getAssignedServiceCodes()` to return non-empty result; `applyServiceFilters()` then scopes the list |
| ASSIGN-06 | Assignment changes propagate via real-time listeners (no logout required) | After rule fix, `auth.js` Firestore listener on user doc detects `assigned_service_codes` change and dispatches `assignmentsChanged` event; `services.js` listener re-filters |
| ROLE-06 | services_user sees only assigned services | Depends on `assigned_service_codes` being populated — directly enabled by ASSIGN-03 |
| ROLE-11 | Permission changes take effect immediately (real-time updates) | `assignmentsChanged` dispatch in `auth.js` already handles this; only needs the underlying data to be written |
| SEC-03 | services_user can read only assigned services | Firestore `isAssignedToService()` check on `list` rule requires populated `assigned_service_codes` in the user doc |
</phase_requirements>

---

## Summary

Phase 32 is a targeted Firestore Security Rules fix. The root cause is that `services_admin` cannot write to `services_user` documents in the `users` collection. When `syncServicePersonnelToAssignments()` fires after a service personnel change, it calls `updateDoc` on user documents to append/remove entries from `assigned_service_codes`. This write is currently denied by Firestore rules, causing a permission-denied error and leaving `assigned_service_codes` empty for `services_user` accounts.

The fix requires adding one `||` clause to the existing `update` rule in the `users` collection match block — mirroring the existing `operations_admin` pattern but scoped to documents where `resource.data.role == 'services_user'`. A `get` permission clause for `services_admin` reading `services_user` documents is also needed because `syncServicePersonnelToAssignments()` performs a preceding `getDoc` to check the `all_services` flag before updating. The `operations_admin` update rule already uses the same `get` pattern; `services_admin` needs the same.

No field-level restrictions are applied to these writes — the existing `operations_admin` pattern for `assigned_project_codes` has no field-level restriction, and mirroring that pattern is correct. Adding field-level restrictions would require a more complex rules expression and is not warranted given the controlled code path. After the rules change, emulator tests must be added to `test/firestore.test.js` covering positive and negative cases, then the rules must be deployed to production using `firebase deploy --only firestore:rules`.

**Primary recommendation:** Add `services_admin` to the `users` collection `get` and `update` rules, scoped to documents where `resource.data.role == 'services_user'`, matching the `operations_admin` pattern. No field-level restrictions. Add 4-5 targeted emulator tests. Deploy to production.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Security Rules | rules_version '2' | Declarative server-side access control | Already in use; project standard |
| `@firebase/rules-unit-testing` | ^3.0.4 (root), ^3.0.0 (test/) | Emulator-based rules testing | Already installed and configured |
| `firebase` | ^10.7.1 | Firestore SDK for test assertions | Already installed |
| `mocha` | ^10.7.3 (root), ^10.2.0 (test/) | Test runner | Already configured in both `package.json` files |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Firebase Emulator Suite | Configured in `firebase.json` | Local rules evaluation without production writes | All rule testing — emulator port 8080 |
| Firebase CLI | Installed globally | `firebase deploy --only firestore:rules` | Production deployment |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Field-level restriction (`request.resource.data.keys().hasOnly(...)`) | No field restriction | Field restriction adds complexity with no real security gain given controlled code path; existing ops_admin pattern does not use field restrictions |

**Installation:** No new packages needed — all dependencies already installed.

---

## Architecture Patterns

### Current users Collection Rule (Exact Source)

From `C:/Users/Admin/Roaming/pr-po/firestore.rules` lines 60-87:

```javascript
match /users/{userId} {
  // Get: own doc OR super_admin OR (operations_admin AND target is operations_user)
  allow get: if isSignedIn() && (
    request.auth.uid == userId ||
    isRole('super_admin') ||
    (isRole('operations_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'operations_user')
  );

  // List: super_admin OR (operations_admin - filtered by client to operations_user only)
  allow list: if isRole('super_admin') || isRole('operations_admin');

  // Create: signed-in user creating own doc AND status is 'pending'
  allow create: if isSignedIn() &&
                   request.auth.uid == userId &&
                   request.resource.data.status == 'pending';

  // Update: super_admin OR (operations_admin AND target is operations_user) OR own doc
  allow update: if isSignedIn() && (
    isRole('super_admin') ||
    (isRole('operations_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'operations_user') ||
    request.auth.uid == userId
  );

  // Delete: super_admin can delete deactivated users only (two-step safety)
  allow delete: if isRole('super_admin') &&
                   get(/databases/$(database)/documents/users/$(userId)).data.status == 'deactivated';
}
```

### Pattern 1: services_admin get and update clauses (recommended)

**What:** Mirror the `operations_admin` pattern exactly, substituting `services_admin` and `services_user`.

**When to use:** Whenever an admin role needs to write to their subordinate role's user documents.

**Example (the exact changes needed):**

```javascript
// Get: own doc OR super_admin OR (operations_admin AND target is operations_user)
//      OR (services_admin AND target is services_user)
allow get: if isSignedIn() && (
  request.auth.uid == userId ||
  isRole('super_admin') ||
  (isRole('operations_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'operations_user') ||
  (isRole('services_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'services_user')
);

// List: super_admin OR operations_admin OR services_admin
allow list: if isRole('super_admin') || isRole('operations_admin') || isRole('services_admin');

// Update: super_admin OR (operations_admin AND target is operations_user)
//         OR (services_admin AND target is services_user) OR own doc
allow update: if isSignedIn() && (
  isRole('super_admin') ||
  (isRole('operations_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'operations_user') ||
  (isRole('services_admin') && get(/databases/$(database)/documents/users/$(userId)).data.role == 'services_user') ||
  request.auth.uid == userId
);
```

**Decision analysis — why `get` is also needed:**

`syncServicePersonnelToAssignments()` (in `app/utils.js` lines 699-713) performs a `getDoc` on `doc(db, 'users', userId)` to check the `all_services` flag before deciding whether to skip the user or proceed with `updateDoc`. This is an explicit read that requires `get` permission on the target user document. The read happens inside a try/catch with graceful fallback if permission fails — but the correct behavior (checking `all_services`) requires the read to succeed. Therefore `services_admin` needs `get` permission on `services_user` documents.

**Decision analysis — no field-level restriction:**

The `operations_admin` pattern for `assigned_project_codes` (in `syncPersonnelToAssignments()`, line 638) uses a simple `updateDoc` with `arrayUnion`/`arrayRemove` on `assigned_project_codes`. No field-level restriction exists in the existing rules for that operation. Mirroring this pattern for `assigned_service_codes` is consistent with the established codebase pattern. Field-level restriction syntax (`request.resource.data.diff(resource.data).affectedKeys().hasOnly(['assigned_service_codes'])`) would prevent `services_admin` from making any other updates to `services_user` docs, but that is not the current pattern and adds unnecessary complexity.

**Decision analysis — list rule:**

The `list` rule needs `services_admin` added for completeness. `loadServiceActiveUsers()` in `services.js` (line 419-443) queries `users` collection with `where('status', '==', 'active')` via `onSnapshot`. This is a list/query operation, not a get. Without `list` permission, this query fails for `services_admin` and the personnel selector dropdown has no data. The fix must add `services_admin` to the `list` rule.

### Pattern 2: Existing test structure

**What:** Each test suite uses `describe()` + `beforeEach(seedUsers)` + `it()` with `assertSucceeds`/`assertFails`.

**When to use:** Follow exactly — the planner must add new test suite block(s) at the end of `test/firestore.test.js`.

**Example (from existing "operations_admin project assignments" suite, lines 376-442):**

```javascript
describe("services_admin user document access", () => {
  beforeEach(seedUsers);

  it("services_admin can get a services_user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "users", "active-services-user")));
  });

  it("services_admin can update assigned_service_codes on a services_user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_service_codes: ["SVC-001", "SVC-002"]
      })
    );
  });

  it("services_admin CANNOT update a non-services_user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-ops-admin"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });

  it("services_admin CANNOT update a finance user document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-finance"), {
        assigned_service_codes: ["SVC-001"]
      })
    );
  });

  it("services_admin CANNOT update a super_admin document", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "active-super-admin"), {
        some_field: "value"
      })
    );
  });
});
```

**Note:** `seedUsers()` already seeds both `active-services-admin` and `active-services-user` with appropriate data (lines 130-147 of `test/firestore.test.js`). No new seed data is required for these test cases. However, negative tests against non-`services_user` roles require that those users also exist in the seed — `active-ops-admin`, `active-finance`, and `active-super-admin` are all seeded by `seedUsers()`.

### Anti-Patterns to Avoid

- **Adding `services_admin` to the `list` rule without adding to `get` and `update`:** The sync function needs both `get` (to check `all_services` flag) and `update` (to write `arrayUnion`/`arrayRemove`). Partial changes leave the bug.
- **Using `resource.data.role` in the update rule without also using it in get:** In Firestore rules, `resource.data` refers to the existing document data. For the update rule, `resource.data.role` is the current role value before the update — this is the correct way to check if the target is a `services_user`. The `get()` function call is the alternative approach (used by `operations_admin`) that explicitly reads the document.
- **Forgetting that two `package.json` files exist:** The test lives in `test/firestore.test.js`. The root `package.json` runs tests with `mocha test/firestore.test.js --exit`. The `test/package.json` runs with `mocha firestore.test.js --exit` (from within the test directory). The emulator must be running on port 8080 before either command executes.
- **Deploying rules without running emulator tests first:** Emulator tests validate rules without touching production data. Always test first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying rule changes locally | Manual `curl` or browser testing | `@firebase/rules-unit-testing` + emulator | Exact rule evaluation, isolated environment, no production side effects |
| Array field updates on user documents | Custom read-modify-write | `arrayUnion` / `arrayRemove` (already used in `syncServicePersonnelToAssignments`) | Atomic operations — no race condition on concurrent updates |

**Key insight:** The rules testing infrastructure is already fully set up. The planner should not create any new infrastructure — only add test cases to the existing file and modify the rules file.

---

## Common Pitfalls

### Pitfall 1: Confusing `resource.data` vs `get()` in update rules

**What goes wrong:** Using `resource.data.role` vs `get(...).data.role` — the former accesses existing document data in the rule evaluation context, the latter performs a billable secondary read. Both work but the `operations_admin` pattern uses `get()` for clarity on the update rule.

**Why it happens:** Firestore rules allow both patterns. The codebase uses `get()` consistently for the role check in both `get` and `update` rules for `operations_admin`.

**How to avoid:** Mirror the `operations_admin` pattern exactly — use `get(/databases/$(database)/documents/users/$(userId)).data.role == 'services_user'` for consistency. This is already cached by Firestore if the same document is read multiple times in a single rule evaluation (only one billable read).

**Warning signs:** Rules that work for `get` but not `update` (or vice versa) due to inconsistent use of `resource.data` vs `get()`.

### Pitfall 2: Emulator not running when tests execute

**What goes wrong:** Tests fail immediately with connection errors, not rule assertion failures.

**Why it happens:** `initializeTestEnvironment` connects to `127.0.0.1:8080` (configured in `firebase.json`). If the emulator isn't running, all tests fail.

**How to avoid:** Start emulator with `firebase emulators:start --only firestore` before running tests. The test command is `npm test` from the repo root (runs `mocha test/firestore.test.js --exit`).

**Warning signs:** Error messages mentioning ECONNREFUSED or "could not connect to emulator" instead of "PERMISSION_DENIED" or assertion failures.

### Pitfall 3: `seedUsers()` does not seed the `active-ops-admin` user with both `role` and adequate fields for negative test assertions

**What goes wrong:** Negative test that calls `updateDoc` on `active-ops-admin` as `active-services-admin` might fail for the wrong reason (e.g., the target doc is missing fields that the rule's `get()` call tries to read).

**Why it happens:** `seedUsers()` sets `active-ops-admin` with `role: "operations_admin"` (line 56-61). This is sufficient — the rule's `get()` call reads `.data.role` which will be `"operations_admin"`, not `"services_user"`, so the update will correctly be denied.

**How to avoid:** The existing `seedUsers()` is sufficient. No additional seeding needed.

**Warning signs:** Tests that fail with "document does not exist" instead of "PERMISSION_DENIED" — check seedUsers() is called in `beforeEach`.

### Pitfall 4: Forgetting the `list` rule requires `services_admin` addition

**What goes wrong:** `services_admin` can `get` and `update` individual user documents, but cannot `list` the users collection to populate the personnel pill selector dropdown in `services.js`.

**Why it happens:** `list` and `get` are separate operations in Firestore rules. `loadServiceActiveUsers()` uses `onSnapshot` with a `where` query, which is a `list` operation.

**How to avoid:** Update the `list` rule: `allow list: if isRole('super_admin') || isRole('operations_admin') || isRole('services_admin');`

**Warning signs:** Personnel dropdown in the Add/Edit Service form is empty for `services_admin` even after rules fix.

---

## Code Examples

Verified patterns from codebase analysis:

### Exact syncServicePersonnelToAssignments write operations

From `C:/Users/Admin/Roaming/pr-po/app/utils.js` lines 678-741:

```javascript
// Called fire-and-forget from services.js addService() and saveServiceEdit()
export async function syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds) {
    // ...
    for (const userId of addedUserIds) {
        try {
            // GET: needs get permission on services_user docs
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists() && userDoc.data().all_services === true) {
                skipUser = true;  // skip if all_services
            }
        } catch (readErr) {
            // graceful fallback -- proceeds with update even if read fails
        }
        // UPDATE: needs update permission on services_user docs
        await updateDoc(doc(db, 'users', userId), {
            assigned_service_codes: arrayUnion(serviceCode)
        });
    }

    for (const userId of removedUserIds) {
        // UPDATE only -- no preceding get for removals
        await updateDoc(doc(db, 'users', userId), {
            assigned_service_codes: arrayRemove(serviceCode)
        });
    }
}
```

**Implication:** The function writes ONLY `assigned_service_codes`. It does not write any other field. This means field-level restrictions to only `assigned_service_codes` would be safe syntactically, but since the existing `operations_admin` pattern does not use field restrictions, we do not add them here.

### assignmentsChanged real-time propagation chain (verified, works once data exists)

From `C:/Users/Admin/Roaming/pr-po/app/auth.js` lines 299-307:

```javascript
// auth.js — Firestore listener on current user's document
if (JSON.stringify(userData.assigned_service_codes) !== JSON.stringify(previousAssignedServiceCodes) ||
    userData.all_services !== previousAllServices) {
    window.dispatchEvent(new CustomEvent('assignmentsChanged', { detail: { user: currentUser } }));
}
```

From `C:/Users/Admin/Roaming/pr-po/app/views/services.js` lines 308-313:

```javascript
// services.js — listener for the event
const assignmentChangeHandler = () => {
    applyServiceFilters();  // re-filters using getAssignedServiceCodes()
};
window.addEventListener('assignmentsChanged', assignmentChangeHandler);
```

**Key finding:** The `assignmentsChanged` event is fired by the user document's `onSnapshot` listener in `auth.js` whenever `assigned_service_codes` changes. This chain is already fully implemented. It only fails today because `syncServicePersonnelToAssignments()` cannot write to the user document (permission denied). Once the rules are fixed, the chain becomes functional end-to-end.

### Emulator test run command

```bash
# From repo root (C:/Users/Admin/Roaming/pr-po):
firebase emulators:start --only firestore
# In separate terminal:
npm test
```

Or from the test subdirectory:

```bash
cd test && npm test
```

### Firebase deploy command for rules

```bash
firebase deploy --only firestore:rules
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Testing rules manually in browser console | `@firebase/rules-unit-testing` with emulator | Phase 8 (rules enforcement) | Deterministic, automated, no production side effects |
| Deploying all Firebase services at once | `firebase deploy --only firestore:rules` | Current project standard | Faster, targeted — only deploys what changed |

**Deprecated/outdated:**
- None applicable to this phase.

---

## Open Questions

1. **Should the `list` rule for `services_admin` also be added?**
   - What we know: `loadServiceActiveUsers()` in `services.js` uses a `where` query (list operation) to populate the personnel pill selector. Without `list` permission, this fails silently (the query returns empty, error is caught and ignored at line 437).
   - What's unclear: Whether the context requires services_admin to list ALL users or just services_user docs. The current `operations_admin` list rule is unrestricted (all users), which is acknowledged as requiring client-side filtering.
   - Recommendation: Add `services_admin` to the `list` rule to match `operations_admin`. Client-side the query already filters by `status == 'active'`, so the Firestore-level restriction is not role-scoped anyway. This is LOW priority for the core fix but needed for the personnel selector to work.

2. **Does `services_admin` need to list users in tests?**
   - What we know: No existing test covers `services_admin` listing users.
   - What's unclear: Whether this is within phase scope.
   - Recommendation: Include a `services_admin can list users` test since the list rule is being modified.

---

## Sources

### Primary (HIGH confidence)

- `C:/Users/Admin/Roaming/pr-po/firestore.rules` — Exact current rules structure, users collection block, all helper functions
- `C:/Users/Admin/Roaming/pr-po/app/utils.js` lines 678-741 — `syncServicePersonnelToAssignments()` complete implementation with all Firestore operations
- `C:/Users/Admin/Roaming/pr-po/app/utils.js` lines 313-322 — `getAssignedServiceCodes()` implementation
- `C:/Users/Admin/Roaming/pr-po/app/auth.js` lines 299-307 — `assignmentsChanged` event dispatch, verified fields watched
- `C:/Users/Admin/Roaming/pr-po/app/views/services.js` lines 308-313 — `assignmentsChanged` handler registration and `applyServiceFilters()` call
- `C:/Users/Admin/Roaming/pr-po/test/firestore.test.js` — Complete test file, test structure, `seedUsers()`, all existing suites
- `C:/Users/Admin/Roaming/pr-po/test/package.json` and `C:/Users/Admin/Roaming/pr-po/package.json` — Test runner configuration
- `C:/Users/Admin/Roaming/pr-po/firebase.json` — Emulator configuration (port 8080)

### Secondary (MEDIUM confidence)

None needed — all findings are from direct codebase inspection.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and in use
- Architecture: HIGH — direct code inspection of all relevant files; no inference required
- Pitfalls: HIGH — derived from direct analysis of existing patterns and known Firestore rules semantics

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable domain — rules and test patterns do not change frequently)
