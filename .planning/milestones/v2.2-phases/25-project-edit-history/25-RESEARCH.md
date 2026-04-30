# Phase 25: Project Edit History - Research

**Researched:** 2026-02-10
**Domain:** Firestore audit trails, edit history tracking, timeline UI
**Confidence:** HIGH

## Summary

Phase 25 adds an edit history feature to the Project Detail page, showing a complete audit trail of all changes made to a project. The technical challenge is twofold: (1) intercepting all mutation points where project data changes to record what changed, and (2) displaying that history in a modal using existing timeline patterns.

Research into the codebase reveals:
- There are **7 distinct mutation points** across 3 files (`project-detail.js`, `projects.js`, `project-assignments.js`) that modify project documents
- The codebase already has a `createTimeline()` component in `components.js` with full CSS styling in `views.css` -- this is the established pattern for audit trail visualization (used in Phase 13 procurement timeline)
- Firestore subcollections (`projects/{projectId}/edit_history`) are the correct storage pattern -- the CDN already exports all needed Firestore functions (`addDoc`, `collection`, `doc`, `orderBy`, `getDocs`)
- `window.getCurrentUser()` is available globally and returns `{ uid, full_name, email, role, ... }` -- perfect for attributing changes
- No security rules exist yet for subcollections under `projects` -- a wildcard rule will be needed

**Primary recommendation:** Store edit history as a Firestore subcollection (`projects/{projectId}/edit_history`) with one document per change event. Capture changes by diffing old vs new values at each mutation point before the `updateDoc` call. Display using `createTimeline()` in a modal triggered by a button in the Project Information card header.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firestore Subcollections | v10.7.1 (CDN) | Store edit history per project | Native Firestore pattern, queried independently of parent doc, auto-ordered |
| createTimeline() | current (components.js) | Timeline visualization | Already used in Phase 13 procurement timeline, DRY principle |
| createModal/openModal/closeModal | current (components.js) | Modal dialog | Established codebase pattern, consistent UX |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| formatDate() | current (utils.js) | Date formatting | Display timestamps in history entries |
| getCurrentUser() | current (auth.js via window) | User attribution | Identify who made each change |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Subcollection | Array field on project doc | Array has 1MB doc limit, hard to query/paginate, grows unbounded |
| Subcollection | Separate top-level `project_history` collection | Works but loses Firestore's natural parent-child hierarchy, requires manual project_id field |
| Per-field change recording | Snapshot-based (store full doc before/after) | Wasteful storage, harder to display "what changed" |

## Architecture Patterns

### Recommended Storage: Subcollection

```
projects/{projectId}/
    edit_history/{autoId}    # One doc per change event
```

Each `edit_history` document:
```javascript
{
    timestamp: '2026-02-10T14:30:00.000Z',  // ISO string (consistent with project.updated_at)
    user_id: 'abc123',                       // From getCurrentUser().uid
    user_name: 'John Doe',                   // From getCurrentUser().full_name
    action: 'update',                        // 'create' | 'update' | 'toggle_active' | 'personnel_add' | 'personnel_remove'
    changes: [                               // Array of field changes
        {
            field: 'project_name',
            old_value: 'Old Name',
            new_value: 'New Name'
        },
        {
            field: 'budget',
            old_value: 50000,
            new_value: 75000
        }
    ]
}
```

### Pattern 1: Diff-Before-Save for Edit History

**What:** Before each `updateDoc` call, compare old values (from `currentProject` or `allProjects`) against new values. Only record fields that actually changed.

**When to use:** Every mutation point in project-detail.js and projects.js.

**Example:**
```javascript
// In saveField() - project-detail.js
async function saveField(fieldName, newValue) {
    // ... existing validation ...

    // Diff: check if value actually changed
    const oldValue = currentProject[fieldName];
    if (oldValue === valueToSave) {
        console.log('[ProjectDetail] No change for', fieldName);
        return true; // No-op, no history entry needed
    }

    try {
        const projectRef = doc(db, 'projects', currentProject.id);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });

        // Record edit history
        await recordEditHistory(currentProject.id, 'update', [
            { field: fieldName, old_value: oldValue ?? null, new_value: valueToSave }
        ]);

        console.log('[ProjectDetail] Saved', fieldName);
        return true;
    } catch (error) { ... }
}
```

### Pattern 2: Helper Function for Recording History

**What:** A shared `recordEditHistory()` function that writes to the subcollection, called from each mutation point.

