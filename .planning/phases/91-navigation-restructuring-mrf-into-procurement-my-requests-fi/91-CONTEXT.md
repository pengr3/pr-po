---
name: 91-CONTEXT
description: Decisions for Phase 91 — Navigation Restructuring. New "Request" sub-tab (first tab) inside Procurement absorbs mrf-form.js; 4 new sub-tab permission keys replace the mrf_form key; "My Requests" added to the All Departments dropdown in MRF Records; hidden tabs (not view-only banners) for access:false sub-tabs.
type: phase-context
---

# Phase 91: Navigation Restructuring — MRF into Procurement, My Requests Filtered View, Role Permission Overhaul — Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 91 consolidates the top navigation by:
1. **Removing the standalone "Material Request" nav link** (`#/mrf-form`) and absorbing MRF submission into Procurement as a new "Request" sub-tab (first in the tab row).
2. **Adding "My Requests" to the existing MRF Records filter dropdown** — a fourth option that narrows the table to the current user's own submissions.
3. **Replacing the `mrf_form` permission key with 4 sub-tab permission keys** (`procurement_request`, `procurement_mrfs`, `procurement_suppliers`, `procurement_records`) across all 7 role templates, enabling fine-grained access control inside the Procurement view.
4. **Updating Firestore Security Rules** to reflect the merged access model.

### In scope
- Remove `data-route="mrf_form"` nav links (desktop + mobile) from `index.html`
- Remove `#/mrf-form` route from `router.js`; keep as a redirect to `#/procurement` for backward compatibility
- Add "Request" as a new first sub-tab in `procurement.js` — content/logic migrated from `mrf-form.js`
- Default route `#/procurement` lands on "Request" sub-tab for all roles
- Add "My Requests" option to the All Departments dropdown in MRF Records; filters by `requestor_user_id === currentUser.uid`
- Apply existing Phase 7 project-scope filtering (`getAssignedProjectCodes()`) to the Records tab for operations_user (same pattern already live in MRF Management tab)
- Introduce 4 new sub-tab permission keys in `seed-roles.js` and update all 7 role documents in Firestore
- Sub-tabs with `access: false` are **hidden** from the tab row (not rendered), not shown with view-only notices
- `hasTabAccess()` / `canEditTab()` extended to support sub-tab keys
- Firestore Security Rules updated to reflect new permission structure

### Out of scope
- Any changes to the MRF form UI/UX itself — "Request" tab renders the same form
- Changes to Finance, Proposals, or other views
- Removing the `mrf_form` key from existing Firestore documents (clean-up can be deferred; new keys coexist)
- Pagination or search changes in MRF Records

</domain>

<decisions>
## Implementation Decisions

### D-01 — "Request" sub-tab: name, position, and default

The standalone `#/mrf-form` route is retired. MRF submission moves inside Procurement as a **new first sub-tab named "Request"**.

Tab order after this phase: **Request | MRF Management | Supplier Mgmt | MRF Records**

When a user navigates to `#/procurement` (no tab specified), the default tab is **"Request" for all roles**. If the active role does not have `procurement_request: access: true`, the router falls through to the first tab in the row that the user can access (e.g., a `procurement`-role user lands on MRF Management).

### D-02 — "My Requests" filter — dropdown option in MRF Records

The existing "All Departments" dropdown in MRF Records gains a fourth option: **"My Requests"**.

Dropdown options after: All Departments | Projects | Services | **My Requests**

When "My Requests" is selected, the MRF Records table filters to show only records where `requestor_user_id === currentUser.uid`. This is a **manual toggle** — it is not auto-applied for any role. Default remains "All Departments" for everyone.

Additionally, the existing Phase 7 project-scope filtering (`getAssignedProjectCodes()`) that already runs on the MRF Management tab **must also be applied to the MRF Records tab** for `operations_user`. The "My Requests" dropdown option narrows within that already-scoped set.

### D-03 — Sub-tab permission keys (replace `mrf_form`)

Four new permission keys are introduced under `permissions.tabs` in each role template, replacing the semantic role of the retired `mrf_form` key:

| Key | Controls |
|-----|----------|
| `procurement_request` | Visibility and edit of the "Request" (MRF submission) sub-tab |
| `procurement_mrfs` | Visibility and edit of the "MRF Management" sub-tab |
| `procurement_suppliers` | Visibility and edit of the "Supplier Management" sub-tab |
| `procurement_records` | Visibility and edit of the "MRF Records" sub-tab |

The overall `procurement` key remains as the **nav-level gate** (shows/hides the Procurement link in the top nav). Sub-tab keys control what is rendered inside the Procurement view.

**Sub-tabs with `access: false` are hidden from the tab row entirely** — they do not appear and show no view-only notice.

**Full permission matrix for the 4 new keys:**

