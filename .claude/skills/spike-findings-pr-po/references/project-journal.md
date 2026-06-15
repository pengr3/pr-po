# Project Journal (On-going Activity)

## Requirements

- All three surfaces ship: Activity Feed, Progress Updates, Issues
- Edit history folds into the Activity Feed as system auto-entries (field diff text, e.g. "Contract value changed ₱3.8M → ₱4.2M by A. Mendoza") — no separate edit history UI
- Progress Updates are manual only — no Gantt/Project Plan integration
- Any user with project access (ops, admin, procurement, finance) can post — no role-gating within the journal
- Mental model: a project journal — records everything that happens during On-going execution
- Must work without a build step (pure static SPA, Firebase Firestore subcollections)

## How to Build It

### 1. Firestore subcollections (3 new subcollections under `projects/{projectId}`)

Add to `firestore.rules` first (before writing any code):

```
// Project journal subcollections — any active user with project access
match /projects/{projectId}/activity_entries/{entryId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update, delete: if isAdmin();
}
match /projects/{projectId}/progress_updates/{updateId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update, delete: if isAdmin();
}
match /projects/{projectId}/issues/{issueId} {
  allow read: if isActiveUser();
  allow create: if isActiveUser();
  allow update: if isActiveUser(); // anyone can resolve an issue
  allow delete: if isAdmin();
}
```

### 2. Firestore schemas

```javascript
// activity_entries — Activity Feed
{
  type: 'update' | 'milestone' | 'client' | 'system' | 'edit',
  text: string,                 // human note or system-generated message
  created_at: Timestamp,
  created_by_uid: string,
  created_by_name: string,
  is_system: boolean            // true for auto-entries, false for manual notes
}

// progress_updates — Progress Updates tab
{
  pct_complete: number,         // 0–100
  summary: string,
  blockers: string,
  next_milestone: string,
  created_at: Timestamp,
  created_by_uid: string,
  created_by_name: string
}

// issues — Issues/Punch List tab
{
  issue_type: 'delay' | 'change_order' | 'site_issue' | 'client_request',
  title: string,
  description: string,
  status: 'open' | 'resolved',
  resolved_at: Timestamp | null,
  resolved_by_uid: string | null,
  resolved_by_name: string | null,
  created_at: Timestamp,
  created_by_uid: string,
  created_by_name: string
}
```

### 3. Panel placement in project-detail.js

The panel lives below the 2-column Info+Financial cards, above any other bottom content. It is **always visible when the project status is On-going** (and optionally visible for Completed projects in read-only mode).

```javascript
function buildJournalHtml(projectId) {
    return `
    <div class="activity-panel" id="activity-panel">
      <div class="ap-header">
        <div class="ap-header-left">
          <span style="font-size:16px">📋</span>
          <h2>On-going Activity</h2>
        </div>
      </div>
      <div class="ap-tabs">
        <div class="ap-tab active" onclick="apSwitchTab('feed',this)">
          Activity Feed <span class="ap-tab-badge" id="ap-feed-count">0</span>
        </div>
        <div class="ap-tab" onclick="apSwitchTab('updates',this)">
          Progress Updates <span class="ap-tab-badge" id="ap-updates-count">0</span>
        </div>
        <div class="ap-tab" onclick="apSwitchTab('issues',this)">
          Issues <span class="ap-tab-badge" id="ap-issues-count">0</span>
        </div>
      </div>
      <div class="ap-body">
        <div class="ap-pane visible" id="ap-pane-feed"><!-- Feed renders here --></div>
        <div class="ap-pane" id="ap-pane-updates"><!-- Progress renders here --></div>
        <div class="ap-pane" id="ap-pane-issues"><!-- Issues renders here --></div>
      </div>
    </div>`;
}
```

### 4. Real-time listeners (one per tab, set up in init())

```javascript
// Set up 3 subcollection listeners for the journal
const { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp }
    = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

// Feed listener
const feedQ = query(
    collection(db, 'projects', projectId, 'activity_entries'),
    orderBy('created_at', 'desc')
);
const unsubFeed = onSnapshot(feedQ, snap => {
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFeed(entries);
    document.getElementById('ap-feed-count').textContent = entries.length;
});

// Progress updates listener
const updatesQ = query(
    collection(db, 'projects', projectId, 'progress_updates'),
    orderBy('created_at', 'desc')
);
const unsubUpdates = onSnapshot(updatesQ, snap => {
    const updates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProgressUpdates(updates);
    document.getElementById('ap-updates-count').textContent = updates.length;
});

// Issues listener
const issuesQ = query(
    collection(db, 'projects', projectId, 'issues'),
    orderBy('created_at', 'desc')
);
const unsubIssues = onSnapshot(issuesQ, snap => {
    const issues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderIssues(issues);
    const openCount = issues.filter(i => i.status === 'open').length;
    document.getElementById('ap-issues-count').textContent = openCount > 0
        ? `${openCount} open`
        : issues.length;
});

// Add all to listeners array for cleanup in destroy()
listeners.push(unsubFeed, unsubUpdates, unsubIssues);
```

### 5. Posting a feed note

