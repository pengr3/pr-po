# Phase 47: Fix Sortable Headers, Login Logo, and Urgency Propagation to Finance - Research

**Researched:** 2026-02-28
**Domain:** Vanilla JS UI bug fixes — sortable table headers, auth page branding, data propagation gap
**Confidence:** HIGH

## Summary

Phase 47 bundles three independent, self-contained bug fixes into a single delivery. All three are pure front-end changes to existing files — no new collections, no new routes, no security rule changes required.

**Fix 1 — Sortable headers on Pending Approvals tables:** The Material PRs and Transport Requests tables in finance.js Tab 1 ("Pending Approvals") have static `<th>` elements. The two other finance tabs (Project Expenses and Purchase Orders) already have fully working sortable headers using the `sort-indicator` span + `sortXxx()` function pattern. Adding the same pattern to Tab 1 is a copy-adapt operation.

**Fix 2 — Login page logo:** login.js still renders the original "CL" text placeholder in a blue square div. register.js was updated in Phase 45 (BRD-01) to show the real PNG logo with an `onerror` fallback. The `auth-logo img` CSS already exists in views.css. login.js needs the identical one-line replacement.

**Fix 3 — Urgency propagation to finance:** When `generatePR()` writes a PR document to Firestore, it does not copy `urgency_level` from the parent MRF. Finance's `renderMaterialPRs()` reads `pr.urgency_level || 'Low'`, so every Finance-visible PR shows "Low" regardless of the MRF's urgency. The same gap exists in `generatePRandTR()` for its PR `addDoc` call. Both TR code paths (`submitTransportRequest()` and `generatePRandTR()`) already propagate `urgency_level` correctly. The fix is adding a single field to two PR `addDoc` call sites.

**Primary recommendation:** Three focused edits across two files (`app/views/finance.js` and `app/views/procurement.js`) plus the login.js one-liner. No new files, no Firebase schema changes, no CSS additions required.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10.7.1 | CDN (existing) | Read urgency_level from MRF, write to PR | Already in use; no change needed |
| Vanilla JS ES6 modules | — | Sort logic, DOM manipulation | Project standard; no framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new needed | — | — | All fixes use existing patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending existing sort pattern | Building generic sortTable() util | Extending existing pattern is lower risk, faster, and consistent with current code |
| Propagating urgency at write time | Joining MRF data at read time in finance | Write-time propagation is already the established pattern (see department, requestor_name, etc.); read-time join would require extra Firestore reads |

## Architecture Patterns

### Recommended Project Structure
No structural changes. All edits are within existing files:
```
app/views/
├── finance.js       — sortable headers for PR/TR tables + (no change for urgency — finance reads it)
├── procurement.js   — urgency_level propagation in generatePR() + generatePRandTR()
└── login.js         — logo replacement
```

### Pattern 1: Sortable Headers (existing finance.js pattern)
**What:** `<th onclick="window.sortXxx('col')">` with `<span class="sort-indicator" data-col="col">` inside. Sort state held in two module-level variables. After re-render, iterate indicators and set `↑` / `↓` / `⇅` with color.
**When to use:** Any data table that benefits from user-controlled ordering.
**Example (from finance.js lines 913-930 and 986-1010):**
```javascript
// Sort state (module level)
let prSortColumn = 'pr_id';
let prSortDirection = 'asc';

// In render HTML:
`<th onclick="window.sortMaterialPRs('pr_id')" style="cursor: pointer; user-select: none;">
    PR ID <span class="sort-indicator" data-col="pr_id"></span>
</th>`

// After rendering tbody:
container.querySelectorAll('.sort-indicator').forEach(indicator => {
    const col = indicator.dataset.col;
    if (col === prSortColumn) {
        indicator.textContent = prSortDirection === 'asc' ? ' \u2191' : ' \u2193';
        indicator.style.color = '#1a73e8';
    } else {
        indicator.textContent = ' \u21C5';
        indicator.style.color = '#94a3b8';
    }
});

// Sort function exposed on window:
function sortMaterialPRs(column) {
    if (prSortColumn === column) {
        prSortDirection = prSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        prSortColumn = column;
        prSortDirection = 'asc';
    }
    materialPRs.sort((a, b) => { /* compare */ });
    renderMaterialPRs();
}
window.sortMaterialPRs = sortMaterialPRs;
```

### Pattern 2: Auth Page Logo (from register.js, Phase 45)
**What:** Replace text placeholder div with `<img>` tag inside `.auth-logo`. Include `onerror` to silently hide on load failure.
**Example (register.js line 33-35):**
```javascript
`<div class="auth-logo">
    <img src="./CLMC Registered Logo Cropped (black fill).png"
         alt="CLMC Logo"
         onerror="this.style.display='none'">
</div>`
```
The `.auth-logo img` CSS rule in `styles/views.css` at line 905 already provides `max-width: 120px; height: auto; display: inline-block;`.

