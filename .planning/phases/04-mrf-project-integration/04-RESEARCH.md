# Phase 04: MRF-Project Integration - Research

**Researched:** 2026-01-28
**Domain:** Firebase Firestore integration, dropdown UI patterns, data migration
**Confidence:** HIGH

## Summary

This phase integrates the existing Projects system with MRF submission by adding project selection to the MRF form and updating MRF data display to show project information. The codebase already has established patterns for this type of integration: real-time Firestore listeners, dropdown population with filtered queries, and sequential data storage.

The standard approach is to use Firebase Firestore queries with `where('status', '==', 'active')` to filter active projects, populate dropdowns with formatted display text (project_code + project_name), store only the project_code as the reference field, and use onSnapshot listeners for real-time updates. The existing codebase in `mrf-form.js` already implements project dropdown loading but uses `project_name` as both display and storage - this needs to change to use `project_code` as the storage value while displaying the combined format.

Key implementation notes: The codebase already has `getActiveProjects()` utility in `utils.js`, existing dropdown population patterns in `mrf-form.js` lines 226-266, and established listener cleanup patterns in all view modules. The main changes involve updating dropdown formatting, changing stored field from `project_name` to `project_code`, and updating display logic across procurement and finance views.

**Primary recommendation:** Follow existing codebase patterns for dropdown population and Firestore queries; modify current implementation to store project_code instead of project_name, display formatted string in dropdown.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 (CDN) | Real-time database with queries | Already in use; project requirement |
| Vanilla JavaScript | ES6 modules | DOM manipulation, event handling | Zero-build constraint; existing pattern |
| onSnapshot listeners | Firestore v10.7.1 | Real-time dropdown updates | Existing pattern in codebase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native HTML select | ES6 | Dropdown UI element | All dropdowns in codebase use this |
| CSS classes | Custom | Dropdown styling | Existing styles in components.css |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native select | Select2/Choices.js | Would add dependency; violates zero-build constraint |
| project_name storage | project_code storage | project_code provides stable reference if name changes |
| Static getDocs() | onSnapshot listener | Real-time updates required per existing pattern |

**Installation:**
```bash
# No installation needed - Firebase CDN already configured in app/firebase.js
# No npm packages - zero-build static website
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── views/
│   ├── mrf-form.js          # UPDATE: dropdown formatting, storage field
│   ├── procurement.js       # UPDATE: display project_code + name
│   └── finance.js           # UPDATE: display project_code + name
├── utils.js                 # EXISTING: getActiveProjects() utility
└── firebase.js              # EXISTING: Firestore imports
```

### Pattern 1: Active Projects Query with Real-time Listener
**What:** Query Firestore for active projects only, use onSnapshot for real-time updates
**When to use:** Populating dropdowns that should exclude inactive projects
**Example:**
```javascript
// Source: Existing pattern in app/views/mrf-form.js:226-266
function loadProjects() {
    const projectSelect = document.getElementById('projectName');
    if (!projectSelect) return;

    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('status', '==', 'active'));

        projectsListener = onSnapshot(q, (snapshot) => {
            // Clear existing options
            projectSelect.innerHTML = '<option value="">-- Select a project --</option>';

            if (snapshot.empty) {
                projectSelect.innerHTML = '<option value="">No projects available</option>';
                return;
            }

            // Collect projects into array
            const projects = [];
            snapshot.forEach(doc => {
                projects.push({ id: doc.id, ...doc.data() });
            });

            // Sort by most recent first (requirement MRF-04)
            projects.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime; // Descending order
            });

            // Add options with formatted display (requirement MRF-02)
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.project_code; // Store code (requirement MRF-05)
                option.textContent = `${project.project_code} - ${project.project_name}`; // Display format
                projectSelect.appendChild(option);
            });
        }, (error) => {
            console.error('Error loading projects:', error);
            projectSelect.innerHTML = '<option value="">Error loading projects</option>';
        });
    } catch (error) {
        console.error('Error setting up projects listener:', error);
        projectSelect.innerHTML = '<option value="">Error loading projects</option>';
    }
}
```

