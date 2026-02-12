# Stack Research: Services Department Support

**Domain:** Multi-department procurement workflow with role-based isolation
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

**No new libraries or SDK versions needed.** The Services department addition is a pure architectural extension using existing Firebase Firestore v10.7.1 and Firebase Auth v10.7.1 already in use. All required capabilities (multi-collection isolation, role-based access control, shared sequence generation, real-time listeners) are already validated in the current v2.2 codebase.

This is **NOT** a stack addition project — it's an architectural pattern extension within the proven zero-build vanilla JavaScript + Firebase stack.

## Existing Stack (Unchanged)

| Technology | Current Version | Purpose | Status |
|------------|----------------|---------|--------|
| Firebase Firestore | v10.7.1 (CDN) | Multi-collection database with real-time listeners | ✓ Validated, no changes |
| Firebase Auth | v10.7.1 (CDN) | Role-based authentication with session persistence | ✓ Validated, no changes |
| Vanilla JavaScript | ES6 Modules | Zero-build SPA with hash routing | ✓ Validated, no changes |
| Firebase Security Rules | rules_version 2 | Server-side permission enforcement | ✓ Extension only |

**Deployment:** Netlify (unchanged)
**No build tools, no new dependencies, no version upgrades needed.**

## Stack Extension Patterns

### 1. Multi-Collection Parallel Workflow

**Pattern:** Mirror the `projects` collection structure for `services` collection

**Why existing stack supports this:**
- Firestore is schemaless — adding new collection requires zero migration
- Real-time listeners (`onSnapshot`) work identically across collections
- Security Rules support multiple collection blocks with independent access control
- Proven pattern: 9 existing collections (users, projects, clients, mrfs, prs, pos, transport_requests, suppliers, deleted_mrfs)

**Implementation:**
```javascript
// NO NEW CODE PATTERNS — reuse existing project CRUD patterns
collection(db, 'services')  // vs collection(db, 'projects')
```

**File changes:**
- Add `app/views/services.js` (copy `app/views/projects.js` structure)
- Add `app/views/service-detail.js` (copy `app/views/project-detail.js` structure)

**Confidence:** HIGH — identical to 9 existing collections already working in production

### 2. Department-Scoped Role Isolation

**Pattern:** Extend existing role-based access control with department filtering

**Why existing stack supports this:**
- Role templates already support custom permission structures (v2.0)
- Security Rules already enforce role-based filtering (17/17 tests passing)
- Real-time permission updates via `permissionsChanged` event (v2.0)
- `getAssignedProjectCodes()` utility already implements scoped filtering for `operations_user`

**Implementation:**
```javascript
// EXISTING PATTERN (already working for operations_user):
function getAssignedProjectCodes() {
    if (user.role !== 'operations_user') return null; // No filter
    if (user.all_projects === true) return null;
    return user.assigned_project_codes || [];
}

// EXTENSION FOR SERVICES (same pattern, different field):
function getAssignedServiceCodes() {
    if (user.role !== 'services_user') return null;
    if (user.all_services === true) return null;
    return user.assigned_service_codes || [];
}
```

**Firestore Security Rules Extension:**
```javascript
// EXISTING PATTERN (projects collection, lines 114-126):
match /projects/{projectId} {
    allow read: if isActiveUser();  // All active users
    allow create: if hasRole(['super_admin', 'operations_admin']);
    allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);
    allow delete: if hasRole(['super_admin', 'operations_admin']);
}

// NEW PATTERN (services collection — identical structure):
match /services/{serviceId} {
    allow read: if isActiveUser();  // All active users
    allow create: if hasRole(['super_admin', 'services_admin']);
    allow update: if hasRole(['super_admin', 'services_admin', 'finance']);
    allow delete: if hasRole(['super_admin', 'services_admin']);
}
```

**Role template additions:**
```javascript
// EXISTING roles in role_templates collection:
// super_admin, operations_admin, operations_user, finance, procurement

// NEW roles (same structure, different tabs):
{
    role_id: 'services_admin',
    permissions: {
        tabs: {
            dashboard: { access: true, edit: false },
            services: { access: true, edit: true },  // vs projects
            mrf_form: { access: true, edit: true },
            // NO access to projects tab
        }
    }
}
```

**Confidence:** HIGH — exact same pattern as existing `operations_admin` / `operations_user` roles

### 3. Shared Code Sequence Across Collections

