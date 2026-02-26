# Phase 20: Multi-Personnel Pill Selection - Research

**Researched:** 2026-02-09
**Domain:** Vanilla JS multi-select pill/chip UI + Firestore array fields
**Confidence:** HIGH

## Summary

This phase transforms the project personnel field from a single-select HTML5 datalist to a multi-select pill/chip UI built entirely in vanilla JavaScript. The current implementation stores a single `personnel_user_id` (string) and `personnel_name` (string) per project, with a legacy `personnel` freetext field for backward compatibility. The target is to store arrays (`personnel_user_ids[]` and `personnel_names[]`) while maintaining backward compatibility with existing single-personnel projects.

The implementation scope is contained to exactly two files (`app/views/projects.js` and `app/views/project-detail.js`) plus CSS additions. No other views reference personnel fields. The pattern requires a custom vanilla JS component since the project uses no build system or frameworks -- this is straightforward to implement as a contained UI widget.

**Primary recommendation:** Build a self-contained pill-input component pattern (container div with pills + text input) that replaces the current `<input type="text" list="...">` datalist approach. Store parallel arrays `personnel_user_ids` and `personnel_names` in Firestore, with a read-time migration function that normalizes legacy single-value fields into the array format.

## Standard Stack

This is a zero-build vanilla JS project. No external libraries are permitted.

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Vanilla JS ES6 | N/A | Pill/chip multi-select widget | Project constraint: no frameworks or build tools |
| Firestore v10.7.1 | CDN | Array field storage with `arrayUnion`/`arrayRemove` | Already in use, arrays natively supported |
| CSS (custom) | N/A | Pill/chip styling | Must match existing `.badge` / `.status-badge` design system |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| HTML5 `<datalist>` | NOT recommended | Current approach; inadequate for multi-select (no pill display, no removal UX) |
| Custom dropdown div | Filtered user list below input | Replaces datalist for better control over selection behavior |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom dropdown | HTML5 `<datalist>` | Datalist cannot show pills, cannot prevent re-selection of already-selected users, and has inconsistent cross-browser behavior for multi-select |
| Parallel arrays | Array of objects `[{id, name}]` | Objects in Firestore arrays cannot use `arrayUnion`/`arrayRemove` atomically (they match by deep equality); parallel arrays are simpler and consistent with existing `assigned_project_codes` pattern |
| `arrayUnion`/`arrayRemove` | Full array replacement | Full replacement is actually simpler for this use case since we always have the complete selection state in the UI; `arrayUnion`/`arrayRemove` adds complexity without benefit since there is no concurrent multi-user editing scenario |

## Architecture Patterns

### Current Personnel Implementation (Single-Select)

**Files affected:** Only 2 files reference personnel:
- `app/views/projects.js` - Project creation form + edit form
- `app/views/project-detail.js` - Inline editing on detail page

**Current Firestore fields on `projects` collection:**
```
personnel_user_id: string | null    // User document ID (Phase 15 format)
personnel_name: string | null       // Denormalized display name (Phase 15 format)
personnel: string | null            // Legacy freetext field (Phase 2 format, cleared on migration)
```

**Current UI pattern:**
```html
<input type="text" id="personnel" list="personnelUsersList" placeholder="Type name or email to search..." required autocomplete="off">
<datalist id="personnelUsersList">
    <option value="John Doe">John Doe (john@example.com)</option>
    ...
</datalist>
```

**Current validation flow (projects.js `validatePersonnelSelection()`):**
1. Read input value
2. Match against `usersData` by `full_name` or `email`
3. Return matched user object or show error

**Current save flow (project-detail.js `saveField('personnel', ...)`):**
1. Match input text to user in `usersData`
2. If matched: write `personnel_user_id` + `personnel_name`, clear `personnel`
3. If unmatched: write `personnel` (freetext), clear `personnel_user_id` + `personnel_name`
4. If empty: null all three fields

### Target Data Model

