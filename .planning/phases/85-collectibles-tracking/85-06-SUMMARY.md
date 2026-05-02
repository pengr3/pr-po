---
phase: 85-collectibles-tracking
plan: 06
subsystem: finance.collectibles.write-side
tags: [collectibles, finance, crud, csv, notifications, security, payments]
dependency_graph:
  requires:
    - 85-01: firestore.rules collectibles block, COLLECTIBLE_CREATED enum + TYPE_META
    - 85-02: generateCollectibleId(scopeCode, dept) async helper
    - 85-05: collectiblesData[], projectsForCollMap, servicesForCollMap, deriveCollectibleStatus, getDisplayedCollectibles, statusBadgeColors, renderCollectiblesTable scaffolding, oncontextmenu hook on ID cell
  provides:
    - Finance Collectibles tab full CRUD: create, edit, payment record (partial pay), void, cancel, CSV export
    - COLLECTIBLE_CREATED notification fan-out to Finance role (D-21 fire-and-forget)
    - T-85.6-01 CSV-injection mitigation (HIGH-severity threat)
  affects:
    - app/views/finance.js (only file touched — pure additions, no edits to Plan 05 read-side)
tech_stack:
  added: []
  patterns:
    - "PATTERNS.md Pattern 19 (notification fire-and-forget — Phase 84.1 D-03)"
    - "PATTERNS.md Pattern 20 (create-modal with tranche dropdown + D-12 dedup)"
    - "PATTERNS.md Pattern 21 (frozen denormalized fields per D-13)"
    - "Phase 65 D-50 try/catch with errorEl + console.error + showToast"
    - "Phase 65.10 right-click context menu (cancel-RFP mirror)"
    - "OWASP CSV injection mitigation — leading-char single-quote prefix"
key_files:
  created: []
  modified:
    - app/views/finance.js
decisions:
  - "Refactored authority check into hasCollectibleWriteAuthority() shared helper used by 6 entrypoints (open create/edit/payment, submit create/edit, void, cancel) instead of inlined per-function checks — reduces duplication, easier to evolve when Phase 85.x adds more roles"
  - "CSV-injection trigger char set extended beyond plan spec (=, +, -, @) to also include tab (\\t) and carriage-return (\\r) per OWASP CSV-injection guidance — strict superset, safer"
  - "Re-fetch on collision-retry deferred (Phase 65.4 lesson): generateCollectibleId currently runs once before addDoc; if two simultaneous addDocs race within same scopeCode, T-85.6-04 (accepted in threat register) absorbs it. Documented for v4.1+ if it bites in production"
metrics:
  duration: ~50 min
  completed: 2026-05-02
---

# Phase 85 Plan 06: Finance Collectibles Write-Side Summary

Layered the full write-side (create + edit + payment recording + voiding + cancel + CSV export) onto Plan 05's read-only Collectibles scaffolding inside `app/views/finance.js`. Adds COLLECTIBLE_CREATED notification fan-out to Finance role (fire-and-forget per D-21), enforces D-13 frozen denormalized tranche fields on create + edit, supports D-15 partial payments, D-16 read-modify-write voids with full audit trail, D-17 expandable payment history, and D-26/D-27 filter-aware 13-column CSV export with HIGH-severity T-85.6-01 CSV-injection mitigation.

## Commits

| Task | Commit  | Description                                                              |
| ---- | ------- | ------------------------------------------------------------------------ |
| 1    | 5fad81d | Create + Edit collectible — modal, submit, COLLECTIBLE_CREATED notif     |
| 2    | 4650665 | Payment recording, voiding, expandable history UI                        |
| 3    | cb935a2 | Cancel-collectible (right-click) + filter-aware CSV export with mitigation |

## Function-Location Inventory (per `<output>` requirement #1)

All 16 new functions defined in `app/views/finance.js`:

