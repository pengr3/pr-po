# Features Research: Auth, Permissions & Project Management

## Invitation Code Systems

### One-Time Use Patterns

**Pattern 1: Hash-Based Validation (No API)**
```javascript
// Generate invitation code
function generateInviteCode() {
  const code = crypto.randomUUID().substring(0, 8).toUpperCase();
  return code;
}

// Store in Firestore
// invitation_codes/{codeId}
{
  code: "A3F8K2M1",
  createdBy: "super_admin_uid",
  createdAt: timestamp,
  usedBy: null, // or user_uid once used
  usedAt: null,
  status: "active" // active, used, expired
}

// Validate during registration
async function validateInviteCode(code) {
  const q = query(
    collection(db, 'invitation_codes'),
    where('code', '==', code.toUpperCase()),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { valid: false, reason: 'Invalid or already used code' };
  }

  return { valid: true, codeDoc: snapshot.docs[0] };
}

// Mark as used
async function markCodeUsed(codeDocId, userId) {
  await updateDoc(doc(db, 'invitation_codes', codeDocId), {
    status: 'used',
    usedBy: userId,
    usedAt: serverTimestamp()
  });
}
```

**Pattern 2: Email-Bound Codes**
```javascript
// invitation_codes/{codeId}
{
  code: "B5K9L3P7",
  boundEmail: "newuser@clmc.com", // Pre-assigned email
  createdBy: "super_admin_uid",
  createdAt: timestamp,
  expiresAt: timestamp, // Optional expiration
  status: "active"
}

// Validation checks email match
async function validateInviteCode(code, email) {
  const q = query(
    collection(db, 'invitation_codes'),
    where('code', '==', code.toUpperCase()),
    where('status', '==', 'active')
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { valid: false, reason: 'Invalid code' };
  }

  const codeData = snapshot.docs[0].data();

  // Check email match if bound
  if (codeData.boundEmail && codeData.boundEmail !== email.toLowerCase()) {
    return { valid: false, reason: 'Code not valid for this email' };
  }

  // Check expiration
  if (codeData.expiresAt && codeData.expiresAt.toDate() < new Date()) {
    return { valid: false, reason: 'Code expired' };
  }

  return { valid: true, codeDoc: snapshot.docs[0], codeData };
}
```

**Recommendation for CLMC:**
- Use Pattern 1 (simple one-time codes)
- No email binding (flexible assignment)
- Super Admin generates on-demand
- Codes never expire (manual deactivation if needed)
- Display used/unused status in admin dashboard

---

## User Approval Workflow

### Registration → Pending → Active Flow

**Step 1: User Self-Registration**
```javascript
async function registerUser(email, password, inviteCode) {
  // 1. Validate invitation code
  const validation = await validateInviteCode(inviteCode);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // 2. Create Firebase Auth account
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // 3. Create user document (status: pending)
  await setDoc(doc(db, 'users', user.uid), {
    email: email.toLowerCase(),
    displayName: email.split('@')[0], // Can be updated later
    role: null, // Assigned during approval
    status: 'pending',
    assignedProjects: [],
    permissions: {}, // Empty until approved
    createdAt: serverTimestamp(),
    inviteCodeUsed: validation.codeDoc.id,
    approvedBy: null,
    approvedAt: null
  });

  // 4. Mark invite code as used
  await markCodeUsed(validation.codeDoc.id, user.uid);

  return user;
}
```

**Step 2: Super Admin Approval Dashboard**
```javascript
// Query pending users
const pendingUsersQuery = query(
  collection(db, 'users'),
  where('status', '==', 'pending'),
  orderBy('createdAt', 'desc')
);

// Approve user
async function approveUser(userId, role, assignedProjects, permissions) {
  const adminUser = auth.currentUser;

  await updateDoc(doc(db, 'users', userId), {
    status: 'active',
    role,
    assignedProjects,
    permissions,
    approvedBy: adminUser.uid,
    approvedAt: serverTimestamp()
  });

  // Optional: Send notification (future feature)
}

// Reject/delete user
async function rejectUser(userId) {
  // Delete user document
  await deleteDoc(doc(db, 'users', userId));

  // Delete auth account (requires Admin SDK - future enhancement)
  // For now, just delete Firestore document; user can't access app
}
```

**Step 3: Login Check**
```javascript
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      // Account deleted
      await signOut(auth);
      showError('Your account has been removed. Contact administrator.');
      return;
    }

    const userData = userDoc.data();

    if (userData.status === 'pending') {
      showPendingScreen();
      return;
    }

    if (userData.status === 'deactivated') {
      await signOut(auth);
      showError('Your account has been deactivated. Contact administrator.');
      return;
    }

    // Status is 'active' - proceed to app
    loadApp(userData);
  }
});
```

---

## Granular Permission System

### Tab-Based Access Control

