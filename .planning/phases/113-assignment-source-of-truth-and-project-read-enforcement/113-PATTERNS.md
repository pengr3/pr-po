# Phase 113: Assignment Source-of-Truth and Project Read Enforcement - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 18 modification sites (13 MUST-CONVERT reads + 3 sync-fn deletions + rules + tests + indexes)
**Analogs found:** 18 / 18 (this phase modifies existing files; every site maps to a canonical pattern already present elsewhere in the codebase)

> **Scope note:** This phase creates no new files. This document maps each modification site (from RESEARCH.md's audit) to the canonical code shape it must be converted TO, with verbatim excerpts. RESEARCH.md already contains the exhaustive file:line audit — this document does not repeat it, only supplies the copy-ready pattern shapes the executor needs.

---

## Modification Site → Conversion Shape (quick index)

| Site | Current shape | Target shape | Shape class |
|------|---------------|--------------|-------------|
| `app/views/projects.js:848` | `onSnapshot(collection(db,'projects'))` | role-branch, exempt unscoped / scoped array-contains | A |
| `app/proposal-modal.js:212` | `getDocs(collection(db,'projects'))` | role-branch (or skip fetch when preselected) | A |
| `app/views/mrf-form.js:1046` | `where('active','==',true)` | role-branch; scoped branch drops `active`, filters client-side | B |
| `app/views/procurement.js:2932` (`loadProjects`) | `where('active','==',true)` | role-branch; scoped branch drops `active`, filters client-side | B |
| `app/views/project-detail.js:220` | `where('project_code','==',X)` | role-branch; scoped branch adds paired `array-contains` (composite index) | C |
| `app/views/project-plan.js:258` | `where('project_code','==',X)` | identical twin of project-detail.js:220 — same fix | C |
| `app/views/clients.js:243` | `where('client_code','==',X)` | prefer: filter already-scoped in-memory project set (from Shape A site #1) instead of a fresh query | C-variant |
| `app/expense-modal.js:50,71,109` | `where('project_name','==',X)` ×3 | eliminate query — pass already-loaded `currentProject` doc in from the caller | D |
| `app/views/procurement.js:7951` | `where('project_name','==',X)` | `getDoc(doc(db,'projects', mrfData.project_id))` using denormalized `project_id` | D |
| `app/utils.js:368` (`generateServiceCode`) | `where('client_code','==',X).where('project_code','>=',...).where('project_code','<=',...)` | special-case: `services_admin` needs an explicit exemption for this system range-scan (not a personnel-scoped read) — see Shape D note | D-special |
| `app/utils.js:278` (`generateProjectCode`) | same shape as above, for projects | SAFE — both callers (`super_admin`/`operations_admin`) are exempt roles; no change needed | n/a |
| `app/views/services.js:872-904` (home-dept branch) | `where('service_code','in',assignedCodes)` (legacy array) | convert `services_user` branch to `array-contains personnel_user_ids`, same as the `operations_user` branch already does | E |
| `app/views/mrf-form.js` `loadServices()` (~1085-1103) | `where('service_code','in',assignedCodes)` | same conversion as services.js | E |
| `app/views/procurement.js` `loadServicesForNewMRF()` (~2890-2909) | `where('service_code','in',assignedServiceCodes)` | same conversion as services.js | E |

---

## 1. The Canonical Scoped-Query Pattern

**Source:** `app/views/services.js:873-904` (`loadServices()`)

This is the shape ~13 sites get converted to. Quoted verbatim:

```javascript
// Load services with real-time listener
async function loadServices() {
    try {
        // ASSIGN-04: services_user may only read their assigned services.
        // An unscoped collection query would include docs they're not assigned to,
        // which Firestore's per-document list rule would deny for the entire query.
        const currentUser = window.getCurrentUser?.();
        const role = currentUser?.role;
        const assignedCodes = getAssignedServiceCodes();
        let servicesQuery;
        if (role === 'operations_user') {
            // operations_user: scoped by the firestore.rules services.list per-doc predicate
            // (request.auth.uid in resource.data.personnel_user_ids). An unscoped query would
            // be denied for the whole list, so we must filter to assigned services here. Every
            // doc returned by array-contains satisfies the rule predicate.
            const uid = currentUser?.uid;
            if (!uid) {
                allServices = [];
                applyServiceFilters();
                return;
            }
            servicesQuery = query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', uid));
        } else if (assignedCodes !== null) {
            // services_user: scope query to assigned service_codes only
            if (assignedCodes.length === 0) {
                allServices = [];
                applyServiceFilters();
                return;
            }
            servicesQuery = query(collection(db, 'services'), where('service_code', 'in', assignedCodes));
        } else {
            servicesQuery = collection(db, 'services');
        }

        const listener = onSnapshot(servicesQuery, (snapshot) => {
            allServices = [];
            snapshot.forEach(doc => {
                allServices.push({ id: doc.id, ...doc.data() });
            ...
```

**Annotated:**

| Element | Lines | What it does |
|---|---|---|
| Role check | 878-879 | `const currentUser = window.getCurrentUser?.(); const role = currentUser?.role;` — reads the actor's role from the client-cached user object, not a fresh Firestore read. |
| Uid guard, early empty-return | 887-892 | `if (!uid) { allServices = []; applyServiceFilters(); return; }` — a scoped role with no resolvable uid gets the fail-closed empty result, never an unscoped fallback query. |
| `array-contains` branch (the D-02 target) | 893 | `query(collection(db,'services'), where('personnel_user_ids','array-contains',uid))` — the ONE query shape every MUST-CONVERT site should end up using. No composite index needed because there is no other `where` clause paired with it. |
| Legacy branch (`assignedCodes`) | 894-901 | `where('service_code','in',assignedCodes)` — this is the OLD pattern (`services_user` home-dept). **Per Shape E below, this branch is itself being retired in this phase** — RESEARCH.md's Contradicts-CONTEXT.md #3 explains why `services.js` is not a clean copy-paste template; only its `operations_user` branch (893) is the D-02 end-state. |
| Unscoped see-all branch | 902-903 | `servicesQuery = collection(db, 'services');` — falls through here only when `assignedCodes === null`, i.e. the actor's role is in `SERVICE_SEE_ALL_ROLES` or holds `all_services === true` (both resolved inside `getAssignedServiceCodes()`, `app/utils.js:413-421`). |
| `all_services`/`all_projects` escape hatch | implicit, inside `getAssignedServiceCodes()` (`utils.js:418`) | `if (user.all_services === true) return null;` — the null return routes straight to the unscoped branch above. This is how D-09's escape hatch stays wired through the pattern without special-casing it at the query-construction site. |

**For `projects`, the target pattern drops the legacy `in` branch entirely** (D-02 says standardize on `array-contains` for every scoped role, no legacy array fallback) — so the new `projects` version of this pattern has only two branches: unscoped-for-exempt-roles, and `array-contains personnel_user_ids` for every scoped role (`operations_user`, `services_user`, AND `services_admin` per D-16). Use `app/utils.js:333-343`'s `getAssignedProjectCodes()` fail-closed role gate for the "is this actor scoped" check, but the *query* branch itself should be array-contains, not `.includes(code)` client filtering.

---

## 2. Conversion Shape Per Site Class

### Shape A — bare unscoped collection listener/fetch

**Example:** `app/views/projects.js:846-856`

```javascript
// Load projects with real-time listener
async function loadProjects() {
    try {
        const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
            allProjects = [];
            snapshot.forEach(doc => {
                allProjects.push({ id: doc.id, ...doc.data() });
            });

            // Apply filters (which will also sort and render)
            applyFilters();
        });

        listeners.push(listener);
```

**Also:** `app/proposal-modal.js:208-214` (`_loadModalDropdownData()`) — same shape, `getDocs` instead of `onSnapshot`:
```javascript
async function _loadModalDropdownData() {
    if (_modalProjectsLoaded) return;
    try {
        const [projectsSnap, clientsSnap] = await Promise.all([
            getDocs(collection(db, 'projects')),
            getDocs(collection(db, 'clients'))
        ]);
```

**Target shape** (mirrors Section 1's pattern, projects-flavored, no legacy `in` branch per D-02):
```javascript
const currentUser = window.getCurrentUser?.();
const role = currentUser?.role;
const isExempt = /* role in the new PROJECT-scoped-roles-inverse set, or all_projects escape hatch */;
let projectsQuery;
if (!isExempt) {
    const uid = currentUser?.uid;
    if (!uid) {
        allProjects = [];
        applyFilters();
        return;
    }
    projectsQuery = query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid));
} else {
    projectsQuery = collection(db, 'projects');
}
const listener = onSnapshot(projectsQuery, (snapshot) => { /* unchanged */ });
```
Note for `proposal-modal.js:212`: RESEARCH.md's recommended fix is NOT to scope the query at all — skip the fetch entirely when `preselectedProjectId` is supplied (the "Start Proposal" scoped-user flow locks the dropdown to one project anyway, `proposal-modal.js:700-711`). Only scope the query for the unscoped, no-preselection call path.

---

### Shape B — unscoped-plus-equality-filter

**Example:** `app/views/mrf-form.js:1044-1069` (`loadProjects()`)

```javascript
function loadProjects() {
    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('active', '==', true));

        projectsListener = onSnapshot(q, (snapshot) => {
            // Cache projects for re-population on assignment change
            cachedProjects = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Phase 88 D-05 — Draft projects cannot accept MRFs.
                if (data.project_status === 'Draft') return;
                cachedProjects.push({ id: doc.id, ...data });
            });

            // Sort alphabetically A-Z by project code
            cachedProjects.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));

            populateProjectDropdown();
        }, (error) => {
            console.error('Error loading projects:', error);
        });
    } catch (error) {
        console.error('Error setting up projects listener:', error);
    }
}
```

**Also:** `app/views/procurement.js:2926-2955` (`loadProjects()`) — RESEARCH.md's "Contradicts CONTEXT.md #1" finding: this is **flatly unscoped**, not "partially scoped via `projScope`" as CONTEXT.md's preliminary audit claimed. Identical shape:
```javascript
const q = query(
    collection(db, 'projects'),
    where('active', '==', true)
);
const listener = onSnapshot(q, (snapshot) => { ... });
```

**Target shape:** role-branch per Section 1; for the scoped branch, DROP the `active` equality filter from the query (avoids a new composite index) and apply it in the same client-side `snapshot.forEach` post-filter that already exists for `project_status === 'Draft'`:
```javascript
let q;
if (isExempt) {
    q = query(collection(db, 'projects'), where('active', '==', true)); // unchanged
} else {
    if (!uid) { /* empty-return, per Section 1 */ }
    q = query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', uid));
}
projectsListener = onSnapshot(q, (snapshot) => {
    cachedProjects = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.project_status === 'Draft') return;
        if (!isExempt && data.active !== true) return; // active filter moved here for scoped branch
        cachedProjects.push({ id: doc.id, ...data });
    });
    ...
});
```
Note: this conversion **subsumes** the existing codeless-project fallback at `mrf-form.js:1155-1159` (`rebuildPSOptions()`'s `(!p.project_code && uid && (p.personnel_user_ids||[]).includes(uid))` check) — array-contains naturally includes codeless assigned projects without a separate carve-out, so that fallback branch becomes dead code once the query itself is array-contains-scoped. Verify with the executor whether to delete it or leave it as a harmless no-op.

---

### Shape C — equality lookup on a non-personnel field

**Example:** `app/views/project-detail.js:218-227`

```javascript
    // Phase 78 D-06: Try project_code lookup first (existing behavior). If no match, fall back to Firestore doc ID lookup
    // for clientless projects whose URL param is the doc ID rather than a project_code.
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            // Phase 78 D-06: fallback — projectCode might actually be a Firestore doc ID for a clientless project
            try {
                const docRef = doc(db, 'projects', projectCode);
                const docSnap2 = await getDoc(docRef);
                if (docSnap2.exists()) {
```

**Twin (identical shape, RESEARCH.md flags as a structural twin CONTEXT.md's preliminary audit missed):** `app/views/project-plan.js:258`
```javascript
const projSnap = await getDocs(query(collection(db, 'projects'), where('project_code', '==', projectCode)));
```

**Target shape:** for scoped roles, pair the equality filter with `array-contains` on the SAME query (requires a new composite index — see Section 6):
```javascript
let q;
if (isExempt) {
    q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
} else {
    if (!uid) { /* empty-return */ }
    q = query(
        collection(db, 'projects'),
        where('project_code', '==', projectCode),
        where('personnel_user_ids', 'array-contains', uid)
    ); // NEW composite index required
}
```
The `getDoc(docRef)` doc-ID fallback at `project-detail.js:225-227` needs **no change** beyond the rule text itself — per Rules Mechanics (Section 3 below), a single-document `get()` is evaluated against `resource.data` directly and is already compatible with an `array-contains` rule condition with zero query-shape problem. Apply the same "no change needed" treatment to project-plan.js's equivalent doc-ID pattern if one exists.

**Variant — `app/views/clients.js:243`** (`where('client_code','==', client.client_code)`): RESEARCH.md recommends AVOIDING a third composite index here — instead, for scoped roles, filter the already-loaded assignment-scoped project set (from the Shape A conversion of `projects.js:848`) client-side by `client_code`, rather than issuing a fresh query. Prefer this over adding another composite index when an in-memory scoped set is already available in the same view.

---

### Shape D — replace the query entirely with a doc `get()` or an in-memory value

**Example 1:** `app/expense-modal.js:47-58` (project-mode branch inside `showExpenseBreakdownModal`) — the query is issued **3 times per modal open** (lines 50, 71, 109), each an independent, unscoped-equivalent `where('project_name','==',identifier)` lookup:
```javascript
} else {
    // identifier = project_name; budget fetched from projects collection
    const projectSnapshot = await getDocs(
        query(collection(db, 'projects'), where('project_name', '==', identifier))
    );
    const project = projectSnapshot.docs[0]?.data() || {};
    budget = parseFloat(project.budget || 0);
    [posSnapshot, trsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'pos'), where('project_name', '==', identifier))),
        getDocs(query(collection(db, 'transport_requests'), where('project_name', '==', identifier)))
    ]);
}
```
(Lines 70-73 and 108-112 repeat the identical `where('project_name','==',identifier)` project lookup for the RFP and Collectibles sections of the same function.)

**Target shape:** eliminate the query — the caller (`project-detail.js:3774`, `window.openFullBreakdown`) already holds `currentProject.id`/`.budget`/`.project_code` in memory. Pass the already-loaded doc/fields into `showExpenseBreakdownModal(...)` as a parameter instead of re-querying by name 3 times. If a caller path genuinely has no in-memory doc (e.g. an exempt-role caller from `finance.js`), keep an unscoped query there, gated to that caller only.

**Example 2:** `app/views/procurement.js:7940-7955` (PO-Delivered system Feed auto-entry) — already wrapped in a "never block, swallow" `try/catch` (RESEARCH.md audit site #11):
```javascript
try {
    if (poDataFresh.mrf_id) {
        const mrfQ = query(collection(db, 'mrfs'), where('mrf_id', '==', poDataFresh.mrf_id));
        const mrfSnap = await getDocs(mrfQ);
        if (!mrfSnap.empty) {
            const mrfData = mrfSnap.docs[0].data();
            const projectName = mrfData.project_name;
            if (projectName) {
                const projQ = query(collection(db, 'projects'), where('project_name', '==', projectName));
                const projSnap = await getDocs(projQ);
                if (!projSnap.empty) {
                    const projectDocId = projSnap.docs[0].id;
                    await addDoc(collection(db, 'projects', projectDocId, 'activity_entries'), { ... });
```

**Target shape:** replace the `project_name` list query with a direct doc-ID `get()` using the MRF's already-denormalized `project_id` field (Phase 78 D-04):
```javascript
if (mrfData.project_id) {
    const projSnap = await getDoc(doc(db, 'projects', mrfData.project_id));
    if (projSnap.exists()) {
        const projectDocId = projSnap.id;
        await addDoc(collection(db, 'projects', projectDocId, 'activity_entries'), { ... });
    }
} else {
    // legacy pre-Phase-78 MRF with no project_id — keep the name-based list query
    // as an exempt-role-only fallback, or accept the existing swallow (this whole
    // block is already best-effort per the surrounding try/catch).
}
```

**Special case — `app/utils.js:359-399` (`generateServiceCode`)**, the single highest-severity finding in RESEARCH.md, NOT reachable by the usual per-site pattern:
```javascript
export async function generateServiceCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC-${clientCode}-${currentYear}000`;
        const rangeMax = `CLMC-${clientCode}-${currentYear}999`;

        // Query BOTH collections in parallel (shared sequence, SERV-02)
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(
                collection(db, 'projects'),
                where('client_code', '==', clientCode),
                where('project_code', '>=', rangeMin),
                where('project_code', '<=', rangeMax)
            )),
            ...
        ]);
        ...
    } catch (error) {
        console.error('[Services] Error generating service code:', error);
        throw error;   // <-- THROWS, caller (services.js:780-782) shows "Failed to create service"
    }
}
```
This is a `services_admin`-creating-any-new-service code-collision range scan across the WHOLE `projects` collection by design — it is not a personnel-scoped read and cannot be converted to `array-contains` without breaking its purpose. It needs an explicit rule-level exemption for `services_admin` on this specific query shape (or a redesign to a counter document, flagged in the function's own comment as a future option). Its sibling `generateProjectCode` (`utils.js:278`, `app/utils.js:278`) is SAFE — both its callers (`super_admin`/`operations_admin`) are exempt roles — no conversion needed there.

---

### Shape E — legacy `where(<code>, 'in', assignedCodes)` from the retired arrays

**Example (the reference file's OWN stale branch):** `app/views/services.js:894-901` (the `else if (assignedCodes !== null)` branch quoted in full in Section 1) — this is the `services_user` home-department query, and per RESEARCH.md's Summary, it is itself "a stale pattern this phase's `personnel_user_ids` mandate logically obsoletes," not a clean template to copy for `projects`.

**Also:** `app/views/mrf-form.js:1085-1103` (`loadServices()`):
```javascript
function loadServices() {
    try {
        const servicesRef = collection(db, 'services');

        // ASSIGN-04: services_user may only read their assigned services.
        // An unscoped query would include docs they're not assigned to, which
        // Firestore's per-document list rule denies for the entire query.
        const assignedCodes = window.getAssignedServiceCodes?.();
        let q;
        if (assignedCodes !== null) {
            // services_user: scope by assignment; active filtered client-side below
            if (assignedCodes.length === 0) {
                return;
            }
            q = query(servicesRef, where('service_code', 'in', assignedCodes));
        } else {
            // All other roles: active filter in query (no per-document rule restriction)
            q = query(servicesRef, where('active', '==', true));
        }
```

**Also:** `app/views/procurement.js:2890-2909` (`loadServicesForNewMRF()`):
```javascript
async function loadServicesForNewMRF() {
    ...
    try {
        // Quick 260627-kg0: service-MRF availability is assignment-driven, not role-literal.
        const assignedServiceCodes = window.getAssignedServiceCodes?.();
        if (assignedServiceCodes !== null && assignedServiceCodes.length === 0) return;

        let q;
        if (assignedServiceCodes !== null) {
            // Scoped (services_user or cross-dept operations_user): scope to assigned codes
            // (mirrors mrf-form.js loadServices pattern).
            q = query(collection(db, 'services'), where('service_code', 'in', assignedServiceCodes));
        } else {
            // Exempt roles (admin/finance/procurement): unscoped active filter.
            q = query(collection(db, 'services'), where('active', '==', true));
        }
```

**Target shape (all three sites):** replace the `where('service_code','in',assignedCodes)` branch with `where('personnel_user_ids','array-contains', uid)`, identical to the `operations_user` branch each of these files already has right next to (or in the case of mrf-form/procurement, structurally parallel to) the branch being replaced. Per D-13, this closes the gap where a `services_user` assigned AFTER `syncServicePersonnelToAssignments` is deleted would never populate `assigned_service_codes` and would become invisible to themselves.

---

## 3. Firestore Rules Patterns

### `projects` — current unified read rule (`firestore.rules:227-233`), to be split and scoped

```
match /projects/{projectId} {
  // All active users can read
  allow read: if isActiveUser();

  // Phase 78 D-01: clientless projects allowed (client_id and project_code may be null on create — code issued later when client is assigned)
  // Create: super_admin, operations_admin
  allow create: if hasRole(['super_admin', 'operations_admin']);
```
This ONE `allow read` governs both `get()` and `list()`. Per D-15, split it into `allow get` / `allow list`, both scoped on `personnel_user_ids` for scoped roles — **do not copy `services`' hybrid `list` rule verbatim** (see next block); write both `projects` branches in the pure `personnel_user_ids`-only shape.

### `services` — current get/list split (`firestore.rules:582-603`), the STRUCTURE to mirror, not the CONTENT to copy

```
match /services/{serviceId} {
  // Get (single document): super_admin, services roles, finance, procurement, operations_admin
  // operations_admin needs get access to support generateProjectCode() which queries
  // both projects and services to avoid sequence number collisions (CODE-01).
  // services_user can get individual docs — more permissive than list.
  allow get: if hasRole(['super_admin', 'operations_admin', 'services_admin', 'services_user', 'finance', 'procurement']);

  // List (collection query): scoped by assignment for services_user and operations_user
  // operations_admin included so generateProjectCode() / generateServiceCode() can
  // query the services collection when creating a new project (collision check).
  // CRITICAL: isAssignedToService() is ONLY called when isRole('services_user') is true
  // (short-circuit || prevents accessing assigned_service_codes on non-services_user docs)
  // operations_user is scoped to assigned services only: it may list a service doc
  // solely when its uid is in that doc's personnel_user_ids. This mirrors how ops users
  // only see assigned projects, and service-detail.js canDrive (personnel_user_ids.includes(uid)).
  // The matching JS query in services.js is array-contains on personnel_user_ids, so every
  // returned doc satisfies this per-doc predicate. WRITES remain blocked for ops users.
  allow list: if isActiveUser() && (
    hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance', 'procurement']) ||
    (isRole('services_user') && isAssignedToService(resource.data.service_code)) ||
    (isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids)
  );
```
**Structural takeaway (D-15):** `get`/`list` split, own list of exempt roles per branch. **Do NOT copy:** the `isRole('services_user') && isAssignedToService(...)` branch (line 601) — that's the legacy-array-reading pattern D-08 retires. The `(isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids)` branch (line 602) IS the D-02 target shape — use `in` (or the equivalent `array-contains` on the client query side) for EVERY scoped role uniformly on `projects`, including `services_admin` per D-16.

**Target `projects` rule shape** (composing the above two patterns per D-15/D-16 — not existing code, a synthesis for the planner to hand to the executor):
```
allow get: if hasRole([...see-all roles...]) ||
  (isRole('operations_user') && request.auth.uid in resource.data.personnel_user_ids) ||
  (isRole('services_user') && request.auth.uid in resource.data.personnel_user_ids) ||
  (isRole('services_admin') && request.auth.uid in resource.data.personnel_user_ids);

allow list: if isActiveUser() && (
  hasRole([...see-all roles...]) ||
  ((isRole('operations_user') || isRole('services_user') || isRole('services_admin')) &&
   request.auth.uid in resource.data.personnel_user_ids)
);
```

### Existing helper functions (signatures — reuse, do not rewrite)

`firestore.rules:45-90`:
```
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

function isAssignedToProject(projectCode) {
  return getUserData().all_projects == true ||
         projectCode in getUserData().assigned_project_codes;
}

function isAssignedToService(serviceCode) {
  return getUserData().all_services == true ||
         serviceCode in getUserData().assigned_service_codes;
}
```
`isActiveUser()`, `hasRole()`, `isRole()`, `getUserData()` are unaffected by this phase — reuse as-is in every new branch. **`isAssignedToProject()` and `isAssignedToService()` become dead code once every scoped `list`/`get` branch is rewritten to `request.auth.uid in resource.data.personnel_user_ids` directly** (they read `assigned_project_codes`/`assigned_service_codes` off the actor's OWN doc, which D-08 stops treating as authoritative for reads). They are still used by the `projects`/`services` UPDATE rules (`firestore.rules:250, 611, 613, 615`) — those are untouched by this phase, so do not delete the helper functions; only their READ-rule call sites are retired.

---

## 4. Rules Test Patterns

**Source:** `test/firestore.test.js`

### Setup skeleton (lines 1-37)
```javascript
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, updateDoc, addDoc } from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let testEnv;

before(async () => {
  const rulesPath = path.join(__dirname, "..", "firestore.rules");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-clmc-procurement-test",
    firestore: {
      rules: fs.readFileSync(rulesPath, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});
```

### `describe`/`beforeEach(seedUsers)` skeleton (repeated per suite, e.g. line 205-206)
```javascript
describe("services collection - role access", () => {
  beforeEach(seedUsers);
  ...
```

### Fixture-seeding helper shape (`withSecurityRulesDisabled`), lines 43-53
```javascript
async function seedUsers() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Super Admin
    await setDoc(doc(db, "users", "active-super-admin"), {
      email: "superadmin@clmc.com",
      status: "active",
      role: "super_admin",
      display_name: "Super Admin",
    });
    ...
```
**Seeded fixture user IDs available (from `seedUsers()`, lines 43-162):** `active-super-admin`, `active-ops-admin`, `active-ops-user` (pre-seeded with `assigned_project_codes: ["CLMC_TEST_2026001"]`), `active-finance`, `active-procurement`, `pending-user`, `active-services-admin` (`all_services: true`), `active-services-user` (`assigned_service_codes: ["SVC-001"]`). Also seeds `role_templates/operations_user`, `invitation_codes/TEST-CODE-001`, `mrfs/MRF-2026-001` (with `project_code`), `mrfs/MRF-2026-002` (legacy, no `project_code`), `services/SVC-001`, `services/SVC-UNASSIGNED`. **No `projects` fixture docs are seeded in the default `seedUsers()`** — a per-suite `beforeEach` (see `operations_admin project assignments`, lines 376-421) seeds its own `projects` docs when a test needs them; Phase 113's new `projects`-list tests will need an equivalent per-suite seed block with a `personnel_user_ids`-carrying project doc and one without.

### Representative `assertSucceeds` test (lines 424-427)
```javascript
it("operations_admin with assigned_project_codes can read assigned project", async () => {
    const opsAdminDb = testEnv.authenticatedContext("ops-admin-assigned").firestore();
    await assertSucceeds(getDoc(doc(opsAdminDb, "projects", "assigned-project")));
});
```

### Representative `assertFails` test on a QUERY (not just `getDoc`) — lines 627-635
```javascript
it("services_user CANNOT list an unassigned service via collection query (list scoping)", async () => {
    // DESIGN NOTE: allow get is intentionally broad for services_user (by doc ID lookup, mirrors mrfs pattern).
    // The allow list rule is where assignment scoping is enforced via isAssignedToService().
    // This test exercises the list rule path using a query, not getDoc.
    const db = testEnv.authenticatedContext("active-services-user").firestore();
    await assertFails(
      getDocs(query(collection(db, "services"), where("service_code", "==", "SVC-UNASSIGNED")))
    );
});
```
This is the exact `getDocs(query(collection(...), where(...)))` shape Phase 113 needs to prove the new `projects` `list` rule denies the OLD unscoped/wrong-shape query.

### `testEnv.authenticatedContext(...)` call shape
```javascript
const db = testEnv.authenticatedContext("active-services-admin").firestore();
```
Also `testEnv.unauthenticatedContext().firestore()` (line 173) for the unauthenticated-access suite — not needed for Phase 113's scoped-role tests but available if a "signed-out cannot list projects" regression test is wanted.

### Asserting on query RESULT CONTENT (doc count/ids), not just pass/fail

**Gap confirmed — no existing test in this file does this.** Every current test either `assertSucceeds`/`assertFails` on the raw promise, or (for `getDoc`) implicitly checks existence via pass/fail. RESEARCH.md's Test Strategy section recommends this as new coverage Phase 113 needs (its item #3: "seed one project with the scoped user's uid in `personnel_user_ids`, one without; `array-contains` query returns exactly the assigned one"). Build it from the existing `assertSucceeds`/`getDocs` shape by adding a content assertion, e.g.:
```javascript
it("operations_user list rule returns exactly the assigned project(s)", async () => {
    const db = testEnv.authenticatedContext("active-ops-user").firestore();
    const snap = await assertSucceeds(
      getDocs(query(collection(db, "projects"), where("personnel_user_ids", "array-contains", "active-ops-user")))
    );
    expect(snap.docs.map(d => d.id)).to.deep.equal(["assigned-project"]); // or snap.size === 1, per whichever assertion lib mocha's configured with
});
```
Note: confirm which assertion style (`chai`'s `expect`, or plain `assert`) the rest of the suite uses before writing this — none of the excerpts read above show a content assertion to copy verbatim, so this shape is synthesized from the SDK's documented `QuerySnapshot` API (`.docs`, `.size`), not copied from an existing test in this file.

### Working-tree `users.update` carve-out — 8 tests to invert per D-17

`describe("operations_admin cross-dept assignment sync", ...)` (lines 699-738) and its `services_admin` mirror (740-761) and the 2-field modal-save mirror (766-798+) currently assert these writes **succeed**:
```javascript
it("operations_admin can update assigned_project_codes on a services_user document", async () => {
    const db = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", "active-services-user"), {
        assigned_project_codes: ["CLMC_TEST_2026001"]
      })
    );
});
```
Per D-17, adapt these 8 tests to assert the OPPOSITE (`assertFails` in place of `assertSucceeds`) once the carve-out rule branches are dropped — same fixture IDs, same `updateDoc` payload shape, inverted assertion only.

---

## 5. Deletion Patterns

Three functions are deleted: `syncPersonnelToAssignments` (`app/utils.js:716-776`), `syncServicePersonnelToAssignments` (`app/utils.js:790-849`), `syncAssignmentToPersonnel` (`app/views/assignments.js:652-698`). Below is the call-site shape to remove at each of the 11+1 invocations, alongside the awaited write that STAYS.

### Pattern to remove — Personnel-panel call sites (6 for projects, 5 for services)

**Verbatim example:** `app/views/project-detail.js:1602-1622` (`selectDetailPersonnel`)
```javascript
    // Save immediately to Firestore
    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            updated_at: new Date().toISOString()
        });
        // Record edit history (fire-and-forget)
        recordEditHistory(currentProject.id, 'personnel_add', [
            { field: 'personnel', old_value: null, new_value: userName }
        ]).catch(err => console.error('[EditHistory] selectPersonnel failed:', err));
        // Sync assignment (fire-and-forget)
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
    } catch (error) {
        console.error('[ProjectDetail] Error saving personnel:', error);
        showToast('Failed to add personnel', 'error');
        detailSelectedPersonnel = detailSelectedPersonnel.filter(u => u.id !== userId);
    }
```
**What to delete:** the 3 lines
```javascript
        // Sync assignment (fire-and-forget)
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Assignment sync failed:', err));
```
**What STAYS untouched:** the `await updateDoc(doc(db, 'projects', currentProject.id), {...})` block above it (already the single authoritative write, already `await`ed, already wrapped in the surrounding `try/catch` that `showToast`s on failure — satisfies D-11/D-12 as-is) and the `recordEditHistory(...).catch(...)` fire-and-forget line (a DIFFERENT, non-assignment write — out of scope for this deletion, D-12 only targets assignment-affecting writes).

The mirror-image `removeDetailPersonnel` (`project-detail.js:1647-1665`) has the identical shape — same 3-line deletion, same preserved `updateDoc`.

**Creation-time call site (different shape — inside an `onAfterCreate` callback):** `app/views/projects.js:735-754`
```javascript
        const { code: project_code } = await createEngagement({
            type: 'project',
            ...
            onAfterCreate: ({ code }) => {
                // Phase 78 D-04: skip personnel sync when project_code is null (clientless project)
                if (code) {
                    syncPersonnelToAssignments(code, [], selectedPersonnel.map(u => u.id).filter(Boolean))
                        .catch(err => console.error('[Projects] Assignment sync failed:', err));
                }
            }
        });
```
**What to delete:** the whole `if (code) { syncPersonnelToAssignments(...).catch(...); }` block (and if `onAfterCreate` becomes a no-op across all 3 `createEngagement` call sites once both sync functions are gone, consider whether the `onAfterCreate` callback param itself becomes dead — flag for the executor, don't assume, `createEngagement` may have other uses of the callback).

### Pattern to remove — Assignments-tab reverse sync call site

**Verbatim:** `app/views/assignments.js:573-589` (`saveManageModal`)
```javascript
    try {
        // Write codes to user doc, clear legacy all_* flag
        await updateDoc(doc(db, 'users', userId), {
            [field]: newCodes,
            [allFlag]: false
        });
        // Reverse sync for projects only
        if (type === 'projects' && user) {
            syncAssignmentToPersonnel(userId, user, oldCodes, newCodes)
                .catch(err => console.error('[Assignments] Personnel sync failed:', err));
        }

        showToast('Assignments saved', 'success');
    } catch (error) {
        console.error('[Assignments] Error saving assignments:', error);
        showToast('Error saving assignments', 'error');
    }
```
**What to delete:** the `if (type === 'projects' && user) { syncAssignmentToPersonnel(...).catch(...); }` block, AND (per D-05) the `await updateDoc(doc(db, 'users', userId), {...})` write itself must be REPOINTED, not merely left as-is — D-05 repoints the Assignments tab to write `personnel_user_ids` on the project/service documents directly instead of writing `assigned_project_codes`/`assigned_service_codes` on the user doc. This call site needs a rewrite of the awaited write's target, not just a deletion of the fire-and-forget tail. (`syncAssignmentToPersonnel` itself, `assignments.js:652-698`, is deleted in full — it's a standalone function, not inlined elsewhere.)

---

## 6. Composite Index File

**Source:** `firestore.indexes.json:1-24` (first entry, verbatim — the shape to match for new entries)

```json
{
  "indexes": [
    {
      "collectionGroup": "pos",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "is_subcon",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "project_name",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "delivery_fee",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "total_amount",
          "order": "ASCENDING"
        }
      ]
    },
```
Confirmed via full-file grep: **zero existing entries reference `personnel_user_ids`**, and **zero existing entries use `arrayConfig`** (every current index is `order`-only fields). Phase 113's Shape C conversions (`project-detail.js:220`, `project-plan.js:258`, and any equivalent for `services` if converted) will need NEW entries pairing an equality field with an `array-contains` field. Firestore's documented JSON shape for an array-contains field in a composite index uses `"arrayConfig": "CONTAINS"` in place of `"order"` on that one field — e.g. for the `project_code` + `personnel_user_ids` pairing:
```json
{
  "collectionGroup": "projects",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "project_code", "order": "ASCENDING" },
    { "fieldPath": "personnel_user_ids", "arrayConfig": "CONTAINS" }
  ]
}
```
**Caveat:** this exact `arrayConfig` shape is NOT copied from this repo (no such entry exists yet) — it is the standard Firestore index-definition schema (per RESEARCH.md's Composite Index Implications section, cross-referenced against Firebase docs, MEDIUM confidence, not emulator-verified). Append new entries as siblings inside the existing `"indexes": [...]` array, matching the surrounding entries' 2-space JSON indentation. RESEARCH.md's Rules Mechanics section flags that Firestore may also surface a console link to auto-generate the exact required index at runtime — cross-check the auto-generated shape against hand-written entries before committing, and deploy indexes (`firebase deploy --only firestore:indexes`) as a SEPARATE step from `firebase deploy --only firestore:rules`, before the corresponding client query ships (indexes can take minutes to build, unlike rules).

Sites that use a bare `array-contains` query with NO other `where` clause (Shape A/B conversions once the equality filter is moved client-side) need **no new index** — single-field indexes are automatic. Prefer this cheaper shape wherever a client-side post-filter is affordable (per Shape B above).

---

## Shared Patterns

### No fire-and-forget on assignment-affecting writes (D-12)
**Apply to:** every deletion site in Section 5. The standing constraint: after this phase, the only write remaining at each personnel-change call site is the `await updateDoc(doc(db,'projects'|'services', id), { personnel_user_ids: ..., ... })` call that is ALREADY present, already `await`ed, and already wrapped in a `try/catch` that calls `showToast(..., 'error')` on failure (verified at `project-detail.js:1602-1624` and its mirror). No new error plumbing is needed — verify by inspection that no NEW `.catch(err => console.error(...))`-only pattern is introduced during the Assignments-tab repoint (D-05).

### Fail-closed posture (must be preserved in every conversion)
**Apply to:** every Shape A/B/C/E conversion. `getAssignedProjectCodes()`/`getAssignedServiceCodes()` (`app/utils.js:333-343, 413-421`) return `[]` (sees nothing) on a missing/malformed array — "deliberate FAIL-CLOSED default" per their own comments. Firestore's `array-contains` operator has the same property for free: a query for `array-contains uid` against a doc lacking `personnel_user_ids`, or where the field isn't an array, simply never matches that doc — no custom code needed, but every conversion's uid-guard (`if (!uid) { ...empty-return... }`, Section 1) must be kept, not dropped as "redundant."

### Get/list rule split (D-15)
**Apply to:** the `projects` rules rewrite (Section 3) and any `services` list-rule rewrite in scope per D-13. Mirror `services`' STRUCTURE (separate `allow get` / `allow list`) but not its CONTENT (drop `isAssignedToService`/legacy-array branches; use `personnel_user_ids` uniformly per D-02).

---

## No Analog Found / Not Applicable

| Site | Reason |
|------|--------|
| `app/utils.js:278` (`generateProjectCode`) | SAFE, no conversion — both callers are exempt roles (see Shape D section). Listed for completeness only. |
| `app/views/assignments.js:192`, `app/views/user-management.js:276`, `app/views/finance.js:2006,4473` | SAFE (admin-only or see-all-role-only routes per RESEARCH.md's audit) — no pattern conversion needed, left as unscoped per D-01. |
| Query-result-content assertion test (Section 4) | No existing verbatim analog in `test/firestore.test.js` — synthesized from the SDK's documented `QuerySnapshot` API and the existing `getDocs(query(...))` pass/fail shape; flag as net-new test infrastructure, not a copy. |
| `firestore.indexes.json` `arrayConfig` entry (Section 6) | No existing entry in this repo uses `arrayConfig` — shape given is standard Firestore schema, not a repo copy. Flagged explicitly in Section 6. |

---

## Discrepancies vs RESEARCH.md

None found. All excerpts pulled during this mapping pass (`procurement.js:2926-2955`'s `loadProjects()` lacking any `projScope` reference; `project-detail.js:218-227`'s doc-ID fallback structure; `services.js:872-904`'s exact branch order) match RESEARCH.md's citations and conclusions verbatim.

## Metadata

**Analog search scope:** `app/views/services.js`, `app/views/projects.js`, `app/views/mrf-form.js`, `app/views/procurement.js`, `app/views/project-detail.js`, `app/views/project-plan.js`, `app/proposal-modal.js`, `app/expense-modal.js`, `app/utils.js`, `app/views/assignments.js`, `app/views/user-management.js`, `firestore.rules`, `firestore.indexes.json`, `test/firestore.test.js` — all read directly for this pass, no additional grep-only inference.
**Files scanned:** 14
**Pattern extraction date:** 2026-08-10
