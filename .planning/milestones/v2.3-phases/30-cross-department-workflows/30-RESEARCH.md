# Phase 30: Cross-Department Workflows - Research

**Researched:** 2026-02-18
**Domain:** UI filtering, badge rendering, and data flow in existing finance.js and procurement.js views
**Confidence:** HIGH — all findings based on direct source code inspection

---

## Summary

Phase 29 already planted `department`, `service_code`, and `service_name` fields into every `prs`, `pos`, and `transport_requests` document at write time, and both `finance.js` and `procurement.js` carry a working `getMRFLabel()` helper that reads those fields. Phase 30 is therefore almost entirely a UI/presentation phase: it wires up department badges, adds filter dropdowns, and ensures the timeline audit trail surfaces department context. No new Firestore schema changes are needed.

The two views use different patterns for their listing pages. `finance.js` renders PRs into a static `<tbody id="materialPRsBody">` via `renderMaterialPRs()`, TRs via `renderTransportRequests()`, and POs via `renderPOs()`. `procurement.js` PO tracking uses `renderPOTrackingTable()` targeting `<tbody id="poTrackingBody">` with pagination, and MRF Records uses an async `renderPRPORecords()` that fetches related PRs/POs per-record. Each rendering function must be patched to inject a department badge and to respect an optional department filter.

The phase is low-risk. All required data is already on the documents. The biggest implementation pitfall is the dual-file duplication: `getMRFLabel()` exists independently in both files, the `DOCUMENT_CONFIG` block is duplicated, and filter state must be scoped to each view's module-level variables — not shared globals.

**Primary recommendation:** Add a module-level `activeDeptFilter` variable in each view, inject a `<select>` filter control into each section header, and add a CSS badge span (`<span class="dept-badge dept-badge--projects">Projects</span>` / `<span class="dept-badge dept-badge--services">Services</span>`) in every table row and modal that currently uses `getMRFLabel()` for display.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CROSS-01 | Finance Pending Approvals shows PRs/TRs from both Projects and Services | PRs/TRs from both departments already feed the same `onSnapshot` listeners in `loadPRs()` (no `where('department',...)` filter currently applied — all Pending finance_status documents appear regardless of department). No query change needed — badge rendering is sufficient. |
| CROSS-02 | Procurement PO Tracking shows POs from both Projects and Services | `loadPOTracking()` uses `onSnapshot(collection(db, 'pos'), ...)` — already fetches all POs regardless of department. Badge rendering is the only required addition. |
| CROSS-03 | Department badge/indicator visible in Finance and Procurement lists | Both views already call `getMRFLabel()` in list rows. The badge should be a distinct styled `<span>` element added alongside or replacing the plain text label. |
| CROSS-04 | Optional department filter dropdown in Finance and Procurement views | Requires: (1) new module-level filter state variable in each file, (2) `<select>` HTML in the section header, (3) client-side filter applied inside the render function before injecting rows into the DOM. |
| CROSS-05 | PR generation works for Services-linked MRFs | Already implemented in Phase 29 — `generatePR()` copies `department`, `service_code`, `service_name` from the MRF into the PR document. No functional change needed; verify by reading the existing code path. |
| CROSS-06 | PO creation works for Services-linked PRs | Already implemented in Phase 29 — `generatePOsForPRWithSignature()` in `finance.js` copies `department`, `service_code`, `service_name` from the PR into the PO document. No functional change needed. |
| CROSS-07 | Timeline audit trail shows department context | `showProcurementTimeline()` in `procurement.js` builds `description` strings by hand (e.g., `Project: ${mrf.project_name || 'N/A'}`). Must be updated to call `getMRFLabel(mrf)` instead, and repeat for PR/TR/PO timeline entries. |
</phase_requirements>

---

## Standard Stack

No new libraries. This phase uses only what is already in the codebase.

### Core (already present)
| Asset | Version | Purpose |
|-------|---------|---------|
| Firebase Firestore v10.7.1 | CDN | Already loaded; all queries use existing patterns |
| Pure ES6 modules | — | No build system; edit `.js` files directly |
| Inline CSS (style attributes) | — | Badge styles will be inline to stay consistent with existing pattern |

