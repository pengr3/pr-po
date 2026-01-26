# Stack Research: Firebase Authentication & Permissions

## Firebase Authentication for Vanilla JavaScript

### Core Setup (Firebase v10.7.1 CDN)

**Recommended Pattern:**
```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const auth = getAuth();

// Authentication state observer (recommended approach)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in, uid available as user.uid
    loadUserPermissions(user.uid);
  } else {
    // User is signed out
    redirectToLogin();
  }
});
```

### Session Management

**How Firebase Sessions Work:**
- **ID Tokens (JWT)**: Short-lived (1 hour), contain user claims
- **Refresh Tokens**: Long-lived, automatically retrieve new ID tokens
- **Persistence**: Sessions persist across browser restarts by default
- **Expiration**: Refresh tokens expire on password/email changes

**Session Persistence Options:**
```javascript
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';

// Local (default) - persists across browser restarts
await setPersistence(auth, browserLocalPersistence);

// Session - cleared when tab closes
await setPersistence(auth, browserSessionPersistence);
```

### Custom Claims for Roles

**Server-side only (Admin SDK required):**
```javascript
// Cannot be done client-side - requires backend/Cloud Function
admin.auth().setCustomUserClaims(uid, {
  role: 'operations_admin',
  assignedProjects: ['all']
});
```

**Client-side access:**
```javascript
const user = auth.currentUser;
const idTokenResult = await user.getIdTokenResult();
const role = idTokenResult.claims.role;
const projects = idTokenResult.claims.assignedProjects;
```

**Limitation:** Custom claims require Admin SDK (server/Cloud Functions). For zero-backend approach, store roles in Firestore `users` collection.

---

## Firebase Security Rules

### Firestore Rules for Role-Based Permissions

**Pattern 1: Role in Document Field**
```javascript
// users/{userId} document structure
{
  email: "user@example.com",
  role: "operations_user",
  assignedProjects: ["PROJ-001", "PROJ-002"],
  status: "active"
}

// Security rule
match /mrfs/{mrfId} {
  allow read: if isAuthenticated() && hasProjectAccess(resource.data.project_code);
  allow write: if isAuthenticated() && canEditProcurement();
}

function isAuthenticated() {
  return request.auth != null;
}

function getUserData() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}

function hasProjectAccess(projectCode) {
  let user = getUserData();
  return user.status == 'active' &&
         (user.assignedProjects.hasAny(['all']) ||
          user.assignedProjects.hasAny([projectCode]));
}

function canEditProcurement() {
  let user = getUserData();
  return user.status == 'active' &&
         user.permissions.procurement == 'edit';
}
```

**Pattern 2: Project Membership**
```javascript
// projects/{projectId}/members/{userId}
{
  role: "editor",
  permissions: ["view_mrfs", "edit_mrfs", "approve_prs"]
}

match /mrfs/{mrfId} {
  allow read: if isProjectMember(resource.data.project_id);
  allow write: if hasPermission(resource.data.project_id, 'edit_mrfs');
}

function isProjectMember(projectId) {
  return exists(/databases/$(database)/documents/projects/$(projectId)/members/$(request.auth.uid));
}
```

**Trade-offs:**
- **Field-based**: Simpler queries, single read, but denormalized data
- **Subcollection-based**: Normalized, flexible, but requires extra reads (`get()` calls count against quotas)

### Firebase Storage Rules for Invoices

**User-authenticated uploads:**
```javascript
service firebase.storage {
  match /b/{bucket}/o {
    // Invoice uploads by procurement role
    match /invoices/{poId}/{filename} {
      allow read: if isAuthenticated() && canViewFinance();
      allow write: if isAuthenticated() && canEditProcurement();
      allow delete: if isAuthenticated() && isSuperAdmin();

      // File validation
      allow write: if request.resource.size < 10 * 1024 * 1024 // 10MB
                   && request.resource.contentType.matches('image/.*|application/pdf');
    }
  }
}
```

