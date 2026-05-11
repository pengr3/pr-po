/* ========================================
   PROPOSALS VIEW
   Phase 88-02 — Proposals tab shell + Create Engagement form

   Context decisions:
   D-01: Tab labeled "Proposals" (renamed from Management).
   D-02: Visible only to Super Admin; hard-gated at router level.
   D-03: Inline "New Engagement" section at top; Phase 89 queue below; Phase 87 dashboard below that.
   D-04: All writes delegated to createEngagement() — no addDoc here.
   D-05: New engagements default to project_status='Draft'.
   D-07: Personnel picker is a local copy of projects.js pattern (refactor candidate; noted below).
   D-08: Client is optional for project type; required for one-time/recurring service types.

   Phase 88-02 refactor candidate: The personnel multi-select pill+dropdown is duplicated
   across projects.js, services.js, and this file. Future cleanup: extract to app/picker-personnel.js.
   ======================================== */

import { db, collection, onSnapshot, query, where, doc, getDoc, addDoc, updateDoc, serverTimestamp, writeBatch } from '../firebase.js';
import { showLoading, showToast, syncPersonnelToAssignments, syncServicePersonnelToAssignments, escapeHTML, formatCurrency, formatTimestamp, generateProposalId } from '../utils.js';
import { createEngagement } from '../engagement-create.js';
import { createNotification, createNotificationForRoles, NOTIFICATION_TYPES } from '../notifications.js';

// ----------------------------------------
// Module state
// ----------------------------------------
let clientsData = [];
let usersData = [];
let selectedPersonnel = []; // [{ id, name }]
let listeners = [];
let currentEngagementType = 'project'; // 'project' | 'one-time' | 'recurring'

// --- Phase 87 module state (Plan 02) ---
let proposalsData = [];      // all proposal docs from onSnapshot — sorted/grouped at render time
let projectsData = [];       // active projects for Create/Edit Proposal dropdown (Open Question 3)
let currentProposal = null;  // currently-open proposal in the detail modal (null when modal closed)
let createModalMode = 'create'; // 'create' | 'edit' — set when modal opens; read by saveProposal()
let createModalEditingId = null; // Firestore doc ID when in edit mode; null when create

// ----------------------------------------
// render()
// ----------------------------------------

export function render(activeTab = null, param = null) {
    return `
        <div class="container" style="margin-top: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="margin: 0; font-size: 1.5rem; color: #1e293b;">Proposals</h2>
            </div>

            <!-- New Engagement Form — Phase 88 D-03 (always at top of tab) -->
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
                             Phase 88-02: Local copy of projects.js picker pattern (refactor candidate D-07).
                             Uses proposalPersonnel* prefix to avoid collision with projects.js window functions. -->
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

            <!-- Phase 89: Proposal Approval Queue — mounts here (D-03 section ordering) -->
            <section id="proposal-queue-mount" style="display: none;">
                <!-- Phase 89 mounts here -->
            </section>

            <!-- Phase 87: Proposal Dashboard — mounts here (D-03 section ordering) -->
            <section id="proposal-dashboard-mount" style="display: none;">
                <!-- Phase 87 mounts here -->
            </section>
        </div>
    `;
}

// ----------------------------------------
// Personnel pill helpers (local copy — Phase 88-02 refactor candidate D-07)
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
                        .catch(err => console.error('[Proposals] Project assignment sync failed:', err));
                } else if ((createdType === 'one-time' || createdType === 'recurring') && generatedCode) {
                    syncServicePersonnelToAssignments(generatedCode, [], userIds)
                        .catch(err => console.error('[Proposals] Service assignment sync failed:', err));
                }
            }
        });

        // Success: clear form and show toast (stay on the page per D-03 inline pattern).
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
        renderProposalPills();

        const codeDisplay = code || '(pending client assignment)';
        showToast(`Engagement created as Draft. Code: ${codeDisplay}`, 'success');
    } catch (err) {
        console.error('[Proposals] submitNewEngagement failed:', err);
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
    window.proposalSelectPersonnel = proposalSelectPersonnel;
    window.proposalRemovePersonnel = proposalRemovePersonnel;
    window.proposalShowPersonnelDropdown = proposalShowPersonnelDropdown;
    window.proposalFilterPersonnelDropdown = proposalFilterPersonnelDropdown;

    // Phase 87: activate proposal dashboard mount point.
    // The dashboard content is injected by Plan 02 in renderProposalDashboard().
    const mount = document.getElementById('proposal-dashboard-mount');
    if (mount) mount.style.display = 'block';

    // --- Phase 87 window functions (Plan 02) ---
    window.openProposalDetail        = openProposalDetail;
    window.closeProposalDetailModal  = closeProposalDetailModal;
    window.openCreateProposalModal   = openCreateProposalModal;
    window.openEditProposalModal     = openEditProposalModal;
    window.closeCreateProposalModal  = closeCreateProposalModal;
    window.saveProposal              = saveProposal;
    // Phase 87 Plan 03 — state-transition handlers (real implementations):
    window.submitProposalForApproval = submitProposalForApproval;
    window.openApproveModal          = openApproveModal;
    window.openRejectModal           = openRejectModal;
    window.submitProposalApproval    = submitProposalApproval;
    window.openLossModal             = openLossModal;
    window.submitLoss                = submitLoss;
    window.openClientApprovedModal   = openClientApprovedModal;
    window.submitClientApproved      = submitClientApproved;
    window.submitMarkSentToClient    = submitMarkSentToClient;
    // Plan 04 will overwrite these stubs with real Firebase Storage logic:
    window.saveProposalAttachment    = _stubP04('Save Attachment');
    window.removeProposalAttachment  = _stubP04('Remove Attachment');
    // Plan 05 will overwrite these stubs with real comms-log writes:
    window.toggleAddCommsForm        = _stubP05('Add Comms Entry');
    window.saveCommsEntry            = _stubP05('Save Comms Entry');

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
        (err) => console.error('[Proposals] Clients listener error:', err)
    );
    listeners.push(clientsListener);

    // Users listener: populates the personnel picker.
    // Users collection uses status=='active' (not an active boolean) — matches projects.js pattern.
    const usersListener = onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'active')),
        (snapshot) => {
            usersData = [];
            snapshot.forEach(doc => {
                usersData.push({ id: doc.id, ...doc.data() });
            });
            usersData.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        },
        (err) => console.error('[Proposals] Users listener error:', err)
    );
    listeners.push(usersListener);

        // --- Phase 87 listeners (Plan 02) ---

        // Proposals listener — real-time dashboard updates (D-10: any active user can read)
        const proposalsListener = onSnapshot(
            collection(db, 'proposals'),
            (snapshot) => {
                proposalsData = [];
                snapshot.forEach(d => proposalsData.push({ id: d.id, ...d.data() }));
                renderProposalDashboard();
            },
            (err) => console.error('[Proposals] proposals listener error:', err)
        );
        listeners.push(proposalsListener);

        // Projects listener — populates the Create/Edit Proposal modal project dropdown.
        // Filter to status=='active' projects only (mirrors mrf-form.js loadProjects pattern).
        // NOTE: 'status' here refers to the 'active'/'inactive' boolean-equivalent flag
        // on projects docs, NOT 'project_status'. If the field is different in this
        // codebase, the executor must read app/views/mrf-form.js for the canonical query.
        const projectsListener = onSnapshot(
            collection(db, 'projects'),
            (snapshot) => {
                projectsData = [];
                snapshot.forEach(d => {
                    const data = { id: d.id, ...d.data() };
                    // Filter Draft + inactive projects out of the Create Proposal dropdown.
                    // Draft is hidden because a proposal must be linked to a real project.
                    // Inactive is hidden for the same reason. Match Phase 88-02 procurement.js filter pattern.
                    if (data.project_status === 'Draft') return;
                    if (data.active === false) return;
                    projectsData.push(data);
                });
                projectsData.sort((a, b) =>
                    (a.project_code || a.project_name || '').localeCompare(b.project_code || b.project_name || '')
                );
            },
            (err) => console.error('[Proposals] projects listener error:', err)
        );
        listeners.push(projectsListener);
}

