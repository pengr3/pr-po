/* ========================================
   EDIT HISTORY MODULE - Shared
   Record and display project edit history
   ======================================== */

import { db, collection, addDoc, getDocs, query, orderBy, doc } from './firebase.js';
import { createTimeline } from './components.js';
import { formatDate, formatCurrency, showLoading } from './utils.js';

/* ========================================
   INTERNAL HELPERS
   ======================================== */

/**
 * Map internal field names to human-readable labels
 * @param {string} fieldName - Internal field name
 * @returns {string} Human-readable label
 */
function formatFieldName(fieldName) {
    const fieldLabels = {
        'project_name': 'Project Name',
        'budget': 'Budget',
        'contract_cost': 'Contract Cost',
        'internal_status': 'Internal Status',
        'project_status': 'Project Status',
        'active': 'Active Status',
        'personnel': 'Personnel',
        'client_code': 'Client',
        'client_id': 'Client'
    };
    return fieldLabels[fieldName] || fieldName;
}

/**
 * Format values for display
 * @param {*} value - Value to format
 * @returns {string} Formatted value string
 */
function formatValue(value) {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
    if (typeof value === 'number') return formatCurrency(value);
    return String(value);
}

/**
 * Map action types to human-readable labels
 * @param {string} action - Action type
 * @returns {string} Human-readable label
 */
function getActionLabel(action) {
    const actionLabels = {
        'create': 'Project Created',
        'update': 'Fields Updated',
        'toggle_active': 'Status Changed',
        'personnel_add': 'Personnel Added',
        'personnel_remove': 'Personnel Removed'
    };
    return actionLabels[action] || 'Updated';
}

/* ========================================
   RECORD EDIT HISTORY
   ======================================== */

/**
 * Record an edit history entry for a project.
 * Fire-and-forget pattern: catches errors and logs, never throws.
 *
 * @param {string} projectDocId - Firestore document ID of the project
 * @param {string} action - One of: 'create', 'update', 'toggle_active', 'personnel_add', 'personnel_remove'
 * @param {Array<{field: string, old_value: *, new_value: *}>} changes - Array of field changes
 */
export async function recordEditHistory(projectDocId, action, changes) {
    try {
        const user = window.getCurrentUser?.();
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
        await addDoc(historyRef, {
            timestamp: new Date().toISOString(),
            user_id: user?.uid || 'unknown',
            user_name: user?.full_name || 'Unknown User',
            action: action,
            changes: changes
        });
        console.log('[EditHistory] Recorded:', action, changes.length, 'change(s)');
    } catch (error) {
        console.error('[EditHistory] Failed to record:', error);
    }
}

/* ========================================
   SHOW EDIT HISTORY MODAL
   ======================================== */

/**
 * Fetch edit history for a project and display in a modal.
 * Uses createTimeline() from components.js for visualization.
 *
 * @param {string} projectDocId - Firestore document ID of the project
 * @param {string} projectCode - Project code for display in modal header
 */
export async function showEditHistoryModal(projectDocId, projectCode) {
    showLoading(true);

    try {
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        const timelineItems = [];
        snapshot.forEach(historyDoc => {
            const entry = historyDoc.data();
            const changesDesc = entry.changes.map(c =>
                `<strong>${formatFieldName(c.field)}</strong>: ${formatValue(c.old_value)} &rarr; ${formatValue(c.new_value)}`
            ).join('<br>');

            timelineItems.push({
                title: `${getActionLabel(entry.action)} by ${entry.user_name}`,
                date: formatDate(entry.timestamp),
                description: changesDesc,
                status: 'completed'
            });
        });

        // Build timeline content
        let bodyContent;
        if (timelineItems.length === 0) {
            bodyContent = '<p style="color: #64748b; text-align: center; padding: 2rem 0;">No edit history recorded yet.</p>';
        } else {
            bodyContent = createTimeline(timelineItems);
        }

        // Remove existing modal if any
        const existing = document.getElementById('editHistoryModal');
        if (existing) existing.remove();

        const modalHTML = `
            <div id="editHistoryModal" class="modal active">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>Edit History: ${projectCode}</h3>
                        <button class="modal-close" onclick="window.closeEditHistoryModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${bodyContent}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    } catch (error) {
        console.error('[EditHistory] Failed to fetch history:', error);
    } finally {
        showLoading(false);
    }
}

// Window function for modal close
window.closeEditHistoryModal = function() {
    const modal = document.getElementById('editHistoryModal');
    if (modal) modal.remove();
};

console.log('Edit history module loaded successfully');
