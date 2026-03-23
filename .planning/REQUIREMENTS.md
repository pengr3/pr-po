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

- [ ] **TRANCHE-01**: PO Payment Summary "Current Active Tranche" column displays payment progress percentage (e.g., "30% Paid") for partially paid POs so users can see how much has been paid at a glance

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

**Coverage:**
- v3.2 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-23 — TRANCHE-01 added for Phase 65.3*
