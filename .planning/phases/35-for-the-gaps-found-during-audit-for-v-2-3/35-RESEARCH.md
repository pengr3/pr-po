# Phase 35: Fix Service Edit History Path Defect - Research

**Researched:** 2026-02-20
**Domain:** Firebase Firestore subcollection routing, SPA shared module parameterization
**Confidence:** HIGH — all findings are from direct code inspection of the production codebase

## Summary

Phase 35 is a focused tech-debt fix addressing a silent data corruption bug: every inline edit on a service detail page writes its audit trail into `projects/{serviceDocId}/edit_history` instead of `services/{serviceDocId}/edit_history`. This happens because `edit-history.js` hardcodes the `'projects'` collection name in two places. No data is lost in the sense of crashing — the fire-and-forget pattern swallows errors — but the audit trail is misdirected and invisible to any user.

Three files require changes. The fix is small and surgical: (1) add an optional `collectionName` parameter to both exported functions in `edit-history.js`, defaulting to `'projects'` for full backward compatibility; (2) update `service-detail.js` to pass `'services'` at all four call sites and register `window.showEditHistory`; (3) add a `match /services/{serviceId}/edit_history/{entryId}` rule in `firestore.rules` so writes to the corrected path are permitted.

All three changes are tightly coupled: the code change in `edit-history.js` is prerequisite for the other two, but the rules change is independently additive and safe to deploy first. Existing project edit history data is completely unaffected because the default parameter value preserves the current behavior for all project-detail call sites.

**Primary recommendation:** Make the `edit-history.js` change first (backward-compatible), then update `service-detail.js`, then deploy the Firestore rules — this order ensures the corrected path is allowed before any corrected write arrives.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-04 | Service inline edits produce a visible, accurate audit trail (Edit History button/modal works) | Requires: `window.showEditHistory` registration in `attachWindowFunctions()`, `showEditHistoryModal()` reading from `services/` path, Firestore rule permitting reads from `services/{id}/edit_history` |
| SERV-09 | Edit history entries for services are stored at `services/{docId}/edit_history`, not `projects/{docId}/edit_history` | Requires: `collectionName` param added to `recordEditHistory()` and called with `'services'` from service-detail.js, Firestore rule permitting creates at `services/{id}/edit_history` |
</phase_requirements>

---

## Architecture Patterns

### Current State — The Defect

**File: `app/edit-history.js`**

`recordEditHistory()` signature (line 87):
```javascript
export async function recordEditHistory(projectDocId, action, changes) {
    try {
        const user = window.getCurrentUser?.();
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');  // line 90 — hardcoded
        await addDoc(historyRef, { ... });
    } catch (error) { ... }
}
```

`showEditHistoryModal()` signature (line 115):
```javascript
export async function showEditHistoryModal(projectDocId, projectCode) {
    try {
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');  // line 119 — hardcoded
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        ...
    } catch (error) { ... }
}
```

Both functions hardcode `'projects'`. When called from `service-detail.js`, they write/read from `projects/{serviceDocId}/edit_history` — a cross-collection pollution.

**File: `app/views/service-detail.js`**

There are exactly 4 `recordEditHistory()` call sites, all with `currentServiceDocId` (the Firestore doc ID of the services document):

| Line | Location | Action arg |
|------|----------|-----------|
| 542 | `selectDetailServicePersonnel()` | `'personnel_add'` |
| 597 | `removeDetailServicePersonnel()` | `'personnel_remove'` |
| 673 | `saveServiceField()` | `'update'` |
| 707 | `toggleServiceDetailActive()` | `'toggle_active'` |

`attachWindowFunctions()` (lines 803-813) — **`window.showEditHistory` is absent**:
```javascript
function attachWindowFunctions() {
    window.saveServiceField = saveServiceField;
    window.toggleServiceDetailActive = toggleServiceDetailActive;
    window.selectDetailServicePersonnel = selectDetailServicePersonnel;
    window.removeDetailServicePersonnel = removeDetailServicePersonnel;
    window.filterDetailServicePersonnelDropdown = filterDetailServicePersonnelDropdown;
    window.showDetailServicePersonnelDropdown = showDetailServicePersonnelDropdown;
    window.refreshServiceExpense = refreshServiceExpense;
    window.showServiceExpenseModal = () => currentService && ...;
    // window.showEditHistory is NOT registered here
}
```

