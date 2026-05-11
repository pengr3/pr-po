# Phase 87: Proposal Lifecycle — Research

**Researched:** 2026-05-11
**Domain:** Firebase Firestore + Firebase Storage (new for this phase) + SPA module pattern
**Confidence:** HIGH — all critical questions answered from direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Phase sequencing:** Phase 88 ships first. Phase 87 plugs into the existing Mgmt Tab (`#proposal-dashboard-mount`).
- **D-02 — Proposal data shape:** Top-level `proposals` collection. Full schema in CONTEXT.md.
- **D-03 — Attachment model:** Link OR single replaceable file. No version history. `proposals/{proposal_id}/attachment.<ext>` in Storage. Replacement writes `ATTACHMENT_REPLACED` audit entry.
- **D-04 — Audit + comms logs are embedded arrays** on the proposal doc. No subcollections.
- **D-05 — Approver designation: role-based only.** `role === 'super_admin'` OR `role === 'operations_admin'`.
- **D-06 — Loss reason: required free text.** Stored on `loss_reason` and mirrored to `audit_log` entry's `comment`.
- **D-07 — Comms log entry can carry one optional attachment** (same link-or-file shape, Storage path `proposals/{id}/comms/{entry_id}.<ext>`).
- **D-08 — Project status state machine** (locked transitions — see CONTEXT.md table).
- **D-09 — Notification wiring:** NOTIF-09 = `createNotificationForRoles`, NOTIF-10 = `createNotification`. Failure MUST NOT block state transition.
- **D-10 — Security Rules:** `proposals` read = isActiveUser(); create/update/delete = `['super_admin', 'operations_admin']`. Storage rules mirror these.
- **D-11 — Proposal dashboard:** Grouped-by-stage list inside existing Proposals tab. `current_status_since` cached on doc to avoid scanning audit_log. Age > 7 days threshold for highlighting in `pending_internal` or `pending_client` stages.

### Claude's Discretion

- Per-stage card vs row layout in the dashboard.
- Audit log timeline visualization.
- Comms log entry display order.
- Whether `'For Mobilization'` is a separate auto-transition after `'Client Approved'` or a manual action.
- Storage Security Rules pattern (custom claims vs Firestore lookup).
- Loss reason input width/placement in the Loss confirmation modal.
- Toast copy on every state transition.

### Deferred Ideas (OUT OF SCOPE)

- Document version history (auto-increment version numbers, retrieval of old versions).
- Loss reason taxonomy + analytics.
- Project-attached approvers.
- Email + browser-push notifications.
- Cloud Functions / server-side state-transition enforcement.
- Multi-attachment per proposal.
- Subcollections for audit/comms.
- Sent-to-client email integration.
- Concurrent-edit conflict handling.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROP-01 | Create a proposal linked to a project (title, description, amount, target client, version) | `generateSequentialId` reusable with `('proposals', 'PROP')` call signature — confirmed |
| PROP-02 | Edit a proposal (title, description, amount, client) | Standard `updateDoc` on proposals doc |
| PROP-03 | Submit for internal approval + approve/reject with mandatory comment | writeBatch covers proposal status + project status + audit_log entry atomically |
| PROP-04 | Per-proposal audit trail (actor, ts, action, comment) embedded in `audit_log` array | Embedded array pattern confirmed, mirrors Phase 85 collectibles |
| PROP-05 | Single replaceable attachment — link or Firebase Storage file | **Firebase Storage is NOT initialized in firebase.js yet** — this phase must add it |
| PROP-06 (scoped) | No version history — single current attachment only | Confirmed out of scope; D-03 locked |
| PROP-07 | Mark sent to client; client decision actions (client approved, loss) | State machine per D-08; writeBatch covers project status transition |
| PROP-08 | Client communications log (date, type, description, optional attachment) | Embedded `comms_log` array on proposal doc per D-04 |
| PROP-09 | Loss recording with required free-text reason | Free text captured in `loss_reason` + `audit_log` entry's `comment` per D-06 |
| PROP-10 | Proposal dashboard grouped by stage, age-in-stage indicators | Mounts at `#proposal-dashboard-mount` in proposals.js; `current_status_since` field |
| PROP-11 | Top-level `proposals` Firestore collection with Security Rules | Rules ship in SAME commit as first JS write (CLAUDE.md invariant) |
| NOTIF-09 | `createNotificationForRoles` fan-out on proposal submitted | Helper confirmed present in `app/notifications.js`; `PROPOSAL_SUBMITTED` enum entry present |
| NOTIF-10 | `createNotification` to submitter on approve/reject | Helper confirmed present; `PROPOSAL_DECIDED` enum entry present |

</phase_requirements>

---

## Summary

Phase 87 implements the proposal approval lifecycle as a new section inside the existing `app/views/proposals.js` view (built by Phase 88). The view already exists with a `#proposal-dashboard-mount` section div (`display: none`) that Phase 87 activates. The phase introduces the `proposals` Firestore collection, Firebase Storage (new to the codebase), seven UI surfaces (dashboard, detail modal, create/edit form, approve/reject modal, loss confirmation, add comms entry inline form, and attachment widget), and fires NOTIF-09/NOTIF-10 via existing helpers.