### Supporting
- `getMRFLabel(doc)` — already in both `finance.js` (line 36) and `procurement.js` (line 17). Returns `"PROJ-CODE - Project Name"` or `"SVC-CODE - Service Name"` string. For Phase 30 the planner should produce a separate `getDeptBadgeHTML(doc)` helper or expand `getMRFLabel` to return styled HTML.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline badge `<span>` | CSS class `.dept-badge` in components.css | Inline is consistent with this codebase's existing pattern; class-based is cleaner but requires stylesheet edit |
| Client-side filter in render function | Firestore `where('department', '==', ...)` query | Client-side is correct here — data is already loaded into in-memory arrays; a new Firestore query would be wasteful and add latency |

---

## Architecture Patterns

### View Module Structure (existing, must not break)
```javascript
export function render(activeTab = null) { return `<div>HTML</div>`; }
export async function init(activeTab = null) { attachWindowFunctions(); /* listeners */ }
export async function destroy() { listeners.forEach(u => u?.()); listeners = []; }
```

### Pattern 1: Module-level filter state (per-view)
**What:** A new variable at the top of each view file holds the current department selection.
**When to use:** Whenever the filter dropdown fires `onchange`.
```javascript
// In finance.js (add near line 48 where other state lives)
let activeDeptFilter = ''; // '' = All, 'projects' = Projects only, 'services' = Services only

function filterByDept(records) {
    if (!activeDeptFilter) return records;
    return records.filter(r => (r.department || 'projects') === activeDeptFilter);
}
```

### Pattern 2: Department badge HTML helper
**What:** Produces a styled inline `<span>` badge.
**When to use:** Wherever a table row or modal currently shows `getMRFLabel(doc)`.
```javascript
function getDeptBadgeHTML(doc) {
    const isDept = doc.department === 'services' || (!doc.department && doc.service_code);
    const label = isDept ? 'Services' : 'Projects';
    const bg    = isDept ? '#ede9fe' : '#dbeafe'; // purple-100 : blue-100
    const color = isDept ? '#6d28d9' : '#1d4ed8'; // purple-700 : blue-700
    return `<span style="background:${bg};color:${color};padding:2px 7px;border-radius:4px;font-size:0.7rem;font-weight:600;white-space:nowrap;">${label}</span>`;
}
```

### Pattern 3: Filter dropdown HTML (added to section card-header)
```html
<!-- Add inside the card-header div of the relevant section -->
<select id="deptFilter" onchange="window.applyDeptFilter(this.value)"
        style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;">
    <option value="">All Departments</option>
    <option value="projects">Projects</option>
    <option value="services">Services</option>
</select>
```

### Pattern 4: Timeline description with department context
**What:** Existing timeline items use `project_name` directly. Must switch to `getMRFLabel()`.
**Where:** `showProcurementTimeline()` in `procurement.js` lines 4416-4453.
```javascript
// BEFORE (line 4419):
description: `Requestor: ${mrf.requestor_name} | Project: ${mrf.project_name || 'N/A'}`,

// AFTER:
description: `Requestor: ${mrf.requestor_name} | ${mrf.department === 'services' ? 'Service' : 'Project'}: ${getMRFLabel(mrf)}`,
```

### Anti-Patterns to Avoid
- **Firestore query per filter change:** The data is already in memory (`materialPRs`, `poData`, etc.). Never issue a new Firestore query when the department filter changes — re-render from in-memory arrays only.
- **Modifying `getMRFLabel()` return type:** The helper currently returns a plain string. If you make it return HTML, every other call site (PR document generation, modal body text) will break. Create a separate `getDeptBadgeHTML()` helper.
- **Editing `procurement-base.js`:** That file is the archive reference, not the active file. The active file is `app/views/procurement.js`.
- **Adding window functions without registering in `attachWindowFunctions()`:** Any `onclick="window.applyDeptFilter(...)"` MUST be added to the `attachWindowFunctions()` block in both files, otherwise tab switching breaks the handler.

---

## File-by-File Change Map

### `app/views/finance.js`

**Affected sections (with line references):**

