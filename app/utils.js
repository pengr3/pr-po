/* ========================================
   UTILITY FUNCTIONS
   Shared utility functions used across views
   ======================================== */

import { db, collection, getDocs, query, where, orderBy, limit, onSnapshot } from './firebase.js';

/* ========================================
   SECURITY UTILITIES
   ======================================== */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for innerHTML
 */
export function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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

/* ========================================
   RFP FEE UTILITIES (Phase 91.3)
   ======================================== */

/**
 * Phase 91.3 RFP Fees — canonical field names. Strategy (a): amount_requested stays
 * the BASE; fees are additive; total_with_fees is the persisted grand total.
 * Legacy RFP docs have NONE of the fee fields — every helper below is legacy-safe.
 */
export const RFP_FEE_FIELDS = ['transfer_fee', 'cash_out_fee', 'misc_fees', 'total_with_fees'];

/**
 * Legacy-safe read of an RFP's supplementary fees.
 * @returns {{transfer:number, cashOut:number, misc:Array<{label:string,amount:number}>, feesTotal:number}}
 */
export function getRFPFees(rfp) {
    const transfer = parseFloat(rfp?.transfer_fee) || 0;
    const cashOut = parseFloat(rfp?.cash_out_fee) || 0;
    const misc = Array.isArray(rfp?.misc_fees) ? rfp.misc_fees : [];
    const miscTotal = misc.reduce((s, m) => s + (parseFloat(m?.amount) || 0), 0);
    return { transfer, cashOut, misc, feesTotal: transfer + cashOut + miscTotal };
}

/**
 * Fee-inclusive grand total. Prefers the persisted total_with_fees when present and
 * consistent with the parts; otherwise recomputes (base + fees). Legacy docs → base.
 * THIS is what all payables / remaining / partial-payment math must track against (D-11).
 */
export function getRFPTotal(rfp) {
    const base = parseFloat(rfp?.amount_requested) || 0;
    const { feesTotal } = getRFPFees(rfp);
    const persisted = parseFloat(rfp?.total_with_fees);
    if (Number.isFinite(persisted) && persisted > 0) return persisted;
    return base + feesTotal;
}

/**
 * Ordered breakdown for itemization (D-07 detail card, tooltip, modal running total).
 * NOTE: misc labels are returned RAW (unescaped) — any caller that renders a label into
 * innerHTML MUST run it through escapeHTML at render time (mitigates T-91.3-02).
 * @returns {{base:number, lines:Array<{label:string, amount:number, kind:string}>,
 *            feesTotal:number, grandTotal:number, hasFees:boolean}}
 */
export function getRFPFeeBreakdown(rfp) {
    const base = parseFloat(rfp?.amount_requested) || 0;
    const { transfer, cashOut, misc, feesTotal } = getRFPFees(rfp);
    const lines = [{ label: 'Base amount', amount: base, kind: 'base' }];
    if (transfer > 0) lines.push({ label: 'Transfer fee', amount: transfer, kind: 'transfer' });
    if (cashOut > 0) lines.push({ label: 'Cash-out fee', amount: cashOut, kind: 'cash_out' });
    misc.forEach(m => {
        const amt = parseFloat(m?.amount) || 0;
        if (amt > 0) lines.push({ label: String(m?.label || 'Misc fee'), amount: amt, kind: 'misc' });
    });
    return { base, lines, feesTotal, grandTotal: base + feesTotal, hasFees: feesTotal > 0 };
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
 * Generate composite project code: CLMC-CLIENT-YYYY###
 * Shares sequence with Services collection to prevent collisions (CODE-01).
 * Queries BOTH projects and services for the max sequence number so that
 * projects and services never receive the same CLMC code for a given client/year.
 *
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number|null} year - Year for the project code (defaults to current year)
 * @returns {Promise<string>} Generated project code (e.g., CLMC-ACME-2026001)
 *
 * Note: Race condition possible with simultaneous creates — acceptable at current scale.
 * IMPORTANT: Service documents MUST store a client_code field for this query to work.
 */
export async function generateProjectCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC-${clientCode}-${currentYear}000`;
        const rangeMax = `CLMC-${clientCode}-${currentYear}999`;

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

        const codeRegex = /^CLMC-.+-\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(d => {
            const match = d.data().project_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        servicesSnap.forEach(d => {
            const match = d.data().service_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        return `CLMC-${clientCode}-${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Projects] Error generating project code:', error);
        throw error;
    }
}

