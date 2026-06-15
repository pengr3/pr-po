---
phase: 90-auth-pages-polish
plan: "01"
subsystem: auth
tags: [firebase-auth, routing, race-condition, spa, sessionStorage]

requires: []

provides:
  - "Race-safe post-login redirect inside auth.js onSnapshot active-user isFirstSnapshot block"
  - "login.js handleLogin() free of bare window.location.hash assignments"
  - "Single routing authority: auth.js onSnapshot callback drives all post-login navigation"

affects:
  - 90-auth-pages-polish (Plans 02, 03 — login.js modifications must not re-add hash assignments)

tech-stack:
  added: []
  patterns:
    - "Post-login redirect owned by auth observer (not login form handler) to eliminate async race conditions"
    - "sessionStorage.getItem('intendedRoute') consumed in exactly one place (auth.js) — enforced by grep -c == 1"

key-files:
  created: []
  modified:
    - app/auth.js
    - app/views/login.js

key-decisions:
  - "[90-01]: Post-login redirect block fires only when window.location.hash.includes('/login') — active users already on '#/' do not re-trigger the redirect (T-90.1-03 hash-loop mitigation)"
  - "[90-01]: Block placed BEFORE window.dispatchEvent(authStateChanged) so routing settles before downstream observers react to auth state change"
  - "[90-01]: login.js handleLogin retains the deactivated-account guard (signOut + showError) as an eager client-side check — auth.js onSnapshot also handles deactivated (belt-and-suspenders, not a duplicate ownership issue)"
  - "[90-01]: login.js no longer sets sessionStorage.removeItem('intendedRoute') — auth.js is the sole consumer and cleaner of the intendedRoute key"

patterns-established:
  - "Auth observer owns routing: any post-auth-state navigation must live inside onSnapshot/onAuthStateChanged callbacks, not in form submit handlers"

requirements-completed: []

duration: 8min
completed: 2026-05-13
---

# Phase 90 Plan 01: Auth Pages Polish — Login Routing Race Fix Summary

**Race-safe post-login redirect moved into auth.js onSnapshot active-user path; login.js loses all bare window.location.hash assignments eliminating the login-bounce race condition**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-13T00:00:00Z
- **Completed:** 2026-05-13T00:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added redirect block inside `auth.js` `isFirstSnapshot=true` active-user path: reads `sessionStorage.intendedRoute`, redirects to `'#' + intendedRoute` or `'#/'` when `window.location.hash.includes('/login')`; consumes and removes the key atomically
- Block placed before `dispatchEvent('authStateChanged')` so routing settles before observers see the auth state change
- Removed the entire `sessionStorage.getItem` + `window.location.hash =` block from `login.js handleLogin()` — replaced with a single comment documenting auth.js ownership
- `grep -c "sessionStorage.getItem('intendedRoute')" app/auth.js` returns exactly 1 (sole read site)
- `grep -c "window.location.hash" app/views/login.js` returns 0

## Task Commits

1. **Task 1: Add post-login redirect to auth.js active-user isFirstSnapshot block** - `22ae1e7` (feat)
2. **Task 2: Remove bare hash assignments from login.js handleLogin()** - `a1ad13b` (fix)

## Files Created/Modified

- `app/auth.js` — Added 12-line redirect block after `// Active users: no forced redirect` comment, inside `isFirstSnapshot=true` branch, before `dispatchEvent`
- `app/views/login.js` — Removed 8-line intendedRoute block from `handleLogin()`; replaced with ownership comment

## Decisions Made

- Post-login redirect only fires when current hash includes `/login` — prevents re-triggering for active users who are already on `#/` (T-90.1-03 hash-loop mitigation)
- Block placed BEFORE `dispatchEvent(authStateChanged)` so routing is complete before downstream observers fire
- `login.js` deactivated-account eager check (signOut + showError) retained unchanged — belt-and-suspenders alongside auth.js onSnapshot deactivated path; ownership is non-overlapping (login.js catches it before auth state fires, auth.js catches runtime deactivation)
- `intendedRoute` key: auth.js is now sole reader + cleaner; login.js no longer touches sessionStorage

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Surface Scan

No new Firestore endpoints, auth paths, file access patterns, or schema changes introduced. Both changes are client-side routing adjustments within existing auth observer and form handler. No new threat surface beyond T-90.1-01 through T-90.1-03 already addressed in the plan's threat model.

## Next Phase Readiness

- Plan 01 complete — auth.js is now the single routing authority for post-login navigation
- Plan 02 (register.js success state polish) is independent of Plan 01 and can proceed
- Plan 03 (Forgot Password in login.js) must follow Plan 01 — login.js is now clean of hash assignments, Plan 03 additions must not re-introduce bare `window.location.hash` assignments

## Self-Check: PASSED

- [x] `app/auth.js` modified — file exists and contains `sessionStorage.getItem('intendedRoute')` count == 1
- [x] `app/views/login.js` modified — `window.location.hash` count == 0, `sessionStorage.getItem` count == 0
- [x] Task 1 commit `22ae1e7` — verified in git log
- [x] Task 2 commit `a1ad13b` — verified in git log

---
*Phase: 90-auth-pages-polish*
*Completed: 2026-05-13*
