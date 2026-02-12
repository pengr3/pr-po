# Pitfalls Research: Adding Services Department Workflow

**Domain:** Multi-department procurement system with role-based isolation
**Researched:** 2026-02-12
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Security Rules List Permission Filtering Illusion

**What goes wrong:**
Security Rules appear to support filtering with conditions like `isRole('services_user') && resource.data.department == 'services'`, but Firestore **evaluates security rules against the entire query result set**, not individual documents. A `list` query that could return ANY document the user doesn't have permission for will fail completely, even if client-side filtering would narrow it down. This causes "permission-denied" errors despite correct role assignment.

**Why it happens:**
Developers assume Security Rules work like database WHERE clauses—filtering data at query time. In reality, Firestore validates that **every possible result** in the query is accessible. The rule `allow list: if resource.data.department == 'services'` fails for a query like `getDocs(collection(db, 'services'))` if ANY document exists with `department != 'services'`.

**How to avoid:**
1. **Client-side queries MUST match Security Rules constraints** — Use `.where('department', '==', 'services')` in the client query
2. **Security Rules validate, not filter** — Think of rules as "can this query return only allowed documents?" not "filter to allowed documents"
3. **Test with mixed department data** — Seed both `services` and `projects` documents to verify queries fail without proper `where()` clauses

```javascript
// ❌ WRONG - will fail if ANY service has department != user's department
const servicesQuery = query(collection(db, 'services'));
const snapshot = await getDocs(servicesQuery);

// ✅ CORRECT - query explicitly constrains to user's department
const servicesQuery = query(
    collection(db, 'services'),
    where('department', '==', 'services')
);
const snapshot = await getDocs(servicesQuery);
```

**Warning signs:**
- "permission-denied" errors on queries that should be allowed by role
- Rules work in Emulator with test data but fail in production with mixed data
- Operations_user can't list services despite `services_user` role existing

**Phase to address:**
Phase 1 (Services Collection Schema) — Document this constraint in schema design
Phase 3 (Security Rules Extension) — Test with mixed department data, verify all list queries include department filter

