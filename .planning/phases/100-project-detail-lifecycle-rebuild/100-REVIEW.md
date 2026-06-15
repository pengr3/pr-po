---
phase: 100-project-detail-lifecycle-rebuild
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - app/views/project-detail.js
  - firestore.rules
  - styles/views.css
findings:
  critical: 4
  warning: 6
  info: 3
  total: 13
status: fixed
fixed_at: 2026-06-08T00:00:00Z
---

# Phase 100: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 100 added a lifecycle accordion card to `project-detail.js` (10 build functions, 9 `window.lc*` functions, 3 helpers) plus expanded the `operations_user` field-mask in `firestore.rules` with 16 lifecycle fields, and appended 135 lines of lifecycle CSS.

The structural work is sound — the accordion pattern, track rendering, and doc-rollup are correct. However, the review surfaces four blockers: two missing role-check guards that allow any active user to perform gate transitions through the client-side permission helper, a client-side-only gate that is bypassable, and the `audit_log` subcollection having no security rules at all. Six additional warnings cover the optimistic-update mismatch on failed writes, missing URL validation for pasted links, a `null` currentUser passed to `buildLifecycleBodyInPlace` in all three attachment functions, and other quality concerns.

---

## Critical Issues

### CR-01: `lcAttachLink` / `lcAttachFile` / `lcRemoveDoc` pass `null` as `currentUser` to `buildLifecycleBodyInPlace`, suppressing the admin-only Completion button on re-render

**File:** `app/views/project-detail.js:2402, 2415, 2428`

**Issue:** All three attachment window functions call `buildLifecycleBodyInPlace(currentProject, null)` for the optimistic re-render. `buildLifecycleBody()` (line 2160) reads `currentUser?.role` to decide whether to enable the "Mark as Completed" button. Passing `null` always evaluates `isAdmin` as `false`, so after attaching Completion Report or COC, the button stays disabled until the next full `renderProjectDetail()` fires (e.g., on the Firestore snapshot). For an admin, this means they attach the last required document and the action button does not appear — they must wait for or manually trigger a re-render. This is incorrect behavior for a gate-critical action.

**Fix:**
```javascript
// In all three attachment functions, pass the current user instead of null:
buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
```
Lines to fix: 2402, 2415, 2428.

---

### CR-02: `_canAdvanceProjectStatus` is client-side only — `lcAdvanceToForProposal` writes directly to Firestore with no server-side role enforcement for the `For Inspection → For Proposal` transition

**File:** `app/views/project-detail.js:2446-2454`

**Issue:** `lcAdvanceToForProposal` checks `_canAdvanceProjectStatus()` (lines 2319-2331) client-side, then calls `updateDoc()` on `project_status`. The Firestore rule for `operations_user` project updates (firestore.rules lines 221-233) uses a `hasOnly()` field-mask that includes `project_status`. Any active `operations_user` who is in `personnel_user_ids` can write `project_status` to any value — including `For Proposal` — directly via the Firebase SDK without going through the JS client. The `inspection_report_url` document-presence check also happens only client-side. There is no server-side document-presence gate.

The same issue applies to `lcStartMobilization` (`ntp_document_url` presence check), `lcStartProject` (no document gate, at least client-side is fine), and `lcMarkProjectComplete` (`completion_report_url` + `certificate_of_completion_url` presence check + admin-only role gate). An adversarial `operations_user` can bypass all of these guards via the SDK.

**Severity note:** This is the inherent risk of a serverless SPA without Cloud Functions. The Firestore rules do restrict _which fields_ `operations_user` can write (field-mask), and write logs are auditable. However, the `_canAdvanceProjectStatus` admin-only gate for `Completed` (line 2322) is entirely unenforceable — any assigned `operations_user` can mark the project Completed by writing `project_status: 'Completed'` directly.

**Fix (recommended):** Add a custom `allow update` branch that restricts `project_status` transitions by source status. At minimum, document this as an accepted risk. For the `Completed` gate specifically, either add a server-side check or move the Completed transition to an admin-only Firestore rule branch:
```javascript
// In firestore.rules, split the operations_user update rule:
// Branch A: status-only field writes except 'Completed'
isRole('operations_user') &&
request.auth.uid in resource.data.personnel_user_ids &&
resource.data.project_status != 'Completed' &&          // cannot close from Completed
request.resource.data.get('project_status', resource.data.project_status) != 'Completed' && // cannot set to Completed
request.resource.data.diff(resource.data).affectedKeys().hasOnly([...16 fields...])
```

