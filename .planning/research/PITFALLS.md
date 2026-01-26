# Common Pitfalls: Authentication & Permission Systems

## Security Pitfalls

### 1. Client-Side Permission Checks Only

**Pitfall:**
```javascript
// ❌ DANGEROUS: Only checking permissions in UI
if (currentUserData.permissions.procurement === 'edit') {
  // Show edit button
}

// User can bypass by calling function directly in console
await updateDoc(doc(db, 'mrfs', mrfId), { status: 'Approved' });
// ^ This would succeed without Firestore Rules!
```

**Solution:**
```javascript
// ✅ SAFE: Firestore Rules enforce server-side
match /mrfs/{mrfId} {
  allow write: if isAuthenticated() &&
                  getUserData().permissions.procurement == 'edit' &&
                  getUserData().status == 'active';
}

// Now client-side bypass is impossible
```

**Impact:** High - Users can manipulate data they shouldn't access.

**Prevention:**
- ✅ Always implement Firestore Security Rules
- ✅ Treat client-side checks as UX only
- ✅ Test by attempting console-based bypasses
- ✅ Use Firebase Rules Playground for validation

---

### 2. Overly Permissive Security Rules

**Pitfall:**
```javascript
// ❌ DANGEROUS: Default open access
match /mrfs/{mrfId} {
  allow read, write: if true; // Everyone can access!
}

// ❌ DANGEROUS: Auth check only
match /mrfs/{mrfId} {
  allow read, write: if request.auth != null; // Any logged-in user!
}
```

**Solution:**
```javascript
// ✅ SAFE: Granular permission checks
match /mrfs/{mrfId} {
  allow read: if isAuthenticated() && hasProjectAccess(resource.data.project_code);
  allow create: if isAuthenticated() &&
                   canEditProcurement() &&
                   hasProjectAccess(request.resource.data.project_code);
  allow update: if isAuthenticated() &&
                   canEditProcurement() &&
                   hasProjectAccess(resource.data.project_code);
  allow delete: if isAuthenticated() && isSuperAdmin();
}
```

**Impact:** Critical - Unauthorized data access and modification.

**Prevention:**
- ✅ Start with deny-all, explicitly allow actions
- ✅ Check both authentication and authorization
- ✅ Test rules with Firestore emulator
- ✅ Use `get()` to verify user status/permissions in rules

---

### 3. Invitation Code Reuse

**Pitfall:**
```javascript
// ❌ DANGEROUS: No usage tracking
async function validateInviteCode(code) {
  const q = query(collection(db, 'invitation_codes'), where('code', '==', code));
  const snapshot = await getDocs(q);
  return !snapshot.empty; // Doesn't check if already used!
}

// Code can be shared indefinitely
```

**Solution:**
```javascript
// ✅ SAFE: One-time use enforcement
// invitation_codes/{codeId}
{
  code: "A3F8K2M1",
  status: "active", // active, used, expired
  usedBy: null,
  usedAt: null
}

async function validateInviteCode(code) {
  const q = query(
    collection(db, 'invitation_codes'),
    where('code', '==', code),
    where('status', '==', 'active') // Only active codes
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return { valid: false, reason: 'Invalid or already used code' };
  }

  return { valid: true, codeDoc: snapshot.docs[0] };
}

async function markCodeUsed(codeDocId, userId) {
  await updateDoc(doc(db, 'invitation_codes', codeDocId), {
    status: 'used',
    usedBy: userId,
    usedAt: serverTimestamp()
  });
}
```

**Impact:** Medium - Unauthorized users can register with leaked codes.

**Prevention:**
- ✅ Track usage status in database
- ✅ Atomic status update (active → used)
- ✅ Consider time-based expiration
- ✅ Admin dashboard to monitor code usage

---

### 4. Session Hijacking via Token Theft

**Pitfall:**
```javascript
// ❌ DANGEROUS: Exposing tokens in console/logs
console.log('User token:', await user.getIdToken());

// ❌ DANGEROUS: Storing tokens in localStorage manually
localStorage.setItem('authToken', token);
```

**Solution:**
```javascript
// ✅ SAFE: Let Firebase handle tokens
// Firebase Auth automatically manages tokens securely

// ✅ SAFE: Never log tokens
// console.log('User ID:', user.uid); // OK
// console.log('Token:', token); // NEVER DO THIS

// ✅ SAFE: Use Firebase session persistence
// Firebase stores tokens in IndexedDB (more secure than localStorage)
```

**Impact:** High - Attackers can impersonate users.

