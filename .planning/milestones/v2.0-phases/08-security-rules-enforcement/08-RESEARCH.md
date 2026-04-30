# Phase 8: Security Rules Enforcement - Research

**Researched:** 2026-02-04
**Domain:** Firebase Firestore Security Rules -- server-side RBAC enforcement, deployment via Firebase CLI, and emulator-based testing
**Confidence:** HIGH (Security Rules syntax and limits verified against official Firebase docs; testing patterns verified against official quickstart; codebase schema verified line-by-line)

---

## Summary

Phase 8 adds the only server-side enforcement layer in this application. Phases 5-7 built client-side permission checks (UI hiding, route blocking, assignment filtering). All of those are bypassable via browser DevTools. Security Rules are the hard boundary: if rules deny a write, Firestore rejects it regardless of what the client code says.

The standard approach for this codebase is a **document-read pattern**: each rule uses `get()` to read the requesting user's document from the `users` collection, extracts their `status` and `role`, then applies per-collection access logic. Custom claims are the alternative (zero read cost, zero latency), but they require the Firebase Admin SDK (Cloud Functions or a backend) to set -- which this project does not have. Therefore `get()` is the only viable path. The cost is one billed read per request evaluation, but document reads to the same path within one evaluation are cached and count as one read. Reading `users/{request.auth.uid}` once and reusing the result in a helper function costs exactly one read per client operation.

The rules must be written, deployed via `firebase deploy --only firestore:rules`, and tested against the Firebase Emulator Suite using `@firebase/rules-unit-testing`. The emulator requires `firebase init` and a `firebase.json` -- neither exists in this repo yet. That is the first artifact this phase produces.

**Primary recommendation:** Write a single `firestore.rules` file with reusable helper functions (`isSignedIn`, `isActiveUser`, `getUserData`, `hasRole`). Each collection gets its own `match` block. Deploy with Firebase CLI. Test with the emulator using `@firebase/rules-unit-testing` v5 (Node.js, not the browser CDN). The test file is a separate Node.js project concern -- it runs in a terminal, not in the SPA.

---

## Standard Stack

The established libraries/tools for Firebase Security Rules in this project:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase CLI | latest (npm -g) | Deploy rules, run emulator | Only way to deploy `firestore.rules` and start the local emulator |
| Firestore Security Rules language | CEL-based DSL | Server-side access control | Built into Firebase; no alternative |
| `@firebase/rules-unit-testing` | 5.0.0 | Unit-test rules against emulator | Official Firebase testing library; the only library that can mock `auth` in rules |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Mocha (or any test runner) | latest | Run test suites | Wraps the rules-unit-testing assertions; any runner works |
| Node.js | 18+ | Run tests | `@firebase/rules-unit-testing` runs in Node, not the browser |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `get()` in rules | Custom claims (`auth.token.role`) | Custom claims require Admin SDK to set (needs Cloud Functions or backend). This project has no backend. Custom claims also have a 1-hour propagation delay after update -- unacceptable given Phase 6's "immediate permission changes" requirement. `get()` is the only option. |
| Emulator unit tests | Firebase Console Rules Playground | Playground tests one scenario at a time manually. Cannot automate. Cannot mock full user documents with assignments. Emulator tests are the only way to verify the full rule set reliably. |
| Per-collection flat rules | Nested match with shared functions | Shared functions reduce duplication. All 9 collections share `isActiveUser` and `hasRole` checks. Without functions, those checks repeat 9+ times. |

**Installation:**
```bash
# Firebase CLI (global, one-time)
npm install -g firebase-tools
firebase login

# In this repo root:
firebase init firestore   # Creates firebase.json + firestore.rules

# Testing dependencies (in repo root or a /test subdirectory)
npm init -y
npm install --save-dev @firebase/rules-unit-testing firebase mocha
```

---

## Architecture Patterns

### Recommended File Structure
```
(repo root)/
├── firestore.rules          # The rules file -- deployed to Firebase
├── firebase.json            # Firebase CLI config (emulators + rules path)
├── package.json             # Only for test dependencies (rules-unit-testing, mocha)
├── test/
│   └── firestore.test.js    # Unit tests for all collections
├── app/                     # (existing) SPA source -- unchanged
├── styles/                  # (existing)
└── index.html               # (existing)
```

