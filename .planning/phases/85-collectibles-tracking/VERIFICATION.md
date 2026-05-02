---
phase: 85-collectibles-tracking
verified: 2026-05-02T15:30:00Z
status: human_needed
score: 9/9 must-haves verified (code-side)
overrides_applied: 0
re_verification: null
human_verification:
  - test: "Deploy firestore.rules to Firebase Console BEFORE first runtime write to collectibles"
    expected: "Console shows the new collectibles match block live; first addDoc(collectibles) succeeds for super_admin / operations_admin / finance and fails for non-allowlisted roles"
    why_human: "Firebase Console deploy is a manual step (no Cloud Functions, no CI deploy of rules). Per D-24, rules MUST be live before any production write — until then UAT will silently fail with 'Missing or insufficient permissions'. This is the only true blocker for runtime UAT and the prompt explicitly flagged it as a non-code-side blocker."
  - test: "Open Add Project form, set tranches to 50/50, save → reopen Edit → tranche-builder pre-populated"
    expected: "Two rows present, sum badge green, project doc has collection_tranches: [{label,percentage}, ...] in Firestore"
    why_human: "Tranche-builder DOM behaviour (running-total badge color flip green/red, add/remove row, disabled state on the last remove) is visual and DOM-event-driven; can't be exercised without a browser"
  - test: "Edit project tranches AFTER a collectible exists for that project"
    expected: "confirm() dialog: 'This project has 1 existing collectible(s). Existing collectibles keep their original tranche label and amount — only future collectibles will use the new tranches. Continue?'"
    why_human: "D-25 confirmation modal fires through window.confirm() — interactive only; needs a project with at least one collectible already in Firestore"
  - test: "On Finance Collectibles tab, click '+ Create Collectible' and pick a project with no collection_tranches"
    expected: "D-11 block message: 'Set up collection tranches on this project before creating a collectible.' with link to project edit; submit button disabled"
    why_human: "D-11 block UI is rendered via a runtime branch in _refreshCreateCollTrancheDropdown; visual confirmation needed"
  - test: "Pick a project with project_code === '' (clientless per Phase 78)"
    expected: "D-20 block message: 'This project doesn't have a project code yet.' submit button disabled"
    why_human: "D-20 block UI requires a clientless test project; runtime UAT only"
  - test: "Create collectible against a project with all tranches already used by existing collectibles"
    expected: "D-12 dedup: every tranche option shown disabled with ' — collectible exists' suffix; submit disabled with 'All tranches already have collectibles' note"
    why_human: "D-12 dedup hides options based on collectiblesData snapshot state; runtime UAT only"
  - test: "Create a collectible end-to-end → check Finance bell"
    expected: "COLLECTIBLE_CREATED notification appears in Finance role users' bell within ~1s; message format: 'New collectible filed: COLL-{CODE}-{n} ({tranche}, PHP {amount}) on {Project|Service} {name}'; deep link to #/finance/collectibles"
    why_human: "Notification fan-out is real-time onSnapshot; only verifiable in browser with multiple users / role switch"
  - test: "Disable network briefly, then submit collectible — addDoc should fail, but submitCollectible's catch should still fire showError WITHOUT crashing the modal"
    expected: "Modal stays open, error alert visible, submit button re-enabled (try/catch correct)"
    why_human: "Failure path testing requires runtime"
  - test: "Record full payment → row flips to Fully Paid; record partial payment → Partially Paid; void payment → status reverts"
    expected: "Status badge color and text update without page reload (auto-derived); voided records visible in History sub-row with strike-through"
    why_human: "deriveCollectibleStatus runs client-side at render; needs runtime onSnapshot loop"
  - test: "Right-click row with zero non-voided payments → menu shows 'Edit' + 'Cancel COLL-...'; right-click row with payments → 'Cancel — not allowed (payments recorded)'"
    expected: "isCollectibleCancellable gates the Cancel option correctly; clicking Cancel deletes the doc"
    why_human: "Right-click context menu is mouse-event-driven; runtime only"
  - test: "Click Export CSV with active filters (e.g. Status=Pending) → download a 13-column CSV containing only matching rows; filename collectibles-YYYY-MM-DD.csv"
    expected: "CSV opens in Excel/Sheets without formula execution even if a description starts with '='; safe() helper prefixes with single quote"
    why_human: "T-85.6-01 mitigation requires opening the actual file in a spreadsheet to confirm formula not auto-executed"
  - test: "Open Financial Breakdown modal from project-detail → click Collectibles tab"
    expected: "4 tabs visible (Category / Transport / Payables / Collectibles); Collectibles tab shows the project's collectibles list with status priority sort; clicking a row expands payment history"
    why_human: "Modal behavior + tab switch is DOM-driven"
  - test: "On project-detail with 0 collectibles → Financial Summary shows 'Collected: PHP 0.00' (green) and 'Remaining Collectible: PHP 0.00' (green); after creating + partial-paying a collectible, Refresh updates the cells"
    expected: "Always-render zero state per Phase 75; refresh path correctly aggregates"
    why_human: "Phase 75 always-render only verifiable visually; refresh button is runtime"
  - test: "Service-detail parity (D-01) — repeat the project-detail tests on service-detail.js"
    expected: "Same Collected / Remaining Collectible cells render; Plan 08 modal Collectibles tab shows service-side collectibles using service_code query"
    why_human: "D-01 parity verifiable only by walking through both project and service flows"
