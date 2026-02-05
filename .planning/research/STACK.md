# Stack Research: Debugging & Refinement Tools for Firebase/Vanilla JS SPA

**Domain:** Bug fixes and system refinement for v2.1
**Researched:** 2026-02-05
**Confidence:** HIGH

## Executive Summary

For debugging and fixing the v2.1 issues (Security Rules permission errors, window function errors, missing features), the recommended stack leverages **Firebase's built-in debugging tools** (Emulator Suite, Rules Playground), **Chrome DevTools**, and **established vanilla JavaScript patterns** for event handling and modal implementation. The existing Firebase v10.7.1 + vanilla JavaScript ES6 architecture remains optimal for this zero-build static SPA.

**Key Focus:** Debug security rules with Firebase Emulator Suite, fix window function scope issues with proper module patterns, implement modals following W3C accessibility standards, and optimize Firestore aggregations for financial calculations.

---

## Recommended Debugging Tools

### Firebase Security Rules Testing

| Tool | Version | Purpose | Why Recommended |
|------|---------|---------|-----------------|
| Firebase Emulator Suite | Latest (via Firebase CLI) | Local testing of Security Rules without affecting production | Industry standard for rules testing, provides detailed debugging output, catches permission errors before deployment |
| Rules Playground | Web Console | Quick rule simulation in Firebase Console | Zero setup, test individual operations (get/list/create/update/delete), shows which rule allowed/denied request |
| @firebase/rules-unit-testing | Latest | Automated unit tests for security rules | Enables regression testing, currently have 17 tests passing, can add tests for clients/projects collections |

**Installation (if not already installed):**
```bash
npm install -g firebase-tools
firebase init emulators  # Select Firestore emulator
```

**Usage Pattern:**
```bash
# Start emulator
firebase emulators:start --only firestore

# Run tests
npm test  # Runs test/firestore.test.js
```

### Chrome DevTools for JavaScript Debugging

| Feature | Purpose | When to Use |
|---------|---------|-------------|
| Sources Panel Breakpoints | Pause execution to inspect variables | Debug "function not defined" errors in onclick handlers |
| Console Panel | View errors, test functions interactively | Check if window functions are properly exposed |
| Network Panel | Monitor Firestore requests and responses | Debug permission denied errors, see exact request/response |
| Scope Pane (while paused) | View local, closure, and global scope variables | Verify window namespace pollution, check function availability |

### Browser-Based Development Server

| Tool | Command | Purpose |
|------|---------|---------|
| Python HTTP Server | `python -m http.server 8000` | Zero-config local development, currently used |
| npx http-server | `npx http-server -p 8000` | Alternative with better MIME types |

---

## Debugging Techniques by Issue Type

### Issue 1: Security Rules Permission Denied (Clients/Projects Collections)

**Problem:** Super Admin receives "permission denied" when accessing Clients or Projects tabs.

**Root Cause:** Missing collection rules in `firestore.rules` or incorrect role checking logic.

**Debugging Protocol:**

1. **Check if rules exist for collection:**
   ```bash
   # In firestore.rules, search for:
   match /clients/{clientId} {
   match /projects/{projectId} {
   ```

2. **Use Rules Playground to test:**
   - Open Firebase Console → Firestore Database → Rules → Rules Playground
   - Operation: "Get" or "List"
   - Path: `/projects/{projectId}` or `/clients/{clientId}`
   - Auth: Authenticated with Super Admin UID
   - Click "Run" → See if allowed/denied + which rule matched

3. **Add logging to identify which operation fails:**
   ```javascript
   // In app/views/projects.js or clients.js
   try {
       const snapshot = await getDocs(collection(db, 'projects'));
       console.log('[Projects] Successfully fetched projects:', snapshot.size);
   } catch (error) {
       console.error('[Projects] Permission denied:', error);
       console.log('[Projects] Current user:', auth.currentUser?.uid);
       console.log('[Projects] User role:', window.getUserRole?.());
   }
   ```

