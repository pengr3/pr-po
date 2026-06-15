---
phase: 84-notification-triggers-existing-events
reviewed: 2026-04-30T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/notifications.js
  - app/views/mrf-form.js
  - app/views/procurement.js
  - app/views/project-detail.js
  - app/views/register.js
  - app/views/service-detail.js
  - firestore.rules
findings:
  critical: 4
  warning: 5
  info: 2
  total: 11
status: issues_found
---

# Phase 84: Code Review Report

**Reviewed:** 2026-04-30
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 84 adds notification triggers to seven callsites across four view files, introduces `createNotificationForUsers` in notifications.js, stamps `requestor_user_id` on new MRFs, and relaxes the `users` Security Rule to allow any signed-in user to read super_admin documents. The notification wiring itself is largely correct — all callsites are wrapped in try/catch fire-and-forget blocks and the createNotification functions return gracefully on Firestore error. However, four issues rise to BLOCKER severity: the Security Rule for `notifications` create will permanently reject any notification written by a procurement/finance actor for a different-role recipient (the `actor_id == request.auth.uid` check conflicts with the MRF-rejected notification path in practice, and completely blocks `createNotificationForUsers` batch writes because batch.set does not carry `actor_id = caller's uid` but the rule also requires it); a name-collision ambiguity in the `resolveRequestorUid` fallback that can deliver a notification to the wrong user; an unguarded `writeBatch.commit()` that will throw (not return 0) when `user_ids` contains more than 500 entries; and the NOTIF-12 notification being sent while the newly-created Firebase Auth user is still the active auth principal (before signOut), meaning `actor_id` will equal the new user's own UID which violates the semantic intent of the rule and may fail the rule check in edge-cases.

---

## Critical Issues

### CR-01: Firestore Security Rule for `notifications` create blocks `createNotificationForUsers` batch writes

**File:** `firestore.rules:468-474`

**Issue:** The `notifications` create rule enforces `request.resource.data.actor_id == request.auth.uid`. The `createNotificationForUsers` function (and `createNotificationForRoles`) use `writeBatch.set()` to write multiple notification documents in a single batch. Each document has `actor_id: actor?.uid ?? null`. When the currently-signed-in user has no UID (impossible in practice) or when `actor?.uid` is `null` (if `window.getCurrentUser?.()` returns null/undefined — possible during an edge-case auth state transition), `actor_id` is written as `null` but the rule requires it to equal `request.auth.uid` (a non-null string). This will cause the entire batch to be rejected with permission-denied, silently swallowed by the catch block, and zero notifications will be delivered without any visible user-facing feedback or retry.

More critically: even when the actor UID is populated, the rule `request.resource.data.actor_id == request.auth.uid` means the actor writing the batch **must be signed in as themselves**. In `register.js`, the NOTIF-12 call happens after `createUserDocument` but before `signOut`. At that point `auth.currentUser` is the **newly created user** (pending, role not yet set). `isActiveUser()` — which calls `getUserData().status == 'active'` — will return `false` because the new user's status is `'pending'`. Therefore the create rule's `isActiveUser()` precondition fails, and the entire NOTIF-12 notification is dropped silently.

**Fix:**
```javascript
// In createNotificationForUsers / createNotificationForRoles: add a null-guard
const actorUid = actor?.uid;
if (!actorUid) {
    console.warn('[Notifications] No actor UID — cannot write notifications (auth state gap)');
    return 0;
}
// ...
actor_id: actorUid,  // guaranteed non-null
```

For the register.js NOTIF-12 call specifically, the notification must be sent via a Cloud Function or a server-side path, because the caller is not yet an `active` user. As a short-term workaround, document that NOTIF-12 will silently fail until Cloud Functions are available. Alternatively, relax the `notifications` create rule: if `isActiveUser()` blocks legitimate actors, consider allowing `isSignedIn()` (without status check) for create, with `actor_id` still pinned to `request.auth.uid`.