**Pattern:** Modify `generateProjectCode()` to query both `projects` and `services` collections

**Why existing stack supports this:**
- `generateProjectCode()` already uses regex parsing for flexible formats (line 211 in utils.js)
- Firestore `getDocs()` supports parallel collection queries
- Current implementation uses range queries with composite keys
- Race condition acknowledged and accepted in v1.0 (line 191 comment)

**Implementation:**
```javascript
// EXISTING PATTERN (utils.js lines 192-226):
export async function generateProjectCode(clientCode, year = null) {
    const currentYear = year || new Date().getFullYear();

    // Query projects for this client and year
    const q = query(
        collection(db, 'projects'),
        where('client_code', '==', clientCode),
        where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
        where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
    );
    const snapshot = await getDocs(q);

    let maxNum = 0;
    snapshot.forEach(doc => {
        const match = code.match(/^CLMC_.+_\d{4}(\d{3})$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });

    return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
}

// MODIFIED PATTERN (add parallel services query):
export async function generateProjectOrServiceCode(clientCode, year = null) {
    const currentYear = year || new Date().getFullYear();

    // Query BOTH projects AND services for this client and year
    const projectsQuery = query(/* same as above */);
    const servicesQuery = query(
        collection(db, 'services'),
        where('client_code', '==', clientCode),
        where('service_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
        where('service_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
    );

    // Execute queries in parallel
    const [projectsSnapshot, servicesSnapshot] = await Promise.all([
        getDocs(projectsQuery),
        getDocs(servicesQuery)
    ]);

    // Find max number across BOTH collections
    let maxNum = 0;
    projectsSnapshot.forEach(doc => {
        const match = doc.data().project_code.match(/^CLMC_.+_\d{4}(\d{3})$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    servicesSnapshot.forEach(doc => {
        const match = doc.data().service_code.match(/^CLMC_.+_\d{4}(\d{3})$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });

    return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
}
```

**Firestore capabilities used:**
- `Promise.all()` for parallel queries (standard JavaScript, not Firebase-specific)
- Range queries with composite keys (already validated in v1.0)
- Regex parsing for code extraction (existing pattern)

**Race condition risk:** Same as existing implementation — acceptable for expected usage volume (comment line 191: "Race condition possible with simultaneous creates - acceptable for v1.0")

**Confidence:** HIGH — extends existing validated pattern with parallel query

### 4. Role-Based MRF Dropdown Visibility

**Pattern:** Filter active projects/services by user role before rendering dropdown

**Why existing stack supports this:**
- `getActiveProjects()` utility already exists (utils.js lines 252-267)
- Assignment filtering already implemented for `operations_user` (lines 237-246)
- Client-side filtering pattern validated in project-assignments.js

**Implementation:**
```javascript
// EXISTING PATTERN (utils.js lines 252-267):
export async function getActiveProjects() {
    const q = query(
        collection(db, 'projects'),
        where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

// EXTENSION (add parallel services query):
export async function getActiveProjectsAndServices() {
    const user = window.getCurrentUser?.();
    const role = user?.role;

    // Determine which collections to query based on role
    const queries = [];

    if (!role) return []; // Not logged in

    // Operations roles see only Projects
    if (role === 'operations_admin' || role === 'operations_user') {
        queries.push(
            getDocs(query(collection(db, 'projects'), where('status', '==', 'active')))
        );
    }

    // Services roles see only Services
    if (role === 'services_admin' || role === 'services_user') {
        queries.push(
            getDocs(query(collection(db, 'services'), where('status', '==', 'active')))
        );
    }

    // Cross-department roles see both
    if (role === 'super_admin' || role === 'finance' || role === 'procurement') {
        queries.push(
            getDocs(query(collection(db, 'projects'), where('status', '==', 'active'))),
            getDocs(query(collection(db, 'services'), where('status', '==', 'active')))
        );
    }

    // Execute queries in parallel and merge results
    const snapshots = await Promise.all(queries);
    return snapshots.flatMap(snapshot =>
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    );
}
```

**Confidence:** HIGH — combines two existing validated patterns (role checking + active filtering)

## Security Rules Extension

**Current state:** 247 lines, 17/17 tests passing, production deployed

**Changes needed:**
1. Add `services` collection block (mirror `projects` structure)
2. Add `isAssignedToService()` helper (mirror `isAssignedToProject()` pattern)
3. Extend `hasRole()` checks to include `services_admin` and `services_user`

