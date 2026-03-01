# Security Audit Report — Phase 49

**Date:** 2026-03-01
**Scope:** Client-side code (XSS, injection, sensitive data exposure), Firebase Security Rules, Auth edge cases, CSP headers
**Auditor:** Claude (automated)
**Status:** Complete

---

## Summary

| Severity | Found | Fixed | Accepted Risk |
|----------|-------|-------|---------------|
| Critical | 1 | 1 | 0 |
| High | 3 | 3 | 0 |
| Medium | 4 | 3 | 1 |
| Low | 3 | 3 | 0 |

**Total findings:** 11
**Fixed:** 10
**Accepted Risk:** 1 (invitation_codes — intentional design)

---

## Findings

### Finding 1: Role Escalation via Firestore Self-Update

- **Severity:** Critical
- **Location:** `firestore.rules` — `users` collection `allow update` rule
- **Description:** Any authenticated user could POST a Firestore document update changing their own `role` or `status` field. The self-update branch used `request.auth.uid == userId` with no field-level restriction, allowing a standard user to escalate to `super_admin` by updating their own document.
- **Fix Applied:** Added field-level guards to the self-update branch: `!('role' in request.resource.data) && !('status' in request.resource.data) && !('invitation_code' in request.resource.data)`. Admin-initiated updates (super_admin, operations_admin, services_admin branches) are unaffected.
- **Status:** Fixed — commit `3b93daa`

---

### Finding 2: XSS via innerHTML with User-Supplied Data (Procurement View)

- **Severity:** High
- **Location:** `app/views/procurement.js` — supplier history modal, MRF list cards, MRF details panel, supplier table (display + edit rows), PO tracking table, PR/PO detail modals, PRPO records table, PO timeline
- **Description:** Supplier names, requestor names, item names, categories, delivery addresses, and other user-supplied strings were interpolated directly into innerHTML template literals without escaping. A user entering `<script>alert(1)</script>` as a supplier name would execute arbitrary JavaScript for any user viewing that supplier.
- **Fix Applied:** `escapeHTML()` added to `app/utils.js` and applied to all user-supplied fields in template literals across `procurement.js`.
- **Status:** Fixed — commit `343cc0a`

---

### Finding 3: XSS via innerHTML with User-Supplied Data (Finance and MRF Records Views)

- **Severity:** High
- **Location:** `app/views/finance.js` — PR/PO modals; `app/views/mrf-records.js` — detail modals, table rows, timeline view
- **Description:** Supplier names, project labels, requestor names, item field details, and other user-supplied strings were rendered into innerHTML without HTML escaping. Same injection vector as Finding 2.
- **Fix Applied:** `escapeHTML()` applied to all affected interpolations in `finance.js` and `mrf-records.js`.
- **Status:** Fixed — commit `343cc0a`

---

### Finding 4: XSS via innerHTML with User-Supplied Data (Remaining Views)

- **Severity:** High
- **Location:** `app/views/pending.js`, `app/views/clients.js`, `app/views/user-management.js`, `app/views/assignments.js`, `app/views/projects.js`, `app/views/services.js`, `app/views/project-detail.js`, `app/views/service-detail.js`
- **Description:** User-supplied fields (client names, contact persons, emails, phones, addresses, user display names, project/service codes and names, personnel names and IDs) were interpolated into innerHTML without escaping. Attribute injection was also possible via `value='${field}'` patterns in editable rows (single-quote breakout).
- **Fix Applied:** `escapeHTML()` applied to all user-supplied fields in template literals and `value='...'` attribute strings across all 8 affected files. Personnel pill `data-user-id` attributes also escaped.
- **Status:** Fixed — commit `343cc0a`

---

### Finding 5: Sensitive Data Exposure via console.log (Auth Module)

- **Severity:** Medium
- **Location:** `app/auth.js` — 16 console.log calls, 3 console.warn calls
- **Description:** The auth module logged user email addresses, user IDs, role names, session state transitions, and authentication flow details at `console.log` and `console.warn` severity. Anyone with browser DevTools access (including any end user on any browser) could read this PII from the console.
- **Fix Applied:** All 16 `console.log` and 3 `console.warn` statements removed from `app/auth.js`. Only `console.error` (10 calls) remains — errors are unavoidable for debugging broken auth flows but no informational/diagnostic output leaks in production.
- **Status:** Fixed — commit `01353bb`

---

### Finding 6: Sensitive Data Exposure via console.log (All Other App Files)

