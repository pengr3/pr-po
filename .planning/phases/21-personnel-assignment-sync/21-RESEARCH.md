# Phase 21: Personnel-Assignment Sync - Research

**Researched:** 2026-02-09
**Domain:** Firestore data synchronization between projects and users collections
**Confidence:** HIGH

## Summary

Phase 21 implements automatic synchronization between project personnel assignments and user `assigned_project_codes`. Currently, these two systems are disconnected: admins assign personnel to projects via the pill selector (Phase 20), and separately manage `assigned_project_codes` via the Project Assignments admin panel (Phase 9). This creates a data consistency gap where operations users added as personnel cannot see their assigned projects unless an admin also manually updates their assignments.

The solution is straightforward client-side sync logic: when personnel are added/removed on a project, atomically update the affected user's `assigned_project_codes` array. Firestore provides `arrayUnion` and `arrayRemove` for exactly this purpose -- atomic array operations that avoid read-modify-write race conditions. These are NOT currently imported in `firebase.js` and must be added.

**Primary recommendation:** Add `arrayUnion`/`arrayRemove` to firebase.js imports, then create a `syncPersonnelAssignment()` utility function called from all four personnel mutation paths. Users with `all_projects: true` should be skipped entirely.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | v10.7.1 (CDN) | Database with atomic array operations | Already in use, `arrayUnion`/`arrayRemove` available but not imported |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `arrayUnion` | Atomically add element to array without read-modify-write | Adding project code to user's `assigned_project_codes` |
| `arrayRemove` | Atomically remove element from array without read-modify-write | Removing project code from user's `assigned_project_codes` |
| `writeBatch` | Batch multiple writes atomically | Already imported, use for multi-user updates |
| `getDoc` | Read single user document to check `all_projects` flag | Already imported, needed before sync |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `arrayUnion`/`arrayRemove` | Full array replacement (`updateDoc` with new array) | Full replacement requires read-modify-write (race conditions); `arrayUnion`/`arrayRemove` are atomic and idempotent |
| Client-side sync | Cloud Functions trigger | Cloud Functions would be more robust but this project has no backend; all logic is client-side |
| Per-operation sync | Batch reconciliation job | Real-time sync on personnel change is simpler and meets the requirement for "immediately see" |

**Installation:**
No npm install needed. Add import to existing CDN line in `app/firebase.js`:
```javascript
// Add to the existing import from firebase-firestore.js:
import { ..., arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
```

## Architecture Patterns

### Personnel Mutation Points (All Must Sync)

There are exactly **4 code paths** that mutate project personnel and need sync logic:

| # | File | Function | Action | Line |
|---|------|----------|--------|------|
| 1 | `app/views/projects.js` | `addProject()` | Create project with initial personnel | ~647 |
| 2 | `app/views/projects.js` | `saveEdit()` | Edit project personnel via list form | ~939 |
| 3 | `app/views/project-detail.js` | `selectDetailPersonnel()` | Add single personnel in detail view | ~493 |
| 4 | `app/views/project-detail.js` | `removeDetailPersonnel()` | Remove single personnel in detail view | ~531 |

### Recommended Architecture: Utility Function

```
app/utils.js (or new app/personnel-sync.js)
  syncPersonnelToAssignments(projectCode, previousUserIds, newUserIds)
    |
    +-- For added users: arrayUnion(projectCode) to assigned_project_codes
    +-- For removed users: arrayRemove(projectCode) from assigned_project_codes
    +-- Skip users with all_projects: true
    +-- Skip users with non-operations roles (optional optimization)
```

### Data Flow

```
Personnel Change (projects.js or project-detail.js)
  |
  v
Save personnel_user_ids + personnel_names to project doc  (existing)
  |
  v
Call syncPersonnelToAssignments(projectCode, oldUserIds, newUserIds)
  |
  v
Diff: addedUsers = newUserIds - oldUserIds
       removedUsers = oldUserIds - newUserIds
  |
  v
For each addedUser:
  getDoc(users/{userId}) --> check all_projects !== true
  updateDoc(users/{userId}, { assigned_project_codes: arrayUnion(projectCode) })
  |
For each removedUser:
  updateDoc(users/{userId}, { assigned_project_codes: arrayRemove(projectCode) })
```

### Key Design Decisions

1. **arrayUnion/arrayRemove over full array replacement**: These are idempotent and atomic. If sync runs twice, no harm done. No read-modify-write needed.

2. **Check `all_projects` before adding**: Users with `all_projects: true` have their `assigned_project_codes` cleared to `[]` (by project-assignments.js line 190). Adding codes to them would be misleading -- they already see everything. Skip them.

