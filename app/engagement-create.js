/* ========================================
   ENGAGEMENT CREATE — Shared Helper
   ========================================
   Phase 88-01 D-04: extracted from `app/views/projects.js` (addProject ~line 681)
   and `app/views/services.js` (addService ~line 721) so a single Firestore writer
   covers all three create call sites — Projects tab, Services tab, and (Plan 88-02)
   the Proposals tab. Avoids the "two surfaces drift" failure mode noted in
   `feedback_orphan_ownership_parallel_plans.md` once a third caller appears.

   Caller responsibilities (UI-side, intentionally NOT moved into this module):
     - Permission/role guards
     - DOM reads + form-level validation (required fields, positive numbers,
       status enum, tranche sum=100, service_type enum, services-require-client)
     - showLoading / showToast / form toggle
     - Personnel-to-assignment sync via the optional `onAfterCreate` callback
       (project view uses `syncPersonnelToAssignments`; service view uses
       `syncServicePersonnelToAssignments`). Keeping this in the callback lets
       engagement-create.js avoid view-module imports.
   ======================================== */

import { db, collection, addDoc, onSnapshot, query, where } from './firebase.js';
import {
    generateProjectCode,
    generateServiceCode,
    showLoading,
    showToast,
    syncPersonnelToAssignments,
    syncServicePersonnelToAssignments,
    escapeHTML
} from './utils.js';
import { recordEditHistory } from './edit-history.js';

export async function createEngagement({
    type,
    clientId,
    clientCode,
    name,
    location,
    projectStatus,
    budget,
    contractCost,
    personnel,
    collectionTranches,
    onAfterCreate
}) {
    const isProject = type === 'project';
    const collectionName = isProject ? 'projects' : 'services';

    // Phase 78 D-04: project_code is null for clientless projects (deferred until client assignment).
    // Services require a client — caller must validate clientCode is present.
    const code = isProject
        ? (clientCode ? await generateProjectCode(clientCode) : null)
        : await generateServiceCode(clientCode);

    const personnel_user_ids = personnel.map(u => u.id).filter(Boolean);
    const personnel_names = personnel.map(u => u.name);
    const tranchesProvided = Array.isArray(collectionTranches) && collectionTranches.length > 0;

    // Phase 85 D-09: always write `collection_tranches` (use [] when caller provided none).
    const finalShape = isProject
        ? {
            project_code: code || null,
            project_name: name,
            client_id: clientId || null,
            client_code: clientCode || null,
            project_status: projectStatus,
            budget,
            contract_cost: contractCost,
            personnel_user_ids,
            personnel_names,
            location: location || null,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString(),
            collection_tranches: collectionTranches || []
        }
        : {
            service_code: code,
            service_name: name,
            service_type: type,
            client_id: clientId,
            client_code: clientCode,
            project_status: projectStatus,
            budget,
            contract_cost: contractCost,
            personnel_user_ids,
            personnel_names,
            location: location || null,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString(),
            collection_tranches: collectionTranches || []
        };

    const docRef = await addDoc(collection(db, collectionName), finalShape);

    // Verbatim change-list shape from the original call sites — preserves edit-history parity.
    const changes = isProject
        ? [
            { field: 'project_name', old_value: null, new_value: name },
            { field: 'client', old_value: null, new_value: clientCode || null },
            ...(location ? [{ field: 'location', old_value: null, new_value: location }] : []),
            { field: 'project_status', old_value: null, new_value: projectStatus },
            ...(budget ? [{ field: 'budget', old_value: null, new_value: budget }] : []),
            ...(contractCost ? [{ field: 'contract_cost', old_value: null, new_value: contractCost }] : []),
            ...(personnel.length > 0 ? [{ field: 'personnel', old_value: null, new_value: personnel_names.join(', ') }] : []),
            ...(tranchesProvided ? [{ field: 'collection_tranches', old_value: null, new_value: JSON.stringify(collectionTranches) }] : [])
        ]
        : [
            { field: 'service_name', old_value: null, new_value: name },
            { field: 'service_type', old_value: null, new_value: type },
            { field: 'client', old_value: null, new_value: clientCode },
            ...(location ? [{ field: 'location', old_value: null, new_value: location }] : []),
            { field: 'project_status', old_value: null, new_value: projectStatus },
            ...(budget ? [{ field: 'budget', old_value: null, new_value: budget }] : []),
            ...(contractCost ? [{ field: 'contract_cost', old_value: null, new_value: contractCost }] : []),
            ...(personnel.length > 0 ? [{ field: 'personnel', old_value: null, new_value: personnel_names.join(', ') }] : []),
            ...(tranchesProvided ? [{ field: 'collection_tranches', old_value: null, new_value: JSON.stringify(collectionTranches) }] : [])
        ];

    // Fire-and-forget: history failure must not block the create UX.
    recordEditHistory(docRef.id, 'create', changes, collectionName)
        .catch(err => console.error('[engagement-create] recordEditHistory failed:', err));

    if (typeof onAfterCreate === 'function') {
        try {
            await onAfterCreate({ docRef, type, finalShape, code });
        } catch (err) {
            // Side-effect failures (e.g., assignment sync) must not roll back a successful create.
            console.error('[engagement-create] onAfterCreate failed:', err);
        }
    }

    return { docRef, finalShape, code };
}

