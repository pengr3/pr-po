---
status: complete
phase: 83-notification-system-foundation
source: [83-01-SUMMARY.md, 83-02-SUMMARY.md, 83-03-SUMMARY.md, 83-04-SUMMARY.md]
started: 2026-04-30T00:00:00Z
updated: 2026-04-30T00:01:00Z
---

## Current Test

## Current Test

[testing complete]

## Tests

### 1. Bell visible after login
expected: Bell icon appears in top nav after login (outside nav-links drawer, near admin/logout area). Hidden before login.
result: pass

### 2. Bell badge shows unread count in real-time
expected: |
  With bell visible, open DevTools Console and run:
  `await window.__createTestNotification()`
  Within ~2 seconds (without page refresh), a red badge should appear on the bell showing "1".
  A second call should increment it to "2". Badge is driven by a live Firestore onSnapshot listener.
result: pass

### 3. Bell dropdown opens with recent notifications
expected: |
  Click the bell icon. A dropdown opens showing up to 10 notification rows.
  Each row shows: a type/category indicator, message text, relative time, and is clickable.
  A "Mark all as read" button is visible in the header.
  A "View all notifications" footer link is visible pointing to #/notifications.
  Clicking the bell again closes the dropdown.
result: pass

### 4. Notification row click — navigate + mark read + close
expected: |
  With the dropdown open and a test notification present, click a notification row.
  Three things happen atomically: (1) the URL hash changes to the notification's link (e.g., #/procurement/records),
  (2) the notification is marked read (badge count decrements), (3) the dropdown closes.
  In Network tab you should see exactly one Firestore updateDoc call for that notification.
result: pass

### 5. Per-row mark read (no navigation)
expected: |
  Open the dropdown. Click the per-row mark-read button (checkmark icon on an unread row) — NOT the row body.
  The row visually flips to read state (loses its unread highlight). The dropdown stays open.
  The URL hash does NOT change. The badge count decrements by 1.
result: pass

### 6. Mark all as read
expected: |
  Seed 5+ unread notifications via repeated `window.__createTestNotification()` calls.
  Open the dropdown — "Mark all as read" button should be enabled.
  Click it. The badge drops to zero and hides within ~1 second.
  The button becomes disabled. Reload the page; the badge stays at zero.
result: pass

### 7. Bell stays visible on mobile (375px)
expected: |
  Resize the browser to 375px width (or use DevTools device toolbar → iPhone SE).
  The bell icon remains visible alongside the brand logo and hamburger menu.
  The .nav-links element is hidden (collapsed) but the bell is NOT inside it — it should still show.
  Clicking the bell at 375px opens the dropdown near-full-width.
result: pass
note: "CLMC Operations" text in nav-brand was cropping on mobile. Removed text — logo-only now. Fixed inline.

### 8. Bell hides on logout; per-user isolation on re-login
expected: |
  Log out. The bell icon disappears from the nav (display: none).
  Log back in as a DIFFERENT user. The bell shows that user's unread count (which may be 0 if they have none).
  The previous user's notifications are NOT visible — no stale badge count from the prior session.
result: pass

### 9. History page opens via "View all" footer link
expected: |
  With the dropdown open, click the "View all notifications" footer link.
  The page navigates to #/notifications. The browser tab title changes to "Notifications | CLMC Operations".
  A full history page renders showing notification rows — both read and unread items appear (not filtered to unread only).
result: pass

### 10. History page pagination (Older / Newer)
expected: |
  Seed 25+ notifications via repeated console calls.
  On the history page (#/notifications): 20 rows are shown.
  "Older" button is enabled; "Newer" button is disabled (first page).
  Click "Older" → next batch of older notifications appears; "Newer" button becomes enabled.
  Click "Newer" → returns to the first 20 (most recent) rows.
result: pass

### 11. Cross-user data isolation (Security Rules)
expected: |
  With two browser tabs logged in as different users (User A and User B):
  In User B's console, try to read User A's notification doc:
  `getDoc(doc(window.db, 'notifications', '<user_A_doc_id>'))`
  This should throw a `permission-denied` error — Firestore Security Rules block cross-user reads.
  User B can only see their own notifications.
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
