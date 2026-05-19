/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats
   ======================================== */

import { db, collection, query, where, onSnapshot, getDocs } from '../firebase.js';
import { escapeHTML, formatCurrency } from '../utils.js';
import { getProposalStatusBadge, renderAgeBadge, STAGE_ORDER } from './proposals.js';

// View state
let statsListeners = [];
// Phase 81 D-05 — fresh object literal; old 8-key shape is fully replaced (REVIEWS Concern 4).
let cachedStats = {
    // Procurement pipeline (D-01)
    activeMRFs: null,
    pendingPRs: null,
    activePOs: null
};

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
 * Phase 87.1 D-05 — Filter proposals for the current user based on role and assigned codes.
 * Returns [] for finance and procurement_staff (no sub-tab shown).
 * @param {Array} allProposals
 * @returns {Array}
 */
function filterProposalsForUser(allProposals) {
    const user = window.getCurrentUser?.();
    if (!user) return [];
    const role = user.role;
    if (role === 'super_admin') return allProposals;
    if (role === 'operations_admin' || role === 'operations_user') {
        const assignedCodes = window.getAssignedProjectCodes?.();
        return allProposals.filter(p => {
            if ((p.parent_collection || 'projects') !== 'projects') return false;
            if (assignedCodes === null) return true;
            return assignedCodes.includes(p.project_code);
        });
    }
    if (role === 'services_admin' || role === 'services_user') {
        const assignedCodes = window.getAssignedServiceCodes?.();
        return allProposals.filter(p => {
            if ((p.parent_collection || 'projects') !== 'services') return false;
            if (assignedCodes === null) return true;
            return assignedCodes.includes(p.project_code);
        });
    }
    return []; // finance, procurement_staff — no sub-tab
}

/**
 * Phase 87.1 D-05 — Render grouped-by-stage proposals dashboard for home sub-tab.
 * Uses STAGE_ORDER imported from proposals.js — no local stage/label redeclaration.
 * @param {Array} proposals — active (non-approved, non-loss) filtered proposals
 * @returns {string} HTML string
 */
function renderHomeProposalsDashboard(proposals) {
    if (proposals.length === 0) {
        return '<p style="color:#64748b;text-align:center;padding:2rem;">No active proposals</p>';
    }
    const grouped = {};
    proposals.forEach(p => {
        const key = p.status || 'draft';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p);
    });
    let html = '';
    // Draft group first (mirrors proposals.js dashboard order)
    if (grouped['draft']?.length > 0) {
        html += renderHomeStageCard('Draft', grouped['draft']);
    }
    STAGE_ORDER.forEach(({ key, label }) => {
        if ((grouped[key] || []).length === 0) return;
        html += renderHomeStageCard(label, grouped[key]);
    });
    return html;
}

/**
 * Render a stage group card for the home proposals sub-tab.
 * Actions column links to #/proposals (read-only from home — D-05).
 * @param {string} label - Stage label
 * @param {Array} stageProposals - proposals in this stage
 * @returns {string} HTML string
 */
function renderHomeStageCard(label, stageProposals) {
    const now = Date.now();
    const rows = stageProposals.map(proposal => {
        // Overdue border: pending stages older than 7 days
        const isOverduePending = ['pending_internal', 'pending_client'].includes(proposal.status);
        let ageDays = 0;
        if (proposal.current_status_since) {
            const since = proposal.current_status_since.toDate
                ? proposal.current_status_since.toDate().getTime()
                : new Date(proposal.current_status_since).getTime();
            ageDays = Math.floor((now - since) / 86400000);
        }
        const overdueBorder = isOverduePending && ageDays > 7
            ? 'border-left:3px solid #f59e0b;'
            : '';
        const projectService = escapeHTML(proposal.project_code || proposal.project_id || '—');
        const client = escapeHTML(proposal.client_name || '—');
        const amount = proposal.amount != null ? `₱${formatCurrency(proposal.amount)}` : '—';
        return `<tr style="${overdueBorder}">
            <td style="font-size:13px;font-weight:600;color:#1a73e8;">${escapeHTML(proposal.proposal_id || proposal.id)}</td>
            <td style="font-size:13px;">${escapeHTML(proposal.title || '—')}</td>
            <td style="font-size:13px;">${projectService}</td>
            <td style="font-size:13px;">${client}</td>
            <td style="font-size:13px;">${amount}</td>
            <td style="font-size:13px;">${renderAgeBadge(proposal)}</td>
            <td><a href="#/proposals" style="color:#1a73e8;font-size:13px;font-weight:600;text-decoration:none;">View →</a></td>
        </tr>`;
    }).join('');

    return `<div style="margin-bottom:1.5rem;">
        <h4 style="font-size:0.9375rem;font-weight:600;color:#1e293b;margin:0 0 0.5rem;">
            ${escapeHTML(label)}
            <span style="font-size:0.8125rem;font-weight:400;color:#64748b;margin-left:0.5rem;">${stageProposals.length}</span>
        </h4>
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#f8f9fa;">
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">PROP ID</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Title</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Project/Service</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Client</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Amount</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Age in Stage</th>
                        <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e5e7eb;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>`;
}

