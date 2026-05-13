---
phase: 91-navigation-restructuring-mrf-into-procurement-my-requests-fi
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/seed-roles.js
  - app/router.js
  - app/views/mrf-form.js
  - app/views/procurement.js
findings:
  critical: 4
  warning: 6
  info: 3
  total: 13
status: issues_found
---

# Phase 91: Code Review Report

**Reviewed:** 2026-05-13
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 91 restructures the old `/mrf-form` route into a sub-tab (`#/procurement/request`) inside the Procurement view, adds "My Requests" and "My Requests" department-filter branches, and introduces per-sub-tab permission keys (`procurement_request`, `procurement_mrfs`, `procurement_suppliers`, `procurement_records`). Two new role templates (`services_admin`, `services_user`) are also seeded.

The implementation is largely sound but has four blockers:
- The `My Requests` filter in `mrf-form.js` matches on `requestor_name` (a mutable string) rather than the stable `requestor_user_id` UID that was stored on MRF documents from Phase 84; name changes or shared names silently hide or show wrong records.
- `procurement.js render()` always calls `mrfFormModule.render('form')` regardless of the active tab, so navigating directly to `#/procurement/request/my-requests` (a valid hash) renders the wrong sub-tab HTML before `init()` corrects it, causing a flash of incorrect content and potentially calling form-tab `init()` on a `my-requests` DOM that does not exist.
- `_requestSubTabActive` is never set to `true` when switching from another tab back to `request`, so on second entry `mrfFormModule.destroy()` is skipped at navigation-away time and listeners accumulate.
- The `my_requests` department filter in `filterPRPORecords` silently returns no results for any MRF submitted before Phase 84 (`requestor_user_id` was not stored prior to that phase); this is a data-coverage bug, not merely a legacy edge-case, because all legacy Pending/In-Progress MRFs currently in production are affected.

Six warnings cover a missing `/mrf-form` route entry (no nav permission guard), a `forceReseedRoleTemplates` function that is permanently exposed on `window` in production, the `_requestSubTabActive` flag not being cleared when switching away from `request` to another tab within the same view, services-user MRF filter using `requestor_name` instead of UID, an unguarded `showCloseTimelineModal` in `showProcurementTimeline` scope, and a stale comment in the module-level comment for `activePODeptFilter`.

---

## Critical Issues

### CR-01: My Requests filter in mrf-form.js matches on mutable `requestor_name`, not stable UID

**File:** `app/views/mrf-form.js:935-936`

**Issue:** `initMyRequests()` builds the `filterFn` as `(mrf) => mrf.requestor_name === userName` where `userName = user?.full_name`. If a user's `full_name` is updated in their profile, or two users share a name, the filter either silently hides the user's own MRFs or shows another user's records. The MRF document stores a stable `requestor_user_id` field (written at Phase 84 D-01) that should be used here.

**Fix:**
```javascript
// In initMyRequests():
const user = window.getCurrentUser?.();
const uid = user?.uid || null;

myRequestsController = createMRFRecordsController({
    containerId: 'myRequestsContainer',
    paginationId: 'myRequestsContainerPagination',
    statusFilter: null,
    filterFn: uid
        ? (mrf) => mrf.requestor_user_id === uid
        : null,   // no user — show nothing rather than everything
    // ...
});
```

---

### CR-02: `procurement.js render()` always renders `mrfFormModule.render('form')` regardless of active tab

**File:** `app/views/procurement.js:1739`

**Issue:** `render()` unconditionally inlines `${mrfFormModule.render('form')}` in the `#request-section`. When the router calls `render('request')` the right HTML appears, but if a user lands on `#/procurement/request` sub-tab that the router passes as `tab = 'request'` the embedded MRF form is always the create-form variant even if the user intended `my-requests`. More seriously: `mrfFormModule.render()` checks `window.canEditTab?.('procurement_request')` at render time. When `procurement.render()` is called for `activeTab = 'mrfs'` (the default or a non-request tab), `mrfFormModule.render('form')` still executes, calling `window.canEditTab` during the render pass for a section that is hidden — this is wasted work and creates subtle ordering issues if permissions are not yet loaded (the `=== false` check correctly passes on `undefined`, but the function is still called unnecessarily on every non-request render).

