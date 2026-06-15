# Phase 39: Admin Assignments Overhaul, Badge Styling Improvements, and Project Code Uniqueness Fix - Research

**Researched:** 2026-02-24
**Domain:** Vanilla JS SPA UI/UX refactoring — admin UI consolidation, CSS badge standardization, Firestore code generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Admin Assignments Overhaul:**
- Unified single tab: Merge all separate assignment tabs (project assignments, service assignments) into one "Assignments" tab
- Toggle sub-tabs: [Projects] and [Services] toggle tabs at the top of the unified Assignments tab switch the table content
- Table layout: Users listed in a table with columns: Name, Role, Assignment Count, Actions ([Manage] button)
- Manage modal: Clicking [Manage] opens a modal with a searchable list of all projects (or services). Checkboxes to assign/unassign. [Save] and [Cancel] buttons
- Remove "All Projects" auto-assign: No more "All Projects (includes future projects automatically)" checkbox. Only explicit assignments — new projects must be manually assigned
- Saves on modal Save: Changes apply when user clicks Save in the modal (not auto-save on checkbox toggle)

**Badge Styling Improvements:**
- Remove redundant PR status badges from MRF History PR columns — instead, style the PR code itself as a badge (colored background + text, same visual style as current badges, but the badge IS the code)
- Color tells the status: No tooltip or extra text needed — the color alone communicates status
- Standardized color mapping across ALL views globally:
  - Orange/amber = Pending states
  - Green = Approved/Complete/Delivered states
  - Red = Rejected/Failed states
  - Blue = In-progress states (Procuring, etc.)
- Apply uniformly: Sweep every table across Home, Procurement, Finance, Projects, Services — all status badges use the unified color scheme
- Department badges unchanged: Projects/Services department badges stay as-is
- Exact shades: Claude picks consistent shades that work with the existing CSS design system

**Project Code Uniqueness Fix:**
- Fix the generator, not the UI: Code generation must query BOTH projects and services collections when calculating the next sequence number — prevents collisions at the source
- Shared sequence, collision-safe: Keep the shared CLMC_CLIENT_YYYY### sequence. Generator uses Promise.all to query both collections and find the true max across both
- No user-facing error needed: Since codes are auto-generated, the fix ensures duplicates never happen. No validation dialogs or error messages required
- Forward-looking only: Don't audit or fix existing data — just prevent future collisions
- No security rule enforcement: Fix the generation logic only — no Firestore security rules for uniqueness

### Claude's Discretion
- Exact orange/green/red/blue hex values (must be cohesive with existing CSS variables)
- Table pagination for the user list in Assignments tab
- Modal search/filter implementation details
- How to handle the "All Projects" flag removal for users who currently have it set

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 39 is a three-part UX and correctness improvement with no new Firestore collections or Firebase rule changes. Each part is discrete and can be planned independently.

**Part 1 (Admin Assignments Overhaul)** replaces two bloated per-user checkbox pages (`project-assignments.js` and `service-assignments.js`) with a single compact `assignments.js` module that renders a users table and manages assignments via a per-user modal. The `admin.js` wrapper currently loads these as separate sections (`assignments` and `service_assignments`). The new approach merges them into a single section with Projects/Services sub-tabs.

**Part 2 (Badge Styling)** standardizes the four distinct badge states (Pending=orange, Approved/Delivered/Green=green, Rejected=red, Procuring=blue) across every view. The current system is partially standardized through `getStatusClass()` in `utils.js` and `createStatusBadge()` in `components.js`, but many places in `procurement.js` and `finance.js` use ad-hoc inline styles instead of the CSS class system. The MRF History PR column needs a specific redesign: remove the stacked `<a href> + <span badge>` pattern and replace it with the PR code itself styled as a badge anchor.

**Part 3 (Project Code Fix)** is a one-function fix: `generateProjectCode()` in `app/utils.js` currently only queries the `projects` collection. It must be updated to also query `services` using `Promise.all`, identical to how `generateServiceCode()` already works (Phase 27 pattern).

