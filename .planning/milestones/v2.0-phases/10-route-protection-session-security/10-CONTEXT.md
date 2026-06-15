# Phase 10: Route Protection & Session Security - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Protect application routes and enforce session security so unauthenticated and unauthorized users cannot access the system. Implement deep link restoration for better UX, and strengthen minimum Super Admin safeguards from 1 to 2 active accounts.

</domain>

<decisions>
## Implementation Decisions

### Redirect behavior
- **Deep link restoration**: When unauthenticated user visits any route, redirect to login BUT save intended route and restore it after successful authentication
- **Storage mechanism**: Claude's discretion - choose best approach for storing intended route (sessionStorage, localStorage, or URL parameter)
- **Restoration granularity**: Restore exact route including sub-routes and tabs (e.g., user tries #/procurement/mrfs → after login, land at #/procurement/mrfs, not just #/procurement)
- **Non-active authenticated users**: Pending/deactivated users attempting protected routes are redirected to login page and blocked there once (not allowed to proceed)

### Session validation timing
- **Validation strategy**: Trust existing Phase 5 listeners only - no redundant route-level checks
  - Existing authStateChanged listener handles authentication state changes
  - Existing Firestore user document listener handles deactivation (AUTH-09)
  - No additional validation needed on every route change (would be redundant and potentially straining)
- **Session expiration handling**: Immediate redirect to login when Firebase detects null user (no modal warning, direct redirect)

### User feedback
- **Feedback approach**: Mixed - status pages for major states, toast notifications for transient issues
- **Unauthenticated users**: Silent redirect to login (no message - seeing login page is self-explanatory)
- **Insufficient permissions**: Reuse existing Access Denied page from Phase 6 (PERM-14) for unpermitted route access
- **Session expiration**: Show toast notification "Session expired, please log in again" before redirecting to login

### Min Super Admin enforcement
- **Enforcement layers**: UI-level disabled buttons + Firebase Security Rules (server-side enforcement that cannot be bypassed via console)
- **Minimum count**: Change from 1-admin minimum (USER-07) to 2-admin minimum for production safety
- **Error message**: Specific explanation - "Cannot deactivate: system requires at least 2 active Super Admin accounts"
- **Scope**: Applies to deactivation, deletion, and role changes that would reduce active Super Admin count below 2

### Claude's Discretion
- Route storage mechanism (sessionStorage vs localStorage vs URL param)
- Toast notification timing and styling
- Security Rules implementation details for min admin enforcement
- Exact wording of redirect messages if needed

</decisions>

<specifics>
## Specific Ideas

- User experience priority: Deep link restoration improves UX by not forcing users back to home after login
- Defense in depth: UI + Security Rules provides both good UX (disabled buttons) and security (cannot bypass)
- Trust existing infrastructure: Phase 5's auth observer already handles real-time deactivation - don't duplicate
- Production safety: 2-admin minimum prevents lockout scenarios in production environments

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-route-protection-session-security*
*Context gathered: 2026-02-04*
