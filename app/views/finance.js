/* ========================================
   FINANCE VIEW - Complete Implementation
   PR/TR Approval, PO Generation, Project Expenses
   ======================================== */

import { db, collection, query, where, onSnapshot, getDocs, getDoc, doc, updateDoc, addDoc, getAggregateFromServer, sum, count, serverTimestamp } from '../firebase.js';
import { showToast, showLoading, formatCurrency, formatDate, formatTimestamp } from '../utils.js';

// View state
let listeners = [];
let materialPRs = [];
let transportRequests = [];
let poData = [];
let currentPRForApproval = null;
let currentPRForRejection = null;
let projectExpenses = [];
let approvalSignaturePad = null;
let currentApprovalTarget = null;

// Sort state for Project List
let projectExpenseSortColumn = 'projectName';
let projectExpenseSortDirection = 'asc';

// Sort state for Purchase Orders
let poSortColumn = 'date_issued';
let poSortDirection = 'desc';

/**
 * Attach all window functions for use in onclick handlers
 * This needs to be called every time init() runs to ensure
 * functions are available after tab navigation
 */
function attachWindowFunctions() {
    console.log('[Finance] Attaching window functions...');

    // PR/TR Review Functions
    window.refreshPRs = refreshPRs;
    window.viewPRDetails = viewPRDetails;
    window.viewTRDetails = viewTRDetails;
    window.approvePR = approvePR;
    window.approveTR = approveTR;
    window.rejectPR = rejectPR;

    // Signature Functions
    window.clearApprovalSignature = clearApprovalSignature;
    window.approvePRWithSignature = approvePRWithSignature;

    // Approval Modal Functions
    window.showApprovalModal = showApprovalModal;
    window.closeApprovalModal = closeApprovalModal;
    window.confirmApproval = confirmApproval;

    // Modal Management
    window.closePRModal = closePRModal;
    window.closeRejectionModal = closeRejectionModal;
    window.submitRejection = submitRejection;

    // PO Functions
    window.refreshPOs = refreshPOs;
    window.promptPODocument = promptPODocument;
    window.generatePODocument = generatePODocument;

    // Project Expense Functions
    window.refreshProjectExpenses = refreshProjectExpenses;
    window.showProjectExpenseModal = showProjectExpenseModal;
    window.closeProjectExpenseModal = closeProjectExpenseModal;
    window.sortProjectExpenses = sortProjectExpenses;
    window.sortPOs = sortPOs;

    console.log('[Finance] ✅ All window functions attached successfully');
}

/**
 * Setup modal keyboard event listeners
 * Uses AbortController for clean one-call cleanup
 */
let modalAbortController = null;

function setupModalListeners() {
    // Abort previous listeners if they exist (idempotent)
    if (modalAbortController) {
        modalAbortController.abort();
    }

    // Create new controller for this view lifecycle
    modalAbortController = new AbortController();
    const { signal } = modalAbortController;

    // ESC key closes active modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const prModal = document.getElementById('prModal');
            const rejectionModal = document.getElementById('rejectionModal');
            const projectExpenseModal = document.getElementById('projectExpenseModal');
            const approvalModal = document.getElementById('approvalModal');

            // Close whichever modal is currently active
            if (approvalModal?.classList.contains('active')) {
                closeApprovalModal();
            } else if (prModal?.classList.contains('active')) {
                closePRModal();
            } else if (rejectionModal?.classList.contains('active')) {
                closeRejectionModal();
            } else if (projectExpenseModal?.classList.contains('active')) {
                closeProjectExpenseModal();
            }
        }
    }, { signal }); // AbortController signal handles cleanup automatically
}

/**
 * Initialize signature pad with high-DPI support
 * Source: https://github.com/szimek/signature_pad README
 */
function initializeApprovalSignaturePad() {
    const canvas = document.getElementById('approvalSignatureCanvas');
    if (!canvas) return null;

    const signaturePad = new SignaturePad(canvas, {
        minWidth: 0.5,
        maxWidth: 2.5,
        penColor: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(255, 255, 255)',
        throttle: 16 // 60fps
    });

    // Handle high-DPI displays (retina scaling)
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const { width, height } = canvas.getBoundingClientRect();

        // Save signature data before resize to prevent clearing
        const data = signaturePad.toData();

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        // Restore signature after resize
        if (data && data.length > 0) {
            signaturePad.fromData(data);
        }
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return signaturePad;
}

/**
 * Clear signature canvas
 */
function clearApprovalSignature() {
    if (approvalSignaturePad) {
        approvalSignaturePad.clear();
    }
}

// ========================================
// PO DOCUMENT GENERATION (Finance View)
// Duplicated from procurement.js for
// independent finance access
// ========================================

const DOCUMENT_CONFIG = {
    defaultFinancePIC: 'Ma. Thea Angela R. Lacsamana',
    companyInfo: {
        name: 'C. Lacsamana Management and Construction Corporation',
        address: '133 Pinatubo St. City of Mandaluyong City',
        tel: '09178182993',
        email: 'cgl@consultclm.com',
        logo: '/CLMC Registered Logo Cropped (black fill).png'
    }
};

/**
 * Generate HTML table for items
 * @param {Array} items - Array of item objects
 * @param {string} type - 'PR' or 'PO'
 * @returns {string} - HTML table string
 */
function generateItemsTableHTML(items, type) {
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width: 5%;">No.</th>
                    <th style="width: 25%;">Description</th>
                    ${type === 'PR' ? '<th style="width: 15%;">Category</th>' : ''}
                    <th style="width: 10%;">Qty</th>
                    <th style="width: 10%;">Unit</th>
                    <th style="width: 15%;">Unit Cost</th>
                    <th style="width: 15%;">Total</th>
                </tr>
            </thead>
            <tbody>
    `;

    items.forEach((item, index) => {
        const qty = item.qty || item.quantity || 0;
        const unitCost = parseFloat(item.unit_cost || 0);
        const subtotal = qty * unitCost;

        tableHTML += `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${item.item || item.item_name}</td>
                ${type === 'PR' ? `<td>${item.category || 'N/A'}</td>` : ''}
                <td style="text-align: center;">${qty}</td>
                <td>${item.unit}</td>
                <td style="text-align: right;">₱${formatCurrency(unitCost)}</td>
                <td style="text-align: right;">₱${formatCurrency(subtotal)}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    return tableHTML;
}

/**
 * Generate PO HTML document
 * @param {Object} data - Document data with all placeholders
 * @returns {string} - Complete HTML document
 */
