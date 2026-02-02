# Phase 6: Role Infrastructure & Real-time Permissions - Research

**Researched:** 2026-02-02
**Domain:** Firebase Firestore Role-Based Access Control (RBAC)
**Confidence:** MEDIUM

## Summary

This research investigates how to implement a configurable role-based permission system with real-time updates in a Firebase Firestore environment using vanilla JavaScript ES6 modules. The domain is well-established with official Firebase documentation updated in January 2026.

The standard approach for client-side role management in Firebase involves storing role templates in Firestore documents, using real-time listeners (onSnapshot) to monitor changes, and implementing UI-level permission enforcement without relying on Firebase custom claims (which require Admin SDK and backend infrastructure).

For this specific use case—a static SPA with no backend—the recommended architecture stores role configurations in a Firestore `role_templates` collection, references role names in user documents, and uses client-side real-time listeners to propagate permission changes instantly. This approach avoids the complexity of custom claims while achieving the "no logout required" requirement through Firestore's native real-time capabilities.

**Primary recommendation:** Use Firestore documents for role templates with onSnapshot listeners on both role_templates collection and individual user documents to achieve immediate permission updates without logout. Implement permission enforcement at the UI layer (navigation visibility, button disabling, view-only modes) since this is a static SPA without backend API enforcement.

## Standard Stack

The established libraries/tools for Firebase RBAC in vanilla JavaScript:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore SDK | 10.7.1 (CDN) | Database with real-time listeners | Already in use, provides onSnapshot for real-time updates |
| Firebase Auth SDK | 10.7.1 (CDN) | User authentication | Already in use, consistent version with Firestore |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | Pure JavaScript implementation | Project uses zero-build static approach |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Firestore documents | Custom claims (Admin SDK) | Custom claims require backend/Cloud Functions, 1000 byte limit, propagation requires token refresh. Documents are more flexible for this use case. |
| Client-side enforcement | Security Rules | Security Rules provide server-side enforcement but are already limited in static SPA. Both layers needed: Rules for data security, client code for UX. |
| Real-time listeners | Polling/refresh | Real-time listeners are native to Firestore, more efficient, and provide instant updates vs. polling overhead. |

**Installation:**
```bash
# Already installed via CDN in project
# No additional dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── auth.js              # Auth observer with user doc listener (existing)
├── permissions.js       # NEW: Permission checking utilities
├── router.js            # Enhanced with permission checks
└── views/
    ├── role-config.js   # NEW: Super Admin role configuration UI
    └── [existing views] # Enhanced with permission-aware rendering
```

### Pattern 1: Role Template Documents in Firestore
**What:** Store role configurations as documents in a `role_templates` collection
**When to use:** Need configurable, editable role definitions that can change at runtime

**Example:**
```javascript
// Firestore collection: role_templates
// Document ID: "super_admin"
{
  role_id: "super_admin",
  role_name: "Super Admin",
  permissions: {
    tabs: {
      dashboard: { access: true, edit: true },
      projects: { access: true, edit: true },
      procurement: { access: true, edit: true },
      finance: { access: true, edit: true },
      mrf_form: { access: true, edit: true },
      role_config: { access: true, edit: true }  // Only Super Admin
    }
  },
  created_at: Timestamp,
  updated_at: Timestamp
}

// Document ID: "finance"
{
  role_id: "finance",
  role_name: "Finance",
  permissions: {
    tabs: {
      dashboard: { access: true, edit: false },
      projects: { access: true, edit: false },
      procurement: { access: false, edit: false },
      finance: { access: true, edit: true },
      mrf_form: { access: false, edit: false },
      role_config: { access: false, edit: false }
    }
  },
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Pattern 2: Real-time Permission Updates Without Logout
**What:** Use onSnapshot listeners on role_templates and user documents to detect changes
**When to use:** Required for PERM-16, PERM-17, PERM-18, PERM-19 (real-time updates)

**Example:**
```javascript
// In permissions.js
let currentPermissions = null;
let roleTemplateUnsubscribe = null;

