/* ========================================
   MRF SUBMISSION FORM VIEW
   Public form for submitting Material Request Forms
   Supports 2 sub-tabs:
     - 'form'        → Material Request Form (default)
     - 'my-requests' → My Requests: user's submitted MRFs
   ======================================== */

import { db, collection, addDoc, getDocs, query, where, onSnapshot } from '../firebase.js';
import { showLoading as utilsShowLoading, showAlert as utilsShowAlert } from '../utils.js';
import { skeletonTableRows } from '../components.js';

// View state
let projectsListener = null;
let cachedProjects = [];   // Holds the latest projects from the onSnapshot callback
let servicesListener = null;
let cachedServices = [];   // Holds the latest services from the onSnapshot callback

// My Requests sub-tab controller (from mrf-records.js)
let myRequestsController = null;

// ----------------------------------------
// SUB-TAB NAVIGATION RENDER
// ----------------------------------------

function renderSubTabNav(activeTab) {
    return `
        <div style="background: white; border-bottom: 1px solid var(--gray-200);">
            <div style="max-width: 1600px; margin: 0 auto; padding: 0 2rem;">
                <div class="tabs-nav">
                    <button class="tab-btn ${activeTab === 'form' ? 'active' : ''}"
                        onclick="window.navigateToTab('form')">
                        Material Request Form
                    </button>
                    <button class="tab-btn ${activeTab === 'my-requests' ? 'active' : ''}"
                        onclick="window.navigateToTab('my-requests')">
                        My Requests
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ----------------------------------------
// MY REQUESTS VIEW RENDER
// ----------------------------------------

function renderMyRequestsView(tabNav) {
    return `
        <div style="min-height: 100vh; background: #f8fafc;">
            ${tabNav}
            <div class="container" style="max-width: 1200px; margin: 0 auto; padding: 2rem;">
                <div class="card">
                    <div class="card-header">
                        <h2>My Requests</h2>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="window._myRequestsExportCSV()">Export CSV</button>
                            <button class="btn btn-secondary" onclick="window._myRequestsReload()">Refresh</button>
                        </div>
                    </div>
                    <div style="padding: 0 1.5rem 1.5rem 1.5rem;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
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
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">MRF ID</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Project</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Date Needed</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">PRs</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">POs</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">MRF Status</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Procurement Status</th>
                                    <th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Actions</th>
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
                        <div style="margin-bottom: 2rem;">
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
                                            <td><input type="number" class="item-qty" min="1" required></td>
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
                            <button type="button" class="btn btn-secondary" onclick="addItem()">Add Another Item</button>
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
    } catch (error) {
        console.error('[MRFForm] Error initializing form tab:', error);
    }
}

// ----------------------------------------
// MY REQUESTS INIT
// ----------------------------------------

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
                : null // If no user, show all (fallback)
        });

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

            // Sort by created_at descending (most recent first)
            cachedProjects.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            });

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

            // Sort by created_at descending (most recent first, MRF-06)
            cachedServices.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
            });

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
 * Toggle custom unit input
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
 * Add new item row
 */
window.addItem = function() {
    const tbody = document.getElementById('itemsTableBody');
    const newRow = tbody.rows[0].cloneNode(true);

    // Clear values
    newRow.querySelectorAll('input').forEach(input => {
        input.value = '';
        if (input.classList.contains('custom-unit-input')) {
            input.style.display = 'none';
            input.required = false;
        }
    });
    newRow.querySelectorAll('select').forEach(select => select.selectedIndex = 0);

    tbody.appendChild(newRow);
};

/**
 * Remove item row
 */
window.removeItem = function(button) {
    const tbody = document.getElementById('itemsTableBody');
    if (tbody.rows.length > 1) {
        button.closest('tr').remove();
    } else {
        showAlert('warning', 'You must have at least one item in the request.');
    }
};

/**
 * Collect items from table
 */
function collectItems() {
    const tbody = document.getElementById('itemsTableBody');
    const items = [];

    for (let row of tbody.rows) {
        const itemName = row.querySelector('.item-name').value.trim();
        const qty = parseInt(row.querySelector('.item-qty').value);
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

    // Remove form event listener
    const form = document.getElementById('mrfForm');
    if (form) {
        form.removeEventListener('submit', handleFormSubmit);
    }
}
