# Phase 29: MRF Integration - Research

**Researched:** 2026-02-18
**Domain:** MRF form modification, role-based UI, Services Firestore integration
**Confidence:** HIGH

## Summary

Phase 29 connects the Services system (built in Phase 28) to the MRF procurement workflow through role-based dropdown visibility. The MRF form in `app/views/mrf-form.js` already has a fully-working project dropdown with assignment filtering (Phase 7 pattern). The task is to add a parallel services dropdown that appears or hides based on the user's role, and to store denormalized `service_code`, `service_name`, and `department` fields on submitted MRFs.

The services Firestore schema is confirmed from `services.js`: documents store `service_code` (e.g., `CLMC_ACME_2026001`), `service_name`, `active: boolean` (not a `status` string — unlike projects which use `status: 'active'`), and `client_code`. Active services are filtered by `where('active', '==', true)`, not `where('status', '==', 'active')`. This is a critical difference from the project dropdown pattern.

The role system is implemented via `window.getCurrentUser().role` (string) and the `role_templates` Firestore collection for tab-level permissions. Role-to-dropdown mapping is straightforward: operations roles see only projects, services roles see only services, all other roles (super_admin, finance, procurement) see both. Downstream impact is minimal — procurement.js and finance.js display `project_code + project_name` everywhere using a safe fallback pattern (`mrf.project_code ? ... + ' - ' : ''`). Those display lines need to be extended to also handle `service_code + service_name` for services-department MRFs, but PR generation itself needs no structural changes since it reads directly from `mrfData` fields.

**Primary recommendation:** Build Phase 29 in 3 plans: (1) add role-based dropdown logic to `mrf-form.js` with services listener; (2) update submission handler to store `service_code`, `service_name`, `department`; (3) update display strings in `procurement.js` and `finance.js` to show service info for services-department MRFs.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MRF-01 | MRF form shows Projects dropdown for operations_admin and operations_user | Role check via `window.getCurrentUser().role`; show/hide `#projectNameGroup`; existing `loadProjects()` pattern unchanged |
| MRF-02 | MRF form shows Services dropdown for services_admin and services_user | Parallel `loadServices()` function; show/hide `#serviceNameGroup`; query `where('active', '==', true)` |
| MRF-03 | Super Admin, Finance, Procurement see both Projects and Services dropdowns | Both groups visible; clear section labels added in HTML |
| MRF-04 | Services dropdown displays format "CLMC_CODE_YYYY### - Service Name" | `option.textContent = \`\${service.service_code} - \${service.service_name}\`` |
| MRF-05 | Services dropdown shows only active services (inactive excluded) | `where('active', '==', true)` — NOT `where('status', '==', 'active')` (services use boolean field) |
| MRF-06 | Services dropdown sorted by most recent first | In-memory sort on `created_at` descending, matching project sort pattern |
| MRF-07 | MRF stores denormalized service_code and service_name for performance | On form submit: `service_code: selectedOption.value`, `service_name: selectedOption.dataset.serviceName` |
| MRF-08 | MRF stores department field ('projects' or 'services') | Set `department: 'services'` when service selected, `department: 'projects'` when project selected |
| MRF-09 | Services-linked MRFs appear in procurement workflow (PR generation) | PR generation copies `mrfData.project_code`, `mrfData.project_name` — need to also copy `service_code`, `service_name`; no structural change needed |
| MRF-10 | Service code and name displayed in MRF lists and detail views | Update display pattern in procurement.js (~6 locations) and finance.js (~5 locations) to handle `department === 'services'` branch |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 (CDN) | Real-time services query | Already in use; `onSnapshot` established pattern |
| Vanilla JavaScript ES6 modules | — | DOM manipulation, role checks | Zero-build constraint; existing pattern |
| `window.getCurrentUser()` | auth.js | Role-based visibility | Already exposed globally, used in services.js and mrf-form.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getAssignedServiceCodes()` | utils.js | Filter services dropdown for services_user | Parallel to existing `getAssignedProjectCodes()` for operations_user |
| `onSnapshot` | Firestore v10.7.1 | Real-time services list in dropdown | Matches project dropdown pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Role string check in JS | Firestore permission query | JS role check is instant; Firestore query adds latency and is overkill for UI visibility |
| `getDocs` once | `onSnapshot` listener | `onSnapshot` matches existing project dropdown pattern; auto-updates if service activated/deactivated |
| Show/hide with CSS | Conditionally render HTML | Show/hide preserves listener; re-render would require re-initializing listeners on each show/hide cycle |

## Architecture Patterns

### Recommended Change Structure
```
app/views/
├── mrf-form.js          — PRIMARY: add services dropdown, role-based visibility, update submit handler
├── procurement.js       — DISPLAY: update ~6 project display strings to handle department field
└── finance.js           — DISPLAY: update ~5 project display strings to handle department field
```

### Pattern 1: Role-Based Dropdown Visibility
**What:** Show/hide dropdown groups based on `user.role` string at init time
**When to use:** mrf-form.js `init()` — called every time the view loads

```javascript
// Source: app/views/mrf-form.js init() — adapt from services.js role check pattern
export async function init() {
    const user = window.getCurrentUser?.();
    const role = user?.role;

    // Determine which dropdowns to show
    const showProjects = ['super_admin', 'finance', 'procurement', 'operations_admin', 'operations_user'].includes(role);
    const showServices = ['super_admin', 'finance', 'procurement', 'services_admin', 'services_user'].includes(role);

    const projectGroup = document.getElementById('projectNameGroup');
    const serviceGroup = document.getElementById('serviceNameGroup');

    if (projectGroup) projectGroup.style.display = showProjects ? '' : 'none';
    if (serviceGroup) serviceGroup.style.display = showServices ? '' : 'none';

    if (showProjects) loadProjects();    // existing function
    if (showServices) loadServices();   // new function
}
```

### Pattern 2: Services Dropdown Listener
**What:** `onSnapshot` query for `active === true` services, sorted by `created_at` descending
**When to use:** `loadServices()` function called from `init()` when user role is services role or super role

```javascript
// Source: adapted from existing loadProjects() in app/views/mrf-form.js:262-293
let servicesListener = null;

