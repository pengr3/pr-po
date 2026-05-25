/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats.
   Phase 87.1 D-01/D-07/D-08: gains Overview | Engagements | Proposals sub-tabs.
   ======================================== */

import { db, collection, doc, query, where, onSnapshot, getDocs, getDoc } from '../firebase.js';
import { renderEngagementForm, initEngagementForm, destroyEngagementForm } from '../engagement-create.js';
import {
    STAGE_ORDER,
    PROPOSAL_RANGE_STATUSES,
    getProposalStatusBadge,
    renderAgeBadge,
    getAgeInStageDays,
    isOverdueInStage,
    _applyProposalStateTransition
} from './proposals.js';
import { openProposalModal } from '../proposal-modal.js';
import { showLoading, showToast, formatCurrency, escapeHTML } from '../utils.js';
import { createNotification, NOTIFICATION_TYPES } from '../notifications.js';

// View state
let statsListeners = [];
// Phase 81 D-05 — fresh object literal; old 8-key shape is fully replaced (REVIEWS Concern 4).
let cachedStats = {
    // Procurement pipeline (D-01)
    activeMRFs: null,
    pendingPRs: null,
    activePOs: null
};

// Phase 87.1 — last fetched proposals for the home Proposals sub-tab (one-time getDocs cache,
// scoped to the current session/view). Used by the local approval queue to look up
// titles/projects when opening the action mini-modal without a re-fetch.
let _homeProposalsCache = [];
let _homeCanApproveQueue = false;
let _homeProposalStatusFilter = null; // null = all stages; string = active status key (single-select)
const ACTIVE_PROPOSAL_STAGES = ['draft', 'pending_internal', 'pending_client', 'for_revision'];
let _homeProposalPage = 1;
let _proposalListener = null; // onSnapshot unsubscribe handle for proposals collection

/**
 * Determine dashboard mode based on current user role
 * @returns {'projects'|'services'|'both'}
 */
function getDashboardMode() {
    const role = window.getCurrentUser?.()?.role || '';
    if (['operations_admin', 'operations_user'].includes(role)) return 'projects';
    if (['services_admin', 'services_user'].includes(role)) return 'services';
    return 'both'; // super_admin, finance, procurement_staff, unknown
}

/**
 * Phase 87.1 D-01/D-08 — Home sub-tab visibility config based on role.
 * Finance and procurement_staff users see no sub-nav (Overview is the only content).
 * @returns {{ showSubNav: boolean, canEngagements: boolean, canProposals: boolean, canApproveQueue: boolean }}
 */
function getHomeSubTabConfig() {
    const role = window.getCurrentUser?.()?.role || '';
    if (['finance', 'procurement_staff'].includes(role)) {
        return { showSubNav: false, canEngagements: false, canProposals: false, canApproveQueue: false };
    }
    const canEngagements = ['super_admin', 'operations_admin', 'services_admin'].includes(role);
    const canProposals = true; // all remaining (non-finance, non-procurement) roles
    const canApproveQueue = ['super_admin', 'operations_admin'].includes(role);
    return { showSubNav: true, canEngagements, canProposals, canApproveQueue };
}

/**
 * Phase 87.1 D-08 — Role-filter the proposals list for the Proposals sub-tab dashboard.
 * super_admin: all proposals
 * operations_admin / operations_user: proposals where parent_collection (default 'projects') === 'projects'
 * services_admin / services_user: proposals where parent_collection (default 'projects') === 'services'
 * Default (unknown role): empty list
 */
function filterProposalsForUser(allProposals) {
    const role = window.getCurrentUser?.()?.role || '';
    if (role === 'super_admin') return allProposals;
    if (role === 'operations_admin' || role === 'operations_user') {
        return allProposals.filter(p => (p.parent_collection || 'projects') === 'projects');
    }
    if (role === 'services_admin' || role === 'services_user') {
        return allProposals.filter(p => (p.parent_collection || 'projects') === 'services');
    }
    return [];
}