**Sources:**
- [Firestore Security Rules Conditions](https://firebase.google.com/docs/firestore/security/rules-conditions): "Security rules are not filters"
- [Fix Insecure Rules](https://firebase.google.com/docs/firestore/security/insecure-rules): Query constraint requirements

---

### Pitfall 2: Sequential ID Generation Cross-Collection Race Conditions

**What goes wrong:**
Using `generateSequentialId()` across BOTH `projects` and `services` collections with shared prefixes (MRF-2026-001) creates race conditions. If Projects department generates MRF-2026-001 while Services department simultaneously generates MRF-2026-001, both succeed in Firestore but violate uniqueness. Finance/Procurement can't distinguish which department owns which MRF.

**Why it happens:**
Current `generateSequentialId()` implementation queries ONE collection to find max number:

```javascript
// Current implementation - only queries one collection
export async function generateSequentialId(collectionName, prefix, year = null) {
    const docs = await getDocs(collection(db, collectionName));  // Only queries 'mrfs' OR 'services_mrfs'
    let maxNum = 0;
    docs.forEach(doc => {
        const id = doc.data()[`${prefix.toLowerCase()}_id`];
        // ... find max
    });
    return `${prefix}-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}
```

When adding Services, if Services creates `services_mrfs` collection and calls `generateSequentialId('services_mrfs', 'MRF')`, it only scans `services_mrfs` (maxNum = 0). Meanwhile, Projects scans `mrfs` (maxNum = 5). Both generate MRF-2026-006 simultaneously.

**How to avoid:**
**Option A: Department-Prefixed IDs (Recommended)**
- Projects: `MRF-PROJ-2026-001`
- Services: `MRF-SERV-2026-001`
- Changes ID format but eliminates race condition
- Explicit department identification in every ID

**Option B: Shared Counter Document**
- Single `counters/mrf_counter` document with `{ current: 42 }`
- Use Firestore Transaction to atomically read-and-increment
- Queries BOTH collections to verify uniqueness before incrementing
- Performance: 1 write/second limit per counter document

**Option C: Query Both Collections**
- Modify `generateSequentialId()` to accept array of collections: `['mrfs', 'services_mrfs']`
- Query all collections to find global max number
- Still has race condition window (no transaction), but reduces collision probability

**Recommendation:** Use Option A (department prefixes) for v2.2. Clearer department identification, no performance penalty, no collision risk.

**Warning signs:**
- Duplicate ID errors when creating PRs/POs
- Finance seeing multiple MRFs with same ID but different content
- Search/filter by MRF ID returns multiple results

**Phase to address:**
Phase 1 (Services Collection Schema) — Decide ID format (department prefix vs shared counter)
Phase 2 (Utility Functions) — Extend `generateSequentialId()` or create new `generateDepartmentSequentialId()`

**Sources:**
- [Generating Auto-Incrementing Sequences With Firestore](https://medium.com/firebase-developers/generating-auto-incrementing-sequences-with-firestore-b51ab713c571): Transaction-based counter pattern
- [Race Conditions in Firestore](https://medium.com/quintoandar-tech-blog/race-conditions-in-firestore-how-to-solve-it-5d6ff9e69ba7): Identifying and preventing race conditions
- [Transaction Serializability](https://firebase.google.com/docs/firestore/transaction-data-contention): Performance limits

---

### Pitfall 3: Permission Check Timing - Undefined vs. False

**What goes wrong:**
Permission checks return `undefined` when permissions haven't loaded yet (auth observer still initializing). Conditional rendering treats `undefined` as "not loaded yet, show loading state" but race conditions cause UI to flash "access denied" before permissions load, or worse—render restricted content briefly before hiding it.

```javascript
// Current permission pattern
export function hasTabAccess(tabId) {
    if (!currentPermissions || !currentPermissions.tabs) return undefined;  // Not loaded yet
    return currentPermissions.tabs[tabId]?.access || false;
}
```

When adding Services roles (`services_admin`, `services_user`), permission templates load asynchronously. If MRF form renders BEFORE permissions load:
1. `hasTabAccess('services_mrf_form')` returns `undefined`
2. Component shows "Loading..." (correct)
3. Permissions load 200ms later
4. Component re-renders with correct permissions
5. **BUT:** If component doesn't subscribe to `permissionsChanged` event, it never re-renders—stuck showing "Loading..." or worse, showing restricted content.

**Why it happens:**
Three-state permission model (`undefined` / `false` / `true`) requires careful handling:
- Router must **defer navigation** until permissions load (`undefined` → wait)
- Components must **subscribe to permission changes** to re-render when permissions load
- View modules must **check permissions in both `render()` and event handler**

Current codebase handles this for existing roles, but adding Services roles creates new code paths (new views, new forms) that might not implement all checks.

**How to avoid:**
1. **View Module Template** — Require all new views to implement:
   ```javascript
   export function render() {
       const canEdit = window.canEditTab?.('services_mrf_form');

       // Handle loading state (permissions not loaded yet)
       if (canEdit === undefined) {
           return `<div class="loading-spinner">Loading permissions...</div>`;
       }

       // Handle denied state
       if (canEdit === false) {
           return `<div class="view-only-notice">Access denied</div>`;
       }

       // Render normal content
       return `<div>...</div>`;
   }

   export async function init() {
       // Re-render when permissions change
       window.addEventListener('permissionsChanged', handlePermissionsChanged);
   }

   export async function destroy() {
       window.removeEventListener('permissionsChanged', handlePermissionsChanged);
   }
   ```

2. **Router Integration** — Ensure router waits for permissions to load before allowing navigation (already implemented in `router.js`, verify it covers new routes)

3. **Testing Protocol** — Clear browser cache and reload to simulate first-load race condition

**Warning signs:**
- Flash of restricted content before hiding
- Components stuck showing "Loading permissions..." indefinitely
- `permissionsChanged` event dispatched but UI doesn't update
- User with correct role sees "Access Denied" message transiently

**Phase to address:**
Phase 4 (UI Conditional Rendering) — Document pattern, audit all new components for three-state handling
Phase 6 (Testing) — Add race condition test (clear cache, reload, verify no flash)

**Sources:**
- Existing codebase: `app/permissions.js` (three-state model), `app/views/mrf-form.js` (canEdit checks)
- [React RBAC Authorization](https://www.permit.io/blog/implementing-react-rbac-authorization): Conditional rendering patterns

---

### Pitfall 4: Backward Compatibility - Missing Department Field in Existing Documents

**What goes wrong:**
Existing `mrfs`, `prs`, `pos`, `transport_requests` collections have **no `department` field** (created before Services department existed). When Security Rules enforce `resource.data.department == 'projects'` or dropdown filters by `department`, existing documents become **invisible** or **unqueryable**:

```javascript
// New query for Projects department
const mrfsQuery = query(
    collection(db, 'mrfs'),
    where('department', '==', 'projects')
);
// Returns ZERO results - existing MRFs have no department field!
```

This breaks:
- Dashboard stats (MRF count shows 0 for Projects department)
- Finance approval queue (existing PRs don't appear)
- Procurement PO tracking (existing POs invisible)
- Historical data reports (only post-migration data appears)

**Why it happens:**
Firestore is schemaless—adding new fields doesn't backfill existing documents. The field `department` doesn't exist in old documents, so:
- `where('department', '==', 'projects')` excludes them (no field ≠ field with value 'projects')
- `resource.data.department` evaluates to `null` or `undefined`, failing Security Rules equality checks
- Client-side filters like `mrf.department === 'projects'` return false for legacy data

**How to avoid:**
**Option A: Migration Script (Recommended)**
- Write Cloud Function or client-side script to backfill `department: 'projects'` on all existing documents
- Run before deploying Services feature
- Verify completion with count queries

```javascript
// Migration pseudocode
const collections = ['mrfs', 'prs', 'pos', 'transport_requests'];
for (const collectionName of collections) {
    const snapshot = await getDocs(collection(db, collectionName));
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        if (!doc.data().department) {
            batch.update(doc.ref, { department: 'projects' });
        }
    });
    await batch.commit();
}
```

**Option B: Legacy-Aware Queries**
- Query documents with `department == 'projects'` OR `department` field doesn't exist
- Firestore doesn't support "field not exists" in queries—requires TWO separate queries and merge client-side
- Complex, error-prone, performance penalty

**Option C: Legacy-Aware Security Rules**
- Helper function: `function isLegacyOrDepartment(dept) { return !('department' in resource.data) || resource.data.department == dept; }`
- Treats missing department as legacy Projects data
- Doesn't solve client-side query problem (still need separate queries)

**Recommendation:** Use Option A (migration script) for clean separation. Run in Phase 1 before any Services code is deployed.

**Warning signs:**
- Dashboard shows 0 MRFs for Projects department immediately after deployment
- Finance users report "all pending PRs disappeared"
- Search by date range returns only recent (post-Services) documents
- operations_user assigned to Projects can't see their historical MRFs

**Phase to address:**
Phase 1 (Services Collection Schema) — Plan migration strategy
Phase 2 (Data Migration) — Execute backfill script, verify with count queries
Phase 3 (Security Rules Extension) — Include legacy-aware fallback as safety net

**Sources:**
- Existing codebase: `firestore.rules` lines 43-47 (legacy-aware helper for `project_code`)
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices): Schema evolution patterns

---

### Pitfall 5: Finance/Procurement Cross-Department Access Scope Creep

**What goes wrong:**
Finance and Procurement roles must access BOTH Projects and Services department data (cross-department by design). When implementing department isolation, Security Rules accidentally restrict Finance/Procurement to ONE department, or client-side queries filter out one department's data:

```javascript
// ❌ WRONG - restricts Finance to Projects only
match /mrfs/{mrfId} {
    allow list: if isRole('finance') && resource.data.department == 'projects';
}

