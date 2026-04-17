/* ========================================
   MRF SUBMISSION FORM VIEW
   Public form for submitting Material Request Forms
   Supports 2 sub-tabs:
     - 'form'        → Material Request Form (default)
     - 'my-requests' → My Requests: user's submitted MRFs
   ======================================== */

import { db, collection, addDoc, getDocs, getDoc, query, where, onSnapshot, doc, updateDoc } from '../firebase.js';
import { showLoading as utilsShowLoading, showAlert as utilsShowAlert } from '../utils.js';
import { skeletonTableRows } from '../components.js';

// View state
let projectsListener = null;
let cachedProjects = [];   // Holds the latest projects from the onSnapshot callback
let servicesListener = null;
let cachedServices = [];   // Holds the latest services from the onSnapshot callback

// My Requests sub-tab controller (from mrf-records.js)
let myRequestsController = null;

// Phase 74-01: Scroll-hide/show handler for sticky MRF sub-nav pill bar
let _mrfNavScrollHandler = null;
let _mrfNavLastScrollY = 0;

// Phase 74-02: Module-level refs for scoped sync handlers on .mrf-items-section.
// REVIEWS [HIGH]: Stored as module-level vars (not window globals) so
// destroy() can call removeEventListener and avoid zombie handlers.
let _mrfItemSyncHandler = null;        // for 'input' events
let _mrfItemSyncChangeHandler = null;  // for 'change' events

// ----------------------------------------
// SUB-TAB NAVIGATION RENDER
// ----------------------------------------

function renderSubTabNav(activeTab) {
    return `
        <nav class="mrf-sub-nav" id="mrfSubNav" role="navigation" aria-label="Material Request sections">
            <div class="mrf-sub-nav-inner">
                <div class="mrf-sub-nav-tabs" role="tablist">
                    <button type="button"
                        class="mrf-sub-nav-tab ${activeTab === 'form' ? 'mrf-sub-nav-tab--active' : ''}"
                        role="tab"
                        aria-selected="${activeTab === 'form' ? 'true' : 'false'}"
                        onclick="window.navigateToTab('form')">
                        Material Request Form
                    </button>
                    <button type="button"
                        class="mrf-sub-nav-tab ${activeTab === 'my-requests' ? 'mrf-sub-nav-tab--active' : ''}"
                        role="tab"
                        aria-selected="${activeTab === 'my-requests' ? 'true' : 'false'}"
                        onclick="window.navigateToTab('my-requests')">
                        My Requests
                    </button>
                </div>
            </div>
        </nav>
    `;
}

// ----------------------------------------
// MY REQUESTS VIEW RENDER
// ----------------------------------------

function renderMyRequestsView(tabNav) {
    return `
        <div style="min-height: 100vh; background: #f8fafc;">
            ${tabNav}
            <div class="container" style="max-width: 1600px; margin: 0 auto; padding: 2rem;">
                <div class="card">
                    <div class="card-header">
                        <h2>My Requests</h2>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="window._myRequestsExportCSV()">Export CSV</button>
                            <button class="btn btn-secondary" onclick="window._myRequestsReload()">Refresh</button>
                        </div>
                    </div>
                    <div style="padding: 0 1.5rem 1.5rem 1.5rem;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem;">
                            <div class="filter-group">
                                <label>MRF Status</label>
                                <select id="myRequestsStatusFilter" onchange="window._myRequestsFilter()">
                                    <option value="">All MRF Statuses</option>
                                    <option value="Pending">Pending</option>
                                    <option value="PR Generated">PR Generated</option>
                                    <option value="TR Submitted">TR Submitted</option>
                                    <option value="Finance Approved">Finance Approved</option>
                                    <option value="PO Issued">PO Issued</option>
                                    <option value="Delivered">Delivered</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Urgency</label>
                                <select id="myRequestsUrgencyFilter" onchange="window._myRequestsFilter()">
                                    <option value="">All Urgencies</option>
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label>Search</label>
                                <input type="text" id="myRequestsSearch" placeholder="MRF ID, Project..." onkeyup="window._myRequestsFilter()">
                            </div>
                        </div>
                    </div>
                    <div id="myRequestsContainer" style="overflow-x: auto; padding: 0 0 1rem 0;">
                        <div class="table-scroll-container">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600; cursor: pointer; user-select: none;">MRF ID <span style="color: #94a3b8; font-size: 0.65rem;">&#x21C5;</span></th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Project</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600; cursor: pointer; user-select: none;">Date Needed <span style="color: #1a73e8; font-size: 0.65rem;">&#x2191;</span></th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">PRs</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">POs</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600; cursor: pointer; user-select: none;">MRF Status <span style="color: #94a3b8; font-size: 0.65rem;">&#x21C5;</span></th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600; cursor: pointer; user-select: none;">Procurement Status <span style="color: #94a3b8; font-size: 0.65rem;">&#x21C5;</span></th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>${skeletonTableRows(8, 5)}</tbody>
                        </table>
                        </div>
                    </div>
                    <div id="myRequestsContainerPagination"></div>
                </div>
            </div>
        </div>
    `;
}

// ----------------------------------------
// MAIN RENDER
// ----------------------------------------

/**
 * Render the MRF view (form or my-requests sub-tab)
 * @param {string} activeTab - 'form' (default) or 'my-requests'
 * @returns {string} HTML string
 */
