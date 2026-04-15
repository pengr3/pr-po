# Requirements: CLMC Procurement System

**Defined:** 2026-03-13
**Milestone:** v3.2 — Supplier Search, Proof of Procurement & Payables Tracking
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v3.2 Requirements

### Supplier Search

- [x] **SUPSRCH-01**: User can filter the supplier list by typing in a search bar that matches against supplier name
- [x] **SUPSRCH-02**: User can filter the supplier list using the same search bar to match against contact person name (both fields searched simultaneously)
- [x] **SUPSRCH-03**: User can clear the supplier search to restore the full supplier list
- [x] **SUPSRCH-04**: Supplier search filters the full supplier dataset — results paginate correctly from the filtered set, not just the current page

### Proof of Procurement

- [x] **PROOF-01**: Procurement user can attach a proof URL (any `https://` link, e.g. Google Drive, OneDrive, SharePoint) to a PO
- [x] **PROOF-02**: Procurement user can update or replace the proof URL on a PO at any procurement status, including after Delivered
- [x] **PROOF-03**: Finance user can view the proof document link from the Finance PO Tracking tab
- [x] **PROOF-04**: Proof attachment event appears in the procurement timeline modal

### Request for Payment / Payables

- [x] **RFP-01**: Procurement user can submit a Request for Payment linked to any existing PO (regardless of procurement status), including invoice number, amount, payment terms, and due date
- [x] **RFP-02**: Finance user can view a Payables tab listing all open RFPs with supplier, amount, balance remaining, due date, and payment status
- [x] **RFP-03**: Finance user can record a payment against an RFP (partial or full), including payment amount, date, method, and reference
- [x] **RFP-04**: System automatically derives payment status (Pending / Partially Paid / Fully Paid) from the running total of recorded payments vs amount requested — Finance never manually sets status
- [x] **RFP-05**: Overdue indicator is displayed when an RFP's due date has passed and it is not fully paid
- [x] **RFP-06**: Procurement user can see RFP status (Pending / Partially Paid / Fully Paid) on their PO Tracking view

### Payables UX Fixes

- [x] **TRANCHE-01**: PO Payment Summary "Current Active Tranche" column displays payment progress percentage (e.g., "30% Paid") for partially paid POs so users can see how much has been paid at a glance

### RFP ID Generation

- [x] **RFPID-01**: New RFPs are assigned IDs in PO-scoped format `RFP-{PO-ID}-{n}` (e.g. `RFP-PO-2026-001-1`) instead of project-code-scoped format, eliminating duplicate IDs when multiple POs share a project code

### PO Payment Progress Bar

- [x] **POBAR-01**: MRF Records PO badges display clean status-badge coloring without fill overlay — a separate flush progress bar below each badge shows payment percentage
- [x] **POBAR-02**: POs with no RFPs show an empty progress bar (0% fill) instead of a full red bar, correctly representing zero payment progress
- [x] **POBAR-03**: PO badge font color is exclusively controlled by the status-badge CSS class with no overlay interference, ensuring readability

### PO Ref Clickability

- [x] **POREF-01**: PO IDs in the Finance RFP Processing table are clickable links that open a PO details modal showing PO metadata (ID, MRF ref, supplier, project, date, status, amount) and line items

### TR Proof of Procurement

- [x] **TRPROOF-01**: Procurement user can attach a proof URL to a Transport Request via the same proof modal used for POs, with proof saved to the `transport_requests` collection
- [x] **TRPROOF-02**: Transport MRF rows in MRF Records display three-state proof indicators (green checkmark for URL, orange dash for remarks-only, empty circle for no proof) in the Proof column

### TR Payment Progress Bar

- [x] **TRBAR-01**: TR badges in MRF Records display a 3px payment progress bar below the badge, driven by RFP payment data keyed to `tr_id`
- [x] **TRBAR-02**: TRs with no RFPs show an empty progress bar (0% fill), consistent with PO behavior

### TR RFP Creation

- [x] **TRRFP-01**: Procurement user can right-click a TR badge in MRF Records to open a Request for Payment modal pre-filled with TR data (supplier, TR reference, amount)
- [x] **TRRFP-02**: TR RFPs are saved to the `rfps` collection with a `tr_id` field and ID format `RFP-{TR-ID}-{n}` (e.g. `RFP-TR-2026-001-1`)
- [x] **TRRFP-03**: Finance Payables renders TR-linked RFPs correctly, showing TR ID in the reference column instead of a blank PO link

