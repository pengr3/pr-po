# Phase 9: Super Admin User Management - Research

**Researched:** 2026-02-04
**Domain:** Admin user lifecycle management, invitation codes, user approval workflows
**Confidence:** HIGH

## Summary

Phase 9 implements a complete Super Admin interface for managing the user lifecycle: generating invitation codes, reviewing and approving pending registrations with role assignment, managing active users (viewing, deactivating, deleting), and assigning projects to Operations Users. The research confirms the codebase already has the foundation in place (auth.js, Firestore schema, permissions system), and established SPA patterns from existing admin views (role-config.js, project-assignments.js) can be directly reused.

The standard approach is a single-page admin view with multiple tabs or sections: Invitation Codes, Pending Approvals, and User Management. UUID generation uses native `crypto.randomUUID()`, expiration is handled via Firestore TTL policies, and destructive actions follow established confirmation patterns. Firebase Admin SDK is NOT needed because user deletion can be handled client-side using the current user's reauthentication or deferred to manual cleanup.

**Primary recommendation:** Create a single admin-users.js view with tabbed interface following role-config.js patterns, using Firestore onSnapshot for real-time updates, three-dot dropdown menus for row actions, and modal dialogs for confirmations.

## Standard Stack

The established libraries and patterns for this phase are already in place from prior phases.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 (CDN) | Real-time database operations | Already integrated, matches existing phase implementations |
| Firebase Auth | 10.7.1 (CDN) | User authentication state | Same version as Firestore (AUTH-01), already handling auth state |
| Native Crypto API | Built-in | UUID generation | Modern standard, no external library needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Clipboard API | Native | Copy invitation codes | Standard for copy-to-clipboard (requires HTTPS/localhost) |
| Firestore TTL | Native | Auto-expire old codes | Serverless expiration without Cloud Functions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| crypto.randomUUID() | uuid npm package | UUID package adds dependency; native API is sufficient and widely supported |
| Firestore TTL | Cloud Functions scheduled cleanup | TTL is simpler, serverless, and handles expiration automatically without code |
| Firebase Admin SDK | Client-side auth operations | Admin SDK requires backend; client-side sufficient for deactivation (deletion optional) |

**Installation:**
No new packages needed. All functionality uses existing Firebase SDK and native browser APIs.

## Architecture Patterns

### Recommended Project Structure
```
app/views/
├── admin-users.js        # Main Super Admin user management view
└── (existing views)      # role-config.js, project-assignments.js for reference
```

### Pattern 1: Tabbed Admin Interface
**What:** Single view with multiple sections (tabs or accordion-style panels) for different admin functions
**When to use:** When admin tasks are related but distinct (invitation codes, approvals, user list)
**Example:**
```javascript
// Source: Existing role-config.js pattern
export function render(activeTab = 'codes') {
    return `
        <div class="admin-container">
            <div class="tabs">
                <button onclick="switchTab('codes')" class="${activeTab === 'codes' ? 'active' : ''}">
                    Invitation Codes
                </button>
                <button onclick="switchTab('approvals')" class="${activeTab === 'approvals' ? 'active' : ''}">
                    Pending Approvals
                </button>
                <button onclick="switchTab('users')" class="${activeTab === 'users' ? 'active' : ''}">
                    All Users
                </button>
            </div>
            <div id="tabContent">
                ${renderTabContent(activeTab)}
            </div>
        </div>
    `;
}
```

### Pattern 2: Real-time Firestore Listeners with onSnapshot
**What:** Module-level listeners array that subscribes to Firestore collections and auto-updates UI
**When to use:** For all real-time admin data (users, invitation codes)
**Example:**
```javascript
// Source: project-assignments.js and role-config.js patterns
let listeners = [];
let usersData = [];
let invitationCodesData = [];

export async function init(activeTab = 'codes') {
    // Listener 1: pending users
    const pendingQuery = query(collection(db, 'users'), where('status', '==', 'pending'));
    const pendingListener = onSnapshot(pendingQuery, (snapshot) => {
        pendingUsers = [];
        snapshot.forEach(d => pendingUsers.push({ id: d.id, ...d.data() }));
        renderPendingTable();
    });
    listeners.push(pendingListener);

    // Listener 2: all invitation codes
    const codesListener = onSnapshot(collection(db, 'invitation_codes'), (snapshot) => {
        invitationCodesData = [];
        snapshot.forEach(d => invitationCodesData.push({ id: d.id, ...d.data() }));
        renderCodesTable();
    });
    listeners.push(codesListener);
}

export async function destroy() {
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
}
```

