# Requirements: CLMC Procurement System v2.1

**Defined:** 2026-02-05
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v1 Requirements

Requirements for v2.1 System Refinement milestone. All items are critical as they block or break core workflows.

### Security & Permissions

- [x] **SEC-01**: Super Admin can access Clients tab without permission denied errors
- [x] **SEC-02**: Super Admin can access Projects tab without permission denied errors
- [x] **SEC-03**: Super Admin user documents have proper permission structure OR Security Rules bypass permission checks for admin role
- [x] **SEC-04**: Operations Admin role can receive project assignments (assignable by Super Admin or Operations Admin)

### Finance Workflow

- [x] **FIN-01**: Transport Request Review button works (no `window.viewTRDetails is not a function` error)
- [x] **FIN-02**: Material Purchase Request Review button works (no similar window function error)
- [x] **FIN-03**: Finance tab displays Project List with financial overview table and expense breakdown modal

### Procurement Features

- [x] **PROC-01**: Clicking supplier name opens modal showing all purchases from that supplier
- [x] **PROC-02**: Timeline button in PR-PO Records shows full audit trail (MRF → PRs → POs → Delivered)
- [ ] **PROC-03**: Viewing PO requires Payment Terms, Condition, and Delivery Date to be filled (workflow gate)

## v2 Requirements

Deferred to future releases.

### Finance Enhancements

- **FIN-04**: Project List shows budget vs actual tracking with trend analysis
- **FIN-05**: Financial dashboard exports to PDF for compliance reporting

### Procurement Enhancements

- **PROC-04**: Timeline shows parallel approval visualization for mixed-supplier PRs
- **PROC-05**: Timeline events are filterable by type (MRF/PR/PO/Status)
- **PROC-06**: Supplier purchase history includes performance metrics (cycle time, on-time delivery)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud Audit Logs for timeline | Cost overruns ($50-200/month vs $1/month for app-level logging) - use Firestore collection instead |
| Real-time chat/notifications | Not core to fixing existing workflows, deferred to future milestones |
| Mobile responsive fixes | Desktop-first constraint, mobile deferred to future |
| OAuth/SSO integration | Email/password sufficient, added complexity not warranted for bug fixes |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 11 | Complete |
| SEC-02 | Phase 11 | Complete |
| SEC-03 | Phase 11 | Complete |
| SEC-04 | Phase 11 | Complete |
| FIN-01 | Phase 12 | Complete |
| FIN-02 | Phase 12 | Complete |
| FIN-03 | Phase 13 | Complete |
| PROC-01 | Phase 13 | Complete |
| PROC-02 | Phase 13 | Complete |
| PROC-03 | Phase 14 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10/10 ✓
- Unmapped: 0

---
*Requirements defined: 2026-02-05*
*Last updated: 2026-02-05 after roadmap creation*