export function render(activeTab = 'form') {
    const tabNav = renderSubTabNav(activeTab);

    if (activeTab === 'my-requests') {
        return renderMyRequestsView(tabNav);
    }

    // --- FORM TAB ---
    // Check edit permission - this is a create form, so block if no edit permission
    const canEdit = window.canEditTab?.('mrf_form');

    // If user has no edit permission, show blocked message (but still show sub-tab nav)
    if (canEdit === false) {
        return `
            <div style="min-height: 100vh; background: #f8fafc;">
                ${tabNav}
                <div class="container" style="padding: 2rem;">
                    <div class="view-only-notice">
                        <span class="notice-icon">👁</span>
                        <span>You have view-only access. You cannot create or edit Material Requests.</span>
                    </div>
                    <button class="btn btn-secondary" onclick="location.hash='#/'">
                        Back to Dashboard
                    </button>
                </div>
            </div>
        `;
    }

    return `
        <div style="min-height: 100vh; background: #f8fafc;">
            ${tabNav}
            <div style="max-width: 1100px; margin: 2rem auto; background: white; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow: hidden;">
                <div style="background: var(--primary); color: white; padding: 2rem; text-align: center;">
                    <h1 style="font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; color: white;">Material Request Form (MRF)</h1>
                    <p style="opacity: 0.9; font-size: 0.95rem; color: white;">CLMC Engineering Services</p>
                </div>

                <div style="padding: 2rem;">
                    <!-- Alert Messages -->
                    <div id="alertSuccess" class="alert alert-success"></div>
                    <div id="alertError" class="alert alert-error"></div>
                    <div id="alertWarning" class="alert alert-warning"></div>

                    <!-- Loading State -->
                    <div id="loading" class="loading">
                        <div class="loading-spinner">
                            <div class="spinner"></div>
                            <p>Submitting your request...</p>
                        </div>
                    </div>

                    <!-- Form -->
                    <form id="mrfForm">
                        <!-- Request Type Section -->
                        <div style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Request Type</h2>
                            <div class="form-group full-width">
                                <label>Select Request Type *</label>
                                <div class="radio-group">
                                    <div class="radio-option">
                                        <input type="radio" id="typeMaterial" name="requestType" value="material" checked>
                                        <label for="typeMaterial">Material/Sub Contractor</label>
                                    </div>
                                    <div class="radio-option">
                                        <input type="radio" id="typeService" name="requestType" value="service">
                                        <label for="typeService">Delivery/Hauling/Transportation</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Urgency Level Section -->
                        <div style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Urgency Level</h2>
                            <div class="form-group full-width">
                                <label>Select Urgency Level *</label>
                                <div class="radio-group" style="flex-direction: column; gap: 0.75rem;">
                                    <div class="radio-option">
                                        <input type="radio" id="urgencyLow" name="urgencyLevel" value="Low" checked>
                                        <label for="urgencyLow" style="color: #22c55e;">Low - Standard processing (5-7 business days)</label>
                                    </div>
                                    <div class="radio-option">
                                        <input type="radio" id="urgencyMedium" name="urgencyLevel" value="Medium">
                                        <label for="urgencyMedium" style="color: #f59e0b;">Medium - Priority processing (3-5 business days)</label>
                                    </div>
                                    <div class="radio-option">
                                        <input type="radio" id="urgencyHigh" name="urgencyLevel" value="High">
                                        <label for="urgencyHigh" style="color: #ef4444;">High - Urgent processing (1-2 business days)</label>
                                    </div>
                                    <div class="radio-option">
                                        <input type="radio" id="urgencyCritical" name="urgencyLevel" value="Critical">
                                        <label for="urgencyCritical" style="color: #dc2626; font-weight: 600;">Critical - Immediate attention required (same day if possible)</label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Basic Information -->
                        <div style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Basic Information</h2>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                                <div id="projectServiceGroup" style="grid-column: 1 / -1;">
                                    <div class="form-group">
                                        <label id="projectServiceLabel" for="projectServiceSelect">Project / Service *</label>
                                        <select id="projectServiceSelect">
                                            <option value="">Loading...</option>
                                            <optgroup id="projectsOptgroup" label="Projects"></optgroup>
                                            <optgroup id="servicesOptgroup" label="Services"></optgroup>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label for="requestorName">Requestor Name</label>
                                    <input type="text" id="requestorName" readonly required style="background: #f8fafc; cursor: not-allowed; color: #475569;">
                                </div>
                                <div class="form-group">
                                    <label for="dateNeeded">Date Needed *</label>
                                    <input type="date" id="dateNeeded" required>
                                </div>
                            </div>
                        </div>

                        <!-- Delivery Information -->
                        <div style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Delivery Information</h2>
                            <div class="form-group full-width">
                                <label for="deliveryAddress">Delivery Address *</label>
                                <textarea id="deliveryAddress" rows="3" placeholder="Enter complete delivery address (e.g., 3rd Floor, Building A, 123 Main St, BGC, Taguig City 1634)" required></textarea>
                            </div>
                        </div>

                        <!-- Items Requested -->
                        <div class="mrf-items-section" style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Items Requested</h2>
                            <div class="table-scroll-container" style="margin: 1rem 0;">
                                <table style="font-size: 0.875rem;">
                                    <thead>
                                        <tr>
                                            <th style="width: 25%;">Item Description *</th>
                                            <th style="width: 10%;">Quantity *</th>
                                            <th style="width: 15%;">Unit *</th>
                                            <th style="width: 20%;">Category *</th>
                                            <th style="width: 10%;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody id="itemsTableBody">
                                        <tr>
                                            <td><input type="text" class="item-name" required></td>
                                            <td><input type="number" class="item-qty" min="0.01" step="any" required></td>
                                            <td>
                                                <select class="item-unit" onchange="toggleCustomUnit(this)" required>
                                                    <option value="">Select Unit</option>
                                                    <option value="pcs">pcs</option>
                                                    <option value="boxes">boxes</option>
                                                    <option value="bags">bags</option>
                                                    <option value="lot">lot</option>
                                                    <option value="gallons">gallons</option>
                                                    <option value="bottles">bottles</option>
                                                    <option value="bundle">bundle</option>
                                                    <option value="cans">cans</option>
                                                    <option value="trucks">trucks</option>
                                                    <option value="ride">ride</option>
                                                    <option value="sheets">sheets</option>
                                                    <option value="yards">yards</option>
                                                    <option value="pail">pail</option>
                                                    <option value="rolls">rolls</option>
                                                    <option value="sets">sets</option>
                                                    <option value="packs">Packs</option>
                                                    <option value="liter">liter</option>
                                                    <option value="pairs">pairs</option>
                                                    <option value="meters">meters</option>
                                                    <option value="quarts">quarts</option>
                                                    <option value="kg">kg</option>
                                                    <option value="others">Others (specify)</option>
                                                </select>
                                                <input type="text" class="custom-unit-input" placeholder="Specify unit" style="display: none; margin-top: 0.5rem;">
                                            </td>
                                            <td>
                                                <select class="item-category" required>
                                                    <option value="">Select Category</option>
                                                    <option value="CIVIL">CIVIL</option>
                                                    <option value="ELECTRICAL">ELECTRICAL</option>
                                                    <option value="HVAC">HVAC</option>
                                                    <option value="PLUMBING">PLUMBING</option>
                                                    <option value="TOOLS & EQUIPMENTS">TOOLS & EQUIPMENTS</option>
                                                    <option value="SAFETY">SAFETY</option>
                                                    <option value="SUBCON">SUBCON</option>
                                                    <option value="TRANSPORTATION">TRANSPORTATION</option>
                                                    <option value="HAULING & DELIVERY">HAULING & DELIVERY</option>
                                                    <option value="DELIVERY BY SUPPLIER">DELIVERY BY SUPPLIER</option>
                                                    <option value="OTHERS">OTHERS</option>
                                                </select>
                                            </td>
                                            <td>
                                                <button type="button" class="btn btn-danger" style="padding: 0.5rem 0.75rem; font-size: 0.75rem;" onclick="removeItem(this)">Remove</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="mrf-item-card-list" id="mrfItemCardList">
                                ${buildItemCardHTML(0)}
                            </div>
                            <button type="button" class="btn btn-secondary mrf-add-item-btn" onclick="addItem()">Add Another Item</button>
                        </div>

                        <!-- Justification -->
                        <div style="margin-bottom: 2rem;">
                            <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--gray-800); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--gray-200);">Justification</h2>
                            <div class="form-group full-width">
                                <label for="justification">Reason for Request *</label>
                                <textarea id="justification" rows="4" placeholder="Please explain why these items/services are needed..." required></textarea>
                            </div>
                        </div>

                        <!-- Form Actions -->
                        <div class="form-actions" style="border-top: 2px solid var(--gray-200); padding-top: 2rem;">
                            <button type="button" class="btn btn-secondary" onclick="resetForm()">Reset Form</button>
                            <button type="submit" class="btn btn-success">Submit Request</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
}

// ----------------------------------------
// INIT
// ----------------------------------------

/**
 * Initialize the MRF form view
 * @param {string} activeTab - 'form' (default) or 'my-requests'
 */
export async function init(activeTab = 'form') {
    // Phase 74-01: Attach scroll-hide/show listener for the sticky MRF sub-nav.
    // Router does NOT call destroy() when switching sub-tabs within MRF view,
    // so guard against re-attach on repeated init() calls.
    if (!_mrfNavScrollHandler) {
        _mrfNavLastScrollY = window.scrollY || 0;
        const SCROLL_THRESHOLD = 80;
        _mrfNavScrollHandler = function () {
            const nav = document.getElementById('mrfSubNav');
            if (!nav) return;
            const currentY = window.scrollY || 0;
            const prevY = _mrfNavLastScrollY;
            _mrfNavLastScrollY = currentY; // always update first
            if (currentY < SCROLL_THRESHOLD) {
                // Always show when near top of page.
                nav.style.transform = 'translateY(0)';
                nav.style.opacity = '1';
            } else if (currentY > prevY) {
                // Scrolling DOWN past threshold — hide.
                nav.style.transform = 'translateY(-100%)';
                nav.style.opacity = '0';
            } else if (currentY < prevY) {
                // Scrolling UP at any position — show.
                nav.style.transform = 'translateY(0)';
                nav.style.opacity = '1';
            }
        };
        window.addEventListener('scroll', _mrfNavScrollHandler, { passive: true });
    }

    if (activeTab === 'my-requests') {
        // Clean up form listeners from previous sub-tab if switching from form → my-requests
        if (projectsListener) { projectsListener(); projectsListener = null; }
        if (servicesListener) { servicesListener(); servicesListener = null; }
        if (window._mrfFormAssignmentHandler) {
            window.removeEventListener('assignmentsChanged', window._mrfFormAssignmentHandler);
            delete window._mrfFormAssignmentHandler;
        }

        await initMyRequests();
        return;
    }

    // --- FORM TAB INIT ---

    // Clean up My Requests controller if switching from my-requests → form
    if (myRequestsController) {
        myRequestsController.destroy();
        myRequestsController = null;
        delete window._myRequestsFilter;
        delete window._myRequestsReload;
        delete window._myRequestsExportCSV;
        delete window._myRequestsSort;
        delete window._myRequestsCancelMRF;
        delete window._myRequestsEditMRF;
    }

    try {
        // Set minimum date to today
        const dateInput = document.getElementById('dateNeeded');
        if (dateInput) {
            dateInput.min = new Date().toISOString().split('T')[0];
        }

        // Auto-populate requestor name from current user
        const user = window.getCurrentUser?.();
        if (user && user.full_name) {
            const requestorInput = document.getElementById('requestorName');
            if (requestorInput) {
                requestorInput.value = user.full_name;
            }
        }

        // Load projects
        loadProjects();

        // Role-based dropdown visibility (MRF-01, MRF-02, MRF-03)
        const role = user?.role || '';
        const showProjects = ['super_admin', 'finance', 'procurement', 'operations_admin', 'operations_user'].includes(role);
        const showServices = ['super_admin', 'finance', 'procurement', 'services_admin', 'services_user'].includes(role);

        // Update combined dropdown label and placeholder for single-dept roles
        const psl = document.getElementById('projectServiceLabel');
        const pss = document.getElementById('projectServiceSelect');
        if (psl && pss) {
            if (!showServices) {
                psl.textContent = 'Project *';
                pss.options[0].textContent = '-- Select a project --';
            } else if (!showProjects) {
                psl.textContent = 'Service *';
                pss.options[0].textContent = '-- Select a service --';
            } else {
                pss.options[0].textContent = '-- Select a project or service --';
            }
        }

        const projectsOptgroup = document.getElementById('projectsOptgroup');
        const servicesOptgroup = document.getElementById('servicesOptgroup');
        if (projectsOptgroup) projectsOptgroup.hidden = !showProjects;
        if (servicesOptgroup) servicesOptgroup.hidden = !showServices;

        if (showServices) {
            loadServices();
        }

        // Phase 7: Re-populate dropdowns when assignments change
        const assignmentChangeHandler = () => {
            populateProjectDropdown();
            populateServiceDropdown(); // also refresh services for services_user
        };
        window.addEventListener('assignmentsChanged', assignmentChangeHandler);
        window._mrfFormAssignmentHandler = assignmentChangeHandler;

        // Setup form submission handler
        const form = document.getElementById('mrfForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Phase 74-02: Install item sync handlers (scoped to .mrf-items-section) and index initial row/card
        installItemSyncHandlers();
        reindexItemRows();
    } catch (error) {
        console.error('[MRFForm] Error initializing form tab:', error);
    }
}

// ----------------------------------------
// MY REQUESTS INIT
// ----------------------------------------

/**
 * Requestor-side MRF cancellation (whole-MRF, no item selection).
 * Blocks if any PRs exist. Otherwise confirms and sets status to Cancelled.
 */
async function cancelRequestorMRF(mrfDocId) {
    // 1. Fetch MRF by Firestore document ID
    const mrfRef = doc(db, 'mrfs', mrfDocId);
    const mrfSnap = await getDoc(mrfRef);
    if (!mrfSnap.exists()) { alert('MRF not found'); return; }
    const mrfData = { id: mrfSnap.id, ...mrfSnap.data() };

    // 2. Check for existing PRs — if any exist, block cancellation
    const prSnap = await getDocs(query(collection(db, 'prs'), where('mrf_id', '==', mrfData.mrf_id)));
    if (!prSnap.empty) {
        alert('Cannot cancel — this MRF has PRs generated. Contact procurement to cancel.');
        return;
    }

    // 3. Confirm with user
    if (!confirm(`Cancel MRF ${mrfData.mrf_id}? This cannot be undone.`)) return;

    // 4. Update Firestore
    try {
        await updateDoc(mrfRef, {
            status: 'Cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_reason: 'Cancelled by requestor',
            updated_at: new Date().toISOString()
        });
        // Reload My Requests list
        if (typeof window._myRequestsReload === 'function') {
            await window._myRequestsReload();
        }
    } catch (err) {
        console.error('[MRFForm] cancelRequestorMRF write failed:', err);
        alert('Failed to cancel MRF: ' + err.message);
    }
}

// Unit options shared between create form and edit modal
const UNIT_OPTIONS = [
    'pcs','boxes','bags','lot','gallons','bottles','bundle','cans',
    'trucks','ride','sheets','yards','pail','rolls','sets','packs',
    'liter','pairs','meters','quarts','kg'
];

const CATEGORY_OPTIONS = [
    'CIVIL','ELECTRICAL','HVAC','PLUMBING','TOOLS & EQUIPMENTS',
    'SAFETY','SUBCON','TRANSPORTATION','HAULING & DELIVERY',
    'DELIVERY BY SUPPLIER','OTHERS'
];

// ----------------------------------------
// MOBILE ITEM CARD BUILDER (Phase 74-02)
// Uses module-level UNIT_OPTIONS and CATEGORY_OPTIONS (single source of truth).
// REVIEWS [MEDIUM]: Do NOT duplicate these arrays inline — reference the consts.
// ----------------------------------------

/**
 * Build HTML for one .mrf-item-card matching the item at `index` in the desktop table.
 * Cards have paired inputs that sync back to the desktop table via data-item-index.
 * @param {number} index - 0-based item index (must match tbody row index)
 */
function buildItemCardHTML(index) {
    // REVIEWS [MEDIUM]: Reference module-level constants — do NOT duplicate arrays.
    const unitOpts = UNIT_OPTIONS.map(u => `<option value="${u}">${u}</option>`).join('');
    const catOpts = CATEGORY_OPTIONS.map(c => `<option value="${c}">${c}</option>`).join('');

    return `
        <div class="mrf-item-card" data-item-index="${index}">
            <button type="button" class="mrf-item-card-remove" onclick="removeItem(this)" aria-label="Remove item">&times;</button>
            <div class="mrf-item-card-field">
                <label class="mrf-item-card-field-label">Item Description *</label>
                <input type="text" class="mrf-card-item-name" data-item-index="${index}">
            </div>
            <div class="mrf-item-card-row-qty-unit">
                <div class="mrf-item-card-field">
                    <label class="mrf-item-card-field-label">Qty *</label>
                    <input type="number" class="mrf-card-item-qty" data-item-index="${index}" min="0.01" step="any">
                </div>
                <div class="mrf-item-card-field">
                    <label class="mrf-item-card-field-label">Unit *</label>
                    <select class="mrf-card-item-unit" data-item-index="${index}">
                        <option value="">Select Unit</option>
                        ${unitOpts}
                        <option value="others">Others (specify)</option>
                    </select>
                    <input type="text" class="mrf-card-custom-unit-input" data-item-index="${index}" placeholder="Specify unit" style="display: none; margin-top: 0.5rem;">
                </div>
            </div>
            <div class="mrf-item-card-field">
                <label class="mrf-item-card-field-label">Category *</label>
                <select class="mrf-card-item-category" data-item-index="${index}">
                    <option value="">Select Category</option>
                    ${catOpts}
                </select>
            </div>
        </div>
    `;
}

/**
 * Build a unit <select> HTML string, pre-selecting the given value.
 */
function buildUnitSelect(selectedVal) {
    const opts = UNIT_OPTIONS.map(u =>
        `<option value="${u}"${selectedVal === u ? ' selected' : ''}>${u}</option>`
    ).join('');
    return `<select class="edit-item-unit" style="width:100%;padding:0.3rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;">
        <option value="">Unit</option>
        ${opts}
        <option value="others"${selectedVal && !UNIT_OPTIONS.includes(selectedVal) ? ' selected' : ''}>Others (specify)</option>
    </select>
    <input type="text" class="edit-item-unit-custom" placeholder="Specify unit"
        style="display:${selectedVal && !UNIT_OPTIONS.includes(selectedVal) ? 'block' : 'none'};width:100%;padding:0.3rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;margin-top:0.3rem;"
        value="${selectedVal && !UNIT_OPTIONS.includes(selectedVal) ? selectedVal.replace(/"/g, '&quot;') : ''}">`;
}

