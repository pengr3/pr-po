/* ========================================
   NOTIFICATIONS MODULE — Phase 83 (NOTIF-13, D-13)
   Shared module: helpers, enum, bell-listener lifecycle,
   dropdown renderers, dev test writer.
   Lifecycle hooks (initNotifications/destroyNotifications)
   are called from app/auth.js — NOT from any view's init/destroy.

   IMPORTANT FOR CALLERS (Phase 84/87):
   Always wrap createNotification/createNotificationForRoles in try/catch.
   A notification failure must NEVER block the action that triggered it
   (MRF approval, PR review, proposal decision, etc.).
   ======================================== */
import {
    db, collection, query, where, orderBy, limit, onSnapshot,
    addDoc, updateDoc, getDocs, doc, writeBatch, serverTimestamp
} from './firebase.js';
import { escapeHTML, formatTimestamp, showToast } from './utils.js';

/* ========================================
   NOTIFICATION TYPE ENUM (D-06 — locked)
   All 9 types: 7 for Phase 84, 2 for Phase 87 (PROPOSAL_*)
   Values equal their keys (status-matching pattern).
   ======================================== */

/**
 * Locked enum of notification types.
 * PROPOSAL_* values are placeholders for Phase 87 — shipped now so
 * this module isn't churned when Phase 87 lands.
 */
export const NOTIFICATION_TYPES = Object.freeze({
    MRF_APPROVED: 'MRF_APPROVED',
    MRF_REJECTED: 'MRF_REJECTED',
    PR_REVIEW_NEEDED: 'PR_REVIEW_NEEDED',
    TR_REVIEW_NEEDED: 'TR_REVIEW_NEEDED',
    RFP_REVIEW_NEEDED: 'RFP_REVIEW_NEEDED',
    PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
    REGISTRATION_PENDING: 'REGISTRATION_PENDING',
    PROPOSAL_SUBMITTED: 'PROPOSAL_SUBMITTED',
    PROPOSAL_DECIDED: 'PROPOSAL_DECIDED',
    // Phase 84.1 — procurement-side audience triggers
    MRF_SUBMITTED: 'MRF_SUBMITTED',
    PR_DECIDED: 'PR_DECIDED',
    TR_DECIDED: 'TR_DECIDED',
    RFP_PAID: 'RFP_PAID',
    PO_DELIVERED: 'PO_DELIVERED',
    // Phase 84.1 NOTIF-19 — project/service cost change
    PROJECT_COST_CHANGED: 'PROJECT_COST_CHANGED',
    // Phase 85 D-21 — manual money-in trigger (Finance fan-out on collectible creation)
    COLLECTIBLE_CREATED: 'COLLECTIBLE_CREATED'
});

/* ========================================
   MODULE-SCOPE STATE
   ======================================== */

/** @type {function|null} Unsubscribe fn for the bell-badge onSnapshot listener */
let bellListener = null;

/** @type {Array} Up to 11 most recent unread docs (badge cap detection: 11 → '10+') */
let unreadDocs = [];

/** @type {Array} Up to 10 most recent docs (any read state) — for dropdown rendering */
let recentDocs = [];

/* ========================================
   TYPE → ICON / COLOR MAPPING (Claude's Discretion)
   Visually consistent with existing status badges.
   ======================================== */

