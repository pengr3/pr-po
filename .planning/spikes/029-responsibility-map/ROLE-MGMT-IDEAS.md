# Role Management — Future Ideas (NOT v1)

> Captured 2026-06-06 as **ideas for later**, not part of the active role consolidation.
> The active v1 work (derive "what needs me" from `role_templates`, add the `Management` role,
> kill the hardcoded-name drift) lives in the MANIFEST requirements. This file holds the
> Segregation-of-Duties analysis and the enhancements we deliberately deferred.

## Decisions locked (2026-06-06)
- **Single Finance approval for now** — no ₱-threshold co-approval on large payments. Revisit if/when
  finance headcount grows or an audit requires a second pair of eyes on big disbursements.
- The SoD matrix below is **reference / a future-betterment backlog**, not a build spec.

## Deferred enhancement ideas (backlog)
1. **₱-threshold co-approval on large payments** — above a configurable amount, require a second
   approver (Management or a 2nd finance user) on RFP/PR payment. Restores the "two eyes on big money"
   control without adding headcount. *Deferred — single Finance approval chosen for now.*
2. **Requester confirms goods receipt** — today Procurement marks a PO "Delivered" (buyer confirms its
   own order = fake-delivery risk). Idea: let the ops/site role that requested the MRF confirm receipt.
3. **Finance concentration watch** — Finance holds Approve + Pay + Record on both payables and
   receivables. Acceptable at current size (mitigated by: request always originates elsewhere + immutable
   audit log + management review). Monitor as the team grows; split AP/AR/treasury duties later.
4. **Access recertification habit** — periodically re-confirm who holds which role (privilege creep).
   Lightweight: a glance at role assignments now and then; formal tooling is enterprise overkill.

---

## CLMC Segregation-of-Duties Matrix (reference)

**Control functions:** REQ = request/initiate · APP = approve/authorize · EXE = execute · PAY =
pay/receive/custody · REC = record/book · CFG = configure system.
**Roles:** OPS/SVC (ops/services field + admins) · PROC (procurement) · FIN (finance) ·
MGT (Management = "the up") · SA (super_admin).

### ① Procure-to-Pay (materials)
| Step | REQ | APP | EXE | PAY/RECEIVE | REC |
|------|-----|-----|-----|-------------|-----|
| MRF (material request) | OPS/SVC | PROC (triage) | — | — | sys |
| PR (purchase request) | PROC | **FIN** (spend gate) | PROC | — | sys |
| PO issue + sourcing | — | (FIN via PR) | **PROC** | — | sys |
| Goods receipt → "Delivered" | — | — | — | **PROC** ⚠ (should be OPS/SVC) | sys |
| Supplier payment (RFP) | PROC | **FIN** | — | **FIN** | **FIN** |

### ② Transport (TR)
| Step | REQ | APP | PAY | REC |
|------|-----|-----|-----|-----|
| TR submit | OPS/SVC | — | — | — |
| TR approve + pay | — | **FIN** | **FIN** | **FIN** |

### ③ Order-to-Cash (collectibles / AR)
| Step | REQ | APP | RECEIVE | REC |
|------|-----|-----|---------|-----|
| Billing request | OPS/SVC (PM) | — | — | — |
| Collectible filed (COLL) | — | **FIN** | — | **FIN** |
| Cash receipt recorded | — | — | **FIN** | **FIN** |

### ④ Sales (proposals)
| Step | REQ | APP | Informed |
|------|-----|-----|----------|
| Proposal submit | OPS/SVC admin | — | MGT |
| Internal approval | — | **MGT** (+SA fallback) | submitter |
| Revision (rejected → bounce) | OPS/SVC (submitter) | — | MGT |

### ⑤ Master data + system
| Step | REQ | APP | EXE | CFG |
|------|-----|-----|-----|-----|
| Supplier create/edit | PROC | — | PROC | — |
| User onboarding | applicant | **SA** | SA | — |
| Role / permission config | — | **SA** | SA | **SA** |

### Concentration view (who controls how much)
| Role | REQ | APP | EXE | PAY/RECV | REC | CFG |
|------|:---:|:---:|:---:|:--------:|:---:|:---:|
| OPS / SVC | ✓ | — | — | (receive) | — | — |
| Procurement | ✓ | ✓¹ | ✓ | — | — | — |
| **Finance** | — | **✓** | ✓ | **✓** | **✓** | — |
| Management | — | ✓² | — | — | — | — |
| **Super_admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

¹ PROC's approve = MRF triage only, never the spend. ² MGT approves proposals only.

### Cardinal controls that hold ✓
- Requester ≠ spend-approver (ops requests, Finance authorizes money).
- Procurement creates suppliers, Finance pays them (no fake-vendor self-pay).
- Proposals = clean maker-checker (submitter ≠ approver).

### Super_admin rule
Spans all six functions by design → minimize who holds it, use for config/break-glass only, audit every
action, and **the boss gets `Management`, never `super_admin`.**

---

## How this maps to the Action Center (when built)
- **APP column → "needs you" approval tiles** (FIN: PRs/TRs/collectibles · MGT: proposals · PROC: MRFs).
- **REQ bounce-backs → submitter tiles** (proposal revision).
- **Informed column → notifications.**
