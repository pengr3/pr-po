/* ========================================
   MRF RECORDS SHARED MODULE
   Shared MRF table rendering used by:
   - mrf-form.js (My Requests sub-tab)
   Future: could be used by procurement.js as well

   Design decision (Phase 40-05, gap closure):
   Rewritten to match the full Procurement MRF Records table layout:
   async per-row PR/PO sub-queries, calculateMRFStatus badges, and
   read-only procurement status badges. Requestors see the same columns
   as Procurement (minus Actions column and minus clickable links).
   ======================================== */

import { db, collection, getDocs, query, where } from '../firebase.js';
import { formatDate, formatTimestamp, getStatusClass } from '../utils.js';
import { getMRFLabel } from '../components.js';

/**
 * Calculate MRF status based on PR/PO state.
 * Copied from procurement.js calculateMRFStatus (lines 2360-2393).
 * Returns {status, badgeClass, description}.
 */
function calculateMRFStatus(prs, pos) {
    const prCount = prs.length;
    const poCount = pos.length;

    if (prCount === 0) {
        return {
            status: 'Awaiting PR',
            badgeClass: 'rejected',
            description: 'No PRs generated yet'
        };
    } else if (poCount === 0) {
        return {
            status: '0/' + prCount + ' PO Issued',
            badgeClass: 'pending',
            description: 'PRs approved, awaiting PO generation'
        };
    } else if (poCount === prCount) {
        return {
            status: prCount + '/' + prCount + ' PO Issued',
            badgeClass: 'approved',
            description: 'All POs issued'
        };
    } else {
        return {
            status: poCount + '/' + prCount + ' PO Issued',
            badgeClass: 'procuring',
            description: 'Partial PO issuance'
        };
    }
}

/**
 * Render MRF status badge with color coding.
 * Copied from procurement.js renderMRFStatusBadge (lines 2398-2400).
 */
function renderMRFStatusBadge(statusObj) {
    return `<span class="status-badge ${statusObj.badgeClass}">${statusObj.status}</span>`;
}

/**
 * Status colors for read-only PO procurement status badges.
 * Matches the statusColors map in procurement.js renderPRPORecords.
 */
