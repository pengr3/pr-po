---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Procurement → Full Management Portal
status: in-progress
stopped_at: Phase 86 PLANNED + VERIFIED (5 plans, 5 waves) — ready to execute
last_updated: "2026-05-05T16:05:00.000Z"
last_activity: "2026-05-05 - Phase 86 (Native Project Management & Gantt) PLANNED + VERIFIED. 5 PLAN.md files in 5 waves: 01 foundation (CDN+rules+task-id helper+router; PM-10/11), 02 view-skeleton (project-plan.js render/init/destroy + tree; PM-01/02), 03 Frappe Gantt (mount + drag + milestones + today line + zoom; PM-03/04/06/08), 04 modals (CRUD + cycle detection + parent recompute + progress slider + cascade delete with batch chunking; PM-01/02/03/05/10), 05 integration (project-detail summary card + weighted rollup + filters with ancestor preservation; PM-02/07/09). All 11 PM-* requirements covered. NOTE: planner agent (opus) hit org monthly usage limit after Plan 01; Plans 02-05 written in main thread. plan-checker (sonnet) ran successfully twice — first pass surfaced 5 blockers + 5 warnings, all addressed; second-pass re-check returned VERIFICATION PASSED with 2 new minor warnings, also addressed. Total 12 fixes applied (sync render(), tier-2 ops_user narrowing, FS-arrow honesty, keepIds ancestor walk, cumulative destroy() audit, re-read instruction, showToast XSS confirmed safe via textContent, splice-point sentinel, batch chunking CHUNK=450, all-users sub removed, recompute excludeIds parameter, narrative typo). Plans pass deterministic gap-analysis: 11/11 PM coverage."
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 20
  completed_plans: 19
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28 after v4.0 milestone start)

**Core value:** Projects tab must work — it's the foundation where project name and code originate, and everything in the procurement system connects to it.
**Current focus:** Phase 85 (Collectibles Tracking) PLANNED (2026-05-02) — 8 PLAN.md files in 4 waves; Wave 1 = firestore-rules + shared modules (Plans 01, 02); Wave 2 = projects/services tranche editors + project-detail cells + modal Collectibles tab (Plans 03, 04, 07, 08); Wave 3 = Finance Collectibles sub-tab + table/filters/pagination (Plan 05); Wave 4 = Collectible CRUD modals + payment recording + CSV export (Plan 06). All 9 COLL-* requirements covered, all 27 D-* decisions referenced. Ready to execute.

## Current Position

Phase: 85 (COMPLETE — all 8 plans shipped, all 9 COLL-* requirements closed)
Plan: Phase 85 fully complete after Plan 06 close-out (2026-05-02). Next: another v4.0 phase (84.1 follow-ups pending: prod rules deploy + PR_DECIDED/TR_DECIDED icon-split polish per memory-flagged items; or proceed to Phase 86 PM/Gantt / Phase 87 Proposal lifecycle / Phase 88 Mgmt Tab shell — all independent per v4.0 dependency map).

## Performance Metrics

**Velocity:**

