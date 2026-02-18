# Phase 31: Dashboard Integration - Research

**Researched:** 2026-02-18
**Domain:** Pure JS SPA — home.js view extension with role-aware Firebase Firestore real-time listeners
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stats layout & presentation**
- Add new Services stats to the **same row** as existing stats (extend `.quick-stats`)
- All stat items look **identical** — no color or badge difference between departments
- Services adds **2 new stat items**: Active Services count + Services-linked MRFs count
- "Active Services" = services documents where `active === true`
- "Services MRFs" = MRFs where `department === 'services'` AND `status === 'Pending'` (mirrors existing Active MRFs logic exactly)

**Role-aware visibility**
- `operations_admin` + `operations_user` → see Projects stats only (existing 3 stats, now filtered to Projects MRFs)
- `services_admin` + `services_user` → see Services stats only (Active Services + Services MRFs)
- `super_admin`, `finance`, `procurement` → see both departments' stats
- Existing stats are **also filtered by department** for single-department roles (operations roles see Projects MRFs only, not all MRFs)
- Labels for single-department roles remain unchanged ("Active MRFs", not "Projects MRFs")
- For dual-department viewers: stats are **grouped with small department labels** ("Projects" above the first group, "Services" above the second group) within the same stats bar

**MRF status breakdown detail**
- "Services MRFs" stat = single number in the stat card (no expanded breakdown)
- Count logic: `department === 'services'` AND `status === 'Pending'`

**Navigation cards**
- Navigation cards (MRF, Procurement, Finance) remain unchanged for all roles

### Claude's Discretion
- Exact HTML/CSS for the small department group labels (for dual-dept viewers)
- How to pass role context to home.js (use existing getCurrentUser() / getRole() patterns)
- Listener management for the new stats queries

### Deferred Ideas (OUT OF SCOPE)
- **Department breakdown chart (DASH-03)** — CSS two-bar visualization of Projects vs Services work distribution. Not in scope for this plan.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Dashboard shows Services department statistics (active services count) | Firestore query: `collection(db, 'services')` + client-side `.filter(s => s.active === true).length`; onSnapshot listener pattern identical to existing MRF listener |
| DASH-02 | Dashboard shows Services-linked MRFs count | Firestore query: `query(collection(db, 'mrfs'), where('department', '==', 'services'), where('status', '==', 'Pending'))`; mirrors existing Active MRFs listener exactly |
</phase_requirements>

---

## Summary

Phase 31 extends `app/views/home.js` — a 163-line module — to add role-aware Services statistics to the existing stats bar. The module already has a clean listener-array pattern and `updateStatDisplay()` helper that can be directly reused. No new files are needed; no routing changes are required.

The only non-trivial work is the role branching logic in `render()` and `loadStats()`. Three visibility modes must be produced: Projects-only (operations roles), Services-only (services roles), and both-departments (super_admin, finance, procurement). For the both-departments mode a visual department grouping label must appear within `.quick-stats`. All stat items are styled identically; only the grouping labels are new CSS.

The existing `window.getCurrentUser()` function (exposed by `app/auth.js`) provides the role value at call time. Because home.js `init()` runs after auth resolves, the user object is always populated when `loadStats()` is called.

**Primary recommendation:** Extend home.js in place — add role detection in `init()`, branch `loadStats()` to register only the appropriate Firestore listeners, and build the stat HTML in `render()` from a helper that accepts a visibility mode. Keep the three cases (projects-only, services-only, both) as explicit branches rather than computed arrays.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10 | 10.7.1 (CDN) | Real-time listeners for `mrfs` and `services` collections | Already in use; `onSnapshot`, `where` already imported in `firebase.js` |
| Pure JS ES6 modules | N/A | View logic, role detection, DOM update | Project constraint — no build system |

### Supporting

