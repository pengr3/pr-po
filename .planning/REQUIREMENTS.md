# Requirements: CLMC Procurement System

**Defined:** 2026-03-04
**Milestone:** v3.0 Fixes
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v1 Requirements

### MRF Table Fixes (PR/PO Alignment)

- [ ] **TABLE-01**: In Material Request > My Requests, each PO ID is displayed inline beside its corresponding PR ID (null slot shown when PR has no PO yet)
- [ ] **TABLE-02**: In Procurement > MRF Records, each PO ID is displayed inline beside its corresponding PR ID (null slot shown when PR has no PO yet)
- [ ] **TABLE-03**: In Procurement > MRF Records, the Procurement Status dropdown is row-aligned to its specific PR/PO pair (not floating or misaligned)

### Finance Pending Approvals Table Restructure

- [ ] **FINANCE-01**: Material Purchase Requests table columns: PR ID, MRF ID, Department/Project, Date Issued, Date Needed, Urgency, Total Cost, Supplier (Status column removed)
- [ ] **FINANCE-02**: Transport Requests table: rename "Date" column to "Date Issued", add "Date Needed" column, remove "Status" column

### UI Layout Fixes

- [ ] **UI-01**: MRF Processing tab: work area stretches to full viewport width (no narrow box constraint)
- [ ] **UI-02**: MRF Processing tab: Pending MRFs panel left-edge aligns to logo alignment (matches Finance tab's left margin)
- [ ] **UI-03**: MRF Processing tab: MRF Details panel right-edge stretches to Logout button alignment (matches Finance tab's right margin)
- [ ] **UI-04**: Material Request sub-tab nav bar: left-aligns to logo position (matching Finance sub-tab nav)
- [ ] **UI-05**: Procurement sub-tab nav bar: left-aligns to logo position (matching Finance sub-tab nav)
- [ ] **UI-06**: Admin sub-tab nav bar: left-aligns to logo position (matching Finance sub-tab nav)

### Finance Scoreboard Fix

- [ ] **SCORE-01**: Finance > Pending Approvals: "Approved This Month" scoreboard correctly counts approved POs (not PRs) for the current calendar month

## Future Requirements

(None identified for future milestones from this scope)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New MRF workflow features | Pure fixes milestone — no new functionality |
| Backend/Firestore schema changes | All fixes are frontend-only |
| New roles or permissions | Out of scope for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TABLE-01 | Phase 54 | Pending |
| TABLE-02 | Phase 54 | Pending |
| TABLE-03 | Phase 54 | Pending |
| FINANCE-01 | Phase 55 | Pending |
| FINANCE-02 | Phase 55 | Pending |
| SCORE-01 | Phase 55 | Pending |
| UI-01 | Phase 56 | Pending |
| UI-02 | Phase 56 | Pending |
| UI-03 | Phase 56 | Pending |
| UI-04 | Phase 56 | Pending |
| UI-05 | Phase 56 | Pending |
| UI-06 | Phase 56 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap revision (SCORE-01 moved from Phase 57 to Phase 55; Phase 57 removed)*
