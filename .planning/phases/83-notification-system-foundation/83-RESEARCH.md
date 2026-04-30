# Phase 83: Notification System Foundation - Research

**Researched:** 2026-04-29
**Domain:** In-app notification plumbing (Firestore-backed bell + dropdown + history page) for a vanilla-JS Firebase SPA
**Confidence:** HIGH (CONTEXT.md decisions are locked; research role is verification + pitfall surfacing, not rediscovery)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Bell + Dropdown UX:**
- **D-01 — Bell placement (desktop):** Bell icon sits in the existing `nav-links` flex group between the Admin dropdown trigger and the Log Out button.
- **D-02 — Bell placement (mobile, ≤768px):** Bell stays in the top nav alongside the brand and hamburger — always visible, badge readable at a glance. Hamburger sits to the bell's left. Bell is NOT folded into the mobile-nav-menu drawer. (This requires a small `top-nav-content` flex tweak to fit brand + bell + hamburger at narrow widths.)
- **D-03 — Click row behavior:** Clicking any notification row in the dropdown does three things atomically: (a) marks that notification read (`read=true`, `read_at=serverTimestamp()`), (b) navigates to the notification's source via `window.location.hash = doc.link`, (c) closes the dropdown. No separate "open" button per row.
- **D-04 — Mark-all-as-read:** Explicit button at the top of the dropdown ("Mark all as read"). Only writes when clicked. Disabled when there are zero unreads. Performs a `writeBatch()` over all unread notifications for the current user. NOT auto-fired on dropdown open.

**Notifications Schema (collection: `notifications`):**
- **D-05 — Required fields per doc:** `user_id`, `type`, `message`, `link`, `source_collection`, `source_id`, `actor_id`, `read` (bool, default false), `read_at` (timestamp, default null), `created_at` (serverTimestamp at create).
- **D-06 — Type taxonomy: locked enum** in `app/notifications.js` exports `NOTIFICATION_TYPES` containing: `MRF_APPROVED`, `MRF_REJECTED`, `PR_REVIEW_NEEDED`, `TR_REVIEW_NEEDED`, `RFP_REVIEW_NEEDED`, `PROJECT_STATUS_CHANGED`, `REGISTRATION_PENDING`, `PROPOSAL_SUBMITTED`, `PROPOSAL_DECIDED`. The `PROPOSAL_*` values are placeholders Phase 87 will use.
- **D-07 — Read state representation:** Boolean `read: false|true` + parallel `read_at: null|timestamp`.
- **D-08 — Multi-recipient persistence:** **One doc per recipient.** A fan-out (e.g. NOTIF-12 to all super_admins) writes N separate notification docs in a `writeBatch()`.

**History Page + Deep Links:**
- **D-09 — Route:** New top-level route `#/notifications` in `app/router.js`. NOT shown in the main top-nav links. Reachable from "View all notifications" link at the bottom of the bell dropdown. Title `'Notifications | CLMC Operations'`.
- **D-10 — Pagination:** Cursor-based using Firestore `query(orderBy('created_at','desc'), where('user_id','==',uid), limit(20), startAfter(lastDoc))`. UI: "Newer" / "Older" buttons. 20/page.
- **D-11 — Deep-link storage:** Both `link` (full hash route) AND `source_collection` + `source_id` (structured pointer).
- **D-12 — Dead-link handling:** Destination view's existing "Record not found" empty state handles dead links. The notification still flips `read=true` on click. NO pre-flight `getDoc` check on the notification side. NO cascade-delete plumbing.

**Creation API:**
- **D-13 — Module location:** New shared module `app/notifications.js` alongside `app/proof-modal.js`, `app/expense-modal.js`, `app/edit-history.js`. Exports helpers, bell-dropdown rendering, history-page lifecycle, `NOTIFICATION_TYPES` enum, registers `window.toggleNotificationsDropdown`, `window.handleNotificationClick`, `window.markAllNotificationsRead` for onclick handlers.
- **D-14 — Primary helper signature:** `createNotification({ user_id, type, message, link, source_collection, source_id })`. Helper auto-stamps `created_at: serverTimestamp()`, `read: false`, `read_at: null`, `actor_id: getCurrentUser()?.uid ?? null`. Throws on missing required fields. Returns the new Firestore doc id (or void).
- **D-15 — Fan-out helper:** `createNotificationForRoles({ roles, type, message, link, source_collection, source_id, excludeActor: true })`. Internally queries `users` where `role in roles AND status === 'active'`, then writes one doc per recipient via `writeBatch()` (atomic).
- **D-16 — No dedupe in Phase 83.** Callers are responsible for firing on definitive events.

**Security Rules (NOTIF-13):**
- **D-17 — Per-user read/update/delete:** `allow read, update, delete: if isActiveUser() && resource.data.user_id == request.auth.uid;`
- **D-18 — Create: any active user can create.** Required-field guards via `request.resource.data.* is string` clauses. `actor_id == request.auth.uid` prevents impersonation.
- **D-19 — Field-level update guard:** Only `read` and `read_at` are mutable post-create; `user_id`, `type`, `created_at`, `actor_id` are pinned via `request.resource.data.X == resource.data.X`.
- **D-20 — Indexes:** Firestore composite index for `(user_id, created_at desc)` and `(user_id, read, created_at desc)`. Indexes deploy in same commit as Security Rules.

### Claude's Discretion

- Per-type icon/color mapping for notification rows (visually consistent with existing status badges).
- Time format in dropdown rows: relative ("2h ago") with hover-tooltip showing absolute. Use `formatTimestamp` if it fits.
- Badge cap behavior (e.g., `99+` once unread > 99) — pick a reasonable cap.
- Empty state copy and dropdown width.
- Dropdown positioning math (right-align with bell, max-height with scroll, mobile full-width takeover at ≤768px).
- Whether to add "Filter: All / Unread" toggle inside the dropdown — only if cheap; otherwise defer.
- Whether the history page surfaces simple filters (read state, type) — only if cheap; otherwise defer.
- Whether to add a `console.warn` when `createNotification` is called with a `type` not in `NOTIFICATION_TYPES`.
- Dev plumbing: hidden `window.__createTestNotification(args)` for verifying the bell badge updates in real time.

### Deferred Ideas (OUT OF SCOPE)

