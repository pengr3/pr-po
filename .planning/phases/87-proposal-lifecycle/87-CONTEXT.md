---
name: 87-CONTEXT
description: Decisions for Phase 87 — Proposal Lifecycle. Defines proposal data shape, attachment model (link OR replaceable file — no version history), embedded audit_log + comms_log arrays, role-based approvers, free-text loss reason, and notification reuse from Phase 83. Sequencing locked: Phase 88 ships first, then 87 plugs into the existing Mgmt Tab.
type: phase-context
---

# Phase 87: Proposal Lifecycle — Context

**Gathered:** 2026-05-11
**Status:** Ready for planning (after Phase 88 ships)
**Source:** `/gsd-discuss-phase 87` — interactive discussion with user

<domain>
## Phase Boundary

Phase 87 delivers the **proposal approval lifecycle**: create a proposal record linked to a project, route it through internal approval (with mandatory comments + audit trail), attach a single replaceable reference (URL or file), log client communications, mark client decisions, and have the parent project's status auto-advance through the proposal stages. NOTIF-09 fires when a proposal is submitted; NOTIF-10 fires when the approver decides — both via the helpers locked in Phase 83.

**Sequencing decision (D-01):** Phase 88 (Management Tab Shell + Create Engagement) ships **first**. Phase 87 then plugs the proposal dashboard (PROP-10) into the existing Mgmt Tab. Phase 87 does NOT build any Mgmt Tab scaffolding.

### In scope (PROP-01..11, NOTIF-09, NOTIF-10)

- **Proposal creation** — title, description, amount, target client, version, project link.
- **Submit for internal approval** — flips project status to `"Proposal for Internal Approval"`, fires NOTIF-09 to all active Operations Admin + Super Admin recipients.
- **Approve / reject** — mandatory comment, audit-log entry, project status advances to `"Proposal Under Client Review"` (approved) or back to `"For Revision"` (rejected). NOTIF-10 to the proposal submitter.
- **Audit trail** — every approval / state-change action recorded on the proposal doc.
- **Single replaceable attachment** — URL string OR one Firebase Storage file path. No version history.
- **Send to client + comms log** — date sent, communications log entries with date, type, description, optional attachment (link or file).
- **Client decision** — Client Approved → project status `"Client Approved"` / `"For Mobilization"`; Loss → project status `"Loss"` + free-text loss reason captured in audit.
- **Proposal dashboard** — grouped-by-stage view with age-in-stage indicators; lives inside the Mgmt Tab built by Phase 88.
- **Security Rules** — `proposals` create/edit limited to Operations Admin + Super Admin; approve/reject also limited to those two roles. Storage rules for `proposals/{proposal_id}/*` mirror Firestore rules.

### Out of scope (deferred)

- **PROP-06 reframed:** auto-incrementing version numbers and old-version retrieval are NOT in this phase. The user is not in-house authoring proposals — CLMC just attaches a link or single file for review (D-03). Capture this scope correction in deferred ideas.
- Loss reason dropdown / categorization (D-06 keeps free text; analytics on loss reasons is a v4.1+ topic).
- Project-attached approvers (D-05 keeps role-based gating).
- Email or browser-push notifications (already globally deferred per Phase 83).
- Cloud Functions / server-side state-transition enforcement (the codebase has no server tier; client-side mutation through Security Rules is the model).
- Multi-attachment proposals (one current attachment per proposal; comms-log entries can each carry one).
- Subcollections for audit / comms (D-04 keeps them as embedded arrays on the proposal doc).

</domain>

<decisions>
## Implementation Decisions

### D-01 — Phase sequencing
Phase 88 (Mgmt Tab Shell + Create Engagement) ships before Phase 87. Phase 87 will plug the proposal dashboard (PROP-10) into the Mgmt Tab navigation/router structure that Phase 88 creates. Phase 87 does not invent any Mgmt Tab UI scaffolding, route, or Security Rule for the tab itself. **Action for downstream agents:** treat `app/views/management.js` (or whatever Phase 88 lands as) as an existing surface the proposal dashboard mounts inside.

