---
phase: 83-notification-system-foundation
plan: "02"
subsystem: notifications-shared-module
tags: [notifications, firestore, shared-module, NOTIF-13, NOTIF-04, NOTIF-05]
dependency_graph:
  requires:
    - notifications-collection-rules
    - notifications-composite-indexes
  provides:
    - notifications-shared-module
    - notification-creation-api
    - bell-listener-lifecycle
    - dropdown-render-helpers
    - dev-test-writer
  affects:
    - app/firebase.js
    - app/notifications.js
tech_stack:
  added: []
  patterns:
    - singleton-shared-module
    - module-scope-listener-lifecycle
    - writeBatch-fan-out
    - fire-and-forget-try-catch
    - click-outside-listener
    - isLocal-dev-gate
key_files:
  modified:
    - app/firebase.js
  created:
    - app/notifications.js
decisions:
  - "renderDropdownRows() exported (not just internal) for Plan 03 unit-testability"
  - "loadRecentForDropdown() kept internal (not exported) — only called by initNotifications and toggleNotificationsDropdown"
  - "formatRelativeTime() inlined in notifications.js (not added to utils.js) — only caller is this module at this phase; utils.js upgrade deferred to Plan 03/04 if history page also wants it"
  - "recentDocs kept as module-scope array (not refetched every badge update) — separate loadRecentForDropdown() called only on dropdown open to minimize reads"
  - "optimistic recentDocs cache update in markNotificationRead() for immediate UI feedback before listener fires"
metrics:
  duration_minutes: 4
  completed_date: "2026-04-30"
  tasks_completed: 2
  files_modified: 2
---

# Phase 83 Plan 02: Notifications Shared Module Summary

`app/notifications.js` — the shared notification module every other Phase 83 plan and Phase 84/87 trigger site consumes — created with full schema write, bell-listener lifecycle, dropdown render helpers, and dev test writer. `app/firebase.js` patched to re-export `startAfter` for Plan 04 cursor pagination.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Re-export `startAfter` from app/firebase.js | 8f979ff | app/firebase.js |
| 2 | Create app/notifications.js shared module | b354416 | app/notifications.js |

## Files Created / Modified

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `app/firebase.js` | Modified | 182 (+3) | Added `startAfter` to import, module export, window.firestore object |
| `app/notifications.js` | Created | 639 | Full shared module (verify-02-2.cjs: all checks pass) |

## Exported Symbols

| Symbol | Type | Description |
|--------|------|-------------|
| `NOTIFICATION_TYPES` | const (frozen object) | 9-key enum: MRF_APPROVED, MRF_REJECTED, PR_REVIEW_NEEDED, TR_REVIEW_NEEDED, RFP_REVIEW_NEEDED, PROJECT_STATUS_CHANGED, REGISTRATION_PENDING, PROPOSAL_SUBMITTED, PROPOSAL_DECIDED |
| `createNotification` | async function | Write one notification doc to 'notifications'. Throws on missing required fields; console.error + return null on Firestore failure. |
| `createNotificationForRoles` | async function | Fan-out via writeBatch to all active users with matching roles. Returns recipient count. |
| `initNotifications` | function | Attach bell-badge onSnapshot listener. Reveals #notifBellWrap. No-op if user inactive. |
| `destroyNotifications` | function | Unsubscribe listener, reset state, hide bell, close dropdown. Idempotent. |
| `toggleNotificationsDropdown` | function | Toggle .open on #notifDropdownMenu; fetches recent docs on open. |
| `markAllNotificationsRead` | async function | writeBatch update of all unread notifications for current user. Chunked 500-op batches. |
| `markNotificationRead` | async function | Single updateDoc for one notification. Optimistic cache update. Dropdown stays open. |
| `handleNotificationClick` | async function | Mark read → close dropdown → navigate via window.location.hash. |
| `renderDropdownRows` | function | Renders header + rows + footer into #notifDropdownRows (child node, not container — Pitfall 4). |

## Window-Registered Handlers (module-load registration)

All 6 registered immediately on module import (not lazily) — required because they are referenced from static `index.html` markup before any view loads:

- `window.toggleNotificationsDropdown`
- `window.handleNotificationClick`
- `window.markAllNotificationsRead`
- `window.markNotificationRead`
- `window.initNotifications`
- `window.destroyNotifications`

## Dev-Only Gate for `__createTestNotification`

```js
// Gated by isLocal (mirrors app/firebase.js:91-99 dev-banner pattern)
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (isLocal) {
    window.__createTestNotification = async (overrides = {}) => { ... };
    console.log('[Notifications] Dev mode: window.__createTestNotification() available');
}
```