function loadServices() {
    const serviceSelect = document.getElementById('serviceName');
    if (!serviceSelect) return;

    try {
        const q = query(collection(db, 'services'), where('active', '==', true)); // boolean, NOT string
        servicesListener = onSnapshot(q, (snapshot) => {
            let services = [];
            snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));

            // Sort by created_at descending (most recent first — MRF-06)
            services.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            });

            // Apply services_user scope filter (parallel to getAssignedProjectCodes)
            const assignedCodes = window.getAssignedServiceCodes?.();
            if (assignedCodes !== null) {
                services = services.filter(s => assignedCodes.includes(s.service_code));
            }

            serviceSelect.innerHTML = '<option value="">-- Select a service --</option>';
            services.forEach(service => {
                const option = document.createElement('option');
                option.value = service.service_code;       // MRF-07: stable reference
                option.textContent = `${service.service_code} - ${service.service_name}`; // MRF-04
                option.dataset.serviceName = service.service_name;
                serviceSelect.appendChild(option);
            });
        });
    } catch (err) {
        console.error('[MRFForm] Error loading services:', err);
    }
}
```

### Pattern 3: Submission Handler — Determine Department and Store Fields
**What:** On submit, check which dropdown is visible/has a value; set `department`, `service_code`/`service_name` or `project_code`/`project_name`
**When to use:** `handleFormSubmit()` — replaces current project-only collection logic

```javascript
// Source: modified from existing handleFormSubmit() in app/views/mrf-form.js:521-598
const serviceGroup = document.getElementById('serviceNameGroup');
const projectGroup = document.getElementById('projectNameGroup');

const serviceSelect = document.getElementById('serviceName');
const projectSelect = document.getElementById('projectName');

const serviceVisible = serviceGroup && serviceGroup.style.display !== 'none';
const projectVisible = projectGroup && projectGroup.style.display !== 'none';

let department, project_code, project_name, service_code, service_name;

if (serviceVisible && serviceSelect?.value) {
    department = 'services';
    service_code = serviceSelect.value;
    service_name = serviceSelect.options[serviceSelect.selectedIndex]?.dataset?.serviceName || '';
    project_code = '';
    project_name = '';
} else if (projectVisible && projectSelect?.value) {
    department = 'projects';
    project_code = projectSelect.value;
    project_name = projectSelect.options[projectSelect.selectedIndex]?.dataset?.projectName || '';
    service_code = '';
    service_name = '';
} else {
    showAlert('error', 'Please select a project or service.');
    return;
}