const svg = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const TYPE_META = {
    MRF_APPROVED:          { label: 'MRF Approved',          icon: svg('<path d="M4.5 12.75l6 6 9-13.5"/>'), color: '#059669' },
    MRF_REJECTED:          { label: 'MRF Rejected',          icon: svg('<path d="M6 18L18 6M6 6l12 12"/>'), color: '#ef4444' },
    PR_REVIEW_NEEDED:      { label: 'PR Review Needed',      icon: svg('<path d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>'), color: '#f59e0b' },
    TR_REVIEW_NEEDED:      { label: 'TR Review Needed',      icon: svg('<path d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/>'), color: '#f59e0b' },
    RFP_REVIEW_NEEDED:     { label: 'RFP Review Needed',     icon: svg('<path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>'), color: '#f59e0b' },
    PROJECT_STATUS_CHANGED:{ label: 'Project Status',        icon: svg('<path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>'), color: '#1a73e8' },
    PROJECT_COST_CHANGED:  { label: 'Project Cost',          icon: svg('<path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'), color: '#1a73e8' },
    REGISTRATION_PENDING:  { label: 'Registration Pending',  icon: svg('<path d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"/>'), color: '#64748b' },
    PROPOSAL_SUBMITTED:    { label: 'Proposal Submitted',    icon: svg('<path d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>'), color: '#1a73e8' },
    PROPOSAL_DECIDED:      { label: 'Proposal Decided',      icon: svg('<path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>'), color: '#059669' },
    // Phase 84.1 — procurement-side audience triggers
    MRF_SUBMITTED:         { label: 'New MRF',               icon: svg('<path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>'), color: '#1a73e8' },
    PR_DECIDED:            { label: 'PR Decision',           icon: svg('<path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'), color: '#059669' },
    TR_DECIDED:            { label: 'TR Decision',           icon: svg('<path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"/>'), color: '#059669' },
    RFP_PAID:              { label: 'RFP Paid',              icon: svg('<path d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"/>'), color: '#059669' },
    PO_DELIVERED:          { label: 'PO Delivered',          icon: svg('<path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>'), color: '#2563eb' },
    // Phase 85 D-21 — green money-in semantics, parallels RFP_PAID
    COLLECTIBLE_CREATED:   { label: 'New Collectible',       icon: svg('<path d="M14.25 7.756a4.5 4.5 0 100 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'), color: '#059669' }
};

/* ========================================
   RELATIVE TIME HELPER (Claude's Discretion)
   Inline to avoid CDN dependency (zero-build SPA).
   Falls back to formatTimestamp (absolute) for very old items.
   ======================================== */

/**
 * Returns a relative time string ("2h ago", "3d ago") for a Firestore Timestamp.
 * Falls back to absolute date for items older than 30 days.
 * @param {object} ts - Firestore Timestamp or {seconds, nanoseconds} object
 * @returns {string}
 */
function formatRelativeTime(ts) {
    if (!ts) return '';
    let ms;
    try {
        if (ts.toMillis) {
            ms = ts.toMillis();
        } else if (ts.seconds != null) {
            ms = ts.seconds * 1000;
        } else {
            ms = new Date(ts).getTime();
        }
    } catch {
        return formatTimestamp(ts);
    }
    if (!ms || isNaN(ms)) return formatTimestamp(ts);

    const diff = Date.now() - ms;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatTimestamp(ts);
}

/* ========================================
   BADGE RENDER HELPER (internal)
   ======================================== */

/**
 * Update #notifBadge text and visibility based on unread count.
 * @param {number} count - Number of unread docs from the onSnapshot
 */
function renderBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count === 0) {
        badge.style.display = 'none';
        badge.textContent = '';
    } else if (count >= 11) {
        badge.style.display = '';
        badge.textContent = '10+';
    } else {
        badge.style.display = '';
        badge.textContent = String(count);
    }
}

/* ========================================
   DROPDOWN ROW RENDERER
   Exported for Plan 03 unit-testability.
   ALWAYS use escapeHTML on any user-controlled string.
   Targets #notifDropdownRows (child of #notifDropdownMenu) so the
   .open class on the parent container is never disturbed (Pitfall 4).
   ======================================== */

/**
 * Render notification rows into #notifDropdownRows.
 * Uses recentDocs (last 10, any read state) as the display list.
 * Renders the header ("Mark all as read") and footer ("View all") too.
 * @returns {void}
 */
