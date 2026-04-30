---
name: 83-CONTEXT
description: Decisions for Phase 83 — Notification System Foundation. In-app notification plumbing (bell + badge in top nav, dropdown of last 10, full history page, mark-read flows, `notifications` Firestore collection + Security Rules) sized so Phase 84 can wire actual triggers without re-asking schema or UX questions.
type: phase-context
---

# Phase 83: Notification System Foundation - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **plumbing** for in-app notifications. After this phase, every active user sees a bell icon in the top nav with a real-time unread badge, can open a dropdown of the last 10 notifications, can navigate from a notification to its source record (deep link), can mark items read, and can browse the full paginated history. The `notifications` Firestore collection exists with locked schema and Security Rules deployed. No specific event triggers are wired in this phase — Phase 84 wires existing-event triggers (MRF approval, PR/TR/RFP review, project status, registration) and Phase 87 wires proposal-event triggers (NOTIF-09/10).

**In scope (NOTIF-01..06, NOTIF-13):**
- Bell icon + unread count badge in top nav (desktop and mobile, real-time via `onSnapshot`).
- Notification dropdown showing last 10 with type, message, source link, time.
- Click-row → navigate to source AND mark that notification read; close dropdown.
- "Mark all as read" button at top of dropdown (explicit action, only enabled when unreads > 0).
- Per-row mark-read affordance (NOTIF-04 — small checkmark / 'mark read' button on each row).
- Full notification history page at new top-level route `#/notifications` (paginated 20/page, cursor-based, includes read items).
- `notifications` Firestore collection with locked schema (see D-04..D-07).
- Firestore Security Rules deployed in same commit as the first `addDoc` to `notifications`.
- New shared module `app/notifications.js` exporting the `createNotification` / `createNotificationForRoles` helpers Phase 84 will consume — but Phase 83 only smoke-tests them via a dev-only writer (e.g., a hidden `window.__createTestNotification` callable from console). No production trigger is wired.

**Out of scope (deferred to Phase 84+):**
- Wiring actual triggers (MRF approval → notification, PR/TR/RFP review → notification, project status → notification, registration → notification — all Phase 84). Proposal-event triggers (NOTIF-09/10) — Phase 87.
- Email channel, browser push (FCM) — already explicit Out of Scope in REQUIREMENTS.
- User-configurable preferences (mute by type, digest mode) — NOTIF-FUT-03, deferred to v4.1+.
- Auto-cleanup / TTL of old notifications — deferred (see Deferred Ideas).
- Cascade-delete of notifications when source record is deleted — deferred (D-13: dead links handled at the destination view).
- Filters on the history page (by type, by read state, by date range) — Claude's discretion if cheap; otherwise defer.
- CSV export of notifications — not requested.
- Per-type role-based filtering rules ("only finance gets PR review notifications") — that's a Phase 84 concern (the trigger picks recipients); Phase 83 only enforces the per-user read/write rule.

</domain>

<decisions>
## Implementation Decisions

### Bell + Dropdown UX

- **D-01 — Bell placement (desktop):** Bell icon sits in the existing `nav-links` flex group **between the Admin dropdown trigger and the Log Out button**. The "utility cluster" naturally lives right of feature tabs.
- **D-02 — Bell placement (mobile, ≤768px):** Bell **stays in the top nav alongside the brand and hamburger** — always visible, badge readable at a glance. Hamburger sits to the bell's left. Bell is NOT folded into the mobile-nav-menu drawer. (This requires a small `top-nav-content` flex tweak to fit brand + bell + hamburger at narrow widths.)
- **D-03 — Click row behavior:** Clicking any notification row in the dropdown does **two things atomically**: (a) marks that notification read (`read=true`, `read_at=serverTimestamp()`), (b) navigates to the notification's source via `window.location.hash = doc.link`, (c) closes the dropdown. No separate "open" button per row. Modeled on Slack/Gmail/GitHub.
- **D-04 — Mark-all-as-read:** Explicit button at the top of the dropdown ("Mark all as read"). Only writes when clicked. Disabled when there are zero unreads. Performs a `writeBatch()` over all unread notifications for the current user. NOT auto-fired on dropdown open.

### Notifications Schema (collection: `notifications`)