**New Firestore fields on `projects` collection:**
```
personnel_user_ids: string[]    // Array of user document IDs
personnel_names: string[]       // Parallel array of display names (same index = same person)
```

**Legacy fields preserved for backward compatibility:**
```
personnel_user_id: string | null    // Old single-value field (read but not written)
personnel_name: string | null       // Old single-value field (read but not written)
personnel: string | null            // Very old freetext field (read but not written)
```

**Why parallel arrays (not array of objects):**
- Consistent with existing `assigned_project_codes` pattern in the project-assignments view
- Firestore `arrayUnion`/`arrayRemove` work on primitive values, not objects (object equality is by deep comparison, fragile)
- Simpler to read/write
- Display name lookup is always by index alignment

### Recommended Project Structure (No new files needed)

```
app/views/
    projects.js          # MODIFY - pill selection in create/edit form
    project-detail.js    # MODIFY - pill selection in inline editing
styles/
    components.css       # MODIFY - add pill/chip CSS classes
app/firebase.js          # NO CHANGE NEEDED - just use plain arrays, no arrayUnion needed
```

### Pattern 1: Pill Input Container

**What:** A composite UI element: a container div styled like an input, containing pill elements and a text input for filtering.
**When to use:** Anywhere multi-select with visual feedback is needed.

```html
<!-- Pill Input Container (replaces the single <input> + <datalist>) -->
<div class="pill-input-container" id="personnelPillContainer">
    <!-- Selected users render as pills -->
    <span class="personnel-pill" data-user-id="abc123">
        John Doe
        <button class="pill-remove" onclick="window.removePersonnel('abc123')">&times;</button>
    </span>
    <span class="personnel-pill" data-user-id="def456">
        Jane Smith
        <button class="pill-remove" onclick="window.removePersonnel('def456')">&times;</button>
    </span>
    <!-- Text input for filtering (no datalist) -->
    <input type="text"
           class="pill-search-input"
           id="personnelSearchInput"
           placeholder="Type name or email..."
           oninput="window.filterPersonnelDropdown(this.value)"
           onfocus="window.showPersonnelDropdown()"
           autocomplete="off">
</div>
<!-- Custom dropdown (replaces datalist) -->
<div class="pill-dropdown" id="personnelDropdown" style="display: none;">
    <div class="pill-dropdown-item" onclick="window.selectPersonnel('abc123', 'John Doe')">
        John Doe (john@example.com)
    </div>
    ...
</div>
```

### Pattern 2: Read-Time Migration Function

**What:** A pure function that normalizes any legacy personnel format into the array format.
**When to use:** Every time project data is read for display or editing.

```javascript
/**
 * Normalize personnel data from any legacy format to array format.
 * Does NOT write back to Firestore (migrate-on-edit strategy from Phase 15).
 *
 * Input formats handled:
 * 1. New format: { personnel_user_ids: [...], personnel_names: [...] }
 * 2. Phase 15 format: { personnel_user_id: 'id', personnel_name: 'name' }
 * 3. Phase 2 format: { personnel: 'freetext name' }
 * 4. Empty: all fields null/missing
 *
 * @returns {{ userIds: string[], names: string[] }}
 */
function normalizePersonnel(project) {
    // New array format (Phase 20)
    if (Array.isArray(project.personnel_user_ids) && project.personnel_user_ids.length > 0) {
        return {
            userIds: project.personnel_user_ids,
            names: project.personnel_names || []
        };
    }

    // Phase 15 single-user format
    if (project.personnel_user_id) {
        return {
            userIds: [project.personnel_user_id],
            names: [project.personnel_name || '']
        };
    }

    // Phase 2 freetext format
    if (project.personnel) {
        return {
            userIds: [],
            names: [project.personnel]
        };
    }

    // Empty
    return { userIds: [], names: [] };
}
```

### Pattern 3: Save with Migration

**What:** When saving personnel in Phase 20, always write the new array format AND null out legacy fields.
**When to use:** Every personnel save operation (create, edit, inline save).