**Primary recommendation:** Plan as three sequential tasks in a single wave. Part 3 is the smallest and most isolated — do it first. Part 2 (badge sweep) is a multi-file CSS/HTML audit. Part 1 (assignments overhaul) requires the most new code and replaces two files.

---

## Standard Stack

### Core
| Component | Details | Purpose |
|-----------|---------|---------|
| Vanilla JS ES6 modules | No framework | All UI logic |
| Firebase Firestore v10.7.1 | CDN | Data persistence |
| CSS custom properties | `styles/main.css` | Color tokens |
| `onSnapshot` listeners | `app/firebase.js` | Real-time user/project/service data |

### No New Dependencies
This phase requires zero new libraries. All needed patterns exist in the codebase already:
- Modal pattern: `createModal()` in `components.js` or inline window-style modal (both patterns exist)
- Listener management: `listeners[]` array pattern
- `Promise.all` Firestore queries: already in `generateServiceCode()`
- CSS badge classes: `.status-badge.pending/approved/rejected` in `components.css`

---

## Architecture Patterns

### Current Admin Structure (to be modified)

`admin.js` is the wrapper view. It loads sub-modules dynamically into `#adminContent` by calling `section.load()`. The current `SECTIONS` map:

```javascript
// app/views/admin.js (current)
const SECTIONS = {
    users: { label: 'User Management', load: () => import('./user-management.js') },
    assignments: { label: 'Assignments', load: () => import('./project-assignments.js') },
    settings: { label: 'Settings', load: () => import('./role-config.js') },
    service_assignments: { label: 'Service Assignments', load: () => import('./service-assignments.js') }
};
```

**After overhaul**, `service_assignments` entry is removed and `assignments` now loads a new `assignments.js` (not the old `project-assignments.js`):

```javascript
// app/views/admin.js (after)
const SECTIONS = {
    users: { label: 'User Management', load: () => import('./user-management.js') },
    assignments: { label: 'Assignments', load: () => import('./assignments.js') },  // NEW module
    settings: { label: 'Settings', load: () => import('./role-config.js') }
    // service_assignments REMOVED
};
```

The old `project-assignments.js` and `service-assignments.js` files can either be deleted or left as dead code. Preference: keep them but do not reference them from `admin.js` (no harm, avoids risky deletes).

### New `assignments.js` Module Pattern

Single module with Projects/Services toggle sub-tabs:

```javascript
// app/views/assignments.js — skeleton
let activeSubTab = 'projects'; // 'projects' | 'services'
let usersData = [];         // All relevant users (loaded once, filtered by sub-tab)
let projectsData = [];      // All projects (for modal)
let servicesData = [];      // All services (for modal)
let listeners = [];
let pendingChanges = {};    // { [userId]: Set of codes } — held until Save

export function render(subTab = 'projects') { ... }
export async function init(subTab = 'projects') { ... }
export async function destroy() { ... }
```

**Listeners needed:**
1. `users` collection — `where('role', 'in', ['operations_user', 'operations_admin', 'services_user', 'services_admin'])` — all assignable users
2. `projects` collection — all projects (unfiltered, admin can assign any)
3. `services` collection — all services (unfiltered, admin can assign any)

All three fire `renderUsersTable()` when data arrives.

**Role gate:** `super_admin` can manage both tabs. `operations_admin` sees only Projects sub-tab. `services_admin` sees only Services sub-tab. For simplicity, show both tabs to `super_admin`, filter by role for the others.

### User Table Layout

| Column | Content |
|--------|---------|
| Name | `user.full_name` + email (small gray) |
| Role | Role badge (existing pattern) |
| Assignment Count | Number of assigned codes (or "All" if `all_projects/all_services === true`, handled on read — no new writes with the "All" flag) |
| Actions | `[Manage]` button → opens modal |

### Manage Modal Pattern

