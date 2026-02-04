---
phase: 10
plan: 01
name: Route Guards & Unauthenticated Redirect
status: complete
subsystem: security
tags: [authentication, routing, security, route-guards]

# Dependency graph
requires:
  - phase-09 # Super Admin User Management complete
provides:
  - route-guard-system # Authentication checks before route loading
  - unauthenticated-redirect # Automatic redirect to login
  - initial-route-handling # Deferred navigation until auth known
affects:
  - 10-02 # Session timeout will build on route guards
  - 10-03 # Idle detection uses same auth patterns
  - 10-04 # Verification tests the complete guard system

# Tech tracking
tech-stack:
  added: []
  patterns:
    - auth-guard-in-router # Pre-navigation authentication check
    - deferred-initial-route # Wait for auth state before first navigation
    - navbar-visibility-control # Hide UI until auth determined

# File tracking
key-files:
  created: []
  modified:
    - app/router.js # Auth guard in navigate(), handleInitialRoute()
    - app/auth.js # Call handleInitialRoute() after auth state
    - index.html # Hide navbar initially

# Decisions
decisions:
  - id: SEC-01-implementation
    desc: Auth check happens synchronously in router before route loading
    rationale: Eliminates flash of protected content, consistent with Phase 10 goals
  - id: SEC-03-status-routing
    desc: Router redirects pending/rejected/deactivated users before content loads
    rationale: Defense in depth - router enforces status-based access control
  - id: ROUTING-03
    desc: Navbar hidden until auth state determined
    rationale: Prevents visual flash and maintains clean UX during auth check

# Metrics
duration: 2 minutes
completed: 2026-02-04
---

# Phase 10 Plan 01: Route Guards & Unauthenticated Redirect Summary

**One-liner:** Route guards redirect unauthenticated users to login before loading protected content, eliminating flash of protected content.

---

## What Was Built

### 1. Authentication Guard in Router (app/router.js)

**Added synchronous auth check in `navigate()` function:**
- Checks `getCurrentUser()` before loading protected routes
- Redirects unauthenticated users to `/login` immediately
- Checks user status (pending/rejected/deactivated) and redirects accordingly
- Placed BEFORE permission check for proper security layering

**Implementation:**
```javascript
// Authentication check for protected routes (SEC-01, SEC-03)
if (!publicRoutes.includes(path)) {
    const currentUser = window.getCurrentUser?.();

    if (!currentUser) {
        console.warn('[Router] Unauthenticated access blocked:', path);
        window.location.hash = '#/login';
        return;
    }

    // Check for pending/rejected/deactivated status
    if (currentUser.status === 'pending' || currentUser.status === 'rejected') {
        console.warn('[Router] Pending/rejected user redirected to pending page');
        window.location.hash = '#/pending';
        return;
    }

    if (currentUser.status === 'deactivated') {
        console.warn('[Router] Deactivated user redirected to login');
        window.location.hash = '#/login';
        return;
    }
}
```

### 2. Deferred Initial Route Handling (app/router.js)

**Added `handleInitialRoute()` function:**
- Waits for auth state to be determined before navigating
- Hides initial loading indicator
- Shows navbar after auth state known
- Exposed to window for auth.js to call

**Modified `initRouter()`:**
- Removed immediate navigation on app load
- Only sets up hashchange listener
- Exposes handleInitialRoute to window
- Logs "waiting for auth state" message

**Result:** Router no longer navigates until auth observer confirms user state.

### 3. Auth Observer Integration (app/auth.js)

**Added `initialRouteHandled` flag:**
- Tracks whether initial route has been processed
- Ensures handleInitialRoute() only called once

**Call handleInitialRoute() after auth determined:**
- Called for authenticated users (after user document loaded)
- Called for unauthenticated users (in else branch)
- Both paths trigger initial navigation after auth state known

**Implementation:**
```javascript
// Handle initial route after auth state known (SEC-01)
if (!initialRouteHandled && window.handleInitialRoute) {
    initialRouteHandled = true;
    window.handleInitialRoute();
}
```

### 4. Initial Loading State (index.html)

