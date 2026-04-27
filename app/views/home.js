/* ========================================
   HOME / HERO PAGE VIEW
   Landing page with navigation cards and quick stats
   ======================================== */

import { db, collection, query, where, onSnapshot } from '../firebase.js';

// Status option arrays — canonical source: app/views/projects.js:28-43
// Inlined per RESEARCH Open Question 1 recommendation (zero-build static site; no bundler)
const INTERNAL_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'For Internal Approval',
    'Ready to Submit'
];

const PROJECT_STATUS_OPTIONS = [
    'Pending Client Review',
    'Under Client Review',
    'Approved by Client',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];

// View state
let statsListeners = [];
let cachedStats = {
    // Procurement pipeline (D-01)
    activeMRFs: null,
    pendingPRs: null,
    activePOs: null,
    // Legacy keys kept for backward compatibility (no longer rendered)
    activeServices: null,
    servicesMRFs: null,
    // Phase 77 — status breakdown maps (D-02, D-03)
    projectsByInternalStatus: null,
    projectsByProjectStatus: null,
    servicesByInternalStatusOneTime: null,
    servicesByProjectStatusOneTime: null,
    servicesByInternalStatusRecurring: null,
    servicesByProjectStatusRecurring: null
};

// Phase 77.1 — Chart.js instance registry: containerId → Chart instance
// Used so onSnapshot callbacks can call .update() on existing charts (vs recreating)
// and destroy() can tear them all down on view exit.
const chartInstances = new Map();

// Phase 77.1 — color palette per D-04 (CONTEXT.md):
// 4 highlighted statuses get muted brand colors; all others get graduated slate shades
// (neighboring hues within the same cool gray family, not a single flat color).
const HIGHLIGHTED_STATUS_COLORS = {
    'For Inspection': 'rgba(26, 115, 232, 0.55)',     // muted --primary
    'For Proposal': 'rgba(52, 168, 83, 0.55)',        // muted --success
    'Under Client Review': 'rgba(251, 188, 4, 0.65)', // muted --warning
    'On-going': 'rgba(26, 115, 232, 0.55)'            // muted --primary (shared brand hue)
};
// Non-highlighted statuses — graduated slate shades (same cool-gray family, different depths).
// Lighter shades = "earlier" / less active; slightly darker = "terminal" / completed states.
const MONOCHROMATIC_STATUS_COLORS = {
    // Internal Status — 2 non-highlighted
    'For Internal Approval': 'rgba(148, 163, 184, 0.38)',
    'Ready to Submit':       'rgba(148, 163, 184, 0.60)',
    // Project Status — 5 non-highlighted
    'Pending Client Review': 'rgba(203, 213, 225, 0.85)', // slate-300 family — lightest
    'Approved by Client':    'rgba(148, 163, 184, 0.40)',
    'For Mobilization':      'rgba(148, 163, 184, 0.55)',
    'Completed':             'rgba(148, 163, 184, 0.68)',
    'Loss':                  'rgba(100, 116, 139, 0.55)'  // slate-500 family — deepest
};
const MONOCHROMATIC_FALLBACK = 'rgba(148, 163, 184, 0.55)'; // fallback for unknown statuses

function getBarColor(statusLabel) {
    return HIGHLIGHTED_STATUS_COLORS[statusLabel]
        || MONOCHROMATIC_STATUS_COLORS[statusLabel]
        || MONOCHROMATIC_FALLBACK;
}

// Map containerId → wrapper class so buildStatusBreakdownContainer can emit correct sizing.
// Internal sections have 4 bars; Project sections have 7 bars (matches enum lengths).
function getChartSizeClass(containerId) {
    return containerId.endsWith('-internal') ? 'hs-chart-internal' : 'hs-chart-project';
}

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
 * Build HTML wrapper for a status breakdown chart.
 * Phase 77.1: emits a <canvas> inside a sized wrapper instead of a text-row grid.
 * Chart.js initialization happens later in renderStatusBreakdown(), called from
 * the onSnapshot callbacks in loadStats(). Skeleton loading state is just an
 * empty wrapper — the chart fills in on first snapshot fire (typically <500ms).
 * @param {string} containerId - ID assigned to the <canvas> element
 * @param {Object|null} countsMap - cached counts (unused here; kept for signature parity with Phase 77)
 * @param {number} rowCount - bar count, used to pick chart size class (unused param kept for signature parity)
 * @returns {string}
 */
