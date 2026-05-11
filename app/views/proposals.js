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