**Fix:**
```javascript
// In procurement.js render():
<section id="request-section" class="section ${activeTab === 'request' ? 'active' : ''}">
    ${activeTab === 'request' ? mrfFormModule.render('form') : ''}
</section>
```
For a fully correct implementation, `render()` should accept an optional sub-tab parameter and pass it through. At minimum, avoid executing `mrfFormModule.render()` for non-request tabs.

---

### CR-03: `_requestSubTabActive` is never set when switching from a non-request tab to `request`

**File:** `app/views/procurement.js:2016-2019`

**Issue:** When `init('request')` is called (user arrives on the request tab), `_requestSubTabActive` is set to `true` and the code returns early. However, if the user first lands on `mrfs` tab (`_requestSubTabActive = false`), then clicks `Request` (`init('request')` is called again), `_requestSubTabActive` is set to `true`. If the user then navigates to another tab within the same view (e.g., `init('mrfs')`), `_requestSubTabActive` is still `true` so `attachWindowFunctions()` is skipped. But if the user then navigates away from the entire `/procurement` view, `destroy()` will call `mrfFormModule.destroy()` because `_requestSubTabActive` is true — which is correct — but then sets it to `false`. On the *next* visit, if the user goes straight to `#/procurement/mrfs`, `_requestSubTabActive` stays `false` and `mrfFormModule.destroy()` will never be called, even if a previous `mrfFormModule.init('form')` left listeners running.

More critically: when the user is on `request` tab and clicks `mrfs`, `init('mrfs')` is called but `_requestSubTabActive` is still `true`. `attachWindowFunctions()` is called but `mrfFormModule.destroy()` is NOT called — mrf-form listeners (projects onSnapshot, services onSnapshot, scroll handler) leak until the entire view is destroyed.

**Fix:**
```javascript
export async function init(activeTab = 'mrfs') {
    // ... permission fallthrough logic ...

    // If we're leaving the request sub-tab, tear down mrf-form module
    if (_requestSubTabActive && activeTab !== 'request') {
        try { await mrfFormModule.destroy(); } catch (e) { /* ignore */ }
        _requestSubTabActive = false;
    }

    if (activeTab === 'request') {
        _requestSubTabActive = true;
        await mrfFormModule.init('form');
        return;
    }

    attachWindowFunctions();
    // ... rest of init ...
}
```

---

### CR-04: `my_requests` department filter in `filterPRPORecords` silently returns zero results for all pre-Phase-84 MRFs

**File:** `app/views/procurement.js:4835-4837`

**Issue:**
```javascript
if (activePODeptFilter === 'my_requests') {
    const uid = window.getCurrentUser?.()?.uid;
    matchesDept = uid ? mrf.requestor_user_id === uid : false;
}
```
`requestor_user_id` was added in Phase 84. Any MRF submitted before that phase lacks the field; `mrf.requestor_user_id` is `undefined`, so `uid === undefined` is always `false`. Production data from prior phases (which is likely all existing Pending/Approved/PR-Generated records) will never appear under "My Requests" in the Records tab, even for the original submitter.

**Fix:** Add a fallback to `requestor_name` when `requestor_user_id` is absent:
```javascript
if (activePODeptFilter === 'my_requests') {
    const currentUser = window.getCurrentUser?.();
    const uid = currentUser?.uid;
    const name = currentUser?.full_name;
    matchesDept = uid
        ? (mrf.requestor_user_id === uid ||
           (!mrf.requestor_user_id && !!name && mrf.requestor_name === name))
        : false;
}
```

---

## Warnings

### WR-01: `forceReseedRoleTemplates` permanently exposed on `window` in production

**File:** `app/seed-roles.js:272-274`

**Issue:** All three seeding functions are attached to `window` at module load time:
```javascript
window.seedRoleTemplates = seedRoleTemplates;
window.forceReseedRoleTemplates = forceReseedRoleTemplates;
window.verifyRoleTemplates = verifyRoleTemplates;
```
`forceReseedRoleTemplates` performs a batch `set()` that **overwrites all role documents** without confirmation and without any auth check. Any logged-in user who discovers this function name (e.g., via devtools autocomplete) can trigger it, resetting every role's permissions to defaults. `seedRoleTemplates` also writes to Firestore without a client-side check.