### TR Proof in Mixed MRFs

- [x] **TRPROOFCOL-01**: Material+TR mixed MRF rows in MRF Records display TR proof indicators in the Proof column alongside PO proof indicators, with TR proof saves routed to `transport_requests` collection

### RFP Bank Transfer Saved Accounts

- [x] **RFPBANK-01**: When Bank Transfer is selected as payment mode in the RFP modal, a "Select Saved Bank Account" button appears that shows a dropdown of unique bank accounts derived from previously submitted RFPs
- [x] **RFPBANK-02**: Selecting a saved bank account from the dropdown auto-fills the Bank Name, Account Name, and Account Number fields in both PO RFP and TR RFP modals

### PO Payment Summary Pagination

- [x] **POSUMPAG-01**: PO Payment Summary table displays at most 10 PO rows per page with Previous/Next and page number navigation controls
- [x] **POSUMPAG-02**: Pagination info shows "Showing X-Y of Z POs" reflecting the current filtered result count, not the total unfiltered count
- [x] **POSUMPAG-03**: Changing status or department filters resets pagination to page 1 and updates page count to match the filtered set

### Expense Breakdown Modal Cleanup

- [x] **EXPMOD-01**: Total Cost scoreboard card in expense breakdown modal displays only the total amount — no document count note (e.g., "N documents") shown below it
- [x] **EXPMOD-02**: Expense breakdown item tables show line item details (Item Name, Qty, Unit, Unit Cost, Subtotal) instead of PO ID as the first column; Delivery Fees table shows Supplier instead of PO ID

### Payables Tab UI Containment & Pagination

- [ ] **PAYCON-01**: Both Payables tables (RFP Processing and PO Payment Summary) are wrapped in `table-scroll-container` providing horizontal scroll containment on narrow viewports
- [ ] **PAYCON-02**: Payables tables do not break out of their container or cause page-level horizontal overflow on screens narrower than the table content
- [ ] **PAYPAG-01**: Table 1 (RFP Processing) shows at most 10 rows per page with Previous/Next and page-number navigation controls
- [ ] **PAYPAG-02**: Table 1 pagination info shows "Showing X-Y of Z RFPs" reflecting the current filtered result count, not the total unfiltered count
- [ ] **PAYPAG-03**: Changing Table 1 status or department filters resets pagination to page 1 and updates page count to match the filtered set

### Expense Modal Payable Tracking

- [x] **EXPPAY-01**: Expense breakdown modal Row 3 shows a 2-column grid — "Projected Cost" (left, blue) and "Remaining Payable" (right) — when RFPs exist for the project or service
- [x] **EXPPAY-02**: Payable scoreboard row (Row 3) is hidden when no RFPs exist for the project or service (no misleading zero values)
- [x] **EXPPAY-03**: Remaining Payable card displays red styling when amount is outstanding and green styling when fully paid

### Financial Summary Card Payable Fields

- [x] **FINSUMCARD-01**: Project detail Financial Summary card shows "Paid" cell with total non-voided payments from RFPs when RFPs exist for the project
- [x] **FINSUMCARD-02**: Project detail Financial Summary card shows "Remaining Payable" cell (rfpTotalRequested - rfpTotalPaid) with red styling when > 0 and green when fully paid
- [x] **FINSUMCARD-03**: Service detail Financial Summary card shows "Paid" and "Remaining Payable" cells matching project behavior, queried by service_code
- [x] **FINSUMCARD-04**: Paid and Remaining Payable cells are hidden when no RFPs exist for the project or service (no misleading zero values)
- [x] **FINSUMCARD-05**: Clicking the Refresh button on Financial Summary card refreshes expense data AND opens the Financial Breakdown modal
- [x] **FINSUMCARD-06**: Navigating between project/service detail pages does not leak stale Paid or Remaining Payable values from previous page

### Finance Tab Mobile Optimization

- [x] **MOBFIN-01**: At viewport <=768px, Finance tab card-headers (Material PRs, Transport Requests, Purchase Orders) stack vertically — heading above controls — with no clipping and no horizontal page overflow
- [x] **MOBFIN-02**: At viewport <=768px, select and button controls inside Finance card-headers expand to flex:1 distribution with min-height 44px (touch target)
- [x] **MOBFIN-03**: Project List expense tables (Projects, Services, Recurring) use the existing .table-scroll-container shadow-scroll pattern instead of bare overflow-x:auto wrappers, matching all other Finance/Procurement tables
- [x] **MOBFIN-04**: At viewport 320px, the Project List sub-tab bar (Projects | Services | Recurring) scrolls horizontally without clipping button labels

