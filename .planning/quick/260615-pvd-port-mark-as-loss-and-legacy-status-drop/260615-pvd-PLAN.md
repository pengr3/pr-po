---
phase: quick-260615-pvd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/service-detail.js
autonomous: false
requirements: [PVD-A-legacy-status-dropdown, PVD-B-mark-as-loss]

must_haves:
  truths:
    - "An assigned services_user viewing a LEGACY-status service (status not in UNIFIED_STATUS_OPTIONS) sees a status dropdown in the detail header instead of a read-only badge"
    - "Selecting a canonical status from that dropdown re-stages the service via saveServiceField('project_status', …) — which stamps status_changed_at and fires NOTIF-11 — and the dropdown reverts to a read-only badge on the next render"
    - "A canonical-status service shows the read-only badge (no dropdown); status advances only through the lifecycle gates"
    - "A non-terminal service driveable by the current user shows a 'Mark as Loss' button in the lifecycle card chrome footer"
    - "Mark as Loss on a service with NO open proposal (PATH B) sets project_status='Loss' + loss_reason directly and fires recordEditHistory + NOTIF-11"
    - "Mark as Loss on a service WITH an open proposal (PATH A) sets BOTH the service doc and the proposal doc to loss atomically via _applyProposalStateTransition, then writes loss_reason to the service doc"
    - "The Loss button is hidden on Completed/Loss services and for users who fail canDrive"
  artifacts:
    - path: "app/views/service-detail.js"
      provides: "Legacy-only header status dropdown (FEATURE A) + stage-agnostic Mark as Loss dual-path writer (FEATURE B)"
      contains: "window.submitServiceLoss"
  key_links:
    - from: "hdrServiceStatusSelect onchange"
      to: "window.saveServiceField('project_status', …)"
      via: "inline onchange handler"
      pattern: "hdrServiceStatusSelect.*saveServiceField"
    - from: "updateServiceLifecycleBadge"
      to: "hdrServiceStatusSelect / hdrServiceStatusBadge"
      via: "select-aware badge updater (set .value if select exists, else update span)"
      pattern: "hdrServiceStatusSelect"
    - from: "window.submitServiceLoss PATH A"
      to: "_applyProposalStateTransition + services doc loss_reason write"
      via: "open-proposal detection on proposals where project_id == serviceId"
      pattern: "_applyProposalStateTransition"
---

<objective>
Port two already-shipped project-detail.js features to service-detail.js for services parity, in a SINGLE file (app/views/service-detail.js):

- **FEATURE A — Legacy-only status dropdown.** Replace the static `#hdrServiceStatusBadge` header span with an IIFE that renders an editable `<select id="hdrServiceStatusSelect">` ONLY when the current status is legacy (not in `UNIFIED_STATUS_OPTIONS`, L67-78) AND the user has edit rights; otherwise keep the read-only badge. Make `updateServiceLifecycleBadge()` select-aware so live snapshots don't clobber the dropdown.
- **FEATURE B — Stage-agnostic "Mark as Loss."** Add a danger button to the lifecycle card chrome footer (visible on any non-terminal status for canDrive users) plus two new window functions: `openServiceLossModal` (reason-capture modal) and `submitServiceLoss` (dual-path writer — PATH A canonical batch transition when an open proposal exists, PATH B direct service-doc write otherwise).

Purpose: Bring services to behavioral parity with the shipped project-detail.js Mark-as-Loss (quick 260615-osa) and legacy-status dropdown (quick 260615-odj). The services equivalents (`saveServiceField`, `_applyProposalStateTransition`, the services audit/activity helpers) already exist and carry the correct side-effects, so this is a 1:1 mirror with names adapted to the services domain.

Output: A modified `app/views/service-detail.js` that passes `node --check`, with both features wired and torn down symmetrically.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<no_rules_change>
**DO NOT EDIT firestore.rules. DO NOT run any firebase deploy.** This task is JS-only.

