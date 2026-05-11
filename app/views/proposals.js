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

import { db, collection, onSnapshot, query, where, doc, getDoc, addDoc, updateDoc, serverTimestamp } from '../firebase.js';
import { showLoading, showToast, syncPersonnelToAssignments, syncServicePersonnelToAssignments, escapeHTML, formatCurrency, formatTimestamp, generateProposalId } from '../utils.js';
import { createEngagement } from '../engagement-create.js';

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
}
