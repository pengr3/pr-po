/* ========================================
   PROPOSAL ID GENERATOR — Phase 87 (PROP-01)
   Thin wrapper around generateSequentialId for the proposals collection.
   Returns IDs in the form 'PROP-YYYY-NNN' (zero-padded 3-digit sequence).
   Race condition (simultaneous addDoc): accepted at current scale — same
   disposition as MRF/PR/PO/RFP/COLL ID generators in this codebase.
   ======================================== */
import { generateSequentialId } from './utils.js';

/**
 * Generate the next sequential proposal ID for the current year.
 * Reads `proposal_id` field from each existing proposals doc, finds max, returns max+1.
 * @returns {Promise<string>} e.g. 'PROP-2026-001', 'PROP-2026-002', ...
 * @throws {Error} If the underlying getDocs call fails (rare — caller must handle).
 */
export async function generateProposalId() {
    return generateSequentialId('proposals', 'PROP');
}
