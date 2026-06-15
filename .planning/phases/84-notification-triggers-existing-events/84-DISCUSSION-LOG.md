# Phase 84: Discussion Log

**Date:** 2026-04-30
**Phase:** 84 — Notification Triggers — Existing Events

---

## Areas Discussed

### Area 1: Requestor UID gap (NOTIF-07)

**Context:** MRF documents store `requestor_name` (string) but no Firebase UID. NOTIF-07 requires targeting the specific requestor user.

| Question | Options Presented | Selection |
|----------|-------------------|-----------|
| How should Phase 84 resolve the requestor's UID? | Add requestor_user_id to new MRFs (Recommended) / Name lookup only / Skip if no UID | Add requestor_user_id to new MRFs |
| For legacy MRFs without the field, what happens at notification time? | Best-effort name lookup (Recommended) / Skip legacy MRFs silently | Best-effort name lookup |

**Decisions locked:** D-01 (add `requestor_user_id` to new MRF writes), D-02 (name-lookup fallback for legacy MRFs), D-03 (try/catch, notifications never block the action).

---

### Area 2: Status change scope (NOTIF-11)

**Context:** `saveField('project_status', value)` fires on all dropdown changes. Question: all 10 statuses or specific ones? Legacy projects may not have `personnel_user_ids`.

| Question | Options Presented | Selection |
|----------|-------------------|-----------|
| Which status changes should notify assigned personnel? | Only meaningful transitions (Recommended) / All 10 / You decide | Only meaningful transitions |
| Legacy projects without personnel_user_ids? | Skip silently (Recommended) / Name lookup fallback | Skip silently |

**Decisions locked:** D-07 whitelist (`'Client Approved'`, `'For Mobilization'`, `'On-going'`, `'Completed'`, `'Loss'`), D-09 (skip legacy docs silently), D-10 (services parity).

---

### Area 3: NOTIF-12 Security Rules approach

**Context:** A newly-registered (pending) user cannot query `users` collection to find super_admin UIDs — Security Rules only allow admin-role users to list users. Phase 83 RESEARCH explicitly flagged this as "Phase 84 must investigate."

| Question | Options Presented | Selection |
|----------|-------------------|-----------|
| How to allow registration fan-out to super_admins? | Relax rules for super_admin read (Recommended) / Trigger from user-management.js / System config doc | Relax rules for super_admin read |

**Decisions locked:** D-12 (add rule: any `isSignedIn()` user can read user docs where `role == 'super_admin'`), D-13 (fan-out via `createNotificationForRoles`), D-11 (trigger site in register.js before signOut).

---

## Deferred Ideas

- Backfill `requestor_user_id` on existing MRF docs — v4.1 maintenance candidate.
- Proposal-event notifications (NOTIF-09/NOTIF-10) — Phase 87.
- `createNotificationForUsers` helper addition — Claude's discretion.

## Claude's Discretion Items

- Message text phrasing for each notification type.
- Whether to add `createNotificationForUsers` helper to notifications.js.
- `source_id` inclusion on NOTIF-08 fan-out calls.