### Finance Tab Mobile Card Layout

- [x] **MOBCARD-CSS**: CSS foundation for dual-mode table/card rendering — Finance-scoped `@media (max-width: 768px)` rules hide `.table-scroll-container` in `#approvals-section`, `#pos-section`, `#projects-section`, `#payables-section`, show `.fc-card-list`, with fc-card component classes (card, card-header, title, badge, body, row, label, value, actions, overdue, clickable, empty) defined under the `fc-` namespace
- [x] **MOBCARD-01**: At viewport <=768px on Finance > Pending Approvals, the Material PRs scrollable table is hidden and a vertical stack of Material PR cards is visible instead, each showing PR ID, status badge, supplier, MRF ref, amount (bold), project, date and a full-width "Review PR" button
- [x] **MOBCARD-02**: At viewport <=768px on Finance > Pending Approvals, the Transport Requests scrollable table is hidden and a vertical stack of Transport Request cards is visible instead, each showing TR ID, status badge, supplier, MRF ref, amount (bold), date, justification and a full-width "Review TR" button
- [ ] **MOBCARD-03**: At viewport <=768px on Finance > Purchase Orders, the PO scrollable table is hidden and a vertical stack of PO cards is visible instead, each showing PO ID, status badge, 3-state proof indicator, supplier, project, amount (bold), PR ID, date issued and a full-width "View PO" button
- [ ] **MOBCARD-04**: At viewport <=768px on Finance > Payables, the RFP Processing scrollable table is hidden and a vertical stack of RFP cards is visible instead, each showing RFP ID, payment status badge, PO/TR ref, supplier, project, amount, balance remaining, due date, and Overdue styling (red border + banner) when an RFP is past due
- [ ] **MOBCARD-05**: At viewport <=768px on Finance > Payables, the PO Payment Summary scrollable table is hidden and a vertical stack of PO Payment Summary cards is visible instead, each showing PO ID, status badge, supplier, project, total amount, total paid, balance remaining, payment progress percentage, and a "Show/Hide Tranches" toggle button that reveals per-RFP tranche sub-cards
- [x] **MOBCARD-06**: At viewport >=769px (desktop), all 5 Finance table groups (Material PRs, Transport Requests, Purchase Orders, RFP Processing, PO Payment Summary, Project/Service/Recurring expenses) continue to render as existing scrollable tables — card stacks are hidden and no visual regression occurs
- [ ] **MOBCARD-07**: At viewport <=768px the Payables `#poSummaryPagination` controls remain visible and functional below the card stack (pagination sits outside `.table-scroll-container` so it is not hidden by the Finance-scoped hide rule)
- [ ] **MOBCARD-08**: At viewport <=768px on Finance > Project List > Projects sub-tab, the projects expense table is hidden and a vertical stack of clickable expense cards (entire card is the click target — no nested button) is visible, each showing project name, department tag, projected cost, actual cost with over-budget indicator (red text + warning emoji + " over" suffix when applicable), remaining payable when RFPs exist, and date range
- [ ] **MOBCARD-09**: At viewport <=768px on Finance > Project List > Services and Recurring sub-tabs, the expense tables are hidden and vertical stacks of clickable service/recurring expense cards are visible with identical behavior to Projects (tapping anywhere on the card opens the expense breakdown modal)
- [x] **MOBCARD-10**: Empty-state parity — when a table has no data to render, the corresponding card list shows a matching `.fc-empty` message (e.g. "No pending material PRs to review at this time.") so empty states render identically on mobile and desktop

## Future Requirements

### Payables Enhancements

- **PAYAB-01**: Payables dashboard scoreboard showing total outstanding across all open RFPs
- **PAYAB-02**: Per-supplier payables aggregation view
- **PAYAB-03**: CSV export of payables list

### Proof of Procurement Enhancements

- **PROOF-05**: Google Drive Picker integration (OAuth-based file picker with direct upload) — deferred pending feedback on paste-a-link approach

## Out of Scope