**Example:**
```javascript
async function recordEditHistory(projectDocId, action, changes) {
    try {
        const user = window.getCurrentUser?.();
        const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
        await addDoc(historyRef, {
            timestamp: new Date().toISOString(),
            user_id: user?.uid || 'unknown',
            user_name: user?.full_name || 'Unknown User',
            action: action,
            changes: changes
        });
        console.log('[EditHistory] Recorded:', action, changes.length, 'change(s)');
    } catch (error) {
        // Fire-and-forget: log error but don't block the save
        console.error('[EditHistory] Failed to record history:', error);
    }
}
```

### Pattern 3: Timeline Display in Modal

**What:** Fetch edit_history subcollection, map to createTimeline() format, display in modal.

**Example:**
```javascript
async function showEditHistory() {
    showLoading(true);
    try {
        const historyRef = collection(db, 'projects', currentProject.id, 'edit_history');
        const q = query(historyRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        const timelineItems = [];
        snapshot.forEach(doc => {
            const entry = doc.data();
            const changesDesc = entry.changes.map(c =>
                `${formatFieldName(c.field)}: ${formatValue(c.old_value)} -> ${formatValue(c.new_value)}`
            ).join('\n');

            timelineItems.push({
                title: `${getActionLabel(entry.action)} by ${entry.user_name}`,
                date: formatDate(entry.timestamp),
                description: changesDesc,
                status: 'completed'
            });
        });

        // Render using existing createTimeline component
        const timelineHtml = createTimeline(timelineItems);
        // ... display in modal ...
    } finally {
        showLoading(false);
    }
}
```

### Pattern 4: Button Placement in Project Information Card Header

**What:** Add "Edit History" button alongside the header area of the Project Information card.

The current Project Information card header (line 286-289 of project-detail.js) has:
```html
<div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 0.75rem; margin-bottom: 1rem;">
    <h3 style="...">Project Information</h3>
    <p style="...">Created: ... | Updated: ...</p>
</div>
```

The button should be flex-aligned to the right of the header, similar to how the expense modal has a button alongside its section.

### Anti-Patterns to Avoid
- **Storing history as array field on project document:** Grows unbounded, hits 1MB doc size limit, no independent querying
- **Blocking saves on history write failure:** History is non-critical -- use fire-and-forget pattern (`.catch()` for error logging only)
- **Recording no-change saves:** If user blurs a field without changing it, `saveField()` fires but no actual change occurred -- skip history recording
- **Duplicating the recordEditHistory function:** Put it in one place (project-detail.js module scope) and export if needed, or use a shared utility

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timeline visualization | Custom HTML/CSS timeline | `createTimeline()` from components.js | Already built, styled, tested in Phase 13 |
| Modal dialog | New modal HTML | `createModal()` / manual `.modal.active` pattern | Consistent with expense modal, PR modal patterns |
| Date formatting | Custom date formatting | `formatDate()` from utils.js | Already handles ISO strings, locale formatting |
| User attribution | Custom user lookup | `window.getCurrentUser()` | Already returns `{ uid, full_name, email, role }` |
| Subcollection access | Custom path building | `collection(db, 'projects', projectId, 'edit_history')` | Native Firestore subcollection API |

**Key insight:** The only truly new code needed is (1) the diff logic at each mutation point, (2) the `recordEditHistory()` helper, and (3) the `showEditHistory()` modal function. Everything else reuses existing infrastructure.

## Common Pitfalls

### Pitfall 1: Missing Mutation Points
**What goes wrong:** History only captures some changes because not all mutation paths are instrumented.

**Why it happens:** Projects are modified from 3 different files with 7 distinct mutation paths. It's easy to miss one.

**Complete list of mutation points (verified by grep):**

| File | Function | What Changes | Line |
|------|----------|-------------|------|
| project-detail.js | `saveField()` | project_name, budget, contract_cost, internal_status, project_status | 561 |
| project-detail.js | `toggleActive()` | active (true/false) | 664 |
| project-detail.js | `selectDetailPersonnel()` | personnel_user_ids, personnel_names | 484 |
| project-detail.js | `removeDetailPersonnel()` | personnel_user_ids, personnel_names | 525 |
| projects.js | `addProject()` | Creates new project (all fields) | 582 |
| projects.js | `saveEdit()` | project_name, client, statuses, budget, contract_cost, personnel | 934 |
| projects.js | `toggleProjectActive()` | active (true/false) | 1056 |
| project-assignments.js | `syncAssignments()` | personnel_user_ids, personnel_names (via arrayUnion/Remove) | 250+ |

