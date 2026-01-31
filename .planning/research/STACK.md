# Stack Research: Firebase Authentication & Permissions

**Domain:** Authentication and role-based access control for static SPA
**Researched:** 2026-01-31
**Confidence:** HIGH

## Executive Summary

Firebase Authentication v10.7.1 (current project version) with email/password provider combined with **Firestore-based RBAC** is recommended for this procurement system. While Firebase custom claims are powerful, they require Firebase Admin SDK which cannot run client-side in a zero-build static SPA. The hybrid approach—storing roles in Firestore with custom claims mirrored for security rules—provides the best balance of security, immediate updates, and zero-build compatibility.

**Key Decision:** Firestore-based roles with security rules enforcement (not custom claims alone) because Admin SDK cannot be used in static SPA environment.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Firebase Auth | 10.7.1 (CDN) | User authentication, session management | Already in use, email/password provider simple and secure, CDN distribution matches project's zero-build pattern |
| Firebase Firestore | 10.7.1 (CDN) | User profiles, role storage, approval workflow | Already in use, real-time listeners enable immediate permission updates without logout |
| Firestore Security Rules | v2 | Server-side permission enforcement | Zero-trust security, prevents client-side permission bypasses, supports complex role logic |

### Supporting Patterns

| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| Auth State Listener (`onAuthStateChanged`) | Detect login/logout, initialize user session | Required for all authenticated views, triggers on auth state changes |
| Firestore Snapshot Listener (user doc) | Real-time role/permission updates | Monitor user document for role changes, project assignments, approval status |
| Route Guards | Block unauthorized navigation | Check authentication and role before rendering views |
| Session Persistence (`browserLocalPersistence`) | Maintain login across browser sessions | Default behavior, keeps users logged in until explicit logout |

### Data Collections Structure

| Collection | Document ID | Fields | Purpose |
|------------|-------------|--------|---------|
| `users` | `{uid}` | `email`, `role`, `status`, `projectAssignments[]`, `createdAt`, `approvedAt`, `approvedBy` | User profiles with role and project access |
| `invitation_codes` | Auto-generated | `code`, `isActive`, `usedCount`, `maxUses`, `createdAt`, `createdBy` | Generic invitation codes for registration |
| Existing collections | (unchanged) | Add security rules checking user role/status | `mrfs`, `prs`, `pos`, `transport_requests`, `suppliers`, `projects` |

---

## Installation

**No npm installation needed** - using CDN imports in existing pattern.

### Add to `app/firebase.js`:

```javascript
// Add Firebase Auth import to existing CDN imports
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Initialize auth (add after existing db initialization)
const auth = getAuth(app);

// Set persistence (default is LOCAL, but explicit is clearer)
setPersistence(auth, browserLocalPersistence);

// Export auth instance and methods
export { auth };
export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
};
```

---

## Architecture Decisions

### Decision 1: Firestore-Based RBAC (not Custom Claims alone)

**Problem:** Custom claims require Firebase Admin SDK to set/update, Admin SDK cannot run in browser.

**Considered Alternatives:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Custom Claims Only | Embedded in ID token, no extra reads, immutable client-side | Requires Admin SDK (server-side), token refresh delay (up to 1 hour), cannot update without backend | ❌ Not viable for zero-build SPA |
| Firestore Only | Immediate updates, no backend needed, works in static SPA | Extra read per auth check, client can see role data | ⚠️ Viable with security rules |
| **Hybrid (Recommended)** | Immediate updates via Firestore listener, security rules use `request.auth.uid` + Firestore lookup | Slightly more complex rules | ✅ **Best fit** |

**Rationale:**
- Zero-build requirement eliminates server-side code (no Cloud Functions, no Admin SDK)
- Firestore real-time listeners provide immediate permission updates without logout
- Security rules prevent client-side manipulation (even though data is readable)
- Extra Firestore read is acceptable (user doc cached after first load)

**Implementation Pattern:**

```javascript
// Client-side: Listen to user document for role changes
const userRef = doc(db, 'users', auth.currentUser.uid);
onSnapshot(userRef, (snapshot) => {
    const userData = snapshot.data();
    // Update UI immediately when role/projects change
    if (userData.role !== currentRole) {
        updateNavigationForRole(userData.role);
    }
});
```

### Decision 2: Invitation Code System (Firestore Collection)

**Structure:**

```javascript
// invitation_codes collection
{
    code: "CLMC2026ALPHA",      // Human-readable code
    isActive: true,              // Can be deactivated
    usedCount: 15,               // Track usage
    maxUses: 100,                // Optional limit (null = unlimited)
    createdAt: Timestamp,
    createdBy: "admin_uid"
}
```

**Validation Pattern:**