### D-02 — Proposal data shape
Top-level `proposals` collection (locked by PROP-11). Each doc:
```
{
  proposal_id: 'PROP-2026-001',           // human-readable, project-code style sequential id
  project_id: <project doc id>,           // FK — proposal lives under a project
  project_code: 'PROJ-2026-014',          // denormalized for list views
  title: string,
  description: string,
  amount: number,
  target_client_id: <client doc id> | null,
  target_client_name: string,             // denormalized
  status: 'draft' | 'pending_internal' | 'pending_client' | 'for_revision' | 'client_approved' | 'loss',
  attachment_kind: 'link' | 'file' | null,
  attachment_url: string | null,          // populated if kind = 'link'
  attachment_storage_path: string | null, // populated if kind = 'file' (e.g. 'proposals/<id>/attachment.pdf')
  attachment_filename: string | null,     // original filename for download UX
  audit_log: [...],                       // embedded — see D-04
  comms_log: [...],                       // embedded — see D-04
  loss_reason: string | null,             // free text, populated only when status = 'loss'
  created_by: <uid>,
  created_at: timestamp,
  updated_at: timestamp
}
```
Internal proposal `status` field tracks the proposal's own lifecycle; the parent project's status is updated separately in the same writeBatch when transitions happen (D-09).

### D-03 — Attachment model: link OR single replaceable file
**No version history.** Each proposal has exactly one current attachment, OR none. Attachment can be a URL string (Google Drive / SharePoint / Dropbox / etc.) OR one file in Firebase Storage at `proposals/{proposal_id}/attachment.<ext>`. Replacing the attachment overwrites the Storage file (or swaps `attachment_url`). No old binaries are kept.

**Replacement audit:** every attachment change writes an audit_log entry (`action: 'ATTACHMENT_REPLACED'`) so the paper trail records that a swap happened, even though the prior content is no longer retrievable.

**Why:** the user explicitly stated CLMC is not in-house authoring proposals — it just attaches links/files for review. PROP-06's auto-increment version requirement was based on a more ambitious original spec. See `feedback_root_cause_first.md` and `project_clmc_not_authoring_platform.md` in user memory.

### D-04 — Audit + comms logs are embedded arrays on the proposal doc
```
audit_log: [
  { entry_id: <uuid>, ts: timestamp, actor_id: <uid>, actor_name: string,
    action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ATTACHMENT_REPLACED' |
            'SENT_TO_CLIENT' | 'CLIENT_APPROVED' | 'LOSS_RECORDED',
    comment: string | null }
]

comms_log: [
  { entry_id: <uuid>, date: 'YYYY-MM-DD', type: 'sent' | 'feedback_received' | 'revision_requested',
    description: string,
    attachment_kind: 'link' | 'file' | null,
    attachment_url: string | null,
    attachment_storage_path: string | null,
    attachment_filename: string | null,
    logged_by: <uid>, logged_at: timestamp }
]
```
Cap: a single proposal doc must stay under Firestore's 1 MiB limit. Acceptable for the expected entry volume per proposal (rough budget: <100 audit entries × ~250 bytes; <50 comms entries × ~500 bytes ≈ 50 KiB at the high end).

**Why embedded:** mirrors the Phase 85 denormalized-doc pattern (Pattern 21). One read fetches the entire proposal + history + comms; Security Rules stay simple (one collection, one rule); no N+1 read pattern in the dashboard.

### D-05 — Approver designation: role-based only
Any active user with `role === 'super_admin'` OR `role === 'operations_admin'` can approve or reject any proposal. No per-project approver list. Firestore Security Rules gate `update` on `proposals` to those two roles for the `status` and `audit_log` field changes.

NOTIF-09 fan-out targets the same role set: `createNotificationForRoles({ roles: ['super_admin', 'operations_admin'], ... })`.

### D-06 — Loss reason: required free text
When a user marks a proposal as Loss (status → `'loss'`), a free-text reason field is required. Stored on the proposal doc (`loss_reason: string`) AND mirrored into the audit_log entry's `comment` field for unified history viewing. No preset categories — the user wants flexibility to record context.

Future v4.1+ idea: structured loss-reason taxonomy + analytics dashboard. Captured in deferred ideas.

### D-07 — Comms log attachment per entry
Each comms_log entry CAN carry one optional attachment using the same `link OR single file` shape as the proposal's main attachment (D-03). Storage path: `proposals/{proposal_id}/comms/{entry_id}.<ext>` for files. Mirrors D-03 simplicity.

### D-08 — Project status state machine
Proposal-driven transitions on the parent project doc:

| Proposal action | Project status before | Project status after |
|---|---|---|
| Submit for internal approval | (anything) | `"Proposal for Internal Approval"` |
| Approve | `"Proposal for Internal Approval"` | `"Proposal Under Client Review"` |
| Reject | `"Proposal for Internal Approval"` | `"For Revision"` |
| Mark Sent to Client | (any) | (no project status change — internal status only) |
| Client Approved | `"Proposal Under Client Review"` | `"Client Approved"` (or `"For Mobilization"` per existing convention) |
| Mark Loss | (any active proposal) | `"Loss"` |

The exact final-state string for client-approved (`"Client Approved"` vs `"For Mobilization"`) is the existing project-status enum convention — researcher must verify and lock the canonical string from the codebase. If both exist as separate states, the Client Approved action targets `"Client Approved"` and a downstream UI action handles the `"For Mobilization"` transition.

**Atomicity:** every proposal-status transition that also moves the project status uses a single `writeBatch` covering both updates (proposal + project + audit_log entry). If the batch fails, neither change persists. This is the same pattern as the cascade writes in Phase 86.8 Feature 3.

### D-09 — Notification wiring (NOTIF-09 / NOTIF-10)
- **NOTIF-09 (proposal submitted):** on submit, call `createNotificationForRoles({ roles: ['super_admin', 'operations_admin'], type: NOTIFICATION_TYPES.PROPOSAL_SUBMITTED, message: 'Proposal {title} submitted by {actor}', link: '#/management/proposals?id={proposal_id}', source_collection: 'proposals', source_id: proposal_id, excludeActor: true })`. Recipients are the same set of approvers per D-05.
- **NOTIF-10 (proposal decided):** on approve OR reject, call `createNotification({ user_id: proposal.created_by, type: NOTIFICATION_TYPES.PROPOSAL_DECIDED, message: '{action} on proposal {title}: {comment_excerpt}', link: '#/management/proposals?id={proposal_id}', source_collection: 'proposals', source_id: proposal_id })`.
- Both types are already in the `NOTIFICATION_TYPES` enum (Phase 83 D-06 reserved them).
- Failure of `createNotification` MUST NOT block the underlying state transition — wrap in try/catch and console.error per Phase 83 D-13's helper contract.

### D-10 — Security Rules
- `proposals` collection:
  - `read`: any active user.
  - `create`, `update`, `delete`: `role in ['super_admin', 'operations_admin']`.
  - Field-level guards on `update`: `audit_log` may only be appended (length grows by 1 max per write); `created_at` and `created_by` immutable post-create.
- `proposals/{id}/...` Storage paths:
  - `read`: any active user.
  - `write`: `role in ['super_admin', 'operations_admin']` (Storage rules; Firebase Storage role check via custom claims OR Firestore lookup pattern — researcher to lock the canonical pattern from the codebase).

### D-11 — Proposal dashboard (PROP-10)
Grouped-by-stage list inside the Mgmt Tab. Stages: `pending_internal` → `pending_client` → `for_revision` → `client_approved` → `loss`. Age-in-stage = `now() - last_status_change_at` (derive from audit_log; cache `current_status_since` on the proposal doc to avoid scanning audit_log on every render). Highlight items where age > 7 days in `pending_internal` or `pending_client` (threshold confirmed during planning).

### Claude's Discretion

- Per-stage card vs row layout in the dashboard.
- Audit log timeline visualization (vertical thread vs grouped-by-day).
- Comms log entry display order (newest first vs chronological).
- Whether `'For Mobilization'` is a separate auto-transition after `'Client Approved'` or a manual user action — researcher reads the existing project-status state machine to lock this.
- Storage Security Rules pattern (custom claims vs Firestore lookup) — lock to whatever existing rules use.
- Loss reason input width / placement in the Loss confirmation modal.
- Toast copy on every state transition.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Code surfaces (existing, to read before planning)
- `app/notifications.js` — `createNotification`, `createNotificationForRoles`, `NOTIFICATION_TYPES` enum (PROPOSAL_SUBMITTED, PROPOSAL_DECIDED already present).
- `firestore.rules` — existing role-based rules; the proposal rules added here mirror the Operations Admin / Super Admin gates established in earlier phases.
- `app/firebase.js` — Firebase config + db/storage exports.
- `app/router.js` — hash-based route registration; the proposal dashboard route (or sub-route) registers here, scoped under whatever Phase 88 names the Mgmt Tab.
- `app/utils.js` — `formatCurrency`, `generateSequentialId`, `escapeHTML`.