export function renderDropdownRows() {
    const container = document.getElementById('notifDropdownRows');
    if (!container) return;

    const hasUnread = unreadDocs.length > 0;
    const docs = recentDocs.slice(0, 10);

    // Update the static mark-all button's disabled state imperatively
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    if (markAllBtn) markAllBtn.disabled = !hasUnread;

    // Rows only — header and footer live in static index.html markup
    let rowsHtml = '';
    if (docs.length === 0) {
        rowsHtml = `<div class="notif-empty-state">You're all caught up!</div>`;
    } else {
        rowsHtml = docs.map(n => {
            const meta = TYPE_META[n.type] || { label: escapeHTML(n.type || 'Notification'), icon: '•', color: '#64748b' };
            const safeMsg = escapeHTML(n.message || '');
            const safeLink = escapeHTML(n.link || '');
            const safeId = escapeHTML(n.id || '');
            const timeStr = formatRelativeTime(n.created_at);
            const absTime = escapeHTML(formatTimestamp(n.created_at));
            const isUnread = !n.read;
            const unreadClass = isUnread ? ' notif-row--unread' : '';
            return `
                <div class="notif-row${unreadClass}" role="menuitem">
                    <div class="notif-row-body" onclick="handleNotificationClick('${safeId}')" title="${safeLink}">
                        <span class="notif-type-badge"
                              style="background:${meta.color}15;color:${meta.color};"
                              title="${meta.label}">
                            ${meta.icon}
                        </span>
                        <div class="notif-row-content">
                            <div class="notif-row-message">${safeMsg}</div>
                            <div class="notif-row-time" title="${absTime}">${timeStr}</div>
                        </div>
                    </div>
                    ${isUnread ? `<button class="notif-row-read-btn"
                            onclick="event.stopPropagation(); markNotificationRead('${safeId}')"
                            title="Mark as read">✓</button>` : ''}
                </div>`;
        }).join('');
    }

    container.innerHTML = rowsHtml;
}

/* ========================================
   LOAD RECENT DOCS FOR DROPDOWN (internal)
   Fetches the 10 most recent notifications (any read state)
   for the dropdown when it opens.
   All queries MUST include where('user_id','==',uid) — Pitfall 7.
   ======================================== */

/**
 * Fetch the 10 most recent notifications for the current user (any read state).
 * Populates recentDocs and re-renders the dropdown rows.
 * @returns {Promise<void>}
 */
async function loadRecentForDropdown() {
    const user = window.getCurrentUser?.();
    if (!user?.uid) return;
    try {
        const q = query(
            collection(db, 'notifications'),
            where('user_id', '==', user.uid),
            orderBy('created_at', 'desc'),
            limit(10)
        );
        const snap = await getDocs(q);
        recentDocs = [];
        snap.forEach(d => recentDocs.push({ id: d.id, ...d.data() }));
        renderDropdownRows();
    } catch (err) {
        console.error('[Notifications] loadRecentForDropdown failed:', err);
    }
}

/* ========================================
   LIFECYCLE HOOKS — must be called from app/auth.js (not from any view)
   See Pattern 2 in 83-RESEARCH.md for exact auth.js hook points.
   ======================================== */

/**
 * Attach the bell-badge onSnapshot listener for the given active user.
 * Idempotent — calls destroyNotifications() first if a listener already exists.
 * Reveals #notifBellWrap so the bell is visible.
 * No-op if user.status !== 'active'.
 *
 * Call from app/auth.js AFTER getIdToken(true) — see Pitfall 2.
 * DO NOT call from any view's init() — the bell persists across all views.
 *
 * @param {object} user - currentUser object from getCurrentUser() (must have uid and status)
 * @returns {void}
 */
