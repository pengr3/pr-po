# Requirements: CLMC Procurement System

**Defined:** 2026-03-05
**Milestone:** v3.1 PR/TR Routing Fix
**Core Value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.

## v3.1 Requirements

### PR/TR Routing

- [ ] **PRTR-01**: User can select "DELIVERY BY SUPPLIER" as an item category in the MRF form (standalone mrf-form.js)
- [ ] **PRTR-02**: User can select "DELIVERY BY SUPPLIER" as an item category in the Procurement Create MRF form (procurement.js)
- [ ] **PRTR-03**: Items with category "DELIVERY BY SUPPLIER" route to PR (not TR) and appear on the resulting PO when Finance approves
- [ ] **PRTR-04**: Items with category "DELIVERY BY SUPPLIER" require a supplier selection (same validation as all other PR items)

## Future Requirements

(None deferred — minimal scope milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Supplier category flag on supplier records | More complex, requires supplier data changes; new category approach solves the edge case with minimal change |
| Per-item billing route toggle | Higher UI complexity; deferred unless new category proves insufficient |
| Retroactive migration of existing "HAULING & DELIVERY" items | Historical data already processed; no active MRFs affected |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRTR-01 | Phase 57 | Pending |
| PRTR-02 | Phase 57 | Pending |
| PRTR-03 | Phase 57 | Pending |
| PRTR-04 | Phase 57 | Pending |

**Coverage:**
- v3.1 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-05 after initial definition*
