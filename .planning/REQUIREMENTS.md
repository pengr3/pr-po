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

**Coverage:**
- v3.2 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-24 — Phase 65.6 requirements added (RFPBANK-01, RFPBANK-02)*
