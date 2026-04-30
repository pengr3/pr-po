---
phase: 84-notification-triggers-existing-events
plan: "01"
subsystem: notifications
tags: [notifications, firestore-rules, mrf, procurement, project-detail, service-detail, register]
dependency_graph:
  requires: [83-notification-system-foundation]
  provides: [createNotificationForUsers, requestor_user_id-field, notifications-imports-wired, super_admin-read-rule]
  affects: [app/notifications.js, app/views/mrf-form.js, app/views/procurement.js, app/views/project-detail.js, app/views/service-detail.js, app/views/register.js, firestore.rules]
tech_stack:
  added: []
  patterns: [writeBatch-fan-out, optional-chaining-uid-null-fallback, firestore-rules-role-filter]
key_files:
  created: []
  modified:
    - app/notifications.js
    - app/views/mrf-form.js
    - app/views/procurement.js
    - app/views/project-detail.js
    - app/views/service-detail.js
    - app/views/register.js
    - firestore.rules
decisions:
  - "createNotificationForUsers added as thin writeBatch fan-out over direct UID array (D-08 per CONTEXT)"
  - "requestor_user_id uses window.getCurrentUser?.()?.uid ?? null with optional chaining null fallback (D-01)"
  - "firestore.rules allow read scoped to resource.data.role == 'super_admin' — minimal relaxation per D-12"
metrics:
  duration_seconds: 143
  completed_date: "2026-04-30"
  tasks_completed: 4
  tasks_total: 4
---

# Phase 84 Plan 01: Foundation Prep — Imports, requestor_user_id, createNotificationForUsers Summary

**One-liner:** Wired all four Phase 84 trigger-site files with notifications.js imports, added writeBatch UID-array fan-out helper, stamped requestor_user_id on both MRF creation paths, and relaxed Firestore rules for super_admin read.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add createNotificationForUsers to app/notifications.js | 58702f0 | app/notifications.js |
| 2 | Stamp requestor_user_id in both MRF creation paths | 3727369 | app/views/mrf-form.js, app/views/procurement.js |
| 3 | Add notifications imports to project-detail.js, service-detail.js, register.js | 10f64e5 | app/views/project-detail.js, app/views/service-detail.js, app/views/register.js |
| 4 | Update firestore.rules — D-12 super_admin read relaxation | e0108c0 | firestore.rules |

## What Was Built

### createNotificationForUsers (app/notifications.js)

New export that takes `{ user_ids, type, message, link, source_collection, source_id }` and writes one notification doc per UID using `writeBatch`. Returns count of docs written; returns 0 silently if `user_ids` is empty or missing. Placed immediately after `createNotificationForRoles` and before the WINDOW REGISTRATIONS block. Mirrors the existing `createNotificationForRoles` writeBatch pattern exactly, substituting a direct UID loop for the Firestore role query.

### requestor_user_id field (mrf-form.js + procurement.js)

Both MRF creation paths now stamp `requestor_user_id: window.getCurrentUser?.()?.uid ?? null` immediately after `requestor_name` in the mrfDoc object. Uses optional chaining so unauthenticated edge cases write null without throwing. This is the canonical recipient field that Wave 2 NOTIF-07 trigger code will use to find the notification recipient.

### Notifications imports

All four trigger-site files have their notifications.js import wired:
- `procurement.js`: `createNotification, createNotificationForRoles, NOTIFICATION_TYPES`
- `project-detail.js`: `createNotificationForUsers, NOTIFICATION_TYPES`
- `service-detail.js`: `createNotificationForUsers, NOTIFICATION_TYPES`
- `register.js`: `createNotificationForRoles, NOTIFICATION_TYPES`

### Firestore Rules — super_admin read relaxation

Added `allow read: if isSignedIn() && resource.data.role == 'super_admin';` inside `match /users/{userId}` block, before the `allow create` rule. This allows the `createNotificationForRoles({roles:['super_admin']})` call in `register.js` to query super_admin user docs — the minimal relaxation required per D-12.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: Information Disclosure | firestore.rules | allow read rule exposes super_admin docs to any signed-in user (accepted per T-84-01) |
| threat_flag: Client-set field | app/views/mrf-form.js, app/views/procurement.js | requestor_user_id is client-set; used only as notification recipient, no privilege escalation (accepted per T-84-02) |

Both threats are pre-accepted in the plan's threat model (T-84-01, T-84-02).

## Self-Check

### Files exist:
- [x] app/notifications.js — FOUND (modified)
- [x] app/views/mrf-form.js — FOUND (modified)
- [x] app/views/procurement.js — FOUND (modified)
- [x] app/views/project-detail.js — FOUND (modified)
- [x] app/views/service-detail.js — FOUND (modified)
- [x] app/views/register.js — FOUND (modified)
- [x] firestore.rules — FOUND (modified)

### Commits exist:
- [x] 58702f0 — feat(84-01): add createNotificationForUsers helper to notifications.js
- [x] 3727369 — feat(84-01): stamp requestor_user_id on MRF writes + wire notifications import
- [x] 10f64e5 — feat(84-01): wire notifications imports to project-detail, service-detail, register
- [x] e0108c0 — feat(84-01): relax firestore.rules users block for super_admin read (D-12)

## Self-Check: PASSED
