# Phase 65: RFP / Payables Tracking - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Request for Payment (RFP) workflow and payables tracking system. Covers:
- Structured payment terms (tranches) on POs — replacing the current free-text payment_terms field
- RFP creation by Procurement, triggered from PO Tracking
- Finance > Payables tab — flat table of all RFPs with payment status
- Payment recording by Finance (per tranche, full amounts only)
- Payment progress badge on PO ID cells in PO Tracking

New Firestore collection: `rfps`. No new views — adds a tab to Finance and modifies PO Tracking + PO edit modal.

</domain>

<decisions>
## Implementation Decisions

### RFP Submission Flow
- Trigger: Right-click on a PO row in PO Tracking opens a context menu — same pattern as the proof modal (existing `oncontextmenu` handler)
- RFP creation pre-fills: Supplier, PO amount, and available tranches from the PO document
- Multiple RFPs per PO: YES — progress billing is supported (one RFP per tranche)
- User selects which tranche they're requesting payment for; amount auto-fills from tranche percentage × PO total

### Structured Payment Tranches (replaces free-text payment_terms)
- Payment terms on POs change from a free-text string to a structured array of tranches
- Each tranche: `{ label: string, percentage: number }` — e.g., `{ label: "Downpayment", percentage: 50 }`
- Tranches must total exactly 100% (enforced with validation on save)
- Simple/COD contracts: default to a single 100% tranche labelled "Full Payment"
- Tranche definition happens in PO creation/edit modal (replaces the current `payment_terms` text input)
- Tranche UI: add/remove rows, label input + percentage input per row, running total shown

### RFP Data Structure
- Collection: `rfps` (dedicated, not embedded on PO)
- RFP ID format: `RFP-[PROJECT CODE]-###` scoped per project code (e.g., `RFP-CLMC-001`)
- `generateSequentialId()` will NOT work — custom inline generator needed: query `rfps` where `project_code` matches, find max sequence number
- Key fields: `rfp_id`, `po_id`, `mrf_id`, `project_code`, `supplier_name`, `tranche_label`, `tranche_percentage`, `amount_requested`, `due_date`, `payment_records` (array), `status` (auto-derived)
- `payment_records` array on the RFP doc (not a subcollection) — suitable for 1-5 records per RFP

### Payables Tab (Finance)
- New 3rd tab in Finance view alongside "Pending Approvals" and "Purchase Orders"
- One row per RFP (flat table, not grouped by PO)
- Columns: RFP ID | Supplier | PO Ref | Project/Service | Tranche Label | Amount | Paid | Balance | Due Date | Status
- Status values (auto-derived, never manually set): Pending / Partially Paid / Fully Paid / Overdue
- Overdue = Due Date passed and not Fully Paid → red badge replaces status badge + subtle red/pink row tint
- Filters: Status (All / Pending / Partially Paid / Fully Paid / Overdue) + Department (All / Projects / Services)
- Fully paid RFPs remain visible by default; user uses filters to hide them

### Payment Recording
- Finance role only records payments (Procurement cannot)
- "Record Payment" button per RFP row opens a modal
- Modal fields: amount (pre-filled with tranche amount — read-only since tranches are not partially payable), payment date, method dropdown, reference number
- Payment methods: Bank Transfer | Check | Cash | GCash/E-Wallet | Other (selecting "Other" reveals a text input)
- **Tranches are NOT partially payable** — each tranche is paid in full at once. To pay a smaller amount, define a smaller tranche on the PO.
- Payment history: expandable section below the RFP row (toggle), showing chronological list of all payment records
- Void policy: Void only (no edit). Voided payments are marked cancelled; their amount is removed from the running total. Audit trail maintained.
- Payment status auto-derives from sum of non-voided payment_records vs amount_requested

### PO Tracking Payment Badge
- Location: Directly on the PO ID cell background — same visual language as PR badges (colored cell background)
- Style: Progress fill that sweeps left to right based on % paid (e.g., 70% paid → 70% of PO ID cell has colored background, PO ID text sits on top)
- Colors: Red = no RFPs exist for this PO | Orange = at least one RFP exists but not fully paid | Green = all tranches fully paid
- No text on the badge itself — purely visual fill
- Hover tooltip shows: Amount Paid, Balance Remaining, Percentage

### Security Rules
- `rfps` collection security rules MUST be deployed in the same commit as the first `addDoc` to `rfps`
- Pattern from prior milestones: without rules in place, even Super Admin gets permission errors

### Claude's Discretion
- Exact CSS implementation of the progress fill effect on PO ID cells
- Tooltip styling and positioning
- Animation/transition on the progress fill (if any)
- Tranche row add/remove UI within the PO edit modal

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in decisions above and in CLAUDE.md.

### Key patterns in CLAUDE.md
- `CLAUDE.md` — DOM selection patterns, Firebase listener management, window function requirements, right-click (oncontextmenu) pattern, sequential ID generation approach
- Existing right-click proof modal in `app/views/procurement.js` (~line 3584) — reuse this trigger pattern for RFP creation
- `app/utils.js` — `generateSequentialId()` (NOT usable for RFP IDs; use custom inline generator instead)

### Firestore schema additions
- New `rfps` collection with `payment_records` array field
- Modified `pos` documents: `payment_terms` field changes from free-text string to structured array of tranches

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Right-click context menu pattern: `oncontextmenu="event.preventDefault(); window.showProofModal(...)"` in `app/views/procurement.js` ~line 3584 — reuse this trigger style for RFP creation
- `getStatusClass()` utility in procurement.js — extend for RFP status badges
- Expandable row pattern: check if any existing table uses expand/collapse rows; if not, Finance view will need a new pattern
- PR badge color pattern in procurement.js — reuse colored cell background approach for PO payment fill

### Established Patterns
- `payment_terms` currently stored as free-text string on POs (~line 5339 in procurement.js, ~line 6287 in finance.js) — this field is being replaced with a structured tranches array; both views need updating
- Finance view has 2 tabs today (Pending Approvals, Purchase Orders) — Payables becomes the 3rd tab using the same tab nav pattern
- Sequential ID generation: use same approach as other IDs but scope the query to `rfps where project_code == X` to find max sequence

### Integration Points
- `app/views/procurement.js` PO Tracking table — add payment progress fill to PO ID cells, add right-click → RFP creation
- `app/views/procurement.js` PO edit modal — replace free-text payment_terms input with structured tranche builder
- `app/views/finance.js` — add Payables tab, payment recording modal, expandable payment history rows
- `firestore.rules` — add `rfps` collection rules (deploy same commit as first write)

</code_context>

<specifics>
## Specific Ideas

- "Highlight green if fully paid, orange if not yet fully paid, red if no RFPs were made" — the exact color semantics for the PO ID progress fill
- "Like a loading stuff" — progress fill sweeps left to right proportional to % paid; purely visual, no text
- Tranche atomicity: "Tranches should not be partially paid, since it's explicitly specified that that tranche will be paid 50% of the total amount. User can instead provide a 25% tranche not partially paying a set tranche amount."

</specifics>

<deferred>
## Deferred Ideas

- Google Drive Picker API for proof documents — deferred to v4.0+ (from v3.2 scoping)
- Scheduled/recurring payment reminders — future phase
- Bulk payment recording across multiple RFPs — future phase

</deferred>

---

*Phase: 65-rfp-payables-tracking*
*Context gathered: 2026-03-18*