### Pattern 3: Urgency Propagation (copy-field-at-write pattern)
**What:** When generating a child document (PR) from a parent (MRF), copy fields that finance consumers need directly onto the child document. This is the same pattern used for `requestor_name`, `department`, `project_name`, etc.
**Example fix (procurement.js ~line 3298-3317, generatePR()):**
```javascript
const prDoc = {
    pr_id: prId,
    mrf_id: mrfData.mrf_id,
    mrf_doc_id: mrfData.id,
    supplier_name: supplier,
    project_code: mrfData.project_code || '',
    project_name: mrfData.project_name,
    service_code: mrfData.service_code || '',
    service_name: mrfData.service_name || '',
    department: mrfData.department || 'projects',
    requestor_name: mrfData.requestor_name,
    urgency_level: mrfData.urgency_level || 'Low',   // <-- ADD THIS
    delivery_address: deliveryAddress,
    items_json: JSON.stringify(supplierItems),
    total_amount: supplierTotal,
    finance_status: 'Pending',
    date_generated: new Date().toISOString().split('T')[0],
    created_at: serverTimestamp(),
    pr_creator_user_id: currentUser.uid,
    pr_creator_name: currentUser.full_name || currentUser.email || 'Unknown User'
};
```
**Same fix needed in `generatePRandTR()` PR addDoc (~line 3583).**

### Anti-Patterns to Avoid
- **Querying MRF at read time in finance:** Don't add extra Firestore reads in `renderMaterialPRs()` to fetch urgency from the MRF. Write-time denormalization is the established pattern.
- **Adding sort state to the render() function's local scope:** Sort state must be module-level so it persists across `onSnapshot` re-renders.
- **Using `querySelector('#sort-indicator')` with ID instead of data-col:** Indicators must be selected via `.sort-indicator` class + `data-col` attribute (existing pattern), not IDs.
- **Sorting the Actions column:** The "Actions" column in both tables does not need a sort header.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sort indicator arrows | Custom SVG icon system | Unicode ↑↓⇅ (already used in finance.js) | Already consistent in codebase |
| Firestore join for urgency | MRF lookup at read time | Write urgency_level at PR creation time | Read-time joins add latency and complexity; pattern already established |

## Common Pitfalls

### Pitfall 1: Forgetting to expose sort functions on window
**What goes wrong:** `sortMaterialPRs` called from `onclick` fails with `TypeError: window.sortMaterialPRs is not a function`
**Why it happens:** Module-scope function not attached to window before onclick fires
**How to avoid:** Add `window.sortMaterialPRs = sortMaterialPRs;` inside `attachWindowFunctions()` (already called in `init()`)
**Warning signs:** Console error on first click of a sortable header

### Pitfall 2: Sort indicators on wrong table
**What goes wrong:** Clicking a PR header updates TR table indicators (or vice versa)
**Why it happens:** Both tables share the class `.sort-indicator` — a `querySelectorAll` at document level would find both
**How to avoid:** Scope the `querySelectorAll` to the table's container element (as done in existing `renderProjectExpenses()` and `renderPOs()` — they scope to `container` variable)

### Pitfall 3: Tab 1 renders headers in render() but sort indicators update in render functions
**What goes wrong:** The `<th>` elements with sort indicators are rendered in `render()` (static HTML), but the sort indicator text is updated inside `renderMaterialPRs()` / `renderTransportRequests()`. This means indicators must be queried after the tbody is rendered.
**Why it happens:** The table `<thead>` is part of the static `render()` output; only `<tbody>` is regenerated on sort.
**How to avoid:** After sorting and re-rendering tbody, update indicators by querying the containing card element.

### Pitfall 4: urgency_level missing on pre-existing PR documents
**What goes wrong:** PRs generated before this fix will still show "Low" in finance (defaulting to `|| 'Low'`)
**Why it happens:** Schema is schemaless — old docs lack the field
**How to avoid:** The `|| 'Low'` default in `renderMaterialPRs()` already handles this gracefully. No backfill migration is needed. New PRs generated after the fix will have the correct value.

### Pitfall 5: Login logo path
**What goes wrong:** Logo image shows broken image icon on login page
**Why it happens:** Netlify serves from root; relative path `./CLMC Registered Logo Cropped (black fill).png` works from root
**How to avoid:** Use the same path as register.js (`./CLMC Registered Logo Cropped (black fill).png`). The `onerror="this.style.display='none'"` fallback already silently hides failures.

## Code Examples

### Sortable PR Table Header (finance.js render section)
```javascript
// Replace static <th> elements in Material PRs table:
`<th onclick="window.sortMaterialPRs('pr_id')" style="cursor: pointer; user-select: none;">
    PR ID <span class="sort-indicator" data-col="pr_id"></span>
</th>
<th onclick="window.sortMaterialPRs('mrf_id')" style="cursor: pointer; user-select: none;">
    MRF ID <span class="sort-indicator" data-col="mrf_id"></span>
