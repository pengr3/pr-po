/* ========================================
   SHARED UI COMPONENTS
   Reusable component generators
   ======================================== */

import { formatCurrency, getStatusClass, getUrgencyClass } from './utils.js';

/* ========================================
   STATUS BADGE
   ======================================== */

/**
 * Create status badge HTML
 * @param {string} status - Status value
 * @returns {string} HTML string for status badge
 */
export function createStatusBadge(status) {
    const statusClass = getStatusClass(status);
    return `<span class="status-badge ${statusClass}">${status}</span>`;
}

/**
 * Create urgency badge HTML
 * @param {string} urgency - Urgency level
 * @returns {string} HTML string for urgency badge
 */
export function createUrgencyBadge(urgency) {
    const urgencyClass = getUrgencyClass(urgency);
    return `<span class="urgency-badge ${urgencyClass}">${urgency}</span>`;
}

/* ========================================
   CARD COMPONENT
   ======================================== */

/**
 * Create card component
 * @param {object} options - Card options
 * @returns {string} HTML string for card
 */
export function createCard({ title, subtitle = '', content = '', actions = '', headerClass = '' }) {
    return `
        <div class="card">
            ${title ? `
                <div class="card-header ${headerClass}">
                    <div>
                        <h3 class="card-title">${title}</h3>
                        ${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ''}
                    </div>
                    ${actions}
                </div>
            ` : ''}
            <div class="card-body">
                ${content}
            </div>
        </div>
    `;
}

/* ========================================
   MODAL COMPONENT
   ======================================== */

/**
 * Create modal component
 * @param {object} options - Modal options
 * @returns {string} HTML string for modal
 */
