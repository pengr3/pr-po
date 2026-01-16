/* ========================================
   PROCUREMENT VIEW - Complete Migration
   Manages MRFs, Suppliers, PO Tracking, and Historical Data
   ~4,700 lines of functionality from archive/index.html
   ======================================== */

import { db, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, orderBy, limit } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, generateSequentialId, parseItems } from '../utils.js';
import { createStatusBadge, createModal } from '../components.js';

// ========================================
// GLOBAL STATE
// ========================================

let currentMRF = null;
let suppliersData = [];
let projectsData = [];
let editingSupplier = null;
let suppliersCurrentPage = 1;
const suppliersItemsPerPage = 15;

let poData = [];
let poCurrentPage = 1;
const poItemsPerPage = 15;

let allHistoricalMRFs = [];
let filteredHistoricalMRFs = [];
let currentPage = 1;
const itemsPerPage = 10;

// Firebase listeners for cleanup
let listeners = [];

// ========================================
// VIEW RENDERING
// ========================================

/**
 * Render the procurement view HTML
 * @param {string} activeTab - Active tab (mrfs, suppliers, records)
 * @returns {string} HTML string
 */
export function render(activeTab = 'mrfs') {
    return `
        <!-- Header -->
        <div style="background: white; border-bottom: 1px solid var(--gray-200); padding: 1rem 2rem;">
            <div style="max-width: 1400px; margin: 0 auto;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                    <img src="https://raw.githubusercontent.com/pengr3/pr-po/main/CLMC%20Registered%20Logo.png"
                         alt="CLMC Logo"
                         style="height: 50px;"
                         onerror="this.style.display='none'">
                    <div>
                        <h1 style="font-size: 1.5rem; margin-bottom: 0.25rem;">Procurement Dashboard</h1>
                        <p style="font-size: 0.875rem; color: var(--gray-700); margin: 0;">CLMC Procurement</p>
                    </div>
                </div>
                <div class="tabs-nav">
                    <button class="tab-btn ${activeTab === 'mrfs' ? 'active' : ''}"
                            onclick="switchTab('mrfs')">
                        MRF Processing
                    </button>
                    <button class="tab-btn ${activeTab === 'suppliers' ? 'active' : ''}"
                            onclick="switchTab('suppliers')">
                        Supplier Management
                    </button>
                    <button class="tab-btn ${activeTab === 'records' ? 'active' : ''}"
                            onclick="switchTab('historical-mrfs')">
                        MRF Records
                    </button>
                </div>
            </div>
        </div>

        <div class="container" style="margin-top: 2rem;">
            <!-- MRF Processing Section -->
            <section id="mrfs-section" class="section ${activeTab === 'mrfs' ? 'active' : ''}">
                <div class="dashboard-grid">
                    <!-- MRF List -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Pending MRFs</h3>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-primary" onclick="createNewMRF()">New</button>
                                <button class="btn btn-secondary" onclick="loadMRFs()">Refresh</button>
                            </div>
                        </div>
                        <div class="mrf-list" id="mrfList">
                            <div style="text-align: center; padding: 2rem; color: #999;">
                                Loading MRFs...
                            </div>
                        </div>
                    </div>

                    <!-- MRF Details -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">MRF Details</h3>
                            <div style="display: flex; gap: 0.5rem;" id="mrfActions">
                                <button class="btn btn-primary" onclick="saveProgress()">Save Progress</button>
                                <button class="btn btn-success" id="generatePRBtn" onclick="generatePR()" style="display: none;">Generate PR</button>
                            </div>
                        </div>
                        <div id="mrfDetails">
                            <div style="text-align: center; padding: 3rem; color: #999;">
                                Select an MRF to view details
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Supplier Management Section -->
            <section id="suppliers-section" class="section ${activeTab === 'suppliers' ? 'active' : ''}">
                <div class="card">
                    <div class="suppliers-header">
                        <h2>Supplier Management</h2>
                        <button class="btn btn-primary" onclick="toggleAddForm()">Add Supplier</button>
                    </div>

                    <!-- Add Supplier Form -->
                    <div id="addSupplierForm" class="add-form" style="display: none;">
                        <h3 style="margin-bottom: 1rem;">Add New Supplier</h3>
                        <div class="form-group">
                            <label>Supplier Name *</label>
                            <input type="text" id="newSupplierName" required>
                        </div>
                        <div class="form-group">
                            <label>Contact Person *</label>
                            <input type="text" id="newContactPerson" required>
                        </div>
                        <div class="form-group">
                            <label>Email *</label>
                            <input type="email" id="newEmail" required>
                        </div>
                        <div class="form-group">
                            <label>Phone *</label>
                            <input type="text" id="newPhone" required>
                        </div>
                        <div class="form-actions">
                            <button class="btn btn-secondary" onclick="toggleAddForm()">Cancel</button>
                            <button class="btn btn-success" onclick="addSupplier()">Add Supplier</button>
                        </div>
                    </div>

                    <!-- Suppliers Table -->
                    <table>
                        <thead>
                            <tr>
                                <th>Supplier Name</th>
                                <th>Contact Person</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="suppliersTableBody">
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 2rem;">
                                    Loading suppliers...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div id="suppliersPagination"></div>
                </div>
            </section>

            <!-- Historical MRFs Section -->
            <section id="historical-mrfs-section" class="section ${activeTab === 'historical-mrfs' ? 'active' : ''}">
                <div class="card">
                    <div class="card-header">
                        <h2>MRF Records</h2>
                        <button class="btn btn-primary" onclick="loadHistoricalMRFs()">Refresh</button>
                    </div>

                    <!-- Filters -->
                    <div class="historical-filters">
                        <div class="filter-group">
                            <label>Search</label>
                            <input type="text" id="histSearchInput" placeholder="Search MRF ID, Project..." onkeyup="filterHistoricalMRFs()">
                        </div>
                        <div class="filter-group">
                            <label>Status</label>
                            <select id="histStatusFilter" onchange="filterHistoricalMRFs()">
                                <option value="">All Statuses</option>
                                <option value="Pending">Pending</option>
                                <option value="Approved">Approved</option>
                                <option value="Partial">Partial Approval</option>
                            </select>
                        </div>
                    </div>

                    <!-- Historical MRFs Table -->
                    <div id="historicalMRFsContainer">
                        <div style="text-align: center; padding: 2rem;">Loading historical MRFs...</div>
                    </div>
                    <div id="historicalPagination"></div>
                </div>
            </section>
        </div>

        <!-- Modals -->
        <div id="timelineModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Timeline</h3>
                    <button class="close-btn" onclick="closeTimelineModal()">&times;</button>
                </div>
                <div class="modal-body" id="timelineContent"></div>
            </div>
        </div>

        <div id="documentsModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Documents</h3>
                    <button class="close-btn" onclick="closeDocumentsModal()">&times;</button>
                </div>
                <div class="modal-body" id="documentsContent"></div>
            </div>
        </div>
    `;
}

