---
phase: 28-services-view
verified: 2026-02-24T00:00:00Z
status: passed
score: 12/12 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Log in as services_admin, navigate to #/services. Verify two sub-tabs (Services/Recurring) appear, with the Services sub-tab active by default showing one-time services only."
    expected: "Services sub-tab active; table shows only service_type='one-time' rows; switching to Recurring tab shows only service_type='recurring' rows"
    why_human: "Requires live Firestore data with both service types and an authenticated services_admin session"
  - test: "Log in as services_user with at least one assigned service, navigate to #/services. Verify only assigned services appear in the list."
    expected: "Table rows filtered to only services whose service_code is in the user's assigned_service_codes array; unassigned services are not visible"
    why_human: "Requires live auth session with services_user role and getAssignedServiceCodes() returning a scoped array"
  - test: "As services_admin, create a new service via Add Service form, then click the row to navigate to service detail. Verify 3-card layout with inline editing."
    expected: "Service created with auto-generated CLMC code; clicking row navigates to #/services/detail/CODE; detail page shows Service Information, Financial Summary, and Status & Assignment cards; editing service_name via onblur saves to Firestore"
    why_human: "End-to-end flow requiring live Firestore writes, code generation, and navigation"
---

# Phase 28: Services View Verification Report

**Phase Goal:** Full Services department UI — list view with CRUD and sub-tabs, detail view with inline editing, and admin service-assignments panel
**Verified:** 2026-02-24
**Status:** passed (12/12 must-haves verified)
**Re-verification:** No — initial verification (delayed from execution)

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | services.js imports generateServiceCode, getAssignedServiceCodes, syncServicePersonnelToAssignments from utils.js | VERIFIED | `app/views/services.js` line 9: `import { showLoading, showToast, generateServiceCode, normalizePersonnel, syncServicePersonnelToAssignments, getAssignedServiceCodes } from '../utils.js';` |
| 2 | services.js render() outputs two sub-tab buttons (Services and Recurring) controlled by module-level currentActiveTab | VERIFIED | `app/views/services.js` lines 28-29: `let currentActiveTab = 'services';`, lines 118-121: two `<button class="tab-btn">` elements with `navigateToTab('services')` and `navigateToTab('recurring')` |
| 3 | applyServiceFilters() filters by service_type based on active sub-tab: 'one-time' for Services tab, 'recurring' for Recurring tab | VERIFIED | `app/views/services.js` line 750: `const serviceTypeFilter = (currentActiveTab === 'recurring') ? 'recurring' : 'one-time';`, line 759: `const matchesType = service.service_type === serviceTypeFilter;` |
| 4 | applyServiceFilters() scopes list to assigned services for services_user via getAssignedServiceCodes() | VERIFIED | `app/views/services.js` lines 752-755: `const assignedCodes = getAssignedServiceCodes();` — returns null (no filter) for non-services_user, array for services_user |
| 5 | Table rows navigate to detail page on click via `#/services/detail/CODE` hash | VERIFIED | `app/views/services.js` line 943: `<tr onclick="window.location.hash = '#/services/detail/${service.service_code}'"` |
| 6 | service-detail.js renders 3-card layout: Service Information, Financial Summary, Status & Assignment | VERIFIED | `app/views/service-detail.js` lines 311-312: `<!-- Card 1 - Service Information -->`, lines 365-366: `<!-- Card 2 - Financial Summary -->`, lines 422-423: `<!-- Card 3 - Status & Assignment -->` |
| 7 | service-detail.js inline editing saves via onblur/onchange to Firestore services collection | VERIFIED | `app/views/service-detail.js` line 337: `onblur="window.saveServiceField('service_name', this.value)"`, line 376: `onblur="window.saveServiceField('budget', this.value)"`, line 431: `onchange="window.saveServiceField('internal_status', this.value)"`; saveServiceField at line 650 calls `updateDoc(doc(db, 'services', currentServiceDocId), ...)` |
| 8 | service-detail.js personnel pills use selectDetailServicePersonnel/removeDetailServicePersonnel with serviceDetailPillContainer | VERIFIED | `app/views/service-detail.js` lines 499: `id="serviceDetailPillContainer"`, line 536: `onmousedown="event.preventDefault(); window.selectDetailServicePersonnel(..."`, line 482: `onmousedown="event.preventDefault(); window.removeDetailServicePersonnel(..."` |
| 9 | service-assignments.js writes assigned_service_codes to Firestore users documents | VERIFIED | `app/views/service-assignments.js` line 218: `assigned_service_codes: newCodes` in updateDoc call; line 190: `assigned_service_codes: []` when all_services toggled on |
| 10 | router.js has /services and /service-detail routes with correct lazy loading | VERIFIED | `app/router.js` lines 69-73: `/services` route loads `services.js` with defaultTab 'services'; lines 75-78: `/service-detail` route loads `service-detail.js` |
| 11 | router.js handleHashChange converts #/services/detail/CODE to /service-detail navigation | VERIFIED | `app/router.js` line 372-374: `navigate('/service-detail', null, subpath)` for services detail hash pattern |
| 12 | index.html has Services nav link with data-route="services" | VERIFIED | `index.html` line 32: `<a href="#/services" class="nav-link" data-route="services">Services</a>` |

