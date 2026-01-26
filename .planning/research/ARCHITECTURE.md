# Architecture Research: Adding Auth to Existing SPA

## Route Protection with Hash Routing

### Challenge: Hash Fragment Not Sent to Server

**The Problem:**
Hash-based routing stores routes in the URL fragment (after `#`), which browsers never send to servers. This creates a challenge for deep linking when users try to access protected routes before authentication.

**Example:**
- User bookmarks: `https://app.clmc.com/#/procurement/mrfs`
- On page load, server only sees: `https://app.clmc.com/`
- JavaScript must handle the full route client-side

### Solution: Client-Side Route Guard

```javascript
// app/router.js
let currentUser = null;
let currentUserData = null;

// Auth state listener (runs before routing)
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    // Load user data
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    currentUserData = userDoc.data();

    // Check account status
    if (currentUserData.status !== 'active') {
      showPendingOrDeactivatedScreen(currentUserData.status);
      return;
    }

    // Start permissions listener
    startPermissionsListener(user.uid);
  }

  // Initial route on page load
  const hash = window.location.hash || '#/';
  await navigateToRoute(hash);
});

// Route guard
async function navigateToRoute(hash) {
  const path = hash.replace('#', '') || '/';

  // Public routes (no auth required)
  const publicRoutes = ['/login', '/register'];
  if (publicRoutes.includes(path)) {
    await loadView(path);
    return;
  }

  // Protected routes
  if (!currentUser) {
    // Not logged in - redirect to login, save intended destination
    sessionStorage.setItem('redirectAfterLogin', hash);
    window.location.hash = '#/login';
    return;
  }

  // Check permissions
  const permissionCheck = await checkRoutePermissions(path, currentUserData);

  if (!permissionCheck.allowed) {
    showAccessDenied(permissionCheck.reason);
    window.location.hash = '#/'; // Redirect to home
    return;
  }

  // Load view with permission level
  await loadView(path, permissionCheck.level, currentUserData);
}

// Intercept hash changes
window.addEventListener('hashchange', async () => {
  await navigateToRoute(window.location.hash);
});
```

### Post-Login Redirect

```javascript
// After successful login
async function handleLogin(email, password) {
  await signInWithEmailAndPassword(auth, email, password);

  // Auth state listener will fire, which checks for redirect
  const intendedRoute = sessionStorage.getItem('redirectAfterLogin');
  if (intendedRoute) {
    sessionStorage.removeItem('redirectAfterLogin');
    window.location.hash = intendedRoute;
  } else {
    window.location.hash = '#/';
  }
}
```

---

## Permission Checking at Render Time

### Layered Permission Architecture

**Layer 1: Route-Level (Router)**
- Checks if user can access the tab at all
- `permissions[tab] !== 'none'`
- Enforced before view loads

**Layer 2: View-Level (Init)**
- Checks edit vs view-only mode
- `permissions[tab] === 'edit'` or `'view'`
- Determines UI rendering (show/hide buttons, enable/disable inputs)

**Layer 3: Action-Level (Functions)**
- Validates before executing writes
- Double-check permissions before Firestore operations
- Last line of defense against client-side tampering

**Layer 4: Server-Level (Firestore Rules)**
- True security enforcement
- Cannot be bypassed by client manipulation
- Validates user document status and permissions

### Implementation Pattern