export function initNotifications(user) {
    if (!user?.uid || user.status !== 'active') return;
    if (bellListener) destroyNotifications(); // idempotent guard

    // Reveal the bell wrapper (hidden by default until active user is confirmed)
    const wrap = document.getElementById('notifBellWrap');
    if (wrap) wrap.style.display = '';

    // Query: unread only, limit 11 for badge cap detection (11 → '10+')
    // All queries MUST include where('user_id','==',uid) — Pitfall 7
    const q = query(
        collection(db, 'notifications'),
        where('user_id', '==', user.uid),
        where('read', '==', false),
        orderBy('created_at', 'desc'),
        limit(11)
    );

    bellListener = onSnapshot(q, (snapshot) => {
        unreadDocs = [];
        snapshot.forEach(d => unreadDocs.push({ id: d.id, ...d.data() }));
        renderBadge(unreadDocs.length);
        // If dropdown is currently open, re-render rows so the user sees fresh state (Pitfall 4)
        const menu = document.getElementById('notifDropdownMenu');
        if (menu?.classList.contains('open')) {
            // Re-fetch recent docs and re-render rows (not the container — Pitfall 4)
            loadRecentForDropdown();
        }
    }, (error) => {
        console.error('[Notifications] Bell listener error:', error);
        // Don't auto-destroy — surface error and allow recovery on next auth-state change
    });
}

/**
 * Detach the bell-badge onSnapshot listener and reset all module-scope state.
 * Idempotent — safe to call multiple times (see Pitfall 3).
 * Hides #notifBellWrap. Closes the dropdown if open.
 *
 * Call from app/auth.js at auth-state-cleared and user-deactivated branches.
 * @returns {void}
 */
export function destroyNotifications() {
    if (bellListener) {
        bellListener();
        bellListener = null;
    }
    unreadDocs = [];
    recentDocs = [];

    // Hide bell wrapper
    const wrap = document.getElementById('notifBellWrap');
    if (wrap) wrap.style.display = 'none';

    // Close dropdown if open
    const menu = document.getElementById('notifDropdownMenu');
    if (menu) menu.classList.remove('open');
}

/* ========================================
   DROPDOWN TOGGLE
   ======================================== */

/**
 * Toggle the notification dropdown open/closed.
 * Stops event propagation so the document click-outside listener doesn't
 * immediately close the dropdown when the bell button is clicked.
 * On opening, fetches the 10 most recent notifications (any read state).
 * @param {Event} event
 * @returns {void}
 */
export function toggleNotificationsDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('notifDropdownMenu');
    if (!menu) return;

    const isOpen = menu.classList.contains('open');
    if (isOpen) {
        menu.classList.remove('open');
        const bell = document.getElementById('notifBell');
        if (bell) bell.setAttribute('aria-expanded', 'false');
    } else {
        menu.classList.add('open');
        const bell = document.getElementById('notifBell');
        if (bell) bell.setAttribute('aria-expanded', 'true');
        // Load recent docs (any read state) for the dropdown rows
        loadRecentForDropdown();
    }
}

/* ========================================
   MARK-READ OPERATIONS (D-04, NOTIF-04, NOTIF-05)
   All queries MUST include where('user_id','==',uid) — Pitfall 7.
   ======================================== */

/**
 * Mark all unread notifications for the current user as read.
 * Per D-04: explicit button action only — NOT auto-fired on dropdown open.
 * Uses writeBatch chunked into 500-op batches (Firestore limit).
 * No-op if there are zero unreads.
 *
 * @returns {Promise<void>}
 */
export async function markAllNotificationsRead() {
    const user = window.getCurrentUser?.();
    if (!user?.uid) return;

    try {
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
        // Bell listener fires automatically — badge updates without imperative re-render
    } catch (err) {
        console.error('[Notifications] markAllNotificationsRead failed:', err);
        showToast('Failed to mark all as read. Please try again.', 'error');
    }
}

/**
 * Mark a single notification as read by Firestore document ID.
 * Per NOTIF-04: does NOT close the dropdown or navigate.
 * @param {string} docId - Firestore document ID of the notification
 * @returns {Promise<void>}
 */
