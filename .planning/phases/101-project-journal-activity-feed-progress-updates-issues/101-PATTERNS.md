# Phase 101: Project Journal — Activity Feed, Progress Updates, Issues — Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 3 (project-detail.js, firestore.rules, procurement.js)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/views/project-detail.js` | view + service | CRUD + event-driven + real-time | `app/views/project-detail.js` (existing, extended) | exact — adding to same file |
| `firestore.rules` | config | request-response | `firestore.rules` — `/baselines/{baselineId}` + `/audit_log/{entryId}` | exact |
| `app/views/procurement.js` | view | event-driven | `app/views/procurement.js` `updatePOStatus()` NOTIF-18 block | exact |

---

## Pattern Assignments

### `app/views/project-detail.js` — Journal Panel (inline extension)

**Analog:** The file itself — patterns from `ensureTasksListener`, `ensureBillingRequestsListener`, `destroy()`, `addProjectAuditEntry`, `saveField`, `lcAdvanceToForProposal` through `lcMarkProjectComplete`.

---

#### Imports pattern (lines 6–13)

```javascript
import { db, collection, doc, getDoc, updateDoc, deleteDoc, onSnapshot, query, where,
         getDocs, writeBatch, getAggregateFromServer, sum, count, addDoc, serverTimestamp
       } from '../firebase.js';
import { formatCurrency, formatDate, showLoading, showToast, normalizePersonnel,
         syncPersonnelToAssignments, downloadCSV, escapeHTML, generateProjectCode, getRFPFees
       } from '../utils.js';
import { createNotificationForUsers, createNotificationForRoles, NOTIFICATION_TYPES } from '../notifications.js';
```

New journal code needs the same imports — `addDoc`, `serverTimestamp`, `onSnapshot`, `query`, `orderBy`, `limit` from firebase.js; `escapeHTML`, `formatCurrency` from utils.js; `getCurrentUser` via `window.getCurrentUser?.()` (already wired in app/auth.js).

**`orderBy` and `limit` must be added** to the firebase.js import line since subcollections use `orderBy('created_at', 'desc')` with an initial-load limit.

---

#### Module-scope listener variables (lines 15–43)

Pattern: each independent Firestore listener gets its own `let` variable and is torn down in `destroy()`.

```javascript
// Add these alongside existing listener vars:
let journalActivityUnsub = null;
let journalProgressUnsub = null;
let journalIssuesUnsub = null;
let journalActivityEntries = [];
let journalProgressUpdates = [];
let journalIssues = [];
let _activeJournalTab = 'activity'; // default tab
```

---

#### Idempotent listener attach pattern (lines 274–331)

Copy `ensureTasksListener` / `ensureBillingRequestsListener` verbatim — same guard pattern, same in-place re-render target.

```javascript
// From ensureBillingRequestsListener (lines 298–312) — canonical pattern:
function ensureJournalListeners() {
    if (!currentProject?.id) return;
    const projectId = currentProject.id;

    if (!journalActivityUnsub) {
        journalActivityUnsub = onSnapshot(
            query(
                collection(db, 'projects', projectId, 'activity_entries'),
                orderBy('created_at', 'desc'),
                limit(50)
            ),
            (snap) => {
                journalActivityEntries = [];
                snap.forEach(d => journalActivityEntries.push({ id: d.id, ...d.data() }));
                _renderJournalPanelInPlace();
            },
            (err) => { console.error('[ProjectDetail/Journal] activity_entries snapshot error:', err); }
        );
    }
    // Repeat for journalProgressUnsub and journalIssuesUnsub
}
```

---

#### Destroy teardown pattern (lines 371–387)

```javascript
// From destroy() lines 371–387 — canonical teardown:
if (billingRequestsListenerUnsub) { try { billingRequestsListenerUnsub(); } catch (e) { /* swallow */ } }
billingRequestsListenerUnsub = null;
currentBillingRequests = [];
```

New journal listeners must follow the same `try { unsub(); } catch(e) {}; = null; data = []` three-line pattern:

```javascript
if (journalActivityUnsub) { try { journalActivityUnsub(); } catch (e) { /* swallow */ } }
journalActivityUnsub = null;
journalActivityEntries = [];

if (journalProgressUnsub) { try { journalProgressUnsub(); } catch (e) { /* swallow */ } }
journalProgressUnsub = null;
journalProgressUpdates = [];

if (journalIssuesUnsub) { try { journalIssuesUnsub(); } catch (e) { /* swallow */ } }
journalIssuesUnsub = null;
journalIssues = [];
_activeJournalTab = 'activity';
```

