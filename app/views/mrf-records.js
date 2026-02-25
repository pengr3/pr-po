/* ========================================
   MRF RECORDS SHARED MODULE
   Shared MRF table rendering used by:
   - mrf-form.js (My Requests sub-tab)
   Future: could be used by procurement.js as well

   Design decision (Phase 40-04):
   The full Procurement MRF Records rendering (renderPRPORecords in procurement.js)
   is ~300 lines with async per-row PR/PO sub-queries and complex status logic.
   Extracting it verbatim carries regression risk. Instead, this module provides
   a simpler MRF-level table (no PR/PO sub-rows) that meets the core requestor
   need: "let me see my submitted MRFs and their current status". Procurement.js
   keeps its own full rendering unchanged (zero regressions).
   ======================================== */

import { db, collection, getDocs, query, where } from '../firebase.js';
import { formatDate, getStatusClass, getUrgencyClass } from '../utils.js';
import { getMRFLabel, getDeptBadgeHTML } from '../components.js';

/**
 * Create an MRF Records controller instance.
 * Each call returns an independent controller with its own pagination state,
 * preventing state leakage between Procurement and My Requests instances.
 *
 * @param {Object} options
 * @param {string} options.containerId - DOM ID of the table container
 * @param {string} [options.paginationId] - DOM ID of the pagination container (optional)
 * @param {string[]|null} [options.statusFilter] - MRF statuses to query (null = all statuses)
 * @param {Function} [options.filterFn] - Optional additional filter (e.g. requestor filter)
 * @param {number} [options.itemsPerPage=10] - Items per page
 * @returns {{ load: Function, filter: Function, destroy: Function }}
 */