**Metadata tracking:**
Store file metadata in Firestore:
```javascript
// invoices/{invoiceId}
{
  po_id: "PO-2026-001",
  filename: "invoice_supplier_20260123.pdf",
  storagePath: "invoices/PO-2026-001/invoice_supplier_20260123.pdf",
  uploadedBy: "user123",
  uploadedAt: timestamp,
  size: 245678,
  contentType: "application/pdf"
}
```

---

## Client-Side Permission Enforcement

**Zero-backend approach for CLMC system:**

### Permission Model in Firestore
```javascript
// users/{userId}
{
  email: "user@clmc.com",
  displayName: "John Doe",
  role: "operations_user", // super_admin, operations_admin, operations_user, finance
  status: "active", // pending, active, deactivated
  assignedProjects: ["PROJ-001", "PROJ-002"], // or ["all"]
  permissions: {
    home: "view",
    mrf_form: "edit",
    procurement: "view",
    finance: "none",
    projects: "none",
    admin: "none"
  },
  createdAt: timestamp,
  approvedBy: "admin_uid",
  approvedAt: timestamp
}
```

### Router-Level Protection
```javascript
// app/router.js
async function checkPermissions(routePath, user) {
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const userData = userDoc.data();

  // Check if user is active
  if (userData.status !== 'active') {
    return { allowed: false, reason: 'Account not active' };
  }

  // Map routes to permission keys
  const routePermissions = {
    '/': 'home',
    '/mrf-form': 'mrf_form',
    '/procurement': 'procurement',
    '/finance': 'finance',
    '/projects': 'projects',
    '/admin': 'admin'
  };

  const permKey = routePermissions[routePath];
  const permLevel = userData.permissions[permKey];

  if (permLevel === 'none') {
    return { allowed: false, reason: 'No access to this section' };
  }

  return { allowed: true, level: permLevel, userData };
}
```

### View-Level Filtering
```javascript
// app/views/procurement.js
let currentUserPermissions = null;

export async function init() {
  const user = auth.currentUser;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  currentUserPermissions = userDoc.data();

  // Filter projects based on assignment
  const projectsQuery = currentUserPermissions.assignedProjects.includes('all')
    ? query(collection(db, 'projects'))
    : query(collection(db, 'projects'),
            where('project_code', 'in', currentUserPermissions.assignedProjects));

  // Show/hide UI based on permissions
  if (currentUserPermissions.permissions.procurement === 'view') {
    document.querySelectorAll('.edit-button').forEach(btn => btn.remove());
    document.querySelectorAll('input, select').forEach(el => el.disabled = true);
  }
}
```

---

## Stack Recommendations

### For CLMC System

**✅ Recommended Approach:**
1. **Firebase Auth** for authentication (email/password)
2. **Firestore `users` collection** for roles/permissions (no Admin SDK needed)
3. **Security Rules** to enforce server-side (prevent spoofing)
4. **Client-side checks** for UI/UX (hide/disable features)
5. **Firebase Storage** with rules for invoice uploads

**Why this stack:**
- ✅ Zero-backend (pure client-side JavaScript)
- ✅ Works with existing Firestore setup
- ✅ No build system required
- ✅ Real-time permission updates via onSnapshot
- ✅ Mature, well-documented APIs

**Alternatives considered:**
- ❌ **Custom Claims**: Requires Admin SDK (backend/Cloud Functions)
- ❌ **Third-party auth (Auth0, Clerk)**: Adds complexity, cost
- ❌ **Backend server**: Against zero-build requirement

---

## Sources

- [Firebase Password Authentication Guide](https://firebase.google.com/docs/auth/web/password-auth) (Updated Jan 21, 2026)
- [Get Started with Firebase Authentication](https://firebase.google.com/docs/auth/web/start) (Updated Jan 15, 2026)
- [Manage User Sessions](https://firebase.google.com/docs/auth/admin/manage-sessions) (Updated Jan 12, 2026)
- [Role-Based Access Control in Firestore](https://firebase.google.com/docs/firestore/solutions/role-based-access)
- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Authentication with Firebase and Vanilla JavaScript](https://medium.com/@aysunitai/creating-email-and-password-authentication-with-firebase-and-vanilla-javascript-668aa73868a0)
- [Firebase Storage Security Rules Conditions](https://firebase.google.com/docs/storage/security/rules-conditions)