// Quick 260627-kg0 (superseded by quick 260706-mco below): roles EXEMPT from assignment scoping.
// Quick 260706-mco: SPLIT per department. operations_admin (home = projects) sees ALL projects
// but is now assignment-scoped on services (mirrors kg0's operations_user cross-to-services rights);
// services_admin (home = services) sees ALL services but is now assignment-scoped on projects
// (mirrors kg0's services_user cross-to-projects rights). Platform admins + finance/procurement
// remain exempt on BOTH dimensions. Any *_user role (operations_user, services_user) stays
// assignment-scoped on both, which is what makes access assignment-driven, not department-role-driven.
const PROJECT_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'operations_admin']; // projects = operations home dept
const SERVICE_SEE_ALL_ROLES = ['super_admin', 'finance', 'procurement', 'services_admin'];   // services = services home dept

/* ========================================
   PHASE 113 D-08: PERSONNEL-DERIVED ASSIGNMENT CACHE
   ======================================== */

// Module-scope unsubscribe handles for the personnel-derived assignment cache listeners.
// These are pure listener plumbing (not read from inside getAssignedProjectCodes/
// getAssignedServiceCodes bodies), so module scope is safe for them.
//
// The CACHE VALUES THEMSELVES, however, live on `window._personnelAssignedCodes` (not
// module scope) -- see initAssignedCodesListeners()'s doc comment for why: this repo's
// scripts/verify-crossdept-admin-scoping.js extracts getAssignedProjectCodes /
// getAssignedServiceCodes as standalone text and evals them against a stubbed
// `global.window`, so a module-scope let/const referenced from inside a helper body would
// throw ReferenceError there.
let _assignedCodesProjectsUnsub = null;
let _assignedCodesServicesUnsub = null;
let _assignedCodesInitializedForUid = null;

/**
 * Bootstrap the personnel-derived assignment cache (Phase 113 D-08).
 * Attaches real-time `where('personnel_user_ids', 'array-contains', user.uid)` listeners on
 * `projects` and/or `services` -- ONLY for dimensions where the actor is actually scoped (i.e.
 * where getAssignedProjectCodes()/getAssignedServiceCodes() would NOT short-circuit to `null`) --
 * and derives the code lists those two helpers read from `window._personnelAssignedCodes`.
 *
 * Idempotent: a second call for the same user.uid while listeners are already attached is a
 * no-op. Fail-closed: the cache is reset to `{ projects: [], services: [] }` BEFORE anything is
 * attached, so a user with no resolvable uid, or a load that never finishes, sees nothing rather
 * than everything.
 *
 * @param {{uid?: string, role?: string, all_projects?: boolean, all_services?: boolean}|null} user
 * @returns {Promise<void>} resolves once the FIRST snapshot of every attached dimension has
 *   arrived (resolves immediately if neither dimension is scoped for this actor).
 */
