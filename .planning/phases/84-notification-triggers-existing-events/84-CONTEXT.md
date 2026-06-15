---
name: 84-CONTEXT
description: Decisions for Phase 84 — Notification Triggers (Existing Events). Wires Phase 83 plumbing to MRF approve/reject, PR/TR/RFP Finance review, project/service status changes, and user registration — without proposal events (Phase 87).
type: phase-context
---

# Phase 84: Notification Triggers — Existing Events - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 83 notification plumbing (`createNotification` / `createNotificationForRoles` in `app/notifications.js`) to the four categories of existing events that already exist in v3.2. After this phase, all four NOTIF requirements below fire automatically without any manual action from users.

**In scope (NOTIF-07, NOTIF-08, NOTIF-11, NOTIF-12):**
- **NOTIF-07** — MRF requestor receives a notification when their MRF is approved (PR generated) or rejected.
- **NOTIF-08** — Finance users receive a notification when a PR, TR, or RFP enters their review queue.
- **NOTIF-11** — Personnel assigned to a project/service receive a notification when that project/service's status changes to a meaningful transition (subset of 10 options — see D-05).
- **NOTIF-12** — Super Admin users receive a notification when a new account registration is pending approval.

**Out of scope (deferred to Phase 87):**
- Proposal-event notifications (NOTIF-09 `PROPOSAL_SUBMITTED`, NOTIF-10 `PROPOSAL_DECIDED`).
- Any new Firestore collections — triggers are wired to existing event sites only.
- User-configurable notification preferences (NOTIF-FUT-03, v4.1+).

</domain>

<decisions>
## Implementation Decisions

### Requestor UID Resolution (NOTIF-07)

- **D-01 — Add `requestor_user_id` to new MRF writes (forward-only schema):** `mrf-form.js` and the procurement.js "Create MRF" path must stamp `requestor_user_id: getCurrentUser().uid` alongside `requestor_name` on every new MRF document. This is the canonical recipient field for NOTIF-07.
- **D-02 — Best-effort name lookup for legacy MRFs:** When `rejectMRF()` or `generatePR()` / `generatePRandTR()` fires a NOTIF-07 notification and the MRF lacks `requestor_user_id`, do a one-shot `getDocs` query on the `users` collection where `full_name === mrf.requestor_name`. Use the first matching UID. If no match, skip the notification silently. This covers existing MRFs without new writes.
- **D-03 — Notification must not block the action:** All `createNotification` calls must be wrapped in `try/catch` (per Phase 83 module comment). A notification failure must never prevent MRF approval/rejection from completing.

### PR/TR/RFP Finance Review Notifications (NOTIF-08)

- **D-04 — Trigger sites:** Fire `PR_REVIEW_NEEDED` at the end of `generatePR()` (procurement.js:5735) and `generatePRandTR()` (procurement.js:6033). Fire `TR_REVIEW_NEEDED` at the end of `submitTransportRequest()`. Fire `RFP_REVIEW_NEEDED` when a new RFP is successfully submitted (the `addDoc` to `rfps` collection in `saveRFP()` or `submitRFP()` in procurement.js). Fan-out to all active users with `role === 'finance'` via `createNotificationForRoles({ roles: ['finance'] })`.
- **D-05 (note):** Finance `role` string is `'finance'` (verified in user-management.js `roleLabels` map).

### Project/Service Status Change Notifications (NOTIF-11)

- **D-06 — Trigger site:** The `saveField('project_status', value)` function in `project-detail.js` and its equivalent in `service-detail.js` is the canonical trigger point. Insert the notification call after the successful `updateDoc` on the project/service doc.
- **D-07 — Meaningful transitions only (not all 10):** Only fire NOTIF-11 for these status values: `'Client Approved'`, `'For Mobilization'`, `'On-going'`, `'Completed'`, `'Loss'`. The administrative/early-stage statuses (`'For Inspection'`, `'For Proposal'`, `'Proposal for Internal Approval'`, `'Proposal Under Client Review'`, `'For Revision'`) are skipped to avoid notification fatigue.
- **D-08 — Recipient list:** Fan-out to `personnel_user_ids` array on the project/service document. This is already stored as an array of Firebase UIDs (Phase 21+). Use `createNotification({ user_id })` per UID (or `createNotificationForUsers` if the helper is added).
- **D-09 — Legacy projects without `personnel_user_ids`:** If `personnel_user_ids` is absent or empty, skip the notification silently. No name-lookup fallback. Active projects created since Phase 21 already carry UIDs.
- **D-10 — Services parity:** Same logic applies to `service-detail.js` (service-side `saveField` for `project_status`) — identical trigger, same meaningful-transitions whitelist.

### Registration Pending Notifications (NOTIF-12)