**How to avoid:** Instrument each one. For `project-assignments.js`, consider whether those admin-initiated personnel changes should also be tracked (they modify the same fields as project-detail.js personnel changes).

**Recommendation for Phase 25:** Focus on the **project-detail.js** mutation points first (success criteria says "Edit History button on Project Detail page"). The projects.js creation is worth capturing as the initial "created" event. The projects.js `saveEdit()` and `toggleProjectActive()` are secondary. The project-assignments.js changes are out of scope unless explicitly requested.

### Pitfall 2: Personnel Change Diffing is Complex
**What goes wrong:** Personnel changes use parallel arrays (`personnel_user_ids[]` + `personnel_names[]`), making diffs non-trivial.

**Why it happens:** Arrays don't have simple "old value -> new value" semantics. A user being added or removed is more like a set operation.

**How to avoid:** Use specialized action types: `personnel_add` and `personnel_remove` instead of generic field diffs. Record the added/removed person's name directly.

**Example:**
```javascript
// In selectDetailPersonnel():
await recordEditHistory(currentProject.id, 'personnel_add', [
    { field: 'personnel', old_value: null, new_value: userName }
]);

// In removeDetailPersonnel():
await recordEditHistory(currentProject.id, 'personnel_remove', [
    { field: 'personnel', old_value: userName, new_value: null }
]);
```

### Pitfall 3: Firestore Security Rules for Subcollections
**What goes wrong:** Edit history writes fail with permission denied because security rules don't cover subcollections.

**Why it happens:** Current `firestore.rules` has `match /projects/{projectId}` but no wildcard for subcollections. Firestore rules do NOT cascade to subcollections by default.

**How to avoid:** Add a subcollection rule:
```
match /projects/{projectId}/edit_history/{entryId} {
    // Read: all active users (same as project read)
    allow read: if isActiveUser();

    // Create: same roles that can update projects
    allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);

    // No update/delete: history is append-only
    allow update: if false;
    allow delete: if false;
}
```

### Pitfall 4: No-Op Saves Creating Spurious History
**What goes wrong:** User clicks on budget field, doesn't change anything, blurs -- `saveField()` fires and records a "change" with identical old/new values.

**Why it happens:** `onblur` fires regardless of whether the value changed.

**How to avoid:** Always diff before recording:
```javascript
// Skip if no actual change
const oldValue = currentProject[fieldName];
if (oldValue === valueToSave) return true;
```

Note: `saveField()` in project-detail.js does NOT currently check for no-ops. This diff check is new logic that both improves history accuracy and avoids unnecessary Firestore writes for the history subcollection.

### Pitfall 5: Blocking the Primary Save
**What goes wrong:** History write fails (network error, permission issue) and the primary save also fails or appears to fail.

**Why it happens:** Awaiting the history write as part of the save flow.

**How to avoid:** Fire-and-forget pattern -- record history after the primary save succeeds, catch errors silently:
```javascript
// Primary save
await updateDoc(projectRef, { ... });

// History recording (fire-and-forget)
recordEditHistory(currentProject.id, 'update', changes)
    .catch(err => console.error('[EditHistory] Failed:', err));
```

### Pitfall 6: createTimeline Description Doesn't Support Multi-Line
**What goes wrong:** When a single save changes multiple fields, the description looks cramped or truncated.

**Why it happens:** `createTimeline()` renders description as a single `<div>` with `font-size: 0.875rem`. Long text wraps but HTML newlines are ignored.

**How to avoid:** Use `<br>` tags in the description string, or render changes as a small list within the description:
```javascript
const changesDesc = entry.changes.map(c =>
    `<strong>${formatFieldName(c.field)}</strong>: ${formatValue(c.old_value)} &rarr; ${formatValue(c.new_value)}`
).join('<br>');
```

The `.timeline-item-description` div will render HTML because it's set via `innerHTML` in `createTimeline()`.

## Code Examples

