/* ========================================
   PROPOSAL ID GENERATOR — Phase 93.2 (rewrite)
   Format: PROPOSAL-{CLIENTCODE}-{YYYY}-{NNN}
   Sequence is per-client per-year — each client gets its own counter.
   CLIENTCODE is client.client_code from the clients collection (uppercase).
   Fallback when no client is assigned: PROPOSAL-NOCLIENT-YYYY-NNN.
   Race condition (simultaneous addDoc): accepted — same disposition as
   MRF/PR/PO/RFP ID generators in this codebase.
   ======================================== */
import { db, collection, getDocs, query, where } from './firebase.js';

/**
 * Generate the next sequential proposal ID for the given client and current year.
 * @param {string|null} clientCode — client_code field from the clients collection.
 *   Pass null/undefined/empty string to use the NOCLIENT fallback.
 * @returns {Promise<string>} e.g. 'PROPOSAL-SPI-2026-001', 'PROPOSAL-NOCLIENT-2026-003'
 * @throws {Error} If the Firestore read fails (caller must handle).
 */
export async function generateProposalId(clientCode) {
    const year = new Date().getFullYear();
    const code = (clientCode || '').toString().trim().toUpperCase() || 'NOCLIENT';
    const prefix = `PROPOSAL-${code}-${year}-`;

    const q = query(
        collection(db, 'proposals'),
        where('proposal_id', '>=', prefix),
        where('proposal_id', '<', prefix + '￿')
    );
    const snap = await getDocs(q);

    let maxNum = 0;
    snap.forEach(d => {
        const pid = d.data().proposal_id || '';
        if (pid.startsWith(prefix)) {
            const num = parseInt(pid.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });

    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}
