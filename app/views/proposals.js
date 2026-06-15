/* ========================================
   PROPOSALS — Pure shared module (Phase 87.1)

   This file used to be a routed view backing the standalone /proposals tab.
   That tab was retired in Phase 87.1 (D-02): proposal surfaces now live as
   home sub-tabs (Engagements + Proposals) and inline cards on project/service
   detail. The proposal detail modal (with audit log, comms log, attachment
   widget, and all lifecycle action handlers) moved to app/proposal-modal.js
   in Plan 02; the Create Engagement form moved to app/engagement-create.js
   in Plan 03. This file now exports only the shared constants, badge/age
   helpers, the stage-group renderer, and the writeBatch state-transition
   helper consumed by:

     - app/views/home.js               (Proposals sub-tab dashboard + queue)
     - app/proposal-modal.js           (detail modal + lifecycle actions)
     - app/views/project-detail.js     (inline proposal card)
     - app/views/service-detail.js     (inline proposal card)

   render() / init() / destroy() remain as no-op stubs so any straggling
   caller (test harness, dynamic import) gets a defined function rather
   than a runtime error. The router has no /proposals entry; this module
   is only consumed via static `import { … } from './proposals.js'`.
   ======================================== */

import { db, doc, writeBatch, serverTimestamp } from '../firebase.js';
import { escapeHTML, formatCurrency, cryptoRandomUuid } from '../utils.js';

// ----------------------------------------
// Module-level exported constants
// ----------------------------------------

/**
 * Proposal stage order for the Proposal Dashboard grouping (UI-SPEC order).
 * Drafts are rendered above this list by the consuming view.
 */
export const STAGE_ORDER = [
    { key: 'pending_internal', label: 'Pending Internal Approval' },
    { key: 'pending_client',   label: 'Pending Client Review' },
    { key: 'for_revision',     label: 'For Revision' },
    { key: 'client_approved',  label: 'Client Approved' },
    { key: 'loss',             label: 'Loss' }
];

/**
 * The set of unified project/service statuses that indicate a record is inside
 * the active proposal lifecycle (between "For Proposal" entry and the
 * "Client Approved" / "Loss" terminal states).
 * Used by project-detail.js and service-detail.js to decide whether to render
 * the inline proposal card.
 * Note: 'Draft' is intentionally excluded (no active proposal yet) and 'Loss'
 * is excluded (lifecycle complete).
 */
export const PROPOSAL_RANGE_STATUSES = [
    'For Proposal',
    'Proposal for Internal Approval',
    'Proposal Under Client Review',
    'For Revision',
    'Client Approved'
];

// ----------------------------------------
// Module state
// ----------------------------------------
// renderApprovalQueue reads from this array. There is no longer a Firestore
// listener inside this module that populates it — the home Proposals sub-tab
// implements its own local approval queue with fresh-fetch confirm path
// (see app/views/home.js _loadHomeProposalsTab + _renderHomeApprovalQueueHtml).
// proposalsData stays as an empty array so the renderApprovalQueue export
// remains callable without crashing for any external caller. The function
// will render the empty-state UI when called against this empty array.
let proposalsData = [];

// ----------------------------------------
// Lifecycle stubs — proposals.js is no longer a routed view (D-02). The
// router has no /proposals entry, so render/init/destroy are never invoked
// by the router. The stubs remain only as a defensive surface for any
// straggling caller (test harness, dynamic import).
// ----------------------------------------

export function render(activeTab = null, param = null) {
    return '';
}

export async function init(activeTab = null, param = null) {
    // Intentionally empty. The proposal lifecycle listeners that used to live
    // here (proposals + projects onSnapshot) and the ~21 window-function
    // registrations for the detail modal were retired in Phase 87.1 Plan 06.
    // Per-surface lifecycles now own their own listeners and window functions:
    //   - home.js Proposals sub-tab: one-time getDocs + local queue
    //   - proposal-modal.js: registers all detail-modal action window fns
    //     inside openProposalModal(), deletes them inside closeProposalModal()
}

export async function destroy() {
    // Intentionally empty. Symmetric with init() above.
}

// ============================================================
// Status badge + age helpers (consumed by home.js inline-card surfaces,
// proposal-modal.js, project-detail.js, service-detail.js)
// ============================================================

/**
 * Status → badge metadata mapping (UI-SPEC Color section).
 */