### Subcollection Write (Verified Firestore API)
```javascript
// Source: Firebase Firestore v10.7.1 CDN - collection/addDoc for subcollections
import { db, collection, addDoc, getDocs, query, orderBy, doc } from '../firebase.js';

// Write to subcollection
const historyRef = collection(db, 'projects', projectDocId, 'edit_history');
await addDoc(historyRef, {
    timestamp: new Date().toISOString(),
    user_id: 'abc123',
    user_name: 'John Doe',
    action: 'update',
    changes: [{ field: 'budget', old_value: 50000, new_value: 75000 }]
});

// Read from subcollection (ordered by timestamp descending)
const q = query(
    collection(db, 'projects', projectDocId, 'edit_history'),
    orderBy('timestamp', 'desc')
);
const snapshot = await getDocs(q);
snapshot.forEach(doc => {
    console.log(doc.data());
});
```

### Modal Pattern (Following expense-modal.js)
```javascript
// Source: Codebase pattern from expense-modal.js
// Creates modal dynamically and injects into DOM

function showEditHistoryModal(timelineHtml, projectCode) {
    // Remove existing modal if any
    const existing = document.getElementById('editHistoryModal');
    if (existing) existing.remove();

    const modalHTML = `
        <div id="editHistoryModal" class="modal active">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3>Edit History: ${projectCode}</h3>
                    <button class="modal-close" onclick="window.closeEditHistoryModal()">&times;</button>
                </div>
                <div class="modal-body">
                    ${timelineHtml}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.closeEditHistoryModal = function() {
    const modal = document.getElementById('editHistoryModal');
    if (modal) modal.remove();
};
```

### getCurrentUser() API (Verified from auth.js)
```javascript
// Source: app/auth.js line 179-181
// Available as window.getCurrentUser()

const user = window.getCurrentUser();
// Returns: {
//     uid: 'firebase-auth-uid',
//     id: 'firestore-doc-id',
//     email: 'user@example.com',
//     full_name: 'John Doe',
//     role: 'super_admin' | 'operations_admin' | 'operations_user' | 'finance' | 'procurement',
//     status: 'active',
//     assigned_project_codes: [...],
//     all_projects: true/false,
//     ...
// }
```

### Field Name Formatting Helper
```javascript
// Human-readable field names for display
function formatFieldName(fieldName) {
    const fieldLabels = {
        'project_name': 'Project Name',
        'budget': 'Budget',
        'contract_cost': 'Contract Cost',
        'internal_status': 'Internal Status',
        'project_status': 'Project Status',
        'active': 'Active Status',
        'personnel': 'Personnel',
        'client_code': 'Client',
        'client_id': 'Client'
    };
    return fieldLabels[fieldName] || fieldName;
}