**Fix:** At minimum, wrap calls with a `super_admin` guard before executing the write, and remove `forceReseedRoleTemplates` from the window once the Phase 91 migration is confirmed:
```javascript
// After deploy verification:
// delete window.forceReseedRoleTemplates;
// Or add a guard:
window.forceReseedRoleTemplates = async () => {
    const user = window.getCurrentUser?.();
    if (!user || user.role !== 'super_admin') {
        console.error('[RoleSeeder] Super admin required');
        return;
    }
    return forceReseedRoleTemplates();
};
```

---

### WR-02: `/mrf-form` route still in `routePermissionMap` and routes — missing permission guard for the redirect path

**File:** `app/router.js:9-26`

**Issue:** The router redirects `#/mrf-form` to `#/procurement/request` in both `handleHashChange()` (line 410) and `handleInitialRoute()` (line 449). However, the `routePermissionMap` does NOT contain `/mrf-form`, and the `/mrf-form` route definition was removed from the `routes` object. This means the redirect happens _before_ the route-not-found guard (`!route`) fires in `navigate()`. But `navigate('/procurement', 'request')` is called directly — bypassing the `!route` guard entirely. This is intentional and works, but neither the `handleHashChange` nor `handleInitialRoute` paths verify that the user actually has `procurement_request` access before redirecting. A `finance` role user (who has `procurement_request: { access: false }`) bookmarking `#/mrf-form` will be redirected to `#/procurement/request` and then hit the permission gate inside `procurement.init()`, which correctly falls back to another tab — but the fallback silently reassigns `activeTab` without updating the browser URL, leaving the hash as `#/procurement/request` in the address bar while rendering a different tab.

**Fix:** After the `my-requests` / `request` fallthrough in `procurement.init()`, update the URL hash to match the actual rendered tab:
```javascript
if (activeTab === 'request' && !canSeeRequest) {
    if (canSeeMrfs) {
        activeTab = 'mrfs';
        window.location.replace('#/procurement/mrfs'); // sync URL
    }
    // ...
}
```

---

### WR-03: `procurement.init()` sets `_requestSubTabActive = true` but `destroy()` also resets it — double-reset to `false` at line 2300

**File:** `app/views/procurement.js:2174-2181, 2300`

**Issue:** Inside `destroy()`, `_requestSubTabActive` is reset to `false` in two places: first explicitly in the `if (_requestSubTabActive)` block (line 2180) and then unconditionally at line 2300. This double-write is harmless in isolation, but the unconditional reset at line 2300 means that if `_requestSubTabActive` was somehow not `true` when `destroy()` ran (e.g., due to the bug in CR-03), the flag is still cleared, which is correct — but the mrf-form module is not torn down. The double-write masks the symptom of CR-03 instead of surfacing it.

**Fix:** Remove the unconditional `_requestSubTabActive = false` at line 2300 — let the `if` block own the lifecycle:
```javascript
// Remove line 2300:
// _requestSubTabActive = false;
```

---

### WR-04: `render()` in `mrf-form.js` checks `canEditTab('procurement_request')` only for the `form` tab, not `my-requests`; My Requests is accessible to view-only roles with no gate

**File:** `app/views/mrf-form.js:153-177`

**Issue:**
```javascript
if (activeTab === 'my-requests') {
    return renderMyRequestsView(tabNav);  // No permission check at all
}
// Only form tab checks canEdit
const canEdit = window.canEditTab?.('procurement_request');
if (canEdit === false) { return blocked-message; }
```
Users with `procurement_request.access === false` can still navigate directly to `#/procurement/request/my-requests` (the router only gates `/procurement` at the top level, not the sub-tab). The My Requests tab would be rendered and the controller would fetch _all MRF records_ (because `filterFn` fallback is `null` when `userName` is absent — see CR-01) or the user's own MRFs. The correct gate should check `hasTabAccess('procurement_request')` before rendering My Requests as well.

**Fix:**
```javascript
export function render(activeTab = 'form') {
    const tabNav = renderSubTabNav(activeTab);
    const hasAccess = window.hasTabAccess?.('procurement_request');
    if (hasAccess === false) {
        return `<div class="container" ...>Access denied.</div>`;
    }
    if (activeTab === 'my-requests') {
        return renderMyRequestsView(tabNav);
    }
    // ...
}
```

---

### WR-05: `loadPRPORecords` cache path resets `filteredPRPORecords` to `allPRPORecords` without re-applying current filters

**File:** `app/views/procurement.js:4692-4694`

