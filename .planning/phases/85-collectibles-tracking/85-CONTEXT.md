---
name: 85-CONTEXT
description: Decisions for Phase 85 — Collectibles Tracking. Manual money-in tracking against projects+services, mirrors Phase 65 RFP/Payables architecture; tranche-driven amounts, auto-derived status, Finance sub-tab + project-detail surface, Finance-on-create notification.
type: phase-context
---

# Phase 85: Collectibles Tracking - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Operations Admin / Finance can manually track money owed by clients on a project (and service) — create, edit, delete, record partial/full payments, and view auto-derived status — independent of any PM auto-trigger. Phase 85 is the **money-in mirror** of Phase 65 RFP/Payables: the same architectural backbone (auto-derived status, `payment_records` array with void+audit, Finance sub-tab, project-detail surface, custom-inline ID generator, security rules same-commit) reapplied to client billables.

**In scope (COLL-01..COLL-09):**
- New Firestore collection: `collectibles` with `payment_records` array
- New structured field on projects/services: `collection_tranches` array (label + percentage, sum=100)
- Finance sub-tab "Collectibles" (5th peer alongside Approvals / POs / Project List / Payables)
- Project-detail and service-detail surfaces (Financial Summary cells + Financial Breakdown modal tab)
- CSV export of collectibles list
- One in-app notification trigger: `COLLECTIBLE_CREATED` → fan-out to Finance role
- `firestore.rules` for `collectibles` (Operations Admin + Finance write; all active users read)

**Out of scope (deferred):**
- Auto-trigger collectibles from PM task progress (`COLL-FUT-01`, requires Phase 86)
- Per-client collectibles aggregation view (`COLL-FUT-02`)
- Ageing report — 30/60/90+ days overdue (`COLL-FUT-03`)
- Inline expandable list directly on the project-detail page (deferred — modal tab covers the worklist)
- Notifications on Fully-Paid status flip (deferred polish; only `COLLECTIBLE_CREATED` ships in 85)
- Edit of payment records (only void supported, mirroring Phase 65)
- Multiple collectibles per tranche (strict 1:1 enforcement)

</domain>

<decisions>
## Implementation Decisions

### Scope Anchor
- **D-01 — Projects + Services parity:** Collectibles attach to either a `projects` or `services` doc. Each collectible carries a `department: 'projects' | 'services'` discriminator (mirrors Phase 29 dept pattern), plus `project_id` / `service_id`. Finance Collectibles tab gets a department filter; both `project-detail.js` and `service-detail.js` get the same surfaces. No projects-only short-circuit.

### Finance Sub-tab Placement
- **D-02 — 5th peer sub-tab "Collectibles":** Add as the 5th `finance-sub-nav-tab` alongside Pending Approvals / Purchase Orders / Project List / Payables. Route: `#/finance/collectibles`. Reuse Phase 73.3 pill-bar + sticky scroll-hide CSS; reuse Phase 65.1 dual-state filter independence pattern.
- **D-03 — Filter set on tab:** Project (dropdown), Status (Pending / Partially Paid / Fully Paid / Overdue), Due-date range (from–to), Department (Projects / Services / All). Four independent filter state vars per Phase 65.1 precedent.
- **D-04 — Pagination:** 15 rows per page (mirrors Phase 65.7 PO Payment Summary). Filter-aware (apply filters → paginate filtered set), mirrors Phase 63 supplier search.
- **D-05 — Layout:** Single flat table — one row per collectible — not grouped. Columns: ID | Project/Service | Department badge | Tranche Label | Amount | Paid | Balance | Due Date | Status | Actions. Use Phase 64+ status badge classes.

### Project-detail / Service-detail Surface
- **D-06 — Financial Summary card cells:** On both `project-detail.js` and `service-detail.js` Financial Summary card, add two new cells: **Collected** and **Remaining Collectible**, parallel to the existing **Paid** and **Remaining Payable** money-out cells (line ~420-430 in `project-detail.js`). Always rendered for zero-state visibility (Phase 75 pattern). `Remaining Collectible` color: red if > 0 (debt outstanding), green if 0 (fully collected).
- **D-07 — Financial Breakdown modal tab:** Add a new "Collectibles" tab to `app/expense-modal.js` (parallel to existing Payables tab from Phase 71). Worklist view with per-collectible rows + expandable payment history. Modal already supports project + service modes (Phase 36 unification) — extend both.
- **D-08 — No inline expandable list on project page:** Discussed and trimmed to keep project-detail footprint manageable. The modal tab IS the worklist. (Original ASK selected all-three; deliberate trim during discussion.)