| Section | Lines | Change |
|---------|-------|--------|
| Module-level state | ~line 48 | Add `let activeDeptFilter = ''` |
| `attachWindowFunctions()` | ~line 71 | Register `window.applyFinanceDeptFilter` |
| `render()` — Material PRs card-header | ~line 619 | Add `<select>` filter dropdown |
| `render()` — Transport Requests card-header | ~line 650 | Add `<select>` filter dropdown (or share one) |
| `render()` — POs card-header | ~line 678 | Add `<select>` filter dropdown |
| `renderMaterialPRs()` | line 1110 | Apply dept filter before `.map()`, add badge in each row |
| `renderTransportRequests()` | line 1159 | Apply dept filter before `.map()`, add badge in each row |
| `renderPOs()` | line 1971 | Apply dept filter before `.map()`, add badge in each row |
| `viewPRDetails()` — modal body | line 1262 | Add dept badge next to "Project:" label |
| `viewTRDetails()` — modal body | line 1395 | Add dept badge next to "Project:" label |
| `destroy()` | line 991 | Delete `window.applyFinanceDeptFilter`, reset `activeDeptFilter = ''` |

**No Firestore schema or query changes needed.**

### `app/views/procurement.js`

**Affected sections (with line references):**

| Section | Lines | Change |
|---------|-------|--------|
| Module-level state | ~line 39 | Add `let activePODeptFilter = ''` |
| `attachWindowFunctions()` | line 63 | Register `window.applyPODeptFilter` |
| `render()` — PO Tracking section (tracking tab area) | ~line 246 | Add `<select>` dept filter to card header |
| `renderPOTrackingTable()` | line 3684 | Apply dept filter before pagination slice, add dept badge in each row |
| `showProcurementTimeline()` | line 4367 | Replace hardcoded `project_name` with `getMRFLabel()` for MRF, PR, TR, PO descriptions |
| `destroy()` | line 523 | Delete `window.applyPODeptFilter`, reset `activePODeptFilter = ''` |

**Note on PO Tracking tab:** The current `render()` function in procurement.js only has three tabs: `mrfs`, `suppliers`, `records`. The PO tracking table is rendered by `renderPOTrackingTable()` which targets `<tbody id="poTrackingBody">`. Grep reveals this tbody exists in the live HTML generated during procurement tab rendering — confirm its section ID (`tracking-section`) is present in the render HTML or add the filter dropdown into the correct card header.

**For CROSS-05 and CROSS-06 (PR/PO generation for Services):** These are already complete from Phase 29. The `generatePR()` function copies `department`, `service_code`, `service_name` at lines 3212-3214. The `generatePOsForPRWithSignature()` copies them at lines 1637-1639. No code change needed — only verification.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Department filtering | Custom query system | Client-side `.filter()` on in-memory arrays | Data is already loaded via `onSnapshot`; re-querying Firestore is wasteful |
| Badge styling | CSS framework | Inline `style=` attributes consistent with existing codebase | Codebase uses inline styles everywhere; introducing CSS classes requires stylesheet edit and is inconsistent |
| Badge HTML | A new shared module | Local `getDeptBadgeHTML()` function in each view file | Following the same duplication pattern as `getMRFLabel()` and `DOCUMENT_CONFIG` which are already duplicated; avoids cross-file import complexity |

---

## Common Pitfalls

### Pitfall 1: Filter state not reset on destroy
**What goes wrong:** User sets filter to "Services", navigates away, returns — filter dropdown shows "Services" but `activeDeptFilter` was reset to `''` by `destroy()`, causing mismatch.
**Why it happens:** `destroy()` resets module state but the DOM `<select>` value persists until `render()` re-creates the HTML.
**How to avoid:** `render()` always generates the dropdown with `value=""` (All) as default. State resets to `''` in `destroy()`. DOM and state are always in sync on fresh navigation.

### Pitfall 2: Tab switching within same view loses window functions
**What goes wrong:** `TypeError: window.applyDeptFilter is not a function` when switching tabs.
**Why it happens:** Router does NOT call `destroy()` on tab switch — only calls `init()` again. If the new window function is not registered in `attachWindowFunctions()`, it is available only on first load.
**How to avoid:** Register EVERY new `onclick` handler in `attachWindowFunctions()`. This is documented in CLAUDE.md and is an established pattern. Confirmed by existing code at line 75-107 in finance.js.