/**
 * Build a category <select> HTML string, pre-selecting the given value.
 */
function buildCategorySelect(selectedVal) {
    const opts = CATEGORY_OPTIONS.map(c =>
        `<option value="${c}"${selectedVal === c ? ' selected' : ''}>${c}</option>`
    ).join('');
    return `<select class="edit-item-category" style="width:100%;padding:0.3rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;">
        <option value="">Category</option>
        ${opts}
    </select>`;
}

/**
 * Build one editable item row for the edit modal.
 */
function buildEditItemRow(item) {
    const nameVal = (item.item || item.item_name || '').replace(/"/g, '&quot;');
    const qtyVal = item.qty || item.quantity || '';
    const unitVal = item.unit || '';
    const catVal = item.category || '';
    return `<tr>
        <td style="padding:0.4rem;">
            <input type="text" class="edit-item-name" value="${nameVal}"
                style="width:100%;padding:0.3rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;">
        </td>
        <td style="padding:0.4rem;">
            <input type="number" class="edit-item-qty" value="${qtyVal}" min="0.01" step="any"
                style="width:100%;padding:0.3rem 0.5rem;border:1px solid #e5e7eb;border-radius:4px;font-size:1rem;">
        </td>
        <td style="padding:0.4rem;">${buildUnitSelect(unitVal)}</td>
        <td style="padding:0.4rem;">${buildCategorySelect(catVal)}</td>
        <td style="padding:0.4rem;text-align:center;">
            <button type="button" onclick="this.closest('tr').remove()"
                style="background:#ef4444;color:white;border:none;border-radius:4px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;">
                Remove
            </button>
        </td>
    </tr>`;
}

/**
 * Requestor-side MRF edit modal.
 * Opens a full-form modal pre-filled with current MRF values.
 * On save, updates the Firestore document and reloads My Requests.
 */
async function editRequestorMRF(mrfDocId) {
    // 1. Fetch MRF
    const mrfRef = doc(db, 'mrfs', mrfDocId);
    const mrfSnap = await getDoc(mrfRef);
    if (!mrfSnap.exists()) { alert('MRF not found'); return; }
    const mrfData = { id: mrfSnap.id, ...mrfSnap.data() };

    // 2. Parse items
    let items = [];
    try { items = JSON.parse(mrfData.items_json || '[]'); } catch (e) { items = []; }

    // 3. Build initial item rows HTML
    const initialRows = items.length > 0
        ? items.map(buildEditItemRow).join('')
        : buildEditItemRow({ item: '', qty: '', unit: '', category: '' });

    // 4. Build project/service display value for simple text input
    const projectServiceVal = (mrfData.project_code || mrfData.service_code || '').replace(/"/g, '&quot;');
    const projectServiceDisplay = (() => {
        if (mrfData.project_code && mrfData.project_name) return `${mrfData.project_code} - ${mrfData.project_name}`;
        if (mrfData.service_code && mrfData.service_name) return `${mrfData.service_code} - ${mrfData.service_name}`;
        return mrfData.project_code || mrfData.service_code || '';
    })();

    const urgencyOptions = ['Low','Medium','High','Critical'].map(u =>
        `<option value="${u}"${mrfData.urgency_level === u ? ' selected' : ''}>${u}</option>`
    ).join('');

    // 5. Build and append modal
    document.getElementById('requestorEditMRFModal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'requestorEditMRFModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;z-index:10000;overflow-y:auto;padding:2rem 1rem;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:10px;max-width:900px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.2);">
            <div style="padding:1.25rem 1.5rem;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;color:#1e293b;font-size:1.1rem;">Edit MRF &mdash; ${mrfData.mrf_id}</h3>
                <button id="editMRFCloseBtn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#64748b;">&times;</button>
            </div>

            <div style="padding:1.5rem;display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;">
                <!-- Project / Service (read-only display) -->
                <div style="grid-column:1/-1;">
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Project / Service</label>
                    <input type="text" id="editMRFProjectService" value="${projectServiceDisplay.replace(/"/g, '&quot;')}" readonly
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;background:#f8fafc;color:#475569;cursor:not-allowed;box-sizing:border-box;">
                </div>

                <!-- Requestor Name -->
                <div>
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Requestor Name</label>
                    <input type="text" id="editMRFRequestorName" value="${(mrfData.requestor_name || '').replace(/"/g, '&quot;')}"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;box-sizing:border-box;">
                </div>

                <!-- Date Needed -->
                <div>
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Date Needed</label>
                    <input type="date" id="editMRFDateNeeded" value="${mrfData.date_needed || ''}"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;box-sizing:border-box;">
                </div>

                <!-- Urgency Level -->
                <div>
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Urgency Level</label>
                    <select id="editMRFUrgency" style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;box-sizing:border-box;">
                        ${urgencyOptions}
                    </select>
                </div>

                <!-- Delivery Address -->
                <div style="grid-column:1/-1;">
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Delivery Address</label>
                    <textarea id="editMRFDeliveryAddress" rows="2"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;resize:vertical;box-sizing:border-box;">${(mrfData.delivery_address || '').replace(/</g, '&lt;')}</textarea>
                </div>

                <!-- Justification -->
                <div style="grid-column:1/-1;">
                    <label style="display:block;font-size:0.8rem;font-weight:600;color:#374151;margin-bottom:0.3rem;">Justification</label>
                    <textarea id="editMRFJustification" rows="3"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid #e5e7eb;border-radius:6px;resize:vertical;box-sizing:border-box;">${(mrfData.justification || '').replace(/</g, '&lt;')}</textarea>
                </div>
            </div>

            <!-- Items Table -->
            <div style="padding:0 1.5rem 1rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                    <label style="font-size:0.8rem;font-weight:600;color:#374151;">Items</label>
                    <button type="button" id="editMRFAddItemBtn"
                        style="background:#f1f5f9;border:1px solid #e5e7eb;border-radius:4px;padding:0.3rem 0.75rem;cursor:pointer;font-size:0.8rem;color:#374151;">
                        + Add Item
                    </button>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                        <thead>
                            <tr style="background:#f8f9fa;">
                                <th style="padding:0.4rem 0.5rem;border-bottom:2px solid #e5e7eb;text-align:left;font-size:0.75rem;">Item Description</th>
                                <th style="padding:0.4rem 0.5rem;border-bottom:2px solid #e5e7eb;text-align:left;font-size:0.75rem;width:80px;">Qty</th>
                                <th style="padding:0.4rem 0.5rem;border-bottom:2px solid #e5e7eb;text-align:left;font-size:0.75rem;width:140px;">Unit</th>
                                <th style="padding:0.4rem 0.5rem;border-bottom:2px solid #e5e7eb;text-align:left;font-size:0.75rem;width:180px;">Category</th>
                                <th style="padding:0.4rem 0.5rem;border-bottom:2px solid #e5e7eb;width:60px;"></th>
                            </tr>
                        </thead>
                        <tbody id="editMRFItemsBody">
                            ${initialRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Footer Buttons -->
            <div style="padding:1rem 1.5rem;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:0.5rem;">
                <button id="editMRFCancelBtn" style="background:#f1f5f9;border:1px solid #e5e7eb;border-radius:6px;padding:0.5rem 1.25rem;cursor:pointer;font-size:0.875rem;color:#374151;">
                    Cancel
                </button>
                <button id="editMRFSaveBtn" style="background:#1a73e8;color:white;border:none;border-radius:6px;padding:0.5rem 1.25rem;cursor:pointer;font-size:0.875rem;font-weight:600;">
                    Save Changes
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Close handlers
    const closeModal = () => overlay.remove();
    overlay.querySelector('#editMRFCloseBtn').addEventListener('click', closeModal);
    overlay.querySelector('#editMRFCancelBtn').addEventListener('click', closeModal);

    // Unit "others" toggle handler
    overlay.addEventListener('change', (e) => {
        if (e.target.classList.contains('edit-item-unit')) {
            const customInput = e.target.closest('td').querySelector('.edit-item-unit-custom');
            if (customInput) {
                customInput.style.display = e.target.value === 'others' ? 'block' : 'none';
                if (e.target.value !== 'others') customInput.value = '';
            }
        }
    });

    // Add item row
    overlay.querySelector('#editMRFAddItemBtn').addEventListener('click', () => {
        const tbody = overlay.querySelector('#editMRFItemsBody');
        // Use a <tbody> as the temp container — browsers strip <tr> when injected into a <div>
        const tempTbody = document.createElement('tbody');
        tempTbody.innerHTML = buildEditItemRow({ item: '', qty: '', unit: '', category: '' });
        tbody.appendChild(tempTbody.firstElementChild);
    });

    // Save handler
    overlay.querySelector('#editMRFSaveBtn').addEventListener('click', async () => {
        const requestorName = overlay.querySelector('#editMRFRequestorName').value.trim();
        const dateNeeded = overlay.querySelector('#editMRFDateNeeded').value.trim();
        const urgencyLevel = overlay.querySelector('#editMRFUrgency').value;
        const deliveryAddress = overlay.querySelector('#editMRFDeliveryAddress').value.trim();
        const justification = overlay.querySelector('#editMRFJustification').value.trim();

        if (!requestorName) { alert('Requestor name is required'); return; }
        if (!dateNeeded) { alert('Date needed is required'); return; }

        // Collect items from table
        const itemRows = overlay.querySelectorAll('#editMRFItemsBody tr');
        const newItems = [];
        for (const row of itemRows) {
            const name = row.querySelector('.edit-item-name')?.value.trim() || '';
            const qty = parseFloat(row.querySelector('.edit-item-qty')?.value) || 0;
            const unitSel = row.querySelector('.edit-item-unit');
            const unitCustom = row.querySelector('.edit-item-unit-custom');
            const unit = unitSel?.value === 'others' ? (unitCustom?.value.trim() || '') : (unitSel?.value || '');
            const category = row.querySelector('.edit-item-category')?.value || '';
            if (name && qty > 0) {
                newItems.push({ item: name, qty, unit, category });
            }
        }
        if (newItems.length === 0) { alert('At least one valid item is required'); return; }

        const saveBtn = overlay.querySelector('#editMRFSaveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            await updateDoc(mrfRef, {
                requestor_name: requestorName,
                date_needed: dateNeeded,
                urgency_level: urgencyLevel,
                delivery_address: deliveryAddress,
                justification: justification,
                items_json: JSON.stringify(newItems),
                updated_at: new Date().toISOString()
            });
            overlay.remove();
            if (typeof window._myRequestsReload === 'function') {
                await window._myRequestsReload();
            }
        } catch (err) {
            console.error('[MRFForm] editRequestorMRF save failed:', err);
            alert('Failed to save changes: ' + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    });
}

