# Architecture: Multi-Department System with Role Isolation

**Domain:** Firebase/Vanilla JS SPA with parallel department workflows
**Researched:** 2026-02-12
**Confidence:** HIGH

## Executive Summary

Adding Services department to an existing Projects-based procurement system requires careful architectural integration to maintain department isolation while sharing common pipeline infrastructure (Finance, Procurement). The key challenge is balancing code reuse with department-scoped data access, all within a zero-build Firebase SPA architecture.

**Critical Design Decisions:**
1. **Collections:** `services` collection parallels `projects` collection, NOT subcollection
2. **Routing:** `#/services` view mirrors `#/projects` structure with separate tab navigation
3. **Code generation:** Shared counter queries BOTH collections for max sequential number
4. **Permissions:** Department-scoped role checks (`isRole('services_user')`) alongside existing roles
5. **Security Rules:** Multi-collection validation functions prevent cross-department access
6. **MRF form:** Conditional dropdown rendering based on user role department

**Architectural Philosophy:**
- **Duplicate UI, share utilities** — Department views are separate modules; shared utils (formatCurrency, generateSequentialId) remain centralized
- **Parallel not nested** — Services is NOT a subcollection of Projects; both are root collections
- **Role-scoped access** — operations_user sees Projects tab, services_user sees Services tab, Finance/Procurement see both
- **Single sequence namespace** — CLMC_CLIENT_YYYY### codes span both collections to prevent duplicates

---

## System Architecture Overview