### Amount Source — Contract-tied Tranches (mirrors Phase 65 RFP-on-PO)
- **D-09 — `collection_tranches` array on projects/services:** Each project/service gets a structured array on the doc — `[{ label: string, percentage: number }]` — defining how the contract_cost is split into billable tranches (e.g., `[{ label: 'Mobilization', percentage: 50 }, { label: 'Progress', percentage: 40 }, { label: 'Retention', percentage: 10 }]`). Tranches MUST sum to exactly 100 (validation on save, mirrors Phase 65 PO tranches).
- **D-10 — Tranche editor placement:** Inside the project create/edit form (`projects.js` / `project-detail.js`) and service create/edit form (`services.js` / `service-detail.js`). Add/remove rows + label input + percentage input + running-total badge. Mirror Phase 65 PO tranche-builder UI exactly.
- **D-11 — No default tranche; block until set:** Creating a collectible against a project/service with no `collection_tranches` is BLOCKED with a UI message: "Set up collection tranches on this project before creating a collectible" + a link to the project edit form. v3.2 projects without tranches need a one-time setup. No synthetic 100% default. Forces explicit setup.
- **D-12 — One collectible per tranche (strict):** Each project tranche can be the source of at most ONE collectible doc. Splitting a tranche (e.g., bill 50% Mobilization in two halves) requires editing the project to break it into two smaller tranches. Pre-fill UI: when creating a collectible, show only tranches that don't yet have a collectible attached. Mirrors Phase 65 RFP one-per-tranche semantics exactly.
- **D-13 — Tranche fields denormalized on collectible:** `tranche_label` and `tranche_percentage` copy onto the collectible doc at creation time. Future tranche-rename on the project does NOT mutate existing collectibles (history preserved). `amount_requested = tranche_percentage × contract_cost`, frozen at creation. If contract_cost changes later, existing collectibles keep their original `amount_requested`; new collectibles use the new `contract_cost`.

### Payment Recording (mirrors Phase 65 RFP exactly)
- **D-14 — Modal fields:** Date / Amount / Method dropdown (Bank Transfer | Check | Cash | GCash/E-Wallet | Other) / Reference. Selecting "Other" reveals a freetext method input (Phase 65 pattern).
- **D-15 — Partial payments allowed:** Per COLL-05, users can record partial amounts. Multiple payments per collectible until fully paid. (This is the ONE deviation from Phase 65 RFPs, where tranches were atomic. COLL is on the inflow side and partial-pay is required by COLL-05.)
- **D-16 — Void-only, no edit:** Voided payment records persist with `voided: true` + `voided_by` + `voided_at` + `void_reason`. Voided amounts excluded from `total_paid`. Audit trail preserved. Read-modify-write pattern (mirrors Phase 65 D-60+).
- **D-17 — Payment history UI:** Expandable section under the collectible row in the Finance tab + in the Financial Breakdown modal tab. Toggle chevron. Chronological list. Voided payments shown struck-through with "(voided)" indicator.

### Auto-derived Status (locked by COLL-06; mirrors Phase 65)
- **D-18 — Four states, never manually set:** Pending / Partially Paid / Fully Paid / Overdue. Derivation:
  - `total_paid = sum of payment_records where !voided`
  - `Fully Paid` if `total_paid >= amount_requested`
  - `Overdue` if `due_date < today && total_paid < amount_requested` (Overdue takes precedence over Pending/Partially-Paid badge color but the state is still Partially-Paid-with-Overdue-flag — derive a `is_overdue: boolean` for filter purposes; primary status badge is Overdue if applicable).
  - `Partially Paid` if `0 < total_paid < amount_requested`
  - `Pending` if `total_paid == 0`
- **D-19 — Status NOT persisted:** Derived on read in JS, never written to Firestore. Same pattern as Phase 65 RFP (D-44).