---

### CR-03: `audit_log` subcollection written by `addProjectAuditEntry()` has no Firestore security rules — all writes will be denied in production

**File:** `firestore.rules` (entire file — no `audit_log` match block under `/projects/{projectId}`), `app/views/project-detail.js:2333-2344`

**Issue:** `addProjectAuditEntry()` writes to `projects/{projectId}/audit_log/{id}` via `addDoc()`. The `firestore.rules` file has a `match /projects/{projectId}` block with two subcollection rules (`edit_history` and `baselines`) but no rule for `audit_log`. Firestore denies all unmatched paths by default. Every `addProjectAuditEntry` call — fired after each gate transition — will throw a permission error. Because the function swallows the error (`console.error` only), the gate transition still succeeds but the audit trail is silently lost.

**Fix:** Add an `audit_log` subcollection rule under `match /projects/{projectId}`:
```javascript
// Append-only project lifecycle audit trail (Phase 100)
match /audit_log/{entryId} {
    allow read: if isActiveUser();
    // Create: any role that can trigger lifecycle transitions
    allow create: if hasRole(['super_admin', 'operations_admin']) ||
                     (isRole('operations_user') && request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.personnel_user_ids);
    allow update: if false;
    allow delete: if false;
}
```

---

### CR-04: `lcAttachLink` performs no URL validation — any string (including `javascript:` URIs) can be stored as `_url` in Firestore and rendered as an `<a href>` in `buildDocRollup`

**File:** `app/views/project-detail.js:2393-2408`

**Issue:** `lcAttachLink` reads the input value and only checks it is non-empty (line 2398). It does not validate the scheme. If a user (or an adversarial actor who exploits a different attack surface) stores `javascript:alert(1)` as a document URL, `buildDocRollup` renders it verbatim as `<a href="${escapeHTML(url)}" ...>Open ↗</a>` (line 2099). `escapeHTML` HTML-encodes the URL string but does not strip the `javascript:` scheme. This is a stored XSS vector via `href`.

**Fix:** Validate that the URL starts with `https://` or `http://` before storing:
```javascript
const url = el ? el.value.trim() : '';
if (!url || !/^https?:\/\//i.test(url)) {
    if (el) { el.style.borderColor = '#ef4444'; setTimeout(() => { el.style.borderColor = ''; }, 1400); }
    showToast('Please enter a valid https:// link.');
    return;
}
```
This should also be applied to `buildAttachZone`'s input (line 2036, `type="url"` helps on the frontend but does not prevent SDK bypasses or future JS usage of the stored value).

---

## Warnings

### WR-01: Optimistic update in `lcAttachLink` / `lcAttachFile` / `lcRemoveDoc` mutates `currentProject` before the Firestore write — a write failure leaves the in-memory project permanently out of sync with Firestore

**File:** `app/views/project-detail.js:2399-2407, 2412-2420, 2425-2433`

**Issue:** All three attachment functions follow the pattern:
1. Mutate `currentProject[dk.prefix + '_url'] = url` (optimistic update)
2. Call `buildLifecycleBodyInPlace` (renders the mutated state)
3. `await _attachDocumentToProject(...)` (Firestore write)

If the `updateDoc` inside `_attachDocumentToProject` throws (e.g., network error, permission error), the catch block on line 2354 shows a toast but does NOT roll back the `currentProject` mutation. The UI now shows "document attached" even though Firestore did not receive the write. The Firestore `onSnapshot` listener will eventually correct this, but only if the listener is still alive and the user does not navigate away first.

**Fix:** Capture pre-mutation state and roll back on error:
```javascript
window.lcAttachLink = async function(which) {
    const dk = LC_DOC_KEYS[which];
    if (!dk || !currentProject) return;
    const el = document.getElementById('az' + dk.L + 'Link');
    const url = el ? el.value.trim() : '';
    if (!url) { /* ... highlight ... */ return; }
    // Capture rollback state
    const prev = {
        [dk.prefix + '_url']:      currentProject[dk.prefix + '_url'],
        [dk.prefix + '_kind']:     currentProject[dk.prefix + '_kind'],
        [dk.prefix + '_filename']: currentProject[dk.prefix + '_filename'],
    };
    // Optimistic update
    currentProject[dk.prefix + '_url'] = url;
    currentProject[dk.prefix + '_kind'] = 'link';
    currentProject[dk.prefix + '_filename'] = null;
    buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
    try {
        await _attachDocumentToProject(currentProject.id, { ...fields });
    } catch {
        Object.assign(currentProject, prev);    // rollback
        buildLifecycleBodyInPlace(currentProject, window.getCurrentUser?.() || null);
    }
};
```

