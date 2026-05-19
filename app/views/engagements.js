/* ========================================
   ENGAGEMENTS VIEW — Phase 87.1 D-03
   Extracted from proposals.js. Personnel pill helpers imported from proposals.js
   (pure wrapper functions, state passed as args per Phase 87.1 review).

   Purpose: Provides a dedicated #/engagements route for creating new project
   or service engagements. Visible to super_admin, operations_admin, services_admin.
   Router wiring in Plan 07.
   ======================================== */

import { db, collection, onSnapshot, query, where } from '../firebase.js';
import { showLoading, showToast, syncPersonnelToAssignments, syncServicePersonnelToAssignments, escapeHTML } from '../utils.js';
import { createEngagement } from '../engagement-create.js';
import {
    renderProposalPillsFor,
    proposalFilterPersonnelDropdownFor,
    proposalSelectPersonnelIn,
    proposalRemovePersonnelFrom,
    proposalShowPersonnelDropdownFor
} from './proposals.js';

// ----------------------------------------
// Module state (local to this view, independent from proposals.js copies)
// ----------------------------------------
let clientsData = [];
let usersData = [];
let selectedPersonnel = []; // [{ id, name }]
let listeners = [];
let currentEngagementType = 'project'; // 'project' | 'one-time' | 'recurring'

// ----------------------------------------
// render()
// ----------------------------------------

export function render(activeTab = null, param = null) {
    return `
        <div class="container" style="margin-top: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <div>
                    <h2 style="margin: 0; font-size: 1.5rem; color: #1e293b;">New Engagement</h2>
                    <p style="margin: 0.25rem 0 0 0; color: #64748b; font-size: 0.9375rem;">Create a new project or service engagement.</p>
                </div>
            </div>

            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">

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
                         Uses proposalPersonnel* element IDs to match the wrapper functions from proposals.js.
                         Window closures in init() delegate to the imported wrapper functions. -->
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
                                       oninput="window.proposalFilterPersonnelDropdownFor && window.proposalFilterPersonnelDropdownFor(this.value)"
                                       onfocus="window.proposalShowPersonnelDropdownFor && window.proposalShowPersonnelDropdownFor()"
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
                            Create Engagement
                        </button>
                        <div style="margin-top: 0.5rem;">
                            <small style="color: #64748b;">New engagements start as <strong>Draft</strong> and advance through the proposal lifecycle.</small>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
}

// ----------------------------------------
// Client dropdown population
// ----------------------------------------

function populateClientDropdown() {
    const select = document.getElementById('proposalClient');
    if (!select) return;

    const currentVal = select.value;

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
// Engagement type change handler (view-specific logic — not imported)
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
// Submit handler (view-specific logic — not imported)
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
                        .catch(err => console.error('[Engagements] Project assignment sync failed:', err));
                } else if ((createdType === 'one-time' || createdType === 'recurring') && generatedCode) {
                    syncServicePersonnelToAssignments(generatedCode, [], userIds)
                        .catch(err => console.error('[Engagements] Service assignment sync failed:', err));
                }
            }
        });

        // Success: clear form and show toast (stay on the page).
        selectedPersonnel = [];
        document.getElementById('proposalName').value = '';
        document.getElementById('proposalLocation').value = '';
        document.getElementById('proposalBudget').value = '';
        document.getElementById('proposalContractCost').value = '';
        // Reset type radios to project.
        const projectRadio = document.querySelector('input[name="engagementType"][value="project"]');
        if (projectRadio) {
            projectRadio.checked = true;
            handleEngagementTypeChange('project');
        }
        renderProposalPillsFor(selectedPersonnel);

        const codeDisplay = code || '(pending client assignment)';
        showToast(`Engagement created as Draft. Code: ${codeDisplay}`, 'success');
    } catch (err) {
        console.error('[Engagements] submitNewEngagement failed:', err);
        showToast(err?.message || 'Failed to create engagement. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ----------------------------------------
// init()
// ----------------------------------------

export async function init(activeTab = null, param = null) {
    // Attach window functions for onclick handlers.
    window.submitNewEngagement = submitNewEngagement;
    window.handleEngagementTypeChange = handleEngagementTypeChange;

    // Personnel pill window closures — delegate to imported wrapper functions,
    // binding local module state as arguments (Phase 87.1 review recommendation).
    // Names must match what renderProposalPillsFor() injects into onclick/oninput attributes.
    window.proposalSelectPersonnelIn = (userId, userName) => {
        selectedPersonnel = proposalSelectPersonnelIn(
            userId, userName, selectedPersonnel,
            () => renderProposalPillsFor(selectedPersonnel)
        );
    };
    window.proposalRemovePersonnelFrom = (userId) => {
        selectedPersonnel = proposalRemovePersonnelFrom(
            userId, selectedPersonnel,
            () => renderProposalPillsFor(selectedPersonnel)
        );
    };
    window.proposalShowPersonnelDropdownFor = () =>
        proposalShowPersonnelDropdownFor(selectedPersonnel, usersData);
    window.proposalFilterPersonnelDropdownFor = (text) =>
        proposalFilterPersonnelDropdownFor(text, selectedPersonnel, usersData);

    // Initialize pill container if it exists in the DOM at this point.
    renderProposalPillsFor(selectedPersonnel);

    // Clients listener: populates the client picker.
    const clientsListener = onSnapshot(
        query(collection(db, 'clients'), where('active', '==', true)),
        (snapshot) => {
            clientsData = [];
            snapshot.forEach(doc => {
                clientsData.push({ id: doc.id, ...doc.data() });
            });
            // Sort clients alphabetically by code then name.
            clientsData.sort((a, b) =>
                (a.client_code || a.client_name || '').localeCompare(b.client_code || b.client_name || '')
            );
            populateClientDropdown();
        },
        (err) => console.error('[Engagements] Clients listener error:', err)
    );
    listeners.push(clientsListener);

    // Users listener: populates the personnel picker.
    const usersListener = onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'active')),
        (snapshot) => {
            usersData = [];
            snapshot.forEach(doc => {
                usersData.push({ id: doc.id, ...doc.data() });
            });
            usersData.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        },
        (err) => console.error('[Engagements] Users listener error:', err)
    );
    listeners.push(usersListener);
}

// ----------------------------------------
// destroy()
// ----------------------------------------

export async function destroy() {
    listeners.forEach(unsub => unsub?.());
    listeners = [];

    // Remove all window functions attached in init().
    delete window.submitNewEngagement;
    delete window.handleEngagementTypeChange;
    delete window.proposalSelectPersonnelIn;
    delete window.proposalRemovePersonnelFrom;
    delete window.proposalShowPersonnelDropdownFor;
    delete window.proposalFilterPersonnelDropdownFor;

    // Reset module state.
    clientsData = [];
    usersData = [];
    selectedPersonnel = [];
    currentEngagementType = 'project';
}
