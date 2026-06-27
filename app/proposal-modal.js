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
    createNotificationForUsers,
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
let _createModalOnClose = null;    // optional callback fired by closeCreateProposalModal
let _createModalParentCollection = 'projects';  // 'projects' | 'services'
let _createModalLockedProjectCode = null;       // non-null when modal is locked to a service
let _modalProjectsData = [];       // active, non-Draft projects (for Create/Edit modal dropdown)
let _modalClientsData = [];        // active clients (for Create/Edit modal dropdown)
let _modalProjectsLoaded = false;  // one-shot getDocs cache flag

// Phase 87.2 D-06/D-07: cache the parent project/service doc so the synchronous
// renderProposalActionButtons gate can do role + assignment checks without an
// async lookup on every render. Populated in openProposalModal, cleared in
// closeProposalModal. Shape: { collection: 'projects'|'services', doc: {id, personnel_user_ids, ...} } | null
let _parentDocCache = null;

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
    REVISION_REQUESTED:   '#f59e0b',
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
    REVISION_REQUESTED:   'Revision Requested',
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
 * Phase 87.2 D-05/D-06/D-07 — Synchronous role + assignment check for the
 * proposal modal's Action Buttons gate. Returns { canApprove, canDrive }.
 *
 * canApprove  - may invoke Approve / Reject sub-modals.
 *   super_admin: always true
 *   operations_admin: true when parent_collection === 'projects' (D-09)
 *   services_admin: true when parent_collection === 'services' (D-09)
 *
 * canDrive    - may invoke Submit / Edit / Mark Sent / Client Approved /
 *               Mark as Loss / Request Revision.
 *   super_admin: always true
 *   operations_admin: true when parent_collection === 'projects' (D-06)
 *   services_admin: true when parent_collection === 'services' (D-06)
 *   operations_user: true when parent_collection === 'projects' AND caller uid
 *                    is in _parentDocCache.doc.personnel_user_ids (D-07)
 *   services_user: true when parent_collection === 'services' AND caller uid
 *                  is in _parentDocCache.doc.personnel_user_ids (D-07)
 *
 * canApprove implies canDrive (admins can do everything drivers can).
 *
 * Returns { canApprove: false, canDrive: false } if _parentDocCache is empty
 * (e.g., modal opened against a deleted parent doc - defensive default-deny).
 */
function _isCallerAttachedToProposalParent(proposal) {
    const cu = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const role = cu?.role || null;
    const parentCollection = proposal?.parent_collection || 'projects';
    const assigned = Array.isArray(_parentDocCache?.doc?.personnel_user_ids)
        ? _parentDocCache.doc.personnel_user_ids
        : [];
    const isAssigned = !!cu?.uid && assigned.includes(cu.uid);

    let canApprove = false;
    let canDrive   = false;

    if (role === 'super_admin') {
        canApprove = true;
        canDrive   = true;
    } else if (parentCollection === 'projects') {
        if (role === 'operations_admin') {
            canApprove = true;
            canDrive   = true;
        } else if ((role === 'operations_user' || role === 'services_user') && isAssigned) {
            // Quick 260627-kg0: an assigned cross-dept services_user drives a project-parented proposal.
            canApprove = false;
            canDrive   = true;
        }
    } else if (parentCollection === 'services') {
        if (role === 'services_admin') {
            canApprove = true;
            canDrive   = true;
        } else if ((role === 'services_user' || role === 'operations_user') && isAssigned) {
            // Quick 260627-kg0: an assigned cross-dept operations_user drives a service-parented proposal.
            canApprove = false;
            canDrive   = true;
        }
    }

    return { canApprove, canDrive };
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
            getDocs(collection(db, 'clients'))
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
            (a.client_code || a.company_name || '').localeCompare(b.client_code || b.company_name || '')
        );

        _modalProjectsLoaded = true;
    } catch (err) {
        console.error('[ProposalModal] _loadModalDropdownData failed:', err);
    }
}

