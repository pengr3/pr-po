---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Supplier Search, Proof of Procurement & Payables Tracking
status: Ready to execute
stopped_at: Completed 75-01-PLAN.md
last_updated: "2026-04-18T12:25:20.040Z"
last_activity: 2026-04-18
progress:
  total_phases: 28
  completed_phases: 19
  total_plans: 30
  completed_plans: 42
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13 after v3.2 milestone start)

**Core value:** Projects tab must work - it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 75 — v3.2-gap-closure-code-fixes-spec-reconciliation-and-cleanup

## Current Position

Phase: 75 (v3.2-gap-closure-code-fixes-spec-reconciliation-and-cleanup) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 167 (v1.0–v3.1)
- Total milestones shipped: 10

**By Milestone:**

| Milestone | Phases | Days | Avg/Phase |
|-----------|--------|------|-----------|
| v1.0 | 4 | 59 | 14.8 |
| v2.0 | 6 | 64 | 10.7 |
| v2.1 | 3 | 2 | 0.7 |
| v2.2 | 11 | 5 | 0.5 |
| v2.3 | 15 | 8 | 0.5 |
| v2.4 | 10 | 3 | 0.3 |
| v2.5 | 7 | 2 | 0.3 |
| v3.0 | 3 | 1 | 0.3 |
| v3.1 | 11 | 6 | 0.5 |