export function createModal({ id, title, body, footer = '', size = 'normal' }) {
    return `
        <div id="${id}" class="modal">
            <div class="modal-content ${size === 'large' ? 'modal-lg' : ''}">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-btn" onclick="closeModal('${id}')">&times;</button>
                </div>
                <div class="modal-body">
                    ${body}
                </div>
                ${footer ? `
                    <div class="modal-footer">
                        ${footer}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Open modal
 * @param {string} modalId - ID of modal to open
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Close modal
 * @param {string} modalId - ID of modal to close
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Expose modal functions to window for onclick handlers
window.openModal = openModal;
window.closeModal = closeModal;

/* ========================================
   TABLE COMPONENT
   ======================================== */

/**
 * Create table with pagination
 * @param {object} options - Table options
 * @returns {string} HTML string for table
 */
export function createTable({ headers, rows, config = {} }) {
    const {
        tableClass = '',
        emptyMessage = 'No data available',
        pagination = null
    } = config;

    let html = `
        <div class="table-responsive">
            <table class="${tableClass}">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    if (rows.length === 0) {
        html += `
                    <tr>
                        <td colspan="${headers.length}" style="text-align: center; padding: 2rem;">
                            <div class="empty-state">
                                <div class="empty-state-icon">📄</div>
                                <p>${emptyMessage}</p>
                            </div>
                        </td>
                    </tr>
        `;
    } else {
        html += rows.map(row => `<tr>${row}</tr>`).join('');
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    if (pagination) {
        html += createPagination(pagination);
    }

    return html;
}

/**
 * Create pagination controls
 * @param {object} options - Pagination options
 * @returns {string} HTML string for pagination
 */
export function createPagination({ currentPage, totalPages, onPageChange }) {
    return `
        <div class="pagination">
            <button
                onclick="${onPageChange}(${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}>
                Previous
            </button>
            <span class="page-info">Page ${currentPage} of ${totalPages}</span>
            <button
                onclick="${onPageChange}(${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}>
                Next
            </button>
        </div>
    `;
}

/* ========================================
   STAT CARD COMPONENT
   ======================================== */

/**
 * Create stat card component
 * @param {object} options - Stat card options
 * @returns {string} HTML string for stat card
 */
export function createStatCard({ label, value, type = 'primary' }) {
    return `
        <div class="stat-card ${type}">
            <span class="stat-label">${label}</span>
            <span class="stat-value">${value}</span>
        </div>
    `;
}

/* ========================================
   INFO GRID (for displaying details)
   ======================================== */

/**
 * Create info grid for displaying details
 * @param {object} data - Object with label-value pairs
 * @returns {string} HTML string for info grid
 */
export function createInfoGrid(data) {
    return `
        <div class="info-grid">
            ${Object.entries(data).map(([label, value]) => `
                <div class="info-label">${label}:</div>
                <div class="info-value">${value || 'N/A'}</div>
            `).join('')}
        </div>
    `;
}

/* ========================================
   EMPTY STATE COMPONENT
   ======================================== */

/**
 * Create empty state component
 * @param {object} options - Empty state options
 * @returns {string} HTML string for empty state
 */
export function createEmptyState({ icon = '📄', title = 'No Data', message = '', action = null }) {
    return `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <h3>${title}</h3>
            ${message ? `<p>${message}</p>` : ''}
            ${action ? action : ''}
        </div>
    `;
}

/* ========================================
   FORM GROUP COMPONENT
   ======================================== */

/**
 * Create form group (label + input)
 * @param {object} options - Form group options
 * @returns {string} HTML string for form group
 */
export function createFormGroup({
    label,
    type = 'text',
    id,
    name,
    value = '',
    placeholder = '',
    required = false,
    options = [] // for select inputs
}) {
    let inputHtml = '';

    if (type === 'textarea') {
        inputHtml = `<textarea id="${id}" name="${name}" class="form-control"
                        placeholder="${placeholder}" ${required ? 'required' : ''}>${value}</textarea>`;
    } else if (type === 'select') {
        inputHtml = `
            <select id="${id}" name="${name}" class="form-control" ${required ? 'required' : ''}>
                <option value="">-- Select ${label} --</option>
                ${options.map(opt => `
                    <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
                        ${opt.label}
                    </option>
                `).join('')}
            </select>
        `;
    } else {
        inputHtml = `<input type="${type}" id="${id}" name="${name}" class="form-control"
                        value="${value}" placeholder="${placeholder}" ${required ? 'required' : ''}>`;
    }

    return `
        <div class="form-group">
            <label for="${id}">${label}${required ? ' <span style="color: var(--danger);">*</span>' : ''}</label>
            ${inputHtml}
        </div>
    `;
}

/* ========================================
   BUTTON COMPONENT
   ======================================== */

/**
 * Create button component
 * @param {object} options - Button options
 * @returns {string} HTML string for button
 */
export function createButton({
    text,
    type = 'primary',
    size = 'normal',
    onClick = '',
    icon = '',
    disabled = false
}) {
    return `
        <button
            class="btn btn-${type} ${size !== 'normal' ? `btn-${size}` : ''}"
            ${onClick ? `onclick="${onClick}"` : ''}
            ${disabled ? 'disabled' : ''}>
            ${icon ? `<span>${icon}</span>` : ''}
            ${text}
        </button>
    `;
}

/* ========================================
   LOADING SPINNER
   ======================================== */

/**
 * Create loading spinner
 * @param {string} message - Loading message
 * @returns {string} HTML string for loading spinner
 */
export function createLoadingSpinner(message = 'Loading...') {
    return `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

/* ========================================
   TIMELINE COMPONENT
   ======================================== */

/**
 * Create timeline component
 * @param {Array} items - Timeline items
 * @returns {string} HTML string for timeline
 */
export function createTimeline(items) {
    return `
        <div class="timeline">
            ${items.map(item => `
                <div class="timeline-item ${item.status || ''}">
                    <div class="timeline-item-title">${item.title}</div>
                    ${item.date ? `<div class="timeline-item-date">${item.date}</div>` : ''}
                    ${item.description ? `<div class="timeline-item-description">${item.description}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

/* ========================================
   ITEMS TABLE (for MRF/PR/PO line items)
   ======================================== */

/**
 * Create items table for line items
 * @param {Array} items - Array of items
 * @param {object} options - Table options
 * @returns {string} HTML string for items table
 */
export function createItemsTable(items, options = {}) {
    const {
        editable = false,
        showSupplier = false,
        showCategory = false,
        allowDelete = false
    } = options;

    const total = items.reduce((sum, item) => {
        return sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0));
    }, 0);

    return `
        <div class="items-table-container">
            <div class="items-table-header">
                <h4>Line Items</h4>
                <span class="item-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="items-table-wrapper">
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item Description</th>
                            ${showCategory ? '<th>Category</th>' : ''}
                            <th>Quantity</th>
                            <th>Unit</th>
                            <th>Unit Cost</th>
                            ${showSupplier ? '<th>Supplier</th>' : ''}
                            <th>Subtotal</th>
                            ${allowDelete ? '<th></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => `
                            <tr>
                                <td>${item.item_name || item.item_description || 'N/A'}</td>
                                ${showCategory ? `<td>${item.category || 'N/A'}</td>` : ''}
                                <td>${item.quantity || 0}</td>
                                <td>${item.unit || 'N/A'}</td>
                                <td>₱ ${formatCurrency(item.unit_cost || 0)}</td>
                                ${showSupplier ? `<td>${item.supplier_name || 'N/A'}</td>` : ''}
                                <td class="subtotal-cell">₱ ${formatCurrency((item.quantity || 0) * (item.unit_cost || 0))}</td>
                                ${allowDelete ? `<td><button class="btn-delete" onclick="deleteItem(${index})">×</button></td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="${3 + (showCategory ? 1 : 0) + (showSupplier ? 1 : 0)}" class="total-label">Grand Total</td>
                            <td class="total-value">₱ ${formatCurrency(total)}</td>
                            ${allowDelete ? '<td></td>' : ''}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

/* ========================================
   EXPORT TO WINDOW (for onclick handlers)
   ======================================== */

window.components = {
    createStatusBadge,
    createUrgencyBadge,
    createCard,
    createModal,
    createTable,
    createPagination,
    createStatCard,
    createInfoGrid,
    createEmptyState,
    createFormGroup,
    createButton,
    createLoadingSpinner,
    createTimeline,
    createItemsTable
};

console.log('Components module loaded successfully');