**Why rules at repo root:** `firebase init firestore` creates `firestore.rules` at root. The Firebase CLI expects it there (or at the path specified in `firebase.json`). The SPA lives alongside it -- no conflict because the SPA has no build step and Netlify serves static files directly.

**Why package.json at root:** The test tooling (Node.js) needs a package.json. The SPA itself uses zero npm. The package.json serves only the test suite. Netlify ignores it during deployment (it deploys static files, not a Node app).

### Pattern 1: Helper Functions for DRY Rules
**What:** Define reusable functions at the top of the rules file that extract repeated logic (auth check, user document read, role check).
**When to use:** Always. Every collection needs the same auth + status + role checks. Without functions, you write the same `get()` call 9+ times.

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // --- Helper Functions ---

    // Is the request from a signed-in user?
    function isSignedIn() {
      return request.auth != null;
    }

    // Read the user document for the requesting user.
    // Cached: multiple calls to this in one evaluation cost one read.
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    // Is the user's status 'active'?
    function isActiveUser() {
      return isSignedIn() && getUserData().status == 'active';
    }

    // Does the user have one of the listed roles?
    function hasRole(roles) {
      return isActiveUser() && getUserData().role in roles;
    }

    // Does the user have a specific role?
    function isRole(role) {
      return hasRole([role]);
    }

    // --- Collection Rules below ---
  }
}
```

**CRITICAL -- short-circuit evaluation:** Firestore rules use short-circuit `&&`. If `isSignedIn()` is false, `getUserData()` is never called, so no read is billed. Always put `isSignedIn()` first in any chain.

### Pattern 2: Per-Collection Match Blocks
**What:** Each Firestore collection gets its own `match` block with rules tailored to its access semantics.
**When to use:** Always. Firestore does not support "default" rules that apply to all collections uniformly -- each collection may need different read/write logic.

```
    // === users collection ===
    match /users/{userId} {
      // Users can read their own document
      // Super Admin and Ops Admin can read any user document
      allow get: if isSignedIn() && (
        request.auth.uid == userId ||
        hasRole(['super_admin', 'operations_admin'])
      );

      // Users can create their own document (registration)
      allow create: if isSignedIn() && request.auth.uid == userId;

      // Super Admin and Ops Admin can update any user (status/role changes)
      // Users can update their own document
      allow update: if isSignedIn() && (
        hasRole(['super_admin', 'operations_admin']) ||
        request.auth.uid == userId
      );

      allow delete: if false;  // Never allow client-side deletion of users
    }
```

### Pattern 3: Graceful Degradation for Legacy Data (project_code)
**What:** Existing MRF, PR, PO, and TR documents created before Phase 4 may lack the `project_code` field. Rules that require `project_code` to be present will break reads of legacy documents.
**When to use:** On all collections that have `project_code` as a field -- mrfs, prs, pos, transport_requests.

```
    // In mrfs match block:
    // Allow read if user is active AND either:
    //   - user has a role that sees all MRFs, OR
    //   - the MRF has no project_code (legacy data -- always visible), OR
    //   - the MRF's project_code is in the user's assigned_project_codes
    allow list: if isActiveUser() && (
      hasRole(['super_admin', 'operations_admin', 'finance', 'procurement']) ||
      !('project_code' in resource.data) ||
      resource.data.project_code == '' ||
      (isRole('operations_user') && getUserData().assigned_project_codes.hasAll([resource.data.project_code]))
    );