### ID Format
- **D-20 — Project-scoped sequential:** `COLL-{PROJECT-CODE}-{n}` for collectibles on a project (e.g., `COLL-CLMC-ACME-001-1`); `COLL-{SERVICE-CODE}-{n}` for service-side. Custom inline generator queries `collectibles where project_code (or service_code) == X` for max n. Do NOT use `generateSequentialId()` — Phase 65.4 lesson learned (year-counter caused collisions). For clientless projects (Phase 78) without a project_code yet: BLOCK collectible creation with a "Project must have a code (assign a client first)" message.

### Notifications (single trigger this phase)
- **D-21 — `COLLECTIBLE_CREATED` notification:** When a collectible is successfully written, fan-out to all active users with `role === 'finance'` via `createNotificationForRoles({ roles: ['finance'], type: NOTIFICATION_TYPES.COLLECTIBLE_CREATED, ... })`. Add `COLLECTIBLE_CREATED` to the `NOTIFICATION_TYPES` enum in `app/notifications.js`. Wrap in try/catch — notification failure must NOT block collectible creation (Phase 83 D-03 + Phase 84 D-03 pattern).
- **D-22 — Notification content:** Message includes collectible ID, project/service code+name, tranche label, amount. Deep link: `#/finance/collectibles?focus={COLL_ID}` (or just `#/finance/collectibles` if focus param not implemented). `source_collection: 'collectibles'`, `source_id: coll_id`, `actor_id: getCurrentUser().uid`.
- **D-23 — No Fully-Paid notification:** Out of scope for Phase 85. Captured as deferred polish.