```javascript
// During registration, before createUserWithEmailAndPassword
const codesRef = collection(db, 'invitation_codes');
const q = query(codesRef,
    where('code', '==', userEnteredCode),
    where('isActive', '==', true)
);
const snapshot = await getDocs(q);

if (snapshot.empty) {
    throw new Error('Invalid invitation code');
}

const codeDoc = snapshot.docs[0];
const codeData = codeDoc.data();

// Check usage limit
if (codeData.maxUses && codeData.usedCount >= codeData.maxUses) {
    throw new Error('Invitation code has reached maximum uses');
}

// Proceed with registration, then increment usedCount
```

**Why not role-specific codes:** Requirement states "generic codes, not role-specific" with role assigned during approval.

### Decision 3: Approval Workflow (User Status Field)

**User Document Status Lifecycle:**

```
Registration → status: "pending"
Admin Approval → status: "active" + assign role
Admin Rejection → status: "rejected" (or delete account)
Admin Suspension → status: "suspended"
```

**Security Rules Enforcement:**

```javascript
rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        // Helper function: check if user is authenticated and active
        function isActiveUser() {
            return request.auth != null &&
                   get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status == 'active';
        }

        // Helper function: get user role
        function getUserRole() {
            return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
        }

        // MRFs: Operations Users can only see assigned projects
        match /mrfs/{mrfId} {
            allow read: if isActiveUser() &&
                (getUserRole() in ['Super Admin', 'Operations Admin', 'Finance', 'Procurement'] ||
                 (getUserRole() == 'Operations User' &&
                  resource.data.project_name in get(/databases/$(database)/documents/users/$(request.auth.uid)).data.projectAssignments));

            allow create: if isActiveUser() && getUserRole() in ['Super Admin', 'Operations Admin', 'Operations User', 'Procurement'];

            allow update, delete: if isActiveUser() && getUserRole() in ['Super Admin', 'Operations Admin', 'Procurement'];
        }

        // Users collection: Only Super Admin can assign roles
        match /users/{userId} {
            allow read: if request.auth != null && request.auth.uid == userId; // Users see their own doc
            allow read: if isActiveUser() && getUserRole() == 'Super Admin'; // Admins see all

            allow create: if request.auth != null && request.auth.uid == userId &&
                         request.resource.data.status == 'pending'; // Self-registration

            allow update: if isActiveUser() && getUserRole() == 'Super Admin'; // Only admins modify roles/status
        }

        // Invitation codes: Only Super Admin can manage
        match /invitation_codes/{codeId} {
            allow read: if request.auth != null; // Anyone authenticated (for registration)
            allow write: if isActiveUser() && getUserRole() == 'Super Admin';
        }
    }
}
```

### Decision 4: Project Assignment Storage (Array in User Doc)

**Chosen:** Array field `projectAssignments` in user document

**Rationale:**

| Criterion | Array Field | Separate Collection |
|-----------|-------------|---------------------|
| Read cost | 1 read (user doc) | 2 reads (user doc + query assignments) |
| Update cost | 1 write | N writes (update many docs) |
| Query capability | Cannot query "users assigned to project X" | Can query both directions |
| Document size | ~30 projects × 50 chars = 1.5KB (well under 1MB limit) | No size concern |
| Access pattern | "What projects can this user see?" (primary) | "Who has access to project X?" (not needed) |

**Decision:** Array field because primary access pattern is "show this user their assigned projects" and project count per user is small (estimated <50, document limit is 1MB).

**Structure:**

```javascript
// User document
{
    uid: "firebase_uid",
    email: "user@clmc.com",
    role: "Operations User",
    status: "active",
    projectAssignments: ["Project Alpha", "Project Beta"], // Array of project_name values
    createdAt: Timestamp,
    approvedAt: Timestamp,
    approvedBy: "admin_uid"
}
```

**Performance:** Firestore best practices indicate arrays of 300-1000 items are efficient for sequential access patterns. With ~30 projects max, this is well within optimal range.

---

## Integration with Existing Codebase

### File Changes Required

| File | Changes | Reason |
|------|---------|--------|
| `app/firebase.js` | Add Auth imports/exports | Enable authentication throughout app |
| `app/router.js` | Add auth state check, route guards | Block unauthenticated access, role-based navigation |
| `app/views/login.js` (new) | Email/password login form | User authentication entry point |
| `app/views/register.js` (new) | Registration with invitation code | Self-service account creation |
| `app/views/admin-users.js` (new) | User approval, role assignment | Super Admin dashboard |
| All existing views | Add role-based visibility checks | Hide tabs/features based on user role |
| `index.html` | Add login/register routes, conditional nav | Show different nav based on auth state |

### Auth State Management Pattern

**Router-level authentication:**