```javascript
async function apPostNote(projectId, text, tag, currentUser) {
    await addDoc(collection(db, 'projects', projectId, 'activity_entries'), {
        type: tag,           // 'update' | 'milestone' | 'client'
        text: text,
        is_system: false,
        created_at: serverTimestamp(),
        created_by_uid: currentUser.uid,
        created_by_name: currentUser.full_name || currentUser.email
    });
}
window.apPostNote = apPostNote;
```

### 6. System auto-entries (edit history + status changes)

Call this helper wherever project fields change or status advances:

```javascript
async function addProjectActivityEntry(projectId, type, text, currentUser) {
    // type = 'system' or 'edit'
    await addDoc(collection(db, 'projects', projectId, 'activity_entries'), {
        type: type,
        text: text,
        is_system: true,
        created_at: serverTimestamp(),
        created_by_uid: currentUser?.uid || 'system',
        created_by_name: currentUser?.full_name || 'System'
    });
}

// Example — call when saving project field changes:
// "Contract value changed from ₱3,800,000 → ₱4,200,000"
// "Project status changed: For Mobilization → On-going"
// "PO-2026-041 status changed to Delivered"
```

Hook this into:
- `lcStartMobilization()`, `lcStartProject()`, `lcMarkProjectComplete()` — status change entries
- Project info save handler — field diff entries (compare old vs new values before `updateDoc`)
- Optionally: PO status changes in procurement.js (pass projectId through)

### 7. Posting a progress update

```javascript
async function apSubmitProgressUpdate(projectId, data, currentUser) {
    // data: { pct_complete, summary, blockers, next_milestone }
    await addDoc(collection(db, 'projects', projectId, 'progress_updates'), {
        ...data,
        created_at: serverTimestamp(),
        created_by_uid: currentUser.uid,
        created_by_name: currentUser.full_name || currentUser.email
    });
}
```

### 8. Logging and resolving an issue

```javascript
async function apLogIssue(projectId, data, currentUser) {
    // data: { issue_type, title, description }
    await addDoc(collection(db, 'projects', projectId, 'issues'), {
        ...data,
        status: 'open',
        resolved_at: null,
        resolved_by_uid: null,
        resolved_by_name: null,
        created_at: serverTimestamp(),
        created_by_uid: currentUser.uid,
        created_by_name: currentUser.full_name || currentUser.email
    });
}

async function apResolveIssue(projectId, issueId, currentUser) {
    await updateDoc(doc(db, 'projects', projectId, 'issues', issueId), {
        status: 'resolved',
        resolved_at: serverTimestamp(),
        resolved_by_uid: currentUser.uid,
        resolved_by_name: currentUser.full_name || currentUser.email
    });
}
```

### 9. CSS classes to add (from spike.html)

Key classes proven in the spike demo — extract from `spike.html` sources:
- `.activity-panel`, `.ap-header`, `.ap-tabs`, `.ap-tab`, `.ap-tab.active`, `.ap-tab-badge`
- `.ap-body`, `.ap-pane`, `.ap-pane.visible`
- `.feed-composer`, `.feed-list`, `.feed-entry`, `.feed-avatar`, `.feed-meta`, `.feed-tag-badge`
- `.entry-tag` (Update/Milestone/Issue/Client variants)
- `.pu-form`, `.pu-history`, `.pu-card`, `.pu-pct-bar`, `.pu-pct-fill`, `.pu-fields`
- `.issue-form`, `.issue-list`, `.issue-card`, `.issue-card.resolved`, `.filter-chip`, `.filter-chip.active`
- `.badge-update`, `.badge-milestone`, `.badge-issue`, `.badge-client`, `.badge-system`, `.badge-resolved`
- `.dot-delay`, `.dot-change`, `.dot-site`, `.dot-client` (colored type dots in issue list)

Full CSS is in `sources/032-ongoing-activity-panel/spike.html` — the `<style>` block.

## What to Avoid

- **Don't create a top-level `project_journal` collection** — subcollections under `projects/{projectId}` are the right pattern; they co-locate data with the project and avoid cross-project query needs
- **Don't use `getDocs` for the feed** — use `onSnapshot` so new entries appear in real time without reload
- **Don't gate Progress Updates to ops-only** — any project-access user can post; the user explicitly decided no role-gating
- **Don't auto-generate progress updates from the Gantt** — the user rejected this; Progress Updates are manual narrative reports for client/management use, separate from task-level % in the Gantt
- **Don't add composite indexes** — ordering by `created_at` desc on a subcollection works without a composite index; only add if you filter AND order simultaneously (e.g. `where('status','==','open'), orderBy('created_at')` — that one WILL need an index)
- **Don't show the panel for non-On-going statuses** unless in read-only completed mode — the panel is specific to the execution phase

## Constraints

- Firestore subcollection real-time listeners must be unsubscribed in `destroy()` — add to the `listeners` array
- The panel must be rendered via `buildJournalHtml()` and inserted into the DOM before calling `initJournal()` (which sets up listeners)
- `window.apSwitchTab`, `window.apPostNote`, `window.apLogIssue`, `window.apResolveIssue`, `window.apSubmitProgressUpdate` must all be assigned to `window` for onclick handlers
- No composite Firestore indexes needed as long as you don't filter + order simultaneously on the same subcollection query

## Origin

Synthesized from spike: 032
Source files: `sources/032-ongoing-activity-panel/`