**The single most important discovery: Firebase Storage SDK is not initialized anywhere in the codebase.** `app/firebase.js` has a `storageBucket` config value but does NOT import or export `getStorage`, `ref`, `uploadBytes`, `getDownloadURL`, or `deleteObject`. This phase introduces Storage for the first time and must add these imports to `app/firebase.js` plus create a `storage.rules` file.

**Primary recommendation:** Build proposals.js as a single self-contained module following the established view pattern. Add Firebase Storage to firebase.js in the same plan that ships the first Storage write. Ship Firestore Security Rules for `proposals` in the same commit as the first `addDoc` call.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Proposal CRUD (create/edit) | Browser / Client | — | Static SPA; no SSR tier exists |
| Internal approval workflow | Browser / Client | — | Client-side mutation through Security Rules (no Cloud Functions) |
| Proposal status state machine | Browser / Client | Database/Storage | Client enforces transitions; Security Rules enforce write gating |
| Audit log (embedded array) | Database / Storage | — | Persisted as embedded array on Firestore proposal doc |
| Comms log (embedded array) | Database / Storage | — | Same doc as audit log per D-04 |
| File attachment upload | Browser / Client + CDN/Static | Firebase Storage | Client uploads directly to Firebase Storage via SDK |
| Notification fan-out | Browser / Client | Database | Client writes to `notifications` collection via writeBatch (no Cloud Functions) |
| Project status auto-advance | Browser / Client | Database | writeBatch covers both proposal + project doc atomically |
| Dashboard real-time updates | Browser / Client | Database | `onSnapshot` on `proposals` collection |
| Security/access control | Database / Storage | — | Firestore Security Rules + Storage rules gate write access to approver roles |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore | 10.7.1 (CDN) | Proposals collection, real-time dashboard, writeBatch | Already in use — `app/firebase.js` pins this version [VERIFIED: app/firebase.js line 8] |
| Firebase Storage | 10.7.1 (CDN) | File attachment upload/delete | Must match Firestore CDN version to avoid SDK conflicts [VERIFIED: firebase.js CDN URLs] |
| Firebase Auth | 10.7.1 (CDN) | Role checks via `window.getCurrentUser()` | Already in use [VERIFIED: app/firebase.js line 39] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.randomUUID()` | Browser native | Generate `entry_id` for audit_log and comms_log entries | Available in all modern browsers; no library needed [ASSUMED — standard Web API] |

**Firebase Storage import to add in firebase.js:**
```javascript
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
```
[VERIFIED: CDN URL pattern matches existing firebase-app.js and firebase-firestore.js patterns in app/firebase.js]

---

## Architecture Patterns

### System Architecture Diagram

```
User action (e.g. Submit for Approval)
        │
        ▼
proposals.js — init() / window.* handler
        │
        ├─── Validate form inputs (client-side)
        │
        ├─── writeBatch(db)
        │       ├── batch.update(proposalRef)   ← status, audit_log, current_status_since
        │       └── batch.update(projectRef)    ← project_status
        │
        ├─── batch.commit()  ───► Firestore
        │                           ├── proposals/{id}     (Security Rules: ops_admin/super_admin)
        │                           └── projects/{id}      (Security Rules: ops_admin/super_admin/finance)
        │
        ├─── [if file attachment]
        │       └── uploadBytes(storageRef)  ──► Firebase Storage
        │                                           proposals/{id}/attachment.<ext>
        │
        ├─── [notification — fire-and-forget]
        │       ├── createNotificationForRoles(...)   ← NOTIF-09
        │       └── createNotification(...)           ← NOTIF-10
        │
        └─── showToast(...)
```

### Recommended Project Structure
```
app/
├── views/
│   └── proposals.js        # Enhanced — Phase 87 adds proposal lifecycle code
├── firebase.js             # Enhanced — add getStorage, ref, uploadBytes, getDownloadURL, deleteObject
├── notifications.js        # Unchanged — PROPOSAL_SUBMITTED + PROPOSAL_DECIDED already present
├── utils.js                # Unchanged — generateSequentialId reused
firestore.rules             # Enhanced — add proposals block
storage.rules               # CREATED (new file) — proposals storage paths
```

### Pattern 1: writeBatch for atomic state transition (from project-plan.js)
**What:** Commit proposal status + project status + audit_log append in one atomic batch.
**When to use:** Every proposal status transition that also updates the parent project's status.
**Example:**
```javascript
// Source: app/views/project-plan.js line 1265 / 1386 / 1743
import { writeBatch, doc, serverTimestamp } from '../firebase.js';