```

**Note on `hasAll` vs manual check:** `list.hasAll([value])` checks that the list contains the value. This is the idiomatic way in CEL to check "value in array". It reads: "the user's assigned_project_codes array has all of [this project_code]" -- which for a single-element list means "contains this project_code."

### Pattern 4: Separating `get` vs `list` Rules
**What:** Firestore distinguishes between `get` (single document read by ID) and `list` (collection query). Rules must explicitly allow both if the app uses both.
**When to use:** Always. The SPA uses `onSnapshot` on collections (which is a `list` operation) AND individual `getDoc` calls (which is a `get` operation). If only `allow read` is used, both are covered. If you need different logic for each, split into `allow get` and `allow list`.

**For this codebase:** Use `allow read` (covers both) for simplicity on most collections. The only collection where `get` and `list` might differ is `users` (admins list all users, but regular users only get their own).

### Anti-Patterns to Avoid
- **`allow read, write: if true`** -- This is the insecure default. Firebase flags this. Never ship with this.
- **Checking `request.resource.data` for reads** -- `request.resource` only exists for write operations. For reads, use `resource.data` (the existing document).
- **Calling `get()` without `isSignedIn()` guard** -- If `request.auth` is null, `request.auth.uid` is undefined and the path is malformed. Always check `isSignedIn()` first via short-circuit `&&`.
- **Relying on client-side `in` queries for project filtering in rules** -- The `in` operator in Firestore queries has a 10-value limit. But in Security Rules, you are not writing queries -- you are evaluating conditions on individual documents. The `in` limit does not apply to rule conditions. The 10-value limit applies to the client-side query itself (the `where('field', 'in', [...])` call). Rules evaluate per-document regardless.
- **Using `deny` explicitly** -- Firestore rules default-deny. An explicit `deny` is unnecessary and can cause confusing conflicts with `allow`. Omit the operation entirely to deny it.

---

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rule syntax validation | Custom linter/parser | Firebase CLI (`firebase deploy --only firestore:rules` fails with parse errors) | CLI gives exact line-number errors. No third-party tool needed. |
| Auth mocking in tests | Custom test harness | `@firebase/rules-unit-testing` `authenticatedContext(uid, token)` | Only this library can inject mock auth tokens that rules actually evaluate. |
| Test data seeding | Manual Firestore writes in test | `testEnv.withSecurityRulesDisabled(async (ctx) => { ... })` | Seeding data must bypass rules (you're setting up preconditions). This is the official API for that. |
| Test isolation | Manual cleanup code | `testEnv.clearFirestore()` in `beforeEach` | Clears all emulator data. Manual cleanup misses documents. |
| Role validation logic | Custom middleware | Firestore Security Rules helper functions | Rules run server-side; no middleware layer exists in a static SPA. |
| Sequential ID generation validation | Client-side duplicate check | Not a rules concern -- leave to client | Rules cannot efficiently query for max ID. Sequential IDs are a client-side responsibility. |

**Key insight:** The testing library (`@firebase/rules-unit-testing`) is the single most important "don't hand-roll" item. It is the only way to test rules against mocked auth states. Everything else in the test is standard Node.js + assertions.

---

## Common Pitfalls

### Pitfall 1: get() Read Costs Even on Denied Requests
**What goes wrong:** Every `get()` or `exists()` call in a rule is billed as a Firestore document read, even if the rule ultimately denies access.
**Why it happens:** Firestore evaluates the rule condition before deciding to allow/deny. The read happens during evaluation.
**How to avoid:** Use short-circuit `&&`. Put `isSignedIn()` before any `get()` call. If the user is not signed in, `getUserData()` is never called. Also: reading the same document multiple times in one evaluation is cached -- only one read is billed. The `getUserData()` helper can be called multiple times safely.
**Warning signs:** Unexpected read quota usage on the Firebase console. High read counts with low actual client operations.

### Pitfall 2: get() Call Limit Per Evaluation
**What goes wrong:** Rules fail with `permission-denied` even though the logic looks correct.
**Why it happens:** Firestore allows a maximum of 10 document access calls (`get()` / `exists()`) per single-document request evaluation, and 20 per batch/transaction. Exceeding the limit silently returns permission-denied.
**How to avoid:** Count your unique document paths accessed in rules. For this codebase: the only document read needed is `users/{uid}`. That is 1 unique path. Even if called multiple times via helper functions, it is cached as 1 read. You are well within the 10-call limit.
**Warning signs:** Rules work for simple operations but fail for batch writes or transactions.

### Pitfall 3: Confusing `get` vs `list` Rules
**What goes wrong:** Single-document reads work, but collection queries (`onSnapshot` on a collection) fail with permission-denied.
**Why it happens:** `allow get` only covers single-document reads. Collection queries require `allow list`. The app uses both patterns extensively (e.g., `onSnapshot(collection(db, 'mrfs'))` is a `list`).
**How to avoid:** Use `allow read` (shorthand for both `get` and `list`) unless you need different logic per operation type.
**Warning signs:** `getDoc` works but `onSnapshot` on a collection throws `permission-denied`.

### Pitfall 4: Rules Propagation Delay
**What goes wrong:** Rules are deployed but new operations still use old rules.
**Why it happens:** Rule changes can take up to 10 minutes to fully propagate to active listeners.
**How to avoid:** After deploying rules, refresh the page (forces new listeners). For testing, use the emulator (instant propagation).
**Warning signs:** Rules work in the emulator but fail in production after fresh deploy.

### Pitfall 5: Legacy Data Missing project_code
**What goes wrong:** Operations User can't see any MRFs, or sees MRFs they shouldn't.
**Why it happens:** MRFs created before Phase 4 have no `project_code` field. If rules require `project_code` to be present, those documents are invisible. If rules accidentally allow all documents without `project_code`, that's a security gap.
**How to avoid:** Treat missing or empty `project_code` as "visible to all active users" during the migration window. The rule condition is: `!('project_code' in resource.data) || resource.data.project_code == ''`. This matches the client-side defensive pattern already in procurement.js (line 501-502).
**Warning signs:** Operations Users see zero MRFs in procurement, or Super Admin sees fewer MRFs than expected.

### Pitfall 6: Testing Against Production Instead of Emulator
**What goes wrong:** Tests pass but production behavior is wrong, or tests fail with `ECONNREFUSED`.
**Why it happens:** If the emulator is not running, `@firebase/rules-unit-testing` may fall through to production Firebase. If it connects to production, the test auth mocking does not work.
**How to avoid:** Always start the emulator before running tests: `firebase emulators:start --only firestore`. Verify the emulator UI is accessible at `http://localhost:4000`.
**Warning signs:** `ECONNREFUSED` errors, or tests that "pass" but don't actually test anything (no assertions fire).