export function createMRFRecordsController(options) {
    const {
        containerId,
        paginationId = containerId + 'Pagination',
        statusFilter = null,
        filterFn = null,
        itemsPerPage = 10
    } = options;

    // Instance-scoped state (not module-level — prevents cross-instance leakage)
    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;

    // ------------------------------------------------
    // LOAD
    // ------------------------------------------------

    /**
     * Fetch MRFs from Firestore and render.
     * Uses getDocs (one-time fetch) not onSnapshot — simpler, no listener cleanup risk.
     */
    async function load() {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">Loading your requests...</div>';

        try {
            const mrfsRef = collection(db, 'mrfs');

            let q;
            if (statusFilter && statusFilter.length > 0) {
                q = query(mrfsRef, where('status', 'in', statusFilter));
            } else {
                q = mrfsRef; // All statuses
            }

            const snapshot = await getDocs(q);
            allRecords = [];
            snapshot.forEach(doc => {
                allRecords.push({ id: doc.id, ...doc.data() });
            });

            // Sort by created_at / date_submitted (newest first)
            allRecords.sort((a, b) => {
                const dateA = new Date(a.created_at || a.date_submitted || 0);
                const dateB = new Date(b.created_at || b.date_submitted || 0);
                return dateB - dateA;
            });

            filteredRecords = applyFilters('', '', '');
            currentPage = 1;
            render();
        } catch (error) {
            console.error('[MRFRecords] Error loading MRFs:', error);
            if (container) {
                container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ef4444;">Error loading requests. Please try again.</div>';
            }
        }
    }

    // ------------------------------------------------
    // FILTER
    // ------------------------------------------------

    /**
     * Apply search text, MRF status, and urgency filters.
     * Also applies the instance-scoped filterFn if provided.
     *
     * @param {string} searchText
     * @param {string} mrfStatus
     * @param {string} urgency
     * @returns {Array} filtered records
     */
    function applyFilters(searchText, mrfStatus, urgency) {
        const search = (searchText || '').toLowerCase().trim();

        return allRecords.filter(mrf => {
            // Custom instance filter (e.g. requestor_name === currentUser)
            if (filterFn && !filterFn(mrf)) return false;

            // Search filter
            const matchesSearch = !search ||
                (mrf.mrf_id && mrf.mrf_id.toLowerCase().includes(search)) ||
                (mrf.project_name && mrf.project_name.toLowerCase().includes(search)) ||
                (mrf.requestor_name && mrf.requestor_name.toLowerCase().includes(search)) ||
                (mrf.service_name && mrf.service_name && mrf.service_name.toLowerCase().includes(search));

            // MRF status filter
            const matchesMRFStatus = !mrfStatus || mrf.status === mrfStatus;

            // Urgency filter
            const matchesUrgency = !urgency || mrf.urgency_level === urgency;

            return matchesSearch && matchesMRFStatus && matchesUrgency;
        });
    }

    /**
     * Re-filter from current DOM inputs and re-render.
     * Called by search/filter input oninput/onchange handlers.
     *
     * @param {string} [searchId] - ID of search input element
     * @param {string} [statusId] - ID of status filter select
     * @param {string} [urgencyId] - ID of urgency filter select
     */
    function filter(searchId, statusId, urgencyId) {
        const searchText = searchId ? (document.getElementById(searchId)?.value || '') : '';
        const mrfStatus = statusId ? (document.getElementById(statusId)?.value || '') : '';
        const urgency = urgencyId ? (document.getElementById(urgencyId)?.value || '') : '';

        filteredRecords = applyFilters(searchText, mrfStatus, urgency);
        currentPage = 1;
        render();
    }

    // ------------------------------------------------
    // RENDER
    // ------------------------------------------------

    /**
     * Render the MRF records table and pagination into the container.
     */
    function render() {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (filteredRecords.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #999;">
                    <div style="font-size: 1.125rem; margin-bottom: 0.5rem;">No requests found</div>
                    <div style="font-size: 0.875rem;">Your submitted requests will appear here.</div>
                </div>
            `;
            renderPagination(0);
            return;
        }

        const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredRecords.length);
        const pageItems = filteredRecords.slice(startIndex, endIndex);

        const rows = pageItems.map(mrf => {
            const statusClass = getStatusClass(mrf.status);
            const urgencyClass = getUrgencyClass(mrf.urgency_level);
            const label = getMRFLabel(mrf);
            const deptBadge = getDeptBadgeHTML(mrf);
            const dateNeeded = mrf.date_needed ? formatDate(mrf.date_needed) : (mrf.date_submitted || 'N/A');
            const dateSubmitted = mrf.date_submitted
                ? formatDate(mrf.date_submitted)
                : (mrf.created_at ? formatDate(mrf.created_at.split('T')[0]) : 'N/A');

            return `
                <tr>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; font-weight: 600; white-space: nowrap;">${mrf.mrf_id || '-'}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem;">${label}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center;">${deptBadge}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; white-space: nowrap;">${dateSubmitted}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; white-space: nowrap;">${dateNeeded}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center;">
                        <span class="status-badge ${urgencyClass}">${mrf.urgency_level || 'N/A'}</span>
                    </td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center;">
                        <span class="status-badge ${statusClass}">${mrf.status || 'Unknown'}</span>
                    </td>
                </tr>
            `;
        });

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF ID</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Project / Service</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Dept</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Date Submitted</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Date Needed</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Urgency</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        `;

        renderPagination(totalPages);
    }

    // ------------------------------------------------
    // PAGINATION
    // ------------------------------------------------

    function renderPagination(totalPages) {
        const paginationDiv = document.getElementById(paginationId);
        if (!paginationDiv) return;

        if (totalPages <= 1) {
            paginationDiv.innerHTML = '';
            return;
        }

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredRecords.length);

        // Use a unique prefix to avoid collisions with other instances
        const instanceId = containerId;

        let html = `
            <div class="pagination-info">
                Showing <strong>${startIndex + 1}-${endIndex}</strong> of <strong>${filteredRecords.length}</strong> requests
            </div>
            <div class="pagination-controls">
                <button class="pagination-btn" onclick="window._mrfRecordsGoToPage_${instanceId}(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
                    &larr; Previous
                </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `
                    <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="window._mrfRecordsGoToPage_${instanceId}(${i})">
                        ${i}
                    </button>
                `;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += '<span class="pagination-ellipsis">...</span>';
            }
        }

        html += `
                <button class="pagination-btn" onclick="window._mrfRecordsGoToPage_${instanceId}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
                    Next &rarr;
                </button>
            </div>
        `;

        paginationDiv.className = 'pagination-container';
        paginationDiv.innerHTML = html;
    }

    // Register instance-specific pagination function on window
    window[`_mrfRecordsGoToPage_${containerId}`] = function(page) {
        currentPage = page;
        render();
    };

    // ------------------------------------------------
    // DESTROY
    // ------------------------------------------------

    /**
     * Clean up window functions registered by this controller instance.
     */
    function destroy() {
        delete window[`_mrfRecordsGoToPage_${containerId}`];
    }

    // ------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------

    return { load, filter, destroy };
}