/**
 * Build Procurement card HTML — always shown regardless of role (D-05)
 * Reuses existing .stat-item/.stat-label/.stat-value classes inside a .hs-procurement-stats flex wrapper.
 * @returns {string}
 */
function procurementCardHtml() {
    return `
        <div class="hs-stat-card">
            <h4 class="hs-stat-card-title">Procurement</h4>
            <div class="hs-procurement-stats">
                <div class="stat-item">
                    <span class="stat-label">Pending MRFs</span>
                    <span class="stat-value" id="stat-mrfs">${cachedStats.activeMRFs !== null ? cachedStats.activeMRFs : '<span class="skeleton skeleton-stat"></span>'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Pending PRs</span>
                    <span class="stat-value" id="stat-prs">${cachedStats.pendingPRs !== null ? cachedStats.pendingPRs : '<span class="skeleton skeleton-stat"></span>'}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Active POs</span>
                    <span class="stat-value" id="stat-pos">${cachedStats.activePOs !== null ? cachedStats.activePOs : '<span class="skeleton skeleton-stat"></span>'}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render the home page
 * @returns {string} HTML string for home page
 */
export function render() {
    const mode = getDashboardMode();

    // D-05 Role visibility:
    // - 'projects' (operations_admin/user) → Procurement + Projects (no Services)
    // - 'services' (services_admin/user) → Procurement + Services (no Projects)
    // - 'both' (super_admin/finance/procurement_staff/unknown) → all 3 cards
    // Procurement card always shown regardless of mode.
    let statsContent = procurementCardHtml();

    return `
        <div class="hero-section">
            <h1 class="hero-title">🏗️ CLMC</h1>
            <p class="hero-subtitle">Management System Portal</p>

            <div class="dept-cards">
                <div class="dept-cards-row dept-cards-row--top">
                    <div class="nav-card" onclick="location.hash='#/clients'">
                        <div class="nav-card-icon">📋</div>
                        <h3>Clients</h3>
                        <p>Manage client records, contacts, and engagement history</p>
                        <button class="btn btn-primary">Enter →</button>
                    </div>
                    <div class="nav-card" onclick="location.hash='#/projects'">
                        <div class="nav-card-icon">🏗️</div>
                        <h3>Projects</h3>
                        <p>Track projects, budgets, Gantt schedules, and financials</p>
                        <button class="btn btn-primary">Enter →</button>
                    </div>
                    <div class="nav-card" onclick="location.hash='#/services'">
                        <div class="nav-card-icon">🔧</div>
                        <h3>Services</h3>
                        <p>Manage recurring service contracts and work tracking</p>
                        <button class="btn btn-primary">Enter →</button>
                    </div>
                </div>
                <div class="dept-cards-row dept-cards-row--bottom">
                    <div class="nav-card" onclick="location.hash='#/procurement'">
                        <div class="nav-card-icon">🛒</div>
                        <h3>Procurement</h3>
                        <p>Submit MRFs, manage suppliers, track orders and RFPs</p>
                        <button class="btn btn-primary">Enter →</button>
                    </div>
                    <div class="nav-card" onclick="location.hash='#/finance'">
                        <div class="nav-card-icon">💰</div>
                        <h3>Finance</h3>
                        <p>Approve PRs, manage payables, collectibles, and RFPs</p>
                        <button class="btn btn-primary">Enter →</button>
                    </div>
                </div>
            </div>

            <!-- Phase 87.1 D-01 — Home sub-nav; init() reveals it for eligible roles -->
            <div class="home-sub-nav" id="homeSubNav" style="display:none;">
                <div class="home-sub-nav-tabs">
                    <button class="home-sub-nav-tab home-sub-nav-tab--active" id="homeTabOverview"
                            onclick="window.switchHomeTab('overview')">Overview</button>
                    <button class="home-sub-nav-tab" id="homeTabEngagements" style="display:none;"
                            onclick="window.switchHomeTab('engagements')">Engagements</button>
                    <button class="home-sub-nav-tab" id="homeTabProposals" style="display:none;"
                            onclick="window.switchHomeTab('proposals')">Proposals</button>
                </div>
            </div>
            <div id="homeEngagementsContent" style="display:none;"></div>
            <div id="homeProposalsContent" style="display:none;"></div>

            <!-- Phase 93: Overview wrapper — tiles shown above (always visible); stats card shown/hidden by switchHomeTab -->
            <div id="homeOverviewContent">
                <div class="quick-stats">
                    ${statsContent}
                </div>
            </div>
        </div>
    `;
}

/**
 * Phase 87.1 D-01/D-07/D-08 — Switch the active home sub-tab (overview | engagements | proposals).
 * Guards each show/hide against null because finance/procurement_staff render with no sub-nav,
 * so calling this with a missing tab id should be a no-op rather than throwing.
 */
function switchHomeTab(tab) {
    const overviewEl = document.getElementById('homeOverviewContent');
    const engEl = document.getElementById('homeEngagementsContent');
    const propEl = document.getElementById('homeProposalsContent');

    [overviewEl, engEl, propEl].forEach(el => { if (el) el.style.display = 'none'; });
    ['homeTabOverview', 'homeTabEngagements', 'homeTabProposals'].forEach(id => {
        document.getElementById(id)?.classList.remove('home-sub-nav-tab--active');
    });

    if (tab === 'engagements') {
        if (engEl) engEl.style.display = '';
        document.getElementById('homeTabEngagements')?.classList.add('home-sub-nav-tab--active');
    } else if (tab === 'proposals') {
        if (propEl) propEl.style.display = '';
        document.getElementById('homeTabProposals')?.classList.add('home-sub-nav-tab--active');
    } else {
        if (overviewEl) overviewEl.style.display = '';
        document.getElementById('homeTabOverview')?.classList.add('home-sub-nav-tab--active');
    }
}

/**
 * Phase 87.1 D-01 — Render the home approval queue (super_admin + operations_admin only).
 * This is a LOCAL home-only minimal queue (per RESEARCH.md Pitfall 7) — it intentionally
 * does NOT import the proposals.js approval-queue renderer because that function depends
 * on proposalsData module state that home.js does not maintain.
 *
 * Inputs `pending` are already filtered to status==='pending_internal' and sorted oldest-first.
 */
function _renderHomeApprovalQueueHtml(pending) {
    if (pending.length === 0) {
        return `
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body" style="padding: 1.25rem 1.5rem;">
                    <h3 style="margin: 0 0 0.75rem 0; font-size: 1.05rem; color: #1e293b;">Proposal Approval Queue</h3>
                    <p style="color: #64748b; margin: 0; font-size: 0.9375rem;">No proposals awaiting approval.</p>
                </div>
            </div>`;
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
            <tr style="cursor:pointer;"
                onclick="window.openProposalModal && window.openProposalModal('${escapeHTML(p.id)}')"
                onmouseenter="this.style.background='#f8fafc'"
                onmouseleave="this.style.background=''">
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    <div style="font-weight: 600; color: #1e293b; font-size: 0.9375rem;">${escapeHTML(p.title || '—')}</div>
                    <div style="color: #64748b; font-size: 0.8125rem; margin-top: 2px;">${escapeHTML(projectLabel)}</div>
                    ${p.attachment_url ? `<div style="margin-top:3px;"><a href="${escapeHTML(p.attachment_url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="font-size:0.75rem;color:#3b82f6;">📎 ${escapeHTML(p.attachment_filename || 'View Attachment')}</a></div>` : ''}
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(submitterName)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(p.target_client_name || '—')}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(amount)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    <span style="${ageStyle}">${escapeHTML(ageLabel)}</span>
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; white-space: nowrap;">
                    <button class="btn btn-success" style="padding: 0.35rem 0.85rem; font-size: 0.8125rem; margin-right: 6px;"
                            onclick="event.stopPropagation(); window.homeQueueOpenApproveModal('${escapeHTML(p.id)}')">Approve</button>
                    <button class="btn btn-danger" style="padding: 0.35rem 0.85rem; font-size: 0.8125rem;"
                            onclick="event.stopPropagation(); window.homeQueueOpenRejectModal('${escapeHTML(p.id)}')">Reject</button>
                </td>
            </tr>`;
    }).join('');

    return `
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
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Client</th>
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

