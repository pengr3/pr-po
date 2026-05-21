/* ========================================
   PROPOSAL MODAL — Shared utility
   Phase 87.1 Plan 02 — Extracted from app/views/proposals.js

   Purpose: open the full Proposal Detail modal (with audit trail, comms log,
   attachment widget, and lifecycle action buttons) from any context — home.js
   Proposals sub-tab, project-detail.js inline card, service-detail.js inline
   card — without coupling to the proposals.js routed view's module state.

   Exports:
     - openProposalModal(proposalId, context)  — async; fresh getDoc() fetch
     - closeProposalModal()                    — removes modal + window fns

   Adaptations from proposals.js source:
     - openProposalModal fetches a fresh doc via getDoc(doc(db,'proposals',id))
       instead of looking up the module-level proposalsData array (which only
       exists inside proposals.js).
     - Every internal handler that previously did a module-state array lookup
       now calls a private `_fetchProposalDoc(id)` helper that does a one-time read.
     - _refreshDetailModalAfterTransition refetches the proposal from Firestore
       so the audit trail and action buttons reflect post-write state.
     - showCreateModal() loads projectsData + clientsData via one-time getDocs
       on first open (cached in module scope for subsequent opens in the same
       page session).
     - All window function registration happens inside openProposalModal();
       all delete window.* cleanup happens inside closeProposalModal().
   ======================================== */

import {
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    addDoc,
    query,
    where,
    writeBatch,
    serverTimestamp
} from './firebase.js';

import {
    showLoading,
    showToast,
    formatCurrency,
    formatTimestamp,
    escapeHTML,
    generateProposalId,
    cryptoRandomUuid
} from './utils.js';

import {
    createNotification,
    createNotificationForRoles,
    NOTIFICATION_TYPES
} from './notifications.js';

import {
    getProposalStatusBadge,
    renderAgeBadge,
    getAgeInStageDays,
    isOverdueInStage,
    _applyProposalStateTransition
} from './views/proposals.js';

// ----------------------------------------
// Module state (private to proposal-modal.js)
// ----------------------------------------
let currentProposal = null;        // currently-open proposal in the detail modal
let createModalMode = 'create';    // 'create' | 'edit'
let createModalEditingId = null;   // Firestore doc ID when in edit mode
let _modalProjectsData = [];       // active, non-Draft projects (for Create/Edit modal dropdown)
let _modalClientsData = [];        // active clients (for Create/Edit modal dropdown)
let _modalProjectsLoaded = false;  // one-shot getDocs cache flag

// ----------------------------------------
// Constants (copied verbatim from proposals.js)
// ----------------------------------------

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

const COMMS_TYPE_META = {
    sent:               { label: 'Sent',                cls: 'badge-primary' },
    feedback_received:  { label: 'Feedback Received',   cls: 'status-badge pending' },
    revision_requested: { label: 'Revision Requested',  cls: 'status-badge rejected' }
};

// ----------------------------------------
// Private helpers — fresh fetch + dropdown data
// ----------------------------------------

/**
 * Fetch a fresh proposal doc by Firestore document ID.
 * Returns {id, ...data} or null if missing.
 * Used everywhere the original code did a module-array lookup by ID.
 */
async function _fetchProposalDoc(proposalDocId) {
    try {
        const snap = await getDoc(doc(db, 'proposals', proposalDocId));
        if (!snap.exists()) return null;
        return { id: snap.id, ...snap.data() };
    } catch (err) {
        console.error('[ProposalModal] _fetchProposalDoc failed:', err);
        return null;
    }
}

/**
 * One-time load of active projects + clients for the Create/Edit modal dropdowns.
 * Caches in module scope (_modalProjectsData / _modalClientsData) for reuse on
 * subsequent opens. Refresh happens implicitly on next page load.
 */