</th>
<th>Department / Project</th>  <!-- no sort - composite display field -->
<th onclick="window.sortMaterialPRs('date_generated')" style="cursor: pointer; user-select: none;">
    Date <span class="sort-indicator" data-col="date_generated"></span>
</th>
<th onclick="window.sortMaterialPRs('urgency_level')" style="cursor: pointer; user-select: none;">
    Urgency <span class="sort-indicator" data-col="urgency_level"></span>
</th>
<th onclick="window.sortMaterialPRs('total_amount')" style="cursor: pointer; user-select: none; text-align: right;">
    Total Cost <span class="sort-indicator" data-col="total_amount"></span>
</th>
<th onclick="window.sortMaterialPRs('supplier_name')" style="cursor: pointer; user-select: none;">
    Supplier <span class="sort-indicator" data-col="supplier_name"></span>
</th>
<th>Status</th>   <!-- always Pending, no sort value -->
<th>Actions</th>`
```

### Login Logo Replacement (login.js)
```javascript
// Replace in render():
// OLD:
`<div class="auth-logo">
    <div style="width: 60px; height: 60px; background: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
        <span style="color: white; font-size: 24px; font-weight: 700;">CL</span>
    </div>
</div>`

// NEW (matches register.js exactly):
`<div class="auth-logo">
    <img src="./CLMC Registered Logo Cropped (black fill).png"
         alt="CLMC Logo"
         onerror="this.style.display='none'">
</div>`
```

### Urgency Propagation Fix (procurement.js — two locations)
```javascript
// Location 1: generatePR() prDoc object (~line 3298)
// Location 2: generatePRandTR() PR addDoc (~line 3583)
// Add to both:
urgency_level: mrfData.urgency_level || 'Low',
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `<th>` headers (Pending Approvals) | Sortable headers (per existing finance.js pattern) | Phase 47 | Finance users can sort by urgency/date/amount |
| "CL" text placeholder on login | PNG logo (matching register.js) | Phase 47 | Consistent branding across both auth pages |
| PR created without urgency_level | PR carries urgency_level from MRF | Phase 47 | Finance sees correct urgency; critical items identifiable |

## Open Questions

1. **Which columns should be sortable on the Pending Approvals tables?**
   - What we know: All other finance tables sort all data columns except composite/action columns.
   - What's unclear: Whether "Department / Project" (a composite display built from multiple fields) should be sortable.
   - Recommendation: Skip "Department / Project" and "Status" (always Pending) and "Actions" columns. Sort: PR ID, MRF ID, Date, Urgency, Total Cost, Supplier. Same approach for TR table.

2. **Default sort column for PR/TR tables?**
   - What we know: PO table defaults to `date_issued` desc (newest first). Project Expenses defaults to `projectName` asc.
   - Recommendation: Default to `date_generated` (PRs) / `date_submitted` (TRs) desc — newest pending items at top. This matches how Finance staff would review (newest first).

## Scope Definition

This is what Phase 47 DOES:
- Add sortable headers to Material PRs table (finance.js Tab 1)
- Add sortable headers to Transport Requests table (finance.js Tab 1)
- Replace login page logo with PNG (login.js)
- Add `urgency_level` to PR addDoc in `generatePR()` (procurement.js)
- Add `urgency_level` to PR addDoc in `generatePRandTR()` (procurement.js)

This is what Phase 47 does NOT do:
- Add sortable headers to procurement.js MRF list (out of scope)
- Backfill existing PR documents with urgency_level (not needed — `|| 'Low'` default handles gracefully)
- Change any Firestore Security Rules
- Create any new files

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `app/views/finance.js` lines 42-48 (sort state), 913-980 (Project Expenses sortable headers), 986-1012 (sortProjectExpenses function), 2027-2085 (PO sortable headers), 2091-2115 (sortPOs function), 1148-1167 (renderMaterialPRs urgency display), 1201-1220 (renderTransportRequests urgency display)
- Codebase inspection: `app/views/procurement.js` lines 3298-3317 (generatePR prDoc — missing urgency_level), 3583-3602 (generatePRandTR PR addDoc — missing urgency_level), 3046 (submitTransportRequest TR addDoc — urgency_level present), 3658 (generatePRandTR TR addDoc — urgency_level present)
- Codebase inspection: `app/views/login.js` lines 17-21 (CL text placeholder), `app/views/register.js` lines 33-35 (PNG logo with onerror)
- Codebase inspection: `styles/views.css` lines 900-908 (.auth-logo and .auth-logo img rules already defined)
- File system: `CLMC Registered Logo Cropped (black fill).png` exists at project root

### Secondary (MEDIUM confidence)
- Phase 45 STATE.md decision: "Used local path for CLMC logo img in register.js (avoids GitHub cross-origin dependency); onerror fallback silently hides broken-image state"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns verified from live codebase
- Architecture: HIGH — all three fixes are copy-adapt of working patterns in same files
- Pitfalls: HIGH — identified from direct code inspection of the exact functions involved

**Research date:** 2026-02-28
**Valid until:** 90 days (stable codebase, no external dependencies)