function buildStatusBreakdownContainer(containerId, countsMap, rowCount) {
    const sizeClass = getChartSizeClass(containerId);
    return `<div class="hs-chart-canvas ${sizeClass}"><canvas id="${containerId}"></canvas></div>`;
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
 * Build Projects card HTML (D-02) — shown when mode === 'projects' || mode === 'both'
 * @returns {string}
 */
function projectsCardHtml() {
    return `
        <div class="hs-stat-card">
            <h4 class="hs-stat-card-title">Projects</h4>
            <div class="hs-section-group">
                <div class="hs-section-heading">Internal Status</div>
                ${buildStatusBreakdownContainer('stat-projects-internal', cachedStats.projectsByInternalStatus, 4)}
            </div>
            <div class="hs-section-group">
                <div class="hs-section-heading">Project Status</div>
                ${buildStatusBreakdownContainer('stat-projects-project', cachedStats.projectsByProjectStatus, 7)}
            </div>
        </div>
    `;
}

/**
 * Build Services card HTML (D-03) — shown when mode === 'services' || mode === 'both'
 * Stacked sections: One-time above, Recurring below, separated by <hr class="hs-divider">.
 * @returns {string}
 */
function servicesCardHtml() {
    return `
        <div class="hs-stat-card">
            <h4 class="hs-stat-card-title">Services</h4>
            <div class="hs-type-section">
                <span class="hs-type-label">One-time</span>
                <div class="hs-section-group">
                    <div class="hs-section-heading">Internal Status</div>
                    ${buildStatusBreakdownContainer('stat-services-ot-internal', cachedStats.servicesByInternalStatusOneTime, 4)}
                </div>
                <div class="hs-section-group">
                    <div class="hs-section-heading">Project Status</div>
                    ${buildStatusBreakdownContainer('stat-services-ot-project', cachedStats.servicesByProjectStatusOneTime, 7)}
                </div>
            </div>
            <hr class="hs-divider">
            <div class="hs-type-section">
                <span class="hs-type-label">Recurring</span>
                <div class="hs-section-group">
                    <div class="hs-section-heading">Internal Status</div>
                    ${buildStatusBreakdownContainer('stat-services-rec-internal', cachedStats.servicesByInternalStatusRecurring, 4)}
                </div>
                <div class="hs-section-group">
                    <div class="hs-section-heading">Project Status</div>
                    ${buildStatusBreakdownContainer('stat-services-rec-project', cachedStats.servicesByProjectStatusRecurring, 7)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render or update a Chart.js horizontal bar chart for a status breakdown.
 * Phase 77.1: replaces text-row injection with Chart.js create-or-update.
 * - First call (no chart instance): creates new Chart, stores in chartInstances.
 * - Subsequent calls (chart exists): mutates chart.data and calls chart.update().
 * Guards against missing canvas element (DOM may not exist on first snapshot).
 * Guards against missing window.Chart (CDN failure / network blocked).
 * @param {string} containerId - ID of the <canvas> element
 * @param {Object} countsMap - { statusName: count, ... }
 */
function renderStatusBreakdown(containerId, countsMap) {
    const canvas = document.getElementById(containerId);
    if (!canvas) return;
    if (typeof window.Chart !== 'function') {
        console.error('[Home] Chart.js not loaded — verify CDN script tag in index.html');
        return;
    }

    const labels = Object.keys(countsMap);
    const data = Object.values(countsMap);
    const backgroundColor = labels.map(getBarColor);

    const existing = chartInstances.get(containerId);
    if (existing) {
        // Update in place — preserves canvas, no flicker
        existing.data.labels = labels;
        existing.data.datasets[0].data = data;
        existing.data.datasets[0].backgroundColor = backgroundColor;
        existing.update();
        return;
    }

    // First render — create new Chart instance
    const chart = new window.Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor,
                borderWidth: 0,
                barPercentage: 0.85,
                categoryPercentage: 0.85
            }]
        },
        options: {
            indexAxis: 'y',
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        // Show only "{count}" in tooltip body (label already on y-axis)
                        label: (ctx) => ` ${ctx.parsed.x}`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0, font: { size: 10 } },
                    grid: { color: 'rgba(0, 0, 0, 0.04)' }
                },
                y: {
                    ticks: { font: { size: 10 } },
                    grid: { display: false }
                }
            }
        }
    });
    chartInstances.set(containerId, chart);
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
    if (mode === 'projects' || mode === 'both') {
        statsContent += projectsCardHtml();
    }
    if (mode === 'services' || mode === 'both') {
        statsContent += servicesCardHtml();
    }

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
        if (cachedStats.activeMRFs !== null || cachedStats.activeServices !== null) {
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

    // ---- Projects card (D-02) ----
    if (mode === 'projects' || mode === 'both') {
        const projectsListener = onSnapshot(
            collection(db, 'projects'),
            (snapshot) => {
                const byInternal = {};
                const byProject = {};
                INTERNAL_STATUS_OPTIONS.forEach(s => { byInternal[s] = 0; });
                PROJECT_STATUS_OPTIONS.forEach(s => { byProject[s] = 0; });
                snapshot.forEach(doc => {
                    const d = doc.data();
                    if (d.internal_status && byInternal[d.internal_status] !== undefined) {
                        byInternal[d.internal_status]++;
                    }
                    if (d.project_status && byProject[d.project_status] !== undefined) {
                        byProject[d.project_status]++;
                    }
                });
                cachedStats.projectsByInternalStatus = byInternal;
                cachedStats.projectsByProjectStatus = byProject;
                renderStatusBreakdown('stat-projects-internal', byInternal);
                renderStatusBreakdown('stat-projects-project', byProject);
            },
            (error) => { console.error('[Home] Error loading projects stats:', error); }
        );
        statsListeners.push(projectsListener);
    }

    // ---- Services card (D-03) ----
    if (mode === 'services' || mode === 'both') {
        const servicesListener = onSnapshot(
            collection(db, 'services'),
            (snapshot) => {
                const otInternal = {};
                const otProject = {};
                const recInternal = {};
                const recProject = {};
                INTERNAL_STATUS_OPTIONS.forEach(s => {
                    otInternal[s] = 0;
                    recInternal[s] = 0;
                });
                PROJECT_STATUS_OPTIONS.forEach(s => {
                    otProject[s] = 0;
                    recProject[s] = 0;
                });
                snapshot.forEach(doc => {
                    const d = doc.data();
                    const isOneTime = d.service_type === 'one-time';
                    const isRecurring = d.service_type === 'recurring';
                    if (isOneTime) {
                        if (d.internal_status && otInternal[d.internal_status] !== undefined) otInternal[d.internal_status]++;
                        if (d.project_status && otProject[d.project_status] !== undefined) otProject[d.project_status]++;
                    } else if (isRecurring) {
                        if (d.internal_status && recInternal[d.internal_status] !== undefined) recInternal[d.internal_status]++;
                        if (d.project_status && recProject[d.project_status] !== undefined) recProject[d.project_status]++;
                    }
                });
                cachedStats.servicesByInternalStatusOneTime = otInternal;
                cachedStats.servicesByProjectStatusOneTime = otProject;
                cachedStats.servicesByInternalStatusRecurring = recInternal;
                cachedStats.servicesByProjectStatusRecurring = recProject;
                renderStatusBreakdown('stat-services-ot-internal', otInternal);
                renderStatusBreakdown('stat-services-ot-project', otProject);
                renderStatusBreakdown('stat-services-rec-internal', recInternal);
                renderStatusBreakdown('stat-services-rec-project', recProject);
            },
            (error) => { console.error('[Home] Error loading services stats:', error); }
        );
        statsListeners.push(servicesListener);
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
        element.classList.remove('loading');
        element.classList.remove('stat-refreshing');
    }
}

/**
 * Cleanup when leaving the view
 * Phase 77.1: also tears down Chart.js instances so canvases can be garbage-collected
 * and re-creating the view doesn't leave orphaned charts bound to detached DOM nodes.
 */
export async function destroy() {
    // Unsubscribe from all Firestore listeners
    statsListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    statsListeners = [];

    // Phase 77.1 — destroy Chart.js instances and clear the registry
    chartInstances.forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    chartInstances.clear();

    // cachedStats intentionally NOT reset — stale-while-revalidate pattern:
    // preserved values shown immediately on next visit while fresh data loads
}