None needed. All required APIs are already imported in `app/firebase.js` and re-exported:
- `onSnapshot`, `collection`, `query`, `where` — already available
- `window.getCurrentUser()` — already exposed by `app/auth.js`

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.getCurrentUser()` call inside `init()` | Passing role as parameter from router | Router currently calls `init()` with no arguments for home; changing signature requires router edit — avoid |
| Client-side `.filter()` for active services count | `where('active', '==', true)` Firestore query | Both are valid. `where` query saves a tiny bit of bandwidth but requires composite index if combined with other conditions. Client-side filter on the full `services` snapshot avoids the index requirement and is fine at current scale. Use `where('active', '==', true)` since it matches how the requirement is stated and Firestore handles it without a composite index (single-field query). |

---

## Architecture Patterns

### Recommended Structure

No new files needed. All changes are inside:
```
app/views/home.js      # Main change — role detection, listeners, render
styles/hero.css        # Minor addition — .stat-group-label styling
```

### Pattern 1: Role Detection at init() Time

**What:** Read `window.getCurrentUser()?.role` once inside `init()` (after auth resolves), derive a visibility mode, pass mode to `loadStats()`.

**When to use:** Always — home.js is only rendered for authenticated users; the user object is guaranteed to be populated at `init()` time.

```javascript
// Source: existing pattern in app/auth.js (getCurrentUser) + app/views/services.js (role check)
export async function init() {
    const user = window.getCurrentUser?.();
    const role = user?.role || '';

    const PROJECTS_ONLY = ['operations_admin', 'operations_user'];
    const SERVICES_ONLY = ['services_admin', 'services_user'];

    let mode;
    if (PROJECTS_ONLY.includes(role)) {
        mode = 'projects';
    } else if (SERVICES_ONLY.includes(role)) {
        mode = 'services';
    } else {
        mode = 'both'; // super_admin, finance, procurement, any unrecognized role
    }

    loadStats(mode);
}
```

**Confidence:** HIGH — mirrors exact pattern used in `app/views/mrf-form.js` lines 253–256 and `app/views/services.js` line 100.

### Pattern 2: Listener Registration Branching

**What:** `loadStats(mode)` registers only the listeners required for the mode. Projects-mode: 3 existing listeners with MRF filter. Services-mode: 2 new listeners. Both-mode: all 5.

```javascript
// Source: existing home.js loadStats() pattern — extend, do not replace
function loadStats(mode) {
    if (mode === 'projects' || mode === 'both') {
        // Active MRFs (Projects dept only — filter client-side OR use where clause)
        const mrfListener = onSnapshot(
            query(collection(db, 'mrfs'),
                  where('status', '==', 'Pending'),
                  where('department', '==', 'projects')),   // NEW filter
            (snapshot) => {
                stats.activeMRFs = snapshot.size;
                updateStatDisplay('stat-mrfs', stats.activeMRFs);
            }
        );
        statsListeners.push(mrfListener);

        // Pending PRs and Active POs are NOT department-filtered per current schema
        // (decision: these stats show cross-department counts for operations roles)
        // NOTE: Re-read decisions — PRs/POs do not have explicit filtering in the decisions.
        // The decisions only specify MRF count filtering. PRs and POs remain unfiltered.
        // ...existing PR and PO listeners unchanged...
    }

    if (mode === 'services' || mode === 'both') {
        // Active Services (active === true)
        const servicesListener = onSnapshot(
            query(collection(db, 'services'), where('active', '==', true)),
            (snapshot) => {
                stats.activeServices = snapshot.size;
                updateStatDisplay('stat-services', stats.activeServices);
            }
        );
        statsListeners.push(servicesListener);

        // Services MRFs (department === 'services' AND status === 'Pending')
        const servicesMRFListener = onSnapshot(
            query(collection(db, 'mrfs'),
                  where('department', '==', 'services'),
                  where('status', '==', 'Pending')),
            (snapshot) => {
                stats.servicesMRFs = snapshot.size;
                updateStatDisplay('stat-services-mrfs', stats.servicesMRFs);
            }
        );
        statsListeners.push(servicesMRFListener);
    }
}
```

**Confidence:** HIGH — `where('active', '==', true)` is a single-field equality query, no composite index required. `where('department', '==', 'services') + where('status', '==', 'Pending')` requires a composite index in Firestore. See Pitfall 1 below.

### Pattern 3: Render HTML by Mode

**What:** `render()` generates different HTML based on mode. For 'both' mode, insert department group labels inside `.quick-stats`.

**Note:** `render()` is called before `init()`. Role must be read in `render()` directly, not passed from `init()`, since `init()` runs after render.

```javascript
// Source: pattern from app/views/services.js render() — reads window.getCurrentUser() directly
export function render() {
    const user = window.getCurrentUser?.();
    const role = user?.role || '';

    const isProjectsOnly = ['operations_admin', 'operations_user'].includes(role);
    const isServicesOnly = ['services_admin', 'services_user'].includes(role);
    const isBoth = !isProjectsOnly && !isServicesOnly;

    // Build stats HTML based on mode
    let statsHtml = '';
    if (isBoth) {
        statsHtml = `
            <div class="stat-group-label">Projects</div>
            ${projectsStatsHtml()}
            <div class="stat-group-divider"></div>
            <div class="stat-group-label">Services</div>
            ${servicesStatsHtml()}
        `;
    } else if (isProjectsOnly) {
        statsHtml = projectsStatsHtml();
    } else {
        statsHtml = servicesStatsHtml();
    }

    return `
        <div class="hero-section">
            ...navigation cards (unchanged)...
            <div class="quick-stats">
                ${statsHtml}
            </div>
        </div>
    `;
}
```

**Confidence:** HIGH — `render()` reading `window.getCurrentUser()` is the established pattern (services.js line 99).

### Pattern 4: State Object Extension

**What:** Add new stats keys to the module-level `stats` object. Reset in `destroy()`.

```javascript
// Before (existing):
let stats = {
    activeMRFs: 0,
    pendingPRs: 0,
    activePOs: 0
};

