# Phase 96: Proposal Card Redesign — Progress Track + Stat Chips - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Source:** Spike 009 Express Path (.planning/spikes/009-proposal-card-redesign/README.md — VALIDATED ✓)

<domain>
## Phase Boundary

Redesign the inline proposal card rendered inside project-detail.js and service-detail.js.
The card currently shows: a dot+label status indicator, ID above the title, inline amount+age, and noisy "No attachment"/"No comms yet" empty states.

This phase replaces that with the spike-validated layout (Concept B + Alt B):
- Card header: `PROPOSAL` uppercase heading (matches `PROJECT PLAN` card)
- 4-node progress track below header
- Data section: title first → ID secondary → stat chips row → info rows (attachment, comms — only when present)
- Footer: Submit for Approval (conditional) + View Proposal

No Firestore schema changes. No new collection. No notification triggers. Pure HTML/CSS UI change to `renderInlineProposalCard()` and its CSS in `components.css`.

</domain>

<decisions>
## Implementation Decisions

### D-01: Card Header
Add `PROPOSAL` uppercase heading to the card, matching the `PROJECT PLAN` card style. Header is always present (not state-conditional).

### D-02: Progress Track Structure
4-node horizontal track: **Draft → Internal Review → Client Review → Approved**

Node state classes:
- `t-passed` — completed stage: filled blue dot with check SVG icon, blue connector line
- `t-active` — current stage (normal): ring glow blue (`box-shadow: 0 0 0 3px rgba(26,115,232,0.18)`)
- `t-active-warn` — current stage (revision): ring glow orange (`box-shadow: 0 0 0 3px rgba(249,115,22,0.18)`)
- Unstyled — future stage: gray border dot

Track position mapping (drive from `STATUS_META[status].trackIdx`):
| Proposal Status | trackIdx | warn |
|----------------|----------|------|
| `draft` | 0 | false |
| `pending_internal` | 1 | false |
| `pending_client` | 2 | false |
| `for_revision` | 2 | true → orange ring on node 2 |
| `client_approved` | 3 | false |
| `loss` | -1 | — (special case, no track) |