**Not available in production** (Netlify hostname is neither `localhost` nor `127.0.0.1`).

## Verification Results

```json
{
  "exports-ok": true,
  "types-ok": true,
  "window-regs-ok": true,
  "isLocal-test-writer": true,
  "escapeHTML-used": true,
  "serverTimestamp-on-create": true,
  "addDoc-on-notifications-collection": true,
  "line-count": 640,
  "line-count-ok-(min-250)": true
}
```

Both files pass `node --check` (syntax valid). `verify-02-2.cjs` exits 0.

## Notes for Downstream Plans

### Note for Plan 03 (Bell UI / auth.js hooks)
`initNotifications` and `destroyNotifications` are now exported AND on `window`. Plan 03 hooks them into `app/auth.js` at these exact points (per Pattern 2 in 83-RESEARCH.md):
- **initNotifications hook:** inside `initAuthObserver`, first-snapshot active branch, AFTER `getIdToken(true)` and AFTER `updateNavForAuth(currentUser)` (~line 240)
- **destroyNotifications hook:** auth-state-cleared branch (~line 344-365), near `destroyPermissionsObserver()`
- **Also:** user-deactivated branch (lines 296-304), before `signOut(auth)` call

Use `if (window.initNotifications) window.initNotifications(currentUser)` form to stay decoupled (mirrors `window.getCurrentUser` pattern).

Plan 03 also owns: bell `<button>` markup in `index.html`, `#notifBellWrap` / `#notifBadge` / `#notifDropdownMenu` / `#notifDropdownRows` DOM structure, `.notif-*` CSS classes in `styles/components.css`, and routing `#/notifications` entry in `app/router.js`.

### Note for Plan 04 (History Page)
`startAfter` is now re-exported from `app/firebase.js`. Plan 04 history page can import it:
```js
import { db, collection, query, where, orderBy, limit, startAfter, getDocs } from '../firebase.js';
```

### Note for Plan 05 (UAT)
`window.__createTestNotification(overrides?)` is the dev writer for UAT. Available on localhost after login. Examples:
```js
// Default: MRF_APPROVED notification for current user
await window.__createTestNotification()

// Custom type and message
await window.__createTestNotification({
    type: 'MRF_REJECTED',
    message: 'MRF-2026-014 was rejected',
    link: '#/procurement/mrfs'
})

// Send to a specific user (requires their uid)
await window.__createTestNotification({ user_id: 'OTHER_USER_UID' })
```

## Pitfalls Addressed

| Pitfall | Resolution in This Module |
|---------|--------------------------|
| Pitfall 2 (listener lifecycle tied to wrong auth phase) | `initNotifications` is a function called by Plan 03 from auth.js AFTER `getIdToken(true)` — not from this module |
| Pitfall 3 (stale state across logout/re-login) | `destroyNotifications()` resets `bellListener=null`, `unreadDocs=[]`, `recentDocs=[]` and is idempotent |
| Pitfall 4 (dropdown re-render wipes open state) | `renderDropdownRows()` targets `#notifDropdownRows` (child node), never touches `#notifDropdownMenu` container |
| Pitfall 6 (actor self-notification loop) | `createNotificationForRoles` defaults `excludeActor: true`, filters `recipient.uid === actor?.uid` |
| Pitfall 7 (list rule without where clause) | All internal queries include `where('user_id', '==', user.uid)`; documented in JSDoc |

## Deviations from Plan

None — plan executed exactly as written. verify-02-2.cjs already existed on disk (created during phase planning) and was not overwritten. The `formatRelativeTime` helper was inlined in `notifications.js` rather than added to `utils.js` (no other current caller; Plan 04 can promote it to utils.js if the history page also wants relative time).

## Known Stubs

None — this plan creates infrastructure only. No UI rendered in this plan (Plan 03 owns the bell/dropdown markup). No data flows to any UI from this plan alone.

## Threat Flags

None — this plan adds no new network endpoints or auth paths beyond what Plan 01 (security rules) already addressed.

## Self-Check: PASSED

- `app/firebase.js` modified with 3 occurrences of `startAfter` — FOUND (`grep -c startAfter app/firebase.js` → 3)
- `app/notifications.js` created, 639 lines — FOUND
- `node --check app/notifications.js` exits 0 — VERIFIED
- `verify-02-2.cjs` exits 0 (all 8 shape checks pass) — VERIFIED
- Commit 8f979ff exists (firebase.js) — FOUND
- Commit b354416 exists (notifications.js) — FOUND