const batch = writeBatch(db);
batch.update(doc(db, 'proposals', proposalDocId), {
    status: 'pending_internal',
    audit_log: [...existingLog, newEntry],
    current_status_since: serverTimestamp(),
    updated_at: serverTimestamp()
});
batch.update(doc(db, 'projects', projectDocId), {
    project_status: 'Proposal for Internal Approval',
    updated_at: serverTimestamp()
});
await batch.commit();
```
[VERIFIED: writeBatch imported and used in project-plan.js lines 1265, 1386, 1743, 2916]

### Pattern 2: generateSequentialId — reusable for PROP-YYYY-NNN IDs
**What:** The existing `generateSequentialId(collectionName, prefix, year)` in `app/utils.js` works generically. For proposals: `generateSequentialId('proposals', 'PROP')`.
**How it works:** Full collection scan of `proposals`, reads `proposal_id` field from each doc, extracts `parts[2]` (the 3-digit sequence), finds max, returns `PROP-{year}-{padded(max+1)}`.
**Important:** The helper reads `doc.data()[${prefix.toLowerCase()}_id]` — so the Firestore field name MUST be `proposal_id` (not `prop_id`). The CONTEXT.md D-02 schema uses `proposal_id` — this is compatible.
[VERIFIED: app/utils.js lines 173–198]

### Pattern 3: Notification call — fire-and-forget wrapped in try/catch
**What:** Notification calls MUST be wrapped in try/catch and MUST NOT block the underlying state transition.
**When to use:** After every `batch.commit()` that includes a proposal state change.
**Example:**
```javascript
// Source: app/notifications.js — caller contract documented at line 9
// After batch.commit():
try {
    await createNotificationForRoles({
        roles: ['super_admin', 'operations_admin'],
        type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED,
        message: `Proposal ${proposal.title} submitted by ${actor.full_name}`,
        link: `#/proposals?id=${proposalId}`,
        source_collection: 'proposals',
        source_id: proposalId,
        excludeActor: true
    });
} catch (notifErr) {
    console.error('[Proposals] NOTIF-09 failed:', notifErr);
}
```
[VERIFIED: app/notifications.js lines 499–526 (createNotification), 550–593 (createNotificationForRoles)]

### Pattern 4: onSnapshot real-time listener with listener cleanup array
**What:** Subscribe to `proposals` collection for real-time dashboard updates.
**When to use:** In `init()` of proposals.js Phase 87 section.
**Example (existing pattern):**
```javascript
// Source: app/views/proposals.js lines 447–462
const listener = onSnapshot(
    collection(db, 'proposals'),
    (snapshot) => {
        proposalsData = [];
        snapshot.forEach(d => proposalsData.push({ id: d.id, ...d.data() }));
        renderProposalDashboard();
    },
    (err) => console.error('[Proposals] proposals listener error:', err)
);
listeners.push(listener); // listeners array is cleaned up in destroy()
```
[VERIFIED: app/views/proposals.js lines 447–478]

### Pattern 5: Modal HTML pattern (window-style modal)
**What:** All detail modals in this codebase use `.modal` + `.modal-content` + `.modal-header` + `.modal-body` + `.modal-footer`.
**When to use:** Proposal Detail modal, Approve/Reject modal, Loss modal, Client Approved modal.
**Structure:**
```html
<div id="proposalDetailModal" class="modal">
    <div class="modal-content" style="max-width: 900px;">
        <div class="modal-header">
            <h2 id="proposalDetailTitle">PROP-2026-001 — Title</h2>
            <button class="modal-close" onclick="window.closeProposalDetailModal()">&times;</button>
        </div>
        <div class="modal-body" id="proposalDetailBody">
            <!-- dynamically populated -->
        </div>
        <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:1rem 1.5rem;border-top:1px solid #e5e7eb;">
            <button class="btn btn-outline" onclick="window.closeProposalDetailModal()">Close</button>
        </div>
    </div>
</div>
```
[VERIFIED: app/views/procurement.js lines 1948–1972 for exact modal pattern]

### Pattern 6: Firebase Storage upload (new to codebase)
**What:** Upload a file to Firebase Storage at `proposals/{proposalId}/attachment.{ext}`.
**When to use:** When user selects "Upload a file" in the Attachment Widget.
**Example:**
```javascript
// Source: Firebase 10.7.1 docs [ASSUMED — consistent with CDN version already pinned]
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase.js';