async function initMyRequests() {

    try {
        const { createMRFRecordsController } = await import('./mrf-records.js');

        const user = window.getCurrentUser?.();
        const userName = user?.full_name || null;

        myRequestsController = createMRFRecordsController({
            containerId: 'myRequestsContainer',
            paginationId: 'myRequestsContainerPagination',
            statusFilter: null, // Fetch ALL statuses — requestors want to see Pending too
            filterFn: userName
                ? (mrf) => mrf.requestor_name === userName
                : null, // If no user, show all (fallback)
            onContextMenu: (event, mrfDocId, mrfStatus) => {
                // Remove any stale context menu
                document.getElementById('myRequestsMRFContextMenu')?.remove();

                const actionableStatuses = ['Pending', 'In Progress'];
                const menu = document.createElement('div');
                menu.id = 'myRequestsMRFContextMenu';
                menu.style.cssText = `position:fixed;left:${event.clientX}px;top:${event.clientY}px;background:white;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;z-index:10000;min-width:200px;`;

                if (actionableStatuses.includes(mrfStatus)) {
                    menu.innerHTML = `
                        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#1a73e8;"
                             onmouseenter="this.style.background='#eff6ff'"
                             onmouseleave="this.style.background='transparent'"
                             onclick="document.getElementById('myRequestsMRFContextMenu')?.remove(); window._myRequestsEditMRF('${mrfDocId}')">
                            Edit MRF
                        </div>
                        <div style="padding:8px 16px;cursor:pointer;font-size:0.875rem;color:#ef4444;"
                             onmouseenter="this.style.background='#fef2f2'"
                             onmouseleave="this.style.background='transparent'"
                             onclick="document.getElementById('myRequestsMRFContextMenu')?.remove(); window._myRequestsCancelMRF('${mrfDocId}')">
                            Cancel MRF
                        </div>
                    `;
                } else {
                    menu.innerHTML = `
                        <div style="padding:8px 16px;font-size:0.875rem;color:#9ca3af;cursor:default;">
                            No actions available
                        </div>
                    `;
                }

                document.body.appendChild(menu);
                setTimeout(() => {
                    document.addEventListener('click', function handler() {
                        menu.remove();
                        document.removeEventListener('click', handler);
                    }, { once: true });
                }, 10);
            },
            onMobileAction: (event, mrfDocId, mrfStatus) => {
                // Remove any stale dropdown + any stale scroll handler
                const staleMenu = document.getElementById('myRequestsMobileMenu');
                if (staleMenu) staleMenu.remove();
                if (window._mrfMobileMenuScrollHandler) {
                    window.removeEventListener('scroll', window._mrfMobileMenuScrollHandler);
                    window._mrfMobileMenuScrollHandler = null;
                }

                const actionableStatuses = ['Pending', 'In Progress'];
                const btn = event.currentTarget;
                const rect = btn.getBoundingClientRect();

                const menu = document.createElement('div');
                menu.id = 'myRequestsMobileMenu';
                menu.className = 'mrf-req-card-menu';
                // Position below the 3-dot button, right-aligned; clamp to viewport
                const menuWidth = 180;
                const leftPx = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
                const topPx = rect.bottom + 4;
                menu.style.left = leftPx + 'px';
                menu.style.top = topPx + 'px';

                if (actionableStatuses.includes(mrfStatus)) {
                    menu.innerHTML = `
                        <div class="mrf-req-card-menu-item mrf-req-card-menu-item--edit"
                             onclick="closeMyRequestsMobileMenu(); window._myRequestsEditMRF('${mrfDocId}')">
                            Edit MRF
                        </div>
                        <div class="mrf-req-card-menu-item mrf-req-card-menu-item--cancel"
                             onclick="closeMyRequestsMobileMenu(); window._myRequestsCancelMRF('${mrfDocId}')">
                            Cancel MRF
                        </div>
                    `;
                } else {
                    menu.innerHTML = `
                        <div class="mrf-req-card-menu-item mrf-req-card-menu-item--disabled">
                            No actions available
                        </div>
                    `;
                }

                document.body.appendChild(menu);

                // REVIEWS [LOW]: Close the menu when the user scrolls — position:fixed dropdowns
                // otherwise float detached from their card. Handler removes itself on first fire.
                window._mrfMobileMenuScrollHandler = () => {
                    const m = document.getElementById('myRequestsMobileMenu');
                    if (m) m.remove();
                    if (window._mrfMobileMenuScrollHandler) {
                        window.removeEventListener('scroll', window._mrfMobileMenuScrollHandler);
                        window._mrfMobileMenuScrollHandler = null;
                    }
                };
                window.addEventListener('scroll', window._mrfMobileMenuScrollHandler, { passive: true });

                // Close on outside click/tap (delayed by 10ms so the opening click doesn't immediately close)
                setTimeout(() => {
                    const closeHandler = (ev) => {
                        if (!menu.contains(ev.target)) {
                            closeMyRequestsMobileMenu();
                            document.removeEventListener('click', closeHandler);
                            document.removeEventListener('touchstart', closeHandler);
                        }
                    };
                    document.addEventListener('click', closeHandler);
                    document.addEventListener('touchstart', closeHandler);
                }, 10);
            }
        });

        // Expose cancel and edit handlers for context menu onclick (HTML attribute strings, need window access)
        window._myRequestsCancelMRF = async (mrfDocId) => {
            try { await cancelRequestorMRF(mrfDocId); } catch (e) { console.error('[MRFForm] cancelRequestorMRF failed:', e); }
        };
        window._myRequestsEditMRF = async (mrfDocId) => {
            try { await editRequestorMRF(mrfDocId); } catch (e) { console.error('[MRFForm] editRequestorMRF failed:', e); }
        };

        // Phase 74-03: centralized close so menu-item onclicks and scroll handler share logic
        window.closeMyRequestsMobileMenu = () => {
            const m = document.getElementById('myRequestsMobileMenu');
            if (m) m.remove();
            if (window._mrfMobileMenuScrollHandler) {
                window.removeEventListener('scroll', window._mrfMobileMenuScrollHandler);
                window._mrfMobileMenuScrollHandler = null;
            }
        };

        // Expose filter and reload for inline event handlers
        window._myRequestsFilter = () => {
            myRequestsController.filter(
                'myRequestsSearch',
                'myRequestsStatusFilter',
                'myRequestsUrgencyFilter'
            );
        };

        window._myRequestsReload = async () => {
            await myRequestsController.load();
        };

        window._myRequestsExportCSV = () => {
            if (myRequestsController) {
                myRequestsController.exportCSV();
            }
        };

        window._myRequestsSort = (field) => {
            myRequestsController?.sort(field);
        };

        await myRequestsController.load();
    } catch (error) {
        console.error('[MRFForm] Error initializing My Requests:', error);
        const container = document.getElementById('myRequestsContainer');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ef4444;">Error loading requests. Please try again.</div>';
        }
    }
}

