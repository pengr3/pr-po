/* ========================================
   MRF SUBMISSION FORM VIEW
   Public form for submitting Material Request Forms
   ======================================== */

import { db, collection, addDoc, getDocs, query, where, onSnapshot } from '../firebase.js';
import { showLoading as utilsShowLoading, showAlert as utilsShowAlert } from '../utils.js';

// View state
let projectsListener = null;

/**
 * Render the MRF submission form
 * @returns {string} HTML string for MRF form
 */
export function render() {
    return `
        <div class="container" style="max-width: 1100px; margin: 2rem auto; background: white; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow: hidden;">
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
                                    <label for="typeMaterial">Material Request</label>
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
                            <div class="form-group">
                                <label for="projectName">Project Name *</label>
                                <select id="projectName" required>
                                    <option value="">Loading projects...</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="requestorName">Your Name *</label>
                                <input type="text" id="requestorName" required>
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
                        <div style="overflow-x: auto; margin: 1rem 0;">
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
    `;
}

/**
 * Initialize the MRF form view
 */
export async function init() {
    console.log('Initializing MRF form view...');

    try {
        // Set minimum date to today
        const dateInput = document.getElementById('dateNeeded');
        if (dateInput) {
            dateInput.min = new Date().toISOString().split('T')[0];
        }

        // Load projects
        loadProjects();

        // Setup form submission handler
        const form = document.getElementById('mrfForm');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }
    } catch (error) {
        console.error('Error initializing MRF form view:', error);
    }
}

/**
 * Load projects from Firebase
 */
function loadProjects() {
    const projectSelect = document.getElementById('projectName');
    if (!projectSelect) return;

    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('status', '==', 'active'));

        projectsListener = onSnapshot(q, (snapshot) => {
            // Clear existing options
            projectSelect.innerHTML = '<option value="">-- Select a project --</option>';

            if (snapshot.empty) {
                projectSelect.innerHTML = '<option value="">No projects available</option>';
                return;
            }

            // Collect and sort projects
            const projects = [];
            snapshot.forEach(doc => {
                projects.push({ id: doc.id, ...doc.data() });
            });

            // Sort by created_at descending (most recent first)
            projects.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime; // Most recent first
            });

            // Add sorted project options
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.project_code; // Store the code
                option.textContent = `${project.project_code} - ${project.project_name}`; // Display format
                // Store project_name in data attribute for submission
                option.dataset.projectName = project.project_name;
                projectSelect.appendChild(option);
            });
        }, (error) => {
            console.error('Error loading projects:', error);
            projectSelect.innerHTML = '<option value="">Error loading projects</option>';
        });
    } catch (error) {
        console.error('Error setting up projects listener:', error);
        projectSelect.innerHTML = '<option value="">Error loading projects</option>';
    }
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
    const projectSelect = document.getElementById('projectName');
    const projectCode = projectSelect.value.trim(); // Now stores the code
    const selectedOption = projectSelect.options[projectSelect.selectedIndex];
    const projectName = selectedOption?.dataset?.projectName || ''; // Get name from data attribute
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
            project_code: projectCode,    // NEW: stable reference
            project_name: projectName,    // KEEP: for display (denormalized)
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
        }, 2000);

    } catch (error) {
        showLoading(false);
        showAlert('error', 'Failed to submit MRF. Please check your connection and try again, or contact IT support.');
        console.error('Error:', error);
    }
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('Destroying MRF form view...');

    // Unsubscribe from listeners
    if (projectsListener) {
        projectsListener();
        projectsListener = null;
    }

    // Remove form event listener
    const form = document.getElementById('mrfForm');
    if (form) {
        form.removeEventListener('submit', handleFormSubmit);
    }
}

console.log('MRF form view module loaded');