### D-03: Loss State
When `trackIdx === -1` (status = `loss`): replace track with a red badge row:
`<div class="loss-badge">✕ Loss — Proposal closed</div>`
No track rendered, no data section for loss (or minimal if needed — Claude's discretion).

### D-04: Overdue Indicator
When the proposal has been in its current stage for >7 days AND is not `client_approved` or `loss`: add amber left border to the whole card (`border-left: 3px solid #f59e0b`).

The overdue calculation is: `age = (today - proposal.status_changed_at) > 7 days`. If `status_changed_at` is absent on legacy proposals, use `proposal.created_at` as fallback. Age threshold: 7 days.

### D-05: Data Section — Title First (Alt B layout)
Order:
1. `proposal.title` — 15px bold, leads the section
2. `proposal.proposal_id · v{version}` — secondary row, monospace, faint color (version field was removed in Phase 87.4, so omit `· v{version}` if no version field exists on the document)
3. **Chips row**: two stat chips side by side
   - Left chip: `VALUE` label + full PHP amount (use existing `formatCurrency()`)
   - Right chip: `STAGE AGE` label + age in days; turns amber when overdue (bg `#fffbeb`, text/border `#fde68a`)
   - Overdue right chip adds sub-line: "needs attention"
4. **Attachment row** (only when `proposal.attachment_kind` is set): `📎 hostname` link
5. **Comms row** (only when `proposal.comms_log.length > 0`): `💬 date · excerpt (≤60 chars)` text

### D-06: Empty State Removal
Do NOT render "No attachment" or "No comms yet" text. Absence of attachment/comms = absence of the row. No empty state.

### D-07: Footer Buttons
- `Submit for Approval` (primary, btn-primary): shown only when `canDrive === true` AND `status` is `draft` or `for_revision`
- `View Proposal` (outline, btn-outline): always shown when a proposal exists

`canDrive` logic: same as current implementation (Operations Admin, Super Admin, or assigned user can drive — reuse existing canDrive derivation).

### D-08: CTA State (No Proposal + canDrive)
When no proposal exists and the project is in `For Proposal` status and the user can drive:
- Render a dashed-border CTA card body: "No proposal yet. Ready to start one?" + `Start Proposal` button
- This CTA is already implemented in Phase 87.3; verify it is preserved and not broken.

### D-09: Empty Proposal State (No Proposal + cannot drive)
Short "No proposal linked yet." message. Already exists; preserve.

### D-10: Applies to Both project-detail.js AND service-detail.js
Both files have a `renderInlineProposalCard()` function. Apply identical changes to both.
The two files share the same card structure — if a helper module or shared CSS handles the card, ensure parity.

### Claude's Discretion
- Exact CSS class naming for new classes (following `.proposal-inline-card` namespace convention)
- Whether `STATUS_META` is defined inline in the function or hoisted to module scope
- How the overdue calculation (`status_changed_at` field) is read — use `proposal.updated_at` as the simplest proxy if `status_changed_at` is not in the schema (check the Firestore schema in CLAUDE.md)
- SVG check-mark implementation: can use a simple `✓` text character or inline SVG polyline
- Whether to extract shared track HTML into a helper function used by both project-detail.js and service-detail.js

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design Contract (Spike)
- `.planning/spikes/009-proposal-card-redesign/README.md` — validated design decisions (source of truth for this phase)
- `.planning/spikes/009-proposal-card-redesign/spike.html` — live prototype with exact CSS + JS (reference CSS class names, STATUS_META, track node structure)

### Source Files to Modify
- `app/views/project-detail.js` — contains `renderInlineProposalCard()` and `loadProposalCard()`
- `app/views/service-detail.js` — contains matching `renderInlineProposalCard()` and `loadProposalCard()`
- `styles/components.css` — add new `.proposal-card-track`, `.proposal-track-node`, `.proposal-chip-row`, `.proposal-stat-chip`, `.proposal-stat-chip.chip-warn` classes

### Prior Proposal Card Phases (context)
- `.planning/phases/87.3-proposal-card-polish-create-from-detail-edit-permissions-inline-card-redesign/` — Phase 87.3 established the current `renderInlineProposalCard()` baseline

### Project Patterns
- `CLAUDE.md` — Firestore schema (proposals collection fields), SPA patterns, CSS design system colors
- `app/utils.js` — `formatCurrency()` utility function

</canonical_refs>

<specifics>
## Specific Ideas

### CSS color tokens (from CLAUDE.md design system):
- Primary blue: `#1a73e8`
- Warning amber: `#f59e0b` (stage age overdue chip, for_revision ring)
- Border: `#e2e8f0`
- Bg subtle: `#f8fafc`
- Text: `#1e293b`
- Text muted: `#475569`
- Text faint: `#94a3b8`

### Track connector line pattern (from spike.html):
`.proposal-track-node:not(:last-child)::after` — absolute line from current node center to next node center; turns blue for passed nodes.

### Overdue card left border:
When overdue: `border-left: 3px solid #f59e0b` on the outer `.proposal-inline-card` wrapper.

### Stat chip structure:
```html
<div class="proposal-chip-row">
  <div class="proposal-stat-chip">
    <div class="proposal-chip-label">VALUE</div>
    <div class="proposal-chip-val">PHP 39,500,000.00</div>
  </div>
  <div class="proposal-stat-chip [chip-warn]">
    <div class="proposal-chip-label">STAGE AGE</div>
    <div class="proposal-chip-val">14 days</div>
    [<div class="proposal-chip-sub">needs attention</div>] <!-- only when overdue -->
  </div>
</div>
```

### Loss badge structure:
```html
<div class="proposal-loss-badge-wrap">
  <div class="proposal-loss-badge">✕ Loss — Proposal closed</div>
</div>
```

</specifics>

<deferred>
## Deferred Ideas

- Proposal ID format change (PROPOSAL-CLIENTCODE-YYYY-NNN) — separate phase, per memory project_proposal_id_redesign.md
- Version history / version bumping — Phase 87.4 removed the dead v1 field; a real version concept is deferred
- Stage-age threshold configuration (currently hardcoded 7 days) — defer to user feedback

</deferred>

---

*Phase: 96-proposal-card-redesign*
*Context gathered: 2026-05-26 via Spike 009 Express Path*