### Pattern 2: Listener Cleanup in destroy()
**What:** Unsubscribe from all Firestore listeners when view is destroyed
**When to use:** Every view module with onSnapshot listeners
**Example:**
```javascript
// Source: Existing pattern in app/views/mrf-form.js:520-534
let projectsListener = null; // Module-level variable

export async function destroy() {
    console.log('Destroying MRF form view...');

    // Unsubscribe from listeners
    if (projectsListener) {
        projectsListener(); // Call unsubscribe function
        projectsListener = null;
    }

    // Remove form event listener
    const form = document.getElementById('mrfForm');
    if (form) {
        form.removeEventListener('submit', handleFormSubmit);
    }
}
```

### Pattern 3: Storing Reference Field vs Display Field
**What:** Store stable reference (project_code), display formatted string
**When to use:** Dropdown where display value differs from stored value
**Example:**
```javascript
// Source: Inferred from existing project_code architecture
// CURRENT (incorrect):
const projectName = document.getElementById('projectName').value; // Stores display name
await addDoc(collection(db, 'mrfs'), {
    project_name: projectName, // Display value stored
    // ...
});

// CORRECT (requirement MRF-05):
const projectCode = document.getElementById('projectName').value; // Now stores code
await addDoc(collection(db, 'mrfs'), {
    project_code: projectCode, // Reference field
    // ...
});
```

### Pattern 4: Displaying Project Information in Lists
**What:** Fetch project details to show code + name in MRF lists
**When to use:** Displaying MRFs with project context (requirements MRF-06, MRF-07)
**Example:**
```javascript
// Source: Existing pattern in app/views/procurement.js:546, 602
// CURRENT:
<div style="font-size: 0.875rem; color: #5f6368;">${mrf.project_name}</div>

// UPDATED (requirement MRF-06):
// If storing project_code, need to display both code and name
<div style="font-size: 0.875rem; color: #5f6368;">
    ${mrf.project_code}${mrf.project_name ? ' - ' + mrf.project_name : ''}
</div>
```

### Pattern 5: Case-Sensitive Status Filtering
**What:** Firestore where() queries are case-sensitive, match exact status values
**When to use:** All status-based queries
**Example:**
```javascript
// Source: Existing pattern verified in codebase grep
// CORRECT:
where('status', '==', 'active') // Lowercase 'active'

// INCORRECT:
where('status', '==', 'Active') // Would not match if stored as lowercase
```

### Anti-Patterns to Avoid
- **Storing display values instead of reference IDs:** Breaks if project names change; use project_code as stable reference
- **Not cleaning up listeners:** Memory leaks in SPA; always unsubscribe in destroy()
- **Sorting in Firestore query when can sort in-memory:** `orderBy('created_at')` requires composite index; sorting 10-50 items in JavaScript is faster
- **Using getDocs() when onSnapshot available:** Dropdowns should update in real-time when projects added/deactivated
- **Forgetting empty state handling:** Always check `snapshot.empty` before iterating

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential project code generation | Custom counter logic | `generateProjectCode()` in utils.js | Already handles year rollover, client grouping, race conditions |
| Active projects query | Filter in JavaScript | Firestore `where('status', '==', 'active')` | Reduces bandwidth, already implemented |
| Dropdown population pattern | Custom implementation | Copy existing pattern from mrf-form.js:226-266 | Handles errors, empty states, real-time updates |
| Date/time sorting | Custom comparator | `new Date(timestamp).getTime()` pattern | Existing pattern in codebase |
| Listener cleanup | Manual unsubscribe tracking | Existing pattern: module-level `listeners` array | Prevents memory leaks, established pattern |

**Key insight:** The codebase already has all the patterns needed - this is primarily a data migration task (project_name → project_code) and UI formatting update, not new architecture.

## Common Pitfalls

### Pitfall 1: Storing project_name Instead of project_code
**What goes wrong:** If user changes project name, all historical MRFs show old name or break references
**Why it happens:** Current implementation stores project_name for simplicity
**How to avoid:** Store project_code as reference field, fetch project details for display
**Warning signs:** MRF documents have project_name field but no project_code field

### Pitfall 2: Forgetting to Update All Display Locations
**What goes wrong:** MRF form shows new format, but procurement view still shows old format
**Why it happens:** Multiple views display MRF data (procurement.js, finance.js)
**How to avoid:** Grep for `mrf.project_name` and update all display locations
**Warning signs:** Inconsistent project display across views, missing project codes

