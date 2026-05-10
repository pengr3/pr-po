/* ========================================
   ENGAGEMENT CREATE — Shared Helper
   ========================================
   Phase 88-01 D-04: extracted from `app/views/projects.js` (addProject ~line 681)
   and `app/views/services.js` (addService ~line 721) so a single Firestore writer
   covers all three create call sites — Projects tab, Services tab, and (Plan 88-02)
   the Proposals tab. Avoids the "two surfaces drift" failure mode noted in
   `feedback_orphan_ownership_parallel_plans.md` once a third caller appears.

   Caller responsibilities (UI-side, intentionally NOT moved into this module):
     - Permission/role guards
     - DOM reads + form-level validation (required fields, positive numbers,
       status enum, tranche sum=100, service_type enum, services-require-client)
     - showLoading / showToast / form toggle
     - Personnel-to-assignment sync via the optional `onAfterCreate` callback
       (project view uses `syncPersonnelToAssignments`; service view uses
       `syncServicePersonnelToAssignments`). Keeping this in the callback lets
       engagement-create.js avoid view-module imports.
   ======================================== */

import { db, collection, addDoc } from './firebase.js';
import { generateProjectCode, generateServiceCode } from './utils.js';
import { recordEditHistory } from './edit-history.js';

export async function createEngagement({
    type,
    clientId,
    clientCode,
    name,
    location,
    projectStatus,
    budget,
    contractCost,
    personnel,
    collectionTranches,
    onAfterCreate
}) {
    const isProject = type === 'project';
    const collectionName = isProject ? 'projects' : 'services';

    // Phase 78 D-04: project_code is null for clientless projects (deferred until client assignment).
    // Services require a client — caller must validate clientCode is present.
    const code = isProject
        ? (clientCode ? await generateProjectCode(clientCode) : null)
        : await generateServiceCode(clientCode);

    const personnel_user_ids = personnel.map(u => u.id).filter(Boolean);
    const personnel_names = personnel.map(u => u.name);
    const tranchesProvided = Array.isArray(collectionTranches) && collectionTranches.length > 0;

    // Phase 85 D-09: always write `collection_tranches` (use [] when caller provided none).
    const finalShape = isProject
        ? {
            project_code: code || null,
            project_name: name,
            client_id: clientId || null,
            client_code: clientCode || null,
            project_status: projectStatus,
            budget,
            contract_cost: contractCost,
            personnel_user_ids,
            personnel_names,
            location: location || null,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString(),
            collection_tranches: collectionTranches || []
        }
        : {
            service_code: code,
            service_name: name,
            service_type: type,
            client_id: clientId,
            client_code: clientCode,
            project_status: projectStatus,
            budget,
            contract_cost: contractCost,
            personnel_user_ids,
            personnel_names,
            location: location || null,
            personnel_user_id: null,
            personnel_name: null,
            personnel: null,
            active: true,
            created_at: new Date().toISOString(),
            collection_tranches: collectionTranches || []
        };

    const docRef = await addDoc(collection(db, collectionName), finalShape);

    // Verbatim change-list shape from the original call sites — preserves edit-history parity.
    const changes = isProject
        ? [
            { field: 'project_name', old_value: null, new_value: name },
            { field: 'client', old_value: null, new_value: clientCode || null },
            ...(location ? [{ field: 'location', old_value: null, new_value: location }] : []),
            { field: 'project_status', old_value: null, new_value: projectStatus },
            ...(budget ? [{ field: 'budget', old_value: null, new_value: budget }] : []),
            ...(contractCost ? [{ field: 'contract_cost', old_value: null, new_value: contractCost }] : []),
            ...(personnel.length > 0 ? [{ field: 'personnel', old_value: null, new_value: personnel_names.join(', ') }] : []),
            ...(tranchesProvided ? [{ field: 'collection_tranches', old_value: null, new_value: JSON.stringify(collectionTranches) }] : [])
        ]
        : [
            { field: 'service_name', old_value: null, new_value: name },
            { field: 'service_type', old_value: null, new_value: type },
            { field: 'client', old_value: null, new_value: clientCode },
            ...(location ? [{ field: 'location', old_value: null, new_value: location }] : []),
            { field: 'project_status', old_value: null, new_value: projectStatus },
            ...(budget ? [{ field: 'budget', old_value: null, new_value: budget }] : []),
            ...(contractCost ? [{ field: 'contract_cost', old_value: null, new_value: contractCost }] : []),
            ...(personnel.length > 0 ? [{ field: 'personnel', old_value: null, new_value: personnel_names.join(', ') }] : []),
            ...(tranchesProvided ? [{ field: 'collection_tranches', old_value: null, new_value: JSON.stringify(collectionTranches) }] : [])
        ];

    // Fire-and-forget: history failure must not block the create UX.
    recordEditHistory(docRef.id, 'create', changes, collectionName)
        .catch(err => console.error('[engagement-create] recordEditHistory failed:', err));

    if (typeof onAfterCreate === 'function') {
        try {
            await onAfterCreate({ docRef, type, finalShape, code });
        } catch (err) {
            // Side-effect failures (e.g., assignment sync) must not roll back a successful create.
            console.error('[engagement-create] onAfterCreate failed:', err);
        }
    }

    return { docRef, finalShape, code };
}
