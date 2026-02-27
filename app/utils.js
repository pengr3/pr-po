/* ========================================
   UTILITY FUNCTIONS
   Shared utility functions used across views
   ======================================== */

import { db, collection, getDocs, getDoc, updateDoc, doc, query, where, orderBy, limit, arrayUnion, arrayRemove } from './firebase.js';

/* ========================================
   FORMATTING UTILITIES
   ======================================== */

/**
 * Format number as Philippine Peso currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
    return parseFloat(amount || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format date string to readable format
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date string
 */
export function formatDate(dateString) {
    if (!dateString) return 'N/A';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

/**
 * Format timestamp to readable format
 * @param {object} timestamp - Firebase timestamp object
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    try {
        let date;
        if (timestamp.toDate) {
            date = timestamp.toDate();
        } else if (timestamp.seconds != null) {
            date = new Date(timestamp.seconds * 1000);
        } else {
            date = new Date(timestamp);
        }
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return '';
    }
}

/**
 * Parse items JSON string
 * @param {string} itemsJson - JSON string of items
 * @returns {Array} Parsed items array
 */
export function parseItems(itemsJson) {
    if (!itemsJson) return [];

    try {
        return JSON.parse(itemsJson);
    } catch (error) {
        console.error('Error parsing items JSON:', error);
        return [];
    }
}

/* ========================================
   UI UTILITIES
   ======================================== */

/**
 * Show/hide loading overlay
 * @param {boolean} show - Whether to show loading overlay
 */
export function showLoading(show) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.toggle('active', show);
    }
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, error, warning, info)
 */
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast show ${type}`;

    // Auto-hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Show alert message
 * @param {string} type - Type of alert (success, error, warning, info)
 * @param {string} message - Message to display
 */
export function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;

    alertContainer.appendChild(alert);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    }, 5000);
}

/* ========================================
   DATA UTILITIES
   ======================================== */

/**
 * Generate sequential ID for documents
 * @param {string} collectionName - Firestore collection name
 * @param {string} prefix - ID prefix (e.g., 'MRF', 'PR', 'PO')
 * @param {number} year - Year for the ID
 * @returns {Promise<string>} Generated sequential ID
 */
export async function generateSequentialId(collectionName, prefix, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const docs = await getDocs(collection(db, collectionName));

        let maxNum = 0;
        docs.forEach(doc => {
            const id = doc.data()[`${prefix.toLowerCase()}_id`];
            if (id) {
                const parts = id.split('-');
                if (parts.length === 3 && parts[1] === String(currentYear)) {
                    const num = parseInt(parts[2]);
                    if (num > maxNum) {
                        maxNum = num;
                    }
                }
            }
        });

        const newNum = maxNum + 1;
        return `${prefix}-${currentYear}-${String(newNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating sequential ID:', error);
        throw error;
    }
}

/**
 * Generate composite project code: CLMC_CLIENT_YYYY###
 * Shares sequence with Services collection to prevent collisions (CODE-01).
 * Queries BOTH projects and services for the max sequence number so that
 * projects and services never receive the same CLMC code for a given client/year.
 *
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number|null} year - Year for the project code (defaults to current year)
 * @returns {Promise<string>} Generated project code (e.g., CLMC_ACME_2026001)
 *
 * Note: Race condition possible with simultaneous creates — acceptable at current scale.
 * IMPORTANT: Service documents MUST store a client_code field for this query to work.
 */
