---
phase: 90-auth-pages-polish
plan: "03"
subsystem: auth
tags: [firebase-auth, forgot-password, password-reset, spa, login]

requires:
  - "90-01 (login.js post-Plan-01 state — handleLogin free of hash assignments)"
  - "90-02 (auth-success CSS class defined in styles/views.css)"

provides:
  - "Inline #forgotPanel toggle inside login.js render()"
  - "handleForgotPassword(), handleSendReset(), handleCancelReset() wired in init()/destroy()"
  - "sendPasswordResetEmail imported from firebase.js (CDN import + export blocks updated)"

affects:
  - "app/firebase.js — sendPasswordResetEmail added to CDN import block and export block"
  - "app/views/login.js — render() gains #forgotPasswordLink and #forgotPanel; three handler functions added; init/destroy updated"

tech-stack:
  added:
    - "sendPasswordResetEmail (Firebase Auth v10.7.1 — already on CDN, now imported)"
  patterns:
    - "Panel toggle via display:none / display:block without route change — sibling divs inside .auth-card"
    - "Error messages via textContent (not innerHTML) for XSS safety — all strings are code literals"
    - "Listener cleanup mirrors init() wiring exactly — getElementById + removeEventListener + null-safe if-guards"

key-files:
  created: []
  modified:
    - app/firebase.js
    - app/views/login.js

key-decisions:
  - "[90-03]: sendPasswordResetEmail added to firebase.js CDN import + export so all consumers share the same module-level import (consistent with existing auth method exports)"
  - "[90-03]: handleSendReset validates with /^[^\s@]+@[^\s@]+\.[^\s@]+$/ regex before firing sendPasswordResetEmail — catches empty and malformed email client-side before network call"
  - "[90-03]: sendResetBtn stays disabled after success — prevents double-send; cancelResetBtn text changes to 'Back to Login' per UI-SPEC"
  - "[90-03]: handleCancelReset resets all panel state (value, errors, success, button text/state) before restoring #loginForm — T-90.3-04 mitigate: no state leakage between toggle cycles"
  - "[90-03]: window.handleLogin now has three siblings (handleForgotPassword, handleSendReset, handleCancelReset) — all registered after function definitions; all deleted in destroy()"

requirements-completed: []

duration: 12min
completed: 2026-05-13
---

# Phase 90 Plan 03: Auth Pages Polish — Forgot Password Panel Summary

**Inline Forgot Password panel added to login.js — toggle from #loginForm to #forgotPanel, sendPasswordResetEmail wired, verbatim UI-SPEC copy strings applied, full init/destroy lifecycle cleanup**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-13T02:45:00Z
- **Completed:** 2026-05-13T02:57:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `sendPasswordResetEmail` to `app/firebase.js` CDN import block (line ~44) and export block (line ~137)
- Added `sendPasswordResetEmail` to `login.js` import line from `'../firebase.js'`
- Inserted `<div class="auth-link" ...><a href="#" id="forgotPasswordLink">Forgot password?</a></div>` inside `#loginForm` after password `.auth-field` block, before `#generalError`
- Inserted `<div id="forgotPanel" style="display:none;">` with full structure (description `<p>`, `.auth-form` wrapper, `#resetEmail` input, `#resetEmailError`, `#resetSuccess.auth-success`, `#sendResetBtn`, `#cancelResetBtn`) as sibling to `#loginForm` inside `.auth-card`
- Added `handleForgotPassword(e)`: `e.preventDefault()`, hide `#loginForm`, show `#forgotPanel`, focus `#resetEmail`
- Added `handleSendReset()`: regex validation, loading state, `sendPasswordResetEmail(auth, email)`, success copy + "Back to Login" label on success, three distinct error copies on `auth/invalid-email` / `auth/user-not-found` / generic
- Added `handleCancelReset()`: clear `#resetEmail` value, reset error/success elements, reset button text/state, restore `#loginForm` (empty string display to restore CSS default)
- Wired all three handlers in `init()` after existing form submit listener with null-safe `if (element)` guards
- Removed all three listeners in `destroy()` with matching null-safe guards; added `delete window.handleForgotPassword`, `delete window.handleSendReset`, `delete window.handleCancelReset` alongside existing `delete window.handleLogin`
- Registered all three functions on `window` after existing `window.handleLogin` assignment

## Task Commits

1. **Task 1: Add #forgotPanel HTML to render() and import sendPasswordResetEmail** - `c9bdf9a` (feat)
2. **Task 2: Add forgot-password handler functions and wire init()/destroy()** - `64f869b` (feat)

## Files Created/Modified

- `app/firebase.js` — Added `sendPasswordResetEmail` to CDN import block and export block (2 lines added)
- `app/views/login.js` — Added forgot-password link div inside `#loginForm`; added `#forgotPanel` div after `</form>`; added three handler functions (~80 lines); extended init() with 6 lines; extended destroy() with 10 lines; added 3 window registrations

## Decisions Made

- `sendPasswordResetEmail` imported at module level via firebase.js (consistent with all other auth methods in the file)
- Client-side regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` validates format before network call — avoids unnecessary Firebase round-trips for obviously malformed emails
- `sendResetBtn` kept disabled after success (not re-enabled) to prevent duplicate sends — user must use "Back to Login" → Cancel to reset panel state
- `cancelResetBtn.textContent` changes to "Back to Login" on success per UI-SPEC preferred approach
- `handleCancelReset` resets ALL panel state (value, error textContent/display, success display, button textContent/disabled) — T-90.3-04 state-leakage mitigation

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Surface Scan

No new Firestore endpoints, file access, or schema changes. The only new network call is `sendPasswordResetEmail` to Firebase Auth (T-90.3-01 through T-90.3-04 covered in plan threat model). All message strings written via `textContent` (T-90.3-03 mitigate). No new threat surface beyond what the plan's threat model covers.

## Self-Check: PASSED

- [x] `app/firebase.js` contains `sendPasswordResetEmail` in CDN import block — verified
- [x] `app/firebase.js` contains `sendPasswordResetEmail` in export block — verified
- [x] `app/views/login.js` grep -c "forgotPanel" returns 3 (render HTML x2 reference + init/destroy x1 reference each = 3 total) — verified
- [x] `app/views/login.js` grep -c "sendPasswordResetEmail" returns 3 (import + definition call + usage) — verified
- [x] `app/views/login.js` grep -c "handleForgotPassword" returns 5 — verified
- [x] `app/views/login.js` grep -c "handleSendReset" returns 5 — verified
- [x] `app/views/login.js` grep -c "handleCancelReset" returns 5 — verified
- [x] Task 1 commit `c9bdf9a` — verified in git log
- [x] Task 2 commit `64f869b` — verified in git log

---
*Phase: 90-auth-pages-polish*
*Completed: 2026-05-13*