---

# Phase 85: Collectibles Tracking — Verification Report

**Phase Goal:** Operations Admin / Finance can manually track money owed by clients on a project (and service) — create, edit, delete, record partial/full payments, and view auto-derived status — independent of any PM auto-trigger.

**Verified:** 2026-05-02
**Status:** human_needed (code-side fully VERIFIED; 13 runtime UAT items + 1 manual Firebase Console deploy await human)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Roadmap Success Criteria (canonical contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operations Admin / Finance user can create, edit, and delete a collectible against a project with amount, due date, description | VERIFIED (code) | submitCollectible writes Pattern 21 doc shape with 3-role authority guard at finance.js:1547,1735,1848,1917; submitEditCollectible payload is exactly `{description, due_date, updated_at}` per D-13; cancelCollectible deletes after isCollectibleCancellable check (zero non-voided payments) |
| 2 | User can record one or more payments (partial or full) against a collectible | VERIFIED (code) | submitCollectiblePayment at finance.js:2104+ uses arrayUnion(paymentRecord); guards `amount > remainingBalance + 0.01` (D-15 partial OK, overshoot blocked); 5-method dropdown + Other reveal at toggleCollPaymentOtherField |
| 3 | System auto-derives status (Pending / Partially Paid / Fully Paid / Overdue) from payments + due_date — never manually set | VERIFIED (code) | deriveCollectibleStatus at finance.js:~50 (priority Fully Paid > Overdue > Partially Paid > Pending); status NEVER appears in collDoc payload (line 1787-1807); sole `status:` keys on collectible-related code are payment_records' `status: 'active'` / `'voided'` |
| 4 | User can view all collectibles in a Finance sub-tab (filter by project / status / due-date), AND view per-project collectibles on the project detail surface | VERIFIED (code) | Finance Collectibles 5th sub-tab pill at finance.js href="#/finance/collectibles"; flat table with 10 columns; 5 independent filters (project / status / dept / due-from / due-to); 15-per-page pagination; project-detail and service-detail Financial Summary cells; expense-modal 4th Collectibles tab |
| 5 | User can export collectibles list to CSV | VERIFIED (code) | exportCollectiblesCSV at finance.js:2372 produces 13-column CSV via filter-aware getDisplayedCollectibles(); filename `collectibles-YYYY-MM-DD.csv`; T-85.6-01 mitigation present (regex `/^[=+\-@\t\r]/`) |

**Score:** 5/5 roadmap success criteria VERIFIED at code level

### Per-Requirement Coverage (COLL-01..09)

| Req | Plan | Status | Evidence |
|-----|------|--------|----------|
| COLL-01 | 06 | VERIFIED | submitCollectible @ finance.js:1742 writes denorm doc; D-11/D-12/D-13/D-20 blocks all wired |
| COLL-02 | 06 | VERIFIED | submitEditCollectible @ finance.js:1916; payload contains EXACTLY `description, due_date, updated_at` (D-13 frozen invariant verified by code read) |
| COLL-03 | 06 | VERIFIED | cancelCollectible @ finance.js:2335 with isCollectibleCancellable guard + confirm + deleteDoc; right-click context menu only shows Cancel when zero non-voided payments |
| COLL-04 | 05 | VERIFIED | initCollectiblesTab @ finance.js:1465 with 3 onSnapshot listeners (collectibles + projects + services); 5 filter state vars; 15/page pagination; 10-column flat table |
| COLL-05 | 06 | VERIFIED | submitCollectiblePayment @ finance.js:2104; partial-pay D-15 (`amount <= remainingBalance + 0.01`); voidCollectiblePayment D-16 read-modify-write with audit fields |
| COLL-06 | 05+06 | VERIFIED | deriveCollectibleStatus pure function; status NOT in collDoc payload; called from getDisplayedCollectibles (sort), renderCollectiblesTable (badge), exportCollectiblesCSV (CSV column), expense-modal (sort+badge) |
| COLL-07 | 07+08 | VERIFIED | project-detail.js + service-detail.js Financial Summary cells (Collected + Remaining Collectible) always-rendered; expense-modal 4th tab with sort+history |
| COLL-08 | 06 | VERIFIED | exportCollectiblesCSV with 13 columns + safe() helper (T-85.6-01) + filter-aware via getDisplayedCollectibles |
| COLL-09 | 01+06 | VERIFIED | firestore.rules:467-478 collectibles match block (read: isActiveUser; CRUD: super_admin/operations_admin/finance); collDoc shape includes coll_id, department, project_code/service_code, tranche fields, amount_requested, payment_records, created_by_user_id, date_created |

**All 9 COLL requirements ship in code.**

---

## Critical Decision Spot-Checks

### D-11 (No-tranches block)
**VERIFIED.** finance.js:1695 `<div ...>Set up collection tranches on this ${subjectWord} before creating a collectible.</div>` rendered with disabled submit button. Triggered when `Array.isArray(meta.collection_tranches) && meta.collection_tranches.length === 0`. UAT runtime needed to confirm DOM rendering — flagged for human verification.

### D-12 (Strict 1:1 — one collectible per tranche)
**VERIFIED.** finance.js:1701 `usedIndexes = new Set(...)` filters by `c.department === dept && code matches`, mapped to `c.tranche_index`. Each tranche option in the dropdown receives `disabled` + ` — collectible exists` suffix when its index is in the set. `firstAvailable < 0` → all-used path disables submit + shows red helper text. Uses tranche_index (not label) per Risk #4 in PATTERNS.md.

### D-13 (Frozen denorm fields)
**VERIFIED.** finance.js:1797-1799 explicit `// FROZEN at creation per D-13` comments. submitCollectible captures `tranche.label`, `parseFloat(tranche.percentage)`, and `(tranchePct/100) * contractCost` at addDoc time. submitEditCollectible payload contains ONLY `description, due_date, updated_at` — NO tranche fields, NO amount_requested, NO project_code (verified by reading lines 1916-1944).

### D-19 (Status NOT persisted)
**VERIFIED.** Searched `grep "status:" app/views/finance.js`: zero hits where a collectible doc includes a `status` field. The only `status:` keys in collectible-related code are payment_record sub-objects (`status: 'active'` on create, `status: 'voided'` on void) and unrelated PR/PO statuses elsewhere. `deriveCollectibleStatus` is the sole producer; called only at render time.

### D-20 (Clientless project block)
**VERIFIED.** finance.js:1686 `<div ...>This project doesn't have a project code yet. Assign a client to issue the code, then return to create collectibles.</div>`. Triggered when `!code` after dept/project pick. Block disables submit button. Pre-condition enforced by `generateCollectibleId` (throws if scopeCode is empty) — defense in depth.

### D-21 (Notification fan-out — try/catch fire-and-forget)
**VERIFIED.** finance.js:1813-1826 — `await createNotificationForRoles({roles:['finance'], ...})` wrapped in try/catch; catch logs `'[Collectibles] COLLECTIBLE_CREATED notification failed:'` and SWALLOWS. The primary `await addDoc(collection(db, 'collectibles'), collDoc)` runs at line 1809 BEFORE the notification block, so a notification failure cannot rollback the collectible. This matches Phase 84 D-03 fire-and-forget.

### D-22 (Notification content)
**VERIFIED.** finance.js:1816-1823 — message: `New collectible filed: ${collId} (${tranche.label}, PHP ${formatCurrency(amountRequested)}) on ${labelType} ${targetName}` (matches D-22 spec). link: `#/finance/collectibles`. source_collection: `'collectibles'`. source_id: `collId`. roles: `['finance']`. type: `NOTIFICATION_TYPES.COLLECTIBLE_CREATED`.

### D-24 (Security rules same-commit invariant)
**VERIFIED.** Plan 01 commit `090bc5c` ships `firestore.rules` collectibles block + `app/notifications.js` enum together. No JS write-to-collectibles in this commit (Plan 05 read-only listener is in commit `1ab7b46`; Plan 06 first write is in `5fad81d`, much later). Block ordering rfps→collectibles→notifications confirmed via `grep -n "match /" firestore.rules`. Invariant satisfied.

### T-85.6-01 (CSV injection mitigation)
**VERIFIED.** finance.js:2382 `const safe = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;` — and EXTENDED beyond plan spec with `\t` and `\r` per OWASP guidance. All 9 string cells wrapped: coll_id, code, name, tranche_label, due_date, status, createdDate, description (numeric cells unwrapped — acceptable). Department string `'Projects'/'Services'` is hardcoded literal — not user-controlled, no wrap needed.

---

## Cross-Plan Integration

### Create flow uses shared coll-id.js
**VERIFIED.** finance.js imports `generateCollectibleId` from `../coll-id.js`; submitCollectible calls `generateCollectibleId(code, dept)` at line 1785. coll-id.js confirms NO `generateSequentialId` reference (D-20).

### Tranche-builder shared module used by 3 callers (projects, services, finance)
**VERIFIED.**
- `app/views/projects.js`: imports + `renderTrancheBuilder([], 'projectForm')` + readTranchesFromDOM('projectForm') x2
- `app/views/services.js`: imports + `renderTrancheBuilder([], 'serviceForm')` + readTranchesFromDOM('serviceForm') x2
- `app/views/finance.js`: imports `generateCollectibleId` (note — finance.js does NOT import tranche-builder; it consumes already-persisted tranches from projectsForCollMap/servicesForCollMap built by the projects/services onSnapshot listeners). This matches the plan: tranche-builder is for PERSISTING tranches; the Create-Collectible modal READS them via the snapshots. Intentional separation.

### project-detail / service-detail aggregation
**VERIFIED.** project-detail.js:828-847 and service-detail.js:948-967 — aggregation uses real Firestore queries (`where('project_code'/'service_code', '==', X)`), iterates `payment_records` filtering `r.status !== 'voided'`, sums `parseFloat(r.amount || 0)`. Cells render `currentCollectibles.totalCollected` and `currentCollectibles.remainingCollectible`, color red if remaining > 0 else green. Always-rendered (no zero-state hide).

### expense-modal Collectibles tab
**VERIFIED.** expense-modal.js:90-115 fetches collectibles via 1 query (service mode: by service_code; project mode: 2 queries — first to look up project_code from name, then collectibles by project_code). Inner deriveCollectibleStatus duplicated to avoid circular import (Phase 71 pattern). 4th tab button + div + switcher all wired. window._toggleEMCollHistory toggles per-row history sub-row.

### Finance Collectibles tab listeners
**VERIFIED.** initCollectiblesTab at finance.js:1465 attaches 3 onSnapshot subscriptions (collectibles, projects, services). All 3 are pushed to the shared `listeners[]` array, ensuring destroy() unsubscribes them via the existing `listeners.forEach(unsub => unsub?.())` cleanup.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `firestore.rules` | collectibles match block (read: isActiveUser; CRUD: super_admin/operations_admin/finance) | VERIFIED | Lines 467-478; ordering rfps→collectibles→notifications correct |
| `app/notifications.js` | COLLECTIBLE_CREATED in NOTIFICATION_TYPES + TYPE_META row | VERIFIED | Line 49 enum entry; line 88 TYPE_META `{label:'New Collectible', icon:'$', color:'#059669'}` |
| `app/tranche-builder.js` | 5 exports: renderTrancheBuilder, readTranchesFromDOM, recalculateTranches, addTranche, removeTranche | VERIFIED | 154 lines; all 5 `^export function` matches; scopeKey-parameterized; no `poId` references |
| `app/coll-id.js` | generateCollectibleId(scopeCode, dept) — project-scoped, no padding, no generateSequentialId | VERIFIED | 61 lines; uses `where(scopeField, '==', scopeCode)` + `lastIndexOf('-')`; throws on empty scopeCode (D-20 defense) |
| `app/views/projects.js` | tranche-builder import + collection_tranches editor + sum=100 validation + D-25 confirmation | VERIFIED | All 8 acceptance markers match (10x collection_tranches, 2x sum-100 toast, 2x empty-label toast, 1x existing-collectibles confirm, 1x where-project_code query, 3x renderTrancheBuilder) |
| `app/views/services.js` | parity with projects.js (D-01) | VERIFIED | All 8 acceptance markers match (10x collection_tranches, 2x sum-100, 2x empty-label, 1x existing-coll, 1x where-service_code, 3x renderTrancheBuilder) |
| `app/views/finance.js` | 5th sub-tab + read-side + write-side + 15 functions + destroy cleanup | VERIFIED | 5916 lines total; all 8 read-side functions (deriveCollectibleStatus, renderCollectiblesTable, filterCollectiblesTable, renderCollectiblesPagination, changeCollectiblesPage, getDisplayedCollectibles, populateCollProjectFilter, initCollectiblesTab); all 15 write-side functions; 16 window deletes in destroy; centralized hasCollectibleWriteAuthority used at 10 call sites |
| `app/views/project-detail.js` | currentCollectibles state + 2 cells + aggregation | VERIFIED | 6 currentCollectibles refs; 1 `>Collected<`; 1 `>Remaining Collectible<`; 1 `collection(db, 'collectibles')` query; aggregation in refreshExpense at line 828-847 |
| `app/views/service-detail.js` | currentServiceCollectibles state + 2 cells + aggregation | VERIFIED | 6 currentServiceCollectibles refs; 1 `>Collected<`; 1 `>Remaining Collectible<`; 1 collectibles query; aggregation at lines 948-967 |
| `app/expense-modal.js` | 4th Collectibles tab | VERIFIED | 1x `id="expBreakdownCollectiblesTab"`; 1x `data-tab="collectibles"`; 4x deriveCollectibleStatus refs; 8x collectiblesForTab refs; switcher extended at line 854; 2x window._toggleEMCollHistory; 1x empty-state copy |

All 10 artifacts pass Levels 1-3 (exists, substantive, wired). Level 4 data-flow trace performed on the 4 dynamic-render artifacts (project-detail, service-detail, finance, expense-modal) — all show real Firestore queries feeding real DOM, not static returns.

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| firestore.rules | collectibles collection | `match /collectibles/{collId}` block | WIRED | Three-role write allowlist + isActiveUser read |
| app/notifications.js | TYPE_META consumers | Enum + metadata row | WIRED | Both NOTIFICATION_TYPES.COLLECTIBLE_CREATED and TYPE_META.COLLECTIBLE_CREATED present |
| app/tranche-builder.js | projects.js, services.js | ES module import | WIRED | Both views import 5 helpers; both attach window.addTranche/removeTranche/recalculateTranches; both delete in destroy() |
| app/coll-id.js | finance.js submitCollectible | `import { generateCollectibleId }` + call site at line 1785 | WIRED | Single import, single call, no generateSequentialId reference anywhere |
| projects.js form | Firestore projects.collection_tranches | `addDoc(...)` and `updateDoc(...)` payloads include `collection_tranches: finalTranches` | WIRED | Lines 697 and 1132 |
| services.js form | Firestore services.collection_tranches | Same pattern | WIRED | Plan 04 mirror |
| finance.js submitCollectible | Firestore collectibles addDoc + notification fan-out | `await addDoc(...)` + try/catch `await createNotificationForRoles(...)` | WIRED | finance.js:1809 + 1813-1826 |
| finance.js voidCollectiblePayment | Firestore collectibles updateDoc (read-modify-write, NOT arrayRemove) | `getDoc → records.map → updateDoc` | WIRED | Lines 2186-2204; explicit map (not arrayRemove) |
| finance.js exportCollectiblesCSV | getDisplayedCollectibles + downloadCSV | filter-aware CSV | WIRED | Line 2373 reuses Plan 05's pipeline; line 2434 calls downloadCSV with 13 headers |
| Hash route #/finance/collectibles | collectibles-section markup | router.js parses path=/finance, tab=collectibles → finance.js render(activeTab) shows section.active | WIRED | href="#/finance/collectibles" + `activeTab === 'collectibles' ? 'active' : ''` markers found |
| project-detail refresh | collectibles aggregation | Same code path as RFP aggregation; one extra getDocs per refresh | WIRED | Line 828-847 sits inside refreshExpense |
| service-detail refresh | collectibles aggregation | Same | WIRED | Line 948-967 |
| expense-modal showExpenseBreakdownModal | collectibles fetch | 1 extra getDocs (service mode) or 2 (project mode — looks up project_code first) | WIRED | Lines 92-115 |

All 13 critical links VERIFIED at code level.

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|---------------------|--------|
| Finance Collectibles table | `collectiblesData[]` | `onSnapshot(collection(db, 'collectibles'))` at finance.js:1467 | YES — real Firestore listener writes into module-state array on each snapshot | FLOWING |
| Finance create-modal project dropdown | `projectsForCollMap` / `servicesForCollMap` | onSnapshot(projects) and onSnapshot(services) at finance.js:1481, 1500 | YES — both build Maps keyed by code; populated reactively | FLOWING |
| project-detail Financial Summary cells | `currentCollectibles` | `getDocs(query(collectibles, where(project_code)))` at line 832 | YES — real Firestore query, real `payment_records` reduce; not a stub | FLOWING |
| service-detail Financial Summary cells | `currentServiceCollectibles` | same pattern via service_code | YES | FLOWING |
| expense-modal Collectibles tab | `collectiblesForTab` | `getDocs(query(collectibles, where(...)))` at lines 94 / 107 | YES — real fetch + sort + reduce | FLOWING |

No HOLLOW, STATIC, or DISCONNECTED artifacts. All wired components consume real Firestore data.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | — | — | — | No TODO/FIXME/HACK/PLACEHOLDER markers in any of the 8 modified files |

Specific anti-pattern checks performed:
- **Silent task skip** (per memory: feedback_verify_executor_task_count): Cross-checked against plan task counts. Found ONE attribution glitch — Plan 04 Task 1 changes to services.js shipped inside commit `5c09c03` (Plan 07's commit). Code is correct; only the commit message is wrong. **NOT a code-level skip** — both Plan 04 Task 1 and Task 2 are present in services.js (verified by grep counts matching all Plan 04 acceptance criteria).
- **Status persisted to Firestore (D-19 violation)**: NONE. The collDoc payload at finance.js:1787-1807 has no `status` field. Only payment_record sub-objects have status (active/voided), which is correct.
- **CSV cells unwrapped by safe() helper**: NONE. All 9 user-controlled string cells in exportCollectiblesCSV use `safe(...)`. Numeric cells (.toFixed) are unwrapped — acceptable since numbers can't start a formula.
- **Notification fire-and-forget that throws**: NONE. createNotificationForRoles call is wrapped in try/catch at finance.js:1813-1826; catch logs and swallows. Primary addDoc at line 1809 cannot be rolled back by notification failure.
- **destroy() not deleting all window.* functions**: NONE. All 16 collectibles-related window functions deleted (lines 4302-4321), all state vars reset (lines 4324-4332).
- **Plan 05 stubs leftover after Plan 06**: NONE. `grep -c "Plan 06 stubs"` returns 0. Plan 06 cleanly overwrites with real implementations.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COLL-01 | 06 | Create collectible | SATISFIED | submitCollectible + Pattern 21 doc shape |
| COLL-02 | 06 | Edit collectible (description + due_date only) | SATISFIED | submitEditCollectible D-13 invariant verified by code read |
| COLL-03 | 06 | Delete collectible | SATISFIED | cancelCollectible + isCollectibleCancellable guard |
| COLL-04 | 05 | Finance sub-tab with filters | SATISFIED | 5th pill + 5 filters + 15/page pagination |
| COLL-05 | 06 | Record payment (partial/full + method dropdown) | SATISFIED | submitCollectiblePayment + D-15/D-14/D-16/D-17 |
| COLL-06 | 05+06 | Auto-derived status | SATISFIED | deriveCollectibleStatus pure + status not persisted (D-19) |
| COLL-07 | 07+08 | Per-project visibility | SATISFIED | Financial Summary cells + Financial Breakdown modal tab |
| COLL-08 | 06 | CSV export | SATISFIED | 13-column filter-aware export + T-85.6-01 mitigation |
| COLL-09 | 01+06 | Persist + Security Rules | SATISFIED | firestore.rules block + denorm doc shape |

No orphaned requirements. REQUIREMENTS.md (lines 50-58) maps COLL-01..09 to Phase 85; all 9 are claimed by at least one plan.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---------|---------|--------|--------|
| All 8 modified JS files pass `node --check` syntax | `node --check {file}` for each | All exit 0 | PASS |
| coll-id.js exports generateCollectibleId | `grep -c "^export async function generateCollectibleId" app/coll-id.js` | 1 | PASS |
| tranche-builder.js exports 5 helpers | `grep -c "^export function" app/tranche-builder.js` | 5 | PASS |
| finance.js has 23 collectibles-related functions (8 read + 15 write) | grep all function definitions | 23 | PASS |
| firestore.rules collectibles block ordered correctly | rfps → collectibles → notifications | Confirmed | PASS |
| Notification enum + TYPE_META present | `grep -c "COLLECTIBLE_CREATED" app/notifications.js` | 2 | PASS |

All 6 automated checks pass. Runtime UAT spot-checks routed to human verification (cannot exercise without browser + Firebase).

---

## Working-State Notes

- **Plan 04 attribution glitch**: Commit `5c09c03` is labelled "feat(85-07)" but actually contains both Plan 07's project-detail work AND Plan 04 Task 1's services.js tranche-builder import + state. Code is correct; only the commit message is misleading. Captured as **LOW-severity finding** — does not affect goal achievement.
- **Plan 04 Task 2 attribution**: Commit `ca22b44` correctly attributes "feat(85-04)" for the addService/editService/saveServiceEdit collection_tranches persistence.
- **26 commits ahead of origin/v3.3**: Branch v3.3 contains Phase 84.1 tail + Phase 85 work — none pushed to remote. Pre-deploy checklist:
  1. Firebase Console: paste new firestore.rules collectibles block (D-24 invariant — MUST happen before first runtime collectibles addDoc)
  2. `git push origin v3.3` to trigger Netlify deploy
  3. Run UAT script per the 13 human-verification items above

---

## Gaps Summary

**No code-side gaps.** All 9 requirements ship in code. All 5 roadmap success criteria implemented. All 8 plans' acceptance criteria pass automated grep + node-check verification.

**Status is `human_needed`, not `passed`,** because:
1. Firebase Console rules deploy is a manual step that the user must perform BEFORE the first runtime write to collectibles (D-24, CLAUDE.md "Add New Collection or Tab"). Until rules are deployed, even Super Admin will get "Missing or insufficient permissions" on addDoc.
2. 13 runtime UAT items (visual rendering, modal behavior, real-time notification, status auto-derivation, CSV download verification) require browser exercise.

The Phase 85 codebase is **shipping-quality and goal-achieving at the code level**. Only operational deploy + browser UAT remain.

---

## Findings (Severity Classification)

| ID | Severity | Description | Recommendation |
|----|----------|-------------|----------------|
| F-1 | LOW | Commit `5c09c03` mis-attributes Plan 04 Task 1 services.js work to "feat(85-07)" | Code is correct; commit message glitch only. No action required. Captured for post-mortem clarity. |
| F-2 | INFO | finance.js grew to 5916 lines | Below the 5000-line healthy threshold from Plan 06 success criteria estimate (3700). Worth tracking for future split. Not a blocker. |
| F-3 | INFO | Phase 85 plans + SUMMARY files committed; STATE.md and ROADMAP.md show Phase 85 marked complete (line 223 of ROADMAP.md, line 307) | Documentation closure is consistent with code reality. |

**No MEDIUM, HIGH, or BLOCKER findings.** The single non-code-side blocker (Firebase Console rules deploy) is correctly captured as a human-verification item per D-24's same-commit-different-deploy split.

---

_Verified: 2026-05-02_
_Verifier: Claude (gsd-verifier, Opus 4.7 [1M context])_
