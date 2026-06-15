---
phase: 100-project-detail-lifecycle-rebuild
fixed_at: 2026-06-08T00:00:00Z
review_path: .planning/phases/100-project-detail-lifecycle-rebuild/100-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 100: Code Review Fix Report

**Fixed at:** 2026-06-08
**Source review:** `.planning/phases/100-project-detail-lifecycle-rebuild/100-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (4 Critical + 6 Warning; Info findings excluded per scope)
- Fixed: 10
- Skipped: 0

All 10 in-scope findings were fixed and committed atomically in a single commit: `2da2f97`

---

## Fixed Issues

### CR-01: `lcAttachLink` / `lcAttachFile` / `lcRemoveDoc` pass `null` currentUser to `buildLifecycleBodyInPlace`

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Replaced all three `buildLifecycleBodyInPlace(currentProject, null)` calls with `buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null)` — ensures the admin-only Completion button renders correctly on optimistic re-render.

---

### CR-02: `operations_user` can set `project_status` to `'Completed'` via Firestore SDK

**Files modified:** `firestore.rules`
**Commit:** 2da2f97
**Applied fix:** Added two guards to the `operations_user` update branch: `resource.data.project_status != 'Completed'` and `request.resource.data.get('project_status', resource.data.project_status) != 'Completed'` — blocks any `operations_user` from transitioning TO or FROM `Completed` status at the Firestore rules layer.

---

### CR-03: `audit_log` subcollection has no Firestore security rules — writes denied in production

**Files modified:** `firestore.rules`
**Commit:** 2da2f97
**Applied fix:** Added `match /audit_log/{entryId}` block inside `match /projects/{projectId}` with read for all active users, append-only create for `super_admin`/`operations_admin` or an `operations_user` with UID in `personnel_user_ids`, and `update: false` / `delete: false`.

---

### CR-04: `lcAttachLink` performs no URL validation — `javascript:` URIs can be stored

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Added `!/^https?:\/\//i.test(url)` validation before storing. Invalid or empty URLs now show a border-color error flash and `showToast('Please enter a valid https:// link.', 'error')` and return early without mutating state.

---

### WR-01: Optimistic update mutates `currentProject` before Firestore write — no rollback on failure

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** All three attachment functions (`lcAttachLink`, `lcAttachFile`, `lcRemoveDoc`) now capture a `prev` snapshot of the three document fields before mutating `currentProject`. The `_attachDocumentToProject` call is wrapped in try/catch — on failure, `Object.assign(currentProject, prev)` restores the in-memory state and `buildLifecycleBodyInPlace` re-renders the rollback. `_attachDocumentToProject` itself was also simplified to a throwing function (removed the internal try/catch that was swallowing errors) so callers can handle failures properly.

---

### WR-02: `buildLifecycleTrack` maps `Loss` to `curIdx = 4` (Client Approved node)

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Changed `curIdx = 4` to `curIdx = -1` for `status === 'Loss'`. With `-1`, no stage node is highlighted as current; nodes that were completed before the loss appear as `s-done-node`, and the Loss indicator appended at the end remains correct.

---

### WR-03: `_canAdvanceProjectStatus` missing comment explaining `operations_user` intent

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Added comments to `_canAdvanceProjectStatus` explaining that: (a) `Completed` is admin-only and enforced both client-side and in Firestore rules (CR-02), and (b) `operations_user` in `personnel_user_ids` is intentionally permitted for all non-Completed gate transitions (field staff advancing status after meeting document requirements is the design intent).

---

### WR-04: `buildDocRollup` shown for proposal-stage statuses where all doc slots are empty

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Changed `wrap()` signature to `wrap(gateTitle, inner, showRollup = true)` and passed `false` as the third argument for `For Proposal`, `Proposal for Internal Approval`, `Proposal Under Client Review`, `For Revision`, and `Loss` statuses. Document rollup now only renders for gate statuses where documents are actionable.

---

### WR-05: Toast calls in `lc*` functions omit `'error'` type for validation failures

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Added `'error'` as the second argument to all `showToast()` calls in `lcAdvanceToForProposal`, `lcStartMobilization`, `lcStartProject`, and `lcMarkProjectComplete` — covering both validation-failure guards (missing doc, missing docs) and permission-denied guards, as well as the catch-block failure toasts.

---

### WR-06: `updateLifecycleBadge` uses fragile CSS selector with partial style string match

**Files modified:** `app/views/project-detail.js`
**Commit:** 2da2f97
**Applied fix:** Two-part change: (1) In `renderLifecycleCard()`, added `id="lcActionHint"` to the hint span element. (2) In `updateLifecycleBadge()`, replaced `document.querySelector('#lcAccordion .lc-header-right span[style*="f59e0b"]')` with `document.getElementById('lcActionHint')`, and updated the `insertAdjacentHTML` call to include `id="lcActionHint"` on the dynamically inserted span.

---

_Fixed: 2026-06-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