/* ========================================
   ENGAGEMENT CREATE FORM — UI surface (Phase 87.1 Plan 03 D-07)
   ========================================
   The Create Engagement form HTML + all private helper functions moved here
   verbatim from app/views/proposals.js so the form can be mounted from the
   home Engagements sub-tab (Plan 04). The form is moved as a UNIT — the
   private helpers generate HTML that calls UNSUFFIXED window functions
   (window.proposalSelectPersonnel, window.proposalRemovePersonnel, etc.)
   and initEngagementForm() registers those exact names. CR-01 from the
   reverted 87.1 attempt is avoided by construction: there is no suffixed
   `renderProposalPillsFor` helper anywhere in this module — the names are
   internally consistent.

   Lifecycle:
     - renderEngagementForm() returns the <section id="new-engagement-section">
       HTML string; caller (home.js) injects it into #homeEngagementsContent.
     - initEngagementForm() is idempotent (calls destroyEngagementForm() first)
       and starts onSnapshot listeners on `clients` (active==true) and `users`
       (status=='active') to populate the client picker + personnel dropdown.
     - destroyEngagementForm() unsubscribes both listeners, deletes the 6
       window functions, and resets module state. Safe to call multiple times.
   ======================================== */

// ----------------------------------------
// Form module state (lives only in this section; isolated from createEngagement)
// ----------------------------------------
let clientsData = [];
let usersData = [];
let selectedPersonnel = []; // [{ id, name }]
let currentEngagementType = 'project'; // 'project' | 'one-time' | 'recurring'
let _formListeners = [];

// ----------------------------------------
// Personnel pill helpers (local copy — moved from proposals.js verbatim)
// ----------------------------------------

function renderProposalPills() {
    const container = document.getElementById('proposalPersonnelPillContainer');
    if (!container) return;

    const searchInput = document.getElementById('proposalPersonnelSearchInput');
    const searchValue = searchInput?.value || '';

    const pillsHtml = selectedPersonnel.map(user => `
        <span class="personnel-pill" data-user-id="${user.id || ''}">
            ${escapeHTML(user.name)}
            <button type="button" class="pill-remove"
                onmousedown="event.preventDefault(); window.proposalRemovePersonnel('${user.id || ''}', '${user.name.replace(/'/g, "\\'")}')">&times;</button>
        </span>
    `).join('');

    container.innerHTML = `
        ${pillsHtml}
        <input type="text"
               class="pill-search-input"
               id="proposalPersonnelSearchInput"
               placeholder="${selectedPersonnel.length === 0 ? 'Type name or email...' : ''}"
               value="${searchValue}"
               oninput="window.proposalFilterPersonnelDropdown(this.value)"
               onfocus="window.proposalShowPersonnelDropdown()"
               autocomplete="off"
               style="border: none; outline: none; padding: 0.125rem 0.25rem; flex: 1; min-width: 140px; font-size: 0.9375rem;">
    `;

    const newSearchInput = document.getElementById('proposalPersonnelSearchInput');
    if (searchValue) {
        newSearchInput?.focus();
    }
}

