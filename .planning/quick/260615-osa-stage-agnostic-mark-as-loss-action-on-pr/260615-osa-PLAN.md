---
phase: quick-260615-osa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/views/project-detail.js
autonomous: false
requirements: [OSA-LOSS-01]

must_haves:
  truths:
    - "A 'Mark as Loss' danger button appears on the Project Lifecycle card for every non-terminal status (For Inspection, For Proposal, Proposal for Internal Approval, Proposal Under Client Review, For Revision, Client Approved, For Mobilization, On-going)"
    - "The button is hidden when project_status is 'Loss' or 'Completed'"
    - "The button is hidden for users who fail the canDrive permission gate"
    - "Clicking the button opens a reason modal; a reason under 10 characters is rejected with an inline error"
    - "Confirming on a project that has an OPEN linked proposal marks BOTH the proposal doc (status: 'loss') AND the project doc (project_status: 'Loss') with no divergence"
    - "Confirming on a project with NO open proposal writes project_status: 'Loss' + loss_reason directly to the project doc"
    - "After confirmation the detail page re-renders via the existing onSnapshot listener and the lifecycle card shows the terminal 'Project Lost' branch"
  artifacts:
    - path: "app/views/project-detail.js"
      provides: "Mark-as-Loss button on lifecycle card + project loss modal + dual-path loss writer window functions"
      contains: "openProjectLossModal"
  key_links:
    - from: "window.submitProjectLoss"
      to: "_applyProposalStateTransition"
      via: "open-proposal path reuses the canonical proposal+project batch transition"
      pattern: "_applyProposalStateTransition"
    - from: "window.submitProjectLoss"
      to: "doc(db, 'projects', ...) updateDoc"
      via: "no-open-proposal path writes project_status + loss_reason directly"
      pattern: "project_status.*Loss"
---

<objective>
Add a stage-agnostic "Mark as Loss" action to the project DETAIL lifecycle card so a project can be marked Loss from ANY non-terminal stage, not just the proposal flow.

USER DECISION (locked, OSA-LOSS-01): the action is available for ALL active stages — every status except terminal 'Loss' and 'Completed'.

Purpose: Today the only Loss writer is `submitLoss()` in proposal-modal.js, which calls `_applyProposalStateTransition()` and REQUIRES a proposal doc. Post-contract stages (Client Approved, For Mobilization, On-going) and proposal-less / legacy projects therefore have NO path to Loss. This plan closes that gap with a single persistent danger button plus a dual-path writer.

Output: Edits confined to `app/views/project-detail.js` — a gated "Mark as Loss" button in the lifecycle card chrome, a `#projectLossModal` reason modal mirroring the proposal loss modal, and two new window functions (`openProjectLossModal`, `submitProjectLoss`) implementing the dual-path loss write, registered and cleaned up per the view lifecycle.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<!-- PRIMARY edit target -->
@app/views/project-detail.js

<!-- Reference ONLY — mirror the loss modal markup + submitLoss call shape; do NOT heavily edit -->
@app/proposal-modal.js
<!-- Reference ONLY — _applyProposalStateTransition is the canonical transition helper, ALREADY imported into project-detail.js (line 12) -->
@app/views/proposals.js

<interfaces>
<!-- All identifiers below were confirmed by reading the code. Line numbers drift — VERIFY by symbol, not line. -->

ALREADY IMPORTED at project-detail.js top (line 12) — REUSE, do not re-import:
  import { _applyProposalStateTransition } from './proposals.js';

Canonical proposal+project transition (proposals.js, export at ~L245):
  export async function _applyProposalStateTransition({ proposal, newStatus, newProjectStatus, auditAction, auditComment, extraProposalFields })
  // Batch-updates the proposal doc, and when newProjectStatus + proposal.project_id are set,
  // ALSO updates doc(db, proposal.parent_collection || 'projects', proposal.project_id) with
  // { project_status, status_changed_at, updated_at }. One atomic batch.commit().

