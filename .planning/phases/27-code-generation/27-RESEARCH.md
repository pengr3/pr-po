# Phase 27: Code Generation - Research

**Researched:** 2026-02-18
**Domain:** Firestore parallel-query pattern for shared sequence + utility function additions to app/utils.js
**Confidence:** HIGH (all findings verified directly against the existing codebase; no external libraries needed)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-02 | Service code generation shares sequence with Projects (global counter per client/year) | Parallel query pattern: getDocs on both `projects` and `services` collections simultaneously with `Promise.all`, then compute max across both result sets before incrementing. Decision locked: acceptable race condition risk at current scale. |
</phase_requirements>

---

## Summary

Phase 27 is a focused utility-layer phase: add `generateServiceCode()` and `getAssignedServiceCodes()` to `app/utils.js`, following the exact patterns already established by `generateProjectCode()` and `getAssignedProjectCodes()`. No new UI, no new collections, no new Firebase features. The only non-trivial element is the cross-collection query in `generateServiceCode()` — it must query BOTH `projects` and `services` to find the global max sequence number for a given client/year, preventing collisions between the two code series.

The locked decision (from STATE.md) is the parallel query pattern: two simultaneous `getDocs` calls via `Promise.all`, then compute the max across both result sets. This is the simplest approach consistent with the existing `generateProjectCode()` implementation and accepts the known race condition risk (two concurrent creates hitting the same max). At the current scale (infrequent service creation, small team), this risk is deemed acceptable.

The `getAssignedServiceCodes()` function is a direct mirror of `getAssignedProjectCodes()`: reads `user.role`, checks for `services_user`, checks `all_services` flag, and returns the `assigned_service_codes` array or `null`. The users collection already has `assigned_service_codes` and `all_services` fields populated by the Phase 26 approval flow in `user-management.js` — no new Firestore schema changes are needed for Phase 27.

**Primary recommendation:** Copy `generateProjectCode()` and `getAssignedProjectCodes()` verbatim, modify the collection query to span both `projects` and `services`, and rename symbols from `project` to `service`. Register new functions on `window.utils` and `window` the same way existing functions are. One file modified: `app/utils.js`.

---

## Standard Stack

### Core (already in place — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore SDK v10.7.1 | CDN | `getDocs`, `collection`, `query`, `where` | Already imported in `app/firebase.js` and re-exported to all modules |
| Pure JavaScript ES6 modules | N/A | Utility function module | Zero-build architecture; no transpilation |

**Installation:** None. All dependencies are already installed.

---

## Architecture Patterns

### File Touchpoint: One File Only

```
C:/Users/Admin/Roaming/pr-po/
└── app/utils.js    # ADD: generateServiceCode() + getAssignedServiceCodes() + window registrations
```

No new files. `app/utils.js` already imports everything needed from `app/firebase.js`.

### Existing Import Line in utils.js (line 6)

```javascript
import { db, collection, getDocs, getDoc, updateDoc, doc, query, where, orderBy, limit, arrayUnion, arrayRemove } from './firebase.js';
```

All Firestore functions needed (`getDocs`, `collection`, `query`, `where`) are already imported. No import changes required.

---

### Pattern 1: generateProjectCode() — The Model to Mirror

**Source:** `app/utils.js` lines 192–226 (verified)

