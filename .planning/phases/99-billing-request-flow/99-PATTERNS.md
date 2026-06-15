# Phase 99: Billing Request Flow - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 4 to modify + 1 optional new module (7 work items)
**Analogs found:** 7 / 7 (all work items have a concrete in-repo analog)

> This is a zero-build static SPA (pure ES6 modules, Firebase Firestore v10.7.1 CDN, no
> framework/bundler/test-runner). Every "new file" here is actually a **modification** of an
> existing view module plus `firestore.rules`. The locked UI contract is the spike-024 prototypes
> (`index.html` = project surface, `finance-queue.html` Option A = finance banner). Match their
> look/interactions, but re-implement using existing project CSS classes (`.modal`, `.btn`,
> `.form-control`, `.data-table`) — the spike's inline `.sim-*` / `.btype-pill` classes are
> prototype-only and must NOT be copied verbatim into production CSS.

## File Classification

| File (modified/new) | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `firestore.rules` (add `match /billing_requests`) | config (security rules) | CRUD authz | `firestore.rules:504-525` (collectibles block) | exact |
| `app/views/finance.js` — pending-requests banner + onSnapshot | view / component | event-driven (onSnapshot) + request-response (approve/reject) | `finance.js:1531-1543` (collectibles onSnapshot) + `finance.js:1374-1413` (table render) | exact |
| `app/views/finance.js` — approve bridge (extend `openCreateCollectibleModal`) | view / controller | transform (preselectKey → form prefill) | `finance.js:1611-1681` (existing fn) + `:1620-1624` (parser) + `:1711-1789` (tranche dropdown) | exact (extend in place) |
| `app/views/project-detail.js` — footer link + billing-request modal + submit + status list | view / component | CRUD (create billing_request) + read (own requests) | modal: `finance.js:1629-1681`; submit math: `finance.js:1799-1872`; footer slot: `project-detail.js:534-547` | exact |
| `app/notifications.js` — add `BILLING_REQUEST_*` types to enum + TYPE_META | config / utility | pub-sub (fan-out) | `notifications.js:30-50` (enum) + `:72-91` (TYPE_META) + call site `finance.js:1878-1893` | exact |
| Pill UI (billing-type Progress/Completion/Other) | component | request-response (selection) | spike `index.html:505-594` (prototype only — no production pill analog) | partial — see Pattern 4 |
| `app/billing-requests.js` (OPTIONAL shared helper) | service / utility | transform/validation | n/a (Claude's Discretion per D-Discretion) | no analog (greenfield) |

---

## Pattern Assignments

### Pattern 1 — `firestore.rules`: new `billing_requests` match block (config, CRUD authz) — D-16

**Analog:** `firestore.rules:504-525` (collectibles block). Helpers `isActiveUser()` and `hasRole([...])` already exist in this file.

**Exact analog to mirror** (`firestore.rules:514-525`):
```
match /collectibles/{collId} {
  // All active users can read (Financial Summary cells on project-detail / service-detail need read)
  allow read: if isActiveUser();

  // Create / Update: operations_admin, finance, super_admin
  allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);
  allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);

  // Delete: zero-payment cancellation (client-side guard) — same roles
  allow delete: if hasRole(['super_admin', 'operations_admin', 'finance']);
}
```

**What to write for `billing_requests`** (note the deliberate difference on `create` per D-16 — the
operations_user who submits LACKS collectible authority, so create must be `isActiveUser()`, NOT a role gate):
```
match /billing_requests/{id} {
  // Read: active users (Finance banner + project-detail own-requests list both read)
  allow read: if isActiveUser();

  // Create: any active user (operations_user is the intended creator; they lack collectible authority)
  allow create: if isActiveUser();

  // Update: status transitions (approve/reject) — Finance / operations_admin / super_admin only
  allow update: if hasRole(['super_admin', 'operations_admin', 'finance']);

  // Delete: same finance-authority set (or omit entirely if no delete path is built)
  allow delete: if hasRole(['super_admin', 'operations_admin', 'finance']);
}
```

**Landmine — rules-FIRST protocol (CLAUDE.md "Add New Collection or Tab" + Phase 85 D-24):** the
`match /billing_requests` block MUST land in the SAME commit as the first JS `addDoc(collection(db,'billing_requests'))`.
Without it, even Super Admin gets `permission-denied`. The dev-vs-prod deploy quirk applies (MEMORY: CLI
active project is PROD — deploy with `--project dev` for UAT, then prod).

**Landmine — create-rule asymmetry:** Do NOT copy the collectibles `create: hasRole([...])` line. The
whole point of the phase is that operations_user (who fails `hasCollectibleWriteAuthority()`) CAN create a
`billing_request`. Use `isActiveUser()` for create.

---

### Pattern 2 — Finance Collectibles tab: "Pending Billing Requests" banner + onSnapshot + Approve/Reject (component, event-driven) — D-14

**Analog A (read-side listener wiring + teardown):** `finance.js:1531-1543` inside `initCollectiblesTab()`:
```javascript
const collUnsub = onSnapshot(collection(db, 'collectibles'), (snapshot) => {
    collectiblesData = [];
    snapshot.forEach(docSnap => {
        collectiblesData.push({ id: docSnap.id, ...docSnap.data() });
    });
    populateCollProjectFilter();
    renderCollectiblesTable();
}, (err) => {
    console.error('[Finance/Collectibles] collectibles snapshot error:', err);
    showToast('Failed to load collectibles. Refresh to retry.', 'error');
});
listeners.push(collUnsub);          // <-- teardown handled by shared listeners[] array
```
**Mirror this exactly** for a `billing_requests where('status','==','pending')` listener. Add it inside
`initCollectiblesTab()` so it shares the same lifecycle. Use a query, not a raw collection, to keep the
banner scoped to pending only:
```javascript
const brUnsub = onSnapshot(
    query(collection(db, 'billing_requests'), where('status', '==', 'pending')),
    (snapshot) => { pendingBillingRequests = []; snapshot.forEach(d => pendingBillingRequests.push({ id: d.id, ...d.data() })); renderPendingBillingBanner(); },
    (err) => { console.error('[Finance/BillingReq] snapshot error:', err); }
);
listeners.push(brUnsub);
```
`query`, `where`, `collection`, `onSnapshot` are already imported at `finance.js:6`. Module-state array
`listeners` is the existing teardown channel — `destroy()` already iterates and unsubscribes it.

**Analog B (table/list render with empty-state + escapeHTML):** `finance.js:1374-1413` (`renderCollectiblesTable`).
Key shape: `const tbody = document.getElementById('...'); if (!tbody) return;` then an empty-state branch,
then `tbody.innerHTML = items.map(...).join('')`. Every interpolated user string goes through `escapeHTML()`
(see `finance.js:1697`, `:1758`, `:1776`). Reuse this for the banner row list.

**Banner slot (where the markup goes):** `finance.js:3536-3543` — insert the collapsible banner element
ABOVE the `<div class="card">`/Collectibles `card-header`, inside `<section id="collectibles-section">`.
The banner is empty/hidden when `pendingBillingRequests.length === 0` (D-14 auto-appear/disappear).

**Visual contract (spike `finance-queue.html` Option A, lines 132-195):** blue collapsible block; header
"Pending Billing Requests" + chevron + count dot; rows show project, tranche "(40%) · ₱240,000", submitter
name + date, doc-chip links, Approve (green) / Reject (soft-danger) buttons. Collapse toggle pattern at
`finance-queue.html:367-372`. Re-implement with project `.btn`/`.btn-primary` classes — not `.sim-btn`.

**Reset on destroy:** `finance.js:4507-4530` resets all Collectibles module state (`collectiblesData = [];`
etc.). Add `pendingBillingRequests = [];` + `delete window.approveBillingRequest;` / `delete window.rejectBillingRequest;`
alongside the existing `delete window.openCreateCollectibleModal;` block at `finance.js:4486-4505`.

**Landmine — listener double-attach:** Per CLAUDE.md tab-switch contract, the router does NOT call
`destroy()` when switching between Finance sub-tabs. `initCollectiblesTab()` runs once per Finance mount
(the comment at `finance.js:1520-1530` documents this). Putting the new listener inside `initCollectiblesTab`
inherits that safety. Do NOT attach it from `renderPendingBillingBanner()` (would re-attach on every render).

**Landmine — status exact-match:** Query/filter `status === 'pending'` (lowercase, D-05/D-21). These are
distinct from the Title-Case collectible statuses (`'Pending'`, `'Fully Paid'`). Never lowercase-compare.

---

### Pattern 3 — Approve bridge: extend `openCreateCollectibleModal(preselectKey)` for tranche_index (controller, transform) — D-10/D-11

**Analog (the function to extend in place):** `finance.js:1611-1681`. Current preselectKey parser at
`finance.js:1620-1624`:
```javascript
let selectedDept = '';
let selectedCode = '';
if (preselectKey && typeof preselectKey === 'string') {
    const [d, c] = preselectKey.split(':');
    selectedDept = d || '';
    selectedCode = c || '';
}
```
**Extend to a 3rd segment** (backward compatible — 2-segment keys still work, tranche optional):
```javascript
let selectedDept = '', selectedCode = '', selectedTrancheIdx = null;
if (preselectKey && typeof preselectKey === 'string') {
    const [d, c, t] = preselectKey.split(':');
    selectedDept = d || '';
    selectedCode = c || '';
    selectedTrancheIdx = (t != null && t !== '') ? parseInt(t, 10) : null;
}
```
The existing preselect-apply block at `finance.js:1671-1680` calls `_refreshCreateCollProjectDropdown()`
then `_refreshCreateCollTrancheDropdown()`. **After** the tranche dropdown is rebuilt, set the value:
```javascript
if (selectedCode) {
    const projSel = document.getElementById('createCollProject');
    if (projSel) projSel.value = selectedCode;
    _refreshCreateCollTrancheDropdown();              // existing call
    if (selectedTrancheIdx != null && !isNaN(selectedTrancheIdx)) {
        const trSel = document.getElementById('createCollTranche');
        if (trSel) trSel.value = String(selectedTrancheIdx);   // pre-select tranche (D-10)
    }
}
```

**The D-11 edge — disabled (already-billed) tranche.** `_refreshCreateCollTrancheDropdown()` at
`finance.js:1765-1788` disables already-billed indexes:
```javascript
const usedIndexes = new Set(
    collectiblesData
        .filter(c => c.department === dept && (dept === 'projects' ? c.project_code : c.service_code) === code)
        .map(c => c.tranche_index).filter(i => i != null)
);
const trancheOptions = tranches.map((t, i) => {
    const used = usedIndexes.has(i);
    return `<option value="${i}" ${used ? 'disabled' : ''}>${escapeHTML(t.label || '')} (...)${used ? ' — collectible exists' : ''}</option>`;
});
```
**Landmine:** if the requested tranche_index is in `usedIndexes`, `trSel.value = String(idx)` will silently
FAIL (you cannot select a `disabled` option) — the dropdown stays on the placeholder and Finance sees no
selection. D-11 requires graceful handling: detect this case (`trSel.querySelector('option[value="'+idx+'"]')?.disabled`)
and surface a hint near the dropdown (e.g. "This tranche already has a collectible — it can't be re-billed").
Do NOT leave an invalid/empty selection without explanation. Approve still opens the modal; Finance decides.

**Caller side (the new Approve handler):** call `window.openCreateCollectibleModal('projects:' + req.project_code + ':' + req.tranche_index)`
then mark the request approved (D-12 — separate action; approve does NOT auto-create the collectible).
`openCreateCollectibleModal` already gates on `hasCollectibleWriteAuthority()` at `finance.js:1612` so only
Finance reaches it — no extra guard needed.

---

### Pattern 4 — Billing-request modal (tranche picker → billing-type pills → doc-link fields → notes → submit) (component, CRUD) — D-04/D-06/D-07/D-08

**Analog A (modal markup shell + insert/remove pattern):** `finance.js:1629-1681`. Pattern:
`const existing = document.getElementById('createCollectibleModal'); if (existing) existing.remove();`
then `document.body.insertAdjacentHTML('beforeend', modalHtml)`. Use project CSS: `class="modal"` +
`class="modal-content"` + `.modal-header`/`.modal-body`/`.modal-footer`, `.form-control`, `.btn .btn-primary`,
`.btn .btn-outline`. Close via `onclick="document.getElementById('...').remove()"`. (See full markup
`finance.js:1629-1667`.)

**Analog B (amount math + denormalized-freeze + addDoc) — D-06:** `finance.js:1826-1872`:
```javascript
const meta = (dept === 'projects' ? projectsForCollMap : servicesForCollMap).get(code);
const tranche = meta.collection_tranches[trancheIndex];
const contractCost = parseFloat(meta.contract_cost) || 0;
const tranchePct = parseFloat(tranche.percentage) || 0;
const amountRequested = (tranchePct / 100) * contractCost;   // <-- mirror EXACTLY for D-06
// ...
const collDoc = {
    /* ... */
    tranche_index: trancheIndex,
    tranche_label: tranche.label,        // FROZEN at creation
    tranche_percentage: tranchePct,      // FROZEN at creation
    amount_requested: amountRequested,   // FROZEN at creation
    created_by_user_id: window.getCurrentUser?.()?.uid ?? null,
    created_by_name: window.getCurrentUser?.()?.full_name || window.getCurrentUser?.()?.email || 'Unknown User',
    date_created: serverTimestamp()
};
await addDoc(collection(db, 'collectibles'), collDoc);
```
**For the billing_request doc** (D-04 schema), freeze the same way but use the schema field names:
`project_code, project_name, tranche_index, tranche_label, tranche_percentage, amount_requested,
billing_type, documents: [{key,label,url}], notes, status: 'pending', requested_by_uid, requested_by_name,
requested_at: serverTimestamp()`. Use `addDoc` auto-id (D-Discretion — no human-readable ID needed).

**IMPORTANT — data source differs in project-detail.js.** The modal lives in `project-detail.js`, which does
NOT have `projectsForCollMap`. The tranche list + contract_cost come from `currentProject` directly:
`currentProject.collection_tranches` (array of `{label, percentage}`) and `currentProject.contract_cost`
(confirmed on the project doc — `project-detail.js:496` edits `contract_cost`; `finance.js:1555` reads
`data.collection_tranches` off the same project doc). Compute `amountRequested = (parseFloat(tranche.percentage)/100) * (parseFloat(currentProject.contract_cost)||0)`.

**Analog C (billing-type pills — D-07).** There is **no production pill-selection analog** in the codebase
for this interaction (the supplier-categories "pills" are display tags, not a single-select control). The
spike `index.html:505-594` is the canonical interaction reference (prototype-only CSS):
```javascript
// spike index.html:545-549 — doc requirements by type (mirror into production)
const DOCS = {
  progress:   [{ key: 'pr',  label: 'Progress Report' }],
  completion: [{ key: 'coc', label: 'Certificate of Completion (COC)' }, { key: 'cr', label: 'Completion Report' }],
  other:      [{ key: 'doc', label: 'Supporting Document' }],
};
// spike index.html:581-594 — selectType: toggle .sel class, render doc fields, re-validate
// spike index.html:569-579 — onTrancheChange auto-HINT: label contains 'completion'/'final' -> completion; 'progress' -> progress (overrideable)
// spike index.html:596-600 — validate(): submit disabled until every required doc URL is non-empty
```
Re-implement the pill UI with new dedicated classes (or inline styles matching the `.btype-pill` look:
2px border, blue selected state `#1a73e8`/`#eff6ff`). Keep the three pills in order Progress / Completion / Other
(D-Specifics). Auto-hint from `tranche.label.toLowerCase()` but ALWAYS overrideable (D-07).

**Landmines:**
- **escapeHTML on doc URLs + labels + notes** (D-19): every user-entered URL/label/notes string must be
  `escapeHTML()`'d on render. Doc links rendered as anchors MUST carry `target="_blank" rel="noopener noreferrer"`
  (CLAUDE.md / D-19). The spike uses `<input type="url">` for entry; validate non-empty before enabling Submit.
- **D-08 validation gate:** Submit stays disabled until ALL required links for the chosen type are filled
  (progress=1, completion=2, other=1). Mirror spike `validate()`.
- **Double-submit guard:** mirror `finance.js:1842-1847` (disable submit button before `addDoc`, re-enable in catch).
- **No tranche / no contract_cost edge:** if `currentProject.collection_tranches` is empty or
  `contract_cost <= 0`, the footer link should not open a broken modal — mirror the block-message pattern at
  `finance.js:1757-1763` / `:1832-1836` (friendly inline error, don't proceed).

---

### Pattern 5 — Project Detail footer link "↑ Initiate Billing →" + own-requests status list (component, read) — D-01/D-15

**Analog (the slot + surrounding card):** `project-detail.js:534-547` — the Collectibles group inside the
Financial Summary card:
```html
<!-- Collectibles group -->
<div style="border-top:1px solid #f1f5f9;margin:0.4rem 0;"></div>
<div style="font-size:0.65rem;font-weight:700;color:#059669;...">Collectibles</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem 0.75rem;">
  <div style="background:#f0fdf4;...">Collected ... ${formatCurrency(currentCollectibles.totalCollected)}</div>
  <div style="background:#f0fdf4;...">Rem. Collectible ... ${formatCurrency(currentCollectibles.remainingCollectible)}</div>
</div>
```
**Insert AFTER line 546** (closing `</div>` of the grid, before the group's closing `</div>` at 547): a
right-aligned footer link, exactly matching spike `index.html:293-295`:
```html
<div style="text-align:right;margin-top:0.4rem;">
  <span class="sim-link" onclick="window.openBillingRequestModal()">↑ Initiate Billing →</span>
</div>
```
(Re-style with an existing link/button class, not `.sim-link`.) Below it, render a compact list of THIS
project's billing requests with status pills (pending / approved / rejected + reason).

**render()/init()/destroy() structure to follow (project-detail.js):**
- `render()` `project-detail.js:65-77` returns a loading shell; the real markup is built in
  `renderProjectDetail()` and injected. Your footer link goes into the `renderProjectDetail()` template string.
- `init()` `project-detail.js:80-116` attaches window functions via `attachWindowFunctions()` (the bulk
  registrations are at `:1582-1606`) and pushes listeners to module vars (`listener`, `usersListenerUnsub`).
  **Add** the own-requests onSnapshot here, scoped `query(collection(db,'billing_requests'), where('project_code','==', projectCode))`.
- `destroy()` `project-detail.js:260-325`: unsubscribe each listener (mirror `:273-281`), reset module state
  (mirror `:298-302`), and `delete window.openBillingRequestModal;` / `delete window.submitBillingRequest;`
  alongside the existing `delete window.*` block at `:304-325`.

**escapeHTML usage in this file** is already established (`project-detail.js:7` imports it). Use it for
`rejection_reason`, doc labels/urls, submitter name in the status list (D-19).

**Window-function attach/delete pattern** (`project-detail.js:1582-1606` attach, `:304-325` delete):
```javascript
// attach (in attachWindowFunctions):
window.openBillingRequestModal = openBillingRequestModal;
window.submitBillingRequest    = submitBillingRequest;
// delete (in destroy):
delete window.openBillingRequestModal;
delete window.submitBillingRequest;
```

**Landmine — re-render churn:** `renderProjectDetail()` is called on every `permissionsChanged` / expense
refresh (`project-detail.js:100-104`, `:940`). If you store the own-requests list in a module var and render
from it (rather than building a separate detached DOM node), the footer + status list will survive re-renders
consistently. Restore-focus logic at `project-detail.js:569-578` shows the re-render is frequent.

**Landmine — visibility:** D-15 — the footer link + modal must be reachable by `operations_user` (who can't
open Finance). Do NOT gate the footer link behind `showEditControls` / admin-only flags. (Status-list read
is fine — `billing_requests` read rule is `isActiveUser()`.)

---

### Pattern 6 — Notification fan-out on submit (→ Finance role) and on approve/reject (→ submitter uid) (config + pub-sub) — D-17

**Analog A (the enum + TYPE_META to extend):** `notifications.js:30-50` (`NOTIFICATION_TYPES`) and
`notifications.js:72-91` (`TYPE_META`). Add two frozen entries (confirm exact names during plan — D-17
suggests `BILLING_REQUEST_SUBMITTED`, `BILLING_REQUEST_DECIDED`):
```javascript
// in NOTIFICATION_TYPES (notifications.js:30-50):
BILLING_REQUEST_SUBMITTED: 'BILLING_REQUEST_SUBMITTED',
BILLING_REQUEST_DECIDED:   'BILLING_REQUEST_DECIDED',
```
TYPE_META anatomy (Phase 95 — `notifications.js:72-91`): each entry needs
`{ label, icon: svg('<path .../>'), color, action_required, target_route }`. The `svg()` helper is at
`notifications.js:70`. Mirror the COLLECTIBLE_CREATED entry (`notifications.js:90`) for the money-in look:
```javascript
BILLING_REQUEST_SUBMITTED: { label: 'Billing Request', icon: svg('<path d="..."/>'), color: '#1a73e8', action_required: true,  target_route: '#/finance/collectibles' },
BILLING_REQUEST_DECIDED:   { label: 'Billing Decision', icon: svg('<path d="..."/>'), color: '#059669', action_required: false, target_route: '#/projects' },
```
(`action_required: true` on the Finance-facing SUBMITTED type drives the "● Action needed" chip — see
`notifications.js:201`.)

**Analog B (submit → notify Finance ROLE):** `finance.js:1878-1893` (COLLECTIBLE_CREATED fan-out) is the
canonical role-broadcast call site:
```javascript
try {
    await createNotificationForRoles({
        roles: ['finance'],
        type: NOTIFICATION_TYPES.COLLECTIBLE_CREATED,
        message: `New collectible filed: ${collId} (${tranche.label}, PHP ${formatCurrency(amountRequested)}) on ${labelType} ${targetName}`,
        link: '#/finance/collectibles',
        source_collection: 'collectibles',
        source_id: collId,
        object_name: targetName || '',
        actor_name: window.getCurrentUser?.()?.full_name || 'System'
    });
} catch (notifErr) {
    console.error('[Collectibles] COLLECTIBLE_CREATED notification failed:', notifErr);
}
```
**Mirror this** in `project-detail.js submitBillingRequest()` after the `addDoc` succeeds: `roles: ['finance']`,
`type: NOTIFICATION_TYPES.BILLING_REQUEST_SUBMITTED`. `project-detail.js:10` already imports
`createNotificationForUsers, NOTIFICATION_TYPES` — **add `createNotificationForRoles`** to that import.

**Analog C (approve/reject → notify the SUBMITTER uid):** use `createNotificationForUsers`
(`notifications.js:600-652`). It guards against null actor UID and chunks at 500. Call it from the
finance.js approve/reject handlers:
```javascript
try {
    await createNotificationForUsers({
        user_ids: [req.requested_by_uid],
        type: NOTIFICATION_TYPES.BILLING_REQUEST_DECIDED,
        message: `Your billing request for ${req.project_name} (${req.tranche_label}) was ${decision}.` + (reason ? ` Reason: ${reason}` : ''),
        link: `#/projects/detail/${req.project_code}`,
        source_collection: 'billing_requests',
        source_id: req.id,
        object_name: req.project_name || '',
        actor_name: window.getCurrentUser?.()?.full_name || 'System'
    });
} catch (notifErr) {
    console.error('[Finance/BillingReq] BILLING_REQUEST_DECIDED notification failed:', notifErr);
}
```
`createNotificationForRoles, NOTIFICATION_TYPES, createNotification` are already imported in `finance.js:11`.

**Landmines:**
- **Fire-and-forget try/catch (D-17 / Phase 83 D-03 / Phase 84.1):** EVERY notification call is wrapped in
  its own `try/catch`; a notification failure must NEVER block the primary write (the `addDoc`/`updateDoc`
  already committed). The helpers also swallow Firestore errors internally (return null/0), but the wrapping
  try/catch is still mandatory per convention.
- **createNotificationForRoles permission edge (`notifications.js:521-523`):** an operations_user firing the
  SUBMITTED fan-out queries `users where role in [...] and status==active`. Confirm the `users` read rule
  permits this during plan/UAT — if blocked, the helper returns 0 (logged, non-fatal). Flag for the DevTools
  confirmation step (MEMORY: code-inspection misses secondary mechanisms).
- **excludeActor default differs:** `createNotificationForRoles` defaults `excludeActor: true`;
  `createNotificationForUsers` defaults `excludeActor: false`. For approve/reject → submitter, the actor is
  Finance and the recipient is the submitter, so the default `false` is correct (submitter must be notified).

---

## Shared Patterns

### escapeHTML on all user strings (D-19)
**Source:** imported in `finance.js:7`, `project-detail.js:7`, `notifications.js:17`.
**Apply to:** every interpolated user-supplied value — `notes`, doc `label`/`url`, `requested_by_name`,
`rejection_reason`, `project_name`. Doc-link anchors: `target="_blank" rel="noopener noreferrer"`.
Reference render usage: `finance.js:1697`, `notifications.js:186-212`.

### Listener lifecycle (D-20)
**Source:** finance.js uses a shared `listeners[]` array (`finance.js:1543`, teardown via `destroy()`'s
iterate-and-unsubscribe); project-detail.js uses named module vars (`listener`, `usersListenerUnsub`) torn
down at `project-detail.js:273-281`. **Apply to:** the new pending-requests listener (finance.js → push to
`listeners[]`) and the own-requests listener (project-detail.js → new named var, unsubscribe in `destroy()`).

### Window functions for onclick (D-18)
**Source:** `finance.js:376-384` attach / `:4486-4505` delete; `project-detail.js:1582-1606` attach / `:304-325`
delete. **Apply to:** `approveBillingRequest`, `rejectBillingRequest` (finance.js); `openBillingRequestModal`,
`submitBillingRequest` (project-detail.js). Attach in `init`/`attachWindowFunctions`, delete in `destroy()`.

### Case-sensitive status (D-05/D-21)
billing_request status is lowercase exact: `'pending'` / `'approved'` / `'rejected'`. Never compare
case-insensitively; never reuse the Title-Case collectible-status logic.

### Fire-and-forget notifications (D-17)
Every `createNotification*` call wrapped in its own try/catch; primary write must succeed independently.

---

## No Analog Found

| Item | Role | Data Flow | Reason / Guidance |
|------|------|-----------|-------------------|
| Billing-type pill single-select control | component | request-response | No production pill-selection widget exists (supplier categories are display tags, not a select). Use spike `index.html:505-600` as the interaction spec; build dedicated CSS matching `.btype-pill` look. |
| `app/billing-requests.js` shared helper (optional) | service/utility | transform/validation | Greenfield. D-Discretion permits a shared module to dedup schema/validation/`DOCS` map between finance.js and project-detail.js. No analog — model it on the lean exported-helper style of `app/coll-id.js` / `app/notifications.js`. |

---

## Metadata

**Analog search scope:** `firestore.rules`, `app/views/finance.js` (5786 anchor lines incl. collectibles
read/write), `app/views/project-detail.js` (render/init/destroy + financial summary + collectibles aggregation),
`app/notifications.js` (full), spike-024 prototypes (`index.html`, `finance-queue.html`).
**Files scanned:** 6 source + 2 spike + 2 context.
**Pattern extraction date:** 2026-06-04
