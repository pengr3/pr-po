---
phase: 87
plan: 02
subsystem: proposals
tags: [proposals, dashboard, create-edit-modal, detail-modal, audit-trail, onSnapshot]
dependency_graph:
  requires: [phase-87-01, phase-88]
  provides: [proposal-dashboard, create-proposal-modal, edit-proposal-modal, proposal-detail-modal, audit-trail-read, stub-window-functions]
  affects: [app/views/proposals.js]
tech_stack:
  added: []
  patterns:
    - Phase 87 module state layered on top of Phase 88 module state (no redeclaration)
    - Stub-bridge pattern: Plan 02 registers toast-stubs, Plans 03/04/05 overwrite via direct assignment
    - onSnapshot pushed to existing Phase 88 listeners array
    - cryptoRandomUuid() with crypto.randomUUID() + pseudo-UUID fallback for audit entry_id
    - ISO string (not serverTimestamp()) for audit_log array element ts field (Firestore sentinel constraint)
key_files:
  created: []
  modified:
    - app/views/proposals.js
decisions:
  - "Phase 87 module state added without disturbing Phase 88 state — listeners push-only, no redeclaration"
  - "Projects listener filters project_status==='Draft' and active===false — mirrors Phase 88-02 procurement.js filter"
  - "audit_log CREATED entry uses new Date().toISOString() for ts (not serverTimestamp()) — Firestore rejects sentinels inside array elements (87-RESEARCH.md Pitfall 7 / Pattern E)"
  - "Edit mode updateDoc omits audit_log entirely — D-04: metadata edits do not append to audit trail"
  - "Project dropdown disabled in edit mode — D-02: project_id is immutable post-create; also absent from updateDoc payload"
  - "Action buttons gated by window.getCurrentUser().role check in renderProposalActionButtons — only canApprove roles see Submit/Approve/Reject"
  - "Stub window functions use _stubP03/_stubP04/_stubP05 factories emitting 'wiring ships in Plan N' info toasts"
metrics:
  duration_minutes: 7
  tasks_completed: 4
  files_modified: 1
  completed_date: "2026-05-11"
---

# Phase 87 Plan 02: Proposal Dashboard + Create/Edit + Detail Modal Summary

**One-liner:** Proposal Dashboard with stage-grouped table, real-time onSnapshot, Create/Edit 640px modal writing full D-02 schema with CREATED audit entry, and Proposal Detail 900px modal with vertical audit trail thread — all Phase 87 window functions registered with Plan 03/04/05 stub bridge.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add Phase 87 module state + proposals/projects onSnapshot listeners | 706c38d | app/views/proposals.js |
| 2 | Implement renderProposalDashboard + detail modal + audit trail rendering | bc4b3d3 | app/views/proposals.js |
| 3 | Implement Create/Edit Proposal modal + saveProposal() + stub functions | 1997952 | app/views/proposals.js |
| 4 | Register Phase 87 window functions in init() + clean up in destroy() | df91527 | app/views/proposals.js |

## Final Line Count

- **Before Plan 02:** ~507 lines (Phase 88 baseline)
- **After Plan 02:** 1,276 lines (+769 lines added)

## Phase 87 Functions Added

### Dashboard rendering
- `getProposalStatusBadge(status)` — badge class + label map for all 6 proposal statuses
- `getAgeInStageDays(proposal)` — days since current_status_since (or created_at fallback)
- `isOverdueInStage(proposal)` — pending_internal/pending_client AND age > 7 days
- `renderAgeBadge(proposal)` — age text with "— needs attention" suffix + #856404 color when overdue
- `renderProposalDashboard()` — main entry point: groups by stage, hides empty stages, renders empty state or stage group cards
- `renderStageGroupCard(label, proposals)` — card with header + 7-column table (PROP ID/Title/Project/Client/Amount/Age/Actions)

### Audit Trail rendering
- `renderAuditTrail(proposal)` — vertical thread, newest-first, colored dots per action type
- Constants: `AUDIT_ACTION_DOT_COLORS`, `AUDIT_ACTION_LABELS`

### Proposal Detail modal
- `renderProposalActionButtons(proposal)` — role-gated buttons per status; stubs for Plans 03/04/05
- `buildProposalDetailModalHtml(proposal)` — 900px modal, 3fr/2fr grid layout
- `buildProposalDetailsBlock(proposal)` — metadata display grid
- `buildAttachmentSection(proposal)` — Plan 04 placeholder with current state display
- `buildCommsLogSection(proposal)` — read-only comms entries + Plan 05 placeholder for add form
- `openProposalDetail(proposalDocId)` — finds proposal in proposalsData, injects modal into body
- `closeProposalDetailModal()` — removes modal, clears currentProposal

### Create/Edit Proposal modal
- `openCreateProposalModal()` — sets mode='create', calls showCreateModal(null)
- `openEditProposalModal(proposalDocId)` — sets mode='edit', calls showCreateModal(existing)
- `showCreateModal(existing)` — 640px modal with Title/Project/Client/Description/Amount fields; project disabled in edit mode
- `closeCreateProposalModal()` — removes modal, resets mode/editingId
- `saveProposal()` — validates fields, creates or edits; create path mints PROP-YYYY-NNN, writes full D-02 schema; edit path updates title/description/amount/target_client_* only (no audit_log)
- `cryptoRandomUuid()` — crypto.randomUUID() with pseudo-UUID fallback

