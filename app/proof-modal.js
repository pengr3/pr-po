/* ========================================
   PROOF OF PROCUREMENT - Shared Modal
   Used by procurement.js, finance.js, and any view needing proof attach/edit
   ======================================== */

import { db, doc, updateDoc, serverTimestamp } from './firebase.js';
import { showToast, escapeHTML } from './utils.js';
import { createModal, openModal, closeModal } from './components.js';

/**
 * Show proof modal for attaching/editing proof URL and remarks on a PO.
 * @param {string} poId - Firestore document ID of the target record
 * @param {string} currentUrl - Existing proof URL (empty string if none)
 * @param {boolean} isStatusChange - Whether modal was triggered by a status change
 * @param {Function|null} statusChangeCallback - Called after save/skip during status change flow
 * @param {string} currentRemarks - Existing remarks (empty string if none)
 * @param {Function|null} onSaved - Optional callback after successful save (for view-specific re-renders)
 * @param {string} collectionName - Firestore collection name (default: 'pos')
 */
export function showProofModal(poId, currentUrl = '', isStatusChange = false, statusChangeCallback = null, currentRemarks = '', onSaved = null, collectionName = 'pos') {
    const isEdit = !!currentUrl || !!currentRemarks;
    const modalTitle = isStatusChange ? 'Attach Proof of Procurement' : (isEdit ? 'Update Proof' : 'Attach Proof of Procurement');

    const infoText = isStatusChange
        ? `<p style="font-size: 0.75rem; color: #64748b; margin-top: 8px;">Status will be updated regardless of whether you attach proof.</p>`
        : '';

    const body = `
        <div style="padding: 0;">
            <label style="display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 4px;">Proof URL</label>
            <input type="url" id="proofUrlInput" value="${escapeHTML(currentUrl)}"
                placeholder="https://drive.google.com/..."
                style="width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.875rem; box-sizing: border-box;"
                onfocus="this.style.borderColor='#1a73e8'; this.style.boxShadow='0 0 0 3px rgba(26,115,232,0.15)';"
                onblur="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none';" />
            <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Paste a Google Drive, OneDrive, or SharePoint link (https:// required)</p>
            <p id="proofUrlError" style="font-size: 0.75rem; color: #ea4335; margin-top: 4px; display: none;">URL must start with https://</p>
            <div style="margin-top: 12px;">
                <label style="display: block; font-weight: 500; margin-bottom: 4px; font-size: 0.85rem; color: #5f6368;">Remarks <span style="font-weight: 400; color: #999;">(optional — for cases without a link)</span></label>
                <textarea id="proofRemarksInput" rows="2" style="width: 100%; padding: 8px 10px; border: 1px solid #dadce0; border-radius: 6px; font-size: 0.9rem; resize: vertical; font-family: inherit; box-sizing: border-box;">${escapeHTML(currentRemarks || '')}</textarea>
            </div>
            ${infoText}
        </div>
    `;

    const skipBtn = isStatusChange
        ? `<button class="btn btn-secondary" onclick="window._proofModalSkip()">Skip</button>`
        : `<button class="btn btn-secondary" onclick="closeModal('proofUrlModal')">Cancel</button>`;
    const saveLabel = isEdit ? 'Save Proof' : 'Attach Proof';
    const footer = `${skipBtn} <button class="btn btn-primary" onclick="window._proofModalSave()">${saveLabel}</button>`;

    // Remove existing modal if any
    document.getElementById('proofUrlModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', createModal({ id: 'proofUrlModal', title: modalTitle, body, footer }));
    openModal('proofUrlModal');

    window._proofModalSave = async () => {
        const input = document.getElementById('proofUrlInput');
        const remarksInput = document.getElementById('proofRemarksInput');
        const url = input?.value?.trim() || '';
        const remarks = remarksInput?.value?.trim() || '';
        const errorEl = document.getElementById('proofUrlError');

        // Allow save if EITHER url or remarks provided
        if (!url && !remarks) {
            if (errorEl) { errorEl.textContent = 'Provide a URL or remarks'; errorEl.style.display = 'block'; }
            showToast('Provide a URL or remarks', 'error');
            return;
        }

        // If URL is provided, it must be https
        if (url && !url.startsWith('https://')) {
            if (errorEl) { errorEl.textContent = 'URL must start with https://'; errorEl.style.display = 'block'; }
            if (input) { input.style.borderColor = '#ea4335'; input.style.background = '#fff5f5'; }
            showToast('URL must start with https://', 'error');
            return;
        }

        const isFirstAttach = !currentUrl && !currentRemarks;
        // Use explicit onSaved if provided, otherwise check for view-level callback
        const callback = onSaved || window._proofOnSaved || null;
        await saveProofUrl(poId, url, isFirstAttach, remarks, callback, collectionName);
        closeModal('proofUrlModal');
        if (statusChangeCallback) statusChangeCallback();
    };

    window._proofModalSkip = () => {
        closeModal('proofUrlModal');
        if (statusChangeCallback) statusChangeCallback();
    };
}

/**
 * Save Proof URL (and optional remarks) to Firestore
 * @param {string} docId - Firestore document ID of the target record
 * @param {string} url - Proof URL (must start with https://, or empty)
 * @param {boolean} isFirstAttach - Whether this is the first time attaching proof
 * @param {string} remarks - Optional remarks
 * @param {Function|null} onSaved - Optional callback after successful save
 * @param {string} collectionName - Firestore collection name (default: 'pos')
 */
export async function saveProofUrl(docId, url, isFirstAttach = true, remarks = '', onSaved = null, collectionName = 'pos') {
    try {
        const poRef = doc(db, collectionName, docId);
        const updateData = { proof_url: url, proof_remarks: remarks, updated_at: new Date().toISOString() };
        if (isFirstAttach) {
            updateData.proof_attached_at = serverTimestamp();
        } else {
            updateData.proof_updated_at = serverTimestamp();
        }
        await updateDoc(poRef, updateData);
        showToast(isFirstAttach ? 'Proof attached' : 'Proof updated', 'success');
        if (onSaved) onSaved();
    } catch (error) {
        console.error('[ProofModal] Error saving proof:', error);
        showToast('Failed to save proof. Please try again.', 'error');
    }
}

// Register on window so onclick handlers from any view can call it
window.showProofModal = showProofModal;
