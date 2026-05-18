/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats
   ======================================== */

import { db, collection, query, where, onSnapshot } from '../firebase.js';

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