- **Severity:** Medium
- **Location:** All 22 non-auth app/ files — router.js, permissions.js, utils.js, firebase.js, and all view files
- **Description:** ~151 `console.log` and `console.info` calls across the application logged internal state, navigation events, Firestore query results, project/service names, supplier names, collection document IDs, and business data. Visible to any user via browser DevTools.
- **Fix Applied:** All `console.log` and `console.info` statements removed from all 22 files. 18 `console.warn` statements preserved in non-auth files (actionable warnings for developers). 181 `console.error` statements preserved. Total removed: ~167 log/info calls.
- **Status:** Fixed — commit `01353bb`

---

### Finding 7: Weak Content Security Policy (CSP)

- **Severity:** Medium
- **Location:** `netlify.toml` and `_headers` — `/*` and `/*.html` routes
- **Description:** The existing CSP was `frame-ancestors 'self'` only — a single directive that prevents the app from being embedded in iframes. No `script-src`, `style-src`, `connect-src`, `default-src`, or any other directives were set. This means the browser applied no restrictions on script sources, allowing any injected script from any origin to execute. No defense-in-depth against XSS.
- **Fix Applied:** Full 7-directive CSP applied to both `netlify.toml` and `_headers` for `/*` and `/*.html` routes: `default-src 'self'` as fallback; `script-src` whitelisting Firebase CDN (gstatic.com, googleapis.com) plus `'unsafe-inline'` (required for inline onclick handlers); `style-src` with Google Fonts; `connect-src` with Firestore HTTP and WebSocket endpoints; `font-src` with font CDN; `img-src` allowing data URIs and HTTPS images; `frame-ancestors 'self'` preserved.
- **Status:** Fixed — commit `c84abfb`

---

### Finding 8: Missing Standard Security Headers

- **Severity:** Low
- **Location:** `netlify.toml` and `_headers` — `/*` route
- **Description:** No `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` headers were set. While `frame-ancestors` in CSP blocks framing in modern browsers, `X-Frame-Options` is required for legacy browser support. Without `Referrer-Policy`, full URLs (including hash-based routes) were sent as referrer to external resources. Without `Permissions-Policy`, the browser did not explicitly deny access to device APIs (camera, microphone, geolocation) that the application never uses.
- **Fix Applied:** Added to both `netlify.toml` and `_headers` for `/*` and `/*.html` routes: `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer-when-downgrade`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Status:** Fixed — commit `c84abfb`

---

### Finding 9: Auth Session Listener Failure Leaves User in Broken State

- **Severity:** Medium
- **Location:** `app/auth.js` — `onSnapshot` error callback on user document listener
- **Description:** If the Firestore listener on the current user's document failed (e.g., auth token expired and could not be refreshed during an active session), the error callback only logged the error. The user would remain in an authenticated UI state with no Firestore access — displaying stale or empty data with no recovery path and no indication to the user.
- **Fix Applied:** Extended the error callback to call `signOut(auth)` followed by a redirect to `#/login`. Code path: listener error → unsubscribe → signOut → redirect to /login (redirect happens even if signOut fails). Ensures clean re-authentication.
- **Status:** Fixed — commit `a918027`

---

### Finding 10: invitation_codes Open Read/Update Rules

- **Severity:** Medium (Accepted Risk)
- **Location:** `firestore.rules` — `invitation_codes` collection
- **Description:** The `invitation_codes` collection allows `read: if true` (unauthenticated) and `update: if true` (unauthenticated). Any actor who knows a code string can read or update the corresponding document without authentication.
- **Fix Applied:** None — this is an accepted risk per CONTEXT.md (see Accepted Risks section below).
- **Status:** Accepted Risk — documented in `firestore.rules` with full justification

---

### Finding 11: firebase.js Auth Observer Failure Logged at Wrong Severity

- **Severity:** Low
- **Location:** `app/firebase.js` — auth observer initialization error handler
- **Description:** A failure to initialize the auth observer was logged as `console.log` (informational) rather than `console.error`. A broken auth initialization is an error condition that prevents the application from working — logging it as info means it could be missed during debugging.
- **Fix Applied:** Promoted from `console.log` to `console.error` with updated message: `'[Firebase] Auth observer failed to initialize:'`. This ensures the error is visible in production error monitoring.
- **Status:** Fixed — commit `01353bb`

---

## Areas Reviewed

### 1. XSS Vectors (SEC-01)

All 17 view files and 5 shared app files were reviewed for `innerHTML` usage with user-supplied data. 12 view files required changes (Findings 2-4). Two files were confirmed safe without changes:
- `mrf-form.js`: write-only form, does not render stored data back to HTML; dropdowns built via DOM API with `textContent`
- `expense-modal.js`: only `innerHTML` usages are static HTML entities (`&#9660; &#9654;` for expand/collapse arrows)