// After:
let stats = {
    activeMRFs: 0,
    pendingPRs: 0,
    activePOs: 0,
    activeServices: 0,  // NEW
    servicesMRFs: 0     // NEW
};

// destroy() reset must also zero the new keys:
stats = {
    activeMRFs: 0,
    pendingPRs: 0,
    activePOs: 0,
    activeServices: 0,
    servicesMRFs: 0
};
```

### Pattern 5: Department Group Labels (Discretionary CSS)

**What:** For the 'both' mode, small department labels appear inside `.quick-stats` to visually group the stat items. The `.quick-stats` container is `display: flex; gap: 3rem; flex-wrap: wrap`. Group labels can be achieved with a full-width flex break + label, or by wrapping each group in a `div`.

**Recommended approach:** Wrapper `<div class="stat-group">` around each group, with a small `<span class="stat-group-label">` above the stat items inside the group. This avoids modifying the flex layout of `.quick-stats` and is the most readable.

```html
<!-- Both-mode layout inside .quick-stats -->
<div class="stat-group">
    <span class="stat-group-label">Projects</span>
    <div class="stat-group-items">
        <!-- existing 3 stat-items -->
    </div>
</div>
<div class="stat-group-divider"></div>
<div class="stat-group">
    <span class="stat-group-label">Services</span>
    <div class="stat-group-items">
        <!-- 2 new stat-items -->
    </div>
</div>
```

```css
/* Add to hero.css */
.stat-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
}

.stat-group-items {
    display: flex;
    gap: 3rem;
}

.stat-group-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gray-600);
    margin-bottom: 0.25rem;
}

