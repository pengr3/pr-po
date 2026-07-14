# Phase 110: Entity Add/Edit Modals - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 7 (3 new/modified modal surfaces + 4 existing files being edited/trimmed)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/client-modal.js` (new) | component (modal module) | CRUD (create+edit, single doc) | `app/proposal-modal.js` (`openCreateProposalModal`/`openEditProposalModal`/`showCreateModal`/`saveProposal`) | exact |
| `app/entity-edit-modal.js` (new — or 2 files, planner's discretion) | component (modal module) | CRUD (update-only, rich form) | `app/proposal-modal.js` create/edit structure **+** `app/views/projects.js` `editProject`/`saveEdit` (field set, tranche/personnel wiring) | role-match (structure from proposal-modal.js, field/write logic from projects.js/services.js) |
| `app/engagement-create.js` (modified — add locked-type param) | service + component (modal-launch helper extraction) | CRUD (create) | itself, pre-Phase-107 extraction precedent: `home.js` `window.ccOpenNewProposal`/`ccCloseNewProposal` (~1285-1313) | exact (extend in place) |
| `app/views/clients.js` (modified — remove inline add+row-edit, wire modal) | view (list controller) | CRUD | `app/views/clients.js` itself (before/after diff) | n/a — edited in place |
| `app/views/projects.js` (modified — remove inline add/edit form, wire modal + Add-button gate swap) | view (list controller) | CRUD | `app/views/projects.js` itself | n/a — edited in place |
| `app/views/services.js` (modified — mirror of projects.js) | view (list controller) | CRUD | `app/views/services.js` itself (mirrors projects.js) | n/a — edited in place |
| Esc-to-close handler (new, location TBD by planner) | utility (event listener) | event-driven | `app/views/finance.js` `setupModalListeners()` (lines 3206-3238, AbortController + `keydown`/`Escape`) | exact |

## Pattern Assignments

### `app/client-modal.js` (new — Client Add/Edit modal, D-07)

**Analog:** `app/proposal-modal.js` (`openCreateProposalModal` / `openEditProposalModal` / `showCreateModal` / `closeCreateProposalModal` / `saveProposal`, lines 692-956)

**Imports pattern** (`app/proposal-modal.js` lines 29-51 — trim to what Client actually needs):
```javascript
import { db, collection, doc, getDoc, getDocs, updateDoc, addDoc, query, where, serverTimestamp } from './firebase.js';
import { showLoading, showToast, escapeHTML } from './utils.js';
```
Client modal needs far less than proposal-modal.js — no `writeBatch`, no `notifications.js`, no `views/proposals.js` cross-import. Model the *shape* of the import block, not its contents.

**Mode-flag + module state** (`app/proposal-modal.js` lines 71-79):
```javascript
let createModalMode = 'create';    // 'create' | 'edit'
let createModalEditingId = null;   // Firestore doc ID when in edit mode
let _createModalOnClose = null;    // optional callback fired by closeCreateProposalModal
```
Client modal needs an equivalent trio: `mode`, `editingId`, and (optional) `_onClose`. No parent-collection/locked-code fields needed (those are proposal-specific).

**Open functions (create vs edit entry points)** (`app/proposal-modal.js` lines 692-726):
```javascript
export async function openCreateProposalModal(preselectedProjectId = null, onClose = null, parentCollection = 'projects', lockedProjectCode = null) {
    createModalMode = 'create';
    createModalEditingId = null;
    _createModalOnClose = onClose;
    ...
    showCreateModal(null);
}

async function openEditProposalModal(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    createModalMode = 'edit';
    createModalEditingId = proposalDocId;
    ...
    showCreateModal(proposal);
}
```
For Client, `openEditClientModal(clientId)` can look up the record from the caller's already-loaded `clientsData` array (passed in, or re-fetched via `getDoc`) — `clients.js` already keeps a live `clientsData` module array from its `onSnapshot`, so a fresh Firestore read is not required (unlike proposal-modal.js, which is called from multiple views without a shared cache).

**showCreateModal — mode-branched HTML + pre-fill + escapeHTML** (`app/proposal-modal.js` lines 728-828, esp. 732-741 mode branch and 759-806 HTML/window-fn wiring):
```javascript
const isEdit = createModalMode === 'edit';
const heading = isEdit ? 'Edit Proposal' : 'New Proposal';
const ctaLabel = isEdit ? 'Save Changes' : 'Save Proposal';
const titleVal = isEdit ? escapeHTML(existing?.title || '') : '';
...
const html = `
<div id="proposalCreateModal" class="modal" style="display:flex;z-index:1001;">
    <div class="modal-content" style="max-width:640px;margin:auto;">
        <div class="modal-header">
            <h2 ...>${heading}</h2>
            <button class="modal-close" aria-label="Close" onclick="window.closeCreateProposalModal()">&times;</button>
        </div>
        <div class="modal-body" style="padding:1.5rem;">...fields, each with escapeHTML(value) pre-fill...</div>
        <div class="modal-footer" ...>
            <button class="btn btn-outline" onclick="window.closeCreateProposalModal()">Cancel</button>
            <button class="btn btn-primary" onclick="window.saveProposal()">${ctaLabel}</button>
        </div>
    </div>
</div>`;
window.closeCreateProposalModal = closeCreateProposalModal;
window.saveProposal             = saveProposal;
document.body.insertAdjacentHTML('beforeend', html);
```
Client modal: same mode-branch shape, same `document.body.insertAdjacentHTML('beforeend', ...)` mount, same `window.close*`/`window.save*` registration pair right after the HTML string (not in a separate init step) — this module intentionally registers window fns inline rather than via a `render`/`init` split, because the modal is a one-shot DOM injection, not a routed view.

**Close function — removes DOM + deletes window fns + resets state + fires callback** (`app/proposal-modal.js` lines 830-842):
```javascript
function closeCreateProposalModal() {
    const el = document.getElementById('proposalCreateModal');
    if (el) el.remove();
    delete window.closeCreateProposalModal;
    delete window.saveProposal;
    createModalMode = 'create';
    createModalEditingId = null;
    ...
    const cb = _createModalOnClose;
    _createModalOnClose = null;
    if (typeof cb === 'function') cb();
}
```
Copy verbatim shape for `closeClientModal()`.

**Validation + save — reuse `clients.js`'s exact existing checks (D-02: keep as-is)** — source these checks from `app/views/clients.js` `addClient()` (lines 520-572) and `saveEdit()` (lines 590-644), NOT from proposal-modal.js's inline-error-div pattern (proposal-modal.js uses per-field `<div id="...Error">` toasts inline in the DOM — Client modal should use plain `showToast()` per D-02, matching what clients.js already does):
```javascript
// app/views/clients.js lines 527-550 (addClient) — same checks appear in saveEdit (597-620)
const client_code = document.getElementById('newClientCode').value.trim().toUpperCase();
const company_name = document.getElementById('newCompanyName').value.trim();
const contact_person = document.getElementById('newContactPerson').value.trim();
const phone = document.getElementById('newClientPhone').value.trim();
const email = document.getElementById('newClientEmail').value.trim();

if (!client_code || !company_name || !contact_person) {
    showToast('Please fill in Client Code, Company Name, and Contact Person', 'error');
    return;
}
if (!phone && !email) {
    showToast('Provide at least one of Phone or Email', 'error');
    return;
}
if (email && !isValidEmail(email)) {
    showToast('Email is not a valid address', 'error');
    return;
}
const duplicate = clientsData.find(c => c.client_code === client_code /* && c.id !== clientId in edit mode */);
if (duplicate) {
    showToast(`Client code "${client_code}" already exists`, 'error');
    return;
}
```
`isValidEmail` is a private helper in `clients.js` (lines 11-13, regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) — either import/export it from clients.js or duplicate the one-liner into the new modal module (planner's call; it is not exported today).

**Write — addDoc/updateDoc pair** (`app/views/clients.js` lines 555-562 create, 625-633 update):
```javascript
// create
await addDoc(collection(db, 'clients'), { client_code, company_name, contact_person, phone, email, created_at: new Date().toISOString() });
// edit
await updateDoc(doc(db, 'clients', clientId), { client_code, company_name, contact_person, phone, email, updated_at: new Date().toISOString() });
```
Follow `saveProposal()`'s `if (createModalMode === 'edit' && createModalEditingId) { updateDoc(...) } else { addDoc(...) }` branch shape (proposal-modal.js lines 895-946), swapped to these fields/collection.

**Error handling** (`app/proposal-modal.js` lines 950-955):
```javascript
} catch (err) {
    console.error('[ProposalModal] saveProposal failed:', err);
    showToast(err?.message || 'Failed to save. Please try again.', 'error');
} finally {
    showLoading(false);
}
```

---

### `app/entity-edit-modal.js` (new — Project/Service Edit modal, D-06)

**Structural analog:** `app/proposal-modal.js` create/edit shell (same as above: mode flag omitted — this module is edit-only, so no create branch is needed; still copy the show/close/window-fn-registration skeleton).

**Field-set + write-logic analog:** `app/views/projects.js` `editProject()` (lines 1228-1272, pre-fill) + `saveEdit()` (lines 1280-1420ish, validation + `updateDoc`) for the Project variant; `app/views/services.js` `editService()` (lines 1272-1317) + `saveServiceEdit()` (line 1325+) for the Service variant — these two are near-verbatim mirrors of each other (service adds a `service_type` field; project has no equivalent).

**Pre-fill pattern** (`app/views/projects.js` lines 1235-1271):
```javascript
const project = allProjects.find(p => p.id === projectId);
...
document.getElementById('projectClient').value = project.client_id;
document.getElementById('projectName').value = project.project_name;
document.getElementById('projectLocation').value = project.location || '';
document.getElementById('projectStatus').value = project.project_status;
document.getElementById('projectBudget').value = project.budget || '';
document.getElementById('contractCost').value = project.contract_cost || '';

// Tranche editor — rebuild via renderTrancheBuilder(existingTranches, scopeKey)
editingProjectTranches = Array.isArray(project.collection_tranches) ? project.collection_tranches : [];
const trancheWrapper = document.getElementById('collTrancheBuilderWrapper');
if (trancheWrapper) trancheWrapper.innerHTML = renderTrancheBuilder(editingProjectTranches, 'projectForm');

// Personnel pills — normalizePersonnel() handles all legacy formats
const normalized = normalizePersonnel(project);
selectedPersonnel = [];
for (let i = 0; i < normalized.names.length; i++) {
    selectedPersonnel.push({ id: normalized.userIds[i] || '', name: normalized.names[i] });
}
renderPills();
```
IMPORTANT: since the fields are being moved from an always-mounted `#addProjectForm` into a modal that is injected/removed from the DOM per open/close, the tranche builder and personnel-pill helpers (`renderTrancheBuilder`, `renderPills`/`renderServicePills`, `filterPersonnelDropdown`, `selectPersonnel`, `removePersonnel`, `showPersonnelDropdown`) must be re-registered as window fns on open and cleaned up on close, mirroring how `proposal-modal.js` and `engagement-create.js` register/delete their own window fns per open/close cycle (not once at module load) — see `initEngagementForm`/`destroyEngagementForm` below.

**Validate + write** (`app/views/projects.js` lines 1280-1393, condensed):
```javascript
// Required fields
if (!clientId || !project_name || !project_status) { showToast('Please fill in all required fields', 'error'); return; }
// Positive-number checks
if (budget !== null && (isNaN(budget) || budget <= 0)) { showToast('Budget must be a positive number (greater than 0)', 'error'); return; }
if (contract_cost !== null && (isNaN(contract_cost) || contract_cost <= 0)) { showToast('Contract cost must be a positive number (greater than 0)', 'error'); return; }
if (!UNIFIED_STATUS_OPTIONS.includes(project_status)) { showToast('Invalid project status', 'error'); return; }
// Tranche sum-to-100 check
const collectionTranches = readTranchesFromDOM('projectForm');
if (tranchesProvided) {
    const total = collectionTranches.reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0);
    if (Math.abs(total - 100) > 0.01) { showToast(`Collection tranches must sum to 100% (currently ${total.toFixed(2)}%)`, 'error'); return; }
}
...
await updateDoc(doc(db, 'projects', editingProject), {
    project_name, location: location || null, client_id: clientId, client_code: clientCode,
    project_status, budget, contract_cost, ...personnelUpdate,
    collection_tranches: finalTranches, updated_at: new Date().toISOString()
});
```
`UNIFIED_STATUS_OPTIONS` (projects.js line 34) is module-private — export it or duplicate into the shared edit modal; services.js likely has its own status-options constant to check (`serviceProjectStatus` field, line 1296) — verify equivalence before consolidating into one constant.

**Edit-history diff building** — both `saveEdit()` (projects.js ~1395+) and `saveServiceEdit()` build an `editChanges` array and call `recordEditHistory(...)` after the `updateDoc`; preserve this — it is existing, working behavior, not new plumbing.

**Existing-collectibles confirm() guard** (`app/views/projects.js` lines 1355-1376) — a native `confirm()` dialog fires when tranches change and collectibles already reference the project's old tranche labels. This is pre-existing UX (not a modal-close guard covered by D-03's "no confirm-if-dirty guard" — that decision is about *closing* the modal, not this in-flow business-rule confirm). Preserve verbatim.

---

### `app/engagement-create.js` (modified — expose locked-type Add launcher, D-04/D-05)

**Analog for the "open modal on demand" wrapper:** `app/views/home.js` `window.ccOpenNewProposal` / `window.ccCloseNewProposal` (lines 1285-1313):
```javascript
window.ccOpenNewProposal = async () => {
    document.getElementById('cc-new-proposal-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'cc-new-proposal-modal';
    overlay.className = 'modal';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '1001';
    overlay.innerHTML = `
        <div class="modal-content" style="max-width:720px;margin:auto;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
                <h2 ...>New Engagement</h2>
                <button class="modal-close" aria-label="Close" onclick="window.ccCloseNewProposal()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">${renderEngagementForm(window.getCurrentUser?.()?.role)}</div>
        </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) window.ccCloseNewProposal(); });
    document.body.appendChild(overlay);
    try { await initEngagementForm(); } catch (err) { console.error('[Home] initEngagementForm failed:', err); }
};
window.ccCloseNewProposal = () => {
    try { destroyEngagementForm(); } catch (err) { console.error('[Home] destroyEngagementForm failed:', err); }
    document.getElementById('cc-new-proposal-modal')?.remove();
};
```
**Discretion note (per CONTEXT.md "Claude's Discretion"):** this open/close pair is currently private to `home.js` (not exported). Planner must decide where the shared "open New Engagement, optionally locked to a type" helper lives — options: (a) move this open/close pair verbatim into `engagement-create.js` as an exported `openEngagementCreateModal(lockedType)` / `closeEngagementCreateModal()`, with `home.js` calling the moved export instead of defining its own copy; or (b) leave `home.js`'s copy in place and add a second, near-identical exported helper in `engagement-create.js` for `projects.js`/`services.js` to call. Option (a) avoids drift (two copies of the same overlay-mount code); it requires updating `home.js`'s `ccOpenNewProposal`/`ccCloseNewProposal` call sites and matches the "must not destabilize `engagement-create.js`" constraint since it's additive, not a rewrite of `createEngagement`/`submitNewEngagement`.

**Locked-type requirement (new work — no existing analog):** `renderEngagementForm(role)` (lines 446-580) currently only takes `role` and always renders all role-permitted type radios unlocked. Extend the signature (e.g., `renderEngagementForm(role, lockedType = null)`) so that when `lockedType` is set:
- Only that type's radio renders (or renders all but hides/disables non-matching ones — CONTEXT.md D-04 explicitly says "hidden/disabled", not merely pre-selected).
- `currentEngagementType` / `defaultType` resolution (lines 452-455) is forced to `lockedType` regardless of role.
- `handleEngagementTypeChange(type)` (line 274 area) — check this still needs to run once on init to set client-required copy correctly (it already does via `initEngagementForm()` line 648-649 `const initialType = document.querySelector(...); handleEngagementTypeChange(...)`).

**submitNewEngagement — does NOT currently auto-close its host modal** (`app/engagement-create.js` lines 409-428): after a successful create it clears the form fields and resets to the project radio, but does not call any close function — this is because it was designed for the always-visible Home Engagements sub-tab, not a transient modal. Flag for planner: if Project/Service Add is to "auto-close the modal + show the success toast" per D-03 ("Successful save auto-closes the modal"), `submitNewEngagement()`'s success path needs an added close call (or the modal wrapper needs an `onAfterCreate`-style hook) — this is a real behavior gap between D-03's stated contract and the current `engagement-create.js` code, not just a copy-paste.

**Add-button gating swap (D-05):** replace `window.canEditTab?.('projects')` (old gate, seen in `projects.js` `toggleAddProjectForm()` lines 616-619 and `addProject()` lines 660-663) with `getHomeSubTabConfig().canEngagements`-equivalent role check:
```javascript
// app/views/home.js lines 58-67 — the 3-role gate to replicate/reuse
function getHomeSubTabConfig() {
    const role = window.getCurrentUser?.()?.role || '';
    if (['finance', 'procurement_staff'].includes(role)) return { ..., canEngagements: false, ... };
    const canEngagements = ['super_admin', 'operations_admin', 'services_admin'].includes(role);
    ...
    return { ..., canEngagements, ... };
}
```
`getHomeSubTabConfig()` is private to `home.js` — planner must either export it, extract the 3-role array to a shared constant (e.g. in `permissions.js`), or duplicate the inline check `['super_admin','operations_admin','services_admin'].includes(window.getCurrentUser?.()?.role)` in `projects.js`/`services.js`. Note the *old* `toggleAddProjectForm()` role guard (lines 621-626) was narrower — `super_admin` + `operations_admin` only (no `services_admin`) — so the swap to `canEngagements` is a widen for Project-Add eligibility (services_admin gains it) as well as the documented behavior change (non-engagement roles with `canEditTab` lose Add).

---

### `app/views/clients.js` (modified — remove inline add + inline-row edit)

**Being removed:** `#addClientForm` block (lines 68-93), `toggleAddClientForm()` (497-518), `addClient()` (520-572, logic moves into `client-modal.js`), `editClient()`/`cancelEdit()`/`saveEdit()` (574-644, logic moves into `client-modal.js`), the inline-row `<tr>` edit branch in `renderClientsTable()` (444-458 — the `if (editingClient === client.id)` branch with `<input id="edit-code">` etc. is deleted entirely; rows always render as the read-only branch, lines 460-478).

