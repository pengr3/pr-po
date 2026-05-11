---
phase: 87
plan: 04
subsystem: proposals
tags: [proposals, firebase-storage, attachment-widget, file-upload, audit-trail]
dependency_graph:
  requires: [phase-87-01, phase-87-02, phase-87-03]
  provides: [attachment-widget, save-attachment, remove-attachment, replace-attachment]
  affects: [app/views/proposals.js]
tech_stack:
  added: []
  patterns:
    - Firebase Storage uploadBytes → getDownloadURL → Firestore updateDoc pipeline
    - Non-fatal deleteObject wrapped in try/catch (Firestore is source of truth)
    - outerHTML swap for in-place widget State A/B re-render (no modal re-open)
    - ATTACHMENT_REPLACED audit entry on every save/replace/remove (D-03 invariant)
    - Inline micro-confirm for Remove (no separate modal, stays in detail modal flow)
key_files:
  created: []
  modified:
    - app/views/proposals.js
decisions:
  - "Storage import added as second firebase.js import line (avoids very long single line)"
  - "buildAttachmentSection State B shows domain-only for links (new URL().hostname), filename for files"
  - "_openProposalAttachmentReplace uses outerHTML swap with synthetic attachment_kind=null proposal — no modal re-open needed"
  - "saveProposalAttachment deletes old storage object only when kind changes file→link OR file→file with different extension; same extension overwrites silently (Firebase Storage uploadBytes default)"
  - "deleteObject failure is non-fatal in both save and remove paths — console.error only, no throw"
  - "D-03 audit invariant: ATTACHMENT_REPLACED written on first-attach, replace, and remove; remove path adds comment='Attachment removed.' to disambiguate in audit timeline"
  - "No version history per PROP-06 scope correction — single replaceable attachment, no /v1 /v2 paths"
metrics:
  duration_minutes: 3
  tasks_completed: 3
  files_modified: 1
  completed_date: "2026-05-11"
---

# Phase 87 Plan 04: Attachment Widget Summary

**One-liner:** Real attachment widget (State A: link/file radio + inputs; State B: clickable link + Replace/Remove with inline micro-confirm) wired to Firebase Storage uploadBytes + Firestore updateDoc + ATTACHMENT_REPLACED audit entries; Plan 02 placeholder replaced.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Extend imports + replace buildAttachmentSection with real widget renderer | 511cb76 | app/views/proposals.js |
| 2 | Implement saveProposalAttachment + removeProposalAttachment + 3 helper functions | 554de9e | app/views/proposals.js |
| 3 | Replace Plan 04 stubs in init() + add helper window registrations + extend destroy() | 653a407 | app/views/proposals.js |

## Final Line Count

- **Before Plan 04:** 1,739 lines (Phase 87 Plan 03 baseline)
- **After Plan 04:** 2,041 lines (+302 lines added)

## Phase 87 Functions Added (Plan 04)

### Widget renderer (replaced Plan 02 placeholder)
- `buildAttachmentSection(proposal)` — replaces Plan 02 placeholder; renders State A (no attachment: radio inputs + URL/file inputs + Save Attachment button) or State B (attachment exists: clickable link/filename + Replace + Remove buttons + inline micro-confirm)

### Attachment action handlers
- `saveProposalAttachment(proposalDocId)` — validates link URL (http/https regex) or file (10 MB cap + extension allowlist), uploads via `uploadBytes` to `proposals/{docId}/attachment.<ext>`, writes Firestore doc with attachment_* fields + ATTACHMENT_REPLACED audit entry; best-effort deletes stale old storage object when kind or extension changes
- `removeProposalAttachment(proposalDocId)` — nulls all attachment_* fields, appends ATTACHMENT_REPLACED audit entry with `comment: 'Attachment removed.'`, best-effort `deleteObject` for prior file
- `_switchProposalAttachmentKind(proposalDocId, kind)` — radio-toggle: shows/hides link URL input vs file input, clears inline error
- `_openProposalAttachmentReplace(proposalDocId)` — swaps widget to State A in-place via `outerHTML` using synthetic `attachment_kind: null` proposal object
- `_openProposalAttachmentRemoveConfirm(proposalDocId)` — reveals inline micro-confirm `#proposalAttachmentRemoveConfirm` panel

