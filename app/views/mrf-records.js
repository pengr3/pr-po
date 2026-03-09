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

import { db, collection, getDocs, getDoc, query, where, orderBy, doc } from '../firebase.js';
import { formatDate, formatTimestamp, getStatusClass, formatCurrency, showLoading, showToast, downloadCSV, escapeHTML } from '../utils.js';
import { getMRFLabel, createModal, openModal, closeModal, skeletonTableRows } from '../components.js';

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

// ========================================
// DOCUMENT GENERATION (self-contained, no procurement.js dependency)
// Functions below mirror procurement.js equivalents with "Local" suffix.
// ========================================

const DOCUMENT_CONFIG_LOCAL = {
    defaultFinancePIC: 'Finance Approver',
    companyInfo: {
        name: 'C. Lacsamana Management and Construction Corporation',
        address: '133 Pinatubo St. City of Mandaluyong City',
        tel: '09178182993',
        email: 'cgl@consultclm.com',
        logo: '/CLMC Registered Logo Cropped (black fill).png'
    }
};

function formatDocumentDateLocal(dateString) {
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

function generateItemsTableHTMLLocal(items, type) {
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
                <td>${escapeHTML(item.item || item.item_name)}</td>
                ${type === 'PR' ? `<td>${escapeHTML(item.category || 'N/A')}</td>` : ''}
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

function generatePRHTMLLocal(data) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${data.PR_ID} - Purchase Request</title>
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
                .total {
                    font-size: 12pt;
                    font-weight: bold;
                    margin: 15px 0;
                    text-align: right;
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
                <div class="title">PURCHASE REQUEST FORM (PR)</div>

                <div class="section">
                    <div class="field"><span class="label">Document No.:</span> ${data.PR_ID}</div>
                    <div class="field"><span class="label">MRF Reference:</span> ${data.MRF_ID}</div>
                    <div class="field"><span class="label">Date:</span> ${data.DATE}</div>
                    <div class="field"><span class="label">Prepared by:</span> ${data.PREPARED_BY}</div>
                </div>

                <div class="section">
                    <div class="field"><span class="label">Project:</span> ${data.PROJECT}</div>
                    <div class="field"><span class="label">Delivery Address:</span> ${data.ADDRESS}</div>
                    <div class="field"><span class="label">Supplier:</span> ${data.SUPPLIER}</div>
                </div>

                <div class="section">
                    <h3 style="margin: 10px 0;">Items Requested:</h3>
                    ${data.ITEMS_TABLE}
                </div>

                <div class="total">
                    TOTAL AMOUNT: ₱${data.TOTAL_COST}
                </div>

                <div style="margin-top: 40px; page-break-inside: avoid;">
                    <div style="margin: 8px 0;">
                        <span style="font-weight: bold; display: inline-block; width: 150px;">Requested By:</span> ${data.REQUESTOR}
                    </div>
                    <div style="margin: 8px 0;">
                        <span style="font-weight: bold; display: inline-block; width: 150px;">Prepared by:</span> ${data.PREPARED_BY}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

function generatePOHTMLLocal(data) {
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

function openPrintWindowLocal(html, filename) {
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
        alert('Please allow pop-ups to generate PDF documents');
        return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = function() {
        setTimeout(() => {
            printWindow.print();
        }, 250);
    };
}

/**
 * Generate PR document for print/PDF (self-contained, no procurement.js dependency).
 * Mirrors procurement.js generatePRDocument exactly.
 * @param {string} prDocId - Firestore document ID of the PR
 */
async function generatePRDocumentLocal(prDocId) {
    showLoading(true);

    try {
        const prRef = doc(db, 'prs', prDocId);
        const prDoc = await getDoc(prRef);

        if (!prDoc.exists()) {
            throw new Error('PR not found');
        }

        const pr = prDoc.data();
        const items = JSON.parse(pr.items_json || '[]');

        const documentData = {
            PR_ID: pr.pr_id,
            MRF_ID: pr.mrf_id,
            DATE: formatDocumentDateLocal(pr.date_generated || new Date().toISOString()),
            PROJECT: getMRFLabel(pr),
            ADDRESS: pr.delivery_address,
            SUPPLIER: pr.supplier_name || 'Not specified',
            ITEMS_TABLE: generateItemsTableHTMLLocal(items, 'PR'),
            TOTAL_COST: formatCurrency(pr.total_amount),
            REQUESTOR: pr.requestor_name,
            PREPARED_BY: pr.pr_creator_name || pr.procurement_pic || 'Procurement Team',
            company_info: DOCUMENT_CONFIG_LOCAL.companyInfo
        };

        const html = generatePRHTMLLocal(documentData);
        openPrintWindowLocal(html, documentData.PR_ID);

        showToast('PR document opened. Use browser Print \u2192 Save as PDF', 'success');

    } catch (error) {
        console.error('[MRFRecords] Error generating PR document:', error);
        showToast('Failed to generate PR document', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Generate PO document for print/PDF (self-contained, no procurement.js dependency).
 * Mirrors procurement.js generatePODocument exactly.
 * @param {string} poDocId - Firestore document ID of the PO
 */
async function generatePODocumentLocal(poDocId) {
    showLoading(true);

    try {
        const poRef = doc(db, 'pos', poDocId);
        const poDoc = await getDoc(poRef);

        if (!poDoc.exists()) {
            throw new Error('PO not found');
        }

        const po = poDoc.data();
        const items = JSON.parse(po.items_json || '[]');

        const documentData = {
            PO_ID: po.po_id,
            PROJECT: getMRFLabel(po),
            DATE: formatTimestamp(po.date_issued) || formatDocumentDateLocal(po.date_issued_legacy) || 'N/A',
            SUPPLIER: po.supplier_name,
            QUOTE_REF: po.quote_ref || 'N/A',
            ITEMS_TABLE: generateItemsTableHTMLLocal(items, 'PO'),
            DELIVERY_ADDRESS: po.delivery_address,
            PAYMENT_TERMS: po.payment_terms || '',
            CONDITION: po.condition || '',
            DELIVERY_DATE: po.delivery_date ? formatDocumentDateLocal(po.delivery_date) : '',
            FINANCE_APPROVER: po.finance_approver_name || po.finance_approver || DOCUMENT_CONFIG_LOCAL.defaultFinancePIC,
            FINANCE_SIGNATURE_URL: po.finance_signature_url || '',
            company_info: DOCUMENT_CONFIG_LOCAL.companyInfo
        };

        const html = generatePOHTMLLocal(documentData);
        openPrintWindowLocal(html, documentData.PO_ID);

        showToast('PO document opened. Use browser Print \u2192 Save as PDF', 'success');

    } catch (error) {
        console.error('[MRFRecords] Error generating PO document:', error);
        showToast('Failed to generate PO document', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Show PR detail modal (read-only).
 * Self-contained copy of procurement.js viewPRDetails, minus document generation button.
 * Takes the Firestore document ID (not pr_id string).
 */
async function viewPRDetailsLocal(prDocId) {
    showLoading(true);
    try {
        const prDoc = await getDoc(doc(db, 'prs', prDocId));
        if (!prDoc.exists()) { showToast('PR not found', 'error'); return; }
        const pr = { id: prDoc.id, ...prDoc.data() };
        const items = JSON.parse(pr.items_json || '[]');

        const body = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div><div style="font-size: 0.75rem; color: #5f6368;">PR ID</div><div style="font-weight: 600;">${escapeHTML(pr.pr_id)}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div><div style="font-weight: 600;">${escapeHTML(pr.mrf_id)}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Supplier</div><div style="font-weight: 600;">${escapeHTML(pr.supplier_name || 'Not specified')}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Prepared By</div><div style="padding: 0.5rem 0.75rem; background: #f8f9fa; border-radius: 4px; color: #1e293b; font-size: 0.875rem;">${escapeHTML(pr.pr_creator_name || 'Unknown User')}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Project</div><div>${escapeHTML(getMRFLabel(pr))}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Date Generated</div><div>${escapeHTML(pr.date_generated)}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Status</div><div><span class="status-badge ${getStatusClass(pr.finance_status || 'Pending')}">${escapeHTML(pr.finance_status || 'Pending')}</span></div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div><div style="font-weight: 600;">PHP ${parseFloat(pr.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Requestor</div><div>${escapeHTML(pr.requestor_name)}</div></div>
                </div>
                <div style="margin-bottom: 1rem;">
                    <div style="font-size: 0.75rem; color: #5f6368; margin-bottom: 0.5rem;">Delivery Address</div>
                    <div style="padding: 0.75rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem;">${escapeHTML(pr.delivery_address || 'N/A')}</div>
                </div>
                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead><tr style="background: #f3f4f6;">
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Qty</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Unit Cost</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
                        </tr></thead>
                        <tbody>${items.map(item => `
                            <tr>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name)}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(String(item.qty || item.quantity))} ${escapeHTML(item.unit)}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.unit_cost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.subtotal || ((item.qty || item.quantity) * item.unit_cost) || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        let container = document.getElementById('mrfRecordsPRModalContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mrfRecordsPRModalContainer';
            document.body.appendChild(container);
        }
        container.innerHTML = createModal({
            id: 'mrfRecordsPRModal',
            title: `Purchase Request Details: ${pr.pr_id}`,
            body,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('mrfRecordsPRModal')">Close</button>
                <button class="btn btn-primary" onclick="generatePRDocumentLocal('${pr.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>View PR
                </button>`,
            size: 'large'
        });
        openModal('mrfRecordsPRModal');
    } catch (error) {
        console.error('[MRFRecords] Error loading PR details:', error);
        showToast('Failed to load PR details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Show PO detail modal (read-only).
 * Self-contained copy of procurement.js viewPODetails, minus editable Document Details
 * section and document generation button — requestors cannot edit PO fields.
 * Takes the Firestore document ID (not po_id string).
 */
async function viewPODetailsLocal(poDocId) {
    showLoading(true);
    try {
        const poDoc = await getDoc(doc(db, 'pos', poDocId));
        if (!poDoc.exists()) { showToast('PO not found', 'error'); return; }
        const po = { id: poDoc.id, ...poDoc.data() };
        const items = JSON.parse(po.items_json || '[]');

        const isSubcon = po.is_subcon || false;
        const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
        const status = po.procurement_status || defaultStatus;

        let statusBg = '#fef3c7', statusColor = '#92400e';
        if (isSubcon) {
            if (status === 'Processed') { statusBg = '#d1fae5'; statusColor = '#065f46'; }
            else if (status === 'Processing') { statusBg = '#dbeafe'; statusColor = '#1e40af'; }
        } else {
            if (status === 'Delivered') { statusBg = '#d1fae5'; statusColor = '#065f46'; }
            else if (status === 'Procured') { statusBg = '#dbeafe'; statusColor = '#1e40af'; }
            else if (status === 'Procuring') { statusBg = '#fef3c7'; statusColor = '#92400e'; }
        }

        const body = `
            <div style="max-height: 60vh; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div><div style="font-size: 0.75rem; color: #5f6368;">PO ID</div><div style="font-weight: 600;">${escapeHTML(po.po_id)}${isSubcon ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600;">SUBCON</span>' : ''}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">MRF Reference</div><div style="font-weight: 600;">${escapeHTML(po.mrf_id || 'N/A')}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Supplier</div><div style="font-weight: 600;">${escapeHTML(po.supplier_name)}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Project</div><div>${escapeHTML(getMRFLabel(po))}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Date Issued</div><div>${formatTimestamp(po.date_issued) || 'N/A'}</div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Status</div><div><span style="background: ${statusBg}; color: ${statusColor}; padding: 0.375rem 0.75rem; border-radius: 6px; font-size: 0.875rem; font-weight: 600; display: inline-block;">${escapeHTML(status)}</span></div></div>
                    <div><div style="font-size: 0.75rem; color: #5f6368;">Total Amount</div><div style="font-weight: 600;">PHP ${parseFloat(po.total_amount || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div></div>
                    ${po.delivery_fee ? `<div><div style="font-size: 0.75rem; color: #5f6368;">Delivery Fee</div><div style="font-weight: 600;">PHP ${parseFloat(po.delivery_fee).toLocaleString('en-PH', {minimumFractionDigits: 2})}</div></div>` : ''}
                </div>
                <div style="margin-top: 1.5rem;">
                    <h4 style="margin-bottom: 0.75rem;">Items (${items.length})</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead><tr style="background: #f3f4f6;">
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Item</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Category</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Qty</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Unit Cost</th>
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Subtotal</th>
                        </tr></thead>
                        <tbody>${items.map(item => `
                            <tr>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.item || item.item_name)}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(item.category || 'N/A')}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">${escapeHTML(String(item.qty || item.quantity))} ${escapeHTML(item.unit)}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.unit_cost || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                                <td style="padding: 0.5rem; border-bottom: 1px solid #e5e7eb;">PHP ${parseFloat(item.subtotal || ((item.qty || item.quantity) * item.unit_cost) || 0).toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;

        let container = document.getElementById('mrfRecordsPOModalContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mrfRecordsPOModalContainer';
            document.body.appendChild(container);
        }
        container.innerHTML = createModal({
            id: 'mrfRecordsPOModal',
            title: `Purchase Order Details: ${po.po_id}`,
            body,
            footer: `
                <button class="btn btn-secondary" onclick="closeModal('mrfRecordsPOModal')">Close</button>
                <button class="btn btn-primary" onclick="generatePODocumentLocal('${po.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: middle;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>View PO
                </button>`,
            size: 'large'
        });
        openModal('mrfRecordsPOModal');
    } catch (error) {
        console.error('[MRFRecords] Error loading PO details:', error);
        showToast('Failed to load PO details', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Show procurement timeline modal for an MRF (read-only).
 * Self-contained copy of procurement.js showProcurementTimeline.
 * Injects a timeline modal div into document.body — removes it on close.
 * Uses same timeline CSS classes as procurement.js (already in views.css).
 */
async function showTimelineLocal(mrfId) {
    showLoading(true);
    try {
        const mrfQuery = query(collection(db, 'mrfs'), where('mrf_id', '==', mrfId));
        const mrfSnapshot = await getDocs(mrfQuery);
        if (mrfSnapshot.empty) { showToast('MRF not found', 'error'); return; }
        const mrf = { id: mrfSnapshot.docs[0].id, ...mrfSnapshot.docs[0].data() };

        const prsSnapshot = await getDocs(query(collection(db, 'prs'), where('mrf_id', '==', mrfId)));
        const prs = [];
        prsSnapshot.forEach(d => prs.push(d.data()));

        const trsSnapshot = await getDocs(query(collection(db, 'transport_requests'), where('mrf_id', '==', mrfId)));
        const trs = [];
        trsSnapshot.forEach(d => trs.push(d.data()));

        const posSnapshot = await getDocs(query(collection(db, 'pos'), where('mrf_id', '==', mrfId), orderBy('date_issued', 'asc')));
        const pos = [];
        posSnapshot.forEach(d => pos.push(d.data()));

        const posByPR = {};
        pos.forEach(po => {
            const prId = po.pr_id || '_unlinked';
            if (!posByPR[prId]) posByPR[prId] = [];
            posByPR[prId].push(po);
        });

        const getPRStatusClass = s => s === 'Approved' ? 'completed' : s === 'Rejected' ? 'rejected' : 'pending';
        const getPOStatusClass = s => (s === 'Delivered' || s === 'Processed') ? 'completed' : (s === 'Procuring' || s === 'Processing') ? 'active' : 'pending';

        const deptLabel = mrf.department === 'services' ? 'Service' : 'Project';
        let timelineHtml = '<div class="timeline">';

        timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">MRF Created: ${escapeHTML(mrf.mrf_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(mrf.created_at) || 'N/A'}</div>
                <div class="timeline-item-description">Requestor: ${escapeHTML(mrf.requestor_name)} | ${escapeHTML(deptLabel)}: ${escapeHTML(getMRFLabel(mrf))}</div>
            </div>`;

        // PRs — lifecycle-aware (Submitted → Rejected → Resubmitted → Approved)
        prs.forEach(pr => {
            const hasRejection = !!(pr.rejection_reason || pr.rejected_at);
            const hasResubmission = hasRejection && !!pr.resubmitted_at;
            const childPOs = posByPR[pr.pr_id] || [];
            const childHtml = childPOs.map(po => `
                <div class="timeline-child-item ${getPOStatusClass(po.procurement_status)}">
                    <div class="timeline-item-title">Purchase Order: ${escapeHTML(po.po_id)}</div>
                    <div class="timeline-item-date">${formatTimestamp(po.date_issued) || 'N/A'}</div>
                    <div class="timeline-item-description">Supplier: ${escapeHTML(po.supplier_name)}</div>
                    <div class="timeline-procurement-status">
                        <span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">${escapeHTML(po.procurement_status || 'Pending Procurement')}</span>
                    </div>
                </div>`).join('');

            // Submitted event: green if Approved with no rejection history, grey otherwise
            const submittedClass = (pr.finance_status === 'Approved' && !hasRejection) ? 'completed' : 'pending';
            timelineHtml += `
            <div class="timeline-item ${submittedClass}">
                <div class="timeline-item-title">Purchase Request Submitted: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.date_generated) || 'N/A'}</div>
                <div class="timeline-item-description">Supplier: ${escapeHTML(pr.supplier_name)} | Amount: \u20b1${formatCurrency(pr.total_amount)}</div>
            </div>`;

            // Rejection event
            if (hasRejection) {
                timelineHtml += `
            <div class="timeline-item rejected">
                <div class="timeline-item-title">❌ PR Rejected: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.rejected_at) || 'N/A'}</div>
                <div class="timeline-item-description">Reason: ${escapeHTML(pr.rejection_reason || 'No reason provided')} | Rejected by: ${escapeHTML(pr.rejected_by || 'Finance')}</div>
            </div>`;
            }

            // Resubmission event
            if (hasResubmission) {
                timelineHtml += `
            <div class="timeline-item active">
                <div class="timeline-item-title">↩ Resubmitted: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.resubmitted_at) || 'N/A'}</div>
                <div class="timeline-item-description">Resubmitted for Finance review</div>
            </div>`;
            }

            // Approved event (with nested POs)
            if (pr.finance_status === 'Approved') {
                timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">PR Approved: ${escapeHTML(pr.pr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(pr.date_generated) || 'N/A'}</div>
                <div class="timeline-item-description">Finance approved | Amount: \u20b1${formatCurrency(pr.total_amount)}</div>
                ${childPOs.length > 0 ? `<div class="timeline-children">${childHtml}</div>` : ''}
            </div>`;
            } else if (!hasRejection && childPOs.length > 0) {
                timelineHtml += `<div class="timeline-children">${childHtml}</div>`;
            }
        });

        // TRs — lifecycle-aware (Submitted → Rejected → Resubmitted → Approved)
        trs.forEach(tr => {
            const hasRejection = !!(tr.rejection_reason || tr.rejected_at);
            const hasResubmission = hasRejection && !!tr.resubmitted_at;

            // Submitted event
            const submittedClass = (tr.finance_status === 'Approved' && !hasRejection) ? 'completed' : 'pending';
            timelineHtml += `
            <div class="timeline-item ${submittedClass}">
                <div class="timeline-item-title">Transport Request Submitted: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.date_submitted) || 'N/A'}</div>
                <div class="timeline-item-description">Amount: \u20b1${formatCurrency(tr.total_amount)}</div>
            </div>`;

            // Rejection event
            if (hasRejection) {
                timelineHtml += `
            <div class="timeline-item rejected">
                <div class="timeline-item-title">❌ TR Rejected: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.rejected_at) || 'N/A'}</div>
                <div class="timeline-item-description">Reason: ${escapeHTML(tr.rejection_reason || 'No reason provided')} | Rejected by: ${escapeHTML(tr.rejected_by || 'Finance')}</div>
            </div>`;
            }

            // Resubmission event
            if (hasResubmission) {
                timelineHtml += `
            <div class="timeline-item active">
                <div class="timeline-item-title">↩ Resubmitted: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.resubmitted_at) || 'N/A'}</div>
                <div class="timeline-item-description">Resubmitted for Finance review</div>
            </div>`;
            }

            // Approved event
            if (tr.finance_status === 'Approved') {
                timelineHtml += `
            <div class="timeline-item completed">
                <div class="timeline-item-title">TR Approved: ${escapeHTML(tr.tr_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(tr.date_submitted) || 'N/A'}</div>
                <div class="timeline-item-description">Finance approved | Amount: \u20b1${formatCurrency(tr.total_amount)}</div>
            </div>`;
            }
        });

        (posByPR['_unlinked'] || []).forEach(po => {
            timelineHtml += `
            <div class="timeline-item ${getPOStatusClass(po.procurement_status)}">
                <div class="timeline-item-title">Purchase Order: ${escapeHTML(po.po_id)}</div>
                <div class="timeline-item-date">${formatTimestamp(po.date_issued) || 'N/A'}</div>
                <div class="timeline-item-description">Supplier: ${escapeHTML(po.supplier_name)}</div>
                <div class="timeline-procurement-status">
                    <span class="status-badge ${getStatusClass(po.procurement_status || 'Pending Procurement')}">${escapeHTML(po.procurement_status || 'Pending Procurement')}</span>
                </div>
            </div>`;
        });

        timelineHtml += '</div>';

        // Remove any existing timeline modal container
        const existing = document.getElementById('mrfRecordsTimelineContainer');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'mrfRecordsTimelineContainer';
        container.innerHTML = `
            <div id="mrfRecordsTimelineModal" class="modal active">
                <div class="modal-content" style="max-width: 800px;">
                    <div class="modal-header">
                        <h2>Procurement Timeline - ${escapeHTML(mrfId)}</h2>
                        <button class="modal-close" onclick="document.getElementById('mrfRecordsTimelineContainer').remove()">&times;</button>
                    </div>
                    <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                        ${timelineHtml}
                    </div>
                </div>
            </div>`;
        document.body.appendChild(container);

    } catch (error) {
        console.error('[MRFRecords] Error loading timeline:', error);
        showToast('Failed to load procurement timeline', 'error');
    } finally {
        showLoading(false);
    }
}

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
    let sortField = 'date_needed';  // default: Date Needed ascending
    let sortDir = 'asc';
    let _subDataCache = new Map(); // key: mrf.id, value: { prDataArray, poDataArray, trFinanceStatus }

    // ------------------------------------------------
    // SORT HELPERS
    // ------------------------------------------------

    function getSortIndicator(col) {
        if (col === sortField) {
            return `<span style="color: #1a73e8;">${sortDir === 'asc' ? ' \u2191' : ' \u2193'}</span>`;
        }
        return `<span style="color: #94a3b8;"> \u21C5</span>`;
    }

    function applySort() {
        filteredRecords.sort((a, b) => {
            let aVal, bVal;
            if (sortField === 'mrf_id') {
                aVal = a.mrf_id || '';
                bVal = b.mrf_id || '';
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            } else if (sortField === 'date_needed') {
                aVal = a.date_needed ? new Date(a.date_needed) : new Date(0);
                bVal = b.date_needed ? new Date(b.date_needed) : new Date(0);
            } else if (sortField === 'status') {
                aVal = a.status || '';
                bVal = b.status || '';
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            } else if (sortField === 'procurement_status') {
                aVal = a._procurement_status || '';
                bVal = b._procurement_status || '';
                return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            } else {
                return 0;
            }
            // Date comparison (date_needed path)
            return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }

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

        container.innerHTML = `<div class="table-scroll-container"><table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #f8f9fa;"><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">MRF ID</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Project</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Date Needed</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">PRs</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">POs</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">MRF Status</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Procurement Status</th><th style="padding: 0.75rem 1rem; border-bottom: 2px solid #e5e7eb;">Actions</th></tr></thead><tbody>${skeletonTableRows(8, 5)}</tbody></table></div>`;

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
            _subDataCache = new Map(); // invalidate on fresh load
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
            applySort();
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
        applySort();
        currentPage = 1;
        await render();
    }

    // ------------------------------------------------
    // SORT (public)
    // ------------------------------------------------

    function sort(field) {
        if (sortField === field) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDir = 'asc';
        }
        applySort();
        currentPage = 1;
        render();
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

        // Show loading state only on first render (cache empty); skip on sort/filter/page-change
        if (_subDataCache.size === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #999;">Loading document references...</div>';
        }

        // Fetch PR and PO data for current page items only (parallel per row)
        const rows = await Promise.all(pageItems.map(async (mrf) => {
            const type = mrf.request_type === 'service' ? 'Transport' : 'Material';

            // PRs | POs | Procurement Status columns (aligned sub-rows per PR/PO pair)
            let prHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let poHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let procStatusHtml = '<span style="color: #999; font-size: 0.875rem;">-</span>';
            let prDataArray = [];
            let poDataArray = [];
            let trFinanceStatus = null;
            let trDataArray = [];

            // Check cache first — skip Firestore if sub-data already loaded for this MRF
            if (_subDataCache.has(mrf.id)) {
                const cached = _subDataCache.get(mrf.id);
                prDataArray = cached.prDataArray;
                poDataArray = cached.poDataArray;
                trFinanceStatus = cached.trFinanceStatus;
                trDataArray = cached.trDataArray || [];
            } else {
                if (type === 'Material') {
                    // Fetch PRs
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
                        }
                    } catch (error) {
                        console.error('[MRFRecords] Error fetching PRs for', mrf.mrf_id, error);
                    }

                    // Fetch POs
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
                                    pr_id: poData.pr_id || null,
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
                        }
                    } catch (error) {
                        console.error('[MRFRecords] Error fetching POs for', mrf.mrf_id, error);
                    }
                }

                // Fetch TR data — runs for all types so mixed MRFs (generatePRandTR) show TR badges
                try {
                    const trsRef = collection(db, 'transport_requests');
                    const trQuery = query(trsRef, where('mrf_id', '==', mrf.mrf_id));
                    const trSnapshot = await getDocs(trQuery);
                    if (!trSnapshot.empty) {
                        trSnapshot.forEach((trDoc) => {
                            const trData = trDoc.data();
                            trDataArray.push({
                                docId: trDoc.id,
                                tr_id: trData.tr_id || '',
                                finance_status: trData.finance_status || 'Pending'
                            });
                            trFinanceStatus = trData.finance_status || 'Pending'; // keep for MRF Status column (Transport)
                        });
                    }
                } catch (error) {
                    console.error('[MRFRecords] Error fetching TR data for', mrf.mrf_id, error);
                }

                // Store in cache for subsequent sort/filter/page-change renders
                _subDataCache.set(mrf.id, { prDataArray, poDataArray, trFinanceStatus, trDataArray });
            }

            // Build HTML for PRs | POs | Procurement Status columns (runs for both cache hit and miss)
            if (type === 'Material') {
                // Index POs by their parent pr_id for per-PR pairing
                const posByPrId = {};
                poDataArray.forEach(po => {
                    const key = po.pr_id || '_unlinked';
                    if (!posByPrId[key]) posByPrId[key] = [];
                    posByPrId[key].push(po);
                });

                // Build aligned sub-rows for PRs | POs | Procurement Status columns
                if (prDataArray.length > 0) {
                    const rowStyle = (i) => i === 0
                        ? 'height: 30px; display: flex; align-items: center;'
                        : 'height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;';

                    prHtml = prDataArray.map((pr, i) => {
                        const statusClass = getStatusClass(pr.finance_status || 'Pending');
                        return `<div style="${rowStyle(i)}">
                            <a class="status-badge ${statusClass}"
                                style="font-size: 0.75rem; display: inline-block; cursor: pointer; text-decoration: none; white-space: nowrap;"
                                onclick="window['_mrfRecordsViewPR_${containerId}']('${pr.docId}')">
                                ${escapeHTML(pr.pr_id)}
                            </a>
                        </div>`;
                    }).join('');

                    poHtml = prDataArray.map((pr, i) => {
                        const matchedPOs = posByPrId[pr.pr_id] || [];
                        let content;
                        if (matchedPOs.length === 0) {
                            content = `<span style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">&#8212;</span>`;
                        } else {
                            content = matchedPOs.map(po => {
                                const isSubcon = po.is_subcon;
                                const subconBadge = isSubcon
                                    ? ' <span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600;">SUBCON</span>'
                                    : '';
                                return `<a style="color: #34a853; font-weight: 600; font-size: 0.8rem; cursor: pointer; text-decoration: none; white-space: nowrap;"
                                    onclick="window['_mrfRecordsViewPO_${containerId}']('${po.docId}')">${escapeHTML(po.po_id)}</a>${subconBadge}`;
                            }).join(' ');
                        }
                        return `<div style="${rowStyle(i)}">${content}</div>`;
                    }).join('');

                    procStatusHtml = prDataArray.map((pr, i) => {
                        const matchedPOs = posByPrId[pr.pr_id] || [];
                        let content;
                        if (matchedPOs.length === 0) {
                            content = `<span style="color: #94a3b8; font-size: 0.75rem;">&#8212;</span>`;
                        } else {
                            content = matchedPOs.map(po => {
                                const isSubcon = po.is_subcon;
                                const defaultStatus = isSubcon ? 'Pending' : 'Pending Procurement';
                                const currentStatus = po.procurement_status || defaultStatus;
                                const statusColor = statusColors[currentStatus] || { bg: '#f3f4f6', color: '#6b7280' };
                                return `<span style="background: ${statusColor.bg}; color: ${statusColor.color}; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 600; font-size: 0.7rem; white-space: nowrap;">${escapeHTML(currentStatus)}</span>`;
                            }).join(' ');
                        }
                        return `<div style="${rowStyle(i)}">${content}</div>`;
                    }).join('');

                // Append TR badges for mixed MRFs (generatePRandTR produces both PRs and a TR)
                if (trDataArray.length > 0) {
                    const trBadges = trDataArray.map(tr => {
                        const statusClass = getStatusClass(tr.finance_status || 'Pending');
                        return `<div style="height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;">
                            <span class="status-badge ${statusClass}"
                                style="font-size: 0.75rem; display: inline-block; white-space: nowrap;">
                                ${escapeHTML(tr.tr_id)}
                            </span>
                        </div>`;
                    }).join('');
                    prHtml = (prHtml !== '<span style="color: #999; font-size: 0.875rem;">-</span>' ? prHtml : '') + trBadges;
                }
            } else if (type === 'Transport' && trDataArray.length > 0) {
                prHtml = trDataArray.map((tr, i) => {
                    const statusClass = getStatusClass(tr.finance_status || 'Pending');
                    const rowStyle = i === 0
                        ? 'height: 30px; display: flex; align-items: center;'
                        : 'height: 30px; display: flex; align-items: center; border-top: 1px dashed #e5e7eb;';
                    return `<div style="${rowStyle}">
                        <span class="status-badge ${statusClass}"
                            style="font-size: 0.75rem; display: inline-block; white-space: nowrap;">
                            ${escapeHTML(tr.tr_id)}
                        </span>
                    </div>`;
                }).join('');
                // poHtml stays '-' for Transport (no POs linked to TRs)
                // procStatusHtml stays '-' for Transport (no Procurement Status for TRs)
            }

            // MRF Status column — computed badge for Material; finance_status badge for Transport
            let mrfStatusHtml = '<span style="color: #64748b; font-size: 0.75rem;">\u2014</span>';
            if (type === 'Material') {
                const statusObj = calculateMRFStatus(prDataArray, poDataArray);
                mrfStatusHtml = renderMRFStatusBadge(statusObj);
            } else if (type === 'Transport') {
                const financeStatus = trFinanceStatus || 'Pending';
                mrfStatusHtml = `<span class="status-badge ${getStatusClass(financeStatus)}">${escapeHTML(financeStatus)}</span>`;
            }

            // Display ID: always use the true MRF ID (TR codes appear in the PRs column as badges)
            const displayId = mrf.mrf_id;

            // Date Needed: prefer date_needed; fallback to formatted timestamp
            const dateNeeded = mrf.date_needed
                ? formatDate(mrf.date_needed)
                : (formatTimestamp(mrf.date_submitted || mrf.created_at) || 'N/A');

            return `
                <tr>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: center; vertical-align: middle;"><strong>${escapeHTML(displayId)}</strong></td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; text-align: left; vertical-align: middle;">${escapeHTML(getMRFLabel(mrf))}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle; font-size: 0.85rem;">${dateNeeded}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${prHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${poHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle;">${mrfStatusHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top;">${procStatusHtml}</td>
                    <td style="padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; text-align: center; vertical-align: middle;">
                        <button class="btn btn-sm btn-secondary"
                            onclick="window['_mrfRecordsTimeline_${containerId}']('${mrf.mrf_id}')"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem; white-space: nowrap;">
                            Timeline
                        </button>
                    </td>
                </tr>
            `;
        }));

        container.innerHTML = `
            <div class="table-scroll-container">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th onclick="window._myRequestsSort('mrf_id')" style="text-align: center; cursor: pointer; user-select: none;">MRF ID ${getSortIndicator('mrf_id')}</th>
                        <th style="text-align: left;">Project</th>
                        <th onclick="window._myRequestsSort('date_needed')" style="text-align: center; cursor: pointer; user-select: none;">Date Needed ${getSortIndicator('date_needed')}</th>
                        <th style="text-align: left;">PRs</th>
                        <th style="text-align: left;">POs</th>
                        <th onclick="window._myRequestsSort('status')" style="text-align: left; cursor: pointer; user-select: none;">MRF Status ${getSortIndicator('status')}</th>
                        <th onclick="window._myRequestsSort('procurement_status')" style="text-align: left; cursor: pointer; user-select: none;">Procurement Status ${getSortIndicator('procurement_status')}</th>
                        <th style="text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
            </div>
        `;

        renderPagination(totalPages);
    }

    // ------------------------------------------------
    // EXPORT
    // ------------------------------------------------

    /**
     * Export the current filteredRecords as a CSV file.
     * Uses filteredRecords (post-filter), not allRecords.
     */
    function exportCSV() {
        if (filteredRecords.length === 0) {
            showToast('No records to export', 'info');
            return;
        }
        const headers = ['MRF ID', 'Type', 'Project / Service', 'Requestor', 'Date Needed', 'Urgency', 'Status'];
        const rows = filteredRecords.map(mrf => {
            const type = mrf.request_type === 'service' ? 'Transport' : 'Material';
            const displayId = (type === 'Transport' && mrf.tr_id) ? mrf.tr_id : mrf.mrf_id;
            const label = mrf.project_name || mrf.service_name || '';
            const dateNeeded = mrf.date_needed
                ? formatDate(mrf.date_needed)
                : (formatTimestamp(mrf.date_submitted || mrf.created_at) || '');
            return [
                displayId,
                type,
                label,
                mrf.requestor_name || '',
                dateNeeded,
                mrf.urgency_level || '',
                mrf.status || ''
            ];
        });
        const date = new Date().toISOString().slice(0, 10);
        downloadCSV(headers, rows, `mrf-list-${date}.csv`);
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

    // Register instance-scoped modal window functions
    // Use containerId prefix to prevent collision if multiple controller instances exist
    window[`_mrfRecordsViewPR_${containerId}`] = viewPRDetailsLocal;
    window[`_mrfRecordsViewPO_${containerId}`] = viewPODetailsLocal;
    window[`_mrfRecordsTimeline_${containerId}`] = showTimelineLocal;

    // Register document generation functions on window — needed because modal footer
    // onclick attributes are HTML attribute strings (innerHTML), not module closures.
    window.generatePRDocumentLocal = generatePRDocumentLocal;
    window.generatePODocumentLocal = generatePODocumentLocal;

    // ------------------------------------------------
    // DESTROY
    // ------------------------------------------------

    /**
     * Clean up window functions registered by this controller instance.
     */
    function destroy() {
        delete window[`_mrfRecordsGoToPage_${containerId}`];
        delete window[`_mrfRecordsViewPR_${containerId}`];
        delete window[`_mrfRecordsViewPO_${containerId}`];
        delete window[`_mrfRecordsTimeline_${containerId}`];
        delete window.generatePRDocumentLocal;
        delete window.generatePODocumentLocal;
    }

    // ------------------------------------------------
    // PUBLIC API
    // ------------------------------------------------

    return { load, filter, sort, exportCSV, destroy };
}