`destroy()` (lines 189-197) — `delete window.showEditHistory` is also absent, consistent with it never being registered.

**File: `firestore.rules`**

The `services` block (lines 315-336) has no subcollection rule:
```
match /services/{serviceId} {
    allow get: ...
    allow list: ...
    allow create: ...
    allow update: ...
    allow delete: ...
    // NO match /edit_history/{entryId} block
}
```

The `projects/edit_history` rule (lines 138-148) has a Phase 32 workaround — `services_admin` was added to the create allowlist specifically because service writes were landing in the projects subcollection:
```javascript
match /edit_history/{entryId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'operations_admin', 'services_admin', 'finance']);
    allow update: if false;
    allow delete: if false;
}
```

Once the path is corrected, the `projects/edit_history` rule no longer needs `services_admin` for the service use case — but removing it is a separate question (see Open Questions).

### Canonical Reference — project-detail.js

The correct pattern from `app/views/project-detail.js`:

**Import** (line 9):
```javascript
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
```

**`attachWindowFunctions()`** (line 786):
```javascript
window.showEditHistory = () => currentProject && showEditHistoryModal(currentProject.id, currentProject.project_code);
```

**`destroy()`** (line 198):
```javascript
delete window.showEditHistory;
```

**Button in `renderProjectDetail()`** (line 293):
```javascript
<button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space: nowrap; padding: 0.4rem 0.75rem; font-size: 0.8rem;">
    Edit History
</button>
```
This button lives in Card 1 (Project Information), in the header row alongside the card title and timestamp, justified to the right via `justify-content: space-between`.

**`recordEditHistory()` call pattern** (line 630-632):
```javascript
recordEditHistory(currentProject.id, 'update', [
    { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
]).catch(err => console.error('[EditHistory] saveField failed:', err));
```

---

## Standard Stack

This phase uses no new libraries. All existing imports are already in place:

| Module | Already imported in service-detail.js | Notes |
|--------|--------------------------------------|-------|
| `recordEditHistory` | Yes (line 9) | Already imported, just miscalled |
| `showEditHistoryModal` | No | Must add to import statement |

The import line in `service-detail.js` currently reads:
```javascript
import { recordEditHistory } from '../edit-history.js';
```
It must be updated to:
```javascript
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
```

---

## Exact Code Changes Required

### Change 1: `app/edit-history.js` — Add optional `collectionName` parameter

**`recordEditHistory()` — change signature and line 90:**

Old:
```javascript
export async function recordEditHistory(projectDocId, action, changes) {
    try {
        const user = window.getCurrentUser?.();
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
```

New:
```javascript
export async function recordEditHistory(projectDocId, action, changes, collectionName = 'projects') {
    try {
        const user = window.getCurrentUser?.();
        const historyRef = collection(db, collectionName, projectDocId, 'edit_history');
```

**`showEditHistoryModal()` — change signature and line 119:**

Old:
```javascript
export async function showEditHistoryModal(projectDocId, projectCode) {
    showLoading(true);

    try {
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
```

New:
```javascript
export async function showEditHistoryModal(projectDocId, projectCode, collectionName = 'projects') {
    showLoading(true);

    try {
        const historyRef = collection(db, collectionName, projectDocId, 'edit_history');
```

**Backward-compatibility:** All existing `recordEditHistory(id, action, changes)` calls throughout the codebase continue to work with no changes. The `collectionName` parameter defaults to `'projects'`. Verified call sites that must NOT change: `project-detail.js` lines 511, 558, 630-631, 713.

Also check `services.js` — it may call `recordEditHistory` for service creation:

### Change 2: `app/views/service-detail.js` — Three sub-changes

**2a. Update import (line 9):**
```javascript
// Old:
import { recordEditHistory } from '../edit-history.js';

// New:
import { recordEditHistory, showEditHistoryModal } from '../edit-history.js';
```

**2b. Pass `'services'` at all 4 `recordEditHistory()` call sites:**

Each call changes from:
```javascript
recordEditHistory(currentServiceDocId, 'personnel_add', [...])
```
To:
```javascript
recordEditHistory(currentServiceDocId, 'personnel_add', [...], 'services')
```

Exact locations:
- Line 542 (selectDetailServicePersonnel): `'personnel_add'`
- Line 597 (removeDetailServicePersonnel): `'personnel_remove'`
- Line 673 (saveServiceField): `'update'`
- Line 707 (toggleServiceDetailActive): `'toggle_active'`

