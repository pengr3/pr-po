/* ========================================
   PROJECT DETAIL VIEW
   Full-page project detail with inline editing
   ======================================== */

import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast } from '../utils.js';

let currentProject = null;
let projectCode = null;
let listener = null;

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

// Render view HTML
export function render(activeTab = null, param = null) {
    return `
        <div id="projectDetailContainer">
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem;">
                        <p style="color: #64748b;">Loading project details...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Initialize view
export async function init(activeTab = null, param = null) {
    console.log('[ProjectDetail] Initializing with param:', param);
    projectCode = param;
    attachWindowFunctions();

    if (!projectCode) {
        document.getElementById('projectDetailContainer').innerHTML = `
            <div class="container" style="margin-top: 2rem;">
                <div class="card">
                    <div class="card-body">
                        <p>No project specified.</p>
                        <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Find project by project_code field (not document ID)
    const q = query(collection(db, 'projects'), where('project_code', '==', projectCode));
    listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            document.getElementById('projectDetailContainer').innerHTML = `
                <div class="container" style="margin-top: 2rem;">
                    <div class="card">
                        <div class="card-body">
                            <p>Project not found.</p>
                            <a href="#/projects" class="btn btn-primary">Back to Projects</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        const docSnap = snapshot.docs[0];
        currentProject = { id: docSnap.id, ...docSnap.data() };
        renderProjectDetail();
    });
}

// Cleanup
export async function destroy() {
    console.log('[ProjectDetail] Destroying view...');

    if (listener) {
        listener();
        listener = null;
    }

    currentProject = null;
    projectCode = null;

    delete window.saveField;
    delete window.toggleActive;
    delete window.confirmDelete;

    console.log('[ProjectDetail] View destroyed');
}

// Render project detail
function renderProjectDetail() {
    const container = document.getElementById('projectDetailContainer');
    if (!container || !currentProject) return;

    const focusedField = document.activeElement?.dataset?.field;

    container.innerHTML = `
        <div class="container" style="margin-top: 2rem;">
            <!-- Header -->
            <div style="margin-bottom: 1.5rem;">
                <h2>${currentProject.project_code}</h2>
                <p style="color: #64748b; margin-top: 0.25rem;">
                    ${currentProject.project_name}
                </p>
                <p style="color: #94a3b8; font-size: 0.875rem;">
                    Created: ${formatDate(currentProject.created_at)}
                    ${currentProject.updated_at ? ' | Updated: ' + formatDate(currentProject.updated_at) : ''}
                </p>
            </div>

            <!-- Basic Info Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem; color: #1e293b;">Basic Information</h3>

                    <div class="form-group">
                        <label>Project Code</label>
                        <input type="text" value="${currentProject.project_code}" disabled
                               style="background: #f5f5f5; cursor: not-allowed;">
                        <small class="form-hint" style="color: #64748b;">Cannot be changed</small>
                    </div>

                    <div class="form-group">
                        <label>Project Name *</label>
                        <input type="text"
                               data-field="project_name"
                               value="${currentProject.project_name || ''}"
                               onblur="window.saveField('project_name', this.value)"
                               placeholder="Enter project name">
                    </div>

                    <div class="form-group">
                        <label>Client</label>
                        <input type="text" value="${currentProject.client_code || ''}" disabled
                               style="background: #f5f5f5; cursor: not-allowed;">
                        <small class="form-hint" style="color: #64748b;">Linked to project code - cannot be changed</small>
                    </div>
                </div>
            </div>

            <!-- Financial Details Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem; color: #1e293b;">Financial Details</h3>

                    <div class="form-group">
                        <label>Budget</label>
                        <input type="number"
                               data-field="budget"
                               value="${currentProject.budget || ''}"
                               onblur="window.saveField('budget', this.value)"
                               placeholder="(Not set)"
                               min="0" step="0.01">
                        ${currentProject.budget ? `<small class="form-hint" style="color: #64748b;">PHP ${formatCurrency(currentProject.budget)}</small>` : ''}
                    </div>

                    <div class="form-group">
                        <label>Contract Cost</label>
                        <input type="number"
                               data-field="contract_cost"
                               value="${currentProject.contract_cost || ''}"
                               onblur="window.saveField('contract_cost', this.value)"
                               placeholder="(Not set)"
                               min="0" step="0.01">
                        ${currentProject.contract_cost ? `<small class="form-hint" style="color: #64748b;">PHP ${formatCurrency(currentProject.contract_cost)}</small>` : ''}
                    </div>
                </div>
            </div>

            <!-- Status Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem; color: #1e293b;">Status</h3>

                    <div class="form-group">
                        <label>Internal Status</label>
                        <select data-field="internal_status"
                                onchange="window.saveField('internal_status', this.value)">
                            ${INTERNAL_STATUS_OPTIONS.map(s =>
                                `<option value="${s}" ${currentProject.internal_status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Status</label>
                        <select data-field="project_status"
                                onchange="window.saveField('project_status', this.value)">
                            ${PROJECT_STATUS_OPTIONS.map(s =>
                                `<option value="${s}" ${currentProject.project_status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Active Status</label>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <input type="checkbox"
                                   id="activeToggle"
                                   ${currentProject.active ? 'checked' : ''}
                                   onchange="window.toggleActive(this.checked)"
                                   style="width: 1.25rem; height: 1.25rem; cursor: pointer;">
                            <span style="color: ${currentProject.active ? '#059669' : '#64748b'};">
                                ${currentProject.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Personnel Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem; color: #1e293b;">Personnel</h3>

                    <div class="form-group">
                        <label>Assigned Personnel</label>
                        <input type="text"
                               data-field="personnel"
                               value="${currentProject.personnel || ''}"
                               onblur="window.saveField('personnel', this.value)"
                               placeholder="(Not set)">
                        <small class="form-hint" style="color: #64748b;">Freetext field for personnel assignment</small>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-bottom: 2rem;">
                <button class="btn btn-danger" onclick="window.confirmDelete()">
                    Delete Project
                </button>
            </div>
        </div>
    `;

    // Restore focus if field was focused before re-render
    if (focusedField) {
        const field = document.querySelector(`[data-field="${focusedField}"]`);
        if (field) field.focus();
    }
}

// Save field
async function saveField(fieldName, newValue) {
    // Reject locked fields
    if (['project_code', 'client_id', 'client_code'].includes(fieldName)) {
        console.error('[ProjectDetail] Attempted to edit locked field:', fieldName);
        return false;
    }

    clearFieldError(fieldName);

    // Validation
    if (fieldName === 'project_name' && !newValue.trim()) {
        showFieldError(fieldName, 'Project name is required');
        return false;
    }

    if ((fieldName === 'budget' || fieldName === 'contract_cost') && newValue) {
        const num = parseFloat(newValue);
        if (isNaN(num) || num <= 0) {
            showFieldError(fieldName, 'Must be a positive number (greater than 0)');
            return false;
        }
    }

    // Prepare value
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'personnel') {
        valueToSave = newValue.trim() || null;
    } else if (fieldName === 'project_name') {
        valueToSave = newValue.trim();
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });
        // Silent success per CONTEXT.md
        console.log('[ProjectDetail] Saved', fieldName);
        return true;
    } catch (error) {
        console.error('[ProjectDetail] Save failed:', error);
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

// Toggle active status
async function toggleActive(newValue) {
    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            active: newValue,
            updated_at: new Date().toISOString()
        });
        console.log('[ProjectDetail] Active status updated to:', newValue);
    } catch (error) {
        console.error('[ProjectDetail] Toggle failed:', error);
        showToast('Failed to update status', 'error');
    }
}

// Confirm delete
async function confirmDelete() {
    const confirmed = confirm(`Delete project "${currentProject.project_name}"? This cannot be undone.`);
    if (!confirmed) return;

    showLoading(true);
    try {
        await deleteDoc(doc(db, 'projects', currentProject.id));
        showToast('Project deleted', 'success');
        window.location.hash = '#/projects';
    } catch (error) {
        console.error('[ProjectDetail] Delete failed:', error);
        showToast('Failed to delete project', 'error');
    } finally {
        showLoading(false);
    }
}

// Show field error
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    clearFieldError(fieldName);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.cssText = 'color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;';

    field.parentNode.appendChild(errorEl);
    field.style.borderColor = '#ef4444';
}

// Clear field error
function clearFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();

    field.style.borderColor = '';
}

// Attach window functions
function attachWindowFunctions() {
    window.saveField = saveField;
    window.toggleActive = toggleActive;
    window.confirmDelete = confirmDelete;
}

console.log('[ProjectDetail] Module loaded');