```javascript
// app/router.js - Add before routing logic
let currentUser = null;
let userRole = null;
let userProjects = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;

        // Fetch user profile from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();

        if (userData.status !== 'active') {
            // Redirect to pending approval page
            window.location.hash = '#/pending-approval';
            return;
        }

        userRole = userData.role;
        userProjects = userData.projectAssignments || [];

        // Set up real-time listener for role changes
        onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
            const newData = snapshot.data();
            if (newData.role !== userRole || newData.status !== 'active') {
                userRole = newData.role;
                userProjects = newData.projectAssignments || [];
                // Re-render navigation and current view
                handleRouteChange();
            }
        });

        // Redirect to appropriate home
        if (window.location.hash === '#/login' || window.location.hash === '#/register') {
            window.location.hash = '#/';
        }
    } else {
        currentUser = null;
        userRole = null;
        userProjects = [];
        // Redirect to login
        window.location.hash = '#/login';
    }
});

// Expose for views
window.getCurrentUser = () => currentUser;
window.getUserRole = () => userRole;
window.getUserProjects = () => userProjects;
```

### Role-Based UI Filtering

**Navigation visibility:**

```javascript
// app/router.js - navigation rendering
const navConfig = {
    'Super Admin': ['#/', '#/projects', '#/procurement', '#/finance', '#/admin'],
    'Operations Admin': ['#/', '#/projects'],
    'Operations User': ['#/', '#/projects'],
    'Finance': ['#/', '#/projects', '#/finance'],
    'Procurement': ['#/', '#/projects', '#/procurement']
};

function renderNavigation() {
    const allowedRoutes = navConfig[userRole] || [];
    // Show/hide nav items based on allowedRoutes
}
```

**Tab visibility within views:**

```javascript
// app/views/procurement.js - example
export function render(activeTab) {
    const userRole = window.getUserRole();
    const showSuppliers = ['Super Admin', 'Procurement'].includes(userRole);

    return `
        <div class="tabs">
            <a href="#/procurement/mrfs">MRF Management</a>
            <a href="#/procurement/pr-generation">PR/TR Generation</a>
            ${showSuppliers ? '<a href="#/procurement/suppliers">Suppliers</a>' : ''}
        </div>
    `;
}
```

### Permission Update Flow (No Logout Required)

**Sequence:**

1. Super Admin updates user role in `users/{uid}` document (via admin dashboard)
2. Firestore snapshot listener fires in user's active session (app/router.js)
3. Listener callback updates `userRole` and `userProjects` variables
4. Calls `handleRouteChange()` to re-render navigation and current view
5. New permissions take effect immediately, user sees updated UI

**No logout needed because:**
- Firestore real-time listeners detect document changes instantly
- Client-side JavaScript variables update immediately
- UI re-renders with new permissions
- Firestore security rules check current database state (not cached token)

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Firebase Custom Claims (alone) | Requires Admin SDK (server-side only), cannot set from browser, 1-hour token refresh delay | Firestore-based roles with security rules |
| Firebase Admin SDK (client-side) | Not designed for browser, requires service account credentials (security risk) | Client SDK + Firestore security rules |
| Third-party auth libraries (Auth0, Clerk) | Adds complexity, monthly costs, requires integration work | Firebase Auth (already in use) |
| Local storage for roles | Client-side manipulation possible, no server-side enforcement | Firestore with security rules |
| Firebase Cloud Functions (for role management) | Requires backend deployment, breaks zero-build pattern | Direct Firestore writes from admin dashboard |
| `setPersistence` with `NONE` | Forces login on every page refresh, poor UX | Default `LOCAL` persistence (already configured) |
| Role-specific invitation codes | More complex to manage, requirement specifies generic codes | Single invitation code collection with admin-assigned roles post-approval |

---

## Known Limitations & Workarounds

### Limitation 1: Token Refresh Delay (if using custom claims)

**Problem:** Custom claims in ID tokens refresh every 1 hour or on re-authentication.

**Workaround:** Not using custom claims for primary role storage. Using Firestore snapshot listeners for immediate updates.

