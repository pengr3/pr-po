---
slug: role-config-edit-not-saving
status: resolved
trigger: "Role configuration save is broken — checking the edit checkbox for a user scope (e.g. Operations user) and saving does not persist: the page refreshes with the box unchecked, and the role does not gain edit capabilities."
created: 2026-04-30
updated: 2026-04-30
---

## Symptoms

- **Location**: Admin / Settings view
- **Expected**: Checking "edit" checkbox for a user scope and saving should persist — user gains edit capabilities
- **Actual**: Page refreshes with checkbox unchecked; no role update in Firestore — silent failure (no console errors)
- **History**: Used to work, broke recently (commit 0af3038 introduced the regression)
- **Reproduction**: Admin/Settings → find user (e.g. Operations) → check "edit" checkbox → Save → observe checkbox reverts to unchecked

## Current Focus

hypothesis: RESOLVED
test: n/a
expecting: n/a
next_action: done

## Evidence

- timestamp: 2026-04-30
  observation: Regression introduced in commit 0af3038 — changed `batch.update(roleRef, updateObj)` to `batch.set(roleRef, updateObj, { merge: true })`
  significance: This is the root cause. Firestore's `set()` with `merge:true` does NOT expand dot-notation keys as field paths — it writes a literal top-level key named "permissions.tabs.dashboard.edit" instead of the nested structure. The `update()` method correctly expands dot-notation as nested field paths.

- timestamp: 2026-04-30
  observation: The `updateObj` is built with keys like `permissions.tabs.${tabId}.${permission}` — a dot-notation field path pattern
  significance: This pattern is only correctly handled by `update()`. With `set(..., { merge: true })`, these keys are treated as literal property names (containing dots), so the actual nested Firestore fields under `permissions.tabs` are never updated — the old values persist, the checkbox reverts on next render.

## Eliminated

- Security rules: `role_templates` allows `super_admin` write — not the issue
- onSnapshot re-render logic: correctly uses `roleTemplates` to render after save — not the issue
- pendingChanges clearing: cleared after commit, not before — not a race condition
- Network/auth errors: no console errors because `batch.set` with literal dot keys silently "succeeds" without touching the real nested fields

## Resolution

root_cause: >
  `batch.set(roleRef, updateObj, { merge: true })` was used with dot-notation keys like
  `permissions.tabs.dashboard.edit`. Firestore's `set()` does not interpret dot-notation as
  nested field paths — it writes a literal top-level key with dots in the name, leaving the
  actual nested `permissions.tabs` structure untouched. The commit silently writes junk fields
  and never updates the real permission values. On the next `onSnapshot`, `roleTemplates` is
  repopulated with the unchanged permission data, and `renderPermissionMatrix()` re-renders the
  checkboxes to their original (unchecked) state.

fix: >
  Reverted `batch.set(roleRef, updateObj, { merge: true })` back to `batch.update(roleRef, updateObj)`.
  Firestore's `update()` correctly expands dot-notation keys as nested field paths, so
  `permissions.tabs.dashboard.edit` correctly targets the nested field. Added an explanatory
  comment in the code to prevent this regression from recurring.

verification: >
  Manual UAT: Admin > Settings > check an edit checkbox > Save Changes → checkbox should remain
  checked after the onSnapshot re-render. Verify in Firebase console that the nested
  permissions.tabs.{tabId}.edit field is updated on the role_template document.

files_changed:
  - app/views/role-config.js (line 364: batch.set → batch.update; comment updated)