// ============================================================
// Audit Trail rendering
// ============================================================

/**
 * Phase 87.2 D-21/D-22/D-23 — Group comms_log entries under the nearest
 * preceding SENT_TO_CLIENT audit entry. Returns an array of audit entries
 * in newest-first order, each augmented with a `children: commsEntry[]`
 * field listing the comms entries that belong to it (in OLDEST-first order
 * within the group per D-23).
 *
 * Algorithm:
 *   1. Sort audit_log oldest-first into auditAsc.
 *   2. Scan auditAsc; the CREATED entry is the initial "active parent".
 *      Each time a SENT_TO_CLIENT is encountered it becomes the new
 *      active parent. Each comms entry whose logged_at lies between the
 *      active parent's ts (or 0 for CREATED) and the NEXT SENT_TO_CLIENT
 *      (or +Infinity if none) attaches to the active parent.
 *   3. Sort each group's children oldest-first.
 *   4. Reverse the audit list back to newest-first for display.
 *
 * Comms entries with logged_at preceding the CREATED ts (impossible by
 * construction — CREATED is the first write) defensively attach to CREATED.
 */
function _buildAuditCommsGroups(auditLog, commsLog) {
    const audit = (auditLog || []).map(e => ({ ...e, children: [] }));
    const comms = (commsLog || []).slice();

    // Normalize ISO strings into millis for comparison. Audit ts is ISO string per
    // Phase 87 D-04; comms logged_at is ISO string per saveCommsEntry. Both can be
    // compared via Date.parse — undefined-safe via fallback to 0.
    const ms = (s) => {
        if (!s) return 0;
        if (typeof s === 'string') return Date.parse(s) || 0;
        if (s?.toMillis) return s.toMillis();
        if (s?.seconds) return s.seconds * 1000;
        return 0;
    };

    // Oldest-first scan
    audit.sort((a, b) => ms(a.ts) - ms(b.ts));

    // Identify the indices of SENT_TO_CLIENT entries (parents) and the CREATED entry.
    // CREATED is always the first audit entry by construction; we use index 0 as the
    // fallback parent when no SENT_TO_CLIENT precedes a comms entry.
    if (audit.length === 0) {
        // Edge case: empty audit_log (shouldn't happen if CREATED is always written,
        // but be defensive). Synthesize a single placeholder bucket for comms.
        return comms.length === 0
            ? []
            : [{ entry_id: 'synthetic-created', action: 'CREATED', ts: null, actor_name: '-',
                 comment: null, children: comms.slice().sort((a, b) => ms(a.logged_at) - ms(b.logged_at)) }];
    }

    comms.forEach(c => {
        const cMs = ms(c.logged_at);
        // Walk audit oldest-first; pick the index of the latest entry that is either
        // CREATED (idx 0) or SENT_TO_CLIENT, whose ts <= cMs.
        let parentIdx = 0;  // CREATED fallback
        for (let i = 0; i < audit.length; i++) {
            const aMs = ms(audit[i].ts);
            if (aMs > cMs) break;  // future audit entry — stop scanning
            if (i === 0 || audit[i].action === 'SENT_TO_CLIENT') {
                parentIdx = i;
            }
        }
        audit[parentIdx].children.push(c);
    });

    // Sort each group's children oldest-first per D-23
    audit.forEach(a => {
        a.children.sort((x, y) => ms(x.logged_at) - ms(y.logged_at));
    });

    // Flip back to newest-first for display per D-23 (trail-level newest-first)
    audit.reverse();
    return audit;
}

/**
 * Phase 87.2 D-25 — Render a single comms_log entry as an indented child
 * under its parent audit entry. Visual treatment per CONTEXT discretion:
 *   - 24px left padding relative to parent
 *   - 12px font (vs 13px for audit entries)
 *   - Gray dot (#94a3b8) to distinguish from colored audit-action dots
 *   - Type pill via COMMS_TYPE_META.cls; description truncated to ~120 chars
 *   - logged_by_name + relative date in muted color
 */
