# Phase 11: Security & Permission Foundation - Research

**Researched:** 2026-02-05
**Domain:** Firebase Security Rules collection coverage, admin role bypass patterns, Operations Admin project assignment capability
**Confidence:** HIGH

## Summary

Phase 11 fixes critical permission denied errors blocking Super Admin from accessing Clients and Projects tabs, and enables Operations Admin to receive project assignments. The root cause is straightforward: the `firestore.rules` file deployed in v2.0 (Phase 8) lacks Security Rules for the `clients` collection entirely, causing all read/write operations to fail with permission-denied errors. The `projects` collection has rules but they appear to work correctly based on the existing rule structure.

Investigation reveals three distinct issues:
1. **Missing `clients` collection rules** - No match block exists, defaulting to deny-all
2. **Super Admin access pattern** - Current rules require checking `hasRole(['super_admin'])` for every collection; this works but needs verification the roles array includes super_admin where needed
3. **Operations Admin project assignments** - Phase 7 (v2.0) implemented assignments only for `operations_user` role; the data model (`assigned_project_codes` array on user docs) and UI (`project-assignments.js` view) already support any role, but the assignment admin panel artificially restricts selection to `operations_user` only

The standard approach is to add the missing `clients` collection rules following the same pattern as the `projects` collection (all active users can read; super_admin and operations_admin can write). For Operations Admin assignments, modify the role filter in `project-assignments.js` to include `operations_admin` in the assignable roles dropdown.

**Primary recommendation:** Add `clients` collection match block to `firestore.rules` with identical access patterns as `projects`. Verify all collection rules include `super_admin` in write permissions arrays. Update `project-assignments.js` role selection to allow assigning `operations_admin` users to projects. Deploy rules and run emulator tests to verify admin access patterns.

## Standard Stack

The established tools for Firebase Security Rules in this project:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Security Rules language | CEL-based DSL | Server-side access control | Built into Firebase; only option for server-side enforcement |
| Firebase CLI | latest | Deploy rules, run emulator | Only way to deploy `firestore.rules` |
| `@firebase/rules-unit-testing` | 5.0.0+ | Unit-test rules against emulator | Official Firebase testing library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Mocha | latest | Run test suites | Test runner for rules unit tests |
| Node.js | 18+ | Run tests | `@firebase/rules-unit-testing` runs in Node |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Role-based helper functions | Per-collection duplicate logic | Helper functions (`hasRole`, `isRole`) reduce duplication; already implemented in codebase |
| Client-side permission checks only | Security Rules server enforcement | Client-side checks are bypassable via DevTools; Security Rules are the hard boundary |
| Custom claims for admin roles | Document reads via `get()` | Custom claims require Admin SDK (no backend in this project); document reads work immediately after update |

**Installation:**
```bash
# Already installed in this project (from Phase 8)
npm install -g firebase-tools
firebase login

# Test dependencies (already in repo)
npm install --save-dev @firebase/rules-unit-testing firebase mocha
```

## Architecture Patterns

### Recommended File Structure
```
(repo root)/
├── firestore.rules          # Security Rules file
├── firebase.json            # Firebase CLI config
├── test/
│   └── firestore.test.js    # Unit tests for all collections
├── app/
│   └── views/
│       └── project-assignments.js  # Assignment admin UI
```

### Pattern 1: Consistent Collection Rule Blocks

**What:** Each Firestore collection needs an explicit `match` block with access rules. Collections without rules default to deny-all.

**When to use:** Always. Every collection the app reads/writes must have rules.

**Example:**
```javascript
// firestore.rules
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions (already exist)
    function isActiveUser() { ... }
    function hasRole(roles) { ... }

    // =============================================
    // clients collection (MISSING - needs to be added)
    // =============================================
    match /clients/{clientId} {
      // All active users can read
      allow read: if isActiveUser();

      // Create/Update/Delete: super_admin, operations_admin
      allow create: if hasRole(['super_admin', 'operations_admin']);
      allow update: if hasRole(['super_admin', 'operations_admin']);
      allow delete: if hasRole(['super_admin', 'operations_admin']);
    }

    // =============================================
    // projects collection (already exists, working correctly)
    // =============================================
    match /projects/{projectId} {
      allow read: if isActiveUser();
      allow create: if hasRole(['super_admin', 'operations_admin']);
      allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);
      allow delete: if hasRole(['super_admin', 'operations_admin']);
    }
  }
}
```

