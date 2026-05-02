# Phase 36: Fix the Expense Breakdown Modal in Services — Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the Expense Breakdown modal for service detail so it mirrors the projects modal structurally and visually. Unify the two modal implementations into one function that works for both departments. The services modal currently shows MRF/PR/PO summary scorecards and PR/PO list tabs — this is wrong. It should show the same category-level item breakdown, material/transport/subcon scorecards, and By Category/Transport Fees tabs as the projects modal.

</domain>

<decisions>
## Implementation Decisions

### What's broken
- The services modal has the wrong scorecards (MRF count, PR total, PO total instead of Material/Transport/Subcon)
- The services modal has wrong tabs (Purchase Requests / Purchase Orders instead of By Category / Transport Fees)
- Fix: services modal should query POs by `service_code` (instead of `project_name`) and apply the exact same item-level category breakdown logic as the projects modal

### Code unification
- Unify into one function — `showExpenseBreakdownModal` — that accepts a mode parameter (`'project'` or `'service'`)
- Claude decides the cleanest signature (likely identifier + options object with mode, display name, budget)
- Delete `showServiceExpenseBreakdownModal` — do not keep as wrapper
- Update ALL call sites: both `service-detail.js` and `project-detail.js` call the new unified function directly
- The old window function registrations in expense-modal.js should be cleaned up accordingly

### Budget field
- Use the `budget` field for services (same field name as projects)
- Label it `Budget` (generic — not "Service Budget" or "Project Budget")

### Claude's Discretion
- Exact function signature for the unified function
- How to thread mode through the internal helpers (query builder, scorecard builder, etc.)
- Window function naming for modal interaction (`_closeExpenseBreakdownModal`, `_toggleExpenseCategory`, etc.) — reuse existing names where possible

</decisions>

<specifics>
## Specific Ideas

- The services modal query changes from `where('project_name', '==', name)` to `where('service_code', '==', code)` — only the filter field changes, the breakdown logic is the same
- The CLAUDE.md canonical call site pattern for services should be updated to reflect the new unified call

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 36-fix-the-expense-breakdown-modal-in-services-export-the-one-we-ve-been-using-in-projects*
*Context gathered: 2026-02-20*