```javascript
export async function generateProjectCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();

        // Query projects for this client and year using range query
        const q = query(
            collection(db, 'projects'),
            where('client_code', '==', clientCode),
            where('project_code', '>=', `CLMC_${clientCode}_${currentYear}000`),
            where('project_code', '<=', `CLMC_${clientCode}_${currentYear}999`)
        );

        const snapshot = await getDocs(q);

        let maxNum = 0;
        snapshot.forEach(doc => {
            const code = doc.data().project_code;
            // Use regex to extract 3-digit number - handles client codes with underscores
            const match = code.match(/^CLMC_.+_\d{4}(\d{3})$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        });

        const newNum = maxNum + 1;
        return `CLMC_${clientCode}_${currentYear}${String(newNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}
```

**Key observations:**
- Queries `projects` collection only, filtered by `client_code` and code range
- Uses range query on `project_code` field to limit results to current year: `>= CLMC_${client}_${year}000` and `<= CLMC_${client}_${year}999`
- Uses regex `^CLMC_.+_\d{4}(\d{3})$` to parse the 3-digit sequence number — handles client codes with underscores in the name
- Output format: `CLMC_{clientCode}_{year}{###}` (e.g., `CLMC_ACME_2026001`)

### Pattern 2: generateServiceCode() — Parallel Query Across Both Collections

The locked decision is the **parallel query pattern**: query both `projects` and `services` with `Promise.all`, then compute max across both result sets.

The `services` collection stores `service_code` (field name analogous to `project_code`) and `client_code` (same field name as projects). This is confirmed by the test seeds in Phase 26:

```javascript
// From test/firestore.test.js (Phase 26-03)
await setDoc(doc(db, "services", "SVC-001"), {
    service_code: "SVC-001",
    service_name: "Test Service Alpha",
    status: "active"
});
```

However, Phase 26's test seeds used `service_code: "SVC-001"` format (not `CLMC_CLIENT_YYYY###`). The Phase 28 services creation flow will generate real `CLMC_CLIENT_YYYY###` format codes and store them as `service_code`. For `generateServiceCode()` to query correctly, services must store:
- `client_code` (same field name as projects — needed for range query filter)
- `service_code` (the generated code in `CLMC_{clientCode}_{year}{###}` format)

The `generateServiceCode()` function must query both collections for existing codes in the CLMC sequence for the given client/year, so neither projects nor services can accidentally reuse a number.

```javascript
// Pattern for generateServiceCode() — verified against existing patterns
export async function generateServiceCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();

        // Build the same range query structure for BOTH collections
        const rangeMin = `CLMC_${clientCode}_${currentYear}000`;
        const rangeMax = `CLMC_${clientCode}_${currentYear}999`;

        // Query BOTH projects and services in parallel
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(
                collection(db, 'projects'),
                where('client_code', '==', clientCode),
                where('project_code', '>=', rangeMin),
                where('project_code', '<=', rangeMax)
            )),
            getDocs(query(
                collection(db, 'services'),
                where('client_code', '==', clientCode),
                where('service_code', '>=', rangeMin),
                where('service_code', '<=', rangeMax)
            ))
        ]);

        // Compute max across both result sets using the same regex
        const codeRegex = /^CLMC_.+_\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(doc => {
            const code = doc.data().project_code;
            const match = code?.match(codeRegex);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        });

        servicesSnap.forEach(doc => {
            const code = doc.data().service_code;
            const match = code?.match(codeRegex);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        });

        return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Services] Error generating service code:', error);
        throw error;
    }
}
```

### Pattern 3: getAssignedProjectCodes() — The Model to Mirror

**Source:** `app/utils.js` lines 237–246 (verified)

```javascript
export function getAssignedProjectCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                           // Not logged in -- no filter
    if (user.role !== 'operations_user') return null; // Only operations_user is scoped

    if (user.all_projects === true) return null;      // "All projects" escape hatch

    // Return the array if present, otherwise empty array (zero assignments)
    return Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes : [];
}
```

**Key observations:**
- Synchronous — reads from `window.getCurrentUser()`, no Firestore call
- Returns `null` for "no filter applies" (all roles except scoped ones)
- Returns `[]` for "scoped but zero assignments" (empty — user sees nothing)
- Returns `string[]` for "scoped to specific codes"

### Pattern 4: getAssignedServiceCodes() — Direct Mirror

```javascript
export function getAssignedServiceCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                            // Not logged in -- no filter
    if (user.role !== 'services_user') return null;   // Only services_user is scoped

    if (user.all_services === true) return null;       // "All services" escape hatch

    // Return the array if present, otherwise empty array (zero assignments)
    return Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];
}
```

### Pattern 5: window Registration (REQUIRED)

Every utility function exported from `utils.js` is also registered on `window` for onclick handlers. The current registration block (lines 433–456):

```javascript
window.utils = {
    formatCurrency,
    formatDate,
    // ... all other functions ...
    getAssignedProjectCodes,
    // ...
};

window.getAssignedProjectCodes = getAssignedProjectCodes;
```

**Phase 27 additions required:**
```javascript
// Inside window.utils = { ... }:
generateServiceCode,
getAssignedServiceCodes,

// Standalone window registrations (after the window.utils block):
window.generateServiceCode = generateServiceCode;
window.getAssignedServiceCodes = getAssignedServiceCodes;
```

`generateProjectCode` is NOT currently in `window.utils` (it was added after the original window block). Check where `generateProjectCode` appears in the window block to confirm placement. The same location logic applies to `generateServiceCode`.

---

## Users Collection: Fields Already Exist

**CRITICAL FINDING:** Phase 26 (plan 26-02, user-management.js) already writes `assigned_service_codes` and `all_services` to user documents during approval and role-change flows.

From `app/views/user-management.js` (lines 729–734, verified):
```javascript
if (selectedRole === 'services_admin') {
    roleSpecificFields.all_services = true;
    roleSpecificFields.assigned_service_codes = [];
} else if (selectedRole === 'services_user') {
    roleSpecificFields.all_services = false;
    roleSpecificFields.assigned_service_codes = [];
}
```

This means the users collection schema already supports the Phase 27 Success Criterion 4 ("Users collection includes assigned_service_codes array and all_services boolean flag"). Phase 27 does NOT need to modify `user-management.js` or write any new user document logic. The fields exist; `getAssignedServiceCodes()` just reads them.

---

## Firestore Composite Index Consideration

The parallel query in `generateServiceCode()` uses range filters on `project_code` and `service_code` combined with equality filter on `client_code`. The existing `generateProjectCode()` already uses the same pattern on `projects` — if this query works without a composite index today (for projects), the equivalent query on `services` will work the same way.

**Verified:** `firestore.indexes.json` contains NO composite index for the projects or services collections. The only defined indexes are:
- `users`: `(status ASC, created_at DESC)`
- `pos`: `(project_name ASC)`
- `pos`: `(mrf_id ASC, date_issued ASC)`

This confirms `generateProjectCode()` operates as a collection scan (no composite index). The same approach works for `generateServiceCode()` on the services collection. **No composite index changes are needed for Phase 27.** The equality + range filter combination on a single document field (`project_code` / `service_code`) is handled by Firestore's automatic single-field indexes, which are always present by default.

---

## Race Condition Analysis (Locked Decision)

**Decision source:** STATE.md — "Phase 27: Parallel query pattern for shared sequence (acceptable race condition risk at current scale)"

**The race condition scenario:**
1. User A calls `generateServiceCode('ACME')` — reads max=5 from both collections
2. User B calls `generateProjectCode('ACME')` — also reads max=5
3. User A writes service with code `CLMC_ACME_2026006`
4. User B writes project with code `CLMC_ACME_2026006` — COLLISION

**Why it's acceptable:** Services admin and operations admin rarely create records simultaneously. The team is small. The window of vulnerability is the milliseconds between getDocs and addDoc. At current scale, this is a theoretical risk, not a practical one.

**Why NOT to use Firestore transactions:** A transaction would require reading and writing in a single atomic operation, but `generateServiceCode()` only READS — it doesn't write the service document (the calling code does). Making the caller responsible for a transaction would require refactoring every service creation callsite. The Phase 27 decision explicitly chose the simpler parallel-query approach.

**If the race condition becomes a concern in future phases:** Use a separate counter document (`counters/CLMC_${clientCode}_${currentYear}`) with `FieldValue.increment()` in a transaction. This is the standard Firestore pattern for collision-free sequential IDs. Flag this as a known future migration path in comments.

---

## Anti-Patterns to Avoid

- **Querying only services collection in generateServiceCode():** Would allow a service to get the same code as an existing project (e.g., `CLMC_ACME_2026003` exists as a project, and generateServiceCode() returns `CLMC_ACME_2026003` because it didn't look at projects). MUST query both collections.

- **Sequential queries instead of parallel:** Calling `getDocs(projectsQuery)` then `getDocs(servicesQuery)` sequentially doubles the latency unnecessarily. Use `Promise.all([...])` for parallel execution.

- **Using `generateSequentialId()` instead of a new function:** The existing `generateSequentialId(collectionName, prefix, year)` is a simpler pattern for `PREFIX-YEAR-###` IDs (e.g., `MRF-2026-001`). It queries ONE collection and uses a different ID format. It cannot be reused for the composite `CLMC_CLIENT_YYYY###` format that spans two collections.

- **Forgetting window registration:** Functions on `window.utils` are used by onclick handlers in HTML. Both new functions need to be added to `window.utils` AND registered as standalone `window.*` properties, matching the pattern for `window.getAssignedProjectCodes`.

- **Modifying user-management.js:** The `assigned_service_codes` and `all_services` fields are already written there from Phase 26. Phase 27 should not touch user-management.js.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel async queries | Custom Promise chaining | `Promise.all([getDocs(...), getDocs(...)])` | Native JS; already used in `procurement.js` line 2375 |
| Sequence number parsing | Custom string split | Regex `^CLMC_.+_\d{4}(\d{3})$` | Already in generateProjectCode(); handles client codes with underscores |
| Collision-free IDs | Firestore transaction counter | Not needed at current scale — parallel query is the locked decision | Over-engineering for current user count |

---

## Common Pitfalls

### Pitfall 1: services Collection Missing client_code Field
**What goes wrong:** The range query `where('client_code', '==', clientCode)` returns zero results from services, even when services exist for that client.
**Why it happens:** Phase 26 test seeds did NOT include a `client_code` field on service documents (they only seeded `service_code`, `service_name`, `status`). If Phase 28 creates services without `client_code`, the generateServiceCode() filter won't work.
**How to avoid:** Document that Phase 28's service creation code MUST store `client_code` on each service document (same as projects do). generateServiceCode() depends on this field. Add a comment in the function body as a reminder.
**Warning signs:** generateServiceCode() always returns `CLMC_${clientCode}_${currentYear}001` even when services exist for that client.

### Pitfall 2: Forgetting to Query Projects in generateServiceCode()
**What goes wrong:** A service gets a code that collides with an existing project.
**Why it happens:** Developer only queries the `services` collection, thinking "we only need to know what services exist."
**How to avoid:** The function name includes "Service" but the requirement (SERV-02) explicitly says "shares sequence with Projects." The projects query is mandatory.
**Warning signs:** `CLMC_ACME_2026003` exists in both `projects` and `services` collections.

### Pitfall 3: getAssignedServiceCodes() Checking Wrong Role
**What goes wrong:** `services_admin` gets an empty array instead of `null`, causing them to see no services in filtered views.
**Why it happens:** The role guard checks `user.role !== 'services_user'` — if a developer accidentally writes `services_admin` they'd get `null` (no filter), which is correct. But if they write `user.role === 'services_admin'` as the return-null condition instead, services_user would fall through and potentially return null too.
**How to avoid:** The guard condition is `if (user.role !== 'services_user') return null` — only `services_user` is scoped. `services_admin` falls into the `return null` (no filter) path, which is correct because services_admin sees all services.
**Warning signs:** services_admin sees no services in the services view.

### Pitfall 4: window.generateServiceCode Not Registered
**What goes wrong:** If Phase 28's service form HTML uses `onclick="window.generateServiceCode(...)"`, it fails with `TypeError`.
**Why it happens:** The function is exported from utils.js but not registered on window.
**How to avoid:** Register both `window.utils.generateServiceCode` and `window.generateServiceCode = generateServiceCode` in the window registration block at the bottom of utils.js.
**Warning signs:** `TypeError: window.generateServiceCode is not a function` in browser console.

### Pitfall 5: Composite Index Missing for services Collection Query
**RESOLVED — NOT A CONCERN FOR PHASE 27:** `firestore.indexes.json` has no composite index for projects (confirmed). The equality + range filter combination on `project_code` (and `service_code`) is handled by Firestore's automatic single-field indexes. generateProjectCode() already works in production without a composite index. generateServiceCode() will work the same way on the services collection. No composite index additions are needed.

---

## Code Examples

### Complete generateServiceCode() Function

```javascript
/**
 * Generate composite service code: CLMC_CLIENT_YYYY###
 * Shares sequence with Projects collection to prevent collisions.
 * Queries BOTH projects and services for the max sequence number.
 *
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number} year - Year for the code (defaults to current year)
 * @returns {Promise<string>} Generated service code (e.g., CLMC_ACME_2026003)
 *
 * Note: Race condition possible with simultaneous creates — acceptable at current scale.
 * IMPORTANT: Services documents MUST store client_code field for this query to work.
 */
export async function generateServiceCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC_${clientCode}_${currentYear}000`;
        const rangeMax = `CLMC_${clientCode}_${currentYear}999`;

        // Query BOTH collections in parallel (shared sequence, SERV-02)
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(
                collection(db, 'projects'),
                where('client_code', '==', clientCode),
                where('project_code', '>=', rangeMin),
                where('project_code', '<=', rangeMax)
            )),
            getDocs(query(
                collection(db, 'services'),
                where('client_code', '==', clientCode),
                where('service_code', '>=', rangeMin),
                where('service_code', '<=', rangeMax)
            ))
        ]);

        const codeRegex = /^CLMC_.+_\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(d => {
            const match = d.data().project_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        servicesSnap.forEach(d => {
            const match = d.data().service_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Services] Error generating service code:', error);
        throw error;
    }
}
```

### Complete getAssignedServiceCodes() Function

```javascript
/**
 * Get the set of service codes the current user is allowed to see.
 * Returns null if no filtering should be applied (all roles except services_user,
 * or services_user with all_services flag set).
 * Returns an array of service_code strings if the user is scoped to specific services.
 * Returns an empty array if the user is services_user with no assignments at all.
 *
 * @returns {string[]|null} Array of allowed service_codes, or null for "no filter"
 */
export function getAssignedServiceCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                           // Not logged in -- no filter
    if (user.role !== 'services_user') return null;  // Only services_user is scoped

    if (user.all_services === true) return null;      // "All services" escape hatch

    // Return the array if present, otherwise empty array (zero assignments)
    return Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];
}
```

### window Registration Block Addition (bottom of utils.js)

```javascript
// Add inside window.utils = { ... } block:
generateServiceCode,
getAssignedServiceCodes,