**Being added:** `window.openClientAddModal` / `window.openClientEditModal(clientId)` wired to the new `client-modal.js` exports, replacing the `onclick="window.toggleAddClientForm()"` (line 63) and `onclick="window.editClient('${client.id}')"` (line 469) button targets. Keep `attachWindowFunctions()` (lines 27-38) and `destroy()`'s matching `delete window.*` block (lines 167-177) as the registration/cleanup pattern — just swap the specific function names.

---

### `app/views/projects.js` / `app/views/services.js` (modified — remove inline add/edit forms, wire Add→engagement-create modal + Edit→entity-edit-modal)

**Being removed (projects.js):** `#addProjectForm` block (render() ~line 200-260 area containing the `UNIFIED_STATUS_OPTIONS`-driven `<select>` and `renderTrancheBuilder([], 'projectForm')` call at line 219), `toggleAddProjectForm()` (614-656), `addProject()` (659-~765), `editProject()` (1228-1272), `cancelEdit()` (1275-1277), `saveEdit()` (1280-~1420). Personnel-pill helpers (`renderPills`, `filterPersonnelDropdown`, `showPersonnelDropdown`, `selectPersonnel`, `removePersonnel`, lines 486-580ish) and tranche-builder wiring (`window.addTranche`/`removeTranche`/`recalculateTranches`, lines 127-129) are NOT removed — they are relocated into the new edit-modal module (still needed there) and no longer needed in the inline add form.

