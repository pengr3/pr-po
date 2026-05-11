---
phase: 87
plan: 01
subsystem: proposals
tags: [proposals, firebase-storage, firestore-rules, storage-rules, foundation]
dependency_graph:
  requires: [phase-88]
  provides: [firebase-storage-sdk, proposals-firestore-rules, storage-rules, proposal-id-generator, proposal-mount-activation]
  affects: [app/firebase.js, firestore.rules, storage.rules, app/proposal-id.js, app/utils.js, app/views/proposals.js]
tech_stack:
  added:
    - Firebase Storage SDK v10.7.1 (CDN: firebase-storage.js)
    - storage.rules (first Firebase Storage rules file in codebase)
  patterns:
    - CDN import block mirroring existing firebase-auth.js pattern
    - Thin ID-generator wrapper (same shape as app/coll-id.js from Phase 85)
    - Field-level immutability on proposals Firestore rules (mirrors notifications block)
    - Accepted-risk auth-only Storage rules (mirrors invitation_codes pattern)
key_files:
  created:
    - app/proposal-id.js
    - storage.rules
  modified:
    - app/firebase.js
    - firestore.rules
    - app/utils.js
    - app/views/proposals.js
decisions:
  - "Storage rules use request.auth != null (not role check) — Firestore rules are primary gate; accepted risk T-87.1-04"
  - "proposal-id.js is a thin wrapper over generateSequentialId('proposals', 'PROP') — same pattern as coll-id.js"
  - "Re-exported generateProposalId from utils.js so downstream plans have single import path"
  - "Mount activation in init() only — render() retains display:none as unmounted default"
metrics:
  duration_minutes: 3
  tasks_completed: 4
  files_modified: 6
  completed_date: "2026-05-11"
---

# Phase 87 Plan 01: Foundation — Storage SDK + Firestore/Storage Rules + Proposal ID Helper

**One-liner:** Firebase Storage SDK initialized (first in codebase), proposals Firestore rules shipped with role gates + field immutability, new storage.rules created, PROP-YYYY-NNN sequential ID generator added, mount div activated.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add Firebase Storage SDK to app/firebase.js | 2b26396 | app/firebase.js |
| 2 | Add proposals block to firestore.rules + create storage.rules | 3f8fab2 | firestore.rules, storage.rules |
| 3 | Create app/proposal-id.js + re-export from utils.js | b291f22 | app/proposal-id.js, app/utils.js |
| 4 | Activate #proposal-dashboard-mount in proposals.js init() | 38bbb7e | app/views/proposals.js |

## Deliverables Detail

### Task 1 — Firebase Storage SDK (app/firebase.js)

Three insertion points, no lines removed:

**(a) New import block** added after existing firebase-auth.js import block (after line 45):
```javascript
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
```
CDN version `10.7.1` matches firebase-app.js, firebase-firestore.js, firebase-auth.js (all in same file).

**(b) Initialization** added after `const auth = getAuth(app)`:
```javascript
const storage = getStorage(app);
```

**(c) Exports** added:
- Main export extended: `export { db, auth, storage };`
- Named export block: `export { getStorage, ref, uploadBytes, getDownloadURL, deleteObject };`
- Window shim: `window.firebaseStorage = { getStorage, ref, uploadBytes, getDownloadURL, deleteObject };`

Net change: +14 lines, -2 lines (export line extended).

### Task 2 — Security Rules

**firestore.rules:** Proposals block inserted between project_tasks block and notifications block. Exact location: before the `// =============================================\n// notifications collection` header comment. Final block:

```
match /proposals/{proposalId} {
  allow read: if isActiveUser();
  allow create: if hasRole(['super_admin', 'operations_admin'])
    && request.resource.data.created_by == request.auth.uid;
  allow update: if hasRole(['super_admin', 'operations_admin'])
    && request.resource.data.created_by == resource.data.created_by
    && request.resource.data.created_at == resource.data.created_at;
  allow delete: if isRole('super_admin');
}
```

Net change: +32 lines (including comments header).

**storage.rules:** New file at repo root. First 3 lines: `rules_version = '2'`, `service firebase.storage {`, `match /b/{bucket}/o {`. Proposals path block: `match /proposals/{proposalId}/{allPaths=**}` with `allow read: if request.auth != null` and `allow write: if request.auth != null`. Accepted-risk comment explains why role check is not enforced here.

### Task 3 — Proposal ID Generator

**app/proposal-id.js** (new, 19 lines):
```javascript
import { generateSequentialId } from './utils.js';
export async function generateProposalId() {
    return generateSequentialId('proposals', 'PROP');
}
```
Returns e.g. `'PROP-2026-001'` by reading `proposal_id` field from existing proposals docs.

**app/utils.js** (append, +2 lines):
```javascript
// Phase 87: re-export proposal ID generator for convenience
export { generateProposalId } from './proposal-id.js';
```

Downstream plans can use either `import { generateProposalId } from '../utils.js'` or `import { generateProposalId } from '../proposal-id.js'`.

### Task 4 — Mount Activation (app/views/proposals.js)

Single insertion inside `init()` after window function registrations, before clients listener:
```javascript
// Phase 87: activate proposal dashboard mount point.
// The dashboard content is injected by Plan 02 in renderProposalDashboard().
const mount = document.getElementById('proposal-dashboard-mount');
if (mount) mount.style.display = 'block';
```

The `render()` function's `style="display: none;"` on the `#proposal-dashboard-mount` div is unchanged (correct unmounted default). Activation at runtime only.

## Manual Deploy Required Before Plan 02

**User must deploy both rules files BEFORE Plan 02 runs:**

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

This is the same manual pattern as Phase 85/86 rules deployments. Without these deploys, the `proposals` Firestore collection will be blocked by the default deny-all rule, and Storage uploads will fail.

**Browser smoke test after deploy:**
1. Open app in dev — no console errors from firebase.js Storage init
2. In DevTools: `window.firebaseStorage.getStorage` should be a function
3. `window.firebaseStorage.ref(window.firebaseStorage.getStorage(), 'test')` should return StorageReference without throwing

## Deviations from Plan

None — plan executed exactly as written. All 4 task acceptance criteria met on first pass.

## Known Stubs

None — this plan ships infrastructure only. No UI content, no dashboard rendered yet. The `#proposal-dashboard-mount` div becomes a visible empty block until Plan 02 injects content.

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes beyond what the plan's threat model already covers. The `window.firebaseStorage` exposure mirrors `window.firestore` (T-87.1-06 accepted disposition).

## Self-Check: PASSED

- app/firebase.js exists and contains `firebase-storage.js` import: FOUND
- firestore.rules contains `match /proposals/{proposalId}`: FOUND
- storage.rules exists at repo root: FOUND
- app/proposal-id.js exists: FOUND
- app/utils.js re-exports generateProposalId: FOUND
- app/views/proposals.js contains mount activation in init(): FOUND (line 446 > line 437)
- Commit 2b26396 (Task 1): FOUND
- Commit 3f8fab2 (Task 2): FOUND
- Commit b291f22 (Task 3): FOUND
- Commit 38bbb7e (Task 4): FOUND
- No unexpected file deletions across all 4 commits: CONFIRMED