Proposal-loss call shape to copy (proposal-modal.js submitLoss, ~L1240):
  await _applyProposalStateTransition({
    proposal,
    newStatus: 'loss',
    newProjectStatus: 'Loss',
    auditAction: 'LOSS_RECORDED',
    auditComment: reason,
    extraProposalFields: { loss_reason: reason }
  });

Proposal status model (proposals.js): terminal proposal statuses are 'client_approved' and 'loss'.
  An "open" proposal = status NOT in { 'client_approved', 'loss' }.

Proposal lookup (already done in loadProposalCard, project-detail.js ~L2431):
  const q = query(collection(db, 'proposals'), where('project_id', '==', parentDocId));
  const snap = await getDocs(q);  // most projects ≤1 proposal; use snap.docs[0]
  const proposal = { id: snap.docs[0].id, ...snap.docs[0].data() };

canDrive permission gate (project-detail.js loadProposalCard, ~L2422-2429) — REUSE this exact shape:
  const adminRoles = ['super_admin', 'operations_admin', 'services_admin'];
  const assignedRoles = ['operations_user', 'services_user'];
  const parentPersonnel = currentProject?.personnel_user_ids || [];
  const canDrive = adminRoles.includes(role)
    || (assignedRoles.includes(role) && uid && parentPersonnel.includes(uid));

