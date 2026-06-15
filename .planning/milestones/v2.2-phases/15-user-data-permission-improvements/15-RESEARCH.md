# Phase 15: User Data & Permission Improvements - Research

**Researched:** 2026-02-06
**Domain:** Authentication-driven form auto-population and role-based permission enforcement
**Confidence:** HIGH

## Summary

Phase 15 implements two distinct but related improvements: (1) auto-populating user data from Firebase Auth into form fields, and (2) enforcing role-based permissions for project creation. The existing authentication and permissions infrastructure (app/auth.js, app/permissions.js) already provides `getCurrentUser()` and role checking utilities, making implementation straightforward.

The standard approach uses `getCurrentUser()` to retrieve the logged-in user's full_name during form initialization, populating it into a readonly field (or removing the input entirely). For permission enforcement, the existing `getCurrentUser().role` check determines whether users can access the "Add Project" form. For the personnel field transformation, the HTML5 `<datalist>` element provides native typeahead functionality without external libraries, paired with validation to ensure selected users exist in the Firestore `users` collection.

**Primary recommendation:** Use readonly input fields for auto-populated user data (not disabled, so values submit with the form). Transform the personnel field from freetext to a `<datalist>` with real-time filtering from the `users` collection, storing user IDs instead of names for referential integrity.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Auth | v10.7.1 (CDN) | User authentication | Already integrated, provides `getCurrentUser()` via app/auth.js wrapper |
| Firebase Firestore | v10.7.1 (CDN) | User document storage | Already integrated, stores full_name in users collection |
| HTML5 Datalist | Native | Typeahead/autocomplete | Native browser feature, no dependencies, accessibility built-in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| onSnapshot | Firestore v10.7.1 | Real-time user list | For personnel field dropdown that updates live when users added |
| getCurrentUser | app/auth.js | Auth state access | Already exists in codebase, returns full user document with full_name |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HTML5 Datalist | Custom typeahead (e.g., Choices.js, Awesomplete) | Datalist is native, zero dependencies, works in zero-build environment. Custom libraries add complexity for minimal UX gain in this use case. |
| Readonly input | Disabled input | Disabled fields don't submit with form data. Readonly submits but prevents editing. Use readonly for auto-populated data that needs to be stored. |
| Remove field entirely | Keep as readonly display | Keeping as readonly shows users "this is who you are" and includes value in form submission for backend validation. |

**Installation:**
```bash
# No installation needed - Firebase Auth and Firestore already in project
# HTML5 datalist is native browser functionality
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── auth.js              # getCurrentUser() helper (already exists)
├── permissions.js       # hasTabAccess() helper (already exists)
├── utils.js             # Shared utilities (already exists)
└── views/
    ├── mrf-form.js      # Auto-populate requestor_name from getCurrentUser()
    ├── projects.js      # Restrict "Add Project" button by role
    └── project-detail.js # Same role check for edit forms
```

### Pattern 1: Auto-Populate Form Fields from Auth
**What:** Use `getCurrentUser()` to retrieve user data, then populate form fields during init()
**When to use:** Any form that needs to capture "who submitted this"
**Example:**
```javascript
// In init() function of mrf-form.js
export async function init() {
    const user = window.getCurrentUser?.();
    if (user && user.full_name) {
        const requestorInput = document.getElementById('requestorName');
        if (requestorInput) {
            requestorInput.value = user.full_name;
            requestorInput.readOnly = true; // Prevents editing but submits value
            requestorInput.style.background = '#f8fafc'; // Visual indicator
            requestorInput.style.cursor = 'not-allowed';
        }
    }
}
```

### Pattern 2: Role-Based Form Access Control
**What:** Check user role before showing create/edit forms
**When to use:** When only certain roles should create documents
**Example:**
```javascript
// In render() function of projects.js
export function render(activeTab = null) {
    const user = window.getCurrentUser?.();
    const canCreateProject = user?.role === 'super_admin' || user?.role === 'operations_admin';

    return `
        ${canCreateProject ? `
            <button class="btn btn-primary" onclick="toggleAddProjectForm()">Add Project</button>
        ` : ''}
    `;
}

// In toggleAddProjectForm() guard
function toggleAddProjectForm() {
    const user = window.getCurrentUser?.();
    if (user?.role !== 'super_admin' && user?.role !== 'operations_admin') {
        showToast('Only Operations Admin and Super Admin can create projects', 'error');
        return;
    }
    // Continue with form display...
}
```

### Pattern 3: HTML5 Datalist with Firestore Data
**What:** Native typeahead using `<datalist>` populated from Firestore users collection
**When to use:** Selecting from a known list of users/entities that changes over time
**Example:**
```html
<!-- HTML in render() -->
<div class="form-group">
    <label>Personnel (Required) *</label>
    <input type="text"
           id="personnel"
           list="usersList"
           placeholder="Type name or email to search..."
           required>
    <datalist id="usersList">
        <!-- Options populated dynamically -->
    </datalist>
    <small class="form-hint">Select a user from the list</small>
</div>
```

