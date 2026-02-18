/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats
   ======================================== */

import { db, collection, query, where, onSnapshot } from '../firebase.js';

// View state
let statsListeners = [];
let stats = {
    activeMRFs: 0,
    pendingPRs: 0,
    activePOs: 0,
    activeServices: 0,   // DASH-01
    servicesMRFs: 0      // DASH-02
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
 * Build HTML for Projects stat items
 * @returns {string}
 */
function projectsStatsHtml() {
    return `
        <div class="stat-item">
            <span class="stat-label">Active MRFs</span>
            <span class="stat-value" id="stat-mrfs">${stats.activeMRFs}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Pending PRs</span>
            <span class="stat-value" id="stat-prs">${stats.pendingPRs}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Active POs</span>
            <span class="stat-value" id="stat-pos">${stats.activePOs}</span>
        </div>
    `;
}

/**
 * Build HTML for Services stat items
 * @returns {string}
 */
function servicesStatsHtml() {
    return `
        <div class="stat-item">
            <span class="stat-label">Active Services</span>
            <span class="stat-value" id="stat-services">${stats.activeServices}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Active MRFs</span>
            <span class="stat-value" id="stat-services-mrfs">${stats.servicesMRFs}</span>
        </div>
    `;
}

/**
 * Render the home page
 * @returns {string} HTML string for home page
 */
export function render() {
    const mode = getDashboardMode();

    let statsContent;
    if (mode === 'both') {
        statsContent = `
            <div class="stat-group">
                <span class="stat-group-label">Projects</span>
                <div class="stat-group-items">
                    ${projectsStatsHtml()}
                </div>
            </div>
            <div class="stat-group-divider"></div>
            <div class="stat-group">
                <span class="stat-group-label">Services</span>
                <div class="stat-group-items">
                    ${servicesStatsHtml()}
                </div>
            </div>
        `;
    } else if (mode === 'services') {
        statsContent = servicesStatsHtml();
    } else {
        statsContent = projectsStatsHtml();
    }

    return `
        <div class="hero-section">
            <h1 class="hero-title">🏗️ CLMC Engineering</h1>
            <p class="hero-subtitle">Procurement Management System</p>

            <div class="navigation-cards">
                <div class="nav-card" onclick="location.hash='#/mrf-form'">
                    <div class="nav-card-icon">📝</div>
                    <h3>Material Request</h3>
                    <p>Submit MRF forms and track status</p>
                    <button class="btn btn-primary">Enter →</button>
                </div>

                <div class="nav-card" onclick="location.hash='#/procurement'">
                    <div class="nav-card-icon">🏭</div>
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
    console.log('Initializing home view...');

    try {
        const mode = getDashboardMode();
        loadStats(mode);
    } catch (error) {
        console.error('Error initializing home view:', error);
    }
}

/**
 * Load real-time statistics based on dashboard mode
 * @param {'projects'|'services'|'both'} mode
 */
function loadStats(mode) {
    if (mode === 'projects' || mode === 'both') {
        // Active MRFs — Projects dept (legacy-safe: docs without department field = projects)
        const mrfListener = onSnapshot(
            query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
            (snapshot) => {
                stats.activeMRFs = snapshot.docs.filter(d =>
                    (d.data().department || 'projects') === 'projects'
                ).length;
                updateStatDisplay('stat-mrfs', stats.activeMRFs);
            },
            (error) => { console.error('[Home] Error loading MRF stats:', error); }
        );
        statsListeners.push(mrfListener);

        // Pending PRs (unchanged, no dept filter per decisions)
        const prListener = onSnapshot(
            query(collection(db, 'prs'), where('finance_status', '==', 'Pending')),
            (snapshot) => {
                stats.pendingPRs = snapshot.size;
                updateStatDisplay('stat-prs', stats.pendingPRs);
            },
            (error) => { console.error('[Home] Error loading PR stats:', error); }
        );
        statsListeners.push(prListener);

        // Active POs (unchanged, no dept filter per decisions)
        const poListener = onSnapshot(
            collection(db, 'pos'),
            (snapshot) => {
                stats.activePOs = snapshot.docs.filter(doc => {
                    const status = doc.data().procurement_status;
                    return status && status !== 'Delivered';
                }).length;
                updateStatDisplay('stat-pos', stats.activePOs);
            },
            (error) => { console.error('[Home] Error loading PO stats:', error); }
        );
        statsListeners.push(poListener);
    }

    if (mode === 'services' || mode === 'both') {
        // Active Services — use active !== false to handle legacy docs without the field
        const servicesListener = onSnapshot(
            collection(db, 'services'),
            (snapshot) => {
                stats.activeServices = snapshot.docs.filter(d =>
                    d.data().active !== false
                ).length;
                updateStatDisplay('stat-services', stats.activeServices);
            },
            (error) => { console.error('[Home] Error loading services stats:', error); }
        );
        statsListeners.push(servicesListener);

        // Services MRFs — single-field Pending query, filter dept client-side (no composite index)
        const servicesMRFListener = onSnapshot(
            query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
            (snapshot) => {
                stats.servicesMRFs = snapshot.docs.filter(d =>
                    d.data().department === 'services'
                ).length;
                updateStatDisplay('stat-services-mrfs', stats.servicesMRFs);
            },
            (error) => { console.error('[Home] Error loading services MRF stats:', error); }
        );
        statsListeners.push(servicesMRFListener);
    }
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
        // Remove loading class if present
        element.classList.remove('loading');
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('Destroying home view...');

    // Unsubscribe from all listeners
    statsListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    statsListeners = [];

    // Reset stats
    stats = {
        activeMRFs: 0,
        pendingPRs: 0,
        activePOs: 0,
        activeServices: 0,
        servicesMRFs: 0
    };
}

console.log('Home view module loaded');