**Prevention:**
- ✅ Never log or expose tokens
- ✅ Use Firebase's built-in session management
- ✅ Don't store tokens manually
- ✅ Implement session timeout for sensitive operations
- ✅ Use HTTPS only (Netlify provides this)

---

### 5. Weak Password Requirements

**Pitfall:**
```javascript
// ❌ DANGEROUS: No password validation
async function registerUser(email, password) {
  await createUserWithEmailAndPassword(auth, email, password);
  // Firebase requires 6+ chars, but no complexity check
}
```

**Solution:**
```javascript
// ✅ SAFE: Enforce strong passwords
function validatePassword(password) {
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain an uppercase letter' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain a lowercase letter' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain a number' };
  }

  return { valid: true };
}

async function registerUser(email, password, inviteCode) {
  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) {
    throw new Error(passwordCheck.error);
  }

  // Proceed with registration
  await createUserWithEmailAndPassword(auth, email, password);
}
```

**Impact:** Medium - Weak passwords easier to brute-force.

**Prevention:**
- ✅ Enforce 8+ characters
- ✅ Require uppercase, lowercase, number
- ✅ Optional: special characters
- ✅ Show password strength indicator

---

## Migration Pitfalls

### 6. User Lockout During Migration

**Pitfall:**
```javascript
// ❌ DANGEROUS: Deploying rules that block existing users
match /mrfs/{mrfId} {
  // Immediately requires project_code, but existing MRFs don't have it!
  allow read: if hasProjectAccess(resource.data.project_code);
}

// Result: All existing MRFs become inaccessible
```

**Solution:**
```javascript
// ✅ SAFE: Phased migration with graceful fallback
match /mrfs/{mrfId} {
  allow read: if isAuthenticated() &&
                 (resource.data.project_code == null || // Legacy MRFs
                  hasProjectAccess(resource.data.project_code)); // New MRFs
}

// Phase 1: Allow nulls
// Phase 2: Backfill data
// Phase 3: Remove null check after validation
```

**Impact:** Critical - System becomes unusable, 40% of auth migrations fail due to lockouts.

**Prevention:**
- ✅ Test rules in emulator first
- ✅ Deploy rules incrementally (phased approach)
- ✅ Allow graceful degradation for legacy data
- ✅ Backfill data before enforcing strict rules
- ✅ Have rollback plan ready

---

### 7. Breaking Existing Workflows

**Pitfall:**
```javascript
// ❌ DANGEROUS: Making project_code required immediately
// app/views/mrf-form.js
async function submitMRF(formData) {
  if (!formData.project_code) {
    throw new Error('Project code required'); // Blocks all submissions!
  }
  // ...
}
```

**Solution:**
```javascript
// ✅ SAFE: Gradual enforcement
async function submitMRF(formData) {
  // Phase 1: Warn but allow
  if (!formData.project_code) {
    const proceed = confirm('No project selected. This will be required soon. Continue?');
    if (!proceed) return;
  }

  // Phase 2 (later): Make required
  // if (!formData.project_code) {
  //   throw new Error('Project code required');
  // }

  await addDoc(collection(db, 'mrfs'), formData);
}
```

**Impact:** High - Users cannot perform critical tasks.

**Prevention:**
- ✅ Add new fields as optional first
- ✅ Show warnings before errors
- ✅ Give users time to adapt (2+ weeks)
- ✅ Communicate changes via in-app banners
- ✅ Provide training/documentation

---

### 8. Lost Data During Migration

**Pitfall:**
```javascript
// ❌ DANGEROUS: Overwriting data without backup
async function backfillProjectCodes() {
  const mrfs = await getDocs(collection(db, 'mrfs'));

  for (const doc of mrfs.docs) {
    // If mapping fails, project_name is lost!
    await updateDoc(doc.ref, {
      project_code: mapProjectCode(doc.data().project_name) || 'UNKNOWN'
    });
  }
}
```

**Solution:**
```javascript
// ✅ SAFE: Preserve original, add new field
async function backfillProjectCodes() {
  const mrfs = await getDocs(collection(db, 'mrfs'));
  const batch = writeBatch(db);
  let count = 0;

  for (const doc of mrfs.docs) {
    const mrf = doc.data();

    if (!mrf.project_code && mrf.project_name) {
      const projectCode = mapProjectCode(mrf.project_name);

      // Keep original project_name, add project_code
      batch.update(doc.ref, {
        project_code: projectCode,
        project_name_original: mrf.project_name, // Backup
        migratedAt: serverTimestamp()
      });

      count++;

      if (count % 500 === 0) {
        await batch.commit();
        // New batch...
      }
    }
  }

  console.log(`Migrated ${count} MRFs`);
}
```

