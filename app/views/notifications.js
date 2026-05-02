/* ========================================
   NOTIFICATIONS HISTORY VIEW — Phase 83 (NOTIF-06, D-09, D-10)
   Full history page at #/notifications. Cursor-paginated 20/page,
   includes both read and unread items. Reachable from the bell
   dropdown's "View all notifications" footer link only — NOT in
   the main nav (D-09).
   ======================================== */
import { db, collection, query, where, orderBy, limit, startAfter, getDocs } from '../firebase.js';
import { escapeHTML, formatTimestamp, showLoading } from '../utils.js';
import { NOTIFICATION_TYPES } from '../notifications.js';

/* ========================================
   MODULE-SCOPE STATE
   ======================================== */

const PAGE_SIZE = 20;

/**
 * Stack of "first doc cursor" per visited page — used for Newer navigation.
 * Push current page's first doc when going Older; pop when going Newer.
 */
let cursorStack = [];

/** Docs currently displayed (plain data objects, not Firestore doc refs). */
let currentDocs = [];

/**
 * Last Firestore QuerySnapshot returned (we need .docs[] for cursor extraction).
 * @type {import('firebase/firestore').QuerySnapshot|null}
 */
let currentSnapshot = null;

/**
 * Listener array — for compatibility with the SPA destroy() pattern.
 * This view uses one-shot getDocs (not onSnapshot), so no active listeners.
 */
let listeners = [];

/* ========================================
   TYPE → ICON / LABEL MAPPING
   ======================================== */

const TYPE_META = {
    MRF_APPROVED:           { label: 'MRF Approved',           icon: '✓', color: '#059669' },
    MRF_REJECTED:           { label: 'MRF Rejected',           icon: '✕', color: '#ef4444' },
    PR_REVIEW_NEEDED:       { label: 'PR Review Needed',       icon: '!', color: '#f59e0b' },
    TR_REVIEW_NEEDED:       { label: 'TR Review Needed',       icon: '!', color: '#f59e0b' },
    RFP_REVIEW_NEEDED:      { label: 'RFP Review Needed',      icon: '!', color: '#f59e0b' },
    PROJECT_STATUS_CHANGED: { label: 'Project Status Changed', icon: '↻', color: '#1a73e8' },
    PROJECT_COST_CHANGED:   { label: 'Project Cost',           icon: '$', color: '#1a73e8' },
    REGISTRATION_PENDING:   { label: 'Registration Pending',   icon: '⏳', color: '#64748b' },
    PROPOSAL_SUBMITTED:     { label: 'Proposal Submitted',     icon: '→', color: '#1a73e8' },
    PROPOSAL_DECIDED:       { label: 'Proposal Decided',       icon: '★', color: '#059669' },
    // Phase 84.1 — procurement-side audience triggers
    MRF_SUBMITTED:          { label: 'New MRF',                icon: '+', color: '#1a73e8' },
    PR_DECIDED:             { label: 'PR Decision',            icon: '✓', color: '#059669' },
    TR_DECIDED:             { label: 'TR Decision',            icon: '✓', color: '#059669' },
    RFP_PAID:               { label: 'RFP Paid',               icon: '$', color: '#059669' },
    PO_DELIVERED:           { label: 'PO Delivered',           icon: '📦', color: '#2563eb' }
};

/* ========================================
   RENDER
   ======================================== */

/**
 * Returns the HTML shell for the notifications history page.
 * @param {string|null} activeTab - Unused (no sub-tabs on this page per D-09).
 * @returns {string} HTML string
 */
