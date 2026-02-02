/* ========================================
   ROLE CONFIGURATION VIEW
   Super Admin interface for managing role permissions
   ======================================== */

import { db } from '../firebase.js';
import {
    collection,
    doc,
    onSnapshot,
    writeBatch,
    serverTimestamp
} from '../firebase.js';
import { showToast } from '../utils.js';

/* ========================================
   MODULE STATE
   ======================================== */

// Tab definitions (for display order and labels)
const TABS = [
    { id: 'dashboard', label: 'Dashboard (Home)' },
    { id: 'clients', label: 'Clients' },
    { id: 'projects', label: 'Projects' },
    { id: 'mrf_form', label: 'Material Request' },
    { id: 'procurement', label: 'Procurement' },
    { id: 'finance', label: 'Finance' },
    { id: 'role_config', label: 'Role Configuration' }
];

const ROLE_ORDER = ['super_admin', 'operations_admin', 'operations_user', 'finance', 'procurement'];

const ROLE_LABELS = {
    super_admin: 'Super Admin',
    operations_admin: 'Operations Admin',
    operations_user: 'Operations User',
    finance: 'Finance',
    procurement: 'Procurement'
};

// Module-level state
let roleTemplates = {};  // Stores loaded role templates by role_id
let listeners = [];      // Array of unsubscribe functions
let pendingChanges = {}; // Tracks unsaved changes: { roleId: { tabId: { permission: value } } }

/* ========================================
   RENDER FUNCTIONS
   ======================================== */

/**
 * Render the permission matrix table
 * @returns {string} HTML for the permission matrix
 */
function renderPermissionMatrix() {
    const roleHeaders = ROLE_ORDER.map(roleId =>
        `<th>${ROLE_LABELS[roleId] || roleId}</th>`
    ).join('');

    const tabRows = TABS.map(tab => {
        // Access row
        const accessCells = ROLE_ORDER.map(roleId => {
            const isChecked = getPermissionValue(roleId, tab.id, 'access');
            const isDisabled = roleId === 'super_admin' && tab.id === 'role_config';
            const hasChange = hasPendingChange(roleId, tab.id, 'access');

            return `
                <td class="${hasChange ? 'has-changes' : ''}">
                    <input
                        type="checkbox"
                        ${isChecked ? 'checked' : ''}
                        ${isDisabled ? 'disabled' : ''}
                        data-role="${roleId}"
                        data-tab="${tab.id}"
                        data-permission="access"
                        onchange="handleRoleConfigCheckboxChange(event)"
                    />
                </td>
            `;
        }).join('');

        // Edit row
        const editCells = ROLE_ORDER.map(roleId => {
            const isChecked = getPermissionValue(roleId, tab.id, 'edit');
            const isDisabled = roleId === 'super_admin' && tab.id === 'role_config';
            const hasChange = hasPendingChange(roleId, tab.id, 'edit');

            return `
                <td class="${hasChange ? 'has-changes' : ''}">
                    <input
                        type="checkbox"
                        ${isChecked ? 'checked' : ''}
                        ${isDisabled ? 'disabled' : ''}
                        data-role="${roleId}"
                        data-tab="${tab.id}"
                        data-permission="edit"
                        onchange="handleRoleConfigCheckboxChange(event)"
                    />
                </td>
            `;
        }).join('');

        return `
            <tr>
                <td rowspan="2" class="tab-name">${tab.label}</td>
                <td class="permission-type">Access</td>
                ${accessCells}
            </tr>
            <tr>
                <td class="permission-type">Edit</td>
                ${editCells}
            </tr>
        `;
    }).join('');

    return `
        <table class="permission-matrix">
            <thead>
                <tr>
                    <th>Tab</th>
                    <th>Permission</th>
                    ${roleHeaders}
                </tr>
            </thead>
            <tbody>
                ${tabRows}
            </tbody>
        </table>
    `;
}

/**
 * Get permission value (considers pending changes)
 * @param {string} roleId - Role ID
 * @param {string} tabId - Tab ID
 * @param {string} permission - 'access' or 'edit'
 * @returns {boolean} Permission value
 */