// Initialize permission listener when user logs in
export function initPermissionsObserver(user) {
  if (!user.role) {
    currentPermissions = null;
    return;
  }

  // Listen to the user's role template document
  const roleDocRef = doc(db, 'role_templates', user.role);

  roleTemplateUnsubscribe = onSnapshot(roleDocRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      const roleData = docSnapshot.data();
      currentPermissions = roleData.permissions;

      console.log('[Permissions] Role template updated:', user.role);

      // Dispatch event to trigger UI updates
      window.dispatchEvent(new CustomEvent('permissionsChanged', {
        detail: { permissions: currentPermissions }
      }));

      // Re-render navigation to show/hide tabs
      updateNavigationForPermissions(currentPermissions);
    }
  });
}

// Clean up listener on logout
export function destroyPermissionsObserver() {
  if (roleTemplateUnsubscribe) {
    roleTemplateUnsubscribe();
    roleTemplateUnsubscribe = null;
  }
  currentPermissions = null;
}
```

### Pattern 3: User Document Listener (Already Implemented in auth.js)
**What:** Existing onSnapshot on user document detects role changes (lines 235-261 in auth.js)
**When to use:** Handles PERM-17 and PERM-19 (user role changes)

**Enhancement needed:**
```javascript
// In auth.js, enhance existing user document listener (line 235)
userDocUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnapshot) => {
  if (docSnapshot.exists()) {
    const updatedUserData = docSnapshot.data();
    currentUser = { uid: user.uid, ...updatedUserData };

    console.log('[Auth] User document updated:', updatedUserData.status);

    // EXISTING: Handle deactivation (AUTH-09)
    if (updatedUserData.status === 'deactivated') {
      // ... existing logout logic
    }

    // NEW: Handle role change (PERM-17, PERM-19)
    if (updatedUserData.role !== currentUser.role) {
      console.log('[Auth] User role changed:', currentUser.role, '->', updatedUserData.role);

      // Trigger permission reload
      window.dispatchEvent(new CustomEvent('userRoleChanged', {
        detail: { newRole: updatedUserData.role }
      }));
    }
  }
});
```

### Pattern 4: Dynamic Navigation Menu Filtering
**What:** Show/hide navigation items based on role permissions
**When to use:** Required for PERM-13, PERM-14 (tab access control)

**Example:**
```javascript
// In router.js or new permissions.js
export function updateNavigationForPermissions(permissions) {
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const href = link.getAttribute('href');

    // Extract route from href (e.g., "#/procurement" -> "procurement")
    const route = href.replace('#/', '').split('/')[0];

    // Check if user has access to this tab
    const hasAccess = permissions?.tabs?.[route]?.access || false;

    if (hasAccess) {
      link.style.display = '';  // Show
    } else {
      link.style.display = 'none';  // Hide
    }
  });
}
```

### Pattern 5: Edit Mode vs View-Only Mode
**What:** Conditionally render edit controls based on edit permissions
**When to use:** Required for PERM-05, PERM-15 (edit vs view-only enforcement)

**Example:**
```javascript
// In view module render function
export function render(activeTab) {
  const permissions = window.getCurrentPermissions();
  const canEdit = permissions?.tabs?.procurement?.edit || false;

  return `
    <div class="procurement-view">
      <div class="actions">
        ${canEdit ? `
          <button class="btn btn-primary" onclick="window.createNewMRF()">
            Create New MRF
          </button>
          <button class="btn btn-secondary" onclick="window.editSupplier()">
            Edit Supplier
          </button>
        ` : `
          <div class="notice">
            <p>You have view-only access to this section.</p>
          </div>
        `}
      </div>

      ${canEdit ? renderEditableTable() : renderReadOnlyTable()}
    </div>
  `;
}
```

### Pattern 6: Checkbox Matrix for Role Configuration
**What:** Grid UI showing roles (columns) vs permissions (rows) with checkboxes
**When to use:** Required for PERM-03, PERM-04, PERM-05 (Super Admin role config)

**Example:**
```javascript
// In role-config.js view
function renderPermissionMatrix(roleTemplates) {
  const roles = Object.keys(roleTemplates);
  const tabs = ['dashboard', 'projects', 'procurement', 'finance', 'mrf_form'];

  return `
    <table class="permission-matrix">
      <thead>
        <tr>
          <th>Tab</th>
          <th>Permission</th>
          ${roles.map(roleId => `<th>${roleTemplates[roleId].role_name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${tabs.map(tab => `
          <tr>
            <td rowspan="2">${tab}</td>
            <td>Access</td>
            ${roles.map(roleId => {
              const hasAccess = roleTemplates[roleId].permissions.tabs[tab]?.access || false;
              return `
                <td>
                  <input
                    type="checkbox"
                    class="permission-checkbox"
                    data-role="${roleId}"
                    data-tab="${tab}"
                    data-permission="access"
                    ${hasAccess ? 'checked' : ''}
                    onchange="window.updatePermission('${roleId}', '${tab}', 'access', this.checked)"
                  >
                </td>
              `;
            }).join('')}
          </tr>
          <tr>
            <td>Edit</td>
            ${roles.map(roleId => {
              const canEdit = roleTemplates[roleId].permissions.tabs[tab]?.edit || false;
              return `
                <td>
                  <input
                    type="checkbox"
                    class="permission-checkbox"
                    data-role="${roleId}"
                    data-tab="${tab}"
                    data-permission="edit"
                    ${canEdit ? 'checked' : ''}
                    onchange="window.updatePermission('${roleId}', '${tab}', 'edit', this.checked)"
                  >
                </td>
              `;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
```

### Pattern 7: Atomic Role Template Updates
**What:** Use Firestore batch writes to update multiple role templates atomically
**When to use:** When Super Admin saves role configuration changes

**Example:**
```javascript
// In role-config.js
async function saveRoleConfiguration(changes) {
  const batch = writeBatch(db);

  // Group changes by role
  const roleChanges = {};
  changes.forEach(change => {
    if (!roleChanges[change.roleId]) {
      roleChanges[change.roleId] = {};
    }
    roleChanges[change.roleId][`permissions.tabs.${change.tab}.${change.permission}`] = change.value;
  });

  // Add updates to batch
  Object.keys(roleChanges).forEach(roleId => {
    const roleRef = doc(db, 'role_templates', roleId);
    batch.update(roleRef, {
      ...roleChanges[roleId],
      updated_at: serverTimestamp()
    });
  });

  // Commit atomically (max 500 documents per batch)
  await batch.commit();
  console.log('[RoleConfig] Role templates updated');
}
```

### Pattern 8: Permission Check Guard in Router
**What:** Redirect users attempting to access unpermitted tabs
**When to use:** Required for PERM-14 (access denied enforcement)

**Example:**
```javascript
// In router.js navigate() function (before rendering)
export async function navigate(path, tab = null, param = null) {
  // ... existing validation

  // NEW: Check permissions
  const permissions = window.getCurrentPermissions();
  const routeKey = path.replace('/', '') || 'dashboard';

  if (permissions && !permissions.tabs?.[routeKey]?.access) {
    console.warn('[Router] Access denied to:', path);

    // Show access denied or redirect to dashboard
    showAccessDenied();
    window.location.hash = '#/';
    return;
  }

  // ... continue with existing navigation logic
}

function showAccessDenied() {
  const appContainer = document.getElementById('app-container');
  appContainer.innerHTML = `
    <div class="container" style="padding: 4rem 2rem;">
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <h3>Access Denied</h3>
            <p>You don't have permission to access this page.</p>
            <button class="btn btn-primary" onclick="location.hash='#/'">
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}
```

### Anti-Patterns to Avoid
- **Don't use custom claims for this use case:** Requires Admin SDK and backend infrastructure, adds complexity for no benefit in static SPA
- **Don't poll for permission changes:** Use onSnapshot listeners instead for true real-time updates
- **Don't store permissions in localStorage:** Permissions must come from Firestore to ensure they're current and can't be tampered with
- **Don't forget to clean up listeners:** Memory leaks from uncleaned listeners, especially when role changes
- **Don't rely solely on UI enforcement:** Always implement Firestore Security Rules for actual data protection

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Real-time sync | Custom polling/WebSocket | Firestore onSnapshot | Built-in, optimized, handles reconnection, multiplexed connections |
| Permission token refresh | Manual token management | Firebase Auth getIdToken(true) | Handles refresh tokens, expiry, edge cases (only needed for custom claims approach, which we're NOT using) |
| Role hierarchy | Custom inheritance logic | Flat role templates | Simpler, more predictable, easier to audit. 5 roles is small enough for flat structure |
| Permission caching | Custom cache layer | Let Firestore SDK cache | Firestore has intelligent offline cache, handles invalidation automatically |
| Atomic multi-doc updates | Sequential writes | Firestore batch writes | Atomic, max 500 docs, simpler than transactions for write-only operations |

**Key insight:** Firestore's real-time capabilities and Firebase Auth's existing infrastructure handle most of the complexity. The main work is structuring permissions data correctly and wiring up listeners to UI updates.

## Common Pitfalls

### Pitfall 1: Security Rules Propagation Delay
**What goes wrong:** Super Admin changes role permissions, expects instant update, but active listeners take up to 10 minutes to see Security Rules changes
**Why it happens:** Firestore Security Rules changes affect new queries in ~1 minute, but active listeners can take up to 10 minutes to propagate
**How to avoid:**
  - Use Firestore document-based permissions (not Security Rules) for client-side enforcement
  - Security Rules should validate data structure, not implement RBAC logic
  - Document changes via onSnapshot propagate instantly (milliseconds), Rules changes take minutes
**Warning signs:** Users report seeing old permissions after admin changes rules

### Pitfall 2: Race Condition on Auth and Permissions
**What goes wrong:** User document listener fires, role changes, but permission listener not yet initialized, causing permission denied errors or flash of wrong UI
**Why it happens:** Asynchronous initialization order: auth loads -> user doc loads -> permissions load
**How to avoid:**
  - Initialize permission listener in auth.js after user document loads
  - Use loading states to hide UI until permissions loaded
  - Order: onAuthStateChanged -> getUserDocument -> initPermissionsObserver -> render UI
**Warning signs:** Console errors "Cannot read property 'tabs' of null", flickering navigation items

### Pitfall 3: Forgetting to Clean Up Listeners on Role Change
**What goes wrong:** User's role changes from Finance to Procurement, but old listener on "finance" role template still active, causing double updates and memory leaks
**Why it happens:** Role change requires destroying old role listener and creating new one
**How to avoid:**
  - In user document listener, detect role changes
  - Call destroyPermissionsObserver() before initPermissionsObserver(newRole)
  - Pattern: unsubscribe old -> create new -> update UI
**Warning signs:** Multiple "[Permissions] Role template updated" console logs for same change

### Pitfall 4: Permission Denied on Logout Race Condition
**What goes wrong:** User logs out, listeners cancelled, but cancel is async and permission denied error fires before listener fully stops
**Why it happens:** StreamSubscription.cancel() doesn't guarantee synchronous cancellation before auth state changes
**How to avoid:**
  - Use await when cancelling listeners: `await userDocUnsubscribe?.()`
  - Cancel listeners BEFORE calling signOut(auth)
  - Handle onSnapshot error callback to catch and suppress expected permission denied on logout
**Warning signs:** "Permission denied" errors in console during logout, hundreds of logs in Crashlytics

### Pitfall 5: Custom Claims 1000 Byte Limit
**What goes wrong:** Developer tries to store all tab permissions in custom claims, hits 1000 byte limit
**Why it happens:** Custom claims are stored in JWT, size-limited to keep tokens small
**How to avoid:** Don't use custom claims for this use case; use Firestore documents instead
**Warning signs:** Firebase error "Custom claims payload should not exceed 1000 bytes"

### Pitfall 6: Not Handling "Permission Denied" in onSnapshot Error Callback
**What goes wrong:** Permission denied errors fail silently when Security Rules reject access
**Why it happens:** onSnapshot with forbidden docRef fails silently with no console error
**How to avoid:**
  - Always use third argument error callback: `onSnapshot(ref, onNext, onError)`
  - Log errors for debugging
  - Handle permission denied gracefully with UI feedback
**Warning signs:** Features silently broken, no data loads, no error messages

```javascript
// WRONG: No error handling
onSnapshot(doc(db, 'role_templates', roleId), (snapshot) => {
  // Handle data
});

// CORRECT: Error callback included
onSnapshot(
  doc(db, 'role_templates', roleId),
  (snapshot) => {
    // Handle data
  },
  (error) => {
    console.error('[Permissions] Error listening to role template:', error);
    if (error.code === 'permission-denied') {
      // Show user-friendly message
      showPermissionError();
    }
  }
);
```

### Pitfall 7: Checkbox Matrix State Management
**What goes wrong:** User toggles checkboxes rapidly, state gets out of sync with Firestore, changes lost or overwritten
**Why it happens:** Multiple rapid writes to same document without coordination
**How to avoid:**
  - Debounce checkbox changes (300ms delay)
  - OR: Use "Save" button instead of onChange for batch commit
  - Show saving indicator to prevent rapid changes
  - Use optimistic UI updates with rollback on error
**Warning signs:** Changes don't persist, last change wins, console errors about update conflicts

## Code Examples

Verified patterns from official sources and project architecture:

### Example 1: Initialize Permission System on Login
```javascript
// In auth.js, enhance initAuthObserver() around line 199
import { initPermissionsObserver, destroyPermissionsObserver } from './permissions.js';

// Inside onAuthStateChanged after getUserDocument
if (userData) {
  currentUser = { uid: user.uid, ...userData };

  // Existing: Update navigation, handle status routing
  updateNavForAuth(currentUser);
  // ... status-based routing logic

  // NEW: Initialize permissions if user has role
  if (userData.status === 'active' && userData.role) {
    await initPermissionsObserver(currentUser);
  }

  // Existing: Dispatch auth event, setup user doc listener
  window.dispatchEvent(new CustomEvent('authStateChanged', {
    detail: { user: currentUser }
  }));

  // ... user document listener setup
} else {
  // On logout
  currentUser = null;

  // NEW: Clean up permissions
  destroyPermissionsObserver();

  // Existing: Update nav
  updateNavForAuth(null);
}
```

### Example 2: Permission Utility Module
```javascript
// NEW FILE: app/permissions.js
import { db } from './firebase.js';
import { doc, onSnapshot } from './firebase.js';

let currentPermissions = null;
let roleTemplateUnsubscribe = null;

/**
 * Get current user's permissions
 * @returns {Object|null} Permissions object or null
 */
export function getCurrentPermissions() {
  return currentPermissions;
}

/**
 * Check if user has access to a tab
 * @param {string} tabId - Tab identifier (e.g., 'procurement')
 * @returns {boolean} True if user has access
 */
export function hasTabAccess(tabId) {
  return currentPermissions?.tabs?.[tabId]?.access || false;
}

/**
 * Check if user has edit permission for a tab
 * @param {string} tabId - Tab identifier
 * @returns {boolean} True if user can edit
 */
export function canEditTab(tabId) {
  return currentPermissions?.tabs?.[tabId]?.edit || false;
}

/**
 * Initialize permissions observer for user's role
 * @param {Object} user - User object with role property
 */
export async function initPermissionsObserver(user) {
  // Clean up existing listener
  if (roleTemplateUnsubscribe) {
    roleTemplateUnsubscribe();
    roleTemplateUnsubscribe = null;
  }

  if (!user.role) {
    console.log('[Permissions] No role assigned, permissions disabled');
    currentPermissions = null;
    return;
  }

  console.log('[Permissions] Initializing observer for role:', user.role);

  const roleDocRef = doc(db, 'role_templates', user.role);

  roleTemplateUnsubscribe = onSnapshot(
    roleDocRef,
    (docSnapshot) => {
      if (docSnapshot.exists()) {
        const roleData = docSnapshot.data();
        currentPermissions = roleData.permissions;

        console.log('[Permissions] Permissions loaded:', currentPermissions);

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('permissionsChanged', {
          detail: { permissions: currentPermissions, role: user.role }
        }));
      } else {
        console.warn('[Permissions] Role template not found:', user.role);
        currentPermissions = null;
      }
    },
    (error) => {
      console.error('[Permissions] Error listening to role template:', error);

      if (error.code === 'permission-denied') {
        console.error('[Permissions] Permission denied accessing role template');
        currentPermissions = null;
      }
    }
  );
}

/**
 * Destroy permissions observer
 */
export function destroyPermissionsObserver() {
  if (roleTemplateUnsubscribe) {
    console.log('[Permissions] Destroying permissions observer');
    roleTemplateUnsubscribe();
    roleTemplateUnsubscribe = null;
  }
  currentPermissions = null;
}

// Expose to window for global access
window.getCurrentPermissions = getCurrentPermissions;
window.hasTabAccess = hasTabAccess;
window.canEditTab = canEditTab;
```

### Example 3: Default Role Template Initialization
```javascript
// One-time script or Cloud Function to initialize role templates
// Run this manually in browser console or as part of setup
import { db } from './firebase.js';
import { doc, setDoc, serverTimestamp, writeBatch } from './firebase.js';

async function initializeRoleTemplates() {
  const batch = writeBatch(db);

  const roles = [
    {
      role_id: 'super_admin',
      role_name: 'Super Admin',
      permissions: {
        tabs: {
          dashboard: { access: true, edit: true },
          projects: { access: true, edit: true },
          procurement: { access: true, edit: true },
          finance: { access: true, edit: true },
          mrf_form: { access: true, edit: true },
          role_config: { access: true, edit: true }
        }
      }
    },
    {
      role_id: 'operations_admin',
      role_name: 'Operations Admin',
      permissions: {
        tabs: {
          dashboard: { access: true, edit: false },
          projects: { access: true, edit: true },
          procurement: { access: true, edit: true },
          finance: { access: false, edit: false },
          mrf_form: { access: true, edit: true },
          role_config: { access: false, edit: false }
        }
      }
    },
    {
      role_id: 'operations_user',
      role_name: 'Operations User',
      permissions: {
        tabs: {
          dashboard: { access: true, edit: false },
          projects: { access: true, edit: false },  // See only assigned projects (filter in code)
          procurement: { access: true, edit: false },
          finance: { access: false, edit: false },
          mrf_form: { access: true, edit: true },  // Can create MRFs
          role_config: { access: false, edit: false }
        }
      }
    },
    {
      role_id: 'finance',
      role_name: 'Finance',
      permissions: {
        tabs: {
          dashboard: { access: true, edit: false },
          projects: { access: true, edit: false },
          procurement: { access: false, edit: false },
          finance: { access: true, edit: true },  // Full access to Finance tab
          mrf_form: { access: false, edit: false },
          role_config: { access: false, edit: false }
        }
      }
    },
    {
      role_id: 'procurement',
      role_name: 'Procurement',
      permissions: {
        tabs: {
          dashboard: { access: true, edit: false },
          projects: { access: true, edit: false },
          procurement: { access: true, edit: true },  // Edit procurement data
          finance: { access: false, edit: false },
          mrf_form: { access: false, edit: false },
          role_config: { access: false, edit: false }
        }
      }
    }
  ];

  roles.forEach(role => {
    const roleRef = doc(db, 'role_templates', role.role_id);
    batch.set(roleRef, {
      ...role,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });
  });

  await batch.commit();
  console.log('[Setup] Role templates initialized');
}

// Call once to initialize
// initializeRoleTemplates();
```

### Example 4: Enhanced Router with Permission Checks
```javascript
// In router.js, enhance navigate() function
export async function navigate(path, tab = null, param = null) {
  const route = routes[path];
  if (!route) {
    console.error('Route not found:', path);
    window.location.hash = '#/';
    return;
  }

  // NEW: Permission check (except for auth routes)
  const authRoutes = ['/login', '/register', '/pending'];
  if (!authRoutes.includes(path)) {
    const permissions = window.getCurrentPermissions?.();
    const routeKey = path.replace('/', '') || 'dashboard';

    if (permissions && !window.hasTabAccess?.(routeKey)) {
      console.warn('[Router] Access denied to:', path);

      // Show access denied
      const appContainer = document.getElementById('app-container');
      if (appContainer) {
        appContainer.innerHTML = `
          <div class="container" style="padding: 4rem 2rem;">
            <div class="card">
              <div class="card-body">
                <div class="empty-state">
                  <div class="empty-state-icon">🔒</div>
                  <h3>Access Denied</h3>
                  <p>You don't have permission to access this page.</p>
                  <button class="btn btn-primary" onclick="location.hash='#/'">
                    Go to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      return;
    }
  }

  // ... rest of existing navigation logic
  showLoading(true);

  // ... existing code continues
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom claims only | Firestore documents + claims | 2020-2021 | More flexible, no 1000 byte limit, easier to manage |
| Polling for changes | Real-time listeners (onSnapshot) | Native since 2017 | Instant updates, better UX, lower bandwidth |
| Security Rules for RBAC | Layered: Rules for data + client for UX | Ongoing best practice | Client-side provides UX, server-side provides security |
| Admin SDK required | Client SDK sufficient (for doc-based) | 2021+ | Static SPAs can implement RBAC without backend |
| Custom permission cache | Firestore SDK cache | Built-in since 2018 | Automatic, optimized, handles offline |

**Deprecated/outdated:**
- **Custom claims as primary RBAC:** Still valid for backend APIs, but overkill for client-only apps. Trend toward Firestore documents for flexibility.
- **Manual token refresh loops:** Firebase SDK handles this automatically. Only need `getIdToken(true)` for forced refresh (which we don't need for doc-based approach).
- **Security Rules-only enforcement:** Modern apps layer UI enforcement (fast, good UX) with Security Rules (secure, server-validated).

## Open Questions

Things that couldn't be fully resolved:

1. **Super Admin Bootstrap Process**
   - What we know: First admin account requires manual Firestore creation (carried from Phase 5)
   - What's unclear: Best UX for this - console instructions, setup script, or Cloud Function?
   - Recommendation: Document manual process in setup guide, defer automation to future phase if needed

2. **Permission Propagation Guarantees**
   - What we know: Firestore document changes via onSnapshot propagate very quickly (typically <100ms)
   - What's unclear: Official SLA or guaranteed propagation time for document changes
   - Recommendation: Assume near-instant for UX, show loading states during critical operations (MEDIUM confidence)

3. **Max Concurrent Listeners Impact**
   - What we know: Each active user has 2 listeners (user doc + role template doc)
   - What's unclear: Firestore limits on concurrent listeners per client or collection
   - Recommendation: Should be fine for expected user count (<100 concurrent), monitor if scale increases (MEDIUM confidence)

4. **Checkbox Matrix Debouncing Strategy**
   - What we know: Rapid checkbox changes can cause write conflicts
   - What's unclear: Optimal debounce delay and whether to use onChange or Save button
   - Recommendation: Start with Save button approach (simpler, atomic batch write), add debouncing if instant feedback needed (LOW confidence on best UX pattern)

5. **Role Template Versioning**
   - What we know: Role templates can be edited by Super Admin
   - What's unclear: Whether to track change history or version role configs
   - Recommendation: Start without versioning, add audit log if compliance requires (deferred decision)

## Sources

### Primary (HIGH confidence)
- [Firebase Firestore RBAC official guide](https://firebase.google.com/docs/firestore/solutions/role-based-access) - Updated January 27, 2026
- [Firebase Custom Claims documentation](https://firebase.google.com/docs/auth/admin/custom-claims) - Updated January 21-22, 2026
- [Firestore Real-time Updates (onSnapshot)](https://firebase.google.com/docs/firestore/query-data/listen) - Current documentation
- [Firestore Security Rules Getting Started](https://firebase.google.com/docs/firestore/security/get-started) - Updated January 29, 2026
- [Firestore Batch Writes and Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) - Official documentation

### Secondary (MEDIUM confidence)
- [Patterns for security with Firebase: supercharged custom claims](https://medium.com/firebase-developers/patterns-for-security-with-firebase-supercharged-custom-claims-with-firestore-and-cloud-functions-bb8f46b24e11) - Firebase Developers on Medium
- [React Firebase Authorization with Roles](https://www.robinwieruch.de/react-firebase-authorization-roles-permissions/) - Verified implementation pattern
- [Firestore Security Rules Example Guide](https://code.build/p/firestore-security-rules-example-guide-eyfhvI) - Implementation examples
- [Firestore Batches vs. Transactions: When and How to Use Them](https://medium.com/@talhatlc/firestore-batches-vs-transactions-when-and-how-to-use-them-49a83e8a7c42) - Best practices guide
- [How to Fix Firestore PERMISSION_DENIED errors](https://medium.com/firebase-tips-tricks/how-to-fix-firestore-error-permission-denied-missing-or-insufficient-permissions-777d591f404) - Error handling patterns

### Tertiary (LOW confidence)
- [SurveyJS Checkbox Matrix Example](https://surveyjs.io/form-library/examples/checkbox-matrix-question/reactjs) - UI pattern reference
- [Checkbox Design Guidelines - NN/G](https://www.nngroup.com/articles/checkboxes-design-guidelines/) - UX best practices
- [Firebase RBAC GitHub Examples](https://github.com/CodeLeom/firebase-rbac) - Community implementation
- [Firestore Query Performance Best Practices](https://estuary.dev/blog/firestore-query-best-practices/) - Performance guidance

### Project Codebase (HIGH confidence)
- `app/auth.js` (lines 1-417) - Existing auth observer with user document listener pattern
- `app/router.js` (lines 1-292) - Existing hash-based routing with tab support
- `index.html` - Navigation structure showing 5 main tabs
- `CLAUDE.md` - Project constraints: zero-build static SPA, Firebase v10.7.1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Firebase Firestore RBAC is well-documented, official patterns verified with January 2026 docs
- Architecture: MEDIUM - Document-based approach verified through multiple sources, but no official "this is the only way" guidance. Real-time listener pattern is HIGH confidence.
- Pitfalls: MEDIUM - Security Rules propagation delay (10 min) and custom claims limit (1000 bytes) are HIGH confidence (official docs). Race conditions and error handling are MEDIUM confidence (inferred from issue reports, not official guidance).
- Code examples: MEDIUM - Patterns synthesized from official docs, existing codebase, and verified community examples. Not directly copy-paste from single authoritative source.

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable domain, Firebase docs updated regularly but core patterns unlikely to change)

**Notes:**
- This research assumes NO backend/Cloud Functions based on project constraints (static SPA)
- Custom claims approach (requiring Admin SDK) deliberately NOT recommended despite being common in tutorials
- Firestore Security Rules still needed for data security, but permissions logic lives in documents
- All code examples use existing project patterns (ES6 modules, window functions, Firestore v10.7.1 CDN)