3. **Don't check `all_projects` before removing**: `arrayRemove` on a value that does not exist is a no-op. Safe to call without checking.

4. **Fire-and-forget with error handling**: The sync should not block the personnel save. If sync fails, the project personnel update already succeeded. Log the error and show a non-blocking warning.

5. **No need to check role before sync**: `arrayUnion` on a non-operations user is harmless -- their `assigned_project_codes` is simply ignored by `getAssignedProjectCodes()` (which returns `null` for non-operations users). However, checking `all_projects` is still important to avoid polluting their clean state.

### Handling the Edit Case (projects.js saveEdit)

The `saveEdit()` function in projects.js is the most complex case because it replaces the entire personnel list. The sync function needs to diff old vs new:

```javascript
// Before save:
const oldNormalized = normalizePersonnel(existingProject);
const oldUserIds = oldNormalized.userIds;

// After save succeeds:
const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);

// Sync:
await syncPersonnelToAssignments(projectCode, oldUserIds, newUserIds);
```

### Handling Project Deletion (Optional)

When a project is deleted, its personnel should arguably lose the project from `assigned_project_codes`. However:
- Deleted projects won't appear in project lists (query filters by existence)
- The stale code in `assigned_project_codes` is harmless (it just references a non-existent project)
- The admin can manually clean up via Project Assignments panel

**Recommendation**: Handle deletion cleanup for completeness, but at LOW priority. It is a nice-to-have, not a requirement per success criteria.

### Anti-Patterns to Avoid
- **Reading user doc just to update array**: Don't `getDoc` then `updateDoc` with modified array. Use `arrayUnion`/`arrayRemove` instead.
- **Blocking personnel save on sync failure**: The project update is the primary operation. Sync is secondary.
- **Syncing for users with `all_projects: true`**: These users already see everything. Adding codes creates inconsistency when they toggle off `all_projects`.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic array element add | Read array, push, write back | `arrayUnion` | Race condition free, idempotent |
| Atomic array element remove | Read array, filter, write back | `arrayRemove` | Race condition free, idempotent |
| Set difference (old vs new) | Complex nested loops | `Set` operations with `filter` | Clean, readable, O(n) |
| Batch user updates | Sequential awaits | `writeBatch` | Atomic, efficient for multiple users |

**Key insight:** `arrayUnion` and `arrayRemove` are the critical primitives. They solve the concurrent modification problem completely -- if two admins edit personnel simultaneously, both sync operations will correctly merge without overwriting each other's changes.

## Common Pitfalls

### Pitfall 1: Forgetting to Import arrayUnion/arrayRemove
**What goes wrong:** Code references `arrayUnion` but gets `undefined` at runtime. No build system to catch import errors.
**Why it happens:** `firebase.js` currently exports many Firestore functions but not `arrayUnion`/`arrayRemove`.
**How to avoid:** Add to both the import statement AND the export/re-export sections in `firebase.js`. Verify in browser console.
**Warning signs:** `TypeError: arrayUnion is not a function`

### Pitfall 2: Not Capturing Old Personnel Before Save
**What goes wrong:** Can't diff added vs removed users because old state was already overwritten.
**Why it happens:** The save operation updates the project doc, and the onSnapshot listener overwrites local state.
**How to avoid:** Capture `normalizePersonnel(existingProject).userIds` BEFORE calling `updateDoc`. In detail view, the old state is available from `detailSelectedPersonnel` before mutation.
**Warning signs:** All personnel get sync-added but removals never sync.

### Pitfall 3: Syncing Users with all_projects=true
**What goes wrong:** When admin later unchecks "All Projects" in assignment panel, user suddenly has stale `assigned_project_codes` that were added by sync.
**Why it happens:** When `all_projects=true`, the assignment panel clears `assigned_project_codes` to `[]`. If sync adds codes while `all_projects=true`, toggling off reveals a confusing state.
**How to avoid:** Check `all_projects` flag before adding. For removal, `arrayRemove` on non-existent value is no-op, so no check needed.
**Warning signs:** Users toggling off "All Projects" still see some projects.

### Pitfall 4: Blocking UI on Sync Errors
**What goes wrong:** User sees error toast and thinks personnel save failed, when only the sync failed.
**Why it happens:** Treating sync as same priority as personnel save.
**How to avoid:** Separate error handling. Personnel save shows success. Sync failure shows a distinct warning like "Personnel updated but assignment sync failed."
**Warning signs:** Error toast after successful personnel change.

### Pitfall 5: Missing Project Code on Legacy Projects
**What goes wrong:** `projectCode` is undefined for pre-Phase-2 projects that lack `project_code` field.
**Why it happens:** Very old projects created before Phase 2 may not have `project_code`.
**How to avoid:** Guard: `if (!projectCode) return;` at top of sync function.
**Warning signs:** Empty string or undefined in `assigned_project_codes` array.