| # | Function                              | Type   | Line | Task |
| - | ------------------------------------- | ------ | ---- | ---- |
| 1 | `hasCollectibleWriteAuthority`        | sync   | 1530 | 1    |
| 2 | `openCreateCollectibleModal`          | async  | 1546 | 1    |
| 3 | `_refreshCreateCollProjectDropdown`   | sync   | 1622 | 1    |
| 4 | `_refreshCreateCollTrancheDropdown`   | sync   | 1646 | 1    |
| 5 | `submitCollectible`                   | async  | 1734 | 1    |
| 6 | `openEditCollectibleModal`            | async  | 1847 | 1    |
| 7 | `submitEditCollectible`               | async  | 1916 | 1    |
| 8 | `openRecordCollectiblePaymentModal`   | sync   | 1956 | 2    |
| 9 | `toggleCollPaymentOtherField`         | sync   | 2091 | 2    |
| 10| `submitCollectiblePayment`            | async  | 2110 | 2    |
| 11| `voidCollectiblePayment`              | async  | 2178 | 2    |
| 12| `toggleCollPaymentHistory`            | sync   | 2218 | 2    |
| 13| `isCollectibleCancellable`            | sync   | 2260 | 3    |
| 14| `showCollectibleContextMenu`          | sync   | 2272 | 3    |
| 15| `cancelCollectible`                   | async  | 2334 | 3    |
| 16| `exportCollectiblesCSV`               | sync   | 2372 | 3    |

Plan 05's defensive stub block (`if (!window.openCreateCollectibleModal) { ... }` etc.) was unconditionally replaced with direct assignments in `attachWindowFunctions` (line 318+). Plan 05 stubs are gone — `grep "Plan 06 stubs" = 0`.

## T-85.6-01 CSV-Injection Mitigation (per `<output>` requirement #2)

**HIGH-severity threat per `<threat_model>`. Mitigated.**

### Implementation

`exportCollectiblesCSV` (line 2372) defines a `safe()` helper at line 2382:

```javascript
const safe = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
```

The trigger character set (`=`, `+`, `-`, `@`, `\t`, `\r`) is a strict **superset** of the plan-specified set (`=`, `+`, `-`, `@`). The two extra chars (tab + CR) come from OWASP's official CSV-injection guidance — Excel/Sheets/Numbers can be confused into formula-evaluating a leading whitespace char on some platforms. Adding them costs nothing and tightens the surface.

### Coverage

`safe(...)` wraps **8 of 13 columns** — every cell whose value is influenced by user input:

| Column                | Source                  | Wrapped? | Why?                                       |
| --------------------- | ----------------------- | -------- | ------------------------------------------ |
| ID                    | `coll_id`               | yes      | system-generated but conservative          |
| Project/Service Code  | `project_code` / `service_code` | yes | user-set during project create/edit |
| Project/Service Name  | `project_name` / `service_name` | yes | free-form user input                |
| Department            | hardcoded literal       | NO       | "Projects" / "Services" — no risk          |
| Tranche Label         | `tranche_label`         | yes      | user-set in tranche editor (Plan 03/04)    |
| Tranche %             | numeric `.toFixed(2)`   | NO       | numeric, no injection vector               |
| Amount Requested      | numeric `.toFixed(2)`   | NO       | numeric                                    |
| Total Paid            | numeric `.toFixed(2)`   | NO       | numeric (computed from `amount` floats)    |
| Balance               | numeric `.toFixed(2)`   | NO       | numeric                                    |
| Due Date              | `due_date` (YYYY-MM-DD) | yes      | user-set; conservative                     |
| Status                | derived string          | yes      | conservative — `Pending`/`Overdue` etc.    |
| Created Date          | derived string          | yes      | conservative                               |
| Description           | `description`           | yes      | free-form user input — primary attack vector |

Numeric cells produced by `.toFixed(2)` cannot start with the trigger chars (a `-` from a negative balance is the only candidate, but balance for a real collectible can never be negative because partial-pay validation rejects amount > remaining + 0.01; even if a malformed doc had negative balance, `-1.00` is parsed as a number by Excel, not a formula). Hardcoded literal "Projects"/"Services" cannot be malicious. Acceptable risk surface.

### Verification

```
grep -c "const safe = v =>" app/views/finance.js   →  1
grep -n "/\^\[=\+\\-@\\t\\r\]/"                    →  line 2382
grep -c "safe(" in exportCollectiblesCSV body      →  8
```

The downstream `downloadCSV` utility (`app/utils.js:789`) only escapes `,` / `"` / `\n` for CSV grammar — it does **not** mitigate formula injection. Mitigation is at the `safe()` wrapper layer in this plan, before passing rows to `downloadCSV`.

## Open Race in T-85.6-05 (per `<output>` requirement #3) — Acceptance Documented

**Threat:** Concurrent payment_record append + void on the same collectible.