*Updated after each plan completion*
| Phase 63-supplier-search P01 | 30 | 4 tasks | 1 files |
| Phase 64 P01 | 9 | 2 tasks | 1 files |
| Phase 64 P03 | 15 | 2 tasks | 2 files |
| Phase 64 P04 | 2 | 2 tasks | 2 files |
| Phase 65-rfp-payables-tracking P01 | 22 | 2 tasks | 2 files |
| Phase 65-rfp-payables-tracking P02 | 8 | 2 tasks | 2 files |
| Phase 65-rfp-payables-tracking P03 | 12 | 1 tasks | 1 files |
| Phase 65-rfp-payables-tracking P04 | 2 | 1 tasks | 1 files |
| Phase 65-rfp-payables-tracking P05 | 3 | 1 tasks | 1 files |
| Phase 65.1-finance-payables-tab-dual-table-revamp-rfp-po-payments P01 | 15 | 2 tasks | 1 files |
| Phase 65.1-finance-payables-tab-dual-table-revamp-rfp-po-payments P02 | 8 | 2 tasks | 1 files |
| Phase 65.1-finance-payables-tab-dual-table-revamp-rfp-po-payments P03 | 3 | 2 tasks | 1 files |
| Phase 65.2-remove-processed-rfps P01 | 3 | 1 tasks | 1 files |
| Phase 65.3 P01 | 5 | 1 tasks | 1 files |
| Phase 65.4 P01 | 1 | 1 tasks | 1 files |
| Phase 66 P01 | 5 | 2 tasks | 1 files |
| Phase 65.5 P01 | 8 | 1 tasks | 1 files |
| Phase 67 P01 | 3 | 2 tasks | 2 files |
| Phase 67 P02 | 5 | 2 tasks | 2 files |
| Phase 66.1 P01 | 5 | 1 tasks | 1 files |
| Phase 65.6 P01 | 8 | 1 tasks | 1 files |
| Phase 65.7 P01 | 2 | 1 tasks | 1 files |
| Phase 68 P01 | 5 | 1 tasks | 1 files |
| Phase 69-revise-expense-modal-scoreboards-to-add-remaining-payable-tracking P01 | 53 | 1 tasks | 1 files |
| Phase 65.9 P01 | 2 | 2 tasks | 1 files |
| Phase 65.10 P01 | 5 | 2 tasks | 2 files |
| Phase 71 P01 | -9 | 1 tasks | 1 files |
| Phase 71 P02 | 15 | 2 tasks | 1 files |
| Phase 71 P03 | 5 | 1 tasks | 1 files |
| Phase 72 P01 | 15 | 2 tasks | 2 files |
| Phase 73.1 P01 | 15 | 2 tasks | 2 files |
| Phase 73.1 P02 | 15 | 2 tasks | 1 files |
| Phase 73.1 P03 | 2 | 2 tasks | 1 files |
| Phase 73.1 P04 | 15 | 2 tasks | 1 files |
| Phase 73.2 P02 | 5 | 2 tasks | 2 files |
| Phase 73.2 P01 | 3 | 2 tasks | 2 files |
| Phase 73.3-improve-finance-tab-navigation-bar-and-remove-redundant-supplier-column-from-pr-modal P01 | 20 | 2 tasks | 2 files |
| Phase 75 P01 | 2 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3.2 scoping: Supplier search is pure client-side — no Firestore changes, filter on in-memory suppliersData array, maintain separate filteredSuppliersData for pagination
- v3.2 scoping: Proof URL stored as optional `proof_url` string on `pos` documents (no new collection); updateable at any procurement status including post-Delivered
- v3.2 scoping: RFP/payment data in dedicated `rfps` collection — not embedded on PO documents; mandatory for partial payment tracking and Finance-independent filtering
- v3.2 scoping: Payment status auto-derived from total_paid vs amount_requested arithmetic; Finance never manually sets status
- v3.2 scoping: Firebase Storage rejected for proof documents (user decision — storage cost); paste-a-link with any https:// URL accepted
- v3.2 scoping: Google Drive Picker API deferred to v4.0+ pending feedback on paste-a-link approach
- v3.2 scoping: RFP IDs use `RFP-[PROJECT CODE]-###` format scoped per project (e.g. `RFP-CLMC-001`), not year-based — sequence resets per project code
- [Phase 63-supplier-search]: Supplier search is purely client-side on in-memory suppliersData; filteredSuppliersData drives pagination exclusively
- [Phase 63-supplier-search]: onSnapshot calls applySupplierSearch() to re-derive filtered view on data refresh, preserving active search terms
- [Phase 64]: Added poTrackingBody table HTML to records section (element was referenced but had no DOM equivalent)
- [Phase 64]: Proof modal triggers AFTER status save; status changes regardless of proof attachment
- [Phase 64]: Three-state proof indicator: green (URL), orange dash (remarks only), empty circle (nothing attached)
- [Phase 64]: saveProofUrl explicitly re-renders active table after Firestore save for immediate visual feedback
- [Phase 64]: Proof indicators in My Requests use typeof guard for showProofModal with alert fallback when procurement.js not loaded
- [Phase 65-rfp-payables-tracking]: Tranche builder uses poId as scoping key for DOM element IDs to allow multiple modals coexisting without collisions
- [Phase 65-rfp-payables-tracking]: savePODocumentFields always writes tranches array unconditionally; tranches + backward-compat payment_terms string always co-written
- [Phase 65-rfp-payables-tracking]: rfps onSnapshot placed inside loadPOTracking with _rfpListenerActive dedup guard (same pattern as _poTrackingListenerActive)
- [Phase 65-rfp-payables-tracking]: PO fill CSS class provides structural properties only; width/color/opacity set inline by getPOPaymentFill() for data-driven fill
- [Phase 65-rfp-payables-tracking]: oncontextmenu on td not tr to scope right-click to PO ID column only
- [Phase 65-rfp-payables-tracking]: Status derivation priority: Fully Paid > Overdue > Partially Paid > Pending — checked in this order so fully-paid overdue RFPs show green
- [Phase 65-rfp-payables-tracking]: openRecordPaymentModal and voidPaymentRecord registered as stubs immediately to prevent runtime errors before Plan 04 lands
- [Phase 65-rfp-payables-tracking]: Payment void uses read-modify-write (not arrayRemove) so voided records remain in array for audit trail
- [Phase 65-rfp-payables-tracking]: Sort placed after both filter blocks so filtered results are also sorted; spread into new array to prevent rfpsData mutation
- [Phase 65.1]: Split payablesStatusFilter/payablesDeptFilter into 4 per-table filter state vars: rfpStatusFilter, rfpDeptFilter, poSummaryStatusFilter, poSummaryDeptFilter
- [Phase 65.1]: statusBadgeColors extracted to module-level constant — shared between renderRFPTable and renderPOSummaryTable
- [Phase 65.1]: renderPOSummaryTable() added as stub in Plan 01; full PO-grouped implementation deferred to Plan 02
- [Phase 65.1]: buildPOMap is a render-time pure function — computed fresh on each renderPOSummaryTable call, not stored as module-level state
- [Phase 65.1]: safePoId sanitizes PO IDs for DOM element IDs — replaces non-alphanumeric chars with underscore to prevent querySelector issues
- [Phase 65.1]: statusPriority map defined inline in sort block — used only by Table 1 sort, no sharing needed
- [Phase 65.1]: posAmountMap kept live via onSnapshot on pos collection in initPayablesTab; derivePOSummary poTotalAmount param optional with fallback to RFP sum for backward compatibility
- [Phase 65.2-remove-processed-rfps]: Default exclusion of Fully Paid RFPs placed before user filter blocks in renderRFPTable() with rfpStatusFilter \!== 'Fully Paid' guard
- [Phase 65.3]: Payment progress percentage shown in Current Active Tranche column as 'TrancheLabel (N%) — NN% Paid' using Math.round; guard totalPaid > 0 && totalAmount > 0 to skip suffix for zero-payment POs
- [Phase 65.4]: RFP IDs scoped per PO (RFP-{PO-ID}-{n}) instead of per project code to prevent collisions when multiple POs share same project
- [Phase 66]: Progress bar rendered as separate element below badge (not fill inside badge) to keep badge text readable
- [Phase 66]: getPOPaymentFill no-RFP case changed from pct:100 to pct:0 — semantically correct (zero payment progress = zero fill)
- [Phase 65.5]: rfp.po_id in finance.js is the Firestore document ID of the PO — used directly as poDocId in viewPODetailsFromRFP
- [Phase 65.5]: Modal overlay uses id=poDetailsOverlay to allow remove-before-create deduplication; reuses formatPODate, formatCurrency, escapeHTML, getMRFLabel — no new imports
- [Phase 67]: proof-modal.js collectionName defaults to 'pos' so all existing callers are unaffected
- [Phase 67]: getTRPaymentFill takes trTotalAmount as direct parameter instead of looking up from a data array
- [Phase 67]: openTRRFPModal and submitTRRFP fetch TR from Firestore on demand (not in-memory) because TRs are not pre-loaded into poData
- [Phase 67]: buildPOMap groupKey = rfp.po_id || rfp.tr_id || '' prevents TR RFPs from collapsing under empty-string key in Finance Payables
- [Phase 67]: isTR flag propagated from buildPOMap through poEntries to renderPOSummaryTable for conditional plain text vs PO link rendering
- [Phase 66.1]: hasPOProof mirrors hasPrs pattern for Material+TR mixed proof append in renderPRPORecordsTable
- [Phase 65.6]: getSavedBankAccounts deduplicates by composite key bank_name+bank_account_name+bank_details; onmousedown used in dropdown items for blur-before-click safety; dropdown rebuilt on each toggle from rfpsData
- [Phase 65.7]: poSummaryItemsPerPage=10 matching records pagination (not suppliers 15); changePOSummaryPage uses buildPOMap for live boundary enforcement; empty state hides pagination via display:none
- [Phase 68]: PO ID excluded from modal display tables only — CSV export retains PO ID for spreadsheet reconciliation
- [Phase 69]: Re-fetch project doc in RFP block (projectSnapshot2) to get project_code — project const scoped inside else block prevents access after closing brace; avoids structural refactor at cost of one extra Firestore read
- [Phase 65.9]: Delivery fee option in context menu hidden entirely when delivery_fee <= 0, shown disabled with (RFP exists) when RFP already exists
- [Phase 65.9]: submitDeliveryFeeRFP uses tranche_percentage=0 and tranche_label='Delivery Fee' to distinguish from regular tranche RFPs
- [Phase 65.9]: Delivery fee dot is red when no Delivery Fee RFP exists so unsubmitted cases show as attention-needed, green only when payment_records cover full amount_requested
- [Phase 65.10]: Payment guard (zero non-voided payments) enforced client-side in isRFPCancellable, consistent with cancelMRFPRs pattern
- [Phase 65.10]: cancelRFPDocument captures RFP fields into savedData before deleteDoc, then re-opens appropriate modal (PO/TR/Delivery Fee) with pre-filled form for easy correction
- [Phase 71-01]: Per D-09: rename is user-visible only — internal symbols (showExpenseBreakdownModal, expenseBreakdownModal, .expense-tab, window._* functions) stay unchanged to produce a zero-risk one-line diff
- [Phase 71]: escapeHTML imported from utils.js (not inlined) for safe rendering of supplier names and tranche labels in Payables tab
- [Phase 71]: deriveStatusForPO/TR/DeliveryFee defined as nested functions inside showExpenseBreakdownModal to avoid circular import from finance.js view module
- [Phase 71]: poTotalForRow = total_amount - delivery_fee so PO row Total Payable excludes delivery fee (which gets its own separate row per D-01)
- [Phase 71-03]: statusBucket stays 'Partial' in deriveStatusForPO fallback — only statusLabel changes so D-06 sort order is unaffected
- [Phase 72]: RFP query uses project_code/service_code (not name fields) for consistent Firestore queries; cells hidden when hasRfps===false; Refresh button opens modal after silent data refresh; destroy() resets new state fields to prevent cross-navigation stale data
- [Phase 73.1-01]: UI-SPEC values used over RESEARCH.md draft values: gap 0.25rem, fc-label weight 700, fc-sub-card font-size 0.75rem (REVIEWS Concern 2)
- [Phase 73.1-01]: No .fc-overdue on Material PR / TR cards — desktop render functions have zero row-level overdue highlighting (REVIEWS Concern 1 — parity maintained)
- [Phase 73.1-01]: CSS dual-mode pattern: both .table-scroll-container and .fc-card-list in DOM simultaneously, Finance-scoped @media hides the inactive one — no JS viewport detection
- [Phase 73.1]: buildProofIndicator placed immediately before renderPOs with buildPOCard — both helpers co-located with their primary render function
- [Phase 73.1]: statusValue single-source fallback: po.procurement_status || 'Pending Procurement' used for both statusLabel and statusClass so null-status POs never show mismatched text/class (REVIEWS Suggestion)
- [Phase 73.1]: rfp.due_date rendered raw as string in buildRFPCard and buildPOTrancheSubCard — matches desktop renderRFPTable line 647 and renderPOSummaryTable line 849 (REVIEWS Concern 3)
- [Phase 73.1]: togglePOCardExpand uses distinct IDs (po-card-expand-*, po-card-chevron-*) and sets display:block on div — avoids collision with desktop togglePOExpand which targets tr elements with display:table-row (Pitfall 3)
- [Phase 73.1]: buildRecurringExpenseCard is a thin alias to buildServiceExpenseCard — recurring and service expense shapes identical, both use window.showServiceExpenseModal
- [Phase 73.1]: escapeHTML applied to onclick arguments for apostrophe-safe modal invocation (REVIEWS Suggestion 3): browser HTML-decodes &#39; before JS evaluation
- [Phase 73.2]: em-scorecard-2col/3col are desktop-first classes; @media (max-width: 768px) collapses both to 1fr — no JS viewport detection
- [Phase 73.2]: min-width: 400px on #expenseBreakdownModal .category-items table forces horizontal scroll instead of vertical cell wrap (Gemini MEDIUM #1)
- [Phase 73.2]: TR modal grid uses .modal-details-grid class instead of inline style to enable CSS 1-col mobile collapse without JS
- [Phase 73.2]: Item tables in PR/TR modals require explicit min-width (500px/450px) to force horizontal scroll — without it browsers collapse vertically
- [Phase 73.3]: New .finance-sub-nav-tab class prefix (not .tab-btn) keeps Finance pill style scoped — Procurement .tab-btn rules untouched
- [Phase 73.3]: Init guard if (!_financeNavScrollHandler) prevents duplicate scroll listener binding on repeated init() calls during intra-Finance sub-tab switches (router does not call destroy() on tab switch)
- [Phase 73.3]: Supplier column removed from PR Details modal items table only — supplier display preserved in modal header .modal-details-grid (canonical location per PRMOD-SUP-01)
- [Phase 75]: [Phase 75-01]: TR aggregate alias names (totalAmount/trCount) mirror project-detail.js for behavioral parity, while local variable name (trsAgg vs trsAggregate) follows service-detail conventions for naming consistency
- [Phase 75]: [Phase 75-01]: Service-side TRs filtered by service_code (not service_name) per finance.js:2472,2537 convention — service-side TRs use service_code throughout the codebase
- [Phase 75]: [Phase 75-01]: prTotal/prCount fields preserved on currentServiceExpense literal for backward compatibility — bug was only in formula, not in field exposure