**Permission Structure:**
```javascript
// users/{userId}.permissions
{
  home: "view",          // Always "view" for all users
  mrf_form: "edit",      // "none", "view", "edit"
  procurement: "edit",   // "none", "view", "edit"
  finance: "view",       // "none", "view", "edit"
  projects: "none",      // "none", "view", "edit"
  admin: "none"          // "none", "edit" (Super Admin only)
}
```

**UI Implementation:**
```javascript
// app/router.js - Hide unauthorized tabs
function renderNavigation(userPermissions) {
  const tabs = [
    { path: '/', label: 'Home', perm: 'home' },
    { path: '/mrf-form', label: 'MRF Form', perm: 'mrf_form' },
    { path: '/procurement', label: 'Procurement', perm: 'procurement' },
    { path: '/finance', label: 'Finance', perm: 'finance' },
    { path: '/projects', label: 'Projects', perm: 'projects' },
    { path: '/admin', label: 'Admin', perm: 'admin' }
  ];

  return tabs
    .filter(tab => userPermissions[tab.perm] !== 'none')
    .map(tab => `<a href="#${tab.path}">${tab.label}</a>`)
    .join('');
}

// View-level - Disable editing
function applyViewPermissions(permissionLevel) {
  if (permissionLevel === 'view') {
    // Disable all inputs
    document.querySelectorAll('input, select, textarea').forEach(el => {
      el.disabled = true;
      el.classList.add('view-only');
    });

    // Hide action buttons
    document.querySelectorAll('.btn-edit, .btn-delete, .btn-approve').forEach(btn => {
      btn.style.display = 'none';
    });

    // Show view-only indicator
    showBanner('View-only mode');
  }
}
```

### Project Assignment Patterns

**"All Projects" vs Specific Projects:**
```javascript
// users/{userId}.assignedProjects examples:
["all"]                    // Can see all projects (Operations Admin)
["PROJ-001", "PROJ-002"]  // Specific projects only (Operations User)
[]                         // No projects (Finance, Super Admin)

// Query MRFs based on assignment
function getMRFsForUser(userData) {
  if (userData.assignedProjects.includes('all')) {
    // No filter - get all MRFs
    return query(collection(db, 'mrfs'));
  } else {
    // Filter by assigned projects
    return query(
      collection(db, 'mrfs'),
      where('project_code', 'in', userData.assignedProjects)
    );
  }
}

// Project dropdown in MRF form
async function loadProjectOptions(userData) {
  let projectsQuery;

  if (userData.assignedProjects.includes('all')) {
    projectsQuery = query(
      collection(db, 'projects'),
      where('status', '==', 'active')
    );
  } else {
    projectsQuery = query(
      collection(db, 'projects'),
      where('project_code', 'in', userData.assignedProjects),
      where('status', '==', 'active')
    );
  }

  const snapshot = await getDocs(projectsQuery);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
```

### Real-Time Permission Updates

**Immediate effect requirement:**
```javascript
// Admin updates user permissions
async function updateUserPermissions(userId, newPermissions) {
  await updateDoc(doc(db, 'users', userId), {
    permissions: newPermissions,
    updatedAt: serverTimestamp()
  });
}

// User's session detects change
let permissionsListener = null;

function startPermissionsListener(userId) {
  permissionsListener = onSnapshot(
    doc(db, 'users', userId),
    (doc) => {
      const newPermissions = doc.data().permissions;

      // Compare with current permissions
      if (JSON.stringify(newPermissions) !== JSON.stringify(currentUserPermissions)) {
        currentUserPermissions = newPermissions;

        // Refresh UI
        reloadCurrentView();

        // Show notification
        showNotification('Your permissions have been updated');
      }
    }
  );
}

// Cleanup on logout
function stopPermissionsListener() {
  if (permissionsListener) {
    permissionsListener();
    permissionsListener = null;
  }
}
```

---

## Project Management Features

### Project Creation & Tracking