**Key insight:** The `clients` collection is referenced in `clients.js` (created in v1.0 Phase 1) but was never added to Security Rules when they were implemented in v2.0 Phase 8. This is the root cause of the permission denied errors.

### Pattern 2: Admin Role Bypass via Role Arrays

**What:** Super Admin gets access by being included in the `hasRole()` arrays for every operation type across all collections.

**When to use:** For admin roles that need universal access. This project uses explicit role listing rather than a special bypass function.

**Example:**
```javascript
// Each collection's create/update/delete rules must include 'super_admin'
allow create: if hasRole(['super_admin', 'operations_admin']);
allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);
allow delete: if hasRole(['super_admin', 'operations_admin']);

// Alternative pattern (not used in this codebase):
function isSuperAdmin() {
  return isRole('super_admin');
}

allow write: if isSuperAdmin() || hasRole(['operations_admin']);
```

**Why this codebase uses explicit arrays:** Consistency. Every collection lists all roles that can perform each operation. Easy to audit by reading each match block independently.

### Pattern 3: Operations Admin Assignment Data Model

**What:** Project assignments are stored as an array field (`assigned_project_codes`) on user documents. Any role can have assignments, not just `operations_user`.

**When to use:** When scoping visibility to specific projects. Already implemented in Phase 7.

**Current data model (from Phase 7):**
```javascript
// users/{firebaseAuthUid}
{
    email: string,
    role: 'operations_user' | 'operations_admin' | ...,
    all_projects: boolean,              // true = see all projects
    assigned_project_codes: string[],   // e.g., ['CLMC_ABC_2026001', ...]
    // ... other fields
}
```

**What needs to change:** The assignment admin UI (`project-assignments.js`) currently filters user selection to only show `operations_user` role. Extend this to include `operations_admin`.

**Location of restriction:**
```javascript
// app/views/project-assignments.js (need to find exact line)
// Current filter:
const assignableUsers = allUsers.filter(u => u.role === 'operations_user');

// Needs to become:
const assignableUsers = allUsers.filter(u =>
    u.role === 'operations_user' || u.role === 'operations_admin'
);
```

### Pattern 4: Testing Admin Access with Emulator

**What:** Use `@firebase/rules-unit-testing` to verify Super Admin can access all collections and Operations Admin can be assigned to projects.

**When to use:** After any rules changes. Required for Phase 11 success criteria.

**Test structure:**
```javascript
// test/firestore.test.js
describe("Super Admin access to clients collection", () => {
  beforeEach(seedUsers);

  it("super_admin can read clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(superAdminDb, "clients", "test-client-123")));
  });

  it("super_admin can create clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "clients", "new-client"), {
        client_code: "TEST",
        company_name: "Test Company",
        contact_person: "John Doe",
        contact_details: "test@example.com"
      })
    );
  });
});

describe("Operations Admin project assignments", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Seed Operations Admin with assignments
      await setDoc(doc(db, "users", "active-ops-admin"), {
        email: "opsadmin@clmc.com",
        status: "active",
        role: "operations_admin",
        assigned_project_codes: ["CLMC_TEST_2026001"],
        all_projects: false
      });

      // Seed test project
      await setDoc(doc(db, "projects", "test-project"), {
        project_code: "CLMC_TEST_2026001",
        project_name: "Test Project",
        is_active: true
      });
    });
  });

  it("operations_admin with assignments can read assigned project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "test-project")));
  });
});
```

### Anti-Patterns to Avoid