---

### WR-02: `buildLifecycleTrack` maps `Loss` to `curIdx = 4` which is the `Client Approved` node — Loss should not highlight any node

**File:** `app/views/project-detail.js:2206-2208`

**Issue:** When `status === 'Loss'`, the code sets `curIdx = 4` (line 2207). `LC_STAGES[4]` is `Client Approved`. The loop then renders that node as `isCurrent` (i.e., `s-current-node` + `chip-here`). Loss should either have no current node (`curIdx = -1`) or render all nodes as past, since Loss is a terminal state that does not correspond to `Client Approved`. The visual track shows `Client Approved ← HERE` for a lost project, which is misleading.

The Loss indicator appended after the loop (lines 2247-2249) is correct, but the track node highlighting is wrong.

**Fix:**
```javascript
if (status === 'Loss') {
    curIdx = -1;  // no node is "current" for loss
```
This makes every node either "past" (already completed before loss) or "future" (not reached). The `isLossNode` check in `circClass` (line 2222) will no longer trigger since `isCurrent` would only be true if `curIdx === i` and `curIdx === -1` never equals any valid index — but verify the intent is to show nodes prior to the loss state as done.

---

### WR-03: `_canAdvanceProjectStatus` returns `true` for any `operations_user` in `personnel_user_ids` for ALL non-Completed transitions — this allows field staff to mobilize, start, and complete gate transitions that should be admin-supervised

**File:** `app/views/project-detail.js:2319-2331`

**Issue:** The function allows `operations_user` in `personnel_user_ids` to advance status for all targets except `'Completed'`. This means any assigned field user can:
- Advance `For Inspection → For Proposal` (arguably acceptable)
- Start mobilization (`Client Approved → For Mobilization`) — a significant financial commitment
- Start the project (`For Mobilization → On-going`) — formal project kickoff

Based on the button labels ("Operations Admin · role-gated" in `For Inspection` status line 2119, "Records mobilization_started_at" at line 2141) and the Firestore rule comment referencing "operations_user assigned to the project may update project_status + updated_at only", it appears the design intent was for operations_user to be allowed. However, `lcStartMobilization` and `lcStartProject` have no comment documenting this deliberate permission, making it appear as an oversight.

**Recommendation:** Add explicit comments to `_canAdvanceProjectStatus` stating that `operations_user` is intentionally allowed for mobilization and start transitions, or restrict those two gates to admins if the design intent was otherwise.

---

### WR-04: `buildLifecycleBody` wraps every branch with `buildDocRollup(project)` but the `For Proposal`, `Proposal for Internal Approval`, `Proposal Under Client Review/For Revision`, and `Loss` branches show "already implemented" content — the doc rollup is shown for statuses where it is irrelevant (0 of 4 docs expected)

**File:** `app/views/project-detail.js:2107-2108, 2122-2130`

**Issue:** The `wrap()` inner helper appends `buildDocRollup(project)` to every branch unconditionally (line 2108). For proposal-stage statuses, all 4 doc slots will appear as empty/greyed-out (`ds-empty`, 40% opacity), which adds visual noise with no actionable information. The `For Proposal` and internal/client review stages are "already implemented" pass-through sections.

**Fix:** Either exclude `buildDocRollup` for proposal-range statuses, or have the `wrap()` helper accept a flag:
```javascript
function wrap(gateTitle, inner, showRollup = true) {
    return `<div class="gate-label">${gateTitle}</div>${inner}${showRollup ? buildDocRollup(project) : ''}`;
}
// For proposal statuses:
return wrap('Proposal Stage', `...already-implemented content...`, false);
```

---

### WR-05: The `lcAdvanceToForProposal` and `lcStartMobilization` gate functions do not call `showToast()` with a toast _type_ argument — the "no arg" call may render without an error/success color class

**File:** `app/views/project-detail.js:2448, 2449, 2458, 2459, 2464, 2470, 2475, 2481, 2482, 2485`