**Being added:** an Add button wired to the extracted `engagement-create.js` open-with-locked-type helper (`type='project'`), and Edit buttons wired to `entity-edit-modal.js`'s `openProjectEditModal(projectId)`. Mirror exactly for `services.js` (`type='one-time'`/`'recurring'` locked-type semantics need clarifying with planner — Services list likely locks to "service" broadly and lets New Engagement's own one-time/recurring radio remain choosable, OR locks fully; re-check D-04 wording: "Add Service → type=service locked" — ambiguous whether one-time vs recurring stays open. Flag this ambiguity for the planner/plan-file, it is not resolved by CONTEXT.md verbatim.)

**Window-fn cleanup:** both files' `attachWindowFunctions()` (projects.js 107-132, services.js 98-119) and their `destroy()` counterparts must drop the removed function names (`toggleAddProjectForm`, `addProject`, `editProject`, `cancelEdit`, `saveEdit` / `toggleAddServiceForm`, `addService`, `editService`, `cancelServiceEdit`, `saveServiceEdit`) and add the new modal-launcher names.

---

## Shared Patterns

### `.modal` / `.modal-content` / `.modal-header` / `.modal-close` CSS contract
**Source:** `styles/components.css` lines 764-857
**Apply to:** all three new modal surfaces (client-modal.js, entity-edit-modal.js, engagement-create.js's exposed launcher)
```css
.modal { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); align-items:center; justify-content:center; z-index:1000; }
.modal.active { display:flex; }   /* NOT used by proposal-modal.js convention — that uses inline style="display:flex" + DOM add/remove instead of toggling .active. Follow proposal-modal.js: inject with style="display:flex" set inline, remove element on close, don't rely on .active. */
.modal-content { background:#fff; border-radius:12px; max-width:900px; width:90%; max-height:85vh; overflow:hidden; box-shadow:...; display:flex; flex-direction:column; }
.modal-header { padding:1.25rem 1.75rem; ...; display:flex; justify-content:space-between; align-items:center; }
.modal-body { padding:2rem; flex:1; overflow-y:auto; background:#fafbfc; }
.modal-footer { padding:1.25rem 1.75rem; ...; display:flex; justify-content:flex-end; gap:0.75rem; }
.modal-close { background:#f1f5f9; border:1px solid #e2e8f0; ...; width:32px; height:32px; border-radius:6px; }
```
Note the D-01 nuance: this CSS supports BOTH the `.active`-toggle convention (`components.js` `openModal`/`closeModal`) and the inline `style="display:flex"` + DOM-injection convention (`proposal-modal.js`, `home.js` `ccOpenNewProposal`). The chosen JS convention (D-01) is the latter — new modals set `style="display:flex;z-index:1001;"` inline on injection and `.remove()` the element on close, they do NOT add/remove `.active`.

### Backdrop-click-to-close
**Source:** `app/views/home.js` line 1301 (`overlay.addEventListener('click', (e) => { if (e.target === overlay) window.ccCloseNewProposal(); });`) — apply the same `e.target === overlay/modalRoot` check to all three new modals. (`proposal-modal.js`'s `showCreateModal` does not itself wire a backdrop click in the excerpt read — verify at implementation time whether it relies on a global handler; if not, copy the home.js inline pattern, which is self-contained per-modal and simplest to replicate identically for 3 separate modules.)

### Esc-to-close (NEW behavior, D-03/MODAL-07 — no existing centralized helper)
**Closest precedent:** `app/views/finance.js` `setupModalListeners()` (lines 3206-3238):
```javascript
let modalAbortController = null;
function setupModalListeners() {
    if (modalAbortController) modalAbortController.abort();
    modalAbortController = new AbortController();
    const { signal } = modalAbortController;
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const prModal = document.getElementById('prModal');
            if (approvalModal?.classList.contains('active')) closeApprovalModal();
            else if (prModal?.classList.contains('active')) closePRModal();
            // ...
        }
    }, { signal }); // AbortController signal handles cleanup automatically
}
```
Adapt for the `.modal` + DOM-injection convention (no `.active` class to check — check `document.getElementById(...)` existence instead, since these modals are added/removed from the DOM rather than toggled):
```javascript
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('clientModal')) closeClientModal();
    else if (document.getElementById('entityEditModal')) closeEntityEditModal();
    // ... etc, most-recently-opened / most-specific first
}, { signal });
```
**Placement (Claude's discretion per CONTEXT.md):** finance.js's version is per-view (registered in that view's `init()`, torn down via AbortController — no explicit `destroy()` call needed since the controller aborts implicitly... actually check: finance.js's `destroy()` should call `modalAbortController.abort()` too — verify at plan time). Given these 3 new modals are used from `clients.js`, `projects.js`, `services.js` (3 separate routed views) plus reused by `home.js` (engagement create), a single Esc listener per view-module (mirroring finance.js's self-contained approach, each view wires its own) is simplest and matches the "no centralized modal registry exists" reality noted in CONTEXT.md — do NOT invent a new app-wide modal-stack singleton for this phase; that is out of scope.

### `escapeHTML` on all user-string interpolation
**Source:** `app/utils.js` (exported `escapeHTML`), used pervasively — see `app/proposal-modal.js` lines 736-756 (every pre-fill value wrapped) and `app/views/clients.js` line 470 (`escapeHTML(client.company_name)`).
**Apply to:** every field value written into the new modals' HTML strings, both for pre-fill (`value="${escapeHTML(existing.field || '')}"`) and for any dropdown option labels built from Firestore data (client names, codes).

### `showLoading` / `showToast` progress + validation feedback
**Source:** `app/utils.js` exports, used identically across `proposal-modal.js` (`showLoading(true)` before write, `showLoading(false)` in `finally`), `clients.js`, `projects.js`, `services.js`, `engagement-create.js`. Keep this exact pattern (D-02) — do not introduce new UI feedback mechanisms.

### Window-fn registration/cleanup lifecycle
**Source:** `CLAUDE.md` § "Window Functions for Event Handlers"; concretely `app/views/clients.js` `attachWindowFunctions()` (27-38) + `destroy()` `delete window.*` block (167-177), and `app/engagement-create.js` `initEngagementForm()`/`destroyEngagementForm()` (599-671, registers 6 window fns, unsubscribes 2 Firestore listeners, resets module state — idempotent by calling `destroyEngagementForm()` at the top of `initEngagementForm()`).
**Apply to:** all 3 new modal modules — each open call registers exactly the window fns its own HTML needs; each close call deletes exactly those names. Do not leave stale window fns after `.remove()`ing the modal DOM (this is how `closeCreateProposalModal` at proposal-modal.js:830-842 behaves — copy verbatim).

## No Analog Found

None — every new file/surface in this phase has at least a role-match analog in the existing codebase (this is a conversion/consolidation phase, not new-capability work).

## Metadata

**Analog search scope:** `app/*.js` (modal + shared modules), `app/views/{clients,projects,services,home,finance}.js`, `app/permissions.js`, `app/tranche-builder.js`, `styles/components.css`
**Files scanned:** 10 read in full or targeted-range; 3 grepped for cross-reference verification (confirmed `editProject`/`editService`/`toggleAdd*Form`/`add*Form` have zero external callers outside their own view files — safe to remove per CONTEXT.md integration-points note)
**Pattern extraction date:** 2026-07-14