- Total plans completed: 222 (v1.0–v3.2)
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
| v3.2 | 28 | 49 | 1.75 |

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
| Phase 75 P02 | 2 | 3 tasks | 2 files |
| Phase 74-optimize-material-request-tab-for-mobile-use P03 | multi-session | 4 tasks | 3 files |
| Phase 79-fix-mrf-details-justification-datetime-qty-truncation-searchable-dropdown P01 | 5 | 2 tasks | 2 files |
| Phase 78 P01 | 2 | 2 tasks | 2 files |
| Phase 77.1-revise-home-stats-to-charts-and-graphs P01 | 3 | 2 tasks | 3 files |
| Phase 79-fix-mrf-details-justification-datetime-qty-truncation-searchable-dropdown P02 | 15m | 2 tasks | 1 files |
| Phase 78 P03 | 15 | 3 tasks | 2 files |
| Phase 78 P02 | 6 | 2 tasks | 2 files |
| Phase 80 P02 | 5 | 2 tasks | 1 files |
| Phase 81-unified-project-and-service-status-overhaul P03 | 15 | 2 tasks | 3 files |
| Phase 81-unified-project-and-service-status-overhaul P02 | 4 | 2 tasks | 2 files |
| Phase 81-unified-project-and-service-status-overhaul P01 | 25 | 2 tasks | 2 files |
| Phase 77.2 P01 | 30 | 3 tasks | 2 files |
| Phase 82 P01 | 3 | 3 tasks | 1 files |
| Phase 83 P01 | 2 | 3 tasks | 3 files |
| Phase 83 P02 | 4 | 2 tasks | 2 files |
| Phase 83 P03 | 3 | 3 tasks | 3 files |
| Phase 83 P04 | 2 | 2 tasks | 2 files |
| Phase 84 P01 | 2 | 4 tasks | 7 files |
| Phase 84 P02 | 4 | 3 tasks | 1 files |
| Phase 84 P03 | 2 | 2 tasks | 2 files |
| Phase 84 P04 | 4 | 1 tasks | 1 files |
| Phase 84.1 P01 | 5 | 2 tasks | 6 files |
| Phase 84.1 P02 | 2 | 2 tasks | 4 files |
| Phase 84.1 P03 | 3 | 1 task + 1 UAT scaffold (UAT execution pending) | 2 files |
| Phase 85 P08 | 9 | 1 task | 1 files |
| Phase 85 P05 | 8 | 3 tasks | 1 files |
| Phase 85 P06 | 50 | 3 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- [Phase 85-06]: Refactored authority check into hasCollectibleWriteAuthority() shared helper used by 6 entrypoints — reduces duplication vs inlining per-function role checks; defense-in-depth at submit/cancel layer catches console-call bypass attempts
- [Phase 85-06]: T-85.6-01 CSV-injection mitigation extended trigger char set beyond plan spec (added \\t and \\r per OWASP guidance) — strict superset is safer; safe(v) wrapper neutralises 8 user-input string cells in exportCollectiblesCSV before passing to downloadCSV (which only escapes CSV grammar, not formula injection)
- [Phase 85-06]: T-85.6-05 race accepted — voidCollectiblePayment read-modify-write can overwrite a concurrent submitCollectiblePayment arrayUnion within the same getDoc/updateDoc window. Same disposition as Phase 65 D-60+ for ~16 months in production with no reports. Revisit if real-world incident surfaces
- [Phase 85-06]: D-13 frozen invariant verified at code level — submitEditCollectible updateDoc payload contains ONLY description, due_date, updated_at (zero tranche/amount/code references in function body, confirmed by grep)
- [Phase 85-06]: Re-fetch on collision-retry deferred (Phase 65.4 lesson) — generateCollectibleId runs once before addDoc; T-85.6-04 simultaneous-addDoc race accepted same as Plan 02 disposition
- v4.0 milestone shape: 7 phases — 2 notification phases (foundation + triggers-on-existing-events), 1 collectibles phase, 1 PM/Gantt phase, 1 proposal-lifecycle phase that also owns proposal-event notifications (NOTIF-09/10), and 2 Mgmt Tab phases (shell+create-engagement first, proposal queue last)
- v4.0 dependencies: Phase 84 needs Phase 83; Phase 87 needs Phase 83; Phase 89 needs Phase 87 + Phase 88. Phases 85, 86, 88 are independent of each other and of the notification track — eligible for parallel execution
- v4.0 scope guard: NOTIF email/push, ProjectLibre import, per-task billing, collectibles auto-trigger from PM, and role-configurable Mgmt Tab access are deferred to v4.1+ (already enumerated in REQUIREMENTS.md "Future" and "Out of Scope")
- v4.0 carry-overs explicitly out of scope: Phase 68.1 (subcon scorecard fix), Phase 70 rework (cancel-PR proper approval flow), VERIFICATION.md backfills for 73.2/79, dead CSS housekeeping
- Phase 87 design note: NOTIF-09 and NOTIF-10 mapped to Phase 87 (not Phase 84) because the events that trigger them (proposal submitted / proposal approve-reject) only exist after Phase 87 ships proposal infra
- Phase 89 design note: Mgmt Tab proposal queue consumes Phase 87 proposal infra rather than duplicating it — approve/reject from queue context shares Phase 87's audit-trail and project-status-advancement logic
- [Phase 84-03]: NOTIF11_STATUS_WHITELIST declared inline at each trigger site — short self-documenting list, each file is independent; placed after currentService update so fan-out uses updated service_name
- [Phase 84-03]: Empty personnel_user_ids skips silently (D-09) — .filter(Boolean) handles sparse/null entries in the array
- [Phase 84-02]: resolveRequestorUid checks requestor_user_id first (Plan 01 field), falls back to users collection full_name query for legacy MRFs (D-02 legacy fallback)
- [Phase 84-02]: rejectedMrfSnap captures currentMRF fields before nullification so rejectMRF() notification has mrf_id and requestor_user_id after currentMRF = null
- [Phase 84-02]: All 8 notification trigger calls wrapped in isolated try/catch — zero primary action blocking (D-03 fire-and-forget)
- [Phase 84-04]: excludeActor: false explicit on NOTIF-12 (D-13) — new user IS the actor, self-exclusion silences their own registration notification to other super_admins
- [Phase 84-04]: NOTIF-12 fires before signOut (D-11/D-14) — Phase 83 Security Rule requires actor_id == request.auth.uid; satisfied since user is still authenticated at notification fire time
- [Phase 84-01]: createNotificationForUsers uses writeBatch fan-out over direct UID array (D-08) — thin helper added to notifications.js to keep trigger sites clean rather than inlining loops
- [Phase 84-01]: requestor_user_id field uses window.getCurrentUser?.()?.uid ?? null — optional chaining null fallback so unauthenticated edge cases write null without throwing (D-01)
- [Phase 84-01]: firestore.rules allow read scoped to resource.data.role == 'super_admin' — minimal relaxation for createNotificationForRoles({roles:['super_admin']}) in register.js (D-12)
- [Phase 83-04]: Newer navigation uses O(N) re-walk from page 1 (not a backwards cursor) — Firestore startAfter in desc order cannot go backward; cost bounded by user pagination depth, documented verbatim in loadNewerPage() per D-10
- [Phase 83-04]: /notifications maps to 'dashboard' permission key — all active users can reach history page without a separate RBAC key; same gate as home route (/)
- [Phase 83-04]: History view uses one-shot getDocs (not onSnapshot) — content doesn't need live updates; listeners[] kept empty for destroy() compatibility
- [Phase 83-03]: Bell placed as sibling of .nav-links (not child) so it survives mobile display:none on .nav-links (Pitfall 1 mitigation); CSS order:2 positions bell visually between Admin dropdown and Log Out on desktop
- [Phase 83-03]: All 4 auth.js hooks are window-guarded (if window.initNotifications) to keep auth.js decoupled from notifications.js; static import in bootstrap guarantees window.* registrations exist before first onclick fires
- [Phase 83-03]: Mobile flex tweak (.top-nav-content gap:0.5rem) consolidated in components.css (not views.css) — single source of truth for .top-nav-content
- [Phase 83-02]: renderDropdownRows() exported (not just internal) for Plan 03 unit-testability; formatRelativeTime() inlined in notifications.js (not added to utils.js) — only caller at this phase; utils.js upgrade deferred to Plan 04 if history page also wants it
- [Phase 83-02]: recentDocs kept as module-scope array — loadRecentForDropdown() called only on dropdown open to minimize Firestore reads; optimistic cache update in markNotificationRead() for immediate UI feedback before listener fires
- [Phase 83-01]: Notification rule unit tests DEFERRED — test suite last updated Phase 49; rfps collection (Phase 65) also untested; hygiene fix should add both collections together in v4.1 to avoid piecemeal coverage gaps
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
- [Phase 75]: [Phase 75-02]: Spec amended (10 to 15) over reverting code — accepts user's drifted-upward usage pattern as preferred for POSUMPAG-01
- [Phase 75]: [Phase 75-02]: hasRfps state field intentionally retained in project-detail.js + service-detail.js — only render-side wrapper removed by Phase 72.1; field still populated for backwards-compat with downstream readers (FINSUMCARD-04 verification)
- [Phase 74-03]: mapMRFToDisplayData declared inside createMRFRecordsController scope (closes over _subDataCache); single-pass Promise.all returns {rowHtml, cardHtml} pairs — REVIEWS [MEDIUM] fix; scroll-close handler on window._mrfMobileMenuScrollHandler — REVIEWS [LOW] fix
- [Phase 74-03]: 3-dot dropdown reuses window._myRequestsEditMRF / window._myRequestsCancelMRF — no new Edit/Cancel logic; closeMyRequestsMobileMenu centralized as window function for shared teardown
- [Phase 79-fix-mrf-details-justification-datetime-qty-truncation-searchable-dropdown]: Added Date Submitted and Justification to MRF Details info grid using !isNew guard; grid-column: 1/-1 for Justification span
- [Phase 77.1-01]: Chart.js v4.4.7 CDN UMD (window.Chart global) for zero-build SPA; chartInstances Map for create-or-update-or-destroy chart lifecycle on home view
- [Phase 77.1-01]: Home status charts: 4 highlighted statuses use muted brand-palette colors (0.55-0.65 alpha); all other statuses use graduated slate shades — visual hierarchy signals attention vs context
- [Phase 78]: D-01/D-03: client is now optional in addProject() — only project_name, internal_status, project_status remain required; clientless projects write null client_id/client_code/project_code
- [Phase 78]: D-04: generateProjectCode() skipped when clientCode is absent (null); syncPersonnelToAssignments also gated behind non-null project_code
- [Phase 78]: D-12 DB-level lock: firestore.rules update rule requires project_code == null OR all three locked fields unchanged in request — server-side guard supplements UI lock
- [Phase 79-02]: Use three hidden inputs to decouple combobox display from form submission — no changes to Firestore write path
- [Phase 78]: Project list row uses detailParam = project_code || project.id so clientless and coded rows both deep-link correctly
- [Phase 78]: writes[] array: children pushed first; project doc pushed last — guarantees project_code stays null on disk if any batch fails, enabling safe retry (is_issued: true is the atomicity marker)
- [Phase 78]: Phase 79-02 replaced populateProjectDropdown() with rebuildPSOptions() combobox; Task 1 adapted to modify psOptions objects instead of DOM option elements — two new hidden inputs thread doc ID from combobox to Firestore write
- [Phase 78]: project_id denormalized on all new MRF/PR/TR/RFP docs: 7 total sites updated — 4 MRF-to-child (PR/TR) + 3 RFP creation from PO/TR
- [Phase 81]: Chart size class .hs-chart-status added to views.css per plan spec; hero.css legacy rules left as orphaned dead CSS
- [Phase 81]: internal_status fieldLabel in edit-history.js renamed to 'Internal Status (Legacy)' instead of removed — per REVIEWS Suggestion 3 for auditor-friendly historical records
- [Phase 81]: getChartSizeClass always returns hs-chart-status — single class for all 10-bar unified status charts regardless of entity type
- [Phase 81-02]: Per D-01/D-04: reuse project_status field, drop internal_status from all UI writes; orphaned Firestore field left in place without deleteField()
- [Phase 81-02]: rebuildServiceStatusFilterOptions() scans allServices (live data) not servicesData (empty stub) — corrected from plan template
- [Phase 81-01]: D-03 legacy display: grey italic (legacy) suffix in both table cells and filter dropdown — dynamically injected via rebuildStatusFilterOptions() using allProjects array
- [Phase 81-01]: rebuildStatusFilterOptions() uses allProjects (live snapshot) not projectsData (stale/unused var) — plan snippet had a bug; fixed inline
- [Phase 81-01]: Verify script false positive: 'Under Client Review' substring of 'Proposal Under Client Review' — implementation correct, verify script has substring-match limitation
- [Phase 77.2-01]: 180px desktop / 220px mobile chart card height derived from 28px bar + ~78px (3-row legend) + ~24px breathing room, rounded up to absorb 4-row legend wrapping in narrow cards
- [Phase 77.2-01]: Bumped barThickness 22 to 28 in lockstep with shrinking the card so the bar grows proportionally; without it the bar would still look small inside 180px
- [Phase 77.2-01]: Single .hs-chart-status CSS class change applies uniformly to all 3 chart wrappers (Projects, Services One-time, Services Recurring) — no per-card divergence required, leveraging Phase 81 unified architecture
- [Phase 82-01]: Phase 82 honors all 5 CONTEXT decisions verbatim: D-01 lightweight (no reason prompt, no deleted_mrfs row), D-02 single location (MRF Processing only), D-03 strict 'Rejected' eligibility, D-04 canEditTab gate, D-05 children-first cascade
- [Phase 82-01]: Dual-site button render pattern: any data-driven button whose container is rewritten by a re-render path (e.g. updateActionButtons) MUST be appended at BOTH the initial-render site and the re-render site, gated by the same eligibility expression evaluated against the appropriate scope (mrf parameter at site #1, currentMRF module-state at site #2)
- [Phase 82-01]: Legacy deleteMRF() at procurement.js:3913 (was 3790; shifted +123 by insertions only) is byte-for-byte unchanged — left as dead-but-correct code; future cleanup phase may dedupe along with its window registration
- [Phase 84.1-01]: PO creator inherits from PR creator (pr.pr_creator_user_id), NOT currentUser (Finance approver) — NOTIF-18 routes to procurement actor who owns the work; Finance approver is captured separately in finance_approver_user_id
- [Phase 84.1-01]: All 5 new schema fields (tr/rfp/po creator-UID stamps) use the window.getCurrentUser?.()?.uid ?? null optional-chain pattern from Phase 84-01 D-01 — matches existing canonical accessor; uniform across all 6 write sites in procurement.js + finance.js
- [Phase 84.1-01]: firestore.rules users.list relaxed to isActiveUser() per Option B — aligns with every other operational collection's read pattern; bonus retroactively unblocks Phase 84 NOTIF-08 silent fan-out failure when triggered by procurement / operations_user / services_user actors; threat T-84.1-01 accepted
- [Phase 84.1-01]: Local var poDataFresh (NOT poData) inside NOTIF-18 try-block — avoids shadowing module-scope poData[] array used by sibling currentPO lookup in same updatePOStatus function; defensive rename per Rule 1
- [Phase 84.1-01]: Used window.getCurrentUser?.()? pattern in submitTransportRequest TR creator stamp because that function does NOT declare a local currentUser (plan stated otherwise — Rule 3 blocking auto-fix)
- [Phase 84.1-02]: PROJECT_COST_CHANGED placed adjacent to PROJECT_STATUS_CHANGED in TYPE_META (both files) — keeps project-domain badges grouped visually; '$' icon + brand blue #1a73e8 to signal "project field changed" without conflating with money-received green of RFP_PAID
- [Phase 84.1-02]: NOTIF-19 reuses the same audience as NOTIF-11 (personnel_user_ids only) — cost changes are an operational concern for the project's personnel; future audience expansion to procurement/Finance can be done by appending a separate createNotificationForRoles call without disturbing this trigger
- [Phase 84.1-02]: WR-03 pre-capture pattern preserved in service-detail.js for NOTIF-19 — capture lines (NOTIF19_COST_FIELDS, isCostChange, notifCostRecipients, notifCostFieldLabel, notifCostOldDisplay, notifCostNewDisplay) added in same scope as existing notif* captures, before the await updateDoc; avoids stale onSnapshot data
- [Phase 84.1-02]: Display convention `PHP <formatted>` for present values, `(not set)` for null transitions — matches existing input-field placeholder text "(Not set)" on project-detail.js lines 389/393; clarifies null↔value transitions per must_have truth #5
- [Phase 84.1-02]: Projected Cost is OUT OF SCOPE per locked decision B4 — derived from project expenses, not a saveField target; NOTIF19_COST_FIELDS contains exactly ['budget', 'contract_cost'] in both detail views; regression-checked via grep -c projected_cost (count = 0 in new code)
- [Phase 84.1-02]: Plan executed exactly as written (zero deviations) — anchor strings matched, formatCurrency already imported in both detail views, createNotificationForUsers + NOTIFICATION_TYPES already imported by Phase 84-03; only addition was a one-line documentation comment on the service-detail.js capture block
- [Phase 84.1-03]: NOTIF-20 augmentation uses in-scope `reason` local variable (declared at procurement.js:4222 from prompt) for the colon-suffix append rather than re-reading `rejectedMrfSnap.rejection_reason` post-updateDoc — both are equivalent but `reason` is the canonical user-typed source and the snapshot was captured before updateDoc anyway
- [Phase 84.1-03]: Defensive conditional `${reason && reason.trim() ? `: ${reason.trim()}` : ''}` (not just `${reason ? ... : ''}`) — checks both truthiness AND non-empty trimmed content; in practice rejectMRF() pre-validates `reason.trim()` is non-empty (lines 4226-4229) and returns early otherwise, so this is belt-and-suspenders defense for theoretical bypass paths
- [Phase 84.1-03]: Plan executed exactly as written (zero deviations) — plan-supplied edit anchor matched the source verbatim, replacement string applied with zero modification, both verification grep counts (`has been rejected by Procurement` == 1, `reason && reason.trim()` == 1) matched plan expectations on first run
- [Phase 84.1-03]: UAT scaffold (.planning/phases/84.1-procurement-notifications-trigger-enhancements/84.1-UAT.md) committed separately as `test(84.1)` per parent's suggested commit pattern — pre-populated with 15 tests (7 new-requirement + 8 regression) all marked `[pending]`; frontmatter records `environment: dev Firebase project` (NOT production clmc-procurement) per Phase 53.1 dev-environment introduction
- [Phase 84.1-03]: Phase closure gated on human UAT execution per autonomous=false plan contract — checkpoint:human-verify task in 84.1-03-PLAN.md awaits user-driven verification of all 7 new triggers + 8 regression tests against the dev Firebase environment before Phase 84.1 can be marked complete
- [Phase 84.1-01 RETROACTIVE 2026-05-02]: Plan 01 Task 3 was originally SKIPPED by the executor with the incorrect note "Task 3 belongs to plan 02" — that was wrong per 84.1-01-PLAN.md lines 398–535. Retroactive fix commit f5d9940 wires all five finance.js notification blocks (NOTIF-15 PR Approved + Rejected, NOTIF-17 TR Approved + Rejected, NOTIF-16 RFP Fully Paid) plus the missing `import { createNotification, NOTIFICATION_TYPES } from '../notifications.js'` line. All blocks use isolated try/catch + creator-UID null-guard per D-03. Untouched: po_creator_user_id stamp from Task 1, Plan 02/03 deliverables, firestore.rules. 84.1-01-SUMMARY.md amended with a "Retroactive Fix (2026-05-02)" section documenting the gap, the fix, and the root-cause note (future executors must not silently move tasks between sibling plans). Phase-level requirements list NOTIF-15/NOTIF-16/NOTIF-17 are now actually shipped at the code layer; UAT-layer verification still pending per Plan 03's checkpoint:human-verify gate.
- [Phase 85-08]: Inline deriveCollectibleStatus inside showExpenseBreakdownModal — duplicate (not import) of Plan 05's helper to avoid circular dependency between expense-modal.js (the shared module) and finance.js (a consumer view). Same anti-circular-import pattern as Phase 71's inline derive*ForPO/TR/DeliveryFee. If/when a 3rd consumer of this exact derivation appears, lift to app/coll-status.js.
- [Phase 85-08]: Project mode collectibles fetch does an extra projects-by-name lookup (3rd lookup of the project doc inside one modal-open) to extract project_code — mirrors the existing RFP-fetch pattern at lines 47-74 rather than refactoring the call sites to share one lookup. Acceptable cost for user-action-driven modal; flagged in SUMMARY for a future caching pass if latency becomes an issue.
- [Phase 85-08]: Inner-loop variable renamed from totalPaid to totalPaidColl to avoid shadowing the outer-scope let totalPaid (used for RFP-payable accumulation at line 70). Pure cosmetic, no behavior change; the only sub-line refinement applied vs. the plan's reference snippet.
- [Phase 85-05]: deriveCollectibleStatus is intentionally inlined in TWO files (app/views/finance.js + app/expense-modal.js Plan 85-08) — extraction to a shared app/coll-status.js was considered but skipped to keep Plan 05 single-file scope; both copies are byte-equivalent (parseFloat amount accumulator, same Fully > Overdue > Partial > Pending priority order). JSDoc on finance.js copy explicitly references the duplication for the v4.1 hygiene phase
- [Phase 85-05]: Plan-N stub bridge pattern — Plan 05 ships idempotent toast no-op stubs for the 5 Plan 06 write-action window functions (openCreateCollectibleModal, exportCollectiblesCSV, openRecordCollectiblePaymentModal, toggleCollPaymentHistory, showCollectibleContextMenu) guarded by `if (!window.X)` so Plan 06's real implementations survive subsequent re-init re-attaches. Plan 06 must use unconditional assignments to overwrite the stubs on first attach
- [Phase 85-05]: initCollectiblesTab subscribes to THREE collections (collectibles + projects + services) even though Plan 05 only renders the first — projects/services maps drive Plan 06's create-modal tranche dropdown, so Plan 05 pre-populates them. Plan 06 needs zero listener-wiring changes
- [Phase 85-05]: Status priority sort hard-coded inline as Pending=1, Overdue=2, Partial=3, Fully=4 with secondary due_date asc — surfaces unpaid-and-due-soon collectibles to the top per D-18; matches Phase 65 RFP sort order
- [Phase 85-05]: Due-date range filter uses lexicographic string compare (>= / <=) on YYYY-MM-DD instead of Date parsing — same shape as Phase 65 RFP filter; safe because Firestore stores due_date as ISO string per D-09
- [Phase 85-05]: All user-controlled string interpolations in renderCollectiblesTable wrapped in escapeHTML (T-85.5-01 mitigation) — coll.id (Firestore auto-id, alphanumeric) interpolated bare in JS-string-literal contexts to match existing finance.js parity (rfp.id same treatment, no new attack surface)
- [Phase 85-05]: getDisplayedCollectibles extracted as pure helper so Plan 06's CSV export reuses the filter+sort pipeline without duplication; orchestrator note for Plan 06 executor — call getDisplayedCollectibles() instead of re-implementing

### Pending Todos

- [Phase 83-01 DEFER] Add Firestore rule unit tests for `notifications` collection to `test/firestore.test.js`. Evidence: test harness uses v2+ API (initializeTestEnvironment) but last update was Phase 49 (services collection). `rfps` collection (Phase 65) was never added to tests. Recommended approach: add `rfps` + `notifications` tests together in a single hygiene phase (v4.1 candidate). See 83-01-SUMMARY.md for D-17/D-18/D-19 predicates to test. Verification: `grep "rfps\|notifications" test/firestore.test.js` should return 0 until this todo is resolved.

### Blockers/Concerns

- Phase 83 design: notifications collection schema + Security Rules need to be locked before bell-UI work begins (collection name `notifications`; per-user read/write enforced via `user_id == request.auth.uid`)
- Phase 86 design: Gantt rendering library decision pending — vanilla SVG vs CDN library (e.g., Frappe Gantt) — must align with zero-build / no-bundler constraint
- Phase 87 design: Firebase Storage upload path + versioning convention need to be locked before doc-upload UI work begins (proposed: `proposals/{proposalId}/v{n}/{filename}`)
- Phase 88 design: Mgmt Tab Security Rules block must deploy in same commit as the first super-admin-only `addDoc` (Mgmt Tab decisions); v3.2 paid for this kind of mistake before

### Roadmap Evolution

(v4.0 phases planned 2026-04-28; insertions tracked here as they happen)

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
| 260430-a4b | Codeless projects/services with assigned personnel_user_ids should appear in MRF for operations_user and services_user | 2026-04-30 | 551125d | Verified | [260430-a4b-codeless-projects-mrf-personnel-filter](.planning/quick/260430-a4b-codeless-projects-mrf-personnel-filter/) |

## Session Continuity

Last activity: 2026-05-02 - Phase 85 Plan 05 (Wave 3 — Finance Collectibles sub-tab read-side) executed and committed: 3399ea8 / 2799a68 / 1ab7b46. 5th finance-sub-nav-tab pill + section markup with 5-filter bar + 10-column flat table + 15-per-page filter-aware pagination + onSnapshot x3 (collectibles/projects/services) wired in initCollectiblesTab pushed to listeners[] + destroy() unsubscribe + 7 window function deletes + 9 state resets + 5 idempotent Plan 06 stub toasts. 3 tasks, 3 commits, 0 deviations, +448 lines on app/views/finance.js.
Last session: 2026-05-05T06:34:06.855Z
Stopped at: Phase 86 UI-SPEC approved
Resume file: .planning/phases/86-native-project-management-gantt/86-UI-SPEC.md
Next action: Execute Plan 85-06 — collectible create modal (tranche dropdown sourced from already-populated projectsForCollMap/servicesForCollMap), record-payment modal with method dropdown (Bank/Check/Cash/GCash/Other), void-payment read-modify-write, cancel-collectible right-click, CSV export reusing getDisplayedCollectibles, and unconditional overwrite of the 5 Plan 05 stub window functions.
