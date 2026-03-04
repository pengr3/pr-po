# Phase 55: Finance Pending Approvals Fixes - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure the PR and TR tables in Finance > Pending Approvals (column reorder/rename/add/remove), fix the "Approved This Month" scoreboard count, and add the MRF justification field to the PR View Details modal. No new workflow steps or capabilities — only presentation and data accuracy changes within the Finance Pending Approvals view.

</domain>

<decisions>
## Implementation Decisions

### "Approved This Month" scoreboard
- Count POs where `date_issued` falls in the current calendar month (not PRs, not TRs from prior months)
- Also count TRs approved in the current month — researcher should identify the TR date field that records when the TR was issued/approved (look for `date_generated`, `date_issued`, or equivalent on TR documents)
- Include ALL POs regardless of `procurement_status` — no status filtering
- Label stays as-is ("Approved This Month") — only the count logic changes

### PR table column restructuring
- Column order per roadmap: PR ID, MRF ID, Department/Project, Date Issued, Date Needed, Urgency, Total Cost, Supplier
- No Status column
- Date Issued = `date_generated` field on the PR document (when Procurement generated the PR)
- Date Needed = `date_needed` from the linked MRF (requestor's required delivery date — requires MRF lookup via `mrf_id`)
- Department/Project = just the project/service name (short form, not full code + badge); data comes from MRF's `project_name`

### TR table column restructuring
- Rename "Date" column header → "Date Issued" (data source is already correct, just label change)
- Add "Date Needed" column (from linked MRF's `date_needed`)
- Remove "Status" column
- Researcher should confirm which field TR uses for Date Issued

### Date display format
- Match existing app style throughout: e.g., "Mar 4, 2026" (not numeric MM/DD/YYYY, not relative)

### Null/missing date handling
- Date Issued missing → show "—"
- Date Needed missing → show "—"
- Consistent with app-wide empty value pattern

### Justification in PR View Details modal
- Add JUSTIFICATION field to the existing header info block, after Delivery Address
- Label: "JUSTIFICATION:"
- Value: the `justification` field from the linked MRF (requires fetch by mrf_id)
- Empty/null justification → show "—" (do not hide the row)

### Claude's Discretion
- Whether to pre-load MRF data alongside PRs/TRs upfront or fetch per row — choose whatever is more efficient for the existing data loading pattern in finance.js

</decisions>

<specifics>
## Specific Ideas

- The PR View Details modal currently shows: PR ID, MRF Reference, Department, Requestor, Urgency Level, Date Generated, Delivery Address, Total Amount, Items Breakdown. The JUSTIFICATION row should slot in between Delivery Address and Total Amount.
- Department/Project column in the table should be just the name (e.g., "Aircon Repair"), not the full "Services CLMC_SPI_2026003 - Aircon Repair" format used in the modal detail view.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 55-finance-pending-approvals-fixes*
*Context gathered: 2026-03-04*
