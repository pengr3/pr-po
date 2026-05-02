# Phase 28: Services View - Research

**Researched:** 2026-02-18
**Domain:** SPA view module duplication — Services CRUD mirrors Projects pattern
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-01 | Admin can create services with auto-generated code (CLMC_CLIENT_YYYY###) | generateServiceCode() already in utils.js (Phase 27); addDoc pattern from projects.js addProject() |
| SERV-03 | Service record includes service_type field ('one-time' or 'recurring') | New field on service document; drives UI-03/UI-04 sub-tab split in services.js |
| SERV-04 | Admin can edit existing services with inline editing and auto-save | saveField() pattern from project-detail.js; onblur auto-save on text/number inputs, onchange on selects |
| SERV-05 | Admin can delete services (with confirmation) | deleteDoc() + confirm() pattern from projects.js deleteProject() |
| SERV-06 | Admin can view list of all services with sorting and filtering | sortFilteredProjects()/renderProjectsTable() pattern duplicated with service-specific IDs |
| SERV-07 | Admin can filter services by service_type, status, client | Extend projects.js applyFilters() with service_type filter |
| SERV-08 | Admin can search services by service code or name | searchInput oninput="window.debouncedFilter()" pattern from projects.js |
| SERV-09 | Service has same fields as Projects (budget, contract_cost, personnel, internal_status, project_status, active) | Direct field duplication from projects collection schema |
| SERV-10 | Service detail page shows comprehensive information with card-based layout | project-detail.js card layout (3 cards: Info, Financial Summary, Status & Assignment) |
| SERV-11 | Service detail page includes expense breakdown (MRFs/PRs/POs linked to service) | expense-modal.js showExpenseBreakdownModal() — needs service-aware version that queries by service code/name |
| SERV-12 | Active/inactive flag controls whether service appears in MRF dropdown | active field on service doc; MRF form already loads both projects and services for dropdowns |
| UI-01 | Services tab appears in navigation for services_admin and services_user roles | nav-link in index.html with data-route="services"; role_templates Firestore doc controls visibility |
| UI-02 | Services tab has two sub-tabs: Services and Recurring | Tab-switching pattern from user-management.js; router passes tab param to services.js render() |
| UI-03 | Services sub-tab shows only services with service_type='one-time' | applyFilters() adds service_type === 'one-time' scope when activeTab === 'services' |
| UI-04 | Recurring sub-tab shows only services with service_type='recurring' | Same filter, different value |
| UI-05 | Services list view displays: Code, Name, Client, Service Type, Internal Status, Project Status | Table columns; mirrored from projects.js renderProjectsTable() |
| UI-06 | Clicking service row navigates to full service detail page | onclick="window.location.hash = '#/services/detail/${service.service_code}'" pattern from projects.js |
| UI-07 | Services tab hidden from operations_admin and operations_user roles | role_templates Firestore: set services tab access=false for operations_* roles |
| UI-08 | Projects tab hidden from services_admin and services_user roles | role_templates Firestore: set projects tab access=false for services_* roles |
| ASSIGN-01 | services_admin can assign services_user to services via personnel field | Personnel pill UI in services.js; loadActiveUsers() scoped to services roles |
| ASSIGN-02 | Multi-personnel selection UI with pill display (reuse Projects pattern) | personnelPillContainer + personnelDropdown pattern from projects.js and project-detail.js |
| ASSIGN-03 | Personnel changes automatically sync to user's assigned_service_codes array | New syncServicePersonnelToAssignments() function in utils.js mirroring syncPersonnelToAssignments() |
| ASSIGN-04 | services_user filtered views show only assigned services | getAssignedServiceCodes() already in utils.js (Phase 27); apply in services.js applyFilters() |
| ASSIGN-05 | User management page allows assigning services_user to specific services | New service-assignments.js view module; added as 4th section in admin.js SECTIONS object |
| ASSIGN-06 | Assignment changes propagate via real-time listeners (no logout required) | auth.js onSnapshot on user doc detects assigned_service_codes changes; dispatches assignmentsChanged event |
</phase_requirements>

---

## Summary

Phase 28 implements the Services CRUD view by directly mirroring the established Projects pattern. The codebase already provides all the patterns needed: `app/views/projects.js` (1,203 lines) is the list/CRUD template, `app/views/project-detail.js` (789 lines) is the detail-page template, `app/views/project-assignments.js` is the admin assignment panel template, and `app/utils.js` already contains `generateServiceCode()` and `getAssignedServiceCodes()` from Phase 27.

The key difference from Projects is the `service_type` field ('one-time' vs 'recurring') which drives the two sub-tabs. The Services tab uses the router's tab parameter (already supported by the router) to scope the list view: the 'services' sub-tab filters to `service_type === 'one-time'`, the 'recurring' sub-tab filters to `service_type === 'recurring'`. Everything else is a near-identical duplication with "project" replaced by "service" throughout.

The assignment system (ASSIGN-01 through ASSIGN-06) reuses auth.js's existing `assignmentsChanged` event dispatch (already watches `assigned_service_codes` changes at auth.js lines 303–311). A new `syncServicePersonnelToAssignments()` in utils.js mirrors `syncPersonnelToAssignments()`, and a new `service-assignments.js` view mirrors `project-assignments.js`.

**Primary recommendation:** Duplicate projects.js as services.js, project-detail.js as service-detail.js, project-assignments.js as service-assignments.js. Add "services" route to router.js, nav link to index.html, and update role_templates in Firestore. Add `syncServicePersonnelToAssignments()` to utils.js.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10.7.1 | CDN | `services` collection CRUD | Already in firebase.js; same as projects |
| Pure JavaScript ES6 modules | N/A | View modules with render/init/destroy | Project-wide pattern; no build system |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| app/utils.js generateServiceCode() | Phase 27 | Auto-generate CLMC_CLIENT_YYYY### codes | On service create; already implemented |
| app/utils.js getAssignedServiceCodes() | Phase 27 | Filter services by user assignment | In services.js applyFilters() |
| app/utils.js syncPersonnelToAssignments() | Phase 7 | Sync personnel to assigned_project_codes | Pattern to copy for services version |
| app/expense-modal.js showExpenseBreakdownModal() | Phase 23 | Expense breakdown popup | Needs adaptation for services (query by service_code, not project_name) |
| app/edit-history.js recordEditHistory() | Phase 24 | Audit trail for field edits | Import in service-detail.js same as project-detail.js |
| app/permissions.js canEditTab() / hasTabAccess() | Phase 6 | Permission guard on edit actions | window.canEditTab('services') |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Duplicating project-detail.js | Single shared detail component | Too much coupling; services will diverge over time. Duplication is the established pattern in this codebase. |
| Adding service_type filter in applyFilters() | Separate Firestore queries per sub-tab | Single in-memory filter is simpler, faster (no extra reads), consistent with how projects.js works |

**Installation:** No new packages. All code runs from existing CDN Firebase v10.7.1.

---

## Architecture Patterns

### Recommended Project Structure
```
app/views/
├── services.js          # NEW: Mirror of projects.js — list + CRUD
├── service-detail.js    # NEW: Mirror of project-detail.js — full-page detail
├── service-assignments.js  # NEW: Mirror of project-assignments.js — admin panel
app/
├── utils.js             # MODIFY: Add syncServicePersonnelToAssignments()
app/router.js            # MODIFY: Add /services and /service-detail routes + handleHashChange
index.html               # MODIFY: Add Services nav link
```

### Pattern 1: View Module with render/init/destroy
**What:** Every view exports render(activeTab, param), init(activeTab, param), destroy()
**When to use:** Every new view in this SPA

```javascript
// Source: app/views/projects.js (established pattern)
let listeners = [];

export function render(activeTab = null) {
    return `<div class="container">...</div>`;
}

export async function init(activeTab = null) {
    attachWindowFunctions();
    await loadClients();
    await loadActiveUsers();
    await loadServices(); // Real-time onSnapshot → listeners array
}

export async function destroy() {
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
    // delete all window.* functions
}
```

### Pattern 2: Sub-Tab Filtering in Services List
**What:** services.js renders one view; the active sub-tab (services/recurring) scopes the data
**When to use:** Services tab only (projects.js does NOT do this — services is the first view with sub-tabs that scope the list data)

```javascript
// Source: Derived from projects.js applyFilters() + router tab param
function applyFilters() {
    // Sub-tab scope: activeTab controls which service_type is shown
    const serviceTypeFilter = (activeTab === 'recurring') ? 'recurring' : 'one-time';

    filteredServices = allServices.filter(service => {
        const matchesType = service.service_type === serviceTypeFilter;
        const matchesSearch = !searchTerm || service.service_code.toLowerCase().includes(searchTerm) || ...;
        const matchesStatus = ...;
        const matchesClient = ...;

        // ASSIGN-04: scope to assigned services for services_user
        const assignedCodes = window.getAssignedServiceCodes?.();
        if (assignedCodes !== null && !assignedCodes.includes(service.service_code)) return false;

        return matchesType && matchesSearch && matchesStatus && matchesClient;
    });

    sortFilteredServices();
    renderServicesTable();
}
```

### Pattern 3: Personnel Pill UI
**What:** Multi-select with pill display for assigning users to services
**When to use:** In services.js (add/edit form) and service-detail.js (inline editing)

```javascript
// Source: app/views/projects.js lines 410-500 (exact pattern to copy)
// key elements:
//   - #servicePersonnelPillContainer (container id must be unique vs projects)
//   - #servicePersonnelDropdown
//   - #servicePersonnelSearchInput
//   - selectedPersonnel = [] (module-level state)
//   - selectPersonnel(), removePersonnel(), filterPersonnelDropdown(), showPersonnelDropdown()
```

### Pattern 4: Detail Page with Inline Editing
**What:** Full-page detail view, fields editable via onblur/onchange, saves immediately to Firestore
**When to use:** service-detail.js

```javascript
// Source: app/views/project-detail.js saveField() (lines 576-641)
async function saveField(fieldName, newValue) {
    if (window.canEditTab?.('services') === false) { ... }
    if (['service_code', 'client_id', 'client_code'].includes(fieldName)) return false; // locked
    // validate → save → recordEditHistory (fire-and-forget)
}
```

### Pattern 5: Router Detail Route
**What:** Hash #/services/detail/CLMC_CLIENT_2026001 navigates to service-detail view
**When to use:** services.js row onclick + router.js handleHashChange

```javascript
// Source: app/router.js lines 354-359 (projects pattern to copy)
// In handleHashChange():
if (path === '/services' && tab === 'detail' && subpath) {
    navigate('/service-detail', null, subpath);
    return;
}
// Row onclick in services.js:
onclick="window.location.hash = '#/services/detail/${service.service_code}'"
```

### Pattern 6: Personnel-Assignment Sync
**What:** When personnel changes on a service, atomically update users' assigned_service_codes
**When to use:** services.js addService()/saveEdit(), service-detail.js selectDetailPersonnel()/removeDetailPersonnel()

```javascript
// Source: app/utils.js syncPersonnelToAssignments() (lines 600-663) — COPY THIS
// New function: syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds)
// Must use arrayUnion/arrayRemove on assigned_service_codes (not assigned_project_codes)
```

### Pattern 7: Assignment Change Propagation (Real-time)
**What:** auth.js already watches `assigned_service_codes` on the user doc and dispatches `assignmentsChanged`
**When to use:** services.js init() listens for `assignmentsChanged` exactly like projects.js does

```javascript
// Source: app/auth.js lines 303-311 (ALREADY IMPLEMENTED)
// The condition checks BOTH assigned_project_codes AND assigned_service_codes changes.
// services.js just needs to listen:
const assignmentChangeHandler = () => { applyFilters(); };
window.addEventListener('assignmentsChanged', assignmentChangeHandler);
```

### Anti-Patterns to Avoid
- **Using project_name to link MRFs to services:** Projects currently link POs/TRs by project_name. Services should link by service_code (stored on MRF documents as a new field). This is out of scope for Phase 28 (SERV-11 expense breakdown can use service_name as a fallback query for now, matching the current projects pattern).
- **Reusing project-scoped window function names:** projects.js registers window.selectPersonnel, window.removePersonnel, etc. Services must use different names (e.g., window.selectServicePersonnel) to avoid collision when both views are active — but since destroy() is called on navigation, name collision is only a risk during tab switching. Use distinct prefixed names anyway to be safe.
- **Forgetting to store client_code on service documents:** generateServiceCode() range query filters on client_code. If service documents don't store client_code, the range query returns empty and the counter resets to 001. This is the Phase 27 prerequisite.
- **Forgetting to store service_code on service documents:** The service-detail view queries `where('service_code', '==', param)`. If the field is missing, the page shows "Service not found."

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service code generation | Custom counter logic | generateServiceCode() in utils.js | Already handles cross-collection shared sequence (Phase 27) |
| Assigned service filtering | Custom Firestore query | getAssignedServiceCodes() in utils.js | Already handles null/array/empty distinction for services_user |
| Personnel assignment sync to user docs | Custom updateDoc calls | Copy syncPersonnelToAssignments() pattern for services | arrayUnion/arrayRemove pattern handles all edge cases |
| Expense breakdown modal | Custom modal | showExpenseBreakdownModal() in expense-modal.js | Already built; only needs minor adaptation for service-name query |
| Edit history tracking | Custom logging | recordEditHistory() in edit-history.js | Already built and imported by project-detail.js |
| Permission guards | Custom role checks | window.canEditTab('services') | Real-time permissions from role_templates; respects live changes |
| Tab visibility in nav | Custom CSS show/hide | role_templates Firestore doc + permissions.js | Already fires permissionsChanged event; nav updates automatically |
| Assignment admin panel | Custom UI | Copy project-assignments.js as service-assignments.js | All patterns established; only collection names change |

---

## Common Pitfalls

### Pitfall 1: Window Function Name Collision Between Projects and Services
**What goes wrong:** If services.js registers `window.selectPersonnel` and projects.js also registered it, whichever view loaded last wins. Navigating back to projects breaks personnel pills.
**Why it happens:** Router calls destroy() between different view navigations, which cleans up window functions. But if names clash during the transition, a brief period of wrong-binding occurs.
**How to avoid:** Use distinct window function names for services: `window.addService`, `window.editService`, `window.selectServicePersonnel`, `window.removeServicePersonnel`, etc. Mirror the prefix pattern from project-detail.js which uses `window.selectDetailPersonnel` to distinguish from projects.js `window.selectPersonnel`.
**Warning signs:** TypeError in console when switching between Projects and Services tabs.

### Pitfall 2: service_type Sub-Tab State Not Preserved
**What goes wrong:** User is on Recurring sub-tab, clicks a service row, goes to detail page, hits back — lands on Services sub-tab instead of Recurring.
**Why it happens:** activeTab is passed as a parameter to render()/init() but not preserved in module state for back-navigation.
**How to avoid:** Store activeTab in a module-level variable in services.js and restore it when re-rendering after navigation. The router passes `tab` from the hash on every navigation.
**Warning signs:** Sub-tab resets to default after any navigation.

### Pitfall 3: Missing client_code Field on Service Documents
**What goes wrong:** generateServiceCode() range query finds no existing services for that client/year (even if 5 already exist), so it always returns `CLMC_CLIENT_YYYY001`, creating duplicate codes.
**Why it happens:** Firestore range queries filter on the indexed field. If the document doesn't have `client_code`, the where('client_code', '==', clientCode) filter excludes it.
**How to avoid:** When addDoc'ing a service, ALWAYS include `client_code: clientCode` and `service_code: generatedCode`.
**Warning signs:** Multiple services with identical CLMC codes.

### Pitfall 4: Expense Breakdown Queries by project_name — Services Use service_name
**What goes wrong:** showExpenseBreakdownModal() queries `where('project_name', '==', projectName)`. MRFs for services might store `service_name` or `service_code`. If the field doesn't match, expense total shows 0.
**Why it happens:** The expense modal was built for projects only. Services may use a different field on MRF/PO documents.
**How to avoid:** For Phase 28, check what field MRF forms store for service selection. Since MRF form integration is not in Phase 28 scope (SERV-11 shows "expense breakdown linked to service" which requires MRFs to already store service_code), display 0 or a placeholder. SERV-11 is researchable post-MRF-service-integration. The plan can stub the expense section.
**Warning signs:** Expense always shows 0 for services even when MRFs exist.

### Pitfall 5: Firestore Index Required for Service Code Range Query
**What goes wrong:** generateServiceCode() uses `where('client_code', '==', ...) + where('service_code', '>=', ...) + where('service_code', '<=', ...)` on the `services` collection. Firestore requires a composite index for this.
**Why it happens:** Composite queries on multiple fields require manual index creation in Firebase Console.
**How to avoid:** Create the Firestore index for `services` collection: (client_code ASC, service_code ASC) before testing. The projects collection already has this index (from Phase 2/3). Services is a new collection — the index must be added.
**Warning signs:** Console error "The query requires an index" with a link to create it.

### Pitfall 6: role_templates Firestore Documents Not Updated for New Tab
**What goes wrong:** Services tab added to nav but never appears for services_admin/services_user because role_templates don't have a 'services' tab key.
**Why it happens:** permissions.js reads `currentPermissions.tabs['services'].access`. If the key doesn't exist, `hasTabAccess('services')` returns false.
**How to avoid:** Update role_templates Firestore documents for all roles: set `tabs.services.access = true, tabs.services.edit = true` for services_admin and services_user; `tabs.services.access = false` for all other roles. Simultaneously set `tabs.projects.access = false` for services_admin and services_user.
**Warning signs:** Services tab never appears in nav even after role is assigned; or all roles see the Services tab.

### Pitfall 7: assignmentsChanged Event Must Trigger Re-filter in services.js
**What goes wrong:** Admin updates a services_user's assigned_service_codes via service-assignments panel. The services list doesn't update in real time for the affected user.
**Why it happens:** Services.js must explicitly listen for assignmentsChanged event and call applyFilters(). auth.js already dispatches it when assigned_service_codes changes (lines 303-311 already cover this field).
**How to avoid:** In services.js init(), add:
```javascript
const assignmentChangeHandler = () => applyFilters();
window.addEventListener('assignmentsChanged', assignmentChangeHandler);
window._servicesAssignmentHandler = assignmentChangeHandler;
```
And in destroy(), remove it.
**Warning signs:** services_user's list doesn't update after admin assigns them a new service without page refresh.

---

## Code Examples

Verified patterns from official sources (all verified in codebase):

### Service Document Firestore Schema
```javascript
// Pattern: addDoc to 'services' collection — mirrors projects collection
// Source: app/views/projects.js addProject() lines 649-665
await addDoc(collection(db, 'services'), {
    service_code,          // REQUIRED: 'CLMC_CLIENT_2026001' — for range query
    service_name,          // string
    service_type,          // REQUIRED: 'one-time' | 'recurring' — for sub-tab filter
    client_id,             // Firestore document ID of client
    client_code,           // REQUIRED: 'CLIENT' — for generateServiceCode range query
    internal_status,       // 'For Inspection' | 'For Proposal' | ...
    project_status,        // 'Pending Client Review' | ...
    budget,                // number | null
    contract_cost,         // number | null
    personnel_user_ids,    // string[]
    personnel_names,       // string[]
    personnel_user_id: null,  // legacy field nulled out
    personnel_name: null,     // legacy field nulled out
    personnel: null,          // legacy field nulled out
    active: true,
    created_at: new Date().toISOString()
});
```

### Router Addition for Services Routes
```javascript
// Source: app/router.js (existing handleHashChange + routes object)
// MODIFICATION 1: Add to routes object
'/services': {
    name: 'Services',
    load: () => import('./views/services.js'),
    title: 'Services | CLMC Operations',
    defaultTab: 'services'  // default to 'services' sub-tab (one-time)
},
'/service-detail': {
    name: 'Service Detail',
    load: () => import('./views/service-detail.js'),
    title: 'Service Details | CLMC Operations'
},

// MODIFICATION 2: Add to routePermissionMap
'/services': 'services',
'/service-detail': 'services',

// MODIFICATION 3: handleHashChange — add before final navigate()
if (path === '/services' && tab === 'detail' && subpath) {
    navigate('/service-detail', null, subpath);
    return;
}
// Same in handleInitialRoute
```

### Services Nav Link in index.html
```html
<!-- Source: index.html lines 29-35 (existing nav pattern) -->
<!-- Add between Projects and Material Request links -->
<a href="#/services" class="nav-link" data-route="services">Services</a>
```

### syncServicePersonnelToAssignments() in utils.js
```javascript
// Source: app/utils.js syncPersonnelToAssignments() lines 600-663 (exact copy, field changed)
// CHANGE: arrayUnion/arrayRemove on 'assigned_service_codes' instead of 'assigned_project_codes'
export async function syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds) {
    if (!serviceCode) {
        console.warn('[ServicePersonnelSync] No service_code provided, skipping sync');
        return [];
    }
    // ... identical logic to syncPersonnelToAssignments but:
    //   - log prefix: '[ServicePersonnelSync]'
    //   - arrayUnion/arrayRemove on 'assigned_service_codes' not 'assigned_project_codes'
    //   - check all_services flag (not all_projects) before skipping user
}
```

### service-assignments.js Pattern
```javascript
// Source: app/views/project-assignments.js (full file — near-identical copy)
// CHANGES:
//   - Collection: 'services' (not 'projects')
//   - User query filter: where('role', 'in', ['services_user', 'services_admin'])
//   - User field: all_services, assigned_service_codes (not all_projects, assigned_project_codes)
//   - Code field on service doc: service_code (not project_code)
//   - Window functions: handleAllServicesChange, handleServiceCheckboxChange
//   - Reverse sync: calls syncServicePersonnelToAssignments (new util)
```

### Admin Panel Integration for service-assignments.js
```javascript
// Source: app/views/admin.js SECTIONS object (lines 14-27)
// ADD to SECTIONS:
service_assignments: {
    label: 'Service Assignments',
    load: () => import('./service-assignments.js')
}
// Also add a button in render() for the new section
// Role gate in service-assignments.js: only super_admin and services_admin can access
```

### Personnel Pill IDs — Must Be Unique Per View
```javascript
// Source: projects.js uses:
//   #personnelPillContainer, #personnelDropdown, #personnelSearchInput
// service-detail.js should use:
//   #serviceDetailPillContainer, #serviceDetailPersonnelDropdown, #serviceDetailPersonnelSearch
// services.js (add/edit form) should use:
//   #servicePillContainer, #servicePersonnelDropdown, #servicePersonnelSearchInput
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Projects only, no Services | Projects + Services with shared CLMC code sequence | Phase 27/28 | Services are first-class records, not just projects |
| Single role group (operations_*) | Two parallel role groups: operations_* and services_* | Phase 26 | Separate permission domains for each business unit |
| Project assignments via project-assignments.js | Parallel service assignments via service-assignments.js | Phase 28 | Admin can independently manage service assignments |

**Deprecated/outdated:**
- None — this is all new code. No existing code is being removed.

---

## Open Questions

1. **SERV-11: Expense breakdown for services — what field do MRF/PO documents use to link to services?**
   - What we know: MRF form currently links to projects via project_name. Phase 28 scope does not include MRF-service integration.
   - What's unclear: Whether SERV-11 expense breakdown is expected to work in Phase 28, or whether it requires a future MRF-service-linking phase.
   - Recommendation: Stub the expense section in service-detail.js to show "No expense data (MRF integration pending)" for Phase 28. SERV-11 expense breakdown becomes fully functional in a future phase when MRF form is updated to link to services.

2. **Firestore index for services collection composite query**
   - What we know: generateServiceCode() needs composite index on services: (client_code ASC, service_code ASC). The index must be manually created in Firebase Console.
   - What's unclear: Whether the index was pre-created in Phase 26 or 27 when the collection was first referenced.
   - Recommendation: Plan must include a task to create/verify the Firestore index before testing generateServiceCode() with real service documents.

3. **Role templates Firestore update — who runs the seed/update?**
   - What we know: Permissions come from role_templates Firestore collection. A new 'services' tab key must be added to every role's template document.
   - What's unclear: Whether Phase 28 provides a one-time script or manual Firebase Console update.
   - Recommendation: Include a task that either provides a browser-console script (like the seed-roles.js pattern from Phase 6) or clear Firebase Console instructions to update all role_templates docs.

---

## Sources

### Primary (HIGH confidence)
- `app/views/projects.js` — 1,203 lines, read in full — primary template for services.js
- `app/views/project-detail.js` — 789 lines, read in full — primary template for service-detail.js
- `app/views/project-assignments.js` — 337 lines, read in full — primary template for service-assignments.js
- `app/utils.js` — 665 lines, read in full — generateServiceCode(), getAssignedServiceCodes(), syncPersonnelToAssignments()
- `app/router.js` — 451 lines, read in full — route definitions, handleHashChange, parseHash patterns
- `app/auth.js` — 551 lines, read in full — assignmentsChanged event dispatch (lines 303-311 cover assigned_service_codes)
- `app/permissions.js` — 138 lines, read in full — hasTabAccess, canEditTab patterns
- `app/views/user-management.js` — 1,799 lines, read in full — approval flow writes assigned_service_codes (lines 729-741)
- `app/views/admin.js` — 175 lines, read in full — SECTIONS pattern for adding service-assignments
- `app/expense-modal.js` — 337 lines, read in full — expense modal queries by project_name
- `index.html` — 141 lines, read in full — nav link pattern with data-route attribute
- `.planning/phases/27-code-generation/27-01-SUMMARY.md` — Phase 27 completion confirmation

### Secondary (MEDIUM confidence)
- Phase 26 decisions (from STATE.md context provided): services_admin/services_user roles exist in Firestore, user-management.js writes all_services and assigned_service_codes on approval/role-change

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entire pattern library in codebase, read directly
- Architecture: HIGH — direct duplication of proven patterns
- Pitfalls: HIGH — identified from reading actual code; pitfalls are specific to this codebase's patterns
- SERV-11 expense breakdown: LOW — depends on MRF-service integration not yet built

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (30 days — stable codebase, no external dependencies)