```javascript
// Layer 1: Router
async function checkRoutePermissions(path, userData) {
  const routeMap = {
    '/': 'home',
    '/mrf-form': 'mrf_form',
    '/procurement': 'procurement',
    '/finance': 'finance',
    '/projects': 'projects',
    '/admin': 'admin'
  };

  const permKey = routeMap[path];
  const permLevel = userData.permissions[permKey];

  if (permLevel === 'none') {
    return { allowed: false, reason: 'No access to this section' };
  }

  return { allowed: true, level: permLevel };
}

// Layer 2: View
export async function init(activeTab = null) {
  const permLevel = currentUserData.permissions.procurement;

  if (permLevel === 'view') {
    renderViewOnlyMode();
  } else {
    renderEditMode();
  }

  // Load data with filtering
  await loadDataForUser(currentUserData);
}

function renderViewOnlyMode() {
  // Disable inputs
  document.querySelectorAll('input, select, textarea, button').forEach(el => {
    if (!el.classList.contains('nav-btn')) { // Keep navigation enabled
      el.disabled = true;
    }
  });

  // Hide action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.style.display = 'none';
  });

  // Show indicator
  const banner = document.createElement('div');
  banner.className = 'view-only-banner';
  banner.textContent = '👁️ View-only mode';
  document.querySelector('#content').prepend(banner);
}

// Layer 3: Action
async function approveMRF(mrfId) {
  // Check permission before action
  if (currentUserData.permissions.procurement !== 'edit') {
    showError('You do not have permission to approve MRFs');
    return;
  }

  // Check project access
  const mrfDoc = await getDoc(doc(db, 'mrfs', mrfId));
  const mrf = mrfDoc.data();

  if (!hasProjectAccess(mrf.project_code, currentUserData)) {
    showError('You do not have access to this project');
    return;
  }

  // Proceed with approval
  await updateDoc(doc(db, 'mrfs', mrfId), {
    status: 'Approved',
    approvedBy: currentUser.uid,
    approvedAt: serverTimestamp()
  });
}

// Layer 4: Firestore Rules (server-side)
// See STACK.md for security rules examples
```

---

## Data Filtering by User Permissions

### Query-Level Filtering

**Problem:** Operations Users should only see MRFs for their assigned projects.

**Solution:** Filter Firestore queries based on `assignedProjects`.

```javascript
async function loadMRFsForUser(userData) {
  let mrfsQuery;

  if (userData.assignedProjects.includes('all')) {
    // No filtering - admin sees all
    mrfsQuery = query(
      collection(db, 'mrfs'),
      orderBy('date_needed', 'desc')
    );
  } else if (userData.assignedProjects.length > 0) {
    // Filter by assigned projects
    // Note: Firestore 'in' queries limited to 10 items
    if (userData.assignedProjects.length <= 10) {
      mrfsQuery = query(
        collection(db, 'mrfs'),
        where('project_code', 'in', userData.assignedProjects),
        orderBy('date_needed', 'desc')
      );
    } else {
      // Handle >10 projects: batch queries
      const batches = chunkArray(userData.assignedProjects, 10);
      const allMRFs = [];

      for (const batch of batches) {
        const batchQuery = query(
          collection(db, 'mrfs'),
          where('project_code', 'in', batch)
        );
        const snapshot = await getDocs(batchQuery);
        snapshot.forEach(doc => allMRFs.push({ id: doc.id, ...doc.data() }));
      }

      // Sort in memory
      allMRFs.sort((a, b) => b.date_needed - a.date_needed);
      return allMRFs;
    }
  } else {
    // No projects assigned - return empty
    return [];
  }

  const snapshot = await getDocs(mrfsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

### Real-Time Listener Filtering

```javascript
async function startMRFListener(userData) {
  let mrfsQuery;

  if (userData.assignedProjects.includes('all')) {
    mrfsQuery = query(collection(db, 'mrfs'));
  } else {
    mrfsQuery = query(
      collection(db, 'mrfs'),
      where('project_code', 'in', userData.assignedProjects.slice(0, 10))
    );
  }

  const unsubscribe = onSnapshot(mrfsQuery, (snapshot) => {
    mrfsData = [];
    snapshot.forEach(doc => {
      mrfsData.push({ id: doc.id, ...doc.data() });
    });
    renderMRFsTable();
  });

  listeners.push(unsubscribe);
}
```

### Firestore Rules Enforcement

**Critical:** Client-side filtering is for UX only. Security Rules enforce access:

```javascript
// Firestore rules
match /mrfs/{mrfId} {
  allow read: if isAuthenticated() && hasProjectAccess(resource.data.project_code);
  allow write: if isAuthenticated() && canEditProcurement() && hasProjectAccess(request.resource.data.project_code);
}