// ❌ WRONG - client-side query filters out Services
const mrfsQuery = query(
    collection(db, 'mrfs'),
    where('department', '==', 'projects')  // Finance user sees ONLY projects!
);
```

**Why it happens:**
When adding department isolation, developers reflexively add `where('department', '==', user.department)` to ALL queries. But Finance/Procurement don't HAVE a single department—they're cross-department by design. Copying isolation patterns from `operations_user` role (department-scoped) to `finance` role (cross-department) breaks their workflow.

**How to avoid:**
1. **Security Rules: Exempt Finance/Procurement from department filtering**
   ```javascript
   match /mrfs/{mrfId} {
       // Department users are scoped
       allow list: if (
           (isRole('services_user') && resource.data.department == 'services') ||
           (isRole('operations_user') && resource.data.department == 'projects') ||
           // Finance/Procurement see ALL departments
           hasRole(['finance', 'procurement', 'super_admin', 'operations_admin'])
       );
   }
   ```

2. **Client-side queries: Check role before filtering**
   ```javascript
   function getMRFsQuery() {
       const user = getCurrentUser();
       let q = query(collection(db, 'mrfs'));

       // Only department-scoped roles filter by department
       if (user.role === 'operations_user' || user.role === 'services_user') {
           const dept = user.role === 'services_user' ? 'services' : 'projects';
           q = query(q, where('department', '==', dept));
       }

       // Finance/Procurement get unfiltered query (see all departments)
       return q;
   }
   ```

3. **UI: Show department column/badge for Finance/Procurement**
   - Finance users see MRFs from multiple departments mixed together
   - Add "Department" column to tables so they can distinguish
   - Add filter dropdown: "Show: All | Projects | Services"

**Warning signs:**
- Finance user reports "Services MRFs don't appear in approval queue"
- Procurement can't generate POs for Services department
- Dashboard stats for Finance show only one department's totals
- User with `finance` role gets "permission-denied" on Services MRFs

**Phase to address:**
Phase 3 (Security Rules Extension) — Explicitly test Finance/Procurement cross-department access
Phase 4 (UI Conditional Rendering) — Add department badge/column for cross-department roles
Phase 6 (Testing) — Verify Finance can approve PRs from BOTH departments

**Sources:**
- Existing codebase: `firestore.rules` lines 167-178 (MRFs list permission pattern)
- [Firestore Role-Based Access](https://firebase.google.com/docs/firestore/solutions/role-based-access): Multi-role patterns

---

### Pitfall 6: MRF Form Dropdown Shows Wrong Projects Collection

**What goes wrong:**
The MRF form has a "Project Name" dropdown that loads from the `projects` collection. When Services users load the form, they should see **services** from a `services` collection instead, but the dropdown shows **projects** because the form queries the wrong collection. Services users create MRFs with invalid `project_name` values, or link to Projects department projects incorrectly.

**Why it happens:**
Current `mrf-form.js` implementation uses a hardcoded collection name:

```javascript
// app/views/mrf-form.js - current implementation
export async function init() {
    // Real-time listener on projects collection
    projectsListener = onSnapshot(collection(db, 'projects'), (snapshot) => {
        cachedProjects = [];
        snapshot.forEach(doc => cachedProjects.push(doc.data()));
        populateProjectDropdown();
    });
}
```

When adding Services department, developers must **conditionally query** based on user role:
- `operations_user` → query `projects` collection, filter `where('department', '==', 'projects')`
- `services_user` → query `services` collection (NEW), filter `where('department', '==', 'services')`

Forgetting to add conditional logic means Services users see Projects dropdown, create MRF with wrong project linkage, Finance can't map MRF to Service correctly.

**How to avoid:**
1. **Conditional Collection Selection**
   ```javascript
   export async function init() {
       const user = getCurrentUser();

       // Determine which collection to query based on role
       const collectionName = (user.role === 'services_user' || user.role === 'services_admin')
           ? 'services'   // NEW: Services department collection
           : 'projects';  // Existing: Projects department collection

       projectsListener = onSnapshot(
           query(
               collection(db, collectionName),
               where('status', '==', 'active')
           ),
           (snapshot) => {
               cachedProjects = [];
               snapshot.forEach(doc => cachedProjects.push(doc.data()));
               populateProjectDropdown();
           }
       );
   }
   ```

2. **Field Name Abstraction**
   - Projects use `project_name`, `project_code`
   - Services might use `service_name`, `service_code`
   - Consider unified field names (`entity_name`, `entity_code`) or map in form submission handler

3. **Testing Protocol**
   - Log in as `services_user`, verify dropdown shows Services (not Projects)
   - Create MRF, verify `project_name` (or `service_name`) correctly links to Services collection
   - Log in as `operations_user`, verify dropdown shows Projects (not Services)

**Warning signs:**
- Services user creates MRF with project_name = "CLMC_CLIENT_2026001" (Projects format)
- Dropdown shows 0 options for Services users (queries Projects with department filter, returns nothing)
- MRF references project_code that doesn't exist in user's department
- Finance can't find linked Project/Service when reviewing MRF

**Phase to address:**
Phase 4 (UI Conditional Rendering) — Implement conditional dropdown logic
Phase 5 (MRF Form Adaptation) — Test with both roles, verify correct collection queried
Phase 6 (Testing) — Create end-to-end test: Services user submits MRF, Finance approves, Procurement creates PO

**Sources:**
- Existing codebase: `app/views/mrf-form.js` lines 107-112 (project dropdown)
- Current architecture: Projects collection schema (project_name, project_code)

---

### Pitfall 7: Role Template Missing for New Roles

**What goes wrong:**
Adding `services_admin` and `services_user` roles requires creating corresponding `role_templates` documents in Firestore. If templates are missing or incomplete, new users assigned these roles experience:
- "Permission denied" on all navigation (permissions fail to load)
- Stuck on "Loading permissions..." indefinitely
- `hasTabAccess()` returns `undefined` forever

Console shows:
```
[Permissions] Role template not found: services_user
```

**Why it happens:**
Current permission system uses `role_templates` collection to define tab access:

```javascript
// app/permissions.js - loads permissions from role template
export async function initPermissionsObserver(user) {
    const roleDocRef = doc(db, 'role_templates', user.role);  // 'services_user'
    roleTemplateUnsubscribe = onSnapshot(roleDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentPermissions = docSnapshot.data().permissions;
        } else {
            console.warn('[Permissions] Role template not found:', user.role);
            currentPermissions = null;  // NO PERMISSIONS = NO ACCESS
        }
    });
}
```

When admin assigns `role: 'services_user'` to a user but `role_templates/services_user` document doesn't exist, permissions remain `null`, blocking all access.

**How to avoid:**
1. **Seed Script for Role Templates**
   - Create `app/seed-services-roles.js` (similar to existing `app/seed-roles.js`)
   - Define tab access for `services_admin` and `services_user`:
   ```javascript
   // services_admin example
   {
       role_name: 'services_admin',
       display_name: 'Services Administrator',
       description: 'Manages Services department',
       permissions: {
           tabs: {
               dashboard: { access: true, edit: false },
               services_mrf_form: { access: true, edit: true },
               services_management: { access: true, edit: true },
               finance: { access: true, edit: false },  // Cross-department view
               // ... other tabs
           }
       }
   }
   ```

2. **Deployment Checklist**
   - [ ] Run seed script to create `role_templates/services_admin`
   - [ ] Run seed script to create `role_templates/services_user`
   - [ ] Verify documents exist in Firestore console
   - [ ] Test: Create user, assign `services_user` role, verify permissions load

3. **Security Rules: Allow Read Access**
   - Existing rule at line 85-86: `allow read: if isActiveUser();`
   - Verify this covers new role templates (should be collection-wide, not document-specific)

**Warning signs:**
- Console error: "Role template not found: services_user"
- New Services users stuck on loading screen
- `getCurrentPermissions()` returns `null` for Services roles
- Navigation menu empty for Services users

**Phase to address:**
Phase 0 (Pre-Development) — Create seed script for Services roles
Phase 1 (Services Collection Schema) — Document required role templates
Phase 6 (Testing) — Verify role templates exist before assigning roles to users

**Sources:**
- Existing codebase: `app/seed-roles.js` (template for creating role templates)
- Existing codebase: `app/permissions.js` lines 82-103 (role template loading logic)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Query both collections instead of department field | Avoids migration script | Every query becomes 2x slower, double Firestore read costs | Never (migration required for production) |
| Shared `mrfs` collection with department field | Reuse existing collection | MRF ID conflicts, can't enforce different schema per department | Only if ID format includes department prefix |
| Skip role template creation for Services roles | Deploy faster | Services users have no permissions, stuck on loading screen | Never (blocks all Services functionality) |
| Client-side filtering instead of Security Rules | Easier to prototype | Data leakage risk, UI shows restricted data briefly | Development/testing only, never production |
| Duplicate code for Services views instead of parameterizing | Faster to copy-paste | 2x maintenance burden, bugs fixed in Projects not fixed in Services | Never (use shared components with department parameter) |
| Hard-code "services" in new views instead of reading user.department | Simpler logic | Breaks if third department added, Services users can't access | Only if department expansion unlikely |

---

## Integration Gotchas

Common mistakes when connecting Services department to existing Finance/Procurement workflows.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PR Generation | Query only `mrfs` collection when generating PR | Query correct collection based on MRF department field or new `services_mrfs` collection |
| PO Creation | Hard-code `project_code` field in PO document | Use generic `entity_code` field or read from linked MRF/PR to determine field name |
| Finance Approval | Filter PRs by `where('department', '==', user.department)` | Finance sees ALL departments (no filter), add UI dropdown to filter view |
| Dashboard Stats | Count documents in `mrfs` collection only | Count BOTH `mrfs` and `services_mrfs` (or query by department field) |
| Edit History | Store history in `projects/{id}/edit_history` | Services needs parallel `services/{id}/edit_history` with identical structure |
| Sequential ID | Call `generateSequentialId('mrfs', 'MRF')` for Services | Use department prefix (`MRF-SERV-`) or query both collections before generating |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Query both collections on every page load | 2x Firestore reads, slow dashboard | Add `department` field to existing collections, single query with `where('department', '==', dept)` | >1000 documents per collection |
| Real-time listeners on both departments | Double listener cost, memory leak if not unsubscribed | Department-scoped roles query single collection; Finance queries with pagination | >10 concurrent users with listeners |
| No index on `department` field | Slow queries, "Missing index" errors | Create composite index: `department ASC, status ASC, date_needed ASC` | >500 documents per collection |
| Separate counter documents per department without sharding | 1 write/second limit per counter | Use distributed counters (10 shards) for high-throughput ID generation | >1 MRF/second created |
| Client-side merge of Projects + Services results | Slow UI, pagination breaks | Store both in single collection with `department` field OR implement server-side aggregation | >100 results per query |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Allow list without department constraint | Services user queries `mrfs` collection without `where('department')`, sees Projects data | Security Rules fail queries missing department constraint: `allow list: if request.query.department == [user_dept]` |
| Missing department field in new documents | Document created without `department`, visible to all users or invisible to all | Validate `department` field exists in Security Rules: `allow create: if request.resource.data.department in ['projects', 'services']` |
| Client-side department check only | Attacker modifies JS to change `user.department`, accesses restricted data | Enforce department in Security Rules, never trust client-supplied department value |
| Finance role scoped to one department | Finance user assigned `department: 'projects'`, can't access Services PRs | Finance/Procurement roles have NO department field (cross-department) |
| Shared secret in department-scoped code | API keys stored in Services-only accessible config, Projects users can't access shared services | Store cross-department resources (API keys, shared configs) outside department-scoped collections |
| Operations_admin scoped to department | Admin creates Projects, locked out of Services management | Operations_admin sees ALL departments (like Finance), only operations_user is scoped |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No department badge on MRFs | Finance user can't tell which department an MRF belongs to, confusion in approval queue | Add department badge to MRF table rows (Projects = blue, Services = green) |
| Mixed Projects + Services in single dropdown | User selects wrong project from other department, creates invalid linkage | Show only user's department in dropdown (conditional query) |
| Finance dashboard shows combined stats | "10 Pending MRFs" doesn't clarify 7 are Projects, 3 are Services | Show per-department breakdown: "Projects: 7 | Services: 3" |
| No department filter for cross-department roles | Finance user sees 1000+ MRFs mixed together, hard to find Services-specific items | Add filter dropdown: "Show: All Departments | Projects | Services" |
| Error message: "Permission denied" | User doesn't know why (missing role? Wrong department? Permissions loading?) | Show specific error: "Access denied: This MRF belongs to Services department" |
| Hardcoded "Project Name" label | Services users see "Project Name" dropdown but it shows Services | Conditional label: `user.department === 'services' ? 'Service Name' : 'Project Name'` |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Services Collection Created:** Often missing `department` field or using wrong field names (service_name vs project_name) — verify schema matches Projects collection
- [ ] **Security Rules Updated:** Often missing `list` rule constraints — verify query with `where('department')` doesn't fail
- [ ] **Role Templates Seeded:** Often forget to create `role_templates/services_admin` document — verify document exists before assigning role
- [ ] **Sequential ID Updated:** Often still queries single collection — verify Services MRF ID doesn't conflict with Projects MRF ID
- [ ] **Migration Script Executed:** Often skip backfilling `department` field on existing documents — verify query `where('department', '==', 'projects')` returns existing MRFs
- [ ] **Finance Cross-Department Access:** Often accidentally scope Finance to Projects only — verify Finance user sees Services MRFs in approval queue
- [ ] **Conditional Dropdown Logic:** Often query Projects collection for all users — verify Services user sees Services in dropdown (not Projects)
- [ ] **Permission Event Listeners:** Often forget `permissionsChanged` event subscription — verify UI updates when permissions load (not stuck on "Loading...")
- [ ] **Department Badge/Column:** Often forget to add department indicator — verify Finance user can distinguish department in table view
- [ ] **Testing with Mixed Data:** Often test with single department only — verify Projects user can't see Services MRFs, Finance can see both

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Missing department field (migration skipped) | MEDIUM | 1. Write batch update script to add `department: 'projects'` to all existing docs 2. Verify with count query 3. Redeploy |
| Sequential ID collision (duplicate MRF IDs) | HIGH | 1. Identify collisions with GROUP BY query 2. Manually reassign IDs (change MRF-2026-005 → MRF-2026-099) 3. Update linked PRs/POs 4. Deploy department-prefixed IDs |
| Missing role template | LOW | 1. Run seed script to create template 2. Users refresh page, permissions load 3. No data corruption |
| Security Rules too restrictive (Finance locked out) | LOW | 1. Update rules to exempt Finance from department filter 2. Deploy new rules 3. Users refresh page |
| Wrong dropdown collection (Services sees Projects) | MEDIUM | 1. Add conditional collection query 2. Deploy updated form 3. Audit existing Services MRFs for invalid project_name 4. Correct linkages |
| Client-side filtering only (data leakage) | HIGH | 1. Audit Security Rules for missing constraints 2. Add `where('department')` to all queries 3. Test with mixed data 4. Deploy immediately |
| Permission check race condition (flash of content) | MEDIUM | 1. Add `permissionsChanged` event listener 2. Handle `undefined` state in render() 3. Deploy updated views 4. No data corruption, UX fix only |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Security Rules List Permission Filtering Illusion | Phase 3 (Security Rules Extension) | Test query with mixed department data, verify no "permission-denied" errors |
| Sequential ID Generation Cross-Collection Race Conditions | Phase 2 (Utility Functions) | Create MRF in Projects and Services simultaneously, verify unique IDs |
| Permission Check Timing - Undefined vs. False | Phase 4 (UI Conditional Rendering) | Clear cache, reload, verify no flash of restricted content |
| Backward Compatibility - Missing Department Field | Phase 2 (Data Migration) | Query `where('department', '==', 'projects')`, verify existing MRFs returned |
| Finance/Procurement Cross-Department Access Scope Creep | Phase 3 (Security Rules Extension) | Login as Finance, verify Services MRFs visible in approval queue |
| MRF Form Dropdown Shows Wrong Projects Collection | Phase 5 (MRF Form Adaptation) | Login as Services user, verify dropdown shows Services (not Projects) |
| Role Template Missing for New Roles | Phase 0 (Pre-Development) | Assign `services_user` role to test user, verify permissions load |

---

## Sources

**Firebase Official Documentation:**
- [Secure data access for users and groups](https://firebase.google.com/docs/firestore/solutions/role-based-access): Role-based access patterns
- [Firestore Security Rules Conditions](https://firebase.google.com/docs/firestore/security/rules-conditions): "Security rules are not filters" critical limitation
- [Fix Insecure Rules](https://firebase.google.com/docs/firestore/security/insecure-rules): Query constraint requirements
- [Transaction Serializability](https://firebase.google.com/docs/firestore/transaction-data-contention): Performance limits on counter documents
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices): Schema evolution and hotspotting

**Community Resources:**
- [Generating Auto-Incrementing Sequences With Firestore](https://medium.com/firebase-developers/generating-auto-incrementing-sequences-with-firestore-b51ab713c571): Transaction-based counter pattern
- [Race Conditions in Firestore](https://medium.com/quintoandar-tech-blog/race-conditions-in-firestore-how-to-solve-it-5d6ff9e69ba7): Identifying and preventing race conditions
- [Firestore real-time updates with tenant isolation](https://www.hotovo.com/blog/firestore-real-time-updates-with-tenant-isolation): Multi-tenant isolation patterns
- [Implementing Multi Tenancy with Firebase](https://ktree.com/blog/implementing-multi-tenancy-with-firebase-a-step-by-step-guide.html): Step-by-step tenant isolation
- [Firebase 2026: Complete Advanced Guide](https://medium.com/@ramankumawat119/firebase-2026-the-complete-advanced-guide-for-modern-app-developers-7d24891010c7): Updated 2026 best practices

**Existing Codebase (Production System):**
- `firestore.rules` lines 10-47: Helper functions and legacy-aware patterns
- `app/permissions.js` lines 82-103: Role template loading logic, three-state permission model
- `app/auth.js` lines 276-332: Real-time user document monitoring, role change detection
- `app/utils.js` lines 154-179: Sequential ID generation implementation (current approach)
- `app/views/mrf-form.js`: Project dropdown conditional rendering pattern

---

*Pitfalls research for: Multi-department procurement system with role-based isolation*
*Researched: 2026-02-12*
*Confidence: HIGH (based on existing production codebase analysis + Firebase 2026 documentation)*
