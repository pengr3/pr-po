---
phase: 90-auth-pages-polish
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - app/auth.js
  - app/views/login.js
  - app/views/register.js
  - styles/views.css
  - app/firebase.js
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 90: Code Review Report

**Reviewed:** 2026-05-13
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 90 adds three auth-page improvements: login routing race fix (auth.js owns post-login redirect), registration success state polish (showSuccess + .auth-success CSS), and inline Forgot Password panel (handleForgotPassword/handleSendReset/handleCancelReset in login.js). The new code is overall well-structured — all DOM writes use textContent, destroy() cleanup is symmetric with init() in login.js, and Firebase Auth error codes are handled with user-friendly messages in the forgot-password flow.

Two critical issues were found: an XSS surface in register.js where an URL-derived invitation code is interpolated into an innerHTML attribute without HTML-escaping (pre-existing but exposed by Phase 90 touching the file), and a missing active-status guard in the auth.js post-login redirect block that creates an ordering-dependent maintenance trap in the core auth flow. Three warnings cover account enumeration via raw Firebase error messages, a missing form listener removal in register.js destroy(), and a future open-redirect risk from unvalidated intendedRoute values.

---

## Critical Issues

### CR-01: XSS — URL-derived `invitationCode` interpolated into `innerHTML` attribute without escaping

**File:** `app/views/register.js` (render() function, value attribute on invitation code input)

**Issue:** `render()` calls `getInvitationCodeFromURL()` which returns `URLSearchParams.get('code')` — a URL-attacker-controlled string. This value is interpolated directly into the HTML template literal as `value="${invitationCode || ''}"`, then assigned via `appContainer.innerHTML`. A crafted invitation link with `code=x" onfocus="alert(1)` would inject an event handler into the DOM.

In practice exploitation requires sharing a malicious invitation link with a victim (attacker controls the URL, not the server). Nonetheless, URL-derived values must be HTML-escaped before attribute interpolation.

**Fix:** Escape the value before interpolation:
```javascript
const safeCode = invitationCode
    ? invitationCode.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    : '';
// then use safeCode in the template: value="${safeCode}"
```
Or use `escapeHTML()` from `app/utils.js` if it handles double-quote encoding.

---

### CR-02: Auth routing — post-login redirect block not explicitly guarded to `active` status

**File:** `app/auth.js` (isFirstSnapshot active-user redirect block)

**Issue:** The redirect block (reads `intendedRoute`, sets `window.location.hash`) sits after the `pending`/`rejected`/`deactivated` branches but is not wrapped in an explicit `active` status guard. Today this works because:
- `deactivated` has an early `return`
- `pending`/`rejected` set `window.location.hash = '#/pending'`, so by the time the redirect block runs, the hash no longer includes `/login` and the `if (window.location.hash.includes('/login'))` guard prevents the redirect

This is ordering-dependent correctness — any future status value added with a redirect but without a `return` would silently fall into the active-user redirect block, sending that user to `intendedRoute` or `#/` despite not being active.

**Fix:** Wrap in an explicit `else if (userData.status === 'active')` guard:
```javascript
} else if (userData.status === 'active') {
    if (window.location.hash.includes('/login')) {
        const intendedRoute = sessionStorage.getItem('intendedRoute');
        if (intendedRoute) {
            sessionStorage.removeItem('intendedRoute');
            window.location.hash = '#' + intendedRoute;
        } else {
            window.location.hash = '#/';
        }
    }
}
```

---

## Warning Issues

### WR-01: `register.js destroy()` missing form submit listener removal

**File:** `app/views/register.js` (destroy() function)

**Issue:** `destroy()` has a comment "Form event listeners are automatically removed when DOM is cleared" but the router calls `destroy()` before replacing innerHTML. If the user navigates to `#/register` twice in succession via the browser back button, `init()` is called again without a `destroy()` cycle (or `destroy()` runs without removing the listener first), attaching a second `submit` handler to the same form element and causing `handleRegister` to fire twice per submit. `login.js` correctly removes its listener in `destroy()`.