/**
 * Phase 87.1 D-01 — Open the home-local approve/reject mini-modal.
 * Uses a fresh getDoc to confirm the proposal is still in pending_internal, then
 * builds the modal HTML that calls window.homeQueueConfirmAction on confirm.
 *
 * Modal element id 'home-queue-action-modal' is distinct from proposals.js modal ids.
 */
async function _openHomeQueueModal(proposalDocId, mode) {
    try {
        const snap = await getDoc(doc(db, 'proposals', proposalDocId));
        if (!snap.exists()) { showToast('Proposal not found.', 'error'); return; }
        const proposal = { id: snap.id, ...snap.data() };
        if (proposal.status !== 'pending_internal') {
            showToast('This proposal is no longer pending approval.', 'error');
            return;
        }

        const existing = document.getElementById('home-queue-action-modal');
        if (existing) existing.remove();

        const isApprove = mode === 'approve';
        const heading = isApprove ? 'Approve Proposal' : 'Reject Proposal';
        const bodyText = isApprove
            ? "Approving will advance the project status to 'Proposal Under Client Review'. This action is recorded in the audit trail."
            : "Rejecting will move the proposal back to 'For Revision'. The submitter will be notified.";
        const label = isApprove ? 'Approval Notes' : 'Rejection Reason';
        const placeholder = isApprove ? 'Describe your review decision...' : 'Explain what needs to be changed...';
        const confirmLabel = isApprove ? 'Confirm Approval' : 'Confirm Rejection';
        const confirmClass = isApprove ? 'btn-success' : 'btn-danger';

        const html = `
        <div id="home-queue-action-modal" class="modal" style="display:flex;z-index:1001;">
            <div class="modal-content" style="max-width:480px;margin:auto;">
                <div class="modal-header">
                    <h2 style="font-size:1.125rem;font-weight:600;margin:0;">${escapeHTML(heading)}</h2>
                    <button class="modal-close" aria-label="Close" onclick="window.homeQueueCancelModal()">&times;</button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <p style="color:#475569;font-size:13px;line-height:1.5;margin:0 0 0.75rem 0;">
                        <strong>${escapeHTML(proposal.title || '—')}</strong>
                    </p>
                    <p style="color:#475569;font-size:13px;line-height:1.5;margin:0 0 1rem 0;">${escapeHTML(bodyText)}</p>
                    <label style="display:block;font-weight:600;color:#475569;font-size:0.875rem;margin-bottom:0.5rem;">
                        ${escapeHTML(label)} <span style="color:#ef4444;">*</span>
                    </label>
                    <textarea id="homeQueueActionComment" rows="4"
                        placeholder="${escapeHTML(placeholder)}"
                        style="width:100%;min-height:80px;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;font-size:0.9375rem;box-sizing:border-box;resize:vertical;"></textarea>
                    <div id="homeQueueActionCommentError" style="display:none;color:#ea4335;font-size:13px;margin-top:4px;"></div>
                </div>
                <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
                    <button class="btn btn-outline" onclick="window.homeQueueCancelModal()">Cancel</button>
                    <button class="btn ${confirmClass}" onclick="window.homeQueueConfirmAction('${escapeHTML(proposalDocId)}', '${mode}')">${escapeHTML(confirmLabel)}</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    } catch (err) {
        console.error('[Home] _openHomeQueueModal failed:', err);
        showToast(err?.message || 'Failed to open approval modal.', 'error');
    }
}

/**
 * Phase 87.1 D-01 — Confirm the queue action (approve or reject).
 * Per RESEARCH.md Open Question 2 + Pitfall 7: fetches the proposal FRESH via getDoc
 * (not from any cached array) then calls _applyProposalStateTransition directly so
 * lifecycle behavior matches the /proposals route exactly.
 */
async function _homeQueueConfirmAction(proposalDocId, mode) {
    try {
        const snap = await getDoc(doc(db, 'proposals', proposalDocId));
        if (!snap.exists()) { showToast('Proposal not found.', 'error'); return; }
        const proposal = { id: snap.id, ...snap.data() };
        if (proposal.status !== 'pending_internal') {
            showToast('Proposal status changed. Please reload.', 'error');
            document.getElementById('home-queue-action-modal')?.remove();
            return;
        }

        const commentEl = document.getElementById('homeQueueActionComment');
        const errEl = document.getElementById('homeQueueActionCommentError');
        const comment = (commentEl?.value || '').trim();
        const fieldLabel = (mode === 'approve') ? 'Approval Notes' : 'Rejection Reason';
        if (comment.length < 10) {
            if (errEl) {
                errEl.textContent = `${fieldLabel} is required (minimum 10 characters).`;
                errEl.style.display = 'block';
            }
            return;
        }

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

            // NOTIF-10 — notify proposal submitter of decision (mirrors proposals.js queue handler)
            try {
                if (proposal.created_by) {
                    const actionVerb = (mode === 'approve') ? 'approved' : 'rejected';
                    const excerpt = comment.length > 60 ? comment.slice(0, 60) + '…' : comment;
                    await createNotification({
                        user_id: proposal.created_by,
                        type: NOTIFICATION_TYPES.PROPOSAL_DECIDED,
                        message: `Proposal "${proposal.title}" ${actionVerb}: ${excerpt}`,
                        link: `#/`,
                        source_collection: 'proposals',
                        source_id: proposal.proposal_id
                    });
                }
            } catch (notifErr) {
                console.error('[Home] NOTIF-10 failed (queue):', notifErr);
            }

            document.getElementById('home-queue-action-modal')?.remove();
            showToast(successToast, 'success');
            // onSnapshot fires automatically after Firestore write — no manual re-fetch needed.
        } catch (err) {
            console.error('[Home] _homeQueueConfirmAction transition failed:', err);
            showToast(err?.message || 'Failed to record decision. Please try again.', 'error');
        } finally {
            showLoading(false);
        }
    } catch (err) {
        console.error('[Home] _homeQueueConfirmAction outer failure:', err);
        showToast(err?.message || 'Failed to record decision.', 'error');
        showLoading(false);
    }
}