### Pitfall 7: `assigned_project_codes` Field Missing on Non-operations_user Roles
**What goes wrong:** Rules crash when checking `getUserData().assigned_project_codes` for a user who does not have that field.
**Why it happens:** Only `operations_user` documents have `assigned_project_codes`. All other roles lack the field entirely. Accessing a non-existent field in CEL returns an error, not null.
**How to avoid:** Only check `assigned_project_codes` after confirming the role is `operations_user`. Structure the rule as: `hasRole(['super_admin', ...other roles...]) || (isRole('operations_user') && ...)`. Short-circuit `||` ensures the assignment check only runs for operations_user.
**Warning signs:** Permission-denied for non-operations_user roles on collections that have project_code checks.

---

## Code Examples

Verified patterns from official Firebase documentation and codebase analysis:

### Complete firestore.rules Skeleton
```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // =============================================
    // HELPER FUNCTIONS
    // =============================================

    function isSignedIn() {
      return request.auth != null;
    }

    // Read the current user's document. Cached per evaluation -- one billable read.
    function getUserData() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function isActiveUser() {
      return isSignedIn() && getUserData().status == 'active';
    }

    function hasRole(roles) {
      return isActiveUser() && getUserData().role in roles;
    }

    function isRole(role) {
      return hasRole([role]);
    }

    // Check if an operations_user is assigned to a given project_code.
    // Only call this after confirming role is operations_user.
    function isAssignedToProject(projectCode) {
      return getUserData().all_projects == true ||
             projectCode in getUserData().assigned_project_codes;
    }

    // =============================================
    // users collection
    // =============================================
    match /users/{userId} {
      allow get: if isSignedIn() && (
        request.auth.uid == userId ||
        hasRole(['super_admin', 'operations_admin'])
      );

      allow list: if hasRole(['super_admin', 'operations_admin']);

      allow create: if isSignedIn() && request.auth.uid == userId;

      allow update: if isSignedIn() && (
        hasRole(['super_admin', 'operations_admin']) ||
        request.auth.uid == userId
      );

      allow delete: if false;
    }

    // =============================================
    // roles (role_templates) collection
    // =============================================
    match /role_templates/{roleId} {
      // All active users can read role templates (permissions module needs this)
      allow get: if isActiveUser();
      allow list: if isActiveUser();

      // Only Super Admin can modify role templates
      allow write: if isRole('super_admin');
    }

    // =============================================
    // invitation_codes collection
    // =============================================
    match /invitation_codes/{codeId} {
      // Super Admin creates codes; any signed-in user can read (for validation during registration)
      allow get: if isSignedIn();
      allow list: if isSignedIn();

      allow create: if isRole('super_admin');

      // Any signed-in user can update (to mark as used during registration)
      allow update: if isSignedIn();

      allow delete: if false;
    }

    // =============================================
    // projects collection
    // =============================================
    match /projects/{projectId} {
      allow read: if isActiveUser();

      allow create: if hasRole(['super_admin', 'operations_admin']);

      allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);

      allow delete: if hasRole(['super_admin', 'operations_admin']);
    }

    // =============================================
    // mrfs collection
    // =============================================
    match /mrfs/{mrfId} {
      // Read: all active users can list, but operations_user is project-scoped
      allow list: if isActiveUser() && (
        hasRole(['super_admin', 'operations_admin', 'finance', 'procurement']) ||
        (isRole('operations_user') && (
          !('project_code' in resource.data) ||
          resource.data.project_code == '' ||
          isAssignedToProject(resource.data.project_code)
        ))
      );

      allow get: if isActiveUser();

      // Create: operations_user, operations_admin, procurement, super_admin
      allow create: if hasRole(['super_admin', 'operations_admin', 'operations_user', 'procurement']);

      // Update: operations_admin, super_admin (approve/reject), procurement (edit)
      allow update: if hasRole(['super_admin', 'operations_admin', 'procurement']);

      allow delete: if hasRole(['super_admin', 'operations_admin']);
    }

    // =============================================
    // prs collection
    // =============================================
    match /prs/{prId} {
      allow read: if isActiveUser();

      allow create: if hasRole(['super_admin', 'operations_admin', 'procurement']);

      allow update: if hasRole(['super_admin', 'operations_admin', 'finance', 'procurement']);

      allow delete: if hasRole(['super_admin', 'operations_admin', 'procurement']);
    }

    // =============================================
    // pos collection
    // =============================================
    match /pos/{poId} {
      allow read: if isActiveUser();

      allow create: if hasRole(['super_admin', 'finance']);

      allow update: if hasRole(['super_admin', 'finance', 'procurement']);

      allow delete: if hasRole(['super_admin']);
    }

    // =============================================
    // transport_requests collection
    // =============================================
    match /transport_requests/{trId} {
      allow read: if isActiveUser();

      allow create: if hasRole(['super_admin', 'operations_admin', 'operations_user', 'procurement']);

      allow update: if hasRole(['super_admin', 'operations_admin', 'finance', 'procurement']);

      allow delete: if hasRole(['super_admin', 'operations_admin', 'procurement']);
    }

    // =============================================
    // suppliers collection
    // =============================================
    match /suppliers/{supplierId} {
      allow read: if isActiveUser();

      allow create: if hasRole(['super_admin', 'procurement']);

      allow update: if hasRole(['super_admin', 'procurement']);

      allow delete: if hasRole(['super_admin', 'procurement']);
    }

    // =============================================
    // deleted_mrfs collection (soft-delete archive)
    // =============================================
    match /deleted_mrfs/{deletedMrfId} {
      allow read: if hasRole(['super_admin', 'operations_admin']);

      allow create: if hasRole(['super_admin', 'operations_admin']);

      // No update or delete -- archive is append-only
      allow update: if false;
      allow delete: if false;
    }
  }
}
```