## Window Function Registration / Cleanup

### init() — Plan 04 assignments (replacing _stubP04 stubs)
```javascript
window.saveProposalAttachment           = saveProposalAttachment;
window.removeProposalAttachment         = removeProposalAttachment;
window._switchProposalAttachmentKind    = _switchProposalAttachmentKind;
window._openProposalAttachmentReplace   = _openProposalAttachmentReplace;
window._openProposalAttachmentRemoveConfirm = _openProposalAttachmentRemoveConfirm;
```

### destroy() — 5 deletions added
```javascript
delete window.saveProposalAttachment;
delete window.removeProposalAttachment;
delete window._switchProposalAttachmentKind;
delete window._openProposalAttachmentReplace;
delete window._openProposalAttachmentRemoveConfirm;
```

## Stub Status After Plan 04

- `_stubP04` window assignments: **0** (both replaced with real functions)
- `_stubP04` function definition: 1 (dead code — harmless)
- `_stubP05` window assignments: **2** (toggleAddCommsForm + saveCommsEntry — untouched, pending Plan 05)

## Storage Path Convention

All uploads use: `proposals/{proposalDocId}/attachment.{ext}`

Example: `proposals/abc123xyz/attachment.pdf`

No versioning path segments (`/v1`, `/v2`) — PROP-06 scoped to single replaceable attachment per D-03.

## deleteObject Failure Cases

Both failure sites use isolated try/catch with `console.error`:
1. `[Proposals] deleteObject(old attachment) failed:` — in `saveProposalAttachment` when kind changes or extension changes
2. `[Proposals] deleteObject(removed attachment) failed:` — in `removeProposalAttachment`

In both cases the Firestore doc update has already succeeded — the UI shows success and the widget re-renders correctly. The orphan Storage object may persist but Firestore is the source of truth.

## Deviations from Plan

None — plan executed exactly as written. All 3 task acceptance criteria met on first pass. No Rule 1/2/3 auto-fixes triggered.

## Known Stubs

| Stub | Location | Reason |
|------|----------|--------|
| `window.toggleAddCommsForm` | init() | Comms log writes ship in Plan 05 |
| `window.saveCommsEntry` | init() | Comms log writes ship in Plan 05 |
| Add Comms Entry form | `buildCommsLogSection()` — hidden div | Ships in Plan 05 |

## Coverage

- PROP-05 (link + file attachment) — `saveProposalAttachment` handles both `kind=link` and `kind=file` paths; `_openProposalAttachmentReplace` enables Replace flow
- PROP-06 (scoped — no version history, single replaceable attachment) — confirmed: no `/v{n}/` path segments, `uploadBytes` overwrites same path for same extension

## Threat Surface Scan

No new network endpoints or auth paths beyond the plan's threat model. All rendered URLs pass through `escapeHTML()`. `target="_blank" rel="noopener noreferrer"` on attachment links per T-87.4-03 mitigation. 10 MB client-side limit enforced before any `uploadBytes` call per T-87.4-02 mitigation.

## Self-Check: PASSED

- app/views/proposals.js modified and exists: CONFIRMED (2041 lines)
- Commit 511cb76 (Task 1 — imports + buildAttachmentSection): FOUND
- Commit 554de9e (Task 2 — action handlers): FOUND
- Commit 653a407 (Task 3 — init/destroy wiring): FOUND
- node --check app/views/proposals.js: SYNTAX OK
- `_stubP04(` window assignments == 0: CONFIRMED
- `_stubP05(` window assignments == 2 (untouched): CONFIRMED
- `grep -c "delete window._switchProposalAttachmentKind"` == 1: CONFIRMED
- No unexpected file deletions: CONFIRMED (only proposals.js modified)
