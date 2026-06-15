/* ========================================
   SERVICE TASK ID GENERATOR (Phase 105 — service plan parity, D-03)

   Service-scoped sequential ID for service_tasks documents.
   Format: TASK-{SERVICE_CODE}-{n}
   n is monotonically increasing per service, no zero-padding.

   Examples:
     TASK-CLMC-SVC-001-1
     TASK-CLMC-SVC-001-2
     TASK-CLMC-SVC-001-12

   WHY per-service sequential scan?
     Phase 65.4 lesson learned: a shared year-counter (`PREFIX-YYYY-###`)
     caused collisions when two writes raced inside the same second.
     Per-service counters do not collide because each service_code has
     its own independent sequence space (D-03, mirrors D-19 for projects).

   WHY NOT extend app/task-id.js?
     D-01 zero-touch principle: the project task ID generator is not
     modified. A separate file gives each generator a clean,
     independently-typed signature with no coupling to the project side.

   PRECONDITION: serviceCode must be non-empty. Callers must BLOCK task
   creation in the UI BEFORE invoking this function if serviceCode is
   absent (mirrors Phase 86 D-19 clientless block pattern).
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';

/**
 * Generate a new task ID, scoped to a single service_code.
 * @param {string} serviceCode - Non-empty service_code, e.g. "CLMC-SVC-001"
 * @returns {Promise<string>} New unique task ID, e.g. "TASK-CLMC-SVC-001-3"
 * @throws {Error} If serviceCode is empty or not a string
 */
export async function generateServiceTaskId(serviceCode) {
    if (!serviceCode || typeof serviceCode !== 'string') {
        throw new Error('generateServiceTaskId: serviceCode must be a non-empty string');
    }

    const snap = await getDocs(
        query(collection(db, 'service_tasks'), where('service_code', '==', serviceCode))
    );

    let maxNum = 0;
    snap.forEach(docSnap => {
        const id = docSnap.data().task_id;
        if (id && typeof id === 'string') {
            const lastDash = id.lastIndexOf('-');
            if (lastDash >= 0) {
                const seqStr = id.slice(lastDash + 1);
                const num = parseInt(seqStr, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        }
    });

    return `TASK-${serviceCode}-${maxNum + 1}`;
}