```javascript
// Build Firestore update payload
const personnelPayload = {
    personnel_user_ids: selectedUsers.map(u => u.id),
    personnel_names: selectedUsers.map(u => u.full_name),
    // Null out all legacy fields (migrate-on-edit)
    personnel_user_id: null,
    personnel_name: null,
    personnel: null
};
```

### Anti-Patterns to Avoid
- **Using `<datalist>` for multi-select:** Datalist is single-select by design; it cannot display pills, prevent duplicate selection, or provide removal UX.
- **Storing an array of objects:** `[{id: 'abc', name: 'John'}]` makes `arrayUnion`/`arrayRemove` unreliable because Firestore uses deep equality for objects. Use parallel arrays instead.
- **Writing legacy fields on new saves:** After Phase 20, new saves should ONLY write array fields. Legacy fields should be nulled out to complete migration.
- **Deleting legacy fields from Firestore:** Do NOT remove the old field values from documents that have not been edited. The migrate-on-edit strategy means unedited projects keep their legacy format until someone edits them.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dropdown positioning | Custom absolute positioning with scroll/resize listeners | CSS `position: absolute` relative to container with `overflow` handling | The personnel container is inside a form card, no complex positioning needed |
| Keyboard navigation in dropdown | Full arrow-key/enter/escape handling | Basic: close on Escape, select on click only | This is an internal admin tool, not a public-facing component. Full keyboard nav is scope creep |
| Debounced filtering | Custom debounce | Reuse existing `debounce()` function from projects.js (line 43-53) | Already implemented in the same file |

**Key insight:** The `usersData` array is already loaded and maintained by a real-time `onSnapshot` listener in both files. Filtering is just an in-memory array filter -- no additional Firestore queries needed.

## Common Pitfalls

### Pitfall 1: Datalist ID Collision Between Views
**What goes wrong:** Both `projects.js` and `project-detail.js` use `id="personnelUsersList"` for their datalist. If the new component also uses shared IDs, DOM collisions can occur.
**Why it happens:** SPA with view switching -- old DOM might not be fully cleaned up.
**How to avoid:** The pill dropdown is dynamically created and scoped to the container. Use unique IDs per view context (e.g., `personnelDropdown-create`, `personnelDropdown-detail`).
**Warning signs:** Dropdown appears empty or shows wrong users.

### Pitfall 2: Re-render Destroys Pill State
**What goes wrong:** In `project-detail.js`, `renderProjectDetail()` re-renders the entire container on every Firestore update (via `onSnapshot`). If the user is mid-selection, their input and dropdown state are lost.
**Why it happens:** The current pattern uses `onSnapshot` which calls `renderProjectDetail()` on any project change, even changes the user just made.
**How to avoid:** Check if the pill input is currently focused before re-rendering. If focused, skip the re-render or preserve the search input state. The current code already does this for other fields (line 244: `const focusedField = document.activeElement?.dataset?.field;`).
**Warning signs:** User types a name, presses a pill to add, and the input field resets.

### Pitfall 3: Parallel Array Index Drift
**What goes wrong:** `personnel_user_ids` and `personnel_names` arrays get out of sync (different lengths or mismatched indices).
**Why it happens:** Using `arrayUnion`/`arrayRemove` on arrays independently, or bugs in add/remove logic.
**How to avoid:** ALWAYS write both arrays together as a complete replacement. Never modify one without the other. The `selectedUsers` array in memory is the single source of truth; serialize both arrays from it on every save.
**Warning signs:** A personnel pill shows the wrong name, or a user ID appears without a corresponding name.

### Pitfall 4: Click-Outside Doesn't Close Dropdown
**What goes wrong:** The custom dropdown stays open when the user clicks elsewhere on the page.
**Why it happens:** No document-level click listener to close the dropdown.
**How to avoid:** Add a document click listener that checks if the click target is outside the pill container and dropdown, then hides the dropdown. Clean up this listener in `destroy()`.
**Warning signs:** Multiple dropdowns visible, dropdown overlaps other UI elements.

