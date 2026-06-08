# Phase 100: Project Detail Lifecycle Rebuild — Context

**Gathered:** 2026-06-08
**Status:** Ready for planning
**Source:** Spike 031 validation + Spikes 027–029 gate design (plan-now path — no discuss-phase needed)

<domain>
## Phase Boundary

Replace the manual `project_status` dropdown in `project-detail.js` with a lifecycle accordion card that:
1. **Always visible (collapsed):** 8-stage visual progress track showing current position
2. **Expanded:** contextual gate action panel (doc attach + advance buttons) + 4-slot document rollup

This phase does NOT touch the proposal workflow (For Proposal → Client Approved / Loss) — that is already fully implemented in `proposals.js` + `proposal-modal.js`. The lifecycle card defers to the existing proposal card for those stages.

**New Firestore fields on `projects` documents (16 total):**
- `inspection_report_url`, `inspection_report_kind`, `inspection_report_filename`
- `ntp_document_url`, `ntp_document_kind`, `ntp_document_filename`, `mobilization_started_at`
- `project_started_at`
- `completion_report_url`, `completion_report_kind`, `completion_report_filename`
- `certificate_of_completion_url`, `certificate_of_completion_kind`, `certificate_of_completion_filename`
- `project_completed_at`

No new Firestore collections. Firestore Security Rules: existing `projects` match block — confirm that new fields are covered by existing role-gated update rules (super_admin/ops_admin/ops_user write; all active users read).

</domain>

<decisions>
## Implementation Decisions

### D-01: Accordion card replaces status dropdown (LOCKED — spike 031)
The `project_status` field is no longer editable via a dropdown. The lifecycle accordion card is the ONLY advancement surface. The header strip shows a read-only `hdr-status` pill.

### D-02: 8 stages in the visual track (LOCKED — spike 031)
Ordered: For Inspection → For Proposal → Proposal for Internal Approval → Proposal Under Client Review → Client Approved → For Mobilization → On-going → Completed.
- `For Revision` = amber sub-state on the Client Review node (NOT a separate 9th stage)
- `Loss` = appended as a red ❌ badge after the track

### D-03: Stage node visual states (LOCKED — spike 031)
- `s-done` (green) + green ✓ check badge — all passed stages
- `s-current` (blue border + scale(1.1)) — current stage
- `s-future` (gray, opacity 0.55) — not yet reached
- `s-revision` (amber border + amber glow) — For Revision sub-state on Client Review node
- `s-loss` (red) — if status is Loss, node 4 (Client Approved) renders as s-loss
Connectors: green if filled, gray if not

### D-04: For Proposal → Client Approved range — no new buttons in lifecycle card (LOCKED — spike 031)
These stages are driven by the existing proposal-modal.js. The lifecycle card body for these statuses shows a "built panel" (green panel noting existing implementation) + doc rollup only. No new advance buttons.

### D-05: Gate 1 — Inspection Report (LOCKED — spikes 027/028/031)
- Status: `For Inspection`
- Doc: `inspection_report_url/kind/filename`
- Attach zone: Paste Link tab (default) + Simulate File tab (same AZ pattern as proposal)
- Advance button: disabled until `inspection_report_url` non-null
- Transition: `project_status → 'For Proposal'`
- Audit: `ADVANCED_TO_FOR_PROPOSAL`
- Role: super_admin, operations_admin, operations_user (assigned)

### D-06: Gate 2 — NTP / Purchase Order (LOCKED — spikes 027/029/031)
- Status: `Client Approved`
- Doc: `ntp_document_url/kind/filename`
- Attach zone: same AZ pattern, label "Notice to Proceed / Purchase Order"
- Start Mobilization button: disabled until `ntp_document_url` non-null
- Transition: `project_status → 'For Mobilization'`, sets `mobilization_started_at`
- Audit: `MOBILIZATION_STARTED`
- Role: super_admin, operations_admin, operations_user (assigned)
- Post-approval PA track visible in expanded body at this stage