### Pitfall 3: Filtering before vs. after pagination
**What goes wrong:** Department filter applied AFTER pagination — only current page is filtered.
**Why it happens:** Render functions apply pagination first, then iterate the page slice.
**How to avoid:** Apply dept filter to the full in-memory array, then paginate the filtered result. Both `renderMaterialPRs()` and `renderPOTrackingTable()` operate directly on module-level arrays — filter in a local variable before the pagination slice.

### Pitfall 4: `getMRFLabel()` returns plain text used in timeline description
**What goes wrong:** Timeline item `description` field is a plain string inserted into `.timeline-item-description`. If `getDeptBadgeHTML()` returns HTML, it will render as escaped text.
**Why it happens:** `createTimeline()` in `components.js` (line 357) uses template literal: `` `<div class="timeline-item-description">${item.description}</div>` ``. This DOES render HTML, so injecting a `<span>` badge here is safe.
**How to avoid:** Confirm `createTimeline()` uses interpolation (not `textContent`). Verified: it uses template literal interpolation — HTML in `description` will render correctly.

### Pitfall 5: `promptPODocument` in finance.js has missing `window.` prefix
**What goes wrong:** `onclick="promptPODocument('${po.id}')"` at line 2027 in finance.js is missing the `window.` prefix, unlike all other handlers in that file.
**Why it happens:** Likely a copy-paste oversight.
**How to avoid:** When adding dept filter buttons, use the consistent `onclick="window.funcName()"` form for all new handlers. Note: the existing bug is pre-existing and out of scope for Phase 30, but be aware of it.

---

## Code Examples

### Example 1: Applying dept filter in renderMaterialPRs()
```javascript
// finance.js — inside renderMaterialPRs()
function renderMaterialPRs() {
    const tbody = document.getElementById('materialPRsBody');
    // Apply department filter to in-memory array
    const filtered = activeDeptFilter
        ? materialPRs.filter(pr => (pr.department || 'projects') === activeDeptFilter)
        : materialPRs;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" ...>No pending material PRs</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(pr => {
        // ... existing row building ...
        return `
            <tr>
                <td><strong>${pr.pr_id}</strong></td>
                <td>${pr.mrf_id}</td>
                <td>
                    ${getDeptBadgeHTML(pr)}
                    <span style="margin-left:4px;">${getMRFLabel(pr)}</span>
                </td>
                <!-- remaining columns unchanged -->
            </tr>
        `;
    }).join('');
}
```

### Example 2: applyFinanceDeptFilter window function
```javascript
// finance.js — new function, register in attachWindowFunctions()
function applyFinanceDeptFilter(value) {
    activeDeptFilter = value;
    renderMaterialPRs();
    renderTransportRequests();
    // renderPOs is separate — if filter should apply to POs tab too, call it
}
window.applyFinanceDeptFilter = applyFinanceDeptFilter;
```

### Example 3: Department filter dropdown HTML
```javascript
// In render(), inside Material PRs card-header
`<div style="display: flex; gap: 0.5rem; align-items: center;">
    <select id="deptFilterApprovals"
            onchange="window.applyFinanceDeptFilter(this.value)"
            style="padding:0.35rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:6px;font-size:0.875rem;color:#475569;">
        <option value="">All Departments</option>
        <option value="projects">Projects</option>
        <option value="services">Services</option>
    </select>
    <button class="btn btn-secondary" onclick="window.refreshPRs()">Refresh</button>
</div>`
```