function generatePOHTML(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${data.PO_ID} - Purchase Order</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
                html, body {
                    margin: 0;
                    padding: 0;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: Arial, sans-serif;
                    font-size: 11pt;
                    line-height: 1.4;
                    color: #000;
                    max-width: 8.5in;
                    margin: 0 auto;
                }
                .header {
                    background-color: #000;
                    color: #fff;
                    padding: 15px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 22px;
                }
                .header-logo {
                    width: 70px;
                    height: 70px;
                    object-fit: contain;
                }
                .header-company {
                    font-size: 16pt;
                    font-weight: bold;
                    max-width: 320px;
                    line-height: 1.3;
                }
                .header-right {
                    text-align: right;
                    font-size: 8pt;
                    line-height: 1.6;
                }
                .content {
                    padding: 25px 30px;
                    margin: 0 0.5in 0.5in 0.5in;
                }
                .title {
                    text-align: center;
                    font-size: 16pt;
                    font-weight: bold;
                    margin: 20px 0;
                    text-decoration: underline;
                }
                .section {
                    margin: 15px 0;
                }
                .field {
                    margin: 8px 0;
                    page-break-inside: avoid;
                }
                .label {
                    font-weight: bold;
                    display: inline-block;
                    width: 150px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                    page-break-inside: avoid;
                }
                th, td {
                    border: 1px solid #000;
                    padding: 8px;
                    text-align: left;
                }
                th {
                    background-color: #f0f0f0;
                    font-weight: bold;
                    font-size: 10pt;
                }
                td {
                    font-size: 10pt;
                }
                .signature-section {
                    margin-top: 2rem;
                    page-break-inside: avoid;
                }
                .signature-box {
                    text-align: left;
                }
                .signature-box p {
                    margin: 0.25rem 0;
                    font-size: 0.875rem;
                }
                .signature-box .sig-label {
                    font-weight: bold;
                    font-size: 10pt;
                    margin-bottom: 0.5rem;
                }
                .signature-box img {
                    max-width: 200px;
                    height: auto;
                    max-height: 60px;
                    margin-bottom: 0.5rem;
                    display: block;
                }
                .sig-line {
                    border-top: 1px solid #000;
                    width: 200px;
                    margin: 0.5rem 0 0.25rem 0;
                }
                .sig-placeholder {
                    height: 60px;
                    width: 200px;
                    margin: 0 0 0.5rem 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-left">
                    <img src="${data.company_info.logo}" class="header-logo" alt="Logo">
                    <div class="header-company">${data.company_info.name}</div>
                </div>
                <div class="header-right">
                    <div>${data.company_info.address}</div>
                    <div>Tel: ${data.company_info.tel}</div>
                    <div>Email: ${data.company_info.email}</div>
                </div>
            </div>

            <div class="content">
                <div class="title">PURCHASE ORDER</div>

                <div class="section">
                    <div class="field"><span class="label">P.O. No.:</span> ${data.PO_ID}</div>
                    <div class="field"><span class="label">Project:</span> ${data.PROJECT}</div>
                    <div class="field"><span class="label">Date:</span> ${data.DATE}</div>
                    <div class="field"><span class="label">Supplier:</span> ${data.SUPPLIER}</div>
                    <div class="field"><span class="label">Quote Ref:</span> ${data.QUOTE_REF}</div>
                </div>

                <div class="section">
                    <h3 style="margin: 10px 0;">Order Details:</h3>
                    ${data.ITEMS_TABLE}
                </div>

                <div class="section">
                    <div class="field"><span class="label">Delivery Address:</span> ${data.DELIVERY_ADDRESS}</div>
                    <div class="field"><span class="label">Payment Terms:</span> ${data.PAYMENT_TERMS}</div>
                    <div class="field"><span class="label">Condition:</span> ${data.CONDITION}</div>
                    <div class="field"><span class="label">Delivery Date:</span> ${data.DELIVERY_DATE}</div>
                </div>

                <div class="signature-section">
                    <div class="signature-box">
                        <p class="sig-label">Approved by:</p>
                        ${data.FINANCE_SIGNATURE_URL ? `
                            <img src="${data.FINANCE_SIGNATURE_URL}" alt="Finance Signature">
                        ` : `
                            <div class="sig-placeholder"></div>
                        `}
                        <div class="sig-line"></div>
                        <p>${data.FINANCE_APPROVER}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Open print window with generated HTML
 * @param {string} html - Complete HTML document
 * @param {string} filename - Suggested filename
 */
function openPrintWindow(html, filename) {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
        alert('Please allow pop-ups to generate PDF documents');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for content to load, then trigger print
    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

/**
 * Format date for documents
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDocumentDate(dateString) {
    if (!dateString || dateString === 'TBD' || dateString === 'Pending') {
        return dateString;
    }
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

/**
 * Generate PO Document
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function generatePODocument(poDocId) {
    console.log('[Finance] Generating PO document for:', poDocId);
    showLoading(true);

    try {
        // Fetch PO data from Firestore
        const poRef = doc(db, 'pos', poDocId);
        const poDoc = await getDoc(poRef);

        if (!poDoc.exists()) {
            throw new Error('PO not found');
        }

        const po = poDoc.data();
        const items = JSON.parse(po.items_json || '[]');

        // Prepare document data
        const documentData = {
            PO_ID: po.po_id,
            PROJECT: po.project_code ? `${po.project_code} - ${po.project_name}` : po.project_name,
            DATE: formatTimestamp(po.date_issued) || formatDocumentDate(po.date_issued_legacy) || 'N/A',
            SUPPLIER: po.supplier_name,
            QUOTE_REF: po.quote_ref || 'N/A',
            ITEMS_TABLE: generateItemsTableHTML(items, 'PO'),
            DELIVERY_ADDRESS: po.delivery_address,
            PAYMENT_TERMS: po.payment_terms || '',
            CONDITION: po.condition || '',
            DELIVERY_DATE: po.delivery_date ? formatDocumentDate(po.delivery_date) : '',
            FINANCE_APPROVER: po.finance_approver_name || po.finance_approver || DOCUMENT_CONFIG.defaultFinancePIC,
            FINANCE_SIGNATURE_URL: po.finance_signature_url || '',
            company_info: DOCUMENT_CONFIG.companyInfo
        };

        // Generate HTML and open in print window
        const html = generatePOHTML(documentData);
        openPrintWindow(html, documentData.PO_ID);

        showToast('PO document opened. Use browser Print -> Save as PDF', 'success');

    } catch (error) {
        console.error('[Finance] Error generating PO document:', error);
        showToast('Failed to generate PO document', 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

/**
 * View PO document from Finance view
 * Generates document directly - Finance users view only, Procurement manages document details
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function promptPODocument(poDocId) {
    await generatePODocument(poDocId);
}

/**
 * Render the finance view
 * @param {string} activeTab - Active tab (approvals, pos, projects)
 * @returns {string} HTML string for finance view
 */
export function render(activeTab = 'approvals') {
    // Get edit permission
    const canEdit = window.canEditTab?.('finance');
    const showEditControls = canEdit !== false;

    return `
        <!-- Tab Navigation -->
        <div style="background: white; border-bottom: 2px solid var(--gray-200);">
            <div style="max-width: 1600px; margin: 0 auto; padding: 0 2rem;">
                <div class="tabs-nav">
                    <a href="#/finance/approvals" class="tab-btn ${activeTab === 'approvals' ? 'active' : ''}">
                        📋 Pending Approvals
                    </a>
                    <a href="#/finance/pos" class="tab-btn ${activeTab === 'pos' ? 'active' : ''}">
                        📄 Purchase Orders
                    </a>
                    <a href="#/finance/projects" class="tab-btn ${activeTab === 'projects' ? 'active' : ''}">
                        💰 Project List
                    </a>
                </div>
            </div>
        </div>

        <div class="container" style="max-width: 1600px; margin: 0 auto; padding: 1.5rem;">
            <!-- Tab 1: Pending Approvals -->
            <section id="approvals-section" class="section ${activeTab === 'approvals' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view pending approvals but cannot approve or reject requests.</span></div>' : ''}
                <!-- Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #fde047);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #854d0e;">Material PRs Pending</div>
                        <div id="materialPendingCount" style="font-size: 2rem; font-weight: 700; color: #a16207;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #fecaca, #f87171);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #7f1d1d;">Transport Requests Pending</div>
                        <div id="transportPendingCount" style="font-size: 2rem; font-weight: 700; color: #991b1b;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem; background: linear-gradient(135deg, #d1fae5, #86efac);">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #14532d;">Approved This Month</div>
                        <div id="approvedCount" style="font-size: 2rem; font-weight: 700; color: #15803d;">0</div>
                    </div>
                    <div class="card" style="padding: 1.5rem;">
                        <div style="font-size: 0.875rem; font-weight: 600; color: #5f6368;">Total Pending Amount</div>
                        <div id="pendingAmount" style="font-size: 2rem; font-weight: 700; color: #1f2937;">₱0</div>
                    </div>
                </div>

                <!-- Material PRs -->
                <div class="card">
                    <div class="card-header">
                        <h2>🛒 Material Purchase Requests</h2>
                        <button class="btn btn-secondary" onclick="window.refreshPRs()">🔄 Refresh</button>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>PR ID</th>
                                <th>MRF ID</th>
                                <th>Project</th>
                                <th>Date</th>
                                <th>Urgency</th>
                                <th>Total Cost</th>
                                <th>Supplier</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="materialPRsBody">
                            <tr>
                                <td colspan="9" style="text-align: center; padding: 2rem;">Loading material PRs...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div style="margin: 2rem 0;"></div>

                <!-- Transport Requests -->
                <div class="card">
                    <div class="card-header">
                        <h2>🚚 Transport Requests</h2>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>TR ID</th>
                                <th>MRF ID</th>
                                <th>Project</th>
                                <th>Date</th>
                                <th>Urgency</th>
                                <th>Total Cost</th>
                                <th>Service Type</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="transportRequestsBody">
                            <tr>
                                <td colspan="9" style="text-align: center; padding: 2rem;">Loading transport requests...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Tab 2: Purchase Orders -->
            <section id="pos-section" class="section ${activeTab === 'pos' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view purchase orders but cannot modify them.</span></div>' : ''}
                <div class="card">
                    <div class="card-header">
                        <h2>Recently Generated Purchase Orders</h2>
                        <button class="btn btn-secondary" onclick="window.refreshPOs()">🔄 Refresh</button>
                    </div>
                    <div id="poList">
                        <div style="text-align: center; padding: 2rem;">Loading purchase orders...</div>
                    </div>
                </div>
            </section>

            <!-- Tab 3: Project List -->
            <section id="projects-section" class="section ${activeTab === 'projects' ? 'active' : ''}">
                ${!showEditControls ? '<div class="view-only-notice"><span class="notice-icon">👁️</span> <span>View-only mode: You can view project expenses.</span></div>' : ''}
                <div class="card">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h2>Project List & Expenses</h2>
                        <button class="btn btn-secondary" onclick="window.refreshProjectExpenses()" style="font-size: 0.875rem;">
                            🔄 Refresh Totals
                        </button>
                    </div>
                    <div id="projectExpensesContainer">
                        <div style="text-align: center; padding: 2rem;">Loading project expenses...</div>
                    </div>
                </div>
            </section>
        </div>

        <!-- PR Details Modal -->
        <div id="prModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="prModalTitle">Purchase Request Details</h2>
                    <button class="modal-close" onclick="window.closePRModal()">&times;</button>
                </div>
                <div class="modal-body" id="prModalBody"></div>
                <div class="modal-footer" id="prModalFooter"></div>
            </div>
        </div>

        <!-- Rejection Modal -->
        <div id="rejectionModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Reject Request</h2>
                    <button class="modal-close" onclick="window.closeRejectionModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">Please provide a reason for rejection:</p>
                    <textarea id="rejectionReason" rows="4" style="width: 100%; padding: 0.75rem; border: 1.5px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 0.875rem; transition: all 0.2s;" onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 4px rgba(26, 115, 232, 0.1)'" onblur="this.style.borderColor='#e2e8f0'; this.style.boxShadow='none'"></textarea>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.closeRejectionModal()">Cancel</button>
                    <button class="btn btn-danger" onclick="window.submitRejection()">Submit Rejection</button>
                </div>
            </div>
        </div>

        <!-- Approval Modal (separate from PR review modal) -->
        <div id="approvalModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Approve & Sign</h2>
                    <button class="modal-close" onclick="window.closeApprovalModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem; color: #475569;">Please draw your signature below to confirm approval.</p>
                    <canvas id="approvalSignatureCanvas"
                            style="border: 1.5px solid #e2e8f0; border-radius: 8px; background: white;
                                   width: 100%; max-width: 400px; height: 150px; cursor: crosshair; display: block;">
                    </canvas>
                    <button class="btn btn-secondary"
                            onclick="window.clearApprovalSignature()"
                            style="margin-top: 0.5rem; font-size: 0.875rem; padding: 0.5rem 1rem;">
                        Clear Signature
                    </button>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="window.closeApprovalModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="window.confirmApproval()">Confirm Approval</button>
                </div>
            </div>
        </div>

        <!-- Project Expense Modal -->
        <div id="projectExpenseModal" class="modal">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 id="projectExpenseModalTitle">Project Expense Breakdown</h2>
                    <button class="modal-close" onclick="window.closeProjectExpenseModal()">&times;</button>
                </div>
                <div class="modal-body" id="projectExpenseModalBody">
                    <div style="text-align: center; padding: 2rem;">Loading expense details...</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Initialize the finance view
 * @param {string} activeTab - Active tab to display
 */
export async function init(activeTab = 'approvals') {
    console.log('[Finance] 🔵 Initializing finance view, tab:', activeTab);

    // CRITICAL: Re-attach window functions every init (router skips destroy on tab switch)
    attachWindowFunctions();

    // Setup ESC key modal listeners
    setupModalListeners();

    console.log('[Finance] Testing window.viewPRDetails availability:', typeof window.viewPRDetails);

    try {
        await loadPRs();
        await loadPOs();

        // Load project expenses if on projects tab
        if (activeTab === 'projects') {
            await refreshProjectExpenses();
        }

        console.log('Finance view initialized successfully');
    } catch (error) {
        console.error('Error initializing finance view:', error);
        showToast('Error loading finance data', 'error');
    }
}

// ========================================
// PROJECT EXPENSE TRACKING
// ========================================

/**
 * Calculate project expenses using server-side aggregation
 * Source: Phase 13 pattern (getAggregateFromServer)
 * Note: Uses existing projectExpenses array declared at line 16
 */
async function refreshProjectExpenses() {
    console.log('[Finance] Refreshing project expenses...');
    showLoading(true);

    try {
        // Get all projects
        const projectsSnapshot = await getDocs(collection(db, 'projects'));
        projectExpenses = []; // Reset existing array

        for (const projectDoc of projectsSnapshot.docs) {
            const project = projectDoc.data();

            // Aggregate PO totals for this project (all POs)
            const posQuery = query(
                collection(db, 'pos'),
                where('project_name', '==', project.project_name)
            );
            const posAgg = await getAggregateFromServer(posQuery, {
                totalExpense: sum('total_amount'),
                poCount: count()
            });

            // Aggregate Transport Request totals (approved only)
            const trQuery = query(
                collection(db, 'transport_requests'),
                where('project_name', '==', project.project_name),
                where('finance_status', '==', 'Approved')
            );
            const trAgg = await getAggregateFromServer(trQuery, {
                transportTotal: sum('total_amount'),
                trCount: count()
            });

            const totalExpense = (posAgg.data().totalExpense || 0) + (trAgg.data().transportTotal || 0);
            const budget = project.budget || 0;
            const remainingBudget = budget - totalExpense;

            projectExpenses.push({
                projectCode: project.project_code || 'N/A',
                projectName: project.project_name,
                clientCode: project.client_code || 'N/A',
                totalExpense: totalExpense,
                budget: budget,
                remainingBudget: remainingBudget,
                poCount: posAgg.data().poCount || 0,
                trCount: trAgg.data().trCount || 0,
                status: project.status || 'active'
            });
        }

        renderProjectExpensesTable();
        console.log(`[Finance] Loaded ${projectExpenses.length} project expense records`);

    } catch (error) {
        console.error('[Finance] Error calculating project expenses:', error);
        showToast('Failed to calculate project expenses: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Render project expenses table
 * Uses formatCurrency() imported from utils.js
 */
function renderProjectExpensesTable() {
    const container = document.getElementById('projectExpensesContainer');
    if (!container) return;

    if (projectExpenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                <p>No projects found</p>
            </div>
        `;
        return;
    }

    // Build table
    let tableHTML = `
        <div style="overflow-x: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th onclick="window.sortProjectExpenses('projectName')" style="cursor: pointer; user-select: none;">
                            Project Name <span class="sort-indicator" data-col="projectName"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('clientCode')" style="cursor: pointer; user-select: none;">
                            Client <span class="sort-indicator" data-col="clientCode"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('budget')" style="cursor: pointer; user-select: none; text-align: right;">
                            Budget <span class="sort-indicator" data-col="budget"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('totalExpense')" style="cursor: pointer; user-select: none; text-align: right;">
                            Total Expense <span class="sort-indicator" data-col="totalExpense"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('remainingBudget')" style="cursor: pointer; user-select: none; text-align: right;">
                            Remaining <span class="sort-indicator" data-col="remainingBudget"></span>
                        </th>
                        <th onclick="window.sortProjectExpenses('status')" style="cursor: pointer; user-select: none; text-align: center;">
                            Status <span class="sort-indicator" data-col="status"></span>
                        </th>
                    </tr>
                </thead>
                <tbody>
    `;

    projectExpenses.forEach(proj => {
        const isOverBudget = proj.remainingBudget < 0;
        const remainingStyle = isOverBudget ? 'color: #ef4444; font-weight: 600;' : '';

        tableHTML += `
            <tr onclick="window.showProjectExpenseModal('${proj.projectName.replace(/'/g, "\\'")}')" style="cursor: pointer;">
                <td>
                    <div style="font-weight: 600;">${proj.projectName}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${proj.projectCode}</div>
                </td>
                <td>${proj.clientCode}</td>
                <td style="text-align: right;">₱${formatCurrency(proj.budget)}</td>
                <td style="text-align: right;">₱${formatCurrency(proj.totalExpense)}</td>
                <td style="text-align: right; ${remainingStyle}">
                    ${isOverBudget ? '⚠️ ' : ''}₱${formatCurrency(Math.abs(proj.remainingBudget))}
                    ${isOverBudget ? ' over' : ''}
                </td>
                <td style="text-align: center;">
                    <span class="badge badge-${proj.status === 'active' ? 'success' : 'secondary'}">
                        ${proj.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                </td>
            </tr>
        `;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = tableHTML;

    // Update sort indicators for project expenses table
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === projectExpenseSortColumn) {
            indicator.textContent = projectExpenseSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Sort project expenses by column
 */
function sortProjectExpenses(column) {
    if (projectExpenseSortColumn === column) {
        projectExpenseSortDirection = projectExpenseSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        projectExpenseSortColumn = column;
        projectExpenseSortDirection = 'asc';
    }
    // Sort the data
    projectExpenses.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (aVal == null) return projectExpenseSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return projectExpenseSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return projectExpenseSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return projectExpenseSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderProjectExpensesTable();
}

/**
 * Show detailed expense breakdown modal with category scorecards
 * Uses formatCurrency() imported from utils.js
 */
async function showProjectExpenseModal(projectName) {
    console.log(`[Finance] Loading expense breakdown for: ${projectName}`);
    showLoading(true);

    try {
        // Get project details
        const projectQuery = query(
            collection(db, 'projects'),
            where('project_name', '==', projectName)
        );
        const projectSnapshot = await getDocs(projectQuery);
        if (projectSnapshot.empty) {
            throw new Error('Project not found');
        }
        const project = projectSnapshot.docs[0].data();

        // Material POs (non-subcon)
        const materialQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', projectName),
            where('is_subcon', '==', false)
        );
        const materialAgg = await getAggregateFromServer(materialQuery, {
            materialTotal: sum('total_amount'),
            materialCount: count()
        });

        // Subcon POs
        const subconQuery = query(
            collection(db, 'pos'),
            where('project_name', '==', projectName),
            where('is_subcon', '==', true)
        );
        const subconAgg = await getAggregateFromServer(subconQuery, {
            subconTotal: sum('total_amount'),
            subconCount: count()
        });

        // Transport Requests (approved only)
        const transportQuery = query(
            collection(db, 'transport_requests'),
            where('project_name', '==', projectName),
            where('finance_status', '==', 'Approved')
        );
        const transportAgg = await getAggregateFromServer(transportQuery, {
            transportTotal: sum('total_amount'),
            transportCount: count()
        });

        const expenses = {
            materials: materialAgg.data().materialTotal || 0,
            materialCount: materialAgg.data().materialCount || 0,
            transport: transportAgg.data().transportTotal || 0,
            transportCount: transportAgg.data().transportCount || 0,
            subcon: subconAgg.data().subconTotal || 0,
            subconCount: subconAgg.data().subconCount || 0,
            totalCost: (materialAgg.data().materialTotal || 0) +
                      (transportAgg.data().transportTotal || 0) +
                      (subconAgg.data().subconTotal || 0),
            budget: project.budget || 0,
            remainingBudget: (project.budget || 0) -
                           ((materialAgg.data().materialTotal || 0) +
                            (transportAgg.data().transportTotal || 0) +
                            (subconAgg.data().subconTotal || 0))
        };

        // Update modal title
        document.getElementById('projectExpenseModalTitle').textContent =
            `Expense Breakdown: ${projectName}`;

        // Render scorecards
        const modalBody = document.getElementById('projectExpenseModalBody');
        modalBody.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div class="scorecard" style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.875rem; color: #166534; font-weight: 600; margin-bottom: 0.5rem;">
                        Project Budget
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #166534;">
                        ₱${formatCurrency(expenses.budget)}
                    </div>
                </div>
                <div class="scorecard" style="background: ${expenses.remainingBudget >= 0 ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${expenses.remainingBudget >= 0 ? '#22c55e' : '#ef4444'}; padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.875rem; color: ${expenses.remainingBudget >= 0 ? '#166534' : '#991b1b'}; font-weight: 600; margin-bottom: 0.5rem;">
                        Remaining Budget
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: ${expenses.remainingBudget >= 0 ? '#166534' : '#991b1b'};">
                        ${expenses.remainingBudget >= 0 ? '' : '⚠️ '}₱${formatCurrency(Math.abs(expenses.remainingBudget))}
                        ${expenses.remainingBudget < 0 ? ' over' : ''}
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div class="scorecard" style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">
                        Material Purchases
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">
                        ₱${formatCurrency(expenses.materials)}
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                        ${expenses.materialCount} POs
                    </div>
                </div>
                <div class="scorecard" style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">
                        Transport Fees
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">
                        ₱${formatCurrency(expenses.transport)}
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                        ${expenses.transportCount} TRs
                    </div>
                </div>
                <div class="scorecard" style="padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-size: 0.875rem; color: #64748b; font-weight: 600; margin-bottom: 0.5rem;">
                        Subcon Cost
                    </div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b;">
                        ₱${formatCurrency(expenses.subcon)}
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;">
                        ${expenses.subconCount} POs
                    </div>
                </div>
            </div>

            <div class="scorecard" style="background: #eff6ff; border: 2px solid #3b82f6; padding: 1rem; border-radius: 8px;">
                <div style="font-size: 0.875rem; color: #1e40af; font-weight: 600; margin-bottom: 0.5rem;">
                    Total Project Cost
                </div>
                <div style="font-size: 2rem; font-weight: 700; color: #1e40af;">
                    ₱${formatCurrency(expenses.totalCost)}
                </div>
                <div style="font-size: 0.75rem; color: #1e40af; margin-top: 0.25rem;">
                    ${expenses.materialCount + expenses.transportCount + expenses.subconCount} documents
                </div>
            </div>

            <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid #e2e8f0; text-align: center;">
                <p style="color: #64748b; font-size: 0.875rem; margin: 0;">
                    Click "Refresh Totals" button to update expense calculations
                </p>
            </div>
        `;

        // Show modal
        document.getElementById('projectExpenseModal').classList.add('active');

    } catch (error) {
        console.error('[Finance] Error loading project expense breakdown:', error);
        showToast('Failed to load expense breakdown: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Close project expense modal
 */
function closeProjectExpenseModal() {
    document.getElementById('projectExpenseModal').classList.remove('active');
}

/**
 * Cleanup when leaving the view
 */
export async function destroy() {
    console.log('[Finance] 🔴 Destroying finance view...');

    // Cleanup modal event listeners
    if (modalAbortController) {
        modalAbortController.abort();
        modalAbortController = null;
    }

    // Unsubscribe from all listeners
    listeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    listeners = [];

    // Clean up signature pad
    if (approvalSignaturePad) {
        approvalSignaturePad.off();
        approvalSignaturePad = null;
    }

    // Clear state
    materialPRs = [];
    transportRequests = [];
    poData = [];
    currentPRForApproval = null;
    currentPRForRejection = null;
    currentApprovalTarget = null;
    projectExpenses = [];

    // Clean up window functions
    delete window.refreshPRs;
    delete window.viewPRDetails;
    delete window.viewTRDetails;
    delete window.approvePR;
    delete window.approveTR;
    delete window.rejectPR;
    delete window.closePRModal;
    delete window.closeRejectionModal;
    delete window.submitRejection;
    delete window.refreshPOs;
    delete window.promptPODocument;
    delete window.generatePODocument;
    delete window.refreshProjectExpenses;
    delete window.showProjectExpenseModal;
    delete window.closeProjectExpenseModal;
    delete window.clearApprovalSignature;
    delete window.approvePRWithSignature;
    delete window.showApprovalModal;
    delete window.closeApprovalModal;
    delete window.confirmApproval;
    delete window.sortProjectExpenses;
    delete window.sortPOs;

    // Reset sort state
    projectExpenseSortColumn = 'projectName';
    projectExpenseSortDirection = 'asc';
    poSortColumn = 'date_issued';
    poSortDirection = 'desc';

    console.log('[Finance] Finance view destroyed');
}

// ========================================
// PR/TR LOADING FUNCTIONS
// ========================================

/**
 * Load PRs and Transport Requests with real-time listeners
 */
async function loadPRs() {
    // Load Material PRs from prs collection
    const prsRef = collection(db, 'prs');
    const prQuery = query(prsRef, where('finance_status', '==', 'Pending'));

    const prListener = onSnapshot(prQuery, (snapshot) => {
        console.log('📊 Finance: Loaded Material PRs from Firebase:', snapshot.size);
        materialPRs = [];

        snapshot.forEach((docSnap) => {
            const pr = { id: docSnap.id, ...docSnap.data() };
            // Only include non-transport PRs
            if (!pr.pr_id?.startsWith('TR-') && pr.request_type !== 'service') {
                console.log('  Material PR:', pr.pr_id, 'Status:', pr.finance_status);
                materialPRs.push(pr);
            }
        });

        console.log('📦 Material PRs:', materialPRs.length);
        renderMaterialPRs();
        updateStats();
    });
    listeners.push(prListener);

    // Load Transport Requests from transport_requests collection
    const trsRef = collection(db, 'transport_requests');
    const trQuery = query(trsRef, where('finance_status', '==', 'Pending'));

    const trListener = onSnapshot(trQuery, (snapshot) => {
        console.log('📊 Finance: Loaded Transport Requests from Firebase:', snapshot.size);
        transportRequests = [];

        snapshot.forEach((docSnap) => {
            const tr = { id: docSnap.id, ...docSnap.data() };
            console.log('  Transport:', tr.tr_id, 'Status:', tr.finance_status, 'Cost:', tr.total_amount);
            transportRequests.push(tr);
        });

        console.log('🚚 Transport Requests:', transportRequests.length);
        renderTransportRequests();
        updateStats();
    });
    listeners.push(trListener);
}

/**
 * Render Material PRs table
 */
function renderMaterialPRs() {
    const tbody = document.getElementById('materialPRsBody');

    if (materialPRs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending material PRs</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = materialPRs.map(pr => {
        const items = JSON.parse(pr.items_json || '[]');
        const supplier = pr.supplier_name || (items[0] && items[0].supplier) || 'N/A';
        const urgencyLevel = pr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        return `
            <tr>
                <td><strong>${pr.pr_id}</strong></td>
                <td>${pr.mrf_id}</td>
                <td>${pr.project_code ? pr.project_code + ' - ' : ''}${pr.project_name || 'No project'}</td>
                <td>${formatDate(pr.date_generated)}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(pr.total_amount || 0)}</strong></td>
                <td>${supplier}</td>
                <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Pending</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewPRDetails('${pr.id}')">Review</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Render Transport Requests table
 */
function renderTransportRequests() {
    const tbody = document.getElementById('transportRequestsBody');

    if (transportRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 2rem; color: #666;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✓</div>
                    <div>No pending transport requests</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = transportRequests.map(tr => {
        const items = JSON.parse(tr.items_json || '[]');
        const serviceType = items[0]?.category || 'Transportation';
        const urgencyLevel = tr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        return `
            <tr>
                <td><strong>${tr.tr_id}</strong></td>
                <td>${tr.mrf_id}</td>
                <td>${tr.project_code ? tr.project_code + ' - ' : ''}${tr.project_name || 'No project'}</td>
                <td>${formatDate(tr.date_submitted)}</td>
                <td><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${urgencyLevel}</span></td>
                <td><strong>₱${formatCurrency(tr.total_amount || 0)}</strong></td>
                <td>${serviceType}</td>
                <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">Pending</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewTRDetails('${tr.id}')">Review</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Update statistics cards
 */
function updateStats() {
    document.getElementById('materialPendingCount').textContent = materialPRs.length;
    document.getElementById('transportPendingCount').textContent = transportRequests.length;

    const totalPending = materialPRs.reduce((sum, pr) => sum + parseFloat(pr.total_amount || 0), 0) +
                        transportRequests.reduce((sum, tr) => sum + parseFloat(tr.total_amount || 0), 0);

    document.getElementById('pendingAmount').textContent = '₱' + formatCurrency(totalPending);

    // Get approved count for this month (would need query for actual count)
    document.getElementById('approvedCount').textContent = '0';
}

/**
 * Refresh PRs manually
 */
async function refreshPRs() {
    await loadPRs();
    showToast('PR list refreshed', 'success');
}

// ========================================
// PR/TR DETAILS & APPROVAL
// ========================================

/**
 * View PR Details
 */
async function viewPRDetails(prId) {
    showLoading(true);

    try {
        const prDoc = await getDoc(doc(db, 'prs', prId));

        if (!prDoc.exists()) {
            showToast('PR not found', 'error');
            return;
        }

        const pr = { id: prDoc.id, ...prDoc.data() };
        currentPRForApproval = pr;
        currentPRForRejection = pr;

        const items = JSON.parse(pr.items_json || '[]');
        const urgencyLevel = pr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        const modalContent = `
            <div class="modal-details-grid">
                <div class="modal-detail-item">
                    <div class="modal-detail-label">PR ID:</div>
                    <div class="modal-detail-value"><strong>${pr.pr_id}</strong></div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">MRF Reference:</div>
                    <div class="modal-detail-value">${pr.mrf_id}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Project:</div>
                    <div class="modal-detail-value">${pr.project_code ? pr.project_code + ' - ' : ''}${pr.project_name || 'No project'}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Requestor:</div>
                    <div class="modal-detail-value">${pr.requestor_name}</div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Urgency Level:</div>
                    <div class="modal-detail-value">
                        <span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem;">${urgencyLevel}</span>
                    </div>
                </div>
                <div class="modal-detail-item">
                    <div class="modal-detail-label">Date Generated:</div>
                    <div class="modal-detail-value">${formatDate(pr.date_generated)}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Delivery Address:</div>
                    <div class="modal-detail-value">${pr.delivery_address || 'N/A'}</div>
                </div>
                <div class="modal-detail-item full-width">
                    <div class="modal-detail-label">Total Amount:</div>
                    <div class="modal-detail-value"><strong style="color: #059669; font-size: 1.5rem;">₱${formatCurrency(pr.total_amount || 0)}</strong></div>
                </div>
            </div>

            <h4 style="margin-bottom: 1rem; font-size: 1rem; font-weight: 600; color: #1e293b;">Items Breakdown</h4>
            <table class="modal-items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Supplier</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => `
                        <tr>
                            <td>${item.item || item.item_name}</td>
                            <td>${item.category || 'N/A'}</td>
                            <td>${item.qty || item.quantity} ${item.unit}</td>
                            <td>₱${formatCurrency(item.unit_cost || 0)}</td>
                            <td>${item.supplier || 'N/A'}</td>
                            <td><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="5" style="text-align: right; font-weight: 600;">TOTAL:</td>
                        <td>₱${formatCurrency(pr.total_amount || 0)}</td>
                    </tr>
                </tfoot>
            </table>
        `;

        document.getElementById('prModalTitle').textContent = `Purchase Request - ${pr.pr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        const canEdit = window.canEditTab?.('finance');
        const showEditControls = canEdit !== false;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                ${showEditControls ? `
                    <button class="btn btn-danger" onclick="window.rejectPR('${pr.id}')">
                        Reject
                    </button>
                    <button class="btn btn-primary" onclick="window.showApprovalModal('${pr.id}', 'pr')">
                        Approve & Generate PO
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            </div>
        `;

        document.getElementById('prModal').classList.add('active');

    } catch (error) {
        console.error('Error loading PR details:', error);
        showToast('Failed to load PR details', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * View TR Details
 */
async function viewTRDetails(trId) {
    showLoading(true);

    try {
        const trDoc = await getDoc(doc(db, 'transport_requests', trId));

        if (!trDoc.exists()) {
            showToast('Transport Request not found', 'error');
            return;
        }

        const tr = { id: trDoc.id, ...trDoc.data() };
        tr.isTransportRequest = true;
        tr.pr_id = tr.tr_id;
        currentPRForApproval = tr;
        currentPRForRejection = tr;

        const items = JSON.parse(tr.items_json || '[]');
        const urgencyLevel = tr.urgency_level || 'Low';

        const urgencyColors = {
            'Critical': { bg: '#fef2f2', color: '#dc2626' },
            'High': { bg: '#fef2f2', color: '#ef4444' },
            'Medium': { bg: '#fef3c7', color: '#f59e0b' },
            'Low': { bg: '#dcfce7', color: '#22c55e' }
        };
        const colors = urgencyColors[urgencyLevel] || urgencyColors['Low'];

        const modalContent = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">TR ID:</div>
                    <div><strong>${tr.tr_id}</strong></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">MRF Reference:</div>
                    <div>${tr.mrf_id}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Project:</div>
                    <div>${tr.project_code ? tr.project_code + ' - ' : ''}${tr.project_name || 'No project'}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Requestor:</div>
                    <div>${tr.requestor_name}</div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Urgency Level:</div>
                    <div><span style="background: ${colors.bg}; color: ${colors.color}; padding: 0.25rem 0.75rem; border-radius: 4px; font-weight: 600;">${urgencyLevel}</span></div>
                </div>
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Date Submitted:</div>
                    <div>${formatDate(tr.date_submitted)}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Delivery Address:</div>
                    <div>${tr.delivery_address || 'N/A'}</div>
                </div>
                <div style="grid-column: 1 / -1;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #5f6368;">Total Cost:</div>
                    <div><strong style="color: #34a853; font-size: 1.25rem;">₱${formatCurrency(tr.total_amount || 0)}</strong></div>
                </div>
            </div>

            <div style="margin: 1.5rem 0; padding: 1.5rem; background: #f8f9fa; border-radius: 8px;">
                <h4 style="margin-bottom: 1rem;">Service Items</h4>
                <table style="width: 100%; font-size: 0.875rem;">
                    <thead>
                        <tr style="background: white;">
                            <th style="padding: 0.5rem;">Service</th>
                            <th style="padding: 0.5rem;">Category</th>
                            <th style="padding: 0.5rem;">Qty</th>
                            <th style="padding: 0.5rem;">Unit Cost</th>
                            <th style="padding: 0.5rem;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr style="background: white;">
                                <td style="padding: 0.5rem;">${item.item || item.item_name}</td>
                                <td style="padding: 0.5rem;">${item.category || 'N/A'}</td>
                                <td style="padding: 0.5rem;">${item.qty || item.quantity} ${item.unit}</td>
                                <td style="padding: 0.5rem;">₱${formatCurrency(item.unit_cost || 0)}</td>
                                <td style="padding: 0.5rem;"><strong>₱${formatCurrency(item.subtotal || 0)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: white; font-weight: 600;">
                            <td colspan="4" style="padding: 0.75rem; text-align: right; border-top: 2px solid #dee2e6;">TOTAL:</td>
                            <td style="padding: 0.75rem; border-top: 2px solid #dee2e6;">₱${formatCurrency(tr.total_amount || 0)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        document.getElementById('prModalTitle').textContent = `Transport Request - ${tr.tr_id}`;
        document.getElementById('prModalBody').innerHTML = modalContent;

        const canEdit = window.canEditTab?.('finance');
        const showEditControls = canEdit !== false;

        const footer = document.getElementById('prModalFooter');
        footer.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                ${showEditControls ? `
                    <button class="btn btn-danger" onclick="window.rejectPR('${tr.id}')">
                        Reject
                    </button>
                    <button class="btn btn-primary" onclick="window.approveTR('${tr.id}')">
                        Approve Transport Request
                    </button>
                ` : ''}
                <button class="btn btn-secondary" onclick="window.closePRModal()">Close</button>
            </div>
        `;

        document.getElementById('prModal').classList.add('active');

    } catch (error) {
        console.error('Error loading TR details:', error);
        showToast('Failed to load TR details', 'error');
    } finally {
        showLoading(false);
    }
};

/**
 * Approve PR and generate POs
 */
async function approvePR(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    if (!confirm('Approve this Purchase Request and generate Purchase Orders?')) {
        return;
    }

    const pr = currentPRForApproval;
    if (!pr || pr.id !== prId) {
        showToast('PR reference lost. Please refresh and try again.', 'error');
        return;
    }

    showLoading(true);

    try {
        // Update PR status
        const prRef = doc(db, 'prs', pr.id);
        await updateDoc(prRef, {
            finance_status: 'Approved',
            finance_approver: 'Ma. Thea Angela R. Lacsamana',
            date_approved: new Date().toISOString().split('T')[0],
            approved_at: new Date().toISOString()
        });

        // Update MRF status
        const mrfsRef = collection(db, 'mrfs');
        const mrfQuery = query(mrfsRef, where('mrf_id', '==', pr.mrf_id));
        const mrfSnapshot = await getDocs(mrfQuery);

        if (!mrfSnapshot.empty) {
            const mrfDoc = mrfSnapshot.docs[0];
            await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                status: 'Finance Approved',
                updated_at: new Date().toISOString()
            });
        }

        // Generate POs
        const poCount = await generatePOsForPR(pr);

        // Close modal only after successful approval
        window.closePRModal();

        showToast(`✓ PR approved successfully! Generated ${poCount} PO(s).`, 'success');

        // Switch to PO tab
        setTimeout(() => {
            window.location.hash = '#/finance/pos';
        }, 1500);

    } catch (error) {
        console.error('Error approving PR:', error);
        showToast('Failed to approve PR. Please try again.', 'error');
        // Modal stays open on error so user can retry
    } finally {
        showLoading(false);
        currentPRForApproval = null;
    }
};

/**
 * Approve PR with signature validation and user attribution
 * Creates PO with embedded signature and finance approver identity
 */
async function approvePRWithSignature(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to approve PRs', 'error');
        return;
    }

    const currentUser = window.getCurrentUser();
    if (!currentUser) {
        showToast('Session expired. Please log in again.', 'error');
        return;
    }

    // Validate signature exists
    if (!approvalSignaturePad || approvalSignaturePad.isEmpty()) {
        showToast('Please provide your signature before approving', 'error');
        return;
    }

    // Export signature as base64 PNG
    const signatureDataURL = approvalSignaturePad.toDataURL('image/png');

    showLoading(true);

    try {
        // Get PR document
        const prRef = doc(db, 'prs', prId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            throw new Error('PR not found');
        }

        const pr = prDoc.data();

        // Update PR status with finance approver attribution
        await updateDoc(prRef, {
            finance_status: 'Approved',
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_approved_at: serverTimestamp(),
            date_approved: new Date().toISOString().split('T')[0] // Legacy compatibility
        });

        // Update MRF status
        const mrfsRef = collection(db, 'mrfs');
        const mrfQuery = query(mrfsRef, where('mrf_id', '==', pr.mrf_id));
        const mrfSnapshot = await getDocs(mrfQuery);

        if (!mrfSnapshot.empty) {
            const mrfDoc = mrfSnapshot.docs[0];
            await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                status: 'Finance Approved',
                updated_at: new Date().toISOString()
            });
        }

        // Generate PO using existing generatePOsForPR with signature data
        const poCount = await generatePOsForPRWithSignature(pr, signatureDataURL, currentUser);

        showToast(`PR approved! Generated ${poCount} PO(s) successfully.`, 'success');

        // Refresh PR list and close approval modal - STAY on approvals tab
        await refreshPRs();
        closeApprovalModal();

    } catch (error) {
        console.error('[Finance] Error approving PR:', error);
        showToast('Failed to approve PR: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Generate POs from approved PR with signature and user attribution
 * @param {Object} pr - PR data
 * @param {string} signatureDataURL - Base64 signature image
 * @param {Object} currentUser - Current user object
 * @returns {number} Number of POs created
 */
async function generatePOsForPRWithSignature(pr, signatureDataURL, currentUser) {
    console.log('[Finance] Generating POs with signature for PR:', pr.pr_id);

    const items = JSON.parse(pr.items_json || '[]');

    // Group items by supplier
    const itemsBySupplier = {};
    items.forEach(item => {
        const supplier = item.supplier || 'Unknown Supplier';
        if (!itemsBySupplier[supplier]) {
            itemsBySupplier[supplier] = [];
        }
        itemsBySupplier[supplier].push(item);
    });

    const suppliers = Object.keys(itemsBySupplier);
    console.log('[Finance] Creating POs for', suppliers.length, 'supplier(s)');

    // Get next PO number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonthPrefix = `PO_${year}_${month}`;

    const posRef = collection(db, 'pos');
    const allPOsSnapshot = await getDocs(posRef);
    let maxPONum = 0;

    allPOsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.po_id && data.po_id.startsWith(currentMonthPrefix)) {
            const match = data.po_id.match(/PO_\d{4}_\d{2}-(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxPONum) maxPONum = num;
            }
        }
    });

    let nextPONum = maxPONum + 1;
    let poCount = 0;

    // Create PO for each supplier with signature
    for (const supplier of suppliers) {
        const supplierItems = itemsBySupplier[supplier];
        const supplierTotal = supplierItems.reduce((s, item) => s + parseFloat(item.subtotal || 0), 0);

        const firstWord = supplier.split(/\s+/)[0] || supplier;
        const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
        const poId = `PO_${year}_${month}-${String(nextPONum).padStart(3, '0')}-${supplierSlug}`;

        await addDoc(collection(db, 'pos'), {
            po_id: poId,
            pr_id: pr.pr_id,
            mrf_id: pr.mrf_id,
            supplier_name: supplier,
            project_code: pr.project_code || '',
            project_name: pr.project_name,
            requestor_name: pr.requestor_name,
            delivery_address: pr.delivery_address || '',
            items_json: JSON.stringify(supplierItems),
            total_amount: supplierTotal,
            procurement_status: 'Pending Procurement',
            is_subcon: false,
            finance_approver_user_id: currentUser.uid,
            finance_approver_name: currentUser.full_name || currentUser.email || 'Finance User',
            finance_signature_url: signatureDataURL,
            date_issued: serverTimestamp(),
            date_issued_legacy: new Date().toISOString().split('T')[0],
            created_at: serverTimestamp()
        });

        console.log('[Finance] Created PO:', poId);
        nextPONum++;
        poCount++;
    }

    console.log('[Finance] Generated', poCount, 'PO(s) for PR:', pr.pr_id);
    return poCount;
}

/**
 * Approve TR (Transport Request)
 */
async function approveTR(trId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    if (!confirm('Approve this Transport Request?')) {
        return;
    }

    const tr = currentPRForApproval;
    if (!tr || tr.id !== trId) {
        showToast('TR reference lost. Please refresh and try again.', 'error');
        return;
    }

    showLoading(true);

    try {
        // Update TR status
        const trRef = doc(db, 'transport_requests', tr.id);
        await updateDoc(trRef, {
            finance_status: 'Approved',
            finance_approver: 'Ma. Thea Angela R. Lacsamana',
            date_approved: new Date().toISOString().split('T')[0],
            approved_at: new Date().toISOString()
        });

        // Update MRF status
        const mrfsRef = collection(db, 'mrfs');
        const mrfQuery = query(mrfsRef, where('mrf_id', '==', tr.mrf_id));
        const mrfSnapshot = await getDocs(mrfQuery);

        if (!mrfSnapshot.empty) {
            const mrfDoc = mrfSnapshot.docs[0];
            await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                status: 'Finance Approved',
                updated_at: new Date().toISOString()
            });
        }

        // Close modal only after successful approval
        window.closePRModal();

        showToast('✓ Transport Request approved successfully!', 'success');

    } catch (error) {
        console.error('Error approving TR:', error);
        showToast('Failed to approve TR. Please try again.', 'error');
        // Modal stays open on error so user can retry
    } finally {
        showLoading(false);
        currentPRForApproval = null;
    }
};

/**
 * Show approval modal with signature canvas
 * Opens after closing PR review modal for two-step approval flow
 */
function showApprovalModal(id, type) {
    currentApprovalTarget = { id, type };

    // Close the review modal first
    closePRModal();

    // Open approval modal
    document.getElementById('approvalModal').classList.add('active');

    // Initialize signature pad after DOM is ready
    requestAnimationFrame(() => {
        approvalSignaturePad = initializeApprovalSignaturePad();
    });
}

/**
 * Close approval modal and clean up signature pad
 */
function closeApprovalModal() {
    // Clean up signature pad
    if (approvalSignaturePad) {
        approvalSignaturePad.off();
        approvalSignaturePad = null;
    }

    document.getElementById('approvalModal')?.classList.remove('active');
    currentApprovalTarget = null;
}

/**
 * Confirm approval from the approval modal
 * Routes to appropriate approval function based on type
 */
async function confirmApproval() {
    if (!currentApprovalTarget) {
        showToast('No approval target set. Please try again.', 'error');
        return;
    }

    if (currentApprovalTarget.type === 'pr') {
        await approvePRWithSignature(currentApprovalTarget.id);
    }
}

/**
 * Close PR Modal
 */
function closePRModal() {
    // Clean up signature pad to prevent memory leaks
    if (approvalSignaturePad) {
        approvalSignaturePad.off(); // Remove event listeners
        approvalSignaturePad = null;
    }

    const modal = document.getElementById('prModal');
    modal?.classList.remove('active');
}

// ========================================
// REJECTION WORKFLOW
// ========================================

/**
 * Reject PR/TR
 */
function rejectPR(prId) {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    // Store current PR for rejection
    if (!currentPRForRejection || currentPRForRejection.id !== prId) {
        showToast('Request reference lost. Please refresh and try again.', 'error');
        return;
    }

    // Close PR modal and open rejection modal
    window.closePRModal();
    document.getElementById('rejectionReason').value = '';
    document.getElementById('rejectionModal').classList.add('active');
};

/**
 * Close Rejection Modal
 */
function closeRejectionModal() {
    document.getElementById('rejectionModal').classList.remove('active');
}

/**
 * Submit Rejection
 */
async function submitRejection() {
    if (window.canEditTab?.('finance') === false) {
        showToast('You do not have permission to edit finance data', 'error');
        return;
    }

    const reason = document.getElementById('rejectionReason').value.trim();

    if (!reason) {
        showToast('Please provide a rejection reason', 'error');
        return;
    }

    const request = currentPRForRejection;
    if (!request) {
        showToast('Request reference lost. Please refresh and try again.', 'error');
        return;
    }

    window.closeRejectionModal();
    showLoading(true);

    try {
        const isTransport = request.isTransportRequest || request.tr_id;

        if (isTransport) {
            // Reject TR
            const trRef = doc(db, 'transport_requests', request.id);
            await updateDoc(trRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: 'Ma. Thea Angela R. Lacsamana'
            });

            // Update MRF
            const mrfsRef = collection(db, 'mrfs');
            const mrfQuery = query(mrfsRef, where('mrf_id', '==', request.mrf_id));
            const mrfSnapshot = await getDocs(mrfQuery);

            if (!mrfSnapshot.empty) {
                const mrfDoc = mrfSnapshot.docs[0];
                await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                    status: 'TR Rejected',
                    rejection_reason: reason,
                    updated_at: new Date().toISOString()
                });
            }

            showToast('Transport Request rejected', 'success');
        } else {
            // Reject PR
            const prRef = doc(db, 'prs', request.id);
            await updateDoc(prRef, {
                finance_status: 'Rejected',
                rejection_reason: reason,
                rejected_at: new Date().toISOString(),
                rejected_by: 'Ma. Thea Angela R. Lacsamana'
            });

            // Update MRF
            const mrfsRef = collection(db, 'mrfs');
            const mrfQuery = query(mrfsRef, where('mrf_id', '==', request.mrf_id));
            const mrfSnapshot = await getDocs(mrfQuery);

            if (!mrfSnapshot.empty) {
                const mrfDoc = mrfSnapshot.docs[0];
                await updateDoc(doc(db, 'mrfs', mrfDoc.id), {
                    status: 'PR Rejected',
                    rejected_pr_id: request.pr_id,
                    rejection_reason: reason,
                    is_rejected: true,
                    updated_at: new Date().toISOString()
                });
            }

            showToast('Purchase Request rejected', 'success');
        }

    } catch (error) {
        console.error('Error rejecting request:', error);
        showToast('Failed to reject request', 'error');
    } finally {
        showLoading(false);
        currentPRForRejection = null;
    }
}

// ========================================
// PO GENERATION
// ========================================

/**
 * Generate POs from approved PR
 * Returns number of POs created
 */
async function generatePOsForPR(pr) {
    console.log('🔄 Generating POs for PR:', pr.pr_id);

    try {
        const items = JSON.parse(pr.items_json || '[]');

        // Group items by supplier
        const itemsBySupplier = {};
        items.forEach(item => {
            const supplier = item.supplier || 'Unknown Supplier';
            if (!itemsBySupplier[supplier]) {
                itemsBySupplier[supplier] = [];
            }
            itemsBySupplier[supplier].push(item);
        });

        const suppliers = Object.keys(itemsBySupplier);
        console.log('📦 Creating POs for', suppliers.length, 'supplier(s)');

        // Get next PO number
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthPrefix = `PO_${year}_${month}`;

        const posRef = collection(db, 'pos');
        const allPOsSnapshot = await getDocs(posRef);
        let maxPONum = 0;

        allPOsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.po_id && data.po_id.startsWith(currentMonthPrefix)) {
                const match = data.po_id.match(/PO_\d{4}_\d{2}-(\d+)/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxPONum) maxPONum = num;
                }
            }
        });

        let nextPONum = maxPONum + 1;
        let poCount = 0;

        // Create PO for each supplier
        for (const supplier of suppliers) {
            const supplierItems = itemsBySupplier[supplier];
            const supplierTotal = supplierItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);

            const firstWord = supplier.split(/\s+/)[0] || supplier;
            const supplierSlug = firstWord.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').toUpperCase();
            const poId = `PO_${year}_${month}-${String(nextPONum).padStart(3, '0')}-${supplierSlug}`;

            await addDoc(collection(db, 'pos'), {
                po_id: poId,
                pr_id: pr.pr_id,
                mrf_id: pr.mrf_id,
                supplier_name: supplier,
                project_code: pr.project_code || '',
                project_name: pr.project_name,
                requestor_name: pr.requestor_name,
                delivery_address: pr.delivery_address || '',
                items_json: JSON.stringify(supplierItems),
                total_amount: supplierTotal,
                procurement_status: 'Pending Procurement',
                date_issued: new Date().toISOString().split('T')[0],
                created_at: new Date().toISOString(),
                is_subcon: false
            });

            console.log('✅ Created PO:', poId);
            nextPONum++;
            poCount++;
        }

        console.log('✅ Generated', poCount, 'PO(s) for PR:', pr.pr_id);
        return poCount;

    } catch (error) {
        console.error('Error generating POs:', error);
        throw error;
    }
}

// ========================================
// PO MANAGEMENT
// ========================================

/**
 * Load POs with real-time listener
 */
async function loadPOs() {
    const posRef = collection(db, 'pos');

    const poListener = onSnapshot(posRef, (snapshot) => {
        console.log('📊 Finance: Loaded POs from Firebase:', snapshot.size);
        poData = [];

        snapshot.forEach((docSnap) => {
            poData.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort using current user-selected sort state (default: date_issued desc)
        poData.sort((a, b) => {
            let aVal = a[poSortColumn];
            let bVal = b[poSortColumn];
            if (poSortColumn === 'date_issued') {
                aVal = aVal?.toDate ? aVal.toDate() : new Date(aVal || 0);
                bVal = bVal?.toDate ? bVal.toDate() : new Date(bVal || 0);
            }
            if (aVal == null) return poSortDirection === 'asc' ? 1 : -1;
            if (bVal == null) return poSortDirection === 'asc' ? -1 : 1;
            if (typeof aVal === 'string') {
                return poSortDirection === 'asc'
                    ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return poSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        console.log('📄 POs loaded:', poData.length);
        renderPOs();
    });

    listeners.push(poListener);
}

/**
 * Render POs list
 */
function renderPOs() {
    const container = document.getElementById('poList');

    if (poData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
                <h3>No Purchase Orders Yet</h3>
                <p>POs will appear here after approving Purchase Requests</p>
            </div>
        `;
        return;
    }

    // Show only recent 20 POs
    const recentPOs = poData.slice(0, 20);

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th onclick="window.sortPOs('po_id')" style="cursor: pointer; user-select: none;">
                        PO ID <span class="sort-indicator" data-col="po_id"></span>
                    </th>
                    <th onclick="window.sortPOs('pr_id')" style="cursor: pointer; user-select: none;">
                        PR ID <span class="sort-indicator" data-col="pr_id"></span>
                    </th>
                    <th onclick="window.sortPOs('supplier_name')" style="cursor: pointer; user-select: none;">
                        Supplier <span class="sort-indicator" data-col="supplier_name"></span>
                    </th>
                    <th onclick="window.sortPOs('project_name')" style="cursor: pointer; user-select: none;">
                        Project <span class="sort-indicator" data-col="project_name"></span>
                    </th>
                    <th onclick="window.sortPOs('total_amount')" style="cursor: pointer; user-select: none;">
                        Amount <span class="sort-indicator" data-col="total_amount"></span>
                    </th>
                    <th onclick="window.sortPOs('date_issued')" style="cursor: pointer; user-select: none;">
                        Date Issued <span class="sort-indicator" data-col="date_issued"></span>
                    </th>
                    <th onclick="window.sortPOs('procurement_status')" style="cursor: pointer; user-select: none;">
                        Status <span class="sort-indicator" data-col="procurement_status"></span>
                    </th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${recentPOs.map(po => `
                    <tr>
                        <td><strong>${po.po_id}</strong></td>
                        <td>${po.pr_id}</td>
                        <td>${po.supplier_name}</td>
                        <td>${po.project_code ? po.project_code + ' - ' : ''}${po.project_name || 'No project'}</td>
                        <td><strong>₱${formatCurrency(po.total_amount || 0)}</strong></td>
                        <td>${formatTimestamp(po.date_issued) || formatDate(po.date_issued_legacy) || 'N/A'}</td>
                        <td><span style="background: #fef3c7; color: #f59e0b; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.75rem;">${po.procurement_status || 'Pending'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="promptPODocument('${po.id}')">View PO</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${poData.length > 20 ? `<p style="text-align: center; margin-top: 1rem; color: #666;">Showing 20 most recent POs</p>` : ''}
    `;

    // Update sort indicators for PO table
    container.querySelectorAll('.sort-indicator').forEach(indicator => {
        const col = indicator.dataset.col;
        if (col === poSortColumn) {
            indicator.textContent = poSortDirection === 'asc' ? ' \u2191' : ' \u2193';
            indicator.style.color = '#1a73e8';
        } else {
            indicator.textContent = ' \u21C5';
            indicator.style.color = '#94a3b8';
        }
    });
}

/**
 * Sort POs by column
 */
function sortPOs(column) {
    if (poSortColumn === column) {
        poSortDirection = poSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        poSortColumn = column;
        poSortDirection = 'asc';
    }
    // Sort poData - handle Firestore Timestamps for date_issued
    poData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (column === 'date_issued') {
            aVal = aVal?.toDate ? aVal.toDate() : new Date(aVal || 0);
            bVal = bVal?.toDate ? bVal.toDate() : new Date(bVal || 0);
        }
        if (aVal == null) return poSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return poSortDirection === 'asc' ? -1 : 1;
        if (typeof aVal === 'string') {
            return poSortDirection === 'asc'
                ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return poSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
    renderPOs();
}

/**
 * Refresh POs manually
 */
async function refreshPOs() {
    await loadPOs();
    showToast('PO list refreshed', 'success');
}

console.log('Finance view module loaded successfully');