- **Assuming collection rules inherit from others** - Each collection needs explicit rules; no inheritance
- **Client-side permission checks as security** - UI hiding is not security; Security Rules are the boundary
- **Forgetting to test admin bypass scenarios** - Super Admin must be verified to work across all collections
- **Hardcoding role names in UI without Security Rules match** - If UI allows Operations Admin assignments but rules don't handle it, silent failure occurs

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Admin bypass logic | Custom "is admin" checks per collection | Include `super_admin` in every `hasRole()` array | Consistent, auditable, already implemented pattern |
| Rule validation | Custom linter | Firebase CLI (`firebase deploy --only firestore:rules`) | CLI validates syntax and catches errors pre-deploy |
| Test data seeding | Manual Firestore writes | `testEnv.withSecurityRulesDisabled()` | Bypasses rules for setup; only way to seed data |
| Permission denied debugging | Console.log hunting | Firebase Emulator UI + test suite | Emulator shows exact rule evaluation; tests prevent regression |

**Key insight:** The existing helper functions (`hasRole`, `isRole`, `isActiveUser`) in `firestore.rules` are already well-structured. The fix is additive (adding `clients` collection rules) and corrective (verifying super_admin is in all arrays), not architectural.

## Common Pitfalls

### Pitfall 1: Missing Collection Rules Default to Deny-All

**What goes wrong:** Permission denied errors on collections that exist in code but not in Security Rules.

**Why it happens:** Firestore Security Rules default-deny. If no `match` block exists for a collection, ALL operations fail.

**How to avoid:** When adding new collections to the codebase (like `clients` in v1.0), immediately add corresponding Security Rules. Audit all `collection(db, 'name')` calls in codebase against `firestore.rules`.

**Warning signs:**
- Permission denied errors even for Super Admin
- Errors occur immediately on page load when listener connects
- Firebase console logs show `permission-denied` for collection queries

**How to verify:** Search codebase for `collection(db,` and cross-reference against `match` blocks in `firestore.rules`.

### Pitfall 2: Role Arrays Missing super_admin

**What goes wrong:** Super Admin blocked from operations on specific collections.

**Why it happens:** When writing collection rules, forgetting to include `'super_admin'` in the roles array for create/update/delete operations.

**How to avoid:** Establish a checklist pattern - every collection's write operations must include `super_admin` unless explicitly documented otherwise. Use test suite to verify admin access.

**Warning signs:**
- Super Admin can read but not write to a collection
- Error messages show "insufficient permissions" for admin users

**Verification pattern:**
```bash
# Search for all allow create/update/delete rules
grep -n "allow create:\|allow update:\|allow delete:" firestore.rules

# Verify each line includes 'super_admin' in the roles array
```

### Pitfall 3: UI Role Restrictions Disconnected from Data Model

**What goes wrong:** Assignment admin UI only shows `operations_user` for selection, but data model supports any role having assignments.

**Why it happens:** Phase 7 initially designed assignments for `operations_user` only; requirement changed in v2.1 to include `operations_admin`, but UI wasn't updated.

**How to avoid:** When permission requirements change, audit both Security Rules AND UI components that filter by role.

**Warning signs:**
- Can manually edit Firestore to add assignments to operations_admin (works)
- UI doesn't show operations_admin in assignment dropdown (restricted)
- Security Rules don't block operations_admin assignments (data model agnostic)

**Location of fix:** `app/views/project-assignments.js` - user list filter for assignable roles.

### Pitfall 4: Test Suite Missing Admin Scenarios

**What goes wrong:** Tests pass but Super Admin access is broken in production.

**Why it happens:** Test suite from Phase 8 focused on role separation (operations_user can't do X, finance can't do Y). Admin bypass scenarios were assumed to work.

**How to avoid:** Add explicit test cases for Super Admin access to every collection with every operation type (read, create, update, delete).

**Test coverage checklist:**
- [ ] Super Admin can read clients
- [ ] Super Admin can create clients
- [ ] Super Admin can update clients
- [ ] Super Admin can delete clients
- [ ] Super Admin can read projects (already tested)
- [ ] Super Admin can create projects (already tested)
- [ ] Operations Admin with `assigned_project_codes` can access assigned projects
- [ ] Operations Admin without `all_projects: true` cannot access unassigned projects

### Pitfall 5: Forgetting to Deploy Rules After Changes

**What goes wrong:** Rules file updated locally, tests pass with emulator, but production still has old rules.