- **D-11 — Trigger site:** Fire in `register.js` immediately after `createUserDocument()` succeeds and before `signOut()`. At this point the new user is still authenticated and their UID is available as `userId`.
- **D-12 — Relax Security Rules to allow any signed-in user to read super_admin user docs:** Add a rule to `firestore.rules` allowing any `isSignedIn()` user to read user documents where `resource.data.role == 'super_admin'`. This is the minimal rules relaxation — it only exposes super_admin name/email to other internal (invitation-approved) users. The existing `isActiveUser()` gate on write remains untouched.
- **D-13 — Fan-out to all active super_admins:** Call `createNotificationForRoles({ roles: ['super_admin'], type: NOTIFICATION_TYPES.REGISTRATION_PENDING, ... })`. The `createNotificationForRoles` helper queries users by role (using the relaxed rule from D-12) and writes one doc per super_admin via `writeBatch()`. `excludeActor: false` — the new user IS the actor so self-exclusion makes no sense here.
- **D-14 — `actor_id` on registration notification:** Set to `userId` (the new user's UID). The Phase 83 Security Rule requires `actor_id == request.auth.uid` on create — this is satisfied since the user is still signed in when the notification is written.
- **D-15 — Deep link:** `link: '#/admin?section=user-management'` (or equivalent route that takes Super Admin to pending approvals). Source: `source_collection: 'users'`, `source_id: userId`.

### Claude's Discretion

- Message text for each notification type (e.g., "Your MRF MRF-2026-014 has been approved", "New PR for review: PR-2026-007 from Supplier X"). Keep concise; include the human-readable ID.
- Whether to include `source_id` on NOTIF-08 fan-out calls (PR ID, TR ID, or RFP ID respectively) — recommended yes for future analytics.
- Whether `createNotificationForUsers(user_ids, payload)` helper should be added to `notifications.js` to support direct UID-array fan-out for NOTIF-11 (instead of iterating `createNotification` calls inline). Recommend yes: add a thin helper to keep trigger sites clean.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 83 foundation (mandatory)
- `.planning/phases/83-notification-system-foundation/83-CONTEXT.md` — All 20 locked decisions (D-01..D-20): schema, helper signatures, Security Rules, fan-out pattern. Phase 84 callers MUST follow D-14/D-15 calling conventions exactly.
- `app/notifications.js` — Live implementation of `createNotification`, `createNotificationForRoles`, `NOTIFICATION_TYPES` enum. Read the actual exported API before writing callers.

### Trigger sites (read these files before planning)
- `app/views/procurement.js` — `rejectMRF()` (~line 4122), `generatePR()` (~line 5735), `generatePRandTR()` (~line 6033), and the RFP submission path (`saveRFP`/`submitRFP` functions — grep for `addDoc.*rfps`). These are the insertion points for NOTIF-07 and NOTIF-08.
- `app/views/mrf-form.js` — `saveNewMRF()` function (~line 1743). Must add `requestor_user_id: getCurrentUser().uid` to the `mrfDoc` object (D-01).
- `app/views/project-detail.js` — `saveField()` function (~line 649). Insert NOTIF-11 trigger after successful `updateDoc` when `fieldName === 'project_status'` and new value is in the D-07 whitelist.
- `app/views/service-detail.js` — Equivalent `saveField()` for services. Same insertion logic as project-detail.js.
- `app/views/register.js` — Registration submission handler (~line 240). Insert NOTIF-12 trigger after `createUserDocument()` succeeds, before `signOut()`.

### Security Rules (must update)
- `firestore.rules` — Lines 6-39 (ADDING NEW COLLECTIONS template — reference). The `users` collection read rule must be relaxed per D-12: add `allow read: if isSignedIn() && resource.data.role == 'super_admin';` to the per-doc read rule for `users`. Verify the exact rule structure before editing.

### Project-level (always mandatory)
- `CLAUDE.md` — SPA Patterns section (Window Functions for onclick, Hash-Based Routing, Firebase Listener Management, status matching case-sensitivity). `firestore.rules` "ADDING NEW COLLECTIONS" template.
- `.planning/PROJECT.md` — Out of Scope: "Email notifications" and "Mobile app" remain deferred. Constraints: Firebase-only, no build system, no Cloud Functions.
- `.planning/ROADMAP.md` — Phase 84 success criteria (4 items); Phase 87 dependency on Phase 83 (proposal events ride same plumbing).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createNotification({ user_id, type, message, link, source_collection, source_id })`** (`app/notifications.js`, D-14 from Phase 83) — primary helper for single-recipient notifications (NOTIF-07 per requestor, NOTIF-11 per personnel member).
- **`createNotificationForRoles({ roles, type, message, link, source_collection, source_id, excludeActor })`** (`app/notifications.js`, D-15 from Phase 83) — fan-out helper for NOTIF-08 (Finance) and NOTIF-12 (super_admins). Uses `writeBatch()` internally.
- **`NOTIFICATION_TYPES`** (`app/notifications.js`) — locked enum with all 9 type keys. Phase 84 uses: `MRF_APPROVED`, `MRF_REJECTED`, `PR_REVIEW_NEEDED`, `TR_REVIEW_NEEDED`, `RFP_REVIEW_NEEDED`, `PROJECT_STATUS_CHANGED`, `REGISTRATION_PENDING`.
- **`getCurrentUser()`** (`app/auth.js:177`, `window.getCurrentUser`) — used to stamp `actor_id` and (new in Phase 84) to get `requestor_user_id` at MRF creation time.
- **`getDocs` + `query` + `where`** (`app/firebase.js`) — used for the best-effort name-lookup fallback (D-02).

### Established Patterns
- **try/catch wrapper on notifications** — ALL notification calls are fire-and-forget with `try/catch`. A failure must never bubble up and block the primary action. This is explicitly documented in the `app/notifications.js` module comment header.
- **Window functions for onclick** (CLAUDE.md) — trigger sites in procurement.js already use `window.*` registration; no change needed for how they're called.
- **Status matching case-sensitive** (CLAUDE.md) — D-07 whitelist must use exact string values: `'Client Approved'`, `'For Mobilization'`, `'On-going'`, `'Completed'`, `'Loss'` (match the project_status field values exactly).
- **`personnel_user_ids` array** (`project-detail.js:580`) — already written on save since Phase 21. Use this field directly for NOTIF-11 fan-out; do not fall back to the legacy `personnel` plain-string field.

### Integration Points
- **`mrf-form.js` `saveNewMRF()`** — add `requestor_user_id` field to mrfDoc. Single insertion point.
- **`procurement.js` `generatePR()` / `generatePRandTR()`** — after the successful `updateDoc(mrfRef, { status: 'PR Generated' })`, fire: (a) NOTIF-07 MRF_APPROVED to requestor; (b) NOTIF-08 PR_REVIEW_NEEDED fan-out to Finance. Both in the same try block, each wrapped in their own try/catch so one failure doesn't block the other.
- **`procurement.js` `rejectMRF()`** — after the successful `updateDoc(mrfRef, { status: 'Rejected' })`, fire NOTIF-07 MRF_REJECTED to requestor.
- **`procurement.js` RFP submission** — after successful `addDoc(rfps, ...)`, fire NOTIF-08 RFP_REVIEW_NEEDED fan-out to Finance.
- **`project-detail.js` / `service-detail.js` `saveField()`** — after `updateDoc` on the project/service doc succeeds, check `if (fieldName === 'project_status' && D07_WHITELIST.includes(valueToSave))` and fire NOTIF-11 fan-out to all `personnel_user_ids`.
- **`register.js`** — after `createUserDocument()` succeeds, before `signOut()`: fire NOTIF-12 fan-out to super_admins.
- **`firestore.rules`** — add super_admin read relaxation to `users` collection rules.

</code_context>

<specifics>
## Specific Ideas

- **Notification message format**: Include the human-readable ID in every message (e.g., `"Your MRF MRF-2026-014 has been approved"`, `"PR PR-2026-007 (ABC Supplier) is pending Finance review"`). Concise; avoid redundant labels already shown in the type badge.
- **NOTIF-11 deep link**: Use the project detail route (e.g., `#/projects/CLMC-CLIENT-2026001`) so personnel can click directly to the project whose status changed.
- **NOTIF-08 deep link**: Link directly to the Finance Pending Approvals tab (`#/finance/pending`) so Finance can click from bell to the review queue immediately.
- **`createNotificationForUsers` helper**: If Phase 84 needs direct UID-array fan-out for NOTIF-11, add a thin `createNotificationForUsers({ user_ids, type, message, link, source_collection, source_id })` to `app/notifications.js` alongside the existing helpers rather than writing a loop inline at each trigger site.

</specifics>

<deferred>
## Deferred Ideas

- **Proposal-event notifications (NOTIF-09/NOTIF-10)** — Phase 87, depends on the proposals collection and approval workflow that doesn't exist yet.
- **Backfill `requestor_user_id` on existing MRF docs** — Phase 84 only adds the field to new writes. A bulk backfill script could be a v4.1 maintenance task if coverage of legacy MRF notifications matters.
- **`createNotificationForUsers({ user_ids })` helper** — Only add if NOTIF-11's UID-array fan-out warrants it. Claude's discretion to add or inline a simple loop.
- **NOTIF-FUT-03 (user preference muting)** — explicitly deferred to v4.1+ per Phase 83 CONTEXT.

</deferred>

---

*Phase: 84-notification-triggers-existing-events*
*Context gathered: 2026-04-30*