export function getProposalStatusBadge(status) {
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
 * Reads current_status_since (Firestore Timestamp) — set on every transition by _applyProposalStateTransition.
 */
export function getAgeInStageDays(proposal) {
    const ts = proposal.current_status_since || proposal.created_at;
    if (!ts) return 0;
    let ms;
    if (ts.toMillis) ms = ts.toMillis();
    else if (ts.seconds != null) ms = ts.seconds * 1000;
    else if (typeof ts === 'string') ms = Date.parse(ts);
    else return 0;
    return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

export function isOverdueInStage(proposal) {
    const THRESHOLD_DAYS = 7;
    return ['pending_internal', 'pending_client'].includes(proposal.status)
        && getAgeInStageDays(proposal) > THRESHOLD_DAYS;
}

export function renderAgeBadge(proposal) {
    const days = getAgeInStageDays(proposal);
    const label = days === 1 ? '1 day' : `${days} days`;
    if (isOverdueInStage(proposal)) {
        return `<span style="color:#856404;font-size:13px;">${escapeHTML(label)} — needs attention</span>`;
    }
    return `<span style="color:#64748b;font-size:13px;">${escapeHTML(label)}</span>`;
}

// ============================================================
// Stage-group card renderer (consumed by home.js Proposals sub-tab)
// ============================================================

/**
 * Single stage group card: header (label + count pill) + table of proposal rows.
 *
 * IMPORTANT: rows emit onclick handlers calling window.openProposalModal.
 * The consuming view must register window.openProposalModal before the
 * cards are rendered. Phase 87.1: home.js registers
 * window.openProposalModal = openProposalModal from app/proposal-modal.js
 * inside its init() lifecycle; project-detail.js and service-detail.js do
 * the same inside their attachWindowFunctions blocks. The onclick guards
 * (`window.openProposalModal && ...`) make the call safe if the function
 * has not yet been registered.
 */
export function renderStageGroupCard(label, proposals) {
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
                    <a href="#" onclick="event.preventDefault();window.openProposalModal && window.openProposalModal('${escapeHTML(p.id)}')"
                       style="font-size:13px;color:#1a73e8;text-decoration:none;font-weight:500;">${escapeHTML(p.proposal_id || p.id)}</a>
                </td>
                <td style="padding:8px 10px;font-size:14px;font-weight:600;color:#1e293b;">${titleTruncated}</td>
                <td style="padding:8px 10px;font-size:13px;color:#475569;">${escapeHTML(p.project_code || '—')}</td>
                <td style="padding:8px 10px;font-size:13px;color:#475569;">${escapeHTML(p.target_client_name || '(none)')}</td>
                <td style="padding:8px 10px;font-size:13px;color:#1e293b;text-align:right;">${amountDisplay}</td>
                <td style="padding:8px 10px;">${renderAgeBadge(p)}</td>
                <td style="padding:8px 10px;">
                    <button class="btn btn-sm btn-outline" onclick="window.openProposalModal && window.openProposalModal('${escapeHTML(p.id)}')" aria-label="View proposal">View</button>
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
// Shared state-transition helper (consumed by home.js queue + proposal-modal.js
// lifecycle handlers + project-detail.js + service-detail.js inline-card
// Submit-for-Approval flow). Writes proposal doc + (optionally) parent
// project/service doc in a single writeBatch.
// ============================================================

/**
 * Apply a proposal state transition atomically.
 * Writes ONE writeBatch covering proposal doc + (optionally) parent (project|service) doc.
 * Caller fires notifications AFTER batch.commit() in fire-and-forget try/catch.
 *
 * Phase 87.1 D-06: parent_collection is read from the proposal doc itself
 * ('projects' or 'services', defaulting to 'projects' for legacy docs) so
 * service proposals correctly write project_status to the services collection.
 *
 * @param {object} args
 * @param {object} args.proposal               - current proposal (with .id, .status, .audit_log, .project_id, .parent_collection)
 * @param {string|null} args.newStatus         - new proposal.status, or null for audit-only (e.g. Mark Sent to Client)
 * @param {string|null} args.newProjectStatus  - new project.project_status, or null to skip project doc write
 * @param {string} args.auditAction            - 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SENT_TO_CLIENT' | 'CLIENT_APPROVED' | 'LOSS_RECORDED'
 * @param {string|null} args.auditComment      - comment text or null
 * @param {object} [args.extraProposalFields]  - extra top-level fields (e.g. {loss_reason: 'xyz'})
 * @returns {Promise<object>} the new audit entry written
 */
export async function _applyProposalStateTransition({ proposal, newStatus, newProjectStatus, auditAction, auditComment, extraProposalFields, extraProjectFields }) {
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
    // Phase 87.1 D-06: proposals can be linked to either the 'projects' or the
    // 'services' collection. parent_collection defaults to 'projects' for
    // legacy proposals that pre-date services-proposal support.
    const parentCollection = proposal.parent_collection || 'projects';
    if (newProjectStatus && proposal.project_id) {
        const projectPayload = {
            project_status: newProjectStatus,
            status_changed_at: new Date().toISOString(),   // Phase 103.1 D-02 — stage-duration spine (covers projects + services)
            updated_at: new Date().toISOString()  // projects/services collection convention (project-detail.js line 804)
        };
        // Quick 260616 — fold caller extras (e.g. loss_reason) into the SAME batched parent-doc
        // write so the transition is atomic; removes the separate follow-up updateDoc that could
        // leave project_status=Loss with no loss_reason if it failed mid-flight.
        if (extraProjectFields && typeof extraProjectFields === 'object') {
            Object.assign(projectPayload, extraProjectFields);
        }
        batch.update(doc(db, parentCollection, proposal.project_id), projectPayload);
    }

    await batch.commit();
    return newAuditEntry;
}

// ============================================================
// Approval Queue renderer (legacy export — preserved for compatibility but
// no longer the active surface). The home Proposals sub-tab implements its
// own local approval queue with fresh-fetch confirm path because the home
// view does not maintain a proposalsData module state and explicitly
// avoids coupling to it (see RESEARCH Pitfall 7).
//
// This export remains as a public API so any external caller (current or
// future) gets a defined function. Because no Firestore listener feeds
// proposalsData inside this module anymore, the function will render the
// "no proposals awaiting approval" empty state unless a caller mutates
// proposalsData directly. Phase 87.1 Plan 06 keeps this export per the
// executor preservation list.
// ============================================================

/**
 * Render the Proposal Approval Queue into #proposal-queue-mount.
 * Filters proposalsData for status === 'pending_internal', sorts oldest-first.
 */
export function renderApprovalQueue() {
    const mount = document.getElementById('proposal-queue-mount');
    if (!mount) return;

    const pending = proposalsData
        .filter(p => p.status === 'pending_internal')
        .sort((a, b) => {
            const tsA = a.current_status_since?.toMillis?.() ?? a.current_status_since?.seconds * 1000 ?? 0;
            const tsB = b.current_status_since?.toMillis?.() ?? b.current_status_since?.seconds * 1000 ?? 0;
            return tsA - tsB; // oldest first
        });

    mount.style.display = '';

    if (pending.length === 0) {
        mount.innerHTML = `
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.25rem 1.5rem;">
                    <h3 style="margin: 0 0 0.75rem 0; font-size: 1.05rem; color: #1e293b;">Proposal Approval Queue</h3>
                    <p style="color: #64748b; margin: 0; font-size: 0.9375rem;">No proposals awaiting approval.</p>
                </div>
            </div>`;
        return;
    }

    const rows = pending.map(p => {
        const submittedEntry = (p.audit_log || []).find(e => e.action === 'SUBMITTED');
        const submitterName = submittedEntry?.actor_name || p.created_by_name || '—';
        const projectLabel = [p.project_code, p.project_name].filter(Boolean).join(' — ') || '—';
        const amount = typeof p.amount === 'number' ? formatCurrency(p.amount) : '—';
        const ageDays = getAgeInStageDays(p);
        const ageLabel = ageDays < 1 ? 'Today' : ageDays === 1 ? '1 day' : `${ageDays} days`;
        const ageStyle = isOverdueInStage(p)
            ? 'color:#856404;font-size:13px;font-weight:500;'
            : 'color:#64748b;font-size:13px;';

        return `
            <tr>
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    <div style="font-weight: 600; color: #1e293b; font-size: 0.9375rem;">${escapeHTML(p.title || '—')}</div>
                    <div style="color: #64748b; font-size: 0.8125rem; margin-top: 2px;">${escapeHTML(projectLabel)}</div>
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(submitterName)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(amount)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    <span style="${ageStyle}">${escapeHTML(ageLabel)}</span>
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; white-space: nowrap;">
                    <button class="btn btn-success" style="padding: 0.35rem 0.85rem; font-size: 0.8125rem; margin-right: 6px;"
                            onclick="window.queueOpenApproveModal && window.queueOpenApproveModal('${escapeHTML(p.id)}')">Approve</button>
                    <button class="btn btn-danger" style="padding: 0.35rem 0.85rem; font-size: 0.8125rem;"
                            onclick="window.queueOpenRejectModal && window.queueOpenRejectModal('${escapeHTML(p.id)}')">Reject</button>
                </td>
            </tr>`;
    }).join('');

    mount.innerHTML = `
        <div class="card" style="margin-bottom: 1.5rem;">
            <div class="card-body" style="padding: 0;">
                <div style="padding: 1.25rem 1.5rem 0.75rem 1.5rem; border-bottom: 1px solid #e5e7eb;">
                    <h3 style="margin: 0; font-size: 1.05rem; color: #1e293b;">
                        Proposal Approval Queue
                        <span style="font-size: 0.8125rem; font-weight: 400; color: #64748b; margin-left: 0.5rem;">${pending.length} awaiting</span>
                    </h3>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8fafc;">
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Proposal</th>
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Submitted By</th>
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Amount</th>
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Age in Stage</th>
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
}