**Fix:** Mirror the login.js pattern:
```javascript
export async function destroy() {
    const form = document.getElementById('registerForm');
    if (form) {
        form.removeEventListener('submit', handleRegister);
    }
    delete window.handleRegister;
}
```

---

### WR-02: Firebase `error.message` exposed verbatim in `register.js` catch block (account enumeration)

**File:** `app/views/register.js` (handleRegister catch block)

**Issue:** The catch block uses `showError('general', error.message)` for Firebase errors. Firebase Auth `error.message` for `auth/email-already-in-use` includes the registered email address verbatim: `"The email address already-in-use@example.com is already in use."` — confirming to an unauthenticated requester that this email is registered. `handleSendReset` in `login.js` correctly maps all Firebase error codes to generic messages.

**Fix:** Map known codes to generic messages:
```javascript
if (error.code === 'auth/email-already-in-use') {
    showError('general', 'An account with this email already exists.');
} else if (error.code === 'auth/invalid-email') {
    showError('email', 'Invalid email address.');
} else if (error.code === 'auth/weak-password') {
    showError('password', 'Password does not meet security requirements.');
} else {
    showError('general', 'Registration failed. Please try again.');
}
```

---

### WR-03: `intendedRoute` written to `sessionStorage` from attacker-controlled URL fragment with no prefix validation

**File:** `app/auth.js` (intendedRoute redirect block, line ~282)

**Issue:** `intendedRoute` derives from `window.location.hash.slice(1)` — fully attacker-controlled. It is consumed as `window.location.hash = '#' + intendedRoute`. If `intendedRoute` begins with `//`, the resulting hash `#//evil.example.com` stays in the hash namespace and is not a real open-redirect today. However, if a future code change switches to `window.location.href` or `window.location.replace`, the unvalidated value becomes a real open-redirect. Validate before use.

**Fix:**
```javascript
if (intendedRoute && intendedRoute.startsWith('/') && !intendedRoute.startsWith('//')) {
    sessionStorage.removeItem('intendedRoute');
    window.location.hash = '#' + intendedRoute;
} else {
    sessionStorage.removeItem('intendedRoute');
    window.location.hash = '#/';
}
```

---

## Info

### IN-01: Dead `auth/user-not-found` branch in `handleSendReset`

**File:** `app/views/login.js` (handleSendReset catch block)

**Issue:** Firebase Auth v10 changed `sendPasswordResetEmail` to silently succeed (not throw) for unregistered email addresses to prevent email enumeration. The `auth/user-not-found` branch in the catch block is permanently unreachable dead code. Its presence is misleading — it implies Firebase will expose email existence when it does not.

**Fix:** Remove the branch, keeping only `auth/invalid-email` and the generic fallback:
```javascript
} catch (error) {
    sendResetBtn.disabled = false;
    sendResetBtn.textContent = 'Send Reset Link';
    if (error.code === 'auth/invalid-email') {
        resetEmailError.textContent = 'Please enter a valid email address.';
    } else {
        resetEmailError.textContent = 'Failed to send reset email. Please try again.';
    }
    resetEmailError.style.display = 'block';
}
```

---

## No Issues Found

- All new DOM writes in `login.js` (handleSendReset, handleCancelReset, handleForgotPassword) use `textContent` — XSS safe
- `showSuccess()` in `register.js` uses `textContent` — XSS safe
- `login.js destroy()` correctly removes all four event listeners and deletes all four window functions — no memory leak
- `sendPasswordResetEmail` correctly added to `app/firebase.js` CDN import block and export block
- `.auth-success` CSS class in `styles/views.css` defaults to `display:none` and uses only CSS variables — correct
- `handleCancelReset` fully resets forgot-panel state before restoring `#loginForm` — no stale state on re-open
- `userDocUnsubscribe` is properly nulled and called in all auth.js exit paths
- `sendResetBtn` stays disabled after success — prevents duplicate email sends