Files with no user-supplied data in `innerHTML` (confirmed safe): `router.js`, `auth.js`, `home.js`, `login.js`, `register.js`, `admin.js`, `role-config.js`, `components.js`.

`escapeHTML()` handles all 5 HTML special characters: `&`, `<`, `>`, `"`, `'`. Handles null/undefined input safely.

### 2. Injection Risks (SEC-02)

Zero `eval()` or `new Function()` patterns found across all `app/` files (pre-verified). Firestore queries use the Firebase SDK's typed query API — no string-interpolated queries, no injection surface. All Firestore write operations pass structured objects, not raw query strings.

### 3. Sensitive Data Exposure (SEC-03)

167 `console.log`/`console.info` calls removed across 23 files (Findings 5, 6). Auth module received strictest treatment: all log/warn removed, only error remains. `firebase.js` auth observer failure promoted from log to error (Finding 11). Production consoles now show only genuine errors and actionable warnings. Zero PII exposure in normal operation.

### 4. Firebase Security Rules (SEC-04)

All 12 Firestore collections and 2 subcollections audited against least-privilege principle:
- `mrfs`, `prs`, `pos`, `transport_requests`, `deleted_mrfs`, `clients`: active users read / admin write — confirmed correct
- `suppliers`, `projects`, `services`: active users read / procurement+admin write — confirmed correct
- `project_assignments`, `service_assignments` (subcollections): active users read / admin write — confirmed correct
- `users`: self-read + field-restricted self-update / admin write — fixed (Finding 1)
- `invitation_codes`: open read+update — documented accepted risk (Finding 10)
- `audit_logs` (if present): admin-only read — confirmed correct

### 5. Auth Edge Cases (SEC-05)

- Session token refresh: Firebase SDK handles automatically; no manual token management
- Multi-tab behavior: Firestore listener propagates auth state changes across tabs via shared session
- Role escalation: Blocked at Firestore rule level (Finding 1 fix)
- Invitation code reuse: Each code is a one-time use document; the approval workflow marks codes as used
- Broken session recovery: Listener failure now forces logout (Finding 9 fix)
- Privilege checks: `app/permissions.js` performs client-side role checks; Security Rules provide server-side enforcement

### 6. CSP Headers (SEC-06)

Before: Single `frame-ancestors 'self'` directive — no script/style/connect restrictions.
After: Full 7-directive policy on `/*` and `/*.html` routes (Finding 7 fix). Three new security headers added (Finding 8 fix). CSS/JS/image/font routes unchanged (no CSP needed for static assets served from own origin).

---

## Accepted Risks

### invitation_codes Open Rules

- **Rule:** `allow read: if true` and `allow update: if true` on `invitation_codes` collection
- **Justification:** The invitation code workflow intentionally allows unauthenticated access. When a new user registers, they enter an invitation code before authenticating. The browser must read the code document to validate it before the user has a session. After the user is approved by an admin, the code document is updated to reflect the linked user. This is by design — the flow cannot work with auth-gated rules.
- **Mitigations:**
  - Codes are randomly generated strings (not guessable by enumeration)
  - Codes only unlock the ability to submit a registration request — they do not grant application access
  - Every registration with a valid code goes through an admin approval step before the user can access any data
  - The `users` collection (which contains actual roles and access levels) is fully auth-gated
  - An attacker reading invitation_codes learns: a code string and whether it has been used — no PII, no access
- **Documented in:** `firestore.rules` security audit comment block (2026-03-01)

---

## Recommendations for Future Phases

1. **Nonce-based CSP**: The current CSP uses `'unsafe-inline'` for `script-src` because the application has hundreds of inline `onclick` handlers. A future refactor replacing inline handlers with event listeners added in `init()` would allow replacing `'unsafe-inline'` with a per-request nonce, providing significantly stronger XSS protection. This is a significant refactor effort — not required for current launch but worth tracking.

2. **Subresource Integrity (SRI)**: Firebase SDK is loaded from CDN (`https://www.gstatic.com/firebasejs/10.7.1/...`). Adding `integrity="sha384-..."` attributes to `<script>` tags would prevent a CDN compromise from injecting malicious code. The version is pinned (10.7.1), so SRI hashes are stable. Blocked by `'unsafe-inline'` CSP requirement — resolve point 1 first.

3. **Security Rules monitoring**: Consider enabling Firebase Rules Playground testing as part of any future rules changes. Automated tests for the field-level self-update restriction would prevent regression.

4. **Audit log completeness**: The `audit_logs` collection exists but was not populated by the current phase. Consider adding write operations (MRF approval, PO status changes) to audit_logs in a future phase for forensic accountability.