4. **Verify Security Rules helper functions:**
   - Ensure `isActiveUser()` and `hasRole()` are defined before collection rules
   - Confirm role string matches exactly (case-sensitive: `super_admin` not `Super Admin`)

**Expected Rules Structure (if missing):**
```javascript
// firestore.rules
match /clients/{clientId} {
  // All active users can read
  allow read: if isActiveUser();

  // Create/Update/Delete: super_admin, operations_admin
  allow create, update, delete: if hasRole(['super_admin', 'operations_admin']);
}

match /projects/{projectId} {
  // All active users can read
  allow read: if isActiveUser();

  // Create/Update/Delete: super_admin, operations_admin
  allow create, update: if hasRole(['super_admin', 'operations_admin']);
  allow delete: if hasRole(['super_admin', 'operations_admin']);
}
```

**Verification:**
```bash
# Run existing tests
npm test

# Add new test cases for clients/projects in test/firestore.test.js
```

### Issue 2: Window Functions Not Defined (Button Click Errors)

**Problem:** `TypeError: window.viewTRDetails is not a function` or `window.viewPRDetails is not a function`.

**Root Cause:** Functions defined in ES6 modules are scoped to module, not automatically exposed to global `window` object. Inline `onclick="window.functionName()"` handlers cannot find them.

**Debugging Protocol:**

1. **Verify function is exposed to window:**
   ```javascript
   // Open Chrome DevTools Console
   console.log(typeof window.viewTRDetails);  // Should be "function", not "undefined"
   ```

2. **Check module exports pattern:**
   ```javascript
   // In app/views/finance.js
   export async function viewTRDetails(trId) {
       // ... implementation
   }

   // REQUIRED: Expose to window for onclick handlers
   window.viewTRDetails = viewTRDetails;
   ```

3. **Verify init() was called:**
   - Router should call `init()` after rendering view
   - `init()` is where window functions are typically exposed
   - Check router logs: `console.log('[Router] Calling init for view')`

4. **Check if destroy() removed functions:**
   ```javascript
   // In destroy() function
   export async function destroy() {
       listeners.forEach(unsubscribe => unsubscribe?.());
       listeners = [];

       // AVOID deleting window functions if tabs switch without destroy
       // delete window.viewTRDetails;  // This can cause errors
   }
   ```

**Fix Pattern (if function missing):**
```javascript
// app/views/finance.js

export async function viewTRDetails(trId) {
    console.log('[Finance] Viewing TR:', trId);
    // ... implementation
}

export async function viewPRDetails(prId) {
    console.log('[Finance] Viewing PR:', prId);
    // ... implementation
}

export async function init(activeTab = 'approvals') {
    console.log('[Finance] Initializing, active tab:', activeTab);

    // Expose functions to window
    window.viewTRDetails = viewTRDetails;
    window.viewPRDetails = viewPRDetails;
    window.refreshPRs = refreshPRs;
    window.refreshTRs = refreshTRs;

    // Set up listeners
    setupRealtimeListeners(activeTab);
}
```

**Best Practice (Modern Alternative to onclick):**

Instead of inline onclick handlers, use event delegation (requires more refactoring):
```javascript
// In render() - add data attributes instead of onclick
<button data-action="view-tr" data-tr-id="${tr.tr_id}">Review</button>

// In init() - set up event listener
document.querySelector('#transportRequestsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="view-tr"]');
    if (btn) {
        const trId = btn.dataset.trId;
        viewTRDetails(trId);
    }
});
```

**Why This Matters:** [MDN Event Handling Best Practices](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events) recommends `addEventListener()` over inline handlers for separation of concerns.

### Issue 3: Firestore Query Optimization for Financial Aggregations

**Problem:** Need to calculate total pending amounts, project expenses, supplier purchase totals efficiently.