**Issue:** Several `showToast(message)` calls in the `lc*` window functions omit the second argument (the type). Looking at the project pattern (e.g., `showToast('Inspection report required.', 'error')`), most error-case toasts pass `'error'`. The no-type calls at lines 2448, 2458, 2470, 2481 will render as the default toast style (typically info/neutral) rather than an error style, making validation failures look like informational messages rather than blocking errors.

**Fix:** Add `'error'` type to all validation-failure and permission-denied toast calls:
```javascript
if (!currentProject.inspection_report_url) { showToast('Inspection report required.', 'error'); return; }
if (!_canAdvanceProjectStatus(...)) { showToast('Permission denied.', 'error'); return; }
```

---

### WR-06: `updateLifecycleBadge` uses a fragile DOM selector to find and manage the "Action needed" hint span — a CSS style string match that breaks if the style is reformatted

**File:** `app/views/project-detail.js:2296`

**Issue:** The function locates the hint span using:
```javascript
const hintSpan = document.querySelector('#lcAccordion .lc-header-right span[style*="f59e0b"]');
```
This queries by partial inline-style string (`f59e0b`), which is fragile. If the color value is ever changed, or if a browser normalizes the color (e.g., to `rgb(245, 158, 11)`), the selector silently fails to find the span and the hint is neither found nor removed, resulting in multiple "Action needed" spans accumulating on repeated calls to `updateLifecycleBadge`. Since this function is called every time the project snapshot fires (via `buildLifecycleBodyInPlace`) with the accordion open, this can produce visual duplication.

**Fix:** Add a stable `id` or `data-` attribute to the hint span:
```javascript
// In renderLifecycleCard():
if (gated && !_lcOpen) '<span id="lcActionHint" style="font-size:11px;color:#f59e0b;">Action needed &#8595;</span>'
// In updateLifecycleBadge():
const hintSpan = document.getElementById('lcActionHint');
if (right) right.insertAdjacentHTML('afterbegin', '<span id="lcActionHint" style="...">Action needed &#8595;</span>');
```

---

## Info

### IN-01: `buildLifecycleBodyInPlace` is called without awaiting `_attachDocumentToProject` completion — the body is rebuilt from stale optimistic state, not from server-confirmed state

**File:** `app/views/project-detail.js:2192-2199`

**Issue:** `buildLifecycleBodyInPlace` is a synchronous function that reads `currentProject` (the optimistically mutated in-memory object) and renders. There is no issue with this _in isolation_ since optimistic updates are intentional — but it is worth noting the function signature says `if (!project) return` but the body reads `currentProject` indirectly via `buildLifecycleBody(project, currentUser)` where `project` is the argument. The `track` and `body` are rendered from the passed-in `project`, which is always `currentProject` at call sites. This is consistent. Noted for awareness only.

---

### IN-02: `buildLifecycleTrack` references `LC_STAGES[4]` implicitly for the `Loss` state by setting `curIdx = 4`; the track has 8 stages (indices 0-7) — this produces a rendering anomaly (see WR-02) but also means `s-revision-node` at index 2 is never rendered for `For Revision` in the track because `status === 'For Revision'` maps to `Proposal Under Client Review` at index 3, making `curIdx = 3`, and `isRevNode = i === 3 && status === 'For Revision'` — this is correct. Confirmed correct.

**File:** `app/views/project-detail.js:2208-2211`

**Issue:** Minor comment — the `For Revision` mapping in `buildLifecycleTrack` uses `findIndex(sg => sg.status === 'Proposal Under Client Review')` which is the right choice since `For Revision` has no stage node of its own in `LC_STAGES` (the `For Revision` status is not in the constant). This is intentional and works correctly. Flagged only to confirm the logic was checked.

---

### IN-03: `views.css` lifecycle section uses CSS custom property references (`var(--border)`, `var(--bg)`, `var(--primary)`, `var(--muted)`, `var(--text)`, `var(--text2)`, `var(--success)`) that are defined elsewhere — confirm these variables are globally declared in `main.css`

**File:** `styles/views.css:3760-3890`

**Issue:** The lifecycle accordion CSS (lines 3757-3891) references several CSS variables. The standard app colors (`--primary`, `--success`) are used throughout the existing codebase and are confirmed defined. However, `--border`, `--bg`, `--muted`, `--text`, `--text2` are less commonly used. If any of these are not declared in `main.css` or `:root`, affected elements will fall back to the initial value (transparent/inherit) and appear unstyled. This should be verified in the browser.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