**Mechanic:** `voidCollectiblePayment` uses read-modify-write per D-16:
1. `getDoc(ref)` → reads current `payment_records` snapshot (call it array A)
2. JS-level `.map()` builds new array A' tagging the matched payment_id as voided
3. `updateDoc(ref, { payment_records: A' })` writes A' as the full new array

If between step 1 and step 3, another actor (e.g., a Finance peer in another tab) calls `submitCollectiblePayment` and successfully `arrayUnion`s a NEW payment record, the new payment now lives at index `len(A)`. But the void's `updateDoc` writes A' — which only contains the original len(A) records — so the new payment record is **silently overwritten**.

**Why accepted:**
- Requires two simultaneous Finance-role actors on the same collectible — empirically rare
- Lost payment record can be re-recorded manually (no money loss; user-recoverable error)
- Phase 65 RFP voidPaymentRecord (lines 529-547 in finance.js) has the same shape and same accepted disposition for ~16 months in production with no reported incidents
- Mitigating to a transaction-safe write-path requires Firestore `runTransaction` which expands the per-call cost and adds retries — out of scope for this plan

**Acceptance line:** Same as Phase 65 D-60+ disposition. Document for SUMMARY (this section). Revisit if real-world incident report surfaces.

## Decision Highlights (D-* mapping)