### Pattern 3: UUID Invitation Code Generation
**What:** Use native `crypto.randomUUID()` to generate cryptographically secure v4 UUIDs
**When to use:** For invitation code generation (secure, collision-resistant)
**Example:**
```javascript
// Source: MDN Crypto API documentation
async function generateInvitationCode() {
    const code = crypto.randomUUID(); // e.g., "a3f8b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
    const currentUser = getCurrentUser();

    await addDoc(collection(db, 'invitation_codes'), {
        code: code,
        status: 'active',
        created_at: serverTimestamp(),
        created_by: currentUser.uid,
        expires_at: new Timestamp(Date.now() / 1000 + 10800, 0), // 3 hours from now
        used_at: null,
        used_by: null
    });

    return code;
}
```

### Pattern 4: Clipboard Copy with Navigator API
**What:** Use modern Clipboard API with fallback and user feedback
**When to use:** Copy-to-clipboard buttons for invitation codes
**Example:**
```javascript
// Source: Clipboard API web.dev guide
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Code copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy code', 'error');
    }
}
```

### Pattern 5: Three-Dot Dropdown Menu for Row Actions
**What:** Dropdown menu triggered by three-dot button in table rows
**When to use:** Table rows with multiple actions (edit role, assign projects, deactivate, delete)
**Example:**
```javascript
// Source: CodePen examples and Notion design patterns
function renderUserRow(user) {
    return `
        <tr>
            <td>${user.email}</td>
            <td><span class="badge role-${user.role}">${ROLE_LABELS[user.role]}</span></td>
            <td><span class="status-badge ${user.status}">${user.status}</span></td>
            <td>${formatAssignedProjects(user)}</td>
            <td>
                <div class="dropdown-container">
                    <button class="btn-icon" onclick="toggleDropdown('${user.id}')">⋮</button>
                    <div id="dropdown-${user.id}" class="dropdown-menu">
                        <button onclick="editUserRole('${user.id}')">Edit Role</button>
                        <button onclick="assignProjects('${user.id}')">Assign Projects</button>
                        <button onclick="deactivateUser('${user.id}')">Deactivate</button>
                        <button class="danger" onclick="deleteUser('${user.id}')">Delete</button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}