- **D-05 — Required fields per doc:**
  - `user_id` (string, recipient uid — partition key)
  - `type` (string, drawn from locked enum below)
  - `message` (string, human-readable summary)
  - `link` (string, full hash route to navigate to — e.g. `#/procurement/records?mrf=MRF-2026-014`)
  - `source_collection` (string, e.g. `'mrfs'`, `'prs'`, `'pos'`, `'transport_requests'`, `'rfps'`, `'projects'`, `'services'`, `'users'`, `'proposals'` — for filterability and future analytics)
  - `source_id` (string, the human-readable id like `MRF-2026-014` OR Firestore doc id where applicable)
  - `actor_id` (string, uid of whoever triggered the event — auto-stamped by helper from `getCurrentUser().uid`; null if system-triggered)
  - `read` (bool, default `false`)
  - `read_at` (timestamp, default `null`, set when row flips to `read=true`)
  - `created_at` (timestamp, `serverTimestamp()` at create)
- **D-06 — Type taxonomy: locked enum** defined in `app/notifications.js` (e.g. `export const NOTIFICATION_TYPES = { MRF_APPROVED: 'MRF_APPROVED', MRF_REJECTED: 'MRF_REJECTED', PR_REVIEW_NEEDED: 'PR_REVIEW_NEEDED', TR_REVIEW_NEEDED: 'TR_REVIEW_NEEDED', RFP_REVIEW_NEEDED: 'RFP_REVIEW_NEEDED', PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED', REGISTRATION_PENDING: 'REGISTRATION_PENDING', PROPOSAL_SUBMITTED: 'PROPOSAL_SUBMITTED', PROPOSAL_DECIDED: 'PROPOSAL_DECIDED' };`). The `PROPOSAL_*` values are placeholders Phase 87 will use; Phase 83 ships them in the enum so the constants module isn't churned in Phase 87.
- **D-07 — Read state representation:** Boolean `read: false|true` + parallel `read_at: null|timestamp`. Default `read=false`, `read_at=null` on create. Allows the simple `where('read', '==', false)` query for unread badge counts.
- **D-08 — Multi-recipient persistence:** **One doc per recipient.** A fan-out (e.g. NOTIF-12 to all super_admins) writes N separate notification docs in a `writeBatch()`. Per-user mark-read remains trivially independent. Matches NOTIF-13 ("each user only reads/writes their own notifications") literally.

### History Page + Deep Links