Inline HTML modal with a search input. Checkboxes for all projects/services. State held in a local `pendingChanges` map until Save is clicked.

```javascript
// Modal holds temporary state
let pendingModalCodes = new Set(); // codes checked in current modal open

function openManageModal(userId, type) { // type = 'projects' | 'services'
    const user = usersData.find(u => u.id === userId);
    const currentCodes = type === 'projects'
        ? (user.assigned_project_codes || [])
        : (user.assigned_service_codes || []);
    pendingModalCodes = new Set(currentCodes);
    // Render modal with checkboxes
}

async function saveManageModal(userId, type) {
    const newCodes = [...pendingModalCodes];
    // Write to Firestore: assigned_project_codes or assigned_service_codes
    // Also: set all_projects/all_services to false (explicit-only going forward)
    await updateDoc(doc(db, 'users', userId), {
        [type === 'projects' ? 'assigned_project_codes' : 'assigned_service_codes']: newCodes,
        [type === 'projects' ? 'all_projects' : 'all_services']: false
    });
    // Trigger reverse sync (reuse syncAssignmentToPersonnel pattern)
}
```

**"All Projects" flag handling:** When rendering the Assignment Count column, if `user.all_projects === true`, show "All (legacy)" and treat it as all projects for display. When the admin opens the modal and clicks Save, the write explicitly sets `all_projects: false` and writes the explicit codes. This migrates the flag on first edit, no batch migration needed.

**Search filter:** Simple `input` event listener that filters the checkbox list by code or name using `str.toLowerCase().includes(query)`.

### Badge Standardization Pattern

**CSS classes to add** (in `components.css`):

```css
/* New classes for states not currently covered */
.status-badge.procuring,
.badge-procuring {
    background: #dbeafe;  /* blue-100 */
    color: #1d4ed8;        /* blue-700 */
}

.status-badge.procured,
.badge-procured {
    background: #d1fae5;  /* green-100 */
    color: #065f46;        /* green-800 */
}

.status-badge.delivered,
.badge-delivered {
    background: #d1fae5;
    color: #065f46;
}

.status-badge.pending-procurement,
.badge-pending-procurement {
    background: var(--warning-light);
    color: var(--warning-dark);
}

/* Fix undefined badge-secondary (used in finance.js) */
.badge-secondary {
    background: #e5e7eb;
    color: #374151;
}
```

**`getStatusClass()` extension** (in `utils.js`):

```javascript
const statusMap = {
    'pending': 'pending',
    'approved': 'approved',
    'rejected': 'rejected',
    'completed': 'approved',
    'active': 'approved',
    'inactive': 'rejected',
    // New entries:
    'pending procurement': 'pending',
    'procuring': 'procuring',
    'procured': 'procured',
    'delivered': 'delivered',
    'finance approved': 'approved',
    'finance rejected': 'rejected',
    'pr rejected': 'rejected',
    'tr rejected': 'rejected',
    'pr generated': 'procuring',  // in-progress blue
    'po issued': 'procuring',
};
```

**MRF History PR column redesign** (in `procurement.js`, around line 2481):

Current pattern (two separate elements — a link and a badge below it):
```javascript
return `<div style="...">
    <a href="..." onclick="...">${pr.pr_id}</a>
    ${badgeText ? `<span style="background: ${badgeColor}; ...>${badgeText}</span>` : ''}
</div>`;
```

New pattern (PR code IS the badge, badge color = finance_status):
```javascript
const statusClass = getStatusClass(pr.finance_status || 'Pending');
return `<a href="javascript:void(0)"
    onclick="window.viewPRDetails('${pr.docId}')"
    class="status-badge ${statusClass}"
    style="font-size: 0.75rem; text-decoration: none; display: inline-block; word-break: break-word;">
    ${pr.pr_id}
</a>`;
```

This eliminates the stacked div layout and makes the PR code itself the badge.

**Inline style sweep targets** (files and approximate locations):