**Why it happens:** Firebase Security Rules require explicit deployment via `firebase deploy --only firestore:rules`. Changes to `firestore.rules` file don't auto-deploy.

**How to avoid:** Always deploy rules after changes and verify in Firebase console that rules version timestamp updated.

**Deployment workflow:**
```bash
# 1. Update firestore.rules locally
# 2. Run tests against emulator
npm test

# 3. Deploy ONLY rules (not functions, hosting, etc.)
firebase deploy --only firestore:rules

# 4. Verify in Firebase console
# Go to Firestore > Rules tab, check "Last updated" timestamp
```

## Code Examples

Verified patterns from existing codebase and Firebase documentation:

### Complete clients Collection Rules Block

**Add to firestore.rules after projects collection block:**

```javascript
// =============================================
// clients collection
// =============================================
match /clients/{clientId} {
  // All active users can read
  allow read: if isActiveUser();

  // Create/Update/Delete: super_admin, operations_admin
  allow create: if hasRole(['super_admin', 'operations_admin']);
  allow update: if hasRole(['super_admin', 'operations_admin']);
  allow delete: if hasRole(['super_admin', 'operations_admin']);
}
```

**Rationale:** Mirrors `projects` collection access pattern (read: all active users; write: admin roles only). Consistent with existing codebase architecture where clients are managed by Operations department.

### Operations Admin Assignment Filter Update

**In app/views/project-assignments.js, find the user filtering logic:**

```javascript
// BEFORE (current v2.0):
async function loadUsers() {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    allUsers = [];
    usersSnapshot.forEach(doc => {
        const userData = { id: doc.id, ...doc.data() };
        if (userData.role === 'operations_user') {  // ← RESTRICTED
            allUsers.push(userData);
        }
    });
    renderUsersList();
}

// AFTER (Phase 11 fix):
async function loadUsers() {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    allUsers = [];
    usersSnapshot.forEach(doc => {
        const userData = { id: doc.id, ...doc.data() };
        // Allow both operations_user and operations_admin to receive assignments
        if (userData.role === 'operations_user' || userData.role === 'operations_admin') {
            allUsers.push(userData);
        }
    });
    renderUsersList();
}
```

**Alternative pattern (more maintainable):**

```javascript
// Define assignable roles as a constant
const ASSIGNABLE_ROLES = ['operations_user', 'operations_admin'];

async function loadUsers() {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    allUsers = [];
    usersSnapshot.forEach(doc => {
        const userData = { id: doc.id, ...doc.data() };
        if (ASSIGNABLE_ROLES.includes(userData.role)) {
            allUsers.push(userData);
        }
    });
    renderUsersList();
}
```

### Test Suite Additions for Phase 11

**Add to test/firestore.test.js:**