```

### Pattern 6: Modal-Based Role Assignment During Approval
**What:** Modal dialog opens when approving pending user, allows role selection before confirmation
**When to use:** Approval workflow where admin must select role as part of approval
**Example:**
```javascript
// Source: Existing logout confirmation modal pattern in auth.js
function showApprovalModal(userId, userEmail) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog">
            <h3>Approve User</h3>
            <p>Approving: ${userEmail}</p>
            <div class="form-group">
                <label>Assign Role:</label>
                <select id="roleSelect">
                    <option value="">-- Select Role --</option>
                    <option value="super_admin">Super Admin</option>
                    <option value="operations_admin">Operations Admin</option>
                    <option value="operations_user">Operations User</option>
                    <option value="finance">Finance</option>
                    <option value="procurement">Procurement</option>
                </select>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeApprovalModal()">Cancel</button>
                <button class="btn btn-primary" onclick="confirmApproval('${userId}')">Approve</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function confirmApproval(userId) {
    const role = document.getElementById('roleSelect').value;
    if (!role) {
        showToast('Please select a role', 'error');
        return;
    }

    await updateDoc(doc(db, 'users', userId), {
        status: 'active',
        role: role,
        updated_at: serverTimestamp()
    });

    closeApprovalModal();
    showToast('User approved successfully', 'success');
}
```

### Pattern 7: Type-to-Confirm for Destructive Actions
**What:** User must type email address to confirm deactivation/deletion
**When to use:** High-risk irreversible actions
**Example:**
```javascript
// Source: GitLab destructive actions pattern
function showDeactivateConfirmation(userId, userEmail) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog modal-danger">
            <h3>Deactivate User Account</h3>
            <p><strong>This will immediately log out the user.</strong></p>
            <p>User: ${userEmail}</p>
            <div class="form-group">
                <label>Type <code>${userEmail}</code> to confirm:</label>
                <input type="text" id="confirmEmail" placeholder="Enter email to confirm">
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeConfirmModal()">Cancel</button>
                <button class="btn btn-danger" onclick="confirmDeactivate('${userId}', '${userEmail}')">
                    Deactivate Account
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function confirmDeactivate(userId, expectedEmail) {
    const typedEmail = document.getElementById('confirmEmail').value.trim();

    if (typedEmail !== expectedEmail) {
        showToast('Email does not match', 'error');
        return;
    }

    // Check for last Super Admin protection
    if (await isLastSuperAdmin(userId)) {
        showToast('Cannot deactivate last Super Admin', 'error');
        return;
    }

    await updateDoc(doc(db, 'users', userId), {
        status: 'deactivated',
        updated_at: serverTimestamp()
    });

    closeConfirmModal();
    showToast('User deactivated', 'success');
}
```

### Pattern 8: Last Super Admin Protection
**What:** Query Firestore to count active Super Admins before allowing deactivation
**When to use:** Before deactivating/deleting any Super Admin user
**Example:**
```javascript
async function isLastSuperAdmin(userId) {
    const user = usersData.find(u => u.id === userId);
    if (user.role !== 'super_admin') return false;

    // Count active super admins
    const q = query(
        collection(db, 'users'),
        where('role', '==', 'super_admin'),
        where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);

    return snapshot.size <= 1; // Only one active Super Admin remaining
}
```

### Anti-Patterns to Avoid
- **Real-time deletion of Firebase Auth accounts:** Firebase Auth user deletion requires Admin SDK (backend) or user reauthentication. Don't implement unless using Cloud Functions. Deactivation is sufficient for v1.0.
- **Hardcoded role options:** Use ROLE_LABELS constant from existing codebase (role-config.js) for consistency.
- **Client-side TTL enforcement:** Don't manually check and delete expired codes. Use Firestore TTL policy to handle expiration automatically.
- **Sequential invitation codes:** Don't use MRF-style sequential IDs. UUIDs provide security through unpredictability.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom random string generator | `crypto.randomUUID()` | Native API is cryptographically secure, RFC4122-compliant, collision-resistant |
| Code expiration cleanup | Scheduled Cloud Function or manual queries | Firestore TTL policies | Serverless, automatic, no code maintenance required |
| Copy to clipboard | Manual textarea selection + execCommand | Navigator Clipboard API | Modern standard, better security, simpler API |
| Modal confirmation | Custom alert/prompt | Reusable modal pattern from auth.js | Consistent UX, better styling, already established |
| Role assignment UI | Custom form | Modal + dropdown (existing pattern) | Matches logout confirmation pattern, reusable |
| User deactivation | Custom Firebase Auth deletion | Firestore status update to 'deactivated' | Already implemented (AUTH-09), triggers auto-logout |

**Key insight:** The codebase already has strong patterns for admin UIs (role-config.js, project-assignments.js), auth workflows (register.js, pending.js), and confirmation dialogs (auth.js). Reusing these patterns ensures consistency and reduces implementation risk.

## Common Pitfalls

### Pitfall 1: Forgetting to Check Last Super Admin Before Deactivation
**What goes wrong:** Super Admin deactivates themselves or another admin, locking everyone out of admin functions
**Why it happens:** No validation before status update
**How to avoid:** Always query for active Super Admins count before allowing deactivation of a Super Admin user
**Warning signs:** User receives no error message when trying to deactivate last Super Admin

### Pitfall 2: Expired Codes Still Showing as Active
**What goes wrong:** Invitation codes past 3-hour expiration still appear as "active" in admin UI
**Why it happens:** Firestore TTL deletion is not instantaneous (takes up to 24 hours)
**How to avoid:** Filter expired codes in UI by comparing `expires_at` timestamp with current time, OR rely on TTL and accept eventual consistency
**Warning signs:** Admin sees old "active" codes that fail validation when used

### Pitfall 3: Rejected Users Left in Database
**What goes wrong:** Accumulation of rejected user accounts in Firestore
**Why it happens:** Decision to delete rejected users immediately but forgetting to delete Firebase Auth account
**How to avoid:** Either keep rejected users (set status='rejected') OR delete both Firestore doc and Firebase Auth user (requires reauthentication or Admin SDK)
**Warning signs:** Firestore `users` collection grows with rejected users; Firebase Auth user count doesn't match Firestore active users

### Pitfall 4: Clipboard API Fails on HTTP
**What goes wrong:** Copy button silently fails or throws error
**Why it happens:** Clipboard API requires secure context (HTTPS or localhost)
**How to avoid:** Test on localhost during development; ensure production uses HTTPS (already configured via Netlify)
**Warning signs:** Copy button works on localhost but fails on HTTP test servers

### Pitfall 5: Pending Changes Not Reflected in Real-time
**What goes wrong:** Admin approves user but pending table doesn't update until page refresh
**Why it happens:** Forgot to set up onSnapshot listener for pending users query
**How to avoid:** Use onSnapshot for all real-time data (users, codes) and re-render UI in listener callback
**Warning signs:** Admin has to refresh page to see changes

### Pitfall 6: Dropdown Menus Don't Close on Outside Click
**What goes wrong:** Three-dot dropdown stays open when clicking elsewhere
**Why it happens:** No document-level click listener to close open dropdowns
**How to avoid:** Add document click listener that closes all open dropdowns except when clicking the toggle button
**Warning signs:** Multiple dropdowns can be open at once; dropdowns persist after actions

### Pitfall 7: Modal Dialogs Accumulate in DOM
**What goes wrong:** Memory leak from creating modal elements without removing them
**Why it happens:** Creating modal DOM elements dynamically but not cleaning up after close
**How to avoid:** Remove modal element from DOM when closing, or reuse single modal container
**Warning signs:** Multiple modal overlays stacked in DOM; page performance degrades over time

### Pitfall 8: Firestore TTL Not Configured
**What goes wrong:** Expired invitation codes never get deleted automatically
**Why it happens:** TTL policy must be configured in Firebase Console or via CLI, not in application code
**How to avoid:** Document TTL policy setup as deployment step in PLAN.md
**Warning signs:** `invitation_codes` collection grows indefinitely with old expired codes

## Code Examples

Verified patterns from official sources and existing codebase:

### UUID Generation
```javascript
// Source: MDN Crypto API (https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
async function generateInvitationCode() {
    // crypto.randomUUID() generates v4 UUID (random, not time-based)
    const code = crypto.randomUUID();
    // Example: "a3f8b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c"

    const currentUser = getCurrentUser();
    const now = Date.now();
    const expiresInSeconds = 3 * 60 * 60; // 3 hours

    await addDoc(collection(db, 'invitation_codes'), {
        code: code,
        status: 'active',
        created_at: serverTimestamp(),
        created_by: currentUser.uid,
        expires_at: new Timestamp((now / 1000) + expiresInSeconds, 0),
        used_at: null,
        used_by: null
    });

    return code;
}
```

### Copy to Clipboard with Feedback
```javascript
// Source: web.dev Clipboard patterns (https://web.dev/patterns/clipboard/copy-text)
async function copyCodeToClipboard(code) {
    try {
        // Requires HTTPS or localhost
        await navigator.clipboard.writeText(code);
        showToast('Invitation code copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('Failed to copy code. Please copy manually.', 'error');
    }
}
```

### Approve Pending User with Role Assignment
```javascript
// Source: Existing codebase patterns (updateDoc from role-config.js, modal from auth.js)
async function approvePendingUser(userId, role) {
    try {
        await updateDoc(doc(db, 'users', userId), {
            status: 'active',
            role: role,
            updated_at: serverTimestamp()
        });

        console.log('[AdminUsers] User approved:', userId, 'as', role);
        showToast('User approved successfully', 'success');
    } catch (error) {
        console.error('[AdminUsers] Error approving user:', error);
        showToast('Error approving user: ' + error.message, 'error');
    }
}
```

### Reject Pending User (Delete Immediately)
```javascript
// Source: Context decision - delete rejected users immediately
async function rejectPendingUser(userId, userEmail) {
    if (!confirm(`Are you sure you want to reject ${userEmail}? This will delete the account.`)) {
        return;
    }

    try {
        // Delete Firestore user document
        await deleteDoc(doc(db, 'users', userId));

        // Note: Firebase Auth user remains (can't delete without Admin SDK or reauthentication)
        // Consider adding note to admin that Auth user persists

        console.log('[AdminUsers] User rejected and deleted:', userId);
        showToast('User rejected and removed', 'success');
    } catch (error) {
        console.error('[AdminUsers] Error rejecting user:', error);
        showToast('Error rejecting user: ' + error.message, 'error');
    }
}
```

### Deactivate User with Last Super Admin Check
```javascript
// Source: Context decisions + GitLab destructive actions pattern
async function deactivateUser(userId) {
    const user = usersData.find(u => u.id === userId);
    if (!user) return;

    // Last Super Admin protection
    if (user.role === 'super_admin') {
        const q = query(
            collection(db, 'users'),
            where('role', '==', 'super_admin'),
            where('status', '==', 'active')
        );
        const snapshot = await getDocs(q);

        if (snapshot.size <= 1) {
            showToast('Cannot deactivate last Super Admin account', 'error');
            return;
        }
    }

    try {
        await updateDoc(doc(db, 'users', userId), {
            status: 'deactivated',
            updated_at: serverTimestamp()
        });

        console.log('[AdminUsers] User deactivated:', userId);
        showToast('User deactivated. They will be logged out immediately.', 'success');
    } catch (error) {
        console.error('[AdminUsers] Error deactivating user:', error);
        showToast('Error deactivating user: ' + error.message, 'error');
    }
}
```

### Reactivate User
```javascript
// Source: Context decision - deactivation is reversible
async function reactivateUser(userId) {
    const user = usersData.find(u => u.id === userId);
    if (!user) return;

    if (!confirm(`Reactivate ${user.email}? They will be able to log in again.`)) {
        return;
    }

    try {
        await updateDoc(doc(db, 'users', userId), {
            status: 'active',
            updated_at: serverTimestamp()
        });

        console.log('[AdminUsers] User reactivated:', userId);
        showToast('User reactivated successfully', 'success');
    } catch (error) {
        console.error('[AdminUsers] Error reactivating user:', error);
        showToast('Error reactivating user: ' + error.message, 'error');
    }
}
```

### Format Assigned Projects Display
```javascript
// Source: Context decision - show "All projects" or count
function formatAssignedProjects(user) {
    if (user.role !== 'operations_user') {
        return '<span class="badge gray">Not applicable</span>';
    }

    if (user.all_projects === true) {
        return '<span class="badge success">All projects</span>';
    }

    const count = Array.isArray(user.assigned_project_codes) ? user.assigned_project_codes.length : 0;

    if (count === 0) {
        return '<span class="badge gray">No projects</span>';
    }

    return `<span class="badge info">${count} project${count !== 1 ? 's' : ''}</span>`;
}
```

### Three-Dot Dropdown Toggle
```javascript
// Source: CodePen patterns + Notion design
function toggleDropdown(userId) {
    const dropdown = document.getElementById(`dropdown-${userId}`);
    if (!dropdown) return;

    // Close all other dropdowns
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        if (menu.id !== `dropdown-${userId}`) {
            menu.classList.remove('show');
        }
    });

    // Toggle current dropdown
    dropdown.classList.toggle('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (event) => {
    if (!event.target.closest('.dropdown-container')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});