**2c. Register and clean up `window.showEditHistory`:**

In `attachWindowFunctions()` — add:
```javascript
window.showEditHistory = () => currentService && showEditHistoryModal(currentServiceDocId, currentService.service_code, 'services');
```

In `destroy()` — add:
```javascript
delete window.showEditHistory;
```

**2d. Add "Edit History" button to `renderServiceDetail()`:**

In Card 1 (Service Information), the header row currently reads (lines 285-289):
```javascript
<div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: flex-start;">
    <div>
        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.125rem; font-weight: 600;">Service Information</h3>
        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">Created: ...</p>
    </div>
</div>
```

Must add button (mirroring project-detail.js line 293):
```javascript
<div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: flex-start;">
    <div>
        <h3 style="margin: 0 0 0.25rem 0; font-size: 1.125rem; font-weight: 600;">Service Information</h3>
        <p style="color: #94a3b8; font-size: 0.875rem; margin: 0;">Created: ...</p>
    </div>
    <button class="btn btn-sm btn-secondary" onclick="window.showEditHistory()" style="white-space: nowrap; padding: 0.4rem 0.75rem; font-size: 0.8rem;">
        Edit History
    </button>
</div>
```

### Change 3: `firestore.rules` — Add services edit_history subcollection rule

Add inside the `match /services/{serviceId}` block (after the existing `allow delete` rule, before the closing `}`):

```javascript
// edit_history subcollection — mirrors projects/edit_history pattern
match /edit_history/{entryId} {
    // Read: roles that can read services
    allow read: if hasRole(['super_admin', 'services_admin', 'services_user', 'finance', 'procurement']);

    // Create: roles that can update services (append-only audit trail)
    allow create: if hasRole(['super_admin', 'services_admin']);

    // Append-only: no updates or deletes allowed
    allow update: if false;
    allow delete: if false;
}
```

**Read access rationale:** Mirrors `services` collection `get` rule (super_admin, services_admin, services_user, finance, procurement). The `isActiveUser()` broad read used in projects is appropriate for projects (all departments see project data), but services are more restricted — only roles with service get access should see service history.

**Create access rationale:** Only `super_admin` and `services_admin` can update services (as per the `services` update rule). No need to include `finance` or `operations_admin` here because they cannot edit services.

---

## Confirmed: `services.js` Also Has Misdirected Calls

`services.js` imports `recordEditHistory` (line 10) and has 3 call sites, all passing service Firestore doc IDs without a `collectionName` param — all currently writing to `projects/{serviceDocId}/edit_history`:

| Line | Location | Action arg | First arg (ID source) |
|------|----------|-----------|----------------------|
| 717 | `addService()` — after `addDoc` | `'create'` | `docRef.id` (newly created services doc) |
| 1148 | `saveServiceEdit()` | `'update'` | `editingService` (services doc ID) |
| 1222 | `toggleServiceActive()` | `'toggle_active'` | `serviceId` (services doc ID) |

All three must also receive `'services'` as the 4th argument. This is part of the same defect as `service-detail.js` and must be fixed in the same phase for a complete correction.

**Total call sites to fix: 7** (4 in `service-detail.js` + 3 in `services.js`)

---

## Common Pitfalls

### Pitfall 1: `showEditHistoryModal` displays `projectCode` in title as "Edit History: {code}"
**What goes wrong:** The modal title uses the second parameter verbatim: `<h3>Edit History: ${projectCode}</h3>`. For services, pass `currentService.service_code` (not `currentService.service_name`) to match the established code-based labeling convention.
**How to avoid:** Pass `currentService.service_code` as the second argument to `showEditHistoryModal()`.

### Pitfall 2: `currentServiceDocId` vs `currentService.id`
**What goes wrong:** `service-detail.js` tracks the Firestore document ID in two places — `currentServiceDocId` (module-level var, set at line 141) and `currentService.id` (set at line 142). Both are the same value. The `recordEditHistory()` calls all correctly use `currentServiceDocId`. The `window.showEditHistory` lambda should use `currentServiceDocId` (not `currentService.id`) for consistency with existing call sites, though both values are identical.
**How to avoid:** Use `currentServiceDocId` in the `window.showEditHistory` lambda, mirroring how `currentProject.id` is used in `project-detail.js`.