export async function markNotificationRead(docId) {
    if (!docId) return;
    try {
        await updateDoc(doc(db, 'notifications', docId), {
            read: true,
            read_at: serverTimestamp()
        });
        // Optimistically update recentDocs cache so UI reflects immediately
        const idx = recentDocs.findIndex(d => d.id === docId);
        if (idx !== -1) recentDocs[idx] = { ...recentDocs[idx], read: true };
        // Re-render rows if dropdown is open
        const menu = document.getElementById('notifDropdownMenu');
        if (menu?.classList.contains('open')) renderDropdownRows();
    } catch (err) {
        console.error('[Notifications] markNotificationRead failed:', err);
    }
}

/* ========================================
   CLICK-ROW NAVIGATION (D-03)
   Order: write THEN close THEN navigate.
   ======================================== */

/**
 * Handle clicking a notification row in the dropdown.
 * Per D-03 (atomic): (a) marks read, (b) closes dropdown, (c) navigates to link.
 * Dead-link handling deferred to destination view's empty state (D-12).
 * @param {string} docId - Firestore document ID of the notification
 * @returns {Promise<void>}
 */
export async function handleNotificationClick(docId) {
    if (!docId) return;
    try {
        // Find link from cached docs (recentDocs covers 10 most recent in dropdown)
        const cached = recentDocs.find(d => d.id === docId) || unreadDocs.find(d => d.id === docId);
        const link = cached?.link;

        // Mark read first (await so the listener-side update is consistent)
        await updateDoc(doc(db, 'notifications', docId), {
            read: true,
            read_at: serverTimestamp()
        });

        // Close dropdown
        const menu = document.getElementById('notifDropdownMenu');
        if (menu) menu.classList.remove('open');

        // Navigate (if link missing for any reason, fall through gracefully)
        if (link) window.location.hash = link;
    } catch (err) {
        console.error('[Notifications] handleNotificationClick failed:', err);
    }
}

/* ========================================
   CREATION API (consumed by Phase 84+)
   ======================================== */

/**
 * Write one notification document to the 'notifications' collection.
 *
 * IMPORTANT FOR CALLERS: Wrap in try/catch — never let a notification failure
 * block the original action (MRF approval, proposal decision, etc.).
 * The Firestore error path returns null; only missing-required-fields throws.
 *
 * Schema per D-05/D-13. All 10 fields always written; no field drift.
 * All queries on 'notifications' MUST include where('user_id','==',uid) — Pitfall 7.
 *
 * @param {object} params
 * @param {string} params.user_id - Recipient uid (required)
 * @param {string} params.type - One of NOTIFICATION_TYPES values (required)
 * @param {string} params.message - Human-readable summary (required)
 * @param {string} params.link - Full hash route, e.g. '#/procurement/records?mrf=MRF-2026-014' (required)
 * @param {string} [params.source_collection=''] - Firestore collection name of the source record
 * @param {string} [params.source_id=''] - Human-readable ID of the source record (e.g. 'MRF-2026-014')
 * @returns {Promise<string|null>} New Firestore doc ID on success, null on Firestore error
 * @throws {Error} If any required field is missing (programmer error — callers must validate)
 */
export async function createNotification({ user_id, type, message, link, source_collection = '', source_id = '' }) {
    if (!user_id || !type || !message || !link) {
        throw new Error('createNotification: user_id, type, message, link are required');
    }
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
        console.warn(`[Notifications] Unknown type "${type}". Allowed: ${Object.values(NOTIFICATION_TYPES).join(', ')}`);
    }
    try {
        const actor = window.getCurrentUser?.();
        const ref = await addDoc(collection(db, 'notifications'), {
            user_id,
            type,
            message,
            link,
            source_collection,
            source_id,
            actor_id: actor?.uid ?? null,
            read: false,
            read_at: null,
            created_at: serverTimestamp()
        });
        return ref.id;
    } catch (err) {
        console.error('[Notifications] createNotification failed:', err);
        // Do NOT re-throw — caller (Phase 84 trigger site) must not be blocked
        return null;
    }
}