function getPermissionValue(roleId, tabId, permission) {
    // Check pending changes first
    if (pendingChanges[roleId]?.[tabId]?.[permission] !== undefined) {
        return pendingChanges[roleId][tabId][permission];
    }

    // Fall back to loaded role template
    return roleTemplates[roleId]?.permissions?.tabs?.[tabId]?.[permission] || false;
}

/**
 * Check if there's a pending change for a permission
 * @param {string} roleId - Role ID
 * @param {string} tabId - Tab ID
 * @param {string} permission - 'access' or 'edit'
 * @returns {boolean} True if there's a pending change
 */
function hasPendingChange(roleId, tabId, permission) {
    return pendingChanges[roleId]?.[tabId]?.[permission] !== undefined;
}

/**
 * Render the main view HTML
 * @returns {string} HTML for the role configuration view
 */
export function render(activeTab = null) {
    return `
        <div class="role-config-container">
            <div class="role-config-header">
                <h1>Role Configuration</h1>
                <p>Manage permissions for each role. Changes apply immediately to all users.</p>
            </div>

            <div class="role-config-info">
                <span class="role-config-info-icon">ℹ️</span>
                <div class="role-config-info-text">
                    <strong>Important:</strong> Permission changes are applied to all users with the affected role in real-time.
                    Super Admin's access to Role Configuration cannot be modified to prevent lockout.
                </div>
            </div>

            <div class="permission-matrix-card">
                <div id="permissionMatrixContainer">
                    ${renderPermissionMatrix()}
                </div>
            </div>

            <div class="role-config-actions">
                <div class="unsaved-indicator ${Object.keys(pendingChanges).length > 0 ? 'visible' : ''}" id="unsavedIndicator">
                    ⚠️ You have unsaved changes
                </div>
                <div class="saving-indicator" id="savingIndicator">
                    <div class="spinner"></div>
                    <span>Saving changes...</span>
                </div>
                <button class="btn btn-secondary" onclick="handleRoleConfigDiscard()">
                    Discard Changes
                </button>
                <button class="btn btn-primary" onclick="handleRoleConfigSave()">
                    Save Changes
                </button>
            </div>
        </div>
    `;
}

/* ========================================
   INITIALIZATION AND CLEANUP
   ======================================== */

/**
 * Initialize the view
 * @param {string} activeTab - Active tab (unused in this view)
 */
export async function init(activeTab = null) {
    console.log('[RoleConfig] Initializing role configuration view');

    // Set up real-time listener on role_templates collection
    const roleTemplatesRef = collection(db, 'role_templates');

    const unsubscribe = onSnapshot(
        roleTemplatesRef,
        (snapshot) => {
            console.log('[RoleConfig] Role templates updated');

            // Clear and repopulate roleTemplates
            roleTemplates = {};
            snapshot.forEach(doc => {
                roleTemplates[doc.id] = doc.data();
            });

            console.log('[RoleConfig] Loaded', snapshot.size, 'role templates');

            // Re-render matrix to show current values
            const container = document.getElementById('permissionMatrixContainer');
            if (container) {
                container.innerHTML = renderPermissionMatrix();
            }
        },
        (error) => {
            console.error('[RoleConfig] Error listening to role templates:', error);
            showToast('Error loading role templates: ' + error.message, 'error');
        }
    );

    listeners.push(unsubscribe);

    // Attach window functions for event handlers
    window.handleRoleConfigCheckboxChange = handleCheckboxChange;
    window.handleRoleConfigSave = handleSave;
    window.handleRoleConfigDiscard = handleDiscard;

    console.log('[RoleConfig] Initialization complete');
}

/**
 * Cleanup when leaving view
 */
export async function destroy() {
    console.log('[RoleConfig] Destroying role configuration view');

    // Unsubscribe all listeners
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];

    // Clear state
    roleTemplates = {};
    pendingChanges = {};

    // Remove window functions
    delete window.handleRoleConfigCheckboxChange;
    delete window.handleRoleConfigSave;
    delete window.handleRoleConfigDiscard;

    console.log('[RoleConfig] Cleanup complete');
}

/* ========================================
   EVENT HANDLERS
   ======================================== */