// ----------------------------------------
// FORM HELPERS (unchanged from original)
// ----------------------------------------

/**
 * Load projects from Firebase
 */
function loadProjects() {
    if (!document.getElementById('projectsOptgroup')) return;

    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('active', '==', true));

        projectsListener = onSnapshot(q, (snapshot) => {
            // Cache projects for re-population on assignment change
            cachedProjects = [];
            snapshot.forEach(doc => {
                cachedProjects.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically A-Z by project code
            cachedProjects.sort((a, b) => (a.project_code || '').localeCompare(b.project_code || ''));

            populateProjectDropdown();
        }, (error) => {
            console.error('Error loading projects:', error);
        });
    } catch (error) {
        console.error('Error setting up projects listener:', error);
    }
}

/**
 * Populate the project dropdown from cachedProjects, applying assignment filter
 * for operations_user. Called by the onSnapshot callback and by the
 * assignmentsChanged event handler.
 */
function populateProjectDropdown() {
    const optgroup = document.getElementById('projectsOptgroup');
    if (!optgroup) return;

    // Phase 7: Filter to assigned projects for operations_user
    const assignedCodes = window.getAssignedProjectCodes?.();
    let projects = cachedProjects;
    if (assignedCodes !== null) {
        projects = cachedProjects.filter(p => assignedCodes.includes(p.project_code));
    }

    optgroup.innerHTML = '';

    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.project_code;
        option.textContent = `${project.project_code} - ${project.project_name}`;
        option.dataset.type = 'project';
        option.dataset.projectName = project.project_name;
        optgroup.appendChild(option);
    });
}