function proposalFilterPersonnelDropdown(searchText) {
    const dropdown = document.getElementById('proposalPersonnelDropdown');
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();
    const selectedIds = selectedPersonnel.map(u => u.id).filter(Boolean);

    const matches = term ? usersData.filter(user =>
        !selectedIds.includes(user.id) &&
        (user.full_name.toLowerCase().includes(term) ||
         user.email.toLowerCase().includes(term))
    ) : [];

    if (matches.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = matches.slice(0, 10).map(user => `
        <div class="pill-dropdown-item"
             onmousedown="event.preventDefault(); window.proposalSelectPersonnel('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${escapeHTML(user.full_name)}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${escapeHTML(user.email)}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function proposalShowPersonnelDropdown() {
    const searchInput = document.getElementById('proposalPersonnelSearchInput');
    if (searchInput?.value?.trim()) {
        proposalFilterPersonnelDropdown(searchInput.value);
    }
}

function proposalSelectPersonnel(userId, userName) {
    if (selectedPersonnel.some(u => u.id === userId)) return;
    selectedPersonnel.push({ id: userId, name: userName });
    renderProposalPills();

    const searchInput = document.getElementById('proposalPersonnelSearchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    const dropdown = document.getElementById('proposalPersonnelDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function proposalRemovePersonnel(userId, userName) {
    if (userId) {
        selectedPersonnel = selectedPersonnel.filter(u => u.id !== userId);
    } else {
        selectedPersonnel = selectedPersonnel.filter(u => u.name !== userName);
    }
    renderProposalPills();
}

// ----------------------------------------
// Engagement type change handler
// ----------------------------------------

function handleEngagementTypeChange(type) {
    currentEngagementType = type;

    const clientLabel = document.getElementById('proposalClientRequired');
    const clientSelect = document.getElementById('proposalClient');
    if (!clientLabel || !clientSelect) return;

    if (type === 'project') {
        // Client is optional for projects (Phase 78 D-04 clientless-creation pattern).
        clientLabel.textContent = '(optional — clientless project allowed)';
        clientLabel.style.color = '';

        // Restore the none/clientless option if not already there.
        if (!clientSelect.querySelector('option[value=""]')) {
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.dataset.code = '';
            noneOpt.textContent = '(none — clientless project)';
            clientSelect.insertBefore(noneOpt, clientSelect.firstChild);
        }
        clientSelect.value = '';
    } else {
        // One-time or recurring: client is required (D-08).
        clientLabel.textContent = '(required for service engagements)';
        clientLabel.style.color = '#ef4444';

        // Remove the none/clientless option so the user must pick a real client.
        const noneOpt = clientSelect.querySelector('option[value=""]');
        if (noneOpt) noneOpt.remove();

        // If previously on none, reset to first real client.
        if (!clientSelect.value && clientSelect.options.length > 0) {
            clientSelect.selectedIndex = 0;
        }
    }
}

// ----------------------------------------
// Client dropdown population
// ----------------------------------------

function populateClientDropdown() {
    const select = document.getElementById('proposalClient');
    if (!select) return;

    const currentVal = select.value;

    // Build options — keep the none option only for project type.
    let html = '';
    if (currentEngagementType === 'project') {
        html += '<option value="" data-code="">(none — clientless project)</option>';
    }

    clientsData.forEach(client => {
        const selected = client.id === currentVal ? 'selected' : '';
        html += `<option value="${client.id}" data-code="${escapeHTML(client.client_code || '')}" ${selected}>
            ${escapeHTML(client.client_code ? `${client.client_code} — ${client.client_name}` : client.client_name)}
        </option>`;
    });

    select.innerHTML = html;
}

// ----------------------------------------
// Submit handler
// ----------------------------------------

async function submitNewEngagement() {
    // 1. Read engagement type.
    const typeEl = document.querySelector('input[name="engagementType"]:checked');
    const type = typeEl ? typeEl.value : 'project'; // fallback

    // 2. Read DOM values.
    const clientSelect = document.getElementById('proposalClient');
    const clientId = clientSelect?.value || null;
    const selectedOption = clientSelect?.options[clientSelect.selectedIndex];
    const clientCode = selectedOption?.dataset?.code || null;

    const name = (document.getElementById('proposalName')?.value || '').trim();
    const location = (document.getElementById('proposalLocation')?.value || '').trim();
    const budgetRaw = document.getElementById('proposalBudget')?.value;
    const contractCostRaw = document.getElementById('proposalContractCost')?.value;

    const budget = budgetRaw !== '' && budgetRaw !== undefined ? parseFloat(budgetRaw) : null;
    const contractCost = contractCostRaw !== '' && contractCostRaw !== undefined ? parseFloat(contractCostRaw) : null;

    // 3. Validate.
    if (!name) {
        showToast('Engagement name is required.', 'error');
        return;
    }
    if (selectedPersonnel.length < 1) {
        showToast('At least one personnel member is required.', 'error');
        return;
    }
    if (budget !== null && (isNaN(budget) || budget <= 0)) {
        showToast('Budget must be a positive number if provided.', 'error');
        return;
    }
    if (contractCost !== null && (isNaN(contractCost) || contractCost <= 0)) {
        showToast('Contract cost must be a positive number if provided.', 'error');
        return;
    }
    // D-08: service types require a client.
    if (type !== 'project' && !clientId) {
        showToast('Client is required for service engagements.', 'error');
        return;
    }

    showLoading(true);
    try {
        const { code } = await createEngagement({
            type,
            clientId: clientId || null,
            clientCode: (clientCode && clientCode.trim()) ? clientCode.trim() : null,
            name,
            location: location || null,
            projectStatus: 'Draft', // Phase 88 D-05 — all Proposals-tab creates start as Draft.
            budget,
            contractCost,
            personnel: selectedPersonnel,
            collectionTranches: [], // Tranches not collected on Proposals form (Phase 85 D-09).
            onAfterCreate: ({ code: generatedCode, type: createdType }) => {
                // Assignment sync runs after a successful create.
                const userIds = selectedPersonnel.map(u => u.id).filter(Boolean);
                if (createdType === 'project' && generatedCode) {
                    syncPersonnelToAssignments(generatedCode, [], userIds)
                        .catch(err => console.error('[EngagementForm] Project assignment sync failed:', err));
                } else if ((createdType === 'one-time' || createdType === 'recurring') && generatedCode) {
                    syncServicePersonnelToAssignments(generatedCode, [], userIds)
                        .catch(err => console.error('[EngagementForm] Service assignment sync failed:', err));
                }
            }
        });

        // Success: clear form and show toast (stay on the page per D-03 inline pattern).
        selectedPersonnel = [];
        const nameEl = document.getElementById('proposalName');
        const locEl = document.getElementById('proposalLocation');
        const budgetEl = document.getElementById('proposalBudget');
        const contractEl = document.getElementById('proposalContractCost');
        if (nameEl) nameEl.value = '';
        if (locEl) locEl.value = '';
        if (budgetEl) budgetEl.value = '';
        if (contractEl) contractEl.value = '';
        // Reset type radios to project.
        const projectRadio = document.querySelector('input[name="engagementType"][value="project"]');
        if (projectRadio) {
            projectRadio.checked = true;
            handleEngagementTypeChange('project');
        }
        renderProposalPills();

        const codeDisplay = code || '(pending client assignment)';
        showToast(`Engagement created as Draft. Code: ${codeDisplay}`, 'success');
    } catch (err) {
        console.error('[EngagementForm] submitNewEngagement failed:', err);
        showToast(err?.message || 'Failed to create engagement. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ----------------------------------------
// Exported lifecycle: renderEngagementForm / initEngagementForm / destroyEngagementForm
// ----------------------------------------

/**
 * Returns the Create Engagement form HTML — the <section id="new-engagement-section">
 * block extracted verbatim from the old proposals.js render(). Caller (home.js
 * Engagements sub-tab) injects this into its content container.
 */
export function renderEngagementForm() {
    return `
        <!-- New Engagement Form — Phase 87.1 D-07 (moved from proposals.js Phase 88 D-03) -->
        <section id="new-engagement-section">
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin: 0 0 1.25rem 0; font-size: 1.1rem; color: #1e293b;">New Engagement</h3>

                    <!-- Engagement type -->
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Engagement Type
                        </label>
                        <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.9375rem;">
                                <input type="radio" name="engagementType" value="project" checked
                                       onchange="window.handleEngagementTypeChange('project')">
                                Project
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.9375rem;">
                                <input type="radio" name="engagementType" value="one-time"
                                       onchange="window.handleEngagementTypeChange('one-time')">
                                One-time Service
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.9375rem;">
                                <input type="radio" name="engagementType" value="recurring"
                                       onchange="window.handleEngagementTypeChange('recurring')">
                                Recurring Service
                            </label>
                        </div>
                    </div>

                    <!-- Client picker -->
                    <div style="margin-bottom: 1rem;">
                        <label id="proposalClientLabel" style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Client <span id="proposalClientRequired" style="color: #64748b; font-weight: 400;">(optional — clientless project allowed)</span>
                        </label>
                        <select id="proposalClient" style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9375rem; color: #1e293b; background: white;">
                            <option value="" data-code="">(none — clientless project)</option>
                        </select>
                    </div>

                    <!-- Name -->
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Name <span style="color: #ef4444;">*</span>
                        </label>
                        <input type="text" id="proposalName" placeholder="Project or service name"
                               style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9375rem; color: #1e293b; box-sizing: border-box;">
                    </div>

                    <!-- Location -->
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Location <span style="color: #64748b; font-weight: 400;">(optional)</span>
                        </label>
                        <input type="text" id="proposalLocation" placeholder="Site or delivery location"
                               style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9375rem; color: #1e293b; box-sizing: border-box;">
                    </div>

                    <!-- Budget + Contract Cost (two columns on wider screens) -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                        <div>
                            <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                                Budget (PHP)
                            </label>
                            <input type="number" id="proposalBudget" min="0" step="0.01" placeholder="0.00"
                                   style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9375rem; color: #1e293b; box-sizing: border-box;">
                        </div>
                        <div>
                            <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                                Contract Cost (PHP)
                            </label>
                            <input type="number" id="proposalContractCost" min="0" step="0.01" placeholder="0.00"
                                   style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9375rem; color: #1e293b; box-sizing: border-box;">
                        </div>
                    </div>

                    <!-- Personnel multi-select
                         Phase 87.1 D-07: moved here from proposals.js as a unit. The form HTML
                         calls UNSUFFIXED window functions (proposalFilterPersonnelDropdown,
                         proposalShowPersonnelDropdown, proposalSelectPersonnel,
                         proposalRemovePersonnel) and initEngagementForm() registers exactly
                         those names. No suffixed helper variant exists in this module. -->
                    <div style="margin-bottom: 1.25rem;">
                        <label style="display: block; font-weight: 600; color: #475569; font-size: 0.875rem; margin-bottom: 0.5rem;">
                            Personnel <span style="color: #ef4444;">*</span>
                        </label>
                        <div style="position: relative;">
                            <div id="proposalPersonnelPillContainer"
                                 class="personnel-pill-container"
                                 style="min-height: 2.5rem; border: 1px solid #e5e7eb; border-radius: 6px; padding: 0.375rem 0.5rem; display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; background: white; cursor: text;"
                                 onclick="document.getElementById('proposalPersonnelSearchInput')?.focus()">
                                <input type="text"
                                       class="pill-search-input"
                                       id="proposalPersonnelSearchInput"
                                       placeholder="Type name or email..."
                                       oninput="window.proposalFilterPersonnelDropdown(this.value)"
                                       onfocus="window.proposalShowPersonnelDropdown()"
                                       autocomplete="off"
                                       style="border: none; outline: none; padding: 0.125rem 0.25rem; flex: 1; min-width: 140px; font-size: 0.9375rem;">
                            </div>
                            <div id="proposalPersonnelDropdown"
                                 style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100; max-height: 220px; overflow-y: auto;">
                            </div>
                        </div>
                    </div>

                    <!-- Submit -->
                    <div>
                        <button type="button" id="proposalSubmit"
                                onclick="window.submitNewEngagement()"
                                class="btn btn-primary">
                            Create Engagement (Draft)
                        </button>
                        <div style="margin-top: 0.5rem;">
                            <small style="color: #64748b;">New engagements start as <strong>Draft</strong> and advance through the proposal lifecycle.</small>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * Initialize the engagement form: register window functions for the form's
 * onclick/oninput/onfocus handlers, and start onSnapshot listeners that
 * populate the client picker and the personnel dropdown.
 *
 * Idempotent: calls destroyEngagementForm() first as a reset guard so
 * re-init does not leak listeners or stale state.
 *
 * CR-01 prevention: the 6 window function names below are UNSUFFIXED.
 * They match exactly what the form HTML (renderEngagementForm above) and
 * the personnel-pill helpers in this file emit (e.g. line in
 * renderProposalPills calls `window.proposalRemovePersonnel(...)`; line in
 * proposalFilterPersonnelDropdown calls `window.proposalSelectPersonnel(...)`).
 * Since the form HTML and its helpers all live in this same module, the
 * names are consistent by construction — there is no suffixed helper variant
 * that could create a mismatch.
 */
export async function initEngagementForm() {
    // Reset guard — safe to re-call.
    destroyEngagementForm();

    // Register the 6 window functions under their UNSUFFIXED names.
    // These names must match exactly what the rendered form HTML calls.
    window.submitNewEngagement = submitNewEngagement;
    window.handleEngagementTypeChange = handleEngagementTypeChange;
    window.proposalSelectPersonnel = proposalSelectPersonnel;
    window.proposalRemovePersonnel = proposalRemovePersonnel;
    window.proposalShowPersonnelDropdown = proposalShowPersonnelDropdown;
    window.proposalFilterPersonnelDropdown = proposalFilterPersonnelDropdown;

    // Clients listener: populates the client picker.
    const clientsListener = onSnapshot(
        collection(db, 'clients'),
        (snapshot) => {
            clientsData = [];
            snapshot.forEach(d => {
                clientsData.push({ id: d.id, ...d.data() });
            });
            // Sort clients alphabetically by code then name.
            clientsData.sort((a, b) =>
                (a.client_code || a.client_name || '').localeCompare(b.client_code || b.client_name || '')
            );
            populateClientDropdown();
        },
        (err) => console.error('[EngagementForm] Clients listener error:', err)
    );
    _formListeners.push(clientsListener);

    // Users listener: populates the personnel picker.
    // Users collection uses status=='active' (not an active boolean) — matches projects.js pattern.
    const usersListener = onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'active')),
        (snapshot) => {
            usersData = [];
            snapshot.forEach(d => {
                usersData.push({ id: d.id, ...d.data() });
            });
            usersData.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        },
        (err) => console.error('[EngagementForm] Users listener error:', err)
    );
    _formListeners.push(usersListener);
}

/**
 * Tear down the engagement form: unsubscribe Firestore listeners, delete the
 * 6 window functions, and reset module state. Idempotent.
 */
export function destroyEngagementForm() {
    _formListeners.forEach(unsub => unsub?.());
    _formListeners = [];

    delete window.submitNewEngagement;
    delete window.handleEngagementTypeChange;
    delete window.proposalSelectPersonnel;
    delete window.proposalRemovePersonnel;
    delete window.proposalShowPersonnelDropdown;
    delete window.proposalFilterPersonnelDropdown;

    clientsData = [];
    usersData = [];
    selectedPersonnel = [];
    currentEngagementType = 'project';
}
