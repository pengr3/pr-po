# Phase 83: Notification System Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-29
**Phase:** 83-notification-system-foundation
**Areas discussed:** Bell + dropdown UX, Notifications schema + types, History page + deep links, Creation API for Phase 84

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Bell + dropdown UX | Bell placement, badge style, dropdown behavior, click-row + mark-read, mark-all-read, empty state | ✓ |
| Notifications schema + types | Doc fields, type taxonomy (free string vs locked enum), read state, multi-recipient persistence | ✓ |
| History page + deep links | History route, pagination strategy, deep-link storage, dead-link handling | ✓ |
| Creation API for Phase 84 | Helper module location, primary signature, fan-out helper, dedupe approach | ✓ |

**User's choice:** All four areas selected.

---

## Bell + dropdown UX

### Q1 — Bell placement (desktop)

| Option | Description | Selected |
|--------|-------------|----------|
| Right of Admin, left of Logout (Recommended) | Sits in the nav-links flex group between Admin dropdown and Log Out. Most natural visual flow — utility cluster right of feature tabs. | ✓ |
| Far right, after Logout | Bell becomes the last element. Slightly unconventional. | |
| Inside the Admin dropdown menu only | No top-level bell; lowest discoverability — contradicts NOTIF-01. | |

**User's choice:** Right of Admin, left of Logout (Recommended)

### Q2 — Mobile bell (≤768px)

| Option | Description | Selected |
|--------|-------------|----------|
| Bell stays in top nav, hamburger to its left (Recommended) | Always visible on mobile alongside brand + hamburger. Matches Gmail/Slack mobile-web pattern. | ✓ |
| Bell hidden behind hamburger, appears as a row inside mobile-nav-menu | Loses real-time visibility of unread count. | |
| Bell + an additional 'last seen' indicator on hamburger | Compromise — ambient indicator + detailed view on tap. | |

**User's choice:** Bell stays in top nav, hamburger to its left (Recommended)

### Q3 — Click row behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate to source AND mark that notification read (Recommended) | Single action — clicking a notification clearly indicates "I saw this". Slack/Gmail/GitHub pattern. | ✓ |
| Navigate only; explicit per-row checkmark to mark read | More explicit, more friction. | |
| Mark read only; navigation requires a separate 'Open' button | Decouples actions; heavier UI per row. | |

**User's choice:** Navigate to source AND mark that notification read (Recommended)

### Q4 — Mark-all-as-read

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit button at top of dropdown, only writes when clicked (Recommended) | User decides when to clear unreads; doesn't lose them by accidentally opening the bell. Slack/GitHub pattern. | ✓ |
| Auto-mark-all-as-read on dropdown open | Aggressive — risk of users missing items. | |
| No bulk button — only per-row mark-read | Violates NOTIF-05. | |

**User's choice:** Explicit button at top of dropdown, only writes when clicked (Recommended)

**Notes:** All four answers took the recommended option. User opted to skip deeper-dive questions on badge style, time format, and per-row icons — left to Claude's discretion.

---

## Notifications schema + types

### Q1 — Doc fields beyond NOTIF-13 minimum

| Option | Description | Selected |
|--------|-------------|----------|
| Add source_collection + source_id + actor_id (Recommended) | Structured source pointer plus actor uid. Enables filtering/analytics later, mirrors v3.2 denormalization. | ✓ |
| Just NOTIF-13 minimum + actor_id | Skip source_collection/source_id; rely on link string. Lighter. | |
| Full kitchen sink: source + actor + data + priority | Adds free-form data blob and priority. Over-engineered for v4.0. | |

**User's choice:** Add source_collection + source_id + actor_id (Recommended)

### Q2 — Type taxonomy

| Option | Description | Selected |
|--------|-------------|----------|
| Locked enum defined now in a constants module (Recommended) | Exhaustive list including PROPOSAL_* placeholders for Phase 87. Prevents Phase 84/87 typos. | ✓ |
| Free string — any value the trigger writes | Cheapest now, gets messy by Phase 87. Risks divergence. | |
| Free string + a separate icon/style mapping table | Hybrid; worst of both. | |

**User's choice:** Locked enum defined now in a constants module (Recommended)

### Q3 — Read state representation

| Option | Description | Selected |
|--------|-------------|----------|
| Boolean `read: false|true` + `read_at: timestamp` (Recommended) | Simple bool for queries, parallel timestamp for analytics/audit. | ✓ |
| Just `read: false|true` | Simplest, no read-time analytics. | |
| `read_at: null|timestamp` only (presence implies state) | Saves one field but breaks the simple where-clause. | |

**User's choice:** Boolean `read: false|true` + `read_at: timestamp` (Recommended)

### Q4 — Multi-recipient persistence

| Option | Description | Selected |
|--------|-------------|----------|
| One doc per recipient (Recommended) | Per-user mark-read trivially independent. Matches NOTIF-13 literally. | ✓ |
| One doc with recipients array; per-user read state in a sub-map | Cheaper writes, more complex Security Rules. | |
| Defer the question | Bad — Security Rules ship in this phase. | |

**User's choice:** One doc per recipient (Recommended)

**Notes:** All four recommended. Exact enum string list left to Claude's discretion within the placeholder set provided.

---

## History page + deep links

### Q1 — History page route