function hasProjectAccess(projectCode) {
  let userData = getUserData();
  return userData.status == 'active' &&
         (userData.assignedProjects.hasAny(['all']) ||
          userData.assignedProjects.hasAny([projectCode]));
}

function canEditProcurement() {
  let userData = getUserData();
  return userData.status == 'active' &&
         userData.permissions.procurement == 'edit';
}

function getUserData() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}
```

---

## Migration Strategy

### Phased Rollout Approach

**Phase 1: Add Auth Without Breaking Existing System**
1. Implement Firebase Auth
2. Add `users` collection
3. Create login/register pages
4. **Keep existing routes accessible without auth** (temporary)
5. Test authentication flow

**Phase 2: Add Permissions (Soft Enforcement)**
1. Add permissions to user documents
2. Implement router checks (with bypass for admins)
3. Add UI-level restrictions (hide/disable)
4. Test permission UX
5. **Still allow data access** (no Firestore Rules yet)

**Phase 3: Hard Enforcement**
1. Deploy Firestore Security Rules
2. Test thoroughly in staging
3. Remove auth bypass
4. **Now system is fully secured**

**Phase 4: Add New Features**
1. Projects tab
2. Payment tracking
3. Invoice uploads

### Data Migration: Existing Records

**Problem:** Existing MRFs don't have `project_code` field.

**Solutions:**

**Option A: Require Backfill (Recommended)**
```javascript
// One-time migration script
async function backfillProjectCodes() {
  const mrfsSnapshot = await getDocs(collection(db, 'mrfs'));

  const batch = writeBatch(db);
  let count = 0;

  mrfsSnapshot.forEach(doc => {
    const mrf = doc.data();

    if (!mrf.project_code) {
      // Map project_name to project_code
      const projectCode = lookupProjectCode(mrf.project_name);

      batch.update(doc.ref, {
        project_code: projectCode,
        migratedAt: serverTimestamp()
      });

      count++;
    }

    // Firestore batch limit is 500
    if (count % 500 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  });

  if (count % 500 !== 0) {
    await batch.commit();
  }

  console.log(`Backfilled ${count} MRFs`);
}

function lookupProjectCode(projectName) {
  // Manual mapping or lookup from projects collection
  // This may require admin input for ambiguous names
}
```

**Option B: Graceful Degradation**
```javascript
// Firestore rules allow null project_code temporarily
match /mrfs/{mrfId} {
  allow read: if isAuthenticated() &&
                 (resource.data.project_code == null ||
                  hasProjectAccess(resource.data.project_code));
}

// UI shows "No Project Assigned" for legacy MRFs
function displayProjectInfo(mrf) {
  if (mrf.project_code) {
    return `${mrf.project_name} (${mrf.project_code})`;
  } else {
    return `${mrf.project_name} <span class="legacy-badge">Legacy</span>`;
  }
}
```

**Recommendation:** Use Option A with admin-assisted mapping for critical project names.

---

## State Management for Sessions

### Minimal State Pattern (No Framework)

**Global State Object:**
```javascript
// app/state.js
export const AppState = {
  user: null,           // Firebase User object
  userData: null,       // Firestore user document data
  permissions: null,    // Quick access to permissions
  listeners: [],        // Active Firestore listeners
  initialized: false
};

export function setUser(user, userData) {
  AppState.user = user;
  AppState.userData = userData;
  AppState.permissions = userData?.permissions;
}

export function clearUser() {
  AppState.user = null;
  AppState.userData = null;
  AppState.permissions = null;
}

export function addListener(unsubscribe) {
  AppState.listeners.push(unsubscribe);
}

export function cleanupListeners() {
  AppState.listeners.forEach(unsub => unsub?.());
  AppState.listeners = [];
}
```

**Usage in Router:**
```javascript
import { AppState, setUser, clearUser } from './state.js';

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    setUser(user, userDoc.data());
  } else {
    clearUser();
    cleanupListeners();
  }

  await navigateToRoute(window.location.hash);
});
```

**Usage in Views:**
```javascript
import { AppState } from '../state.js';