// ----------------------------------------
// destroy()
// ----------------------------------------

export async function destroy() {
    listeners.forEach(unsub => unsub?.());
    listeners = [];

    // Remove window functions attached in init().
    delete window.submitNewEngagement;
    delete window.handleEngagementTypeChange;
    delete window.proposalSelectPersonnel;
    delete window.proposalRemovePersonnel;
    delete window.proposalShowPersonnelDropdown;
    delete window.proposalFilterPersonnelDropdown;

    // Reset module state.
    clientsData = [];
    usersData = [];
    selectedPersonnel = [];
    currentEngagementType = 'project';

    // --- Phase 87 window function cleanup (Plan 02) ---
    delete window.openProposalDetail;
    delete window.closeProposalDetailModal;
    delete window.openCreateProposalModal;
    delete window.openEditProposalModal;
    delete window.closeCreateProposalModal;
    delete window.saveProposal;
    delete window.submitProposalForApproval;
    delete window.openApproveModal;
    delete window.openRejectModal;
    delete window.submitProposalApproval;
    delete window.openLossModal;
    delete window.submitLoss;
    delete window.openClientApprovedModal;
    delete window.submitClientApproved;
    delete window.submitMarkSentToClient;
    delete window.saveProposalAttachment;
    delete window.removeProposalAttachment;
    delete window.toggleAddCommsForm;
    delete window.saveCommsEntry;

    // --- Phase 87 module state reset (Plan 02) ---
    proposalsData = [];
    projectsData = [];
    currentProposal = null;
    createModalMode = 'create';
    createModalEditingId = null;
}

// ============================================================
// PHASE 87 — Proposal Dashboard rendering (Plan 02)
// ============================================================

/**
 * Status → badge metadata mapping (UI-SPEC Color section).
 */
function getProposalStatusBadge(status) {
    const map = {
        draft:            { cls: 'badge-secondary',                       label: 'Draft' },
        pending_internal: { cls: 'status-badge pending',                  label: 'Pending Internal Approval' },
        pending_client:   { cls: 'status-badge procuring',                label: 'Pending Client Review' },
        for_revision:     { cls: 'status-badge rejected',                 label: 'For Revision' },
        client_approved:  { cls: 'status-badge delivered',                label: 'Client Approved' },
        loss:             { cls: 'status-badge rejected',                 label: 'Loss', extra: 'opacity:0.7;' }
    };
    const m = map[status] || { cls: 'badge-secondary', label: status || '—' };
    return `<span class="${m.cls}"${m.extra ? ` style="${m.extra}"` : ''}>${escapeHTML(m.label)}</span>`;
}

/**
 * Days since the proposal entered its current status.
 * Reads current_status_since (Firestore Timestamp) — set on every transition by Plan 03.
 */