| File | Issue | Fix |
|------|-------|-----|
| `finance.js` L1168, L1221 | Inline `background: #fef3c7; color: #f59e0b;` hard-coded "Pending" badges | Replace with `class="status-badge pending"` |
| `finance.js` L949 | `badge-secondary` undefined class | Add `.badge-secondary` to CSS |
| `procurement.js` L497 | Inline style for `po.procurement_status` in history | Use `createStatusBadge(po.procurement_status)` or `status-badge ${getStatusClass(...)}` |
| `procurement.js` L2482-2496 | Stacked PR code + badge | New PR code-as-badge pattern (see above) |
| `procurement.js` L3783-3792 | `statusColors` object for PO table inline styles | Replace with CSS class system |

### Project Code Fix Pattern

`generateProjectCode()` currently queries only `projects`. Fix mirrors `generateServiceCode()` exactly:

```javascript
// app/utils.js — generateProjectCode (FIXED)
export async function generateProjectCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC_${clientCode}_${currentYear}000`;
        const rangeMax = `CLMC_${clientCode}_${currentYear}999`;

        // Query BOTH collections in parallel — shared sequence prevents collisions
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
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}
```

This is a direct translation of the existing `generateServiceCode()` pattern (Phase 27 decision, confirmed HIGH confidence).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal search filtering | Custom fuzzy search | Simple `.includes()` on lowercased string | Scale doesn't warrant complexity |
| Badge color logic | New color system | Extend `getStatusClass()` + CSS classes | Already the standard pattern |
| Assignments data structure | New collection | `assigned_project_codes[]` / `assigned_service_codes[]` on user doc | Already established, changing would break scoping queries |
| Code collision prevention | Counter document | `Promise.all` parallel query pattern | Already used for services, proven pattern at current scale |

---

## Common Pitfalls

### Pitfall 1: "All Projects" Flag Users Who Have It Set
**What goes wrong:** When admin opens the Manage modal for a user with `all_projects: true`, the new UI only shows explicit codes (which is empty `[]`). Admin might save an empty array, effectively removing all access.
**Why it happens:** `assigned_project_codes` is empty when `all_projects: true` is set (by design in the old system).
**How to avoid:** When rendering Assignment Count, if `all_projects === true`, display "All (legacy)" and pre-populate the modal checkboxes by checking all projects. On Save, write the full explicit array and set `all_projects: false`. This is the decided migrate-on-edit pattern.
**Warning signs:** User reports "lost all project access after admin clicked Save."

### Pitfall 2: Re-render While Modal Is Open
**What goes wrong:** `onSnapshot` fires while the Manage modal is open (e.g., another user changes data), causing `renderUsersTable()` to overwrite the DOM including the open modal.
**Why it happens:** All three listeners call `renderUsersTable()` on every update.
**How to avoid:** Guard `renderUsersTable()` with a check: if a modal is currently open (e.g., `document.getElementById('manageModal')?.style.display !== 'none'`), skip the re-render or re-render only the table rows that are outside the modal.
**Warning signs:** Modal closes unexpectedly when other data changes.

### Pitfall 3: Badge Class Missing for "Pending Procurement"
**What goes wrong:** `getStatusClass('Pending Procurement')` falls through to the default `'pending'` — OK — but CSS classes like `status-badge.pending-procurement` may not exist.
**Why it happens:** Existing `getStatusClass()` lowercases the input, so `'pending procurement'` is the key — not `'pending-procurement'`.
**How to avoid:** Map `'pending procurement'` → `'pending'` in `getStatusClass()`. No new CSS class needed.

### Pitfall 4: Window Functions Leak Between Assignments Sub-Tabs
**What goes wrong:** `window.openManageModal`, `window.saveManageModal`, `window.closeManageModal` registered in `assignments.js init()` persist when switching sub-tabs. Since sub-tabs don't call `destroy()`, this is actually correct behavior — but the functions must remain valid for both Projects and Services sub-tabs.
**Why it happens:** Sub-tab switching re-renders the table but doesn't re-register window functions (router skips `destroy()` on tab switch within same view).
**How to avoid:** Register all window functions once in `init()`, not in the render path. Pass `type` ('projects' or 'services') as a parameter to `openManageModal(userId, type)`.

### Pitfall 5: Reverse Personnel Sync for New Assignments Module
**What goes wrong:** The old `project-assignments.js` had `syncAssignmentToPersonnel()` which kept project personnel arrays in sync when assignments changed. The new modal-save approach must replicate this.
**Why it happens:** Two-way sync: user doc `assigned_project_codes` ↔ project doc `personnel_user_ids/personnel_names`.
**How to avoid:** Call `syncAssignmentToPersonnel()` (or its equivalent from `utils.js` — `syncPersonnelToAssignments`) after writing the new codes to the user doc. The old `project-assignments.js` had this logic inlined; factor it out or reuse `syncPersonnelToAssignments` from `utils.js`.

Note: `service-assignments.js` did NOT have reverse sync (only `handleServiceCheckboxChange` wrote to user doc, no project personnel sync). This asymmetry should be preserved — services do not have a reverse personnel sync.

---

## Code Examples

### Assignment Count Cell (handles legacy `all_projects` flag)
```javascript
// Source: project pattern from project-assignments.js + Phase 39 constraint
function getAssignmentCount(user, type) {
    if (type === 'projects') {
        if (user.all_projects === true) return 'All (legacy)';
        const codes = user.assigned_project_codes || [];
        return codes.length === 0 ? 'None' : `${codes.length} project(s)`;
    } else {
        if (user.all_services === true) return 'All (legacy)';
        const codes = user.assigned_service_codes || [];
        return codes.length === 0 ? 'None' : `${codes.length} service(s)`;
    }
}
```

### Modal Pre-population for Legacy "All" Users
```javascript
// When user has all_projects=true, pre-check all project checkboxes
function openManageModal(userId, type) {
    const user = usersData.find(u => u.id === userId);
    if (type === 'projects') {
        const isAll = user.all_projects === true;
        const currentCodes = isAll
            ? projectsData.map(p => p.project_code)  // pre-check all
            : (user.assigned_project_codes || []);
        pendingModalCodes = new Set(currentCodes);
    }
    // render modal...
}
```

### Badge Sweep — Replace Inline Style with Class
```javascript
// BEFORE (finance.js pattern)
`<span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Pending</span>`