// Add after window.utils block (matching window.getAssignedProjectCodes pattern):
window.generateServiceCode = generateServiceCode;
window.getAssignedServiceCodes = getAssignedServiceCodes;
```

---

## Success Criteria Mapping

From the ROADMAP.md Phase 27 success criteria:

| # | Criterion | Implementation |
|---|-----------|----------------|
| 1 | generateServiceCode() queries both projects and services collections for max sequence number | Parallel query with Promise.all in generateServiceCode() |
| 2 | Creating a service immediately after a project increments the shared sequence correctly | The parallel query reads current max from both collections before incrementing |
| 3 | getAssignedServiceCodes() utility returns services_user's assigned service codes | getAssignedServiceCodes() mirrors getAssignedProjectCodes() exactly |
| 4 | Users collection includes assigned_service_codes array and all_services boolean flag | Already implemented in Phase 26 (user-management.js approval and role-change flows) |

Success Criterion 4 is already satisfied by Phase 26. Phase 27 adds the utility functions that READ these fields.

---

## Scope Boundary (What Phase 27 Does NOT Do)

- Does NOT build any Services UI (that is Phase 28)
- Does NOT create any service documents in Firestore (no test data, no seeding)
- Does NOT add `generateServiceCode` to any form submission handler (Phase 28 calls it)
- Does NOT add or modify any Firestore Security Rules
- Does NOT add composite indexes unless the projects query already requires one (check firestore.indexes.json)
- Does NOT add tests for generateServiceCode() — no test infrastructure for unit testing utils.js exists in this codebase (tests are Firestore Security Rules tests via emulator, not unit tests)

---

## Open Questions

1. **Does firestore.indexes.json have a composite index for the projects range query?**
   - RESOLVED: `firestore.indexes.json` has NO composite index for projects or services. generateProjectCode() runs as a collection scan. generateServiceCode() will do the same. No index changes needed.

2. **Should generateServiceCode() be exported AND registered on window like generateProjectCode()?**
   - What we know: `generateProjectCode` is exported but does NOT appear in the `window.utils` block (it was added later). It is not registered as `window.generateProjectCode` individually either.
   - What's unclear: Whether generateServiceCode() needs window registration at all, given it will only be called by Phase 28's service creation code (a module function, not an onclick handler).
   - Recommendation: Register it consistently with the pattern: add to `window.utils` and add `window.generateServiceCode = generateServiceCode`. Phase 28 might call it from onclick handlers for service form submission. Better to be consistent now than add window registration later.

3. **What is the exact format of service_code in the services collection?**
   - What we know: Phase 26 test seeds used `service_code: "SVC-001"` format (simple test IDs). Phase 28 will create real services with `CLMC_CLIENT_YYYY###` format codes via `generateServiceCode()`.
   - What's unclear: Whether any `SVC-` prefixed codes exist in production that would interfere with the range query.
   - Recommendation: The range query (`>= CLMC_...000`, `<= CLMC_...999`) is prefix-specific — it will only match `CLMC_*` format codes. `SVC-001` style codes will not match the range filter. No concern about production test data interfering with the query.