/**
 * Load services from Firebase with real-time updates
 */
function loadServices() {
    if (!document.getElementById('servicesOptgroup')) return;

    try {
        const servicesRef = collection(db, 'services');

        // ASSIGN-04: services_user may only read their assigned services.
        // An unscoped query would include docs they're not assigned to, which
        // Firestore's per-document list rule denies for the entire query.
        const assignedCodes = window.getAssignedServiceCodes?.();
        let q;
        if (assignedCodes !== null) {
            // services_user: scope by assignment; active filtered client-side below
            if (assignedCodes.length === 0) {
                return;
            }
            q = query(servicesRef, where('service_code', 'in', assignedCodes));
        } else {
            // All other roles: active filter in query (no per-document rule restriction)
            q = query(servicesRef, where('active', '==', true));
        }

        servicesListener = onSnapshot(q, (snapshot) => {
            cachedServices = [];
            snapshot.forEach(doc => {
                cachedServices.push({ id: doc.id, ...doc.data() });
            });

            // Sort alphabetically A-Z by service code
            cachedServices.sort((a, b) => (a.service_code || '').localeCompare(b.service_code || ''));

            populateServiceDropdown();
        }, (error) => {
            console.error('Error loading services:', error);
        });
    } catch (error) {
        console.error('Error setting up services listener:', error);
    }
}

/**
 * Populate the service dropdown from cachedServices, applying assignment filter
 * for services_user. Called by the onSnapshot callback and by the
 * assignmentsChanged event handler.
 */
function populateServiceDropdown() {
    const optgroup = document.getElementById('servicesOptgroup');
    if (!optgroup) return;

    // Filter to assigned services for services_user; services_admin gets null (no filter)
    // Also enforce active=true for services_user (their query doesn't include that filter)
    const assignedCodes = window.getAssignedServiceCodes?.();
    let services = cachedServices;
    if (assignedCodes !== null) {
        services = cachedServices.filter(s => assignedCodes.includes(s.service_code) && s.active === true);
    }

    optgroup.innerHTML = '';

    services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.service_code;
        // MRF-04: format "CLMC_CODE_YYYY### - Service Name"
        option.textContent = `${service.service_code} - ${service.service_name}`;
        option.dataset.type = 'service';
        option.dataset.serviceName = service.service_name;
        optgroup.appendChild(option);
    });
}

/**
 * Generate sequential MRF ID
 */