async function _loadModalDropdownData() {
    if (_modalProjectsLoaded) return;
    try {
        const [projectsSnap, clientsSnap] = await Promise.all([
            getDocs(collection(db, 'projects')),
            getDocs(query(collection(db, 'clients'), where('active', '==', true)))
        ]);

        _modalProjectsData = [];
        projectsSnap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            // Filter Draft + inactive projects out of the Create Proposal dropdown
            // (mirrors proposals.js init() filter pattern).
            if (data.project_status === 'Draft') return;
            if (data.active === false) return;
            _modalProjectsData.push(data);
        });
        _modalProjectsData.sort((a, b) =>
            (a.project_code || a.project_name || '').localeCompare(b.project_code || b.project_name || '')
        );

        _modalClientsData = [];
        clientsSnap.forEach(d => {
            _modalClientsData.push({ id: d.id, ...d.data() });
        });
        _modalClientsData.sort((a, b) =>
            (a.client_code || a.client_name || '').localeCompare(b.client_code || b.client_name || '')
        );

        _modalProjectsLoaded = true;
    } catch (err) {
        console.error('[ProposalModal] _loadModalDropdownData failed:', err);
    }
}

// ============================================================
// Audit Trail rendering
// ============================================================

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
// Proposal Detail modal HTML builders
// ============================================================

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
    // client_approved + loss: no further actions

    if (buttons.length === 0) {
        return `<div style="font-size:13px;color:#64748b;">No further actions.</div>`;
    }
    return `<div style="display:flex;flex-direction:column;gap:8px;">${buttons.join('')}</div>`;
}

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