### Pitfall 6: project-detail.js addProject Has No Previous State
**What goes wrong:** Trying to diff old vs new users during project creation when there is no old state.
**Why it happens:** `addProject()` creates a new project -- there are no previous personnel.
**How to avoid:** Pass empty array `[]` as `previousUserIds` for creation. All users are "added."
**Warning signs:** Sync not running for newly created projects.

## Code Examples

Verified patterns from official Firestore documentation:

### Adding arrayUnion/arrayRemove to firebase.js
```javascript
// In app/firebase.js, add to the existing import:
import {
    getFirestore,
    collection,
    // ... existing imports ...
    arrayUnion,    // NEW
    arrayRemove    // NEW
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Add to export block:
export {
    // ... existing exports ...
    arrayUnion,
    arrayRemove
};

// Add to window.firestore:
window.firestore = {
    // ... existing ...
    arrayUnion,
    arrayRemove
};
```

### Sync Utility Function
```javascript
// In app/utils.js (or inline in views)
import { db, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from './firebase.js';

/**
 * Sync personnel changes to user assigned_project_codes.
 * Call after successfully saving personnel_user_ids on a project.
 *
 * @param {string} projectCode - The project's project_code
 * @param {string[]} previousUserIds - User IDs before the change
 * @param {string[]} newUserIds - User IDs after the change
 */
export async function syncPersonnelToAssignments(projectCode, previousUserIds, newUserIds) {
    if (!projectCode) {
        console.warn('[PersonnelSync] No project code, skipping sync');
        return;
    }

    const oldSet = new Set(previousUserIds.filter(Boolean));
    const newSet = new Set(newUserIds.filter(Boolean));

    const addedUserIds = [...newSet].filter(id => !oldSet.has(id));
    const removedUserIds = [...oldSet].filter(id => !newSet.has(id));

    console.log('[PersonnelSync] Syncing for project:', projectCode,
        'Added:', addedUserIds.length, 'Removed:', removedUserIds.length);

    const errors = [];

    // Add project code to newly added users
    for (const userId of addedUserIds) {
        try {
            // Check if user has all_projects flag (skip if true)
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists() && userDoc.data().all_projects === true) {
                console.log('[PersonnelSync] Skipping user with all_projects:', userId);
                continue;
            }

            await updateDoc(doc(db, 'users', userId), {
                assigned_project_codes: arrayUnion(projectCode)
            });
            console.log('[PersonnelSync] Added', projectCode, 'to user', userId);
        } catch (error) {
            console.error('[PersonnelSync] Error adding assignment for user', userId, error);
            errors.push({ userId, action: 'add', error });
        }
    }

    // Remove project code from removed users
    for (const userId of removedUserIds) {
        try {
            await updateDoc(doc(db, 'users', userId), {
                assigned_project_codes: arrayRemove(projectCode)
            });
            console.log('[PersonnelSync] Removed', projectCode, 'from user', userId);
        } catch (error) {
            console.error('[PersonnelSync] Error removing assignment for user', userId, error);
            errors.push({ userId, action: 'remove', error });
        }
    }

    if (errors.length > 0) {
        console.warn('[PersonnelSync] Completed with', errors.length, 'errors');
    }

    return errors;
}
```

### Integration in project-detail.js (Add Personnel)
```javascript
async function selectDetailPersonnel(userId, userName) {
    if (!currentProject) return;
    if (detailSelectedPersonnel.some(u => u.id === userId)) return;

    // Capture old state BEFORE mutation
    const previousUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);

    detailSelectedPersonnel.push({ id: userId, name: userName });

    try {
        await updateDoc(doc(db, 'projects', currentProject.id), {
            personnel_user_ids: detailSelectedPersonnel.map(u => u.id).filter(Boolean),
            personnel_names: detailSelectedPersonnel.map(u => u.name),
            // ... legacy cleanup fields ...
        });

        // Sync assignment (fire-and-forget with logging)
        const newUserIds = detailSelectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(currentProject.project_code, previousUserIds, newUserIds)
            .catch(err => console.error('[ProjectDetail] Sync failed:', err));

    } catch (error) {
        // ... existing error handling ...
    }
}
```

### Integration in projects.js (Save Edit - Diff Required)
```javascript
async function saveEdit() {
    // ... existing validation ...

    // Capture old personnel BEFORE save
    const existingProject = allProjects.find(p => p.id === editingProject);
    const oldNormalized = normalizePersonnel(existingProject);
    const oldUserIds = oldNormalized.userIds;

    try {
        await updateDoc(projectRef, { /* ... existing fields ... */ });

        // Sync assignment changes
        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        const projectCode = existingProject.project_code;
        syncPersonnelToAssignments(projectCode, oldUserIds, newUserIds)
            .catch(err => console.error('[Projects] Sync failed:', err));

    } catch (error) {
        // ... existing error handling ...
    }
}
```