Lifecycle card chrome (project-detail.js renderLifecycleCard, ~L2746):
  Returns the .lc-accordion wrapper containing .lc-card-header, .lc-track-wrap, and
  <div class="lc-body" id="lcBody">. The button belongs in the card chrome (e.g. a footer
  rendered after #lcBody), NOT inside any per-status branch of buildLifecycleBody (~L2572).
  buildLifecycleBodyInPlace (~L2685) re-renders #lcBody on accordion toggle — the Loss button
  must live OUTSIDE #lcBody so it is not wiped, OR be re-rendered alongside it. Choose the chrome
  footer placement so a single button covers all statuses.

Direct project-loss reference — saveField project_status path (project-detail.js ~L1685-1713):
  - updateDoc(doc(db,'projects',currentProject.id), { project_status, status_changed_at, updated_at })
  - recordEditHistory(currentProject.id, 'update', [{ field, old_value, new_value }])
  - NOTIF-11: NOTIF11_STATUS_WHITELIST includes 'Loss'; createNotificationForUsers({...}) to
    currentProject.personnel_user_ids with NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED.
  saveField does NOT capture loss_reason — the direct path must write it explicitly.

Helpers available in project-detail.js: recordEditHistory, createNotificationForUsers,
  NOTIFICATION_TYPES, addProjectAuditEntry(projectId, action, actorId, actorName, comment) (~L2829),
  _addActivityEntry(projectId, { type, text, is_system }) (~L3070), escapeHTML, showToast, showLoading.

Loss modal markup to mirror (proposal-modal.js ~L1201-1220): #proposalLossModal with textarea
  #proposalLossReason (rows=3), #proposalLossReasonError, btn-danger Confirm. 10-char min validation
  at submit (proposal-modal.js ~L1230: if (reason.length < 10) show inline error, return).

Window-function registration block: project-detail.js ~L3706-3873 (where window.lcAttachLink,
  window.lcAdvanceToForProposal, window.lcStartProject, etc. are assigned). Register new functions here.
Window-function cleanup block: destroy() ~L473-496 (delete window.lc...). Add deletes for new fns.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Render the gated "Mark as Loss" button + project loss modal in the lifecycle card chrome</name>
  <files>app/views/project-detail.js</files>
  <action>
Add a single persistent "Mark as Loss" danger button to the lifecycle card CHROME (rendered in renderLifecycleCard, ~L2746) — NOT inside any per-status branch of buildLifecycleBody. Place it as a footer element AFTER the `<div class="lc-body" id="lcBody">` so it is not wiped when buildLifecycleBodyInPlace re-renders #lcBody on accordion toggle.

Visibility logic (compute inside renderLifecycleCard, which already receives `project` and `currentUser`):
- Compute `status = project.project_status || 'For Inspection'`.
- Show the button ONLY when status is NOT 'Loss' AND NOT 'Completed' (honors locked decision OSA-LOSS-01: available for every non-terminal status).
- AND compute the SAME canDrive gate used in loadProposalCard (reuse the adminRoles/assignedRoles/personnel_user_ids shape from the interfaces block; read role/uid from currentUser). Hide the button when canDrive is false. Justification for reusing canDrive over showEditControls: the lifecycle Loss action is a status-driving operation, so it must match the proposal card's drive gate, not the looser field-edit gate — keeps both Loss entry points permission-consistent.
- Style the button with class `btn btn-danger` and label "Mark as Loss". onclick="window.openProjectLossModal('${escapeHTML(project.id)}')".

Add a `window.openProjectLossModal(projectId)` function in the window-function registration block (~L3706-3873, beside the other lc* functions). It must:
- Guard: if (!currentProject || currentProject.id !== projectId) return.
- Re-check the status-not-terminal AND canDrive gate; if it fails, showToast('Permission denied.', 'error') and return (defense in depth — the button is gated but the window fn must not trust the DOM).
- Remove any existing '#projectLossModal' before inserting.
- Insert a modal mirroring proposal-modal.js's #proposalLossModal (~L1201-1220) but project-scoped: id="projectLossModal", textarea id="projectLossReason" (rows=3), error div id="projectLossReasonError", Cancel button that removes the modal, and a btn-danger Confirm button calling window.submitProjectLoss('${escapeHTML(projectId)}'). Keep the same danger styling and copy ("This will mark the project as Loss… cannot be undone").

Register window.openProjectLossModal (and window.submitProjectLoss, implemented in Task 2) in the registration block. Add `delete window.openProjectLossModal;` and `delete window.submitProjectLoss;` to destroy() alongside the other lc* deletes (~L473-496). Also remove any lingering '#projectLossModal' node in destroy() (mirror the listener-teardown discipline) so a navigation mid-modal leaves no orphan.

Do NOT edit proposal-modal.js or proposals.js. Do NOT alter buildLifecycleBody per-status branches except, optionally, leaving the existing 'Loss' terminal branch untouched.
  </action>
  <verify>
    <automated>node --check app/views/project-detail.js && grep -q "window.openProjectLossModal" app/views/project-detail.js && grep -q "projectLossModal" app/views/project-detail.js && grep -c "delete window.openProjectLossModal" app/views/project-detail.js | grep -qv '^0$'</automated>
  </verify>
  <done>project-detail.js parses (node --check passes). A single gated "Mark as Loss" button is rendered in the lifecycle card chrome for non-terminal statuses, openProjectLossModal builds a #projectLossModal with a reason textarea, and both new window functions are registered and deleted in destroy().</done>
</task>

<task type="auto">
  <name>Task 2: Implement the dual-path submitProjectLoss writer (open-proposal transition vs. direct project write)</name>
  <files>app/views/project-detail.js</files>
  <action>
Implement `window.submitProjectLoss(projectId)` in the window-function registration block. This is the core correctness requirement — the dual path must be EXPLICIT.

Flow:
1. Guard: if (!currentProject || currentProject.id !== projectId) return. Re-check the status-not-terminal AND canDrive gate (same as Task 1); on failure showToast permission denied and return.
2. Read and validate the reason: `const reason = (document.getElementById('projectLossReason')?.value || '').trim();`. If `reason.length < 10`, set #projectLossReasonError textContent to "Loss Reason is required (minimum 10 characters)." with display:block and return (mirror proposal-modal.js ~L1230).
3. showLoading(true). Wrap the rest in try/catch/finally(showLoading(false)).
4. DETECT open proposal: query `query(collection(db, 'proposals'), where('project_id', '==', projectId))`, getDocs. Treat a proposal as OPEN if it exists AND its status is NOT in { 'client_approved', 'loss' }. Use snap.docs[0] (most projects ≤1 proposal). Build `const proposal = { id: snap.docs[0].id, ...snap.docs[0].data() }` only when needed.

5a. PATH A — OPEN proposal exists: call the canonical helper (already imported) with the proposal-loss shape:
    await _applyProposalStateTransition({ proposal, newStatus: 'loss', newProjectStatus: 'Loss', auditAction: 'LOSS_RECORDED', auditComment: reason, extraProposalFields: { loss_reason: reason } });
    This atomically marks BOTH the proposal (status 'loss') AND the project (project_status 'Loss') — no divergence. After it resolves, also write loss_reason onto the PROJECT doc if _applyProposalStateTransition does not (it sets project_status only, per the helper body) — do a single follow-up updateDoc(doc(db,'projects',projectId), { loss_reason: reason }) so the project doc also carries the reason for direct-stage parity. (Confirm by reading the helper: it writes project_status/status_changed_at/updated_at to the project but NOT loss_reason — so this follow-up is required.)

5b. PATH B — NO open proposal (snap empty, or sole proposal already terminal): write the project doc directly in ONE atomic updateDoc:
    await updateDoc(doc(db,'projects',projectId), { project_status: 'Loss', loss_reason: reason, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    Then mirror saveField's project_status side-effects:
      - recordEditHistory(projectId, 'update', [{ field: 'project_status', old_value: currentProject.project_status ?? null, new_value: 'Loss' }]) (fire-and-forget .catch).
      - NOTIF-11: createNotificationForUsers to (currentProject.personnel_user_ids||[]).filter(Boolean) with type NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED, message `Project "${currentProject.project_name}" status changed to: Loss`, link `#/projects/detail/${currentProject.project_code}` (fallback '#/projects'), source_collection 'projects', source_id project_code||id, object_name project_name, actor_name getCurrentUser?.()?.full_name||'System' (fire-and-forget .catch). Skip if recipients empty.

6. BOTH paths, after the write: addProjectAuditEntry(projectId, 'LOSS_RECORDED', cu?.uid, cu?.full_name, reason) and _addActivityEntry(projectId, { type: 'system', is_system: true, text: `Project marked as Loss by ${cu?.full_name || 'Unknown'}` }) so the journal/activity log reflects the loss regardless of path.
7. Remove '#projectLossModal' from the DOM. showToast('Project marked as Loss.', 'success'). The existing project onSnapshot listener re-renders the detail page (status → Loss, lifecycle shows terminal 'Project Lost' branch). For PATH A, also call loadProposalCard(projectId, currentProject.parent_collection || 'projects') to refresh the proposal card so it reflects the lost proposal.
8. catch: console.error('[ProjectDetail] submitProjectLoss failed:', err); showToast(err?.message || 'Failed to record loss. Please try again.', 'error').

Do NOT touch proposal-modal.js's existing submitLoss / proposal-card loss flow. Do NOT touch service-detail.js (note in SUMMARY as a follow-up: the same stage-agnostic Loss action should later be ported to service-detail.js).
  </action>
  <verify>
    <automated>node --check app/views/project-detail.js && grep -q "window.submitProjectLoss" app/views/project-detail.js && grep -q "_applyProposalStateTransition" app/views/project-detail.js && grep -q "client_approved" app/views/project-detail.js</automated>
  </verify>
  <done>submitProjectLoss exists and parses. It validates a 10-char minimum reason, detects an open proposal via the proposals query + status-not-terminal check, routes PATH A through _applyProposalStateTransition (with a loss_reason follow-up write) and PATH B through a direct project updateDoc + recordEditHistory + NOTIF-11, and both paths log audit/activity entries and close the modal.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>A gated "Mark as Loss" danger button on the project detail lifecycle card (all non-terminal stages), a #projectLossModal reason modal with 10-char validation, and a dual-path loss writer: open proposal → _applyProposalStateTransition (project + proposal both → Loss); no open proposal → direct project write with loss_reason.</what-built>
  <how-to-verify>
Run locally and point at dev Firebase (clmc-procurement-dev):
1. `python -m http.server 8000` → open http://localhost:8000 → log in as super_admin (or operations_admin).

TEST 1 — direct path (no proposal):
2. Open a project in 'On-going' (or one of the seeded legacy projects CLMC-LEGACY-001..005 with no proposal). Confirm a red "Mark as Loss" button shows on the Project Lifecycle card.
3. Click it → modal opens. Type a reason ≥10 chars → Confirm. Expect a success toast; the page re-renders; status badge shows "Loss"; lifecycle card shows the terminal "Project Lost" branch.
4. Navigate to the projects list — the project has left its previous bucket and now appears in the Loss group.

TEST 2 — proposal path (no divergence):
5. Open a project that HAS an OPEN linked proposal (e.g. status 'Proposal Under Client Review' or 'Client Approved' with a non-terminal proposal). Click "Mark as Loss" → enter a reason → Confirm.
6. Verify the PROJECT doc shows project_status 'Loss'. Then check the linked proposal (proposal card / Firestore console) shows status 'loss' and loss_reason set. BOTH must be Loss — no divergence.

TEST 3 — validation:
7. Open the modal on any project → type fewer than 10 characters → Confirm. Expect inline error "Loss Reason is required (minimum 10 characters)." and NO write.

TEST 4 — gating:
8. Open a 'Completed' project and a 'Loss' project → confirm the "Mark as Loss" button is ABSENT on both.
9. Log in as a user who is NOT admin and NOT assigned to the project (e.g. an operations_user not in personnel_user_ids) → open a non-terminal project → confirm the button is HIDDEN.
10. Confirm zero console errors across all tests.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues (which test failed and the observed vs. expected behavior).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser client → Firestore | The loss write and proposal transition originate client-side; Firestore security rules are the real authority. The canDrive gate is UX-only. |
| DOM → window function | onclick passes projectId; window functions must re-validate against currentProject, not trust the DOM. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-osa-01 | Elevation of Privilege | openProjectLossModal / submitProjectLoss | mitigate | Re-check canDrive + non-terminal status inside both window functions (not just at render); on failure showToast and return. Server-side firestore.rules already govern writes to projects/proposals — no rule change in this plan. |
| T-osa-02 | Tampering | dual-path divergence (project vs proposal) | mitigate | PATH A uses the canonical _applyProposalStateTransition batch (project + proposal atomic) + a loss_reason follow-up; PATH B is a single atomic updateDoc. No partial-state path that leaves project Loss but proposal open or vice versa for the open-proposal case. |
| T-osa-03 | Repudiation | who marked the loss | mitigate | Both paths call addProjectAuditEntry('LOSS_RECORDED', actor) and _addActivityEntry; PATH A also writes audit_log via the helper; PATH B records edit history. |
| T-osa-SC | Tampering | npm/pip/cargo installs | accept | No new dependencies — pure ES6 edits to one existing file. No package installs. |
</threat_model>

<verification>
- `node --check app/views/project-detail.js` passes (no syntax errors).
- No edits outside app/views/project-detail.js (git diff shows only that file changed).
- Manual browser UAT checkpoint passes all four test groups.
</verification>

<success_criteria>
- "Mark as Loss" button renders on the lifecycle card for every non-terminal project_status and is hidden for 'Loss'/'Completed' and for non-canDrive users.
- Reason modal enforces a 10-character minimum.
- Open-proposal projects mark BOTH project and proposal as Loss with no divergence; proposal-less projects mark the project as Loss with loss_reason captured.
- Post-action the detail page re-renders to the terminal Loss branch with zero console errors.
- All changes confined to app/views/project-detail.js.
</success_criteria>

<output>
Create `.planning/quick/260615-osa-stage-agnostic-mark-as-loss-action-on-pr/260615-osa-SUMMARY.md` when done. Note in the SUMMARY that porting the same stage-agnostic Loss action to service-detail.js is a deliberate follow-up (out of scope here).
</output>