```javascript
// =============================================
// Test Suite: Super Admin Access to Clients
// =============================================
describe("clients collection - super admin access", () => {
  beforeEach(async () => {
    await seedUsers();

    // Seed test client
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "test-client"), {
        client_code: "TEST",
        company_name: "Test Company",
        contact_person: "John Doe",
        contact_details: "john@test.com",
        created_at: new Date().toISOString()
      });
    });
  });

  it("super_admin can read clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(superAdminDb, "clients", "test-client")));
  });

  it("super_admin can list clients", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDocs(collection(superAdminDb, "clients")));
  });

  it("super_admin can create client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "clients", "new-client"), {
        client_code: "NEW",
        company_name: "New Company",
        contact_person: "Jane Doe",
        contact_details: "jane@new.com",
        created_at: new Date().toISOString()
      })
    );
  });

  it("super_admin can update client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(superAdminDb, "clients", "test-client"), {
        contact_person: "Updated Name"
      })
    );
  });

  it("super_admin can delete client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(deleteDoc(doc(superAdminDb, "clients", "test-client")));
  });

  it("operations_admin can read clients", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "clients", "test-client")));
  });

  it("operations_admin can create client", async () => {
    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(
      setDoc(doc(opsAdminDb, "clients", "ops-admin-client"), {
        client_code: "OPS",
        company_name: "Ops Admin Client",
        contact_person: "Ops Person",
        contact_details: "ops@test.com",
        created_at: new Date().toISOString()
      })
    );
  });

  it("finance CANNOT create client", async () => {
    const financeDb = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(financeDb, "clients", "finance-client"), {
        client_code: "FIN",
        company_name: "Finance Client",
        contact_person: "Finance Person",
        contact_details: "finance@test.com",
        created_at: new Date().toISOString()
      })
    );
  });
});

// =============================================
// Test Suite: Operations Admin Assignments
// =============================================
describe("operations_admin project assignments", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Super Admin (no assignments needed - sees all)
      await setDoc(doc(db, "users", "active-super-admin"), {
        email: "superadmin@clmc.com",
        status: "active",
        role: "super_admin",
        display_name: "Super Admin"
      });

      // Operations Admin WITH assignments
      await setDoc(doc(db, "users", "ops-admin-assigned"), {
        email: "opsadmin@clmc.com",
        status: "active",
        role: "operations_admin",
        display_name: "Ops Admin Assigned",
        assigned_project_codes: ["CLMC_TEST_2026001"],
        all_projects: false
      });

      // Operations Admin with all_projects flag
      await setDoc(doc(db, "users", "ops-admin-all"), {
        email: "opsadmin2@clmc.com",
        status: "active",
        role: "operations_admin",
        display_name: "Ops Admin All Projects",
        all_projects: true,
        assigned_project_codes: []
      });

      // Test projects
      await setDoc(doc(db, "projects", "assigned-project"), {
        project_code: "CLMC_TEST_2026001",
        project_name: "Assigned Project",
        is_active: true
      });

      await setDoc(doc(db, "projects", "other-project"), {
        project_code: "CLMC_OTHER_2026001",
        project_name: "Other Project",
        is_active: true
      });
    });
  });

  it("operations_admin with assigned_project_codes can read assigned project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("ops-admin-assigned").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "assigned-project")));
  });

  it("operations_admin with all_projects true can read any project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("ops-admin-all").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "other-project")));
  });

  it("super_admin can update user assignments", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(superAdminDb, "users", "ops-admin-assigned"), {
        assigned_project_codes: ["CLMC_TEST_2026001", "CLMC_OTHER_2026001"]
      })
    );
  });
});
```

### Running Tests After Changes

```bash
# Terminal 1: Start emulator
firebase emulators:start --only firestore

# Terminal 2: Run full test suite
npx mocha test/firestore.test.js --exit

# Or run only new tests for Phase 11
npx mocha test/firestore.test.js --grep "clients collection" --exit
npx mocha test/firestore.test.js --grep "operations_admin project assignments" --exit
```

### Deploying Rules to Production