/**
 * Phase 87.1 D-05 — Toggle between Overview and Proposals sub-tabs on home page.
 * @param {'overview'|'proposals'} tab
 */
function switchHomeTab(tab) {
    const overviewSection = document.querySelector('.quick-stats');
    const proposalsContent = document.getElementById('homeProposalsContent');
    const overviewBtn = document.getElementById('homeTabOverview');
    const proposalsBtn = document.getElementById('homeTabProposals');

    if (tab === 'proposals') {
        if (overviewSection) overviewSection.style.display = 'none';
        if (proposalsContent) proposalsContent.style.display = '';
        overviewBtn?.classList.remove('home-sub-nav-tab--active');
        proposalsBtn?.classList.add('home-sub-nav-tab--active');
    } else {
        if (overviewSection) overviewSection.style.display = '';
        if (proposalsContent) proposalsContent.style.display = 'none';
        overviewBtn?.classList.add('home-sub-nav-tab--active');
        proposalsBtn?.classList.remove('home-sub-nav-tab--active');
    }
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

            <div class="navigation-cards">
                <div class="nav-card" onclick="location.hash='#/mrf-form'">
                    <div class="nav-card-icon">📝</div>
                    <h3>Material Request</h3>
                    <p>Submit MRF forms and track status</p>
                    <button class="btn btn-primary">Enter →</button>
                </div>

                <div class="nav-card" onclick="location.hash='#/procurement'">
                    <div class="nav-card-icon">🛒</div>
                    <h3>Procurement</h3>
                    <p>Manage MRFs, suppliers & procurement</p>
                    <button class="btn btn-primary">Enter →</button>
                </div>

                <div class="nav-card" onclick="location.hash='#/finance'">
                    <div class="nav-card-icon">💰</div>
                    <h3>Finance Dashboard</h3>
                    <p>Approve PRs and track purchase orders</p>
                    <button class="btn btn-primary">Enter →</button>
                </div>
            </div>

            <div class="quick-stats">
                ${statsContent}
            </div>
            <div class="home-sub-nav" style="display:none;" id="homeSubNav">
                <div class="home-sub-nav-tabs">
                    <button class="home-sub-nav-tab home-sub-nav-tab--active"
                            onclick="window.switchHomeTab('overview')" id="homeTabOverview">Overview</button>
                    <button class="home-sub-nav-tab"
                            onclick="window.switchHomeTab('proposals')" id="homeTabProposals">Proposals</button>
                </div>
            </div>
            <div id="homeProposalsContent" style="display:none;padding:0 1rem;"></div>
        </div>
    `;
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

        // Phase 87.1 D-05 — Proposals sub-tab (one-time getDocs, no listener)
        try {
            const proposalsSnap = await getDocs(collection(db, 'proposals'));
            const allProposals = [];
            proposalsSnap.forEach(d => allProposals.push({ id: d.id, ...d.data() }));

            const filtered = filterProposalsForUser(allProposals);
            const active = filtered.filter(p => p.status !== 'client_approved' && p.status !== 'loss');

            if (active.length > 0) {
                const subNav = document.getElementById('homeSubNav');
                const proposalsContent = document.getElementById('homeProposalsContent');
                if (subNav) subNav.style.display = '';
                if (proposalsContent) {
                    proposalsContent.innerHTML = renderHomeProposalsDashboard(active);
                }
            }
        } catch (err) {
            console.error('[Home] Proposals sub-tab load error:', err);
        }

        // Expose sub-tab switcher
        window.switchHomeTab = switchHomeTab;
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
    // Phase 87.1 D-05 — cleanup sub-tab window function
    delete window.switchHomeTab;

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