async function generateMRFId() {
    const year = new Date().getFullYear();
    const mrfsRef = collection(db, 'mrfs');
    const snapshot = await getDocs(mrfsRef);

    let maxNum = 0;
    const yearPrefix = `MRF-${year}-`;

    snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.mrf_id && data.mrf_id.startsWith(yearPrefix)) {
            const match = data.mrf_id.match(/MRF-\d{4}-(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        }
    });

    return `MRF-${year}-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * Assign data-item-index to existing desktop table rows so paired card sync works
 * even on the initial render (which emits 1 row + 1 card before any addItem call).
 * Called lazily from addItem / installItemSyncHandlers.
 */
function reindexItemRows() {
    const tbody = document.getElementById('itemsTableBody');
    const cardList = document.getElementById('mrfItemCardList');
    if (!tbody || !cardList) return;
    Array.from(tbody.rows).forEach((row, i) => { row.dataset.itemIndex = String(i); });
    Array.from(cardList.children).forEach((card, i) => {
        card.dataset.itemIndex = String(i);
        card.querySelectorAll('[data-item-index]').forEach(el => { el.dataset.itemIndex = String(i); });
    });
}

/**
 * REVIEWS [LOW]: Loop-safe paired write.
 * Set newValue on dst ONLY if it differs from dst's current value.
 * Prevents: (a) redundant DOM writes, (b) cursor-jumping in text inputs,
 * (c) any theoretical loop risk (browsers don't fire 'input' on programmatic
 * `.value =` assignment, so a guard is belt-and-braces but also prevents
 * unnecessary layout work).
 */
function syncValue(dst, newValue) {
    if (!dst) return;
    if (dst.value === newValue) return;
    dst.value = newValue;
}

/**
 * Install scoped input/change event delegation on the .mrf-items-section container
 * (NOT document.body — REVIEWS [HIGH] Zombie handlers fix).
 * Handler refs are stored in module-level _mrfItemSyncHandler / _mrfItemSyncChangeHandler
 * so destroy() can remove them.
 * Safe to call multiple times — guarded by null-check on module-level refs.
 */
function installItemSyncHandlers() {
    // REVIEWS [HIGH]: Scope to container, not document.body. Guard via module-level var.
    if (_mrfItemSyncHandler) return;

    const section = document.querySelector('.mrf-items-section');
    if (!section) return;

    _mrfItemSyncHandler = function(e) {
        const t = e.target;
        if (!t || !t.classList) return;
        // Card -> Table
        if (t.classList.contains('mrf-card-item-name')) {
            const idx = t.dataset.itemIndex;
            const row = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
            if (row) syncValue(row.querySelector('.item-name'), t.value);
        } else if (t.classList.contains('mrf-card-item-qty')) {
            const idx = t.dataset.itemIndex;
            const row = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
            if (row) syncValue(row.querySelector('.item-qty'), t.value);
        } else if (t.classList.contains('mrf-card-custom-unit-input')) {
            const idx = t.dataset.itemIndex;
            const row = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
            if (row) syncValue(row.querySelector('.custom-unit-input'), t.value);
        }
        // Table -> Card (desktop users typing in the table)
        else if (t.classList.contains('item-name')) {
            const row = t.closest('tr');
            const idx = row?.dataset.itemIndex;
            const card = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
            if (card) syncValue(card.querySelector('.mrf-card-item-name'), t.value);
        } else if (t.classList.contains('item-qty')) {
            const row = t.closest('tr');
            const idx = row?.dataset.itemIndex;
            const card = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
            if (card) syncValue(card.querySelector('.mrf-card-item-qty'), t.value);
        } else if (t.classList.contains('custom-unit-input')) {
            const row = t.closest('tr');
            const idx = row?.dataset.itemIndex;
            const card = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
            if (card) syncValue(card.querySelector('.mrf-card-custom-unit-input'), t.value);
        }
    };

    _mrfItemSyncChangeHandler = function(e) {
        const t = e.target;
        if (!t || !t.classList) return;
        // Card select -> Table select
        if (t.classList.contains('mrf-card-item-unit')) {
            const idx = t.dataset.itemIndex;
            const row = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
            if (row) {
                const rowUnit = row.querySelector('.item-unit');
                syncValue(rowUnit, t.value);
                const rowCustom = row.querySelector('.custom-unit-input');
                if (t.value === 'others') { rowCustom.style.display = 'block'; rowCustom.required = true; }
                else { rowCustom.style.display = 'none'; rowCustom.required = false; if (rowCustom.value !== '') rowCustom.value = ''; }
            }
            const card = t.closest('.mrf-item-card');
            const cardCustom = card?.querySelector('.mrf-card-custom-unit-input');
            if (cardCustom) {
                cardCustom.style.display = t.value === 'others' ? 'block' : 'none';
                if (t.value !== 'others' && cardCustom.value !== '') cardCustom.value = '';
            }
        } else if (t.classList.contains('mrf-card-item-category')) {
            const idx = t.dataset.itemIndex;
            const row = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
            if (row) syncValue(row.querySelector('.item-category'), t.value);
        }
        // Table select -> Card select
        else if (t.classList.contains('item-unit')) {
            const row = t.closest('tr');
            const idx = row?.dataset.itemIndex;
            const card = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
            if (card) {
                syncValue(card.querySelector('.mrf-card-item-unit'), t.value);
                const cardCustom = card.querySelector('.mrf-card-custom-unit-input');
                cardCustom.style.display = t.value === 'others' ? 'block' : 'none';
                if (t.value !== 'others' && cardCustom.value !== '') cardCustom.value = '';
            }
        } else if (t.classList.contains('item-category')) {
            const row = t.closest('tr');
            const idx = row?.dataset.itemIndex;
            const card = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
            if (card) syncValue(card.querySelector('.mrf-card-item-category'), t.value);
        }
    };

    section.addEventListener('input', _mrfItemSyncHandler);
    section.addEventListener('change', _mrfItemSyncChangeHandler);
}

/**
 * Toggle custom unit input visibility on desktop table row (unchanged behavior).
 */
window.toggleCustomUnit = function(selectElement) {
    const row = selectElement.closest('tr');
    const customInput = row.querySelector('.custom-unit-input');
    if (selectElement.value === 'others') {
        customInput.style.display = 'block';
        customInput.required = true;
    } else {
        customInput.style.display = 'none';
        customInput.required = false;
        customInput.value = '';
    }
};

/**
 * Add a new item row: appends to BOTH the desktop table AND the mobile card list.
 * Rows and cards share the same data-item-index for pair sync.
 */
window.addItem = function() {
    installItemSyncHandlers();
    reindexItemRows();

    const tbody = document.getElementById('itemsTableBody');
    const cardList = document.getElementById('mrfItemCardList');

    // Append new table row (cloned from first row)
    const newRow = tbody.rows[0].cloneNode(true);
    newRow.querySelectorAll('input').forEach(input => {
        input.value = '';
        if (input.classList.contains('custom-unit-input')) {
            input.style.display = 'none';
            input.required = false;
        }
    });
    newRow.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    tbody.appendChild(newRow);

    // Append paired card
    if (cardList) {
        const newIndex = tbody.rows.length - 1;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = buildItemCardHTML(newIndex).trim();
        cardList.appendChild(tempDiv.firstElementChild);
    }

    reindexItemRows();
};

/**
 * Remove an item: removes the row from the table AND the paired card from the list.
 * Works whether called from the desktop button (inside <tr>) or the card [×] button
 * (inside .mrf-item-card). At least one item must remain.
 */
window.removeItem = function(button) {
    installItemSyncHandlers();
    reindexItemRows();

    const tbody = document.getElementById('itemsTableBody');
    const cardList = document.getElementById('mrfItemCardList');

    if (tbody.rows.length <= 1) {
        showAlert('warning', 'You must have at least one item in the request.');
        return;
    }

    // Determine which index to remove based on button origin
    let idx;
    const card = button.closest('.mrf-item-card');
    const row = button.closest('tr');
    if (card) {
        idx = card.dataset.itemIndex;
    } else if (row) {
        idx = row.dataset.itemIndex;
    } else {
        return;
    }

    // Remove BOTH
    const targetRow = document.querySelector(`#itemsTableBody tr[data-item-index="${idx}"]`);
    const targetCard = document.querySelector(`.mrf-item-card[data-item-index="${idx}"]`);
    if (targetRow) targetRow.remove();
    if (targetCard) targetCard.remove();

    reindexItemRows();
};

/**
 * Collect items from table
 */
function collectItems() {
    const tbody = document.getElementById('itemsTableBody');
    const items = [];

    for (let row of tbody.rows) {
        const itemName = row.querySelector('.item-name').value.trim();
        const qty = parseFloat(row.querySelector('.item-qty').value);
        const unitSelect = row.querySelector('.item-unit');
        const customUnitInput = row.querySelector('.custom-unit-input');
        const unit = unitSelect.value === 'others' ? customUnitInput.value.trim() : unitSelect.value;
        const category = row.querySelector('.item-category').value;

        if (itemName && qty && unit && category) {
            items.push({
                item: itemName,
                qty,
                unit,
                category
            });
        }
    }

    return items;
}

/**
 * Show alert message
 */
function showAlert(type, message) {
    const alertSuccess = document.getElementById('alertSuccess');
    const alertError = document.getElementById('alertError');
    const alertWarning = document.getElementById('alertWarning');

    // Hide all alerts
    alertSuccess.classList.remove('show');
    alertError.classList.remove('show');
    alertWarning.classList.remove('show');

    // Show appropriate alert
    if (type === 'success') {
        alertSuccess.textContent = message;
        alertSuccess.classList.add('show');
    } else if (type === 'error') {
        alertError.textContent = message;
        alertError.classList.add('show');
    } else if (type === 'warning') {
        alertWarning.textContent = message;
        alertWarning.classList.add('show');
    }

    // Auto-hide after 5 seconds
    setTimeout(() => {
        alertSuccess.classList.remove('show');
        alertError.classList.remove('show');
        alertWarning.classList.remove('show');
    }, 5000);
}

/**
 * Show/hide loading
 */
function showLoading(show) {
    const loading = document.getElementById('loading');
    const form = document.getElementById('mrfForm');

    if (show) {
        loading.classList.add('show');
        form.style.display = 'none';
    } else {
        loading.classList.remove('show');
        form.style.display = 'block';
    }
}