export async function init() {
  if (!AppState.user) {
    console.error('User not authenticated');
    return;
  }

  const permLevel = AppState.permissions.procurement;
  // ... render based on permissions
}
```

### Session Persistence

Firebase handles session persistence automatically via `localStorage`:

```javascript
// Default: persist across browser restarts
// No configuration needed

// Optional: Change to session-only (cleared when tab closes)
import { setPersistence, browserSessionPersistence } from 'firebase/auth';
await setPersistence(auth, browserSessionPersistence);
```

---

## Real-Time Permission Updates

### Firestore Listener Pattern

**Requirement:** When admin changes user permissions, user's session should update immediately.

```javascript
// Start listener when user logs in
function startPermissionsListener(userId) {
  const userDocRef = doc(db, 'users', userId);

  const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
    const updatedData = docSnap.data();

    // Detect permission changes
    if (JSON.stringify(updatedData.permissions) !== JSON.stringify(AppState.permissions)) {
      console.log('[Permissions] Updated:', updatedData.permissions);

      // Update app state
      AppState.userData = updatedData;
      AppState.permissions = updatedData.permissions;

      // Refresh current view
      const currentHash = window.location.hash;
      navigateToRoute(currentHash);

      // Notify user
      showNotification('Your permissions have been updated. Page refreshed.');
    }

    // Detect account deactivation
    if (updatedData.status === 'deactivated') {
      console.log('[Auth] Account deactivated');
      signOut(auth);
      showError('Your account has been deactivated by an administrator.');
    }
  });

  addListener(unsubscribe);
}
```

**Refresh Strategy:**
- **Tab restrictions**: Re-render navigation (show/hide tabs)
- **View restrictions**: Reload current view with new permission level
- **Data filtering**: Restart data listeners with updated project access

---

## Architecture Decisions Summary

| Decision | Chosen Approach | Rationale |
|----------|----------------|-----------|
| **Auth Provider** | Firebase Auth (email/password) | Zero-backend, mature, well-documented |
| **Permission Storage** | Firestore `users` collection | No Admin SDK needed, real-time updates |
| **Route Protection** | Client-side guard + Firestore Rules | Hash routing requires client-side, rules enforce security |
| **Permission Layers** | 4-layer (route/view/action/server) | Defense in depth, good UX |
| **Data Filtering** | Query-level + Rules enforcement | Efficient, secure, real-time compatible |
| **Migration Strategy** | Phased rollout (4 phases) | Minimize disruption, testable increments |
| **Existing Data** | Backfill with admin mapping | Clean data model, explicit project assignment |
| **State Management** | Minimal global state object | No framework overhead, sufficient for SPA |
| **Permission Updates** | Real-time listener + view refresh | Immediate effect as required |

---

## Sources

- [Single Page Application Routing Using Hash or URL](https://dev.to/thedevdrawer/single-page-application-routing-using-hash-or-url-9jh)
- [Maintaining Route Information During SPA Authentication](https://www.bennadel.com/blog/4108-maintaining-route-information-during-spa-single-page-application-authentication-in-lucee-cfml.htm)
- [SPA Routing and Navigation: Best Practices](https://docsallover.com/blog/ui-ux/spa-routing-and-navigation-best-practices/)
- [Secure Data Access for Users and Groups - Firestore](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [Permission-based Access in Firestore](https://vojtechstruhar.medium.com/permission-based-access-in-google-firestore-a8eefd10111e)
- [Hash Routing - MDN](https://developer.mozilla.org/en-US/docs/Glossary/Hash_routing)