```javascript
// In init() function - load users with real-time listener
let usersListener = null;
let availableUsers = [];

export async function init() {
    const usersQuery = query(
        collection(db, 'users'),
        where('status', '==', 'active')
    );

    usersListener = onSnapshot(usersQuery, (snapshot) => {
        availableUsers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            availableUsers.push({
                id: doc.id,
                full_name: data.full_name,
                email: data.email
            });
        });
        populatePersonnelDatalist();
    });
}

function populatePersonnelDatalist() {
    const datalist = document.getElementById('usersList');
    if (!datalist) return;

    datalist.innerHTML = availableUsers.map(user =>
        `<option value="${user.email}" data-user-id="${user.id}">${user.full_name} (${user.email})</option>`
    ).join('');
}

// Validation on form submit
async function validatePersonnelSelection() {
    const personnelInput = document.getElementById('personnel');
    const selectedEmail = personnelInput.value.trim();

    // Check if selected value matches an available user
    const selectedUser = availableUsers.find(u => u.email === selectedEmail);
    if (!selectedUser) {
        showToast('Please select a valid user from the list', 'error');
        return false;
    }

    return selectedUser.id; // Return user ID for storage
}
```

### Anti-Patterns to Avoid
- **Disabled fields for auto-populated data:** Disabled fields don't submit with the form. Use `readonly` instead.
- **Storing user names as freetext:** Names can change. Store user IDs and denormalize the name for display.
- **Client-only permission checks:** Always implement server-side enforcement via Firestore Security Rules.
- **Custom autocomplete libraries in zero-build SPA:** HTML5 datalist provides native functionality without dependencies.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User autocomplete/typeahead | Custom dropdown with filtering logic | HTML5 `<datalist>` element | Native, accessible, works without JavaScript, no library dependencies. Safari support improved in recent versions. |
| Form field access control | Manual role checks in every function | Centralized guard pattern with early returns | Prevents missed checks, single source of truth, easier to audit. |
| User data validation | Regex checks on names/emails | Firestore query to verify user exists | Names change, emails change. Referential integrity requires database lookup. |
| Permission state management | Manual state tracking in views | Existing `getCurrentUser()` and real-time listeners | Auth state already centralized in app/auth.js with real-time updates. |

**Key insight:** Firebase Auth + Firestore already solve identity and permissions. Don't replicate this logic in views. HTML5 datalist solves typeahead without libraries in a zero-build environment.

## Common Pitfalls

### Pitfall 1: Using disabled instead of readonly for auto-populated fields
**What goes wrong:** Disabled form fields don't submit their values with the form. If the MRF form has a disabled requestor_name field, the backend receives an empty value.
**Why it happens:** Developers assume "user can't edit" means "use disabled". But disabled removes the field from form submission entirely.
**How to avoid:** Use `readonly` attribute for auto-populated fields that need to submit. Style with background color to indicate non-editable.
**Warning signs:** Backend validation errors about missing required fields that appear filled in the UI.

### Pitfall 2: Storing user display names instead of user IDs
**What goes wrong:** When a user changes their name, all project personnel references become stale. Searching for "who worked on project X" fails because the name doesn't match anymore.
**Why it happens:** Freetext fields are easier to implement initially. But they create referential integrity problems.
**How to avoid:** Store user IDs in personnel field. Denormalize the display name separately if needed for performance. Query the users collection to resolve current names.
**Warning signs:** Project personnel shows incorrect names, or "user not found" errors when resolving old assignments.

### Pitfall 3: Client-only permission checks without Firestore Rules
**What goes wrong:** Users can bypass UI restrictions by manipulating requests via browser DevTools or API calls. They create projects even though the button is hidden.
**Why it happens:** Frontend code hides the "Add Project" button, but Firestore allows writes from any authenticated user.
**How to avoid:** Implement Firestore Security Rules that check user role before allowing document creation. Client-side checks are UX, not security.
**Warning signs:** Audit logs show documents created by unauthorized users despite UI restrictions.

### Pitfall 4: Datalist validation ignored on form submit
**What goes wrong:** Users can type arbitrary text in a datalist input because it accepts freeform values. If not validated, invalid user references get stored.
**Why it happens:** Datalist provides suggestions, not restrictions. Browsers allow any input value.
**How to avoid:** On form submit, validate that the input value matches one of the options in the datalist (or exists in availableUsers array).
**Warning signs:** Database contains personnel references that don't match any user records.

