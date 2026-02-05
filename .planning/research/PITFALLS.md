# Pitfalls Research

**Domain:** Bug fixing and system refinement (Firebase SPA, zero-build, real-time financial dashboards)
**Researched:** 2026-02-05
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Security Rules Missing Admin Bypass Path

**What goes wrong:**
Firebase Security Rules check `getUserData().role` for every operation, but if the Super Admin's user document is missing the expected permission structure or role field, they get permission-denied errors even though they should have full access. This can completely lock out administrators from managing the system.

**Why it happens:**
Developers assume Security Rules will "just work" for admins, forgetting that Firebase Security Rules have no concept of "super admin bypass" — every request goes through the same validation logic. If custom claims aren't used or the user document structure is incomplete, even admins get blocked.

**How to avoid:**
1. **Option A (Custom Claims):** Use Firebase Auth custom claims for admin roles via Admin SDK: `auth.setCustomUserClaims(uid, {admin: true})`. Security Rules can then check `request.auth.token.admin == true` without database reads.
2. **Option B (Document Structure Verification):** Ensure every Super Admin user document has the complete structure expected by Security Rules before deploying rules.
3. **Option C (Emulator Testing):** Test Security Rules with emulator using actual Super Admin auth contexts before production deployment.
4. **Option D (Fallback Rules):** Add admin UID whitelist as fallback: `request.auth.uid in ['uid1', 'uid2'] || hasRole(['super_admin'])`

**Warning signs:**
- Console errors: "Missing or insufficient permissions" when Super Admin performs operations
- Security Rules call `getUserData()` but user document is missing expected fields
- Manual Firestore document editing required after user creation
- First Super Admin setup requires bypassing the application

**Phase to address:**
Phase 1 (Security Rules Audit) — Verify all Super Admin user documents have complete structure, add emulator test cases for admin operations, consider custom claims migration.

**Real-world impact:**
Current project shows this exact issue: "Fix Clients tab permission denied error for Super Admin" and "Fix Projects tab permission denied error for Super Admin" — indicating Security Rules are blocking admin access.

