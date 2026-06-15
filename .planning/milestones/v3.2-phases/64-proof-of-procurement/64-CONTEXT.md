# Phase 64: Proof of Procurement - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Attach external document URLs to POs as proof of procurement. Procurement and Finance users can attach, view, and replace proof links. A checkmark column on MRF Records tables indicates proof status per PO. The PO-level timeline shows a "Proof attached" event with timestamp and URL.

</domain>

<decisions>
## Implementation Decisions

### URL Input Trigger
- When procurement status changes to "Procured" (material) or "Processed" (SUBCON), a modal appears prompting the user to paste a proof URL — same pattern as the delivery fee prompt on "Delivered"
- The proof URL is **optional** — user can skip/cancel and the status still changes
- URL validation: only `https://` URLs are accepted; if input is not a valid URL, proof_url is not saved and the checkmark stays empty
- Empty checkmark is clickable **at any time** to attach proof (opens the same paste-URL modal), not just during status change

### Proof Indicator (MRF Records Tables)
- New narrow column next to the POs column, header label like a check/verified indicator
- One checkmark **per PO** (not per MRF row) — if an MRF has 3 POs, there are 3 individual checks
- Visual style: outlined circle (no proof) / filled green circle with white checkmark (has proof)
- **Filled check**: left-click opens proof link in new tab; right-click or long-press to edit/replace
- **Empty check**: clickable — opens paste-URL modal to attach proof at any time
- Applies to **both** Procurement MRF Records tab **and** My Requests view

### Finance Access
- Same checkmark column added to the Finance PO Tracking table — consistent pattern across views
- Finance users **can** attach and edit proof URLs (not view-only) — both departments manage proof

### PO Timeline Event
- "Proof Attached" event shown in the PO-level timeline (the alert-based one from PO Tracking)
- Store `proof_attached_at` timestamp on the PO document when proof is first attached
- Timeline event displays both the date and the proof URL so users can check it directly from the timeline
- Appears between "Items Procured" and "Delivered" in the material timeline; between "Processing Started" and "Processed" in SUBCON timeline

### Firestore Schema Addition
- `proof_url` (string, optional) on `pos` documents — any valid `https://` URL
- `proof_attached_at` (timestamp, optional) on `pos` documents — set when proof is first attached

### Claude's Discretion
- Exact modal styling for the proof URL input (should match existing modal patterns)
- Right-click/long-press implementation details for edit action on checkmark
- Column header text for the check column
- How to handle proof URL replacement (whether to update proof_attached_at or add a proof_updated_at)

</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above and in:

### Requirements
- `.planning/REQUIREMENTS.md` — PROOF-01 through PROOF-04 requirements for this phase

### Roadmap
- `.planning/ROADMAP.md` — Phase 64 success criteria and scope definition

### Existing Patterns
- `app/views/procurement.js` lines 4824-4841 — Delivery fee prompt pattern (model for proof URL modal trigger)
- `app/views/procurement.js` lines 5329-5382 — PO-level timeline (viewPOTimeline) where proof event will be added
- `app/views/procurement.js` lines 4667-4725 — PO Tracking table render (checkmark column integration point)
- `app/views/finance.js` lines 2840-2899 — Finance PO table render (checkmark column integration point)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `updatePOStatus()` in procurement.js — already handles status-change modals (delivery fee on Delivered); proof URL prompt will follow same pattern
- `createModal()` / `openModal()` / `closeModal()` in components.js — modal creation utilities
- `escapeHTML()` in utils.js — for safe URL display
- `showToast()` — for success/error feedback on proof save

### Established Patterns
- Status change triggers in `updatePOStatus()`: delivery fee prompt on "Delivered" is the exact template for proof URL on "Procured"/"Processed"
- PO Tracking table has Actions column with buttons — checkmark column is a new addition beside POs
- MRF Records tables use flex sub-rows for per-PO content — checkmark per PO fits this pattern
- `createMRFRecordsController` factory pattern — ensures both Procurement and My Requests share the same table rendering logic

### Integration Points
- `updatePOStatus()` in procurement.js — add proof URL prompt before/after status update
- `renderPOTrackingTable()` in procurement.js — add checkmark column to PO Tracking
- Finance PO table render (~line 2868) — add checkmark column
- MRF Records table rendering (both Procurement and My Requests instances) — add checkmark column next to POs
- `viewPOTimeline()` — add proof attached event to timeline output
- Firestore `pos` collection — new fields: `proof_url`, `proof_attached_at`

</code_context>

<specifics>
## Specific Ideas

- Modal for proof URL should be similar to delivery fee prompt pattern — appears during status change, but is skippable
- Checkmark interaction: left-click on filled = open link; right-click/long-press = edit; click on empty = attach
- "Metas verified check" feel — small, compact indicator column, not a full-width column

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 64-proof-of-procurement*
*Context gathered: 2026-03-17*