function getAgeInStageDays(proposal) {
    const ts = proposal.current_status_since || proposal.created_at;
    if (!ts) return 0;
    let ms;
    if (ts.toMillis) ms = ts.toMillis();
    else if (ts.seconds != null) ms = ts.seconds * 1000;
    else if (typeof ts === 'string') ms = Date.parse(ts);
    else return 0;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

function isOverdueInStage(proposal) {
    const THRESHOLD_DAYS = 7;
    return ['pending_internal', 'pending_client'].includes(proposal.status)
        && getAgeInStageDays(proposal) > THRESHOLD_DAYS;
}

function renderAgeBadge(proposal) {
    const days = getAgeInStageDays(proposal);
    const label = days === 1 ? '1 day' : `${days} days`;
    if (isOverdueInStage(proposal)) {
        return `<span style="color:#856404;font-size:13px;">${escapeHTML(label)} — needs attention</span>`;
    }
    return `<span style="color:#64748b;font-size:13px;">${escapeHTML(label)}</span>`;
}

/**
 * Render the entire Proposal Dashboard into #proposal-dashboard-mount.
 * Called by the proposals onSnapshot listener whenever proposalsData changes.
 */
function renderProposalDashboard() {
    const mount = document.getElementById('proposal-dashboard-mount');
    if (!mount) return;

    // Stage groups in UI-SPEC order
    const STAGE_ORDER = [
        { key: 'pending_internal', label: 'Pending Internal Approval' },
        { key: 'pending_client',   label: 'Pending Client Review' },
        { key: 'for_revision',     label: 'For Revision' },
        { key: 'client_approved',  label: 'Client Approved' },
        { key: 'loss',             label: 'Loss' }
    ];

    // Group by status (drafts also surfaced under a single 'draft' group at the bottom)
    const grouped = {};
    proposalsData.forEach(p => {
        const key = p.status || 'draft';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
    });
    // Sort within each group: newest first by created_at fallback to title
    Object.values(grouped).forEach(arr => {
        arr.sort((a, b) => {
            const ams = a.created_at?.toMillis ? a.created_at.toMillis() : (a.created_at?.seconds * 1000 || 0);
            const bms = b.created_at?.toMillis ? b.created_at.toMillis() : (b.created_at?.seconds * 1000 || 0);
            return bms - ams;
        });
    });

    const totalProposals = proposalsData.length;

    // Header with "New Proposal" CTA (verbatim UI-SPEC copy)
    const header = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin:2rem 0 1rem 0;">
            <h2 style="margin:0;font-size:1.5rem;color:#1e293b;">Proposal Dashboard</h2>
            <button class="btn btn-primary" onclick="window.openCreateProposalModal()">New Proposal</button>
        </div>
    `;

    // Empty state (when no proposals exist at all)
    if (totalProposals === 0) {
        mount.innerHTML = header + `
            <div class="card">
                <div class="card-body" style="text-align:center;padding:3rem 1.5rem;">
                    <h3 style="margin:0 0 0.5rem 0;font-size:1.125rem;color:#1e293b;">No proposals yet</h3>
                    <p style="margin:0;color:#64748b;font-size:0.9375rem;">Create a proposal from the New Engagement section above to begin the proposal lifecycle.</p>
                </div>
            </div>
        `;
        return;
    }

    // Build stage group cards (skip empty stages)
    let groupsHtml = '';

    // Drafts group surfaces above the stages
    if (grouped['draft'] && grouped['draft'].length > 0) {
        groupsHtml += renderStageGroupCard('Draft', grouped['draft']);
    }
    STAGE_ORDER.forEach(({ key, label }) => {
        const items = grouped[key] || [];
        if (items.length === 0) return; // hide empty stages per UI-SPEC
        groupsHtml += renderStageGroupCard(label, items);
    });

    mount.innerHTML = header + groupsHtml;
}

/**
 * Single stage group card: header (label + count pill) + table of proposal rows.
 */
function renderStageGroupCard(label, proposals) {
    const rowsHtml = proposals.map(p => {
        const overdueBorder = isOverdueInStage(p)
            ? 'border-left:3px solid #f59e0b;padding-left:8px;'
            : '';
        const titleTruncated = (p.title || '').length > 40
            ? escapeHTML(p.title.slice(0, 40)) + '…'
            : escapeHTML(p.title || '—');
        const amountDisplay = (p.amount != null && p.amount !== '')
            ? `₱${formatCurrency(p.amount)}`
            : '—';
        return `
            <tr style="${overdueBorder}">
                <td style="padding:8px 10px;">
                    <a href="#" onclick="event.preventDefault();window.openProposalDetail('${escapeHTML(p.id)}')"
                       style="font-size:13px;color:#1a73e8;text-decoration:none;font-weight:500;">${escapeHTML(p.proposal_id || p.id)}</a>
                </td>
                <td style="padding:8px 10px;font-size:14px;font-weight:600;color:#1e293b;">${titleTruncated}</td>
                <td style="padding:8px 10px;font-size:13px;color:#475569;">${escapeHTML(p.project_code || '—')}</td>
                <td style="padding:8px 10px;font-size:13px;color:#475569;">${escapeHTML(p.target_client_name || '(none)')}</td>
                <td style="padding:8px 10px;font-size:13px;color:#1e293b;text-align:right;">${amountDisplay}</td>
                <td style="padding:8px 10px;">${renderAgeBadge(p)}</td>
                <td style="padding:8px 10px;">
                    <button class="btn btn-sm btn-outline" onclick="window.openProposalDetail('${escapeHTML(p.id)}')" aria-label="View proposal">View</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="card" style="margin-bottom:1rem;">
            <div class="card-header" style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;background:#f8f9fa;border-bottom:1px solid #e5e7eb;">
                <span style="font-size:15px;font-weight:600;color:#1e293b;">${escapeHTML(label)}</span>
                <span class="badge-secondary" style="padding:2px 8px;font-size:12px;background:#e5e7eb;color:#374151;border-radius:9999px;">${proposals.length}</span>
            </div>
            <div class="card-body" style="padding:0;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8f9fa;border-bottom:1px solid #e5e7eb;">
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">PROP ID</th>
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Title</th>
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Project</th>
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Client</th>
                            <th style="padding:8px 10px;text-align:right;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Age in Stage</th>
                            <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.05em;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ============================================================
// PHASE 87 — Audit Trail rendering (Plan 02)
// ============================================================

const AUDIT_ACTION_DOT_COLORS = {
    CREATED:              '#64748b',
    SUBMITTED:            '#1a73e8',
    APPROVED:             '#059669',
    REJECTED:             '#ea4335',
    ATTACHMENT_REPLACED:  '#f59e0b',
    SENT_TO_CLIENT:       '#1a73e8',
    CLIENT_APPROVED:      '#059669',
    LOSS_RECORDED:        '#ea4335'
};

const AUDIT_ACTION_LABELS = {
    CREATED:              'Created',
    SUBMITTED:            'Submitted for Approval',
    APPROVED:             'Approved',
    REJECTED:             'Rejected',
    ATTACHMENT_REPLACED:  'Attachment Replaced',
    SENT_TO_CLIENT:       'Sent to Client',
    CLIENT_APPROVED:      'Client Approved',
    LOSS_RECORDED:        'Marked as Loss'
};

/**
 * Render the vertical audit-trail thread (newest first).
 */
function renderAuditTrail(proposal) {
    const entries = (proposal.audit_log || []).slice().sort((a, b) => {
        const ams = a.ts?.toMillis ? a.ts.toMillis() : (a.ts?.seconds * 1000 || 0);
        const bms = b.ts?.toMillis ? b.ts.toMillis() : (b.ts?.seconds * 1000 || 0);
        return bms - ams; // newest first
    });
    if (entries.length === 0) {
        return `<div style="color:#64748b;font-size:13px;">No audit entries.</div>`;
    }
    const itemsHtml = entries.map((e, idx) => {
        const dotColor = AUDIT_ACTION_DOT_COLORS[e.action] || '#64748b';
        const label = AUDIT_ACTION_LABELS[e.action] || (e.action || 'Unknown');
        const tsLabel = e.ts ? formatTimestamp(e.ts) : '';
        const commentHtml = e.comment
            ? `<div style="font-size:13px;color:#1e293b;font-style:italic;margin-top:4px;">${escapeHTML(e.comment)}</div>`
            : '';
        const connector = idx < entries.length - 1
            ? `<div style="position:absolute;left:3px;top:12px;bottom:-8px;width:1px;background:#e2e8f0;"></div>`
            : '';
        return `
            <div style="position:relative;padding-left:20px;padding-bottom:12px;">
                <div style="position:absolute;left:0;top:4px;width:8px;height:8px;border-radius:50%;background:${dotColor};"></div>
                ${connector}
                <div style="font-size:13px;font-weight:600;color:#1e293b;">${escapeHTML(label)}</div>
                <div style="font-size:13px;color:#64748b;">${escapeHTML(tsLabel)} · ${escapeHTML(e.actor_name || '—')}</div>
                ${commentHtml}
            </div>
        `;
    }).join('');
    return itemsHtml;
}

// ============================================================
// PHASE 87 — Proposal Detail modal (Plan 02)
// ============================================================

/**
 * Build action button HTML based on proposal.status and current user role.
 * Plan 02: buttons render but call STUB window functions that toast 'Plan 03'.
 */
function renderProposalActionButtons(proposal) {
    const cu = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const canApprove = ['super_admin', 'operations_admin'].includes(cu?.role);
    const status = proposal.status || 'draft';
    const docId = escapeHTML(proposal.id);

    let buttons = [];
    if (status === 'draft' || status === 'for_revision') {
        if (canApprove) {
            buttons.push(`<button class="btn btn-primary" style="width:100%;" onclick="window.submitProposalForApproval('${docId}')">Submit for Internal Approval</button>`);
        }
        buttons.push(`<button class="btn btn-outline" style="width:100%;" onclick="window.openEditProposalModal('${docId}')">Edit Proposal</button>`);
    } else if (status === 'pending_internal') {
        if (canApprove) {
            buttons.push(`<button class="btn btn-success" style="width:100%;" onclick="window.openApproveModal('${docId}')">Approve Proposal</button>`);
            buttons.push(`<button class="btn btn-danger" style="width:100%;" onclick="window.openRejectModal('${docId}')">Reject Proposal</button>`);
        }
    } else if (status === 'pending_client') {
        if (canApprove) {
            buttons.push(`<button class="btn btn-outline" style="width:100%;" onclick="window.submitMarkSentToClient('${docId}')">Mark Sent to Client</button>`);
            buttons.push(`<button class="btn btn-success" style="width:100%;" onclick="window.openClientApprovedModal('${docId}')">Client Approved</button>`);
            buttons.push(`<button class="btn btn-danger" style="width:100%;" onclick="window.openLossModal('${docId}')">Mark as Loss</button>`);
        }
    }
    // client_approved + loss: no further actions (UI-SPEC table)

    if (buttons.length === 0) {
        return `<div style="font-size:13px;color:#64748b;">No further actions.</div>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:8px;">${buttons.join('')}</div>`;
}

/**
 * Build the Proposal Detail modal HTML for the given proposal doc.
 */
function buildProposalDetailModalHtml(proposal) {
    const titleSafe = escapeHTML((proposal.title || '').slice(0, 50));
    const idSafe = escapeHTML(proposal.proposal_id || proposal.id);
    return `
    <div id="proposalDetailModal" class="modal" style="display:flex;">
        <div class="modal-content" style="max-width:900px;max-height:85vh;display:flex;flex-direction:column;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${idSafe} — ${titleSafe}</h2>
                <button class="modal-close" aria-label="Close proposal detail" onclick="window.closeProposalDetailModal()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;overflow-y:auto;flex:1;display:grid;grid-template-columns:3fr 2fr;gap:1.5rem;">
                <!-- LEFT: details + comms log + attachment -->
                <div>
                    ${buildProposalDetailsBlock(proposal)}
                    ${buildAttachmentSection(proposal)}
                    ${buildCommsLogSection(proposal)}
                </div>
                <!-- RIGHT: audit trail + action buttons -->
                <div>
                    <h3 style="font-size:14px;font-weight:600;color:#1e293b;margin:0 0 0.75rem 0;">Audit Trail</h3>
                    ${renderAuditTrail(proposal)}
                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:1rem 0;">
                    <h3 style="font-size:14px;font-weight:600;color:#1e293b;margin:0 0 0.75rem 0;">Actions</h3>
                    ${renderProposalActionButtons(proposal)}
                </div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <span>${getProposalStatusBadge(proposal.status || 'draft')}</span>
                <button class="btn btn-outline" onclick="window.closeProposalDetailModal()">Close</button>
            </div>
        </div>
    </div>`;
}

function buildProposalDetailsBlock(proposal) {
    const amount = (proposal.amount != null && proposal.amount !== '')
        ? `₱${formatCurrency(proposal.amount)}`
        : '—';
    return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
            <div style="grid-column:1/-1;">
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Title</div>
                <div style="font-weight:600;color:#1e293b;">${escapeHTML(proposal.title || '—')}</div>
            </div>
            <div style="grid-column:1/-1;">
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Description</div>
                <div style="color:#1e293b;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHTML(proposal.description || '—')}</div>
            </div>
            <div>
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Amount</div>
                <div style="font-weight:600;color:#1e293b;">${amount}</div>
            </div>
            <div>
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Target Client</div>
                <div style="font-weight:600;color:#1e293b;">${escapeHTML(proposal.target_client_name || '(none)')}</div>
            </div>
            <div>
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Project</div>
                <div style="font-weight:600;color:#1e293b;">${escapeHTML(proposal.project_code || '—')}</div>
            </div>
            <div>
                <div class="modal-detail-label" style="font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">Version</div>
                <div style="font-weight:600;color:#1e293b;">v1</div>
            </div>
        </div>
    `;
}

/** Placeholder for Plan 04 — attachment widget. Renders a disabled placeholder. */
function buildAttachmentSection(proposal) {
    const has = !!(proposal.attachment_kind);
    return `
        <div style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;margin-bottom:1.5rem;">
            <div style="font-size:13px;color:#64748b;margin-bottom:6px;">Attachment</div>
            <div style="font-size:14px;color:#1e293b;">${has ? escapeHTML(proposal.attachment_filename || 'Attached') : 'No attachment'}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Attachment widget ships in Plan 04.</div>
        </div>
    `;
}

/** Placeholder for Plan 05 — comms log + inline add form. Renders entries read-only. */
function buildCommsLogSection(proposal) {
    const entries = (proposal.comms_log || []).slice().sort((a, b) => {
        const ad = a.logged_at?.toMillis ? a.logged_at.toMillis() : (a.logged_at?.seconds * 1000 || 0);
        const bd = b.logged_at?.toMillis ? b.logged_at.toMillis() : (b.logged_at?.seconds * 1000 || 0);
        return bd - ad;
    });
    const items = entries.length === 0
        ? `<div style="font-size:13px;color:#64748b;">No communications logged yet. Use + Add Entry to record client contact.</div>`
        : entries.map(e => `
            <div style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
                <div style="font-size:13px;color:#475569;">${escapeHTML(e.date || '')} · ${escapeHTML(e.type || '')}</div>
                <div style="font-size:14px;color:#1e293b;margin-top:2px;">${escapeHTML(e.description || '')}</div>
            </div>
        `).join('');
    return `
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <h3 style="font-size:14px;font-weight:600;color:#1e293b;margin:0;">Client Communications</h3>
                <button class="btn btn-sm btn-outline" onclick="window.toggleAddCommsForm('${escapeHTML(proposal.id)}')">+ Add Entry</button>
            </div>
            ${items}
            <div id="commsLogAddForm-${escapeHTML(proposal.id)}" style="display:none;margin-top:1rem;">
                <div style="font-size:12px;color:#94a3b8;">Add Entry form ships in Plan 05.</div>
            </div>
        </div>
    `;
}

function openProposalDetail(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) {
        showToast('Proposal not found.', 'error');
        return;
    }
    currentProposal = proposal;
    const existing = document.getElementById('proposalDetailModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', buildProposalDetailModalHtml(proposal));
}

function closeProposalDetailModal() {
    const el = document.getElementById('proposalDetailModal');
    if (el) el.remove();
    currentProposal = null;
}

// ============================================================
// PHASE 87 — Create / Edit Proposal modal (Plan 02)
// ============================================================

function openCreateProposalModal() {
    createModalMode = 'create';
    createModalEditingId = null;
    showCreateModal(null);
}

function openEditProposalModal(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) {
        showToast('Proposal not found.', 'error');
        return;
    }
    createModalMode = 'edit';
    createModalEditingId = proposalDocId;
    showCreateModal(proposal);
}

function showCreateModal(existing) {
    const existingEl = document.getElementById('proposalCreateModal');
    if (existingEl) existingEl.remove();

    const isEdit = createModalMode === 'edit';
    const heading = isEdit ? 'Edit Proposal' : 'New Proposal';
    const ctaLabel = isEdit ? 'Save Changes' : 'Save Proposal';

    const titleVal = isEdit ? escapeHTML(existing?.title || '') : '';
    const descVal = isEdit ? escapeHTML(existing?.description || '') : '';
    const amountVal = (isEdit && existing?.amount != null) ? String(existing.amount) : '';
    const currentProjectId = isEdit ? (existing?.project_id || '') : '';
    const currentClientId = isEdit ? (existing?.target_client_id || '') : '';

    // Build project <option> list from projectsData (active, non-Draft only — populated by Task 1 listener)
    const projectOptions = projectsData.map(p => {
        const sel = (p.id === currentProjectId) ? 'selected' : '';
        const label = p.project_code
            ? `${escapeHTML(p.project_code)} — ${escapeHTML(p.project_name || '')}`
            : escapeHTML(p.project_name || '');
        return `<option value="${escapeHTML(p.id)}" data-code="${escapeHTML(p.project_code || '')}" data-name="${escapeHTML(p.project_name || '')}" ${sel}>${label}</option>`;
    }).join('');

    // Build client <option> list from clientsData (Phase 88 listener already populates this)
    const clientOptions = clientsData.map(c => {
        const sel = (c.id === currentClientId) ? 'selected' : '';
        const label = c.client_code
            ? `${escapeHTML(c.client_code)} — ${escapeHTML(c.client_name || '')}`
            : escapeHTML(c.client_name || '');
        return `<option value="${escapeHTML(c.id)}" data-name="${escapeHTML(c.client_name || '')}" ${sel}>${label}</option>`;
    }).join('');

    const html = `
    <div id="proposalCreateModal" class="modal" style="display:flex;z-index:1001;">
        <div class="modal-content" style="max-width:640px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${heading}</h2>
                <button class="modal-close" aria-label="Close" onclick="window.closeCreateProposalModal()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <div style="margin-bottom:1rem;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Title <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="proposalCreateTitle" placeholder="Brief proposal title" value="${titleVal}" style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;">
                    <div id="proposalCreateTitleError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Project <span style="color:#ef4444;">*</span></label>
                    <select id="proposalCreateProject" ${isEdit ? 'disabled' : ''} style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;background:white;">
                        <option value="">— Select a project —</option>
                        ${projectOptions}
                    </select>
                    <div id="proposalCreateProjectError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
                    ${isEdit ? '<div style="font-size:12px;color:#64748b;margin-top:4px;">Project link cannot be changed after creation.</div>' : ''}
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Target Client <span style="color:#64748b;font-weight:400;">(optional)</span></label>
                    <select id="proposalCreateClient" style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;background:white;">
                        <option value="">(none)</option>
                        ${clientOptions}
                    </select>
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Description</label>
                    <textarea id="proposalCreateDescription" rows="4" placeholder="Describe the scope and deliverables" style="width:100%;min-height:80px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;">${descVal}</textarea>
                </div>
                <div>
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Amount (PHP)</label>
                    <input type="number" id="proposalCreateAmount" min="0" step="0.01" placeholder="0.00" value="${amountVal}" style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;">
                    <div id="proposalCreateAmountError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
                </div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="window.closeCreateProposalModal()">Cancel</button>
                <button class="btn btn-primary" onclick="window.saveProposal()">${ctaLabel}</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function closeCreateProposalModal() {
    const el = document.getElementById('proposalCreateModal');
    if (el) el.remove();
    createModalMode = 'create';
    createModalEditingId = null;
}

async function saveProposal() {
    // Validation: read DOM values + show inline errors
    const titleEl = document.getElementById('proposalCreateTitle');
    const projectEl = document.getElementById('proposalCreateProject');
    const clientEl = document.getElementById('proposalCreateClient');
    const descEl = document.getElementById('proposalCreateDescription');
    const amountEl = document.getElementById('proposalCreateAmount');

    const title = (titleEl?.value || '').trim();
    const projectId = projectEl?.value || '';
    const clientId = clientEl?.value || '';
    const description = (descEl?.value || '').trim();
    const amountRaw = amountEl?.value;
    const amount = (amountRaw !== '' && amountRaw != null) ? parseFloat(amountRaw) : null;

    // Clear previous inline errors
    ['proposalCreateTitleError', 'proposalCreateProjectError', 'proposalCreateAmountError'].forEach(id => {
        const e = document.getElementById(id);
        if (e) { e.textContent = ''; e.style.display = 'none'; }
    });

    let hasError = false;
    if (!title) {
        const e = document.getElementById('proposalCreateTitleError');
        if (e) { e.textContent = 'Proposal title is required.'; e.style.display = 'block'; }
        hasError = true;
    }
    if (!projectId) {
        const e = document.getElementById('proposalCreateProjectError');
        if (e) { e.textContent = 'Please select a project for this proposal.'; e.style.display = 'block'; }
        hasError = true;
    }
    if (amount != null && (isNaN(amount) || amount < 0)) {
        const e = document.getElementById('proposalCreateAmountError');
        if (e) { e.textContent = 'Amount must be a positive number if provided.'; e.style.display = 'block'; }
        hasError = true;
    }
    if (hasError) return;

    // Resolve denormalized fields from in-memory data
    const project = projectsData.find(p => p.id === projectId);
    const projectCode = project?.project_code || null;
    const client = clientId ? clientsData.find(c => c.id === clientId) : null;
    const clientName = client?.client_name || null;

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    showLoading(true);
    try {
        if (createModalMode === 'edit' && createModalEditingId) {
            // EDIT mode: update title/description/amount/target_client_id/target_client_name only.
            // D-04: metadata edits do NOT append to audit_log (only lifecycle actions do).
            // Project link is immutable post-create (UI disables the dropdown).
            await updateDoc(doc(db, 'proposals', createModalEditingId), {
                title,
                description: description || '',
                amount: (amount != null) ? amount : null,
                target_client_id: clientId || null,
                target_client_name: clientName,
                updated_at: serverTimestamp()
            });
            closeCreateProposalModal();
            // Refresh detail modal if open
            if (currentProposal && currentProposal.id === createModalEditingId) {
                const refreshed = proposalsData.find(p => p.id === createModalEditingId);
                if (refreshed) {
                    currentProposal = refreshed;
                    // Re-render modal HTML in place
                    const existing = document.getElementById('proposalDetailModal');
                    if (existing) {
                        existing.remove();
                        document.body.insertAdjacentHTML('beforeend', buildProposalDetailModalHtml(currentProposal));
                    }
                }
            }
            showToast('Proposal updated.', 'success');
        } else {
            // CREATE mode: mint PROP ID, build full doc, write to Firestore.
            const proposalId = await generateProposalId();
            const createdAuditEntry = {
                entry_id: cryptoRandomUuid(),
                ts: new Date().toISOString(), // ISO string — serverTimestamp() sentinel not allowed inside array elements
                actor_id: actorUid,
                actor_name: actorName,
                action: 'CREATED',
                comment: null
            };
            const docPayload = {
                proposal_id: proposalId,
                project_id: projectId,
                project_code: projectCode,
                title,
                description: description || '',
                amount: (amount != null) ? amount : null,
                target_client_id: clientId || null,
                target_client_name: clientName,
                status: 'draft',
                attachment_kind: null,
                attachment_url: null,
                attachment_storage_path: null,
                attachment_filename: null,
                audit_log: [createdAuditEntry],
                comms_log: [],
                loss_reason: null,
                current_status_since: serverTimestamp(),
                created_by: actorUid,  // PROP-11 firestore.rules requires == request.auth.uid
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };
            await addDoc(collection(db, 'proposals'), docPayload);
            closeCreateProposalModal();
            showToast(`Proposal ${proposalId} created.`, 'success');
        }
    } catch (err) {
        console.error('[Proposals] saveProposal failed:', err);
        showToast(err?.message || 'Failed to save. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Generate a UUID for audit_log entry_id.
 * Prefers crypto.randomUUID() (modern browsers); falls back to a simple pseudo-UUID.
 */
function cryptoRandomUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for older runtimes — sufficient uniqueness for audit entry IDs
    return 'p87-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ============================================================
// PHASE 87 — Stub window functions for Plans 03 / 04 / 05
// These render the toast 'Coming in Plan {N}' so users can click action buttons
// in the detail modal without runtime errors. Plans 03/04/05 OVERWRITE these
// via direct window assignment in their init() additions.
// ============================================================

function _stubP03(label) {
    return () => showToast(`${label} — wiring ships in Plan 03 (state transitions).`, 'info');
}
function _stubP04(label) {
    return () => showToast(`${label} — wiring ships in Plan 04 (attachments).`, 'info');
}
function _stubP05(label) {
    return () => showToast(`${label} — wiring ships in Plan 05 (comms log).`, 'info');
}

// ============================================================
// PHASE 87 — Shared state-transition helper (Plan 03)
// ============================================================

/**
 * Apply a proposal state transition atomically.
 * Writes ONE writeBatch covering proposal doc + (optionally) project doc.
 * Caller fires notifications AFTER batch.commit() in fire-and-forget try/catch.
 *
 * @param {object} args
 * @param {object} args.proposal               - current proposal (with .id, .status, .audit_log, .project_id)
 * @param {string|null} args.newStatus         - new proposal.status, or null for audit-only (e.g. Mark Sent to Client)
 * @param {string|null} args.newProjectStatus  - new project.project_status, or null to skip project doc write
 * @param {string} args.auditAction            - 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SENT_TO_CLIENT' | 'CLIENT_APPROVED' | 'LOSS_RECORDED'
 * @param {string|null} args.auditComment      - comment text or null
 * @param {object} [args.extraProposalFields]  - extra top-level fields (e.g. {loss_reason: 'xyz'})
 * @returns {Promise<object>} the new audit entry written
 */
async function _applyProposalStateTransition({ proposal, newStatus, newProjectStatus, auditAction, auditComment, extraProposalFields }) {
    if (!proposal || !proposal.id) throw new Error('_applyProposalStateTransition: proposal with id required');
    if (!auditAction) throw new Error('_applyProposalStateTransition: auditAction required');

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    const newAuditEntry = {
        entry_id: cryptoRandomUuid(),
        ts: new Date().toISOString(),  // ISO string — serverTimestamp() sentinel cannot live inside array elements
        actor_id: actorUid,
        actor_name: actorName,
        action: auditAction,
        comment: auditComment || null
    };

    const proposalPayload = {
        audit_log: [...(proposal.audit_log || []), newAuditEntry],
        updated_at: serverTimestamp()
    };
    // Only mutate status + current_status_since when newStatus is explicit AND differs from current.
    // Mark Sent to Client uses newStatus=null because it stays in pending_client.
    if (newStatus && newStatus !== proposal.status) {
        proposalPayload.status = newStatus;
        proposalPayload.current_status_since = serverTimestamp();
    }
    // Merge extras (loss_reason, etc.)
    if (extraProposalFields && typeof extraProposalFields === 'object') {
        Object.assign(proposalPayload, extraProposalFields);
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'proposals', proposal.id), proposalPayload);

    // Project doc update only when transition explicitly maps to a project_status change.
    if (newProjectStatus && proposal.project_id) {
        batch.update(doc(db, 'projects', proposal.project_id), {
            project_status: newProjectStatus,
            updated_at: new Date().toISOString()  // projects collection convention (project-detail.js line 804)
        });
    }

    await batch.commit();
    return newAuditEntry;
}

/**
 * After a state transition succeeds, re-render the detail modal (if open) with
 * the new audit entry + updated action buttons. onSnapshot will catch up; we
 * optimistically merge here for immediate user feedback.
 */
function _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, statusUpdate, extraUpdates) {
    setTimeout(() => {
        let proposal = proposalsData.find(p => p.id === proposalDocId);
        if (!proposal) return;
        const hasOurEntry = (proposal.audit_log || []).some(e => e.entry_id === newAuditEntry.entry_id);
        if (!hasOurEntry) {
            proposal = {
                ...proposal,
                ...statusUpdate,
                ...(extraUpdates || {}),
                audit_log: [...(proposal.audit_log || []), newAuditEntry]
            };
        }
        currentProposal = proposal;
        const existing = document.getElementById('proposalDetailModal');
        if (existing) {
            existing.remove();
            document.body.insertAdjacentHTML('beforeend', buildProposalDetailModalHtml(proposal));
        }
    }, 0);
}

// ============================================================
// PHASE 87 — Transition: Submit for Internal Approval (Plan 03)
//   Source statuses:  draft, for_revision
//   Target status:    pending_internal
//   Project status:   Proposal for Internal Approval
//   Notification:     NOTIF-09 fan-out to super_admin + operations_admin
// ============================================================
async function submitProposalForApproval(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (!['draft', 'for_revision'].includes(proposal.status)) {
        showToast('Cannot submit a proposal that is not in Draft or For Revision.', 'error');
        return;
    }

    showLoading(true);
    try {
        const newAuditEntry = await _applyProposalStateTransition({
            proposal,
            newStatus: 'pending_internal',
            newProjectStatus: 'Proposal for Internal Approval',
            auditAction: 'SUBMITTED',
            auditComment: null
        });

        // NOTIF-09 — fan-out to all approvers (D-09 message + link format)
        try {
            const actor = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
            const actorName = actor?.full_name || 'Unknown';
            await createNotificationForRoles({
                roles: ['super_admin', 'operations_admin'],
                type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED,
                message: `Proposal ${proposal.title} submitted for approval by ${actorName}`,
                link: `#/proposals?id=${proposal.proposal_id}`,
                source_collection: 'proposals',
                source_id: proposal.proposal_id,
                excludeActor: true
            });
        } catch (notifErr) {
            console.error('[Proposals] NOTIF-09 failed:', notifErr);
        }

        showToast('Proposal submitted for internal approval. Approvers have been notified.', 'success');
        _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, { status: 'pending_internal' });
    } catch (err) {
        console.error('[Proposals] submitProposalForApproval failed:', err);
        showToast(err?.message || 'Failed to submit proposal. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// PHASE 87 — Transition: Mark Sent to Client (Plan 03)
//   Source statuses:  pending_client
//   Target status:    pending_client (idempotent — audit only)
//   Project status:   (no change — D-08 explicit)
//   Notification:     none (internal bookkeeping)
// ============================================================
async function submitMarkSentToClient(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Mark Sent to Client is only available after the proposal is approved internally.', 'error');
        return;
    }

    showLoading(true);
    try {
        const newAuditEntry = await _applyProposalStateTransition({
            proposal,
            newStatus: null,                  // stay in pending_client
            newProjectStatus: null,           // no project status change
            auditAction: 'SENT_TO_CLIENT',
            auditComment: null
        });
        showToast('Marked as sent to client.', 'success');
        _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, {});
    } catch (err) {
        console.error('[Proposals] submitMarkSentToClient failed:', err);
        showToast(err?.message || 'Failed to mark as sent. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// PHASE 87 — Approve / Reject sub-modals (Plan 03)
// ============================================================

function openApproveModal(proposalDocId) {
    _openApproveOrRejectModal(proposalDocId, 'approve');
}

function openRejectModal(proposalDocId) {
    _openApproveOrRejectModal(proposalDocId, 'reject');
}

function _openApproveOrRejectModal(proposalDocId, mode) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_internal') {
        showToast('Approve/Reject is only available for proposals pending internal approval.', 'error');
        return;
    }

    const config = (mode === 'approve')
        ? {
            modalId: 'proposalApproveModal',
            heading: 'Approve Proposal',
            body: 'Approving this proposal will advance the project status to \'Proposal Under Client Review\'. This action is recorded in the audit trail.',
            label: 'Approval Notes',
            placeholder: 'Describe your review decision...',
            confirmLabel: 'Confirm Approval',
            confirmClass: 'btn-success'
        }
        : {
            modalId: 'proposalRejectModal',
            heading: 'Reject Proposal',
            body: 'Rejecting this proposal will move it back to \'For Revision\'. The submitter will be notified.',
            label: 'Rejection Reason',
            placeholder: 'Explain what needs to be changed...',
            confirmLabel: 'Confirm Rejection',
            confirmClass: 'btn-danger'
        };

    const existing = document.getElementById(config.modalId);
    if (existing) existing.remove();

    const html = `
    <div id="${config.modalId}" class="modal" style="display:flex;z-index:1001;">
        <div class="modal-content" style="max-width:480px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${escapeHTML(config.heading)}</h2>
                <button class="modal-close" aria-label="Close" onclick="document.getElementById('${config.modalId}').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <p style="color:#475569;margin:0 0 1rem 0;font-size:14px;line-height:1.5;">${escapeHTML(config.body)}</p>
                <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">${escapeHTML(config.label)} <span style="color:#ef4444;">*</span></label>
                <textarea id="proposalActionComment" rows="4" placeholder="${escapeHTML(config.placeholder)}" style="width:100%;min-height:80px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
                <div id="proposalActionCommentError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('${config.modalId}').remove()">Cancel</button>
                <button class="${'btn ' + config.confirmClass}" onclick="window.submitProposalApproval('${escapeHTML(proposalDocId)}', '${mode}')">${escapeHTML(config.confirmLabel)}</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

// ============================================================
// PHASE 87 — submitProposalApproval — handles both approve and reject
// ============================================================
async function submitProposalApproval(proposalDocId, mode) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_internal') {
        showToast('Proposal status changed. Please reload.', 'error');
        return;
    }

    const commentEl = document.getElementById('proposalActionComment');
    const errEl = document.getElementById('proposalActionCommentError');
    const comment = (commentEl?.value || '').trim();
    const fieldLabel = (mode === 'approve') ? 'Approval Notes' : 'Rejection Reason';
    if (comment.length < 10) {
        if (errEl) {
            errEl.textContent = `${fieldLabel} is required (minimum 10 characters).`;
            errEl.style.display = 'block';
        }
        return;
    }

    const modalId = (mode === 'approve') ? 'proposalApproveModal' : 'proposalRejectModal';
    const newStatus = (mode === 'approve') ? 'pending_client' : 'for_revision';
    const newProjectStatus = (mode === 'approve') ? 'Proposal Under Client Review' : 'For Revision';
    const auditAction = (mode === 'approve') ? 'APPROVED' : 'REJECTED';
    const successToast = (mode === 'approve')
        ? 'Proposal approved. Project status updated.'
        : 'Proposal rejected. Submitter has been notified.';

    showLoading(true);
    try {
        const newAuditEntry = await _applyProposalStateTransition({
            proposal,
            newStatus,
            newProjectStatus,
            auditAction,
            auditComment: comment
        });

        // NOTIF-10 — single recipient: proposal.created_by (the submitter)
        try {
            if (proposal.created_by) {
                const actionVerb = (mode === 'approve') ? 'approved' : 'rejected';
                const excerpt = comment.length > 60 ? comment.slice(0, 60) + '…' : comment;
                await createNotification({
                    user_id: proposal.created_by,
                    type: NOTIFICATION_TYPES.PROPOSAL_DECIDED,
                    message: `Proposal "${proposal.title}" ${actionVerb}: ${excerpt}`,
                    link: `#/proposals?id=${proposal.proposal_id}`,
                    source_collection: 'proposals',
                    source_id: proposal.proposal_id
                });
            }
        } catch (notifErr) {
            console.error('[Proposals] NOTIF-10 failed:', notifErr);
        }

        const sub = document.getElementById(modalId);
        if (sub) sub.remove();
        showToast(successToast, 'success');
        _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, { status: newStatus });
    } catch (err) {
        console.error('[Proposals] submitProposalApproval failed:', err);
        showToast(err?.message || 'Failed to record decision. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// PHASE 87 — Mark Loss sub-modal (Plan 03)
//   Source statuses:  any active (D-08 — "any active proposal")
//   Target status:    loss
//   Project status:   Loss
//   Notification:     none (deferred per CONTEXT — could add later)
//   Loss reason:      required free text, persisted on proposal.loss_reason
//                     AND mirrored to LOSS_RECORDED audit entry's comment (D-06)
// ============================================================
function openLossModal(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (['client_approved', 'loss'].includes(proposal.status)) {
        showToast('Cannot mark a final-state proposal as Loss.', 'error');
        return;
    }

    const existing = document.getElementById('proposalLossModal');
    if (existing) existing.remove();

    const html = `
    <div id="proposalLossModal" class="modal" style="display:flex;z-index:1001;">
        <div class="modal-content" style="max-width:480px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">Mark as Loss</h2>
                <button class="modal-close" aria-label="Close" onclick="document.getElementById('proposalLossModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <p style="color:#475569;margin:0 0 1rem 0;font-size:14px;line-height:1.5;">This will permanently mark the proposal as lost and advance the project status to "Loss". This action cannot be undone.</p>
                <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Loss Reason <span style="color:#ef4444;">*</span></label>
                <textarea id="proposalLossReason" rows="3" placeholder="Describe why this proposal was lost (client decision, budget, competitor, etc.)" style="width:100%;min-height:96px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
                <div id="proposalLossReasonError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('proposalLossModal').remove()">Cancel</button>
                <button class="btn btn-danger" onclick="window.submitLoss('${escapeHTML(proposalDocId)}')">Confirm Loss</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function submitLoss(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }

    const reasonEl = document.getElementById('proposalLossReason');
    const errEl = document.getElementById('proposalLossReasonError');
    const reason = (reasonEl?.value || '').trim();
    if (reason.length < 10) {
        if (errEl) {
            errEl.textContent = 'Loss Reason is required (minimum 10 characters).';
            errEl.style.display = 'block';
        }
        return;
    }

    showLoading(true);
    try {
        const newAuditEntry = await _applyProposalStateTransition({
            proposal,
            newStatus: 'loss',
            newProjectStatus: 'Loss',
            auditAction: 'LOSS_RECORDED',
            auditComment: reason,         // D-06: mirror loss_reason into audit comment
            extraProposalFields: { loss_reason: reason }
        });

        const sub = document.getElementById('proposalLossModal');
        if (sub) sub.remove();
        showToast('Proposal marked as Loss. Project status updated.', 'success');
        _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, { status: 'loss' }, { loss_reason: reason });
    } catch (err) {
        console.error('[Proposals] submitLoss failed:', err);
        showToast(err?.message || 'Failed to record loss. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// PHASE 87 — Client Approved sub-modal (Plan 03)
//   Source statuses:  pending_client
//   Target status:    client_approved
//   Project status:   Client Approved  (per 87-RESEARCH.md verified canonical string;
//                     'For Mobilization' is a separate downstream manual action)
//   Notification:     none (positive final state — no submitter notify needed)
// ============================================================
function openClientApprovedModal(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Client Approved is only available after a proposal is pending client review.', 'error');
        return;
    }

    const existing = document.getElementById('proposalClientApprovedModal');
    if (existing) existing.remove();

    const html = `
    <div id="proposalClientApprovedModal" class="modal" style="display:flex;z-index:1001;">
        <div class="modal-content" style="max-width:480px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">Mark as Client Approved</h2>
                <button class="modal-close" aria-label="Close" onclick="document.getElementById('proposalClientApprovedModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <p style="color:#475569;margin:0;font-size:14px;line-height:1.5;">This will advance the project status to "Client Approved". The proposal lifecycle is complete.</p>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('proposalClientApprovedModal').remove()">Cancel</button>
                <button class="btn btn-success" onclick="window.submitClientApproved('${escapeHTML(proposalDocId)}')">Confirm Client Approval</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function submitClientApproved(proposalDocId) {
    const proposal = proposalsData.find(p => p.id === proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Proposal status changed. Please reload.', 'error');
        return;
    }

    showLoading(true);
    try {
        const newAuditEntry = await _applyProposalStateTransition({
            proposal,
            newStatus: 'client_approved',
            newProjectStatus: 'Client Approved',
            auditAction: 'CLIENT_APPROVED',
            auditComment: null
        });

        const sub = document.getElementById('proposalClientApprovedModal');
        if (sub) sub.remove();
        showToast('Proposal marked Client Approved. Project status updated.', 'success');
        _refreshDetailModalAfterTransition(proposalDocId, newAuditEntry, { status: 'client_approved' });
    } catch (err) {
        console.error('[Proposals] submitClientApproved failed:', err);
        showToast(err?.message || 'Failed to mark Client Approved. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}
