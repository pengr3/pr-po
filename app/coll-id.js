/* ========================================
   COLLECTIBLE ID GENERATOR (Phase 85 — D-20)

   Project-scoped sequential ID for collectibles documents.
   Format: COLL-{PROJECT_CODE}-{n}  for project-side collectibles
           COLL-{SERVICE_CODE}-{n}  for service-side collectibles
   n is monotonically increasing per scope, no zero-padding.

   Examples:
     COLL-CLMC-ACME-001-1
     COLL-CLMC-ACME-001-2
     COLL-SVC-CLMC-001-1

   WHY NOT the year-counter helper from utils.js?
     Phase 65.4 lesson learned: the shared year-counter (`PREFIX-YYYY-###`)
     caused collisions when two procurement actions raced inside the same
     second of the same year. Per-scope counters do not collide because each
     project_code/service_code has its own independent sequence space (D-20).

   PRECONDITION: scopeCode must be non-empty. For Phase 78 clientless projects
   (no project_code yet), the caller must BLOCK collectible creation in the UI
   BEFORE invoking this function — see Plan 05 D-20 clientless block.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';

/**
 * Generate a new collectible ID, scoped to a single project_code or service_code.
 * @param {string} scopeCode - The project_code or service_code (must be non-empty)
 * @param {'projects'|'services'} dept - Which scope field to query against
 * @returns {Promise<string>} New unique collectible ID, e.g. "COLL-CLMC-ACME-001-3"
 * @throws {Error} If scopeCode is empty or dept is invalid
 */
export async function generateCollectibleId(scopeCode, dept) {
    if (!scopeCode || typeof scopeCode !== 'string') {
        throw new Error('generateCollectibleId: scopeCode must be a non-empty string');
    }
    if (dept !== 'projects' && dept !== 'services') {
        throw new Error(`generateCollectibleId: dept must be 'projects' or 'services' (got: ${dept})`);
    }

    const scopeField = dept === 'projects' ? 'project_code' : 'service_code';
    const snap = await getDocs(
        query(collection(db, 'collectibles'), where(scopeField, '==', scopeCode))
    );

    let maxNum = 0;
    snap.forEach(docSnap => {
        const id = docSnap.data().coll_id;
        if (id && typeof id === 'string') {
            const lastDash = id.lastIndexOf('-');
            if (lastDash >= 0) {
                const seqStr = id.slice(lastDash + 1);
                const num = parseInt(seqStr, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });

    return `COLL-${scopeCode}-${maxNum + 1}`;
}