function buildAttachmentSection(proposal) {
    const has = !!(proposal.attachment_kind);
    const docId = escapeHTML(proposal.id);

    if (has) {
        // State B — attachment exists
        const isLink = proposal.attachment_kind === 'link';
        const url = proposal.attachment_url || '';
        const filename = proposal.attachment_filename || '';
        let displayLabel = '';
        if (isLink) {
            try {
                displayLabel = new URL(url).hostname;
            } catch {
                displayLabel = 'View link';
            }
        } else {
            displayLabel = filename || 'Download file';
        }
        const linkLabel = isLink ? 'Attached link' : 'Attached file';
        return `
            <div id="proposalAttachmentWidget" style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;margin-bottom:1.5rem;">
                <div style="font-size:13px;color:#64748b;margin-bottom:6px;">${escapeHTML(linkLabel)}</div>
                <div style="font-size:14px;color:#1e293b;margin-bottom:8px;">
                    <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">${escapeHTML(displayLabel)}</a>
                </div>
                <div id="proposalAttachmentActions" style="display:flex;gap:8px;">
                    <button class="btn btn-sm btn-outline" onclick="window._openProposalAttachmentReplace('${docId}')">Replace</button>
                    <button class="btn btn-sm" style="color:#ea4335;border:1px solid #ea4335;background:white;" onclick="window._openProposalAttachmentRemoveConfirm('${docId}')">Remove</button>
                </div>
                <div id="proposalAttachmentRemoveConfirm" style="display:none;margin-top:8px;padding:8px;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;">
                    <div style="font-size:13px;color:#1e293b;margin-bottom:6px;">Remove this attachment? This cannot be undone.</div>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-sm btn-danger" onclick="window.removeProposalAttachment('${docId}')">Yes, remove</button>
                        <button class="btn btn-sm btn-outline" onclick="document.getElementById('proposalAttachmentRemoveConfirm').style.display='none';">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }

    // State A — no attachment yet (also used for Replace mode)
    return `
        <div id="proposalAttachmentWidget" style="border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;margin-bottom:1.5rem;">
            <div style="font-size:13px;color:#64748b;margin-bottom:8px;">Attachment</div>
            <div id="proposalAttachmentLinkInput" style="margin-bottom:8px;">
                <input type="url" id="proposalAttachmentUrl"
                       placeholder="https://drive.google.com/..."
                       style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;">
            </div>
            <div id="proposalAttachmentError" style="display:none;color:#ea4335;font-size:13px;margin-bottom:8px;"></div>
            <button class="btn btn-sm btn-outline" onclick="window.saveProposalAttachment('${docId}')">Save Attachment</button>
        </div>
    `;
}

// ============================================================
// Comms Log rendering
// ============================================================

function _renderCommsTypeBadge(type) {
    const meta = COMMS_TYPE_META[type] || { label: type || '—', cls: 'badge-secondary' };
    return `<span class="${meta.cls}" style="font-size:12px;padding:2px 8px;border-radius:4px;">${escapeHTML(meta.label)}</span>`;
}

function _renderCommsEntry(entry) {
    const dateLabel = entry.date || '—';
    const descSafe = escapeHTML(entry.description || '');
    let attachmentHtml = '';
    if (entry.attachment_kind === 'link' && entry.attachment_url) {
        let dom = 'View link';
        try { dom = new URL(entry.attachment_url).hostname; } catch {}
        attachmentHtml = `<div style="font-size:13px;margin-top:4px;"><a href="${escapeHTML(entry.attachment_url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">${escapeHTML(dom)}</a></div>`;
    } else if (entry.attachment_kind === 'file' && entry.attachment_url) {
        attachmentHtml = `<div style="font-size:13px;margin-top:4px;"><a href="${escapeHTML(entry.attachment_url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;">${escapeHTML(entry.attachment_filename || 'Download file')}</a></div>`;
    }
    return `
        <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
                <div>
                    <span style="font-size:13px;color:#475569;">${escapeHTML(dateLabel)}</span>
                    <span style="margin:0 8px;color:#cbd5e1;">·</span>
                    ${_renderCommsTypeBadge(entry.type)}
                </div>
                <div style="font-size:13px;color:#64748b;text-align:right;">by ${escapeHTML(entry.actor_name || entry.logged_by_name || '—')}</div>
            </div>
            <div style="font-size:14px;color:#1e293b;line-height:1.5;white-space:pre-wrap;">${descSafe}</div>
            ${attachmentHtml}
        </div>
    `;
}

function buildCommsLogSection(proposal) {
    const entries = (proposal.comms_log || []).slice().sort((a, b) => {
        // Newest first by logged_at ISO string (string compare is correct for ISO 8601)
        const ad = (typeof a.logged_at === 'string') ? a.logged_at : (a.logged_at?.toDate?.()?.toISOString?.() || '');
        const bd = (typeof b.logged_at === 'string') ? b.logged_at : (b.logged_at?.toDate?.()?.toISOString?.() || '');
        return bd.localeCompare(ad);
    });
    const entriesHtml = entries.length === 0
        ? `<div style="font-size:13px;color:#64748b;padding:8px 0;">No communications logged yet. Use + Add Entry to record client contact.</div>`
        : entries.map(e => _renderCommsEntry(e)).join('');

    const docId = escapeHTML(proposal.id);
    const today = new Date().toISOString().slice(0, 10);

    return `
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <h3 style="font-size:14px;font-weight:600;color:#1e293b;margin:0;">Client Communications</h3>
                <button id="proposalCommsAddBtn" class="btn btn-sm btn-outline" onclick="window.toggleAddCommsForm('${docId}')">+ Add Entry</button>
            </div>
            ${entriesHtml}
            <!-- Inline Add Entry form (collapsed by default) -->
            <div id="proposalCommsAddForm" style="display:none;margin-top:1rem;border:1px solid #e2e8f0;border-radius:6px;padding:12px;background:#f8fafc;">
                <div style="margin-bottom:8px;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.25rem;">Date <span style="color:#ef4444;">*</span></label>
                    <input type="date" id="proposalCommsDate" value="${today}" style="padding:0.375rem 0.5rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;">
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.25rem;">Type <span style="color:#ef4444;">*</span></label>
                    <select id="proposalCommsType" style="width:100%;padding:0.375rem 0.5rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;background:white;">
                        <option value="sent">Sent</option>
                        <option value="feedback_received">Feedback Received</option>
                        <option value="revision_requested">Revision Requested</option>
                    </select>
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.25rem;">Description <span style="color:#ef4444;">*</span></label>
                    <textarea id="proposalCommsDescription" rows="3" placeholder="Describe the communication..." style="width:100%;min-height:64px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
                </div>
                <div style="margin-bottom:8px;">
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.25rem;">Attachment <span style="color:#64748b;font-weight:400;">(optional)</span></label>
                    <div style="margin-bottom:6px;">
                        <input type="url" id="proposalCommsAttachmentUrl" placeholder="https://... (optional)" style="width:100%;padding:0.375rem 0.5rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;">
                    </div>
                </div>
                <div id="proposalCommsError" style="display:none;color:#ea4335;font-size:13px;margin-bottom:8px;"></div>
                <div style="display:flex;justify-content:flex-end;gap:6px;">
                    <button class="btn btn-sm btn-outline" onclick="window.toggleAddCommsForm('${docId}')">Cancel</button>
                    <button class="btn btn-sm btn-primary" onclick="window.saveCommsEntry('${docId}')">Add Entry</button>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Re-render detail modal after a transition
// ============================================================

/**
 * After a state transition succeeds, re-render the detail modal (if open) with
 * the latest doc state. Unlike the proposals.js version (which reads from the
 * onSnapshot-backed proposalsData array), this fetches fresh from Firestore.
 */
async function _refreshDetailModalAfterTransition(proposalDocId) {
    try {
        const refreshed = await _fetchProposalDoc(proposalDocId);
        if (!refreshed) return;
        currentProposal = refreshed;
        const existing = document.getElementById('proposalDetailModal');
        if (existing) {
            existing.remove();
            document.body.insertAdjacentHTML('beforeend', buildProposalDetailModalHtml(refreshed));
        }
    } catch (err) {
        console.error('[ProposalModal] _refreshDetailModalAfterTransition failed:', err);
    }
}

// ============================================================
// Create / Edit Proposal sub-modal
// ============================================================

async function openCreateProposalModal() {
    createModalMode = 'create';
    createModalEditingId = null;
    await _loadModalDropdownData();
    showCreateModal(null);
}

async function openEditProposalModal(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) {
        showToast('Proposal not found.', 'error');
        return;
    }
    createModalMode = 'edit';
    createModalEditingId = proposalDocId;
    await _loadModalDropdownData();
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

    // Build project <option> list from cached _modalProjectsData
    const projectOptions = _modalProjectsData.map(p => {
        const sel = (p.id === currentProjectId) ? 'selected' : '';
        const label = p.project_code
            ? `${escapeHTML(p.project_code)} — ${escapeHTML(p.project_name || '')}`
            : escapeHTML(p.project_name || '');
        return `<option value="${escapeHTML(p.id)}" data-code="${escapeHTML(p.project_code || '')}" data-name="${escapeHTML(p.project_name || '')}" ${sel}>${label}</option>`;
    }).join('');

    const clientOptions = _modalClientsData.map(c => {
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

    // Resolve denormalized fields from cached dropdown data
    const project = _modalProjectsData.find(p => p.id === projectId);
    const projectCode = project?.project_code || null;
    const client = clientId ? _modalClientsData.find(c => c.id === clientId) : null;
    const clientName = client?.client_name || null;

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    showLoading(true);
    try {
        if (createModalMode === 'edit' && createModalEditingId) {
            // EDIT mode: update title/description/amount/target_client_id/target_client_name only.
            await updateDoc(doc(db, 'proposals', createModalEditingId), {
                title,
                description: description || '',
                amount: (amount != null) ? amount : null,
                target_client_id: clientId || null,
                target_client_name: clientName,
                updated_at: serverTimestamp()
            });
            const editingId = createModalEditingId;
            closeCreateProposalModal();
            // Refresh detail modal if open
            if (currentProposal && currentProposal.id === editingId) {
                await _refreshDetailModalAfterTransition(editingId);
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
        console.error('[ProposalModal] saveProposal failed:', err);
        showToast(err?.message || 'Failed to save. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Lifecycle transition: Submit for Internal Approval
// ============================================================

async function submitProposalForApproval(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (!['draft', 'for_revision'].includes(proposal.status)) {
        showToast('Cannot submit a proposal that is not in Draft or For Revision.', 'error');
        return;
    }

    showLoading(true);
    try {
        await _applyProposalStateTransition({
            proposal,
            newStatus: 'pending_internal',
            newProjectStatus: 'Proposal for Internal Approval',
            auditAction: 'SUBMITTED',
            auditComment: null
        });

        // NOTIF-09 — fan-out to all approvers
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
            console.error('[ProposalModal] NOTIF-09 failed:', notifErr);
        }

        showToast('Proposal submitted for internal approval. Approvers have been notified.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] submitProposalForApproval failed:', err);
        showToast(err?.message || 'Failed to submit proposal. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Lifecycle transition: Mark Sent to Client
// ============================================================

async function submitMarkSentToClient(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Mark Sent to Client is only available after the proposal is approved internally.', 'error');
        return;
    }

    showLoading(true);
    try {
        await _applyProposalStateTransition({
            proposal,
            newStatus: null,                  // stay in pending_client
            newProjectStatus: null,           // no project status change
            auditAction: 'SENT_TO_CLIENT',
            auditComment: null
        });
        showToast('Marked as sent to client.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] submitMarkSentToClient failed:', err);
        showToast(err?.message || 'Failed to mark as sent. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Approve / Reject sub-modals
// ============================================================

async function _openApproveOrRejectModal(proposalDocId, mode) {
    const proposal = await _fetchProposalDoc(proposalDocId);
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

async function submitProposalApproval(proposalDocId, mode) {
    const proposal = await _fetchProposalDoc(proposalDocId);
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
        await _applyProposalStateTransition({
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
            console.error('[ProposalModal] NOTIF-10 failed:', notifErr);
        }

        const sub = document.getElementById(modalId);
        if (sub) sub.remove();
        showToast(successToast, 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] submitProposalApproval failed:', err);
        showToast(err?.message || 'Failed to record decision. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Mark Loss sub-modal
// ============================================================

async function openLossModal(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
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
    const proposal = await _fetchProposalDoc(proposalDocId);
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
        await _applyProposalStateTransition({
            proposal,
            newStatus: 'loss',
            newProjectStatus: 'Loss',
            auditAction: 'LOSS_RECORDED',
            auditComment: reason,         // mirror loss_reason into audit comment
            extraProposalFields: { loss_reason: reason }
        });

        const sub = document.getElementById('proposalLossModal');
        if (sub) sub.remove();
        showToast('Proposal marked as Loss. Project status updated.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] submitLoss failed:', err);
        showToast(err?.message || 'Failed to record loss. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Client Approved sub-modal
// ============================================================

async function openClientApprovedModal(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
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
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Proposal status changed. Please reload.', 'error');
        return;
    }

    showLoading(true);
    try {
        await _applyProposalStateTransition({
            proposal,
            newStatus: 'client_approved',
            newProjectStatus: 'Client Approved',
            auditAction: 'CLIENT_APPROVED',
            auditComment: null
        });

        const sub = document.getElementById('proposalClientApprovedModal');
        if (sub) sub.remove();
        showToast('Proposal marked Client Approved. Project status updated.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] submitClientApproved failed:', err);
        showToast(err?.message || 'Failed to mark Client Approved. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Attachment widget action handlers
// ============================================================

function _openProposalAttachmentRemoveConfirm(proposalDocId) {
    const panel = document.getElementById('proposalAttachmentRemoveConfirm');
    if (panel) panel.style.display = 'block';
}

async function _openProposalAttachmentReplace(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) return;
    // Build a synthetic "no attachment" proposal for State A render
    const proposalForStateA = { ...proposal, attachment_kind: null };
    const widget = document.getElementById('proposalAttachmentWidget');
    if (widget) {
        widget.outerHTML = buildAttachmentSection(proposalForStateA);
    }
}

async function saveProposalAttachment(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }

    const errEl = document.getElementById('proposalAttachmentError');
    const setError = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    };
    const clearError = () => {
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    };
    clearError();

    const urlInput = document.getElementById('proposalAttachmentUrl');
    const url = (urlInput?.value || '').trim();
    if (!url) {
        setError('Please enter a URL.');
        return;
    }
    if (!/^https?:\/\//i.test(url)) {
        setError('URL must start with http:// or https://');
        return;
    }

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    const newAttachmentFields = {
        attachment_kind: 'link',
        attachment_url: url,
        attachment_storage_path: null,
        attachment_filename: null
    };

    showLoading(true);
    try {
        const newAuditEntry = {
            entry_id: cryptoRandomUuid(),
            ts: new Date().toISOString(),
            actor_id: actorUid,
            actor_name: actorName,
            action: 'ATTACHMENT_REPLACED',
            comment: null
        };

        await updateDoc(doc(db, 'proposals', proposalDocId), {
            ...newAttachmentFields,
            audit_log: [...(proposal.audit_log || []), newAuditEntry],
            updated_at: serverTimestamp()
        });

        showToast('Attachment saved.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] saveProposalAttachment failed:', err);
        showToast(err?.message || 'Failed to save attachment. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function removeProposalAttachment(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (!proposal.attachment_kind) {
        const panel = document.getElementById('proposalAttachmentRemoveConfirm');
        if (panel) panel.style.display = 'none';
        return;
    }

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    showLoading(true);
    try {
        const newAuditEntry = {
            entry_id: cryptoRandomUuid(),
            ts: new Date().toISOString(),
            actor_id: actorUid,
            actor_name: actorName,
            action: 'ATTACHMENT_REPLACED',
            comment: 'Attachment removed.'
        };
        const cleared = {
            attachment_kind: null,
            attachment_url: null,
            attachment_storage_path: null,
            attachment_filename: null
        };
        await updateDoc(doc(db, 'proposals', proposalDocId), {
            ...cleared,
            audit_log: [...(proposal.audit_log || []), newAuditEntry],
            updated_at: serverTimestamp()
        });
        showToast('Attachment removed.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] removeProposalAttachment failed:', err);
        showToast(err?.message || 'Failed to remove attachment. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Comms Log action handlers
// ============================================================

function toggleAddCommsForm(proposalDocId) {
    const form = document.getElementById('proposalCommsAddForm');
    const btn = document.getElementById('proposalCommsAddBtn');
    if (!form || !btn) return;
    const isOpen = form.style.display === 'block';
    if (isOpen) {
        form.style.display = 'none';
        btn.textContent = '+ Add Entry';
        const urlInput = document.getElementById('proposalCommsAttachmentUrl');
        if (urlInput) urlInput.value = '';
    } else {
        form.style.display = 'block';
        btn.textContent = 'Cancel';
    }
}

async function saveCommsEntry(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }

    const errEl = document.getElementById('proposalCommsError');
    const setError = (msg) => {
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    };
    const clearError = () => {
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    };
    clearError();

    const date = (document.getElementById('proposalCommsDate')?.value || '').trim();
    const type = document.getElementById('proposalCommsType')?.value || '';
    const description = (document.getElementById('proposalCommsDescription')?.value || '').trim();

    if (!date) { setError('Date is required.'); return; }
    if (!type || !['sent', 'feedback_received', 'revision_requested'].includes(type)) {
        setError('Please choose a Type.');
        return;
    }
    if (!description) { setError('Description is required.'); return; }

    const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const actorUid = currentUser?.uid ?? null;
    const actorName = currentUser?.full_name || 'Unknown';

    const entryId = cryptoRandomUuid();
    const rawUrl = (document.getElementById('proposalCommsAttachmentUrl')?.value || '').trim();
    let attachmentFields = {
        attachment_kind: null,
        attachment_url: null,
        attachment_storage_path: null,
        attachment_filename: null
    };

    showLoading(true);
    try {
        if (rawUrl) {
            if (!/^https?:\/\//i.test(rawUrl)) {
                setError('URL must start with http:// or https://');
                showLoading(false);
                return;
            }
            attachmentFields = {
                attachment_kind: 'link',
                attachment_url: rawUrl,
                attachment_storage_path: null,
                attachment_filename: null
            };
        }

        const newEntry = {
            entry_id: entryId,
            date,
            type,
            description,
            ...attachmentFields,
            logged_by: actorUid,
            logged_by_name: actorName,
            logged_at: new Date().toISOString()
        };

        await updateDoc(doc(db, 'proposals', proposalDocId), {
            comms_log: [...(proposal.comms_log || []), newEntry],
            updated_at: serverTimestamp()
        });

        showToast('Communication entry added.', 'success');
        // Collapse the form
        const form = document.getElementById('proposalCommsAddForm');
        const btn = document.getElementById('proposalCommsAddBtn');
        if (form) form.style.display = 'none';
        if (btn) btn.textContent = '+ Add Entry';

        // Re-render the detail modal with the new entry (fresh fetch)
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] saveCommsEntry failed:', err);
        showToast(err?.message || 'Failed to save communication entry. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================
// Public exports
// ============================================================

/**
 * Open the full Proposal Detail modal for a given Firestore proposal doc ID.
 *
 * Fetches the proposal fresh via getDoc (does NOT depend on any module-level
 * proposalsData array) and registers all modal-related window functions so
 * inline onclick handlers in the modal HTML resolve correctly.
 *
 * @param {string} proposalId  Firestore document ID of the proposal
 * @param {object} [context]   Optional caller context (reserved for future use;
 *                              e.g., { parentCollection: 'projects'|'services' })
 */
export async function openProposalModal(proposalId, context) {
    if (!proposalId) {
        showToast('No proposal ID provided.', 'error');
        return;
    }

    const proposal = await _fetchProposalDoc(proposalId);
    if (!proposal) {
        showToast('Proposal not found.', 'error');
        return;
    }
    currentProposal = proposal;

    // Remove any pre-existing instance of the modal (e.g., user re-opened
    // before closing) so we don't end up with duplicate IDs in the DOM.
    const existing = document.getElementById('proposalDetailModal');
    if (existing) existing.remove();

    // Register ALL window functions needed by the modal's inline onclick handlers.
    // These are deleted in closeProposalModal() to avoid leaks across views.
    window.closeProposalDetailModal             = closeProposalModal;
    window.openCreateProposalModal              = openCreateProposalModal;
    window.openEditProposalModal                = openEditProposalModal;
    window.closeCreateProposalModal             = closeCreateProposalModal;
    window.saveProposal                         = saveProposal;
    window.submitProposalForApproval            = submitProposalForApproval;
    window.openApproveModal                     = (id) => _openApproveOrRejectModal(id, 'approve');
    window.openRejectModal                      = (id) => _openApproveOrRejectModal(id, 'reject');
    window.submitProposalApproval               = submitProposalApproval;
    window.submitMarkSentToClient               = submitMarkSentToClient;
    window.openLossModal                        = openLossModal;
    window.submitLoss                           = submitLoss;
    window.openClientApprovedModal              = openClientApprovedModal;
    window.submitClientApproved                 = submitClientApproved;
    window.saveProposalAttachment               = saveProposalAttachment;
    window.removeProposalAttachment             = removeProposalAttachment;
    window._openProposalAttachmentReplace       = _openProposalAttachmentReplace;
    window._openProposalAttachmentRemoveConfirm = _openProposalAttachmentRemoveConfirm;
    window.toggleAddCommsForm                   = toggleAddCommsForm;
    window.saveCommsEntry                       = saveCommsEntry;

    document.body.insertAdjacentHTML('beforeend', buildProposalDetailModalHtml(proposal));
}

/**
 * Close the Proposal Detail modal and clean up all window functions that
 * openProposalModal registered. Idempotent — safe to call when no modal is open.
 */
export function closeProposalModal() {
    const el = document.getElementById('proposalDetailModal');
    if (el) el.remove();
    currentProposal = null;

    // Delete every window function registered in openProposalModal().
    delete window.closeProposalDetailModal;
    delete window.openCreateProposalModal;
    delete window.openEditProposalModal;
    delete window.closeCreateProposalModal;
    delete window.saveProposal;
    delete window.submitProposalForApproval;
    delete window.openApproveModal;
    delete window.openRejectModal;
    delete window.submitProposalApproval;
    delete window.submitMarkSentToClient;
    delete window.openLossModal;
    delete window.submitLoss;
    delete window.openClientApprovedModal;
    delete window.submitClientApproved;
    delete window.saveProposalAttachment;
    delete window.removeProposalAttachment;
    delete window._openProposalAttachmentReplace;
    delete window._openProposalAttachmentRemoveConfirm;
    delete window.toggleAddCommsForm;
    delete window.saveCommsEntry;
}