function _renderNestedCommsChild(c) {
    const meta = COMMS_TYPE_META[c.type] || { label: c.type || 'Comms', cls: 'badge-primary' };
    const desc = (c.description || '').trim();
    const descShort = desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
    const tsLabel = c.logged_at ? formatTimestamp(c.logged_at) : (c.date || '');
    return `
        <div style="position:relative;padding-left:24px;padding-top:6px;padding-bottom:6px;font-size:12px;color:#1e293b;">
            <div style="position:absolute;left:4px;top:10px;width:6px;height:6px;border-radius:50%;background:#94a3b8;"></div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                <span class="${escapeHTML(meta.cls)}" style="font-size:11px;padding:1px 6px;border-radius:4px;">${escapeHTML(meta.label)}</span>
                <span style="color:#64748b;">${escapeHTML(tsLabel)} · ${escapeHTML(c.logged_by_name || '—')}</span>
            </div>
            ${descShort ? `<div style="color:#1e293b;line-height:1.4;">${escapeHTML(descShort)}</div>` : ''}
        </div>
    `;
}

function renderAuditTrail(proposal) {
    // Phase 87.2 D-21/D-22: merge audit_log + comms_log into grouped structure.
    const grouped = _buildAuditCommsGroups(proposal.audit_log, proposal.comms_log);
    if (grouped.length === 0) {
        return `<div style="color:#64748b;font-size:13px;">No audit entries.</div>`;
    }

    const itemsHtml = grouped.map((e, idx) => {
        const dotColor = AUDIT_ACTION_DOT_COLORS[e.action] || '#64748b';
        const label = AUDIT_ACTION_LABELS[e.action] || (e.action || 'Unknown');
        const tsLabel = e.ts ? formatTimestamp(e.ts) : '';
        const commentHtml = e.comment
            ? `<div style="font-size:13px;color:#1e293b;font-style:italic;margin-top:4px;">${escapeHTML(e.comment)}</div>`
            : '';
        const connector = idx < grouped.length - 1
            ? `<div style="position:absolute;left:3px;top:12px;bottom:-8px;width:1px;background:#e2e8f0;"></div>`
            : '';
        const childrenHtml = (e.children && e.children.length > 0)
            ? `<div style="margin-top:6px;">${e.children.map(c => _renderNestedCommsChild(c)).join('')}</div>`
            : '';
        return `
            <div style="position:relative;padding-left:20px;padding-bottom:12px;">
                <div style="position:absolute;left:0;top:4px;width:8px;height:8px;border-radius:50%;background:${dotColor};"></div>
                ${connector}
                <div style="font-size:13px;font-weight:600;color:#1e293b;">${escapeHTML(label)}</div>
                <div style="font-size:13px;color:#64748b;">${escapeHTML(tsLabel)} · ${escapeHTML(e.actor_name || '—')}</div>
                ${commentHtml}
                ${childrenHtml}
            </div>
        `;
    }).join('');
    return itemsHtml;
}

// ============================================================
// Proposal Detail modal HTML builders
// ============================================================