**Impact:** Critical - Permanent data loss.

**Prevention:**
- ✅ Backup Firestore before migration (export to Cloud Storage)
- ✅ Test migration on copy of data first
- ✅ Preserve original fields as `_original` backups
- ✅ Use batched writes with transaction safety
- ✅ Log migration actions for audit trail
- ✅ Validate data after migration

---

### 9. Permission Caching Issues

**Pitfall:**
```javascript
// ❌ DANGEROUS: Loading permissions once and never updating
let userPermissions = null;

async function init() {
  if (!userPermissions) {
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    userPermissions = userDoc.data().permissions;
  }

  // Permissions never refresh! Admin changes not reflected.
}
```

**Solution:**
```javascript
// ✅ SAFE: Real-time permissions listener
let permissionsListener = null;

function startPermissionsListener(userId) {
  permissionsListener = onSnapshot(
    doc(db, 'users', userId),
    (docSnap) => {
      const newData = docSnap.data();

      // Detect changes
      if (JSON.stringify(newData.permissions) !== JSON.stringify(AppState.permissions)) {
        AppState.permissions = newData.permissions;
        reloadCurrentView(); // Immediate effect
        showNotification('Permissions updated');
      }

      // Detect deactivation
      if (newData.status === 'deactivated') {
        signOut(auth);
        showError('Account deactivated');
      }
    }
  );
}
```

**Impact:** Medium - Users retain old permissions until logout.

**Prevention:**
- ✅ Use onSnapshot for real-time updates
- ✅ Refresh UI when permissions change
- ✅ Don't cache permissions long-term
- ✅ Test permission changes without logout

---

## UX Pitfalls

### 10. Confusing Permission Denials

**Pitfall:**
```javascript
// ❌ BAD UX: Generic error message
if (userData.permissions.procurement !== 'edit') {
  alert('Access denied'); // User doesn't know why!
  return;
}
```

**Solution:**
```javascript
// ✅ GOOD UX: Specific, actionable messages
if (userData.permissions.procurement === 'none') {
  showError('You do not have access to the Procurement section. Contact your administrator to request access.');
  return;
}

if (userData.permissions.procurement === 'view') {
  showError('You have view-only access to Procurement. Editing requires approval from your administrator.');
  return;
}

// Even better: Don't show the button at all
if (userData.permissions.procurement !== 'edit') {
  document.querySelectorAll('.btn-edit').forEach(btn => btn.remove());
}
```

**Impact:** Low - User frustration, support requests.

