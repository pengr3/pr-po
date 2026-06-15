---
phase: 87-proposal-lifecycle
plan: 05
subsystem: proposals
tags: [proposals, comms-log, firebase-storage, attachment-per-entry, append-only]

requires:
  - phase: 87-04
    provides: "Firebase Storage upload pipeline + attachment widget + storage/ref/uploadBytes/getDownloadURL imports"
  - phase: 87-02
    provides: "proposalsData module state, buildProposalDetailModalHtml, buildCommsLogSection placeholder, cryptoRandomUuid, escapeHTML, showToast, showLoading, currentProposal"
  - phase: 87-03
    provides: "_refreshDetailModalAfterTransition, _applyProposalStateTransition"
provides:
  - "Comms Log inline Add Entry form (date/type/description + optional attachment) fully wired"
  - "toggleAddCommsForm: expand/collapse inline form with button label flip"
  - "saveCommsEntry: validate + optional file upload to proposals/{docId}/comms/{entryId}.{ext} + read-modify-write comms_log spread + modal re-render"
  - "_switchCommsAttachmentKind: radio toggle for none/link/file attachment inputs"
  - "_renderCommsEntry + _renderCommsTypeBadge + COMMS_TYPE_META — comms entry display helpers"
  - "PROP-08 complete — client communications log with per-entry optional attachment"
affects: [phase-89-proposal-approval-queue]

tech-stack:
  added: []
  patterns:
    - "Comms log append-only — read-modify-write spread on comms_log array (no arrayUnion — Pitfall 7)"
    - "Per-entry file upload to proposals/{docId}/comms/{entryId}.{ext} (D-07 path)"
    - "logged_at uses new Date().toISOString() (not serverTimestamp — array element constraint)"
    - "Optimistic modal re-render: setTimeout(0) merge if onSnapshot hasn't caught up"
    - "ISO 8601 string localeCompare for newest-first sort"
    - "_stubP05 function definition kept as dead code; callers replaced with real functions in init()"

key-files:
  created: []
  modified:
    - app/views/proposals.js

key-decisions:
  - "COMMS_TYPE_META constant maps type values to badge CSS classes: sent→badge-primary, feedback_received→status-badge pending, revision_requested→status-badge rejected"
  - "Inline form uses None/Paste-a-link/Upload-a-file radio (None default) — per-entry attachment is optional per D-07"
  - "logged_by_name denormalized on each entry (beyond D-04 spec) so display doesn't require a users lookup"
  - "Optimistic merge on save: if onSnapshot hasn't updated proposalsData yet, manually inject new entry before re-rendering modal"
  - "_stubP05 window assignment callers removed from init(); function definition left as dead code per plan guidance"

patterns-established:
  - "Append-only comms log: no edit/delete functions in Phase 87 (Open Question 2 resolution)"
  - "Per-entry file upload mirrors main attachment widget (same validation, same extension allowlist, same 10MB cap)"

requirements-completed: [PROP-08]

duration: 10min
completed: "2026-05-11"
---

# Phase 87 Plan 05: Comms Log — Client Communications Log Summary

**Inline Add Entry form inside Proposal Detail modal with type-badged entries, optional per-entry file upload to `proposals/{docId}/comms/{entryId}.{ext}`, and append-only read-modify-write comms_log array; closes PROP-08 and completes Phase 87.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-11T~08:10:00Z
- **Completed:** 2026-05-11
- **Tasks:** 3 auto tasks complete; 1 UAT checkpoint pending user verification
- **Files modified:** 1 (app/views/proposals.js)

## Accomplishments

- Replaced Plan 02 `buildCommsLogSection` placeholder with full renderer: entries sorted newest-first by ISO 8601 `localeCompare`, type badges, attachment links, actor name
- Implemented `saveCommsEntry` with full validation (date/type/description required; attachment optional with 10MB cap + allowlist), file upload to `proposals/{docId}/comms/{entryId}.{ext}`, comms_log read-modify-write spread, optimistic modal re-render
- Wired all 3 Plan 05 handlers into `init()` (replacing `_stubP05` callers) and `destroy()` (adding `_switchCommsAttachmentKind` to deletions)
- Phase 87 now has ZERO remaining stubs across Plans 03/04/05 — all `_stubP03`, `_stubP04`, `_stubP05` callers in `init()` replaced with real functions

## Final Line Count

- **Before Plan 05:** 2,041 lines (Phase 87 Plan 04 baseline)
- **After Plan 05:** 2,307 lines (+266 lines added)

## Phase 87 Functions Added (Plan 05)

### Rendering helpers (replaced Plan 02 buildCommsLogSection placeholder)
- `COMMS_TYPE_META` — type→badge mapping constant
- `_renderCommsTypeBadge(type)` — renders badge span with correct class
- `_renderCommsEntry(entry)` — renders single comms entry with date/type/description/attachment
- `buildCommsLogSection(proposal)` — full section with entries list (newest first) + inline Add Entry form

### Action handlers
- `toggleAddCommsForm(proposalDocId)` — expand/collapse inline form; flips button label between `+ Add Entry` and `Cancel`; resets radio on collapse
- `_switchCommsAttachmentKind(kind)` — shows/hides link URL vs file input based on radio selection
- `saveCommsEntry(proposalDocId)` — validates, uploads file if needed, writes `comms_log` via spread, shows toast `Communication entry added.`, collapses form, re-renders modal