### Pitfall 3: Not Filtering Inactive Projects
**What goes wrong:** Users can select inactive/completed projects from dropdown
**Why it happens:** Forgetting `where('status', '==', 'active')` filter
**How to avoid:** Use query filter, verify with test project marked inactive
**Warning signs:** Dropdown shows all projects regardless of status

### Pitfall 4: Incorrect Sort Direction (Alphabetical Instead of Recent First)
**What goes wrong:** Dropdown shows projects alphabetically, requirement specifies most recent first
**Why it happens:** Current code sorts by `project_name.localeCompare()` (line 249)
**How to avoid:** Sort by `created_at` timestamp descending after fetching data
**Warning signs:** Oldest projects appear at top of dropdown

### Pitfall 5: Case-Sensitivity in Status Queries
**What goes wrong:** Query for `'Active'` returns no results if stored as `'active'`
**Why it happens:** Firestore is case-sensitive for string matching
**How to avoid:** Verify exact status values in projects collection, match casing exactly
**Warning signs:** Empty dropdown despite active projects existing

### Pitfall 6: Listener Not Cleaned Up on View Destroy
**What goes wrong:** Memory leak, duplicate listeners accumulate on tab navigation
**Why it happens:** Router doesn't call destroy() on tab switches within same view
**How to avoid:** Store listener reference, call unsubscribe in destroy()
**Warning signs:** Console shows multiple listener warnings, performance degrades

### Pitfall 7: Missing Empty State Handling
**What goes wrong:** Blank dropdown with no feedback when no active projects exist
**Why it happens:** Not checking `snapshot.empty` before rendering
**How to avoid:** Show "No projects available" message when empty
**Warning signs:** Users report blank dropdown, confusion about missing projects

## Code Examples

Verified patterns from official sources and existing codebase:

### Complete Dropdown Population Function
```javascript
// Source: Existing pattern in app/views/mrf-form.js:226-266 (modified for requirements)
let projectsListener = null;

function loadProjects() {
    const projectSelect = document.getElementById('projectName');
    if (!projectSelect) return;

    try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('status', '==', 'active')); // MRF-03

        projectsListener = onSnapshot(q, (snapshot) => {
            // Clear existing options
            projectSelect.innerHTML = '<option value="">-- Select a project --</option>';

            // Handle empty state (MRF-03 edge case)
            if (snapshot.empty) {
                projectSelect.innerHTML = '<option value="">No active projects available</option>';
                return;
            }

            // Collect projects into array for sorting
            const projects = [];
            snapshot.forEach(doc => {
                projects.push({ id: doc.id, ...doc.data() });
            });

            // Sort by most recent first (MRF-04)
            projects.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime; // Descending order
            });

            // Add options with formatted display (MRF-02)
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.project_code; // Store code (MRF-05)
                option.textContent = `${project.project_code} - ${project.project_name}`; // Format
                projectSelect.appendChild(option);
            });
        }, (error) => {
            console.error('Error loading projects:', error);
            projectSelect.innerHTML = '<option value="">Error loading projects</option>';
        });
    } catch (error) {
        console.error('Error setting up projects listener:', error);
        projectSelect.innerHTML = '<option value="">Error loading projects</option>';
    }
}
```

### Storing Project Code on MRF Submission
```javascript
// Source: Existing pattern in app/views/mrf-form.js:447-487 (modified)
async function handleFormSubmit(e) {
    e.preventDefault();

    // Collect form data
    const projectCode = document.getElementById('projectName').value.trim(); // Now gets code
    // ... other fields ...

    // Prepare Firestore document (MRF-05)
    const mrfDoc = {
        mrf_id: mrfId,
        project_code: projectCode, // CHANGED: was project_name
        requestor_name: requestorName,
        date_needed: dateNeeded,
        items_json: JSON.stringify(items),
        status: 'Pending',
        created_at: new Date().toISOString()
    };

    // Submit to Firebase
    await addDoc(collection(db, 'mrfs'), mrfDoc);
}
```

### Displaying Project in MRF List (Requirement MRF-06)
```javascript
// Source: app/views/procurement.js:546, 602 (modified)
// Option 1: Store both project_code and project_name in MRF document (denormalization)
<div style="font-weight: 600;">${mrf.mrf_id}</div>
<div style="font-size: 0.875rem; color: #5f6368;">
    ${mrf.project_code}${mrf.project_name ? ' - ' + mrf.project_name : ''}
</div>

// Option 2: Join with projects collection (requires async lookup)
// NOT RECOMMENDED: Adds complexity, denormalization is better for display fields
```