- Filters on the history page (by type / read state / date range) — only add if cheap; otherwise defer.
- CSV export of notifications.
- Per-user notification preferences (NOTIF-FUT-03, deferred to v4.1+).
- Email channel / browser push (FCM) — explicitly Out of Scope per PROJECT.md and REQUIREMENTS.md.
- Auto-cleanup / TTL of old notifications.
- Cascade-delete of notifications when source record is deleted (D-12 chooses destination-view's empty state instead).
- Pre-flight `getDoc` check before navigating from a notification (D-13 rejects this).
- Dedupe in the helper (D-16 punts to v4.1 if pain emerges).
- `createNotificationForUsers({ user_ids })` raw user-id list helper.
- Nav-icon-with-badge primitive in `app/components.js` (only extract if reused).
- Bell badge animation / sound on new notification.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **NOTIF-01** | User sees a bell icon in the top navigation showing an unread notification count badge | Bell button + `<span class="notif-badge">` placed in `index.html` top-nav (D-01 desktop / D-02 mobile). Real-time `onSnapshot(where user_id, where read==false)` updates badge. Verifiable by DOM inspection of `#notifBell`/`#notifBadge` and console-write via `window.__createTestNotification`. |
| **NOTIF-02** | User can click the bell to open a notification dropdown listing recent notifications (last 10) with type, message, source link, and time | `window.toggleNotificationsDropdown` registered from `app/notifications.js`. Dropdown markup mirrors `.nav-dropdown-menu` shape but uses parallel `.notif-dropdown*` classes (so styles can diverge). Listener queries `where('user_id','==',uid), orderBy('created_at','desc'), limit(11)` (the `+1` lets us detect "10+" indicator cheaply). Each row shows type badge + message + relative timestamp + source link. |
| **NOTIF-03** | User can click a notification to navigate to its source record (deep link) | Per D-03, `window.handleNotificationClick(docId)` does atomic (a) `updateDoc` setting `read=true, read_at=serverTimestamp()`; (b) `window.location.hash = doc.link`; (c) close dropdown. Dead-link handling (D-12) defers to destination view's empty state — no pre-flight check. |
| **NOTIF-04** | User can mark an individual notification as read | Per-row affordance (small checkmark / "mark read" button) on each row, calling `window.markNotificationRead(docId)`. Distinct from row-click navigation: this just flips read state without navigating. |
| **NOTIF-05** | User can mark all notifications as read in one click | Per D-04, "Mark all as read" button at top of dropdown. Disabled when zero unreads. `window.markAllNotificationsRead()` performs `writeBatch()` over all unread docs for current user. Atomic; chunk into 500-op batches if `unreadCount > 500` (unlikely in v4.0). |
| **NOTIF-06** | User can open a full notification history page (paginated, 20/page) with all notifications including read items | Route `#/notifications` (D-09). Paginated 20/page cursor-based (D-10). "Newer" / "Older" buttons. Includes read items. |
| **NOTIF-13** | System persists notifications in Firestore (`notifications` collection) with user_id (recipient), type, message, link, read flag, created_at; Security Rules ensure each user only reads/writes their own notifications | Schema per D-05. Security Rules per D-17/D-18/D-19. Composite indexes per D-20. |
</phase_requirements>

## Summary

Phase 83 ships the in-app notification plumbing for the v4.0 Management Portal: bell + badge in top nav (real-time), dropdown of last 10, full history page at `#/notifications`, plus the `notifications` Firestore collection with per-user Security Rules and the `app/notifications.js` shared module that Phase 84 (existing-event triggers) and Phase 87 (proposal-event triggers) will consume. CONTEXT.md locks all 20 design decisions (D-01..D-20) — research's job is verification of referenced code locations, surfacing of pitfalls (especially listener lifecycle and the mobile flex-layout constraint where `.nav-links` is hidden at ≤768px), and prescribing concrete observable signals so Phase 83 verification can prove each requirement works.

All referenced code locations in CONTEXT.md verified accurate. The single most critical pitfall surfaced: **the bell cannot live inside `.nav-links` on mobile** — at `@media (max-width: 768px)` (`styles/components.css:1335-1337`), `.nav-links { display: none; }`. Per D-02 the bell must be visible on mobile alongside the hamburger, so the bell button must sit as a **sibling** of `.nav-links` inside `.top-nav-content`, NOT as a child of `.nav-links` (which contradicts a literal reading of D-01 "between Admin dropdown and Log Out"). Resolution: put the bell-trigger DIV as a flex sibling of `.nav-links` in the visual position D-01 calls out (achieved via `order:` CSS or by simply moving the bell out of `.nav-links` and ensuring desktop layout still places it visually between Admin and Log Out via flex `order` — see Pitfall 1 below).

**Primary recommendation:** Mirror the `app/proof-modal.js` shape for `app/notifications.js` (small singleton module, exports public API + render helpers, registers `window.*` handlers on import). Hook `initNotifications(user)` into the existing first-snapshot init in `app/auth.js:231-276` (immediately after `updateNavForAuth(currentUser)` for active users); hook `destroyNotifications()` into the auth-state-cleared branch at `app/auth.js:344-365`. This places the bell lifecycle outside any view's `init()/destroy()` cycle, which is required because the bell persists across all view navigations.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore SDK | 10.7.1 (CDN) | Notifications collection storage, real-time listeners, batch writes | Already used everywhere; no other client database in the project. Available exports already live in `app/firebase.js` (verified: `onSnapshot`, `writeBatch`, `serverTimestamp`, `query`, `where`, `orderBy`, `limit`, `startAfter` is NOT currently re-exported but is available from the same module). |
| Firebase Auth SDK | 10.7.1 (CDN) | Identify recipient user (`request.auth.uid`) and gate the lifecycle hooks | Already wired through `app/auth.js`. `getCurrentUser()` exists at `app/auth.js:177` and is exposed on `window` at `app/auth.js:541` — both exports are needed by `notifications.js`. |
| Pure JavaScript ES6 modules | — | Module isolation, no build step | Project constraint (CLAUDE.md: "No build, test, or lint commands"). |

### Supporting (existing utilities to reuse)
| Library/Module | Purpose | When to Use |
|----------------|---------|-------------|
| `app/utils.js` → `formatTimestamp(timestamp)` | Existing absolute date formatter (Firestore Timestamp / seconds / Date / string all accepted) | Use as the absolute-time tooltip target. The dropdown row's *relative* time ("2h ago") is NOT in utils — Claude's Discretion to either add a new `formatRelativeTime()` to `utils.js` OR inline a small helper inside `notifications.js`. Recommend adding to `utils.js` if reused (history page also wants relative time). |
| `app/utils.js` → `showToast(message, type)` | Toast feedback | Use for "Marked as read" confirmation if any. Keep usage minimal; click-through navigation already provides feedback. |
| `app/utils.js` → `escapeHTML(str)` | XSS protection on `notification.message` and any user-provided content rendered into innerHTML | **MANDATORY** — message strings come from Phase 84 trigger sites and may eventually contain user-typed content (e.g., MRF rejection reason). Apply at every render site. |
| `app/components.js` → `createCard`, `createModal`, `openModal`, `closeModal`, `createPagination`, `createEmptyState`, `createStatusBadge` | Card / modal / pagination scaffolding | `createPagination` is unsuitable for cursor-based pagination (it expects `currentPage`/`totalPages`). Build a small custom Newer/Older control instead — see Pattern 4 below. Use `createCard` and `createEmptyState` for the history page. |
| `app/edit-history.js` | Closest precedent for shared module that bridges Firestore writes + UI rendering | Mirror its structure: tiny module-scope state, exported high-level functions, fire-and-forget pattern with `try/catch` → `console.error` (NEVER throw from within a notification helper — failure to notify must NEVER block the action that triggered it). |
| `app/proof-modal.js` | Shared module exporting render helpers + `window.*` registrations + opening API | Closest shape blueprint for `notifications.js`. Note: `proof-modal.js` registers `window._proofModalSave` / `window._proofModalSkip` from inside `showProofModal()` (lazy registration). For Phase 83, register `window.toggleNotificationsDropdown` etc. **immediately on module load** (D-13) because they're triggered from static `index.html` markup, not from a function call. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Why Locked |
|------------|-----------|----------|------------|
| One doc per recipient (D-08) | One doc with `user_ids: []` array | Simpler fan-out, but per-user mark-read becomes complex (array surgery + can't query "my unread" cheaply) | D-08 chose per-doc; matches NOTIF-13 literally and indexes are simpler |
| Cursor pagination (D-10) | Page numbers (offset-style) | Page numbers can't jump to arbitrary offset in Firestore (no offset operator without reading and discarding) | D-10 chose cursor; matches Firestore's actual capability |
| Cloud Function for fan-out | Client `writeBatch()` (D-15) | Cloud Function would centralize trigger-firing and bypass the "actor writes recipient's notification" rule shape | Project explicitly has NO Cloud Functions (PROJECT.md "Constraints: Firebase-only, no build, no Cloud Functions") |
| Boolean `read: false|true` (D-07) | Single `read_at` timestamp (null = unread, set = read) | Slightly fewer fields, but Firestore `where('read_at', '==', null)` requires explicit null literal and is awkward in queries | D-07 chose boolean + parallel timestamp; idiomatic and queryable |

**Installation:** No new packages. Everything from existing `app/firebase.js` exports.

**Version verification:**
```bash
# Firebase SDK pinned at v10.7.1 in app/firebase.js — no upgrade for Phase 83
# Confirmed: app/firebase.js:7-44 imports from https://www.gstatic.com/firebasejs/10.7.1/...
```

**One required addition to `app/firebase.js` exports:** `startAfter` is not in the current re-export list (verified `app/firebase.js:8-35`). It must be added to support D-10 cursor pagination. The plan must include a small edit to add `startAfter` to both the `import` block AND the `export` block in `app/firebase.js`.

## Architecture Patterns

### Recommended Project Structure
```
app/
├── notifications.js          # NEW — shared module (D-13)
├── auth.js                   # EDIT — add initNotifications/destroyNotifications hooks
├── firebase.js               # EDIT — re-export `startAfter`
├── router.js                 # EDIT — register '/notifications' route + permission map entry
├── components.js             # OPTIONAL EDIT — only if a notif-bell-and-badge primitive proves reused
├── views/
│   └── notifications.js      # NEW — full history page view (render/init/destroy)
└── ...

styles/
├── components.css            # EDIT — add .notif-bell, .notif-badge, .notif-dropdown*, .notif-row* classes
└── views.css                 # EDIT — .notifications-page layout for history page; mobile bell sizing

index.html                    # EDIT — bell button + badge inserted in top-nav
firestore.rules               # EDIT — add `match /notifications/{docId}` block
firestore.indexes.json        # EDIT — add 2 composite indexes (user_id+created_at, user_id+read+created_at)
```

**Two new view modules:** Note that `app/notifications.js` (the bell + helpers + dropdown) and `app/views/notifications.js` (the history page) are TWO separate files. Don't conflate. The bell lives outside the view system; the history page is a normal view. The history page imports its building blocks from `app/notifications.js`.

### Pattern 1: Module-Scope Listener Lifecycle (NOT View-Scope)

The bell-badge listener attaches once when auth state becomes "active" and detaches at logout. It does NOT attach in any view's `init()` (because the bell persists across all views — including ones whose `init()` never runs).

```javascript
// app/notifications.js (skeleton)
import { db, collection, query, where, orderBy, limit, onSnapshot, writeBatch, doc, addDoc, updateDoc, getDocs, serverTimestamp } from './firebase.js';

let bellListener = null;       // unsubscribe fn from onSnapshot
let unreadDocs = [];            // most recent N unread, used for badge + dropdown
let badgeEl = null;
let dropdownEl = null;

export const NOTIFICATION_TYPES = Object.freeze({
    MRF_APPROVED: 'MRF_APPROVED',
    MRF_REJECTED: 'MRF_REJECTED',
    PR_REVIEW_NEEDED: 'PR_REVIEW_NEEDED',
    TR_REVIEW_NEEDED: 'TR_REVIEW_NEEDED',
    RFP_REVIEW_NEEDED: 'RFP_REVIEW_NEEDED',
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
    REGISTRATION_PENDING: 'REGISTRATION_PENDING',
    PROPOSAL_SUBMITTED: 'PROPOSAL_SUBMITTED',  // Phase 87
    PROPOSAL_DECIDED: 'PROPOSAL_DECIDED'       // Phase 87
});

export function initNotifications(user) {
    if (!user?.uid || user.status !== 'active') return;
    if (bellListener) destroyNotifications();  // idempotent

    badgeEl = document.getElementById('notifBadge');
    dropdownEl = document.getElementById('notifDropdownMenu');

    const q = query(
        collection(db, 'notifications'),
        where('user_id', '==', user.uid),
        where('read', '==', false),
        orderBy('created_at', 'desc'),
        limit(11)  // 10 + 1 sentinel for "10+" badge cap detection
    );

    bellListener = onSnapshot(q, (snapshot) => {
        unreadDocs = [];
        snapshot.forEach(d => unreadDocs.push({ id: d.id, ...d.data() }));
        renderBadge(unreadDocs.length);
        // If dropdown is currently open, re-render the rows so the user sees fresh state
        if (dropdownEl?.classList.contains('open')) renderDropdownRows();
    }, (error) => {
        console.error('[Notifications] Bell listener error:', error);
        // Don't auto-destroy — surface and allow recovery on next auth-state change
    });
}

export function destroyNotifications() {
    if (bellListener) { bellListener(); bellListener = null; }
    unreadDocs = [];
    badgeEl = null;
    dropdownEl = null;
}
```

**Why module-scope, not view-scope:** Verified in `app/router.js:281-283` — `destroy()` only fires on cross-view navigation. The bell sits in `index.html` (outside `<div id="app-container">`), so no view's `destroy()` ever runs against it. The lifecycle hooks live in `app/auth.js` instead.

### Pattern 2: Auth-Lifecycle Hook Points

Verified `app/auth.js` flow:

1. **First-snapshot active branch (line 231-276):** After `isFirstSnapshot = false; if (userData.status === 'active' && userData.role) { await initPermissionsObserver(currentUser); }` and after `updateNavForAuth(currentUser)`, add: `if (window.initNotifications) window.initNotifications(currentUser);`

2. **Subsequent-snapshot status change to deactivated (line 296-304):** Just before `signOut(auth).then(...)`, add: `if (window.destroyNotifications) window.destroyNotifications();`

3. **Auth-state-cleared branch (line 344-365):** Right next to `destroyPermissionsObserver();`, add: `if (window.destroyNotifications) window.destroyNotifications();`

4. **Manual logout (`handleLogout` at line 517-535):** The `signOut` flows through `onAuthStateChanged` → branch in step 3, so no separate hook needed.

**Use `window.initNotifications` / `window.destroyNotifications` (not direct imports)** to keep `auth.js` decoupled from `notifications.js`. The notifications module registers them on `window` at module load. This matches the existing pattern (`window.getCurrentUser`, `window.handleLogout`, `window.hasTabAccess`).

### Pattern 3: createNotification Helper (Fire-and-Forget)

```javascript
// app/notifications.js (continued)
export async function createNotification({ user_id, type, message, link, source_collection = '', source_id = '' }) {
    if (!user_id || !type || !message || !link) {
        console.error('[Notifications] createNotification missing required fields:', { user_id, type, message, link });
        throw new Error('createNotification: user_id, type, message, link are required');
    }
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
        // Claude's Discretion item — recommend warn-not-throw so a typo at the trigger site
        // doesn't crash the whole approve action
        console.warn(`[Notifications] Unknown type "${type}". Allowed: ${Object.values(NOTIFICATION_TYPES).join(', ')}`);
    }
    const actor = window.getCurrentUser?.();
    const docRef = await addDoc(collection(db, 'notifications'), {
        user_id, type, message, link,
        source_collection, source_id,
        actor_id: actor?.uid ?? null,
        read: false,
        read_at: null,
        created_at: serverTimestamp()
    });
    return docRef.id;
}
```

**CRITICAL caller pattern (for Phase 84/87):** Trigger sites must `await createNotification(...)` inside a `try { ... } catch (e) { console.error(...) }` block — never let a notification failure block the original action (MRF approval, proposal decision, etc.). Document this expectation in the JSDoc.

### Pattern 4: Cursor-Based Pagination for History Page

```javascript
// app/views/notifications.js (skeleton)
import { db, collection, query, where, orderBy, limit, startAfter, getDocs } from '../firebase.js';

let pageStack = [];        // stack of "first doc" cursors (for Newer)
let currentSnapshot = null;
const PAGE_SIZE = 20;

async function loadPage(direction = 'first') {
    const user = window.getCurrentUser();
    if (!user?.uid) return;

    let q;
    if (direction === 'first') {
        pageStack = [];
        q = query(
            collection(db, 'notifications'),
            where('user_id', '==', user.uid),
            orderBy('created_at', 'desc'),
            limit(PAGE_SIZE)
        );
    } else if (direction === 'next' && currentSnapshot?.docs.length === PAGE_SIZE) {
        // Older
        pageStack.push(currentSnapshot.docs[0]);  // remember first doc of current page so we can go back
        const lastDoc = currentSnapshot.docs[currentSnapshot.docs.length - 1];
        q = query(
            collection(db, 'notifications'),
            where('user_id', '==', user.uid),
            orderBy('created_at', 'desc'),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
        );
    } else if (direction === 'prev' && pageStack.length > 0) {
        // Newer — re-query from a remembered cursor
        const cursor = pageStack.pop();
        q = query(
            collection(db, 'notifications'),
            where('user_id', '==', user.uid),
            orderBy('created_at', 'desc'),
            startAfter(cursor),  // wrong direction — see pitfall below
            limit(PAGE_SIZE)
        );
        // ... actually for "Newer", we need a different approach
    }
    currentSnapshot = await getDocs(q);
    // render
}
```

**Pitfall**: Firestore `startAfter` only goes forward in the order direction. For a `desc` order on `created_at`, "Newer" means going *backward* — Firestore has no clean primitive for this. Two options: (a) keep a stack of *first docs* per page and use `endBefore + limitToLast` (more complex), OR (b) on "Newer", re-query from the very first page and skip via stack depth (simple but wasteful). For a history page that's rarely paged deeply, option (b) is acceptable. Document this tradeoff in the plan.

### Pattern 5: Bell + Badge Markup (D-01 desktop, D-02 mobile)

**Critical constraint discovered during research:** at `@media (max-width: 768px)` (`styles/components.css:1335-1337`), `.nav-links { display: none; }`. Therefore the bell **cannot** be a child of `.nav-links` if D-02 (mobile visible) is to hold.

**Recommended markup** — bell as a sibling of `.nav-links` inside `.top-nav-content`:

```html
<!-- index.html — replace lines 22-58 -->
<nav class="top-nav" style="display: none;">
    <div class="top-nav-content">
        <a href="#/" class="nav-brand">...</a>

        <!-- Bell — sibling of .nav-links, visible at all breakpoints -->
        <div class="notif-bell-wrap" id="notifBellWrap" style="display: none;">
            <button class="notif-bell" id="notifBell"
                    onclick="toggleNotificationsDropdown(event)"
                    aria-label="Notifications" aria-expanded="false">
                <!-- inline SVG bell icon -->
                <svg ...></svg>
                <span class="notif-badge" id="notifBadge" style="display: none;">0</span>
            </button>
            <div class="notif-dropdown-menu" id="notifDropdownMenu" role="menu">
                <!-- header: "Mark all as read" button -->
                <!-- rows: rendered by notifications.js -->
                <!-- footer: <a href="#/notifications">View all</a> -->
            </div>
        </div>

        <button class="nav-hamburger-btn" id="hamburgerBtn" ...>...</button>

        <div class="nav-links">
            <!-- existing links + Admin dropdown + Log Out — UNCHANGED -->
        </div>
    </div>
</nav>
```

**CSS requirements for D-01 desktop placement** ("between Admin dropdown and Log Out"):
- Use CSS `order:` to visually place the bell inside the `.nav-links` flex group on desktop while keeping the markup outside.
- Simpler alternative: **keep two bell elements** (one inside `.nav-links` between Admin and Logout for desktop, one at sibling level for mobile) — but this duplicates markup and risks divergence. NOT recommended.
- **Recommended:** single bell as `.top-nav-content` sibling, positioned via flex `order` and absolute breakpoint-aware spacing. The plan should call out this CSS work explicitly.

**Initial visibility:** `style="display: none;"` on `#notifBellWrap` — `notifications.js` flips it to `display: ''` only when `initNotifications(user)` is called (i.e., only for active users). Mirrors the existing pattern for `#logoutBtn` (`index.html:53-55`).

**Mirror, don't reuse, the Admin dropdown classes** (per CONTEXT.md "Specifics"): use parallel `.notif-dropdown-menu` / `.notif-dropdown-item` classes so visual styles can diverge later without affecting Admin.

### Pattern 6: Firestore Security Rules Block (D-17/D-18/D-19)

```javascript
// firestore.rules — append after rfps block (line ~445), before closing braces

// =============================================
// notifications collection (Phase 83 — NOTIF-13)
// =============================================
match /notifications/{docId} {
  // Helper inline (D-17): user can only touch their own notifications
  allow read: if isActiveUser() && resource.data.user_id == request.auth.uid;

  // List (collection query): same per-user scope; client must add where('user_id','==',uid)
  // Note: list rule applies to each doc returned; with the where clause, denied docs
  // simply fall out of the query. Without the where clause, the entire query fails.
  allow list: if isActiveUser() && resource.data.user_id == request.auth.uid;

  // Create (D-18): any active user can create a notification for any user.
  // The actor (e.g. an approver) writes to the recipient's feed.
  allow create: if isActiveUser()
    && request.resource.data.user_id is string
    && request.resource.data.type is string
    && request.resource.data.message is string
    && request.resource.data.link is string
    && request.resource.data.read == false
    && request.resource.data.actor_id == request.auth.uid;

  // Update (D-17 + D-19): only own notifications, only `read` and `read_at` mutable
  allow update: if isActiveUser()
    && resource.data.user_id == request.auth.uid
    && request.resource.data.user_id == resource.data.user_id
    && request.resource.data.type == resource.data.type
    && request.resource.data.message == resource.data.message
    && request.resource.data.link == resource.data.link
    && request.resource.data.created_at == resource.data.created_at
    && request.resource.data.actor_id == resource.data.actor_id;

  // Delete (D-17): only own notifications. Phase 83 has no UI for this; keeping it
  // open lets us add a "Clear" button later without rule churn.
  allow delete: if isActiveUser() && resource.data.user_id == request.auth.uid;
}
```

**Verified:** the existing helpers (`isSignedIn`, `isActiveUser`, `hasRole`, `isRole`) are at `firestore.rules:46-89` as CONTEXT.md states. The rule block above reuses `isActiveUser()` per D-17.

**Note on `list` rule:** Firestore evaluates list rules per-document. The combo of `where('user_id','==',uid)` in the client query plus the rule above is the standard "scoped collection list" pattern — verified used elsewhere in the rules (e.g., `prs` list rule at `firestore.rules:277-281`).

### Pattern 7: Composite Indexes (D-20)

Append to `firestore.indexes.json`:

```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "user_id", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
},
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "user_id", "order": "ASCENDING" },
    { "fieldPath": "read", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
}
```

**Index 1** (user_id, created_at desc) — backs the history page query (D-10).
**Index 2** (user_id, read, created_at desc) — backs the bell badge / Mark-all queries (D-04, NOTIF-01).

**Deploy together with rules** (verified pattern in `firestore.indexes.json` already; Firebase CLI deploys both via `firebase deploy --only firestore:rules,firestore:indexes`).

### Anti-Patterns to Avoid

- **Bell listener inside any view's `init()`:** breaks across navigation. Bell is global, lives at the auth layer. (Verified router behavior at `app/router.js:281-283`.)
- **Throwing from `createNotification` on Firestore error:** Phase 84 will call this from inside MRF approval flows etc. — a Firestore failure to write a notification must NEVER block the approval. Wrap the addDoc in try/catch and log; only the missing-required-fields case throws (programmer error).
- **Reusing `.nav-dropdown` / `.nav-dropdown-menu` classes** for the bell dropdown: conflates visual styles. Use `.notif-dropdown*` parallel set per CONTEXT.md "Specifics".
- **Putting bell inside `.nav-links`** as a literal child: invisible at ≤768px. See Pattern 5.
- **Rendering `notification.message` via innerHTML without `escapeHTML`:** Phase 84 trigger messages may carry user-typed content (rejection reasons, free-text). Always escape.
- **Auto-firing "Mark all as read" on dropdown open:** D-04 is explicit — only on button click.
- **Dedupe logic in the helper:** D-16 punts to v4.1+. Phase 83 callers fire on definitive events.
- **`startAfter` for "Newer" (backward) pagination:** Firestore doesn't support that directly. See Pattern 4 pitfall.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Listen for new notifications in real time" | Polling loop with `setInterval` + `getDocs` | Firestore `onSnapshot` (D-05) | onSnapshot is the canonical pattern in this codebase (verified: 50+ uses across views); free real-time updates with no polling cost. |
| "Apply the same `read=true` flip to many docs atomically" | Loop of individual `updateDoc` calls | `writeBatch()` (D-04 / D-15) | Already exported from `app/firebase.js`; atomic; single round-trip; documented pattern from Phase 78 backfill cascade. |
| "Generate a unique ID for each notification" | Custom UUID + sequential numbering | `addDoc()` auto-id | Notifications don't need human-readable IDs (unlike MRF/PR/PO). `addDoc` is canonical. |
| "Stamp creation time" | `Date.now()` from client | `serverTimestamp()` from Firestore | Verified used everywhere; client clock skew is real and `serverTimestamp()` is single source of truth (also matches CSP — no client-side time-source dependency). |
| "Find users with role X" for fan-out | Iterate all users client-side | `query(collection('users'), where('role', '==', r), where('status', '==', 'active'))` | Verified rules at `firestore.rules:122-124`: `super_admin/operations_admin/services_admin` can list users. Phase 84 fan-out callers will be admin-or-cross-dept; the role-restricted callers (e.g., NOTIF-12 to super_admins, fired by another super_admin) work. **Edge case:** an `operations_user` triggering an event that fans out to super_admins (NOTIF-12 registration approval) — they cannot list `users` per current rules. **Action item:** Phase 84 must investigate; for Phase 83 the helper just exists, no caller. |
| "Show relative time ('2h ago')" | Reach for moment.js / dayjs from CDN | Add a tiny `formatRelativeTime(ts)` helper to `app/utils.js` | Project is zero-build, no transitive deps. A 20-line helper using `Date.now() - ts.toMillis()` is sufficient. dayjs adds CSP and supply-chain surface for one feature. |
| "Toggle dropdown open/close, close on outside-click" | Custom click-outside listener with bookkeeping | Mirror the pattern at `index.html:128-131` (`document.addEventListener('click', e => if (!e.target.closest('.nav-dropdown')) close...)`) | Existing precedent works; copy the shape with `.notif-bell-wrap` selector. |
| "Verify notification rule blocks unauthenticated/cross-user access" | Manual smoke testing only | Add a focused entry to `test/firestore.test.js` if that test harness is exercised in this phase | Project has `test/firestore.test.js` (verified earlier in Phase 49 — 17/17 tests). Phase 83 SHOULD add notification-specific test cases there. **Open question** — see Open Questions section. |

**Key insight:** Every problem in this domain has a Firebase-native primitive. The temptation to add a UI library (MUI bell component, react-toastify) or a Firestore helper library (firestore-pagination) is wrong here — the SPA is zero-build and pure ES6, and the existing primitives already do the job.

## Common Pitfalls

### Pitfall 1: Mobile Layout Breakage (D-02 vs `.nav-links` display:none)

**What goes wrong:** Bell is invisible at ≤768px because `.nav-links { display: none; }` (`styles/components.css:1335-1337`).
**Why it happens:** A literal reading of D-01 ("between Admin dropdown and Log Out button") puts bell as a child of `.nav-links`. This satisfies desktop but contradicts D-02.
**How to avoid:** Place bell as a SIBLING of `.nav-links` inside `.top-nav-content`. Use CSS `order:` on flex children to position visually between Admin and Logout on desktop. At ≤768px, `.nav-links` hides but the bell-wrap (separate element) remains visible alongside hamburger.
**Warning signs:** Bell renders fine on desktop but missing entirely at mobile widths. DevTools shows `.notif-bell-wrap` with `display: none` inherited from `.nav-links`.

### Pitfall 2: Listener Lifecycle Tied to Wrong Phase of Auth

**What goes wrong:** Bell listener attached too early (before token refresh) → Firestore returns `permission-denied` errors on every snapshot.
**Why it happens:** `onAuthStateChanged` fires with a cached/unvalidated token. Verified `app/auth.js:202-207` documents this exact pitfall: "Force a token refresh so Firestore WebSocket receives valid auth BEFORE any collection listener starts."
**How to avoid:** Hook `initNotifications(user)` AFTER the `try { await user.getIdToken(true); }` line AND inside the `isFirstSnapshot` block, immediately after `updateNavForAuth(currentUser)` for active users (around `app/auth.js:240`). NOT inside the auth state-change handler before the user document is loaded.
**Warning signs:** Browser console shows "Missing or insufficient permissions" or "Listener errors" right after login, then succeeds on refresh.

### Pitfall 3: Stale State Across Logout/Re-login

**What goes wrong:** User A logs out, user B logs in on the same browser tab — bell shows User A's notifications momentarily (or worse, attempts to write as User B but with User A's cached UID).
**Why it happens:** `bellListener` reference + `unreadDocs` array linger after logout if `destroyNotifications()` isn't called.
**How to avoid:** `destroyNotifications()` MUST run in BOTH the `else` branch (auth cleared, `app/auth.js:344`) AND the `userData.status === 'deactivated'` branches (lines 261-265, 296-304). Idempotent (`if (bellListener)` guard).
**Warning signs:** Logout, log in as different user, see other user's badge count for ~1 second.

### Pitfall 4: Dropdown Re-render Wipes "Open" State

**What goes wrong:** A new notification arrives while the dropdown is open. The listener triggers a re-render that closes the dropdown.
**Why it happens:** Naive implementation calls `dropdownEl.innerHTML = newHTML` on every snapshot — wipes any DOM state and CSS classes (including `.open`).
**How to avoid:** Only re-render the rows inside the dropdown (the `.notif-dropdown-rows` child element), not the dropdown's outer container. Preserve the `.open` class. See Pattern 1 skeleton: `if (dropdownEl?.classList.contains('open')) renderDropdownRows();` — implies a separate render-rows function that targets a child node.
**Warning signs:** Dropdown closes itself when a new notification arrives.

### Pitfall 5: Composite Index Missing → Query Fails Silently in Production

**What goes wrong:** Bell badge query (`where user_id, where read==false, orderBy created_at desc`) requires the (user_id, read, created_at desc) composite index. Without it, Firestore returns `failed-precondition` and the SDK logs "The query requires an index."
**Why it happens:** Indexes are not auto-created. They must be deployed via `firebase deploy --only firestore:indexes`.
**How to avoid:** Per D-20 and Phase 11 lesson: indexes deploy in the SAME commit as Security Rules and the same commit as the first `addDoc`. Verification step: run `__createTestNotification` from console, check that the bell badge updates. If it doesn't, check the browser console for the index-required error (Firebase prints a clickable link to auto-create the index).
**Warning signs:** Test notification writes succeed but bell badge stays at 0. Console: "The query requires an index. You can create it here: [link]".

### Pitfall 6: `actor_id` Self-Notification Loop

**What goes wrong:** A user takes an action that fires `createNotificationForRoles` matching their OWN role — they get a notification for their own action.
**Why it happens:** `excludeActor: true` (D-15) is supposed to handle this, but only inside the fan-out helper. A direct `createNotification({ user_id: someoneInMyRole, ... })` from a custom caller can still hit self.
**How to avoid:** D-15's `excludeActor: true` default. Plan must verify the helper filters out `recipient.uid === actor?.uid` before adding to the batch.
**Warning signs:** Approver gets notified that "MRF approved" by themselves.

### Pitfall 7: `list` Rule Without Client `where` Clause

**What goes wrong:** A future caller writes `getDocs(collection(db, 'notifications'))` without filtering by user_id. Firestore returns `permission-denied` because the list rule fails for any doc not owned by the requester — the entire query fails (not partial results).
**Why it happens:** Firestore list rules don't filter docs; they reject the whole query if any returned doc would fail.
**How to avoid:** Documentation in `app/notifications.js` JSDoc: "All `notifications` queries MUST include `where('user_id', '==', currentUser.uid)`. The list rule rejects unscoped queries." The bell listener and history page already do this; future callers must too.
**Warning signs:** Console: "Missing or insufficient permissions" on a query you thought was simple.

### Pitfall 8: Browser Tab Mute / Page Visibility — Listener Throttling

**What goes wrong:** When the tab is backgrounded, Chrome throttles `onSnapshot` callbacks. The bell badge appears stale when user returns.
**Why it happens:** Browser-level performance optimization; not a code bug.
**How to avoid:** Firestore reconnects on tab focus and sends queued updates. Acceptable — not actionable in Phase 83. If staleness is reported, consider listening to `document.visibilitychange` and force a refresh, but defer.
**Warning signs:** User says "the bell didn't update until I clicked the tab."

## Code Examples

### Example 1: Hooking the bell into auth.js
```javascript
// app/auth.js — inside initAuthObserver, isFirstSnapshot active branch (~line 240)
// AFTER:  await initPermissionsObserver(currentUser);
// AFTER:  updateNavForAuth(currentUser);
// ADD:
if (window.initNotifications) {
    window.initNotifications(currentUser);
}

// app/auth.js — auth-cleared branch (~line 344-365)
// NEAR:   destroyPermissionsObserver();
// ADD:
if (window.destroyNotifications) {
    window.destroyNotifications();
}
```

### Example 2: createNotificationForRoles (D-15)
```javascript
// app/notifications.js
import { db, collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from './firebase.js';

export async function createNotificationForRoles({ roles, type, message, link, source_collection = '', source_id = '', excludeActor = true }) {
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new Error('createNotificationForRoles: roles[] required');
    }
    const actor = window.getCurrentUser?.();
    const usersQ = query(
        collection(db, 'users'),
        where('role', 'in', roles),
        where('status', '==', 'active')
    );
    const snap = await getDocs(usersQ);

    const batch = writeBatch(db);
    let count = 0;
    snap.forEach(uDoc => {
        const recipientUid = uDoc.id;
        if (excludeActor && actor?.uid === recipientUid) return;
        const newRef = doc(collection(db, 'notifications'));
        batch.set(newRef, {
            user_id: recipientUid,
            type, message, link,
            source_collection, source_id,
            actor_id: actor?.uid ?? null,
            read: false,
            read_at: null,
            created_at: serverTimestamp()
        });
        count++;
    });
    if (count > 0) await batch.commit();
    return count;
}
```

### Example 3: Mark-all-as-read with writeBatch
```javascript
// app/notifications.js
export async function markAllNotificationsRead() {
    const user = window.getCurrentUser?.();
    if (!user?.uid) return;

    const q = query(
        collection(db, 'notifications'),
        where('user_id', '==', user.uid),
        where('read', '==', false)
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    // Chunk into 500-op batches (Firestore batch limit)
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        docs.slice(i, i + 500).forEach(d => {
            batch.update(d.ref, { read: true, read_at: serverTimestamp() });
        });
        await batch.commit();
    }
    // Listener fires automatically; badge updates without imperative re-render
}
window.markAllNotificationsRead = markAllNotificationsRead;
```

### Example 4: Dev-only test writer (Claude's Discretion)
```javascript
// app/notifications.js (bottom)
// Wired only in dev environment to avoid prod abuse
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (isLocal) {
    window.__createTestNotification = async (overrides = {}) => {
        const user = window.getCurrentUser?.();
        if (!user?.uid) { console.error('Not signed in'); return; }
        return createNotification({
            user_id: user.uid,
            type: overrides.type ?? NOTIFICATION_TYPES.MRF_APPROVED,
            message: overrides.message ?? `Test notification at ${new Date().toLocaleTimeString()}`,
            link: overrides.link ?? '#/',
            source_collection: overrides.source_collection ?? 'mrfs',
            source_id: overrides.source_id ?? 'TEST-001'
        });
    };
    console.log('[Notifications] Dev mode: window.__createTestNotification() available');
}
```

Mirrors the dev-banner pattern in `app/firebase.js:91-99` (also gated by `isLocal`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `enableIndexedDbPersistence` | `persistentLocalCache({ tabManager })` | Firebase v9.7+ (deprecation), enforced project-wide in Phase 48 | App already uses the new API at `app/firebase.js:78-84` — no Phase 83 work. |
| Polling with `setInterval` for "new data" | `onSnapshot` real-time listeners | Project-wide since v1.0 | Use `onSnapshot` for the bell — never poll. |
| `Date.now()` for timestamps | `serverTimestamp()` | Project-wide pattern | Use `serverTimestamp()` for `created_at` and `read_at`. |
| Single-doc fan-out with `user_ids: []` array | One-doc-per-recipient (D-08) | Locked Phase 83 | Per-user mark-read becomes trivially independent. |
| Custom UUID for IDs | Firestore auto-id via `addDoc` | Project-wide for non-human-facing IDs | Notifications use auto-id; human-facing IDs (MRF, PR, PO, RFP) keep their bespoke generators. |

**Deprecated/outdated:**
- Anything suggesting Cloud Functions for notification fan-out: project explicitly excludes Cloud Functions (PROJECT.md Constraints). Client-side `writeBatch` is the path.
- Email channel implementations: Out of Scope per PROJECT.md and REQUIREMENTS.md.

## Open Questions

1. **Should Phase 83 add Firestore-rules unit tests for the new `notifications` rules block?**
   - What we know: `test/firestore.test.js` exists from Phase 49 (17/17 tests passing). The repo has the harness.
   - What's unclear: Whether v3.2 maintained the test harness as new collections were added (e.g., `rfps` rules added in Phase 65 — were tests added too?). A quick scan of `test/firestore.test.js` is in scope for the planner; if the harness is current, Phase 83 should add notification rule tests; if stale, defer to a separate hygiene task.
   - Recommendation: Plan should include a 1-task investigation: read `test/firestore.test.js`, decide. If harness covers v3.2 rules → ADD tests for D-17/D-18/D-19; else → DEFER and document as carry-over.

2. **Does any current `operations_user` ever need to fan-out to `super_admin` users (NOTIF-12)?**
   - What we know: NOTIF-12 (registration approval pending → super_admins) is Phase 84, not Phase 83. But Phase 83 ships the helper that Phase 84 will call. The trigger site for NOTIF-12 is registration approval — only super_admins themselves take that action.
   - What's unclear: Wait — the trigger fires when a NEW USER REGISTERS, not when an admin approves. The actor at trigger time is unauthenticated (or pending). Can an unauthenticated user write a notification? D-18 requires `isActiveUser()` — NO.
   - Recommendation: This is a Phase 84 problem, not Phase 83. Surface it now so Phase 84 doesn't get blocked. Possible Phase 84 solutions: (a) the registration flow already creates a `pending` user; an active super_admin's existing user-list-listener can detect the new pending user and fire the notification client-side from THEIR session, OR (b) loosen the `isActiveUser()` create rule for `notifications` of type REGISTRATION_PENDING (introduces an attack surface), OR (c) accept that the notification fires only when a super_admin loads the dashboard — non-real-time but acceptable. Phase 83 doesn't need to choose; Phase 84 does.

3. **Is `view_count` / `last_viewed_at` on notifications useful for any analytic in v4.0?**
   - What we know: D-05 schema has only `read`/`read_at` and `created_at`. No engagement analytics fields.
   - What's unclear: Whether future Phase 87 dashboard wants "unviewed but old" insight.
   - Recommendation: NO — out of scope for Phase 83. If Phase 87 wants it, add then. Schema is forward-tolerant.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Firebase Firestore SDK | All notification storage / listeners | ✓ | 10.7.1 (CDN, in `app/firebase.js`) | — |
| Firebase Auth | `getCurrentUser()` for `actor_id` and listener-init guard | ✓ | 10.7.1 | — |
| Modern browser ES6 modules | All `app/*.js` imports | ✓ | Project constraint | — |
| Firebase CLI (for deploying rules + indexes) | Deploying `firestore.rules` and `firestore.indexes.json` | ✓ (assumed; v3.2 deployed rules+indexes successfully — Phase 78, 65) | — | — |
| Test harness (`test/firestore.test.js`) | Optional — for rule unit tests | ✓ (file exists from Phase 49); maintenance status TBD | — | Manual smoke testing via dev account |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Test harness if stale → manual smoke per Open Question 1.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None for unit tests on app code (zero-build SPA, no Jest/Vitest). Existing `test/firestore.test.js` uses `@firebase/rules-unit-testing` for Security Rules. |
| Config file | None for app code. `test/firestore.test.js` uses Firebase emulator config. |
| Quick run command | Manual: `python -m http.server 8000` → DevTools Console / Network tab |
| Full suite command | `npm test` (runs `test/firestore.test.js` against emulator) — IF harness is current; verify per Open Question 1 |
| Phase gate | All NOTIF-01..06, NOTIF-13 verified manually via dev `__createTestNotification` + Network tab + DOM inspection. Rule tests added to `test/firestore.test.js` IF harness is current. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command / Manual Procedure | Observable Signal | File Exists? |
|--------|----------|-----------|--------------------------------------|-------------------|--------------|
| NOTIF-01 | Bell icon in top nav with real-time unread badge | manual + DOM | (1) Open `localhost:8000`, log in as active user. (2) `document.querySelector('#notifBell')` returns an element. (3) `document.querySelector('#notifBadge')` exists. (4) Open second browser tab as another active user; from tab A console run `__createTestNotification()` with `user_id` of tab B's user. (5) In tab B, badge count increments within ~2s without page refresh. | DOM has `#notifBell`, `#notifBadge`. Badge text increments live. Network tab shows `onSnapshot` Firestore listener established. | ❌ Wave 0 — no test infra for DOM assertions; manual UAT script |
| NOTIF-02 | Bell click → dropdown shows last 10 with type/message/source link/time | manual | (1) With ≥3 test notifications, click `#notifBell`. (2) `#notifDropdownMenu` toggles `.open` class. (3) Up to 10 rows render, each showing: type label, message text, time (relative or absolute), and a source link. (4) "Mark all as read" header button visible. (5) "View all notifications" footer link to `#/notifications` visible. | Dropdown DOM contains ≤10 `.notif-row` children, each with `.notif-row-message`, `.notif-row-time`, `.notif-row-link` (or row-click handler). | ❌ Wave 0 — manual UAT |
| NOTIF-03 | Click row → navigate to source AND mark read | manual + Network | (1) Create test notification with `link: '#/procurement/records'`. (2) Click the row in the dropdown. (3) Hash changes to `#/procurement/records`. (4) Network tab shows ONE `updateDoc` to `notifications/{id}` setting `read=true, read_at=<timestamp>`. (5) Dropdown closes (`.open` class removed). (6) Badge count decrements by 1. | URL hash changes; Firestore writes one `update`; dropdown closes. | ❌ Wave 0 — manual UAT |
| NOTIF-04 | Mark single notification read | manual + Network | (1) With ≥1 unread notifications, click the per-row "mark read" affordance (NOT the row body). (2) That row updates to read state (visual change — e.g., loses `.notif-row--unread` class). (3) Network tab shows ONE `updateDoc`. (4) Dropdown does NOT close. (5) Hash does NOT change. | Row's `read=true` in Firestore; UI reflects within ~500ms via listener; dropdown stays open. | ❌ Wave 0 — manual UAT |
| NOTIF-05 | "Mark all as read" in one click | manual + Network | (1) Create ≥5 unread notifications. (2) Click "Mark all as read" header button. (3) Network tab shows ONE `commit` request (writeBatch atomic). (4) Badge drops to 0 within ~1s. (5) "Mark all as read" button becomes disabled. (6) When zero unreads existed at click time, button was already disabled (verify Step 6 with separate run). | Single batch commit; badge → 0; button disabled state. | ❌ Wave 0 — manual UAT |
| NOTIF-06 | Full history page paginated 20/page including read items | manual + DOM | (1) Seed ≥25 notifications mixing read and unread. (2) Navigate to `#/notifications` (via dropdown footer link). (3) Page renders 20 rows, "Older" button enabled, "Newer" disabled (first page). (4) Click "Older" → next 5 rows render, "Newer" now enabled. (5) Read AND unread items both appear (verify with seeded mix). (6) Page title is "Notifications | CLMC Operations". | URL hash = `#/notifications`. DOM has paginated 20-row list. Page title set. | ❌ Wave 0 — manual UAT |
| NOTIF-13 | Per-user Security Rules + persisted schema | rules-unit-test (preferred) OR manual | **Preferred (if `test/firestore.test.js` harness is current):** add tests asserting (a) user A cannot read user B's notification (b) user A cannot create a notification with `actor_id != request.auth.uid` (c) user A can flip `read` on their own notification but cannot flip `user_id`/`type`/`created_at` (d) inactive user denied. **Manual fallback:** in DevTools console run cross-user `getDoc` and `updateDoc` attempts; verify `permission-denied`. Schema verification: write one notification via `__createTestNotification`, inspect Firestore document — confirm all 9 fields present (user_id, type, message, link, source_collection, source_id, actor_id, read, read_at, created_at). | Rules tests pass OR manual `permission-denied` errors caught. Document fields all present. | ❌ Wave 0 — `test/firestore.test.js` likely needs new test cases |

### Sampling Rate

- **Per task commit:** Manual smoke — load app at `localhost:8000`, log in, run `window.__createTestNotification()`, observe badge increment. ~30 seconds.
- **Per wave merge:** Full UAT script across all 7 requirements above. ~10 minutes.
- **Phase gate:** Full suite green before `/gsd:verify-work`. If `test/firestore.test.js` rule tests added, `npm test` (or equivalent emulator run) must pass.

### Wave 0 Gaps

- [ ] **Test infra investigation:** Read `test/firestore.test.js` — confirm current state (does it cover v3.2 collections like `rfps`?). Decide: ADD notification rule tests vs DEFER to hygiene task.
- [ ] **`__createTestNotification` dev helper:** Phase 83 ships this gated by `isLocal` check. Without it, manual UAT for NOTIF-01..05 is much slower (have to wait for Phase 84 triggers).
- [ ] **UAT script document:** A small `.planning/phases/83-notification-system-foundation/UAT.md` (or similar) listing the 7 test procedures above so verification is repeatable. (Optional — planner's call.)

## Project Constraints (from CLAUDE.md)

The planner MUST verify all directives below are honored:

| Directive | Source | Phase 83 Implication |
|-----------|--------|----------------------|
| Pure JavaScript ES6 modules, no framework/build system | CLAUDE.md Tech Stack | No bundler. `app/notifications.js` and `app/views/notifications.js` are pure ES6 modules importing from `./firebase.js`, etc. No npm dependency added. |
| No build, test, or lint commands | CLAUDE.md Development | No `package.json` script changes. Firebase rules/indexes deployed via `firebase deploy`. Manual UAT for app code; emulator for rules (existing harness). |
| Firebase Firestore v10.7.1 (CDN) — Project ID: `clmc-procurement` | CLAUDE.md Tech Stack | Use existing `app/firebase.js` exports. Localhost auto-routes to dev project (`clmc-procurement-dev`) — verified at `app/firebase.js:46-74`. |
| View Module Structure: `render(activeTab)`, `init(activeTab)`, `destroy()` | CLAUDE.md SPA Patterns | `app/views/notifications.js` (history page) follows this. `app/notifications.js` (the bell module) does NOT — it's a shared module like `proof-modal.js`/`edit-history.js`, not a view. |
| Firebase Listener Management — store listeners in array, unsubscribe in destroy | CLAUDE.md SPA Patterns | The bell listener is a single fn (not array), stored in module scope. `destroyNotifications()` calls it. The history-page view follows the array pattern. |
| Window Functions for Event Handlers — onclick MUST point to `window.fnName` | CLAUDE.md SPA Patterns | Register `window.toggleNotificationsDropdown`, `window.handleNotificationClick`, `window.markAllNotificationsRead`, `window.markNotificationRead` from `app/notifications.js` IMMEDIATELY on module load (D-13). |
| Hash-Based Routing | CLAUDE.md SPA Patterns | `#/notifications` registered in `app/router.js` `routes` map AND in `routePermissionMap` (D-09). |
| Tab Navigation: Router does NOT call `destroy()` when switching tabs in same view | CLAUDE.md SPA Patterns | The bell lives outside any view's container — irrelevant to view-tab switching. The history page has no sub-tabs. No tab-switch concerns for Phase 83. |
| Status Matching Case-Sensitive | CLAUDE.md SPA Patterns | `NOTIFICATION_TYPES.MRF_APPROVED` is uppercase; all type strings stored exactly as the enum value. Document this in helper JSDoc. |
| Add New View checklist: Add Security Rules FIRST | CLAUDE.md Add New View | Mandatory for Phase 83. The `match /notifications` block in `firestore.rules` AND `firestore.indexes.json` updates deploy in the SAME commit as the first `addDoc` to the collection. |
| Archive — DO NOT EDIT | CLAUDE.md Archive | No archive files touched in Phase 83. |

**Project Skills check:** Verified — `.claude/skills/` and `.agents/skills/` directories were not present at research time. No skill-specific patterns to honor beyond CLAUDE.md.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/83-notification-system-foundation/83-CONTEXT.md` — locked design (D-01..D-20)
- `.planning/REQUIREMENTS.md` lines 27-39, 87-89, 108-110 — NOTIF-01..06, NOTIF-13, NOTIF-FUT-01/02/03 confirmed Out of Scope
- `.planning/ROADMAP.md` lines 230-241, 243-251, 279-291 — Phase 83 success criteria + Phase 84/87 dependencies
- `.planning/PROJECT.md` lines 19-35, 109-110, 393-401, 502-509 — v4.0 milestone, Out of Scope (email/push), Constraints (Firebase-only, no build)
- `.planning/STATE.md` lines 73-81 — Phase 83 design blockers (schema + rules locked)
- `CLAUDE.md` lines 87-237 — SPA Patterns, Add New View checklist, Firebase Listener Management
- `index.html` lines 1-130 — verified top-nav structure, Admin dropdown markup, mobile drawer, inline scripts
- `app/auth.js` lines 170-180 (`getCurrentUser` definition), 200-365 (auth flow with hook points), 537-543 (`window.getCurrentUser`)
- `app/router.js` lines 9-20 (`routePermissionMap`), 30-102 (route definitions), 281-283 (tab-switch destroy guard), 219-356 (`navigate`)
- `app/firebase.js` lines 7-44 (SDK imports), 105-128 (re-exports — confirmed `startAfter` MISSING)
- `app/utils.js` lines 63-89 (`formatTimestamp` definition)
- `app/components.js` (component exports list verified)
- `app/proof-modal.js` lines 1-120 — shared-module pattern blueprint
- `app/edit-history.js` lines 1-176 — shared-module pattern with fire-and-forget error handling
- `firestore.rules` lines 5-89 (template + helpers), 113-148 (users rules), 277-291 (prs list rule pattern), 433-445 (rfps block — Phase 65 precedent)
- `firestore.indexes.json` (entire file — confirmed structure for new index entries)
- `styles/components.css` lines 5-160, 1151-1342 — top-nav, nav-dropdown classes, mobile breakpoint behavior

### Secondary (MEDIUM confidence)
- Firestore documentation conventions for `where`+`orderBy`+composite indexes — well-established Firebase pattern, project already uses it (e.g., existing index for `users` collection at `firestore.indexes.json:3-15`)
- Firestore `writeBatch` 500-op limit — documented Firebase constraint, used in existing Phase 78 backfill cascade

### Tertiary (LOW confidence)
- None. CONTEXT.md eliminates the need for tertiary research; all design questions are locked.

## Metadata

**Confidence breakdown:**
- User Constraints: HIGH — copied verbatim from CONTEXT.md
- Standard Stack: HIGH — every library/utility verified to exist at the cited file/line
- Architecture Patterns: HIGH — patterns verified against existing precedent (proof-modal.js, edit-history.js, auth.js lifecycle)
- Don't Hand-Roll: HIGH — existing primitives all confirmed
- Common Pitfalls: HIGH — Pitfalls 1, 2, 3, 5, 7 are direct consequences of verified code locations
- Code Examples: HIGH — patterns adapted from existing modules
- Validation Architecture: MEDIUM — depends on Open Question 1 (test harness currency)

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — Firebase SDK 10.7.1 is stable; no breaking-change risk in window)