**Pattern:**
```javascript
// EXISTING HELPER (lines 35-47):
function isAssignedToProject(projectCode) {
    return getUserData().all_projects == true ||
           projectCode in getUserData().assigned_project_codes;
}

// NEW HELPER (identical pattern for services):
function isAssignedToService(serviceCode) {
    return getUserData().all_services == true ||
           serviceCode in getUserData().assigned_service_codes;
}

// EXISTING COLLECTION (lines 114-126):
match /projects/{projectId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'operations_admin']);
    // ...
}

// NEW COLLECTION (mirror structure):
match /services/{serviceId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'services_admin']);
    allow update: if hasRole(['super_admin', 'services_admin', 'finance']);
    allow delete: if hasRole(['super_admin', 'services_admin']);

    // Edit history subcollection (same pattern as projects)
    match /edit_history/{entryId} {
        allow read: if isActiveUser();
        allow create: if hasRole(['super_admin', 'services_admin', 'finance']);
        allow update: if false;  // Append-only
        allow delete: if false;
    }
}

// EXTEND MRF/PR/PO LIST RULES (lines 166-169, 189-192, 211-215):
// Add services_user filtering alongside operations_user
allow list: if isActiveUser() && (
    hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
    (isRole('operations_user') && isLegacyOrAssigned(resource.data.project_code)) ||
    (isRole('services_user') && isLegacyOrAssigned(resource.data.service_code))  // NEW
);
```

**Testing pattern:**
```javascript
// EXISTING TEST PATTERN (firestore.test.js lines 64-71):
await setDoc(doc(db, "users", "active-ops-user"), {
    role: "operations_user",
    assigned_project_codes: ["CLMC_TEST_2026001"],
    all_projects: false,
});

// NEW TEST (mirror pattern for services_user):
await setDoc(doc(db, "users", "active-services-user"), {
    role: "services_user",
    assigned_service_codes: ["CLMC_VENDOR_2026001"],
    all_services: false,
});

// Test services collection access
it("services_user can read assigned service", async () => {
    const servicesUserDb = testEnv.authenticatedContext("active-services-user").firestore();
    await assertSucceeds(getDoc(doc(servicesUserDb, "services", "assigned-service")));
});
```

**Estimated new rules:** +30 lines (services collection block + helper function)
**Estimated new tests:** +5 tests (mirror existing project tests)

**Confidence:** HIGH — exact pattern replication of existing validated rules

## Permission System Extension

**Current state:** Real-time permission updates via Firestore listeners (permissions.js)

**Changes needed:**
1. Add `services` tab to permission matrix
2. Extend role templates with 2 new roles (services_admin, services_user)

**Pattern:**
```javascript
// EXISTING PERMISSION CHECK (permissions.js lines 36-40):
export function hasTabAccess(tabId) {
    if (!currentPermissions || !currentPermissions.tabs) return undefined;
    return currentPermissions.tabs[tabId]?.access || false;
}

// NO CHANGES NEEDED — function already generic

// NEW ROLE TEMPLATES (firestore data):
{
    role_id: 'services_admin',
    permissions: {
        tabs: {
            dashboard: { access: true, edit: false },
            services: { access: true, edit: true },     // NEW tab
            mrf_form: { access: true, edit: true },
            procurement: { access: true, edit: true },
            // projects tab: no access (department isolation)
        }
    }
}

{
    role_id: 'services_user',
    permissions: {
        tabs: {
            dashboard: { access: true, edit: false },
            services: { access: true, edit: false },    // View-only
            mrf_form: { access: true, edit: true },
            // projects/procurement tabs: no access
        }
    }
}
```

**Navigation visibility:**
```javascript
// EXISTING PATTERN (index.html navigation, uses hasTabAccess()):
<a href="#/projects" class="nav-link" data-tab="projects">Projects</a>
<a href="#/services" class="nav-link" data-tab="services">Services</a>  // NEW

// NO JavaScript CHANGES — router.js already filters nav by hasTabAccess()
```

**Confidence:** HIGH — zero code changes to permission system, only data additions

## Code Generation Pattern Modifications

**Current implementation:** `generateProjectCode()` in utils.js (lines 192-226)

**Required changes:**
1. Rename to `generateCode()` (generic function)
2. Add `collectionType` parameter ('project' or 'service')
3. Query both collections for max number calculation
4. Return code with appropriate field name (project_code or service_code)