---

#### Subcollection addDoc write pattern (lines 2343–2354)

`addProjectAuditEntry` is the canonical subcollection write in this file. The journal `_addActivityEntry` helper must mirror it exactly.

```javascript
// addProjectAuditEntry (lines 2343–2354) — copy this shape:
async function addProjectAuditEntry(projectId, action, actorId, actorName, comment) {
    try {
        await addDoc(collection(db, 'projects', projectId, 'audit_log'), {
            action,
            actor_id: actorId || '',
            actor_name: actorName || 'Unknown',
            comment: comment || '',
            created_at: serverTimestamp(),
        });
    } catch (err) {
        console.error('[ProjectDetail] addProjectAuditEntry failed:', err);
    }
}
```

New journal helper mirrors this:

```javascript
async function _addActivityEntry(projectId, { type, text, is_system = false }) {
    try {
        const cu = window.getCurrentUser?.();
        await addDoc(collection(db, 'projects', projectId, 'activity_entries'), {
            type,
            text,
            is_system,
            created_by_uid: cu?.uid ?? '',
            created_by_name: cu?.full_name || cu?.email || 'Unknown',
            created_at: serverTimestamp(),
        });
    } catch (err) {
        console.error('[ProjectDetail/Journal] _addActivityEntry failed:', err);
    }
}
```

---

#### Lifecycle gate auto-entry pattern (lines 2488–2530)

Each gate function has this structure: guard → permission check → `updateDoc` → `addProjectAuditEntry`. Phase 101 adds an `_addActivityEntry` call **after** `addProjectAuditEntry` succeeds, in the same `try` block.

```javascript
// lcAdvanceToForProposal (lines 2489–2497) — current shape:
window.lcAdvanceToForProposal = async function(projectId) {
    if (!currentProject || currentProject.id !== projectId) return;
    if (!currentProject.inspection_report_url) { showToast('Inspection report required.', 'error'); return; }
    const cu = window.getCurrentUser?.();
    if (!_canAdvanceProjectStatus(currentProject, cu, 'For Proposal')) { showToast('Permission denied.', 'error'); return; }
    try {
        await updateDoc(doc(db, 'projects', projectId), { project_status: 'For Proposal', updated_at: serverTimestamp() });
        await addProjectAuditEntry(projectId, 'ADVANCED_TO_FOR_PROPOSAL', cu?.uid, cu?.full_name, '');
        // Phase 101 — ADD THIS after addProjectAuditEntry:
        await _addActivityEntry(projectId, {
            type: 'system', is_system: true,
            text: `Status advanced to For Proposal by ${cu?.full_name || 'Unknown'}`
        });
    } catch (err) { console.error('[ProjectDetail] lcAdvanceToForProposal failed:', err); showToast('Failed to advance status.', 'error'); }
};
```

Apply the same `await _addActivityEntry(...)` call inside the `try` block of all four gate functions: `lcAdvanceToForProposal`, `lcStartMobilization`, `lcStartProject`, `lcMarkProjectComplete`.

---

#### Delta detection pattern for budget/contract_cost auto-entries (lines 1226–1287)

The `saveField` function already has delta detection for `budget` / `contract_cost` (NOTIF-19, lines 1265–1285). Phase 101 grafts an `_addActivityEntry` call into the same block.

```javascript
// Lines 1265–1285 — NOTIF-19 block (current):
const NOTIF19_COST_FIELDS = ['budget', 'contract_cost'];
if (NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave) {
    // existing createNotificationForUsers block ...
}

// Phase 101 — ADD after the notification block (same condition, separate try/catch):
if (NOTIF19_COST_FIELDS.includes(fieldName) && normalizedOld !== valueToSave) {
    const fieldLabel = fieldName === 'contract_cost' ? 'Contract Cost' : 'Budget';
    const oldDisplay = (normalizedOld != null) ? `PHP ${formatCurrency(normalizedOld)}` : '(not set)';
    const newDisplay = (valueToSave != null) ? `PHP ${formatCurrency(valueToSave)}` : '(not set)';
    const cu = window.getCurrentUser?.();
    _addActivityEntry(currentProject.id, {
        type: 'system', is_system: true,
        text: `${fieldLabel} changed: ${oldDisplay} → ${newDisplay} by ${cu?.full_name || 'Unknown'}`
    }).catch(err => console.error('[ProjectDetail] Journal cost-change auto-entry failed:', err));
}
```

**Critical:** `_addActivityEntry` is fire-and-forget here (`.catch()` not `await`) — never block `saveField`.