export function render(activeTab = null) {
    return `
        <div class="container notifications-page" style="margin-top: 2rem;">
            <div class="card">
                <div class="card-body">
                    <h1 style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 1.5rem;">
                        Notifications
                    </h1>
                    <div id="notifHistoryList" style="min-height: 80px;">
                        <div style="color: #64748b; padding: 1rem 0;">Loading...</div>
                    </div>
                    <div class="pagination-container" style="margin-top: 1rem;">
                        <button id="notifNewerBtn" class="pagination-btn" disabled>&#8592; Newer</button>
                        <span id="notifPageInfo" class="pagination-info">Page 1</span>
                        <button id="notifOlderBtn" class="pagination-btn">Older &#8594;</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* ========================================
   INIT / DESTROY (SPA module contract — CLAUDE.md)
   ======================================== */

/**
 * Initializes the notifications history page.
 * Sets page title, runs defensive runtime check, loads the first page of results,
 * and attaches Newer/Older button handlers.
 * @param {string|null} activeTab - Unused.
 */
export async function init(activeTab = null) {
    document.title = 'Notifications | CLMC Operations';

    // MAJOR-6 defensive runtime check — guards against the BLOCKER-3 cascade.
    // If Plan 03 Task 3's static module import were ever removed, every row
    // onclick would silently fail. This log surfaces the regression fast.
    if (!window.handleNotificationClick) {
        console.error('[Notifications view] notifications.js not loaded — onclick handlers will fail');
    }

    // Reset module-scope state on each init (clean slate for every navigation)
    cursorStack = [];
    currentDocs = [];
    currentSnapshot = null;

    await loadFirstPage();

    const newerBtn = document.getElementById('notifNewerBtn');
    const olderBtn = document.getElementById('notifOlderBtn');
    if (newerBtn) newerBtn.onclick = () => loadNewerPage();
    if (olderBtn) olderBtn.onclick = () => loadOlderPage();
}

/**
 * Cleans up module-scope state when navigating away.
 * Uses one-shot getDocs (no active onSnapshot), so listener array stays empty.
 */
export async function destroy() {
    listeners.forEach(unsub => unsub?.());
    listeners = [];
    cursorStack = [];
    currentDocs = [];
    currentSnapshot = null;
}

/* ========================================
   INTERNAL HELPERS
   ======================================== */

/**
 * Returns the current authenticated user's uid, or null if not signed in.
 * @returns {Promise<string|null>}
 */
async function getCurrentUid() {
    const user = window.getCurrentUser?.();
    return user?.uid || null;
}

/**
 * Loads the first page of notifications (most recent 20, ordered by created_at desc).
 * Resets cursor stack so the "Newer" button becomes disabled.
 * Pitfall 7 mitigation: every query includes where('user_id', '==', uid).
 */
async function loadFirstPage() {
    const uid = await getCurrentUid();
    if (!uid) {
        renderError('Not signed in.');
        return;
    }
    const q = query(
        collection(db, 'notifications'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc'),
        limit(PAGE_SIZE)
    );
    currentSnapshot = await getDocs(q);
    currentDocs = currentSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    cursorStack = [];   // reset stack — we're back at page 1
    renderRows();
    updatePaginationButtons();
}

/**
 * Loads the next older page using Firestore cursor-based pagination (startAfter).
 * Pushes the current page's first doc onto the cursor stack so Newer can walk back.
 * Pitfall 7 mitigation: every query includes where('user_id', '==', uid).
 */
async function loadOlderPage() {
    if (!currentSnapshot || currentSnapshot.docs.length < PAGE_SIZE) return; // nothing older
    const uid = await getCurrentUid();
    if (!uid) return;
    // Push the current page's FIRST cursor onto the stack so we can return via Newer
    cursorStack.push(currentSnapshot.docs[0]);
    const lastDoc = currentSnapshot.docs[currentSnapshot.docs.length - 1];
    const q = query(
        collection(db, 'notifications'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc'),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
    );
    currentSnapshot = await getDocs(q);
    currentDocs = currentSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRows();
    updatePaginationButtons();
}

/**
 * Loads the previous (newer) page by re-walking from page 1 to the target depth.
 *
 * O(N) Firestore reads tradeoff per D-10:
 *   Firestore startAfter doesn't go backward in `orderBy desc` order, so the
 *   "Newer" navigation cannot use a single backwards query. Instead we re-query
 *   from page 1 and walk forward via stored cursors. This costs O(targetPage)
 *   reads each time the user clicks Newer — e.g., on page 5 → 4 it costs ~4
 *   page-loads (~80 doc reads). Acceptable because (a) history is rarely paged
 *   deeply, (b) v4.0 has no per-doc read budget concerns at expected volumes,
 *   (c) a backwards cursor would require a parallel ASC-order index. Revisit
 *   if usage analytics show users routinely paging beyond page 10.
 *
 * Pitfall 7 mitigation: every query includes where('user_id', '==', uid).
 */
async function loadNewerPage() {
    if (cursorStack.length === 0) return;   // already on page 1

    cursorStack.pop();   // moving back one — discard the deepest cursor

    const uid = await getCurrentUid();
    if (!uid) return;

    const targetDepth = cursorStack.length;   // depth of stack BEFORE this navigation = target page index
    // Reset and walk forward from page 1
    let q = query(
        collection(db, 'notifications'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc'),
        limit(PAGE_SIZE)
    );
    currentSnapshot = await getDocs(q);
    for (let i = 0; i < targetDepth; i++) {
        const lastDoc = currentSnapshot.docs[currentSnapshot.docs.length - 1];
        if (!lastDoc) break;
        q = query(
            collection(db, 'notifications'),
            where('user_id', '==', uid),
            orderBy('created_at', 'desc'),
            startAfter(lastDoc),
            limit(PAGE_SIZE)
        );
        currentSnapshot = await getDocs(q);
    }
    currentDocs = currentSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRows();
    updatePaginationButtons();
}

/* ========================================
   RENDER HELPERS
   ======================================== */

/**
 * Produces row HTML for the notifications list and injects it into #notifHistoryList.
 * Empty state: "No notifications yet." shown only on page 1 with zero results.
 * Uses escapeHTML on every notification.message and notification.link (XSS mitigation).
 */
function renderRows() {
    const list = document.getElementById('notifHistoryList');
    if (!list) return;

    if (currentDocs.length === 0 && cursorStack.length === 0) {
        // True empty state — page 1, no notifications at all
        list.innerHTML = `
            <div class="notif-empty-state" style="padding: 2rem 0; text-align: center; color: #64748b;">
                No notifications yet.
            </div>
        `;
        return;
    }

    const rowsHtml = currentDocs.map(notification => {
        const isUnread = notification.read !== true;
        const meta = TYPE_META[notification.type] || { label: notification.type || 'Notification', icon: '•', color: '#64748b' };
        const message = escapeHTML(notification.message || '');
        const docId = escapeHTML(notification.id || '');

        // Timestamp display: relative with absolute in title attribute
        let relativeTime = '';
        let absoluteDate = '';
        if (notification.created_at) {
            try {
                // formatTimestamp returns an absolute date string; we also compute relative
                absoluteDate = escapeHTML(formatTimestamp(notification.created_at) || '');
                relativeTime = getRelativeTime(notification.created_at) || absoluteDate;
            } catch (e) {
                relativeTime = absoluteDate;
            }
        }

        return `
            <div class="notif-row ${isUnread ? 'notif-row--unread' : ''}"
                 style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.875rem 1rem;border-bottom:1px solid #e5e7eb;cursor:pointer;"
                 onclick="window.handleNotificationClick('${docId}')">
                <div class="notif-row-icon"
                     style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${meta.color}20;color:${meta.color};font-size:0.875rem;display:flex;align-items:center;justify-content:center;font-weight:700;">
                    ${meta.icon}
                </div>
                <div class="notif-row-body" style="flex:1;min-width:0;">
                    <div class="notif-row-label"
                         style="font-size:0.7rem;font-weight:600;color:${meta.color};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.2rem;">
                        ${escapeHTML(meta.label)}
                    </div>
                    <div class="notif-row-message"
                         style="font-size:0.875rem;color:#1e293b;line-height:1.4;${isUnread ? 'font-weight:600;' : ''}">
                        ${message}
                    </div>
                    <div class="notif-row-time"
                         style="font-size:0.75rem;color:#64748b;margin-top:0.25rem;"
                         title="${absoluteDate}">
                        ${relativeTime}
                    </div>
                </div>
                <button class="notif-row-mark-read"
                        style="flex-shrink:0;background:none;border:1px solid #e2e8f0;border-radius:4px;padding:0.25rem 0.5rem;font-size:0.75rem;color:#64748b;cursor:pointer;white-space:nowrap;"
                        onclick="event.stopPropagation(); window.markNotificationRead('${docId}')"
                        aria-label="Mark as read"
                        title="Mark as read">
                    ✓
                </button>
            </div>
        `;
    }).join('');

    list.innerHTML = `<div class="notif-rows-container">${rowsHtml}</div>`;
}

/**
 * Updates the disabled state and label of Newer/Older pagination buttons
 * and the page info indicator.
 *
 * Logic:
 *  - Newer is disabled when cursorStack is empty (we're on page 1).
 *  - Older is disabled when the current page returned fewer than PAGE_SIZE docs
 *    (we're at the oldest end of history).
 *  - Page number = cursorStack.length + 1.
 */
function updatePaginationButtons() {
    const newerBtn = document.getElementById('notifNewerBtn');
    const olderBtn = document.getElementById('notifOlderBtn');
    const pageInfo = document.getElementById('notifPageInfo');
    const page = cursorStack.length + 1;
    const hasOlder = currentDocs.length === PAGE_SIZE;
    const hasNewer = cursorStack.length > 0;
    if (newerBtn) newerBtn.disabled = !hasNewer;
    if (olderBtn) olderBtn.disabled = !hasOlder;
    if (pageInfo) pageInfo.textContent = `Page ${page}`;
}

/**
 * Renders an error message into the #notifHistoryList container.
 * Uses escapeHTML to sanitize the error string.
 * @param {string} msg - Error message to display.
 */
function renderError(msg) {
    const list = document.getElementById('notifHistoryList');
    if (list) list.innerHTML = `<div class="notif-empty-state" style="padding:2rem 0;text-align:center;color:#64748b;">${escapeHTML(msg)}</div>`;
}

/* ========================================
   RELATIVE TIME HELPER (inline — no CDN dep)
   Only caller at this phase; utils.js upgrade deferred to v4.1 if
   other views also need relative timestamps.
   ======================================== */

/**
 * Returns a relative time string ("2h ago", "3d ago") for a Firestore Timestamp
 * or Date-like object. Falls back to empty string on error.
 * @param {object} ts - Firestore Timestamp (has .toDate()) or Date.
 * @returns {string}
 */
function getRelativeTime(ts) {
    try {
        const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return 'just now';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDays = Math.floor(diffHr / 24);
        if (diffDays < 30) return `${diffDays}d ago`;
        return formatTimestamp(ts) || '';
    } catch (e) {
        return '';
    }
}