**Backward compatibility:**
```javascript
// KEEP EXISTING FUNCTION (for backward compatibility):
export async function generateProjectCode(clientCode, year = null) {
    return generateCode('project', clientCode, year);
}

// ADD NEW GENERIC FUNCTION:
export async function generateCode(type, clientCode, year = null) {
    // Query both collections, return max + 1
    // Same pattern as existing, extended with parallel query
}

// ADD SERVICE WRAPPER:
export async function generateServiceCode(clientCode, year = null) {
    return generateCode('service', clientCode, year);
}
```

**Migration risk:** NONE — existing callers continue using `generateProjectCode()`, services use new `generateServiceCode()`

**Confidence:** HIGH — additive changes only, no breaking modifications

## Integration Points

### What Changes

| Component | Current | After Services Addition | Change Type |
|-----------|---------|------------------------|-------------|
| Firebase SDK | v10.7.1 | v10.7.1 | No change |
| Security Rules | 247 lines, 9 collections | ~280 lines, 10 collections | Extension |
| Role templates | 5 roles | 7 roles | Addition |
| Permission checks | 7 tabs | 8 tabs | Addition |
| Code generation | 1 function | 3 functions (backward compatible) | Extension |
| MRF form | Project dropdown | Project/Service dropdown (filtered) | Logic change |

### What Stays the Same

| Component | Why Unchanged |
|-----------|---------------|
| Firebase version | All required features already available in v10.7.1 |
| Auth system | Role-based access already supports N roles |
| Real-time listeners | `onSnapshot()` works identically across all collections |
| Router | Hash routing already supports `/services` path |
| Finance workflow | Approves PRs regardless of project vs service origin |
| Procurement workflow | Creates POs regardless of department |
| Supplier management | Shared across all departments |
| Client management | Shared across all departments |

## Version Compatibility

**No compatibility concerns** — all extensions use existing Firebase v10.7.1 APIs already in use.

| Current Pattern | Services Extension | API Used |
|----------------|-------------------|----------|
| `collection(db, 'projects')` | `collection(db, 'services')` | Same API |
| `hasRole(['operations_admin'])` | `hasRole(['services_admin'])` | Same Security Rules helper |
| `user.assigned_project_codes` | `user.assigned_service_codes` | Same Firestore field pattern |
| `project_code: 'CLMC_X_2026001'` | `service_code: 'CLMC_X_2026001'` | Same string format |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase SDK upgrade | v10.7.1 has all needed features; upgrade risks breaking changes | Keep v10.7.1 (validated) |
| Separate Firebase project | Security Rules enforce isolation; separate project adds complexity | Single project, multi-collection |
| Client-side only filtering | Bypassable via console; fails requirement "Firebase Security Rules enforcement" | Security Rules + client filtering |
| New permission system | Existing system supports N roles and M tabs | Extend role_templates data |
| Build tools for tree-shaking | Zero-build architecture is core constraint | Keep CDN imports |

## Installation

**NO INSTALLATION NEEDED** — all required technologies already installed and validated.

### Verification

Current versions already in use:
```html
<!-- app/firebase.js lines 7-41 -->
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
</script>
```

## Sources

**HIGH Confidence — All findings from existing codebase analysis:**

- **Firebase SDK v10.7.1:** C:\Users\Admin\Roaming\pr-po\app\firebase.js (lines 7-41) — Current production version
- **Security Rules patterns:** C:\Users\Admin\Roaming\pr-po\firestore.rules (247 lines) — 17/17 tests passing
- **Multi-collection precedent:** 9 existing collections (users, projects, clients, mrfs, prs, pos, transport_requests, suppliers, deleted_mrfs)
- **Role-based filtering:** app/utils.js `getAssignedProjectCodes()` (lines 237-246) — Validated for operations_user
- **Permission system:** app/permissions.js (133 lines) — Real-time updates via `permissionsChanged` event
- **Code generation:** app/utils.js `generateProjectCode()` (lines 192-226) — Regex-based parsing, race condition acknowledged
- **Test patterns:** test/firestore.test.js (336 lines, 17 tests) — Seed users, role checks, assignment filtering

**No external research needed** — all capabilities already exist in v2.2 codebase.

---
*Stack research for: Services Department Support*
*Researched: 2026-02-12*
*Confidence: HIGH — All findings from validated v2.2 production codebase*