### Roadmap Evolution

- Phase 65.1 inserted after Phase 65: Finance Payables Tab - Dual Table Revamp (RFP + PO Payments) (URGENT)
- Phase 65.2 inserted after Phase 65: Remove processed RFPs on the RFP Processing area to prevent flooding with paid RFPs; historical RFPs available on PO Payment Summary (URGENT)
- Phase 65.3 inserted after Phase 65: Fix Current Active Tranche column for partially paid items — display "(nn%) Paid" so users can see payment progress at a glance (URGENT)
- Phase 66 added: Fix MRF Records PO payment progress bar — remove existing badge fill, implement flush dynamic progress bar, fix font color
- Phase 65.5 inserted after Phase 65: Fix PO Ref column with clickable PO IDs in RFP Processing (URGENT)
- Phase 67 added: Extend TR proof, badges, and RFP features to PO column
- Phase 66.1 inserted after Phase 66: Add proof-of-procurement column for TR rows in MRF Records (URGENT)
- Phase 65.6 inserted after Phase 65: RFP bank transfer mode — add supplementary button to select additional bank option (URGENT)
- Phase 65.7 inserted after Phase 65: Introduce pagination for PO Payment Summary Table, refer to existing pagination format and structure on our codebase (URGENT)
- Phase 68 added: Fix expense breakdown modal — remove document count note from Total Cost scoreboard and show actual line items instead of PO ID in expense breakdown
- Phase 68.1 inserted after Phase 68: Fix subcon cost scorecard showing zero when subcon items are categorized as subcon in items_json but po is_subcon flag is not set (URGENT)
- Phase 65.8 inserted after Phase 65: fix Payables tab UI containment and add pagination (URGENT)
- Phase 69 added: Revise expense-modal scoreboards to add remaining payable tracking
- Phase 65.9 inserted after Phase 65: Integrate Delivery Fees to Enable RFP for Delivery (URGENT)
- Phase 65.10 inserted after Phase 65: Cancel RFP capability — cancel whole RFP when no existing RFPs filed and cancel unapproved tranche (URGENT)
- Phase 70 added: Cancel PRs and restore MRF to processing area
- Phase 71 added: Revamp Expense modal into Financials modal — rename to Financial Breakdown, add Payables tab with Particulars/Status/Total Payable/Total Paid columns sorted by status
- Phase 72 added: Add paid and remaining payable to project/service financial summary cards with clickable refresh redirecting to financial breakdown modal (covers both Projects and Services tabs)
- Phase 73 added: Optimize Finance Tab for mobile use
- Phase 73.1 inserted after Phase 73: Replace Finance tab scrollable tables with card-based mobile layout (URGENT)
- Phase 73.2 inserted after Phase 73: Mobile-optimize Finance modals (Financial Breakdown Modal + PR Details Modal) (URGENT)
- Phase 73.3 inserted after Phase 73: Improve finance tab navigation bar and remove redundant supplier column from PR modal (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- Phase 65 kickoff: RFP IDs follow `RFP-[PROJECT CODE]-###` format scoped per project code (e.g. `RFP-CLMC-001`) — generateSequentialId() uses YYYY-based keys so a custom inline generator is needed; must query rfps where project_code matches to find max sequence number
- Phase 65 design: Lock in payment_records array vs subcollection decision before writing any Phase 65 code (array recommended for simplicity at 1-5 records/RFP)
- Phase 65 deployment: rfps Security Rules block must be deployed in the same commit as the first addDoc to rfps — prior milestones have been bitten by this

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260319-gkf | Improve RFP payment fill progress bar color scheme to match text label colors like PRs column | 2026-03-19 | e369df7 | | [260319-gkf-improve-rfp-payment-fill-progress-bar-co](.planning/quick/260319-gkf-improve-rfp-payment-fill-progress-bar-co/) |
| 260319-j18 | Fix PO ID link font color in MRF Records table from green (#34a853) to primary blue (#1a73e8) | 2026-03-19 | 7f5c841 | | [260319-j18-fix-po-id-link-font-color-in-mrf-records](.planning/quick/260319-j18-fix-po-id-link-font-color-in-mrf-records/) |
| 260319-j5f | Style PO ID chips in MRF Records POs column as status-badge pill badges matching PR/TR chips | 2026-03-19 | 3c40f50 | | [260319-j5f-style-po-id-chips-in-mrf-records-pos-col](.planning/quick/260319-j5f-style-po-id-chips-in-mrf-records-pos-col/) |
| 260408-fog | Fix MRF QTY field to allow decimal values less than 1 (e.g. 0.5) | 2026-04-08 | 6318944 | Verified | [260408-fog-fix-mrf-qty-field-to-allow-decimal-value](.planning/quick/260408-fog-fix-mrf-qty-field-to-allow-decimal-value/) |
| 260408-g2n | Investigate and restore missing Void button in Finance Payables Record Payment modal | 2026-04-08 | 21a682c, 3e64cc0 | Verified | [260408-g2n-investigate-and-restore-missing-void-but](.planning/quick/260408-g2n-investigate-and-restore-missing-void-but/) |
| 260408-ikv | Lock PO Document Details when active RFP exists | 2026-04-08 | f67d545 | Awaiting UAT | [260408-ikv-lock-po-document-details-when-active-rfp](.planning/quick/260408-ikv-lock-po-document-details-when-active-rfp/) |
| 260408-j0d | Add MRF cancellation for requestors only (item-level, PR-linked items protected) | 2026-04-08 | da509aa, 1b99410 | Awaiting UAT | [260408-j0d-add-mrf-cancellation-for-requestors-only](.planning/quick/260408-j0d-add-mrf-cancellation-for-requestors-only/) |

## Session Continuity

Last activity: 2026-04-18
Last session: 2026-04-18T12:25:20.031Z
Stopped at: Completed 75-01-PLAN.md
Resume file: None
Next action: Run `/gsd:plan-phase 63` to plan Supplier Search
