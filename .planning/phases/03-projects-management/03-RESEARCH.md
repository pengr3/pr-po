# Phase 03: Projects Management - Research

**Researched:** 2026-01-26
**Domain:** List management, filtering, search, and detail views in vanilla JavaScript SPA
**Confidence:** HIGH

## Summary

This phase implements powerful list management for projects with filtering, search, column sorting, and full-page detail view with inline editing. The core challenges are:

1. **Client-side filtering and search** - Multiple filter dropdowns combining with debounced search across project code/name
2. **Column sorting** - Clickable table headers to sort by any column with visual indicators
3. **Master-detail routing** - Hash-based navigation from list to full-page detail view (`#/projects/detail/PROJECT_CODE`)
4. **Inline editing with auto-save** - Edit fields on blur with validation, silent success, visible errors

The existing codebase already has patterns for pagination, real-time listeners, and basic filtering (in procurement.js). The new requirements add **column sorting**, **debounced search**, **detail routing**, and **auto-save** which are well-established vanilla JavaScript patterns.

**Primary recommendation:** Use client-side filtering with real-time Firebase listener, implement 300ms debounce for search, add table sorting via data attributes on headers, extend existing router to support detail routes with third path segment, and implement blur-based auto-save with optimistic UI and error recovery.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | v10.7.1 (CDN) | Real-time database with listeners | Already in use; onSnapshot provides live updates |
| Vanilla JavaScript ES6 | Native | DOM manipulation, event handling | Zero-build constraint; modern browser features sufficient |
| Hash-based routing | Native | SPA navigation without server config | Existing router.js pattern; simple, works without backend |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS Grid/Flexbox | Native | Responsive layouts | Detail view category grouping |
| localStorage | Native | Filter state (optional) | If persisting filters across sessions (not required by CONTEXT.md) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side filtering | Firestore compound queries | Firestore has query limitations (can't OR across fields, limited range filters); client-side gives more flexibility for multiple independent filters |
| Hash routing | History API | Hash routing simpler, no server rewrites needed, matches existing pattern |
| Debounce function | Lodash/Underscore | Adding library for single function violates zero-build; 10-line vanilla implementation sufficient |

**Installation:**
```bash
# No installation - using existing Firebase CDN and vanilla JavaScript
```

## Architecture Patterns

### Recommended Project Structure
```
app/views/
├── projects.js         # List view (existing - enhance with filters/search/sort)
├── project-detail.js   # Detail view (NEW - full page with inline editing)
```

### Pattern 1: Client-Side Filtering with Real-Time Listener

**What:** Load all projects via onSnapshot, filter in-memory on client
**When to use:** When filter combinations are complex or dataset is small-to-medium (<1000 records)

**Why this works:**
- Firestore compound queries limited (can't combine multiple equality filters on different fields without indexes)
- Client-side allows instant filter updates without network latency
- Real-time listener keeps data fresh automatically
- Current projects collection likely small (dozens to hundreds, not thousands)

**Example:**
```javascript
// Load with real-time listener
let allProjects = [];
let filteredProjects = [];

async function loadProjects() {
    const listener = onSnapshot(collection(db, 'projects'), (snapshot) => {
        allProjects = [];
        snapshot.forEach(doc => {
            allProjects.push({ id: doc.id, ...doc.data() });
        });

        // Apply current filters
        applyFilters();
    });
    listeners.push(listener);
}

// Filter function combines all criteria
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const clientFilter = document.getElementById('clientFilter')?.value || '';

    filteredProjects = allProjects.filter(project => {
        // AND logic - all conditions must match
        const matchesSearch = !searchTerm ||
            project.project_code.toLowerCase().includes(searchTerm) ||
            project.project_name.toLowerCase().includes(searchTerm);

        const matchesStatus = !statusFilter || project.internal_status === statusFilter;
        const matchesClient = !clientFilter || project.client_id === clientFilter;

        return matchesSearch && matchesStatus && matchesClient;
    });

    // Reset to page 1 when filters change
    currentPage = 1;
    renderProjectsTable();
}
```

**Reference:** Firebase Best Practices emphasize server-side filtering for security, but client-side is acceptable when: (1) all users can see all data anyway, (2) dataset is manageable size, (3) filter logic is too complex for Firestore queries.

### Pattern 2: Debounced Search Input

**What:** Delay search execution until user stops typing (300ms standard)
**When to use:** Any instant search feature to reduce wasted operations

**Example:**
```javascript
// Debounce utility
function debounce(callback, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            callback(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply to search input
const debouncedFilter = debounce(applyFilters, 300);

// In render()
<input type="text"
       id="searchInput"
       placeholder="Search by code or name..."
       oninput="window.debouncedFilter()">

// Attach to window
window.debouncedFilter = debouncedFilter;
```

**Best practice timing:** 200-500ms range, 300ms is sweet spot (not too laggy, prevents excessive calls). Faster than 200ms feels unresponsive, slower than 500ms feels broken.

### Pattern 3: Table Column Sorting

**What:** Click headers to sort table by that column, toggle ascending/descending
**When to use:** Any data table where users need to explore different orderings

**Example:**
```javascript
let sortColumn = 'created_at'; // Default
let sortDirection = 'desc';    // Most recent first

function sortProjects(column) {
    // Toggle direction if clicking same column
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc'; // Default to ascending on new column
    }

    filteredProjects.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Handle dates
        if (column === 'created_at') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }

        // String comparison
        if (typeof aVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        // Numeric/date comparison
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    renderProjectsTable();
}

// In table header
<th onclick="window.sortProjects('project_code')" style="cursor: pointer;">
    Code
    ${sortColumn === 'project_code' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
</th>
```

**Visual indicators:** Use Unicode arrows (↑/↓) or CSS ::after pseudo-elements. Keep it simple and clear.

### Pattern 4: Master-Detail Routing

**What:** Extend hash router to support detail routes like `#/projects/detail/CLMC_ABC_2026001`
**When to use:** When detail view needs full page (not modal) with deep-linkable URLs

**Current router pattern:**
```javascript
// Existing: parseHash() returns { path: '/projects', tab: 'suppliers' }
// For #/projects/suppliers

// Extend for: { path: '/projects', subpath: 'detail', param: 'CLMC_ABC_2026001' }
// For #/projects/detail/CLMC_ABC_2026001

function parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);

    if (parts.length === 0) return { path: '/', tab: null, subpath: null, param: null };

    const path = '/' + parts[0];
    const tab = parts[1] || null;
    const subpath = parts[2] || null;  // NEW: 'detail'
    const param = parts[3] || null;     // NEW: 'CLMC_ABC_2026001'

    return { path, tab, subpath, param };
}
```

**View handling:**
```javascript
// projects.js handles both list and detail
export function render(activeTab = null, subpath = null, param = null) {
    if (subpath === 'detail' && param) {
        return renderDetailView(param); // Full page detail
    }
    return renderListView(); // Default list
}

export async function init(activeTab = null, subpath = null, param = null) {
    attachWindowFunctions();

    if (subpath === 'detail' && param) {
        await loadProjectDetail(param);
    } else {
        await loadProjects();
    }
}
```

**Navigation:**
```javascript
// From list row click
<tr onclick="window.location.hash = '#/projects/detail/${project.project_code}'">

// Back navigation - use browser back button (requirement from CONTEXT.md)
```

### Pattern 5: Inline Editing with Auto-Save on Blur

**What:** Fields editable directly, save automatically when user moves away (blur event)
**When to use:** Detail views where editing is frequent and save button adds friction

**Example:**
```javascript
async function saveField(projectCode, fieldName, newValue) {
    // Validation
    if (fieldName === 'budget' && newValue && parseFloat(newValue) <= 0) {
        showFieldError(fieldName, 'Budget must be positive');
        return false; // Keep field editable, don't save
    }

    try {
        const projectRef = doc(db, 'projects', projectCode);
        await updateDoc(projectRef, {
            [fieldName]: newValue,
            updated_at: new Date().toISOString()
        });

        // Silent success - no toast/feedback (per CONTEXT.md)
        clearFieldError(fieldName);
        return true;

    } catch (error) {
        console.error('Save failed:', error);
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false; // Keep field editable with error shown
    }
}

// Attach blur handlers
<input type="text"
       value="${project.project_name || ''}"
       onblur="window.saveField('${project.project_code}', 'project_name', this.value)"
       placeholder="(Not set)">

// Error display
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    errorEl.textContent = message;
    field.parentNode.appendChild(errorEl);
    field.classList.add('field-error-state');
}
```

**Best practices:**
- **Validate before save** - Don't send invalid data to server
- **Silent on success** - No toast/flash needed (per CONTEXT.md decision)
- **Visible on error** - Show inline error, keep field editable
- **Optimistic UI** - Assume success, handle failure explicitly
- **Reward early, punish late** - Clear errors immediately when fixed, only show errors after blur

### Anti-Patterns to Avoid

**❌ Filtering on every keystroke without debounce**
- Causes excessive re-renders
- Janky UI on slower devices
- Use debounce for search inputs

**❌ Using Firestore queries for complex filter combinations**
- Hits query limitations (can't OR, limited compound queries)
- Requires composite indexes for each combination
- Client-side filtering more flexible for <1000 records

**❌ Modal for detail view when many fields exist**
- Cramped, poor UX for forms with 10+ fields
- CONTEXT.md explicitly requires full page, not modal

**❌ Save button for frequently edited fields**
- Adds friction, easy to forget to save
- Auto-save on blur is modern UX standard for detail views

**❌ Premature validation (on focus or first keystroke)**
- Frustrating to see errors while still typing
- Validate only on blur (when leaving field)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce function | Custom timing logic with multiple setTimeout calls | Standard debounce pattern (10 lines) | Easy to introduce memory leaks or race conditions; proven pattern clears previous timers correctly |
| Currency formatting | String concatenation with ₱ symbol | `formatCurrency()` in utils.js (already exists) | Handles decimal places, thousands separators, edge cases |
| Date parsing/formatting | Manual string manipulation | `formatDate()` in utils.js or native Intl.DateTimeFormat | Timezone bugs, locale issues already solved |
| Hash parsing | String splits without validation | Extend existing `parseHash()` in router.js | Handles edge cases, consistent with current architecture |
| Firestore sequential queries | For-loops with await | Batched queries or client-side filtering | Network overhead; existing pattern uses onSnapshot for real-time updates |

**Key insight:** The codebase already has utilities (formatCurrency, formatDate, generateSequentialId) and patterns (router hash parsing, real-time listeners, pagination) that solve most common problems. Don't reinvent - extend existing patterns.

## Common Pitfalls

### Pitfall 1: Filter State Not Reset on Navigation

**What goes wrong:** User filters projects, navigates away, returns to find filters still applied with no visual indication
**Why it happens:** Filter state stored in module-level variables persists across destroy/init cycles
**How to avoid:**
- Reset filter inputs to default values in `destroy()` or start of `init()`
- CONTEXT.md specifies "Filters reset on navigation - no persistence between sessions"
**Warning signs:** User reports "projects are missing" but they're just filtered out invisibly

**Prevention code:**
```javascript
export async function destroy() {
    // Reset filter state
    filteredProjects = [];
    allProjects = [];
    currentPage = 1;
    sortColumn = 'created_at';
    sortDirection = 'desc';

    // Unsubscribe listeners
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
}
```

### Pitfall 2: Debounce Function Creates Memory Leaks

**What goes wrong:** Timeout references accumulate, never cleared, consuming memory over time
**Why it happens:** Missing `clearTimeout()` before setting new timeout
**How to avoid:** Always clear previous timeout before creating new one (see Pattern 2 example)
**Warning signs:** Browser gradually slows down during long session, memory usage climbs

### Pitfall 3: Sorting Breaks Pagination

**What goes wrong:** User is on page 3, sorts by different column, sees empty table
**Why it happens:** Sort reorders array but doesn't reset `currentPage` to 1
**How to avoid:** Reset `currentPage = 1` in sort function
**Warning signs:** "Table is empty after sorting" reports

**Fix:**
```javascript
function sortProjects(column) {
    // ... sorting logic ...
    currentPage = 1; // ← CRITICAL: Reset pagination
    renderProjectsTable();
}
```

### Pitfall 4: Auto-Save on Blur Conflicts with Button Clicks

**What goes wrong:** User edits field, clicks Delete button, blur event fires save, then delete fires - race condition
**Why it happens:** Blur event fires before button click event
**How to avoid:**
- Use `mousedown` instead of `click` for critical buttons (fires before blur)
- Or add small delay (100ms) to blur handler to let clicks through first
- Or use `event.relatedTarget` in blur handler to detect if clicking button
**Warning signs:** Inconsistent behavior when clicking buttons immediately after editing

**Better pattern:**
```javascript
// Option 1: Check relatedTarget
onblur="if (event.relatedTarget?.tagName !== 'BUTTON') window.saveField(...)"

// Option 2: Short delay
async function saveField(projectCode, fieldName, newValue) {
    await new Promise(resolve => setTimeout(resolve, 100));
    // ... save logic ...
}
```

### Pitfall 5: Hash Routing Doesn't Handle Browser Back Button

**What goes wrong:** User navigates to detail view, clicks browser back, view doesn't update
**Why it happens:** Router only handles `hashchange` event, but browser back triggers it, so this should work - real issue is router might not re-render same view
**How to avoid:** Ensure router's `navigate()` function handles going from `#/projects/detail/X` back to `#/projects` correctly
**Warning signs:** Back button seems broken in testing

**Current router already handles this** via `hashchange` listener, but test thoroughly.

### Pitfall 6: Inline Editing Locks Immutable Fields

**What goes wrong:** User can edit project_code or client fields that should be locked
**Why it happens:** Forgetting to disable inputs or check field name in save handler
**How to avoid:**
- CONTEXT.md specifies: "All fields editable inline EXCEPT project code (immutable) and client (locked)"
- Use `disabled` attribute on those inputs
- Add guard in `saveField()` to reject changes to locked fields
**Warning signs:** Data corruption from editing codes/clients

**Prevention:**
```javascript
// In render
<input value="${project.project_code}" disabled style="background: #f5f5f5;">

// In saveField
if (['project_code', 'client_id', 'client_code'].includes(fieldName)) {
    console.error('Attempted to edit locked field:', fieldName);
    return false;
}
```

### Pitfall 7: Real-Time Listener Fires During Edit

**What goes wrong:** User typing in field, onSnapshot fires with update from another user, field value reset
**Why it happens:** Real-time listener re-renders entire view, overwriting user's uncommitted changes
**How to avoid:**
- Track which field is currently being edited
- Skip re-rendering that specific field if it has focus
- Or use optimistic updates (update UI immediately, listener confirms)
**Warning signs:** "My changes keep disappearing while I'm typing"

**Mitigation:**
```javascript
function renderDetailView(projectData) {
    const focusedField = document.activeElement?.dataset?.field;

    // For each field
    const input = document.querySelector(`[data-field="${fieldName}"]`);
    if (input && input !== document.activeElement) {
        input.value = projectData[fieldName] || '';
    }
    // If field has focus, don't overwrite its value
}
```

## Code Examples

Verified patterns from official sources and existing codebase:

### Client-Side Filter Combination
```javascript
// Source: Existing pattern from procurement.js filterPRPORecords()
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const internalStatusFilter = document.getElementById('internalStatusFilter')?.value || '';
    const projectStatusFilter = document.getElementById('projectStatusFilter')?.value || '';
    const clientFilter = document.getElementById('clientFilter')?.value || '';

    filteredProjects = allProjects.filter(project => {
        // Search filter (OR across fields)
        const matchesSearch = !searchTerm ||
            (project.project_code && project.project_code.toLowerCase().includes(searchTerm)) ||
            (project.project_name && project.project_name.toLowerCase().includes(searchTerm));

        // Status filters (exact match)
        const matchesInternalStatus = !internalStatusFilter ||
            project.internal_status === internalStatusFilter;
        const matchesProjectStatus = !projectStatusFilter ||
            project.project_status === projectStatusFilter;
        const matchesClient = !clientFilter ||
            project.client_id === clientFilter;

        // AND logic - all conditions must be true
        return matchesSearch && matchesInternalStatus &&
               matchesProjectStatus && matchesClient;
    });

    // Reset pagination when filters change
    currentPage = 1;
    renderProjectsTable();
}
```

### Debounced Search Input
```javascript
// Source: Standard vanilla JS debounce pattern
function debounce(callback, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            callback(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Create debounced version (in init or module scope)
const debouncedFilter = debounce(applyFilters, 300);

// Attach to window for onclick handler
window.debouncedFilter = debouncedFilter;

// HTML
<input type="text"
       id="searchInput"
       placeholder="Search by code or name..."
       oninput="window.debouncedFilter()">
```

### Table Column Sorting
```javascript
// Source: Adapted from existing projects.js sorting pattern
let sortColumn = 'created_at';
let sortDirection = 'desc';

function sortProjects(column) {
    // Toggle direction if same column
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    filteredProjects.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Handle null/undefined
        if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

        // Handle dates
        if (column === 'created_at' || column === 'updated_at') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }

        // String comparison
        if (typeof aVal === 'string') {
            return sortDirection === 'asc'
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        }

        // Numeric/date comparison
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    currentPage = 1; // Reset pagination
    renderProjectsTable();
}

// Attach to window
window.sortProjects = sortProjects;

// Table header HTML
<th onclick="window.sortProjects('project_code')"
    style="cursor: pointer; user-select: none;">
    Code
    <span style="margin-left: 0.25rem; color: #666;">
        ${sortColumn === 'project_code' ? (sortDirection === 'asc' ? '↑' : '↓') : '⇅'}
    </span>
</th>
```

### Extended Hash Parsing for Detail Routes
```javascript
// Source: Extend existing router.js parseHash()
function parseHash() {
    const hash = window.location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);

    if (parts.length === 0) {
        return { path: '/', tab: null, subpath: null, param: null };
    }

    const path = '/' + parts[0];
    const tab = parts[1] || null;
    const subpath = parts[2] || null;
    const param = parts[3] || null;

    return { path, tab, subpath, param };
}

// Example hashes:
// #/projects → { path: '/projects', tab: null, subpath: null, param: null }
// #/projects/detail/CLMC_ABC_2026001 →
//   { path: '/projects', tab: 'detail', subpath: 'CLMC_ABC_2026001', param: null }
//
// Alternative if using tab as 2nd segment:
// #/projects/detail/CLMC_ABC_2026001 →
//   { path: '/projects', tab: null, subpath: 'detail', param: 'CLMC_ABC_2026001' }
```

### Auto-Save on Blur with Validation
```javascript
// Source: Best practices from UX research + existing Firestore patterns
async function saveField(projectCode, fieldName, newValue) {
    // Prevent editing locked fields
    if (['project_code', 'client_id', 'client_code'].includes(fieldName)) {
        console.error('Attempted to edit locked field:', fieldName);
        return false;
    }

    // Clear any existing errors
    clearFieldError(fieldName);

    // Validation
    if (fieldName === 'project_name' && !newValue.trim()) {
        showFieldError(fieldName, 'Project name is required');
        return false;
    }

    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        const num = parseFloat(newValue);
        if (newValue && (isNaN(num) || num <= 0)) {
            showFieldError(fieldName, 'Must be a positive number');
            return false;
        }
    }

    // Prepare value (convert empty strings to null for optional fields)
    let valueToSave = newValue;
    if (fieldName === 'budget' || fieldName === 'contract_cost') {
        valueToSave = newValue ? parseFloat(newValue) : null;
    } else if (fieldName === 'personnel') {
        valueToSave = newValue.trim() || null;
    }

    try {
        const projectRef = doc(db, 'projects', projectCode);
        await updateDoc(projectRef, {
            [fieldName]: valueToSave,
            updated_at: new Date().toISOString()
        });

        // Silent success (no toast per CONTEXT.md)
        return true;

    } catch (error) {
        console.error('[Projects] Save failed:', error);
        showFieldError(fieldName, 'Failed to save. Please try again.');
        return false;
    }
}

function showFieldError(fieldName, message) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    // Remove existing error if any
    clearFieldError(fieldName);

    // Add error message
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-message';
    errorEl.textContent = message;
    errorEl.style.color = '#ef4444';
    errorEl.style.fontSize = '0.875rem';
    errorEl.style.marginTop = '0.25rem';

    field.parentNode.appendChild(errorEl);
    field.classList.add('field-error');
    field.style.borderColor = '#ef4444';
}

function clearFieldError(fieldName) {
    const field = document.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return;

    const errorMsg = field.parentNode.querySelector('.field-error-message');
    if (errorMsg) errorMsg.remove();

    field.classList.remove('field-error');
    field.style.borderColor = '';
}

// Attach to window
window.saveField = saveField;

// HTML input example
<input type="text"
       data-field="project_name"
       value="${project.project_name}"
       onblur="window.saveField('${project.project_code}', 'project_name', this.value)"
       placeholder="(Not set)">
```

### Detail View Category Grouping
```javascript
// Source: Adapted from card-based layouts in existing codebase
function renderDetailView(project) {
    return `
        <div class="container" style="margin-top: 2rem;">
            <!-- Header with back button via browser -->
            <div style="margin-bottom: 1.5rem;">
                <h2>${project.project_code} - ${project.project_name}</h2>
                <p style="color: #64748b;">
                    Created: ${formatDate(project.created_at)}
                    ${project.updated_at ? ` • Updated: ${formatDate(project.updated_at)}` : ''}
                </p>
            </div>

            <!-- Basic Info Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem;">Basic Information</h3>

                    <div class="form-group">
                        <label>Project Code</label>
                        <input type="text" value="${project.project_code}" disabled
                               style="background: #f5f5f5; cursor: not-allowed;">
                        <small class="form-hint">Project code cannot be changed</small>
                    </div>

                    <div class="form-group">
                        <label>Project Name</label>
                        <input type="text"
                               data-field="project_name"
                               value="${project.project_name}"
                               onblur="window.saveField('${project.project_code}', 'project_name', this.value)">
                    </div>

                    <div class="form-group">
                        <label>Client</label>
                        <input type="text" value="${project.client_name || project.client_code}" disabled
                               style="background: #f5f5f5; cursor: not-allowed;">
                        <small class="form-hint">Client cannot be changed (linked to project code)</small>
                    </div>
                </div>
            </div>

            <!-- Financial Details Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem;">Financial Details</h3>

                    <div class="form-group">
                        <label>Budget (Optional)</label>
                        <input type="number"
                               data-field="budget"
                               value="${project.budget || ''}"
                               onblur="window.saveField('${project.project_code}', 'budget', this.value)"
                               placeholder="(Not set)"
                               min="0" step="0.01">
                        ${project.budget ? `<small class="form-hint">₱${formatCurrency(project.budget)}</small>` : ''}
                    </div>

                    <div class="form-group">
                        <label>Contract Cost (Optional)</label>
                        <input type="number"
                               data-field="contract_cost"
                               value="${project.contract_cost || ''}"
                               onblur="window.saveField('${project.project_code}', 'contract_cost', this.value)"
                               placeholder="(Not set)"
                               min="0" step="0.01">
                        ${project.contract_cost ? `<small class="form-hint">₱${formatCurrency(project.contract_cost)}</small>` : ''}
                    </div>
                </div>
            </div>

            <!-- Status Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem;">Status</h3>

                    <div class="form-group">
                        <label>Internal Status</label>
                        <select data-field="internal_status"
                                onchange="window.saveField('${project.project_code}', 'internal_status', this.value)">
                            ${INTERNAL_STATUS_OPTIONS.map(s =>
                                `<option value="${s}" ${project.internal_status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Project Status</label>
                        <select data-field="project_status"
                                onchange="window.saveField('${project.project_code}', 'project_status', this.value)">
                            ${PROJECT_STATUS_OPTIONS.map(s =>
                                `<option value="${s}" ${project.project_status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Active/Inactive</label>
                        <div>
                            <label class="toggle-switch">
                                <input type="checkbox"
                                       ${project.active ? 'checked' : ''}
                                       onchange="window.toggleActive('${project.project_code}', this.checked)">
                                <span class="toggle-slider"></span>
                            </label>
                            <span style="margin-left: 0.75rem; color: #64748b;">
                                ${project.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Personnel Card -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-body">
                    <h3 style="margin-bottom: 1rem;">Personnel</h3>

                    <div class="form-group">
                        <label>Assigned Personnel (Optional)</label>
                        <input type="text"
                               data-field="personnel"
                               value="${project.personnel || ''}"
                               onblur="window.saveField('${project.project_code}', 'personnel', this.value)"
                               placeholder="(Not set)">
                        <small class="form-hint">Freetext field for personnel assignment</small>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-bottom: 2rem;">
                <button class="btn btn-danger" onclick="window.deleteProject('${project.project_code}', '${project.project_name.replace(/'/g, "\\'")}')">
                    Delete Project
                </button>
            </div>
        </div>
    `;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Save button for form edits | Auto-save on blur | ~2015 with Google Docs/Sheets | Reduced friction, users don't forget to save |
| Modal dialogs for detail views | Full-page routes with deep links | ~2018 with modern SPAs | Better UX for complex forms, shareable URLs |
| Instant search on every keystroke | Debounced search (300ms) | Always best practice | Performance, reduced server load |
| Firestore queries for all filters | Client-side filtering for complex logic | Ongoing | Flexibility vs query cost tradeoff |
| jQuery for DOM manipulation | Vanilla JavaScript ES6 | ~2017-2020 | Zero dependencies, modern syntax |

**Deprecated/outdated:**
- **jQuery table sorting plugins** - Vanilla JS sufficient for basic sorting
- **Heavy frameworks for simple CRUD** - React/Vue overkill for zero-build constraint
- **Server-side pagination for <1000 records** - Client-side faster, simpler with real-time listeners

## Open Questions

Things that couldn't be fully resolved:

1. **Detail route structure: two segments vs three?**
   - What we know: Current router parses `#/view/tab`, supports two segments
   - What's unclear: Should detail be `#/projects/detail/CODE` (tab='detail', need param parsing) or `#/projects/CODE/detail` (tab='CODE', subpath='detail')?
   - Recommendation: Use `#/projects/detail/CODE` pattern - cleaner semantics, detail is a "mode" not a project identifier. Extend parseHash to support third segment as param.

2. **How to handle concurrent edits from multiple users?**
   - What we know: Real-time listener will push updates from other users
   - What's unclear: Should we lock fields being edited, show conflict warnings, or just last-write-wins?
   - Recommendation: Start with last-write-wins (simplest). If conflict issues arise, track `document.activeElement` and skip re-rendering focused fields. Full conflict resolution deferred to v2.0.

3. **Should filter state persist in localStorage?**
   - What we know: CONTEXT.md says "Filters reset on navigation - no persistence between sessions"
   - What's unclear: Does "between sessions" mean browser refreshes or just view navigation?
   - Recommendation: No localStorage persistence per CONTEXT.md - filters always reset. Simplest implementation.

4. **Column sort indicator: arrows or icons?**
   - What we know: Need visual indication of current sort
   - What's unclear: Unicode arrows (↑/↓) vs CSS triangle vs icon font
   - Recommendation: Unicode arrows simplest, no CSS/assets needed. Use ⇅ for unsorted columns to indicate sortability.

5. **Detail view: real-time listener or one-time fetch?**
   - What we know: List view uses onSnapshot for real-time updates
   - What's unclear: Should detail view also update live if another user changes the project?
   - Recommendation: Use real-time listener for consistency, but handle focused field edge case (Pitfall 7). Live updates valuable for multi-user scenarios.

## Sources

### Primary (HIGH confidence)
- Firebase Firestore Official Documentation - [Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- Firebase Firestore Official Documentation - [Compound Queries](https://firebase.google.com/docs/firestore/query-data/queries)
- Existing codebase patterns:
  - `app/router.js` - Hash parsing and navigation (lines 52-64, 192-195)
  - `app/views/procurement.js` - Filter pattern (lines 1983-2005)
  - `app/views/projects.js` - Real-time listener, sorting (lines 319-341, 328-331)
  - `app/utils.js` - Currency/date formatting (lines 17-39)

### Secondary (MEDIUM confidence)
- [Debounce in Vanilla JavaScript](https://medium.com/@bibeksaha/debounce-your-search-in-vanilla-pure-javascript-fa98c11afe63) - BibekSaha, Medium
- [JavaScript Debouncing: Essential Techniques](https://bitskingdom.com/blog/mastering-javascript-debouncing/) - Bitskingdom, 2026
- [7+ Google Firestore Query Performance Best Practices](https://estuary.dev/blog/firestore-query-best-practices/) - Estuary, 2026
- [Sortable Table GitHub](https://github.com/tofsjonas/sortable) - tofsjonas
- [Form Validation Best Practices](https://www.nngroup.com/articles/errors-forms-design-guidelines/) - Nielsen Norman Group
- [Inline Validation UX](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/) - Smashing Magazine
- [Auto-save UX Pattern](https://medium.com/scropt-com/autosave-8fd095c1092b) - Zac Tolley, Medium

### Tertiary (LOW confidence)
- [Hash-based Routing](https://prahladyeri.github.io/blog/2020/08/how-to-use-windowhashchange-event-to-implement-routing-in-vanilla-javascript.html) - Prahlad Yeri (2020, older but patterns still valid)
- Various CodePen examples for table sorting and inline editing (implementation references, not authoritative)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Existing codebase already uses Firebase + vanilla JS, no new libraries needed
- Architecture: HIGH - All patterns verified in existing code (filtering, listeners, pagination) or official docs (debounce, Firestore queries)
- Pitfalls: MEDIUM - Based on common issues in similar codebases and UX research, not all verified in THIS specific codebase yet

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable technologies, patterns unlikely to change)

---

**Sources Referenced:**
- [Debounce Your Search in Vanilla JavaScript](https://medium.com/@bibeksaha/debounce-your-search-in-vanilla-pure-javascript-fa98c11afe63)
- [JavaScript Debouncing: Essential Techniques](https://bitskingdom.com/blog/mastering-javascript-debouncing/)
- [Firebase Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [Firestore Compound Queries](https://firebase.google.com/docs/firestore/query-data/queries)
- [7+ Google Firestore Query Performance Best Practices](https://estuary.dev/blog/firestore-query-best-practices/)
- [Sortable Table by tofsjonas](https://github.com/tofsjonas/sortable)
- [Form Validation Error Design Guidelines](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- [Inline Validation UX](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/)
- [Auto-save UX Pattern](https://medium.com/scropt-com/autosave-8fd095c1092b)
- [Hash-based Routing in Vanilla JavaScript](https://prahladyeri.github.io/blog/2020/08/how-to-use-windowhashchange-event-to-implement-routing-in-vanilla-javascript.html)