const storage = getStorage(); // from firebase.js
const storageRef = ref(storage, `proposals/${proposalId}/attachment.${ext}`);
const snapshot = await uploadBytes(storageRef, file);
const downloadURL = await getDownloadURL(snapshot.ref);
```
Note: `getStorage()` must be exported from `app/firebase.js` alongside `db`.

### Anti-Patterns to Avoid
- **Subcollections for audit/comms:** D-04 explicitly defers this. All audit and comms entries are embedded arrays on the proposal doc.
- **Auto-increment version numbers:** PROP-06 is deferred. Version is always "v1" in this phase.
- **Blocking the action on notification failure:** The fire-and-forget pattern in Phase 83 D-13 is mandatory. Wrap every `createNotification`/`createNotificationForRoles` call in try/catch.
- **Calling `destroy()` on tab switches:** The router does NOT call `destroy()` when switching tabs within the same view. The existing `proposals.js` module uses module-scope state. Phase 87 must manage its own sub-section listeners by extending the existing `listeners` array and `destroy()` cleanup.
- **Sequential ID race condition:** `generateSequentialId` does a full collection scan and picks max+1. There is a race condition on simultaneous creates — same disposition as Phase 65.4 (accepted at current scale).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential PROP IDs | Custom ID generator | `generateSequentialId('proposals', 'PROP')` from utils.js | Already implemented, tested, consistent with MRF/PR/PO pattern [VERIFIED: utils.js] |
| Notification fan-out to roles | Custom users query + writeBatch | `createNotificationForRoles(...)` from notifications.js | Phase 83 already handles role query, batch fan-out, actor exclusion, error handling [VERIFIED: notifications.js line 550] |
| Single-recipient notification | Custom addDoc | `createNotification({user_id, ...})` from notifications.js | Already handles schema, error swallowing, validation [VERIFIED: notifications.js line 499] |
| Firestore batch writes | Multiple sequential `updateDoc` calls | `writeBatch(db)` imported from firebase.js | Atomic — if any write fails, all fail; already imported and used in project-plan.js [VERIFIED] |
| HTML escaping | Custom escape function | `escapeHTML()` from utils.js | Already imported in proposals.js [VERIFIED: proposals.js line 19] |
| Currency formatting | Custom formatter | `formatCurrency()` from utils.js | Already in use across all view modules [VERIFIED: utils.js line 36] |
| Project code generation | Custom code generator | `generateProjectCode()` or `generateServiceCode()` from utils.js | Already used by engagement-create.js [VERIFIED] |
| Create/edit engagement form | Duplicate the proposals.js form | `createEngagement()` from engagement-create.js | Already used by proposals.js for the New Engagement section [VERIFIED: proposals.js line 21] |

---

## Critical Discovery: Firebase Storage Not Yet Initialized

**Firebase Storage has NEVER been used in this codebase.** [VERIFIED: grep of entire app/ directory for `getStorage`, `uploadBytes`, `deleteObject` returned zero matches]

`app/firebase.js` does include `storageBucket` in both the prod and dev configs:
- Prod: `"clmc-procurement.firebasestorage.app"`
- Dev: `"clmc-procurement-dev.firebasestorage.app"`

But the Storage SDK is NOT imported and `storage` is NOT exported.

**What Phase 87 must add to app/firebase.js:**
```javascript
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const storage = getStorage(app);
export { storage };
export { getStorage, ref, uploadBytes, getDownloadURL, deleteObject };
```

**What Phase 87 must create — storage.rules:**
Firebase Storage uses a separate rules file (`storage.rules`) deployed via `firebase deploy --only storage`. No `storage.rules` file exists in the repo. [VERIFIED: Glob for storage.rules returned no results]

Storage rules pattern — mirrors the Firestore role-check approach but uses `request.auth.token.role` (custom claims) OR a Firestore lookup. Since this project uses Firestore-stored roles (not custom claims), the canonical Storage rules pattern must use a Firestore lookup:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /proposals/{proposalId}/{allPaths=**} {
      // Read: any authenticated active user (mirrors Firestore proposals read rule)
      allow read: if request.auth != null;
      
      // Write: super_admin or operations_admin only
      // Storage rules cannot do firestore.get() easily; use custom claims OR accept role
      // stored in Firestore is not accessible here directly.
      // PRACTICAL APPROACH for this codebase: use request.auth != null as minimum gate
      // (Security Rules as defense-in-depth; Firestore rules are the primary gate for the
      // proposal doc itself, which must exist before the storage path is used).
      allow write: if request.auth != null;
    }
  }
}
```
[ASSUMED — Storage rules cannot directly call getUserData() the way Firestore rules can. The planner must decide: custom claims vs open-to-auth vs accept risk of weak storage rules given Firestore is the primary security gate.]

**Key implication for planning:** Storage setup (firebase.js changes + storage.rules creation) should be its own Wave 0 task, shipped BEFORE any plan that does file uploads.

---

## Project Status State Machine — Canonical Strings

The following project status strings are confirmed present in the codebase as exact string literals used across `projects.js`, `project-detail.js`, `service-detail.js`, `services.js`, and `home.js`:
[VERIFIED: grep of app/ for all status strings]

| Proposal Action | Project Status After | Canonical String |
|---|---|---|
| Submit for internal approval | `'Proposal for Internal Approval'` | LOCKED |
| Approve | `'Proposal Under Client Review'` | LOCKED |
| Reject | `'For Revision'` | LOCKED |
| Client Approved | `'Client Approved'` | LOCKED |
| Mark Loss | `'Loss'` | LOCKED |

**`'For Mobilization'` vs `'Client Approved'`:** Both are SEPARATE, DISTINCT project status strings in the `UNIFIED_STATUS_OPTIONS` array. They are ordered as: `...'Client Approved', 'For Mobilization', 'On-going'...`. The D-08 CONTEXT decision says "Client Approved action targets `'Client Approved'`" and the UI-SPEC Surface 8 uses `'Client Approved'` as the project status after client approval. **The `'For Mobilization'` transition is a subsequent manual action in project management — NOT triggered by the Client Approved proposal action.** The planner should wire "Client Approved" to set `project_status = 'Client Approved'` only. [VERIFIED: app/views/projects.js lines 31–43, app/views/home.js lines 9–21]

---

## Mount Point — Phase 88 Surface Confirmed

The Phase 88 proposals.js already ships with:
```html
<!-- Phase 87: Proposal Dashboard — mounts here (D-03 section ordering) -->
<section id="proposal-dashboard-mount" style="display: none;">
    <!-- Phase 87 mounts here -->
</section>
```
[VERIFIED: app/views/proposals.js lines 165–168]