---

## Sources

### Primary (HIGH confidence)

- **`app/utils.js` (verified line-by-line)** — `generateProjectCode()` at lines 192–226 (exact model for generateServiceCode); `getAssignedProjectCodes()` at lines 237–246 (exact model for getAssignedServiceCodes); window registration block at lines 433–456 (registration pattern confirmed)
- **`app/views/user-management.js` (verified lines 726–741 and 1413–1428)** — confirms `assigned_service_codes` and `all_services` are already written to user documents during approval and role-change flows (Phase 26 complete)
- **`app/firebase.js` (verified)** — all needed Firestore functions (`getDocs`, `collection`, `query`, `where`) are already exported; `Promise.all` is native JS, no import needed
- **`app/views/projects.js` (verified lines 646–665)** — confirms `client_code` is stored on project documents; range query result feeds into `addDoc` call
- **`firestore.rules` (verified)** — confirms `services` collection exists with `service_code` field referenced in Security Rules `isAssignedToService()` helper (line 54: `serviceCode in getUserData().assigned_service_codes`)
- **`.planning/STATE.md` (verified)** — locked decision: "Phase 27: Parallel query pattern for shared sequence (acceptable race condition risk at current scale)"
- **`.planning/REQUIREMENTS.md` (verified)** — SERV-02: "Service code generation shares sequence with Projects (global counter per client/year)"
- **`test/firestore.test.js` Phase 26 seeds (verified)** — services test documents seed with `service_code`, `service_name`, `status` fields (Phase 26-03-PLAN.md); confirms `client_code` is NOT in Phase 26 seeds (Pitfall 1)

---

## Metadata

**Confidence breakdown:**
- generateServiceCode() implementation: HIGH — exact model exists in generateProjectCode(); parallel query pattern confirmed in codebase (procurement.js line 2375)
- getAssignedServiceCodes() implementation: HIGH — exact model exists in getAssignedProjectCodes()
- Users collection schema: HIGH — Phase 26 user-management.js writes confirmed
- window registration: HIGH — pattern confirmed in utils.js
- Composite index risk: MEDIUM — requires checking firestore.indexes.json (not yet read)

**Research date:** 2026-02-18
**Valid until:** 2026-03-20 (stable domain — all patterns are mature and won't change)