### Security Rules (locked by COLL-09)
- **D-24 — `collectibles` collection rules deploy in same commit as first write:** Per Phase 65 D-71 lesson — without rules, even Super Admin gets denied. Use the "ADDING NEW COLLECTIONS" template at top of `firestore.rules`. Read: any active user. Create/update/delete: `operations_admin` OR `finance` OR `super_admin`. `payment_records` mutations follow read-modify-write (no array-element rules needed).
- **D-25 — `collection_tranches` field on projects/services:** Already inside existing `projects` / `services` rules — no schema-level lock once issued (unlike Phase 78's project_code). Anyone with project edit permission can edit tranches. Editing tranches AFTER collectibles exist on a project: ALLOWED, but with a confirmation modal warning that existing collectibles' `tranche_label` and `amount_requested` are frozen (won't auto-update). UI guidance only — no DB-level lock.

### CSV Export (locked by COLL-08; Claude's discretion on column set)
- **D-26 — Export action:** "Export CSV" button on the Finance Collectibles sub-tab. Reuses `downloadCSV` utility from `app/utils.js` (Phase 41 pattern). Filename: `collectibles-{YYYY-MM-DD}.csv`. Includes filter-aware export (exports the currently-filtered set).
- **D-27 — Column set (Claude's discretion):** ID, Project/Service Code, Project/Service Name, Department, Tranche Label, Tranche %, Amount Requested, Total Paid, Balance, Due Date, Status, Created Date, Description. Payment-record-level export NOT included in CSV (one row per collectible; payment history visible only in modal). If you want a separate per-payment CSV, defer to a future phase.

### Claude's Discretion
- Exact tranche-editor UI (add/remove row buttons, running-total badge styling, validation messages) — mirror Phase 65 PO tranche builder
- Exact tranche-conflict copy when blocking creation without tranches
- Block-message UX styling for clientless-project / no-tranches blocks
- Status badge colors for Overdue (red, mirror Phase 65 RFP overdue)
- Right-click context menu for cancel/void on a collectible row (mirror Phase 65.10 cancel-RFP pattern). Cancel a zero-payment collectible to free the tranche.
- Confirmation modal copy when editing tranches on a project that already has collectibles
- Modal styling, transitions, animations
- Whether to add a `createNotificationForUsers({ user_ids })` helper or stay with role fan-out (no UID-array fan-out needed in Phase 85)
- Notification message exact wording

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 65 RFP/Payables (parent template — READ FIRST)
- `.planning/milestones/v3.2-phases/65-rfp-payables-tracking/65-CONTEXT.md` — All 24 RFP decisions (D-01..D-24): the architectural skeleton Phase 85 mirrors. Tranche atomicity, payment_records array, void semantics, status auto-derivation, ID generation, security-rules-same-commit are all from here.
- `.planning/milestones/v3.2-phases/65-rfp-payables-tracking/65-RESEARCH.md` — Phase 65 research output for implementation patterns
- `.planning/milestones/v3.2-phases/65.1-finance-payables-tab-dual-table-revamp-rfp-po-payments/` — Dual-table layout + 4 independent filter state vars pattern (Phase 85 reuses for filter independence)
- `.planning/milestones/v3.2-phases/65.4-improve-rfp-code-generation-as-sometimes-i-get-duplicate-or-non-unique-codes-instead-lets-do-this-rfp-po-id-n/` — ID-format collision lesson; informs D-20 project-scoped choice
- `.planning/milestones/v3.2-phases/65.7-introduce-pagination-for-po-payment-summary-table-refer-to-existing-pagination-format-and-structure-on-our-codebase/` — 15-per-page pagination pattern reused in D-04
- `.planning/milestones/v3.2-phases/65.10-cancel-rfp-capability-cancel-whole-rfp-when-no-existing-rfps-filed-and-cancel-unapproved-tranche/` — Right-click cancel pattern for zero-payment cancellation
- `.planning/milestones/v3.2-phases/65.6-rfp-bank-transfer-mode-add-supplementary-button-to-select-additional-bank-option/` — Method dropdown with conditional reveal pattern (D-14)

### Phase 71 Financial Breakdown modal (the parent surface for D-07)
- `.planning/milestones/v3.2-phases/71-rename-expense-breakdown-financial-breakdown/` — Naming + Payables tab introduction. Phase 85 adds a sibling "Collectibles" tab using the same pattern.
- `app/expense-modal.js` — `showExpenseBreakdownModal` unified for projects + services (Phase 36). Extension point for D-07.

### Phase 84 Notifications (the trigger plumbing for D-21..23)
- `.planning/phases/84-notification-triggers-existing-events/84-CONTEXT.md` — Trigger-site insertion pattern, try/catch wrapping, fan-out helpers
- `.planning/phases/83-notification-system-foundation/` — `createNotification` / `createNotificationForRoles` / `NOTIFICATION_TYPES` enum location and signatures
- `app/notifications.js` — Live module to extend with `COLLECTIBLE_CREATED` type

### Phase 75 Financial Summary card always-render pattern (for D-06)
- `.planning/milestones/v3.2-phases/75-paid-remaining-payable-cells-on-project-and-service-detail-financial-summary/` — Cells always-rendered for zero-state visibility; Service Remaining Payable formula correctness

### Phase 41 CSV export (for D-26)
- `app/utils.js` — `downloadCSV(filename, headers, rows)` utility

### Phase 78 clientless-project handling (for D-20 block path)
- `.planning/milestones/v3.2-phases/78-allow-clientless-project-creation-with-deferred-project-code-issuance/` — Project-code deferral; collectible creation must block until project_code issued

### Trigger / integration sites (read these source files before planning)
- `app/views/finance.js` — Existing 4-sub-tab pill nav (lines 1735–1760). Add 5th tab `#/finance/collectibles`. Pattern: `finance-sub-nav-tab` class, `finance-sub-nav-tab--active` modifier.
- `app/views/project-detail.js` — Financial Summary card (lines 374–433). Insert Collected / Remaining Collectible cells in the same 2-col grid.
- `app/views/service-detail.js` — Equivalent Financial Summary card. Same insertion.
- `app/views/projects.js` / `app/views/services.js` — Project/service create form. Add `collection_tranches` array editor.
- `app/expense-modal.js` — `showExpenseBreakdownModal`. Add "Collectibles" tab next to Payables.
- `app/notifications.js` — Add `COLLECTIBLE_CREATED` to `NOTIFICATION_TYPES` enum.
- `firestore.rules` — Add `collectibles` collection block (lines 6–39 template). Update `projects` / `services` rules if needed for `collection_tranches` field (likely already covered by existing project/service edit rules).

### Project-level (always mandatory)
- `CLAUDE.md` — SPA Patterns: Window Functions for onclick, Hash-Based Routing, Firebase Listener Management, status matching case-sensitivity, Sequential ID Generation, "ADDING NEW COLLECTIONS" template at top of firestore.rules
- `.planning/PROJECT.md` — Out of Scope: "Email notifications" (in-app only), "Mobile app", "OAuth/SSO". Constraints: Firebase-only, no build system, no Cloud Functions.
- `.planning/REQUIREMENTS.md` §COLL — COLL-01..COLL-09 (lines 50–58); COLL-FUT-01..03 deferred enhancements (lines 99–101)
- `.planning/ROADMAP.md` — Phase 85 success criteria (lines 280–290); independence note (no dependencies)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createNotificationForRoles({ roles, type, message, link, source_collection, source_id, excludeActor })`** (`app/notifications.js`, Phase 83 D-15) — direct reuse for D-21 Finance fan-out.
- **`NOTIFICATION_TYPES`** enum (`app/notifications.js`) — extend with `COLLECTIBLE_CREATED`.
- **`getCurrentUser()`** (`app/auth.js:177`, `window.getCurrentUser`) — for `actor_id` and `created_by_user_id` stamps.
- **`downloadCSV(filename, headers, rows)`** (`app/utils.js`, Phase 41) — direct reuse for D-26 export.
- **`formatCurrency(value)` / `formatDate(value)`** (`app/utils.js`) — for table rendering.
- **`getStatusClass(status)`** (`app/views/procurement.js`) — extend with collectible status mapping (mirror Phase 65 RFP status badge classes).
- **`showExpenseBreakdownModal(mode, contextDoc)`** (`app/expense-modal.js`, Phase 36) — extension point for D-07 Collectibles tab.
- **Right-click context menu pattern** — reuse from Phase 64 proof modal trigger and Phase 65.10 cancel-RFP. For collectible cancel/void.
- **Pill-bar sub-tab nav (`finance-sub-nav-tab` class)** — Phase 73.3 — extend with 5th tab.
- **Pagination component (`paginatedList` pattern)** — Phase 65.7 / Phase 63 — reuse for D-04.
- **Filter independence pattern (Phase 65.1)** — 4 independent filter state vars, no shared state.
- **CSS dual-mode pattern (Phase 73.1)** — table + card list both in DOM, media query hides inactive — for mobile parity if needed.

### Established Patterns
- **Window functions for onclick** (CLAUDE.md) — every collectible action invoked from HTML must be on `window` (e.g., `window.recordCollectiblePayment`, `window.voidCollectiblePayment`, `window.cancelCollectible`).
- **Status matching case-sensitive** (CLAUDE.md) — D-18 status strings exact: `'Pending'`, `'Partially Paid'`, `'Fully Paid'`, `'Overdue'`.
- **Department discriminator pattern** (Phase 29) — `department: 'projects' | 'services'` denormalized on collectible. Use for routing AND filter.
- **Tranche-on-doc pattern** (Phase 65) — array of `{ label, percentage }` validated to sum 100, edited via add/remove-row UI with running-total badge.
- **try/catch on notification calls** (Phase 83 module comment) — fire-and-forget; failure never blocks primary action.
- **Fields-frozen-at-creation pattern** (Phase 78 backfill semantics) — `tranche_label`, `tranche_percentage`, `amount_requested` denormalized at creation; future contract_cost or tranche edits don't mutate existing collectibles.
- **Read-modify-write for array fields** (Phase 65 payment_records) — getDoc → modify array → updateDoc with full new array. No Firestore arrayUnion/arrayRemove for `payment_records`.
- **Always-render zero-state cells** (Phase 75) — Collected / Remaining Collectible cells render even when value is 0, so users see the field exists.

### Integration Points
- **`app/views/finance.js`** lines 1735–1760: Add 5th `<a href="#/finance/collectibles">` to the pill bar. Add new `<section id="collectibles-section">` with table + filters. Add `initCollectiblesTab()` that wires `onSnapshot(collection(db, 'collectibles'), ...)`. Add `destroy()` cleanup for collectibles listeners + window functions.
- **`app/router.js`**: Verify `#/finance/collectibles` parses as `path: /finance, tab: collectibles` (existing pattern). Tab switch within Finance does NOT call destroy() — listeners persist (per CLAUDE.md tab navigation note).
- **`app/views/project-detail.js`** lines 420–430: Insert two new `<div class="form-group">` cells in the existing 2-col grid. Compute `currentCollectibles.totalRequested`, `currentCollectibles.totalCollected`, `currentCollectibles.remainingCollectible`.
- **`app/views/service-detail.js`**: Mirror project-detail change.
- **`app/expense-modal.js`**: Add Collectibles tab. Reuse the existing tab-bar markup pattern.
- **`app/views/projects.js` / `services.js`**: Tranche editor in create/edit form. Persist `collection_tranches` to Firestore.
- **`firestore.rules`**: Add `match /collectibles/{collId}` block. Read: any `isActiveUser()`; create/update/delete: roles `operations_admin` / `finance` / `super_admin`.
- **`app/notifications.js`**: Add `COLLECTIBLE_CREATED: 'COLLECTIBLE_CREATED'` to the enum.

### Service-Detail Refresh-Button Pattern (Phase 72)
- The Refresh button on Financial Summary card refreshes data AND opens the Financial Breakdown modal in one click. New Collected/Remaining cells should be populated by the same refresh path that populates Paid/Remaining Payable.

</code_context>

<specifics>
## Specific Ideas

- **Department badge in Finance Collectibles table:** Use existing `getDeptBadgeHTML(department)` from `app/components.js` (Phase 38) for the Department column.
- **Block-message copy when no tranches set:** "Set up collection tranches on this project before creating a collectible. Click here to edit the project." — link opens project edit form anchored to the tranches section.
- **Block-message copy for clientless project:** "This project doesn't have a project code yet. Assign a client to issue the code, then return to create collectibles."
- **Filter "All" departments default:** Match Phase 65.1 default behavior — show everything until user narrows.
- **Tranche running-total badge color:** Green when sum=100, red when sum≠100 (mirror Phase 65 PO tranche builder).
- **Notification message format:** `"New collectible filed: COLL-CLMC-ACME-001-1 (Mobilization, PHP 75,000) on Project ACME Corp"` — include human-readable ID, tranche label, formatted amount, project name. Deep-link target: Finance Collectibles tab.
- **Edit-tranches-after-collectibles-exist warning:** "Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?"

</specifics>

<deferred>
## Deferred Ideas

- **Auto-trigger collectibles from PM task progress** (`COLL-FUT-01`) — depends on Phase 86 (Project Management & Gantt). Future phase.
- **Per-client collectibles aggregation view** (`COLL-FUT-02`) — sum collectibles across all client projects. Future phase / v4.1.
- **Ageing report (30/60/90+ days overdue)** (`COLL-FUT-03`) — separate analytics view. Future phase.
- **Inline expandable list on project-detail page** (originally selected then trimmed during discussion) — modal tab covers the worklist; revisit if users need scan-without-click.
- **Notify project personnel on Fully Paid status flip** — captured as deferred polish; mirrors NOTIF-11 personnel fan-out. Add `COLLECTIBLE_FULLY_PAID` enum + trigger when needed.
- **Notify Operations on Overdue status flip** — same polish category. Time-based; would need a scheduler/checker (Cloud Functions out of scope per PROJECT.md, so requires client-side derive on view-load + notification dedup).
- **Edit of payment records (not just void)** — current decision is void-only mirroring Phase 65; revisit if void+re-record becomes high-friction in production use.
- **Per-payment CSV export** — current CSV is one-row-per-collectible. Add per-payment export if Finance asks.
- **Multiple collectibles per tranche** — current is strict 1:1; loosen if users hit the wall on partial-tranche billing patterns.
- **Tranche presets** (e.g., "Standard 50/40/10", "60/40", "100% upfront") — quick-select buttons on the tranche editor. UX polish for v4.1.
- **DB-level immutability on `tranche_label` / `tranche_percentage` after first payment recorded** — currently UI-warning only; could harden via Security Rules if audit rigor demands.
- **`createNotificationForUsers({ user_ids })` helper** — not needed in Phase 85; only role-based fan-out used. Add if a future phase needs UID-array fan-out.

</deferred>

---

*Phase: 85-collectibles-tracking*
*Context gathered: 2026-05-02*