export async function initAssignedCodesListeners(user) {
    if (user && user.uid && _assignedCodesInitializedForUid === user.uid) {
        return; // Idempotent: listeners already attached for this uid.
    }
    _assignedCodesInitializedForUid = user?.uid || null;

    // Fail-closed default while loading (T-113-13): never leave the cache undefined.
    window._personnelAssignedCodes = { projects: [], services: [] };

    if (!user || !user.uid) {
        return; // No resolvable uid -- fail-closed empty cache, nothing to attach.
    }

    const scopedForProjects = !PROJECT_SEE_ALL_ROLES.includes(user.role) && user.all_projects !== true;
    const scopedForServices = !SERVICE_SEE_ALL_ROLES.includes(user.role) && user.all_services !== true;

    const waiters = [];

    if (scopedForProjects) {
        let isFirstSnapshot = true;
        waiters.push(new Promise((resolve) => {
            _assignedCodesProjectsUnsub = onSnapshot(
                query(collection(db, 'projects'), where('personnel_user_ids', 'array-contains', user.uid)),
                (snapshot) => {
                    const codes = [];
                    snapshot.forEach((d) => {
                        const code = d.data().project_code;
                        if (code) codes.push(code); // codeless assigned projects contribute no code (handled by consumer-site carve-outs)
                    });
                    const previous = window._personnelAssignedCodes.projects;
                    window._personnelAssignedCodes.projects = codes;
                    if (!isFirstSnapshot && JSON.stringify(codes) !== JSON.stringify(previous)) {
                        window.dispatchEvent(new CustomEvent('assignmentsChanged', { detail: { user: window.getCurrentUser?.() } }));
                    }
                    if (isFirstSnapshot) { isFirstSnapshot = false; resolve(); }
                },
                (error) => {
                    // Keep the last known value -- do NOT clear to null (that would mean "see everything").
                    console.error('[AssignedCodes] projects listener error (keeping last known value):', error);
                    if (isFirstSnapshot) { isFirstSnapshot = false; resolve(); }
                }
            );
        }));
    }

    if (scopedForServices) {
        let isFirstSnapshot = true;
        waiters.push(new Promise((resolve) => {
            _assignedCodesServicesUnsub = onSnapshot(
                query(collection(db, 'services'), where('personnel_user_ids', 'array-contains', user.uid)),
                (snapshot) => {
                    const codes = [];
                    snapshot.forEach((d) => {
                        const code = d.data().service_code;
                        if (code) codes.push(code);
                    });
                    const previous = window._personnelAssignedCodes.services;
                    window._personnelAssignedCodes.services = codes;
                    if (!isFirstSnapshot && JSON.stringify(codes) !== JSON.stringify(previous)) {
                        window.dispatchEvent(new CustomEvent('assignmentsChanged', { detail: { user: window.getCurrentUser?.() } }));
                    }
                    if (isFirstSnapshot) { isFirstSnapshot = false; resolve(); }
                },
                (error) => {
                    console.error('[AssignedCodes] services listener error (keeping last known value):', error);
                    if (isFirstSnapshot) { isFirstSnapshot = false; resolve(); }
                }
            );
        }));
    }

    await Promise.all(waiters);
}

/**
 * Tear down the personnel-derived assignment cache listeners (Phase 113 D-08 / T-113-12).
 * Unsubscribes both listeners (if attached), clears the module-level handles, and resets
 * `window._personnelAssignedCodes` to the fail-closed default so no stale personnel data
 * survives a logout, a deactivation, or a role change.
 */
export function destroyAssignedCodesListeners() {
    if (_assignedCodesProjectsUnsub) {
        _assignedCodesProjectsUnsub();
        _assignedCodesProjectsUnsub = null;
    }
    if (_assignedCodesServicesUnsub) {
        _assignedCodesServicesUnsub();
        _assignedCodesServicesUnsub = null;
    }
    _assignedCodesInitializedForUid = null;
    window._personnelAssignedCodes = { projects: [], services: [] };
}

/**
 * Get the set of project codes the current user is allowed to see.
 * Quick 260627-kg0: ASSIGNMENT-DRIVEN — scoped for BOTH operations_user AND services_user (a
 * services_user assigned to a project is scoped-IN to it).
 * Quick 260706-mco: returns null ("no filter") only for PROJECT_SEE_ALL_ROLES (super_admin / finance /
 * procurement / operations_admin — its HOME department) or when the all_projects escape-hatch flag is
 * set. services_admin is intentionally NOT in PROJECT_SEE_ALL_ROLES, so it falls through to the
 * all_projects check and the fail-closed default like any cross-dept *_user.
 * Phase 113 D-08: the returned codes are DERIVED from live `personnel_user_ids` membership on the
 * `projects` documents themselves (see initAssignedCodesListeners()), not from the frozen
 * `user.assigned_project_codes` array on the user document — that legacy field is deliberately no
 * longer read here. Returns an empty array (deliberate FAIL-CLOSED posture) if a scoped user has
 * zero project assignments, or if the personnel cache hasn't populated yet.
 *
 * @returns {string[]|null} Array of allowed project_codes, or null for "no filter"
 */
export function getAssignedProjectCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                              // Not logged in -- no filter
    if (PROJECT_SEE_ALL_ROLES.includes(user.role)) return null; // Home-dept admins/finance/procurement: no filter

    if (user.all_projects === true) return null;         // "All projects" escape hatch (no-op for a services_user)

    // Any non-exempt role (operations_user, services_user, or unknown/future) is scoped to the
    // personnel-derived cache. Missing/malformed cache => [] = sees nothing (FAIL-CLOSED default).
    return Array.isArray(window._personnelAssignedCodes?.projects) ? window._personnelAssignedCodes.projects : [];
}