### Example 4: Timeline description with department context
```javascript
// procurement.js — showProcurementTimeline() (existing lines 4416-4421)
// BEFORE:
const timelineItems = [{
    title: `MRF Created: ${mrf.mrf_id}`,
    date: formatDate(mrf.created_at),
    description: `Requestor: ${mrf.requestor_name} | Project: ${mrf.project_name || 'N/A'}`,
    status: 'completed'
}];

// AFTER:
const deptType = mrf.department === 'services' ? 'Service' : 'Project';
const timelineItems = [{
    title: `MRF Created: ${mrf.mrf_id}`,
    date: formatDate(mrf.created_at),
    description: `Requestor: ${mrf.requestor_name} | ${deptType}: ${getMRFLabel(mrf)}`,
    status: 'completed'
}];

// Similarly for PR entries (existing line 4429):
// BEFORE:
description: `Supplier: ${pr.supplier_name} | Amount: ₱${formatCurrency(pr.total_amount)}`,
// AFTER:
description: `Supplier: ${pr.supplier_name} | Amount: ₱${formatCurrency(pr.total_amount)} | Dept: ${pr.department === 'services' ? 'Services' : 'Projects'}`,

// For PO entries (existing line 4451):
// BEFORE:
description: `Supplier: ${po.supplier_name} | Status: ${po.procurement_status}`,
// AFTER:
description: `Supplier: ${po.supplier_name} | Status: ${po.procurement_status} | ${po.department === 'services' ? 'Services' : 'Projects'}`,
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No department field on PRs/POs | `department`, `service_code`, `service_name` copied at write time | Phase 29 | All existing documents from Phase 29 onward carry department context |
| `getMRFLabel()` only as plain-text display | Used in 10+ locations in procurement.js, 7+ in finance.js | Phase 29 | Phase 30 must add badge HTML alongside existing label text |

**Deprecated/outdated:**
- `mrf.project_name` used directly in timeline: Replace with `getMRFLabel(mrf)` for dept-aware display.

---

## Open Questions

1. **Single filter or per-section filter?**
   - What we know: Finance has three separate tables (Material PRs, Transport Requests, POs). CROSS-04 says "optional department filter dropdown in Finance and Procurement views".
   - What's unclear: Should one filter control all three Finance tables simultaneously, or should each table have its own?
   - Recommendation: One filter per view section is simpler to implement and avoids confusion. Use a single `activeDeptFilter` in finance.js that applies when any of the three render functions run.

2. **Does the dept filter also apply to the MRF Records tab in procurement.js?**
   - What we know: CROSS-02 targets PO Tracking specifically. CROSS-04 says "Finance and Procurement views."
   - What's unclear: Whether MRF Records (Procurement) also needs a dept filter.
   - Recommendation: Apply the filter to PO Tracking (the main procurement PO view). MRF Records already has a search input that can match service codes — scope the filter to PO Tracking only unless explicitly required.

3. **`promptPODocument` missing `window.` prefix in finance.js line 2027**
   - What we know: The onclick is `onclick="promptPODocument('${po.id}')"` — missing `window.`.
   - What's unclear: Whether this is actually broken (could work if the function is in scope via the module system).
   - Recommendation: Fix it as a side-fix while editing that file for Phase 30. Change to `window.promptPODocument`.

---

## Sources

### Primary (HIGH confidence)
- Direct source code inspection: `C:/Users/Admin/Roaming/pr-po/app/views/finance.js` (2,087 lines) — full read
- Direct source code inspection: `C:/Users/Admin/Roaming/pr-po/app/views/procurement.js` (5,000+ lines) — key sections read
- Direct source code inspection: `C:/Users/Admin/Roaming/pr-po/app/components.js` (461 lines) — full read
- Direct source code inspection: `C:/Users/Admin/Roaming/pr-po/app/utils.js` (744 lines) — full read
- `CLAUDE.md` — project constraints and development patterns

### Secondary (MEDIUM confidence)
- Phase 29 commit messages (from git log) confirm department/service fields were added to PR and PO creation at `generatePR()`, `generatePRandTR()`, and `generatePOsForPRWithSignature()`

---

## Metadata

**Confidence breakdown:**
- CROSS-01, CROSS-02 (display badges): HIGH — data already on documents, only render functions need updating
- CROSS-03 (badge indicator): HIGH — implementation pattern clear from existing inline badge styles in codebase
- CROSS-04 (dept filter): HIGH — client-side filter pattern well-established; module-level state pattern already used for `projectExpenseSortColumn` etc.
- CROSS-05, CROSS-06 (PR/PO generation for services): HIGH — already implemented in Phase 29, verified by reading generatePR() and generatePOsForPRWithSignature()
- CROSS-07 (timeline dept context): HIGH — `showProcurementTimeline()` fully read, change is surgical

**Research date:** 2026-02-18
**Valid until:** Until finance.js or procurement.js are refactored (stable for 30+ days at current pace)