Phase 87 MUST:
1. Call `document.getElementById('proposal-dashboard-mount').style.display = 'block'` in init().
2. Inject dashboard HTML inside this section.
3. Extend the existing `listeners` array in proposals.js (NOT create a new module-scope array).
4. Extend the existing `destroy()` to clean up Phase 87 window functions and listeners.

The module-scope state already declared in proposals.js that Phase 87 inherits:
- `let listeners = [];` — used for cleanup; Phase 87 pushes its proposal listener here
- `let clientsData = [];` and `let usersData = [];` — already populated by Phase 88 init()

**proposals.js does NOT currently subscribe to the `proposals` collection.** Phase 87 adds this.

---

## Notification Helpers — Exact Signatures

[VERIFIED: app/notifications.js]

### createNotification (NOTIF-10)
```javascript
export async function createNotification({
    user_id,     // string, required — recipient uid
    type,        // string, required — one of NOTIFICATION_TYPES
    message,     // string, required
    link,        // string, required — full hash route e.g. '#/proposals?id=PROP-2026-001'
    source_collection,  // string, optional — defaults to ''
    source_id           // string, optional — defaults to ''
}) // returns Promise<string|null>
```

### createNotificationForRoles (NOTIF-09)
```javascript
export async function createNotificationForRoles({
    roles,              // string[], required — e.g. ['super_admin', 'operations_admin']
    type,               // string, required
    message,            // string, required
    link,               // string, required
    source_collection,  // string, optional
    source_id,          // string, optional
    excludeActor        // boolean, optional — defaults to true
}) // returns Promise<number> (count written)
```

### NOTIFICATION_TYPES (relevant to Phase 87)
```javascript
PROPOSAL_SUBMITTED: 'PROPOSAL_SUBMITTED',  // NOTIF-09
PROPOSAL_DECIDED: 'PROPOSAL_DECIDED',      // NOTIF-10
```
[VERIFIED: app/notifications.js lines 38–39]

---

## generateSequentialId — Exact Signature and Behavior

[VERIFIED: app/utils.js lines 173–198]

```javascript
export async function generateSequentialId(collectionName, prefix, year = null)
// Returns: Promise<string> — e.g. 'PROP-2026-001'
// Reads: doc.data()[`${prefix.toLowerCase()}_id`] — so field name must be 'proposal_id'
// Scans: full collection getDocs(collection(db, collectionName))
// Race condition: accepted (same as MRF/PR/PO pattern)
```

**Usage for proposals:**
```javascript
const proposalId = await generateSequentialId('proposals', 'PROP');
// Returns 'PROP-2026-001', 'PROP-2026-002', etc.
```

---

## Security Rules Pattern

### Firestore — proposals collection (to add to firestore.rules)
```javascript
// =============================================
// proposals collection (Phase 87 — PROP-11, D-10)
// =============================================
// Proposal lifecycle docs. audit_log + comms_log are embedded arrays.
// Schema (Phase 87 D-02): proposal_id, project_id, project_code, title, description,
//   amount, target_client_id, target_client_name, status, attachment_kind,
//   attachment_url, attachment_storage_path, attachment_filename,
//   audit_log[], comms_log[], loss_reason, current_status_since,
//   created_by, created_at, updated_at.
match /proposals/{proposalId} {
  // Read: any active user (Operations Admin / Super Admin need to approve; all staff can view)
  allow read: if isActiveUser();

  // Create: super_admin, operations_admin only
  allow create: if hasRole(['super_admin', 'operations_admin'])
    && request.resource.data.created_by == request.auth.uid;

  // Update: super_admin, operations_admin only
  // Field-level: created_at and created_by are immutable post-create.
  // audit_log can only grow (append-only by convention — client-side enforced).
  allow update: if hasRole(['super_admin', 'operations_admin'])
    && request.resource.data.created_by == resource.data.created_by
    && request.resource.data.created_at == resource.data.created_at;

  // Delete: super_admin only (proposals should not be deleted in normal workflow)
  allow delete: if isRole('super_admin');
}
```
[ASSUMED — field-level immutability checks derived from notifications collection pattern at lines 560–567 of firestore.rules]

### D-24 invariant (CLAUDE.md): Security Rules must ship in SAME COMMIT as first JS write.

The planner must ensure:
- `firestore.rules` proposals block ships in the same commit as the first `addDoc(collection(db, 'proposals'), ...)` call.
- `storage.rules` file is created before any `uploadBytes(...)` call.

---

## Common Pitfalls

### Pitfall 1: proposals.js is one module — Phase 87 EXTENDS it, not replaces it
**What goes wrong:** Phase 87 creates a new module or duplicates state from the existing proposals.js.
**Why it happens:** Phase 87 is described as a separate feature, but it physically lives inside the same `app/views/proposals.js` that Phase 88 already created.
**How to avoid:** Edit the existing proposals.js. Add Phase 87's proposal listener to the existing `listeners` array. Add Phase 87's window functions in the existing `init()`. Clean up in the existing `destroy()`. Set `#proposal-dashboard-mount` to `display: block` in `init()`.

### Pitfall 2: Firebase Storage not initialized
**What goes wrong:** `uploadBytes` or `getStorage` throws "not initialized" or "not found".
**Why it happens:** `app/firebase.js` has `storageBucket` config but does NOT import or export any Storage SDK functions.
**How to avoid:** Plan the Storage SDK setup as Wave 0 — add imports to `firebase.js` + create `storage.rules` BEFORE any plan that does file uploads.