---

#### Read-only mode gate pattern

The journal panel must gate on project status. Use the same boolean-injection pattern already used in the billing/personnel edit controls:

```javascript
// Lines 499–500 — existing permission gate pattern:
const user = window.getCurrentUser?.();
const canEditPersonnel = showEditControls && (user?.role === 'super_admin' || user?.role === 'operations_admin');
```

Journal gate:

```javascript
const JOURNAL_WRITE_STATUSES = ['For Mobilization', 'On-going'];
const isJournalVisible = JOURNAL_WRITE_STATUSES.includes(currentProject.project_status)
    || currentProject.project_status === 'Completed';
const isJournalReadOnly = currentProject.project_status === 'Completed';
```

Inject into the `renderProjectDetail()` HTML — panel is conditionally rendered by `isJournalVisible`, composer conditionally shown by `!isJournalReadOnly`.

---

#### In-place partial re-render pattern (lines 284–290)

Used by `ensureTasksListener` when only the plan card needs updating — avoids full `renderProjectDetail()` re-render.

```javascript
// Lines 284–290 — plan card in-place re-render:
const cardEl = document.getElementById('projectPlanCard');
if (cardEl) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildPlanCardHtml();
    cardEl.replaceWith(tmp.firstElementChild);
}
```

Journal panel must have a stable `id="projectJournalPanel"`. When a snapshot fires, call `_renderJournalPanelInPlace()` which does:

```javascript
function _renderJournalPanelInPlace() {
    const el = document.getElementById('projectJournalPanel');
    if (!el || !currentProject) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildJournalPanelHtml(currentProject);
    el.replaceWith(tmp.firstElementChild);
}
```

---

#### DOM-only tab switching pattern (from lcSwitchTab, lines 2478–2487)

`lcSwitchTab` switches display/active on pre-rendered DOM panels. Journal tab switching follows the same DOM-only pattern (no new Firestore listener per switch — all 3 listeners run simultaneously from `ensureJournalListeners`).

```javascript
// lines 2478–2487 — lcSwitchTab DOM-only switch:
window.lcSwitchTab = function(L, tab) {
    const lp = document.getElementById('az' + L + 'LinkP');
    const fp = document.getElementById('az' + L + 'FileP');
    if (lp) lp.style.display = tab === 'link' ? '' : 'none';
    if (fp) fp.style.display = tab === 'file' ? '' : 'none';
    if (lt) lt.classList.toggle('active', tab === 'link');
    if (ft) ft.classList.toggle('active', tab === 'file');
};
```

Journal tab switch:

```javascript
window.switchJournalTab = function(tab) {
    _activeJournalTab = tab;
    ['activity', 'progress', 'issues'].forEach(t => {
        const panel = document.getElementById('journalTab-' + t);
        const btn = document.getElementById('journalTabBtn-' + t);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
};
window.switchJournalTab = switchJournalTab; // required for onclick
```

---

#### Issue resolution — required-notes pattern (from finance.js rejectBillingRequest, lines 2211–2232)

D-11: resolution notes are required. Mirror the billing-request rejection pattern exactly.

```javascript
// finance.js lines 2216–2217 — required prompt pattern:
const reason = (window.prompt('Reason for rejecting this billing request (required):') || '').trim();
if (!reason) { showToast('A rejection reason is required.', 'error'); return; }
```

Issue resolution analog:

```javascript
window.resolveIssue = async function(issueId) {
    const notes = (window.prompt('Resolution notes (required):') || '').trim();
    if (!notes) { showToast('Resolution notes are required.', 'error'); return; }
    const cu = window.getCurrentUser?.();
    try {
        await updateDoc(doc(db, 'projects', currentProject.id, 'issues', issueId), {
            status: 'resolved',
            resolution_notes: notes,
            resolved_at: serverTimestamp(),
            resolved_by_uid: cu?.uid ?? '',
        });
        // Auto-entry per D-12
        const issue = journalIssues.find(i => i.id === issueId);
        if (issue) {
            const issueNum = _issueSeqNum(issueId);
            await _addActivityEntry(currentProject.id, {
                type: 'system', is_system: true,
                text: `Issue #${issueNum} (${escapeHTML(issue.issue_type)} — ${escapeHTML(issue.title)}) resolved by ${cu?.full_name || 'Unknown'}`
            });
        }
        showToast('Issue resolved.', 'success');
    } catch (err) {
        console.error('[ProjectDetail/Journal] resolveIssue failed:', err);
        showToast('Failed to resolve issue. Please try again.', 'error');
    }
};
```

---

#### escapeHTML usage pattern (from notifications.js renderDropdownRows)

All user-supplied text rendered via innerHTML must be escaped. Pattern from notifications.js lines 193–220:

```javascript
// notifications.js line 194 — always escape user strings:
const meta = TYPE_META[n.type] || { label: escapeHTML(n.type || 'Notification'), ... };
const safeObjName = escapeHTML(n.object_name || n.message || '');
```

In journal HTML builders:

```javascript
// For every entry rendered to innerHTML:
`<span class="entry-text">${escapeHTML(entry.text)}</span>`
`<span class="issue-title">${escapeHTML(issue.title)}</span>`
`<span class="issue-description">${escapeHTML(issue.description)}</span>`
`<span class="resolution-notes">${escapeHTML(issue.resolution_notes || '')}</span>`
```

---

#### Window function registration pattern (lines 2364–2531 `attachWindowFunctions`)

All `onclick` handlers registered in `attachWindowFunctions()` and deleted in `destroy()`.

```javascript
// In attachWindowFunctions():
window.switchJournalTab = switchJournalTab;
window.postActivityEntry = postActivityEntry;
window.submitProgressUpdate = submitProgressUpdate;
window.submitNewIssue = submitNewIssue;
window.resolveIssue = resolveIssue;
window.reopenIssue = reopenIssue;

// In destroy() (lines 402–414 pattern):
delete window.switchJournalTab;
delete window.postActivityEntry;
delete window.submitProgressUpdate;
delete window.submitNewIssue;
delete window.resolveIssue;
delete window.reopenIssue;
```

---

### `firestore.rules` — Three new subcollection blocks

**Analog:** `match /projects/{projectId}/baselines/{baselineId}` (lines 252–257) + `match /projects/{projectId}/audit_log/{entryId}` (lines 259–267)

#### Baselines template (lines 252–257) — read-all + admin write:

```javascript
match /baselines/{baselineId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'operations_admin']);
    allow update: if false;   // baselines are immutable once written
    allow delete: if hasRole(['super_admin', 'operations_admin']);
}
```

#### Audit log template (lines 259–267) — any project-assigned user can create, append-only:

```javascript
match /audit_log/{entryId} {
    allow read: if isActiveUser();
    allow create: if hasRole(['super_admin', 'operations_admin']) ||
                     (isRole('operations_user') && request.auth.uid in get(/databases/$(database)/documents/projects/$(projectId)).data.personnel_user_ids);
    allow update: if false;
    allow delete: if false;
}
```

#### Phase 101 subcollection rules (copy inside `match /projects/{projectId}` block):

```javascript
// activity_entries subcollection (Phase 101 — append-only journal entries)
// Create: any active user (D-15: all roles with project access can post)
// No update or delete — append-only audit trail
match /activity_entries/{entryId} {
    allow read: if isActiveUser();
    allow create: if isActiveUser();
    allow update: if false;
    allow delete: if false;
}

// progress_updates subcollection (Phase 101 — structured check-ins)
// Create: any active user. No update or delete — append-only.
match /progress_updates/{updateId} {
    allow read: if isActiveUser();
    allow create: if isActiveUser();
    allow update: if false;
    allow delete: if false;
}

// issues subcollection (Phase 101 — categorized punch list with open/resolved state)
// Create: any active user. Update: any active user (for resolve/reopen transitions).
// No delete — issues are permanent records.
match /issues/{issueId} {
    allow read: if isActiveUser();
    allow create: if isActiveUser();
    allow update: if isActiveUser();  // open↔resolved transitions, D-13
    allow delete: if false;
}
```

**Note on placement:** Add these three blocks immediately after the existing `audit_log` block (line 268), still inside `match /projects/{projectId}`. Follow the comment format already used (`// baselines subcollection`, `// audit_log subcollection`).

---

### `app/views/procurement.js` — PO Delivered auto-entry (line 7924)

**Analog:** `updatePOStatus` NOTIF-18 block (lines 7921–7961) — already handles `newStatus === 'Delivered' && !isSubcon` with a try/catch fire-and-forget notification.

```javascript
// Lines 7921–7961 — current Delivered handler:
if (newStatus === 'Delivered' && !isSubcon) {
    try {
        const poDocFresh = await getDoc(poRef);
        const poDataFresh = poDocFresh.data() || {};
        // ... recipients build ...
        if (recipients.length > 0) {
            await createNotificationForUsers({ ... type: NOTIFICATION_TYPES.PO_DELIVERED ... });
        }
    } catch (notifErr) {
        console.error('[Procurement] NOTIF-18 PO Delivered notification failed:', notifErr);
    }
}
```