| Feature | Reason |
|---------|--------|
| Firebase Storage for proof documents | User explicitly rejected — data storage cost concern |
| Google Drive Picker API / OAuth upload | Over-engineered for paste-a-link workflow; zero difference in functional value; deferred to v4.0+ |
| Automated payment reminders / email notifications | Out of scope per PROJECT.md — no email notifications in system |
| RFP approval second sign-off | Not required in v3.2 — Finance records payment directly |
| Per-supplier payables aggregation | Deferred to future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUPSRCH-01 | Phase 63 | Complete |
| SUPSRCH-02 | Phase 63 | Complete |
| SUPSRCH-03 | Phase 63 | Complete |
| SUPSRCH-04 | Phase 63 | Complete |
| PROOF-01 | Phase 64 | Complete |
| PROOF-02 | Phase 64 | Complete |
| PROOF-03 | Phase 64 | Complete |
| PROOF-04 | Phase 64 | Complete |
| RFP-01 | Phase 65 | Complete |
| RFP-02 | Phase 65 | Complete |
| RFP-03 | Phase 65 | Complete |
| RFP-04 | Phase 65 | Complete |
| RFP-05 | Phase 65 | Complete |
| RFP-06 | Phase 65 | Complete |
| TRANCHE-01 | Phase 65.3 | Planned |
| RFPID-01 | Phase 65.4 | Planned |
| POBAR-01 | Phase 66 | Planned |
| POBAR-02 | Phase 66 | Planned |
| POBAR-03 | Phase 66 | Planned |
| POREF-01 | Phase 65.5 | Planned |
| TRPROOF-01 | Phase 67 | Planned |
| TRPROOF-02 | Phase 67 | Planned |
| TRBAR-01 | Phase 67 | Planned |
| TRBAR-02 | Phase 67 | Planned |
| TRRFP-01 | Phase 67 | Planned |
| TRRFP-02 | Phase 67 | Planned |
| TRRFP-03 | Phase 67 | Planned |
| TRPROOFCOL-01 | Phase 66.1 | Planned |
| RFPBANK-01 | Phase 65.6 | Planned |
| RFPBANK-02 | Phase 65.6 | Planned |
| POSUMPAG-01 | Phase 65.7 | Planned |
| POSUMPAG-02 | Phase 65.7 | Planned |
| POSUMPAG-03 | Phase 65.7 | Planned |
| EXPMOD-01 | Phase 68 | Planned |
| EXPMOD-02 | Phase 68 | Planned |
| PAYCON-01 | Phase 65.8 | Planned |
| PAYCON-02 | Phase 65.8 | Planned |
| PAYPAG-01 | Phase 65.8 | Planned |
| PAYPAG-02 | Phase 65.8 | Planned |
| PAYPAG-03 | Phase 65.8 | Planned |
| EXPPAY-01 | Phase 69 | Planned |
| EXPPAY-02 | Phase 69 | Planned |
| EXPPAY-03 | Phase 69 | Planned |
| FINSUMCARD-01 | Phase 72 | Planned |
| FINSUMCARD-02 | Phase 72 | Planned |
| FINSUMCARD-03 | Phase 72 | Planned |
| FINSUMCARD-04 | Phase 72 | Planned |
| FINSUMCARD-05 | Phase 72 | Planned |
| FINSUMCARD-06 | Phase 72 | Planned |
| MOBFIN-01 | Phase 73 | Planned |
| MOBFIN-02 | Phase 73 | Planned |
| MOBFIN-03 | Phase 73 | Planned |
| MOBFIN-04 | Phase 73 | Planned |
| MOBCARD-CSS | Phase 73.1 | Planned |
| MOBCARD-01 | Phase 73.1 | Planned |
| MOBCARD-02 | Phase 73.1 | Planned |
| MOBCARD-03 | Phase 73.1 | Planned |
| MOBCARD-04 | Phase 73.1 | Planned |
| MOBCARD-05 | Phase 73.1 | Planned |
| MOBCARD-06 | Phase 73.1 | Planned |
| MOBCARD-07 | Phase 73.1 | Planned |
| MOBCARD-08 | Phase 73.1 | Planned |
| MOBCARD-09 | Phase 73.1 | Planned |
| MOBCARD-10 | Phase 73.1 | Planned |

**Coverage:**
- v3.2 requirements: 64 total
- Mapped to phases: 64
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-04-15 — Phase 73.1 requirements added (MOBCARD-CSS, MOBCARD-01 through MOBCARD-10)*