**Issue:**
```javascript
filteredPRPORecords = [...allPRPORecords];
prpoCurrentPage = 1;
await renderPRPORecords();
return;
```
When the cache is hit, `filteredPRPORecords` is set to the full (project-scoped) set and the existing `poStatusFilter`, `histStatusFilter`, and `histSearchInput` values are silently discarded. A user who has filtered by MRF status, then triggers a reload (e.g., hits Refresh), will see all records appear — their filter selections in the UI still show the old values but the data no longer reflects them.

**Fix:** Replace the direct assignment with a call to `filterPRPORecords()`:
```javascript
// cache-hit path:
filteredPRPORecords = [...allPRPORecords];
prpoCurrentPage = 1;
filterPRPORecords();  // re-apply current UI filter values
return;
```

---

### WR-06: `reFilterAndRenderPRPORecords` does not re-apply active department or search filters

**File:** `app/views/procurement.js:2488-2498`

**Issue:**
```javascript
function reFilterAndRenderPRPORecords() {
    const assignedCodes = window.getAssignedProjectCodes?.();
    if (assignedCodes === null) {
        allPRPORecords = [...cachedAllPRPORecords];
    } else {
        allPRPORecords = cachedAllPRPORecords.filter(mrf =>
            !mrf.project_code || assignedCodes.includes(mrf.project_code)
        );
    }
    filterPRPORecords();
}
```
This correctly calls `filterPRPORecords()` at the end. However, `filterPRPORecords()` reads the department filter from `activePODeptFilter` (module-level state) and also reads search/status filter values from DOM elements. If this function is called before the records section is rendered (e.g., `assignmentsChanged` fires while the user is on the `mrfs` or `suppliers` tab), `document.getElementById('histSearchInput')` returns `null`, and `?.value` silently returns `undefined` → coerced to `''`. This means the call succeeds but renders `prpoRecordsContainer` with unfiltered records while the user is not viewing the records tab — wasted DOM work, potentially slow. More importantly, if the DOM element does not exist, `filteredPRPORecords` is set to all records and pagination renders into an invisible container.

**Fix:** Guard the call with a DOM-presence check:
```javascript
function reFilterAndRenderPRPORecords() {
    // ... assignment-scope logic ...
    // Only re-render if the records container is visible
    if (!document.getElementById('prpoRecordsContainer')) return;
    filterPRPORecords();
}
```

---

## Info

### IN-01: `activePODeptFilter` comment still says "projects only, services only" — does not mention `my_requests`

**File:** `app/views/procurement.js:41`

**Issue:** The comment says `// '' = All, 'projects' = Projects only, 'services' = Services only` but the Phase 91 `my_requests` value is not documented.

**Fix:**
```javascript
let activePODeptFilter = ''; // '' = All, 'projects' = Projects only, 'services' = Services only, 'my_requests' = current user's MRFs
```

---

### IN-02: `seed-roles.js` header comment says "11 tabs" but now defines 11 tabs — counts are correct but confusing

**File:** `app/seed-roles.js:15`

**Issue:** The JSDoc says "Each role MUST have all 11 tabs defined" and `verifyRoleTemplates()` at line 232 lists exactly 11 tabs. The count is correct as of Phase 91. But the comment at line 17 says "added 4 sub-tab keys per role" — there are 4 sub-tab keys, which together with the original 7 top-level tabs gives 11, making the header comment accurate. No code defect, but the "4 new sub-tab keys" wording alongside "11 tabs" may confuse future readers who count 7 original + 4 new = 11.

**Fix:** Update the comment to be explicit:
```javascript
 * Each role MUST have all 11 tabs defined (7 top-level + 4 procurement sub-tabs)
```

---

### IN-03: `forceReseedRoleTemplates` does not update `updated_at` differently from `created_at` — both are set to `serverTimestamp()` on overwrite

**File:** `app/seed-roles.js:206-209`

**Issue:** On a force-reseed, both `created_at` and `updated_at` are set to the current `serverTimestamp()`, overwriting the original creation date. This makes it impossible to determine when a role was first created vs when it was last reset.

**Fix:**
```javascript
batch.set(roleRef, {
    ...roleTemplate,
    updated_at: serverTimestamp()
    // Note: do NOT set created_at here — preserve original creation date
}, { merge: true });  // merge so created_at is only written on first set
```
Alternatively use `setDoc` with `merge: true` and only set `updated_at` in `forceReseed`.

---

_Reviewed: 2026-05-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