### Pitfall 5: Duplicate User Selection
**What goes wrong:** The same user appears twice in the pills.
**Why it happens:** User selects from dropdown, but the dropdown doesn't filter out already-selected users.
**How to avoid:** When rendering the dropdown items, filter out users whose IDs are already in the `selectedUsers` array. Also add a guard in the select handler.
**Warning signs:** Duplicate pills visible, duplicate IDs in the saved array.

### Pitfall 6: Legacy Freetext Personnel Display
**What goes wrong:** A project with only the legacy `personnel: "John Doe"` field (no `personnel_user_id`) cannot be displayed as a pill with a remove button, because there is no user ID to associate.
**Why it happens:** Phase 2 projects stored freetext, not user references.
**How to avoid:** The `normalizePersonnel()` function handles this by returning `userIds: [], names: ['John Doe']`. Display freetext personnel as a non-removable pill (or a removable pill that just clears the name). In the edit form, show it as a pill without a user ID -- when the user saves, it gets replaced with proper array data.
**Warning signs:** Legacy projects show no personnel at all, or crash when trying to render pills.

### Pitfall 7: Empty Array Handling
**What goes wrong:** Firestore stores `[]` differently from a missing field. Queries like `where('personnel_user_ids', 'array-contains', userId)` return nothing for projects that have never been saved with the new format.
**Why it happens:** Unedited projects don't have `personnel_user_ids` at all (field missing vs. empty array).
**How to avoid:** Use `normalizePersonnel()` at read time. Don't rely on Firestore queries against the array field for business logic -- the current system doesn't query by personnel anyway. If future queries are needed, consider a migration script.
**Warning signs:** Personnel appears missing when filtering by user assignment.

## Code Examples

### Example 1: Pill Input Container Render Function

```javascript
/**
 * Render the pill input container HTML.
 * @param {Array} selectedUsers - Array of {id, name} objects
 * @param {string} containerId - Unique ID suffix for this instance
 * @param {boolean} disabled - Whether editing is disabled
 * @returns {string} HTML string
 */
function renderPillInput(selectedUsers, containerId, disabled = false) {
    const pillsHtml = selectedUsers.map(user => `
        <span class="personnel-pill" data-user-id="${user.id || ''}">
            ${user.name}
            ${!disabled ? `<button type="button" class="pill-remove"
                onclick="window.removePersonnel_${containerId}('${user.id}')">&times;</button>` : ''}
        </span>
    `).join('');

    return `
        <div class="pill-input-container ${disabled ? 'disabled' : ''}"
             id="pillContainer_${containerId}"
             onclick="document.getElementById('pillSearch_${containerId}')?.focus()">
            ${pillsHtml}
            ${!disabled ? `
                <input type="text"
                       class="pill-search-input"
                       id="pillSearch_${containerId}"
                       placeholder="${selectedUsers.length === 0 ? 'Type name or email...' : ''}"
                       autocomplete="off">
            ` : ''}
        </div>
        <div class="pill-dropdown" id="pillDropdown_${containerId}"></div>
    `;
}
```

### Example 2: Filter and Show Dropdown

```javascript
/**
 * Filter users and show dropdown.
 * @param {string} searchText - Current input value
 * @param {Array} allUsers - usersData array from onSnapshot
 * @param {Array} selectedIds - Currently selected user IDs
 * @param {string} containerId - Unique container ID suffix
 */
function filterAndShowDropdown(searchText, allUsers, selectedIds, containerId) {
    const dropdown = document.getElementById(`pillDropdown_${containerId}`);
    if (!dropdown) return;

    const term = searchText.toLowerCase().trim();

    // Filter: exclude already-selected, match name or email
    const matches = allUsers.filter(user =>
        !selectedIds.includes(user.id) &&
        (user.full_name.toLowerCase().includes(term) ||
         user.email.toLowerCase().includes(term))
    );

    if (matches.length === 0 || !term) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = matches.map(user => `
        <div class="pill-dropdown-item"
             onmousedown="window.selectPersonnel_${containerId}('${user.id}', '${user.full_name.replace(/'/g, "\\'")}')">
            <strong>${user.full_name}</strong>
            <span style="color: #64748b; margin-left: 0.5rem;">${user.email}</span>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}