function renderProposalActionButtons(proposal) {
    // Phase 87.2 D-05/D-06/D-07/D-08/D-09 — Dual-flag gating.
    const { canApprove, canDrive } = _isCallerAttachedToProposalParent(proposal);
    const status = proposal.status || 'draft';
    const docId = escapeHTML(proposal.id);

    let buttons = [];

    if (status === 'draft' || status === 'for_revision') {
        if (canDrive) {
            // Phase 87.4 D-01/D-02 — Attachment-required gate on Submit for Internal Approval.
            // When attachment_kind is unset, render Submit as disabled with an inline muted
            // hint directly beneath. Wrapped in a single column-flex div so the button + hint
            // count as ONE entry in the outer buttons array (preserves outer gap:8px spacing
            // between distinct action affordances). The global .btn:disabled rule in
            // styles/components.css:179 supplies the faded look (opacity:0.5;cursor:not-allowed),
            // so no inline override is needed on the disabled button. Edit Proposal stays
            // enabled regardless of attachment state.
            const hasAttachment = !!proposal.attachment_kind;
            if (hasAttachment) {
                buttons.push(`<button class="btn btn-primary" style="width:100%;" onclick="window.submitProposalForApproval('${docId}')">Submit for Internal Approval</button>`);
            } else {
                buttons.push(`<div style="display:flex;flex-direction:column;gap:4px;"><button class="btn btn-primary" style="width:100%;" disabled onclick="window.submitProposalForApproval('${docId}')">Submit for Internal Approval</button><div style="font-size:12px;color:#64748b;margin-top:4px;text-align:center;">Add an attachment to submit for approval.</div></div>`);
            }
            buttons.push(`<button class="btn btn-outline" style="width:100%;" onclick="window.openEditProposalModal('${docId}')">Edit Proposal</button>`);
        }
    }
    if (status === 'for_revision' && canDrive) {
        // Phase 87.2 D-12: Mark Sent to Client also available at for_revision (additive — draft/for_revision block above already pushed Submit+Edit)
        buttons.push(`<button class="btn btn-outline" style="width:100%;" onclick="window.submitMarkSentToClient('${docId}')">Mark Sent to Client</button>`);
    } else if (status === 'pending_internal') {
        if (canApprove) {
            buttons.push(`<button class="btn btn-success" style="width:100%;" onclick="window.openApproveModal('${docId}')">Approve Proposal</button>`);
            buttons.push(`<button class="btn btn-danger" style="width:100%;" onclick="window.openRejectModal('${docId}')">Reject Proposal</button>`);
        }
    } else if (status === 'pending_client') {
        if (canDrive) {
            buttons.push(`<button class="btn btn-outline" style="width:100%;" onclick="window.submitMarkSentToClient('${docId}')">Mark Sent to Client</button>`);
            buttons.push(`<button class="btn btn-success" style="width:100%;" onclick="window.openClientApprovedModal('${docId}')">Client Approved</button>`);
            buttons.push(`<button class="btn btn-danger" style="width:100%;" onclick="window.openLossModal('${docId}')">Mark as Loss</button>`);
            // Phase 87.2 D-11: Request Revision button — backward transition, last in list
            // Phase 87.4 D-08/D-09/D-10 — Recolored from the red destructive class to inline
            // orange #f59e0b with white text, matching AUDIT_ACTION_DOT_COLORS.REVISION_REQUESTED
            // (line 98) so the button color and the resulting audit-trail dot read as visually
            // consistent. The red destructive class is now reserved exclusively for Reject
            // Proposal + Mark as Loss. The inline-style approach is mandated: the warning class
            // resolves to yellow #fbbc04 with dark text (styles/main.css:16 +
            // styles/components.css:217-220), which violates D-08's mandate of #f59e0b orange
            // + white text.
            buttons.push(`<button class="btn" style="background:#f59e0b;color:#fff;border-color:#f59e0b;width:100%;" onclick="window.openRequestRevisionModal('${docId}')">Request Revision</button>`);
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
    // Phase 87.4 D-11/D-12/D-14 — Removed the dead Version field entirely (no schema, no
    // versioning concept exists in the proposal model; the hardcoded "v1" was misleading
    // dead UI). Adjusted the grid from 2-column to 3-column (Strategy A from the plan) so
    // the freed cell does not leave a visible hole — the bottom row now reads symmetrically
    // as Amount | Target Client | Project. Title and Description retain grid-column:1/-1
    // and span all three columns. Per D-14, no proposal-doc field of the removed name is
    // referenced anywhere in this function.
    return `
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:1rem;margin-bottom:1.5rem;">
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

export async function openCreateProposalModal(preselectedProjectId = null, onClose = null, parentCollection = 'projects', lockedProjectCode = null) {
    createModalMode = 'create';
    createModalEditingId = null;
    _createModalOnClose = onClose;
    _createModalParentCollection = parentCollection;
    _createModalLockedProjectCode = lockedProjectCode;
    await _loadModalDropdownData();
    showCreateModal(null);
    if (preselectedProjectId) {
        const projectSelectEl = document.getElementById('proposalCreateProject');
        if (projectSelectEl) {
            if (lockedProjectCode) {
                const syntheticOpt = document.createElement('option');
                syntheticOpt.value = preselectedProjectId;
                syntheticOpt.textContent = lockedProjectCode + ' (Service)';
                projectSelectEl.insertBefore(syntheticOpt, projectSelectEl.firstChild);
            }
            projectSelectEl.value = preselectedProjectId;
            projectSelectEl.disabled = true;
            projectSelectEl.dispatchEvent(new Event('change'));
        }
    }
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
            ? `${escapeHTML(c.client_code)} — ${escapeHTML(c.company_name || '')}`
            : escapeHTML(c.company_name || '');
        return `<option value="${escapeHTML(c.id)}" data-name="${escapeHTML(c.company_name || '')}" ${sel}>${label}</option>`;
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
    window.closeCreateProposalModal = closeCreateProposalModal;
    window.saveProposal             = saveProposal;
    document.body.insertAdjacentHTML('beforeend', html);

    // Phase 87.2 D-01/D-04: when the user changes the project dropdown, auto-select
    // the picked project's parent client in the Target Client dropdown. User can
    // still manually override before saving. Not fired on initial render — `change`
    // only fires on user interaction, so edit-mode existing target_client_id is
    // preserved per D-04.
    const projectSelectEl = document.getElementById('proposalCreateProject');
    const clientSelectEl  = document.getElementById('proposalCreateClient');
    if (projectSelectEl && clientSelectEl) {
        projectSelectEl.addEventListener('change', () => {
            const pid = projectSelectEl.value;
            if (!pid) return;
            const project = _modalProjectsData.find(p => p.id === pid);
            const parentClientId = project?.client_id || '';
            // Only set if the option exists in the client dropdown (legacy clientless
            // projects have client_id === null; leave the dropdown alone in that case).
            if (parentClientId && clientSelectEl.querySelector(`option[value="${parentClientId}"]`)) {
                clientSelectEl.value = parentClientId;
            }
        });
    }
}

function closeCreateProposalModal() {
    const el = document.getElementById('proposalCreateModal');
    if (el) el.remove();
    delete window.closeCreateProposalModal;
    delete window.saveProposal;
    createModalMode = 'create';
    createModalEditingId = null;
    _createModalParentCollection = 'projects';
    _createModalLockedProjectCode = null;
    const cb = _createModalOnClose;
    _createModalOnClose = null;
    if (typeof cb === 'function') cb();
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
    const projectCode = project?.project_code || _createModalLockedProjectCode || null;
    const client = clientId ? _modalClientsData.find(c => c.id === clientId) : null;
    const clientName = client?.company_name || null;

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
            // CREATE mode: mint PROPOSAL ID, build full doc, write to Firestore.
            const proposalId = await generateProposalId(client?.client_code || null);
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
                parent_collection: _createModalParentCollection,
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
    // Phase 87.4 D-05 — Belt-and-suspenders guard: catches stale-state clicks where the
    // disabled-button UI was bypassed (e.g., DevTools re-enable, or attachment removed
    // between render and click). Toast copy is intentionally distinct from the inline hint
    // so the user can tell which defense layer fired (inline hint is preventive; toast is
    // reactive after a stale-state click).
    if (!proposal.attachment_kind) {
        showToast('Add an attachment before submitting for approval.', 'error');
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
                link: `#/`,  // B1: #/proposals route retired (Phase 87.1 D-02) — proposal surfaces are home sub-tabs
                source_collection: 'proposals',
                source_id: proposal.proposal_id,
                object_name: proposal.title,
                actor_name: actorName,
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
    if (proposal.status !== 'pending_client' && proposal.status !== 'for_revision') {
        showToast('Mark Sent to Client is only available after internal approval or while in revision.', 'error');
        return;
    }

    const isResend = (proposal.status === 'for_revision');
    // Phase 87.2 D-12/D-14: when resending after revision, advance status forward.
    // When already in pending_client, this is a no-op-status audit-only event.
    const transitionArgs = isResend
        ? {
            proposal,
            newStatus: 'pending_client',
            newProjectStatus: 'Proposal Under Client Review',
            auditAction: 'SENT_TO_CLIENT',
            auditComment: null
        }
        : {
            proposal,
            newStatus: null,
            newProjectStatus: null,
            auditAction: 'SENT_TO_CLIENT',
            auditComment: null
        };

    showLoading(true);
    try {
        await _applyProposalStateTransition(transitionArgs);
        showToast(isResend ? 'Resent to client. Proposal back under client review.' : 'Marked as sent to client.', 'success');
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
                    link: `#/`,  // B1: #/proposals route retired (Phase 87.1 D-02) — proposal surfaces are home sub-tabs
                    source_collection: 'proposals',
                    source_id: proposal.proposal_id,
                    object_name: proposal.title,
                    actor_name: window.getCurrentUser?.()?.full_name || 'System'
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

// NOTIF-11 (audit gap B2) — when a proposal transition drives the parent project/
// service into a status the NOTIF-11 whitelist covers (Client Approved / Loss here),
// notify the parent's assigned personnel — mirroring the saveField + Mark-as-Loss
// NOTIF-11 paths so proposal-driven status changes reach personnel too. Fire-and-forget.
const NOTIF11_STATUS_WHITELIST = ['Client Approved', 'For Mobilization', 'On-going', 'Completed', 'Loss'];
async function _notifyParentStatusChange(proposal, newProjectStatus) {
    if (!NOTIF11_STATUS_WHITELIST.includes(newProjectStatus)) return;
    // Parent doc (carrying personnel_user_ids) is cached while the detail modal is open.
    const parent = (_parentDocCache?.doc && _parentDocCache.doc.id === proposal.project_id)
        ? _parentDocCache.doc : null;
    const recipients = (parent?.personnel_user_ids || []).filter(Boolean);
    if (recipients.length === 0) return;
    const isService = (proposal.parent_collection || 'projects') === 'services';
    const name = (isService ? parent.service_name : parent.project_name) || proposal.project_name || (isService ? 'Service' : 'Project');
    const code = (isService ? parent.service_code : parent.project_code) || proposal.project_code;
    const base = isService ? 'services' : 'projects';
    await createNotificationForUsers({
        user_ids: recipients,
        type: NOTIFICATION_TYPES.PROJECT_STATUS_CHANGED,
        message: `${isService ? 'Service' : 'Project'} "${name}" status changed to: ${newProjectStatus}`,
        link: code ? `#/${base}/detail/${code}` : `#/${base}`,
        source_collection: base,
        source_id: code || proposal.project_id,
        object_name: name,
        actor_name: window.getCurrentUser?.()?.full_name || 'System'
    });
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
        // NOTIF-11 (B2) — proposal-driven Loss notifies assigned personnel
        _notifyParentStatusChange(proposal, 'Loss')
            .catch(err => console.error('[ProposalModal] NOTIF-11 (loss) failed:', err));

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
// Request Revision sub-modal (Phase 87.2 D-11)
// ============================================================

async function openRequestRevisionModal(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Request Revision is only available while the proposal is under client review.', 'error');
        return;
    }

    const existing = document.getElementById('proposalRequestRevisionModal');
    if (existing) existing.remove();

    const html = `
    <div id="proposalRequestRevisionModal" class="modal" style="display:flex;z-index:1001;">
        <div class="modal-content" style="max-width:480px;margin:auto;">
            <div class="modal-header">
                <h2 style="font-size:1.125rem;font-weight:600;margin:0;">Request Revision</h2>
                <button class="modal-close" aria-label="Close" onclick="document.getElementById('proposalRequestRevisionModal').remove()">&times;</button>
            </div>
            <div class="modal-body" style="padding:1.5rem;">
                <p style="color:#475569;margin:0 0 1rem 0;font-size:14px;line-height:1.5;">This will move the proposal to "For Revision" so you can edit and resend. The project status updates to "For Revision" and the change is recorded in the audit trail.</p>
                <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">Comment <span style="color:#64748b;font-weight:400;">(optional)</span></label>
                <textarea id="proposalRequestRevisionComment" rows="3" placeholder="Describe what the client asked to be revised..." style="width:100%;min-height:80px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
            </div>
            <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                <button class="btn btn-outline" onclick="document.getElementById('proposalRequestRevisionModal').remove()">Cancel</button>
                <button class="btn btn-primary" onclick="window.confirmRequestRevision('${escapeHTML(proposalDocId)}')">Confirm</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function confirmRequestRevision(proposalDocId) {
    const proposal = await _fetchProposalDoc(proposalDocId);
    if (!proposal) { showToast('Proposal not found.', 'error'); return; }
    if (proposal.status !== 'pending_client') {
        showToast('Proposal status changed. Please reload.', 'error');
        return;
    }

    const commentEl = document.getElementById('proposalRequestRevisionComment');
    const comment = (commentEl?.value || '').trim() || null;

    showLoading(true);
    try {
        await _applyProposalStateTransition({
            proposal,
            newStatus: 'for_revision',
            newProjectStatus: 'For Revision',
            auditAction: 'REVISION_REQUESTED',
            auditComment: comment
        });

        const sub = document.getElementById('proposalRequestRevisionModal');
        if (sub) sub.remove();
        showToast('Revision requested. Proposal moved to For Revision.', 'success');
        await _refreshDetailModalAfterTransition(proposalDocId);
    } catch (err) {
        console.error('[ProposalModal] confirmRequestRevision failed:', err);
        showToast(err?.message || 'Failed to request revision. Please try again.', 'error');
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
        // NOTIF-11 (B2) — proposal-driven Client Approved notifies assigned personnel
        _notifyParentStatusChange(proposal, 'Client Approved')
            .catch(err => console.error('[ProposalModal] NOTIF-11 (client approved) failed:', err));

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

    // Phase 87.2 D-06/D-07 - Preload the parent project/service doc so the
    // synchronous renderProposalActionButtons gate can check assignment without
    // an async lookup on every render. Single getDoc per modal open.
    try {
        const parentColl = proposal.parent_collection || 'projects';
        const parentSnap = await getDoc(doc(db, parentColl, proposal.project_id));
        if (parentSnap.exists()) {
            _parentDocCache = { collection: parentColl, doc: { id: parentSnap.id, ...parentSnap.data() } };
        } else {
            _parentDocCache = null;
        }
    } catch (err) {
        console.error('[ProposalModal] parent-doc preload failed:', err);
        _parentDocCache = null;
    }

    // Remove any pre-existing instance of the modal (e.g., user re-opened
    // before closing) so we don't end up with duplicate IDs in the DOM.
    const existing = document.getElementById('proposalDetailModal');
    if (existing) existing.remove();

    // Register ALL window functions needed by the modal's inline onclick handlers.
    // These are deleted in closeProposalModal() to avoid leaks across views.
    window.closeProposalDetailModal             = closeProposalModal;
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
    window.openRequestRevisionModal             = openRequestRevisionModal;
    window.confirmRequestRevision               = confirmRequestRevision;
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
    _parentDocCache = null;

    // Delete every window function registered in openProposalModal().
    delete window.closeProposalDetailModal;
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
    delete window.openRequestRevisionModal;
    delete window.confirmRequestRevision;
    delete window.saveProposalAttachment;
    delete window.removeProposalAttachment;
    delete window._openProposalAttachmentReplace;
    delete window._openProposalAttachmentRemoveConfirm;
    delete window.toggleAddCommsForm;
    delete window.saveCommsEntry;
}