/**
 * Generate composite service code: CLMC-CLIENT-YYYY###
 * Shares sequence with Projects collection to prevent collisions (SERV-02).
 * Queries BOTH projects and services for the max sequence number so that
 * services and projects never receive the same CLMC code for a given client/year.
 *
 * @param {string} clientCode - Client code (e.g., "ACME")
 * @param {number|null} year - Year for the code (defaults to current year)
 * @returns {Promise<string>} Generated service code (e.g., CLMC-ACME-2026003)
 *
 * Note: Race condition possible with simultaneous creates — acceptable at current scale.
 * IMPORTANT: Service documents MUST store a client_code field for this query to work.
 * Future: if collision risk grows, migrate to a counter document with FieldValue.increment().
 */
export async function generateServiceCode(clientCode, year = null) {
    try {
        const currentYear = year || new Date().getFullYear();
        const rangeMin = `CLMC-${clientCode}-${currentYear}000`;
        const rangeMax = `CLMC-${clientCode}-${currentYear}999`;

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

        const codeRegex = /^CLMC-.+-\d{4}(\d{3})$/;
        let maxNum = 0;

        projectsSnap.forEach(d => {
            const match = d.data().project_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        servicesSnap.forEach(d => {
            const match = d.data().service_code?.match(codeRegex);
            if (match && parseInt(match[1]) > maxNum) maxNum = parseInt(match[1]);
        });

        return `CLMC-${clientCode}-${currentYear}${String(maxNum + 1).padStart(3, '0')}`;
    } catch (error) {
        console.error('[Services] Error generating service code:', error);
        throw error;
    }
}

/**
 * Get the set of service codes the current user is allowed to see.
 * Quick 260627-kg0: ASSIGNMENT-DRIVEN — scoped for BOTH services_user AND operations_user (an
 * operations_user assigned to a service is scoped-IN to it).
 * Quick 260706-mco: returns null ("no filter") only for SERVICE_SEE_ALL_ROLES (super_admin / finance /
 * procurement / services_admin — its HOME department) or when the all_services escape-hatch flag is
 * set. operations_admin is intentionally NOT in SERVICE_SEE_ALL_ROLES, so it falls through to the
 * all_services check and the fail-closed default like any cross-dept *_user.
 * Phase 113 D-08: the returned codes are DERIVED from live `personnel_user_ids` membership on the
 * `services` documents themselves (see initAssignedCodesListeners()), not from the frozen
 * `user.assigned_service_codes` array on the user document — that legacy field is deliberately no
 * longer read here. Returns an empty array (deliberate FAIL-CLOSED posture) if a scoped user has
 * zero service assignments, or if the personnel cache hasn't populated yet.
 *
 * @returns {string[]|null} Array of allowed service_codes, or null for "no filter"
 */
export function getAssignedServiceCodes() {
    const user = window.getCurrentUser?.();
    if (!user) return null;                              // Not logged in -- no filter
    if (SERVICE_SEE_ALL_ROLES.includes(user.role)) return null; // Home-dept admins/finance/procurement: no filter

    if (user.all_services === true) return null;         // "All services" escape hatch (no-op for an operations_user)

    // Any non-exempt role is scoped to the personnel-derived cache (FAIL-CLOSED: missing/malformed
    // cache => [] = sees nothing).
    return Array.isArray(window._personnelAssignedCodes?.services) ? window._personnelAssignedCodes.services : [];
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
    escapeHTML,
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

window.escapeHTML = escapeHTML;
window.getAssignedProjectCodes = getAssignedProjectCodes;
window.generateServiceCode = generateServiceCode;
window.getAssignedServiceCodes = getAssignedServiceCodes;
window.initAssignedCodesListeners = initAssignedCodesListeners;
window.destroyAssignedCodesListeners = destroyAssignedCodesListeners;

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

// Phase 87: re-export proposal ID generator for convenience (defined in app/proposal-id.js)
export { generateProposalId } from './proposal-id.js';

/* ========================================
   UUID / RANDOM ID UTILITIES
   ======================================== */

/**
 * Generate a UUID suitable for audit_log entry_id and similar in-document keys.
 * Prefers crypto.randomUUID() (modern browsers); falls back to a simple pseudo-UUID
 * for older runtimes (sufficient uniqueness for audit entry IDs).
 *
 * Phase 87.1: extracted to utils.js (was previously private in app/views/proposals.js)
 * so proposals.js, app/proposal-modal.js, and other modules can share one implementation
 * without circular imports.
 *
 * @returns {string} A UUID string
 */
export function cryptoRandomUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for older runtimes — sufficient uniqueness for audit entry IDs
    return 'p87-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