const mrfDoc = {
    // ...existing fields...
    department,           // MRF-08: 'projects' | 'services'
    project_code,         // existing field, empty string for services MRFs
    project_name,         // existing field, empty string for services MRFs
    service_code,         // MRF-07: new field
    service_name,         // MRF-07: new field
};
```

### Pattern 4: Display Update in Procurement/Finance — Department-Aware Label
**What:** Extend existing display pattern to show service info when `department === 'services'`
**When to use:** All 11 locations in procurement.js and finance.js where project is displayed

```javascript
// Source: existing pattern from procurement.js line 765, 821, 979, 2644, 3711, 3956, 4113, 4342, 4907, 4955
// EXISTING (shows project):
`${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}`

// UPDATED (department-aware):
function getMRFProjectLabel(mrf) {
    if (mrf.department === 'services' || mrf.service_code) {
        return `${mrf.service_code ? mrf.service_code + ' - ' : ''}${mrf.service_name || 'No service'}`;
    }
    return `${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}`;
}
```

### Anti-Patterns to Avoid
- **Using `where('status', '==', 'active')` for services:** Services use `active: boolean`, NOT a status string. Wrong query returns zero results.
- **Required validation that breaks single-dropdown users:** When only the project OR service dropdown is visible, the other must NOT be `required` in HTML or validated in JS.
- **Storing service_name in select value:** Store `service_code` as value; read `service_name` from `dataset.serviceName` on the selected option (same approach as existing `dataset.projectName`).
- **PR generation without passing new fields:** `generatePR()` copies from `mrfData` — once `service_code` and `service_name` are stored on the MRF document, they propagate to PRs automatically when PR creation includes those fields. Must add them to the PR doc.
- **Forgetting to clean up `servicesListener`:** `destroy()` must unsubscribe both `projectsListener` and `servicesListener`.

## Role-to-Dropdown Mapping Table

| Role | Projects Dropdown | Services Dropdown | Notes |
|------|-------------------|-------------------|-------|
| `operations_admin` | Visible | Hidden | All projects visible (no filter) |
| `operations_user` | Visible | Hidden | Filtered to `assigned_project_codes` |
| `services_admin` | Hidden | Visible | All services visible (no filter) |
| `services_user` | Hidden | Visible | Filtered to `assigned_service_codes` |
| `super_admin` | Visible | Visible | Both, with labels |
| `finance` | Visible | Visible | Both, with labels |
| `procurement` | Visible | Visible | Both, with labels |

## Services Firestore Schema

Confirmed from `app/views/services.js` `addService()` function (line 695-712):

```javascript
// Fields confirmed in services collection documents:
{
    service_code: string,      // e.g. "CLMC_ACME_2026001" — primary stable reference
    service_name: string,      // display name
    service_type: string,      // 'one-time' | 'recurring'
    client_id: string,         // Firestore doc ID for client
    client_code: string,       // REQUIRED for generateServiceCode() range query
    internal_status: string,   // 'For Inspection' | 'For Proposal' | etc.
    project_status: string,    // 'Pending Client Review' | etc.
    budget: number | null,
    contract_cost: number | null,
    personnel_user_ids: string[],
    personnel_names: string[],
    active: boolean,           // CRITICAL: boolean not string! Filter with where('active', '==', true)
    created_at: string         // ISO date string
}
```

**CRITICAL:** `active` is a boolean field. The services dropdown query MUST use `where('active', '==', true)` — NOT `where('status', '==', 'active')`. Projects use `status: 'active'` (string). This is the most important schema difference.

## Impact Analysis: procurement.js

**PR Generation (generatePR, generatePRandTR, submitTransportRequest):**

All three functions copy fields from `mrfData` into the PR/TR document:
```javascript
// Current pattern (lines 3140-3144, 3425-3429, 3487-3491, 2876-2880):
project_code: mrfData.project_code || '',
project_name: mrfData.project_name,
```

For services MRFs, `mrfData.project_code` will be `''` and `mrfData.project_name` will be `''`. This is safe — the PR/TR will simply have empty project fields. To fully satisfy MRF-09 (service code displayed in procurement workflow), the PR doc creation should also copy `service_code` and `service_name` from `mrfData`. This is a 2-line addition to each of the 4 PR/TR creation blocks.

**MRF Display Locations in procurement.js (project_name/project_code pattern):**

| Line(s) | Context | Action |
|---------|---------|--------|
| 765 | MRF list card (pending MRFs) | Update to department-aware label |
| 821 | MRF list card (rejected MRFs) | Update to department-aware label |
| 979 | MRF detail panel (read-only view) | Update to department-aware label |
| 2644 | MRF Records table row | Update to department-aware label |
| 3711 | PO Tracking table row | Update to department-aware label |
| 3956 | PR detail modal | Update to department-aware label |
| 4113 | PO detail modal | Update to department-aware label |
| 4342 | Timeline description | Update to include service_name |
| 4907 | PR document generation (PROJECT field) | Update to use service_code/name if services MRF |
| 4955 | PO document generation (PROJECT field) | Update to use service_code/name if services MRF |

Total: 10 display locations in procurement.js.

**MRF Loading/Filtering (loadMRFs, filterPRPORecords):**

The search filter at line 2275 searches `mrf.project_name`. For services MRFs this will be empty. Should also search `mrf.service_name`:
```javascript
// Line 2273-2275 — extend search:
(mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput)) ||
(mrf.service_name && mrf.service_name.toLowerCase().includes(searchInput));  // ADD
```

**MRF Scoping Filter (lines 639-643):**

Current scoping filters operations_user by `assigned_project_codes`. Services MRFs (`department === 'services'`) are submitted by services roles, not operations roles. There is no conflict — services users don't submit to the same queue as operations users. However, the defensive inclusion for legacy MRFs without `project_code` will also inclusively pass services MRFs (since `!mrf.project_code` is true for services MRFs where `project_code === ''`). This means services MRFs will appear in the procurement queue for operations_user — which may or may not be desired. This needs a plan decision: likely services MRFs should be visible to ALL procurement roles (no scope filter for services department). The current defensive fallback already achieves this for services MRFs.

## Impact Analysis: finance.js

**PR/TR display locations:**

| Line(s) | Context | Action |
|---------|---------|--------|
| 511 | PO document generation PROJECT field | Update department-aware |
| 805 | Project expenses query `where('project_name', '==', ...)` | Services MRFs will have `project_name: ''`, so excluded from project expenses — acceptable (separate analytics later) |
| 1125 | Pending PRs table row | Update department-aware label |
| 1174 | Transport Requests table row | Update department-aware label |
| 1257 | PR detail modal | Update department-aware label |
| 1390 | TR detail modal | Update department-aware label |
| 1618-1619 | PO creation from approved PR (copies project_code/name) | Add service_code/service_name copy |
| 2002 | POs table row | Update department-aware label |

Total: 7 display locations + 1 PO creation fix in finance.js.

**Project Expenses query (line 803-816):** Queries POs with `where('project_name', '==', project.project_name)`. Services-linked POs will have empty `project_name`, so they won't match any project query. This means services expenses are excluded from project expense analytics — acceptable for Phase 29 scope (services analytics is a future concern).

## Recommended Plan Structure

**3 plans, sequenced:**

### Plan 29-01: mrf-form.js — Role-Based Dropdown UI
- Add `#serviceNameGroup` HTML block (parallel to `#projectNameGroup`) to `render()`
- Add `loadServices()` function with `onSnapshot` and `where('active', '==', true)` filter
- Add `servicesListener` module-level variable
- Update `init()` to check role and show/hide groups, call appropriate load functions
- Wire `assignmentsChanged` event to also re-filter services dropdown (for `services_user`)
- Update `destroy()` to clean up `servicesListener`
- NO submit handler changes yet (Plan 01 is UI-only)