const statusColors = {
    'Pending Procurement': { bg: '#fef3c7', color: '#f59e0b' },
    'Pending':             { bg: '#fef3c7', color: '#f59e0b' },
    'Procuring':           { bg: '#dbeafe', color: '#3b82f6' },
    'Processing':          { bg: '#dbeafe', color: '#3b82f6' },
    'Procured':            { bg: '#d1fae5', color: '#22c55e' },
    'Processed':           { bg: '#d1fae5', color: '#22c55e' },
    'Delivered':           { bg: '#eff6ff', color: '#2563eb' }
};

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
            await render();
        } catch (error) {
            console.error('[MRFRecords] Error loading MRFs:', error);
            const container = document.getElementById(containerId);
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
                (mrf.service_name && mrf.service_name.toLowerCase().includes(search));

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
    async function filter(searchId, statusId, urgencyId) {
        const searchText = searchId ? (document.getElementById(searchId)?.value || '') : '';
        const mrfStatus = statusId ? (document.getElementById(statusId)?.value || '') : '';
        const urgency = urgencyId ? (document.getElementById(urgencyId)?.value || '') : '';

        filteredRecords = applyFilters(searchText, mrfStatus, urgency);
        currentPage = 1;
        await render();
    }

    // ------------------------------------------------
    // RENDER (async — fetches PR/PO data per page)
    // ------------------------------------------------

    /**
     * Render the MRF records table (matching Procurement MRF Records layout)
     * and pagination into the container. Async because it fetches PR/PO data
     * per-row for the current page only.
     */
    async function render() {
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

        // Show loading state while fetching PR/PO sub-data
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">Loading document references...</div>';

        // Fetch PR and PO data for current page items only (parallel per row)
        const rows = await Promise.all(pageItems.map(async (mrf) => {
            const type = mrf.request_type === 'service' ? 'Transport' : 'Material';

            // PRs column
            let prHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let prDataArray = [];

            if (type === 'Material') {
                try {
                    const prsRef = collection(db, 'prs');
                    const prQuery = query(prsRef, where('mrf_id', '==', mrf.mrf_id));
                    const prSnapshot = await getDocs(prQuery);

                    if (!prSnapshot.empty) {
                        prSnapshot.forEach((doc) => {
                            const prData = doc.data();
                            prDataArray.push({
                                docId: doc.id,
                                pr_id: prData.pr_id,
                                total_amount: parseFloat(prData.total_amount || 0),
                                finance_status: prData.finance_status,
                                supplier_name: prData.supplier_name
                            });
                        });

                        // Sort PR IDs by number
                        prDataArray.sort((a, b) => {
                            const numA = parseInt((a.pr_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            const numB = parseInt((b.pr_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            return numA - numB;
                        });

                        // Render as non-clickable status-badge spans (no onclick — window.viewPRDetails
                        // is a procurement.js function not available in mrf-form context)
                        const prSpans = prDataArray.map(pr => {
                            const statusClass = getStatusClass(pr.finance_status || 'Pending');
                            return `<span class="status-badge ${statusClass}"
                                style="font-size: 0.75rem; display: inline-block; margin-bottom: 0.25rem;">
                                ${pr.pr_id}
                            </span>`;
                        });
                        prHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + prSpans.join('') + '</div>';
                    }
                } catch (error) {
                    console.error('[MRFRecords] Error fetching PRs for', mrf.mrf_id, error);
                }
            }

            // POs column + Procurement Status column
            let poHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let poStatusHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let poDataArray = [];

            if (type === 'Material') {
                try {
                    const posRef = collection(db, 'pos');
                    const poQuery = query(posRef, where('mrf_id', '==', mrf.mrf_id));
                    const poSnapshot = await getDocs(poQuery);

                    if (!poSnapshot.empty) {
                        poSnapshot.forEach((doc) => {
                            const poData = doc.data();
                            poDataArray.push({
                                docId: doc.id,
                                po_id: poData.po_id,
                                procurement_status: poData.procurement_status,
                                is_subcon: poData.is_subcon || false,
                                supplier_name: poData.supplier_name
                            });
                        });

                        // Sort PO IDs by number
                        poDataArray.sort((a, b) => {
                            const numA = parseInt((a.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            const numB = parseInt((b.po_id.match(/-(\d+)-/) || ['', '0'])[1]);
                            return numA - numB;
                        });

                        const poItems = poDataArray.map(po => {
                            const isSubcon = po.is_subcon;
                            const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
                            const currentStatus = po.procurement_status || defaultStatus;

                            // Read-only procurement status badge (no <select> — requestors cannot edit)
                            const statusColor = statusColors[currentStatus] || { bg: '#f3f4f6', color: '#6b7280' };
                            const statusBadge = `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${currentStatus}</span>`;

                            const subconBadge = isSubcon
                                ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">SUBCON</span>'
                                : '';

                            return {
                                // PO ID as green-styled text (not clickable — window.viewPODetails unavailable here)
                                linkHtml: `<div style="min-height: 52px; display: flex; flex-direction: column; gap: 2px; justify-content: center;">
                                    <span style="color: #34a853; font-weight: 600; font-size: 0.8rem; word-break: break-word;">${po.po_id}</span>${subconBadge}
                                </div>`,
                                statusHtml: `<div style="min-height: 52px; display: flex; align-items: center;">
                                    ${statusBadge}
                                </div>`
                            };
                        });

                        poHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + poItems.map(p => p.linkHtml).join('') + '</div>';
                        poStatusHtml = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">' + poItems.map(p => p.statusHtml).join('') + '</div>';
                    }
                } catch (error) {
                    console.error('[MRFRecords] Error fetching POs for', mrf.mrf_id, error);
                }
            }

            // MRF Status column — computed badge (Material only, em dash for Transport)
            let mrfStatusHtml = '<span style="color: #64748b; font-size: 0.75rem;">\u2014</span>';
            if (type === 'Material') {
                const statusObj = calculateMRFStatus(prDataArray, poDataArray);
                mrfStatusHtml = renderMRFStatusBadge(statusObj);
            }

            // Display ID: use tr_id for Transport if available, else mrf_id
            const displayId = (type === 'Transport' && mrf.tr_id) ? mrf.tr_id : mrf.mrf_id;

            // Date Needed: prefer date_needed; fallback to formatted timestamp
            const dateNeeded = mrf.date_needed
                ? formatDate(mrf.date_needed)
                : (formatTimestamp(mrf.date_submitted || mrf.created_at) || 'N/A');

            return `
                <tr>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; vertical-align: middle;"><strong>${displayId}</strong></td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: left; vertical-align: middle;">${getMRFLabel(mrf)}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle; font-size: 0.85rem;">${dateNeeded}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${prHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle;">${mrfStatusHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poStatusHtml}</td>
                </tr>
            `;
        }));

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF ID</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Project</th>
                        <th style="padding: 0.75rem 1rem; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Date Needed</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">PRs</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">POs</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">MRF Status</th>
                        <th style="padding: 0.75rem 1rem; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 0.75rem; font-weight: 600;">Procurement Status</th>
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
    window[`_mrfRecordsGoToPage_${containerId}`] = async function(page) {
        currentPage = page;
        await render();
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