**Reference:** [Firebase Auth custom claims update token refresh](https://firebase.google.com/docs/auth/admin/custom-claims) - "Custom claims propagate to the client after token refresh (up to 1 hour)."

### Limitation 2: Security Rules Cannot Call External APIs

**Problem:** Complex business logic (e.g., "check if user has completed training") cannot be validated in security rules.

**Workaround:** Store all permission-relevant data in Firestore (e.g., `hasCompletedTraining: true` in user doc), update via admin dashboard or Cloud Function.

### Limitation 3: Anonymous Users Not Supported

**Problem:** Firebase Auth `onAuthStateChanged` fires for anonymous users if anonymous auth enabled.

**Workaround:** Do not enable anonymous authentication provider. Email/password only.

### Limitation 4: Security Rules Cost Extra Reads

**Problem:** `get(/databases/$(database)/documents/users/$(request.auth.uid))` in security rules counts as a read operation.

**Workaround:** Acceptable cost for security. User document is small and read once per request (Firestore caches within same transaction).

**Cost Example:** 100K MRF reads/month = 100K user doc reads = $0.036/month (Firestore pricing: $0.36 per 1M reads).

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| firebase-app | 10.7.1 | firebase-firestore 10.7.1, firebase-auth 10.7.1 | All Firebase v10.x packages use same version number from CDN |
| firebase-auth | 10.7.1 | firebase-app 10.7.1 | Same version across all modules required |
| firebase-firestore | 10.7.1 | firebase-app 10.7.1 | Already in use |

**Note on version 10.7.1:** This version is from January 2024. Latest Firebase JS SDK is **v12.8.0** (January 2026). Consider upgrading to v12.x for latest features, but v10.7.1 is stable and sufficient for this milestone. Email/password authentication and Firestore features are unchanged.

**Upgrade path (optional, post-milestone):**

```javascript
// Change all CDN imports from 10.7.1 to 12.8.0
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import { getFirestore, ... } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { getAuth, ... } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
```

No breaking changes expected (v10 → v12 modular API is stable).

---

## Security Considerations

### 1. Never Expose Admin Credentials

Firebase config in `app/firebase.js` contains `apiKey`, `authDomain`, etc. **These are safe to expose client-side** (public by design). What must NEVER be in client code:

- Firebase Admin SDK service account JSON
- Private keys
- Server-side secrets

**Current setup:** ✅ Safe (client SDK only)

### 2. Security Rules Are Critical

Client-side code can be bypassed (user can modify JavaScript in DevTools). **Security rules are the only true security layer.**

**Required:** Comprehensive Firestore security rules enforcing role checks for all collections.

**Testing:** Use Firebase Emulator Suite or Firestore Rules Playground to test rules before deployment.

### 3. Email Enumeration Attack

**Problem:** `createUserWithEmailAndPassword` returns different errors for "email already in use" vs "weak password", allowing attackers to enumerate valid emails.

**Mitigation:** Not a high-risk issue for internal procurement system (closed user base). If needed, use Cloud Functions to obscure error messages.

### 4. Invitation Code Brute Force

**Problem:** Attackers could guess invitation codes if they're simple (e.g., "CLMC2026").

**Mitigation:**
- Use longer codes (12+ characters)
- Add rate limiting via Firestore security rules (check `usedCount` increment rate)
- Monitor `invitation_codes` usage in admin dashboard

---

## Sources

**Official Firebase Documentation (HIGH confidence):**
- [Firebase Authentication - Password-Based Accounts](https://firebase.google.com/docs/auth/web/password-auth) - Email/password setup
- [Firebase Auth - Get Started](https://firebase.google.com/docs/auth/web/start) - Auth initialization
- [Control Access with Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims) - Custom claims limitations
- [Firestore Role-Based Access](https://firebase.google.com/docs/firestore/solutions/role-based-access) - Security rules patterns
- [Security Rules and Auth](https://firebase.google.com/docs/rules/rules-and-auth) - Using request.auth in rules
- [Authentication State Persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence) - setPersistence options
- [Manage Users - Admin SDK](https://firebase.google.com/docs/auth/admin/manage-users) - Disabling user accounts
- [Firestore Best Practices](https://firebase.google.com/docs/firestore/best-practices) - Data structure guidance
- [Firestore Data Model](https://firebase.google.com/docs/firestore/data-model) - Arrays vs subcollections

**Community Resources (MEDIUM confidence):**
- [Firebase Custom Claims vs Firestore RBAC](https://medium.com/@chaitanyayendru/migrating-to-firebase-custom-claims-for-role-based-access-control-26c08f852795) - Comparison analysis
- [FreeCodeCamp - Firebase RBAC Tutorial](https://www.freecodecamp.org/news/firebase-rbac-custom-claims-rules/) - Implementation patterns
- [Patterns for Security with Firebase](https://medium.com/firebase-developers/patterns-for-security-with-firebase-supercharged-custom-claims-with-firestore-and-cloud-functions-bb8f46b24e11) - Hybrid approach pattern
- [Firestore Query Performance Best Practices 2026](https://estuary.dev/blog/firestore-query-best-practices/) - Array vs subcollection performance
- [Arrays vs Maps vs Subcollections](https://saturncloud.io/blog/arrays-vs-maps-vs-subcollections-choosing-the-right-data-structure-for-objects-on-cloud-firestore/) - Data structure decisions

**Version Information (MEDIUM confidence):**
- [Firebase JavaScript SDK Release Notes](https://firebase.google.com/support/release-notes/js) - Version history
- [Firebase CDN via gstatic](https://firebase.google.com/docs/web/alt-setup) - CDN import patterns

---

*Stack research for: CLMC Engineering procurement authentication system*
*Researched: 2026-01-31*
*Confidence: HIGH (official docs verified for all critical decisions)*