### D-07: Gate 3 — Start Project (LOCKED — spike 027/031)
- Status: `For Mobilization`
- No document gate (user confirmed)
- "Start Project" button — no prerequisites
- Transition: `project_status → 'On-going'`, sets `project_started_at`
- Audit: `PROJECT_STARTED`
- Role: super_admin, operations_admin, operations_user (assigned)
- Shows: PA track + mobilization_started_at display

### D-08: Gate 4 — Completion (LOCKED — spikes 027/029/031)
- Status: `On-going`
- DUAL doc requirement: completion_report + certificate_of_completion (BOTH required)
- Two attach zones shown simultaneously
- "Mark as Completed" disabled until BOTH present
- Transition: `project_status → 'Completed'`, sets `project_completed_at`
- Audit: `PROJECT_COMPLETED`
- Role: super_admin, operations_admin ONLY (NOT operations_user — completion is admin-only)
- Shows: PA track + project_started_at display

### D-09: Post-approval mini-track (LOCKED — spike 031)
4-node PA track (Client Approved → For Mobilization → On-going → Completed) shown inside expanded body for statuses: Client Approved, For Mobilization, On-going, Completed. CSS classes: `.pa-track`, `.pa-stage`, `.pa-dot.pa-done/.pa-active/.pa-future`, `.pa-line.pa-done`.

### D-10: Document rollup (LOCKED — spike 031)
Always shown in the expanded body. 4 fixed slots:
1. Gate 1 · For Inspection → Inspection Report
2. Gate 2 · Client Approved → NTP / Purchase Order
3. Gate 4 · Completion → Completion Report
4. Gate 4 · Completion → Cert. of Completion
Filled slots: icon (📄 file / 🔗 link) + name/URL + "Open ↗" link. Empty slots: grayed, "— not yet attached".

### D-11: Shared helpers (LOCKED — memory)
- `_attachDocumentToProject(projectId, fields)` — generic updateDoc for all doc types
- `addProjectAuditEntry(projectId, action, actorId, actorName, comment)` — matches audit_log shape
- `_canAdvanceProjectStatus(project, currentUser, targetStatus)` — role-based gate check

### D-12: COC → Collectibles informational link (LOCKED — memory 2026-06-08)
The COC does NOT gate a specific billing tranche by position. It's the evidence Finance references when filing outstanding billing tranches (including retention). No automatic trigger — the link is informational in the "Project Closed" completion body.

### D-13: Completed state body (LOCKED — spike 031)
Shows: 2×3 summary grid (NTP/PO, Mobilized at, Project Started, Completed At, Completion Report, COC) + blue info box referencing COC→Finance. No action buttons (terminal state).

### D-14: Loss state body (LOCKED — spike 031)
Shows: green "built panel" noting recordLoss() already implemented via proposal workflow. No new functions. Doc rollup only.

### D-15: Accordion toggle behavior (LOCKED — spike 031)
- Clicking card header toggles `.open` class on `.lc-accordion`
- `.lc-body` animates via `max-height: 0 → 900px`, `padding: 0 → 14px 18px 18px`
- `.lc-chevron` rotates 180deg when open
- Header `lc-accordion.lc-active` (blue border/glow) for action-needed states
- Header `lc-accordion.lc-complete` (green border/glow) for Completed

### D-16: Attach zone (AZ) pattern — reuse proposal attachment UX (LOCKED — spike 031)
Two tabs: "📎 Paste Link" (default) + "⬆ Simulate File". File sim is a button for demo; in production the link tab is the primary path (Firebase Storage not available on Spark plan). Fields stored: `_url` (the link value), `_kind` ('link'|'file'), `_filename` (null for links, filename for files).