### Current Architecture (v2.2 baseline)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                             │
├─────────────────────────────────────────────────────────────────┤
│  Hash Router (#/projects, #/mrf-form, #/procurement)            │
│     ↓                                                             │
│  View Lifecycle: render(tab) → init(tab) → destroy()            │
│     ↓                                                             │
│  Permission Checks: hasTabAccess('projects'), canEditTab(...)   │
│     ↓                                                             │
│  Firebase SDK: onSnapshot(), getDocs(), addDoc()                │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/S
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Firestore                            │
├─────────────────────────────────────────────────────────────────┤
│  Security Rules Evaluation (247 lines)                          │
│     ↓                                                             │
│  Collections:                                                    │
│    • projects (project_code: CLMC_CLIENT_YYYY###)               │
│    • mrfs (project_code, project_name denormalized)             │
│    • prs (project_code denormalized)                            │
│    • pos (project_code denormalized)                            │
│    • transport_requests (project_code denormalized)             │
│    • role_templates (permissions.tabs.projects.access/edit)     │
│    • users (role, assigned_project_codes[])                     │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (v3.0 with Services)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                             │
├─────────────────────────────────────────────────────────────────┤
│  Hash Router (#/projects, #/services, #/mrf-form, ...)         │
│     ↓                                                             │
│  View Modules:                                                   │
│    • projects.js (existing)         • services.js (NEW)         │
│    • project-detail.js (existing)   • service-detail.js (NEW)  │
│    • mrf-form.js (modified for conditional dropdowns)           │
│     ↓                                                             │
│  Permission Checks:                                              │
│    • operations_user → hasTabAccess('projects') = true          │
│    • services_user → hasTabAccess('services') = true            │
│    • finance/procurement → both tabs accessible                 │
│     ↓                                                             │
│  Shared Utilities (reused):                                      │
│    • generateServiceCode(clientCode) — NEW, mirrors generateProjectCode │
│    • getAssignedServiceCodes() — NEW, mirrors getAssignedProjectCodes │
│    • formatCurrency, formatDate, normalizePersonnel (unchanged) │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/S
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Firestore                            │
├─────────────────────────────────────────────────────────────────┤
│  Security Rules Evaluation (~300 lines with Services)           │
│     ↓                                                             │
│  Collections:                                                    │
│    • projects (existing)                                         │
│    • services (NEW — parallel structure)                        │
│    • mrfs (department field added)                              │
│    • prs (department field added)                               │
│    • pos (department field added)                               │
│    • transport_requests (department field added)                │
│    • role_templates (services tab added)                        │
│    • users (assigned_service_codes[] added)                     │
│    • counters (NEW — shared sequence tracking)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### View Layer Components

| Component | Responsibility | Implementation Approach |
|-----------|----------------|------------------------|
| **projects.js** (existing) | Projects CRUD, personnel assignment, filtering | No changes — continues to operate independently |
| **services.js** (NEW) | Services CRUD, personnel assignment, filtering | Duplicate projects.js structure with service_code, client_code fields |
| **project-detail.js** (existing) | Project detail view with edit history | No changes — project-code based routing |
| **service-detail.js** (NEW) | Service detail view with edit history | Duplicate project-detail.js for service-code routing |
| **mrf-form.js** (modified) | MRF submission with project/service dropdown | Conditional rendering: if operations_user show Projects dropdown, if services_user show Services dropdown |
| **procurement.js** (existing) | MRF processing, PR/TR generation | Minimal changes — handle department field in queries |
| **finance.js** (existing) | PR/TR approval, PO tracking | Minimal changes — display department in lists |

### Data Layer Components

| Component | Responsibility | Implementation Approach |
|-----------|----------------|------------------------|
| **utils.js** | Shared utilities (formatting, code generation) | Add `generateServiceCode()`, `getAssignedServiceCodes()` alongside existing functions |
| **permissions.js** | Role-based access control | Add `services` tab to permission checks; department-scoped role detection |
| **router.js** | Hash-based routing with lazy loading | Add `/services` route, `/service-detail` route with permission mapping |
| **firebase.js** | Firestore initialization | No changes — existing db export works for all collections |

### Security Layer

| Component | Responsibility | Implementation Approach |
|-----------|----------------|------------------------|
| **firestore.rules** | Collection-level access control | Add services collection rules (mirror projects), add department helpers, update mrfs/prs/pos rules for department filtering |
| **role_templates** | Permission configuration per role | Add `services` tab with access/edit flags for each role |

---

## Recommended Project Structure

### Existing Structure (unchanged)
```
app/
├── firebase.js           # Firestore initialization
├── auth.js              # Authentication
├── permissions.js       # Role-based access (modified for services)
├── router.js            # Hash routing (add /services route)
├── utils.js             # Shared utilities (add service code generation)
├── components.js        # Reusable UI components
├── edit-history.js      # Edit history recording
└── views/
    ├── home.js          # Dashboard (modify for services stats)
    ├── projects.js      # Projects management (no changes)
    ├── project-detail.js # Project detail (no changes)
    ├── mrf-form.js      # MRF form (modify for conditional dropdowns)
    ├── procurement.js   # Procurement workflow (minor modifications)
    ├── finance.js       # Finance workflow (minor modifications)
    └── ...
```

### New Structure (v3.0)
```
app/
├── firebase.js           # [UNCHANGED]
├── auth.js              # [UNCHANGED]
├── permissions.js       # [MODIFIED] Add services tab checks
├── router.js            # [MODIFIED] Add /services, /service-detail routes
├── utils.js             # [MODIFIED] Add generateServiceCode(), getAssignedServiceCodes()
├── components.js        # [UNCHANGED]
├── edit-history.js      # [MODIFIED] Support service_code parameter
└── views/
    ├── home.js          # [MODIFIED] Add services stats to dashboard
    ├── projects.js      # [UNCHANGED] Continues to work independently
    ├── project-detail.js # [UNCHANGED]
    ├── services.js      # [NEW] Duplicate projects.js structure
    ├── service-detail.js # [NEW] Duplicate project-detail.js structure
    ├── mrf-form.js      # [MODIFIED] Conditional dropdown rendering
    ├── procurement.js   # [MODIFIED] Handle department field
    ├── finance.js       # [MODIFIED] Handle department field
    └── ...
```

### Structure Rationale

- **Separate view modules** — `services.js` is a distinct file, not a conditional branch in `projects.js`. This maintains clear separation and allows independent evolution.
- **Shared utility layer** — Code generation and formatting utilities are centralized in `utils.js`, avoiding duplication of business logic.
- **Parallel routing** — `/services` and `/projects` are sibling routes, not nested. Router treats them as separate views with identical lifecycle patterns.
- **Minimal modifications to existing views** — Procurement and Finance views add department filtering but don't restructure; existing Projects workflow is untouched.

---

## Architectural Patterns

### Pattern 1: Parallel Collections with Shared Sequence

**What:** Services and Projects collections share a single sequential counter namespace (CLMC_CLIENT_YYYY###) to prevent code collisions.

**When to use:** When multiple departments need unique codes but the business requires a single global sequence across all work items.

**Trade-offs:**
- **Pro:** Prevents duplicate codes across departments (critical for billing/tracking)
- **Pro:** Single source of truth for "next number" logic
- **Con:** Code generation queries TWO collections, slightly slower (acceptable at <1000 records/year)
- **Con:** Race condition possible with simultaneous creates (acceptable for v3.0, can add distributed counter later)

**Example:**
```javascript
// utils.js
export async function generateProjectCode(clientCode, year = null) {
    const currentYear = year || new Date().getFullYear();

    // Query BOTH collections for max number
    const projectsQuery = query(
        collection(db, 'projects'),
        where('client_code', '==', clientCode),
        where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
        where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
    );

    const servicesQuery = query(
        collection(db, 'services'),
        where('client_code', '==', clientCode),
        where('service_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
        where('service_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
    );

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

    const newNum = maxNum + 1;
    return `CLMC_${clientCode}_${currentYear}${String(newNum).padStart(3, '0')}`;
}

// Services uses the SAME function
export async function generateServiceCode(clientCode, year = null) {
    return generateProjectCode(clientCode, year); // Shared implementation
}
```

**Source:** [Firebase distributed counters documentation](https://firebase.google.com/docs/firestore/solutions/counters) — for future optimization if race conditions become an issue.

---

### Pattern 2: Department-Scoped Role Checks

**What:** Permission checks filter tab access based on role department (operations_user → Projects, services_user → Services).

**When to use:** When different user groups need isolated views of parallel workflows but share approval roles (Finance, Procurement).

**Trade-offs:**
- **Pro:** Clear separation of concerns, users only see relevant tabs
- **Pro:** Centralizes role logic in permissions.js, not scattered across views
- **Con:** Requires careful role template configuration (new services tab for each role)
- **Con:** Mixed-role users (operations + services) require special handling (use role flags, not multiple roles)

**Example:**
```javascript
// permissions.js (no changes needed — tab-based checks already work)
export function hasTabAccess(tabId) {
    if (!currentPermissions || !currentPermissions.tabs) return undefined;

    const currentUser = window.getCurrentUser?.();
    if (currentUser && currentUser.role === 'super_admin') {
        return true; // Super Admin bypass
    }

    return currentPermissions.tabs[tabId]?.access || false;
}

// Role templates structure (Firestore)
// role_templates/operations_user
{
    permissions: {
        tabs: {
            projects: { access: true, edit: true },
            services: { access: false, edit: false }, // ← Operations can't see Services
            mrf_form: { access: true, edit: true },
            procurement: { access: false, edit: false },
            finance: { access: false, edit: false }
        }
    }
}

// role_templates/services_user
{
    permissions: {
        tabs: {
            projects: { access: false, edit: false }, // ← Services can't see Projects
            services: { access: true, edit: true },
            mrf_form: { access: true, edit: true },
            procurement: { access: false, edit: false },
            finance: { access: false, edit: false }
        }
    }
}

// role_templates/finance
{
    permissions: {
        tabs: {
            projects: { access: true, edit: false }, // ← Finance sees both departments (view-only)
            services: { access: true, edit: false },
            mrf_form: { access: false, edit: false },
            procurement: { access: false, edit: false },
            finance: { access: true, edit: true }
        }
    }
}
```

**Source:** [WorkOS multi-tenant SaaS guide](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture) — role-based tenant isolation patterns.

---

### Pattern 3: Conditional Form Rendering Based on Role

**What:** MRF form renders different dropdowns (Projects vs Services) based on user role, using the same form structure.

**When to use:** When the same form serves multiple departments but data sources differ.

**Trade-offs:**
- **Pro:** Single MRF form component, no duplication
- **Pro:** User sees only relevant options (no confusion between Projects/Services)
- **Con:** Adds conditional logic to form rendering (increases complexity)
- **Con:** Requires department field on MRF documents for routing back to correct department

**Example:**
```javascript
// mrf-form.js
export function render() {
    const canEdit = window.canEditTab?.('mrf_form');
    if (canEdit === false) {
        return `<div class="view-only-notice">...</div>`;
    }

    // Determine user department
    const user = window.getCurrentUser?.();
    const isOperations = user?.role === 'operations_user' || user?.role === 'operations_admin';
    const isServices = user?.role === 'services_user' || user?.role === 'services_admin';

    // Mixed-role users (super_admin, finance, procurement) see both dropdowns or default to Projects
    const showProjectsDropdown = isOperations || (!isServices && !isOperations);
    const showServicesDropdown = isServices;

    return `
        <form id="mrfForm">
            ${showProjectsDropdown ? `
                <div class="form-group">
                    <label>Select Project *</label>
                    <select id="projectSelect" name="project" required>
                        <option value="">Select Project</option>
                        <!-- Populated in init() from projects collection -->
                    </select>
                </div>
            ` : ''}

            ${showServicesDropdown ? `
                <div class="form-group">
                    <label>Select Service *</label>
                    <select id="serviceSelect" name="service" required>
                        <option value="">Select Service</option>
                        <!-- Populated in init() from services collection -->
                    </select>
                </div>
            ` : ''}

            <!-- Hidden field to track department -->
            <input type="hidden" id="departmentField"
                   value="${showProjectsDropdown ? 'projects' : 'services'}" />

            <!-- Rest of form... -->
        </form>
    `;
}

export async function init() {
    const user = window.getCurrentUser?.();
    const isOperations = user?.role === 'operations_user' || user?.role === 'operations_admin';
    const isServices = user?.role === 'services_user' || user?.role === 'services_admin';

    if (isOperations) {
        // Load projects with assignment filtering
        const projectCodes = getAssignedProjectCodes();
        const projectsQuery = projectCodes
            ? query(collection(db, 'projects'), where('project_code', 'in', projectCodes))
            : query(collection(db, 'projects'));

        const listener = onSnapshot(projectsQuery, (snapshot) => {
            const projects = [];
            snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
            renderProjectDropdown(projects);
        });
        listeners.push(listener);
    }

    if (isServices) {
        // Load services with assignment filtering
        const serviceCodes = getAssignedServiceCodes(); // NEW utility function
        const servicesQuery = serviceCodes
            ? query(collection(db, 'services'), where('service_code', 'in', serviceCodes))
            : query(collection(db, 'services'));

        const listener = onSnapshot(servicesQuery, (snapshot) => {
            const services = [];
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
            renderServiceDropdown(services);
        });
        listeners.push(listener);
    }
}
```

**Source:** [Conditional form rendering patterns](https://docs.softr.io/building-blocks/vikC2AWEpQGkZd4jGyoVxo/conditional-forms/afyKqnGDXd54U8d4xLNcsR) — dynamic form logic based on user attributes.

---

### Pattern 4: Multi-Collection Security Rules with Shared Helpers

**What:** Firestore Security Rules use helper functions to validate access across both Projects and Services collections with consistent logic.

**When to use:** When multiple collections share similar access patterns but need department-specific filtering.

**Trade-offs:**
- **Pro:** DRY — single source of truth for role checks (isRole, hasRole, isActiveUser)
- **Pro:** Consistent security across departments
- **Con:** Rules file grows (~300 lines with Services added)
- **Con:** Must deploy rules carefully (test in emulator first)

**Example:**
```javascript
// firestore.rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // =============================================
    // HELPER FUNCTIONS (existing, reused)
    // =============================================

    function isSignedIn() {
      return request.auth != null;
    }

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

    // =============================================
    // DEPARTMENT-SPECIFIC HELPERS (NEW)
    // =============================================

    // Check if operations_user is assigned to a project_code
    function isAssignedToProject(projectCode) {
      return getUserData().all_projects == true ||
             projectCode in getUserData().assigned_project_codes;
    }

    // Check if services_user is assigned to a service_code (NEW)
    function isAssignedToService(serviceCode) {
      return getUserData().all_services == true ||
             serviceCode in getUserData().assigned_service_codes;
    }

    // Check if user can access based on department field (NEW)
    function canAccessDepartment(department, code) {
      return department == 'projects' && isAssignedToProject(code) ||
             department == 'services' && isAssignedToService(code);
    }

    // =============================================
    // projects collection (existing, unchanged)
    // =============================================
    match /projects/{projectId} {
      allow read: if isActiveUser();
      allow create: if hasRole(['super_admin', 'operations_admin']);
      allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);
      allow delete: if hasRole(['super_admin', 'operations_admin']);

      match /edit_history/{entryId} {
        allow read: if isActiveUser();
        allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);
        allow update: if false;
        allow delete: if false;
      }
    }

    // =============================================
    // services collection (NEW — parallel structure)
    // =============================================
    match /services/{serviceId} {
      allow read: if isActiveUser();
      allow create: if hasRole(['super_admin', 'services_admin']);
      allow update: if hasRole(['super_admin', 'services_admin', 'finance']);
      allow delete: if hasRole(['super_admin', 'services_admin']);

      match /edit_history/{entryId} {
        allow read: if isActiveUser();
        allow create: if hasRole(['super_admin', 'services_admin', 'finance']);
        allow update: if false;
        allow delete: if false;
      }
    }

    // =============================================
    // mrfs collection (MODIFIED — add department filtering)
    // =============================================
    match /mrfs/{mrfId} {
      allow get: if isActiveUser();

      // List: filter by department and assigned codes
      allow list: if isActiveUser() && (
        hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
        (isRole('operations_user') && resource.data.department == 'projects' && isAssignedToProject(resource.data.project_code)) ||
        (isRole('services_user') && resource.data.department == 'services' && isAssignedToService(resource.data.service_code))
      );

      // Create: operations can create Projects MRFs, services can create Services MRFs
      allow create: if hasRole(['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'procurement']);

      // Update: admins, finance, procurement
      allow update: if hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']);

      // Delete: admins only
      allow delete: if hasRole(['super_admin', 'operations_admin', 'services_admin']);
    }

    // Similar modifications for prs, pos, transport_requests...
  }
}
```

**Source:** [Firestore security rules structure documentation](https://firebase.google.com/docs/firestore/security/rules-structure) — helper functions for rule reuse.

---

### Pattern 5: Denormalized Department Field

**What:** MRFs, PRs, POs, and TRs store both `project_code`/`service_code` AND a `department` field ('projects' or 'services') for efficient filtering.

**When to use:** When documents need to be queried by department without checking existence in multiple collections.

**Trade-offs:**
- **Pro:** Single query to filter by department (`where('department', '==', 'services')`)
- **Pro:** No need for compound queries or client-side filtering
- **Con:** Denormalization — department must be kept in sync with code field
- **Con:** Requires migration of existing data (add department: 'projects' to all existing MRFs)

**Example:**
```javascript
// Data structure in Firestore

// MRF document (Projects department)
{
    mrf_id: "MRF-2026-123",
    department: "projects",        // ← NEW denormalized field
    project_code: "CLMC_ACME_2026001",
    project_name: "ACME Building Project",
    // ... rest of fields
}

// MRF document (Services department)
{
    mrf_id: "MRF-2026-124",
    department: "services",        // ← NEW denormalized field
    service_code: "CLMC_ACME_2026002",
    service_name: "ACME Maintenance Service",
    // ... rest of fields
}

// Query pattern in procurement.js
const mrfsQuery = query(
    collection(db, 'mrfs'),
    where('department', '==', 'services') // Filter by department
);

// Display pattern in finance.js
function renderMRFRow(mrf) {
    const departmentBadge = mrf.department === 'projects'
        ? '<span class="badge badge-primary">Projects</span>'
        : '<span class="badge badge-info">Services</span>';

    return `
        <tr>
            <td>${mrf.mrf_id}</td>
            <td>${departmentBadge}</td>
            <td>${mrf.department === 'projects' ? mrf.project_code : mrf.service_code}</td>
            <td>${mrf.department === 'projects' ? mrf.project_name : mrf.service_name}</td>
            <!-- ... -->
        </tr>
    `;
}
```

**Source:** [Multi-tenant data isolation patterns](https://medium.com/@justhamade/architecting-secure-multi-tenant-data-isolation-d8f36cb0d25e) — denormalization for efficient tenant filtering.

---

## Data Flow

### Request Flow: Creating a Service MRF

```
User (services_user) navigates to #/mrf-form
    ↓
Router checks hasTabAccess('mrf_form') → true
    ↓
mrf-form.js renders
    ↓ (conditional rendering)
User sees Service dropdown (NOT Project dropdown)
    ↓
init() establishes onSnapshot listener on services collection
    ↓ (filtered by assigned_service_codes if services_user)
Services dropdown populated with user's assigned services
    ↓
User selects service, fills items, submits
    ↓
submitMRF() extracts service_code, service_name from dropdown
    ↓
addDoc(collection(db, 'mrfs'), {
    department: 'services',
    service_code: 'CLMC_ACME_2026002',
    service_name: 'ACME Maintenance Service',
    // ...
})
    ↓
Security Rules validate:
  - isRole('services_user') → true
  - department matches user's role → true
    ↓
Document created in mrfs collection
    ↓
Procurement view (Finance/Procurement roles) sees new MRF
    ↓ (onSnapshot listener includes both departments)
MRF appears in Procurement tab with "Services" badge
```

### Request Flow: Generating Service Code

```
User (services_admin) creates new service in #/services
    ↓
services.js calls generateServiceCode('ACME')
    ↓
utils.js queries BOTH projects and services collections
    ↓
Promise.all([
    getDocs(query(db, 'projects', where('client_code', '==', 'ACME'))),
    getDocs(query(db, 'services', where('client_code', '==', 'ACME')))
])
    ↓
Extract max number from BOTH collections
    ↓
maxNum = 1 (from projects: CLMC_ACME_2026001)
    ↓
Generate newNum = 2 → CLMC_ACME_2026002
    ↓
Return 'CLMC_ACME_2026002' to services.js
    ↓
addDoc(collection(db, 'services'), {
    service_code: 'CLMC_ACME_2026002',
    client_code: 'ACME',
    // ...
})
    ↓
Security Rules validate:
  - isRole('services_admin') → true
    ↓
Service created with globally unique code
```

### State Management: Permission Checks

```
User logs in → auth.js calls initPermissionsObserver(user)
    ↓
permissions.js establishes onSnapshot listener on role_templates/{role}
    ↓
Role template loaded into memory (currentPermissions)
    ↓
Custom event 'permissionsChanged' dispatched
    ↓
Navigation menu updates (show/hide tabs based on permissions.tabs.*.access)
    ↓
User clicks #/services link
    ↓
Router calls hasTabAccess('services')
    ↓
permissions.js checks currentPermissions.tabs.services.access
    ↓ (if services_user)
Returns true → Router navigates to /services
    ↓
services.js renders, calls canEditTab('services')
    ↓
Returns true → Edit controls rendered
    ↓
User modifies service, saves
    ↓
services.js calls updateDoc()
    ↓
Security Rules validate:
  - hasRole(['super_admin', 'services_admin']) → true (if services_admin)
    ↓
Document updated in services collection
```

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 projects/services | Current architecture sufficient — sequential code generation queries <1000 docs, acceptable latency |
| 500-5000 total work items | Consider distributed counter for code generation (Firebase solution: sharded counters), cache dropdown options client-side |
| 5000+ total work items | Implement Firestore aggregation queries for dashboard stats, paginate dropdown options, add search/autocomplete |

### Scaling Priorities

1. **First bottleneck: Code generation queries** — When projects + services > 1000 per client/year, sequential queries become slow. Solution: Implement [Firebase distributed counters](https://firebase.google.com/docs/firestore/solutions/counters) with sharded counter documents.

2. **Second bottleneck: Dropdown population** — When services > 100, dropdowns slow to render. Solution: Implement virtualized dropdowns with search/filter (use Firestore `orderBy().limit(20)` with client-side search).

3. **Third bottleneck: Dashboard aggregations** — When total documents > 10k, client-side counting becomes expensive. Solution: Use [Firestore aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries) with `getAggregateFromServer()` for counts/sums.

---

## Anti-Patterns

### Anti-Pattern 1: Nested Collections (services as subcollection of projects)

**What people might do:**
```javascript
// ❌ WRONG: services as subcollection
/projects/{projectId}/services/{serviceId}
```

**Why it's wrong:**
- Services are not children of Projects — they're parallel workflows
- Querying across all services requires collection group queries (slower, more complex)
- MRF form can't easily reference service without knowing parent project
- Security Rules become convoluted (need to check parent project access)
- Code generation can't query both collections in parallel

**Do this instead:**
```javascript
// ✅ CORRECT: services as root collection
/services/{serviceId}
```

Both projects and services are top-level collections with independent lifecycles.

---

### Anti-Pattern 2: Single View with Mode Toggle

**What people might do:**
```javascript
// ❌ WRONG: Single projects.js with mode toggle
if (mode === 'services') {
    // Render services
} else {
    // Render projects
}
```

**Why it's wrong:**
- Violates separation of concerns — projects and services are distinct workflows
- Creates complex conditional logic throughout the module (harder to maintain)
- Increases module size (projects.js already 596 lines)
- Makes testing harder (need to test both modes in every function)
- Breaks router's view lifecycle model (mode changes don't trigger destroy)

**Do this instead:**
```javascript
// ✅ CORRECT: Separate view modules
// app/views/projects.js — handles projects collection
// app/views/services.js — handles services collection
```

Duplicate view structure, share utilities.

---

### Anti-Pattern 3: Department Field Inference

**What people might do:**
```javascript
// ❌ WRONG: Infer department from field existence
if (mrf.project_code) {
    department = 'projects';
} else if (mrf.service_code) {
    department = 'services';
}
```

**Why it's wrong:**
- Fragile — breaks if both fields exist (due to migration bugs)
- Requires client-side logic in every view that displays department
- Security Rules can't efficiently filter without explicit department field
- Queries need compound conditions (`where('project_code', '!=', null)` AND `where('service_code', '==', null)`)

**Do this instead:**
```javascript
// ✅ CORRECT: Explicit department field
{
    department: 'services',  // Single source of truth
    service_code: 'CLMC_ACME_2026002',
    // ...
}
```

Denormalized but explicit.

---

### Anti-Pattern 4: Separate Code Sequences Per Department

**What people might do:**
```javascript
// ❌ WRONG: Independent sequences
Projects: CLMC_ACME_2026001, CLMC_ACME_2026002
Services: CLMC_ACME_2026001, CLMC_ACME_2026002  // Collision!
```

**Why it's wrong:**
- Code collisions break system-wide uniqueness assumption
- Finance/Procurement can't distinguish "002" (is it Project or Service?)
- Reporting/billing systems expect globally unique codes
- Historical data becomes ambiguous

**Do this instead:**
```javascript
// ✅ CORRECT: Shared sequence across departments
Projects: CLMC_ACME_2026001
Services: CLMC_ACME_2026002
Projects: CLMC_ACME_2026003
Services: CLMC_ACME_2026004
```

Single global sequence, department tracked in department field.

---

### Anti-Pattern 5: Hard-Coded Role Department Assumptions

**What people might do:**
```javascript
// ❌ WRONG: Assume role name indicates department
if (user.role.includes('operations')) {
    showProjectsTab = true;
}
```

**Why it's wrong:**
- Fragile — breaks if role names change
- Doesn't handle mixed-role users (Finance, Procurement see both)
- Bypasses permission system (ignores role_templates configuration)
- Hard to extend (what if we add "maintenance" department?)

**Do this instead:**
```javascript
// ✅ CORRECT: Use permission system
const hasProjectsAccess = window.hasTabAccess('projects');
const hasServicesAccess = window.hasTabAccess('services');

if (hasProjectsAccess) showProjectsTab = true;
if (hasServicesAccess) showServicesTab = true;
```

Let role_templates define access, not code assumptions.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Firebase Firestore** | Direct SDK calls via firebase.js | v10.7.1, loaded from CDN, no build step required |
| **Firebase Auth** | Built-in authentication (auth.js) | Email/password, session persistence in localStorage |
| **Netlify** | Static deploy (git push → auto deploy) | No environment variables needed, CSP headers configured |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Router ↔ Views** | Function calls (render, init, destroy) | Router manages view lifecycle, passes activeTab parameter |
| **Views ↔ Permissions** | Window functions (hasTabAccess, canEditTab) | Synchronous checks, returns true/false/undefined |
| **Views ↔ Firestore** | Firebase SDK (onSnapshot, getDocs, addDoc) | Real-time listeners stored in module-scoped array for cleanup |
| **Views ↔ Utils** | ES6 module imports | Shared utilities (formatCurrency, generateProjectCode) |
| **Projects ↔ Services** | **NO DIRECT COMMUNICATION** | Isolated — shared data only via Firestore collections |
| **MRF Form ↔ Projects/Services** | Firestore queries in init() | Conditional based on user role, populates relevant dropdown |
| **Procurement ↔ Both Departments** | Unified mrfs collection with department field | Single onSnapshot listener, filter/display by department |
| **Finance ↔ Both Departments** | Unified prs/pos collections with department field | Single onSnapshot listener, filter/display by department |

---

## Component Reuse vs Duplication Strategy

### Reuse (Shared Code)

| Component | Why Shared |
|-----------|------------|
| **utils.js** | Business logic (code generation, formatting) is identical across departments |
| **permissions.js** | Permission checks are role-based, not department-specific |
| **router.js** | Routing logic is generic, works for any view |
| **firebase.js** | Single Firestore instance serves all collections |
| **components.js** | UI components (modals, badges) are department-agnostic |
| **edit-history.js** | Edit history recording logic is identical (just parameterized) |

### Duplicate (Department-Specific)

| Component | Why Duplicated |
|-----------|----------------|
| **services.js** | Department-specific CRUD logic, queries services collection, manages service_code |
| **service-detail.js** | Detail view specific to service documents, edit history for services |
| **Navigation menu items** | Separate tabs for Projects and Services (conditional visibility) |
| **Security Rules blocks** | Separate match blocks for projects and services collections (parallel structure) |
| **Role templates entries** | Separate permission entries for projects and services tabs |

### Conditional (Department-Aware)

| Component | Why Conditional |
|-----------|----------------|
| **mrf-form.js** | Same form structure, but dropdown source differs by role |
| **procurement.js** | Same workflow, but adds department badge/filter in display |
| **finance.js** | Same workflow, but adds department badge/filter in display |
| **home.js** | Dashboard adds services stats alongside projects stats |

---

## Build Order (Dependency-Based Phases)

### Phase 1: Foundation (Backend Structure)
**What:** Add services collection, update Security Rules, modify role_templates
**Why:** Required before any UI work can begin
**Risk:** Low (additive changes, doesn't break existing Projects workflow)
**Testing:** Firebase emulator, verify services_admin can CRUD services

**Tasks:**
1. Add services collection Security Rules (mirror projects structure)
2. Add department helper functions (isAssignedToService, canAccessDepartment)
3. Update role_templates to include services tab for each role
4. Create services_admin and services_user role templates
5. Deploy rules with `firebase deploy --only firestore:rules`

---

### Phase 2: Shared Utilities (Code Generation)
**What:** Modify utils.js to support service code generation with shared sequence
**Why:** Services view needs code generation before it can create documents
**Risk:** Medium (modifies existing generateProjectCode, requires testing for race conditions)
**Testing:** Unit test with mock data, verify codes don't collide

**Tasks:**
1. Modify generateProjectCode() to query both collections
2. Add generateServiceCode() as alias
3. Add getAssignedServiceCodes() utility (mirrors getAssignedProjectCodes)
4. Update users collection schema to include assigned_service_codes array
5. Test code generation with simultaneous creates

---

### Phase 3: Services View (Isolated Department UI)
**What:** Create services.js and service-detail.js views
**Why:** Core department functionality, isolated from existing Projects
**Risk:** Low (new modules, doesn't modify existing code)
**Testing:** Manual testing with services_admin role, verify CRUD operations

**Tasks:**
1. Duplicate projects.js → services.js (replace project_code → service_code)
2. Duplicate project-detail.js → service-detail.js
3. Update router.js to add /services and /service-detail routes
4. Add permission mapping (routePermissionMap['/services'] = 'services')
5. Add navigation menu item (conditional visibility based on hasTabAccess)
6. Test view lifecycle (render → init → destroy)

---

### Phase 4: MRF Form Integration (Conditional Dropdowns)
**What:** Modify mrf-form.js to support conditional Project/Service dropdown
**Why:** Users need to create MRFs linked to Services
**Risk:** Medium (modifies existing form, requires careful testing of conditional logic)
**Testing:** Test with operations_user, services_user, and mixed-role users (Finance)

**Tasks:**
1. Add conditional rendering logic in render() (showProjectsDropdown vs showServicesDropdown)
2. Add services dropdown population in init()
3. Add department field to MRF submission logic
4. Update Security Rules for mrfs collection (add department filtering)
5. Test with multiple roles, verify correct dropdown visibility
6. Test MRF creation for both departments

---

### Phase 5: Procurement/Finance Integration (Cross-Department Workflows)
**What:** Modify procurement.js and finance.js to handle both departments
**Why:** Finance/Procurement approve work from both Projects and Services
**Risk:** Medium (modifies critical approval workflows)
**Testing:** End-to-end test with MRFs from both departments, verify approval flow

**Tasks:**
1. Add department badge rendering in MRF/PR/PO lists
2. Add department filter controls (optional dropdown to filter by department)
3. Update queries to include department field (no change if showing all)
4. Test PR generation from Services MRFs
5. Test PO issuance for Services PRs
6. Verify Finance can approve both departments

---

### Phase 6: Dashboard Integration (Services Stats)
**What:** Modify home.js to include services statistics
**Why:** Users need visibility into services workload
**Risk:** Low (additive changes to dashboard)
**Testing:** Verify stats match document counts in Firestore

**Tasks:**
1. Add services stats queries (mirror projects stats)
2. Add services stats cards to dashboard
3. Add department breakdown chart (Projects vs Services)
4. Test with mixed data (projects and services MRFs)

---

### Phase 7: Data Migration (Existing Documents)
**What:** Add department: 'projects' to all existing MRFs, PRs, POs, TRs
**Why:** Security Rules and queries rely on department field
**Risk:** High (bulk update of production data)
**Testing:** Test on copy of production data first, verify no data loss

**Tasks:**
1. Write migration script (Cloud Function or local script with Admin SDK)
2. Add department: 'projects' to all documents where field is missing
3. Verify all documents have department field
4. Deploy Security Rules that REQUIRE department field (enforce going forward)
5. Monitor production for errors after deployment

---

## Testing Strategy

### Unit Testing (Client-Side Logic)

**Code Generation:**
```javascript
// Test shared sequence across collections
const mockProjects = [{ project_code: 'CLMC_ACME_2026001' }];
const mockServices = [{ service_code: 'CLMC_ACME_2026002' }];

// Expected: generateProjectCode('ACME') returns 'CLMC_ACME_2026003'
```

**Permission Checks:**
```javascript
// Test department-scoped access
const operationsUser = { role: 'operations_user', assigned_project_codes: ['CLMC_ACME_2026001'] };
const servicesUser = { role: 'services_user', assigned_service_codes: ['CLMC_ACME_2026002'] };

// Expected: operations_user hasTabAccess('projects') = true, hasTabAccess('services') = false
// Expected: services_user hasTabAccess('projects') = false, hasTabAccess('services') = true
```

**Conditional Rendering:**
```javascript
// Test MRF form dropdown visibility
const operationsUser = { role: 'operations_user' };
const html = renderMRFForm(operationsUser);

// Expected: html.includes('id="projectSelect"') = true
// Expected: html.includes('id="serviceSelect"') = false
```

### Integration Testing (End-to-End)

**Services MRF Workflow:**
1. Login as services_user
2. Navigate to #/mrf-form
3. Verify Service dropdown visible (NOT Project dropdown)
4. Select service, fill items, submit
5. Verify MRF created with department: 'services'
6. Login as Finance
7. Verify MRF appears in Pending Approvals with "Services" badge
8. Approve MRF → Generate PR
9. Verify PR created with department: 'services'
10. Issue PO
11. Verify PO created with department: 'services'

**Cross-Department Dashboard:**
1. Create 3 Projects MRFs, 2 Services MRFs
2. Navigate to #/
3. Verify dashboard shows correct counts (3 projects, 2 services)
4. Verify department breakdown chart

**Role Isolation:**
1. Login as operations_user
2. Verify Projects tab visible, Services tab NOT visible
3. Login as services_user
4. Verify Services tab visible, Projects tab NOT visible
5. Login as Finance
6. Verify BOTH tabs visible (view-only)

### Security Rules Testing

**Firebase Emulator Suite:**
```javascript
// Test services_user can't access projects
const servicesUser = testEnv.authenticatedContext('services-user-uid', {
    role: 'services_user',
    assigned_service_codes: ['CLMC_ACME_2026002']
});

// Expected: DENIED
await assertFails(servicesUser.firestore().collection('projects').get());

// Expected: ALLOWED
await assertSucceeds(servicesUser.firestore().collection('services').get());
```

**Department Filtering:**
```javascript
// Test operations_user can't see services MRFs
const operationsUser = testEnv.authenticatedContext('operations-user-uid', {
    role: 'operations_user',
    assigned_project_codes: ['CLMC_ACME_2026001']
});

// Expected: DENIED (wrong department)
const servicesMRF = await operationsUser.firestore()
    .collection('mrfs')
    .doc('mrf-with-department-services')
    .get();

await assertFails(servicesMRF);
```

---

## Performance Considerations

### Code Generation Performance

**Current approach (queries both collections):**
- Latency: ~200-500ms with <1000 docs total per client/year
- Billable reads: 2 queries (acceptable for infrequent operation)

**Optimization for high-volume (future):**
- Implement [distributed counter](https://firebase.google.com/docs/firestore/solutions/counters) with sharded counter documents
- Trade-off: Complex write logic, but near-instant reads
- Implement when: >1000 work items per client per year

### Dropdown Population Performance

**Current approach (real-time onSnapshot):**
- Fetches all projects/services user has access to
- Acceptable for <100 items

**Optimization for large datasets (future):**
- Implement virtualized dropdown with search
- Load only first 20 items, fetch more on scroll/search
- Use Firestore `orderBy().limit(20)` with client-side search

### Dashboard Aggregation Performance

**Current approach (client-side counting):**
- Fetches all documents, counts in JavaScript
- Acceptable for <1000 total documents

**Optimization for large datasets (future):**
- Use [Firestore aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- `getAggregateFromServer()` with `count()` and `sum()`
- Single billable read instead of N reads

---

## Migration Strategy

### Data Migration (Existing Documents)

**Step 1: Assess Current Data**
```javascript
// Count documents missing department field
const mrfs = await getDocs(collection(db, 'mrfs'));
let missingDepartment = 0;
mrfs.forEach(doc => {
    if (!doc.data().department) missingDepartment++;
});
console.log(`MRFs missing department: ${missingDepartment}`);
```

**Step 2: Batch Update**
```javascript
// Add department: 'projects' to all existing documents
const batch = writeBatch(db);
const mrfs = await getDocs(collection(db, 'mrfs'));

mrfs.forEach(doc => {
    if (!doc.data().department) {
        batch.update(doc.ref, { department: 'projects' });
    }
});

await batch.commit();
console.log('Migration complete');
```

**Step 3: Verify Migration**
```javascript
// Verify all documents have department field
const mrfs = await getDocs(collection(db, 'mrfs'));
let missingDepartment = 0;
mrfs.forEach(doc => {
    if (!doc.data().department) {
        console.error('Missing department:', doc.id);
        missingDepartment++;
    }
});

if (missingDepartment === 0) {
    console.log('✅ All documents have department field');
} else {
    console.error(`❌ ${missingDepartment} documents still missing department`);
}
```

**Step 4: Deploy Enforcement Rules**
```javascript
// Security Rules (AFTER migration)
match /mrfs/{mrfId} {
    // Require department field on create
    allow create: if request.resource.data.department in ['projects', 'services'];
}
```

---

## Sources

### Multi-Tenant Architecture
- [The developer's guide to SaaS multi-tenant architecture — WorkOS](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [Architecting Secure Multi-Tenant Data Isolation | Medium](https://medium.com/@justhamade/architecting-secure-multi-tenant-data-isolation-d8f36cb0d25e)
- [Tenant isolation - SaaS Architecture Fundamentals | AWS](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html)
- [Multi-Tenant Deployment: 2026 Complete Guide | Qrvey](https://qrvey.com/blog/multi-tenant-deployment/)

### Firebase Firestore Patterns
- [Distributed counters | Firestore | Firebase](https://firebase.google.com/docs/firestore/solutions/counters)
- [Generating Auto-Incrementing Sequences With Firestore | Medium](https://medium.com/firebase-developers/generating-auto-incrementing-sequences-with-firestore-b51ab713c571)
- [Structuring Cloud Firestore Security Rules | Firebase](https://firebase.google.com/docs/firestore/security/rules-structure)
- [Write conditions for security rules | Firestore Documentation](https://cloud.google.com/firestore/docs/security/rules-conditions)

### Form Patterns
- [Conditional Forms – Softr Help Docs](https://docs.softr.io/building-blocks/vikC2AWEpQGkZd4jGyoVxo/conditional-forms/afyKqnGDXd54U8d4xLNcsR)
- [Dropdown Interaction Patterns: A Complete Guide | UXPin](https://www.uxpin.com/studio/blog/dropdown-interaction-patterns-a-complete-guide/)
- [Filter UX Design Patterns & Best Practices](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-filtering)

### Aggregation & Performance
- [Introducing COUNT, TTLs, and better scaling in Firestore](https://firebase.blog/posts/2022/12/introducing-firestore-count-ttl-scale/)
- [The Four Ways to Count in Firestore - Code.Build](https://code.build/p/the-four-ways-to-count-in-firestore-nNnqKF)

---

**Confidence Assessment:**

| Area | Confidence | Source |
|------|------------|--------|
| Multi-department isolation patterns | HIGH | Existing firestore.rules + official Firebase documentation |
| Shared sequence counter | HIGH | Existing generateProjectCode() + Firebase distributed counters docs |
| Conditional form rendering | HIGH | Existing mrf-form.js + conditional form patterns research |
| Security Rules multi-collection | HIGH | Existing firestore.rules structure + official Firebase documentation |
| Component reuse strategy | HIGH | Existing codebase analysis (projects.js, utils.js, permissions.js) |
| Build order dependencies | HIGH | Existing router/view lifecycle patterns + milestone planning experience |

All recommendations verified against existing codebase patterns and official Firebase documentation. Ready for roadmap creation.

---

*Architecture research for: Multi-department procurement system (Projects + Services)*
*Researched: 2026-02-12*