### Stub factories
- `_stubP03(label)` — returns function emitting 'wiring ships in Plan 03 (state transitions).' toast
- `_stubP04(label)` — returns function emitting 'wiring ships in Plan 04 (attachments).' toast
- `_stubP05(label)` — returns function emitting 'wiring ships in Plan 05 (comms log).' toast

## Window Functions Registered

### Real implementations (6)
- `window.openProposalDetail`
- `window.closeProposalDetailModal`
- `window.openCreateProposalModal`
- `window.openEditProposalModal`
- `window.closeCreateProposalModal`
- `window.saveProposal`

### Plan 03 stubs (9 — state transitions)
- `window.submitProposalForApproval`
- `window.openApproveModal`
- `window.openRejectModal`
- `window.submitProposalApproval`
- `window.openLossModal`
- `window.submitLoss`
- `window.openClientApprovedModal`
- `window.submitClientApproved`
- `window.submitMarkSentToClient`

### Plan 04 stubs (2 — attachments)
- `window.saveProposalAttachment`
- `window.removeProposalAttachment`

### Plan 05 stubs (2 — comms log)
- `window.toggleAddCommsForm`
- `window.saveCommsEntry`

## Phase 88 Code — Unchanged Confirmation

All Phase 88 window functions (`submitNewEngagement`, `handleEngagementTypeChange`, `proposalSelectPersonnel`, `proposalRemovePersonnel`, `proposalShowPersonnelDropdown`, `proposalFilterPersonnelDropdown`) are untouched in their registration, implementation, and destroy() cleanup. Verified by grep counts (each == 1).

## Sample Doc Payload Shape (addDoc on create)

```javascript
{
  proposal_id: 'PROP-2026-001',
  project_id: '<firestore-doc-id>',
  project_code: 'CLMC-2026-001',
  title: 'Electrical Upgrade Proposal',
  description: 'Scope: replace main panel...',
  amount: 250000,
  target_client_id: '<client-doc-id>',    // or null
  target_client_name: 'Metro Builders',   // or null
  status: 'draft',
  attachment_kind: null,
  attachment_url: null,
  attachment_storage_path: null,
  attachment_filename: null,
  audit_log: [{
    entry_id: '<uuid>',
    ts: '2026-05-11T06:24:00.000Z',  // ISO string (not serverTimestamp — array sentinel constraint)
    actor_id: '<uid>',
    actor_name: 'Admin User',
    action: 'CREATED',
    comment: null
  }],
  comms_log: [],
  loss_reason: null,
  current_status_since: serverTimestamp(),
  created_by: '<uid>',
  created_at: serverTimestamp(),
  updated_at: serverTimestamp()
}
```

## Deviations from Plan

None — plan executed exactly as written. All 4 task acceptance criteria met on first pass. No Rule 1/2/3 auto-fixes triggered.

## Known Stubs

The following are intentional, documented stubs per plan design:

| Stub | Location | Reason |
|------|----------|--------|
| Attachment widget | `buildAttachmentSection()` in detail modal | Ships in Plan 04 |
| Add Comms Entry form | `buildCommsLogSection()` — `commsLogAddForm-{id}` div hidden | Ships in Plan 05 |
| `window.submitProposalForApproval` through `window.submitMarkSentToClient` (9 stubs) | init() | State transitions ship in Plan 03 via writeBatch + project status advancement |
| `window.saveProposalAttachment` / `window.removeProposalAttachment` | init() | Firebase Storage logic ships in Plan 04 |
| `window.toggleAddCommsForm` / `window.saveCommsEntry` | init() | Comms log writes ship in Plan 05 |

None of these stubs prevent the plan's goal from being achieved. The dashboard, create, edit, and view (audit trail) flows are fully functional.

## Coverage

- PROP-01 (create proposal) ✓ — `saveProposal()` create path
- PROP-02 (edit proposal) ✓ — `saveProposal()` edit path
- PROP-10 (proposal dashboard) ✓ — `renderProposalDashboard()` + stage groups
- PROP-04 (audit trail read side) ✓ — `renderAuditTrail()` in detail modal

## Threat Flags

No new network endpoints, auth paths, or trust boundary changes beyond what the plan's threat model already covers. All user-supplied strings interpolated into innerHTML are wrapped in `escapeHTML()` per T-87.2-01 mitigation. Status field hard-coded as `'draft'` on create per T-87.2-02. Project immutability enforced via disabled dropdown + absent field in updateDoc payload per T-87.2-03.

## Self-Check: PASSED

- app/views/proposals.js modified and exists: CONFIRMED (1276 lines)
- Commit 706c38d (Task 1): FOUND
- Commit bc4b3d3 (Task 2): FOUND
- Commit 1997952 (Task 3): FOUND
- Commit df91527 (Task 4): FOUND
- No syntax errors: node --check PASSED
- Phase 88 submitNewEngagement == 1 (untouched): CONFIRMED
- Phase 87 listeners.push(proposalsListener) == 1: CONFIRMED
- Phase 87 listeners.push(projectsListener) == 1: CONFIRMED
- No unexpected file deletions: CONFIRMED (only proposals.js modified)