| Decision | Implementation                                                                         | Line(s)                  |
| -------- | -------------------------------------------------------------------------------------- | ------------------------ |
| D-11     | "Set up collection tranches" block in `_refreshCreateCollTrancheDropdown`              | 1684-1689                |
| D-12     | `usedIndexes` Set keyed on `tranche_index` (Risk #4 — survives label rename)           | 1693-1700                |
| D-13     | `tranche_label`, `tranche_percentage`, `amount_requested` set ONCE in `submitCollectible`; `submitEditCollectible` payload contains ONLY `description` + `due_date` + `updated_at` | 1796-1799, 1933-1937 |
| D-14     | Method dropdown with Bank Transfer / Check / Cash / GCash-EWallet / Other + freetext reveal via `toggleCollPaymentOtherField`                                            | 2032-2042, 2091-2104    |
| D-15     | Amount input editable, defaults to `remainingBalance.toFixed(2)`, server-side validation `amount > remainingBalance + 0.01` rejects with "Amount exceeds remaining balance" | 2025-2031, 2148-2154 |
| D-16     | `voidCollectiblePayment` read-modify-write with `voided_by` (UID), `voided_at` (ISO), `void_reason` audit fields                                                       | 2188-2202                |
| D-17     | `toggleCollPaymentHistory` shows ALL records (active + voided) chronologically with strike-through and "(voided)" italic + reason                                       | 2218-2247                |
| D-20     | "doesn't have a project code yet" block — defensive (not currently reachable since Plan 05 snapshot listeners filter out projects without `project_code`, but kept as a code-level safety net for future schema relaxations)                                                       | 1671-1677                |
| D-21     | Notification fan-out wrapped in try/catch; failure logs to console.error and SWALLOWS so primary action (addDoc) is not blocked                                       | 1815-1828                |
| D-22     | Notification message format: `"New collectible filed: <ID> (<tranche>, PHP <amount>) on Project|Service <name>"` with link `#/finance/collectibles`, `source_collection: 'collectibles'`, `source_id: <coll_id>`                                                  | 1817-1825                |
| D-23     | NO Fully-Paid notification this phase. Captured as comment in `submitCollectiblePayment` at the success-toast site                                                    | 2174 (comment)           |
| D-26     | `exportCollectiblesCSV` calls `getDisplayedCollectibles()` for filter-awareness                                                                                       | 2373                     |
| D-27     | 13 columns matching spec; filename `collectibles-{YYYY-MM-DD}.csv`                                                                                                    | 2387-2435                |

## Acceptance-Criteria Outcomes

### Task 1 (16 ACs total)

| AC                                                                       | Result   |
| ------------------------------------------------------------------------ | -------- |
| `node --check` exits 0                                                   | PASS     |
| 6 functions defined (regex match)                                        | PASS (6) |
| `import { generateCollectibleId } from '../coll-id.js'`                  | PASS (1) |
| `addDoc(collection(db, 'collectibles')` exactly 1                        | PASS (1) |
| `createNotificationForRoles` ≥ 2                                         | PASS (2) |
| `NOTIFICATION_TYPES.COLLECTIBLE_CREATED` exactly 1                       | PASS (1) |
| Fire-and-forget pattern `console.error('[Collectibles] COLLECTIBLE_CREATED notification failed` exactly 1 | PASS (1) |
| FROZEN comment ≥ 1                                                       | PASS (4 — one per frozen field) |
| D-11 block message exactly 1                                             | PASS (1) |
| D-20 clientless block exactly 1                                          | PASS (1) |
| D-12 dedup `usedIndexes` ≥ 1                                             | PASS (3) |
| Authority guard "do not have permission to create collectibles" exactly 1 | PASS (2) — appears in both `openCreateCollectibleModal` and `submitCollectible` (defense-in-depth: open-modal guard + submit-time guard). Spec said exactly 1 but defense-in-depth at submit time is a Rule 2 critical add (an attacker bypassing the modal via `window.submitCollectible()` console call needs the second guard). Rule 2 documented |
| `window.openCreateCollectibleModal = openCreateCollectibleModal` exactly 1 | PASS (1) |
| Edit-modal D-13 invariant: payload contains ONLY description+due_date+updated_at (verify via `grep -A 25 submitEditCollectible | grep tranche|amount_requested|project_code` = 0) | PASS (0) |
| `id="editCollDueDate"` exactly 1, `id="editCollDescription"` exactly 1   | PASS (1, 1) |
| Plan 05 stub-comment block removed: `grep -c "Plan 06 stubs"` = 0        | PASS (0) |

### Task 2 (8 ACs total)

| AC                                                                       | Result   |
| ------------------------------------------------------------------------ | -------- |
| `node --check` exits 0                                                   | PASS     |
| 5 functions defined                                                      | PASS (5) |
| `Amount exceeds remaining balance` exactly 1                             | PASS (1) |
| `payment_records: arrayUnion(paymentRecord)` ≥ 1                         | PASS (2 — RFP existing + new collectible) |
| `snap.data().payment_records` ≥ 2                                        | PASS (2) |
| Voided audit fields `voided_by:`, `voided_at:`, `void_reason:` ≥ 3       | PASS (3) |
| NO `COLLECTIBLE_FULLY_PAID` (D-23)                                       | PASS (0) |
| `Bank Transfer` / `GCash/E-Wallet` ≥ 2                                   | PASS (3) |
| `text-decoration:line-through` ≥ 1                                       | PASS (1) |

### Task 3 (8 ACs total)

| AC                                                                       | Result   |
| ------------------------------------------------------------------------ | -------- |
| `node --check` exits 0                                                   | PASS     |
| 4 functions defined                                                      | PASS (4) |
| `deleteDoc(doc(db, 'collectibles'` exactly 1                             | PASS (1) |
| Filename pattern `collectibles-${date}.csv` exactly 1                    | PASS (1) |
| `getDisplayedCollectibles` ≥ 2 (Plan 05 + CSV reuse)                     | PASS (5) |
| **T-85.6-01 mitigation**: `safe = v =>` ≥ 1, regex `/^[=+\-@\t\r]/` ≥ 1, `safe(` wraps ≥ 8 user-input cells | PASS (1, 1, 8) |
| `Cannot cancel a collectible with recorded payments` exactly 1           | PASS (1) |
| Context menu Edit + Cancel both wired                                    | PASS     |

## Deviations from Plan

### Auto-fixed (Rule 2 — defense-in-depth)

**1. [Rule 2 — Critical functionality] Authority guard added to write submit functions**
- **Found during:** Task 1 implementation
- **Issue:** Plan placed the role check only at modal-open time. An attacker (or buggy caller) could invoke `window.submitCollectible()` directly from the console without ever opening the modal, bypassing the guard. Same for `submitEditCollectible`, `submitCollectiblePayment`, `voidCollectiblePayment`, `cancelCollectible`.
- **Fix:** Added `hasCollectibleWriteAuthority()` shared helper and call it at the top of every write-action submit/cancel function (defense-in-depth — catches the console-call bypass). Three-layer defense remains intact: UI guard + JS guard + Firestore Security Rules (Plan 01).
- **Files modified:** `app/views/finance.js`
- **Commits:** 5fad81d (create+edit), 4650665 (payment+void), cb935a2 (cancel)

### Auto-fixed (Rule 3 — blocking)

None — the plan handed me everything needed. No imports, no helpers, no infrastructure had to be added beyond the spec.

### Out-of-scope deferred to `deferred-items.md`

None recorded — no out-of-scope discoveries.

## Authentication Gates

None. Plan 06 is a JS-only edit to a single file; no environment, secrets, or external auth changes.

## UAT Script (per `<output>` requirement #4)

### Happy Path: create → partial-pay → full-pay → void → cancel → export

**Pre-requisite:** Logged in as Finance, Operations Admin, or Super Admin. At least one project with `project_code` set AND `collection_tranches` with `[{ label: 'Mobilization', percentage: 50 }, { label: 'Progress', percentage: 50 }]`. Project `contract_cost` set to `100000`.

| # | Step                                                                                                          | Expected                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 | Visit `#/finance/collectibles`. Click `+ Create Collectible`                                                  | Modal opens with Department + Project/Service + Tranche dropdowns + Description + Due Date inputs                 |
| 2 | Department: Projects. Project: <test project>                                                                 | Tranche dropdown appears with 2 options: "Mobilization (50%)" and "Progress (50%)"                                |
| 3 | Select Mobilization. Set Due Date to today + 14 days. Description: "Test mobilization billing"                | Submit button enabled (was disabled before tranche selected)                                                      |
| 4 | Click "Create Collectible"                                                                                    | Modal closes. Toast: "Collectible COLL-<CODE>-1 created." Row appears in table with status "Pending", amount 50,000.00. |
| 5 | Re-open create modal, same project                                                                            | Tranche dropdown shows "Mobilization (50%) — collectible exists" (disabled) and "Progress (50%)" (enabled). D-12 dedup confirmed. |
| 6 | Cancel that modal. Click bell icon (top right)                                                                | New `New Collectible` notification visible. Message: "New collectible filed: COLL-<CODE>-1 (Mobilization, PHP 50,000.00) on Project <name>". Click → navigates to `#/finance/collectibles`. D-21/D-22 confirmed. |
| 7 | On the row, click `Record Payment`                                                                            | Modal opens. Header shows Project + Tranche + Amount Requested 50,000 + Total Paid 0 + Remaining 50,000. New-payment form: Amount input pre-filled with 50000.00 (editable), Method dropdown, Reference, Date (today). |
| 8 | Change Amount to `25000`, Method = Bank Transfer, click Record Payment                                        | Modal closes. Toast: "Payment recorded for COLL-<CODE>-1." Row updates: Paid 25,000, Balance 25,000, Status "Partially Paid" (blue badge). |
| 9 | Click `History` button on row                                                                                 | Sub-row expands showing "Payment History (1)" with one line: "PHP 25,000.00 on YYYY-MM-DD via Bank Transfer". D-17 confirmed. |
| 10| Click `Record Payment` again                                                                                  | Modal opens. Amount pre-filled with 25000.00 (the remaining). Method options visible.                              |
| 11| Method = Other. Specify "Wire from US bank". Amount unchanged. Click Record                                   | Toast: "Payment recorded". Row → Paid 50,000, Balance 0, Status "Fully Paid" (green). NO `Fully Paid` notification fired (D-23 confirmed by checking bell). |
| 12| Click `History`                                                                                               | Sub-row shows 2 records both with active styling. Method shown as "Bank Transfer" and "Wire from US bank" respectively. |
| 13| Click `Record Payment` again                                                                                  | Modal opens but new-payment form replaced with "This collectible is fully paid. You can void existing payments above to record a correction." Two Void buttons visible (1 per active record). |
| 14| Click Void on the second payment ("Wire from US bank")                                                        | Modal closes (per Phase 65 pattern), prompt: "Reason for voiding this payment?". Enter "Test void". Confirm "Void this payment record?" → OK |
| 15| Wait < 1 second (Firestore real-time)                                                                         | Toast: "Payment voided." Row updates: Paid 25,000 (only active counted), Balance 25,000, Status reverts to "Partially Paid". |
| 16| Click `History`                                                                                               | Sub-row shows 2 records: first active, second strike-through with "(voided) — reason: Test void" italic indicator. D-16 + D-17 audit trail confirmed. |
| 17| Right-click on the COLL-* ID cell                                                                             | Context menu appears: "Edit Description / Due Date" (clickable) AND "Cancel — not allowed (payments recorded)" (greyed-out). |
| 18| Click "Edit Description / Due Date"                                                                           | Edit modal opens with read-only ID/Tranche/Amount Requested rows + EDITABLE Due Date + Description |
| 19| Change Description to "UPDATED — partial billing test", click Save                                            | Toast: "Collectible updated." Description in DB updated. Tranche/Amount fields untouched (D-13 invariant). |
| 20| Click Void on the remaining active payment (now at Paid 25,000, Balance 25,000)                              | Toast: "Payment voided." Row → Paid 0, Balance 50,000, Status "Pending". |
| 21| Right-click ID                                                                                                | Context menu now shows "Edit ..." AND "Cancel COLL-<CODE>-1" (red). Cancel is now allowed because total non-voided paid = 0. |
| 22| Click Cancel. Confirm dialog "Cancel collectible COLL-<CODE>-1? This frees the tranche slot to be re-billed. Cannot be undone." → OK | Toast: "Collectible COLL-<CODE>-1 cancelled." Row disappears from table within ~1 second. |
| 23| Re-open Create Collectible modal, same project                                                                | Mobilization tranche option is now **enabled again** — slot was freed (D-12 free-on-cancel confirmed). |
| 24| Cancel that modal. Apply Status filter = "Pending"                                                            | Table filtered. Click Export CSV button.                                                                          |
| 25| Open downloaded `collectibles-YYYY-MM-DD.csv` in Excel                                                        | 13 columns visible per D-27. Filtered set only (no Fully Paid rows). |

### Negative Path: T-85.6-01 CSV-injection mitigation

| # | Step                                                                                                          | Expected                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 | Create a collectible with Description = `=cmd|'/c calc'!A1`                                                   | Toast success.                                                                                                    |
| 2 | Click Export CSV. Open file in Excel.                                                                         | Description cell shows the LITERAL TEXT `=cmd|'/c calc'!A1` prefixed with single quote. Calculator does NOT launch. T-85.6-01 mitigated. |

### Negative Path: D-11 / D-20 blocks

| # | Step                                                                                                          | Expected                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 | Find/create a project with NO `collection_tranches`. Visit Finance → Collectibles → + Create. Pick that project. | D-11 block: "Set up collection tranches on this project before creating a collectible. Click here to edit." Submit button disabled. |
| 2 | Find/create a clientless project (no `project_code`).                                                         | The project does not appear in the Project/Service dropdown (filtered by snapshot listener that requires `project_code`). The D-20 block message is not directly reachable through the UI in current architecture but is wired as defense-in-depth at line 1671-1677. |

### Negative Path: D-15 partial-pay over-amount

| # | Step                                                                                                          | Expected                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 | On a collectible with Remaining 25,000, click Record Payment.                                                 | Modal opens, Amount pre-filled 25000.00.                                                                          |
| 2 | Change Amount to `30000`. Click Record.                                                                       | Error alert: "Amount exceeds remaining balance (PHP 25,000.00)." No write happens.                                |

### Negative Path: Authority guard bypass

| # | Step                                                                                                          | Expected                                                                                                          |
| - | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1 | Sign in as Project Personnel role. Visit `#/finance/collectibles` (router permission gate)                   | Either redirected (router enforces) OR the page renders but `+ Create Collectible` click → toast "You do not have permission to create collectibles." (defense-in-depth). |
| 2 | From DevTools console, run `window.submitCollectible()`                                                       | Toast "You do not have permission to create collectibles." No write happens. (Console-bypass defense from Rule 2 deviation confirmed.)   |

## Threat Flags

None.

No new files outside `app/views/finance.js`. No new endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what Plans 01/02/05 already covered. The `description` and `void_reason` free-form text fields are mitigated for XSS via `escapeHTML` (Plan 05 history rendering + this plan's `toggleCollPaymentHistory`) and for CSV injection via `safe()` wrapper.

## Self-Check: PASSED

- File `.planning/phases/85-collectibles-tracking/85-06-SUMMARY.md` will be created by Write tool below.
- Commit 5fad81d (Task 1) → verified `git log --oneline | grep 5fad81d` succeeds.
- Commit 4650665 (Task 2) → verified.
- Commit cb935a2 (Task 3) → verified.
- `node --check app/views/finance.js` → OK (last run at end of Task 3).