Confirmed during grounding:
- The `services` update rule (firestore.rules:572-575) is `hasRole(['super_admin','services_admin']) || (isRole('services_user') && isAssignedToService(resource.data.service_code)) || (finance retention-only)`. The `services_user` branch is UNMASKED (no `hasOnly`) → an assigned services_user can already write `loss_reason` / `project_status` / any field. Unlike the projects collection, there is NO field-mask gap to patch.
- The proposals BRANCH-2 field-mask already permits BOTH the services sub-branch AND `loss_reason` (commit `113e5f6`). PATH A's proposal write is already allowed.

Therefore this task touches ONLY app/views/service-detail.js and needs NO rules edit / NO deploy.
</no_rules_change>

<interfaces>
<!-- All identifiers below VERIFIED against the current files. Use directly — no codebase exploration needed. -->

ALREADY IMPORTED at service-detail.js top (do NOT re-import):
- `_applyProposalStateTransition` (L13, from './proposals.js')
- `recordEditHistory` (L9, from '../edit-history.js')
- `createNotificationForUsers`, `NOTIFICATION_TYPES` (L11, from '../notifications.js')
- `db, collection, doc, updateDoc, query, where, getDocs, serverTimestamp` (L7, from '../firebase.js')
- `showLoading, showToast, escapeHTML` (L8, from '../utils.js')

Module state / helpers (VERIFIED):
- `UNIFIED_STATUS_OPTIONS` — array, service-detail.js:67-78. 10 canonical statuses (For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going, Completed, Loss). NO 'Draft' entry — any status NOT in this array is legacy.
- `currentService` — module var (the service doc, has `.id`, `.project_status`, `.service_code`, `.service_name`, `.personnel_user_ids`, `.parent_collection`).
- `currentServiceDocId` — module var (the service doc id).
- `_getServiceStatusColor(status)` — service-detail.js:2163.
- `saveServiceField(fieldName, newValue)` — async, service-detail.js:1211. Handles `project_status`: stamps `status_changed_at` (L1288) + fires NOTIF-11 via createNotificationForUsers + NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED with NOTIF11_STATUS_WHITELIST (L1266-1308). Registered on window at L3280; cleaned up at L326. The dropdown's onchange gets all status side-effects for free.
- `addServiceAuditEntry(serviceDocId, action, actorId, actorName, comment)` — async, service-detail.js:2548.
- `_addServiceActivityEntry(serviceDocId, { type, text, is_system })` — async, service-detail.js:2558.
- `renderServiceLifecycleCard(service, currentUser)` — service-detail.js:2470. The CHROME function; `#lcBody` filled separately. The Loss button goes in its returned template (a new `lc-footer` div), NOT in any per-status body branch.
- `updateServiceLifecycleBadge(service)` — service-detail.js:2492. CURRENTLY (L2503-2507) it always does `hdrBadge.style.background` + `.textContent = status` on `#hdrServiceStatusBadge`. THIS IS THE GOTCHA — must be made select-aware.
- `_getServiceStatusColor`, `currentUser`/`user` (= `window.getCurrentUser?.()`), `showEditControls` (= `window.canEditTab?.('services') === true`) are in scope at renderServiceDetail (L805-809). The header span is at L838.
- canDrive shape (VERIFIED at loadProposalCard, service-detail.js:1819-1826):
  ```
  const adminRoles = ['super_admin', 'operations_admin', 'services_admin'];
  const assignedRoles = ['operations_user', 'services_user'];
  const canDrive = adminRoles.includes(role)
      || (assignedRoles.includes(role) && uid && (currentService?.personnel_user_ids || []).includes(uid));
  ```

PROJECT-DETAIL.JS REFERENCE (the shipped originals to mirror 1:1):
- Legacy dropdown IIFE: project-detail.js:636-648.
- Select-aware badge updater: project-detail.js:2796-2805 (hdrSelect branch).
- showLossBtn + lc-footer button: project-detail.js:2762-2781.
- openProjectLossModal: project-detail.js:3878-3915.
- submitProjectLoss (dual-path): project-detail.js:3917-4014.