**Project Data Model:**
```javascript
// projects/{projectId}
{
  project_name: "CLMC Office Renovation",
  project_code: "PROJ-001", // Unique, used in MRFs
  budget: 5000000,
  personnel: ["John Doe", "Jane Smith"],
  client_company: "ABC Corporation",
  client_contact_person: "Michael Chen",
  client_contact_details: "+63 912 345 6789",
  contract_cost: 4500000,

  // Status tracking
  internal_status: "For Approval", // For Inspection, For Proposal, For Approval, Approved
  project_status: "Approved by Client", // Pending, Awaiting Approval, Approved by Client, For Mobilization, On-going, Completed, Loss

  // Payment milestones
  payment_milestones: [
    {
      percentage: 30,
      description: "Downpayment upon contract signing",
      amount: 1350000, // auto-calculated
      status: "pending", // pending, triggered, paid
      triggeredAt: null,
      paidAt: null
    },
    {
      percentage: 40,
      description: "Progress billing at 50% completion",
      amount: 1800000,
      status: "pending",
      triggeredAt: null,
      paidAt: null
    },
    {
      percentage: 30,
      description: "Final payment upon project completion",
      amount: 1350000,
      status: "pending",
      triggeredAt: null,
      paidAt: null
    }
  ],

  createdBy: "user_uid",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Permission-Based Editing:**
- **Operations Admin**: Can edit all projects, create new
- **Operations User**: Can only edit assigned projects
- **Others**: No access (permissions.projects === 'none')

---

## Payment & Invoice Tracking

### PO Payment Status

**Enhanced PO Model:**
```javascript
// pos/{poId}
{
  // ... existing fields
  payment_terms: "Net 30", // Net 30, Net 60, Custom
  payment_due_date: timestamp, // Auto-calculated or manual
  payment_status: "unpaid", // unpaid, partial, paid
  amount_paid: 0,
  payment_percentage: 0, // amount_paid / total_amount * 100

  // Invoice tracking
  has_invoice: false,
  invoices: [] // Array of invoice IDs
}
```

### Invoice Management

**Invoice Storage & Metadata:**
```javascript
// 1. Upload to Firebase Storage
async function uploadInvoice(poId, file) {
  const filename = `${poId}_${Date.now()}_${file.name}`;
  const storageRef = ref(storage, `invoices/${poId}/${filename}`);

  const uploadTask = uploadBytes(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: auth.currentUser.uid,
      poId: poId
    }
  });

  await uploadTask;
  const downloadURL = await getDownloadURL(storageRef);

  return { filename, downloadURL, storagePath: `invoices/${poId}/${filename}` };
}

// 2. Store metadata in Firestore
// invoices/{invoiceId}
{
  po_id: "PO-2026-001",
  filename: "supplier_invoice_20260123.pdf",
  storagePath: "invoices/PO-2026-001/supplier_invoice_20260123.pdf",
  downloadURL: "https://...",
  uploadedBy: "user_uid",
  uploadedAt: timestamp,
  fileSize: 245678,
  contentType: "application/pdf",
  status: "pending" // pending, reviewed, approved
}

// 3. Update PO
await updateDoc(doc(db, 'pos', poId), {
  has_invoice: true,
  invoices: arrayUnion(invoiceId)
});
```

---

## Finance Dashboard Enhancements

### Payables Calculation

```javascript
async function calculatePayables() {
  // Get all POs that are not fully paid
  const posQuery = query(
    collection(db, 'pos'),
    where('payment_status', 'in', ['unpaid', 'partial'])
  );
  const posSnapshot = await getDocs(posQuery);

  const payablesBySupplier = {};

  posSnapshot.forEach(doc => {
    const po = doc.data();
    const remaining = po.total_amount - po.amount_paid;

    if (!payablesBySupplier[po.supplier_name]) {
      payablesBySupplier[po.supplier_name] = {
        totalPayable: 0,
        pos: []
      };
    }

    payablesBySupplier[po.supplier_name].totalPayable += remaining;
    payablesBySupplier[po.supplier_name].pos.push({
      po_id: po.po_id,
      total: po.total_amount,
      paid: po.amount_paid,
      remaining
    });
  });

  return payablesBySupplier;
}
```

### Collectibles Calculation

```javascript
async function calculateCollectibles() {
  // Get all active projects
  const projectsSnapshot = await getDocs(collection(db, 'projects'));

  const collectiblesByProject = {};

  projectsSnapshot.forEach(doc => {
    const project = doc.data();
    const totalPaid = project.payment_milestones
      .filter(m => m.status === 'paid')
      .reduce((sum, m) => sum + m.amount, 0);

    const remaining = project.contract_cost - totalPaid;

    collectiblesByProject[project.project_code] = {
      project_name: project.project_name,
      contract_cost: project.contract_cost,
      total_paid: totalPaid,
      remaining,
      milestones: project.payment_milestones.filter(m => m.status !== 'paid')
    };
  });

  return collectiblesByProject;
}
```

---

## Sources

- [How to Validate Invitation Codes - Prefinery](https://help.prefinery.com/article/18-validating-invitation-codes)
- [Invitation System Setup - Prefinery](https://help.prefinery.com/article/131-how-to-invite-users)
- [Contract Milestones in Project Management](https://www.sirion.ai/library/contract-management/contract-milestones/)
- [Milestone Billing Guide for Contractors](https://trusspayments.com/blog-posts/understanding-milestone-billing-a-guide-for-contractors-and-clients)
- [Project Procurement Management Guide 2026](https://productive.io/blog/project-procurement-management/)
- [Permission-based Access in Firestore](https://vojtechstruhar.medium.com/permission-based-access-in-google-firestore-a8eefd10111e)