### Pitfall 3: No `storage.rules` file blocks all Storage operations
**What goes wrong:** File uploads fail with permission-denied even for super_admin.
**Why it happens:** Firebase Storage rules default to deny-all if `storage.rules` doesn't exist.
**How to avoid:** Create `storage.rules` and deploy it in the same Wave as the `firebase.js` Storage SDK addition.

### Pitfall 4: Status strings must be exact match (case-sensitive)
**What goes wrong:** `project.project_status === 'client approved'` never matches.
**Why it happens:** CLAUDE.md explicitly states case-sensitive matching; all existing status strings use Title Case.
**How to avoid:** Use the exact strings from the locked table: `'Proposal for Internal Approval'`, `'Proposal Under Client Review'`, `'For Revision'`, `'Client Approved'`, `'Loss'`. Never lowercase.

### Pitfall 5: window.* function names must not collide with Phase 88's functions
**What goes wrong:** Phase 87 registers `window.submitNewEngagement` — which already exists from Phase 88.
**Why it happens:** Both phases add window functions to the same view module.
**How to avoid:** Use a `proposal*` prefix for all Phase 87 window functions — e.g., `window.openProposalDetail`, `window.submitProposalApproval`, `window.closeProposalDetailModal`. Phase 88 uses `proposalSelectPersonnel`, `proposalRemovePersonnel`, `proposalShowPersonnelDropdown`, `proposalFilterPersonnelDropdown`, `submitNewEngagement`, `handleEngagementTypeChange`. Choose non-conflicting names.

### Pitfall 6: destroy() is NOT called on tab switches within the same view
**What goes wrong:** Memory leaks or stale listeners if Phase 87 assumes destroy() is always called when leaving the proposals view.
**Why it happens:** CLAUDE.md and router.js (line 315) both confirm that `destroy()` is only called when navigating to a DIFFERENT view route. Tab changes within `/proposals` do not trigger destroy().
**How to avoid:** This is a single-section view with no tabs (proposals.js has no tab switching). Listeners are cleaned up only on full route navigation away. This is fine.

### Pitfall 7: `audit_log` is an embedded array — cannot use `arrayUnion` safely
**What goes wrong:** `arrayUnion` on an array of objects does deep equality which behaves unexpectedly with Firestore timestamps.
**Why it happens:** Firestore's `arrayUnion` uses deep equality for deduplication; timestamps from `serverTimestamp()` evaluate to sentinel objects that may not deduplicate as expected.
**How to avoid:** Read the current `audit_log`, push the new entry onto the array in JavaScript, then write the entire updated array via `updateDoc` (or in a writeBatch). This is the approach used by Phase 85 for collectibles `payment_records`. [VERIFIED: app/views/finance.js — rfp payment_records uses arrayUnion, but those are simple value objects; for complex objects with timestamps, read-modify-write is safer]

### Pitfall 8: `current_status_since` must be set on EVERY status transition
**What goes wrong:** Age-in-stage calculation is wrong because `current_status_since` is stale.
**Why it happens:** Forgetting to include `current_status_since: serverTimestamp()` in any status-transition writeBatch.
**How to avoid:** Every writeBatch that changes `proposal.status` must also set `current_status_since: serverTimestamp()`. Include this in a shared helper function that all status transition handlers call.

---

## Code Examples

