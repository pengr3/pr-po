---
phase: 83-notification-system-foundation
plan: "03"
subsystem: notifications-ui-wiring
tags: [notifications, bell-icon, mobile, auth-hooks, NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05]
dependency_graph:
  requires:
    - notifications-shared-module
    - bell-listener-lifecycle
    - window-registered-handlers
  provides:
    - bell-markup-in-dom
    - notif-css-classes
    - notifications-module-loaded-at-bootstrap
    - auth-lifecycle-hooks
  affects:
    - index.html
    - styles/components.css
    - app/auth.js
tech_stack:
  added: []
  patterns:
    - sibling-of-nav-links-mobile-safe-placement
    - window-guarded-lifecycle-hooks
    - css-order-property-for-visual-reorder
    - static-module-import-at-bootstrap
key_files:
  modified:
    - index.html
    - styles/components.css
    - app/auth.js
decisions:
  - "Bell placed as sibling of .nav-links (not child) so it survives the mobile display:none on .nav-links — Pitfall 1 mitigation"
  - "CSS order:2 on .notif-bell-wrap positions bell visually between Admin dropdown and Log Out without DOM reordering"
  - "All 4 auth.js hooks are window-guarded (if window.initNotifications) to keep auth.js decoupled from notifications.js"
  - "Static import of notifications.js in bootstrap (not lazy, not in auth.js) guarantees window.* registrations exist before first onclick fires"
  - "Mobile flex tweak (.top-nav-content gap:0.5rem) consolidated in components.css (not views.css) — single source of truth for .top-nav-content"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-30"
  tasks_completed: 3
  files_modified: 3
---

# Phase 83 Plan 03: Bell UI Wiring + Auth Hooks Summary

Bell button + badge + dropdown skeleton wired into `index.html` as a mobile-safe sibling of `.nav-links`; parallel `.notif-*` CSS class set added to `styles/components.css`; `app/notifications.js` statically imported in the bootstrap module; `initNotifications`/`destroyNotifications` hooked into `app/auth.js` at all 4 lifecycle points.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Insert bell markup into index.html (sibling of .nav-links) | cc3e136 | index.html |
| 2 | Add .notif-* CSS classes + mobile flex tweak to components.css | 06b4d4e | styles/components.css |
| 3 | Static import of notifications.js + auth.js lifecycle hooks | 59b7d76 | index.html, app/auth.js |

## Files Created / Modified

| File | Action | Lines (after) | Notes |
|------|--------|---------------|-------|
| `index.html` | Modified | 265 (+55) | Bell markup at line 42; notifications.js import at line 251 |
| `styles/components.css` | Modified | 1919 (+232) | Entire .notif-* class set appended at end of file |
| `app/auth.js` | Modified | 554 (+14) | 4 hook points added; 0 lines deleted |

## Exact Insertion Points

### Bell Markup — index.html line 42
```
line 42:  <div class="notif-bell-wrap" id="notifBellWrap" style="display: none;">
```
Inserted immediately before `<div class="nav-links">` (was at line 37, now at line 79 after insertion). Placement is OUTSIDE `.nav-links` so the bell survives `@media (max-width: 768px) .nav-links { display: none; }` (Pitfall 1 mitigation).

### notifications.js Import — index.html line 251
```
line 251: import './app/notifications.js';
```
Placed in the inline `<script type="module">` bootstrap block AFTER `import './app/components.js'` (line 244) and BEFORE the `initAuthObserver()` invocation (line 255).

### auth.js Hook Points

| Edit | Location | Line | Code |
|------|----------|------|------|
| Edit 2 (init) | first-snapshot active branch, after `updateNavForAuth` | 244–246 | `if (userData.status === 'active' && window.initNotifications) { window.initNotifications(currentUser); }` |
| Edit 3 (destroy) | first-snapshot deactivated branch, before `await signOut` | 269 | `if (window.destroyNotifications) window.destroyNotifications();` |
| Edit 4 (destroy) | subsequent-snapshot deactivated branch, before `signOut(auth).then` | 305 | `if (window.destroyNotifications) window.destroyNotifications();` |
| Edit 5 (destroy) | auth-cleared else branch, after `destroyPermissionsObserver()` | 357 | `if (window.destroyNotifications) window.destroyNotifications();` |

## MAJOR-5 Cross-File Consistency Checks (all pass)

```
grep -c 'id="notifBell"' index.html                            → 1  ✓
grep -c "import './app/notifications.js'" index.html           → 1  ✓
grep -c 'window.toggleNotificationsDropdown' app/notifications.js → 1  ✓
grep -c 'initNotifications' app/auth.js                        → 2  ✓ (>= 1)
grep -c 'destroyNotifications' app/auth.js                     → 3  ✓ (>= 3)
grep -Ec '\.notif-bell\b|\.notif-dropdown\b|\.notif-row\b' styles/components.css → 21  ✓ (>= 3)
```

## Verify Script Result

`node .planning/phases/83-notification-system-foundation/verify-03-1.cjs` exits 0:
```json
{
  "id=\"notifBellWrap\"": true,
  "id=\"notifBell\"": true,
  "id=\"notifBadge\"": true,
  "id=\"notifDropdownMenu\"": true,
  "id=\"notifDropdownRows\"": true,
  "id=\"notifMarkAllBtn\"": true,
  "bell-wrapper-count-(exactly-1)": 1,
  "bell-wrapper-precedes-nav-links": true,
  "bell-NOT-inside-mobile-drawer": true,
  "view-all-link-present": true,
  "onclick-toggle-present": true,
  "onclick-markall-present": true
}
```

## Notes for Downstream Plans

### Note for Plan 04 (History Page + Router)
Bell dropdown footer link points to `#/notifications`. Plan 04 MUST register this route in `app/router.js`. Without the route registration, clicking "View all notifications" will produce a 404-style empty view or router error.

### Note for Plan 05 (UAT)
Manual UAT steps are now feasible:
1. `python -m http.server 8000` → navigate to `localhost:8000`
2. Log in as an active user → bell should appear in top nav
3. `await window.__createTestNotification()` in DevTools console → badge should show "1" within ~2s
4. Click bell → dropdown opens with the test notification row
5. Resize to 375px → bell remains visible alongside brand/hamburger; `.nav-links` drawer hides
6. Log out → bell disappears; log back in as different user → bell shows only new user's notifications

## Deviations from Plan

None — plan executed exactly as written. All 5 mandatory edits applied at the precise locations specified. No lines were deleted from any existing file.

## Known Stubs

None — this plan wires UI to infrastructure only. The bell renders correctly once an active user logs in. No data flows are stubbed; `initNotifications` (Plan 02) attaches the real Firestore `onSnapshot` listener.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema changes introduced. The bell markup and CSS are purely client-side presentation. The auth.js hooks call only already-reviewed window functions (Plan 02 ships them with the Firestore listener).

## Self-Check: PASSED

- `index.html` modified — FOUND (cc3e136, 37 insertions Task 1 + 8 insertions Task 3)
- `styles/components.css` modified — FOUND (06b4d4e, 232 insertions)
- `app/auth.js` modified — FOUND (59b7d76, 14 insertions, 0 deletions)
- Commit cc3e136 exists — FOUND
- Commit 06b4d4e exists — FOUND
- Commit 59b7d76 exists — FOUND
- `node .planning/phases/83-notification-system-foundation/verify-03-1.cjs` exits 0 — VERIFIED
- `node --check app/auth.js` exits 0 — VERIFIED
- All MAJOR-5 cross-file consistency checks pass — VERIFIED