/**
 * Phase 93.1 D-11/D-12/D-13 — Render five scorecard tiles above the unified proposals table.
 * One tile per STAGE_ORDER entry. Active tile gets project-scorecard-card--active class.
 * @param {Array} proposals - All scoped proposals (not filtered by active status)
 * @param {string|null} activeFilter - The currently active status key, or null for all
 * @returns {string} HTML string
 */
function _renderHomeProposalScorecards(proposals, activeFilter) {
    const colorMap = {
        pending_internal: '#f59e0b',
        pending_client:   '#3b82f6',
        for_revision:     '#ef4444',
        client_approved:  '#059669',
        loss:             '#6b7280'
    };
    const tiles = STAGE_ORDER.map(stage => {
        const color = colorMap[stage.key] || '#6b7280';
        const count = proposals.filter(p => p.status === stage.key).length;
        const isActive = activeFilter === stage.key;
        return `<div class="project-scorecard-card${isActive ? ' project-scorecard-card--active' : ''}"
            data-status="${stage.key}"
            style="flex:1;min-width:140px;height:72px;border-left:3px solid ${color};"
            onclick="window.handleHomeProposalScorecardClick('${stage.key}')">
            <span class="scorecard-label">${escapeHTML(stage.label)}</span>
            <span class="scorecard-count">${count}</span>
        </div>`;
    }).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">${tiles}</div>`;
}