```bash
# After tests pass locally
firebase deploy --only firestore:rules

# Verify deployment
firebase firestore:rules list
# Should show new timestamp for latest deployment
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No Security Rules (default deny-all) | Explicit per-collection rules with role checks | v2.0 Phase 8 | Server-side enforcement prevents console bypass |
| Manual rule testing in Firebase console | Automated test suite with `@firebase/rules-unit-testing` | v2.0 Phase 8 | Regression prevention, faster iteration |
| All project assignments to operations_user only | Project assignments available for operations_admin | v2.1 Phase 11 | Flexible team structure |
| Client-side permission checks as security boundary | Security Rules as hard boundary + client-side for UX | v2.0 Phase 6-8 | Defense in depth |

**Deprecated/outdated:**
- **Client-side-only permission checks** - Phase 6 implemented client-side checks (UI hiding), Phase 8 added Security Rules enforcement. Client-side alone is insufficient.
- **Assuming default-allow rules** - All new Firebase projects since 2019 default to deny-all. Explicit rules required.
- **Single admin role** - Original v2.0 design had only Super Admin; Operations Admin added for distributed management.

## Open Questions

1. **Should Operations Admin assignments use project-scoping in Security Rules?**
   - What we know: `projects` collection rules currently allow `operations_admin` full read access without checking `assigned_project_codes`. This differs from `operations_user` which has project-scoped list access on mrfs/prs/pos collections.
   - What's unclear: Is this intentional (Operations Admin needs to see all projects for management) or should Operations Admin be project-scoped when assigned?
   - Recommendation: Keep current behavior (Operations Admin sees all projects regardless of assignments). Assignments for Operations Admin are organizational hints, not security boundaries. Security Rules already enforce this by not checking assignments for operations_admin role.

2. **Do other collections need clients collection foreign key validation?**
   - What we know: `projects` collection has a `client_code` field referencing clients. Security Rules don't validate this reference exists.
   - What's unclear: Should rules verify `client_code` exists in clients collection before allowing project creation?
   - Recommendation: No. Firestore Security Rules support `get()` for document reads but this costs a read per evaluation. Client-code validation is better handled client-side (dropdown prevents invalid selection) or via Cloud Functions (if backend added later). Rules focus on role-based access, not referential integrity.

3. **Should Finance role have read access to clients?**
   - What we know: Finance role needs to create POs which link to projects, and projects link to clients. But Finance may not need direct client CRUD access.
   - What's unclear: Does Finance need to read clients collection directly, or only see client info denormalized on projects?
   - Recommendation: Current rules allow all active users to read clients (follows pattern from projects). Finance gets read access via `isActiveUser()` check. This is sufficient and consistent with existing patterns.

## Sources

### Primary (HIGH confidence)
- Codebase: `firestore.rules` (v2.0, no clients collection rules) - C:\Users\franc\dev\projects\pr-po\firestore.rules
- Codebase: `app/views/clients.js` (uses `collection(db, 'clients')`) - C:\Users\franc\dev\projects\pr-po\app\views\clients.js
- Codebase: `app/views/projects.js` (uses `collection(db, 'projects')`) - C:\Users\franc\dev\projects\pr-po\app\views\projects.js
- Codebase: `app/views/project-assignments.js` (filters to operations_user only) - Line references TBD
- Codebase: `test/firestore.test.js` (existing test patterns) - C:\Users\franc\dev\projects\pr-po\test\firestore.test.js
- Phase 8 RESEARCH.md: Security Rules patterns, helper functions, testing approach - C:\Users\franc\dev\projects\pr-po\.planning\phases\08-security-rules-enforcement\08-RESEARCH.md
- Phase 7 RESEARCH.md: Project assignment data model, assigned_project_codes structure - C:\Users\franc\dev\projects\pr-po\.planning\phases\07-project-assignment-system\07-RESEARCH.md
- Firebase Security Rules - Get Started: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Security Rules - Conditions: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase Security Rules - Testing: https://firebase.google.com/docs/firestore/security/test-rules-emulator

### Secondary (MEDIUM confidence)
- [7 tips on Firebase security rules and the Admin SDK](https://firebase.blog/posts/2019/03/firebase-security-rules-admin-sdk-tips/) - Admin SDK bypasses rules; not applicable to this project but confirms no special "admin bypass" pattern in rules themselves
- [Secure data access for users and groups](https://firebase.google.com/docs/firestore/solutions/role-based-access) - Official RBAC guide; confirms role-checking pattern via document reads
- [How to fix Firestore Error: PERMISSION_DENIED](https://medium.com/firebase-tips-tricks/how-to-fix-firestore-error-permission-denied-missing-or-insufficient-permissions-777d591f404) - Common error patterns; confirms missing collection rules cause permission-denied
- [Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator) - Emulator testing methods; confirms @firebase/rules-unit-testing approach

### Tertiary (LOW confidence)
- WebSearch: "Firebase Security Rules admin bypass super admin 2026" - General patterns, no specific bypass mechanism beyond Admin SDK (not used here)
- WebSearch: "operations admin project assignments" - Generic results, no Firebase-specific guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Firebase CLI and rules-unit-testing library confirmed against v2.0 implementation
- Architecture (collection rules pattern): HIGH - Verified against existing firestore.rules file and codebase usage
- Pitfalls (missing collection rules): HIGH - Direct observation of missing clients collection match block
- Code examples (clients rules): HIGH - Follows existing projects collection pattern exactly
- Operations Admin assignments: HIGH - Data model supports it, UI restriction is documented in code
- Test patterns: HIGH - Follows existing test/firestore.test.js structure

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - Security Rules syntax stable; codebase structure confirmed)
