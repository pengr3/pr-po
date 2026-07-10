/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats.
   Phase 87.1 D-01/D-07/D-08: gains Overview | Engagements | Proposals sub-tabs.
   ======================================== */

import { db, collection, doc, onSnapshot, getDoc } from '../firebase.js';
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
// Phase 107 — Command Center feed engine (compute-on-load, D-08). getSourcesForUser is the
// default source registry consumed by assembleFeed(); imported explicitly per the 107.3 contract.
import { assembleFeed, getSourcesForUser } from '../home-feed.js';

// View state
// Phase 107 — last assembleFeed() result. Holds { items, cap, total, hasCritical, hasHigh,
// allSourcesFailed, fetchedAt }. Read by the briefing count + feed render + interaction dispatch;
// 107.4 may read it for the KPI "Needs Attention" chip. Reset to null in destroy().
let _ccFeed = null;

// Phase 87.1 — last fetched proposals for the home Proposals sub-tab (one-time getDocs cache,
// scoped to the current session/view). Used by the local approval queue to look up
// titles/projects when opening the action mini-modal without a re-fetch.
let _homeProposalsCache = [];
let _homeCanApproveQueue = false;
let _homeProposalStatusFilter = null; // null = active-only (default); string = specific status key (single-select)
const ACTIVE_PROPOSAL_STAGES = ['draft', 'pending_internal', 'pending_client', 'for_revision'];
let _homeProposalPage = 1;
let _proposalListener = null; // onSnapshot unsubscribe handle for proposals collection

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
    if (role === 'operations_admin') {
        return allProposals.filter(p => (p.parent_collection || 'projects') === 'projects');
    }
    if (role === 'services_admin') {
        return allProposals.filter(p => (p.parent_collection || 'projects') === 'services');
    }
    // Quick 260627-kg0: *_user roles see BOTH departments' proposals here (visibility only — per-proposal
    // drive/approve is still gated by assignment + parent_collection in the proposal modal).
    if (role === 'operations_user' || role === 'services_user') return allProposals;
    return [];
}

// Phase 107 — human-readable role labels for the briefing role chip. Fallback = raw role key.
const ROLE_LABELS = {
    super_admin: 'Super Admin',
    operations_admin: 'Operations Admin',
    services_admin: 'Services Admin',
    operations_user: 'Operations User',
    services_user: 'Services User',
    finance: 'Finance',
    procurement_staff: 'Procurement',
    management: 'Management'
};

/**
 * Phase 107 HOME-01 — Build the briefing header HTML for #ccBriefing.
 * Left group: greeting (Good {timeWord}, {firstName}.) + dated attention one-liner whose
 * count is tone-colored (danger if any critical, warn if any high). Right group: role chip +
 * the '+ New Proposal' CTA (only for canEngagements roles). Pure string builder — no DOM writes.
 * @param {object|null} user - window.getCurrentUser() result
 * @param {object} feed - assembleFeed() result (or the failure-shaped fallback)
 * @returns {string} HTML
 */
function renderBriefing(user, feed) {
    const hour = new Date().getHours();
    const timeWord = hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening');
    const firstName = (user?.full_name || 'there').trim().split(/\s+/)[0] || 'there';
    const role = user?.role || '';
    const roleLabel = ROLE_LABELS[role] || role || '—';

    // Dated attention one-liner
    const now = new Date();
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const monthShort = now.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = now.getDate();
    const N = feed?.total || 0;
    let attnPhrase;
    if (N > 0) {
        const tone = feed.hasCritical ? 'cc-attn-count--danger' : (feed.hasHigh ? 'cc-attn-count--warn' : '');
        attnPhrase = `<span class="cc-attn-count ${tone}">${N}</span> item${N === 1 ? '' : 's'} need${N === 1 ? 's' : ''} your attention`;
    } else {
        attnPhrase = `You're all caught up`;
    }

    // '+ New Proposal' CTA — gated to roles that pass canEngagements (super_admin/operations_admin/services_admin)
    const canEngagements = getHomeSubTabConfig().canEngagements;
    const newProposalBtn = canEngagements
        ? `<button class="btn btn-primary" onclick="window.ccOpenNewProposal()">+ New Proposal</button>`
        : '';

    return `
        <div class="cc-briefing-text">
            <h1 class="cc-greeting">Good ${timeWord}, ${escapeHTML(firstName)}.</h1>
            <p class="cc-attn-line">${escapeHTML(weekday)}, ${escapeHTML(monthShort)} ${dayNum} · ${attnPhrase}</p>
        </div>
        <div class="cc-briefing-actions">
            <span class="cc-role-chip">${escapeHTML(roleLabel)}</span>
            ${newProposalBtn}
        </div>
    `;
}