**Sources:**
- [Control Access with Custom Claims and Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Security Rules and Firebase Authentication](https://firebase.google.com/docs/rules/rules-and-auth)

---

### Pitfall 2: Window Functions Lost During SPA Tab Navigation

**What goes wrong:**
In zero-build SPAs using `onclick="window.functionName()"` handlers, clicking buttons throws `TypeError: window.functionName is not a function` because the router's `destroy()` method cleaned up window functions when switching tabs, but the HTML still references them.

**Why it happens:**
Developers treat tab switching as "full navigation" and call `destroy()` to prevent memory leaks. But `destroy()` removes window functions that are still referenced by DOM elements rendered in the new tab. The disconnect happens because:
1. Router calls `view.destroy()` when tab changes
2. `destroy()` removes window functions: `delete window.functionName`
3. New tab renders with `onclick="window.functionName()"` in HTML
4. Click triggers error because function no longer exists

**How to avoid:**
1. **Router-level detection:** Check if navigation is same-view tab switch vs. different-view navigation. Only call `destroy()` for different views.
2. **Pattern:**
   ```javascript
   const isSameView = currentRoute === path;
   if (!isSameView && currentView && typeof currentView.destroy === 'function') {
       await currentView.destroy(); // Only destroy when changing views
   }
   ```
3. **View module pattern:** Separate tab-specific initialization from view-level initialization. Window functions should persist during tab switches.
4. **Event delegation:** Use event delegation instead of inline onclick handlers to avoid window function dependency.

**Warning signs:**
- `TypeError: window.X is not a function` in console after tab navigation
- Functions work on initial page load but fail after switching tabs and returning
- Router logs show `destroy()` being called during tab switches
- Manual page refresh fixes the issue temporarily

**Phase to address:**
Phase 2 (Finance Workflow Fixes) — Fix immediate button errors, then audit all window function lifecycle management in procurement.js, finance.js, and other multi-tab views.

**Real-world impact:**
Current project shows: "Fix Transport Request Review button error (window.viewTRDetails is not a function)" — classic symptom of window function cleanup during tab navigation.

**Sources:**
- [Why Does this Become Undefined in onClick in JavaScript?](https://medium.com/@a1guy/why-does-this-become-undefined-in-onclick-in-javascript-and-how-to-fix-it-bf9dba8a4bc7)
- [Javascript function is undefined on onclick event](https://www.sitepoint.com/community/t/javascript-function-is-undefined-on-onclick-event/250115)
- Project codebase: `app/router.js` lines 257-266 (router already implements this fix)

---

### Pitfall 3: Floating-Point Precision Errors in Financial Aggregations

**What goes wrong:**
Financial calculations like `totalAmount = items.reduce((sum, item) => sum + item.cost, 0)` produce results like `-300046.7899999998` or `5000.000000000001` instead of clean decimal values. When aggregating PO amounts by project, users see nonsensical cents values and lose trust in the system's accuracy.

**Why it happens:**
JavaScript uses IEEE 754 double-precision floating-point, where `0.1 + 0.2 !== 0.3` (actually equals `0.30000000000000004`). Each operation introduces imperceptible errors that compound during aggregation. This is especially problematic when:
1. Multiplying quantities by unit costs: `qty * unitCost`
2. Summing results: `.reduce((sum, x) => sum + x, 0)`
3. Displaying totals without rounding: users see raw floating-point errors

**How to avoid:**
1. **Integer arithmetic (recommended):** Convert to cents/pesos before calculation:
   ```javascript
   const totalCents = items.reduce((sum, item) => sum + Math.round(item.cost * 100), 0);
   const totalAmount = totalCents / 100;
   ```
2. **Display-only rounding:** Round for display but never for calculation:
   ```javascript
   const display = totalAmount.toFixed(2); // Display only
   // Store totalAmount without rounding
   ```
3. **Libraries (if needed):** Use currency.js, dinero.js, or decimal.js for complex financial logic.
4. **Validation:** Assert totals match itemized sums within acceptable tolerance (0.01 for two-decimal currencies).

**Warning signs:**
- Dashboard shows amounts like `5000.000000000001` or `99.99999999999999`
- Line item totals don't sum exactly to displayed grand total
- User reports "numbers look weird" or "totals are off by a cent"
- Aggregations by project/category show fractional cents

**Phase to address:**
Phase 3 (Finance Dashboard Fixes) — Audit all financial calculations in finance.js, procurement.js, and utils.js. Implement integer arithmetic pattern for aggregations.

**Real-world impact:**
Project requirement: "Aggregate PO data by project and category" — this will expose floating-point errors if not handled properly. Users will see cumulative errors across hundreds of line items.

**Sources:**
- [Financial Precision in JavaScript: Handle Money Without Losing a Cent](https://dev.to/benjamin_renoux/financial-precision-in-javascript-handle-money-without-losing-a-cent-1chc)
- [JavaScript Rounding Errors (in Financial Applications)](https://www.robinwieruch.de/javascript-rounding-errors/)
- [How to Handle Monetary Values in JavaScript](https://frontstuff.io/how-to-handle-monetary-values-in-javascript)

---

### Pitfall 4: Firestore Listener Memory Leaks in Long-Lived SPAs

**What goes wrong:**
Real-time Firestore listeners (`onSnapshot`) accumulate in memory when views are navigated away from without calling `unsubscribe()`. This causes:
1. Multiplying database reads (each listener triggers separately)
2. Increasing memory usage (listeners hold references to DOM elements)
3. UI freezes or browser crashes in long sessions
4. Escalating Firebase billing from redundant reads

**Why it happens:**
Developers forget that `onSnapshot` returns an unsubscribe function that must be called manually. In SPAs, view modules create listeners during `init()` but:
1. Router navigates to new view
2. Old view's DOM is destroyed
3. Listener callback continues running, holding memory references
4. Return to view creates NEW listener without cleaning up old one
5. Each navigation cycle adds another listener

**How to avoid:**
1. **Store all listeners in array:**
   ```javascript
   let listeners = [];

   export async function init() {
       const unsubscribe = onSnapshot(collection(db, 'mrfs'), callback);
       listeners.push(unsubscribe);
   }

   export async function destroy() {
       listeners.forEach(unsub => unsub?.());
       listeners = [];
   }
   ```
2. **Router must call destroy:** Ensure router calls `view.destroy()` when navigating away (but not during tab switches in same view).
3. **Monitor listener count:** Log listener array length to detect accumulation.
4. **Window function cleanup:** Remove window functions in `destroy()` to prevent callbacks from accessing undefined functions.

**Warning signs:**
- Firebase Console shows increasing read operations over time in single session
- Browser DevTools Memory Profiler shows retained Firestore connections
- Console warnings about detached DOM nodes
- UI becomes sluggish after multiple navigation cycles
- Multiple identical updates firing for single Firestore change

**Phase to address:**
Phase 4 (Listener Audit) — Audit all view modules (finance.js, procurement.js, projects.js) to verify listener cleanup. Add monitoring logs for listener count.

**Real-world impact:**
Current project has 14 view modules with real-time listeners. Without proper cleanup, a user navigating between tabs 20 times could accumulate 20+ listeners per collection, multiplying read costs and degrading performance.

**Sources:**
- [How to Avoid Memory Leaks in JavaScript Event Listeners](https://dev.to/alex_aslam/how-to-avoid-memory-leaks-in-javascript-event-listeners-4hna)
- [Understanding Real-Time Data with Firebase Firestore in JavaScript](https://dev.to/itselftools/understanding-real-time-data-with-firebase-firestore-in-javascript-5gc8)
- [Unsubscribe from a Firestore watch listener](https://cloud.google.com/firestore/docs/samples/firestore-listen-detach)
- Project codebase: router.js already implements conditional destroy (lines 261-266)

---

### Pitfall 5: Audit Trail Implementation Without Cost Management

**What goes wrong:**
Implementing comprehensive audit logging by enabling Cloud Firestore Data Access audit logs results in massive, unexpected logging costs. Google charges for log storage and ingestion, and Firestore audit logs can generate gigabytes of data per day in active systems, potentially costing more than the application itself.

**Why it happens:**
Developers enable audit logging following Google's documentation without understanding the cost implications:
1. Data Access logs capture EVERY read/write operation
2. Active dashboard with real-time listeners generates thousands of reads/hour
3. Each log entry includes full request context, timestamps, user data
4. Logs accumulate in Cloud Logging with default 30-day retention
5. No log filtering or sampling applied

**How to avoid:**
1. **Application-level logging (recommended for this project):**
   ```javascript
   // Create audit_trail collection in Firestore
   await addDoc(collection(db, 'audit_trail'), {
       action: 'pr_approved',
       user_id: currentUser.uid,
       resource_id: prId,
       timestamp: serverTimestamp(),
       metadata: { previous_status: 'pending', new_status: 'approved' }
   });
   ```
2. **Cloud Function triggers (decoupled approach):**
   Use Cloud Functions to listen for Firestore changes and write selective audit entries.
3. **Cloud Audit Logs (only for compliance):**
   - Enable ONLY for 2-3 days to analyze patterns
   - Turn off immediately after analysis
   - Use log sinks to export to cheaper storage (BigQuery, Cloud Storage)
4. **Hybrid approach:**
   Application logs for user actions, Cloud Audit Logs only for admin operations on sensitive collections.

**Warning signs:**
- Cloud Logging shows thousands of entries per hour
- Firebase billing spike in "Cloud Logging" category
- Audit logs consuming more storage than application data
- Log ingestion charges exceeding database operation charges

**Phase to address:**
Phase 5 (Audit Trail Implementation) — Design application-level audit collection before touching Cloud Audit Logs. Estimate log volume based on user activity patterns.

**Real-world impact:**
Project requirement: "Timeline button shows full audit trail (MRF → PRs → POs → Delivered)". Implementing this with Cloud Audit Logs could cost $50-200/month. Application-level logging with Firestore collection costs <$1/month.

**Sources:**
- [Firestore audit logging information](https://docs.cloud.google.com/firestore/native/docs/audit-logging)
- [Audit Log in Firebase Firestore database](https://medium.com/@md.mollaie/audit-log-in-firebase-firestore-database-3c6a7d71ac4a)
- [Audit logs for Firestore documents](https://blog.emad.in/audit-logs-for-firestore-documents/)

---

### Pitfall 6: Real-Time Aggregation Performance Degradation

**What goes wrong:**
Financial dashboards with real-time aggregations (e.g., "total PO amount by project") re-calculate entire sums on every Firestore update. As data grows, dashboard queries slow down from <100ms to 5+ seconds, making the app feel broken. Users see loading spinners constantly, and Firebase charges for repeated full-collection scans.

**Why it happens:**
Naive aggregation pattern fetches all documents every time:
```javascript
onSnapshot(collection(db, 'pos'), (snapshot) => {
    const totalByProject = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        totalByProject[data.project_code] = (totalByProject[data.project_code] || 0) + data.total_amount;
    });
    renderDashboard(totalByProject);
});
```
This works fine with 50 POs but breaks at 500+ because:
1. Every PO creation/update triggers full snapshot
2. All documents downloaded to client
3. Aggregation re-calculated in JavaScript
4. Firebase bills for full collection read on each update

**How to avoid:**
1. **Write-time aggregation (recommended):**
   When creating PO, update aggregation document atomically:
   ```javascript
   const batch = writeBatch(db);
   batch.set(doc(db, 'pos', poId), poData);
   batch.set(doc(db, 'po_totals', projectCode), {
       total: increment(poData.total_amount),
       count: increment(1)
   }, { merge: true });
   await batch.commit();
   ```
2. **Aggregation queries (limited use):**
   Firestore supports `count()`, `sum()`, `average()` but:
   - No real-time updates (one-time reads only)
   - Billing based on index entries scanned
   - 60-second timeout for large datasets
3. **Client-side caching with incremental updates:**
   Track snapshot changes (`snapshot.docChanges()`) and update totals incrementally instead of full recalculation.
4. **Scheduled aggregation (Cloud Functions):**
   For non-real-time dashboards, aggregate daily via scheduled function.

**Warning signs:**
- Dashboard load time increases as data grows
- Firebase Console shows increasing read operations for aggregation queries
- `snapshot.size` in console shows hundreds/thousands of documents
- Users report "dashboard is slow" or see extended loading states
- Performance degrades linearly with document count

**Phase to address:**
Phase 3 (Finance Dashboard Fixes) — When implementing "Project List financial overview", use write-time aggregation pattern. Don't fetch all POs to calculate project totals.

**Real-world impact:**
Project requirement: "Aggregate PO data by project and category". Without write-time aggregation, this becomes O(n) query on every dashboard load and every PO update. With 200 projects × 10 POs each = 2000 documents fetched repeatedly.

**Sources:**
- [Write-time aggregations | Firestore](https://firebase.google.com/docs/firestore/solutions/aggregation)
- [Summarize data with aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [7+ Google Firestore Query Performance Best Practices for 2026](https://estuary.dev/blog/firestore-query-best-practices/)
- [Firestore Finally Solved the Counter Problem... Almost](https://dev.to/jdgamble555/firestore-finally-solved-the-counter-problem-almost-4mb7)

---

### Pitfall 7: Modal State Management Without Event Cleanup

**What goes wrong:**
Modals in SPAs attach event listeners (`addEventListener`) to close buttons, overlays, and ESC key handlers. When modals close, the DOM is removed but listeners remain attached to:
1. Global `document` object (ESC key handler)
2. Detached modal DOM nodes (close button, overlay)
3. Window object (resize handlers)

Over time, these accumulate causing memory leaks, degraded performance, and ghost interactions (ESC key triggers invisible modals).

**Why it happens:**
Developers use this pattern without cleanup:
```javascript
function showModal() {
    const modal = document.createElement('div');
    modal.innerHTML = `<div class="modal">...</div>`;
    document.body.appendChild(modal);

    modal.querySelector('.close-btn').addEventListener('click', closeModal);
    document.addEventListener('keydown', handleEscape);
}

function closeModal() {
    document.querySelector('.modal').remove(); // DOM removed, listeners persist
}
```

The `document.addEventListener` call attaches to global scope, not the modal element. Removing modal from DOM doesn't remove global listener.

**How to avoid:**
1. **Store listener references and clean up:**
   ```javascript
   let escapeHandler = null;

   function showModal() {
       // ... create modal
       escapeHandler = (e) => { if (e.key === 'Escape') closeModal(); };
       document.addEventListener('keydown', escapeHandler);
   }

   function closeModal() {
       document.querySelector('.modal')?.remove();
       if (escapeHandler) {
           document.removeEventListener('keydown', escapeHandler);
           escapeHandler = null;
       }
   }
   ```
2. **Event delegation (preferred for click events):**
   ```javascript
   document.body.addEventListener('click', (e) => {
       if (e.target.matches('.modal-close')) closeModal();
   });
   ```
3. **AbortController (modern approach):**
   ```javascript
   const controller = new AbortController();
   document.addEventListener('keydown', handler, { signal: controller.signal });
   // Later: controller.abort(); // Removes all listeners with this signal
   ```
4. **WeakMap for metadata:**
   Use WeakMap to attach state to DOM nodes without preventing garbage collection.

**Warning signs:**
- ESC key closes modals that aren't visible
- Multiple modals open simultaneously when one is expected
- Console shows increasing event listener count (Chrome DevTools → Memory → Listeners)
- Modal close button requires multiple clicks
- Browser becomes sluggish after opening/closing many modals

**Phase to address:**
Phase 2 (Finance Workflow Fixes) — When implementing "expense breakdown modal", use AbortController pattern or strict listener cleanup.

**Real-world impact:**
Current project has multiple modals in procurement.js (MRF details, supplier details, PO timeline), finance.js (PR approval, TR review), and user-management.js (invitation codes, role assignment). Without cleanup, a user reviewing 50 PRs in one session accumulates 50+ orphaned ESC handlers.

**Sources:**
- [How to Avoid Memory Leaks in JavaScript Event Listeners](https://dev.to/alex_aslam/how-to-avoid-memory-leaks-in-javascript-event-listeners-4hna)
- [How to Prevent Memory Leaks in State Management Systems](https://blog.pixelfreestudio.com/how-to-prevent-memory-leaks-in-state-management-systems/)
- [State Management in Vanilla JS: 2026 Trends](https://medium.com/@chirag.dave/state-management-in-vanilla-js-2026-trends-f9baed7599de)

---

### Pitfall 8: Security Rules Testing Without Admin SDK Emulation

**What goes wrong:**
Developers test Security Rules by manually creating test users in Authentication and checking access in the browser. This misses critical edge cases:
1. Missing user document (authenticated but no Firestore doc)
2. Malformed permission structure (missing `role` field)
3. Race conditions (auth created before user doc)
4. Admin SDK bypass behavior (Cloud Functions skip rules)

When deploying to production, these untested scenarios cause permission-denied errors that block legitimate users.

**Why it happens:**
Manual testing only validates the happy path. Security Rules Emulator provides:
- `RulesTestEnvironment.authenticatedContext(auth)` — create test users without Firebase Auth
- `RulesTestEnvironment.withSecurityRulesDisabled()` — bypass rules to set up test data
- Custom claim mocking — test admin roles without Admin SDK
- Automated assertions — verify ALLOW and DENY scenarios programmatically

But developers skip emulator setup thinking "I'll just test in browser" because:
1. Emulator requires `npm install @firebase/rules-unit-testing`
2. Test syntax is unfamiliar
3. Manual testing feels faster initially

**How to avoid:**
1. **Set up Rules Emulator testing:**
   ```javascript
   import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

   it('allows super_admin to read all projects', async () => {
       const admin = testEnv.authenticatedContext('admin-uid', { role: 'super_admin' });
       await assertSucceeds(admin.firestore().collection('projects').get());
   });

   it('denies operations_user without user document', async () => {
       const user = testEnv.authenticatedContext('user-uid'); // No Firestore doc
       await assertFails(user.firestore().collection('projects').get());
   });
   ```
2. **Test negative cases:**
   - User authenticated but user doc missing
   - User doc exists but `status === 'pending'`
   - User doc missing `role` field
   - User doc has unknown role value
3. **Test admin bypass scenarios:**
   Admin SDK operations should succeed even with restrictive rules.
4. **Automated regression suite:**
   Run tests on every Security Rules change before deployment.

**Warning signs:**
- Production errors that don't reproduce in development
- "Missing or insufficient permissions" for users who should have access
- Security Rules changes break existing functionality
- No automated test suite for firestore.rules
- Deployment requires immediate rollback

**Phase to address:**
Phase 1 (Security Rules Audit) — Add emulator test cases for Super Admin edge cases (missing user doc, malformed permissions). Current project has 17/17 tests passing but may need additional admin bypass test coverage.

**Real-world impact:**
Current project symptoms: "Clients tab permission denied error for Super Admin" suggests Security Rules are denying access that should succeed. Emulator testing would catch this before production deployment.

**Sources:**
- [Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Build unit tests | Firebase Security Rules](https://firebase.google.com/docs/rules/unit-tests)
- [Tutorial: Testing Firestore Security Rules With the Emulator](https://fireship.io/lessons/testing-firestore-security-rules-with-the-emulator/)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `window.functionName` for onclick instead of event delegation | Zero-build simplicity, no bundler needed | Memory leaks, cleanup complexity, harder testing | Acceptable for v1.0/v2.0, must audit cleanup in v2.1 |
| Storing financial amounts as raw floats | No conversion logic needed | Precision errors accumulate, incorrect totals | Never acceptable for financial apps |
| Manual Firestore document editing for first Super Admin | Fastest initial setup (2 minutes) | Not auditable, bypasses validation, fragile | Acceptable for one-time setup, must document clearly |
| Denormalizing project_code + project_name in MRFs | Fast reads, no joins, historical accuracy | Update complexity if project renamed | Acceptable (intentional design for performance) |
| Client-side permission checks without Security Rules | Faster development, easier debugging | Security bypass via console, no enforcement | Never acceptable (must have server-side rules) |
| Skipping emulator tests for Security Rules | Faster iteration in development | Production bugs, lockout scenarios | Never acceptable after v2.0 (auth system deployed) |
| Real-time listeners without unsubscribe tracking | Simpler init() code, fewer lines | Memory leaks, escalating costs | Never acceptable in production SPA |
| Global `document.addEventListener` without cleanup | Works initially, simple implementation | Ghost interactions, memory leaks | Acceptable for static pages, never for SPAs with modals |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Firebase Security Rules | Assuming `isRole('super_admin')` works without user document | Ensure user document exists with `role` field before rules check, OR use custom claims on auth token |
| Firestore `onSnapshot` | Not storing unsubscribe function | Store in array: `listeners.push(onSnapshot(...))`, clean up in `destroy()` |
| Firebase Auth state | Checking `auth.currentUser` synchronously on page load | Use `onAuthStateChanged` listener, wait for auth ready before routing |
| Firestore aggregation queries | Expecting real-time updates like `onSnapshot` | Aggregation queries (`count()`, `sum()`) are one-time reads only, use write-time aggregation for real-time |
| Cloud Audit Logs | Enabling Data Access logs for audit trail | Use application-level audit collection or Cloud Functions, Cloud Audit Logs cost $$$ |
| Firestore transactions | Using transactions for simple aggregation | Transactions have 5-attempt limit and contention issues, use `increment()` for counters |
| Security Rules testing | Testing only in browser with manual user creation | Use `@firebase/rules-unit-testing` emulator with `assertSucceeds`/`assertFails` |
| Firebase Admin SDK | Using Admin SDK in client code | Admin SDK is server-only (Cloud Functions, Node.js backend), client uses Firebase SDK |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-collection reads for aggregation | Dashboard slow on load, increasing read costs | Use write-time aggregation or indexed sum collections | 500+ documents per collection |
| Naive real-time listeners re-rendering entire list | UI freezes during updates, React warning floods | Use `snapshot.docChanges()` to update incrementally | 100+ documents in real-time view |
| Sequential Firestore writes in loops | Form submission takes seconds, UI unresponsive | Use `writeBatch()` for bulk operations (max 500 per batch) | 20+ sequential writes |
| No pagination on list views | Initial page load >5 seconds, browser memory warning | Implement pagination (Firestore `limit()` + `startAfter()`) | 200+ items in list |
| Client-side filtering of large collections | `getDocs()` downloads thousands of documents | Use Firestore `where()` queries on indexed fields | 1000+ documents fetched |
| Accumulating Firestore listeners without cleanup | Memory usage grows over session, UI sluggish | Track listeners in array, call `unsubscribe()` in `destroy()` | 10+ navigation cycles |
| String concatenation in render loops | Slow UI updates, dropped frames | Use template literals or DocumentFragment | 100+ items rendered |
| Floating-point aggregation without rounding | Nonsensical decimal places, user confusion | Convert to integer cents, calculate, convert back | Any financial calculation |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Checking permissions only in UI (hiding buttons) | Console bypass allows unauthorized operations | Enforce with Firebase Security Rules server-side |
| Using `isActiveUser()` for all checks without role validation | Deactivated users continue operating until token expires | Security Rules check `status == 'active'` AND validate role |
| Granting read access based on `isSignedIn()` instead of `isActiveUser()` | Pending/rejected users read sensitive data | Use `isActiveUser()` (checks active status) not `isSignedIn()` |
| No minimum admin safeguard | Last Super Admin deactivates self, complete lockout | Enforce minimum 2 Super Admins in app logic AND Security Rules |
| Missing user document structure validation | Authenticated user has no Firestore doc, all operations fail | Validate user doc creation in registration, test with emulator |
| Custom claims not synced to Security Rules | Rules check `getUserData().role`, custom claims on token ignored | Decide: custom claims OR user doc role, not both (confusion) |
| Operations Admin can modify Super Admin | Privilege escalation: Ops Admin promotes self to Super Admin | Security Rules: prevent updating users with higher role |
| Delete audit trail allows permanent removal | Compliance violation, can't prove data wasn't tampered with | Set Security Rules: `allow delete: if false;` for audit collections |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Permission denied shown as generic error | Users think system is broken, file support tickets | Show specific message: "Contact admin for [Feature] access" |
| Real-time updates move items while user is clicking | Click hits wrong item, frustration | Preserve scroll position, highlight changed items |
| Financial totals showing floating-point noise | Users question accuracy: "Why $5000.000000001?" | Always display currency with `.toFixed(2)` |
| No loading state during aggregation | Users think dashboard is frozen, refresh repeatedly | Show skeleton loaders or spinner for >200ms operations |
| Modal ESC key closes wrong modal | User loses form data, has to re-enter | Track modal stack, ESC closes topmost only |
| Tab switch destroys and recreates listeners | Flicker, loading state, poor UX | Router should skip destroy for same-view tab navigation |
| Permission changes require logout | Users frustrated: "I was just granted access, why logout?" | Real-time permission listener with `permissionsChanged` event |
| Audit trail shows technical IDs not human names | "PR-2026-005 updated by uid: xyz123..." meaningless | Denormalize user name in audit entries |
| Delete confirmation says "Are you sure?" | Users don't understand consequences | Specific: "Delete client ABC will orphan 5 projects. Type ABC to confirm." |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Firestore listeners:** Often missing `unsubscribe()` tracking — verify `listeners` array exists and `destroy()` cleans up
- [ ] **Window functions:** Often missing `destroy()` cleanup — verify `delete window.functionName` or function persistence strategy
- [ ] **Security Rules:** Often missing negative test cases — verify emulator tests for missing user doc, inactive status, wrong role
- [ ] **Financial calculations:** Often missing precision handling — verify integer arithmetic or `.toFixed()` on all currency displays
- [ ] **Real-time aggregation:** Often missing write-time updates — verify aggregation doc updates in same batch as source doc write
- [ ] **Modal event handlers:** Often missing `removeEventListener` — verify ESC handler, overlay click cleanup
- [ ] **Permission checks:** Often missing server-side enforcement — verify Security Rules match client-side permission checks
- [ ] **Tab navigation:** Often calling `destroy()` unnecessarily — verify router checks `isSameView` before cleanup
- [ ] **Audit trail:** Often missing cost analysis — verify application-level logs, NOT Cloud Audit Logs
- [ ] **Form validation:** Often missing edge cases — verify empty string, null, undefined, whitespace-only values
- [ ] **Error handling:** Often showing generic messages — verify specific user-facing error messages for permission denied
- [ ] **Loading states:** Often missing for aggregations — verify skeleton/spinner for operations >200ms
- [ ] **Pagination:** Often missing on list views — verify Firestore `limit()` applied to collections with 100+ docs expected
- [ ] **Batch operations:** Often using loops — verify `writeBatch()` for 3+ sequential writes

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Super Admin locked out by Security Rules | MEDIUM | 1. Firebase Console → Firestore → manually update user doc with correct `role: 'super_admin'`, 2. OR add UID to admin whitelist in rules, 3. Deploy rules fix, 4. Add emulator test to prevent recurrence |
| Window functions undefined after tab switch | LOW | 1. Identify which view's `destroy()` is removing functions, 2. Update router to skip `destroy()` for same-view tab navigation, 3. Redeploy, no data impact |
| Floating-point errors in financial reports | MEDIUM | 1. Audit all financial calculations, 2. Implement integer arithmetic (multiply by 100), 3. Migrate display code to use `.toFixed(2)`, 4. No database migration needed if storing raw values |
| Firestore listener memory leak | LOW | 1. Add listener tracking array to affected views, 2. Implement `destroy()` with `listeners.forEach(unsub => unsub())`, 3. Redeploy, users may need to refresh |
| Cloud Audit Log cost spike | LOW | 1. Firebase Console → Cloud Logging → disable Data Access audit logs immediately, 2. Implement application-level audit collection, 3. Export existing logs to Cloud Storage if needed |
| Real-time aggregation too slow | HIGH | 1. Implement write-time aggregation (requires schema change), 2. Backfill aggregation docs for existing data with Cloud Function, 3. Update dashboard to read aggregation collection |
| Modal event handlers accumulating | LOW | 1. Add AbortController to modal creation, 2. Call `controller.abort()` in close function, 3. Redeploy, users may need to refresh for listener cleanup |
| Permission check bypass via console | CRITICAL | 1. Identify missing Security Rule, 2. Write emulator test for scenario, 3. Deploy rule fix immediately, 4. Audit logs for unauthorized access |
| Missing user document after auth | MEDIUM | 1. Check registration flow for race condition, 2. Add retry logic or wait for user doc creation, 3. Backfill missing user docs in Firestore, 4. Add emulator test |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Security Rules blocking Super Admin | Phase 1: Security Rules Audit | Emulator test: Super Admin can read/write all collections |
| Window functions undefined | Phase 2: Finance Workflow Fixes | Manual test: switch tabs 5x, all buttons work |
| Floating-point precision errors | Phase 3: Finance Dashboard Fixes | Automated test: assert totals match `.toFixed(2)` display |
| Firestore listener memory leaks | Phase 4: Listener Lifecycle Audit | DevTools Memory: listener count stable after 10 navigation cycles |
| Audit trail cost overruns | Phase 5: Audit Trail Implementation | Cost projection: estimate log volume before enabling Cloud Audit Logs |
| Real-time aggregation slowness | Phase 3: Finance Dashboard Fixes | Performance test: dashboard loads <500ms with 1000 POs |
| Modal event handler leaks | Phase 2: Finance Workflow Fixes | DevTools: ESC handler count = visible modal count |
| Security Rules not tested | Phase 1: Security Rules Audit | CI: 25+ emulator tests passing including negative cases |

---

## Sources

### Official Documentation (HIGH confidence)
- [Control Access with Custom Claims and Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Security Rules and Firebase Authentication](https://firebase.google.com/docs/rules/rules-and-auth)
- [Test your Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Write-time aggregations | Firestore](https://firebase.google.com/docs/firestore/solutions/aggregation)
- [Summarize data with aggregation queries](https://firebase.google.com/docs/firestore/query-data/aggregation-queries)
- [Unsubscribe from a Firestore watch listener](https://cloud.google.com/firestore/docs/samples/firestore-listen-detach)
- [Firestore audit logging information](https://docs.cloud.google.com/firestore/native/docs/audit-logging)

### Community Resources (MEDIUM confidence)
- [Financial Precision in JavaScript: Handle Money Without Losing a Cent](https://dev.to/benjamin_renoux/financial-precision-in-javascript-handle-money-without-losing-a-cent-1chc)
- [JavaScript Rounding Errors (in Financial Applications)](https://www.robinwieruch.de/javascript-rounding-errors/)
- [How to Avoid Memory Leaks in JavaScript Event Listeners](https://dev.to/alex_aslam/how-to-avoid-memory-leaks-in-javascript-event-listeners-4hna)
- [State Management in Vanilla JS: 2026 Trends](https://medium.com/@chirag.dave/state-management-in-vanilla-js-2026-trends-f9baed7599de)
- [Tutorial: Testing Firestore Security Rules With the Emulator](https://fireship.io/lessons/testing-firestore-security-rules-with-the-emulator/)
- [Firestore Finally Solved the Counter Problem... Almost](https://dev.to/jdgamble555/firestore-finally-solved-the-counter-problem-almost-4mb7)

### Project Codebase (HIGH confidence)
- `firestore.rules` lines 1-270 — Current Security Rules implementation
- `app/router.js` lines 257-266 — Router implements same-view tab navigation pattern
- `.planning/PROJECT.md` — Known issues: permission denied errors, window function errors
- `CLAUDE.md` — DOM selection patterns, listener management, sequential ID generation

---
*Pitfalls research for: CLMC Procurement System v2.1 System Refinement*
*Researched: 2026-02-05*