### Plan 29-02: mrf-form.js — Submission Handler + Firestore Fields
- Update `handleFormSubmit()` to determine `department` from which dropdown has a value
- Store `department`, `service_code`, `service_name` on MRF document
- Ensure `project_code` and `project_name` remain stored (empty string) for services MRFs
- Update `saveNewMRF()` in `procurement.js` (new MRF creation from procurement view) — add `service_code`, `service_name`, `department` fields when a service is selected
- Note: procurement.js MRF creation form also has a project dropdown — Phase 29 may or may not need to add services dropdown there (lower priority, operations workflow focused)

### Plan 29-03: Display Updates in procurement.js and finance.js
- Add `getMRFProjectLabel(mrf)` helper function (or inline the pattern)
- Update all 10 display locations in procurement.js
- Update search filter in `filterPRPORecords` to include `service_name`
- Update all 7 display locations in finance.js
- Update PR/PO creation in procurement.js and finance.js to copy `service_code`, `service_name` from MRF

## Pitfalls and Risks

### Pitfall 1: Wrong Field for Active Services Filter
**What goes wrong:** Query returns zero services because filter uses wrong field
**Why it happens:** Projects use `status: 'active'` (string). Services use `active: true` (boolean).
**How to avoid:** ALWAYS use `where('active', '==', true)` for services collection
**Warning signs:** Services dropdown is empty even though services exist in Firestore