Phase 101 adds an `_addActivityEntry` call **inside the same Delivered block** but in its own separate `try/catch` — so notification failure and journal failure are independent:

```javascript
// After the NOTIF-18 block, still inside `if (newStatus === 'Delivered' && !isSubcon)`:
if (newStatus === 'Delivered' && !isSubcon) {
    // [existing NOTIF-18 block unchanged]

    // Phase 101 — auto-entry to project Activity Feed
    try {
        const poDocFresh2 = await getDoc(poRef); // use existing poDocFresh if still in scope
        const d = poDocFresh2.data() || {};
        if (d.project_id) {
            await addDoc(
                collection(db, 'projects', d.project_id, 'activity_entries'),
                {
                    type: 'system',
                    is_system: true,
                    text: `PO ${escapeHTML(d.po_id || poId)} from ${escapeHTML(d.supplier_name || 'Unknown Supplier')} marked Delivered`,
                    created_by_uid: window.getCurrentUser?.()?.uid ?? '',
                    created_by_name: window.getCurrentUser?.()?.full_name || 'System',
                    created_at: serverTimestamp(),
                }
            );
        }
    } catch (journalErr) {
        console.error('[Procurement] Phase 101 PO Delivered journal entry failed:', journalErr);
        // Never block the status update — swallow
    }
}
```

**Prerequisite:** `procurement.js` must add `addDoc` and `serverTimestamp` to its firebase.js import if not already present. Verify the import line at the top of the file.

---

## Shared Patterns

### getCurrentUser usage
**Source:** `app/notifications.js` line 499 and `app/views/project-detail.js` lines 492, 984, 2360, etc.
**Apply to:** All journal write operations in project-detail.js and procurement.js
```javascript
const cu = window.getCurrentUser?.();
// Fields:
cu?.uid        // created_by_uid
cu?.full_name  // created_by_name (falls back to email)
cu?.email      // fallback display name
```

### serverTimestamp for subcollection created_at
**Source:** `app/views/project-detail.js` line 2349 (`addProjectAuditEntry`)
**Apply to:** All `addDoc` calls for `activity_entries`, `progress_updates`, `issues`
```javascript
created_at: serverTimestamp(),  // NOT new Date().toISOString() — use server timestamp for ordering
```

### Fire-and-forget pattern for non-blocking side effects
**Source:** `app/views/project-detail.js` lines 1241–1244, 1262, 1285
```javascript
// Good: fire-and-forget with .catch()
someAsyncCall().catch(err => console.error('[Module] call failed:', err));

// Bad: await without try/catch — will propagate exception to parent
await someAsyncCall();
```
Apply to all auto-entry calls that are side effects of a primary user action (gate transitions, field edits, PO Delivered status update).

### escapeHTML on all user text in innerHTML
**Source:** `app/utils.js` lines 17–25; enforced in `app/notifications.js` lines 194–219
**Apply to:** All journal entry text, issue titles, descriptions, resolution notes rendered into `.innerHTML`
```javascript
import { escapeHTML } from '../utils.js'; // already imported in project-detail.js line 7
`<span>${escapeHTML(entry.text)}</span>`
```

### Optimistic DOM append before Firestore confirms
**Source:** CONTEXT.md line 99 references Phase 86.1 inline grid pattern
**Apply to:** Feed composer, Progress Update form, Issue submit — show entry immediately in DOM, let the onSnapshot reconcile. Avoids visible delay after POST button click.

```javascript
// Pattern: push optimistic entry to local array, re-render, then addDoc
// onSnapshot will fire with the real doc shortly after and the list reconciles
journalActivityEntries.unshift({ id: '_optimistic', text, type, is_system: false, created_at: { seconds: Date.now()/1000 }, created_by_name: cu?.full_name });
_renderJournalPanelInPlace();
await addDoc(...); // snapshot fires, reconciles with real doc ID
```

---

## No Analog Found

No files in this phase are without an analog. All patterns have direct precedents in the codebase.

| File | Role | Data Flow | Note |
|------|------|-----------|------|
| — | — | — | — |

---

## Metadata

**Analog search scope:** `app/views/project-detail.js`, `app/views/procurement.js`, `app/notifications.js`, `app/utils.js`, `app/edit-history.js`, `app/views/finance.js`, `firestore.rules`
**Files scanned:** 8
**Pattern extraction date:** 2026-06-10