/**
 * Write one notification per active user whose role matches the given list.
 * Per D-15: fan-out via writeBatch (atomic, one doc per recipient).
 * Per D-08: one doc per recipient — independent mark-read per user.
 *
 * IMPORTANT FOR CALLERS: Wrap in try/catch — see createNotification note above.
 *
 * Edge case: an operations_user triggering a fan-out to super_admins may get
 * permission-denied when querying 'users'. This is a Phase 84 concern — see
 * 83-RESEARCH.md Open Question 2.
 *
 * @param {object} params
 * @param {string[]} params.roles - Array of role strings to notify (required, non-empty)
 * @param {string} params.type - One of NOTIFICATION_TYPES values (required)
 * @param {string} params.message - Human-readable summary (required)
 * @param {string} params.link - Full hash route (required)
 * @param {string} [params.source_collection=''] - Firestore collection name
 * @param {string} [params.source_id=''] - Source record ID
 * @param {boolean} [params.excludeActor=true] - Exclude the actor from recipients (Pitfall 6)
 * @returns {Promise<number>} Count of notification docs written (0 on failure or no recipients)
 * @throws {Error} If roles array is missing or empty
 */
export async function createNotificationForRoles({ roles, type, message, link, source_collection = '', source_id = '', excludeActor = true }) {
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new Error('createNotificationForRoles: roles[] required and must be non-empty');
    }
    if (!type || !message || !link) {
        throw new Error('createNotificationForRoles: type, message, link are required');
    }
    try {
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
            // excludeActor: default true — don't notify actor of their own action (Pitfall 6)
            if (excludeActor && actor?.uid === recipientUid) return;
            const newRef = doc(collection(db, 'notifications'));
            batch.set(newRef, {
                user_id: recipientUid,
                type,
                message,
                link,
                source_collection,
                source_id,
                actor_id: actor?.uid ?? null,
                read: false,
                read_at: null,
                created_at: serverTimestamp()
            });
            count++;
        });
        if (count > 0) await batch.commit();
        return count;
    } catch (err) {
        console.error('[Notifications] createNotificationForRoles failed:', err);
        return 0;
    }
}

/**
 * Write one notification per UID in the given array.
 * Per D-08 (Phase 84 CONTEXT): fan-out to personnel_user_ids array for NOTIF-11.
 * Uses writeBatch for atomic delivery.
 *
 * IMPORTANT FOR CALLERS: Wrap in try/catch — never let a notification failure
 * block the original action.
 *
 * @param {object} params
 * @param {string[]} params.user_ids - Array of Firebase UIDs to notify (required, non-empty)
 * @param {string} params.type - One of NOTIFICATION_TYPES values (required)
 * @param {string} params.message - Human-readable summary (required)
 * @param {string} params.link - Full hash route (required)
 * @param {string} [params.source_collection=''] - Firestore collection name
 * @param {string} [params.source_id=''] - Source record ID
 * @returns {Promise<number>} Count of notification docs written (0 on empty array or failure)
 */