### Pitfall 2: Validation Blocks Single-Dropdown Users
**What goes wrong:** `operations_user` sees only projects dropdown, but validation requires a service to be selected too
**Why it happens:** HTML `required` attribute on hidden select still triggers browser validation
**How to avoid:** Set `required` on select only when visible; OR use JS validation only (no HTML required)
**Warning signs:** operations_user cannot submit MRF form (browser shows validation error on hidden field)

### Pitfall 3: Services MRFs with Empty project_code Cause Scoping Bugs
**What goes wrong:** Services MRFs appear in operations_user's MRF list (or don't appear at all)
**Why it happens:** Current scoping: `!mrf.project_code || assignedCodes.includes(mrf.project_code)` — since `service_code MRF.project_code === ''`, the first condition is truthy, so services MRFs pass through for ALL users
**How to avoid:** For Phase 29, this defensive fallback is acceptable — services MRFs appearing in all procurement queues is correct behavior. Document this as intentional.

### Pitfall 4: PR Generation Missing service_code/service_name
**What goes wrong:** MRF-09 not satisfied — service info not propagated to PRs
**Why it happens:** PR creation copies `mrfData.project_code` and `mrfData.project_name` but not `service_code`/`service_name`
**How to avoid:** Add 2 lines to each of the 4 PR/TR creation blocks in procurement.js

### Pitfall 5: procurement.js New MRF Creation Not Updated
**What goes wrong:** Procurement staff creating new MRFs from the procurement view cannot link to services
**Why it happens:** The MRF creation form in procurement.js (`createNewMRF()`, `saveNewMRF()`, `renderMRFDetails()`) also has a project dropdown but no services dropdown
**How to avoid:** Phase 29 Plan 29-02 should assess whether the procurement.js inline MRF creation also needs a services dropdown. Given that procurement staff are in the "both dropdowns" group (MRF-03), this is in scope but lower urgency.

### Pitfall 6: Listener Accumulation on Repeated init() Calls
**What goes wrong:** Multiple listeners accumulate because `destroy()` wasn't called between tab switches
**Why it happens:** Router skips `destroy()` on same-view tab switches (by design)
**How to avoid:** `mrf-form.js` is a standalone view (not tabbed), so `destroy()` is always called on navigation away. This is not a concern for `mrf-form.js`. For procurement.js changes, no new listeners are added.

### Pitfall 7: Display Label Column Header Still Says "Project" for Services MRFs
**What goes wrong:** MRF Records table shows "Project" column header but services MRFs show service codes
**Why it happens:** Column header is hardcoded "Project" (line 2667 in procurement.js)
**How to avoid:** Rename the column header to "Project / Service" or simply leave as "Project" (acceptable since the content is self-explanatory from the CLMC code format)

## Key Code Snippets to Reuse/Modify

### Existing project dropdown (mrf-form.js lines 109-112 in render())
```html
<!-- CURRENT: single project dropdown -->
<div class="form-group">
    <label for="projectName">Project Name *</label>
    <select id="projectName" required>
        <option value="">Loading projects...</option>
    </select>
</div>
```

Becomes two conditional groups in the render HTML, wrapped with `id="projectNameGroup"` and `id="serviceNameGroup"`, with inline `style="display:none"` (visibility set by `init()` after role check).

### Existing project option format (mrf-form.js line 327-329 in populateProjectDropdown())
```javascript
option.value = project.project_code;
option.textContent = `${project.project_code} - ${project.project_name}`;
option.dataset.projectName = project.project_name;
```

Mirror for services:
```javascript
option.value = service.service_code;
option.textContent = `${service.service_code} - ${service.service_name}`;
option.dataset.serviceName = service.service_name;
```