### Pitfall 3: Fire-and-forget pattern must be preserved
**What goes wrong:** Changing `recordEditHistory()` calls to `await` (instead of the current `.catch()` fire-and-forget) would block the save operation if history recording fails.
**How to avoid:** Keep all 4 call sites using the `.catch(err => console.error(...))` fire-and-forget pattern. Do not add `await`.

### Pitfall 4: Existing misdirected history data
**What goes wrong:** Before this fix, service edits wrote to `projects/{serviceDocId}/edit_history`. These documents will persist in the wrong path forever. There is no automatic migration.
**Decision required:** The phase spec does not mention migration. Treat this as expected — the history modal will show "No edit history recorded yet" for services until new edits are made post-fix. Document this in the verification notes.

### Pitfall 5: Phase 32 workaround — `services_admin` in projects/edit_history create rule
**What goes wrong:** The `projects/edit_history` create rule includes `services_admin` because services were writing there. After this fix, services write to `services/edit_history` instead. The `services_admin` entry in the `projects/edit_history` create rule becomes unnecessary — but removing it is a separate (optional) cleanup.
**How to avoid:** Do NOT remove `services_admin` from `projects/edit_history` create rule in this phase. It is harmless to leave it and removing it is out of scope for a targeted tech-debt fix. Note it in VERIFICATION.md for future reference.

### Pitfall 6: Firestore rules must be deployed
**What goes wrong:** Code changes deploy via Netlify (git push), but Firestore rules deploy separately via Firebase CLI or Firebase Console. If rules are not deployed, writes to `services/{id}/edit_history` will be denied (silent failure — fire-and-forget swallows the error).
**How to avoid:** Include Firestore rules deployment as an explicit verification step. Check the Firebase Console or run `firebase deploy --only firestore:rules` after the code push.

---

## Backward Compatibility Analysis

| Concern | Assessment |
|---------|-----------|
| Existing `recordEditHistory(id, action, changes)` calls in `project-detail.js` | Safe — default param `'projects'` preserves behavior |
| Existing `showEditHistoryModal(id, code)` calls in `project-detail.js` | Safe — default param `'projects'` preserves behavior |
| Existing data in `projects/{serviceDocId}/edit_history` | Orphaned, not deleted, not visible via corrected modal — acceptable |
| `projects/edit_history` Firestore rule | Unchanged — projects continue to work exactly as before |
| `services.js` if it calls `recordEditHistory` | Must be verified and updated if present |

---

## Open Questions

1. **`services.js` call sites — CONFIRMED (resolved during research)**
   - What we know: 3 call sites confirmed at lines 717, 1148, 1222 — all write service history to wrong `projects/` path
   - Resolution: All 3 must receive `'services'` as 4th param; total fix scope is 7 call sites across 2 files

2. **Should `services_admin` be removed from `projects/edit_history` create rule after this fix?**
   - What we know: It was added in Phase 32 as a workaround; after this fix it's no longer needed for correctness
   - Recommendation: Leave it in place for this phase; flag as future cleanup in VERIFICATION.md

3. **Should orphaned misdirected history be migrated?**
   - Assessment: No — migration is not mentioned in the phase spec, the data exists in an essentially unreachable path, and the volume is small. Accepted data loss.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `C:/Users/Admin/Roaming/pr-po/app/edit-history.js` — full file, 179 lines
- Direct code inspection: `C:/Users/Admin/Roaming/pr-po/app/views/service-detail.js` — full file, 816 lines
- Direct code inspection: `C:/Users/Admin/Roaming/pr-po/app/views/project-detail.js` — full file, 790 lines
- Direct code inspection: `C:/Users/Admin/Roaming/pr-po/app/views/services.js` — lines 710-726, 1140-1156, 1215-1233
- Direct code inspection: `C:/Users/Admin/Roaming/pr-po/firestore.rules` — full file, 339 lines

### No external sources needed
This phase is a pure internal codebase fix. All required knowledge comes from reading the existing files. No library API changes, no new dependencies, no external documentation required.

---

## Metadata

**Confidence breakdown:**
- Defect identification: HIGH — lines pinpointed, cross-referenced with audit findings
- Proposed changes: HIGH — directly derived from canonical project-detail.js pattern
- Backward compatibility: HIGH — default parameter pattern is unambiguous
- Firestore rules: HIGH — read rules role list derived from existing services collection rules

**Research date:** 2026-02-20
**Valid until:** Indefinite — no external dependencies; only invalidated if file structure changes