### Integration in projects.js (Add Project - No Previous State)
```javascript
async function addProject() {
    // ... existing validation and save ...

    try {
        await addDoc(collection(db, 'projects'), { /* ... */ });

        // Sync: all personnel are "added" (no previous state)
        const newUserIds = selectedPersonnel.map(u => u.id).filter(Boolean);
        syncPersonnelToAssignments(project_code, [], newUserIds)
            .catch(err => console.error('[Projects] Sync failed:', err));

    } catch (error) {
        // ...
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual assignment via admin panel only | Auto-sync from personnel changes | Phase 21 (new) | Operations users see projects immediately when added as personnel |
| Full array replacement for array updates | `arrayUnion`/`arrayRemove` atomic operations | Available since Firestore v7+ | No race conditions, idempotent |

**Deprecated/outdated:**
- None applicable. All existing patterns remain valid.

## Interaction with Existing Systems

### Project Assignments Admin Panel (Phase 9)
The admin panel in `project-assignments.js` directly writes to `assigned_project_codes` on user documents. This phase's sync does the same thing via `arrayUnion`/`arrayRemove`. These operations are compatible:
- Admin manually adds a project code via checkbox --> `arrayUnion` from sync is a no-op (already exists)
- Admin manually removes a project code --> sync won't re-add unless personnel is re-added to the project
- Both systems coexist without conflict because `arrayUnion`/`arrayRemove` are idempotent

### Auth Observer (Phase 7)
The auth observer in `auth.js` (line 301-311) detects changes to `assigned_project_codes` via `onSnapshot` and dispatches `assignmentsChanged` event. This means:
- When sync updates a user's `assigned_project_codes`, the auth observer fires
- If that user is currently logged in, they immediately see the change in their project list
- No additional work needed for real-time reactivity -- it already exists

### getAssignedProjectCodes (utils.js)
This function returns `null` for non-operations users and for users with `all_projects: true`. The sync adds codes to `assigned_project_codes` regardless of role (harmless for non-ops), but skips `all_projects: true` users (to avoid state pollution).

## Open Questions

Things that couldn't be fully resolved:

1. **Should deletion remove project codes from user assignments?**
   - What we know: Success criteria don't mention deletion. Stale codes are harmless.
   - What's unclear: Whether the user expects cleanup on delete.
   - Recommendation: Implement as a quick addition since we already have the utility function. Low effort, high polish.

2. **Should we batch all user updates in a single writeBatch?**
   - What we know: `writeBatch` is available and used elsewhere (role-config.js). Personnel changes typically affect 1-3 users.
   - What's unclear: Whether the overhead of batching is worth it for 1-3 operations.
   - Recommendation: Use individual `updateDoc` calls with `arrayUnion`/`arrayRemove`. Batching adds complexity for minimal benefit at this scale. Each operation is already atomic on its own.

3. **Should the sync utility live in utils.js or a new file?**
   - What we know: utils.js is already 496 lines. The sync function is ~40 lines.
   - What's unclear: Whether utils.js is getting too large.
   - Recommendation: Add to utils.js for consistency. One function plus imports is minimal growth. All other utilities are there.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `app/views/project-detail.js` - all personnel mutation paths identified
- Codebase analysis: `app/views/projects.js` - all personnel mutation paths identified
- Codebase analysis: `app/views/project-assignments.js` - existing assignment system understood
- Codebase analysis: `app/auth.js` - assignment change detection already implemented (lines 301-311)
- Codebase analysis: `app/firebase.js` - `arrayUnion`/`arrayRemove` NOT imported (confirmed)
- Codebase analysis: `app/utils.js` - `normalizePersonnel()` and `getAssignedProjectCodes()` documented

### Secondary (MEDIUM confidence)
- Firebase Firestore v10 modular SDK documentation - `arrayUnion`/`arrayRemove` are named exports from `firebase/firestore` module
- Firebase documentation: `arrayUnion` adds elements atomically, `arrayRemove` removes atomically, both idempotent

### Tertiary (LOW confidence)
- None. All findings verified against codebase or official Firebase SDK.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - using existing Firebase SDK, just importing two more functions
- Architecture: HIGH - all mutation points identified by reading actual code, sync pattern is well-understood
- Pitfalls: HIGH - based on actual code analysis and data model understanding
- Integration: HIGH - auth observer and assignment panel code read directly

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- Firebase v10.7.1 CDN is pinned, no version drift)