// Format values for display (handles null, numbers, booleans)
function formatValue(value) {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
    if (typeof value === 'number') return formatCurrency(value);
    return String(value);
}
```

## All Mutation Points - Detailed Catalog

### project-detail.js (Primary -- all in scope)

1. **`saveField(fieldName, newValue)`** (line 561)
   - Fields: project_name, budget, contract_cost, internal_status, project_status
   - Trigger: `onblur` (inputs) or `onchange` (selects)
   - Has `currentProject` in scope for diffing old values
   - Currently does NOT check for no-ops (new value may equal old value)

2. **`toggleActive(newValue)`** (line 664)
   - Field: active (boolean)
   - Trigger: Click on Active/Inactive badge
   - Has `currentProject` in scope for old value
   - Confirmation dialog only for deactivation

3. **`selectDetailPersonnel(userId, userName)`** (line 484)
   - Fields: personnel_user_ids, personnel_names
   - Trigger: Selecting user from personnel dropdown
   - Has `detailSelectedPersonnel` for old state (but it's already modified by the time save fires -- need to capture before push)

4. **`removeDetailPersonnel(userId, userName)`** (line 525)
   - Fields: personnel_user_ids, personnel_names
   - Trigger: Click remove button on personnel pill
   - Has `previousState` capture (line 528) -- good pattern to follow

### projects.js (Secondary -- creation event worth capturing)

5. **`addProject()`** (line 582)
   - Creates new project with all fields
   - Action: 'create' (no old values, all new)
   - Has all field values from form DOM

6. **`saveEdit()`** (line 934)
   - Updates: project_name, client, statuses, budget, contract_cost, personnel
   - Has `existingProject` from `allProjects.find()` for diffing
   - Bulk update of many fields

7. **`toggleProjectActive(projectId, currentStatus)`** (line 1056)
   - Field: active (boolean)
   - Has `currentStatus` parameter for old value

### project-assignments.js (Out of scope for Phase 25)

8. **`syncAssignments()` add/remove** (line 250+)
   - Modifies personnel_user_ids and personnel_names via arrayUnion/arrayRemove
   - Admin-only view, different context

## Security Rules Needed

Current `firestore.rules` line 114-126 covers `match /projects/{projectId}` but has NO subcollection rules. Firestore does NOT cascade rules to subcollections.

**Required addition:**
```javascript
// Inside match /projects/{projectId} block:
match /edit_history/{entryId} {
    // Read: all active users (consistent with project read)
    allow read: if isActiveUser();

    // Create: roles that can update projects
    allow create: if hasRole(['super_admin', 'operations_admin', 'finance']);

    // Append-only: no updates or deletes
    allow update: if false;
    allow delete: if false;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Array field for history | Subcollection per parent doc | Best practice since Firestore launch | Unlimited entries, independent querying, no doc size limit |
| Snapshot-based audit (full doc) | Field-level diff recording | Modern audit trail pattern | Smaller storage, clearer "what changed" display |
| Custom timeline HTML | Reusable createTimeline() component | Phase 13 (2026-02-05) | DRY, consistent visual presentation |

**Not needed for this phase:**
- Cloud Functions (could auto-record history server-side, but adds infrastructure complexity to a static SPA)
- Firestore Triggers (same -- requires backend deployment, overkill for client-side edit tracking)

## Open Questions

1. **Should project-assignments.js changes be tracked?**
   - What we know: Admin panel modifies personnel_user_ids/personnel_names on project docs
   - What's unclear: Whether this admin action should appear in project edit history
   - Recommendation: Defer to a later phase. Phase 25 success criteria says "all edit paths (project-detail.js inline editing, projects.js creation)" -- project-assignments.js is not mentioned

2. **Should we show history for changes made before Phase 25?**
   - What we know: No history data exists for existing projects. The `created_at` and `updated_at` fields exist on project documents.
   - What's unclear: Whether to seed an initial "Project Created" entry from `created_at`
   - Recommendation: Show "No edit history recorded yet" for projects with empty history. The first recorded event will be the next edit after Phase 25 ships.

3. **Pagination for projects with many edits?**
   - What we know: Most projects will accumulate edits slowly (5-20 edits over weeks/months)
   - What's unclear: Whether any project will accumulate hundreds of edits
   - Recommendation: Start without pagination. Use `orderBy('timestamp', 'desc')` with a reasonable limit (e.g., 50 entries). Add pagination later if needed.

## Sources

### Primary (HIGH confidence)
- **Codebase: `app/views/project-detail.js`** -- All 4 mutation points identified and verified (saveField, toggleActive, selectDetailPersonnel, removeDetailPersonnel)
- **Codebase: `app/views/projects.js`** -- 3 mutation points identified (addProject, saveEdit, toggleProjectActive)
- **Codebase: `app/views/project-assignments.js`** -- Personnel modification via arrayUnion/arrayRemove identified
- **Codebase: `app/components.js`** -- `createTimeline()` API verified (accepts items array with title, date, description, status)
- **Codebase: `styles/views.css` lines 576-631** -- Timeline CSS verified (.timeline, .timeline-item, .timeline-item-title, etc.)
- **Codebase: `app/auth.js` lines 179-181** -- `getCurrentUser()` returns full user object with uid, full_name, role
- **Codebase: `firestore.rules`** -- Current rules verified, subcollection rule gap identified
- **Codebase: `app/firebase.js`** -- All needed Firestore imports available (addDoc, collection, doc, getDocs, query, orderBy)
- **Codebase: `app/expense-modal.js`** -- Dynamic modal injection pattern verified (insertAdjacentHTML + remove())

### Secondary (MEDIUM confidence)
- **Phase 13 Research** -- Timeline and audit trail patterns documented and used in production
- **Phase 13-03 Plan** -- `createTimeline()` usage in procurement timeline verified as working pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All components exist in codebase, no new dependencies
- Architecture: HIGH -- Subcollection pattern is standard Firestore, all API methods available in CDN
- Mutation points: HIGH -- Exhaustively identified via grep for `updateDoc(doc(db, 'projects'` and `addDoc(collection(db, 'projects'`
- Pitfalls: HIGH -- Based on direct codebase analysis (no-op saves, missing rules, array diffs)
- Timeline display: HIGH -- Verified createTimeline() component and CSS from Phase 13

**Research date:** 2026-02-10
**Valid until:** 90 days (all findings based on stable codebase patterns, no external dependency changes)