/**
 * Phase 93.1 D-06/D-08/D-09 — Render the unified proposals table covering all five stages.
 * Each row is clickable and opens the proposal detail modal.
 * @param {Array} proposals - Proposals to display (may be filtered by active status)
 * @returns {string} HTML string
 */
function _renderHomeProposalTable(proposals) {
    if (proposals.length === 0) {
        return `<div class="card" style="margin-bottom:1rem;width:100%;"><div class="card-body" style="padding:1.25rem 1.5rem;"><p style="color:#64748b;margin:0;font-size:0.9375rem;">No proposals match the selected filter. Click the active tile to show all.</p></div></div>`;
    }
    const rows = proposals.map(p => {
        const titleTruncated = (p.title || '').length > 40
            ? escapeHTML((p.title || '').slice(0, 40)) + '…'
            : escapeHTML(p.title || '—');
        const amountDisplay = (p.amount != null && p.amount !== '')
            ? '₱' + formatCurrency(p.amount)
            : '—';
        return `<tr style="cursor:pointer;"
            onclick="window.openProposalModal && window.openProposalModal('${escapeHTML(p.id)}')"
            onmouseenter="this.style.background='#f8fafc'"
            onmouseleave="this.style.background=''">
            <td style="padding:0.6rem 1rem;vertical-align:middle;">${getProposalStatusBadge(p.status)}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;font-size:0.875rem;color:#475569;">${escapeHTML(p.proposal_id || p.id)}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;font-size:0.9rem;color:#1e293b;">${titleTruncated}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;font-size:0.875rem;color:#475569;">${escapeHTML(p.project_code || '—')}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;font-size:0.875rem;color:#475569;">${escapeHTML(p.target_client_name || '(none)')}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;font-size:0.875rem;color:#475569;text-align:right;">${amountDisplay}</td>
            <td style="padding:0.6rem 1rem;vertical-align:middle;">${renderAgeBadge(p)}</td>
        </tr>`;
    }).join('');
    return `<div class="card" style="margin-bottom:1rem;"><div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8f9fa;border-bottom:1px solid #e5e7eb;">
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Status</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">PROP-ID</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Title</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Project</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Client</th>
                    <th style="padding:0.6rem 1rem;text-align:right;font-size:0.8125rem;color:#64748b;font-weight:600;">Amount</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Age</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div></div>`;
}

