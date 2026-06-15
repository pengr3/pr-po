/* ========================================
   TASK ID GENERATOR (Phase 86 — D-19)

   Project-scoped sequential ID for project_tasks documents.
   Format: TASK-{PROJECT_CODE}-{n}
   n is monotonically increasing per project, no zero-padding.

   Examples:
     TASK-CLMC-ACME-001-1
     TASK-CLMC-ACME-001-2
     TASK-CLMC-ACME-001-12

   WHY NOT generateSequentialId() from utils.js?
     Phase 65.4 lesson learned: shared year-counter (`PREFIX-YYYY-###`)
     caused collisions when two writes raced inside the same second.
     Per-project counters do not collide because each project_code has
     its own independent sequence space (D-19).

   PRECONDITION: projectCode must be non-empty. For Phase 78 clientless
   projects (no project_code yet), the caller must BLOCK task creation
   in the UI BEFORE invoking this function — see Phase 86 D-19
   clientless block message.

   Why projects-only (no dept switch like coll-id.js)?
     Phase 86 D-04 — services-side parallel surface is intentionally
     out of scope; captured in Deferred Ideas.
   ======================================== */

import { db, collection, query, where, getDocs } from './firebase.js';

/**
 * Generate a new task ID, scoped to a single project_code.
 * @param {string} projectCode - Non-empty project_code, e.g. "CLMC-ACME-001"
 * @returns {Promise<string>} New unique task ID, e.g. "TASK-CLMC-ACME-001-3"
 * @throws {Error} If projectCode is empty
 */
export async function generateTaskId(projectCode) {
    if (!projectCode || typeof projectCode !== 'string') {
        throw new Error('generateTaskId: projectCode must be a non-empty string');
    }

    const snap = await getDocs(
        query(collection(db, 'project_tasks'), where('project_code', '==', projectCode))
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

    return `TASK-${projectCode}-${maxNum + 1}`;
}