| Role | procurement_request | procurement_mrfs | procurement_suppliers | procurement_records |
|------|---------------------|------------------|-----------------------|---------------------|
| super_admin | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` |
| operations_admin | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` |
| operations_user | `{access:true, edit:true}` | `{access:true, edit:false}` | `{access:true, edit:false}` | `{access:true, edit:false}` |
| services_admin | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` |
| services_user | `{access:true, edit:true}` | `{access:true, edit:false}` | `{access:true, edit:false}` | `{access:true, edit:false}` |
| finance | `{access:false, edit:false}` | `{access:false, edit:false}` | `{access:false, edit:false}` | `{access:false, edit:false}` |
| procurement | `{access:false, edit:false}` | `{access:true, edit:true}` | `{access:true, edit:true}` | `{access:true, edit:true}` |

`services_user` mirrors `operations_user`; `services_admin` mirrors `operations_admin`.

### D-04 — `mrf_form` permission key fate

The `mrf_form` key is **deprecated but not deleted** from role templates. It will no longer be used for routing or sub-tab gating. The `procurement_request` key takes over its semantic role. Downstream agents should NOT write new code that reads `mrf_form` as an access gate — use `procurement_request` instead.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core files being modified
- `app/views/procurement.js` — existing 3-tab Procurement view; "Request" sub-tab added as first tab; Records tab gets project-scope filtering and My Requests dropdown option
- `app/views/mrf-form.js` — existing MRF submission form (536 lines); its render/init logic is the source for the new Request sub-tab content
- `app/router.js` — `#/mrf-form` route to be removed (or redirected); default tab for `#/procurement` changes to `request`; `routePermissionMap` entry for `/mrf-form` to be removed
- `index.html` — nav links: remove `<a data-route="mrf_form">` from both desktop `.nav-links` and mobile `.mobile-nav-items`

### Permission system
- `app/seed-roles.js` — role template definitions; 4 new sub-tab permission keys added per role (lines 17-93 define the 5 roles; `services_admin` and `services_user` templates must be added here too)
- `app/permissions.js` — `hasTabAccess(tabId)` and `canEditTab(tabId)` are the check helpers; must work with the new sub-tab key names
- `app/auth.js` — `updateNavForAuth()` (line 400) controls nav link visibility via `permissions.tabs[route].access`; Phase 88 D-02 pattern for hard-gating proposals is a reference for any special-casing needed

### Phase 7 project-scope pattern (extend to Records tab)
- `app/views/procurement.js` lines ~2324–2401 — `getAssignedProjectCodes()`, `cachedAllMRFs`, `assignmentsChanged` event listener; this pattern runs on the mrfs tab and must be replicated in the records tab

### Firestore Security Rules
- `firestore.rules` — lines 30, 70-89: `mrf_form` permission check helpers and `operations_user`/`services_user` assignment scoping; update to reference `procurement_request` key

### No external specs
Requirements for this phase are fully captured in the decisions above and the ROADMAP.md success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `window.getAssignedProjectCodes()` — already available globally; returns array of project codes for the current user or `null` if no scoping applies; used in procurement.js MRF Management tab; reuse verbatim in Records tab
- `cachedAllMRFs` array in procurement.js — holds raw MRF snapshot for re-filtering; the Records tab likely has its own cached array; same pattern applies
- `assignmentsChanged` event on `window` — fires when user's assigned project codes change; both MRF Management and Records tab listeners must subscribe

### Established Patterns
- **Sub-tab navigation in procurement.js**: `render(activeTab)` generates HTML with `class="${activeTab === 'mrfs' ? 'active' : ''}"` conditionals; "request" becomes a new valid activeTab value; router already passes the tab param
- **Tab row hiding via access flag**: The Proposals nav link uses a hard super_admin gate in `auth.js` (line 418-421); for sub-tabs within Procurement, the gate should be driven by the new permission keys, not a hard role check
- **`routePermissionMap` in router.js** (line 8-28): maps path → tab permission key; `/mrf-form` currently maps to `'mrf_form'`; this entry should be removed (route is deleted) or remapped
- **View lifecycle**: `mrf-form.js` exports `render()`, `init()`, `destroy()` — its logic can be imported and called from within the `request` sub-tab section of procurement.js without a full inline migration, OR it can be inlined; researcher should assess the cleanest approach given procurement.js is already 4,400+ lines

### Integration Points
- `index.html` desktop nav (line 82) and mobile nav (line 109): both have `data-route="mrf_form"` links that must be removed
- `router.js` `routePermissionMap` (line 17): `/mrf-form` → `mrf_form`; remove this entry when the route is retired
- `permissions.js` `hasTabAccess()` (line 38): currently checks `currentPermissions.tabs[tabId]?.access`; works as-is for new key names since they follow the same flat structure
- `requestor_user_id` field on MRF documents (stamped since Phase 84): the "My Requests" filter compares this field against `window.getCurrentUser?.().uid`; field is already present on all new MRFs; legacy MRFs without it will simply not match (acceptable)

</code_context>

<specifics>
## Specific Ideas

- **"My Requests" dropdown placement**: The user confirmed via screenshot — add as a 4th option in the existing "All Departments" `<select>` dropdown already present in the MRF Records toolbar. No new toolbar element needed.
- **Tab naming**: The new sub-tab is called exactly **"Request"** (not "Submit MRF", "New MRF", or "Material Request").
- **services_user and services_admin**: These two roles exist in Firestore but are absent from `seed-roles.js` defaults. The researcher should confirm their current permission structure in Firestore before writing the updated seed data; the target permissions are defined in D-03.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 91 — Navigation Restructuring — MRF into Procurement, My Requests Filtered View, Role Permission Overhaul*
*Context gathered: 2026-05-13*