// AFTER
`<span class="status-badge pending">Pending</span>`

// OR using the shared helper
createStatusBadge('Pending')  // returns <span class="status-badge pending">Pending</span>
```

### PR Code as Badge (MRF History)
```javascript
// BEFORE (procurement.js L2494-2497)
return `<div style="display: flex; flex-direction: column; gap: 2px; min-height: 52px; justify-content: center;">
    <a href="javascript:void(0)" onclick="window.viewPRDetails('${pr.docId}')" style="color: #1a73e8; text-decoration: none; font-weight: 600; font-size: 0.8rem; word-break: break-word;">${pr.pr_id}</a>
    ${badgeText ? `<span style="background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.65rem; font-weight: 600; width: fit-content;">${badgeText}</span>` : ''}
</div>`;

// AFTER
const statusClass = getStatusClass(pr.finance_status || 'Pending');
return `<a href="javascript:void(0)"
    onclick="window.viewPRDetails('${pr.docId}')"
    class="status-badge ${statusClass}"
    style="font-size: 0.75rem; text-decoration: none; word-break: break-word; cursor: pointer;">
    ${pr.pr_id}
</a>`;
```

---

## State of the Art

| Old Approach | Current Approach | Phase | Impact |
|--------------|-----------------|-------|--------|
| Per-user full checkbox list | Table + modal | Phase 39 | Scales from O(users × projects) to O(users) |
| Separate "Project Assignments" + "Service Assignments" tabs | Single "Assignments" tab with sub-tabs | Phase 39 | Reduces admin nav from 4 to 3 sections |
| `generateProjectCode()` queries only projects | Queries both projects AND services | Phase 39 | Closes collision gap; mirrors Phase 27 service code pattern |
| Mixed inline styles and CSS classes for badges | Unified CSS class system | Phase 39 | Consistent visual language, easier to maintain |
| `all_projects: true` as "wildcard" assignment | Explicit code arrays only (migrate on edit) | Phase 39 | Removes implicit behavior, data model cleaner |

---

## Open Questions

1. **Reverse sync for project-side when using new modal Save**
   - What we know: Old `project-assignments.js` had `syncAssignmentToPersonnel()` that updated `personnel_user_ids/personnel_names` on project docs when assignments changed.
   - What's unclear: Should the new `assignments.js` module call `syncPersonnelToAssignments` from `utils.js` directly, or should it re-implement its own inline sync?
   - Recommendation: Reuse `syncPersonnelToAssignments` from `utils.js` since it's already exported and handles the bidirectional sync. Pass `(userId, userName, oldCodes, newCodes)` to it after modal Save.

2. **Role visibility for Assignments tab sub-tabs**
   - What we know: `super_admin` should see both. `operations_admin` manages project users. `services_admin` manages service users.
   - What's unclear: Should `operations_admin` see the Services sub-tab (read-only) or hide it entirely?
   - Recommendation: Hide the Services sub-tab entirely for `operations_admin`, and hide the Projects sub-tab for `services_admin`. Show both for `super_admin`. Simplest UX.

3. **PO table inline status colors in procurement.js (L3783)**
   - What we know: The `statusColors` object drives a `<select>` display, not a static badge — it shows colors in the current status option of an editable dropdown.
   - What's unclear: Should these inline styles be replaced with CSS classes too, or is this a different pattern (not a badge)?
   - Recommendation: Leave the `statusColors` inline map for the editable select element — that's a form control color hint, not a status badge. Focus the badge sweep on static display spans only.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is not set in `.planning/config.json`. No automated test infrastructure exists in this project (zero-build static SPA with manual browser testing).

---

## Sources

### Primary (HIGH confidence)
- `app/views/project-assignments.js` — Current project assignments implementation (337 lines); full reverse sync logic identified
- `app/views/service-assignments.js` — Current service assignments implementation (259 lines); no reverse sync
- `app/views/admin.js` — Admin wrapper with dynamic section loading pattern
- `app/utils.js` — `generateProjectCode()` (L192-226), `generateServiceCode()` (L262-302), `getStatusClass()` (L431-444)
- `app/components.js` — `createStatusBadge()`, `getDeptBadgeHTML()`
- `styles/components.css` — `.status-badge` CSS classes (L490-527), existing color variables
- `styles/main.css` — CSS custom properties: `--warning-light`, `--warning-dark`, `--success-light`, `--success-dark`, `--danger-light`, `--danger-dark`
- `.planning/phases/39-.../39-CONTEXT.md` — All locked decisions

### Secondary (MEDIUM confidence)
- `app/views/procurement.js` — Badge usage at L2481-2496 (MRF History PR column), L3783 (PO table statusColors), L497 (inline procurement_status style)
- `app/views/finance.js` — Inline badge at L1168, L1221 (hardcoded Pending styles), L949 (undefined `badge-secondary`)
- `app/auth.js` — `all_projects` / `all_services` flag change detection (real-time assignment propagation)

---

## Metadata

**Confidence breakdown:**
- Admin assignments overhaul: HIGH — existing patterns fully readable, clear precedent in both files being replaced
- Badge standardization: HIGH — full CSS system understood, all inline style locations identified
- Project code fix: HIGH — the fix is a direct port of the already-working `generateServiceCode()` function

**Research date:** 2026-02-24
**Valid until:** 2026-04-24 (stable domain — no external library dependency changes)