| Option | Description | Selected |
|--------|-------------|----------|
| New top-level route `#/notifications` (Recommended) | Reachable from "View all" link in dropdown. Matches existing routing pattern. NOT in main top nav. | ✓ |
| Sub-route under admin: `#/admin/notifications` | Wrong fit — admin is super-admin tooling. | |
| Inline panel that slides out from the bell (no route change) | Loses deep-linkability. | |

**User's choice:** New top-level route `#/notifications` (Recommended)

### Q2 — Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor-based with `startAfter()` (Recommended) | Firestore-native, scales. Older/Newer buttons. Matches v3.2 PO Payment Summary. | ✓ |
| Client-side offset slicing (load all, slice 20) | Simpler, but degrades if retention isn't enforced. | |
| Client-side offset slicing + 90-day TTL on docs | Combines simplicity + safety; adds operational concern. | |

**User's choice:** Cursor-based with `startAfter()` (Recommended)

### Q3 — Deep-link storage

| Option | Description | Selected |
|--------|-------------|----------|
| Store both `link` AND `source_collection` + `source_id` (Recommended) | Belt-and-suspenders. Matches v3.2 denormalization philosophy. | ✓ |
| Only `link` (full hash route) | Lightest; loses structured filterability; routes-change risk. | |
| Only structured (`source_collection`, `source_id`) — build link at click | Cleanest; ties UX to a route map that must stay correct. | |

**User's choice:** Store both `link` AND `source_collection` + `source_id` (Recommended)

### Q4 — Dead-link handling

| Option | Description | Selected |
|--------|-------------|----------|
| Click navigates; destination view shows 'Record not found' empty state (Recommended) | Notification still marks read; leverages existing patterns. | ✓ |
| Pre-flight check before navigation; toast if missing | Adds a Firestore read per click. | |
| Cascade-delete notifications when source record is deleted | Cleanest but expensive cross-cutting change. | |

**User's choice:** Click navigates; destination view shows 'Record not found' empty state (Recommended)

**Notes:** All recommended. User declined deeper-dive on history-page filters; deferred as out of scope.

---

## Creation API for Phase 84

### Q1 — Helper module location

| Option | Description | Selected |
|--------|-------------|----------|
| New `app/notifications.js` shared module (Recommended) | Mirrors v3.2 `proof-modal.js`, `expense-modal.js`, `edit-history.js` pattern. | ✓ |
| Add functions to existing `app/utils.js` | utils.js already 381 lines; bloat + SRP violation. | |
| View module only, helpers added to whichever view emits | Worst for maintainability — code duplication. | |

**User's choice:** New `app/notifications.js` shared module (Recommended)

### Q2 — Primary helper signature

| Option | Description | Selected |
|--------|-------------|----------|
| `createNotification({ user_id, type, message, link, source_collection?, source_id? })` (Recommended) | Single-recipient. Object-arg destructure (codebase convention). Auto-stamps timestamps and actor. | ✓ |
| Two parallel helpers — `notifyUser()` and `notifyEvent()` | More magic, more surface area. | |
| Positional args | Rejected by codebase convention. | |

**User's choice:** `createNotification({ ... })` (Recommended)

### Q3 — Fan-out helper

| Option | Description | Selected |
|--------|-------------|----------|
| `createNotificationForRoles({ roles, type, message, link, source_* })` (Recommended) | Helper queries users by role + active, writes via writeBatch. | ✓ |
| `createNotificationForUsers({ user_ids, ... })` only | Simpler module, harder caller; DRY violation. | |
| Both helpers (forRoles AND forUsers) | Maximum flexibility; uncertain need now. | |

**User's choice:** `createNotificationForRoles` (Recommended)

### Q4 — Dedupe approach

| Option | Description | Selected |
|--------|-------------|----------|
| No dedupe in Phase 83 — callers responsible (Recommended) | Triggers fire on definitive events; defer dedupe to v4.1 if pain emerges. | ✓ |
| Best-effort dedupe by (user_id, type, source_id) within last 60s | Safety net at cost of one read per write. | |
| Deterministic doc id derived from (user_id, type, source_id) — setDoc | Strongest dedupe; risks blowing away `read_at` on re-fire. | |

**User's choice:** No dedupe in Phase 83 — callers responsible (Recommended)

**Notes:** All four recommended.

---

## Claude's Discretion

User explicitly deferred the following to Claude's judgment:
- Per-type icon and color mapping for notification rows.
- Time format (relative vs absolute) — recommendation: relative with hover-tooltip.
- Badge cap behavior (e.g., "99+" once unread > 99).
- Empty state copy and dropdown width.
- Dropdown positioning math and mobile takeover behavior.
- Whether to add a "Filter: All / Unread" toggle inside the dropdown.
- Whether the history page surfaces simple filters.
- Whether to `console.warn` on unknown `type` values.
- Test/dev plumbing (`window.__createTestNotification`).
- Exact enum string list (within the placeholder set provided in D-06).

## Deferred Ideas

- Filters on the history page (by type / read state / date range).
- CSV export of notifications.
- Per-user notification preferences (NOTIF-FUT-03 — v4.1+).
- Email channel / browser push (FCM) — already explicit Out of Scope.
- Auto-cleanup / TTL of old notifications.
- Cascade-delete of notifications when source record is deleted.
- Pre-flight `getDoc` check before navigating from a notification.
- Dedupe in the helper.
- `createNotificationForUsers({ user_ids })` raw user-id list helper.
- A nav-icon-with-badge primitive in `app/components.js`.
- Bell badge animation / sound on new notification.