### Claude's Discretion
- Exact function names for window-registered handlers (e.g. `window.lcAttachInspectionLink`, `window.lcStartMobilization`)
- Whether to open accordion by default on page load (spike.html does; production can start collapsed)
- CSS selector naming within the `.lc-*` namespace
- Exact split of plans (spike estimates ~4 plans but planner decides)
- Whether to commit the status-dropdown removal as a separate task or inline with the gate functions

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike Artifacts (authoritative visual + interaction contract)
- `.planning/spikes/031-lifecycle-accordion-card/spike.html` — VALIDATED full interactive simulation (all 8 stages, all 4 gates, doc rollup, PA track, For Revision amber state, Loss state, Completed summary grid). **THIS IS THE PRIMARY REFERENCE.**
- `.planning/spikes/027-lifecycle-full-gate-map/` — full gate map analysis (3 gaps identified)
- `.planning/spikes/028-inspection-report-gate/` — Gate 1 detail
- `.planning/spikes/029-post-approval-progression/` — Gates 2–4 detail

### Project Files (MUST read before writing plans)
- `app/views/project-detail.js` — the target file; read the full init()/destroy() lifecycle, existing status dropdown code, proposal inline card, billing footer, window function registrations
- `styles/views.css` — existing CSS; read the `.lc-*` or any lifecycle accordion CSS already present (likely none — this is new)
- `styles/components.css` — shared button/card/modal patterns to follow
- `app/utils.js` — `escapeHTML`, `formatCurrency`, `formatDate` patterns

### GSD Patterns
- `app/views/procurement.js` — attach zone pattern (link/file tabs) for proposal attachments
- `app/views/project-detail.js` existing `loadProposalCard()` — the "built panel" green card pattern

### Firestore Security Rules
- `firestore.rules` — `projects` collection match block; confirm new fields covered by existing role-gated write rules; NO new collection needed

</canonical_refs>

<specifics>
## Specific Implementation Notes

From spike 031 JS (direct source for planner):

```
STAGES = [
  { status: 'For Inspection', emoji: '🔍', label: 'For\nInspection', gated: true },
  { status: 'For Proposal', emoji: '📋', label: 'For\nProposal', gated: false },
  { status: 'Proposal for Internal Approval', emoji: '🏢', label: 'Internal\nApproval', gated: false },
  { status: 'Proposal Under Client Review', emoji: '👤', label: 'Client\nReview', gated: false },
  { status: 'Client Approved', emoji: '🎉', label: 'Client\nApproved', gated: true },
  { status: 'For Mobilization', emoji: '🚚', label: 'For\nMobilization', gated: true },
  { status: 'On-going', emoji: '⚙️', label: 'On-going', gated: true },
  { status: 'Completed', emoji: '🏁', label: 'Completed', gated: false },
]
```

For Revision maps to curIdx of 'Proposal Under Client Review' node.
Loss appends ❌ badge after track; nodes 0–3 shown as done.

STATUS_COLOR map (for hdr-status badge background):
```
'For Inspection':'#64748b', 'For Proposal':'#1a73e8',
'Proposal for Internal Approval':'#f59e0b', 'Proposal Under Client Review':'#f59e0b',
'For Revision':'#ef4444', 'Client Approved':'#059669',
'For Mobilization':'#0ea5e9', 'On-going':'#0ea5e9',
'Completed':'#16a34a', 'Loss':'#7f1d1d'
```

**Accordion border states:**
- `.lc-active` (blue border/glow): For Inspection, Client Approved, For Mobilization, On-going, For Revision
- `.lc-complete` (green border/glow): Completed

**Hint text in header right:** "Action needed ↓" (amber) for gated states (For Inspection, Client Approved, For Mobilization, On-going) when collapsed.

</specifics>

<deferred>
## Deferred Ideas

- Firebase Storage file upload (real files) — Spark plan limitation; link-only attach is the production path
- "Request Revision" from lifecycle card — already done in proposal-modal.js
- Any status transitions within the proposal range (For Proposal → Internal Approval → etc.) — proposal-modal.js owns these
- Cascade reschedule on status change (spike 013 was SKIPPED)

</deferred>

---

*Phase: 100-project-detail-lifecycle-rebuild*
*Context gathered: 2026-06-08 via plan-now path (spike 031 + memory gate design)*