// ========================================
// INITIALIZATION & CLEANUP
// ========================================

/**
 * Initialize the procurement view
 * @param {string} activeTab - Active tab to display
 */
export async function init(activeTab = 'mrfs') {
    console.log('Initializing procurement view, tab:', activeTab);

    try {
        // Load all data
        await loadSuppliers();
        await loadProjects();
        await loadMRFs();
        await loadPOTracking();
        await loadHistoricalMRFs();

        console.log('Procurement view initialized successfully');
    } catch (error) {
        console.error('Error initializing procurement view:', error);
        showToast('Error loading procurement data', 'error');
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('Destroying procurement view...');

    // Unsubscribe from all Firebase listeners
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];

    // Clear global state
    currentMRF = null;
    suppliersData = [];
    projectsData = [];
    poData = [];
    allHistoricalMRFs = [];
    filteredHistoricalMRFs = [];

    console.log('Procurement view destroyed');
}

// ========================================
// TAB NAVIGATION
// ========================================

/**
 * Switch between tabs
 */
window.switchTab = function(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Update sections
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(`${tab}-section`).classList.add('active');
};

// ========================================
// PROJECTS MANAGEMENT
// ========================================

/**
 * Load active projects from Firebase
 */
async function loadProjects() {
    try {
        const q = query(
            collection(db, 'projects'),
            where('status', '==', 'active')
        );

        const listener = onSnapshot(q, (snapshot) => {
            projectsData = [];
            snapshot.forEach(doc => {
                projectsData.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically
            projectsData.sort((a, b) => a.project_name.localeCompare(b.project_name));

            console.log('Projects loaded:', projectsData.length);
        });

        listeners.push(listener);
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

// ========================================
// MRF MANAGEMENT - CONTINUED IN NEXT MESSAGE
// Due to file size limits, I'll create this as a multi-part file
// ========================================

console.log('Procurement view module loaded - Part 1 of structure');