- **D-09 — Route:** New top-level route **`#/notifications`** registered in `app/router.js`. NOT shown in the main top-nav links. Reachable from a "View all notifications" link at the bottom of the bell dropdown. Title `'Notifications | CLMC Operations'`.
- **D-10 — Pagination:** **Cursor-based** using Firestore `query(orderBy('created_at','desc'), where('user_id','==',uid), limit(20), startAfter(lastDoc))`. UI controls: "Newer" / "Older" buttons (no jump-to-page since cursors don't support arbitrary offsets). Show 20/page (NOTIF-06). Includes read items.
- **D-11 — Deep-link storage:** **Both** `link` (full hash route, used at click time) **and** `source_collection` + `source_id` (structured pointer, used for analytics / future filtering). Slight redundancy is intentional — matches the v3.2 denormalization philosophy and survives schema drift.
- **D-12 — Dead-link handling:** When a click navigates to a route whose source record was deleted (e.g., a Phase 82 deleted MRF), the **destination view's existing "Record not found" empty state handles it**. The notification still flips `read=true` on click. NO pre-flight `getDoc` check on the notification side. NO cascade-delete plumbing in this phase.

### Creation API (consumed by Phase 84+)

- **D-13 — Module location:** New shared module **`app/notifications.js`** alongside `app/proof-modal.js`, `app/expense-modal.js`, `app/edit-history.js`. Exports the helper functions, the bell-dropdown rendering helpers, the history-page render/init/destroy lifecycle, the `NOTIFICATION_TYPES` enum, and registers `window.toggleNotificationsDropdown`, `window.handleNotificationClick`, `window.markAllNotificationsRead` for onclick handlers.
- **D-14 — Primary helper signature:**
  ```js
  await createNotification({
    user_id,           // required (string, recipient uid)
    type,              // required (string, must be a NOTIFICATION_TYPES value)
    message,           // required (string)
    link,              // required (string, hash route)
    source_collection, // optional but strongly preferred (string)
    source_id,         // optional but strongly preferred (string)
  });
  ```
  Helper auto-stamps `created_at: serverTimestamp()`, `read: false`, `read_at: null`, `actor_id: getCurrentUser()?.uid ?? null`. Throws on missing required fields. Returns the new Firestore doc id (or void).
- **D-15 — Fan-out helper:**
  ```js
  await createNotificationForRoles({
    roles,             // required (array of role strings, e.g. ['super_admin'])
    type, message, link,
    source_collection, source_id,
    excludeActor: true // default true — don't notify the actor of their own action
  });
  ```
  Internally queries `users` where `role in roles AND status === 'active'`, then writes one doc per recipient via `writeBatch()` (atomic). Re-uses the same per-doc auto-stamping as `createNotification`.
- **D-16 — No dedupe in Phase 83.** Callers are responsible for firing on definitive events. If a regression surfaces double-firing, revisit in v4.1.

### Security Rules (NOTIF-13)

- **D-17 — Per-user read/update/delete:** `allow read, update, delete: if isActiveUser() && resource.data.user_id == request.auth.uid;` — every active user can ONLY touch their own notifications.
- **D-18 — Create: any active user can create.** `allow create: if isActiveUser() && request.resource.data.user_id is string && request.resource.data.type is string && request.resource.data.message is string && request.resource.data.link is string && request.resource.data.read == false && request.resource.data.actor_id == request.auth.uid;`
  - **Why:** triggers run client-side. The actor (e.g. an approver) writes a notification whose `user_id` is the *recipient*, not themselves. Strict "user_id == request.auth.uid" on create would block all triggers — and we have no Cloud Functions in this codebase.
  - **Required-field guards** (the `request.resource.data.* is string` clauses) ensure malformed docs can't slip through. `actor_id == request.auth.uid` prevents impersonation.
  - **Acceptable risk:** an active user could in principle spam any other user's feed. Mitigated by (a) all users being internally invitation-approved, (b) future Phase 84 triggers being the only production callers, (c) the `actor_id` audit field making spam attributable.
- **D-19 — Field-level update guard:** `allow update: ... && request.resource.data.user_id == resource.data.user_id && request.resource.data.type == resource.data.type && request.resource.data.created_at == resource.data.created_at && request.resource.data.actor_id == resource.data.actor_id;` — the only fields a user can flip on their own notification are `read` and `read_at`. Everything else is immutable post-create.
- **D-20 — Indexes:** Phase 83 adds Firestore composite index for `(user_id, created_at desc)` (history page query) and `(user_id, read, created_at desc)` (unread badge / mark-all queries). Indexes deploy in same commit as Security Rules.

### Claude's Discretion

- Per-type icon and color mapping for notification rows (e.g., MRF_APPROVED → green check, MRF_REJECTED → red X). Pick something visually consistent with existing status badges.
- Time format in dropdown rows: relative ("2h ago") vs absolute. Recommend relative with hover-tooltip showing absolute. Use `formatTimestamp` if it fits.
- Badge cap behavior (e.g., show `99+` once unread count > 99) — pick a reasonable cap.
- Empty state copy ("You're all caught up!" or similar) and dropdown width.
- Dropdown positioning math (right-align with bell, max-height with scroll, mobile full-width takeover at ≤768px).
- Whether to add a "Filter: All / Unread" toggle inside the dropdown — only if cheap; otherwise defer.
- Whether the history page surfaces simple filters (read state, type) — only if cheap; otherwise defer.
- Whether to add a `console.warn` when `createNotification` is called with a `type` not in `NOTIFICATION_TYPES`.
- Test/dev plumbing: a hidden `window.__createTestNotification(args)` for verifying the bell badge updates in real time without Phase 84 triggers.

### Folded Todos
*(none — `todo match-phase 83` returned 0 matches)*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (mandatory)
- `CLAUDE.md` — SPA Patterns section (view module structure, Firebase Listener Management, Window Functions for Event Handlers, Hash-Based Routing — Tab Navigation, Status Matching case-sensitivity, Add New View checklist including the **"Add Security Rules first"** step), Firebase Firestore Schema section (where the new `notifications` collection's schema entry will be added in the same commit).
- `.planning/PROJECT.md` — Current Milestone v4.0 description (this is portal-transformation work, not procurement-feature work), Out of Scope (email/push deferred), Constraints (Firebase-only, no build, no Cloud Functions).
- `.planning/REQUIREMENTS.md` — NOTIF-01..06, NOTIF-13 (the seven Phase 83 reqs); Future requirements section (NOTIF-FUT-03 user prefs, NOTIF-FUT-01 email, NOTIF-FUT-02 FCM — confirm they're explicitly Out of Scope here).
- `.planning/ROADMAP.md` — Phase 83 success criteria; Phase 84 success criteria (so plumbing is sized correctly for the trigger surface that follows); Phase 87 dependency on Phase 83 (proposal events ride this same plumbing).
- `.planning/STATE.md` — Blockers/Concerns (notifications schema + Security Rules locked before bell-UI work).

### Existing code patterns (reusable)
- `app/router.js` — Hash route registration shape (will add `/notifications` entry here); permission map (`routePermissionMap` — `/notifications` should map to `'dashboard'` or its own neutral key since every active user has access).
- `app/auth.js:177` — `getCurrentUser()` definition; `app/auth.js:541` — `window.getCurrentUser` registration (used by helper to stamp `actor_id`).
- `app/utils.js` — `formatTimestamp` (use for time format on rows), `showToast` (used for "Marked as read" feedback if any).
- `app/edit-history.js` — Closest precedent for a shared module that bridges Firestore writes + UI rendering. Mirrors the kind of module structure `app/notifications.js` should adopt.
- `app/proof-modal.js` — Shared module exporting render helpers + `window.*` registrations + opening API. Same shape blueprint.
- `app/components.js` — `createCard` / `createModal` / `openModal` / `closeModal` / `createStatusBadge` / `createUrgencyBadge`. Reuse for the dropdown card and any badge-like elements. Note: there is no nav-icon-with-badge primitive yet — Phase 83 may add one (e.g., `createNavBadge({ count })`) here if reused for the mobile menu.
- `firestore.rules:6-39` — **MANDATORY** "ADDING NEW COLLECTIONS" template. Phase 83 must follow this exactly when adding the `notifications` rules block. The template explicitly warns: without rules, even Super Admin is blocked.
- `firestore.rules:46-89` — Helper functions (`isSignedIn`, `getUserData`, `isActiveUser`, `hasRole`, `isRole`). Phase 83 reuses `isActiveUser()` (D-17) and may need a new helper `function isOwnNotification() { return resource.data.user_id == request.auth.uid; }` for clarity.

### Existing UI integration points
- `index.html:22-58` — Top nav structure where the bell button + badge will be inserted (between Admin dropdown at line 45-52 and `logoutBtn` at line 53-55). Mirrors the existing `nav-dropdown` markup pattern.
- `index.html:61-78` — Mobile nav menu (drawer). Bell will NOT live here per D-02; it stays in the top nav even on mobile.
- `index.html:103-` — Existing inline scripts (`toggleAdminDropdown`, `setAdminSection`, `mobileNavClick`, etc.) are the precedent for `toggleNotificationsDropdown`. Keep dropdown-toggle inline scripts in `index.html` only if they need to fire before any view module loads; otherwise put them in `app/notifications.js` and register on `window` from there.
- `styles/components.css` — Pagination styles (`.pagination-container`, `.pagination-btn`, `.pagination-info`) for the history page; Modal styles for any per-row "delete this notification" if added (likely not Phase 83). Add new `.notif-bell`, `.notif-badge`, `.notif-dropdown`, `.notif-row`, `.notif-row--unread` classes here.
- `styles/views.css` — `top-nav` and `nav-link` rules (the bell needs to fit the existing flex layout and breakpoints). New `notifications-page` view-specific styles also belong here.

### Reference implementation patterns from prior phases
- Phase 47 (Sortable Headers, downloadCSV utility) and Phase 48 (TTL caching, persistentLocalCache) — for the v3.2 conventions on real-time listener management and `destroy()` cleanup. Bell-dropdown listener attaches in a small lifecycle init that runs once when the user is authenticated; lives in `app/notifications.js` and is invoked from `app/auth.js` after login (NOT inside any view's `init()`, since the bell persists across views).
- Phase 78 (Clientless Project Creation — backfill cascade with confirmation modal) — for the pattern on `writeBatch()` use in fan-out (D-15) and structured `source_id` field (D-11).
- Phase 82 (Delete Rejected MRFs cascade) — for the cascade-on-delete pattern that Phase 83 explicitly does NOT follow (D-12); referenced so the planner knows the precedent and the deliberate departure.
- `.planning/phases/82-add-delete-button-for-rejected-mrfs-to-enable-cleanup-like-rejected-trs/82-CONTEXT.md` — recent CONTEXT.md template for output structure (frontmatter, sections, level of detail).

### Future-aware (Phase 84/87 will read this CONTEXT)
- Phase 84 will call `createNotification` (D-14) and `createNotificationForRoles` (D-15) from existing event sites: MRF approve/reject (in `procurement.js`), PR/TR/RFP review-needed events (in `finance.js`), project status change (in `projects.js` / `services.js` / `project-detail.js` / `service-detail.js`), registration approval queue surface (in admin views).
- Phase 87 will reuse the same helpers for `PROPOSAL_SUBMITTED` and `PROPOSAL_DECIDED` types (already in the locked enum per D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`getCurrentUser()`** (`app/auth.js:177`, `window.getCurrentUser`) — used by the helper to stamp `actor_id` on every notification create.
- **`onSnapshot` lifecycle pattern** (CLAUDE.md → Firebase Listener Management) — bell badge listener follows this. Listener stored in module scope; cleanup on logout (NOT on view destroy, since the bell persists across views).
- **Hash-based routing with sub-routes** (CLAUDE.md → Hash-Based Routing) — `#/notifications` is a top-level route with no sub-tabs. Router DOES call `destroy()` when navigating away from this view to a different view.
- **`createCard` / `openModal` / `createStatusBadge`** (`app/components.js`) — building blocks for the dropdown card and any per-row visuals.
- **`formatTimestamp`** (`app/utils.js`) — relative time formatting for notification rows.
- **`writeBatch`** (Firestore SDK) — used for fan-out (D-15) and "Mark all as read" (D-04).
- **Pagination CSS classes** (`styles/components.css` — `.pagination-container`, `.pagination-btn`, `.pagination-info`) — re-used for cursor-based pagination on the history page.
- **Existing `nav-dropdown` markup** (`index.html:45-52`, the Admin dropdown) — visual precedent for the bell dropdown trigger + menu structure.

### Established Patterns
- **Window functions for `onclick` handlers** — every onclick must point to a `window.fnName` (CLAUDE.md). Phase 83 registers `window.toggleNotificationsDropdown`, `window.handleNotificationClick`, `window.markAllNotificationsRead`, `window.markNotificationRead` from `app/notifications.js` immediately on module load.
- **Field-level Security Rule guards** (`firestore.rules:6-39` template; existing collections like `prs`, `pos`) — Phase 83's update rule (D-19) follows this shape: pin all immutable fields with `request.resource.data.X == resource.data.X`.
- **Real-time listeners + `destroy()` cleanup** — `notifications` listeners live in module-scope arrays; logout flow must call a single `destroyNotifications()` from `app/notifications.js` that unsubscribes everything.
- **Denormalization for performance** — `source_collection` + `source_id` + `actor_id` (D-05) follow v3.2's "denormalize on write so reads stay fast" pattern.
- **Composite indexes deploy in the same commit as the rules** (CLAUDE.md → Add New View / Phase 11 lesson). Phase 83's `firestore.indexes.json` (or equivalent) update lands in the same commit as the rules.

### Integration Points
- **`index.html`** — bell button + badge inserted between Admin dropdown and `logoutBtn` (line ~52); top-nav flex layout adjustment for mobile (D-02).
- **`app/router.js`** — register `'/notifications'` route entry (matches the shape of existing entries at lines 31-101); add `'/notifications'` to `routePermissionMap` (probably `'dashboard'` or a new key like `'notifications'` with no permission required since every active user gets access).
- **`app/auth.js`** — after login, call `initNotifications(user)` exported from `app/notifications.js` so the bell-badge listener attaches as soon as auth state is known. On logout, call `destroyNotifications()`.
- **`firestore.rules`** — new `match /notifications/{docId}` block following the file's stated template (lines 6-39). Indexes file (where Firestore composite indexes live) updated for `(user_id, created_at desc)` and `(user_id, read, created_at desc)`.
- **`styles/components.css`** + **`styles/views.css`** — split: shared bell/badge/dropdown styles in components.css; history-page layout in views.css.

### What Does NOT Exist Yet (Greenfield)
- No prior bell, badge, dropdown-with-list, or notifications view. Clean slate.
- No prior `notifications` collection. Schema is set in this phase and must not drift in Phase 84/87.
- No nav-icon-with-badge primitive in `app/components.js`. Phase 83 may introduce one if reused for the mobile menu.

</code_context>

<specifics>
## Specific Ideas

- **Mirror the Admin dropdown's CSS shape** for the bell dropdown structure (`.nav-dropdown`, `.nav-dropdown-trigger`, `.nav-dropdown-menu`, `.open` toggle class). Don't reuse the same CSS classes — create a parallel set (`.notif-dropdown`, etc.) so the visual styles can diverge later (the bell dropdown is wider, has rows with icons, has a footer link to the history page).
- **The user-visible language is "Notifications"** in the route title, history page header, and dropdown header. NOT "Alerts" or "Inbox" or "Activity".
- **The dev-only writer** (`window.__createTestNotification`) should be wired only in development (or behind a Super Admin gate) so production users can't trigger arbitrary notifications. Useful during Phase 83 verification when no Phase 84 triggers exist yet.
- **The "Mark all as read" button uses a `writeBatch()`** scoped to the current user's unread notifications — atomic update. If the user has many unreads (>500 in a single batch), batch-chunk; in practice this is unlikely in v4.0.
- **Real-time bell badge listener** queries `where('user_id', '==', uid)` AND `where('read', '==', false)` AND `orderBy('created_at', 'desc')` AND `limit(11)` (to support both "show 10 in dropdown" + "show 99+ if more than 10 unread" — actually we need a separate count query OR rely on the `limit(11)` trick: if results.length === 11, render the badge as "10+"; if < 11, show the actual count). Pick whichever is simpler.
- **The history page must NOT live behind any nav link** — it's only entered via the dropdown's "View all" link. This keeps the top nav uncluttered and matches the requirement that the bell + dropdown are the primary surface (NOTIF-01, NOTIF-02).
- **Don't add a per-user notification settings UI in Phase 83.** That's NOTIF-FUT-03, deferred to v4.1+.

</specifics>

<deferred>
## Deferred Ideas

- **Filters on the history page** (by type / read state / date range) — only add if cheap; otherwise defer. Not in NOTIF-06.
- **CSV export of notifications** — not requested by any NOTIF requirement.
- **Per-user notification preferences (mute by type, digest mode)** — explicitly NOTIF-FUT-03 in REQUIREMENTS.md, deferred to v4.1+.
- **Email channel / browser push (FCM)** — explicitly Out of Scope per PROJECT.md and REQUIREMENTS.md.
- **Auto-cleanup / TTL of old notifications** — not addressed in Phase 83. If users accumulate years of read notifications, we revisit (v4.1+ candidate).
- **Cascade-delete of notifications when source record is deleted** — D-13 explicitly chooses destination-view's empty state over cascade plumbing. If dead links become a UX problem, revisit.
- **Pre-flight `getDoc` check before navigating from a notification** — D-13 rejects this for now to avoid one read per click.
- **Dedupe in the helper** — D-16 punts to v4.1 if pain emerges.
- **`createNotificationForUsers({ user_ids })`** (raw user-id list helper) — not needed for Phase 83/84; Phase 87 may want it for project-assignee fan-out (NOTIF-11 already in Phase 84's scope, handled by the role+assignment lookup). Add then if needed.
- **A nav-icon-with-badge primitive in `app/components.js`** — only extract if it's reused (e.g., if a future phase adds a second badged nav icon).
- **Bell badge animation / sound on new notification** — not requested.

### Reviewed Todos (not folded)
*(none — `todo match-phase 83` returned 0 matches)*

</deferred>

---

*Phase: 83-notification-system-foundation*
*Context gathered: 2026-04-29*