/**
 * Handle checkbox change event
 * @param {Event} event - Change event from checkbox
 */
function handleCheckboxChange(event) {
    const checkbox = event.target;
    const roleId = checkbox.dataset.role;
    const tabId = checkbox.dataset.tab;
    const permission = checkbox.dataset.permission;
    const newValue = checkbox.checked;

    console.log('[RoleConfig] Permission change:', { roleId, tabId, permission, newValue });

    // Initialize nested objects if needed
    if (!pendingChanges[roleId]) {
        pendingChanges[roleId] = {};
    }
    if (!pendingChanges[roleId][tabId]) {
        pendingChanges[roleId][tabId] = {};
    }

    // Store the change
    pendingChanges[roleId][tabId][permission] = newValue;

    // Update unsaved changes indicator
    const unsavedIndicator = document.getElementById('unsavedIndicator');
    if (unsavedIndicator) {
        if (Object.keys(pendingChanges).length > 0) {
            unsavedIndicator.classList.add('visible');
        } else {
            unsavedIndicator.classList.remove('visible');
        }
    }

    // Mark the cell as having changes
    const cell = checkbox.closest('td');
    if (cell) {
        cell.classList.add('has-changes');
    }
}

/**
 * Save all pending changes to Firestore
 */
async function handleSave() {
    if (Object.keys(pendingChanges).length === 0) {
        showToast('No changes to save', 'info');
        return;
    }

    console.log('[RoleConfig] Saving changes:', pendingChanges);

    // Show saving indicator
    const savingIndicator = document.getElementById('savingIndicator');
    if (savingIndicator) {
        savingIndicator.classList.add('visible');
    }

    try {
        // Create batch write
        const batch = writeBatch(db);
        const changedRoles = [];

        // For each role with changes
        for (const roleId in pendingChanges) {
            changedRoles.push(roleId);
            const roleRef = doc(db, 'role_templates', roleId);
            const roleChanges = pendingChanges[roleId];

            // Build update object with dot notation
            const updateObj = {
                updated_at: serverTimestamp()
            };

            for (const tabId in roleChanges) {
                for (const permission in roleChanges[tabId]) {
                    const value = roleChanges[tabId][permission];
                    updateObj[`permissions.tabs.${tabId}.${permission}`] = value;
                }
            }

            // Add to batch
            batch.update(roleRef, updateObj);
        }

        // Commit batch
        await batch.commit();

        console.log('[RoleConfig] Permissions updated for roles:', changedRoles);

        // Clear pending changes
        pendingChanges = {};

        // Hide saving indicator
        if (savingIndicator) {
            savingIndicator.classList.remove('visible');
        }

        // Hide unsaved changes indicator
        const unsavedIndicator = document.getElementById('unsavedIndicator');
        if (unsavedIndicator) {
            unsavedIndicator.classList.remove('visible');
        }

        // Remove has-changes class from all cells
        document.querySelectorAll('.permission-matrix td.has-changes').forEach(cell => {
            cell.classList.remove('has-changes');
        });

        showToast('Permissions updated successfully', 'success');

    } catch (error) {
        console.error('[RoleConfig] Error saving permissions:', error);
        showToast('Error saving permissions: ' + error.message, 'error');

        // Hide saving indicator
        if (savingIndicator) {
            savingIndicator.classList.remove('visible');
        }
    }
}

/**
 * Discard all pending changes
 */
function handleDiscard() {
    if (Object.keys(pendingChanges).length === 0) {
        showToast('No changes to discard', 'info');
        return;
    }

    console.log('[RoleConfig] Discarding changes');

    // Clear pending changes
    pendingChanges = {};

    // Hide unsaved changes indicator
    const unsavedIndicator = document.getElementById('unsavedIndicator');
    if (unsavedIndicator) {
        unsavedIndicator.classList.remove('visible');
    }

    // Re-render matrix to restore original values
    const container = document.getElementById('permissionMatrixContainer');
    if (container) {
        container.innerHTML = renderPermissionMatrix();
    }

    showToast('Changes discarded', 'info');
}

console.log('[RoleConfig] Module loaded successfully');
