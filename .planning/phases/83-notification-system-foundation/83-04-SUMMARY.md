---
phase: 83-notification-system-foundation
plan: "04"
subsystem: notifications-history-page
tags: [notifications, firestore, cursor-pagination, router, NOTIF-06, NOTIF-03]
dependency_graph:
  requires:
    - notifications-shared-module
    - bell-listener-lifecycle
    - window-registered-handlers
    - bell-markup-in-dom
  provides:
    - notifications-history-page-view
    - notifications-route-registered
  affects:
    - app/views/notifications.js
    - app/router.js
tech_stack:
  added: []
  patterns:
    - cursor-based-pagination-with-stack
    - spa-view-module-contract
    - one-shot-getDocs-no-listener
key_files:
  created:
    - app/views/notifications.js
  modified:
    - app/router.js
key_decisions:
  - "Newer navigation uses O(N) re-walk from page 1 (not a backwards cursor query) — Firestore startAfter doesn't go backward in desc order; tradeoff documented verbatim in loadNewerPage() per D-10/MINOR-9"
  - "/notifications maps to 'dashboard' permission key (same neutral gate as '/') — all active users can reach history page without a separate permission"
  - "View uses one-shot getDocs (not onSnapshot) — history page doesn't need real-time updates; listener array kept empty for destroy() compatibility"
  - "Relative timestamps inlined in notifications.js (not promoted to utils.js) — only caller at this phase; utils.js upgrade deferred to v4.1 if other views need it"
requirements-completed: [NOTIF-06, NOTIF-03]
duration: 2min
completed: "2026-04-30"
---

# Phase 83 Plan 04: Notifications History Page + Router Registration Summary

**Cursor-paginated 20/page notifications history view at `#/notifications` with Newer/Older controls, registered in `app/router.js` with `'dashboard'` permission gate — both read and unread items visible.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-30T03:42:24Z
- **Completed:** 2026-04-30T03:44:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `app/views/notifications.js` created (382 lines) — full SPA view module with render/init/destroy, cursor-paginated 20/page, includes read and unread items
- `app/router.js` updated — `/notifications` registered in both `routePermissionMap` and `routes` map; lazy-loads history view on hash navigation
- Defensive runtime check fires `console.error` when `window.handleNotificationClick` is missing (BLOCKER-3 cascade guard, MAJOR-6)
- O(N) Firestore reads cost comment verbatim in `loadNewerPage()` body (MINOR-9 / D-10)
- All 14 verify-04-1.cjs shape checks pass (exits 0)

## Task Commits

1. **Task 1: Create app/views/notifications.js** - `57e1c9a` (feat)
2. **Task 2: Register /notifications route in app/router.js** - `6a3bccc` (feat)

## Files Created / Modified

| File | Action | Lines (after) | Notes |
|------|--------|---------------|-------|
| `app/views/notifications.js` | Created | 382 | Full history page view module (verify-04-1.cjs: all 14 checks pass) |
| `app/router.js` | Modified | 468 (+9) | `/notifications` added to routePermissionMap (line ~21) and routes map (line ~103) |

## Route Registration Details

### routePermissionMap entry (app/router.js line ~21)
```js
// Every active user has access to notifications — no role gate needed.
// Maps to 'dashboard' (same neutral key as '/') so the existing auth+active check applies.
'/notifications': 'dashboard'
```

### routes map entry (app/router.js line ~103)
```js
'/notifications': {
    name: 'Notifications',
    load: () => import('./views/notifications.js'),
    title: 'Notifications | CLMC Operations'
}
```

No `defaultTab` — the history page has no sub-tabs (D-09).

## Cursor Pagination Tradeoff — D-10

The Newer button navigation cannot use a single Firestore backward query because `startAfter` in `orderBy('created_at', 'desc')` order only goes toward older items. The implemented approach maintains a `cursorStack[]` of "first doc cursors" for visited pages, and when navigating Newer, it re-queries from page 1 and walks forward to the target depth.