**Score:** 12/12 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/views/services.js` | List view with CRUD, sub-tabs (Services/Recurring), filtering, personnel pills, pagination | VERIFIED | ~1,200 lines; render/init/destroy exports; 15 Service-prefixed window functions (lines 63-81); addService (line 692), editService, deleteService (line 1170), toggleServiceActive, applyServiceFilters (line 743), sortServices (line 835) |
| `app/views/service-detail.js` | 3-card layout with inline editing, personnel pills, expense display | VERIFIED | ~871 lines; render/init/destroy exports; saveServiceField (line 650), toggleServiceDetailActive, selectDetailServicePersonnel (line 552), removeDetailServicePersonnel (line 603); 3-card layout at lines 311-446 |
| `app/views/service-assignments.js` | Admin panel for service user assignments | VERIFIED | ~263 lines; render/init/destroy exports; handleAllServicesChange (line 174), handleServiceCheckboxChange (line 212); two onSnapshot listeners (users at line 78, services at line 87) |
| `app/views/admin.js` | SECTIONS extended with service_assignments | VERIFIED | Line 27-30: `service_assignments: { label: 'Service Assignments', load: () => import('./service-assignments.js') }` |
| `app/router.js` | /services and /service-detail routes; routePermissionMap entries | VERIFIED | Lines 14-15: routePermissionMap entries; lines 69-78: route definitions; lines 372-374 and 410: detail hash handling in handleHashChange and handleInitialRoute |
| `index.html` | Services nav link | VERIFIED | Line 32: `<a href="#/services" class="nav-link" data-route="services">Services</a>` between Projects and Material Request |
| `app/utils.js` | syncServicePersonnelToAssignments exported and on window | VERIFIED | Line 537: `window.syncServicePersonnelToAssignments = syncServicePersonnelToAssignments;` Line 678: `export async function syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds)` |
| `app/auth.js` | assignmentsChanged event fires when assigned_service_codes changes | VERIFIED | Line 230: `const previousAssignedServiceCodes = currentUser?.assigned_service_codes;` Line 301: `JSON.stringify(userData.assigned_service_codes) !== JSON.stringify(previousAssignedServiceCodes)` in condition that dispatches assignmentsChanged event (line 304) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `services.js` line 9 | `utils.js` generateServiceCode, getAssignedServiceCodes, syncServicePersonnelToAssignments | ES module import | VERIFIED | Direct named imports from `'../utils.js'` |
| `services.js` applyServiceFilters (line 750) | Sub-tab filtering | `currentActiveTab === 'recurring'` ternary sets serviceTypeFilter | VERIFIED | Line 759: `service.service_type === serviceTypeFilter` applied in filter callback |
| `service-detail.js` saveServiceField (line 650) | Firestore `services` collection | `updateDoc(doc(db, 'services', currentServiceDocId), ...)` | VERIFIED | Inline saves on onblur/onchange write directly to services collection |
| `service-assignments.js` handleServiceCheckboxChange (line 212) | Firestore `users` docs | `updateDoc(doc(db, 'users', userId), { assigned_service_codes: newCodes })` | VERIFIED | Line 218: writes full assigned_service_codes array to user document |
| `router.js` `/services` route (line 69) | `services.js` | `load: () => import('./views/services.js')` | VERIFIED | Lazy-loaded on navigation; defaultTab: 'services' |
| `router.js` `/service-detail` route (line 75) | `service-detail.js` | `load: () => import('./views/service-detail.js')` | VERIFIED | Lazy-loaded on navigation; detail hash routing at lines 372-374, 410 |
| `auth.js` assignmentsChanged dispatch (line 304) | Window event | `JSON.stringify(userData.assigned_service_codes) !== JSON.stringify(previousAssignedServiceCodes)` | VERIFIED | Lines 230, 301-306: captures previous service codes, compares on update, dispatches CustomEvent |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SERV-01 | 28-02 | Create service with auto-generated service code | SATISFIED | `services.js` line 692: `const service_code = await generateServiceCode(clientCode);` followed by addDoc to `services` collection at line 697 |
| SERV-03 | 28-02 | Service type field (one-time/recurring) on create form | SATISFIED | `services.js` lines 146-150: `<select id="serviceType">` with `<option value="one-time">` and `<option value="recurring">`; stored at line 700: `service_type` |
| SERV-04 | 28-03 | Inline editing with auto-save on service detail | SATISFIED | `service-detail.js` line 650: `async function saveServiceField(fieldName, newValue)` — saves via updateDoc on onblur/onchange; fields: service_name (line 337), budget (line 376), contract_cost (line 387), internal_status (line 431), project_status (line 439) |
| SERV-05 | 28-02 | Delete service with confirmation dialog | SATISFIED | `services.js` line 1170: `async function deleteService(serviceId, serviceName)` — line 1184: `if (!confirm(...))` guard, line 1191: `await deleteDoc(doc(db, 'services', serviceId))` |
| SERV-06 | 28-02 | List view with sorting and filtering | SATISFIED | `services.js` line 835: `function sortServices(column)` toggles sortColumn/sortDirection; line 743: `function applyServiceFilters()` applies search, status, client, and type filters |
| SERV-07 | 28-02 | Filter by service_type, status, client | SATISFIED | `services.js` lines 745-747: reads serviceInternalStatusFilter, serviceProjectStatusFilter, serviceClientFilter; lines 767-776: exact match filtering per field |
| SERV-08 | 28-02 | Search by service code or name | SATISFIED | `services.js` line 744: `const searchTerm = document.getElementById('serviceSearchInput')?.value.toLowerCase()`, lines 762-764: matches against `service.service_code` and `service.service_name` |
| SERV-09 | 28-02 | Service fields mirror project fields (name, client, status, personnel, budget, etc.) | SATISFIED | `services.js` create form (lines 133-198): client select, service_name input, service_type, internal_status, project_status, budget, contract_cost, personnel pills; same field set as projects.js |
| SERV-10 | 28-03 | Card-based detail layout (3 cards) | SATISFIED | `service-detail.js` line 272: `// Render service detail - 3-card layout`; Card 1: Service Information (line 311), Card 2: Financial Summary (line 365), Card 3: Status & Assignment (line 422) |
| SERV-12 | 28-02 | Active/inactive flag controls MRF dropdown eligibility | SATISFIED | `services.js` line 71: `window.toggleServiceActive = toggleServiceActive;` toggles `active` boolean on service doc; line 712: `active: true` set on creation. MRF dropdown filtering by active flag is completed in Phase 29 (where('active', '==', true)) |
| UI-01 | 28-02 | Services nav link in top navigation | SATISFIED | `index.html` line 32: `<a href="#/services" class="nav-link" data-route="services">Services</a>`; `router.js` line 14: `'/services': 'services'` in routePermissionMap |
| UI-02 | 28-02 | Two sub-tabs in services view (Services / Recurring) | SATISFIED | `services.js` lines 117-122: tab-bar div with two `<button class="tab-btn">` elements; `navigateToTab('services')` and `navigateToTab('recurring')` |
| UI-03 | 28-02 | Services sub-tab filters service_type='one-time' | SATISFIED | `services.js` line 750: `const serviceTypeFilter = (currentActiveTab === 'recurring') ? 'recurring' : 'one-time';` — when currentActiveTab is 'services', filter is 'one-time' |
| UI-04 | 28-02 | Recurring sub-tab filters service_type='recurring' | SATISFIED | `services.js` line 750: same ternary — when currentActiveTab is 'recurring', filter is 'recurring'; line 759: `const matchesType = service.service_type === serviceTypeFilter` |
| UI-05 | 28-02 | List columns: Code, Name, Client, Service Type, Internal Status, Project Status, Active, Actions | SATISFIED | `services.js` lines 250-271: `<th>` elements for Code, Name, Client, Service Type, Internal Status, Project Status, Active, Actions |
| UI-06 | 28-02 | Click row navigates to service detail | SATISFIED | `services.js` line 943: `<tr onclick="window.location.hash = '#/services/detail/${service.service_code}'">`; `router.js` line 372-374: handleHashChange converts hash to /service-detail navigation |
| UI-07 | 28-01 | Services tab hidden from operations roles | SATISFIED | `scripts/seed-services-role-permissions.js` lines 45-51: operations_admin and operations_user get `'tabs.services.access': false, 'tabs.services.edit': false` in role_templates seed |
| UI-08 | 28-01 | Projects tab hidden from services roles | SATISFIED | `scripts/seed-services-role-permissions.js` lines 33-43: services_admin and services_user get `'tabs.projects.access': false, 'tabs.projects.edit': false` in role_templates seed |
| ASSIGN-01 | 28-02, 28-03 | Personnel assignment via pills on service detail | SATISFIED | `service-detail.js` lines 462-513: `renderPersonnelPills()` renders pill container with `serviceDetailPillContainer` ID; line 552: `selectDetailServicePersonnel()` adds personnel; line 603: `removeDetailServicePersonnel()` removes personnel |
| ASSIGN-02 | 28-02, 28-03 | Multi-personnel selection (pill container supports multiple) | SATISFIED | `service-detail.js` line 17: `let selectedDetailPersonnel = [];` (array, not single); lines 470-475: iterates all normalized personnel into array; pills rendered via `.map()` at line 478 |
| ASSIGN-05 | 28-03 | User management service assignments (admin panel) | SATISFIED | `service-assignments.js` lines 20-53: render() outputs Service Assignments panel with role gate (super_admin/services_admin); `admin.js` lines 27-30: SECTIONS includes `service_assignments` entry loading `service-assignments.js` |

**Orphaned requirements check:** All 21 requirement IDs mapped to Phase 28 (SERV-01, SERV-03-10, SERV-12, UI-01-08, ASSIGN-01, ASSIGN-02, ASSIGN-05) are accounted for above. No orphaned requirements.

**Note on requirement count:** The ROADMAP.md description mentions "17 mapped requirements" which counted SERV-03-10 as a single range. Counting individual IDs yields 21 requirements (SERV: 10, UI: 8, ASSIGN: 3). All 21 are verified above.

---

_Verified: 2026-02-24_
_Verifier: Claude (gsd-executor -- Phase 37 documentation cleanup)_