/**
 * Phase 93.1 D-13/D-14 — Re-render the proposals table section from cache without a Firestore round-trip.
 * Called by window.handleHomeProposalScorecardClick after toggling _homeProposalStatusFilter.
 */
function _rerenderProposalTable() {
    const mount = document.getElementById('homeProposalsContent');
    if (!mount) return;
    const tableContainerId = 'homeProposalTableSection';
    const existing = document.getElementById(tableContainerId);
    if (!existing) return;
    const filtered = _homeProposalStatusFilter
        ? _homeProposalsCache.filter(p => p.status === _homeProposalStatusFilter)
        : _homeProposalsCache;
    existing.innerHTML = _renderHomeProposalScorecards(_homeProposalsCache, _homeProposalStatusFilter)
        + _renderHomeProposalTable(filtered);
    // Safety-net: sync active class on re-rendered tiles (already set via template literal above)
    document.querySelectorAll('#homeProposalTableSection .project-scorecard-card').forEach(card => {
        card.classList.toggle('project-scorecard-card--active', card.dataset.status === _homeProposalStatusFilter);
    });
}

/**
 * Phase 87.1 D-01/D-08 — Load and render the home Proposals sub-tab content.
 * Phase 93.2 — Upgraded from one-time getDocs to real-time onSnapshot listener.
 * Unsubscribe handle stored in _proposalListener; cancelled in destroy() and on re-call.
 *
 * Builds:
 *   - Approval Queue card (only if canApproveQueue) — local home-only queue per Pitfall 7
 *   - Scorecard tiles + unified proposals table
 *
 * Active proposals = status NOT in {'client_approved','loss'}.
 */