**Verbatim D-10 cost comment shipped in `loadNewerPage()` body:**

```js
// O(N) Firestore reads tradeoff per D-10:
//   Firestore startAfter doesn't go backward in `orderBy desc` order, so the
//   "Newer" navigation cannot use a single backwards query. Instead we re-query
//   from page 1 and walk forward via stored cursors. This costs O(targetPage)
//   reads each time the user clicks Newer — e.g., on page 5 → 4 it costs ~4
//   page-loads (~80 doc reads). Acceptable because (a) history is rarely paged
//   deeply, (b) v4.0 has no per-doc read budget concerns at expected volumes,
//   (c) a backwards cursor would require a parallel ASC-order index. Revisit
//   if usage analytics show users routinely paging beyond page 10.
```

## Defensive Runtime Check (BLOCKER-3 Guard)

`init()` contains the following check that fires immediately when the page loads:

```js
if (!window.handleNotificationClick) {
    console.error('[Notifications view] notifications.js not loaded — onclick handlers will fail');
}
```

If Plan 03 Task 3's static import of `notifications.js` were ever removed from `index.html`, every row `onclick` would silently fail. This `console.error` surfaces the regression within 2 seconds during smoke testing.

## Note for Plan 05 (UAT)

UAT script for NOTIF-06:
1. Seed ≥25 notifications mixing read/unread via `window.__createTestNotification()` in DevTools console (repeat 25+ times with varied `type` values)
2. Click bell → "View all notifications" footer link
3. Verify URL hash changes to `#/notifications`
4. Verify 20 rows shown, "Older" button enabled, "Newer" button disabled (page 1)
5. Click Older → next page of older rows, "Newer" now enabled
6. Verify both `read: true` and `read: false` items appear (NOT filtered to unread only)
7. Click a row → verify `window.handleNotificationClick` fires (navigates to source, marks read)
8. Verify page title in browser tab reads "Notifications | CLMC Operations"

## Decisions Made

- Newer navigation uses O(N) re-walk from page 1 — Firestore `startAfter` in `desc` order cannot go backward; a backwards query would require a separate ASC-order composite index. Cost bounded by user pagination depth, not data size. Documented verbatim per D-10/MINOR-9.
- `/notifications` maps to `'dashboard'` permission key — every active user can reach the history page without a separate RBAC key. Same gate as the home page (`/`).
- View uses one-shot `getDocs` (not `onSnapshot`) — history page content doesn't need live updates; `listeners[]` kept empty for SPA `destroy()` pattern compatibility.

## Deviations from Plan

None — plan executed exactly as written. verify-04-1.cjs was already on disk from planning phase. All 14 checks pass. Both files pass `node --check`.

## Known Stubs

None — history page renders real Firestore data. All Firestore queries scoped by `user_id` (Pitfall 7). `escapeHTML` applied to all message/id text. Row click delegates to `window.handleNotificationClick` (Plan 02) which atomically marks-read + navigates (NOTIF-03 satisfied on history surface).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema changes. The `/notifications` route inherits the existing router auth/active guard. All Firestore queries are user-partitioned by `where('user_id', '==', uid)`.

## Self-Check: PASSED

- `app/views/notifications.js` exists at 382 lines — FOUND
- `node --check app/views/notifications.js` exits 0 — VERIFIED
- `node .planning/phases/83-notification-system-foundation/verify-04-1.cjs` exits 0 — VERIFIED (all 14 checks)
- `app/router.js` contains `'/notifications': 'dashboard'` — FOUND (grep returns 1)
- `app/router.js` contains `'/notifications': {` — FOUND (grep returns 1)
- `app/router.js` contains `import('./views/notifications.js')` — FOUND (grep returns 1)
- `/notifications` NOT in `publicRoutes` — CONFIRMED (grep returns 0)
- Commit 57e1c9a exists (notifications.js) — FOUND
- Commit 6a3bccc exists (router.js) — FOUND

---
*Phase: 83-notification-system-foundation*
*Completed: 2026-04-30*