### firebase.json (minimal config for rules + emulator)
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

### Test File Structure (test/firestore.test.js)
```javascript
import fs from "fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { setDoc, getDoc, collection, doc } from "firebase/firestore";
import { after, afterEach, before, beforeEach, describe, it } from "mocha";

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "clmc-procurement",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Seed common test data (bypasses rules)
async function seedUserAndRoles(context) {
  await context.firestore().doc("users/active-super-admin").set({
    email: "admin@test.com",
    status: "active",
    role: "super_admin"
  });
  await context.firestore().doc("users/active-ops-user").set({
    email: "opsuser@test.com",
    status: "active",
    role: "operations_user",
    assigned_project_codes: ["CLMC_TEST_2026001"],
    all_projects: false
  });
  await context.firestore().doc("users/pending-user").set({
    email: "pending@test.com",
    status: "pending",
    role: null
  });
}

describe("Unauthenticated access", () => {
  it("denies unauthenticated reads on users", async () => {
    const unauthUser = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(unauthUser.firestore().doc("users/active-super-admin"))
    );
  });
});

describe("users collection", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(seedUserAndRoles);
  });

  it("allows super_admin to read any user", async () => {
    const superAdmin = testEnv.authenticatedContext("active-super-admin");
    await assertSucceeds(
      getDoc(superAdmin.firestore().doc("users/active-ops-user"))
    );
  });

  it("denies operations_user from reading other users", async () => {
    const opsUser = testEnv.authenticatedContext("active-ops-user");
    await assertFails(
      getDoc(opsUser.firestore().doc("users/active-super-admin"))
    );
  });

  it("denies pending users from writing to others", async () => {
    const pendingUser = testEnv.authenticatedContext("pending-user");
    await assertFails(
      setDoc(pendingUser.firestore().doc("users/active-super-admin"), { status: "deactivated" })
    );
  });
});

describe("mrfs collection -- project scoping", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await seedUserAndRoles(context);
      // MRF with project_code
      await context.firestore().doc("mrfs/mrf-assigned").set({
        mrf_id: "MRF-2026-001",
        project_code: "CLMC_TEST_2026001",
        project_name: "Test Project",
        status: "Pending"
      });
      // MRF with different project (not assigned to ops user)
      await context.firestore().doc("mrfs/mrf-unassigned").set({
        mrf_id: "MRF-2026-002",
        project_code: "CLMC_OTHER_2026001",
        project_name: "Other Project",
        status: "Pending"
      });
      // Legacy MRF (no project_code)
      await context.firestore().doc("mrfs/mrf-legacy").set({
        mrf_id: "MRF-2025-001",
        project_name: "Legacy Project",
        status: "Pending"
      });
    });
  });

  it("allows super_admin to read any MRF", async () => {
    const superAdmin = testEnv.authenticatedContext("active-super-admin");
    await assertSucceeds(
      getDoc(superAdmin.firestore().doc("mrfs/mrf-unassigned"))
    );
  });

  it("allows operations_user to read assigned MRF", async () => {
    const opsUser = testEnv.authenticatedContext("active-ops-user");
    await assertSucceeds(
      getDoc(opsUser.firestore().doc("mrfs/mrf-assigned"))
    );
  });
});

// ... additional test blocks for each collection and permission scenario

after(async () => {
  await testEnv.cleanup();
});
```