## Task Commits

1. **Task 1: Replace Plan 02 buildCommsLogSection with real renderer + add helper renderCommsEntry** — `dad2ef6`
2. **Task 2: Implement toggleAddCommsForm + saveCommsEntry + _switchCommsAttachmentKind helper** — `ee3bb86`
3. **Task 3: Replace Plan 02 Plan-05 stub registrations + register Plan 05 helpers + extend destroy()** — `c0368a2`

## Files Created/Modified
- `app/views/proposals.js` — comms log rendering helpers, action handlers, init/destroy wiring; 2,041 → 2,307 lines

## Stub Status After Plan 05

| Stub function | Callers in init() | Status |
|---|---|---|
| `_stubP03` | 0 | Dead code (definition remains) |
| `_stubP04` | 0 | Dead code (definition remains) |
| `_stubP05` | 0 | Dead code (definition remains) |

All Phase 87 window functions are now real implementations.

## Window Function Registration / Cleanup

### init() — Plan 05 assignments (replacing _stubP05 stubs + new helper)
```javascript
window.toggleAddCommsForm           = toggleAddCommsForm;
window.saveCommsEntry               = saveCommsEntry;
window._switchCommsAttachmentKind   = _switchCommsAttachmentKind;
```

### destroy() — 3 deletions (2 were already there from Plan 02, 1 added now)
```javascript
delete window.toggleAddCommsForm;
delete window.saveCommsEntry;
delete window._switchCommsAttachmentKind;   // added by Plan 05
```

## Storage Path Convention

Comms entry file uploads: `proposals/{proposalDocId}/comms/{entryId}.{ext}`

Example: `proposals/abc123xyz/comms/f47ac10b-58cc-4372-a567-0e02b2c3d479.pdf`

## Decisions Made

- `logged_by_name` denormalized on each comms entry (D-04 didn't include it but UI-SPEC requires actor display) — safer to write at creation time than to look up later
- ISO 8601 string `localeCompare` for newest-first sort — correctness proof: ISO 8601 strings sort lexically the same as chronologically
- None radio is the DEFAULT for attachment (vs Plan 04 where Link was default) — per-entry attachment is optional per D-07; Plan 04 main attachment assumes attaching is the typical action

## Deviations from Plan

None — plan executed exactly as written. All 3 task acceptance criteria met on first pass. No Rule 1/2/3 auto-fixes triggered.

## UAT Status (Task 4 — checkpoint:human-verify)

**Awaiting user verification.** The UAT gate covers full Phase 87 end-to-end lifecycle (scenarios A-J per Task 4 details). Plans 01-05 code is complete; user runs the browser UAT on dev Firebase and signals "approved" to close Phase 87.

UAT scenarios:
- A: Create + Edit + Dashboard
- B: Submit for Internal Approval (NOTIF-09)
- C: Approve (NOTIF-10)
- D: Reject + Re-submit
- E: Mark Sent + Client Approved
- F: Loss path
- G: Attachment widget (PROP-05)
- H: Comms Log (PROP-08)
- I: Navigation + destroy cleanup
- J: Non-approver user (route gate)

## Phase 87 Requirements Coverage

| Requirement | Plan | Status |
|-------------|------|--------|
| PROP-01 — Proposal creation | 87-02 | Code complete |
| PROP-02 — Proposal edit | 87-02 | Code complete |
| PROP-03 — Submit/approve/reject | 87-03 | Code complete |
| PROP-04 — Audit trail | 87-02, 87-03 | Code complete |
| PROP-05 — Attachment (link or file) | 87-04 | Code complete |
| PROP-06 — Single replaceable attachment (scoped) | 87-04 | Code complete |
| PROP-07 — Mark Sent + Client Approved / Loss | 87-03 | Code complete |
| PROP-08 — Comms log | 87-05 | Code complete |
| PROP-09 — Loss reason free text | 87-03 | Code complete |
| PROP-10 — Proposal dashboard | 87-02 | Code complete |
| PROP-11 — Top-level proposals collection | 87-01 | Code complete |
| NOTIF-09 — Proposal submitted fan-out | 87-03 | Code complete |
| NOTIF-10 — Proposal decided single-recipient | 87-03 | Code complete |

**All 13 requirements (PROP-01..PROP-11 + NOTIF-09 + NOTIF-10): code complete. Pending UAT.**

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond the plan's threat model. All user-supplied strings rendered via `escapeHTML()`. `target="_blank" rel="noopener noreferrer"` on attachment links. 10MB client-side limit enforced before any `uploadBytes` call.

## Known Stubs

None — all Plan 05 comms log functionality is fully wired.

## Self-Check: PASSED

- app/views/proposals.js: CONFIRMED (2,307 lines, syntax OK)
- Commit dad2ef6 (Task 1): FOUND
- Commit ee3bb86 (Task 2): FOUND
- Commit c0368a2 (Task 3): FOUND
- `function buildCommsLogSection` count == 1: CONFIRMED
- `_stubP05(` callers == 0: CONFIRMED (only definition line remains)
- `delete window._switchCommsAttachmentKind` == 1: CONFIRMED
- `Communication entry added.` == 1: CONFIRMED
- No unexpected file deletions: CONFIRMED
