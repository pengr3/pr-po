# Phase 40: UI/UX Revisions - Research

**Researched:** 2026-02-25
**Domain:** Vanilla JS SPA UI polish — no new collections, no new roles
**Confidence:** HIGH — all six items are surgical edits to well-understood existing code

## Summary

Phase 40 is six independent UI/UX polish items. None introduce new Firestore collections, new user roles, or new routes. Each item targets a specific file and a specific section within it. The research below maps every item to the exact file, function, and lines affected, surfacing the two non-obvious technical landmines: the `date_issued` "Invalid Date" bug root cause and the shared MRF Records function extraction strategy.

The "Invalid Date" bug in the procurement timeline occurs because PO documents store `date_issued` as a Firestore server-generated Timestamp object, but the `showProcurementTimeline()` function passes it directly to `formatDate()` which only handles ISO strings and plain `Date` constructors. `finance.js` already has a `formatPODate()` local helper that correctly handles all three Timestamp formats (`toDate()` method, `{seconds}` object, and plain string). The fix is to extract that pattern to `utils.js` as `formatFirestoreTimestamp()` or to reuse `formatTimestamp()` from `utils.js` (which already handles all three formats — confirm it is used here).

The "My Requests" sub-tab in the `mrf-form` view requires adding a sub-tab system to an existing single-page view that currently has no sub-tab infrastructure. The key decision (from CONTEXT.md) is to extract MRF Records table rendering into a shared/reusable function used by both Procurement and My Requests, rather than duplicating.

**Primary recommendation:** Implement each item as a separate plan (task wave). The six items are fully independent and can be sequenced by complexity: trivial first (label rename, search fields, service type column), moderate next (procurement timeline, client detail modal), highest-effort last (MRF tracking sub-tabs with shared function extraction).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **MRF Request Type Label**: Rename "Material Request" radio button label to "Material/Sub Contractor" in mrf-form.js. One-line text change — no badge, no column, no other display changes needed.