export async function createNotificationForUsers({ user_ids, type, message, link, source_collection = '', source_id = '', excludeActor = false }) {
    if (!Array.isArray(user_ids) || user_ids.length === 0) return 0;
    if (!type || !message || !link) {
        throw new Error('createNotificationForUsers: type, message, link are required');
    }
    try {
        const actor = window.getCurrentUser?.();
        // CR-01: guard against null actor UID — a null actor_id would violate the
        // notifications create rule (actor_id == request.auth.uid), causing the
        // entire batch to be rejected with permission-denied.
        const actorUid = actor?.uid;
        if (!actorUid) {
            console.warn('[Notifications] createNotificationForUsers: no actor UID — skipping (auth state gap)');
            return 0;
        }

        // CR-03: Firestore hard limit is 500 writes per batch — chunk accordingly.
        // WR-02: excludeActor support — filter out the actor from recipients.
        const CHUNK = 500;
        const dedupedUids = [...new Set(user_ids.filter(Boolean))];
        const recipientUids = excludeActor ? dedupedUids.filter(uid => uid !== actorUid) : dedupedUids;

        let total = 0;
        for (let i = 0; i < recipientUids.length; i += CHUNK) {
            const batch = writeBatch(db);
            let count = 0;
            for (const uid of recipientUids.slice(i, i + CHUNK)) {
                const newRef = doc(collection(db, 'notifications'));
                batch.set(newRef, {
                    user_id: uid,
                    type,
                    message,
                    link,
                    source_collection,
                    source_id,
                    actor_id: actorUid,
                    read: false,
                    read_at: null,
                    created_at: serverTimestamp()
                });
                count++;
            }
            if (count > 0) await batch.commit();
            total += count;
        }
        return total;
    } catch (err) {
        console.error('[Notifications] createNotificationForUsers failed:', err);
        return 0;
    }
}

/* ========================================
   WINDOW REGISTRATIONS (D-13)
   Registered immediately on module load — NOT lazily — because they are
   triggered from static index.html markup (bell button onclick).
   Mirror: app/proof-modal.js window registration pattern.
   ======================================== */

window.toggleNotificationsDropdown = toggleNotificationsDropdown;
window.handleNotificationClick = handleNotificationClick;
window.markAllNotificationsRead = markAllNotificationsRead;
window.markNotificationRead = markNotificationRead;
window.initNotifications = initNotifications;
window.destroyNotifications = destroyNotifications;

/* ========================================
   CLICK-OUTSIDE LISTENER
   Mirrors index.html:128-131 Admin dropdown click-outside pattern.
   Closes the notification dropdown when user clicks outside .notif-bell-wrap.
   ======================================== */

document.addEventListener('click', (e) => {
    if (!e.target.closest('.notif-bell-wrap')) {
        const menu = document.getElementById('notifDropdownMenu');
        if (menu) menu.classList.remove('open');
    }
});

/* ========================================
   DEV-ONLY TEST WRITER (Claude's Discretion)
   Gated by isLocal — never available in production.
   Mirrors the dev-banner gating pattern from app/firebase.js:91-99.
   Plan 05 uses this for UAT without waiting for Phase 84 triggers.

   Usage (DevTools console on localhost):
     await window.__createTestNotification()
     await window.__createTestNotification({ type: 'MRF_REJECTED', message: 'Custom msg', link: '#/procurement/mrfs' })
   ======================================== */

const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
if (isLocal) {
    /**
     * Dev-only: write a test notification for the currently signed-in user.
     * @param {object} [overrides] - Override any field
     * @param {string} [overrides.user_id] - Defaults to currentUser.uid
     * @param {string} [overrides.type] - Defaults to MRF_APPROVED
     * @param {string} [overrides.message] - Defaults to timestamped message
     * @param {string} [overrides.link] - Defaults to '#/'
     * @param {string} [overrides.source_collection] - Defaults to 'mrfs'
     * @param {string} [overrides.source_id] - Defaults to 'TEST-001'
     */
    window.__createTestNotification = async (overrides = {}) => {
        const user = window.getCurrentUser?.();
        if (!user?.uid) { console.error('[Notifications] Not signed in'); return null; }
        return createNotification({
            user_id: overrides.user_id ?? user.uid,
            type: overrides.type ?? NOTIFICATION_TYPES.MRF_APPROVED,
            message: overrides.message ?? `Test notification at ${new Date().toLocaleTimeString()}`,
            link: overrides.link ?? '#/',
            source_collection: overrides.source_collection ?? 'mrfs',
            source_id: overrides.source_id ?? 'TEST-001'
        });
    };
    console.log('[Notifications] Dev mode: window.__createTestNotification() available');
}