/**
 * Reset form
 */
window.resetForm = function() {
    if (confirm('Are you sure you want to reset the form? All entered data will be lost.')) {
        document.getElementById('mrfForm').reset();

        // Keep only one item row
        const tbody = document.getElementById('itemsTableBody');
        while (tbody.rows.length > 1) {
            tbody.deleteRow(1);
        }

        // Keep only one item card (mirror desktop table reset)
        const cardList = document.getElementById('mrfItemCardList');
        if (cardList) {
            while (cardList.children.length > 1) {
                cardList.removeChild(cardList.lastElementChild);
            }
            // Reset first card's values
            const firstCard = cardList.firstElementChild;
            if (firstCard) {
                firstCard.querySelectorAll('input').forEach(input => {
                    input.value = '';
                    if (input.classList.contains('mrf-card-custom-unit-input')) {
                        input.style.display = 'none';
                    }
                });
                firstCard.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);
            }
        }
        reindexItemRows();

        // Hide custom unit inputs
        document.querySelectorAll('.custom-unit-input').forEach(input => {
            input.style.display = 'none';
            input.required = false;
        });

        // Re-populate requestor name after reset
        const user = window.getCurrentUser?.();
        if (user && user.full_name) {
            const requestorInput = document.getElementById('requestorName');
            if (requestorInput) {
                requestorInput.value = user.full_name;
            }
        }

        showAlert('success', 'Form has been reset.');
    }
};

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    // Collect form data
    const requestType = document.querySelector('input[name="requestType"]:checked').value;
    const urgencyLevel = document.querySelector('input[name="urgencyLevel"]:checked').value;
    const pss = document.getElementById('projectServiceSelect');
    const selectedOption = pss?.options[pss?.selectedIndex];
    const selectedType = selectedOption?.dataset?.type || '';
    const selectedCode = pss?.value?.trim() || '';

    const projectCode = selectedType === 'project' ? selectedCode : '';
    const projectName = selectedType === 'project' ? (selectedOption?.dataset?.projectName || '') : '';
    const serviceCode = selectedType === 'service' ? selectedCode : '';
    const serviceName = selectedType === 'service' ? (selectedOption?.dataset?.serviceName || '') : '';

    const hasProject = !!projectCode;
    const hasService = !!serviceCode;

    if (!hasProject && !hasService) {
        showAlert('error', 'Please select a project or service for this request.');
        return;
    }

    const department = hasService ? 'services' : 'projects';

    const requestorName = document.getElementById('requestorName').value.trim();
    const dateNeeded = document.getElementById('dateNeeded').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
    const justification = document.getElementById('justification').value.trim();
    const items = collectItems();

    // Validate
    if (items.length === 0) {
        showAlert('error', 'Please add at least one item to your request.');
        return;
    }

    // Show loading
    showLoading(true);

    try {
        // Generate MRF ID
        const mrfId = await generateMRFId();

        // Prepare Firestore document
        const mrfDoc = {
            mrf_id: mrfId,
            request_type: requestType,
            urgency_level: urgencyLevel,
            department: department,                              // MRF-08: 'projects' or 'services'
            project_code: hasProject ? projectCode : '',        // empty string for services MRFs
            project_name: hasProject ? projectName : '',        // empty string for services MRFs
            service_code: hasService ? serviceCode : '',        // MRF-07: denormalized
            service_name: hasService ? serviceName : '',        // MRF-07: denormalized
            requestor_name: requestorName,
            date_needed: dateNeeded,
            date_submitted: new Date().toISOString().split('T')[0],
            delivery_address: deliveryAddress,
            justification: justification,
            items_json: JSON.stringify(items),
            status: 'Pending',
            created_at: new Date().toISOString()
        };

        // Submit to Firebase
        await addDoc(collection(db, 'mrfs'), mrfDoc);

        showLoading(false);

        const typeLabel = requestType === 'material' ? 'Material Request' : 'Delivery/Hauling/Transportation Request';
        showAlert('success', `${typeLabel} submitted successfully! Your MRF ID is: ${mrfId}. The procurement team has been notified.`);

        // Reset form after 2 seconds
        setTimeout(() => {
            document.getElementById('mrfForm').reset();
            const tbody = document.getElementById('itemsTableBody');
            while (tbody.rows.length > 1) {
                tbody.deleteRow(1);
            }

            // Keep only one item card (mirror desktop table reset)
            const cardList = document.getElementById('mrfItemCardList');
            if (cardList) {
                while (cardList.children.length > 1) {
                    cardList.removeChild(cardList.lastElementChild);
                }
                // Reset first card's values
                const firstCard = cardList.firstElementChild;
                if (firstCard) {
                    firstCard.querySelectorAll('input').forEach(input => {
                        input.value = '';
                        if (input.classList.contains('mrf-card-custom-unit-input')) {
                            input.style.display = 'none';
                        }
                    });
                    firstCard.querySelectorAll('select').forEach(sel => sel.selectedIndex = 0);
                }
            }
            reindexItemRows();

            document.querySelectorAll('.custom-unit-input').forEach(input => {
                input.style.display = 'none';
                input.required = false;
            });

            // Re-populate requestor name after submission reset
            const currentUser = window.getCurrentUser?.();
            if (currentUser && currentUser.full_name) {
                const nameInput = document.getElementById('requestorName');
                if (nameInput) nameInput.value = currentUser.full_name;
            }
        }, 2000);

    } catch (error) {
        showLoading(false);
        showAlert('error', 'Failed to submit MRF. Please check your connection and try again, or contact IT support.');
        console.error('Error:', error);
    }
}

// ----------------------------------------
// DESTROY
// ----------------------------------------

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    // Phase 7: Remove assignment change listener
    if (window._mrfFormAssignmentHandler) {
        window.removeEventListener('assignmentsChanged', window._mrfFormAssignmentHandler);
        delete window._mrfFormAssignmentHandler;
    }

    // Unsubscribe from form tab listeners
    if (projectsListener) {
        projectsListener();
        projectsListener = null;
    }
    if (servicesListener) {
        servicesListener();
        servicesListener = null;
    }
    cachedServices = [];

    // Clean up My Requests controller
    if (myRequestsController) {
        myRequestsController.destroy();
        myRequestsController = null;
    }

    // Clean up My Requests window functions
    delete window._myRequestsFilter;
    delete window._myRequestsReload;
    delete window._myRequestsExportCSV;
    delete window._myRequestsSort;
    delete window._myRequestsCancelMRF;
    delete window._myRequestsEditMRF;

    // Phase 74-03: cleanup mobile menu helper + any active scroll handler
    delete window.closeMyRequestsMobileMenu;
    if (window._mrfMobileMenuScrollHandler) {
        window.removeEventListener('scroll', window._mrfMobileMenuScrollHandler);
        window._mrfMobileMenuScrollHandler = null;
    }
    const staleMobileMenu = document.getElementById('myRequestsMobileMenu');
    if (staleMobileMenu) staleMobileMenu.remove();

    // Phase 74-01: Detach scroll-hide/show listener for sticky sub-nav.
    if (_mrfNavScrollHandler) {
        window.removeEventListener('scroll', _mrfNavScrollHandler);
        _mrfNavScrollHandler = null;
    }
    _mrfNavLastScrollY = 0;

    // Phase 74-02: REVIEWS [HIGH] — detach scoped item sync handlers to prevent zombies.
    // Section may already be gone from DOM; handlers still need to be null'd.
    if (_mrfItemSyncHandler || _mrfItemSyncChangeHandler) {
        const section = document.querySelector('.mrf-items-section');
        if (section) {
            if (_mrfItemSyncHandler) section.removeEventListener('input', _mrfItemSyncHandler);
            if (_mrfItemSyncChangeHandler) section.removeEventListener('change', _mrfItemSyncChangeHandler);
        }
        _mrfItemSyncHandler = null;
        _mrfItemSyncChangeHandler = null;
    }

    // Remove form event listener
    const form = document.getElementById('mrfForm');
    if (form) {
        form.removeEventListener('submit', handleFormSubmit);
    }
}