// Phase 107 — category → chip label (matches the .cc-cat-chip--{category} taxonomy in views.css).
const CATEGORY_LABELS = {
    proposal: 'Proposal', mrf: 'MRF', pr: 'PR', tr: 'TR', po: 'PO',
    finance: 'Finance', rfp: 'RFP', project: 'Project', service: 'Service',
    issue: 'Issue', dlp: 'DLP'
};

/**
 * Phase 107 — normalize a feed timestamp (Firestore Timestamp | {seconds} | Date | ms | ISO | null)
 * to epoch ms, or null when unresolvable.
 */
function ccToMillis(ts) {
    if (ts == null) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    if (typeof ts === 'string') { const t = Date.parse(ts); return Number.isNaN(t) ? null : t; }
    return null;
}

/** Compact age string for a feed row: just now / {m}m / {h}h / {d}d. */
function ccAge(ts) {
    const ms = ccToMillis(ts);
    if (ms == null) return '';
    const mins = Math.floor(Math.max(0, Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

/** Relative time for the "Updated {relTime}" caption: just now / {m}m ago. */
function ccRelTime(fetchedAt) {
    if (fetchedAt == null) return 'just now';
    const mins = Math.floor(Math.max(0, Date.now() - fetchedAt) / 60000);
    return mins < 1 ? 'just now' : `${mins}m ago`;
}

/**
 * Phase 107 HOME-02/03 — Build one feed row. `idx` indexes into the concatenated
 * [...cap.visible, ...cap.rest] list so window.ccOpenFeedItem(idx) resolves the right item.
 * item.icon is a trusted inline-SVG string (from the engine's TYPE_META) — inserted raw, not escaped.
 * Roll-up rows (item.isRollup) render with the collapsed .cc-feed-rollup treatment.
 */
function renderFeedRow(item, idx) {
    const age = ccAge(item.timestamp);
    const aria = `${escapeHTML(item.title || '')} — ${item.severity} — ${age}`;
    const onkey = `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.ccOpenFeedItem(${idx});}"`;
    if (item.isRollup) {
        return `<div class="cc-feed-row cc-feed-row--${item.severity} cc-feed-rollup" role="button" tabindex="0" data-idx="${idx}" aria-label="${aria}" onclick="window.ccOpenFeedItem(${idx})" ${onkey}>
            <span class="cc-feed-icon">${item.icon || ''}</span>
            <div class="cc-feed-main"><div class="cc-feed-title">${escapeHTML(item.title || '')}</div></div>
            <span class="cc-feed-age">${age}</span>
        </div>`;
    }
    const categoryLabel = CATEGORY_LABELS[item.category]
        || (item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : '');
    const catChip = item.category
        ? `<span class="cc-cat-chip cc-cat-chip--${item.category}">${escapeHTML(categoryLabel)}</span>`
        : '';
    return `<div class="cc-feed-row cc-feed-row--${item.severity}" role="button" tabindex="0" data-idx="${idx}" aria-label="${aria}" onclick="window.ccOpenFeedItem(${idx})" ${onkey}>
        <span class="cc-feed-icon">${item.icon || ''}</span>
        <div class="cc-feed-main">
            <div class="cc-feed-title">${escapeHTML(item.title || '')}</div>
            <div class="cc-feed-subtitle">${escapeHTML(item.subtitle || '')}${catChip}</div>
        </div>
        <span class="cc-feed-age">${age}</span>
    </div>`;
}

/**
 * Phase 107 HOME-02/03/04 — Render the "Needs your attention" feed hero into #ccFeedSection.
 * States (per 107.2 contract): allSourcesFailed → neutral error card; total===0 → calm empty card;
 * else → cap.visible rows always + cap.rest behind a "Show all (N)" expander + overflow line.
 */
function renderFeed(feed) {
    const section = document.getElementById('ccFeedSection');
    if (!section) return;

    const header = `
        <div class="cc-feed-header">
            <span class="cc-section-label">Needs your attention</span>
            <div class="cc-feed-header-actions">
                <span class="cc-updated">Updated ${ccRelTime(feed?.fetchedAt)}</span>
                <button class="cc-refresh-btn" onclick="window.ccRefreshFeed()">↻ Refresh</button>
            </div>
        </div>`;

    let body;
    if (feed?.allSourcesFailed) {
        body = `
            <div class="cc-feed-error">
                <div class="cc-feed-error-heading">Couldn't load your feed</div>
                <div class="cc-feed-error-body">Something went wrong fetching your items.</div>
                <button class="cc-feed-retry" onclick="window.ccRefreshFeed()">Retry</button>
            </div>`;
    } else if (!feed || feed.total === 0) {
        body = `
            <div class="cc-empty">
                <div class="cc-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="1.75"><path d="M4.5 12.75l6 6 9-13.5"/></svg></div>
                <div class="cc-empty-heading">You're all caught up</div>
                <div class="cc-empty-body">Nothing needs your attention right now.</div>
                <div class="cc-empty-hint">New items appear here as work moves through the pipeline.</div>
            </div>`;
    } else {
        const visible = feed.cap?.visible || [];
        const rest = feed.cap?.rest || [];
        const overflow = feed.cap?.overflow || 0;
        const visibleRows = visible.map((item, i) => renderFeedRow(item, i)).join('');
        const restRows = rest.map((item, i) => renderFeedRow(item, visible.length + i)).join('');
        const restBlock = rest.length > 0 ? `<div id="ccFeedRest" style="display:none;">${restRows}</div>` : '';
        const expander = rest.length > 0
            ? `<button class="cc-feed-expander" id="ccFeedExpander" onclick="window.ccToggleFeedExpand()">Show all (${feed.total})</button>`
            : '';
        const overflowLine = overflow > 0
            ? `<div class="cc-feed-overflow">Showing 25 of ${feed.total} — open the relevant area to see the rest.</div>`
            : '';
        body = `
            <div class="cc-feed-card">
                <div class="cc-feed-list">${visibleRows}${restBlock}</div>
                ${expander}
                ${overflowLine}
            </div>`;
    }

    section.innerHTML = header + body;
}

/**
 * Render the home page
 * @returns {string} HTML string for home page
 */
export function render() {
    // Phase 107 D-02/D-03 — Home is now the Command Center. The old nav-card grid and
    // procurement quick-stats are retired (the door rail + KPI chips replace them in 107.4).
    // A minimal brand line sits above the sub-nav; the Command Center owns the greeting h1.
    return `
        <div class="hero-section">
            <h1 class="hero-title">🏗️ CLMC</h1>
            <p class="hero-subtitle">Management System Portal</p>

            <!-- Phase 107 D-02 — Home sub-nav; init() reveals it for eligible roles.
                 Command Center (default) | Proposals (non-default) | Dashboard (Phase 109, hidden). -->
            <div class="home-sub-nav" id="homeSubNav" style="display:none;">
                <div class="home-sub-nav-tabs">
                    <button class="home-sub-nav-tab home-sub-nav-tab--active" id="homeTabCommand"
                            onclick="window.switchHomeTab('command')">Command Center</button>
                    <button class="home-sub-nav-tab" id="homeTabProposals" style="display:none;"
                            onclick="window.switchHomeTab('proposals')">Proposals</button>
                    <button class="home-sub-nav-tab" id="homeTabDashboard" style="display:none;"
                            onclick="window.switchHomeTab('dashboard')">Dashboard</button>
                </div>
            </div>

            <!-- Proposals sub-tab body (unchanged; filled on-demand by _loadHomeProposalsTab) -->
            <div id="homeProposalsContent" style="display:none;"></div>

            <!-- Phase 107 — Command Center default surface. Briefing + feed hero are wired here (107.3);
                 the KPI row, Your Work / Recent Activity panels, and door rail are filled by 107.4. -->
            <div id="homeCommandContent">
                <div class="cc-container">
                    <section class="cc-briefing" id="ccBriefing"></section>
                    <div class="cc-kpi-row" id="ccKpiRow"></div>                     <!-- filled by 107.4 -->
                    <section class="cc-feed-section" id="ccFeedSection"></section>
                    <div class="cc-panels" id="ccPanels">
                        <section class="cc-yourwork" id="ccYourWork" style="display:none;"></section>   <!-- 107.4 -->
                        <section class="cc-activity" id="ccActivity"></section>                          <!-- 107.4 -->
                    </div>
                    <nav class="cc-door-rail" id="ccDoorRail"></nav>                 <!-- 107.4 -->
                </div>
            </div>
        </div>
    `;
}

/**
 * Phase 107 D-02 — Switch the active home sub-tab (command | proposals).
 * Command Center is the default surface; Proposals reuses the existing browse table.
 * The Dashboard tab button is hidden (Phase 109) and has no body, so it falls through to command.
 * Guards each show/hide against null because finance/procurement_staff render with no sub-nav,
 * so calling this with a missing tab id is a no-op rather than throwing. Default/unknown → command.
 */
function switchHomeTab(tab) {
    const commandEl = document.getElementById('homeCommandContent');
    const propEl = document.getElementById('homeProposalsContent');

    [commandEl, propEl].forEach(el => { if (el) el.style.display = 'none'; });
    ['homeTabCommand', 'homeTabProposals', 'homeTabDashboard'].forEach(id => {
        document.getElementById(id)?.classList.remove('home-sub-nav-tab--active');
    });

    if (tab === 'proposals') {
        if (propEl) propEl.style.display = '';
        document.getElementById('homeTabProposals')?.classList.add('home-sub-nav-tab--active');
    } else {
        // 'command' + default/unknown (incl. the hidden 'dashboard' button) → Command Center
        if (commandEl) commandEl.style.display = '';
        document.getElementById('homeTabCommand')?.classList.add('home-sub-nav-tab--active');
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
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(submitterName)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(p.target_client_name || '—')}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle; color: #475569; font-size: 0.9rem;">${escapeHTML(amount)}</td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    <span style="${ageStyle}">${escapeHTML(ageLabel)}</span>
                </td>
                <td style="padding: 0.75rem 1rem; vertical-align: middle;">
                    ${p.attachment_url ? `<a href="${escapeHTML(p.attachment_url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();" style="font-size:0.8125rem;color:#3b82f6;">📎 ${escapeHTML(p.attachment_filename || 'View Attachment')}</a>` : '<span style="color:#94a3b8;">—</span>'}
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
                                <th style="padding: 0.6rem 1rem; text-align: left; font-size: 0.8125rem; color: #64748b; font-weight: 600; border-bottom: 1px solid #e5e7eb;">Attachment</th>
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
                        source_id: proposal.proposal_id,
                        object_name: proposal.title,
                        actor_name: window.getCurrentUser?.()?.full_name || 'System'
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
function _renderHomeProposalTable(proposals, page = 1) {
    // Sort by updated_at descending: newest first
    const sorted = [...proposals].sort((a, b) => {
        const tsA = a.updated_at?.toMillis?.() ?? (a.updated_at?.seconds != null ? a.updated_at.seconds * 1000 : 0);
        const tsB = b.updated_at?.toMillis?.() ?? (b.updated_at?.seconds != null ? b.updated_at.seconds * 1000 : 0);
        return tsB - tsA;
    });

    if (sorted.length === 0) {
        return `<div class="card" style="margin-bottom:1rem;width:100%;"><div class="card-body" style="padding:1.25rem 1.5rem;"><p style="color:#64748b;margin:0;font-size:0.9375rem;">No proposals match the selected filter. Click the active tile to show all.</p></div></div>`;
    }

    // Pagination
    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / 10));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * 10;
    const endIdx = Math.min(startIdx + 10, totalItems);
    const pageItems = sorted.slice(startIdx, endIdx);

    const rows = pageItems.map(p => {
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

    // Build pagination HTML (omitted when everything fits on one page)
    let paginationHtml = '';
    if (totalPages > 1) {
        let pageButtons = '';
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= safePage - 1 && i <= safePage + 1)) {
                pageButtons += `<button class="pagination-btn${i === safePage ? ' active' : ''}" onclick="window.handleHomeProposalPageChange(${i})">${i}</button>`;
            } else if (i === safePage - 2 || i === safePage + 2) {
                pageButtons += '<span class="pagination-ellipsis">...</span>';
            }
        }
        paginationHtml = `
            <div class="pagination-container">
                <div class="pagination-info">Showing <strong>${startIdx + 1}–${endIdx}</strong> of <strong>${totalItems}</strong> Proposals</div>
                <div class="pagination-controls">
                    <button class="pagination-btn" onclick="window.handleHomeProposalPageChange(${safePage - 1})" ${safePage === 1 ? 'disabled' : ''}>← Previous</button>
                    ${pageButtons}
                    <button class="pagination-btn" onclick="window.handleHomeProposalPageChange(${safePage + 1})" ${safePage === totalPages ? 'disabled' : ''}>Next →</button>
                </div>
            </div>`;
    }

    return `<div class="card" style="margin-bottom:1rem;"><div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#f8f9fa;border-bottom:1px solid #e5e7eb;">
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Status</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Proposal ID</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Title</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Project</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Client</th>
                    <th style="padding:0.6rem 1rem;text-align:right;font-size:0.8125rem;color:#64748b;font-weight:600;">Amount</th>
                    <th style="padding:0.6rem 1rem;text-align:left;font-size:0.8125rem;color:#64748b;font-weight:600;">Age</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div></div>${paginationHtml}`;
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
    const filtered = (_homeProposalStatusFilter && _homeProposalStatusFilter !== 'active_only')
        ? _homeProposalsCache.filter(p => p.status === _homeProposalStatusFilter)
        : _homeProposalsCache.filter(p => ACTIVE_PROPOSAL_STAGES.includes(p.status));
    existing.innerHTML = _renderHomeProposalScorecards(_homeProposalsCache, _homeProposalStatusFilter)
        + _renderHomeProposalTable(filtered, _homeProposalPage);
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
            const filtered = (_homeProposalStatusFilter && _homeProposalStatusFilter !== 'active_only')
                ? scoped.filter(p => p.status === _homeProposalStatusFilter)
                : scoped.filter(p => ACTIVE_PROPOSAL_STAGES.includes(p.status));

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
        // Phase 107 D-02 — home sub-tabs (Command Center default + Proposals). The Engagements tab
        // retires: its form now mounts on-demand inside the '+ New Proposal' modal (see 107.3 Task 2),
        // so the old eager-render block that populated the retired engagements container is gone.
        const { showSubNav, canProposals, canApproveQueue } = getHomeSubTabConfig();
        if (showSubNav) {
            const navEl = document.getElementById('homeSubNav');
            if (navEl) navEl.style.display = '';

            if (canProposals) {
                const propTabBtn = document.getElementById('homeTabProposals');
                if (propTabBtn) propTabBtn.style.display = '';
                // _loadHomeProposalsTab is async but we don't await it here so the rest of
                // init() can finish (stats listeners + sub-nav reveal) without blocking on
                // network. Errors are caught inside the function.
                _loadHomeProposalsTab(canApproveQueue);
            }
        }

        // Phase 107 HOME-01..04 — Command Center engine bootstrap (compute-on-load, D-08).
        // One assembleFeed() per view-load; Refresh re-runs it. On total failure, fall back to the
        // failure-shaped result so the briefing + feed render the neutral error state, not a crash.
        const user = window.getCurrentUser?.();
        try {
            _ccFeed = await assembleFeed(user);
        } catch (e) {
            console.error('[Home] assembleFeed failed', e);
            _ccFeed = { items: [], cap: { visible: [], rest: [], overflow: 0 }, total: 0, hasCritical: false, hasHigh: false, allSourcesFailed: true, fetchedAt: Date.now() };
        }
        const briefingEl = document.getElementById('ccBriefing');
        if (briefingEl) briefingEl.innerHTML = renderBriefing(user, _ccFeed);
        renderFeed(_ccFeed);

        // Register window functions for sub-nav + proposal modal + home-local queue handlers.
        // Counterpart deletions live in destroy() below.
        window.switchHomeTab = switchHomeTab;
        window.openProposalModal = openProposalModal;
        window.homeQueueConfirmAction = _homeQueueConfirmAction;
        window.homeQueueCancelModal = () => { document.getElementById('home-queue-action-modal')?.remove(); };
        window.homeQueueOpenApproveModal = (id) => _openHomeQueueModal(id, 'approve');
        window.homeQueueOpenRejectModal = (id) => _openHomeQueueModal(id, 'reject');
        window.handleHomeProposalScorecardClick = (statusKey) => {
            // Toggle: clicking the active tile resets to null (reverts to active-only default);
            // clicking a different tile filters to that specific status.
            _homeProposalStatusFilter = (_homeProposalStatusFilter === statusKey) ? null : statusKey;
            _homeProposalPage = 1;
            _rerenderProposalTable();
        };
        window.handleHomeProposalPageChange = (page) => {
            _homeProposalPage = page;
            _rerenderProposalTable();
        };

        // Phase 107 — '+ New Proposal' opens the engagement form in a window-style modal ON-DEMAND
        // (mounts renderEngagementForm() once, then initEngagementForm() wires it). This replaces the
        // retired eager-render so the form's fixed (non-namespaced) ids never render twice / collide.
        window.ccOpenNewProposal = async () => {
            document.getElementById('cc-new-proposal-modal')?.remove();
            const overlay = document.createElement('div');
            overlay.id = 'cc-new-proposal-modal';
            overlay.className = 'modal';
            overlay.style.display = 'flex';
            overlay.style.zIndex = '1001';
            overlay.innerHTML = `
                <div class="modal-content" style="max-width:720px;margin:auto;max-height:90vh;overflow-y:auto;">
                    <div class="modal-header">
                        <h2 style="font-size:1.125rem;font-weight:600;margin:0;">New Proposal</h2>
                        <button class="modal-close" aria-label="Close" onclick="window.ccCloseNewProposal()">&times;</button>
                    </div>
                    <div class="modal-body" style="padding:1.5rem;">${renderEngagementForm()}</div>
                </div>`;
            // Backdrop click (outside the modal-content) closes + tears down the form.
            overlay.addEventListener('click', (e) => { if (e.target === overlay) window.ccCloseNewProposal(); });
            document.body.appendChild(overlay);
            try {
                await initEngagementForm();
            } catch (err) {
                console.error('[Home] initEngagementForm failed:', err);
            }
        };
        window.ccCloseNewProposal = () => {
            // destroyEngagementForm() is idempotent and owns the engagement window functions.
            try { destroyEngagementForm(); } catch (err) { console.error('[Home] destroyEngagementForm failed:', err); }
            document.getElementById('cc-new-proposal-modal')?.remove();
        };

        // Phase 107 HOME-02/03/04 — feed interaction handlers.
        // ccOpenFeedItem dispatches a row's deep-link: kind 'route' → location.hash; kind 'modal' →
        // window[handler](arg) (reuses the existing homeQueueOpen*Modal path — no new destructive UI).
        window.ccOpenFeedItem = (idx) => {
            const item = _ccFeed?.cap ? [..._ccFeed.cap.visible, ..._ccFeed.cap.rest][idx] : null;
            if (!item) return;
            const dl = item.deepLink;
            if (!dl) return;
            if (dl.kind === 'route') {
                location.hash = dl.value;
            } else if (dl.kind === 'modal') {
                const fn = window[dl.handler];
                if (typeof fn === 'function') fn(dl.arg);
            }
        };
        window.ccToggleFeedExpand = () => {
            const rest = document.getElementById('ccFeedRest');
            const btn = document.getElementById('ccFeedExpander');
            if (!rest || !btn) return;
            const isHidden = rest.style.display === 'none';
            rest.style.display = isHidden ? '' : 'none';
            btn.textContent = isHidden ? 'Show less' : `Show all (${_ccFeed?.total ?? 0})`;
        };
        // Refresh re-runs the compute-on-load fetch (NO onSnapshot) and re-renders BOTH the feed and
        // the briefing count so the attention one-liner stays in sync.
        window.ccRefreshFeed = async () => {
            const u = window.getCurrentUser?.();
            try {
                _ccFeed = await assembleFeed(u);
            } catch (e) {
                _ccFeed = { items: [], cap: { visible: [], rest: [], overflow: 0 }, total: 0, hasCritical: false, hasHigh: false, allSourcesFailed: true, fetchedAt: Date.now() };
            }
            renderFeed(_ccFeed);
            const bEl = document.getElementById('ccBriefing');
            if (bEl) bEl.innerHTML = renderBriefing(u, _ccFeed);
        };
    } catch (error) {
        console.error('Error initializing home view:', error);
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

    // Phase 107 — Command Center handlers + on-demand New-Proposal modal.
    delete window.ccOpenNewProposal;
    delete window.ccCloseNewProposal;
    delete window.ccOpenFeedItem;
    delete window.ccToggleFeedExpand;
    delete window.ccRefreshFeed;
    document.getElementById('cc-new-proposal-modal')?.remove();

    try {
        destroyEngagementForm();
    } catch (err) {
        console.error('[Home] destroyEngagementForm failed:', err);
    }
    _homeProposalsCache = [];
    _homeCanApproveQueue = false;
    _homeProposalStatusFilter = null;
    _homeProposalPage = 1;
    _ccFeed = null;

    // Cancel proposals real-time listener (Phase 93.2)
    _proposalListener?.();
    _proposalListener = null;

    // Phase 107 B1 — the legacy procurement-stats onSnapshot fleet is gone; the feed is
    // compute-on-load (no listeners), so nothing to unsubscribe here beyond the proposals listener.
}