### Prior-phase context (read SUMMARY.md / CONTEXT.md before planning)
- `.planning/phases/83-notification-system-foundation/83-CONTEXT.md` — D-13/D-14/D-15 lock the helper signatures and one-doc-per-recipient fan-out; D-08 locks the per-recipient persistence model.
- `.planning/phases/84-notification-triggers-existing-events/84-CONTEXT.md` — established the trigger-call pattern (helper invocation inside the same writeBatch as the underlying state change).
- `.planning/phases/84.1-procurement-notifications-trigger-enhancements/` — most recent notification-trigger phase; reuse audit-log shape and trigger-write timing patterns.
- `.planning/phases/85-collectibles-tracking/` — Pattern 21 (denormalized doc shape) — model for embedded audit_log + comms_log arrays.
- **Phase 88 (Mgmt Tab Shell + Create Engagement)** — read its CONTEXT/SUMMARY when ready, since the proposal dashboard mounts inside its surface. Phase 88 must ship first per D-01.

### Schema (existing collections affected)
- `projects` — `status` field gets new transitions (D-08); no schema change, but the project-status enum / set of allowed strings expands. Researcher locks the exact existing enum.
- `notifications` — Phase 83 schema unchanged; Phase 87 just writes new docs.
- `users` — read-only, used to fan out NOTIF-09 to role holders.

### New collections + Storage paths (introduced in this phase)
- `proposals` — top-level Firestore collection, schema D-02.
- `proposals/{proposal_id}/attachment.<ext>` — Firebase Storage path for the (optional) main proposal attachment.
- `proposals/{proposal_id}/comms/{entry_id}.<ext>` — Firebase Storage path for optional per-comms-log-entry attachments.

### CLAUDE.md
- `CLAUDE.md` (project root) — view-module structure (`render` / `init` / `destroy`), listener cleanup pattern, window-function pattern for `onclick`, hash-based routing, real-time `onSnapshot` data flow, status-string casing (case-sensitive matching).

</canonical_refs>

<specifics>
## Specific Ideas

- **Sequential proposal IDs:** mirror MRF / PR / PO format — `PROP-{YYYY}-{NNN}` with monotonic per-year sequence. Use the existing `generateSequentialId` helper if compatible, or replicate its pattern (lastSeq scan from local cache, no Firestore round-trip per write).
- **Reusing handle pattern from procurement views:** the proposal-detail page should use the same modal-style pattern as MRF/PR detail dialogs — sticky header + scrollable body, audit-log timeline pinned to the right or bottom.
- **`current_status_since` cache:** every status transition writes both the audit_log entry AND a `current_status_since: serverTimestamp()` field on the proposal so the dashboard can compute age-in-stage in one read instead of scanning audit_log.
- **Phase 88 dependency:** this phase doesn't START until Phase 88 has shipped — the proposal dashboard mount point literally doesn't exist before then.

</specifics>

<deferred>
## Deferred Ideas

- **Document version history** (PROP-06 as originally written): auto-incrementing version numbers, retrieval of old document versions. Out-of-scope per user — CLMC is not an authoring platform. Captured in user memory `project_clmc_not_authoring_platform.md`.
- **Loss reason taxonomy + analytics** (v4.1+): structured dropdown of preset loss reasons, dashboard reporting on loss patterns by reason / client / amount band.
- **Project-attached approvers**: ability to designate specific named users as approvers per project (overriding the role-based default).
- **Email + browser-push notifications**: already globally deferred from Phase 83.
- **Cloud Functions / server-side state-transition enforcement**: the codebase is a static SPA with no server tier; transitions are client-side under Security Rules.
- **Multi-attachment per proposal**: each proposal currently holds one main attachment. If users want bundled attachments (e.g. cover letter + proposal + appendix), add a sub-list in a future phase.
- **Subcollections for audit / comms**: if a proposal ever exceeds the 1 MiB doc limit, migrate logs to subcollections. Acceptable risk for now per D-04.
- **Sent-to-client email integration**: today the user marks "Sent to Client" manually. Future could integrate with the email system to auto-detect a sent message.
- **Concurrent-edit conflict handling**: last-write-wins on the proposal doc. If two approvers act simultaneously, the second write overwrites. Acceptable — approval is a one-shot action — but could revisit if seen in practice.

</deferred>

---

*Phase: 87-proposal-lifecycle*
*Context gathered: 2026-05-11 via /gsd-discuss-phase 87*
*Sequencing: Phase 88 ships first; this phase plugs into the existing Mgmt Tab afterward.*