### Existing submission project extraction (mrf-form.js lines 527-530)
```javascript
const projectSelect = document.getElementById('projectName');
const projectCode = projectSelect.value.trim();
const selectedOption = projectSelect.options[projectSelect.selectedIndex];
const projectName = selectedOption?.dataset?.projectName || '';
```

### Existing MRF document structure (mrf-form.js lines 551-566)
```javascript
const mrfDoc = {
    mrf_id: mrfId,
    request_type: requestType,
    urgency_level: urgencyLevel,
    project_code: projectCode,    // stable reference
    project_name: projectName,    // denormalized display
    requestor_name: requestorName,
    // ...
    status: 'Pending',
    created_at: new Date().toISOString()
};
```

Add to mrfDoc for Phase 29:
```javascript
department: department,      // 'projects' | 'services'  (MRF-08)
service_code: service_code,  // '' for project MRFs  (MRF-07)
service_name: service_name,  // '' for project MRFs  (MRF-07)
```

### Existing display pattern (procurement.js — 10 occurrences)
```javascript
// BEFORE:
`${mrf.project_code ? mrf.project_code + ' - ' : ''}${mrf.project_name || 'No project'}`

// AFTER — inline department check:
`${(mrf.department === 'services' || mrf.service_code)
    ? (mrf.service_code ? mrf.service_code + ' - ' : '') + (mrf.service_name || 'No service')
    : (mrf.project_code ? mrf.project_code + ' - ' : '') + (mrf.project_name || 'No project')
}`
```

### Existing getAssignedServiceCodes() in utils.js (already implemented, lines 313-322)
```javascript
export function getAssignedServiceCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;
    if (user.role !== 'services_user') return null;
    if (user.all_services === true) return null;
    return Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];
}
// Already exposed: window.getAssignedServiceCodes = getAssignedServiceCodes (utils.js line 536)
```

## Sources

### Primary (HIGH confidence)
- `C:/Users/Admin/Roaming/pr-po/app/views/mrf-form.js` — full file read; project dropdown pattern, submission handler, destroy(), `assignmentsChanged` listener
- `C:/Users/Admin/Roaming/pr-po/app/views/services.js` — full file read; confirmed `active: boolean` field, `addService()` schema, `getAssignedServiceCodes()` usage
- `C:/Users/Admin/Roaming/pr-po/app/utils.js` — full file read; `getAssignedServiceCodes()`, `generateServiceCode()`, `syncServicePersonnelToAssignments()`
- `C:/Users/Admin/Roaming/pr-po/app/auth.js` — full file read; `getCurrentUser()` implementation, `window.getCurrentUser` exposure
- `C:/Users/Admin/Roaming/pr-po/app/permissions.js` — full file read; `hasTabAccess()`, `canEditTab()`, role template pattern
- `C:/Users/Admin/Roaming/pr-po/app/views/procurement.js` — targeted reads + grep; all `project_name`/`project_code` display locations, `generatePR()`, `saveNewMRF()`, `loadMRFs()` scoping
- `C:/Users/Admin/Roaming/pr-po/app/views/finance.js` — targeted reads + grep; all `project_name`/`project_code` display locations, PO creation
- `C:/Users/Admin/Roaming/pr-po/app/views/role-config.js` — grep for role constants; confirmed ROLE_ORDER: `['super_admin', 'operations_admin', 'operations_user', 'services_admin', 'services_user', 'finance', 'procurement']`
- `C:/Users/Admin/Roaming/pr-po/app/router.js` — full file read; confirmed mrf-form.js has no tabs (no tab-switch risk), `destroy()` always called on navigation

### Secondary (MEDIUM confidence)
- Phase 04 RESEARCH.md — reviewed for prior MRF-project integration patterns (still applicable, confirmed denormalization approach)
- Phase 28 RESEARCH.md — referenced for services schema decisions

## Metadata

**Confidence breakdown:**
- Services Firestore schema: HIGH — read directly from `addService()` function code
- Role system API: HIGH — read directly from `auth.js` and `permissions.js`
- Role-to-dropdown mapping: HIGH — confirmed role names from `role-config.js` ROLE_ORDER constant
- Impact on procurement.js: HIGH — read all relevant lines via grep and targeted reads
- Impact on finance.js: HIGH — read all relevant lines via grep and targeted reads
- `active` vs `status` field distinction: HIGH — confirmed from services.js `where('active', '==', true)` in users query and `active: true` in addDoc

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (30 days — codebase patterns stable, no external dependencies)