export async function generateProjectCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC_${clientCode}_${currentYear}000`;
        const rangeMax = `CLMC_${clientCode}_${currentYear}999`;

        // Query BOTH collections in parallel — shared sequence prevents collisions (CODE-01)
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(
                collection(db, 'projects'),
                where('client_code', '==', clientCode),
                where('project_code', '>=', rangeMin),
                where('project_code', '<=', rangeMax)
            )),
            getDocs(query(
                collection(db, 'services'),
                where('client_code', '==', clientCode),
                where('service_code', '>=', rangeMin),
                where('service_code', '<=', rangeMax)
            ))
        ]);

        const codeRegex = /^CLMC_.+_\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(d => {
            const match = d.data().project_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        servicesSnap.forEach(d => {
            const match = d.data().service_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}

/**
 * Get the set of project codes the current user is allowed to see.
 * Returns null if no filtering should be applied (all roles except operations_user,
 * or operations_user with all_projects flag set).
 * Returns an array of project_code strings if the user is scoped to specific projects.
 * Returns an empty array if the user is operations_user with no assignments at all.
 *
 * @returns {string[]|null} Array of allowed project_codes, or null for "no filter"
 */
export function getAssignedProjectCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                          // Not logged in -- no filter
    if (user.role !== 'operations_user') return null; // Only operations_user is scoped

    if (user.all_projects === true) return null;     // "All projects" escape hatch

    // Return the array if present, otherwise empty array (zero assignments)
    return Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes : [];
}

/**
 * Generate composite service code: CLMC_CLIENT_YYYY###
 * Shares sequence with Projects collection to prevent collisions (SERV-02).
 * Queries BOTH projects and services for the max sequence number so that
 * services and projects never receive the same CLMC code for a given client/year.
 *
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number|null} year - Year for the code (defaults to current year)
 * @returns {Promise<string>} Generated service code (e.g., CLMC_ACME_2026003)
 *
 * Note: Race condition possible with simultaneous creates — acceptable at current scale.
 * IMPORTANT: Service documents MUST store a client_code field for this query to work.
 * Future: if collision risk grows, migrate to a counter document with FieldValue.increment().
 */
export async function generateServiceCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC_${clientCode}_${currentYear}000`;
        const rangeMax = `CLMC_${clientCode}_${currentYear}999`;

        // Query BOTH collections in parallel (shared sequence, SERV-02)
        const [projectsSnap, servicesSnap] = await Promise.all([
            getDocs(query(
                collection(db, 'projects'),
                where('client_code', '==', clientCode),
                where('project_code', '>=', rangeMin),
                where('project_code', '<=', rangeMax)
            )),
            getDocs(query(
                collection(db, 'services'),
                where('client_code', '==', clientCode),
                where('service_code', '>=', rangeMin),
                where('service_code', '<=', rangeMax)
            ))
        ]);

        const codeRegex = /^CLMC_.+_\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(d => {
            const match = d.data().project_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        servicesSnap.forEach(d => {
            const match = d.data().service_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        return `CLMC_${clientCode}_${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Services] Error generating service code:', error);
        throw error;
    }
}

/**
 * Get the set of service codes the current user is allowed to see.
 * Returns null if no filtering should be applied (all roles except services_user,
 * or services_user with all_services flag set).
 * Returns an array of service_code strings if the user is scoped to specific services.
 * Returns an empty array if the user is services_user with no assignments at all.
 *
 * @returns {string[]|null} Array of allowed service_codes, or null for "no filter"
 */
export function getAssignedServiceCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                           // Not logged in -- no filter
    if (user.role !== 'services_user') return null;  // Only services_user is scoped

    if (user.all_services === true) return null;      // "All services" escape hatch

    // Return the array if present, otherwise empty array (zero assignments)
    return Array.isArray(user.assigned_service_codes) ? user.assigned_service_codes : [];
}

/**
 * Get all active projects
 * @returns {Promise<Array>} Array of active projects
 */
export async function getActiveProjects() {
    try {
        const q = query(
            collection(db, 'projects'),
            where('status', '==', 'active')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching active projects:', error);
        return [];
    }
}

/**
 * Get all suppliers
 * @returns {Promise<Array>} Array of suppliers
 */
export async function getAllSuppliers() {
    try {
        const snapshot = await getDocs(collection(db, 'suppliers'));
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        return [];
    }
}

/**
 * Calculate total from items
 * @param {Array} items - Array of items with quantity and unit_cost
 * @returns {number} Total amount
 */
export function calculateTotal(items) {
    if (!Array.isArray(items)) return 0;

    return items.reduce((total, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        return total + (quantity * unitCost);
    }, 0);
}

/* ========================================
   VALIDATION UTILITIES
   ======================================== */

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

/**
 * Validate phone number (Philippine format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
export function validatePhone(phone) {
    const re = /^(\+63|0)?9\d{9}$/;
    return re.test(phone.replace(/\s|-/g, ''));
}

/**
 * Validate required fields
 * @param {object} data - Object with field values
 * @param {Array} requiredFields - Array of required field names
 * @returns {object} { valid: boolean, missingFields: Array }
 */
export function validateRequired(data, requiredFields) {
    const missingFields = [];

    requiredFields.forEach(field => {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            missingFields.push(field);
        }
    });

    return {
        valid: missingFields.length === 0,
        missingFields
    };
}

/* ========================================
   STATUS UTILITIES
   ======================================== */

/**
 * Get status badge class
 * @param {string} status - Status value
 * @returns {string} CSS class for status badge
 */
export function getStatusClass(status) {
    const statusLower = (status || '').toLowerCase();

    const statusMap = {
        'pending': 'pending',
        'approved': 'approved',
        'rejected': 'rejected',
        'completed': 'approved',
        'active': 'approved',
        'inactive': 'rejected',
        // Procurement statuses
        'pending procurement': 'pending',
        'procuring': 'procuring',
        'procured': 'approved',
        'delivered': 'delivered',
        // Finance statuses
        'finance approved': 'approved',
        'finance rejected': 'rejected',
        'pr rejected': 'rejected',
        'tr rejected': 'rejected',
        // PR generation statuses
        'pr generated': 'procuring',
        'po issued': 'procuring',
    };

    return statusMap[statusLower] || 'pending';
}

/**
 * Get urgency level class
 * @param {string} urgency - Urgency level
 * @returns {string} CSS class for urgency badge
 */
export function getUrgencyClass(urgency) {
    const urgencyLower = (urgency || '').toLowerCase();

    return urgencyLower === 'low' ? 'low' :
           urgencyLower === 'medium' ? 'medium' :
           urgencyLower === 'high' ? 'high' :
           urgencyLower === 'critical' ? 'critical' : 'medium';
}

/* ========================================
   STORAGE UTILITIES
   ======================================== */

/**
 * Save to local storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
export function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

/**
 * Get from local storage
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} Retrieved value or default
 */
export function getFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Error getting from storage:', error);
        return defaultValue;
    }
}

/**
 * Remove from local storage
 * @param {string} key - Storage key
 */
export function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error('Error removing from storage:', error);
    }
}

/* ========================================
   EXPORT UTILITIES TO WINDOW (for onclick handlers)
   ======================================== */

window.utils = {
    formatCurrency,
    formatDate,
    formatTimestamp,
    parseItems,
    showLoading,
    showToast,
    showAlert,
    generateSequentialId,
    getAssignedProjectCodes,
    generateServiceCode,
    getAssignedServiceCodes,
    getActiveProjects,
    getAllSuppliers,
    calculateTotal,
    validateEmail,
    validatePhone,
    validateRequired,
    getStatusClass,
    getUrgencyClass,
    saveToStorage,
    getFromStorage,
    removeFromStorage
};

window.getAssignedProjectCodes = getAssignedProjectCodes;
window.generateServiceCode = generateServiceCode;
window.getAssignedServiceCodes = getAssignedServiceCodes;
window.syncServicePersonnelToAssignments = syncServicePersonnelToAssignments;

/* ========================================
   PERSONNEL UTILITIES
   ======================================== */

/**
 * Normalize personnel data from any legacy format to array format.
 * Does NOT write back to Firestore (migrate-on-edit strategy from Phase 15).
 *
 * Input formats handled:
 * 1. Phase 20 array format: { personnel_user_ids: [...], personnel_names: [...] }
 * 2. Phase 15 single-user format: { personnel_user_id: 'id', personnel_name: 'name' }
 * 3. Phase 2 freetext format: { personnel: 'freetext name' }
 * 4. Empty/missing: all fields null or absent
 *
 * @param {object} project - Project document from Firestore
 * @returns {{ userIds: string[], names: string[] }}
 */
export function normalizePersonnel(project) {
    // Phase 20 array format
    if (Array.isArray(project.personnel_user_ids) && project.personnel_user_ids.length > 0) {
        return {
            userIds: project.personnel_user_ids,
            names: project.personnel_names || []
        };
    }

    // Phase 15 single-user format
    if (project.personnel_user_id) {
        return {
            userIds: [project.personnel_user_id],
            names: [project.personnel_name || '']
        };
    }

    // Phase 2 freetext format
    if (project.personnel) {
        return {
            userIds: [],
            names: [project.personnel]
        };
    }

    // Empty/missing
    return { userIds: [], names: [] };
}

/* ========================================
   PERSONNEL-ASSIGNMENT SYNC
   ======================================== */

/**
 * Sync personnel assignments to user assigned_project_codes.
 * When personnel are added/removed from a project, atomically update
 * each affected user's assigned_project_codes using arrayUnion/arrayRemove.
 *
 * Designed to be called fire-and-forget (.catch()) -- never blocks the caller.
 *
 * @param {string} projectCode - The project_code to add/remove from users
 * @param {string[]} previousUserIds - User IDs before the mutation
 * @param {string[]} newUserIds - User IDs after the mutation
 * @returns {Promise<Array>} Array of errors (empty if all succeeded)
 */
export async function syncPersonnelToAssignments(projectCode, previousUserIds, newUserIds) {
    if (!projectCode) {
        console.warn('[PersonnelSync] No project_code provided, skipping sync (legacy project?)');
        return [];
    }

    const prevSet = new Set((previousUserIds || []).filter(Boolean));
    const newSet = new Set((newUserIds || []).filter(Boolean));

    const addedUserIds = [...newSet].filter(id => !prevSet.has(id));
    const removedUserIds = [...prevSet].filter(id => !newSet.has(id));

    console.log(`[PersonnelSync] Syncing for project: ${projectCode} | Added: ${addedUserIds.length}, Removed: ${removedUserIds.length}`);

    if (addedUserIds.length === 0 && removedUserIds.length === 0) {
        return [];
    }

    const errors = [];

    // Process additions -- check all_projects flag before adding
    for (const userId of addedUserIds) {
        try {
            // Try to check all_projects flag; skip read errors gracefully
            // (operations_user can't read other users' docs -- just proceed with the add)
            let skipUser = false;
            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists() && userDoc.data().all_projects === true) {
                    console.log(`[PersonnelSync] Skipping ${userId} (all_projects=true)`);
                    skipUser = true;
                }
            } catch (readErr) {
                console.log(`[PersonnelSync] Cannot read user ${userId} (permission), proceeding with add`);
            }
            if (skipUser) continue;

            await updateDoc(doc(db, 'users', userId), {
                assigned_project_codes: arrayUnion(projectCode)
            });
        } catch (err) {
            console.error(`[PersonnelSync] Failed to add project to user ${userId}:`, err);
            errors.push(err);
        }
    }

    // Process removals -- arrayRemove on non-existent value is a no-op
    for (const userId of removedUserIds) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                assigned_project_codes: arrayRemove(projectCode)
            });
        } catch (err) {
            console.error(`[PersonnelSync] Failed to remove project from user ${userId}:`, err);
            errors.push(err);
        }
    }

    if (errors.length > 0) {
        console.warn(`[PersonnelSync] Completed with ${errors.length} error(s)`);
    }

    return errors;
}

/**
 * Sync personnel assignments to user assigned_service_codes.
 * When personnel are added/removed from a service, atomically update
 * each affected user's assigned_service_codes using arrayUnion/arrayRemove.
 *
 * Designed to be called fire-and-forget (.catch()) -- never blocks the caller.
 *
 * @param {string} serviceCode - The service_code to add/remove from users
 * @param {string[]} previousUserIds - User IDs before the mutation
 * @param {string[]} newUserIds - User IDs after the mutation
 * @returns {Promise<Array>} Array of errors (empty if all succeeded)
 */
export async function syncServicePersonnelToAssignments(serviceCode, previousUserIds, newUserIds) {
    if (!serviceCode) {
        console.warn('[ServicePersonnelSync] No service_code provided, skipping sync');
        return [];
    }

    const prevSet = new Set((previousUserIds || []).filter(Boolean));
    const newSet = new Set((newUserIds || []).filter(Boolean));

    const addedUserIds = [...newSet].filter(id => !prevSet.has(id));
    const removedUserIds = [...prevSet].filter(id => !newSet.has(id));

    console.log(`[ServicePersonnelSync] Syncing for service: ${serviceCode} | Added: ${addedUserIds.length}, Removed: ${removedUserIds.length}`);

    if (addedUserIds.length === 0 && removedUserIds.length === 0) {
        return [];
    }

    const errors = [];

    // Process additions -- check all_services flag before adding
    for (const userId of addedUserIds) {
        try {
            // Try to check all_services flag; skip read errors gracefully
            // (services_user can't read other users' docs -- just proceed with the add)
            let skipUser = false;
            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists() && userDoc.data().all_services === true) {
                    console.log(`[ServicePersonnelSync] Skipping ${userId} (all_services=true)`);
                    skipUser = true;
                }
            } catch (readErr) {
                console.log(`[ServicePersonnelSync] Cannot read user ${userId} (permission), proceeding with add`);
            }
            if (skipUser) continue;

            await updateDoc(doc(db, 'users', userId), {
                assigned_service_codes: arrayUnion(serviceCode)
            });
        } catch (err) {
            console.error(`[ServicePersonnelSync] Failed to add service to user ${userId}:`, err);
            errors.push(err);
        }
    }

    // Process removals -- arrayRemove on non-existent value is a no-op
    for (const userId of removedUserIds) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                assigned_service_codes: arrayRemove(serviceCode)
            });
        } catch (err) {
            console.error(`[ServicePersonnelSync] Failed to remove service from user ${userId}:`, err);
            errors.push(err);
        }
    }

    if (errors.length > 0) {
        console.warn(`[ServicePersonnelSync] Completed with ${errors.length} error(s)`);
    }

    return errors;
}

console.log('Utilities module loaded successfully');

/* ========================================
   CSV EXPORT UTILITIES
   ======================================== */

/**
 * Download an array of objects as a CSV file.
 * @param {string[]} headers - Column header labels (in order)
 * @param {(string|number|null)[][]} rows - 2D array of cell values, one array per row
 * @param {string} filename - Filename for the download (include .csv extension)
 */
export function downloadCSV(headers, rows, filename) {
    const escape = (val) => {
        if (val == null) return '';
        const str = String(val);
        // Wrap in double quotes if value contains comma, double quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const csvLines = [
        headers.map(escape).join(','),
        ...rows.map(row => row.map(escape).join(','))
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