### Pitfall 5: Forgetting to clean up real-time listeners
**What goes wrong:** Firestore listeners for the users collection stay active after leaving the view, causing memory leaks and unnecessary Firestore reads.
**Why it happens:** init() sets up onSnapshot but destroy() doesn't unsubscribe.
**How to avoid:** Store unsubscribe functions in a listeners array, call them in destroy(). Follow the pattern used in other views (projects.js, procurement.js).
**Warning signs:** Firestore read counts increase over time even with no user activity. Browser memory usage grows.

## Code Examples

Verified patterns from official sources:

### Auto-Populate from Firebase Auth (getCurrentUser pattern)
```javascript
// Source: https://firebase.google.com/docs/auth/web/manage-users
// Pattern: app/auth.js getCurrentUser() wrapper (already exists in codebase)

export async function init() {
    const user = window.getCurrentUser?.();

    if (user && user.full_name) {
        const requestorInput = document.getElementById('requestorName');
        if (requestorInput) {
            // Set value from user document
            requestorInput.value = user.full_name;

            // Make readonly (submits value but prevents editing)
            requestorInput.readOnly = true;

            // Visual styling to indicate non-editable
            requestorInput.style.background = '#f8fafc';
            requestorInput.style.cursor = 'not-allowed';
            requestorInput.style.color = '#64748b';
        }
    }
}
```

### Role-Based Form Access (permission guard pattern)
```javascript
// Source: https://www.cerbos.dev/blog/role-based-access-control-in-javascript
// Adapted for existing getCurrentUser() pattern

// In render() - hide button for unauthorized roles
export function render(activeTab = null) {
    const user = window.getCurrentUser?.();
    const canCreate = user?.role === 'super_admin' || user?.role === 'operations_admin';

    return `
        <div class="suppliers-header">
            <h2>Project Management</h2>
            ${canCreate ? `
                <button class="btn btn-primary" onclick="toggleAddProjectForm()">Add Project</button>
            ` : ''}
        </div>
    `;
}

// In action handler - guard with early return
function toggleAddProjectForm() {
    const user = window.getCurrentUser?.();

    // Permission guard (defense in depth)
    if (!user || (user.role !== 'super_admin' && user.role !== 'operations_admin')) {
        showToast('Only Operations Admin and Super Admin can create projects', 'error');
        return; // Early return prevents unauthorized access
    }

    // Continue with authorized logic...
    const form = document.getElementById('addProjectForm');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        // ... rest of form display logic
    }
}
```

### HTML5 Datalist with Real-Time Firestore Data
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/datalist
// Source: https://fireship.io/lessons/typeahead-autocomplete-with-firestore/

// Module-level state
let usersListener = null;
let availableUsers = [];

export async function init() {
    // Query active users only
    const usersQuery = query(
        collection(db, 'users'),
        where('status', '==', 'active')
    );

    // Real-time listener updates datalist when users added/removed
    usersListener = onSnapshot(usersQuery, (snapshot) => {
        availableUsers = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            availableUsers.push({
                id: doc.id,
                full_name: data.full_name,
                email: data.email
            });
        });

        // Sort alphabetically for better UX
        availableUsers.sort((a, b) => a.full_name.localeCompare(b.full_name));

        populatePersonnelDatalist();
    });

    listeners.push(usersListener);
}

function populatePersonnelDatalist() {
    const datalist = document.getElementById('usersList');
    if (!datalist) return;

    // Create options with both name and email visible
    datalist.innerHTML = availableUsers.map(user =>
        `<option value="${user.email}">${user.full_name} (${user.email})</option>`
    ).join('');
}

// Validation on form submit
function validatePersonnelField() {
    const personnelInput = document.getElementById('personnel');
    const selectedValue = personnelInput.value.trim();

    if (!selectedValue) {
        showToast('Personnel field is required', 'error');
        return null;
    }

    // Verify selection matches a valid user
    const selectedUser = availableUsers.find(u =>
        u.email === selectedValue || u.full_name === selectedValue
    );

    if (!selectedUser) {
        showToast('Please select a valid user from the dropdown', 'error');
        return null;
    }

    // Return user ID for storage (not name)
    return selectedUser.id;
}

// In form submit handler
async function addProject() {
    // ... existing validation ...

    const personnelUserId = validatePersonnelField();
    if (!personnelUserId) return; // Validation failed

    // Store user ID for referential integrity
    await addDoc(collection(db, 'projects'), {
        // ... other fields ...
        personnel_user_id: personnelUserId,
        personnel_name: availableUsers.find(u => u.id === personnelUserId)?.full_name, // Denormalized for display
        created_at: new Date().toISOString()
    });
}