**Solution:** Use Firestore aggregation queries (available in v10.7.1+).

**Pattern for SUM aggregation:**
```javascript
import { collection, query, where, getAggregateFromServer, sum } from './firebase.js';

// Calculate total pending PR amount
async function calculatePendingPRTotal() {
    const q = query(
        collection(db, 'prs'),
        where('finance_status', '==', 'Pending')
    );

    const snapshot = await getAggregateFromServer(q, {
        totalAmount: sum('total_amount')
    });

    const total = snapshot.data().totalAmount;
    console.log('[Finance] Total pending:', total);
    return total;
}

// Calculate project expenses
async function calculateProjectExpenses(projectCode) {
    const q = query(
        collection(db, 'pos'),
        where('project_code', '==', projectCode),
        where('procurement_status', '==', 'Delivered')
    );

    const snapshot = await getAggregateFromServer(q, {
        totalSpent: sum('total_amount')
    });

    return snapshot.data().totalSpent || 0;
}
```

**Key Benefits:**
- Firestore calculates server-side, transmits only result (not all documents)
- Saves billed document reads (1 aggregation ≠ N document reads)
- Faster than fetching all docs and calculating client-side

**Note:** Aggregation counts as 1 read for pricing, regardless of documents matched.

**Sources:**
- [Firebase Aggregation Queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [Aggregate with SUM and AVG](https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore)

### Issue 4: Modal Implementation Best Practices

**Problem:** Need modals for audit trail, supplier purchase history, PO details, project expenses.

**Recommended Pattern:** Accessible modal following W3C ARIA Authoring Practices.

**Reference Implementation (Vanilla JS):**
```javascript
// Modal HTML structure
function renderModal(id, title, content) {
    return `
        <div id="${id}" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="${id}-title" style="display: none;">
            <div class="modal-container">
                <div class="modal-header">
                    <h2 id="${id}-title">${title}</h2>
                    <button class="modal-close" aria-label="Close dialog" data-modal-close="${id}">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-modal-close="${id}">Close</button>
                </div>
            </div>
        </div>
    `;
}

// Modal control functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.style.display = 'flex';

    // Focus management: save previous focus
    window.previousFocus = document.activeElement;

    // Focus first focusable element in modal
    const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    firstFocusable?.focus();

    // Trap focus within modal
    modal.addEventListener('keydown', trapFocus);

    // Close on Escape
    modal.addEventListener('keydown', closeOnEscape);

    console.log('[Modal] Opened:', modalId);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.style.display = 'none';

    // Restore focus to element that opened modal
    window.previousFocus?.focus();

    // Remove event listeners
    modal.removeEventListener('keydown', trapFocus);
    modal.removeEventListener('keydown', closeOnEscape);

    console.log('[Modal] Closed:', modalId);
}

function trapFocus(e) {
    if (e.key !== 'Tab') return;

    const modal = e.currentTarget;
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
    }
}

function closeOnEscape(e) {
    if (e.key === 'Escape') {
        const modalId = e.currentTarget.id;
        closeModal(modalId);
    }
}

// Event delegation for close buttons
document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-modal-close]');
    if (closeBtn) {
        const modalId = closeBtn.dataset.modalClose;
        closeModal(modalId);
    }

    // Close on overlay click (optional)
    if (e.target.classList.contains('modal-overlay')) {
        const modalId = e.target.id;
        closeModal(modalId);
    }
});

// Expose to window for onclick handlers
window.showModal = showModal;
window.closeModal = closeModal;
```

**CSS Requirements:**
```css
/* styles/components.css */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-container {
    background: white;
    border-radius: 8px;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--gray-200);
}

.modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--gray-600);
}

.modal-close:hover {
    color: var(--gray-900);
}

.modal-body {
    padding: 1.5rem;
}

.modal-footer {
    padding: 1.5rem;
    border-top: 1px solid var(--gray-200);
    text-align: right;
}
```

**Accessibility Features (W3C Compliant):**
- `role="dialog"` and `aria-modal="true"` for screen readers
- `aria-labelledby` references modal title
- Focus trap (Tab/Shift+Tab cycle within modal)
- Escape key closes modal
- Focus restoration when closing
- Keyboard-accessible close button

**Sources:**
- [W3C Modal Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
- [Micromodal.js](https://micromodal.vercel.app/) (reference implementation)
- [Creating Accessible Dialogs](https://www.smashingmagazine.com/2021/07/accessible-dialog-from-scratch/)

---

## Firebase Firestore Real-Time Listener Management

**Critical Pattern:** Prevent memory leaks by properly unsubscribing listeners.

**Current Pattern (Good):**
```javascript
// app/views/finance.js
let listeners = [];

export async function init(activeTab = 'approvals') {
    const listener = onSnapshot(collection(db, 'prs'), (snapshot) => {
        // Handle updates
    });
    listeners.push(listener);
}

export async function destroy() {
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];
}
```

**Known Issue:** Router skips `destroy()` when switching tabs within same view.

**Why This Matters:** Every `onSnapshot()` that isn't unsubscribed keeps listening, consuming memory and bandwidth. With 10-15 listeners, browser tabs can crash.

**Verification:**
```javascript
// In init()
console.log('[Finance] Active listeners before init:', listeners.length);

// In destroy()
console.log('[Finance] Unsubscribing', listeners.length, 'listeners');
```

**Best Practice:** If router doesn't call `destroy()` on tab switch, manually clean up tab-specific listeners:
```javascript
export async function init(activeTab = 'approvals') {
    // Clean up previous tab's listeners
    listeners.forEach(unsubscribe => unsubscribe?.());
    listeners = [];

    // Set up new tab's listeners
    if (activeTab === 'approvals') {
        const prListener = onSnapshot(collection(db, 'prs'), ...);
        listeners.push(prListener);
    } else if (activeTab === 'pos') {
        const poListener = onSnapshot(collection(db, 'pos'), ...);
        listeners.push(poListener);
    }
}
```

**Source:** [Firebase Real-Time Listeners Memory Leak](https://github.com/firebase/firebase-js-sdk/issues/4416)

---

## Chrome DevTools Debugging Workflows

### Workflow 1: Debug "Function Not Defined" Error

**Steps:**
1. Open DevTools (F12) → Console tab
2. See error: `Uncaught ReferenceError: window.viewTRDetails is not a function`
3. In Console, type: `window.viewTRDetails` → Check if returns `undefined` or function
4. If `undefined`:
   - Go to Sources tab → Navigate to `app/views/finance.js`
   - Search for `window.viewTRDetails =`
   - If missing, add: `window.viewTRDetails = viewTRDetails;` in `init()`
5. Refresh page and test again
6. If still fails, check if `init()` was called:
   - Add breakpoint at start of `init()`
   - Reload page
   - Debugger should pause → if not, router isn't calling `init()`

### Workflow 2: Debug Permission Denied Error

**Steps:**
1. Open DevTools → Network tab
2. Filter: "firestore.googleapis.com"
3. Trigger the operation that fails (e.g., click Projects tab)
4. Find the failed request (Status: 400 or 403, red)
5. Click request → Response tab → See error:
   ```json
   {
     "error": {
       "code": 403,
       "message": "Missing or insufficient permissions.",
       "status": "PERMISSION_DENIED"
     }
   }
   ```
6. Check Console for custom error message:
   ```
   [Projects] Permission denied: FirebaseError: Missing or insufficient permissions
   [Projects] Current user: abc123
   [Projects] User role: super_admin
   ```
7. Verify Security Rules:
   - Open Firebase Console → Firestore → Rules
   - Search for `match /projects/{projectId}`
   - Test in Rules Playground with actual user UID and role

### Workflow 3: Debug Real-Time Listener Not Updating UI

**Steps:**
1. Open DevTools → Console tab
2. Add logging to onSnapshot callback:
   ```javascript
   onSnapshot(collection(db, 'prs'), (snapshot) => {
       console.log('[Finance] Snapshot received, size:', snapshot.size);
       snapshot.docChanges().forEach((change) => {
           console.log('[Finance] Doc change:', change.type, change.doc.id);
       });
   });
   ```
3. Trigger change in Firestore (e.g., approve a PR from another tab)
4. Check Console for logs:
   - If "Snapshot received" appears → listener is working, issue is in UI update
   - If no logs → listener not set up or was unsubscribed
5. If listener working but UI not updating:
   - Add breakpoint in render function (e.g., `renderPRsTable()`)
   - Check if function is called
   - Verify DOM element exists: `document.getElementById('materialPRsBody')`

**Source:** [Chrome DevTools Debugging Guide](https://developer.chrome.com/docs/devtools/javascript)

---

## Testing Strategy for v2.1 Fixes

### Security Rules Testing

**Current State:** 17 tests passing in `test/firestore.test.js`

**Add Tests for Missing Collections:**
```javascript
// test/firestore.test.js

describe("clients collection", () => {
  beforeEach(seedUsers);

  it("super_admin can create client", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(
      setDoc(doc(superAdminDb, "clients", "CLIENT-001"), {
        client_code: "CLIENT-001",
        company_name: "Test Company",
        contact_person: "John Doe",
        contact_details: "john@test.com"
      })
    );
  });

  it("operations_admin can update client", async () => {
    // Seed a client first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "CLIENT-001"), {
        client_code: "CLIENT-001",
        company_name: "Test Company"
      });
    });

    const opsAdminDb = testEnv.authenticatedContext("active-ops-admin").firestore();
    await assertSucceeds(
      updateDoc(doc(opsAdminDb, "clients", "CLIENT-001"), {
        company_name: "Updated Company"
      })
    );
  });

  it("finance CANNOT create client", async () => {
    const financeDb = testEnv.authenticatedContext("active-finance").firestore();
    await assertFails(
      setDoc(doc(financeDb, "clients", "CLIENT-002"), {
        client_code: "CLIENT-002",
        company_name: "Fail Company"
      })
    );
  });
});

describe("projects collection", () => {
  beforeEach(seedUsers);

  it("super_admin can read all projects", async () => {
    const superAdminDb = testEnv.authenticatedContext("active-super-admin").firestore();
    await assertSucceeds(getDocs(collection(superAdminDb, "projects")));
  });

  it("operations_user can read projects (not scoped)", async () => {
    const opsUserDb = testEnv.authenticatedContext("active-ops-user").firestore();
    await assertSucceeds(getDocs(collection(opsUserDb, "projects")));
  });
});
```

**Run Tests:**
```bash
# Start Firestore emulator
firebase emulators:start --only firestore

# In another terminal, run tests
npm test
```

### Manual Testing Checklist

**Security Rules:**
- [ ] Super Admin can access Clients tab without permission error
- [ ] Super Admin can access Projects tab without permission error
- [ ] Operations Admin can create/edit clients and projects
- [ ] Finance cannot modify clients or projects
- [ ] Operations User can view but not modify clients/projects

**Window Functions:**
- [ ] Material PR Review button works (no "window.viewPRDetails is not a function")
- [ ] Transport Request Review button works (no "window.viewTRDetails is not a function")
- [ ] All onclick handlers in Finance view functional
- [ ] All onclick handlers in Procurement view functional

**Modals:**
- [ ] Audit trail modal opens and displays data
- [ ] Supplier purchase history modal opens
- [ ] PO details modal shows payment terms, condition, delivery date
- [ ] Project expenses modal shows breakdown
- [ ] All modals close with Escape key
- [ ] All modals close with X button
- [ ] Focus returns to trigger button after closing

**Financial Calculations:**
- [ ] Pending amount totals correct (use aggregation query)
- [ ] Project expenses calculate correctly
- [ ] Supplier purchase history totals correct

---

## Common Pitfalls & Prevention

### Pitfall 1: Security Rules Don't Match Collection Name

**Problem:** Rule defined for `match /project/{id}` but collection is `projects` (plural).

**Detection:** Permission denied error even for Super Admin.

**Prevention:** Always verify collection name matches Firestore Console exactly.

### Pitfall 2: Window Functions Deleted on Tab Switch

**Problem:** Router skips `destroy()` when switching tabs, but if `destroy()` runs later, it deletes window functions used by other tabs.

**Detection:** Function works initially, then becomes undefined after navigating to another view and back.

**Prevention:** Don't delete window functions in `destroy()` if they're shared across tabs:
```javascript
// AVOID in destroy()
delete window.viewTRDetails;

// INSTEAD: Let them persist, or namespace them
window.financeView = {
    viewTRDetails: viewTRDetails,
    viewPRDetails: viewPRDetails
};
```

### Pitfall 3: Aggregation Query on Non-Numeric Fields

**Problem:** `sum('field_name')` on string field returns 0 or error.

**Detection:** Total always shows 0 even with data.

**Prevention:** Verify field is stored as number in Firestore:
```javascript
// WRONG - stores as string
await setDoc(doc(db, 'prs', 'PR-001'), {
    total_amount: "1500.00"  // String
});

// CORRECT - stores as number
await setDoc(doc(db, 'prs', 'PR-001'), {
    total_amount: 1500.00  // Number
});
```

### Pitfall 4: Modal Focus Trap Breaks Browser Back Button

**Problem:** Focus trap prevents clicking browser back button.

**Detection:** Can't use browser navigation while modal is open.

**Prevention:** Don't trap focus on browser UI elements, only within modal:
```javascript
function trapFocus(e) {
    if (e.key !== 'Tab') return;

    const modal = e.currentTarget;  // Only trap within this modal
    // ... focus trap logic
}
```

### Pitfall 5: Case-Sensitive Role Matching in Security Rules

**Problem:** Security rules use `getUserRole() == 'super_admin'` but user doc has `role: 'Super Admin'`.

**Detection:** Super Admin can't access anything despite having role.

**Prevention:** Standardize role string format (snake_case recommended):
- Firestore: `super_admin`, `operations_admin`, `operations_user`, `finance`, `procurement`
- UI: Display as "Super Admin" but store as `super_admin`

**Source:** [Firestore Security Rules Best Practices](https://firebase.google.com/docs/firestore/security/rules-structure)

---

## Version Compatibility

| Package | Current Version | Latest Version | Upgrade Needed? |
|---------|----------------|----------------|-----------------|
| firebase-app | 10.7.1 | 12.8.0 | Optional (10.7.1 stable) |
| firebase-firestore | 10.7.1 | 12.8.0 | Optional (aggregation works in 10.7.1) |
| firebase-auth | 10.7.1 | 12.8.0 | No (auth unchanged) |
| @firebase/rules-unit-testing | Should match SDK | 3.0.4 | Check package.json |

**Aggregation Query Support:** Available since Firebase JS SDK v9.18.0 (March 2023), confirmed working in v10.7.1.

**No breaking changes expected** for v10 → v12 upgrade if needed later.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `eval()` to create window functions dynamically | Security risk, CSP violation | Explicit `window.functionName = functionName` |
| Modal libraries (Bootstrap Modal, etc.) | Adds dependencies, breaks zero-build pattern | Vanilla JS modal with W3C ARIA patterns |
| jQuery for event delegation | Unnecessary dependency | Native `addEventListener()` with event delegation |
| Client-side role checks without Security Rules | Can be bypassed via console/DevTools | Always enforce with Security Rules |
| `getCountFromServer()` without where clause | Counts all docs, expensive | Add `where()` filters before counting |
| Fetching all docs for aggregation | Wastes reads, slow | Use `getAggregateFromServer()` with `sum()` |
| Global error handlers (`window.onerror`) | Hides specific errors | Try/catch blocks with contextual logging |

---

## Known Limitations & Workarounds

### Limitation 1: Security Rules Error Messages Not Specific

**Problem:** "Missing or insufficient permissions" doesn't say which rule failed or which field caused issue.

**Workaround:** Use Rules Playground to test specific operations, add console logging to client code to identify which operation failed.

**Source:** [GitHub Issue #1006 - Meaningful Debug Info](https://github.com/firebase/firebase-js-sdk/issues/1006)

### Limitation 2: Firestore 'in' Query Limited to 10 Items

**Problem:** `where('project_code', 'in', assignedProjects)` fails if `assignedProjects.length > 10`.

**Current Workaround:** Client-side filtering (already implemented for project assignments).

**Source:** Firestore query limitations documented at [Firestore Query Best Practices](https://estuary.dev/blog/firestore-query-best-practices/)

### Limitation 3: Aggregation Queries Don't Support Complex Filtering

**Problem:** Can't filter aggregation results client-side (e.g., "sum only if status = X and urgency = Y").

**Workaround:** Use compound `where()` clauses before aggregation:
```javascript
const q = query(
    collection(db, 'prs'),
    where('finance_status', '==', 'Pending'),
    where('urgency_level', '==', 'Critical')
);
const snapshot = await getAggregateFromServer(q, { total: sum('total_amount') });
```

### Limitation 4: ES6 Modules Don't Auto-Expose to Window

**Problem:** Functions in modules are scoped to module by design (feature, not bug).

**Workaround (Current):** Explicitly assign to `window` in `init()`:
```javascript
window.viewTRDetails = viewTRDetails;
```

**Better Long-Term:** Migrate from inline onclick to `addEventListener()` (requires refactoring HTML).

**Source:** [JavaScript Module Patterns](https://addyosmani.com/blog/essential-js-namespacing/)

---

## Security Considerations

### 1. CSP Headers Already Configured

Current `_headers` file includes Content-Security-Policy. Verify no inline scripts break CSP:
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.gstatic.com; ...
```

**Issue:** Inline `onclick="window.functionName()"` is allowed, but inline scripts (`<script>...</script>`) are blocked. This is correct.

### 2. Security Rules Are Single Source of Truth

**Critical:** Client-side permission checks (`canEditTab()`) are for UX only. Security Rules enforce permissions server-side.

**Test:** Try bypassing UI restrictions via Console:
```javascript
// In browser console, try as Finance user:
await setDoc(doc(db, 'clients', 'HACKED'), { client_code: 'HACKED' });
// Should fail with permission denied
```

### 3. Firebase API Key Exposure Is Safe

The `apiKey` in `app/firebase.js` is **public by design**. It identifies the Firebase project, not an authorization token. Security is enforced by Security Rules.

**Source:** [Firebase API Key Safety](https://firebase.google.com/docs/projects/api-keys)

### 4. Rate Limiting for Expensive Queries

**Risk:** Aggregation queries are cheap (1 read), but malicious user could spam them.

**Mitigation:** Firebase has built-in quota limits (50K reads/day free tier). Monitor in Firebase Console → Usage tab.

---

## Implementation Checklist for v2.1

**Security Rules Fixes:**
- [ ] Add `clients` collection rules (if missing)
- [ ] Add `projects` collection rules (if missing)
- [ ] Verify `hasRole()` includes correct role names
- [ ] Test with Rules Playground (Super Admin, Operations Admin, Finance, Operations User)
- [ ] Add unit tests for clients/projects collections
- [ ] Run full test suite: `npm test`

**Window Function Fixes:**
- [ ] Verify `window.viewPRDetails` exposed in `finance.js init()`
- [ ] Verify `window.viewTRDetails` exposed in `finance.js init()`
- [ ] Verify `window.refreshPRs` exposed
- [ ] Verify `window.refreshTRs` exposed
- [ ] Test all onclick handlers in Finance view
- [ ] Add console logs to confirm functions exist: `console.log('window.viewTRDetails:', typeof window.viewTRDetails)`

**Modal Implementation:**
- [ ] Create modal utility functions (`showModal`, `closeModal`, `trapFocus`)
- [ ] Add modal CSS to `styles/components.css`
- [ ] Implement audit trail modal (Timeline button)
- [ ] Implement supplier purchase history modal (Supplier name click)
- [ ] Implement PO details modal (Payment Terms, Condition, Delivery Date)
- [ ] Implement project expenses modal (Project List financial overview)
- [ ] Test keyboard navigation (Tab, Shift+Tab, Escape)
- [ ] Test focus restoration

**Financial Calculations:**
- [ ] Implement `calculatePendingPRTotal()` using `getAggregateFromServer()`
- [ ] Implement `calculateProjectExpenses(projectCode)`
- [ ] Implement `calculateSupplierPurchaseHistory(supplierName)`
- [ ] Verify fields are numeric (not string) in Firestore
- [ ] Test with real data

**Operations Admin Assignment:**
- [ ] Verify Operations Admin can be assigned to projects (update Security Rules or client logic)
- [ ] Test project assignment UI for Operations Admin role
- [ ] Verify assignments appear in Project Assignments view

---

## Sources

**Firebase Official Documentation (HIGH confidence):**
- [Test Security Rules with Emulator](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Rules Playground Simulator](https://firebase.google.com/docs/rules/simulator)
- [Firestore Aggregation Queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [Aggregate with SUM and AVG](https://cloud.google.com/blog/products/databases/aggregate-with-sum-and-avg-in-firestore)
- [Real-Time Updates with onSnapshot](https://firebase.google.com/docs/firestore/query-data/listen)
- [Security Rules Structure](https://firebase.google.com/docs/firestore/security/rules-structure)

**Browser DevTools (HIGH confidence):**
- [Debug JavaScript - Chrome DevTools](https://developer.chrome.com/docs/devtools/javascript)
- [JavaScript Debugging Reference](https://developer.chrome.com/docs/devtools/javascript/reference/)

**Accessibility Standards (HIGH confidence):**
- [W3C Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
- [Creating Accessible Dialogs - Smashing Magazine](https://www.smashingmagazine.com/2021/07/accessible-dialog-from-scratch/)
- [Micromodal.js - Accessible Modal Library](https://micromodal.vercel.app/)

**JavaScript Best Practices (MEDIUM confidence):**
- [MDN - Introduction to Events](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events)
- [MDN - addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [JavaScript Namespacing - Addy Osmani](https://addyosmani.com/blog/essential-js-namespacing/)
- [Module Pattern - Software Patterns Lexicon](https://softwarepatternslexicon.com/patterns-js/4/1/)

**Community Resources (MEDIUM confidence):**
- [Firestore Permission Denied - Medium](https://medium.com/firebase-tips-tricks/how-to-fix-firestore-error-permission-denied-missing-or-insufficient-permissions-777d591f404)
- [Firestore Query Best Practices 2026](https://estuary.dev/blog/firestore-query-best-practices/)
- [Firebase Memory Leak Issue #4416](https://github.com/firebase/firebase-js-sdk/issues/4416)
- [Permission Denied Debug Info Issue #1006](https://github.com/firebase/firebase-js-sdk/issues/1006)

---

*Stack research for: v2.1 System Refinement - Debugging & Bug Fixes*
*Researched: 2026-02-05*
*Confidence: HIGH (official Firebase docs + W3C standards verified for all critical techniques)*