.stat-group-divider {
    width: 1px;
    background: var(--gray-200);
    align-self: stretch;
    margin: 0.5rem 1rem;
}
```

**Confidence:** MEDIUM — approach is standard flex layout. The exact pixel values may need minor visual adjustment during implementation, but the structure is sound.

### Anti-Patterns to Avoid

- **Computing mode in `render()` and `init()` separately without sharing:** Keep the role-detection logic in a small inline helper `getDashboardMode()` used in both `render()` and `init()` to avoid duplication and divergence.
- **Using separate boolean flags for each role:** Use a `mode` string ('projects', 'services', 'both') — cleaner and extensible.
- **Registering listeners unconditionally then filtering in snapshot callback:** Wastes Firestore reads. Branch listener registration at `loadStats()` time instead.
- **Resetting `stats` object to old shape in destroy():** If new keys are missing from the reset, stale values can bleed into the next view load.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Active services count | Manual getDocs + count | `onSnapshot` with `where('active', '==', true)` | Real-time updates; pattern already used everywhere |
| Role detection | Re-implementing role lookup | `window.getCurrentUser()?.role` | Auth module already exposes this; consistent with all other views |
| Stat display update | Direct innerHTML set | `updateStatDisplay(elementId, value)` (already in home.js) | Reuse existing helper; handles element-missing guard |

---

## Common Pitfalls

### Pitfall 1: Missing Composite Firestore Index
**What goes wrong:** `query(collection(db, 'mrfs'), where('department', '==', 'services'), where('status', '==', 'Pending'))` throws a Firestore index error at runtime: "The query requires an index."
**Why it happens:** Firestore requires a composite index when filtering on two different fields simultaneously.
**How to avoid:** Check whether this index already exists (it was likely created in Phase 29/30 when similar queries were written for finance.js and procurement.js). If not, create it before deployment. The index is: collection `mrfs`, fields `department ASC, status ASC`.
**Warning signs:** Console error containing "requires an index" with a direct link to create it in Firebase console.

**Verification:** Check if the existing finance.js or procurement.js code already uses `where('department', ...)` combined with `where('status', ...)` on `mrfs`. If it does and is working, the index exists.

**Finding:** The finance.js view uses `activeDeptFilter` as a client-side filter applied AFTER the snapshot arrives — it does NOT use a composite Firestore query on both fields simultaneously. This means the composite index for `mrfs` on `(department, status)` may NOT exist yet. The planner must account for this — either use client-side filtering (safe, no index needed) or create the index.

**Recommended safe approach for DASH-02:** Use `onSnapshot(query(collection(db, 'mrfs'), where('status', '==', 'Pending')))` (the existing listener already does this) and count client-side by filtering `snapshot.docs` where `doc.department === 'services'`. This avoids the composite index requirement entirely and reuses the existing MRF listener.

### Pitfall 2: render() Called Before auth Resolves (Edge Case)
**What goes wrong:** `window.getCurrentUser()` returns `null` in `render()` if the user navigates to `/` before auth state is determined (e.g., on hard reload).
**Why it happens:** `initAuthObserver()` is async. The router may call `render()` before the auth state resolves.
**How to avoid:** The existing router handles this via `handleInitialRoute()` which defers routing until auth state is known. In practice, home.js is gated by auth — unauthenticated users are redirected to login. But `render()` should default to 'projects' mode (or render all stats hidden) if role is unknown, rather than throwing.
**Warning signs:** Dashboard rendered with wrong stats for ~500ms after hard reload.

**Mitigation:** `render()` should default to showing stats for all departments ('both' mode) when role is unknown — safe fallback since no data is shown until `init()` runs listeners. Or show no stats at all and let `init()` populate them.

### Pitfall 3: Active Services Query Matches Inactive Services on Legacy Docs
**What goes wrong:** Services documents created before the `active` boolean field was introduced may be missing the field entirely, causing `where('active', '==', true)` to exclude them even if they are conceptually active.
**Why it happens:** Firestore is schemaless; documents without the field are not matched by equality queries.
**How to avoid:** Look at when the `active` field was introduced. Based on `services.js` line 710, `active: true` is set on new services at creation time. If old services lack the field, the query will miss them. Client-side filter using `s.active !== false` (truthy check) is safer if legacy docs exist.
**Recommendation:** Use `onSnapshot(collection(db, 'services'))` without the `where` clause, then count `snapshot.docs.filter(d => d.data().active !== false).length` client-side. This safely handles both `active: true` docs and legacy docs without the field (treated as active by default). This also avoids a potential index issue.

### Pitfall 4: Listener Leak if init() Called Multiple Times
**What goes wrong:** If `init()` is called more than once without `destroy()` (e.g., navigating home → home), listeners accumulate.
**Why it happens:** Router only calls `destroy()` when leaving the view, not on revisit.
**How to avoid:** The existing pattern guards against this — `destroy()` zeroes `statsListeners` array. Ensure new listeners are also added to `statsListeners`. This pitfall is already handled by the existing code; just maintain the pattern.

### Pitfall 5: MRF Filter for Operations Roles — Department Field Missing on Legacy MRFs
**What goes wrong:** When filtering `activeMRFs` to Projects-only for operations roles using `where('department', '==', 'projects')`, legacy MRFs without a `department` field are excluded from the count.
**Why it happens:** Pre-Phase 29 MRFs do not have the `department` field.
**How to avoid:** Use a client-side filter instead: `snapshot.docs.filter(d => (d.data().department || 'projects') === 'projects').length`. This applies the legacy-doc fallback pattern from Phase 30 (`(pr.department || 'projects')`).
**Warning signs:** Operations roles see fewer "Active MRFs" than expected because legacy MRFs are missing.

---

## Code Examples

### Example 1: Stats HTML for Single-Department Roles (Projects Mode)

```javascript
// Identical to current render() output — no changes needed for single-dept roles
// The existing IDs (stat-mrfs, stat-prs, stat-pos) are retained
function projectsStatsHtml() {
    return `
        <div class="stat-item">
            <span class="stat-label">Active MRFs</span>
            <span class="stat-value" id="stat-mrfs">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Pending PRs</span>
            <span class="stat-value" id="stat-prs">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Active POs</span>
            <span class="stat-value" id="stat-pos">0</span>
        </div>
    `;
}
```

### Example 2: Stats HTML for Services-Only Roles

```javascript
function servicesStatsHtml() {
    return `
        <div class="stat-item">
            <span class="stat-label">Active Services</span>
            <span class="stat-value" id="stat-services">0</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Active MRFs</span>
            <span class="stat-value" id="stat-services-mrfs">0</span>
        </div>
    `;
}
// Note: label stays "Active MRFs" (not "Services MRFs") per locked decision
```

### Example 3: getDashboardMode() Helper

```javascript
// Shared between render() and init() to avoid duplication
function getDashboardMode() {
    const role = window.getCurrentUser?.()?.role || '';
    if (['operations_admin', 'operations_user'].includes(role)) return 'projects';
    if (['services_admin', 'services_user'].includes(role)) return 'services';
    return 'both'; // super_admin, finance, procurement, unknown
}
```

### Example 4: Active Services Listener (Client-Side Filter — Index-Safe)

```javascript
// Source: existing home.js loadStats() pattern + services.js loadServices() pattern
const servicesListener = onSnapshot(
    collection(db, 'services'),
    (snapshot) => {
        // Use active !== false to handle legacy docs without the field
        stats.activeServices = snapshot.docs.filter(d => d.data().active !== false).length;
        updateStatDisplay('stat-services', stats.activeServices);
    },
    (error) => {
        console.error('[Home] Error loading services stats:', error);
    }
);
statsListeners.push(servicesListener);
```

### Example 5: Services MRFs Listener (Client-Side Filter — Avoids Composite Index)

```javascript
// Reuse the existing pending MRF listener and split counts client-side
// OR register a separate listener filtered to Pending only, then count by department
const servicesMRFListener = onSnapshot(
    query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
    (snapshot) => {
        // Count services MRFs with legacy fallback: docs without department are treated as 'projects'
        stats.servicesMRFs = snapshot.docs.filter(d =>
            d.data().department === 'services'
        ).length;
        updateStatDisplay('stat-services-mrfs', stats.servicesMRFs);
    },
    (error) => {
        console.error('[Home] Error loading services MRF stats:', error);
    }
);
statsListeners.push(servicesMRFListener);
```

**Note on listener sharing:** In 'projects' mode, the MRF listener counts all pending MRFs and applies `(d.department || 'projects') === 'projects'` client-side. In 'services' mode, the MRF listener counts only `department === 'services'`. In 'both' mode, one listener can drive two stat values simultaneously. However, keeping two separate listeners (one for projects count, one for services count) is simpler and matches the single-responsibility pattern of existing listeners.

### Example 6: Existing MRF Listener Modification for Projects-Only Roles

```javascript
// In 'projects' mode, filter the snapshot client-side to respect dept field
// Uses (department || 'projects') fallback for legacy docs without the field
const mrfListener = onSnapshot(
    query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
    (snapshot) => {
        stats.activeMRFs = snapshot.docs.filter(d =>
            (d.data().department || 'projects') === 'projects'
        ).length;
        updateStatDisplay('stat-mrfs', stats.activeMRFs);
    },
    (error) => {
        console.error('[Home] Error loading MRF stats:', error);
    }
);
statsListeners.push(mrfListener);
```

### Example 7: Full render() Structure (Both Mode)

```javascript
export function render() {
    const mode = getDashboardMode();
    const isBoth = mode === 'both';
    const isProjects = mode === 'projects';
    const isServices = mode === 'services';

    let statsContent = '';

    if (isBoth) {
        statsContent = `
            <div class="stat-group">
                <span class="stat-group-label">Projects</span>
                <div class="stat-group-items">
                    ${projectsStatsHtml()}
                </div>
            </div>
            <div class="stat-group-divider"></div>
            <div class="stat-group">
                <span class="stat-group-label">Services</span>
                <div class="stat-group-items">
                    ${servicesStatsHtml()}
                </div>
            </div>
        `;
    } else if (isProjects) {
        statsContent = projectsStatsHtml();
    } else {
        statsContent = servicesStatsHtml();
    }

    return `
        <div class="hero-section">
            <h1 class="hero-title">🏗️ CLMC Engineering</h1>
            <p class="hero-subtitle">Procurement Management System</p>
            <div class="navigation-cards">
                <!-- cards unchanged -->
            </div>
            <div class="quick-stats">
                ${statsContent}
            </div>
        </div>
    `;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-dept stats (all roles see same 3 stats) | Role-aware stats with dept isolation | Phase 31 (this phase) | Operations roles see only Projects stats; Services roles see only Services stats |
| Unfiltered activeMRFs (all pending MRFs) | Dept-filtered activeMRFs for single-dept roles | Phase 31 (this phase) | Accurate per-dept count; legacy docs without `department` treated as 'projects' |

**Deprecated/outdated in this phase:**
- The existing `loadStats()` function (no mode parameter) will be replaced by a mode-aware version

---

## Open Questions

1. **Do PR and PO stats need department filtering for single-dept roles?**
   - What we know: The locked decisions specify filtering for "Active MRFs" count per department. PRs and POs are not mentioned in the filtering decisions.
   - What's unclear: Should operations roles see all pending PRs (including Services PRs) or only Projects PRs? The CONTEXT.md decisions section only specifies MRF count filtering.
   - Recommendation: Follow the locked decision literally — only filter the MRF stat. Leave PR and PO stats unfiltered for all roles. If the user wants PR/PO filtering, that is a separate decision that was not made.

2. **Should `mode` be stored as module-level state for use in stat callbacks?**
   - What we know: `loadStats(mode)` branches at call time. The mode value is captured in the closure of each listener callback.
   - What's unclear: If the user's role changes while on the dashboard (real-time role update), the stats will not rerender to match the new mode.
   - Recommendation: Store mode as a module-level variable. Listen to the `permissionsChanged` or `authStateChanged` events in home.js `init()` and re-run `destroy()` + `init()` if role changes. This mirrors how other views handle real-time permission changes.

3. **Will the `quick-stats` max-width (currently `900px`) accommodate 5 stat items in 'both' mode?**
   - What we know: Current CSS: `.quick-stats { max-width: 900px; gap: 3rem; }` with 3 stat items.
   - What's unclear: 5 stat items + group labels + divider may exceed 900px at standard sizing.
   - Recommendation: Widen max-width to `1200px` for the both-mode case, or allow flex-wrap to handle overflow. The planner should handle this as a CSS discretionary task.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `app/views/home.js` — full module read; confirmed listener pattern, stat state, destroy() cleanup
- Direct code inspection: `app/auth.js` — confirmed `getCurrentUser()` is exported and window-exposed
- Direct code inspection: `app/views/services.js` — confirmed `active` boolean field (`active: true` at line 710); `onSnapshot(collection(db, 'services'))` pattern at line 869
- Direct code inspection: `app/views/finance.js` — confirmed `getDeptBadgeHTML()`, `getMRFLabel()`, `(pr.department || 'projects')` client-side fallback pattern; confirmed NO composite index is used for dept+status queries (client-side filter only)
- Direct code inspection: `app/utils.js` — confirmed `getAssignedProjectCodes()` and `getAssignedServiceCodes()` role detection patterns
- Direct code inspection: `styles/hero.css` — confirmed `.quick-stats`, `.stat-item`, `.stat-label`, `.stat-value` CSS; `max-width: 900px` constraint
- Direct code inspection: `app/views/mrf-form.js` lines 253–256 — confirmed role array pattern for dept visibility
- Direct code inspection: `app/seed-roles.js` — confirmed role IDs: `super_admin`, `operations_admin`, `operations_user`, `services_admin`, `services_user`, `finance`, `procurement`
- Direct code inspection: `.planning/REQUIREMENTS.md` — confirmed DASH-01, DASH-02, DASH-03 requirements; DASH-03 is deferred

### Secondary (MEDIUM confidence)
- Firebase Firestore single-field equality queries do not require composite indexes — verified by standard Firebase documentation behavior; the `where('active', '==', true)` query on `services` is safe without a composite index

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all imports already available
- Architecture: HIGH — patterns are directly lifted from existing working code in the same repo
- Pitfalls: HIGH — all pitfalls identified from direct code analysis of existing queries and data patterns (legacy MRF docs without department field, active field on services, etc.)

**Research date:** 2026-02-18
**Valid until:** Stable — no external dependencies; valid as long as home.js and services.js schema remain unchanged
