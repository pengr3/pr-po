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
    activePOs: 0
};

/**
 * Render the home page
 * @returns {string} HTML string for home page
 */
export function render() {
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
        // Load real-time stats from Firebase
        loadStats();
    } catch (error) {
        console.error('Error initializing home view:', error);
    }
}

/**
 * Load real-time statistics
 */
function loadStats() {
    // Active MRFs (Pending status)
    const mrfListener = onSnapshot(
        query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
        (snapshot) => {
            stats.activeMRFs = snapshot.size;
            updateStatDisplay('stat-mrfs', stats.activeMRFs);
        },
        (error) => {
            console.error('Error loading MRF stats:', error);
        }
    );
    statsListeners.push(mrfListener);

    // Pending PRs (finance_status == Pending)
    const prListener = onSnapshot(
        query(collection(db, 'prs'), where('finance_status', '==', 'Pending')),
        (snapshot) => {
            stats.pendingPRs = snapshot.size;
            updateStatDisplay('stat-prs', stats.pendingPRs);
        },
        (error) => {
            console.error('Error loading PR stats:', error);
        }
    );
    statsListeners.push(prListener);

    // Active POs (procurement_status != Delivered)
    const poListener = onSnapshot(
        collection(db, 'pos'),
        (snapshot) => {
            stats.activePOs = snapshot.docs.filter(doc => {
                const status = doc.data().procurement_status;
                return status && status !== 'Delivered';
            }).length;
            updateStatDisplay('stat-pos', stats.activePOs);
        },
        (error) => {
            console.error('Error loading PO stats:', error);
        }
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
        activePOs: 0
    };
}

console.log('Home view module loaded');
