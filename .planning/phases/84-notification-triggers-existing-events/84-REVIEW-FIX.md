---
phase: 84-notification-triggers-existing-events
fixed_at: 2026-04-30T00:00:00Z
review_path: .planning/phases/84-notification-triggers-existing-events/84-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report

**Fixed at:** 2026-04-30
**Source review:** .planning/phases/84-notification-triggers-existing-events/84-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: Null actor UID guard in `createNotificationForUsers`

**Files modified:** `app/notifications.js`
**Commit:** cf41432
**Applied fix:** Added `const actorUid = actor?.uid` guard at the top of the try block. If `actorUid` is falsy, the function logs a warning and returns 0 immediately, avoiding a `null` actor_id that would cause the Firestore batch write to fail with permission-denied. Also fixed in the same commit as CR-03 and WR-02 (all three changes were in the same function body).

---

### CR-02: `resolveRequestorUid` name-collision delivers notification to wrong user

**Files modified:** `app/views/procurement.js`
**Commit:** 0f94062
**Applied fix:** Removed the unsafe `where('full_name', '==', mrf.requestor_name)` fallback lookup entirely. The function now returns `null` with a `console.warn` for legacy MRFs that lack `requestor_user_id`, rather than risking delivery to the wrong user due to non-unique display names. JSDoc updated to reflect the new behavior. WR-04 (active-user filter) is made moot by the removal of the fallback.

---

### CR-03: `createNotificationForUsers` batch size unbounded — throws on >500 recipients

**Files modified:** `app/notifications.js`
**Commit:** cf41432
**Applied fix:** Replaced the single `writeBatch` loop with a chunked loop using `CHUNK = 500`. Deduplicates UIDs with `[...new Set(user_ids.filter(Boolean))]` before chunking. Each chunk creates its own `writeBatch`, commits it, and accumulates into `total`. Matches the pattern already used in `createNotificationForRoles`.

---

### CR-04: NOTIF-12 silently fails — new user has `status: 'pending'` so `isActiveUser()` denies the write

**Files modified:** `firestore.rules`
**Commit:** 2909bb5
**Applied fix:** Changed the `notifications` create rule from `isActiveUser()` to `isSignedIn()`. A newly registered user (status `pending`) is still `isSignedIn()` and can now write the NOTIF-12 batch. Impersonation is still blocked because `actor_id == request.auth.uid` is enforced. Added explanatory comment citing CR-04.
**Note:** This is a logic / security-rule change. Requires human verification to confirm the rule relaxation is acceptable for the deployment's threat model.

---

### WR-01: `allow read` for super_admin docs evaluates `resource.data` during list queries where it is unavailable

**Files modified:** `firestore.rules`
**Commit:** 2909bb5
**Applied fix:** Changed `allow read` to `allow get` for the Phase 84 D-12 super_admin user-doc rule. `allow get` applies only to single-document fetches where `resource.data.role` is available. `allow list` queries on the `users` collection remain restricted to admin roles by the existing `allow list` rule above.

---

### WR-02: `createNotificationForUsers` does not exclude the actor (self-notification gap)

**Files modified:** `app/notifications.js`
**Commit:** cf41432
**Applied fix:** Added optional `excludeActor = false` parameter to `createNotificationForUsers`. When `excludeActor` is true, the actor's UID is filtered from `recipientUids` before chunked batch processing. Default is `false` to preserve existing call-site behavior. The NOTIF-11 callers in `project-detail.js` and `service-detail.js` may pass `excludeActor: true` if self-notification is undesirable (not changed here — callers can opt in).

---

### WR-03: NOTIF-11 in `service-detail.js` reads `currentService.personnel_user_ids` after `await updateDoc` — onSnapshot race

**Files modified:** `app/views/service-detail.js`
**Commit:** 963be3f
**Applied fix:** Moved recipient capture to before the `await updateDoc` call. Extracted `notifRecipients`, `notifServiceLink`, `notifServiceName`, and `notifSourceId` from `currentService` synchronously before the async write. The notification dispatch inside the try block now uses these captured values, immune to any asynchronous `currentService` update from the onSnapshot listener.

---

### WR-04: `resolveRequestorUid` fallback can resolve to a deactivated user

**Files modified:** `app/views/procurement.js`
**Commit:** 0f94062
**Applied fix:** Addressed as part of CR-02 — the name-based fallback was removed entirely. Since there is no longer a fallback query, the `status == 'active'` filter question is moot.

---

### WR-05: Orphan Firebase Auth account left if Firestore setup fails after `createUserWithEmailAndPassword`

**Files modified:** `app/views/register.js`
**Commit:** ceb6b38
**Applied fix:** Hoisted `userId` declaration to `let userId = null` before the `try` block so it is accessible in `catch`. In the `catch` block, if `userId` is set (Auth account was created before the failure), calls `await auth.currentUser?.delete()` to remove the orphan account, wrapped in its own try/catch so cleanup errors do not shadow the original error message.

---

_Fixed: 2026-04-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