RENAME MAP (projects → services):
  currentProject→currentService · 'projects'→'services' · #/projects/detail/→#/services/detail/ ·
  hdrStatusSelect→hdrServiceStatusSelect · hdrStatusBadge→hdrServiceStatusBadge ·
  _getProjectStatusColor→_getServiceStatusColor · saveField→saveServiceField ·
  projectLossModal→serviceLossModal · projectLossReason→serviceLossReason ·
  projectLossReasonError→serviceLossReasonError · openProjectLossModal→openServiceLossModal ·
  submitProjectLoss→submitServiceLoss · addProjectAuditEntry→addServiceAuditEntry ·
  _addActivityEntry→_addServiceActivityEntry · project_id stays project_id (service proposals
  use project_id == the SERVICE doc id; query shape is identical) · projectId arg→serviceId ·
  copy "Project"→"Service" in user-facing strings (toast/label/notif message).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: FEATURE A — legacy-only header status dropdown + select-aware badge updater</name>
  <files>app/views/service-detail.js</files>
  <action>
Mirror project-detail.js:636-648 and 2796-2805 into service-detail.js.

STEP 1 — Replace the static header status span at service-detail.js:838 with a legacy-only IIFE. Currently L838 is a single `<span id="hdrServiceStatusBadge" …>` element inside the header strip. Replace that one span with an IIFE expression that:
- computes `const _curStatus = currentService.project_status || '';`
- computes `const _isLegacy = _curStatus && !UNIFIED_STATUS_OPTIONS.includes(_curStatus);`
- if `showEditControls && _isLegacy`: returns a `<select id="hdrServiceStatusSelect" onchange="window.saveServiceField('project_status', this.value)" …>` whose options are a prepended selected legacy option (`<option value="${escapeHTML(_curStatus)}" selected>${escapeHTML(_curStatus)} (legacy)</option>`) followed by all `UNIFIED_STATUS_OPTIONS` mapped to `<option>`s. Reuse the EXACT inline `style="…"` from project-detail.js:645 (font-size:0.82rem;padding:0.3rem 0.5rem;border-radius:8px;border:1px solid #cbd5e1;background:white;color:#1e293b;font-weight:600;cursor:pointer;).
- else: returns the ORIGINAL read-only span `<span id="hdrServiceStatusBadge" class="hdr-status" style="background:${_getServiceStatusColor(_curStatus)};color:white;padding:0.3rem 0.85rem;border-radius:20px;font-size:0.82rem;font-weight:600;">${escapeHTML(_curStatus || '—')}</span>` (preserve current styling verbatim).
Include the same gating comment from project-detail.js:639-641 explaining the dropdown is a remediation escape-hatch for LEGACY data ONLY (canonical-status services keep the read-only badge + lifecycle gates). `showEditControls` (L806) and `_getServiceStatusColor` are already in scope here.

STEP 2 — Make `updateServiceLifecycleBadge(service)` select-aware. At service-detail.js:2503-2507 it currently unconditionally writes to `#hdrServiceStatusBadge` (`.style.background` + `.textContent = status`). Replace that block with the select-aware pattern from project-detail.js:2796-2805: first look up `const hdrSelect = document.getElementById('hdrServiceStatusSelect');` — if it exists, set `hdrSelect.value = status;` and return/skip; ELSE fall back to the existing `#hdrServiceStatusBadge` span update (background + textContent). Leave the `#lcCurBadge` update (L2496-2502) and accordion-class / lcActionHint logic (L2508-2522) untouched.

Do NOT change `UNIFIED_STATUS_OPTIONS`, `_getServiceStatusColor`, or any lifecycle-gate logic. No `tdd="true"` — this is render/glue code in a zero-build SPA with no test harness.
  </action>
  <verify>
    <automated>cd "C:/Users/Admin/Roaming/pr-po" && node --check app/views/service-detail.js && echo "syntax OK" && grep -c "hdrServiceStatusSelect" app/views/service-detail.js</automated>
  </verify>
  <done>`node --check` passes. `grep -c "hdrServiceStatusSelect"` returns ≥2 (the dropdown render in the header IIFE + the select-aware lookup in updateServiceLifecycleBadge). The header IIFE branches on `showEditControls && _isLegacy`; canonical-status services still render `#hdrServiceStatusBadge`. The dropdown onchange calls `window.saveServiceField('project_status', this.value)`.</done>
</task>

<task type="auto">
  <name>Task 2: FEATURE B — stage-agnostic Mark-as-Loss button + dual-path window functions</name>
  <files>app/views/service-detail.js</files>
  <action>
Mirror project-detail.js:2762-2781 (button) + 3878-3915 (modal) + 3917-4014 (dual-path writer) into service-detail.js.

STEP 1 — Add the Loss button to the lifecycle card chrome. In `renderServiceLifecycleCard(service, currentUser)` (service-detail.js:2470-2490), after computing `const color = _getServiceStatusColor(status);` (L2475), add the canDrive computation and `showLossBtn`, mirroring project-detail.js:2756-2765:
- `const uid = currentUser?.uid; const role = currentUser?.role || '';`
- `const adminRoles = ['super_admin','operations_admin','services_admin'];`
- `const assignedRoles = ['operations_user','services_user'];`
- `const canDrive = adminRoles.includes(role) || (assignedRoles.includes(role) && uid && (service.personnel_user_ids || []).includes(uid));`
- `const showLossBtn = !['Loss','Completed'].includes(status) && canDrive;`
Then, in the returned template, add a footer AFTER the `<div class="lc-body" id="lcBody">…</div>` line (L2488) and BEFORE the closing `</div>` of `.lc-accordion` (L2489) — mirroring project-detail.js:2779-2781:
`${showLossBtn ? `<div class="lc-footer" style="padding:0.75rem 1rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;"><button class="btn btn-danger" onclick="window.openServiceLossModal('${escapeHTML(service.id)}')">Mark as Loss</button></div>` : ''}`
This footer lives in the CHROME (renderServiceLifecycleCard), NOT in any per-status body branch — it must NOT be touched by the `#lcBody` in-place rebuild.

STEP 2 — Register `window.openServiceLossModal` and `window.submitServiceLoss`. Add both inside `attachWindowFunctions()` (the function starting at service-detail.js:3279) — co-locate them near the lifecycle gate window fns (after `window.lcMarkServiceComplete`, ~L3488) for readability.

`window.openServiceLossModal = function(serviceId) { … }` — mirror project-detail.js:3878-3915:
- guard `if (!currentService || currentService.id !== serviceId) return;`
- defense-in-depth re-check of canDrive (same adminRoles/assignedRoles shape, `cu = window.getCurrentUser?.()`, `_personnel = currentService.personnel_user_ids || []`) and terminal-status; on fail `showToast('Permission denied.', 'error'); return;`
- remove any stale `#serviceLossModal`, then insert a `#serviceLossModal` modal (reuse project-detail.js modal markup verbatim, renaming ids to `serviceLossModal` / `serviceLossReason` / `serviceLossReasonError`; reword copy "project"→"service"). Confirm button calls `window.submitServiceLoss('${escapeHTML(serviceId)}')`.

`window.submitServiceLoss = async function(serviceId) { … }` — mirror project-detail.js:3917-4014 EXACTLY, adapted:
- same guard + defense-in-depth canDrive/terminal re-check.
- read+trim `#serviceLossReason`; if `< 10` chars, show `#serviceLossReasonError` ("Loss Reason is required (minimum 10 characters).") and return.
- `showLoading(true);` then `try { … } catch { showToast(err?.message || 'Failed to record loss. Please try again.', 'error'); } finally { showLoading(false); }`.
- Open-proposal detect: `const propSnap = await getDocs(query(collection(db,'proposals'), where('project_id','==', serviceId)));` then `const openProposalDoc = propSnap.docs.find(d => { const s = d.data().status; return s !== 'client_approved' && s !== 'loss'; });` (service proposals carry `project_id == serviceId` and `parent_collection:'services'` — query shape identical to projects).
- PATH A (openProposalDoc exists): build `const proposal = { id: openProposalDoc.id, ...openProposalDoc.data() };` then `await _applyProposalStateTransition({ proposal, newStatus:'loss', newProjectStatus:'Loss', auditAction:'LOSS_RECORDED', auditComment:reason, extraProposalFields:{ loss_reason:reason } });` (this writes the SERVICE doc automatically via proposal.parent_collection='services'). Then parity write `await updateDoc(doc(db,'services',serviceId), { loss_reason:reason, updated_at:new Date().toISOString() });`. Then refresh the proposal card: `loadProposalCard(serviceId, currentService.parent_collection || 'services');`.
- PATH B (no open proposal): capture `const oldStatus = currentService.project_status ?? null;` then `await updateDoc(doc(db,'services',serviceId), { project_status:'Loss', loss_reason:reason, status_changed_at:new Date().toISOString(), updated_at:new Date().toISOString() });`. Then fire-and-forget mirror of saveServiceField's status side-effects: `recordEditHistory(serviceId, 'update', [{ field:'project_status', old_value:oldStatus, new_value:'Loss' }], 'services').catch(…)` (NOTE the `'services'` 3rd arg — see L1292-1294) AND a NOTIF-11 block: recipients = `(currentService.personnel_user_ids || []).filter(Boolean)`, and if non-empty `createNotificationForUsers({ user_ids:recipients, type:NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED, message:\`Service "${currentService.service_name}" status changed to: Loss\`, link: currentService.service_code ? \`#/services/detail/${currentService.service_code}\` : '#/services', source_collection:'services', source_id: currentService.service_code || serviceId, object_name: currentService.service_name || '', actor_name: cu?.full_name || 'System' }).catch(…)` (mirror saveServiceField L1298-1308 / submitProjectLoss L3980-3996).
- BOTH paths (after the if/else): fire-and-forget `addServiceAuditEntry(serviceId, 'LOSS_RECORDED', cu?.uid, cu?.full_name, reason).catch(…)` and `_addServiceActivityEntry(serviceId, { type:'system', is_system:true, text:\`Service marked as Loss by ${cu?.full_name || 'Unknown'}\` }).catch(…)`.
- On success: `document.getElementById('serviceLossModal')?.remove(); showToast('Service marked as Loss.', 'success');` (the onSnapshot listener re-renders the page).

STEP 3 — Teardown. In `destroy()`, add after the existing lifecycle-gate deletes (~service-detail.js:378, after `delete window.lcMarkServiceComplete;`):
`delete window.openServiceLossModal;`
`delete window.submitServiceLoss;`
`document.getElementById('serviceLossModal')?.remove();`

No `tdd="true"` — glue/handler code in a zero-build SPA with no test harness; verification is `node --check` + browser UAT (Task 3).
  </action>
  <verify>
    <automated>cd "C:/Users/Admin/Roaming/pr-po" && node --check app/views/service-detail.js && echo "syntax OK" && grep -c "window.openServiceLossModal" app/views/service-detail.js && grep -c "window.submitServiceLoss" app/views/service-detail.js && grep -c "_applyProposalStateTransition" app/views/service-detail.js</automated>
  </verify>
  <done>`node --check` passes. `grep -c "window.openServiceLossModal"` ≥2 (register + delete) and `grep -c "window.submitServiceLoss"` ≥2 (register + delete). `submitServiceLoss` contains both PATH A (`_applyProposalStateTransition` + services `loss_reason` write + `loadProposalCard`) and PATH B (direct `updateDoc` to services with `project_status:'Loss'` + fire-and-forget `recordEditHistory`/NOTIF-11). The lifecycle card chrome renders the `lc-footer` Mark-as-Loss button only when `showLossBtn` (non-terminal && canDrive). `#serviceLossModal` removed in destroy().</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
FEATURE A: a legacy-only status dropdown in the service detail header (replaces the read-only badge only when status is non-canonical and the user can edit), with a select-aware badge updater so live snapshots don't clobber the dropdown.
FEATURE B: a stage-agnostic "Mark as Loss" button in the service lifecycle card footer, with a reason-capture modal and a dual-path writer (PATH A canonical proposal-state transition when an open proposal exists; PATH B direct service-doc write otherwise).
Both wired in app/views/service-detail.js only. NO firestore.rules change, NO deploy.
  </what-built>
  <how-to-verify>
Run a local server (`python -m http.server 8000`) and sign in as **services_admin** OR an **assigned services_user** (services UAT requires one of these — a services_user must be in the service's personnel to drive Loss/dropdown).

1. **Legacy dropdown (FEATURE A):** Open a service whose `project_status` is a LEGACY value (anything NOT in: For Inspection / For Proposal / Proposal for Internal Approval / Proposal Under Client Review / For Revision / Client Approved / For Mobilization / On-going / Completed / Loss). The header status chip should render as a `<select>` (not a static pill). Pick a canonical status (e.g. "On-going") → it saves (toast/no error), and after the live re-render the header reverts to a read-only badge. Open a CANONICAL-status service → confirm it shows the read-only badge, NO dropdown.
2. **PATH B Loss (no proposal):** Open a non-terminal service that has NO proposal. Click "Mark as Loss" in the lifecycle card footer → enter a reason ≥10 chars → Confirm. The service flips to Loss (badge + ✗ LOSS track marker), and the assigned personnel get a status-change notification.
3. **PATH A Loss (open proposal):** Open a non-terminal service that HAS an open proposal (status not client_approved/loss). Click Mark as Loss → reason → Confirm. Verify BOTH the service AND its proposal flip to loss (the inline proposal card refreshes to a loss state).
4. **Gating:** On a Completed or Loss service, the Mark-as-Loss button is HIDDEN. Sign in as a non-assigned/view-only user → button hidden and dropdown not editable.
5. **Console:** Zero console errors across all of the above.
  </how-to-verify>
  <resume-signal>Type "approved" if all 5 check groups pass, or describe the failure (which step, expected vs actual, any console error).</resume-signal>
</task>

</tasks>

<verification>
- `node --check app/views/service-detail.js` passes (run before commit).
- `grep -c` gates from Tasks 1-2 all satisfied.
- No edit to firestore.rules (confirm `git diff --name-only` lists ONLY app/views/service-detail.js).
- Browser UAT (Task 3) approved across all 5 check groups.
</verification>

<success_criteria>
- Legacy-status services render an editable header dropdown that re-stages via saveServiceField; canonical-status services keep the read-only badge; updateServiceLifecycleBadge is select-aware.
- Mark-as-Loss button appears in the lifecycle footer for non-terminal services driveable by the current user, hidden otherwise.
- submitServiceLoss correctly branches PATH A (open proposal → atomic service+proposal loss via _applyProposalStateTransition + loss_reason parity write) vs PATH B (direct service-doc write + fire-and-forget recordEditHistory/NOTIF-11), with audit+activity entries on both paths.
- Both new window functions registered in attachWindowFunctions and deleted in destroy; #serviceLossModal removed on teardown.
- `node --check` passes; single-file diff; no rules change; browser UAT approved.
</success_criteria>

<output>
Create `.planning/quick/260615-pvd-port-mark-as-loss-and-legacy-status-drop/260615-pvd-SUMMARY.md` when done.
</output>
