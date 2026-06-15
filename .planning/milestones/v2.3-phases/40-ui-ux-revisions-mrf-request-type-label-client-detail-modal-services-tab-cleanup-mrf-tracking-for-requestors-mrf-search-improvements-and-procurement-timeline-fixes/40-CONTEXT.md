# Phase 40: UI/UX Revisions - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Six discrete UI/UX revision items: MRF request type label rename, client detail modal, services tab column cleanup, MRF tracking for requestors, MRF search field additions, and procurement timeline fixes. All items polish existing functionality — no new collections or roles.

</domain>

<decisions>
## Implementation Decisions

### MRF Request Type Label
- Rename "Material Request" radio button label to "Material/Sub Contractor" in mrf-form.js
- One-line text change — no badge, no column, no other display changes needed

### Client Detail Modal
- Click client row in Clients tab opens a read-only modal
- Modal shows: basic client info (code, company name, contact person, contact details) + linked projects and services
- Linked projects/services include financials (budget, contract cost) and are clickable links to their detail pages (#/projects/detail/CODE, #/services/detail/CODE)
- Inline table editing stays as-is (modal is additive, not a replacement)
- Delete action stays in the table row only — no delete button in modal

### Services Tab Cleanup
- Remove the Service Type column from both Services and Recurring sub-tab tables
- Column is redundant since sub-tabs already separate by service type

### MRF Tracking for Requestors
- Material Request tab gets 2 sub-tabs: "Material Request Form" and "My Requests"
- "My Requests" shows the same MRF Records table as Procurement, filtered to requestor_name === currentUser.full_name
- Extract MRF Records table rendering into a shared/reusable function (used by both Procurement and My Requests)
- Shows ALL MRFs submitted by the user (not just active ones)
- Same search/filter capabilities as the Procurement MRF Records table

### MRF Search Improvements
- Add `requestor_name` to search matching (in addition to existing mrf_id and project_name)
- Add `service_name` to search matching (for services-department MRFs)

### Procurement Timeline Fixes
- Remove all emojis (📋, 🛒, 📄) from timeline items — use simple dot indicators only
- Fix "Invalid Date" bug on PO entries (date parsing issue)
- Group PRs with their child POs as PR→PO pairs (not flat list) for clarity when MRF has multiple PRs/POs
- Add "Procurement Status" section per PO showing current procurement status (Pending Procurement / Procuring / Procured / Delivered) — current status only, not full history
- Audit timeline function and fix any other issues found (missing CSS for rejected/pending states, etc.)

### Claude's Discretion
- Timeline visual grouping approach for PR→PO pairs (indentation, nesting, or other visual hierarchy)
- Client modal layout and styling (follow existing modal patterns)
- Shared MRF Records function extraction approach (module structure, where to place it)
- Services tab dead code audit (remove any unreferenced functions found during cleanup)

</decisions>

<specifics>
## Specific Ideas

- "My Requests" should look exactly like MRF Records in the Procurement tab — unify into a single function, don't duplicate
- Timeline Image 1 reference: flat list of multiple PRs and POs is confusing to end users — PR→PO pairing fixes this
- Timeline Image 2 reference: "Invalid Date" must never render — all required date fields exist, ensure parsing handles all date formats
- Procurement Status per PO: reflects the PO's procurement_status field value with its timestamp

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 40-ui-ux-revisions*
*Context gathered: 2026-02-25*