### Running Tests
```bash
# Terminal 1: Start the Firestore emulator
firebase emulators:start --only firestore

# Terminal 2: Run the test suite
npx mocha test/firestore.test.js --exit
```

### Deploying Rules to Production
```bash
# Deploy ONLY the rules (not indexes or other services)
firebase deploy --only firestore:rules
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `allow read, write: if true` (open rules) | Explicit per-collection rules with auth checks | Standard since Firebase launched | This repo currently has no rules file -- it is implicitly open. Phase 8 closes it. |
| Custom claims for RBAC (requires backend) | `get()` document reads in rules | Always both options existed | Custom claims require Admin SDK. No backend in this project. `get()` is the practical choice. |
| v8 rules-unit-testing API | v9 `initializeTestEnvironment` / `authenticatedContext` | Firebase SDK v9 | v9 API is significantly simpler. Use it. |

**Deprecated/outdated:**
- `initializeTestApp()` (v8 API): Replaced by `initializeTestEnvironment()` in v9. The v8 approach uses `initializeApp` with a `projectId` option. Do not use.
- `RulesTestEnvironment` as a named import: It is NOT exported as a named export in v5. Import only `initializeTestEnvironment`, `assertSucceeds`, `assertFails`.

---

## Open Questions

1. **Role-to-permission mapping accuracy**
   - What we know: The role_templates collection stores per-tab `{ access, edit }` permissions. The rules skeleton above maps roles to collections based on the PROJECT.md role descriptions (Super Admin = full, Operations Admin = projects + MRFs, Finance = approvals + POs, Procurement = MRFs + suppliers).
   - What's unclear: The exact mapping between "tab access" in role_templates and "collection write permission" in rules is an interpretation, not a direct 1:1 map. For example, "procurement tab access" grants the Procurement role write access to mrfs, prs, suppliers -- but the role_templates only store tab-level flags, not collection-level flags.
   - Recommendation: The planner should verify the role-to-collection mapping against the PROJECT.md role descriptions before writing the final rules. The skeleton above is the best interpretation from available data.

2. **`invitation_codes` update permission scope**
   - What we know: Registration flow (`register.js`) marks codes as used via `updateDoc`. The registering user is signed in (they just created their account). But they are `pending` status at that point, not `active`.
   - What's unclear: Should invitation_codes `update` require only `isSignedIn()` (allowing pending users to mark codes used) or `isActiveUser()` (which would block registration)?
   - Recommendation: Use `isSignedIn()` for invitation_codes update. The registration flow requires marking the code as used immediately after account creation, before the user is approved. Restricting to active users would break registration.

3. **Data backfill for existing documents**
   - What we know: PRs, POs, TRs created before Phase 4 may have empty string `project_code` (set via `mrfData.project_code || ''`). The code defensively handles this.
   - What's unclear: Are there actual documents in production Firestore with missing `project_code`? No way to verify without querying production.
   - Recommendation: The rules handle both missing field AND empty string `project_code` as "no project scope -- visible to all active users." This is the safe default during any migration window.

---

## Sources

### Primary (HIGH confidence)
- Firebase Security Rules -- Getting Started: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Security Rules Conditions (get/exists limits, caching, billing): https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase Rules and Auth (auth variable structure): https://firebase.google.com/docs/rules/rules-and-auth
- Firebase Rules Language (CEL, operators, type checking): https://firebase.google.com/docs/rules/rules-language
- Firebase Rules Structure (match, wildcards, nesting): https://firebase.google.com/docs/firestore/security/rules-structure
- Firebase Query Security (get vs list distinction): https://firebase.google.com/docs/firestore/security/rules-query
- Firebase Unit Tests (initializeTestEnvironment, assertSucceeds/Fails): https://firebase.google.com/docs/rules/unit-tests
- Firebase Emulator Setup: https://firebase.google.com/docs/rules/emulator-setup
- Firebase Insecure Rules: https://firebase.google.com/docs/firestore/security/insecure-rules
- Document access call limits (10 per request, 20 per batch): https://firebase.google.com/docs/firestore/security/rules-conditions + https://firebase.google.com/docs/firestore/manage-data/transactions
- `@firebase/rules-unit-testing` npm package: https://www.npmjs.com/package/@firebase/rules-unit-testing
- Codebase: app/auth.js (user document structure, lines 39-46, onSnapshot lines 253-309)
- Codebase: app/permissions.js (role_templates listener, permission check functions)
- Codebase: app/router.js (route definitions, permission map)
- Codebase: app/views/role-config.js (TABS array, ROLE_ORDER -- defines the 5 roles and 7 tabs)
- Codebase: app/views/procurement.js (project_code propagation to PRs/TRs, lines 2672, 2925, 3201, 3261)
- Codebase: app/views/finance.js (project_code propagation to POs, line 989)
- Codebase: app/firebase.js (Firebase SDK v10.7.1 CDN imports, project ID)
- STATE.md: Phase 8 blockers and concerns (data backfill, emulator setup, graceful degradation)
- Phase 7 RESEARCH.md: assigned_project_codes data model, all_projects flag semantics

### Secondary (MEDIUM confidence)
- WebSearch verified: Firebase CLI deploy command (`firebase deploy --only firestore:rules`)
- WebSearch verified: `get()` billing and caching behavior (confirmed against official docs)
- WebSearch verified: `in` operator 10-value limit is a query limit, not a rules limit

### Tertiary (LOW confidence)
- Role-to-collection permission mapping: Inferred from PROJECT.md role descriptions. Not explicitly defined anywhere in the codebase as a rules-level mapping. Planner should verify.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Firebase CLI and @firebase/rules-unit-testing are the only tools in this space; confirmed via official docs
- Architecture (helper functions, per-collection blocks): HIGH -- standard Firebase pattern confirmed in official role-based-access guide and conditions docs
- Pitfalls (get() cost, get vs list, propagation delay): HIGH -- all confirmed against official Firebase documentation with exact quotes
- Code examples (rules skeleton): MEDIUM -- syntax is verified against official docs; role-to-collection mapping is an interpretation from PROJECT.md, not a locked decision
- Testing patterns: HIGH -- initializeTestEnvironment API confirmed against official unit-tests docs and npm package

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days -- Firebase Security Rules syntax is stable; the role-to-collection mapping should be re-verified if PROJECT.md changes)