### Firestore Query with where() and In-Memory Sort
```javascript
// Source: Firebase official docs + existing codebase pattern
// Query active projects (Firestore filter)
const q = query(
    collection(db, 'projects'),
    where('status', '==', 'active')
);

const snapshot = await getDocs(q);
const projects = [];
snapshot.forEach(doc => {
    projects.push({ id: doc.id, ...doc.data() });
});

// Sort in-memory (faster than Firestore orderBy for small datasets)
projects.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime; // Most recent first
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store project_name string | Store project_code reference | Phase 04 | Stable references, supports project renaming |
| Alphabetical sorting | Most recent first | Phase 04 | Better UX - newest projects at top |
| Show only project name | Show "CODE - Name" format | Phase 04 | Clear identification, matches project management view |
| Static getDocs() | onSnapshot real-time | Already implemented | Dropdowns auto-update when projects added |

**Deprecated/outdated:**
- None - this is new functionality being added to existing system
- Current project_name storage will be deprecated in favor of project_code

## Open Questions

Things that couldn't be fully resolved:

1. **Denormalization Strategy for Project Display**
   - What we know: Need to display both project_code and project_name in MRF lists
   - What's unclear: Should we denormalize project_name into MRF documents, or join on read?
   - Recommendation: Denormalize project_name for display purposes. Firebase best practice is to duplicate display fields to avoid joins. Store both `project_code` (reference) and `project_name` (display) in MRF documents. If project name changes, historical MRFs keep old name (accurate historical record).

2. **Handling Completed Projects (Warranty Scenario)**
   - What we know: Requirement MRF-08 states users can create MRFs for completed projects
   - What's unclear: Does "completed" mean `status='active'` still, or different field?
   - Recommendation: Based on requirement MRF-09 (cannot create MRFs for inactive), "completed" projects must have `status='active'` to allow MRFs. The `project_status` field tracks lifecycle ('Completed'), but `status='active'` controls MRF availability. Mark lost projects as `status='inactive'`.

3. **Migration of Existing MRF Data**
   - What we know: Existing MRFs have project_name field, need project_code
   - What's unclear: Should we migrate old data, or leave legacy MRFs as-is?
   - Recommendation: Leave legacy MRFs with project_name only (no migration needed). New MRFs created after Phase 04 will have project_code. Display logic should handle both: show project_code if available, fallback to project_name if not.

## Sources

### Primary (HIGH confidence)
- Firebase Firestore Official Documentation - Query patterns verified at https://firebase.google.com/docs/firestore/query-data/queries (Last updated 2026-01-22 UTC)
- Firebase Firestore Official Documentation - Listener patterns at https://firebase.google.com/docs/firestore/query-data/listen
- Existing codebase patterns - `app/views/mrf-form.js` lines 226-266 (dropdown population), lines 520-534 (listener cleanup)
- Existing codebase patterns - `app/utils.js` lines 184-218 (generateProjectCode), lines 224-239 (getActiveProjects)
- Existing codebase patterns - `app/views/procurement.js` lines 413, 546, 602 (project display)

### Secondary (MEDIUM confidence)
- [7+ Google Firestore Query Performance Best Practices for 2026](https://estuary.dev/blog/firestore-query-best-practices/) - Query optimization guidance
- [Best practices for Cloud Firestore | Firebase](https://firebase.google.com/docs/firestore/best-practices) - General Firestore patterns
- [Order and limit data with Cloud Firestore | Firebase](https://firebase.google.com/docs/firestore/query-data/order-limit-data) - Sorting patterns (verified 2026-01-22)

### Tertiary (LOW confidence)
- None - all findings verified with official docs or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Firebase 10.7.1 already in use, patterns established in codebase
- Architecture: HIGH - Existing patterns in mrf-form.js provide complete reference implementation
- Pitfalls: HIGH - All pitfalls identified from existing code patterns and requirements analysis

**Research date:** 2026-01-28
**Valid until:** 2026-02-27 (30 days - Firebase stable, codebase patterns unlikely to change)