```

Note: Use `onmousedown` instead of `onclick` for dropdown items. The input's `onblur` fires before `onclick` on the dropdown item, which would close the dropdown before the click registers. `onmousedown` fires before `blur`.

### Example 3: CSS for Pill Component

```css
/* Pill Input Container - styled to look like a form input */
.pill-input-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--gray-300);
    border-radius: 4px;
    background: white;
    min-height: 38px;  /* Match existing input height */
    cursor: text;
    transition: all 0.2s;
    position: relative;
}

.pill-input-container:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
}

.pill-input-container.disabled {
    background: var(--gray-100);
    cursor: not-allowed;
}

/* Individual pill/chip */
.personnel-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: #e8f0fe;
    color: var(--primary);
    border-radius: 12px;
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Remove button on pill */
.pill-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--primary);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    border-radius: 50%;
    flex-shrink: 0;
}

.pill-remove:hover {
    background: rgba(26, 115, 232, 0.2);
}

/* Search input inside pill container (borderless) */
.pill-search-input {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    padding: 0.25rem 0 !important;
    font-size: 0.875rem;
    flex: 1;
    min-width: 120px;
    background: transparent;
}

/* Dropdown below pill container */
.pill-dropdown {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    background: white;
    border: 1px solid var(--gray-300);
    border-top: none;
    border-radius: 0 0 4px 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 50;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.pill-dropdown-item {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
}

.pill-dropdown-item:hover {
    background: var(--gray-50);
}
```

### Example 4: Backward-Compatible Save Payload

```javascript
// When saving personnel (create or edit), always write the new format
// and null out ALL legacy fields to complete migration
function buildPersonnelPayload(selectedUsers) {
    return {
        personnel_user_ids: selectedUsers.map(u => u.id),
        personnel_names: selectedUsers.map(u => u.name),
        // Null out legacy fields (Phase 15 migrate-on-edit strategy)
        personnel_user_id: null,
        personnel_name: null,
        personnel: null
    };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Freetext `personnel` string (Phase 2) | Single `personnel_user_id` + `personnel_name` with datalist (Phase 15) | Phase 15 (v2.2) | Introduced user references, migrate-on-edit |
| HTML5 `<datalist>` for single-select | Custom pill input with dropdown (Phase 20) | Phase 20 (this phase) | Enables multi-select with visual pills |
| Single string fields | Parallel arrays `personnel_user_ids[]` + `personnel_names[]` | Phase 20 (this phase) | Multiple personnel per project |

**Deprecated/outdated after Phase 20:**
- `personnel` (freetext string): Fully replaced by arrays. Cleared on edit.
- `personnel_user_id` (single string): Replaced by `personnel_user_ids` array. Cleared on edit.
- `personnel_name` (single string): Replaced by `personnel_names` array. Cleared on edit.
- HTML5 `<datalist id="personnelUsersList">`: Replaced by custom dropdown.

## Important Implementation Details

### firebase.js Does NOT Need Changes
The project does NOT need `arrayUnion`/`arrayRemove` from Firestore. The recommended approach is to write complete arrays on each save (since the full selection state is always available in the UI). This avoids the need to modify `firebase.js` exports.

### usersData is Already Available
Both `projects.js` and `project-detail.js` already load active users via `onSnapshot` into a `usersData` array. The pill component can filter this in-memory array directly -- no additional Firestore queries needed.

### Window Function Naming
Since both views need pill functionality but with different contexts, use a naming convention to avoid collisions:
- `window.removePersonnel_create` / `window.selectPersonnel_create` (projects.js create form)
- `window.removePersonnel_edit` / `window.selectPersonnel_edit` (projects.js edit form -- same instance, since create/edit share the same form)
- `window.removePersonnel_detail` / `window.selectPersonnel_detail` (project-detail.js)

Alternatively, use a single set of window functions per view module since only one form is visible at a time in each view.

### Position Context for Dropdown
The `.pill-input-container` parent (the `.form-group` div) needs `position: relative` for the absolutely-positioned dropdown. The existing `.form-group` class does NOT have `position: relative`, so this must be added specifically to the personnel form group.

### The Edit Form Shares the Create Form
In `projects.js`, the create and edit forms are the SAME DOM element (`#addProjectForm`). The form is populated differently by `toggleAddProjectForm()` (create) vs `editProject()` (edit). The pill component state needs to be initialized differently for create (empty) vs edit (populate from project data).

### project-detail.js Uses Inline Save-on-Blur
The detail page saves fields on blur (`onblur="window.saveField('personnel', this.value)"`). For the pill component, saving should happen on each add/remove action instead, since there is no single "blur" moment for a multi-element widget.

## Open Questions

1. **Should the pill component show the dropdown on focus (empty input)?**
   - What we know: Current datalist shows all options when the input is focused.
   - What's unclear: With potentially many users, showing all on focus could be overwhelming.
   - Recommendation: Show dropdown only when at least 1 character is typed. This is cleaner and more performant.

2. **Should legacy freetext personnel be editable as a pill?**
   - What we know: Projects from Phase 2 may have `personnel: "John Doe"` without a user ID.
   - What's unclear: Should this display as a removable pill or a non-interactive label?
   - Recommendation: Display as a removable pill with a distinct style (gray instead of blue). When the user removes it and adds real users, the legacy field gets nulled out on save.

3. **Maximum number of personnel per project?**
   - What we know: No explicit limit mentioned in requirements.
   - What's unclear: Should there be a practical limit?
   - Recommendation: No artificial limit. Firestore documents support arrays up to the 1MiB document size limit, which for string IDs/names would be thousands of entries -- far beyond practical use.

## Sources

### Primary (HIGH confidence)
- `app/views/projects.js` - Current single-select personnel implementation with datalist (lines 151-155, 334-395, 506-551, 800, 826-853)
- `app/views/project-detail.js` - Current inline personnel editing (lines 92-106, 179-186, 288-290, 413-466)
- `app/views/project-assignments.js` - Precedent for parallel array pattern (`assigned_project_codes[]`)
- `app/firebase.js` - Current Firestore CDN imports (v10.7.1, no `arrayUnion`/`arrayRemove` exported)
- `styles/components.css` - Existing `.badge`, `.status-badge` styling patterns (lines 481-527)
- `styles/main.css` - CSS variables and design tokens (lines 11-36)

### Secondary (MEDIUM confidence)
- [Firebase Blog: Better Arrays in Cloud Firestore](https://firebase.blog/posts/2018/08/better-arrays-in-cloud-firestore/) - Confirms Firestore array field support and atomic operations
- [Firebase Docs: Array Operations](https://docs.cloud.google.com/firestore/docs/samples/firestore-data-set-array-operations) - `arrayUnion`/`arrayRemove` API reference
- [Fireship: Firestore Array Queries](https://fireship.io/lessons/firestore-array-queries-guide/) - Array query patterns and limitations

### Tertiary (LOW confidence)
- [Smart Interface Design Patterns: Badges vs Pills vs Chips vs Tags](https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/) - UI terminology and design patterns
- [CSS Script: Best Multiple Select Libraries](https://www.cssscript.com/best-multiple-select/) - Survey of existing multi-select patterns (not used directly, confirms the general approach)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies needed, all patterns verified against existing codebase
- Architecture: HIGH - Only 2 files need changes, data model evolution is clear, precedent exists in `assigned_project_codes`
- Pitfalls: HIGH - Identified from direct code analysis of existing re-render behavior, DOM lifecycle, and Firestore patterns
- Code examples: MEDIUM - Patterns are sound but exact implementation will depend on planner decisions about component API

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable -- no external dependencies or fast-moving libraries involved)