---

### CR-02: `resolveRequestorUid` name-collision delivers notification to wrong user

**File:** `app/views/procurement.js:4175-4183`

**Issue:** The fallback query (`where('full_name', '==', mrf.requestor_name)`) returns the **first** document from an unordered snapshot when multiple users share the same display name. There is no uniqueness constraint on `full_name` in the schema or in Firestore Security Rules. If two employees share a first+last name (a realistic occurrence in a medium-sized organisation), the notification for MRF approval or rejection is delivered to whichever user Firestore returns first — potentially exposing another employee's MRF details to the wrong person through the notification link.

**Fix:**
```javascript
async function resolveRequestorUid(mrf) {
    if (mrf.requestor_user_id) return mrf.requestor_user_id;
    // Do NOT fall back to name lookup — non-unique names make this unsafe.
    // Log the miss so the data-quality issue is visible.
    console.warn('[Procurement] resolveRequestorUid: no requestor_user_id on MRF', mrf.mrf_id,
        '— notification suppressed. This MRF predates Phase 84 D-01 stamping.');
    return null;
}
```

If the fallback is required for legacy MRFs, add a second disambiguation filter on email:
```javascript
const snap = await getDocs(query(
    collection(db, 'users'),
    where('full_name', '==', mrf.requestor_name),
    where('email', '==', mrf.requestor_email)   // only safe if requestor_email is also stored
));
```

---

### CR-03: `createNotificationForUsers` batch size is unbounded — throws on >500 recipients

**File:** `app/notifications.js:593-625`

**Issue:** `createNotificationForUsers` iterates all UIDs in `user_ids` and adds every one to a **single** `writeBatch`. Firestore's hard limit is 500 write operations per batch. If `personnel_user_ids` on a project ever exceeds 500 (unlikely in this deployment but not validated anywhere), `batch.commit()` throws a Firestore error, which is caught and returns 0. No notification is delivered to anyone. The sister function `createNotificationForRoles` (line 546-573) correctly chunks in 500-op batches. This function does not.

**Fix:**
```javascript
// Chunk into 500-op batches
const CHUNK = 500;
const dedupedUids = [...new Set(user_ids.filter(Boolean))];
for (let i = 0; i < dedupedUids.length; i += CHUNK) {
    const batch = writeBatch(db);
    let count = 0;
    for (const uid of dedupedUids.slice(i, i + CHUNK)) {
        const newRef = doc(collection(db, 'notifications'));
        batch.set(newRef, { /* ... */ });
        count++;
    }
    if (count > 0) await batch.commit();
    total += count;
}
```

---

### CR-04: NOTIF-12 (register.js) — notification sent while user is still the active auth principal before signOut; delivery will silently fail

**File:** `app/views/register.js:257-268`

**Issue:** The NOTIF-12 block calls `createNotificationForRoles({ roles: ['super_admin'] })` **before** `await signOut(auth)`. At this point `auth.currentUser` is the newly created, not-yet-signed-out user. Their Firestore user document has `status: 'pending'` (set by `createUserDocument`). The `isActiveUser()` helper in `firestore.rules` returns `false` for pending users, so the `notifications` create rule denies the write. The `createNotificationForRoles` catch block swallows the error and returns 0. No super_admin is notified of the pending registration.

This is separately documented as an open question in phase docs, but it is still a shipped defect — the feature is advertised as working but silently does nothing.

**Fix (short-term):** Move NOTIF-12 to fire **before** `createUserDocument` sets status to `'pending'` — at the point the Auth account is created but before the Firestore doc exists, or relax the `isActiveUser()` guard in the notifications create rule to `isSignedIn()` (the `actor_id == request.auth.uid` pin already prevents impersonation). Document the limitation clearly if neither workaround is adopted:

```javascript
// In handleRegister, after markInvitationCodeUsed:
// NOTE: NOTIF-12 will silently fail because the new user's status is 'pending'
// and the Firestore notifications create rule requires isActiveUser().
// This is a known limitation until Cloud Functions are available (Phase 87).
try {
    await createNotificationForRoles({ ... });
} catch (notifErr) {
    console.error('[Register] NOTIF-12 failed:', notifErr);
}
await signOut(auth);
```

---

## Warnings

### WR-01: `firestore.rules` — new `allow read` rule for super_admin docs is evaluated after the more specific `allow get` and `allow list` rules but uses `allow read` which is a shorthand for both; order creates ambiguity

**File:** `firestore.rules:129`

**Issue:** Firestore Security Rules are evaluated as `OR` — the first matching `allow` wins. The existing `allow get` (line 115) and `allow list` (line 124) rules for `users` are separate. The new Phase 84 rule at line 129 uses `allow read` (which means both `get` and `list`). This means any signed-in user can now **list** the users collection when filtered to `role == 'super_admin'`. The comment says the intent is to allow reading super_admin user docs. In Cloud Firestore, a `list` operation (collection query) cannot filter on a field via Security Rules — `resource.data.role` is not available during a collection-level `list` rule evaluation; it is only available during a `get` (single-document) evaluation. In practice this means the `resource.data.role == 'super_admin'` check on a `list` operation **does not restrict** which documents are returned — it either always-true or always-false depending on Firestore's implementation at evaluation time for list queries.

**Fix:** Replace `allow read` with `allow get` to restrict the new rule to single-document fetches only, which is the documented intent:
```
allow get: if isSignedIn() && resource.data.role == 'super_admin';
```

---

### WR-02: `createNotificationForUsers` does not exclude the actor (self-notification gap)

**File:** `app/notifications.js:593`

**Issue:** `createNotificationForUsers` lacks an `excludeActor` parameter. When a super_admin or operations_admin saves a project status change (`saveField` in project-detail.js), they will receive a notification in their own feed if they are in `personnel_user_ids`. The sister function `createNotificationForRoles` defaults to `excludeActor: true` (line 527). The inconsistency is a quality gap — the comment at line 576 says "Per D-08 (Phase 84 CONTEXT): fan-out to personnel_user_ids array" but does not address this. For the NOTIF-11 use case, the editor who just set the status is also personnel on the project and will receive a "status changed" notification they triggered themselves.

**Fix:** Add an optional `excludeActor` parameter:
```javascript
export async function createNotificationForUsers({
    user_ids, type, message, link,
    source_collection = '', source_id = '',
    excludeActor = false   // default false to preserve current behavior
}) {
    // ...
    const actor = window.getCurrentUser?.();
    for (const uid of user_ids) {
        if (!uid) continue;
        if (excludeActor && actor?.uid === uid) continue;
        // ...
    }
}
```

---

### WR-03: NOTIF-11 in `service-detail.js` uses `currentService.personnel_user_ids` BEFORE updating `currentService` local cache

**File:** `app/views/service-detail.js:735-748`

**Issue:** In `saveServiceField`, the notification at line 735 reads `currentService.personnel_user_ids` to build the recipients list. However, the local cache is updated at line 732 (`currentService = { ...currentService, [fieldName]: valueToSave }`). For the NOTIF-11 path (`fieldName === 'project_status'`), `currentService.personnel_user_ids` was NOT part of the field being saved, so the read is correct in isolation. But the notification fires **after** the local cache update on line 732. If `currentService` were mutated to clear `personnel_user_ids` in the same update step (not currently the case but fragile), no notifications would be sent. More pressing: `currentService` is updated on line 732 but the onSnapshot listener (line 125) will also update `currentService` asynchronously when Firestore confirms the write. If the listener fires between line 732 and line 735, `currentService.personnel_user_ids` could reflect a stale or updated value. Capture the recipients list before the await write to avoid this race:

**Fix:**
```javascript
// Capture recipients BEFORE the await updateDoc call
const recipients = (currentService.personnel_user_ids || []).filter(Boolean);
try {
    await updateDoc(serviceRef, { ... });
    // ... edit history ...
    currentService = { ...currentService, [fieldName]: valueToSave }; // update cache after write
    // NOTIF-11
    if (fieldName === 'project_status' && NOTIF11_STATUS_WHITELIST.includes(valueToSave) && recipients.length > 0) {
        createNotificationForUsers({ user_ids: recipients, ... }).catch(...);
    }
```

---

### WR-04: `resolveRequestorUid` query lacks a `where('status', '==', 'active')` filter — can resolve to a deactivated user

**File:** `app/views/procurement.js:4175-4183`

**Issue:** The legacy fallback query `where('full_name', '==', mrf.requestor_name)` does not filter by `status == 'active'`. If a user was deactivated, their Firestore user document still exists with the same `full_name`. The query may return the deactivated user's UID. Writing a notification for that UID will succeed (the create rule does not check recipient status), but the deactivated user cannot sign in to see it. More importantly, `snap.docs[0]` may be the deactivated user when an active user with the same name exists at `snap.docs[1]`.

**Fix:**
```javascript
const snap = await getDocs(query(
    collection(db, 'users'),
    where('full_name', '==', mrf.requestor_name),
    where('status', '==', 'active')   // only active users
));
```

---

### WR-05: `register.js` error recovery after `createUserWithEmailAndPassword` succeeds but subsequent steps fail leaves orphan Auth account

**File:** `app/views/register.js:241-297`

**Issue:** This is pre-existing but Phase 84 adds another async step (`createNotificationForRoles`) between Auth account creation and `signOut`. If `createUserDocument` throws (Firestore permission error, network drop), the catch block at line 284 shows a generic error and re-enables the Register button. The Firebase Auth user now exists but has no Firestore document. The user sees an error and may try to re-register with the same email, getting `auth/email-already-in-use`. This was not introduced by Phase 84 but the addition of another await step widens the window. Not a Phase 84 regression but worth noting since NOTIF-12 is now in this critical path.

**Fix:** On catch, if `userId` is set (Auth account was created but Firestore doc failed), call `userCredential.user.delete()` to clean up the orphan Auth account:
```javascript
} catch (error) {
    if (userId) {
        // Auth account created but Firestore setup failed — clean up orphan
        try { await auth.currentUser?.delete(); } catch (_) {}
    }
    // ... show error ...
}
```

---

## Info

### IN-01: `notifications.js` — `renderDropdownRows` injects `meta.color` directly into `style` attribute without escaping

**File:** `app/notifications.js:186-188`

**Issue:** `meta.color` comes from the hardcoded `TYPE_META` lookup object — not from user data — so injection is not possible in practice. However, the pattern `style="background:${meta.color}15;color:${meta.color};"` would become a risk if `TYPE_META` entries were ever populated from Firestore data. Worth noting as a pattern to avoid.

**Fix:** No immediate action required; document that `meta.color` must never be sourced from user-controlled data.

---

### IN-02: `mrf-form.js` — `requestor_user_id` stamped but no notification is sent at MRF submission time

**File:** `app/views/mrf-form.js:1774`

**Issue:** The `requestor_user_id` field is correctly stamped. However, the submission success message at line 1790 says "The procurement team has been notified" — but no NOTIF-08 `PR_REVIEW_NEEDED` notification is actually sent from `mrf-form.js`. The notification is sent only when a PR is generated (in `procurement.js`). The success message is technically misleading: the procurement team is not notified at MRF submission, only at PR generation time. This is a UX accuracy issue, not a functional bug.

**Fix:** Either send a `PR_REVIEW_NEEDED` (or new `MRF_SUBMITTED`) notification at submission time (wrapped in try/catch), or reword the success message:
```javascript
showAlert('success', `${typeLabel} submitted successfully! Your MRF ID is: ${mrfId}. The procurement team will review your request.`);
```

---

_Reviewed: 2026-04-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