**Prevention:**
- ✅ Explain why action is blocked
- ✅ Provide next steps (contact admin)
- ✅ Hide unavailable actions (don't tease)
- ✅ Use visual indicators (greyed out, disabled)

---

### 11. Lost Work Due to Permission Changes

**Pitfall:**
```javascript
// ❌ BAD UX: Permissions change mid-edit
// User spends 15 minutes filling out MRF form
// Admin changes their permissions to view-only
// On submit: "Access denied" - work lost!
```

**Solution:**
```javascript
// ✅ GOOD UX: Graceful handling
let formData = {};

// Auto-save to localStorage
function autoSave() {
  localStorage.setItem('mrf_draft', JSON.stringify(formData));
}

setInterval(autoSave, 5000); // Save every 5 seconds

// On permission change
function handlePermissionChange(newPermissions) {
  if (newPermissions.mrf_form !== 'edit') {
    showWarning('Your permissions have changed. Your progress has been saved. Please contact your administrator.');

    // Disable form but keep data visible
    document.querySelectorAll('input').forEach(el => el.disabled = true);
  }
}

// On next edit session
function loadDraft() {
  const draft = localStorage.getItem('mrf_draft');
  if (draft && confirm('Continue from saved draft?')) {
    formData = JSON.parse(draft);
    populateForm(formData);
  }
}
```

**Impact:** High - User frustration, lost productivity.

**Prevention:**
- ✅ Auto-save drafts to localStorage
- ✅ Warn before discarding work
- ✅ Allow viewing form after permission change
- ✅ Coordinate permission changes with admin

---

### 12. No Feedback on Pending Approval

**Pitfall:**
```javascript
// ❌ BAD UX: User registers and sees nothing
async function registerUser(email, password, code) {
  await createUserWithEmailAndPassword(auth, email, password);
  // User is redirected to... empty app? Error screen?
}
```

**Solution:**
```javascript
// ✅ GOOD UX: Clear pending state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();

    if (userData.status === 'pending') {
      showPendingScreen(); // Dedicated UI
      return;
    }
  }
});

function showPendingScreen() {
  document.getElementById('content').innerHTML = `
    <div class="pending-approval">
      <h2>Account Pending Approval</h2>
      <p>Your account has been created and is awaiting approval from an administrator.</p>
      <p>You will receive access once your account is approved. This typically takes 1-2 business days.</p>
      <p>If you have questions, please contact: <strong>admin@clmc.com</strong></p>
      <button onclick="auth.signOut()">Sign Out</button>
    </div>
  `;
}
```

**Impact:** Medium - User confusion, duplicate registrations.

**Prevention:**
- ✅ Show dedicated pending screen
- ✅ Explain what happens next
- ✅ Provide contact information
- ✅ Set expectations on approval time

---

### 13. Super Admin Account Lockout

**Pitfall:**
```javascript
// ❌ CRITICAL: Only one Super Admin, account gets deactivated
async function deactivateUser(userId) {
  await updateDoc(doc(db, 'users', userId), {
    status: 'deactivated'
  });
  // If this was the only Super Admin, system is now inaccessible!
}
```

**Solution:**
```javascript
// ✅ SAFE: Prevent last Super Admin deactivation
async function deactivateUser(userId) {
  const userDoc = await getDoc(doc(db, 'users', userId));
  const userData = userDoc.data();

  if (userData.role === 'super_admin') {
    // Count active Super Admins
    const superAdminsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'super_admin'),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(superAdminsQuery);

    if (snapshot.size <= 1) {
      throw new Error('Cannot deactivate the last Super Admin. Create another Super Admin first.');
    }
  }

  // Safe to deactivate
  await updateDoc(doc(db, 'users', userId), {
    status: 'deactivated',
    deactivatedBy: auth.currentUser.uid,
    deactivatedAt: serverTimestamp()
  });
}
```

**Impact:** Critical - System becomes unmanageable.

**Prevention:**
- ✅ Require 2+ Super Admins always
- ✅ Check before deactivation/deletion
- ✅ Firebase Console as fallback (can manually edit Firestore)
- ✅ Document recovery process

---

## Performance Pitfalls

### 14. Excessive Permission Queries

**Pitfall:**
```javascript
// ❌ SLOW: Re-fetching user data on every action
async function approveMRF(mrfId) {
  const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid)); // Slow!
  if (userDoc.data().permissions.procurement !== 'edit') return;
  // ...
}

async function rejectMRF(mrfId) {
  const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid)); // Slow!
  if (userDoc.data().permissions.procurement !== 'edit') return;
  // ...
}
```

**Solution:**
```javascript
// ✅ FAST: Cache in app state
import { AppState } from './state.js';

async function approveMRF(mrfId) {
  // Use cached permissions (updated via listener)
  if (AppState.permissions.procurement !== 'edit') return;
  // ...
}

async function rejectMRF(mrfId) {
  if (AppState.permissions.procurement !== 'edit') return;
  // ...
}
```

**Impact:** Low - Slower UI, higher Firestore costs.

**Prevention:**
- ✅ Cache user data in app state
- ✅ Update via onSnapshot listener
- ✅ Avoid repeated getDoc() calls

---

## Summary: Top 5 Critical Pitfalls

1. **No Firestore Security Rules** - Client-side checks can be bypassed
2. **User Lockout During Migration** - Breaking existing workflows
3. **Invitation Code Reuse** - Security vulnerability
4. **Lost Data During Migration** - No backups or validation
5. **Super Admin Lockout** - Last admin account becomes inaccessible

---

## Sources

- [Auth Migration Hell - Why Identity Projects Fail](https://securityboulevard.com/2025/09/auth-migration-hell-why-your-next-identity-project-might-keep-you-up-at-night/)
- [Cloud Migration Security Best Practices](https://compliance.waystone.com/cloud-migration-security-best-practices-and-pitfalls/)
- [Firebase Security Rules Tips](https://firebase.blog/posts/2019/03/firebase-security-rules-admin-sdk-tips/)
- [Firestore Security Rules Best Practices](https://firebase.google.com/docs/rules/basics)
- [Mastering Firebase's Firestore Security](https://medium.com/@sehban.alam/mastering-firebases-firestore-security-9de63c4baa0e)