function _loadHomeProposalsTab(canApproveQueue) {
    _homeCanApproveQueue = !!canApproveQueue;
    _homeProposalStatusFilter = 'active_only';

    // Cancel any existing proposals listener before registering a new one (T-93.2-04)
    _proposalListener?.();
    _proposalListener = null;

    _proposalListener = onSnapshot(
        collection(db, 'proposals'),
        (snap) => {
            const mount = document.getElementById('homeProposalsContent');
            if (!mount) return; // T-93.2-03: navigated away — discard update

            const all = [];
            snap.forEach(d => all.push({ id: d.id, ...d.data() }));

            const scoped = filterProposalsForUser(all);
            _homeProposalsCache = scoped;
            _homeProposalPage = 1;

            // Queue section — only for approvers (super_admin + operations_admin)
            let queueHtml = '';
            if (_homeCanApproveQueue) {
                const pending = scoped
                    .filter(p => p.status === 'pending_internal')
                    .sort((a, b) => {
                        const tsA = a.current_status_since?.toMillis?.() ?? (a.current_status_since?.seconds != null ? a.current_status_since.seconds * 1000 : 0);
                        const tsB = b.current_status_since?.toMillis?.() ?? (b.current_status_since?.seconds != null ? b.current_status_since.seconds * 1000 : 0);
                        return tsA - tsB;
                    });
                queueHtml = _renderHomeApprovalQueueHtml(pending);
            }

            // Apply active-only filter before building the table
            const filtered = _homeProposalStatusFilter === 'active_only'
                ? scoped.filter(p => ACTIVE_PROPOSAL_STAGES.includes(p.status))
                : (_homeProposalStatusFilter ? scoped.filter(p => p.status === _homeProposalStatusFilter) : scoped);

            // Unified proposals table with scorecard tiles above
            const tableSection = `<div id="homeProposalTableSection" style="width:100%;">
                ${_renderHomeProposalScorecards(scoped, _homeProposalStatusFilter)}
                ${_renderHomeProposalTable(filtered, _homeProposalPage)}
            </div>`;

            mount.innerHTML = `
                <div style="margin-top:1rem;width:100%;">
                    ${queueHtml}
                    ${tableSection}
                </div>
            `;
        },
        (err) => {
            console.error('[Home] proposals onSnapshot error:', err);
            const mount = document.getElementById('homeProposalsContent');
            if (!mount) return;
            mount.innerHTML = `
                <div class="card" style="margin-top:1rem;">
                    <div class="card-body" style="padding: 1.25rem 1.5rem;">
                        <p style="color: #ea4335; margin: 0; font-size: 0.9375rem;">Failed to load proposals. Please refresh.</p>
                    </div>
                </div>`;
        }
    );
}

/**
 * Initialize the home page
 */
export async function init() {
    try {
        const mode = getDashboardMode();
        loadStats(mode);

        // If we have stale cached data showing, add refreshing indicator
        // until fresh data arrives from Firestore (removed by updateStatDisplay)
        if (cachedStats.activeMRFs !== null) {
            document.querySelectorAll('.stat-value').forEach(el => el.classList.add('stat-refreshing'));
        }

        // Phase 87.1 D-01/D-07/D-08 — home sub-tabs
        const { showSubNav, canEngagements, canProposals, canApproveQueue } = getHomeSubTabConfig();
        if (showSubNav) {
            const navEl = document.getElementById('homeSubNav');
            if (navEl) navEl.style.display = '';

            if (canEngagements) {
                const engTabBtn = document.getElementById('homeTabEngagements');
                if (engTabBtn) engTabBtn.style.display = '';
                const engEl = document.getElementById('homeEngagementsContent');
                if (engEl) engEl.innerHTML = renderEngagementForm();
                // initEngagementForm registers its own window functions + clients/users listeners.
                // It is idempotent (calls destroyEngagementForm first) — safe across re-inits.
                await initEngagementForm();
            }

            if (canProposals) {
                const propTabBtn = document.getElementById('homeTabProposals');
                if (propTabBtn) propTabBtn.style.display = '';
                // _loadHomeProposalsTab is async but we don't await it here so the rest of
                // init() can finish (stats listeners + sub-nav reveal) without blocking on
                // network. Errors are caught inside the function.
                _loadHomeProposalsTab(canApproveQueue);
            }
        }

        // Register window functions for sub-nav + proposal modal + home-local queue handlers.
        // Counterpart deletions live in destroy() below.
        window.switchHomeTab = switchHomeTab;
        window.openProposalModal = openProposalModal;
        window.homeQueueConfirmAction = _homeQueueConfirmAction;
        window.homeQueueCancelModal = () => { document.getElementById('home-queue-action-modal')?.remove(); };
        window.homeQueueOpenApproveModal = (id) => _openHomeQueueModal(id, 'approve');
        window.homeQueueOpenRejectModal = (id) => _openHomeQueueModal(id, 'reject');
        window.handleHomeProposalScorecardClick = (statusKey) => {
            _homeProposalStatusFilter = (_homeProposalStatusFilter === statusKey) ? null : statusKey;
            _rerenderProposalTable();
        };
    } catch (error) {
        console.error('Error initializing home view:', error);
    }
}