**Hide navbar until auth state known:**
- Added `style="display: none;"` to `<nav class="top-nav">`
- handleInitialRoute() shows navbar after auth check
- Prevents flash of navigation links before auth verification

**Comment added:**
```html
<!-- Top Navigation (hidden until auth state known - SEC-01) -->
```

---

## Architecture

### Security Layers (Defense in Depth)

**Layer 1: Router Auth Guard (NEW)**
- Synchronous check in `navigate()` function
- Blocks route loading if not authenticated
- Redirects based on user status
- **Position:** Before route module loading

**Layer 2: Permission Check (Existing - PERM-14)**
- Checks tab-level permissions via `hasTabAccess()`
- Shows Access Denied page if no permission
- **Position:** After auth check, before route loading

**Layer 3: View-Level Guards (Existing - Phase 6)**
- Edit permission checks in views
- Disabled controls for view-only users
- **Position:** Within loaded views

### Flow Diagram

```
App Load
    ↓
Auth Observer Initialized
    ↓
(Wait for auth state...)
    ↓
Auth State Determined ──→ handleInitialRoute() called
    ↓                          ↓
    ↓                     Show navbar
    ↓                          ↓
    ↓                     Hide loading indicator
    ↓                          ↓
User navigates ──────→ navigate(path) called
    ↓
1. Auth Guard Check
    ↓ (not authenticated)
    └──→ Redirect to /login
    ↓ (pending/rejected)
    └──→ Redirect to /pending
    ↓ (deactivated)
    └──→ Redirect to /login
    ↓ (authenticated + active)
2. Permission Check
    ↓ (no access)
    └──→ Show Access Denied page
    ↓ (has access)
3. Load and Render View
```

---

## Success Criteria Verification

✅ **Unauthenticated users accessing any protected route are immediately redirected to /login**
- Auth guard checks `getCurrentUser()` synchronously
- Returns early with redirect before loading route module

✅ **No flash of protected content (dashboard, projects, etc.)**
- Navbar hidden until auth state known
- Navigation deferred until auth check complete
- Route loading blocked by guard

✅ **Auth check happens synchronously before route loading**
- `getCurrentUser()` returns synchronously (module-level variable)
- Check happens in `navigate()` before `route.load()` call

✅ **Public routes (`/login`, `/register`, `/pending`) remain accessible without auth**
- `publicRoutes` array excludes these from auth check
- Can navigate freely without authentication

✅ **Authenticated users navigate normally without extra redirects**
- Auth guard only blocks if not authenticated or wrong status
- Active users pass through to permission check, then normal flow

---

## Testing Notes

### Manual Testing Scenarios

**Scenario 1: Unauthenticated user tries to access dashboard**
1. Open app in incognito window (not logged in)
2. Try to navigate to `#/` or any protected route
3. **Expected:** Immediate redirect to `#/login`, no flash of content

**Scenario 2: Authenticated user navigates normally**
1. Log in as active user
2. Navigate between dashboard, projects, etc.
3. **Expected:** Normal navigation, no extra redirects

**Scenario 3: Pending user tries to access dashboard**
1. Log in as pending user (or use existing pending account)
2. Try to navigate to `#/`
3. **Expected:** Redirect to `#/pending` page

**Scenario 4: Deactivated user blocked**
1. Super Admin deactivates user while logged in
2. User tries to navigate
3. **Expected:** Redirect to login (auth observer also forces sign-out)

**Scenario 5: Public routes accessible**
1. While logged out, navigate to `#/login`, `#/register`, `#/pending`
2. **Expected:** All accessible without redirect

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Known Issues / Limitations

None identified. Implementation is straightforward and complete.

---

## Next Phase Readiness

**Phase 10 continues with:**
- **Plan 10-02:** Session timeout (30-day expiration)
- **Plan 10-03:** Idle detection and auto-logout
- **Plan 10-04:** End-to-end verification

**Blockers:** None

**Dependencies satisfied:**
- Route guards now in place for session timeout logic
- Auth guard structure ready for idle detection integration
- Clean foundation for comprehensive Phase 10 verification