export async function destroy() {
    // Clean up listener
    if (usersListener) {
        usersListener();
        usersListener = null;
    }
    availableUsers = [];
}
```

### Firestore Security Rules for Role-Based Creation
```javascript
// Source: https://firebase.google.com/docs/firestore/security/rules-conditions
// File: firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper function to check user role
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }

    // Helper function to check if user can create projects
    function canCreateProject() {
      let role = getUserRole();
      return role == 'super_admin' || role == 'operations_admin';
    }

    match /projects/{projectId} {
      // Only super_admin and operations_admin can create
      allow create: if request.auth != null && canCreateProject();

      // Update/delete permissions (existing logic)
      allow update, delete: if request.auth != null && canCreateProject();

      // Read permissions (existing logic - depends on role and assignments)
      allow read: if request.auth != null;
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual username input in forms | Auto-populate from Firebase Auth user document | v2.0+ (2024+) | Reduces errors, ensures consistency, better audit trails |
| Freetext personnel field | Structured user selection with validation | v2.2 (Phase 15, 2026) | Referential integrity, enables reassignment when users change |
| Client-side permission checks only | Client + Firestore Security Rules enforcement | v2.1 (Phase 11, 2025) | Defense in depth, prevents unauthorized API access |
| Custom autocomplete libraries | HTML5 datalist native functionality | 2020+ | Zero dependencies, works in zero-build SPAs, accessibility built-in |

**Deprecated/outdated:**
- **Disabled attribute for non-editable fields:** Use readonly instead. Disabled fields don't submit values.
- **Storing user names as strings:** Store user IDs. Denormalize names if needed for performance.
- **jQuery autocomplete plugins:** HTML5 datalist provides native functionality without jQuery dependency.

## Open Questions

Things that couldn't be fully resolved:

1. **Should the MRF form remove the "Your Name" field entirely or keep it as readonly?**
   - What we know: Readonly inputs submit their values with the form. Removing the field entirely requires storing the user ID separately in the MRF document.
   - What's unclear: Which approach better serves audit requirements and user understanding.
   - Recommendation: Keep as readonly initially. Users see "this is who I am" confirmation. Backend still receives full_name for validation. Can be refactored to remove field + store user_id in a future phase.

2. **How should personnel field handle multiple user assignments?**
   - What we know: Current v1.0 personnel field is freetext, suggests comma-separated values. Phase 15 success criteria say "Personnel field is required" (singular).
   - What's unclear: Future roadmap for multi-user assignments vs single project manager assignment.
   - Recommendation: Implement single-user selection for Phase 15 (matches "is required" singular phrasing). If multi-assignment needed later, can extend with a separate multi-select component or dedicated assignments table.

3. **Should existing projects with freetext personnel be migrated?**
   - What we know: v1.0 projects may have freetext personnel values that don't match user records.
   - What's unclear: Whether to run a data migration or treat it as a breaking change for new projects only.
   - Recommendation: Make the user-selection personnel field required for new projects only. Existing projects keep their freetext personnel field (stored in `personnel` field). New projects use `personnel_user_id` field. Display logic checks which field exists.

## Sources

### Primary (HIGH confidence)
- [Firebase Auth Web Manage Users](https://firebase.google.com/docs/auth/web/manage-users) - getCurrentUser() pattern, user properties
- [Firebase Firestore Security Rules Conditions](https://firebase.google.com/docs/firestore/security/rules-conditions) - Role-based write rules with get() function
- [MDN HTML Datalist Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/datalist) - Native typeahead specification
- [Fireship Typeahead Autocomplete with Firestore](https://fireship.io/lessons/typeahead-autocomplete-with-firestore/) - Real-time filtering pattern
- Existing codebase: app/auth.js (getCurrentUser implementation), app/permissions.js (hasTabAccess pattern), app/views/mrf-form.js (form structure)

### Secondary (MEDIUM confidence)
- [MDN Input Autocomplete Attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete) - Browser autofill hints
- [Medium: Read Only vs Disabled](https://medium.com/@1746515754keig/read-only-vs-disabled-b600a6203026) - Form field behavior differences
- [Cerbos Role-Based Access Control in JavaScript](https://www.cerbos.dev/blog/role-based-access-control-in-javascript) - Permission guard patterns
- [CSS-Tricks: Handling User Permissions in JavaScript](https://css-tricks.com/handling-user-permissions-in-javascript/) - UI permission patterns

### Tertiary (LOW confidence)
- None - all findings verified with official documentation or existing codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Firebase Auth v10.7.1 already integrated, getCurrentUser() exists, HTML5 datalist is native
- Architecture: HIGH - Patterns match existing codebase structure (readonly pattern from other forms, permission guards from projects.js)
- Pitfalls: HIGH - Based on common Firebase Auth + Firestore integration mistakes documented in official Firebase guidance

**Research date:** 2026-02-06
**Valid until:** 60 days (stable domain - Firebase Auth patterns don't change frequently, HTML5 datalist is standardized)