/**
 * Load real-time statistics based on dashboard mode
 * @param {'projects'|'services'|'both'} mode
 */
function loadStats(mode) {
    // ---- Procurement card (always shown regardless of mode per D-05) ----
    // Pending MRFs — department filter depends on mode (RESEARCH Open Question 2):
    //   mode==='projects' → d.department='projects' (or undefined, legacy-safe)
    //   mode==='services' → d.department='services'
    //   mode==='both' → no department filter (cross-cutting pipeline view)
    const mrfListener = onSnapshot(
        query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
        (snapshot) => {
            let count;
            if (mode === 'projects') {
                count = snapshot.docs.filter(d => (d.data().department || 'projects') === 'projects').length;
            } else if (mode === 'services') {
                count = snapshot.docs.filter(d => d.data().department === 'services').length;
            } else {
                // both mode — total across all departments
                count = snapshot.size;
            }
            cachedStats.activeMRFs = count;
            updateStatDisplay('stat-mrfs', count);
        },
        (error) => { console.error('[Home] Error loading MRF stats:', error); }
    );
    statsListeners.push(mrfListener);

    // Pending PRs (no dept filter)
    const prListener = onSnapshot(
        query(collection(db, 'prs'), where('finance_status', '==', 'Pending')),
        (snapshot) => {
            cachedStats.pendingPRs = snapshot.size;
            updateStatDisplay('stat-prs', cachedStats.pendingPRs);
        },
        (error) => { console.error('[Home] Error loading PR stats:', error); }
    );
    statsListeners.push(prListener);

    // Active POs — procurement_status != 'Delivered' (no dept filter)
    const poListener = onSnapshot(
        collection(db, 'pos'),
        (snapshot) => {
            cachedStats.activePOs = snapshot.docs.filter(doc => {
                const status = doc.data().procurement_status;
                return status && status !== 'Delivered';
            }).length;
            updateStatDisplay('stat-pos', cachedStats.activePOs);
        },
        (error) => { console.error('[Home] Error loading PO stats:', error); }
    );
    statsListeners.push(poListener);
}

/**
 * Update stat display in DOM
 * @param {string} elementId - ID of stat element
 * @param {number} value - New value
 */
function updateStatDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        element.classList.remove('loading');
        element.classList.remove('stat-refreshing');
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    // Phase 87.1 D-01/D-07 — clean up sub-tab window functions and the engagement form.
    // destroyEngagementForm() is idempotent and the canonical owner of the 6 engagement
    // window functions (CR-01-safe by construction — see 87.1-03-SUMMARY.md).
    delete window.switchHomeTab;
    delete window.openProposalModal;
    delete window.homeQueueConfirmAction;
    delete window.homeQueueCancelModal;
    delete window.homeQueueOpenApproveModal;
    delete window.homeQueueOpenRejectModal;
    delete window.handleHomeProposalScorecardClick;
    delete window.handleHomeProposalPageChange;
    try {
        destroyEngagementForm();
    } catch (err) {
        console.error('[Home] destroyEngagementForm failed:', err);
    }
    _homeProposalsCache = [];
    _homeCanApproveQueue = false;
    _homeProposalStatusFilter = null;
    _homeProposalPage = 1;

    // Cancel proposals real-time listener (Phase 93.2)
    _proposalListener?.();
    _proposalListener = null;

    // Unsubscribe from all Firestore listeners
    statsListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    statsListeners = [];

    // cachedStats intentionally NOT reset — stale-while-revalidate pattern:
    // preserved values shown immediately on next visit while fresh data loads
}