```

### Filter Expired Codes in UI
```javascript
// Source: Firestore TTL caveat - deletion not immediate
function renderInvitationCodesTable() {
    const now = Date.now() / 1000; // Current time in seconds

    // Filter out expired codes in UI even if not yet deleted by TTL
    const activeCodes = invitationCodesData.filter(code => {
        if (code.status === 'used') return false;
        if (code.expires_at && code.expires_at.seconds < now) return false;
        return true;
    });

    const expiredCodes = invitationCodesData.filter(code => {
        return code.status === 'active' && code.expires_at && code.expires_at.seconds < now;
    });

    // Render tables separately for active and expired
    // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Math.random() UUIDs | crypto.randomUUID() | 2021 | Cryptographically secure, collision-resistant, standard-compliant |
| document.execCommand('copy') | Navigator Clipboard API | 2020 | Async, secure context required, better UX |
| Manual scheduled cleanup | Firestore TTL policies | 2022 | Serverless, automatic, reduces code complexity |
| Firebase Admin SDK client-side | Firestore status updates | Ongoing | Simpler architecture, no backend required for deactivation |

**Deprecated/outdated:**
- **document.execCommand('copy')**: Replaced by Clipboard API. Still works but deprecated.
- **Firebase Admin SDK for simple user management**: Not needed for status changes; Firestore updates sufficient for deactivation. Admin SDK only required for true account deletion.

## Open Questions

Things that couldn't be fully resolved:

1. **Firebase Auth User Deletion**
   - What we know: Requires Firebase Admin SDK (backend) or user reauthentication (client-side)
   - What's unclear: Whether deleted users should be permanently removed from Firebase Auth or just deactivated in Firestore
   - Recommendation: Implement deactivation only for Phase 9. User deletion can be manual via Firebase Console or deferred to Phase 10 with Cloud Functions.

2. **Firestore TTL Policy Setup**
   - What we know: TTL policies are configured in Firebase Console or via Firebase CLI, not in application code
   - What's unclear: Exact CLI commands and required permissions
   - Recommendation: Document TTL setup as manual deployment step. Policy targets `invitation_codes` collection, field `expires_at`, with automatic deletion.

3. **Rejected User Cleanup Strategy**
   - What we know: Context decision is to delete rejected users immediately from Firestore
   - What's unclear: Whether to also attempt Firebase Auth deletion (requires Admin SDK or reauthentication)
   - Recommendation: Delete Firestore document only. Firebase Auth user persists but cannot log in (no Firestore doc means no role/status). Admin can manually clean up Auth users later.

## Sources

### Primary (HIGH confidence)
- **MDN Crypto API**: crypto.randomUUID() documentation (https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)
- **Firebase Firestore TTL Documentation**: Official Google Cloud docs on TTL policies (https://firebase.google.com/docs/firestore/ttl)
- **Clipboard API Documentation**: web.dev patterns for copy-to-clipboard (https://web.dev/patterns/clipboard/copy-text)
- **Existing Codebase**: role-config.js, project-assignments.js, auth.js, register.js, pending.js for established patterns

### Secondary (MEDIUM confidence)
- **GitLab Destructive Actions Pattern**: Type-to-confirm UX for dangerous actions (https://design.gitlab.com/patterns/destructive-actions/)
- **Smashing Magazine**: Managing dangerous actions in UIs (https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- **Firebase Admin SDK**: User management documentation (https://firebase.google.com/docs/auth/admin/manage-users)

### Tertiary (LOW confidence)
- **CodePen Examples**: Three-dot dropdown menu implementations (multiple examples, not production-vetted)
- **Medium Articles**: Firebase user deletion best practices (various authors, 2021-2025)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already integrated, native APIs well-documented
- Architecture: HIGH - Strong existing patterns from role-config.js and project-assignments.js
- Pitfalls: HIGH - Common issues well-documented in official docs and codebase history

**Research date:** 2026-02-04
**Valid until:** 60 days (stable Firebase APIs, established browser standards)