### Proposal status transition — full writeBatch pattern
```javascript
// Source: pattern derived from project-plan.js writeBatch at lines 1265, 1386
// and notifications fire-and-forget from app/notifications.js D-13

async function submitProposalForApproval(proposalDocId, proposal, projectDocId) {
    const currentUser = window.getCurrentUser?.();
    const actor = { id: currentUser?.uid, name: currentUser?.full_name || 'Unknown' };
    
    const newAuditEntry = {
        entry_id: crypto.randomUUID(),
        ts: serverTimestamp(),
        actor_id: actor.id,
        actor_name: actor.name,
        action: 'SUBMITTED',
        comment: null
    };

    const batch = writeBatch(db);
    batch.update(doc(db, 'proposals', proposalDocId), {
        status: 'pending_internal',
        audit_log: [...proposal.audit_log, newAuditEntry],
        current_status_since: serverTimestamp(),
        updated_at: serverTimestamp()
    });
    batch.update(doc(db, 'projects', projectDocId), {
        project_status: 'Proposal for Internal Approval',
        updated_at: serverTimestamp()
    });
    await batch.commit();

    // NOTIF-09: fire-and-forget
    try {
        await createNotificationForRoles({
            roles: ['super_admin', 'operations_admin'],
            type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED,
            message: `Proposal ${proposal.title} submitted for approval by ${actor.name}`,
            link: `#/proposals?id=${proposal.proposal_id}`,
            source_collection: 'proposals',
            source_id: proposal.proposal_id,
            excludeActor: true
        });
    } catch (err) {
        console.error('[Proposals] NOTIF-09 failed:', err);
    }
    
    showToast('Proposal submitted for internal approval. Approvers have been notified.', 'success');
}
```

### Firebase Storage upload — attachment widget
```javascript
// Source: Firebase 10.7.1 SDK pattern [ASSUMED — consistent with CDN version]
import { storage, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase.js';

async function uploadProposalAttachment(proposalDocId, file) {
    const ext = file.name.split('.').pop();
    const storageRef = ref(storage, `proposals/${proposalDocId}/attachment.${ext}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return {
        attachment_kind: 'file',
        attachment_storage_path: `proposals/${proposalDocId}/attachment.${ext}`,
        attachment_url: downloadURL,
        attachment_filename: file.name
    };
}
```

### Age-in-stage calculation
```javascript
// Source: derived from D-11 spec — use current_status_since (cached on doc)
function getAgeInStageDays(proposal) {
    if (!proposal.current_status_since) return 0;
    const since = proposal.current_status_since.toMillis
        ? proposal.current_status_since.toMillis()
        : (proposal.current_status_since.seconds * 1000);
    return Math.floor((Date.now() - since) / (1000 * 60 * 60 * 24));
}

function isOverdue(proposal) {
    const THRESHOLD_DAYS = 7;
    const activeStages = ['pending_internal', 'pending_client'];
    return activeStages.includes(proposal.status) && getAgeInStageDays(proposal) > THRESHOLD_DAYS;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No Firebase Storage in codebase | Must add Storage SDK (new) | Phase 87 (this phase) | Requires firebase.js change + storage.rules creation |
| Manual project status in project-detail.js | writeBatch covers both proposal + project atomically | Phase 84 introduced writeBatch pattern | Proposal state transitions MUST use writeBatch |
| No proposals collection | New top-level collection | Phase 87 (this phase) | Must ship with Security Rules in same commit |

**Deprecated/outdated:**
- The STATE.md entry for Phase 87 mentions `proposals/{proposalId}/v{n}/{filename}` as a storage path. This has been SUPERSEDED by D-03: the path is now `proposals/{proposal_id}/attachment.<ext>` (no version directories). [VERIFIED: 87-CONTEXT.md D-03]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `crypto.randomUUID()` is available in all browser targets for this project | Standard Stack | If older browsers are required, need `self.crypto.randomUUID()` polyfill or a UUID library |
| A2 | Firebase Storage rules cannot directly call `getUserData()` (Firestore lookup in Storage rules has different syntax) | Critical Discovery section | If Storage rules CAN do Firestore lookups, tighter role-based rules are possible. Low risk — accepting auth-only gate for Storage is a known Firebase pattern |
| A3 | `storage.rules` deployment uses `firebase deploy --only storage` | Storage setup | If the project uses a different Firebase deploy setup, executor may need a different deploy command |
| A4 | `audit_log` embedded array read-modify-write (vs `arrayUnion`) is the correct approach for objects containing `serverTimestamp()` sentinels | Pitfall 7 | If `arrayUnion` works fine with timestamp sentinels in practice, read-modify-write is still safe (just slightly more verbose) |

---

## Open Questions

1. **Storage Security Rules pattern**
   - What we know: Firebase Storage rules cannot call `getUserData()` using the same syntax as Firestore rules. The project has no existing `storage.rules`.
   - What's unclear: Should storage rules use custom claims (would require Firebase Auth custom claim setup — never done in this project), simple `request.auth != null` (weak but pragmatic), or some alternative?
   - Recommendation: Use `request.auth != null` for Storage rules as a minimum gate. The Firestore rules on `proposals` are the primary security control. Document this as an accepted risk similar to the `invitation_codes` collection accepted risk in `firestore.rules` lines 171–195.

2. **Comms log entry `attachment_storage_path` cleanup on comms log delete**
   - What we know: D-07 allows comms log entries to have Storage files at `proposals/{id}/comms/{entry_id}.<ext>`. The CONTEXT doesn't mention a delete-comms-entry action.
   - What's unclear: Does Phase 87 need a "delete comms entry" action? If so, it must also `deleteObject` the Storage file.
   - Recommendation: Defer comms entry deletion. Make comms log entries append-only in Phase 87 (no delete). Simpler implementation, lower risk.

3. **`projects` collection query in proposals.js for the Create Proposal form dropdown**
   - What we know: The Create Proposal form (Surface 3) needs a dropdown of active projects. The current proposals.js already has `clientsData` and `usersData` listeners but NO `projectsData` listener.
   - What's unclear: Should Phase 87 add a `projects` onSnapshot listener to proposals.js?
   - Recommendation: Yes — add a `projectsData` listener in Phase 87's `init()` section, pushed to the existing `listeners` array.

---

## Environment Availability

Step 2.6: SKIPPED for most dependencies (pure Firebase/JS additions). However, the Storage SDK addition requires Firebase Storage to be enabled on both the prod (`clmc-procurement`) and dev (`clmc-procurement-dev`) Firebase projects.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Firebase Storage (prod bucket) | PROP-05 file uploads | Assumed available (storageBucket in prodConfig) | — | Link-only attachment mode if bucket not provisioned |
| Firebase Storage (dev bucket) | PROP-05 UAT | Assumed available (storageBucket in devConfig) | — | Test with link attachments only |
| `firebase.tools` CLI | Deploy storage.rules | Assumed available (project has deployed rules before) | — | Manual deploy via Firebase console |

**Note:** The `storageBucket` values in `app/firebase.js` (`clmc-procurement.firebasestorage.app` and `clmc-procurement-dev.firebasestorage.app`) suggest Storage is provisioned on both Firebase projects. However, the executor should verify that the Storage buckets are actually active before the plan that ships the Storage SDK. [ASSUMED — cannot verify bucket existence from codebase inspection alone]

---

## Validation Architecture

Config check: `.planning/config.json` not found — treating `nyquist_validation` as enabled by default.

**No automated test infrastructure exists in this project.** CLAUDE.md: "No build, test, or lint commands — zero-build static website." Manual browser UAT against dev Firebase is the standard validation approach per `user_work_patterns.md`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — manual browser UAT |
| Config file | None |
| Quick run command | `python -m http.server 8000` then manual browser verification |
| Full suite command | Manual UAT checklist against dev Firebase |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROP-01 | Create proposal writes correct doc to Firestore | manual | Browser DevTools → Firestore console | N/A |
| PROP-03 | Approve/reject with mandatory comment, writeBatch atomic | manual | Browser — verify both proposal + project docs update | N/A |
| PROP-05 | File upload writes to Storage path | manual | Firebase Storage console | N/A |
| PROP-10 | Dashboard groups by stage, shows age | manual | Browser with seeded proposals | N/A |
| NOTIF-09 | Notification fan-out fires on submit | manual | Check bell icon for approver users | N/A |
| NOTIF-10 | Notification fires on approve/reject | manual | Check bell for submitter | N/A |

### Wave 0 Gaps
- No automated tests to create — this project uses manual UAT exclusively.
- UAT checklist file: `.planning/phases/87-proposal-lifecycle/87-UAT.md` (to be created in last plan)

---

## Security Domain

`security_enforcement` key absent from config — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — all proposal writes require auth | Firebase Auth + `isActiveUser()` in Firestore rules |
| V3 Session Management | no — sessions managed by Firebase Auth (existing) | — |
| V4 Access Control | yes — create/update gated to ops_admin/super_admin | Firestore Security Rules `hasRole(['super_admin', 'operations_admin'])` |
| V5 Input Validation | yes — proposal title, amount, comment, loss reason | Client-side validation + `escapeHTML()` for all rendered strings |
| V6 Cryptography | no — not applicable to this feature | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via proposal title/description in innerHTML | Tampering | `escapeHTML()` from utils.js — already imported in proposals.js |
| Role escalation via client-side role check only | Elevation of Privilege | Firestore Security Rules enforce server-side; client-side gate is defense-in-depth only |
| IDOR on proposal attachment (wrong user downloads file) | Information Disclosure | Storage rules require `request.auth != null`; Firestore rules gate proposal reads to `isActiveUser()` |
| Malicious file upload (executable disguised as PDF) | Tampering | Accept `.pdf,.doc,.docx,.pptx,.xlsx,.png,.jpg,.jpeg` only (UI-SPEC Surface 7); Storage does not execute files |
| Audit log tampering (overwriting existing entries) | Tampering | Read-modify-write pattern preserves all existing entries; Security Rules lock `created_at` and `created_by` immutable |

---

## Sources

### Primary (HIGH confidence)
- `app/views/proposals.js` — verified mount points, module state, existing listeners pattern, engagement-create.js import
- `app/firebase.js` — verified NO Storage SDK, storageBucket config present, writeBatch exported
- `app/notifications.js` — verified `createNotification`, `createNotificationForRoles`, `NOTIFICATION_TYPES.PROPOSAL_SUBMITTED`, `NOTIFICATION_TYPES.PROPOSAL_DECIDED`
- `app/utils.js` — verified `generateSequentialId` signature and behavior
- `app/router.js` — verified `/proposals` route exists, hard super_admin gate
- `firestore.rules` — verified rule helpers, existing collection patterns, no Storage rules
- `app/views/home.js`, `projects.js`, `project-detail.js`, `service-detail.js` — verified all canonical project status strings
- `app/views/project-plan.js` — verified writeBatch import and usage pattern
- `app/engagement-create.js` — verified createEngagement helper exists and is imported in proposals.js
- `.planning/phases/88-management-tab-shell-create-engagement/88-02-SUMMARY.md` — verified Phase 88 shipped, mount points confirmed
- `87-CONTEXT.md` — locked decisions D-01 through D-11
- `87-UI-SPEC.md` — locked UI surfaces, copywriting, color mappings

### Secondary (MEDIUM confidence)
- Firebase 10.7.1 Storage SDK CDN URL inferred from the CDN URL pattern in `app/firebase.js` (same version prefix used for all Firebase services)

### Tertiary (LOW confidence — see Assumptions Log)
- Firebase Storage rules pattern (A2 — cannot verify Storage-specific rule syntax from codebase alone)
- `crypto.randomUUID()` browser support (A1 — standard Web API, broadly available)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all critical files verified directly
- Architecture: HIGH — patterns extracted from existing codebase, not assumed
- Pitfalls: HIGH — all verified from actual code patterns in the codebase
- Firebase Storage specifics: MEDIUM — CDN version confirmed, but storage.rules syntax is [ASSUMED]

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (Firebase 10.7.1 is stable; project patterns are stable)
