# Phase 26: Security & Roles Foundation - Research

**Researched:** 2026-02-18
**Domain:** Firebase Firestore Security Rules extension + role_templates Firestore documents + emulator-based test suite expansion
**Confidence:** HIGH (all findings verified directly against the existing codebase, which implements the exact same patterns for the operations department; no external libraries needed beyond what is already installed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Services role permission scope**
- services_admin and services_user navigation: Claude's Discretion — mirror operations roles pattern (Services tab + MRF form + Dashboard)
- services_user CAN submit MRFs for their assigned services (same as operations_user can submit for assigned projects)
- services roles do NOT get Finance or Procurement tab access — Finance/Procurement are cross-department roles only
- Only Super Admin manages users; services_admin has no user management capabilities

**Department silo model**
- Full silo in both directions: operations roles (ops_admin, ops_user) are blind to Services department; services roles (services_admin, services_user) are blind to Projects department
- Neither department's roles can see the other's tab in navigation
- Finance and Procurement roles: read-only access to services collection (they can see services data for cross-department workflows, but cannot write to the services collection)
- MRF-level silo enforcement (preventing services roles from writing department='projects' MRFs) is deferred to Phase 29 — Phase 26 Security Rules focus on the services collection only

**all_services flag & admin bypass**
- Claude's Discretion on implementation approach (flag in user doc vs role check in rules) — use whatever is most consistent with how Phase 8 Security Rules were structured
- Claude's Discretion on whether services_admin sees all services or only assigned — mirror the operations_admin vs operations_user pattern from Phase 7
- Super Admin sees ALL services by default when Services tab is built — no filtering required
- Defer updating existing Super Admin user documents with any new flags until Phase 28 (when Services UI is built and the flags matter)

**Role template defaults**
- Add BOTH services_admin and services_user as new documents in the role_templates collection, following the existing pattern from Phase 6
- services_admin default permissions mirror operations_admin exactly (same tab access, same edit rights) — just scoped to Services instead of Projects
- Claude's Discretion on whether to surface these new role templates in the existing Super Admin role config UI or keep them read-only until Phase 28
- Registration/approval flow is unchanged — services roles appear as additional options in the Super Admin role assignment dropdown (7 total roles instead of 5)

### Claude's Discretion
- Whether to use `all_services: true` flag in user doc or rely purely on role-based checks in Security Rules
- Whether services_admin sees all services (unrestricted) or only assigned ones — apply whatever pattern operations_admin follows
- Whether new role templates are immediately editable in the Super Admin UI or deferred to Phase 28
- Exact navigation tab visibility implementation for services roles

### Deferred Ideas (OUT OF SCOPE)
- MRF department-level Security Rules enforcement (services roles blocked from writing department='projects' MRFs) — Phase 29
- Updating existing Super Admin user documents with new flags (all_services etc.) — Phase 28
- Services role template UI configuration in Super Admin — Phase 28 (if needed at all)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROLE-01 | services_admin role created with same permissions as operations_admin (for Services scope) | Mirror `operations_admin` role_templates document; use same tabs object structure with a new `services` tab entry instead of `projects` |
| ROLE-02 | services_user role created with same permissions as operations_user (for Services scope) | Mirror `operations_user` role_templates document structure |
| ROLE-03 | services_admin can create, edit, delete services | Security Rules: `allow write: if hasRole(['super_admin', 'services_admin'])` on services collection |
| ROLE-04 | services_admin can manage service assignments | Managed by Super Admin only via user-management.js — no Security Rule change needed; assignment fields stored on user doc |
| ROLE-05 | services_admin sees all services regardless of assignment | Mirror `operations_admin` pattern: use `all_services: true` flag on user doc; isAssignedToService() checks this flag first |
| ROLE-06 | services_user sees only assigned services | Mirror `isAssignedToProject()` pattern: check `all_services` flag, then `assigned_service_codes` array |
| ROLE-07 | Super Admin can configure services_admin and services_user permissions in Settings | Add `services_admin` and `services_user` to `ROLE_ORDER` and `ROLE_LABELS` in role-config.js; add `services` tab to `TABS` array |
| ROLE-08 | Super Admin sees both Projects and Services tabs | Super Admin has `all_projects: true` semantics; services: no filtering on super_admin role |
| ROLE-09 | Finance role sees both Projects and Services department work | Security Rules: include `finance` in services collection read allow list |
| ROLE-10 | Procurement role sees both Projects and Services department work | Security Rules: include `procurement` in services collection read allow list |
| ROLE-11 | Permission changes take effect immediately (real-time updates) | Already implemented via onSnapshot on role_templates in permissions.js — no new infrastructure needed; new role templates plug into existing listener automatically |
| SEC-01 | Firebase Security Rules enforce services collection access by role | Add `match /services/{serviceId}` block to firestore.rules following existing per-collection pattern |
| SEC-02 | services_admin can read/write all services | `hasRole(['super_admin', 'services_admin'])` in allow write; services_admin included in read |
| SEC-03 | services_user can read only assigned services | `isRole('services_user') && isAssignedToService(resource.data.service_code)` pattern in allow list |
| SEC-04 | services_user cannot write to services collection | Omit services_user from allow create/update/delete |
| SEC-05 | Super Admin bypasses services role checks | Include `super_admin` in all allow lists (already a pattern for every collection) |
| SEC-06 | Finance and Procurement can read services for cross-department workflows | Include `finance`, `procurement` in allow read for services collection |
| SEC-07 | Security Rules validated with automated tests (emulator) | Extend test/firestore.test.js with new describe block; use existing testEnv, seedUsers, assertSucceeds/assertFails patterns |
| SEC-08 | Department field enforced on all new MRFs, PRs, POs, TRs going forward | Phase 26 scope is services collection only. MRF-level enforcement deferred to Phase 29. No Security Rules change to mrfs/prs/pos/trs in this phase. |
</phase_requirements>

---

## Summary

Phase 26 is a pure infrastructure phase: extend two existing systems (Firestore Security Rules and role_templates documents) to add the Services department isolation layer. No new UI is built. No new libraries are needed. The codebase has already solved every technical problem this phase faces — for the operations department. Phase 26 applies those same solutions a second time for services.

The Security Rules work is additive: one new `match /services/{serviceId}` block in `firestore.rules`, plus two new helper functions (`isAssignedToService`, `isServicesAdminOrAbove`). The role templates work is additive: two new Firestore documents in `role_templates` collection (`services_admin`, `services_user`). The test work is additive: one new `describe` block in `test/firestore.test.js`. The UI updates are minimal: the approval dropdown and role-edit modal in `user-management.js` need two new `<option>` elements, and `role-config.js` needs the new roles and new `services` tab added to its ROLE_ORDER/TABS arrays.

The key architectural decision (Claude's Discretion): mirror the `operations_admin`/`operations_user` pattern exactly. This means `services_admin` gets `all_services: true` implicitly via role-based check in Security Rules (the same way `operations_admin` uses `isAssignedToProject` which checks `all_projects == true`). The pattern is: services_admin always has full read, services_user is scoped by `assigned_service_codes` array on their user document.

**Primary recommendation:** Extend everything by mirroring. Copy the operations pattern verbatim, substituting `services` for `projects` at every touchpoint. Do not deviate — the existing patterns are proven correct by 18+ passing tests.

---

## Standard Stack

### Core (already in place — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firestore Security Rules (CEL DSL) | rules_version = '2' | Server-side access control for services collection | Built into Firebase; existing file at `firestore.rules` |
| `@firebase/rules-unit-testing` | ^3.0.4 (root package.json) | Test rules against emulator | Already installed, 28 tests passing against this version |
| Mocha | ^10.7.3 | Test runner | Already in use at root package.json |
| Firebase Firestore SDK v10.7.1 | CDN | Client-side Firestore writes for role_templates seed | Already in app/firebase.js |

**Installation:** None. All dependencies are already installed.

---

## Architecture Patterns

### Recommended File Touchpoints

```
C:/Users/Admin/Roaming/pr-po/
├── firestore.rules                    # ADD: services collection match block + 2 helper functions
├── test/firestore.test.js             # ADD: services collection describe block (~15 new tests)
├── scripts/sync-role-permissions.js   # ADD: services_admin and services_user to defaultRoleTemplates array
├── app/views/user-management.js       # ADD: 2 new <option> in approval dropdown + role-edit modal
└── app/views/role-config.js           # ADD: 2 entries to ROLE_ORDER, ROLE_LABELS; 1 entry to TABS
```

No new files. All changes are additive edits to existing files.

### Pattern 1: services collection Security Rules Block

The new `match /services/{serviceId}` block follows the exact same structure as `match /mrfs/{mrfId}` with adaptations for services department isolation. Key differences from mrfs:
- No legacy data concern (services collection is new — no documents without `service_code`)
- operations_user/operations_admin do NOT appear in the allow lists (full silo)
- services_user read is scoped by `assigned_service_codes` (mirrors project scoping)
- services_user CANNOT write (SEC-04)

```
// =============================================
// services collection
// =============================================
match /services/{serviceId} {
  // Get: super_admin, services roles, finance, procurement
  allow get: if hasRole(['super_admin', 'services_admin', 'services_user', 'finance', 'procurement']);

  // List: scoped — services_user sees only assigned services
  allow list: if isActiveUser() && (
    hasRole(['super_admin', 'services_admin', 'finance', 'procurement']) ||
    (isRole('services_user') && isAssignedToService(resource.data.service_code))
  );

  // Create/Update/Delete: super_admin and services_admin only
  allow create: if hasRole(['super_admin', 'services_admin']);
  allow update: if hasRole(['super_admin', 'services_admin']);
  allow delete: if hasRole(['super_admin', 'services_admin']);
}
```

### Pattern 2: New Helper Functions for services Assignment

Mirror the existing `isAssignedToProject` and `isLegacyOrAssigned` helper functions. Add these two functions to the HELPER FUNCTIONS section of `firestore.rules`:

```
// Check if a services_user is assigned to a given service_code.
// Only call this after confirming role is services_user.
// services_admin always sees all services (no assignment check needed).
function isAssignedToService(serviceCode) {
  return getUserData().all_services == true ||
         serviceCode in getUserData().assigned_service_codes;
}
```

Note: There is no `isLegacyOrService` equivalent needed in Phase 26 because the services collection is brand new — every document in it will have `service_code`. The legacy fallback pattern from mrfs/prs/pos is not required here.

### Pattern 3: all_services flag vs pure role check

**Decision (Claude's Discretion):** Use the `all_services: true` flag on user documents for `services_admin`, mirroring `all_projects: true` for `operations_admin`. Rationale:

- `operations_admin` currently has `all_projects: true` set on their user document (confirmed in `test/firestore.test.js` line 367: `all_projects: true` for `ops-admin-all`)
- The Security Rules check this flag via `isAssignedToProject()`: `getUserData().all_projects == true || ...`
- Consistency demands the same approach for services_admin
- The alternative (pure role-based check: `if isRole('services_admin') return true`) would work but differs from the established pattern, creating two divergent approaches in the same codebase

**Implication for user documents:** When Super Admin approves a user as `services_admin`, the approval flow should set `all_services: true` on the user document (same as `all_projects: true` for operations_admin). This is handled in the approval logic in `user-management.js`. Phase 28 will formalize the Services assignment UI — Phase 26 just seeds the field pattern.

For Phase 26 testing purposes, seed test user documents with these fields:
```javascript
// services_admin test user
{
  email: 'servicesadmin@clmc.com',
  status: 'active',
  role: 'services_admin',
  display_name: 'Services Admin',
  all_services: true,
  assigned_service_codes: []
}

// services_user test user
{
  email: 'servicesuser@clmc.com',
  status: 'active',
  role: 'services_user',
  display_name: 'Services User',
  all_services: false,
  assigned_service_codes: ['SVC-001']
}
```

### Pattern 4: Role Template Documents

Exact shape for new Firestore documents. The `services` tab is the new tab key that will be used in Phase 28 when the Services view is built. By pre-defining it in the role template now, `permissions.js`'s existing `hasTabAccess('services')` call will work correctly when the view exists.

**Document: `role_templates/services_admin`**
```javascript
{
  role_id: 'services_admin',
  role_name: 'Services Admin',
  permissions: {
    tabs: {
      dashboard: { access: true, edit: false },
      clients: { access: true, edit: true },
      services: { access: true, edit: true },      // NEW: Services tab (built in Phase 28)
      mrf_form: { access: true, edit: true },
      procurement: { access: true, edit: true },
      finance: { access: true, edit: false },
      role_config: { access: false, edit: false }
    }
  }
}
```

**Document: `role_templates/services_user`**
```javascript
{
  role_id: 'services_user',
  role_name: 'Services User',
  permissions: {
    tabs: {
      dashboard: { access: true, edit: false },
      clients: { access: true, edit: false },
      services: { access: true, edit: false },     // NEW: Services tab (built in Phase 28)
      mrf_form: { access: true, edit: true },
      procurement: { access: true, edit: true },
      finance: { access: true, edit: false },
      role_config: { access: false, edit: false }
    }
  }
}
```

**Why `projects` tab is absent:** services_admin and services_user do not have `projects` in their tabs object. `hasTabAccess('projects')` returns `false` because `currentPermissions.tabs['projects']` is undefined, which evaluates to `undefined?.access || false` = `false`. The silo is enforced client-side by the absence of the key. Confirmed by reading `permissions.js` line 39: `return currentPermissions.tabs[tabId]?.access || false`.

**Why `clients` tab is present:** services_admin and services_user DO get clients access (matching operations_admin/operations_user behavior, since clients are cross-department shared data). This is consistent with the existing design where all operational roles can see clients.

### Pattern 5: role-config.js Updates

`role-config.js` currently has hardcoded `ROLE_ORDER` and `TABS` arrays. These need extending:

```javascript
// CURRENT:
const ROLE_ORDER = ['super_admin', 'operations_admin', 'operations_user', 'finance', 'procurement'];

// UPDATED (add 2 new roles):
const ROLE_ORDER = ['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'finance', 'procurement'];

// CURRENT:
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  operations_admin: 'Operations Admin',
  operations_user: 'Operations User',
  finance: 'Finance',
  procurement: 'Procurement'
};

// UPDATED (add 2 new labels):
const ROLE_LABELS = {
  super_admin: 'Super Admin',
  operations_admin: 'Operations Admin',
  operations_user: 'Operations User',
  services_admin: 'Services Admin',
  services_user: 'Services User',
  finance: 'Finance',
  procurement: 'Procurement'
};

// CURRENT TABS array (7 entries):
const TABS = [
  { id: 'dashboard', label: 'Dashboard (Home)' },
  { id: 'clients', label: 'Clients' },
  { id: 'projects', label: 'Projects' },
  { id: 'mrf_form', label: 'Material Request' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' },
  { id: 'role_config', label: 'Role Configuration' }
];

// UPDATED TABS array (8 entries — add services):
const TABS = [
  { id: 'dashboard', label: 'Dashboard (Home)' },
  { id: 'clients', label: 'Clients' },
  { id: 'projects', label: 'Projects' },
  { id: 'services', label: 'Services' },              // NEW
  { id: 'mrf_form', label: 'Material Request' },
  { id: 'procurement', label: 'Procurement' },
  { id: 'finance', label: 'Finance' },
  { id: 'role_config', label: 'Role Configuration' }
];
```

**Impact on existing roles:** Adding `services` to TABS means the permission matrix will show a new row for `services`. For existing roles (super_admin, operations_admin, etc.) that don't have `services` in their role_templates document, `getPermissionValue(roleId, 'services', 'access')` will return `false` (the defensive default). No existing permissions break.

### Pattern 6: user-management.js Updates

Two places in `user-management.js` have hardcoded role option lists:

**Location 1: Approval dropdown (lines 642-648)**
```javascript
// CURRENT:
<option value="operations_user">Operations User</option>
<option value="super_admin">Super Admin</option>
<option value="operations_admin">Operations Admin</option>
<option value="finance">Finance</option>
<option value="procurement">Procurement</option>

// UPDATED (add 2 new options):
<option value="operations_user">Operations User</option>
<option value="super_admin">Super Admin</option>
<option value="operations_admin">Operations Admin</option>
<option value="services_admin">Services Admin</option>
<option value="services_user">Services User</option>
<option value="finance">Finance</option>
<option value="procurement">Procurement</option>
```

**Location 2: Role-edit modal (lines 1472-1476, in `showRoleEditModal` function)**
```javascript
// Same additions — add services_admin and services_user options
```

**Location 3: roleLabels map (line 426-433 in renderUserRow, and line 1441-1447 in showRoleEditModal)**
```javascript
const roleLabels = {
  'super_admin': 'Super Admin',
  'operations_admin': 'Operations Admin',
  'operations_user': 'Operations User',
  'services_admin': 'Services Admin',   // ADD
  'services_user': 'Services User',     // ADD
  'finance': 'Finance',
  'procurement': 'Procurement'
};
```

### Pattern 7: sync-role-permissions.js Updates

The browser console script `scripts/sync-role-permissions.js` needs two new entries in `defaultRoleTemplates`. The script currently only UPDATES existing documents (it skips any role not already in Firestore). To CREATE new role_templates documents, the script needs to be updated to use `setDoc` (create-or-update) instead of `updateDoc` (update-only) for new roles.

**Current behavior (line 134):** Uses `updateDoc` which fails if document doesn't exist.
**Required behavior for new roles:** Use `setDoc` to create the document if it doesn't exist.

This is the one non-trivial modification to the script. The recommended approach: change the conditional logic to use `setDoc` when the document doesn't exist in Firestore, and `updateDoc` when it does.

### Anti-Patterns to Avoid

- **Adding services roles to operations collection rules:** operations_user/operations_admin must NOT appear in services collection rules, and services roles must NOT appear in operations-related collection rules (mrfs, prs, pos, trs). The silo is enforced at the rule level.
- **Checking `assigned_service_codes` without short-circuit guard:** Same Pitfall 7 from Phase 8 applies — only call `isAssignedToService()` after confirming `isRole('services_user')`. Non-services_user roles will not have `assigned_service_codes` on their user document, and accessing a missing field in CEL returns an error.
- **Forgetting to add services_admin to the get (single document) allow rule:** The services collection needs separate `allow get` and `allow list` logic. `allow get` should be more permissive (all active services roles + finance + procurement). `allow list` applies the assignment scoping. Same pattern as mrfs.
- **Assuming role-config.js reads roles from Firestore dynamically:** It does NOT. `ROLE_ORDER`, `ROLE_LABELS`, and `TABS` are hardcoded arrays. Both the JavaScript source AND the Firestore documents must be updated. Updating only one side silently breaks the UI.
- **Assuming sync-role-permissions.js creates missing documents:** It currently doesn't — it skips roles not found in Firestore. This script must be enhanced to handle document creation for the two new roles.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test auth mocking | Custom mock objects | `testEnv.authenticatedContext('services-admin-uid')` | Only way to inject auth tokens that rules actually evaluate |
| Test data seeding | Manual writes under rules | `testEnv.withSecurityRulesDisabled(async ctx => { ... })` | Must bypass rules to seed precondition data |
| Test isolation | Manual document deletion | `testEnv.clearFirestore()` in `beforeEach` | Already in place — clears all emulator data |
| Permission matrix UI | New component | Extend existing ROLE_ORDER/TABS arrays in role-config.js | Component already renders columns dynamically from ROLE_ORDER |
| Role template seeding | Manual Firestore Console entry | Extended sync-role-permissions.js script | Reproducible, documented, version-controlled |

---

## Common Pitfalls

### Pitfall 1: Missing `assigned_service_codes` on Non-services_user Roles
**What goes wrong:** Security Rules return `permission-denied` for services_admin or finance when accessing the services collection, even though they should have access.
**Why it happens:** The `isAssignedToService()` helper accesses `getUserData().assigned_service_codes`. If this function is called for a user who doesn't have that field (e.g., services_admin, finance), CEL throws an error which evaluates as `false` (deny).
**How to avoid:** Only call `isAssignedToService()` inside a `isRole('services_user') &&` guard. The allow list rule must be: `hasRole(['super_admin', 'services_admin', 'finance', 'procurement']) || (isRole('services_user') && isAssignedToService(...))`. Short-circuit `||` prevents the right side from evaluating when the left side is true.
**Warning signs:** services_admin gets permission-denied on services collection list operations.

### Pitfall 2: role-config.js TABS Update Breaking Existing Role Templates
**What goes wrong:** After adding `services` to TABS array, the permission matrix shows a new `services` row. Existing role template documents (operations_admin, operations_user, etc.) don't have `services` in their permissions.tabs object, so `getPermissionValue()` returns `undefined` instead of `false`.
**Why it happens:** The matrix rendering calls `getPermissionValue(roleId, tab.id, 'access')` for every role × tab combination. If the tab key doesn't exist in the role's permissions object, the optional chain returns `undefined`.
**How to avoid:** Verify that `getPermissionValue` has a falsy-safe return for missing tabs. If it does: `return permissions?.tabs?.[tabId]?.[permType] || false`, then `undefined || false` = `false` which renders as unchecked. If it doesn't, add a `|| false` fallback. Do not update existing role template documents in Phase 26 — let them naturally not have `services` (showing unchecked in the matrix is correct).
**Warning signs:** Checkboxes in the new Services row appear in an indeterminate/checked state for operations roles.

### Pitfall 3: sync-role-permissions.js Skips New Roles
**What goes wrong:** Running the sync script doesn't create the two new role_templates documents.
**Why it happens:** The script uses `updateDoc` which fails silently (logs warning) when the document doesn't exist. The current script flow finds "NOT FOUND" and calls `continue`.
**How to avoid:** Modify the script to call `setDoc` (upsert) when the document is not found, instead of skipping. Or add an explicit create step using `setDoc` for roles not in the existing Firestore snapshot.
**Warning signs:** After running sync, Firestore still shows only 5 role_templates documents, not 7.

### Pitfall 4: Test Suite Seed Missing Services Test Users
**What goes wrong:** Tests for the services collection fail with unexpected errors because `getUserData()` returns null or a document without the right fields.
**Why it happens:** The existing `seedUsers()` function seeds 6 users but none with `services_admin` or `services_user` roles. If a test authenticates as a user ID that isn't seeded, `getUserData()` reads a non-existent document, and `getUserData().status` throws.
**How to avoid:** Either (a) extend `seedUsers()` with two new user documents, or (b) create a separate `seedServicesUsers()` helper for the services test suite. Pattern (a) is cleaner — it keeps a single canonical user set.
**Warning signs:** Tests throw "Cannot read property 'status' of undefined" or unexpected permission-denied for ALL operations.

### Pitfall 5: Silo Leak via Broad Allow Conditions
**What goes wrong:** operations_user accidentally gains read access to the services collection.
**Why it happens:** A permissive `isActiveUser()` read allow without role restriction would allow any active user to read services. If the services collection allow rule says `allow read: if isActiveUser()` (matching the broad pattern used in clients/projects), the silo is broken.
**How to avoid:** The services collection MUST use explicit role lists, not `isActiveUser()`. Allow list must enumerate exactly which roles can access: `hasRole(['super_admin', 'services_admin', 'services_user', 'finance', 'procurement'])`. Do not use `isActiveUser()` as a catch-all for services.
**Warning signs:** operations_user can list documents from the services collection in tests.

### Pitfall 6: Emulator Not Running When Tests Execute
**What goes wrong:** Tests fail with `ECONNREFUSED` or appear to pass without testing anything.
**Why it happens:** `@firebase/rules-unit-testing` connects to `127.0.0.1:8080` (configured in firebase.json). If the emulator isn't running, the connection is refused.
**How to avoid:** Start `firebase emulators:start --only firestore` before running `npm test`. This is existing behavior — Pitfall 6 from Phase 8 Research, repeated here for completeness.
**Warning signs:** `ECONNREFUSED 127.0.0.1:8080` in test output.

---

## Code Examples

### Complete services Collection Rules Block

```
// =============================================
// services collection
// =============================================
match /services/{serviceId} {
  // Get (single document): super_admin, services roles, finance, procurement
  // Note: services_user can get individual docs — more permissive than list
  allow get: if hasRole(['super_admin', 'services_admin', 'services_user', 'finance', 'procurement']);

  // List (collection query): scoped by assignment for services_user
  allow list: if isActiveUser() && (
    hasRole(['super_admin', 'services_admin', 'finance', 'procurement']) ||
    (isRole('services_user') && isAssignedToService(resource.data.service_code))
  );

  // Create: super_admin and services_admin only
  allow create: if hasRole(['super_admin', 'services_admin']);

  // Update: super_admin and services_admin only
  allow update: if hasRole(['super_admin', 'services_admin']);

  // Delete: super_admin and services_admin only
  allow delete: if hasRole(['super_admin', 'services_admin']);
}
```

### New Helper Function for Rules File

```
// Check if a services_user is assigned to a given service_code.
// Only call this after confirming role is services_user (short-circuit guard).
// all_services == true means unrestricted access (mirrors all_projects for operations_admin).
function isAssignedToService(serviceCode) {
  return getUserData().all_services == true ||
         serviceCode in getUserData().assigned_service_codes;
}
```

### Test Suite Describe Block Structure

```javascript
// =============================================
// Test Suite: Services Collection
// =============================================

describe("services collection - role access", () => {
  beforeEach(seedUsers);  // seedUsers must include services_admin and services_user

  it("super_admin can read services collection", async () => {
    const db = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_admin can read all services", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_admin can create service", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertSucceeds(
      setDoc(doc(db, "services", "SVC-100"), {
        service_code: "SVC-100",
        service_name: "Test Service",
        status: "active"
      })
    );
  });

  it("services_user can read assigned service", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_user CANNOT create service", async () => {
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      setDoc(doc(db, "services", "SVC-200"), {
        service_code: "SVC-200",
        service_name: "Unauthorized Service"
      })
    );
  });

  it("finance can read services (cross-department)", async () => {
    const db = testEnv.authenticatedContext("active-finance").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("finance CANNOT write to services collection", async () => {
    const db = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(db, "services", "SVC-300"), {
        service_code: "SVC-300",
        service_name: "Finance Attempt"
      })
    );
  });

  it("procurement can read services (cross-department)", async () => {
    const db = testEnv.authenticatedContext("active-procurement").firestore();
    await assertSucceeds(getDoc(doc(db, "services", "SVC-001")));
  });

  it("operations_user CANNOT read services collection (silo)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertFails(getDoc(doc(db, "services", "SVC-001")));
  });

  it("operations_admin CANNOT read services collection (silo)", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertFails(getDoc(doc(db, "services", "SVC-001")));
  });

  it("services_admin CANNOT read projects collection (reverse silo)", async () => {
    const db = testEnv.authenticatedContext("active-services-admin").firestore();
    await assertFails(getDocs(collection(db, "projects")));
  });
});
```

### seedUsers Extension for Phase 26

Add to the existing `seedUsers()` function in `test/firestore.test.js`:

```javascript
// Services Admin (all services access)
await setDoc(doc(db, "users", "active-services-admin"), {
  email: "servicesadmin@clmc.com",
  status: "active",
  role: "services_admin",
  display_name: "Services Admin",
  all_services: true,
  assigned_service_codes: []
});

// Services User (assigned to specific service)
await setDoc(doc(db, "users", "active-services-user"), {
  email: "servicesuser@clmc.com",
  status: "active",
  role: "services_user",
  display_name: "Services User",
  all_services: false,
  assigned_service_codes: ["SVC-001"]
});
```

And seed a test service document:

```javascript
// Test Service document
await setDoc(doc(db, "services", "SVC-001"), {
  service_code: "SVC-001",
  service_name: "Test Service Alpha",
  status: "active"
});
```

### sync-role-permissions.js New Entries

Add to `defaultRoleTemplates` array, and update the sync logic to use `setDoc` for missing documents:

```javascript
// Add these two objects to defaultRoleTemplates:
{
  role_id: 'services_admin',
  role_name: 'Services Admin',
  permissions: {
    tabs: {
      dashboard: { access: true, edit: false },
      clients: { access: true, edit: true },
      services: { access: true, edit: true },
      mrf_form: { access: true, edit: true },
      procurement: { access: true, edit: true },
      finance: { access: true, edit: false },
      role_config: { access: false, edit: false }
    }
  }
},
{
  role_id: 'services_user',
  role_name: 'Services User',
  permissions: {
    tabs: {
      dashboard: { access: true, edit: false },
      clients: { access: true, edit: false },
      services: { access: true, edit: false },
      mrf_form: { access: true, edit: true },
      procurement: { access: true, edit: true },
      finance: { access: true, edit: false },
      role_config: { access: false, edit: false }
    }
  }
}
```

---

## Existing Codebase State: What Already Works

Documenting this explicitly so the planner knows what NOT to rebuild:

| Existing Component | What It Does | Phase 26 Interaction |
|---|---|---|
| `app/permissions.js` `initPermissionsObserver()` | Listens to `role_templates/{user.role}` and dispatches `permissionsChanged` | Zero changes needed — automatically picks up new role templates when services roles are seeded |
| `app/permissions.js` `hasTabAccess('services')` | Returns `false` for tabs not in role template | Will return `true` for services_admin/services_user after role templates are created |
| `firestore.rules` helper functions | `isSignedIn`, `getUserData`, `isActiveUser`, `hasRole`, `isRole`, `isAssignedToProject`, `isLegacyOrAssigned` | Add `isAssignedToService` alongside; existing helpers are reused in services block |
| `test/firestore.test.js` `testEnv`, `seedUsers`, `assertSucceeds`, `assertFails` | Complete test infrastructure | Extend with new users in seedUsers + new describe block |
| `app/views/role-config.js` permission matrix renderer | Renders checkbox grid dynamically from ROLE_ORDER × TABS | Add to arrays; renderer handles new columns/rows automatically |
| `app/views/user-management.js` approval flow | Approves pending users with selected role + writes to Firestore | Add two `<option>` elements and two roleLabels entries |
| `scripts/sync-role-permissions.js` | Console script for syncing role templates | Add two new role objects; fix setDoc vs updateDoc for missing docs |

---

## Open Questions

1. **Reverse silo: should operations_admin be blocked from the projects collection?**
   - What we know: The silo decision says "services roles are blind to Projects department." Operations roles are "blind to Services department." The current `projects` collection allows `isActiveUser()` to read, which would include a future services_admin or services_user.
   - What's unclear: Does the silo require EXPLICITLY blocking services roles from the `projects` collection, or is "not having the Projects tab" sufficient client-side enforcement?
   - Recommendation: Phase 26 Security Rules scope is the `services` collection only (from CONTEXT.md). The projects collection currently allows all active users to read — that is not changed in Phase 26. Client-side tab visibility enforces the silo for navigation. The Security Rules silo in Phase 26 is one-directional: operations roles cannot read services, but services roles CAN technically read projects if they navigate directly. Phase 29 is the right place to tighten this if required. DO NOT change the projects collection rules in Phase 26.

2. **Should services_admin receive `all_services: true` automatically on approval, or only when an admin sets it?**
   - What we know: operations_admin has `all_projects: true` on their user document. The approval flow in user-management.js (line 724) sets `role: selectedRole` but does NOT currently set `all_projects` — that field is set separately via the project assignments UI.
   - What's unclear: Does `isAssignedToService` need `all_services: true` to work for services_admin, or can the rule use `isRole('services_admin')` as the bypass instead?
   - Recommendation: Use `isRole('services_admin')` as the bypass in `isAssignedToService()` — this avoids the need to set `all_services: true` on user documents during approval. The function becomes: `return isRole('services_admin') || getUserData().all_services == true || serviceCode in getUserData().assigned_service_codes`. This is safer: services_admin always has full access by role definition, not by a user document field that might be forgotten during approval. The `all_services` flag on the user doc is still a useful signal for Phase 28 client-side filtering, but doesn't need to be the Security Rules mechanism.

3. **Test count: how many new tests are needed?**
   - What we know: SEC-07 requires "automated tests pass for all services collection scenarios"
   - What's unclear: The exact minimum test count
   - Recommendation: At minimum, cover: (1) super_admin CRUD, (2) services_admin CRUD, (3) services_user read-own, (4) services_user cannot write, (5) finance read-only, (6) procurement read-only, (7) operations_user blocked, (8) operations_admin blocked, (9) reverse silo: services_admin blocked from... (defer per Open Question 1). Approximately 10-15 new tests across 2 describe blocks (role access + silo enforcement).

---

## Sources

### Primary (HIGH confidence)

- **Existing `firestore.rules` (verified line-by-line)** — Complete working rules file. Pattern for `isAssignedToProject`, `isLegacyOrAssigned`, per-collection match blocks, and helper functions confirmed correct.
- **Existing `test/firestore.test.js` (verified line-by-line)** — 9 describe blocks, 28 tests. `seedUsers()`, `testEnv.authenticatedContext()`, `assertSucceeds/assertFails` patterns confirmed working.
- **Existing `app/permissions.js` (verified)** — `hasTabAccess()` uses optional chain `?.access || false` which safely handles missing tab keys. New role templates plug in automatically.
- **Existing `app/views/role-config.js` (verified)** — ROLE_ORDER, TABS, ROLE_LABELS are hardcoded arrays that control the permission matrix.
- **Existing `app/views/user-management.js` (verified)** — Two locations with hardcoded role `<option>` lists (approval modal line 642, role-edit modal line 1472) and two roleLabels maps.
- **Existing `scripts/sync-role-permissions.js` (verified)** — Uses `updateDoc` (not `setDoc`); will skip non-existent docs. Must be fixed for new roles.
- **Phase 8 Research (`08-RESEARCH.md`)** — Documents the `get()` cost, short-circuit patterns, pitfall inventory, and test infrastructure patterns that this phase extends.
- **Phase 7 Research (`07-RESEARCH.md`)** — Documents the `all_projects` flag pattern and `assigned_project_codes` array that `all_services`/`assigned_service_codes` mirror.

### Secondary (MEDIUM confidence)

- **Phase 6 Research (`06-RESEARCH.md`)** — Role template document shape verified against `sync-role-permissions.js` actual implementation.

---

## Metadata

**Confidence breakdown:**
- Security Rules changes: HIGH — exact patterns copied from proven working codebase; no new syntax introduced
- Test suite extension: HIGH — exact patterns copied from 28 passing tests; infrastructure unchanged
- Role template documents: HIGH — shape verified against existing documents in sync script
- user-management.js changes: HIGH — two hardcoded HTML option lists identified, locations confirmed
- role-config.js changes: HIGH — ROLE_ORDER/TABS arrays found and verified; renderer is data-driven
- sync-role-permissions.js fix: MEDIUM — setDoc vs updateDoc behavior difference needs verification at runtime; the fix is conceptually clear but the exact conditional structure needs care

**Research date:** 2026-02-18
**Valid until:** 2026-03-18 (stable domain — Firebase Security Rules DSL is not changing; codebase patterns are mature)
