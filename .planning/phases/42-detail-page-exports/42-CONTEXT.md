# Phase 42: Detail Page Exports - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Export CSV buttons to project and service detail pages that download expense breakdown data scoped to that project or service. The export covers MRF line items that have progressed to a PO. Creating new views, payables tracking, or bulk exports across all projects are out of scope.

</domain>

<decisions>
## Implementation Decisions

### CSV columns
Exact columns in this order (header row required, uppercase as specified):
`DATE | CATEGORY | SUPPLIER/SUBCONTRACTOR | ITEMS | QTY | UNIT | UNIT COST | TOTAL COST | REQUESTED BY | REMARKS`

- **DATE** — PO date issued (`date_issued` on the PO document)
- **CATEGORY** — Item category from the MRF line item
- **SUPPLIER/SUBCONTRACTOR** — `supplier_name` from the PO
- **ITEMS** — Item name from the MRF line item
- **QTY** — Quantity from the MRF line item
- **UNIT** — Unit from the MRF line item
- **UNIT COST** — Unit cost from the MRF line item (plain number, e.g. `1500.00`)
- **TOTAL COST** — QTY × UNIT COST (plain number, e.g. `4500.00`)
- **REQUESTED BY** — `requestor_name` from the MRF
- **REMARKS** — Leave blank for now (no source field yet)

One CSV row per MRF line item (not per MRF). Delivery fees and other fee items are standard MRF line items with their category — they are naturally included.

### Data scope
- Only export items that have a corresponding PO (no PO = row excluded)
- Include POs at any procurement_status (Pending Procurement, Procuring, Procured, Delivered)
- Include both subcon (`is_subcon = true`) and direct procurement POs
- Export respects active filters on the detail page — export only what is currently visible/filtered, not the full unfiltered dataset

### Project/service mapping
- Project export: filter MRFs by `project_name` matching the project detail page
- Service export: filter MRFs by `service_name` matching the service detail page

### Export button placement
- Placed in the expense breakdown section header, alongside the section heading
- Style: small secondary button with a download icon + "Export CSV" text
- Disabled (grayed out) when the expense breakdown has no data; visible but unclickable
- Clicking triggers browser download directly — no loading spinner, no success toast

### Filename format
`[ProjectName]-expenses-[YYYY-MM-DD].csv`
Example: `MRT-Line-2-expenses-2026-02-27.csv`
(Service exports use service name in place of project name.)

### Date formatting
- Dates in CSV: `YYYY-MM-DD`
- Currency values: plain numbers with 2 decimal places (no currency symbol, no commas)

### Claude's Discretion
- Exact button icon (download/arrow-down icon)
- How to handle special characters in project/service name for the filename (spaces → hyphens)
- Error handling if Firestore query fails during export

</decisions>

<specifics>
## Specific Ideas

- Delivery fees and other fee types are already stored as MRF line items with appropriate categories — no special handling needed, they come through naturally
- The PAID column was explicitly discussed and deferred to a future phase once payables tracking is implemented

</specifics>

<deferred>
## Deferred Ideas

- **PAID column** — Deferred until payables tracking is implemented. When that feature lands, add a PAID column to the export (maps to payment status from the payables tracker). Note this in planning documents.
- **Payables tracker** — User mentioned future payables tracking will add more exportable data to this same export format. Phase 42 should be implemented in a way that makes adding columns easy.

</deferred>

---

*Phase: 42-detail-page-exports*
*Context gathered: 2026-02-27*