- **Client Detail Modal**: Click client row in Clients tab opens a read-only modal. Modal shows: basic client info (code, company name, contact person, contact details) + linked projects and services. Linked projects/services include financials (budget, contract cost) and are clickable links to their detail pages (#/projects/detail/CODE, #/services/detail/CODE). Inline table editing stays as-is (modal is additive, not a replacement). Delete action stays in the table row only — no delete button in modal.

- **Services Tab Cleanup**: Remove the Service Type column from both Services and Recurring sub-tab tables. Column is redundant since sub-tabs already separate by service type.

- **MRF Tracking for Requestors**: Material Request tab gets 2 sub-tabs: "Material Request Form" and "My Requests". "My Requests" shows the same MRF Records table as Procurement, filtered to requestor_name === currentUser.full_name. Extract MRF Records table rendering into a shared/reusable function (used by both Procurement and My Requests). Shows ALL MRFs submitted by the user (not just active ones). Same search/filter capabilities as the Procurement MRF Records table.

- **MRF Search Improvements**: Add `requestor_name` to search matching (in addition to existing mrf_id and project_name). Add `service_name` to search matching (for services-department MRFs).

- **Procurement Timeline Fixes**: Remove all emojis (📋, 🛒, 📄) from timeline items — use simple dot indicators only. Fix "Invalid Date" bug on PO entries (date parsing issue). Group PRs with their child POs as PR→PO pairs (not flat list) for clarity when MRF has multiple PRs/POs. Add "Procurement Status" section per PO showing current procurement status (Pending Procurement / Procuring / Procured / Delivered) — current status only, not full history. Audit timeline function and fix any other issues found (missing CSS for rejected/pending states, etc.).

### Claude's Discretion

- Timeline visual grouping approach for PR→PO pairs (indentation, nesting, or other visual hierarchy)
- Client modal layout and styling (follow existing modal patterns)
- Shared MRF Records function extraction approach (module structure, where to place it)
- Services tab dead code audit (remove any unreferenced functions found during cleanup)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS ES6 modules | N/A | All logic | Project constraint — no framework |
| Firebase Firestore v10.7.1 | CDN | Data source | Already in use |

### No New Dependencies
This phase is pure UI polish. No new libraries, no new Firebase imports beyond what each file already uses.

---

## Architecture Patterns

### Pattern 1: Sub-tab system on mrf-form route
**What:** The `mrf-form` view currently has no sub-tab infrastructure. Adding "My Requests" sub-tab means the view must accept an `activeTab` parameter from the router (which already parses `#/mrf-form/my-requests` to `tab: 'my-requests'`).

**Current state:** `render()` and `init()` in `mrf-form.js` both take no parameters (they ignore the optional `activeTab` argument). The router already supports sub-routes via `parseHash()`.

**Required change:**
```javascript
// mrf-form.js render() signature change
export function render(activeTab = 'form') {
    if (activeTab === 'my-requests') {
        return renderMyRequestsView();
    }
    return renderMRFForm();
}

export async function init(activeTab = 'form') {
    if (activeTab === 'my-requests') {
        await initMyRequests();
    } else {
        await initMRFForm();
    }
}
```

**Router compatibility:** The router already calls `render(tab)` and `init(tab)`. The `mrf-form` route currently has no `defaultTab` — adding `defaultTab: 'form'` to the router entry is required so `#/mrf-form` (no sub-tab) still shows the form.

**CRITICAL:** The router does NOT call `destroy()` when switching tabs within the same view. So listeners set up by one sub-tab persist when switching to the other. Design `init()` to be idempotent: clean up any existing listeners before setting up new ones, OR track active sub-tab and skip redundant initialization.

### Pattern 2: Shared MRF Records function extraction
**What:** The MRF Records table is currently rendered by `loadPRPORecords()` in `procurement.js`. This is a 300+ line function that loads data via `onSnapshot`, filters it, and renders via `renderPRPOTable()`.

**Extraction approach:** The rendering logic (`renderPRPOTable()` / `filterPRPORecords()`) is what needs sharing — not the data loading. The simplest approach that avoids module coupling:

Option A (Recommended): Extract a `renderMRFRecordsTable(mrfsData, options)` pure function into `app/components.js` or a new `app/mrf-records-table.js`. Both procurement.js and mrf-form.js import and call it. The `options` param carries: `showTimeline`, `showPRPO`, `filterByRequestor`, etc.

Option B: Keep the rendering inside procurement.js and have mrf-form.js fetch MRF data independently, calling a shared `renderMRFRow()` helper. Simpler but means duplicate filter/pagination state.

**Decision area:** CONTEXT.md leaves the extraction approach to Claude's discretion. Option A (shared rendering function) is recommended because CONTEXT.md explicitly says "unify into a single function, don't duplicate."

**Key constraint:** "My Requests" shows ALL MRFs for the user (not just approved). The shared function must accept a filter function, not hard-code status filtering.

### Pattern 3: Client detail modal with linked data
**What:** clients.js must fetch linked projects and services when a client row is clicked. Two async Firestore queries (`where('client_code', '==', clientCode)` on both `projects` and `services` collections).

**Pattern from codebase:** `showExpenseBreakdownModal()` in `expense-modal.js` shows how async data is fetched and displayed in a modal. The procurement.js `viewPRDetails()` / `viewPODetails()` pattern uses `createModal()` from components.js, followed by `openModal()`.

```javascript
// clients.js — new function
async function showClientDetail(clientId) {
    const client = clientsData.find(c => c.id === clientId);
    if (!client) return;

    showLoading(true);
    try {
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(collection(db, 'projects'), where('client_code', '==', client.client_code))),
            getDocs(query(collection(db, 'services'), where('client_code', '==', client.client_code)))
        ]);

        const projects = [];
        projectsSnap.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
        const services = [];
        servicesSnap.forEach(doc => services.push({ id: doc.id, ...doc.data() }));

        const modalHtml = buildClientDetailModal(client, projects, services);
        // Inject into DOM and show
    } finally {
        showLoading(false);
    }
}
```

**Modal injection pattern:** Since `clients.js` renders via `render()` returning HTML string, a modal div must be appended to the DOM at runtime (not in the render template). Use `document.body.insertAdjacentHTML('beforeend', modalHtml)` then clean up in destroy() — OR reuse the existing `createModal()` + `openModal()` infrastructure with a stable placeholder div in the rendered HTML.

**Row click conflict:** The clients table currently has Edit/Delete buttons. Adding a row click for the modal must use `event.stopPropagation()` on action buttons (same pattern as services.js line 958 `onclick="event.stopPropagation()"`).

### Pattern 4: Timeline PR→PO grouping
**What:** The current `showProcurementTimeline()` builds a flat `timelineItems` array with MRF, then PRs, then TRs, then POs. Grouping PRs with their child POs means reorganizing into pairs: for each PR, find POs where `po.pr_id === pr.pr_id`.

**Data already available:** POs fetched from Firestore for the timeline include `pr_id` field (confirmed in schema: `pr_id` is on PO documents). PRs include `pr_id`. So grouping is a client-side join — no new Firestore queries needed.

**Recommended visual approach (Claude's discretion):** Indented child items. PR row with normal timeline dot, PO rows below it with left-margin indent (e.g., `padding-left: 1.5rem; border-left: 2px solid #e5e7eb;`). This requires extending `createTimeline()` in components.js to support nested items OR building the timeline HTML inline in `showProcurementTimeline()` without using `createTimeline()`.

**createTimeline() limitation:** The current `createTimeline()` function only supports flat lists — each item is a div with a dot. Extending it to support nesting would require adding a `children` property or a `level` property. Since the timeline is only used by `showProcurementTimeline()` in this phase, it is simpler to build inline HTML in that function and bypass `createTimeline()`.

### Anti-Patterns to Avoid
- **Duplicating MRF Records logic:** CONTEXT.md explicitly says "don't duplicate" — extract to shared function.
- **Using `formatDate()` on Firestore Timestamp objects:** `formatDate()` calls `new Date(dateString)` which silently produces Invalid Date when passed a Timestamp object `{seconds, nanoseconds}`. Use `formatTimestamp()` from utils.js or the `formatPODate()` pattern from finance.js.
- **Adding a delete button to the client detail modal:** Locked decision — delete stays in table row only.
- **Registering onclick event handlers as row-level `onclick` when Edit row is active:** clients.js currently replaces the row with input fields when `editingClient === client.id`. A modal trigger on the normal row must check that the row is not in edit mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Firestore Timestamp → display date | Custom date parser | `formatTimestamp()` from utils.js | Already handles toDate(), seconds, and string formats |
| Modal infrastructure | Custom dialog | `createModal()` + `openModal()` from components.js | Consistent with existing PRDetails/PODetails modals |
| Sub-tab routing | Custom hash parser | `navigateToTab()` from router.js + `window.navigateToTab = navigateToTab` pattern | Already exposed to window, used by services.js |

---

## Common Pitfalls

### Pitfall 1: Firestore Timestamp on date_issued causes "Invalid Date"
**What goes wrong:** PO documents store `date_issued` as a Firestore server-generated Timestamp (set via `serverTimestamp()` when the PO is created in finance.js). The Timestamp object is `{seconds: N, nanoseconds: N}` with a `.toDate()` method. Calling `formatDate(po.date_issued)` passes this object to `new Date(timestamp_object)` which returns Invalid Date.

**Root cause:** `formatDate()` in utils.js does `const date = new Date(dateString)` with no Timestamp-specific handling. `formatTimestamp()` in utils.js DOES handle Timestamps correctly (checks `toDate()` method and `.seconds` property).

**How to avoid:** In `showProcurementTimeline()`, replace `formatDate(po.date_issued)` with `formatTimestamp(po.date_issued)`. Also replace `new Date(po.date_issued).toLocaleDateString()` in the PO Tracking table (`renderPOTrackingTable()`) with the same pattern.

**Where this occurs in procurement.js:**
- Line 3783: `new Date(po.date_issued).toLocaleDateString()` — PO Tracking table
- Line 4444: `formatDate(po.date_issued)` — showProcurementTimeline
- Line 4187: `new Date(po.date_issued).toLocaleDateString()` — viewPODetails panel
- Lines 4322, 4337: `new Date(po.date_issued).toLocaleDateString()` — viewPOTimeline (text-only function, lower priority)

**Finance.js already fixed:** `formatPODate()` in finance.js handles all three formats. The `formatTimestamp()` in utils.js already has the same logic — use that to avoid duplicating the fix.

### Pitfall 2: mrf-form sub-tab listener leak
**What goes wrong:** When user navigates `#/mrf-form/form` → `#/mrf-form/my-requests`, the router calls `render('my-requests')` and `init('my-requests')` but does NOT call `destroy()`. Any Firestore `onSnapshot` listener set up by `init('form')` (the projectsListener, servicesListener) stays alive.

**Root cause:** CLAUDE.md documents this explicitly — "Router DOES NOT call destroy() when switching tabs within same view."

**How to avoid:** Track which sub-tab's listeners are currently active. On `init(activeTab)`, check if existing listeners belong to a different sub-tab and unsubscribe them before setting up new ones. Alternatively, store all listeners in the module-level `listeners` array regardless of sub-tab, and `init()` always calls a local cleanup first.

### Pitfall 3: Client modal row click conflicting with edit mode
**What goes wrong:** When `editingClient !== null`, the table row renders as input fields, not a clickable row. If the `onclick` for the modal is on the `<tr>` itself, it may fire even on edit rows.

**How to avoid:** Guard `showClientDetail()` with `if (editingClient === clientId) return;`. OR only add the `onclick` to non-edit rows in the template (edit rows have no modal trigger).

### Pitfall 4: Services table colspan mismatch after column removal
**What goes wrong:** The `renderServicesTable()` function has `colspan="8"` in its empty-state row (line 914). Removing the Service Type column reduces the column count from 8 to 7. Missing colspan update causes a visual misalignment.

**How to avoid:** When removing the Service Type `<th>` from the header and the `<td>` from the body, also update all `colspan` references in empty-state rows and pagination containers.

**Column count check:** Current services.js table has 8 columns: Code, Name, Client, Service Type, Internal Status, Project Status, Active, Actions. Removing Service Type → 7 columns. Both the empty-state `colspan` and the loading `colspan` (line 276) must be updated.

### Pitfall 5: Shared MRF function import causes circular dependency
**What goes wrong:** If the shared MRF Records rendering function is placed in `procurement.js` and then imported by `mrf-form.js`, it creates a circular import chain (mrf-form → procurement → ...).

**How to avoid:** Place the shared function in `components.js` or a dedicated `mrf-records-table.js` module that has no imports from procurement.js or mrf-form.js.

### Pitfall 6: MRF search filter — service_name field presence
**What goes wrong:** Legacy MRF documents (pre-Phase 29) do not have a `service_name` field. Accessing `mrf.service_name.toLowerCase()` on such documents throws `TypeError: Cannot read properties of undefined`.

**How to avoid:** The filter already uses optional chaining pattern — follow the same pattern: `(mrf.service_name && mrf.service_name.toLowerCase().includes(searchInput))`. The existing code at line 2341-2342 uses `&&` short-circuit — replicate exactly.

---

## Code Examples

### Current MRF search filter (procurement.js ~line 2340)
```javascript
const matchesSearch = !searchInput ||
    (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(searchInput)) ||
    (mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput));
```

**After adding requestor_name and service_name:**
```javascript
const matchesSearch = !searchInput ||
    (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(searchInput)) ||
    (mrf.project_name && mrf.project_name.toLowerCase().includes(searchInput)) ||
    (mrf.requestor_name && mrf.requestor_name.toLowerCase().includes(searchInput)) ||
    (mrf.service_name && mrf.service_name.toLowerCase().includes(searchInput));
```

### Correct Timestamp handling (use formatTimestamp from utils.js)
```javascript
// utils.js formatTimestamp() already handles all three formats:
// 1. Firestore Timestamp with .toDate() method
// 2. {seconds: N, nanoseconds: N} plain object
// 3. ISO string / other Date-parseable string

// In showProcurementTimeline(), replace:
date: formatDate(po.date_issued),
// With:
date: formatTimestamp(po.date_issued) || 'N/A',
```

### MRF request type label change (mrf-form.js line 69)
```javascript
// Current:
<label for="typeMaterial">Material Request</label>
// Change to:
<label for="typeMaterial">Material/Sub Contractor</label>
```

Note: The `request_type` value stored in Firestore remains `'material'` — only the display label changes.

### Client detail modal trigger (clients.js — renderClientsTable modification)
```javascript
// Normal row (non-edit state): add onclick to <tr>
return `
    <tr onclick="window.showClientDetail('${client.id}')" style="cursor: pointer;" class="clickable-row">
        <td><strong>${client.client_code}</strong></td>
        ...
        ${showEditControls ? `
            <td style="white-space: nowrap;" onclick="event.stopPropagation()">
                <button ...>Edit</button>
                <button ...>Delete</button>
            </td>
        ` : ...}
    </tr>
`;
```

### Timeline PR→PO grouping logic
```javascript
// Group POs by pr_id
const posByPR = {};
pos.forEach(po => {
    const prId = po.pr_id || '_unlinked';
    if (!posByPR[prId]) posByPR[prId] = [];
    posByPR[prId].push(po);
});

// Build grouped timeline HTML (bypass createTimeline for nesting)
prs.forEach(pr => {
    // PR entry
    timelineItems.push({
        title: `Purchase Request: ${pr.pr_id}`,
        date: formatTimestamp(pr.date_generated) || formatDate(pr.date_generated),
        description: `Supplier: ${pr.supplier_name} | ₱${formatCurrency(pr.total_amount)}`,
        status: pr.finance_status === 'Approved' ? 'completed' :
                pr.finance_status === 'Rejected' ? 'rejected' : 'pending',
        children: (posByPR[pr.pr_id] || []).map(po => ({
            title: `Purchase Order: ${po.po_id}`,
            date: formatTimestamp(po.date_issued) || 'N/A',
            description: `Supplier: ${po.supplier_name}`,
            status: po.procurement_status === 'Delivered' ? 'completed' : 'active',
            procurementStatus: po.procurement_status || 'Pending Procurement'
        }))
    });
});
```

### Services table column removal
In `services.js render()` — remove the `<th>` for Service Type:
```javascript
// REMOVE this th:
<th onclick="window.sortServices('service_type')" style="cursor: pointer; user-select: none;">
    Service Type <span class="sort-indicator" data-col="service_type"></span>
</th>
```

In `renderServicesTable()` — remove the `<td>` for service type:
```javascript
// REMOVE this td from the row template:
<td>${serviceTypeDisplay}</td>
```

Update empty-state colspan from 8 to 7:
```javascript
// Line 914 — change colspan="8" to colspan="7"
// Line 276 (loading row) — change colspan="8" to colspan="7"
```

---

## File-Level Change Map

| Feature | Primary File | Secondary Files | Change Type |
|---------|-------------|----------------|-------------|
| MRF request type label | `app/views/mrf-form.js` | None | Text-only (line 69) |
| MRF search improvements | `app/views/procurement.js` | None | 2-line addition in filterPRPORecords() |
| Services tab column cleanup | `app/views/services.js` | None | Remove th + td + update colspans |
| Procurement timeline fixes | `app/views/procurement.js` | `app/components.js` (if createTimeline extended) | showProcurementTimeline() rewrite |
| Client detail modal | `app/views/clients.js` | None (uses existing createModal/openModal pattern) | New showClientDetail() + row onclick |
| MRF tracking for requestors | `app/views/mrf-form.js` | `app/components.js` or new module | Sub-tab system + shared rendering function |

---

## Open Questions

1. **Where to place the shared MRF Records rendering function**
   - What we know: Must not be in procurement.js (circular import risk) or mrf-form.js (same problem inverted)
   - What's unclear: Whether components.js is the right home (it's getting large) or a new `mrf-records-table.js` module is cleaner
   - Recommendation: Create `app/views/mrf-records-table.js` as a thin rendering module, imported by both `procurement.js` and `mrf-form.js`. This follows the `expense-modal.js` and `edit-history.js` shared module precedent.

2. **Should the "My Requests" view have real-time updates via onSnapshot?**
   - What we know: Procurement's MRF Records uses `onSnapshot` for live updates; the user's own MRFs changing during a session is plausible
   - What's unclear: Performance impact of a second listener when already on the mrf-form view
   - Recommendation: Use `getDocs` (one-time fetch) for "My Requests" — simpler, no listener cleanup risk, and users can refresh manually. The MRF form's projects/services listeners are already live.

3. **Does the timeline modal need CSS fixes for "rejected" and "pending" states?**
   - What we know: `createTimeline()` applies `item.status` as a CSS class (`.timeline-item.rejected`, `.timeline-item.pending`). The current `timeline` CSS in components.css/views.css may only style `.completed` and `.active`.
   - Recommendation: Audit the timeline CSS during implementation — add `.timeline-item.rejected` (red dot) and `.timeline-item.pending` (gray dot) rules if missing.

---

## Sources

### Primary (HIGH confidence)
- Direct source reading: `app/views/procurement.js` — showProcurementTimeline(), filterPRPORecords(), renderPOTrackingTable(), viewPODetails()
- Direct source reading: `app/views/mrf-form.js` — render(), init(), destroy(), radio button label at line 69
- Direct source reading: `app/views/clients.js` — renderClientsTable(), full file structure
- Direct source reading: `app/views/services.js` — render() (services table header), renderServicesTable() (line 908-976)
- Direct source reading: `app/views/finance.js` lines 11-29 — formatPODate() showing correct Timestamp handling pattern
- Direct source reading: `app/utils.js` — formatDate() (line 29-42) and formatTimestamp() (line 49-70) implementations
- Direct source reading: `app/components.js` — createTimeline(), createModal(), openModal(), closeModal()
- Direct source reading: `app/router.js` — parseHash(), navigateToTab(), route definitions
- Direct source reading: `.planning/phases/40-.../40-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- CLAUDE.md CRITICAL note: "Router DOES NOT call destroy() when switching tabs within same view" — confirmed by router.js source review

---

## Metadata

**Confidence breakdown:**
- MRF label rename: HIGH — single line change, exact location found (mrf-form.js line 69)
- MRF search additions: HIGH — exact insertion point found (filterPRPORecords(), lines 2340-2342)
- Services column removal: HIGH — exact th/td locations found, colspan side-effect documented
- Timeline fixes: HIGH — root cause of Invalid Date confirmed (formatDate vs formatTimestamp on Timestamp objects)
- Client detail modal: HIGH — pattern is well-established in codebase (createModal/openModal)
- MRF tracking sub-tabs: MEDIUM — extraction strategy is clear but requires more design choices (module placement, listener strategy)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable codebase, no external dependencies)
