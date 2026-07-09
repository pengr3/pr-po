# Data-Layer Audit — Findings Report (Phase 106)

This is the single severity-ranked findings deliverable (**AUDIT-01**) for the Phase 106 data-layer audit of the entire `app/` Firestore SDK layer — **35 JavaScript files** (949 call-site anchors, see `106-INVENTORY.md`) plus **`firestore.rules`** (33 match blocks). It merges four dimension audits — **integrity** (AUDIT-02), **correctness** (AUDIT-04), **efficiency** (AUDIT-05), and **security-rule coverage** (AUDIT-03) — into **25 findings** ranked High → Low, each tagged with its category and carrying a stable `F-00N` id, a `file:line` anchor, an `impact`, a `recommendation`, a `handling` disposition (code-fix / backfill-script / defer), and a suggested `target_phase`. Every finding carries a `- was:` trace back to its dimension temp id (I-/C-/E-/S-) so no finding is silently lost. **This is a report, not fixes** — all remediation is Phase 112 (AUDIT-06/07), behind a review gate.

> **Data-pass status:** the read-only real-data pass (`106-DATA-RESULTS.md`, D-03) is **PROD RUN PENDING** — no Firebase service-account key was available, so the live drift / orphan / collection-count numbers are **not yet measured**. The static findings below stand on code analysis; every place a finding would cite a *measured* count is annotated **"pending live measurement — see 106-DATA-RESULTS.md (PROD RUN PENDING)"**. No number has been invented. See [Data-Pass Results](#data-pass-results).

## Summary Table

The index Phase 112 (AUDIT-06/07) consumes: one row per finding, ordered High → Low. `Handling` = code-fix / backfill-script / defer; all findings target Phase 112.

| ID | Severity | Category | Collection | One-line |
|----|----------|----------|------------|----------|
| F-001 | High | integrity | mrfs→prs→pos→trs→rfps (+v4.0) | Denormalized `project_name`/`service_name` drift chain-wide — renames never back-propagate to created children |
| F-002 | High | integrity | rfps | MRF delete cascades drop PR/PO/TR but orphan the RFPs that reference them (both hard + soft delete) |
| F-003 | High | integrity | projects, services, clients | Deleting a project/service/client is a bare single-doc delete — all children + 6 subcollections orphan |
| F-004 | High | integrity | mrfs, prs, pos, transport_requests, rfps (+ids) | Sequential-ID generation is max-scan with `runTransaction=0` — concurrent submits mint duplicate business IDs |
| F-005 | High | security-rules | invitation_codes | Public read **and public update** (`allow: if true`) — any unauthenticated client can mark/flip codes |
| F-006 | Medium | integrity | pos, transport_requests | Denormalized `supplier_name` drifts on supplier rename and dangles on unguarded supplier delete |
| F-007 | Medium | integrity | rfps | PR-cancellation cascade leaves TR-linked RFPs orphaned + fires child deletes inside an unawaited `forEach` |
| F-008 | Medium | correctness | prs, pos, transport_requests, rfps, collectibles, projects, services, billing_requests | Finance re-subscribes whole-collection listeners on every sub-tab switch — no `listeners[]` clear/guard on re-init |
| F-009 | Medium | correctness | clients, users, services | Services re-subscribes 3 listeners (incl. whole-collection) on every services↔recurring switch |
| F-010 | Medium | correctness | transport_requests | `loadRejectedTRs` has no idempotency guard yet runs on every procurement init → duplicate listener per tab switch |
| F-011 | Medium | correctness | mrfs | Unguarded `JSON.parse(mrf.items_json)` throws on legacy/malformed MRF, breaking the detail render |
| F-012 | Medium | efficiency | pos, rfps, projects, services, clients, collectibles, suppliers, billing_requests | ~17 whole-collection `onSnapshot` listeners with **no `limit()`** — the where(182)-vs-limit(12) imbalance |
| F-013 | Medium | efficiency | prs, pos, transport_requests, rfps | N+1 per-row `getDocs` fan-out building record rows, CSV export, and finance scoreboards |
| F-014 | Medium | efficiency | rfps | N+1 per-PO / per-TR RFP payment-check reads inside the MRF cancel / force-recall loop |
| F-015 | Medium | efficiency | mrfs, pos, transport_requests | Whole-collection `getDocs` then client-side narrowing (scope filter / pagination) that `where()`/`limit()` could do server-side |
| F-016 | Medium | efficiency | pos, prs, transport_requests | Whole-collection `getDocs` max-scan for sequential-ID generation — reads the entire collection on every create |
| F-017 | Medium | efficiency | projects, clients, collectibles, services | Redundant duplicate whole-collection listeners for the same near-static reference collections across views |
| F-018 | Medium | efficiency | mrfs, prs, pos, transport_requests, rfps | Fetch-to-count: full document sets read solely for `.size` where `getAggregateFromServer(count())` exists |
| F-019 | Medium | security-rules | projects/services edit_history (+baselines) | `edit_history` create-gate excludes assigned non-admin editors → silent fire-and-forget audit-trail gap |
| F-020 | Low | integrity | billing_requests, users, mrfs | Two divergent status-casing conventions + undocumented MRF status vocabulary invite silent never-match bugs |
| F-021 | Low | correctness | projects, suppliers | `loadProjects`/`loadSuppliers` cache-guard edge holes (empty dataset / TTL) + missing onSnapshot error callbacks |
| F-022 | Low | correctness | mrfs, prs, pos, projects, services | Missing clear-before-subscribe guard (home stats + mrf-form dropdowns) — latent orphan/duplicate listeners |
| F-023 | Low | correctness | projects, services | Fire-and-forget `last_activity_at` denormalization writes fail silently (inconsistent `.catch`) |
| F-024 | Low | efficiency | suppliers | Caching opportunity — near-static `suppliers` re-read and re-subscribed on every view entry |
| F-025 | Low | efficiency | projects, services, clients, role_templates | Caching opportunity — near-static reference data re-fetched whole on every view entry; no shared cache |

**Distribution: 5 High · 14 Medium · 6 Low = 25 findings.** By category: integrity 7 · correctness 7 · efficiency 9 · security-rules 2. By handling: backfill-script 1 (F-001) · code-fix 20 · defer 4 (F-020, F-024, F-025 + F-001 has a backfill leg). All `target_phase: 112`.

---

## High Severity

Correctness/security band (D-08): wrong data shown to users, denormalized **drift** that misrepresents a record, **orphaned refs** that break a flow, silent write collisions corrupting joins, and **public** rule gates. Live counts for the integrity items are pending the prod data pass.

### F-001 — Denormalized project/service identity drifts chain-wide because renames never back-propagate
- severity: High
- category: integrity
- collection: mrfs, prs, pos, transport_requests, rfps (+ v4.0 collectibles, billing_requests, proposals — static)
- anchor: app/views/mrf-form.js:1717-1722, app/views/procurement.js:4540-4547 (chain head — copied from in-memory selected project/service), app/views/procurement.js:6576-6581, app/views/procurement.js:6859-6864, app/views/procurement.js:7183-7188, app/views/procurement.js:7247-7252 (PR/TR copy from `mrfData.*`), app/views/finance.js:6259-6263 (PO copies from `pr.*`), app/views/procurement.js:1858-1862, app/views/procurement.js:1980-1984, app/views/procurement.js:2083-2087 (RFP copies from `po.*`/`tr.*`); rename trigger with NO propagation: app/views/project-detail.js:1722-1724 (`saveField` writes only `{ [field]: value, updated_at }`), app/views/projects.js:1498, app/views/services.js:1560, app/views/service-detail.js:1317
- impact: `project_name` / `service_name` / `project_code` / `department` are **copied forward at create time** down the whole MRF→PR→PO→TR→RFP chain — each downstream write reads the *previous* doc (`mrfData.*`, `pr.*`, `po.*`), **never re-reading the `projects`/`services` source of truth**. The project/service edit paths write the new name to **only the source doc** — **zero back-propagation** to already-created children. Renaming a project after any MRF exists leaves every linked PR/PO/TR/RFP (and collectible/billing_request/proposal) displaying the **stale old name**, misrepresenting which project/client a live procurement record belongs to. `project_code` is partially shielded (locked field after issuance) and `department` is stable-by-construction; the live High-severity vector is specifically the editable `project_name`/`service_name`. Measured drift count is **pending live measurement — see 106-DATA-RESULTS.md § Denormalization Drift (PROD RUN PENDING)**.
- recommendation: Two-part. (a) **Backfill** existing drift with the drift-aware `verify-integrity.js` chain check (Phase 112). (b) **Prevent** recurrence — either propagate on rename (fan-out `updateDoc` to children keyed by `project_id`/`mrf_id`, mirroring the existing code-issuance backfill at project-detail.js:2143-2202), or stop denormalizing the display name and read it through by `project_id` at render. Prefer read-through for `*_name`; keep `*_code`/`department` denormalized (stable-by-construction).
- handling: backfill-script
- target_phase: 112
- was: I-01

### F-002 — MRF delete cascades drop PR/PO/TR but orphan the RFPs that reference them
- severity: High
- category: integrity
- collection: rfps (orphaned), mrfs/prs/pos/transport_requests (cascade sources)
- anchor: app/views/procurement.js:3709-3720 (hard delete `deleteRejectedMRF` — deletes PR, PO, TR, then MRF; **no RFP delete**), app/views/procurement.js:4818-4858 (soft delete → `deleted_mrfs` — archives `deleted_prs`/`deleted_pos`/`deleted_trs`, **no `deleted_rfps`**, no RFP delete), join key app/views/procurement.js:964/976/1010 (`rfps` where `po_id`/`tr_id`)
- impact: Both MRF-deletion cascades enumerate and delete the linked PRs, POs and TRs but **never touch the `rfps` collection**. RFPs are children of POs/TRs (joined by `rfp.po_id`/`rfp.tr_id` — the stored RFP doc-id is unreliable, so RFPs are found by business id). Deleting an MRF therefore leaves **dangling RFP documents pointing at a PO/TR that no longer exists** — they surface in Finance's RFP/payment listings as phantom payables with no resolvable parent. The soft-delete audit snapshot (`deletedMrfData`) is also incomplete: it records deleted PR/PO/TR summaries but omits the RFPs, so the audit trail understates what was removed. Orphaned refs that break the Finance payment flow = High. Measured orphan count is **pending live measurement — see 106-DATA-RESULTS.md § Orphan Detection (PROD RUN PENDING)**.
- recommendation: In both cascades, before deleting each PO/TR, query `rfps where po_id/tr_id == …` and delete (or archive into `deleted_rfps[]`) each RFP. Add an RFP orphan sweep to `verify-integrity.js` and backfill existing orphans in Phase 112.
- handling: code-fix
- target_phase: 112
- was: I-03

### F-003 — Deleting a project / service / client is a bare single-doc delete: all children and subcollections orphan
- severity: High
- category: integrity
- collection: projects, services, clients (parents); mrfs/prs/pos/transport_requests/rfps/collectibles/billing_requests/project_tasks/service_tasks + 6 subcollections (orphaned children)
- anchor: app/views/project-detail.js:1925 (`deleteDoc(doc(db,'projects',_delId))`), app/views/projects.js:1470 (`deleteDoc(doc(db,'projects',projectId))`), app/views/services.js:1532 (`deleteDoc(doc(db,'services',serviceId))`), app/views/clients.js:664 (`deleteDoc(doc(db,'clients',clientId))`); orphaned subcollection writers e.g. app/views/project-detail.js:2949/3191/3347/3541, app/views/project-plan.js:3246, app/edit-history.js:90-91
- impact: All four delete paths remove **only the top-level document**. (a) No child cascade: a deleted project/service still has its MRFs, PRs, POs, TRs, RFPs, collectibles, billing_requests and tasks in the DB, now referencing a `project_code`/`service_code`/`project_id` with no parent; a deleted client orphans every project/service carrying its `client_code`. (b) **Firestore does not auto-delete subcollections** when a parent doc is deleted — so `projects/{id}/activity_entries`, `progress_updates`, `issues`, `audit_log`, `baselines`, and the dynamic `edit_history` subcollection become **unreachable orphaned documents** that persist and count against storage forever. Only lifecycle Storage blobs are purged (`purgeStoragePrefix`), not Firestore children. Break-a-flow orphans + unbounded orphaned subcollections = High. Measured orphan count is **pending live measurement — see 106-DATA-RESULTS.md (PROD RUN PENDING)** (D-04: v4.0-collection live sweep is itself a Phase 112 task).
- recommendation: Gate deletion behind a child-count check (block, or require an explicit cascade confirmation like `deleteRejectedMRF` does). On confirmed delete, cascade children by `project_id`/`project_code`/`client_code` and explicitly delete each known subcollection (Firestore has no recursive delete client-side — enumerate + batch). Phase 112 backfill sweeps existing orphans.
- handling: code-fix
- target_phase: 112
- was: I-04

### F-004 — Sequential-ID generation is max-scan with zero transactions: concurrent submits mint duplicate IDs
- severity: High
- category: integrity
- collection: mrfs, prs, pos, transport_requests, rfps, collectibles, proposals, project_tasks, service_tasks, projects, services
- anchor: app/utils.js:229-254 (`generateSequentialId`), app/utils.js:269-309 & app/utils.js:359-399 (`generateProjectCode`/`generateServiceCode`), app/coll-id.js:34-61, app/proposal-id.js:19-41, app/task-id.js:37-60, app/service-task-id.js:37-60, app/views/procurement.js:506-521 & 528-543 (`generateRFPId`/`generateTRRFPId`), inline max-scans app/views/procurement.js:4515-4533 (MRF), app/views/procurement.js:6544-6565 (TR), app/views/procurement.js:6852 & 7176 (PR), app/views/finance.js:6227-6252 (PO); confirmed `runTransaction = 0` (106-INVENTORY.md Per-Operation Totals)
- impact: **Every** ID generator mints its next ID by reading all existing docs, taking `max(seq)+1`, and immediately `addDoc`-ing — with **no `runTransaction` and no atomic counter** anywhere in `app/` (inventory confirms 0). Two users (or one user double-submitting) racing between the read and the write compute the **same** next number and create **two docs with the same business ID** (`MRF-2026-005`, `PR_2026_07-003-…`, `RFP-PO-…-1`, `CLMC-ACME-2026001`, etc.). Because the whole app joins by business id (`where('mrf_id','==',…)`, etc.), a collision silently corrupts every downstream join — the wrong PR attaches to the wrong MRF, totals double-count. `proposal-id.js:8` and `utils.js:266/355` **explicitly document the race as "accepted at current scale"**, confirming it is known and unmitigated. Silent write collision corrupting joins = High. (Efficiency sibling F-016 covers the read-cost of the same whole-collection scans.) Any measured collision count is **pending live measurement — see 106-DATA-RESULTS.md (PROD RUN PENDING)**.
- recommendation: Replace max-scan with a transactional counter — a per-scope counter doc updated inside `runTransaction` (or `FieldValue.increment`), exactly the "migrate to a counter document with FieldValue.increment()" path already noted in the utils.js comments. Resolving this also removes F-016's whole-collection read cost.
- handling: code-fix
- target_phase: 112
- was: I-05

### F-005 — invitation_codes public read + public update (`allow: if true`)
- severity: High
- category: security-rules
- collection: invitation_codes
- anchor: firestore.rules:185 (`allow read: if true`), firestore.rules:191 (`allow update: if true`); documented ACCEPTED RISK at firestore.rules:102 + block comment firestore.rules:174-182; code app/auth.js:103 (mark used), app/views/user-management.js:1615 (create)
- impact: The collection is world-readable AND world-writable with no auth (`if true`). Public READ is the milder half — a random UUID-like code only reveals existence, and registration still gates on Firebase Auth + admin approval, so a pre-auth read is plausibly required. Public **UPDATE** is the real exposure: any unauthenticated client can mutate ANY invitation_codes doc — mark valid codes `used` (denial-of-registration), flip `used`→unused, or overwrite code fields — with zero authentication (Information Disclosure + Tampering/Elevation). Flagged despite the documented ACCEPTED RISK (firestore.rules:102) — surfaced for **re-evaluation of public UPDATE**, not as a fresh bug.
- recommendation: Re-evaluate in Phase 112. Keep `allow read: if true` ONLY if the register flow genuinely needs a pre-auth read (register.js does zero Firestore ops and the code read happens in auth.js *after* sign-in — if so, tighten read to `isSignedIn()` or a code-hash lookup). Replace `allow update: if true` with a single-use-transition mask, e.g. `resource.data.used == false && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['used','used_by','used_at'])`, or move redemption behind an authenticated path.
- handling: code-fix
- target_phase: 112
- was: S-01

---

## Medium Severity

Listener leaks, missing error handling on non-critical reads, N+1 reads, redundant listeners/reads, client-side filtering that should be a query, missing `limit()` on growing collections, and an audit-trail rule gap that does not block a flow (D-08). Grouped by category: integrity, then correctness, then efficiency, then security-rules.

### F-006 — Supplier identity denormalized onto POs/TRs drifts on rename and dangles on delete
- severity: Medium
- category: integrity
- collection: pos, transport_requests (supplier_name copied from suppliers)
- anchor: app/views/procurement.js:6587 (TR write `supplier_name: primarySupplier`), app/views/finance.js:6258 (PO write `supplier_name: supplier`), app/views/procurement.js:5217 (supplier rename — no propagation), app/views/procurement.js:5251 (`deleteDoc(doc(db,'suppliers',supplierId))` — no in-use guard)
- impact: POs and TRs store `supplier_name` as a denormalized copy (the join key; suppliers have no stable code — CLAUDE.md keys suppliers by unique `supplier_name`). Editing a supplier's name (procurement.js:5217) does **not** propagate to existing POs/TRs, and **deleting** a supplier (procurement.js:5251) is an unguarded single-doc delete that leaves every PO/TR pointing at a `supplier_name` no longer present in `suppliers`. Result: RFP/scoreboard groupings that join PO/TR→supplier silently mis-bucket or show a phantom supplier. Lower blast radius than F-001 (supplier_name is a label, not the chain spine), hence Medium.
- recommendation: On supplier rename, fan-out to POs/TRs `where('supplier_name','==',old)`; on supplier delete, block if any PO/TR references it (mirror the paid-RFP guard at procurement.js:955-983) or soft-delete. Backfill dangling `supplier_name` values in Phase 112.
- handling: code-fix
- target_phase: 112
- was: I-02

### F-007 — PR-cancellation cascade leaves TR-linked RFPs orphaned and fires child deletes without awaiting them
- severity: Medium
- category: integrity
- collection: rfps (orphaned), prs/transport_requests (cascade)
- anchor: app/views/procurement.js:1004-1031 (cancel cascade — PO-linked RFP delete only, TR-linked RFPs never deleted), app/views/procurement.js:1011-1013 (`rfpSnap.forEach(async (rfpDoc) => { await deleteDoc(…) })` — async callback inside `forEach` not awaited by the enclosing function), app/views/procurement.js:3638 (standalone TR delete — same TR→RFP gap)
- impact: The PR-cancellation flow deletes PRs (1024-1026) and TRs (1028-1031) and, in the force-recall branch only, PO-linked RFPs (1010-1013) — but **TR-linked RFPs are never deleted on any branch**, and the simple-cancel branch deletes no RFPs at all. Any zero-payment RFP attached to a cancelled TR is orphaned (paid RFPs are correctly blocked upstream by the guard at procurement.js:955-983, capping the blast radius → Medium not High). Compounding it, the RFP deletes at 1011-1013 use an `async` callback inside `forEach`, so the outer function does **not await** them before restoring the MRF — a partial-cascade / ordering hazard if navigation interrupts.
- recommendation: Delete TR-linked RFPs (`where('tr_id','==',tr.tr_id)`) on both branches; replace the `forEach(async…)` with `for…of await` (or `await Promise.all(map)`) so every delete completes before the MRF is restored.
- handling: code-fix
- target_phase: 112
- was: I-06

### F-008 — Finance re-subscribes whole-collection listeners on every sub-tab switch (no listeners[] clear on re-init)
- severity: Medium
- category: correctness
- collection: prs, pos, transport_requests, rfps, collectibles, projects, services, billing_requests
- anchor: app/views/finance.js:5287, finance.js:5345, finance.js:6592 (unconditional), finance.js:1326, finance.js:1336, finance.js:1992, finance.js:2006, finance.js:2025, finance.js:2045 (tab-init); init @4390, destroy @5099
- impact: The router re-calls `init(activeTab)` on every Finance sub-tab switch **without** `destroy()` (router.js:314-346). `init()` unconditionally runs `loadPRs`/`loadPOs`/`loadApprovedTRsThisMonth` (4422-4424) — each attaches an `onSnapshot` and `listeners.push(...)` with **no** clear-before-subscribe and **no** idempotency flag; `initPayablesTab`/`initCollectiblesTab` similarly re-attach on each revisit. `listeners[]` is only emptied in `destroy()` (5107-5112), which fires only when leaving Finance entirely. Every approvals↔payables↔collectibles↔projects toggle adds ≥3 (up to 9) duplicate **whole-collection** listeners on high-traffic collections; over a session these accumulate unboundedly — each Firestore change fans out to N duplicate callbacks (redundant rebuilds + read amplification + memory growth). The in-code comment @1985-1989 asserting "no duplicate-attach risk" is incorrect: its "runs ONCE per mount" premise fails because `init()` re-runs on every tab switch. (Overlaps efficiency F-012 unbounded + F-017 redundant — same listener sites, different defect.)
- recommendation: Clear `listeners[]` at the top of `init()` (forEach-unsubscribe then `listeners = []`) before any re-subscribe, OR gate each `load*/initTab` with a per-listener active-flag reset in `destroy()` (the pattern procurement.js already uses via `_mrfListenerActive`/`_poTrackingListenerActive`/`_rfpListenerActive`, procurement.js:2787-2789).
- handling: code-fix
- target_phase: 112
- was: C-01

### F-009 — Services re-subscribes 3 listeners on every services↔recurring tab switch
- severity: Medium
- category: correctness
- collection: clients, users, services
- anchor: app/views/services.js:449, services.js:482, services.js:906; init @305 (calls the three loaders @353-355), destroy @384
- impact: Finance-class leak. `#/services` has router sub-tabs via `navigateToTab('services'|'recurring')` (services.js:165,167) → same-view re-init without `destroy()`. `init()` unconditionally calls the three loaders; each does `onSnapshot(...)` + `listeners.push(...)` with no guard. Switching Services↔Recurring duplicates the clients + users + **whole-collection services** listeners; cleared only on view exit. Secondary (same class, DOM not Firestore): a fresh `permissionsChanged` handler is `addEventListener`'d on **every** init (services.js:317) but only the first is tracked (319-321), so `destroy()` removes only one — the rest are orphaned DOM listeners; `window._servicesAssignmentHandler` is likewise overwritten each init (328).
- recommendation: Clear `listeners[]` at init start (or per-listener flags reset in destroy); guard the `permissionsChanged`/`assignmentsChanged` `addEventListener` calls with an `if (!window._servicesPermissionHandler)` check (as procurement.js:2598 already does).
- handling: code-fix
- target_phase: 112
- was: C-02

### F-010 — `loadRejectedTRs` has no idempotency guard yet runs on every procurement init
- severity: Medium
- category: correctness
- collection: transport_requests
- anchor: app/views/procurement.js:3054 (onSnapshot), procurement.js:3050 (fn), procurement.js:2627 (unconditional call in init), destroy @2743
- impact: `init()` calls `loadRejectedTRs()` unconditionally on every procurement tab switch (request/mrfs/suppliers/records re-init without `destroy()`). Unlike its siblings `loadMRFs` (`_mrfListenerActive` @2994), `loadPOTracking` (`_poTrackingListenerActive` @7368) and the records rfps listener (`_rfpListenerActive` @7424) — all guarded AND reset in `destroy()` (2787-2789) — `loadRejectedTRs` has neither a flag nor a cache guard. Each procurement tab switch attaches an additional `transport_requests` (finance_status==Rejected) listener; they accumulate until the view is left. Lower blast radius than F-008/F-009 (single filtered listener), same defect class, trivially fixable.
- recommendation: Add a `_rejectedTRsListenerActive` guard mirroring `_mrfListenerActive`, and reset it in `destroy()` alongside 2787-2789.
- handling: code-fix
- target_phase: 112
- was: C-03

### F-011 — Unguarded `JSON.parse(mrf.items_json)` throws on legacy/malformed MRF and breaks the detail render
- severity: Medium
- category: correctness
- collection: mrfs
- anchor: app/views/procurement.js:3820 (`renderMRFDetails`), procurement.js:5830; contrast mrf-form.js:675 (correct try/catch), 25+ sibling sites using `|| '[]'`
- impact: `renderMRFDetails()` does `const items = JSON.parse(mrf.items_json);` with **no** `|| '[]'` fallback and **no** enclosing try/catch (procurement.js:3820; same bare form at 5830). If `items_json` is `undefined`/`null` (legacy MRF written before the field existed, or a partial write), `JSON.parse` throws `SyntaxError` and the MRF-detail render aborts — the operator sees a broken/empty panel. Legacy-unsafe read per CLAUDE.md ("must parse with `JSON.parse()`"). It throws (breaks the flow) rather than showing wrong data → Medium not High. **Systemic sub-point:** the ~25 sibling parses that *do* use `|| '[]'` guard `null`/`undefined` but **not a malformed non-empty string** — `JSON.parse('{corrupt')` throws regardless. Only mrf-form.js:675 is fully safe. Any measured `items_json`-parse-failure count is **pending live measurement — see 106-DATA-RESULTS.md § Schema & Reference Warnings (PROD RUN PENDING)**.
- recommendation: Wrap the two bare parses in the mrf-form.js:675 try/catch idiom (default to `[]` on throw); consider a shared `parseItemsJson(x)` helper across all items_json read sites so malformed data degrades to empty rather than crashing the render.
- handling: code-fix
- target_phase: 112
- was: C-06

### F-012 — ~17 whole-collection real-time listeners missing `limit()` (the where-vs-limit imbalance)
- severity: Medium
- category: efficiency
- collection: pos, rfps, projects, services, clients, collectibles, suppliers, billing_requests
- anchor: app/views/finance.js:1326 (rfps), finance.js:1336 (pos), finance.js:1992 (collectibles), finance.js:2006 (projects), finance.js:2025 (services), finance.js:2045 (billing_requests), procurement.js:5004 (suppliers), procurement.js:7426 (rfps), projects.js:432 (clients), projects.js:848 (projects), projects.js:865 (collectibles), services.js:449 (clients), assignments.js:192 (projects), assignments.js:201 (services), clients.js:191 (clients), home.js:779 (pos), user-management.js:276 (projects)
- impact: 106-INVENTORY.md recon: **where 182 vs limit 12** — and **all 12 `limit()` calls sit on `notifications` (6) + journal subcollections (6× `limit(50)`)**. **Zero** whole-collection business listeners are bounded. Each of these ~17 `onSnapshot(collection(db,'X'))` streams every document in a growing collection into the client and re-runs the render callback on every change; read cost, snapshot payload, and re-render work grow linearly (O(collection size)) forever. Bites at scale, not at current volumes (hence Medium, not High).
- recommendation: Add `limit(N)` + `orderBy(...)` to the listener queries, or narrow with `where(...)` to the rows the view actually shows (e.g. finance PO list bounded to a recent window/status; projects/services scoped to assignment). Where a full set is genuinely needed, page it or move to an on-demand `getDocs` + explicit refresh. `notifications` (limit 10/11/PAGE_SIZE) and journal subcollections (limit 50) are the correct model to copy.
- handling: code-fix
- target_phase: 112
- was: E-01

### F-013 — N+1 per-row `getDocs` fan-out (record tables, CSV export, finance scoreboards)
- severity: Medium
- category: efficiency
- collection: prs, pos, transport_requests, rfps (fanned out per mrfs / projects / services row)
- anchor: app/views/mrf-records.js:1414, mrf-records.js:1443, mrf-records.js:1477 (loop @1388); procurement.js:5771, procurement.js:5809, procurement.js:5847, procurement.js:5884 (per-MRF builder loop @5758); procurement.js:5610, procurement.js:5627 (CSV export map @~5590); finance.js:4473, finance.js:4494 (per-project loop @4476); finance.js:4736, finance.js:4738, finance.js:4807, finance.js:4809 (per-service loops @4726/recurring)
- impact: For each outer row (MRF/project/service) the code issues a fresh per-row `getDocs(where('…_id','==', row))`. A page of N MRFs = up to 3N reads (PR+PO+TR); the CSV export and scoreboards fan out over the **entire** filtered set. Read count and latency scale with row count. Finance scoreboards already use `getAggregateFromServer(count()/sum())` for PO/TR totals but still fan out a per-project/per-service `getDocs(rfps …)` for fee data. Mitigations present: mrf-records `_subDataCache` (mrf-records.js:1402) and procurement `_prpoSubDataCache` (procurement.js:5760) cache per-MRF sub-data across re-renders, so the fan-out is per first-load, not per paint — hence Medium.
- recommendation: Replace the per-row loops with a **single bulk read + in-memory join**: fetch child rows for the whole visible page with `where('mrf_id','in',[…])` in 10-item chunks (the code already does this at finance.js:5323/5378 and project-detail.js:1985 / service-detail.js:1569), then group by parent id client-side. Keep the existing caches; batch the CSV export the same way.
- handling: code-fix
- target_phase: 112
- was: E-02

### F-014 — N+1 per-PO / per-TR RFP payment-check reads in MRF cancel / force-recall
- severity: Medium
- category: efficiency
- collection: rfps (fanned out per pos / transport_requests)
- anchor: app/views/procurement.js:964 (`for (const po of pos)` @962), procurement.js:976 (`for (const tr of trs)` @974), procurement.js:1010 (`for (const po of pendingPOs)` @1004)
- impact: `cancelMRFPRs()` loops the MRF's POs and TRs and issues one `getDocs(query(rfps, where('po_id'|'tr_id','==', …)))` per iteration to check for recorded payments, then a second per-PO RFP read in the force-recall branch. Fan-out is bounded by the number of POs/TRs on a **single** MRF (usually small), so real-world cost is modest — but it is the canonical N+1 shape and grows with PO/TR count per MRF.
- recommendation: Fetch the MRF's RFPs once (`where('po_id','in',[…poIds])` / `where('tr_id','in',[…trIds])` in 10-chunks) and evaluate `rfpHasPaidAmount` in memory; reuse the same set for the force-recall delete pass instead of re-querying at line 1010.
- handling: code-fix
- target_phase: 112
- was: E-03

### F-015 — Whole-collection `getDocs` then client-side narrowing (scope filter / pagination / dedup)
- severity: Medium
- category: efficiency
- collection: mrfs, pos, transport_requests
- anchor: app/views/procurement.js:5358 (whole `mrfs`, then `.filter(isMrfInAssignedScope)` @5395), procurement.js:5399 (whole `pos`, then client-side scope filter @5414), mrf-records.js:1167 (`mrfs where status in […]`, no `limit()` → client-side pagination), procurement.js:3786, procurement.js:4515 (whole `mrfs` one-shot), procurement.js:6544 (whole `transport_requests`), mrf-form.js:1277 (whole `mrfs`), app/utils.js:232 (generic `getDocs(collection(db, collectionName))` helper — whole-collection by construction)
- impact: `loadPRPORecords` pulls **all** mrfs and **all** pos, then discards out-of-assigned-scope rows in JavaScript; the records list query (mrf-records.js:1167) fetches every status-matching MRF and paginates in the client. As mrfs/pos grow, the client downloads and processes rows it immediately throws away — bandwidth, memory, and CPU scale with total collection size rather than with what is shown. (The union project-OR-service scope is genuinely awkward as one Firestore query, which partly justifies the client filter — noted, still a scale liability.)
- recommendation: Push the predicate server-side where possible: `where('status','in', …)` + `limit()` + cursor pagination for the records list; scope the mrfs/pos reads with `where` on assigned project/service codes (or `array-contains`), chunked. For the generic utils.js:232 helper, require callers to pass a constrained query.
- handling: code-fix
- target_phase: 112
- was: E-04

### F-016 — Whole-collection `getDocs` max-scan for sequential-ID generation
- severity: Medium
- category: efficiency
- collection: pos, prs, transport_requests
- anchor: app/views/finance.js:6227 (`getDocs(posRef)` → scan all `pos` for `maxPONum`), procurement.js:6782 (`getDocs(prsRef)` → all `prs` for `maxPRNum`), procurement.js:7115 (`getDocs(prsRef)` → all `prs`, second generate-PR path), procurement.js:7221 (`getDocs(trsRef)` → all `transport_requests` before adding a TR)
- impact: Every PO/PR/TR creation reads the **entire** target collection into the client purely to compute the next sequential number by max-scan (`maxPONum`/`maxPRNum`). Read count per create = current collection size; it only grows. This is the read-cost sibling of the `runTransaction=0` ID-race (integrity F-004 owns the concurrency correctness; **this** finding is the efficiency cost of the scan itself).
- recommendation: Query only the current-month prefix with `where(field,'>=',prefix) + where(field,'<',prefix+'') + orderBy(field,'desc') + limit(1)` (the proposal-id.js:26-27 range pattern), or move the counter to a dedicated monotonic-id doc updated in a transaction (also resolves F-004). Reads drop from O(collection) to O(1).
- handling: code-fix
- target_phase: 112
- was: E-05

### F-017 — Redundant duplicate whole-collection listeners for the same reference collections
- severity: Medium
- category: efficiency
- collection: projects, clients, collectibles, services
- anchor: projects — finance.js:2006, projects.js:848, assignments.js:192, user-management.js:276; clients — clients.js:191, projects.js:432, services.js:449; collectibles — finance.js:1992, projects.js:865; services — finance.js:2025, assignments.js:201
- impact: The same near-static reference collections are independently `onSnapshot`-subscribed by multiple views — `projects` from **four** modules, `clients` from **three**, `collectibles` and `services` from **two** each. Each view opens its own whole-collection stream (compounding F-012) and re-downloads the same data; there is no shared/module-level source. Redundant reads + redundant re-render work whenever any of these collections changes. Note also procurement subscribes to `mrfs` via status queries (procurement.js:3005/3052) while separately `getDocs`-scanning whole `mrfs` (F-015) — same data pulled two ways within one view.
- recommendation: Introduce a single shared reference-data store (module-level cache with one listener per collection, or a small pub/sub) that views subscribe to, instead of each view opening its own whole-collection listener. Combine with F-012's `limit()`/scoping so the shared stream is itself bounded.
- handling: code-fix
- target_phase: 112
- was: E-06

### F-018 — Fetch-to-count: full document reads used only for `.size`
- severity: Medium
- category: efficiency
- collection: mrfs, prs, pos, transport_requests, rfps
- anchor: app/views/project-detail.js:2078, project-detail.js:2079, project-detail.js:2080, project-detail.js:2081, project-detail.js:2082 (`getDocs(query(…, where('project_id','==', …))).then(s => s.size)`)
- impact: Five collections are fetched **in full** for a project solely to read `s.size` (a count). This downloads every matching document just to count it, when the codebase already uses server-side `getAggregateFromServer(count())` elsewhere (finance.js:4485/4489, project-detail.js:1799/1810, service-detail.js:1448-1478). If the sibling data reads at project-detail.js:2162-2166 (same five `where('project_id','==', …)` queries, kept for data) run in the same view entry, these count reads are additionally **fully redundant** with them.
- recommendation: Replace the `.then(s => s.size)` reads with `getAggregateFromServer(q, { n: count() })` (reads server-side, returns only the number), or derive the counts from the 2162-2166 data reads if those already run — eliminating the duplicate fetch.
- handling: code-fix
- target_phase: 112
- was: E-07

### F-019 — edit_history (+ baselines) create-gate excludes assigned non-admin editors → silent audit-trail gap
- severity: Medium
- category: security-rules
- collection: projects/*/edit_history + services/*/edit_history (same class: projects/*/baselines)
- anchor: firestore.rules:268 (projects/edit_history create), firestore.rules:600 (services/edit_history create), firestore.rules:278 (baselines create); write path app/edit-history.js:90 (fire-and-forget `catch` :98-100); trigger app/views/project-detail.js:4181 (submitProjectLoss) + app/views/service-detail.js:3821; the parent-doc write the SAME role is allowed to make sits at firestore.rules:220-252 (assigned-user field-mask incl. `project_status`+`loss_reason`)
- impact: `edit_history` is an append-only audit trail whose create gate is stricter than the parent write the code performs in the same flow. `projects/edit_history` create (268) = `[super_admin, operations_admin, services_admin, finance]` — **excludes operations_user and services_user**; `services/edit_history` create (600) = `[super_admin, services_admin, services_user, operations_admin]` — **excludes operations_user** (cross-dept assigned via 260706-mco). Yet an assigned `operations_user` may legitimately mutate the parent (mark a project **Loss** — rules 227-230 allow `project_status`+`loss_reason`; code writes it at project-detail.js:4172-4177) then calls `recordEditHistory(...)` at :4181. Because that helper is fire-and-forget (silent `catch`, edit-history.js:98-100), the edit_history create is **denied silently** — the Loss commits but the audit entry "Status → Loss by <user>" never lands. Net: gaps in an append-only accountability log (Repudiation), not a blocked flow or data exposure → Medium not High.
- recommendation: Extend the `edit_history` create gate on BOTH parents to admit the assigned non-admin editors, mirroring what `audit_log` already does (firestore.rules:287-292 / 609-614 were expanded for kg0/mco assigned users, but edit_history 268/600 and baselines 278 were left behind), e.g. append `|| ((isRole('operations_user') || isRole('services_user')) && request.auth.uid in get(<parent>).data.personnel_user_ids)`. Also re-check `baselines` create (278, admin-only) against assigned-ops_user plan editing. Escalate to High in 112 if the lifecycle audit trail is deemed integrity-critical.
- handling: code-fix
- target_phase: 112
- was: S-02

---

## Low Severity

Caching opportunities, micro-optimizations, scale-only concerns, and cosmetic/latent inconsistencies (D-08). These flow onto the Phase 112 (AUDIT-06) deferral list.

### F-020 — Two divergent status-casing conventions plus an undocumented MRF status vocabulary invite silent never-match bugs
- severity: Low
- category: integrity
- collection: billing_requests + users (lowercase) vs mrfs/prs/pos/transport_requests (Capitalized); mrfs (undocumented status values)
- anchor: capitalized: app/views/mrf-form.js:1730 (`status: 'Pending'`), finance.js:6141 (`finance_status: 'Approved'`); lowercase: project-detail.js:1468 & service-detail.js:701 (`status: 'pending'`), finance.js:2198/2221 (`'approved'`/`'rejected'`), auth.js:129 (`status: 'pending'`), reads finance.js:2052-2053, expense-modal.js:605-607; undocumented MRF states procurement.js:3004 (`['Pending','In Progress','Rejected','PR Rejected','TR Rejected','Finance Rejected']`), procurement.js:1035 (`status: 'In Progress'`)
- impact: Two latent issues (no current wrong-data bug — each collection is internally consistent, hence Low). (1) **Casing split:** the procurement chain uses Capitalized status literals while `billing_requests` and `users` use lowercase, the opposite of CLAUDE.md's single documented "Status Matching (Case-Sensitive)" convention. New code that trusts the doc and compares `billing_requests.status === 'Pending'` will **silently never match** and under-count. (2) **Undocumented enum:** `mrf.status` actually ranges over `In Progress / PR Rejected / TR Rejected / Finance Rejected / Cancelled` beyond the documented `Pending|Approved|Rejected`, so `verify-integrity.js`'s invalid-status check will emit **false-positive warnings** on legitimate records (**pending live measurement — see 106-DATA-RESULTS.md § Invalid-status warnings (PROD RUN PENDING)**). Note: parent status DERIVED from children is render-only, never persisted (project-plan.js:770) — the safe pattern, verdict clean.
- recommendation: Document both conventions in CLAUDE.md (or normalize `billing_requests`/`users` to Capitalized behind a migration), and widen the `verify-integrity.js` MRF-status allow-set to the real vocabulary so its warnings are trustworthy. Cosmetic/latent → deferral list.
- handling: defer
- target_phase: 112
- was: I-07

### F-021 — Procurement `loadProjects`/`loadSuppliers` cache-guard edge holes + missing onSnapshot error callbacks
- severity: Low
- category: correctness
- collection: projects, suppliers
- anchor: app/views/procurement.js:2936, procurement.js:2926-2955 (loadProjects); procurement.js:5004, procurement.js:4995-5017 (loadSuppliers)
- impact: Two-part. (a) **Edge-hole re-subscribe:** both loaders short-circuit only when `data.length > 0 && (Date.now() - _cachedAt) < CACHE_TTL_MS`. The live listener keeps `_cachedAt` fresh, so common-case repeat calls do not duplicate. But two holes remain: an **empty legitimate dataset** (`length > 0` false → guard never trips → new listener every init) and **TTL expiry** while the user idles (next init re-subscribes without unsubscribing the prior). Both leak a whole-collection listener. (b) **No error handler:** neither onSnapshot passes a 2nd-arg error callback. On a transient permission-denied (a not-yet-propagated token — the exact condition auth.js:210 documents), Firebase logs an uncaught "Error in snapshot listener" with no app-level surfacing. projects/suppliers are broadly readable so hard denial is unlikely → Low.
- recommendation: Convert the cache guards to listener-existence flags (attach once per mount, reset in destroy); add an `(error) => {...}` callback to both onSnapshot calls (matching procurement.js:3036).
- handling: code-fix
- target_phase: 112
- was: C-04

### F-022 — Missing clear-before-subscribe guard (home stats + mrf-form dropdowns) — latent orphan/duplicate
- severity: Low
- category: correctness
- collection: mrfs, prs, pos, projects, services
- anchor: app/views/home.js:747, home.js:767, home.js:778 (loadStats → statsListeners, no clear @741-790); app/views/mrf-form.js:1046, mrf-form.js:1102 (loadProjects/loadServices overwrite handle without unsubscribe)
- impact: Defensive-gap variant of the leak class, currently latent. (a) **home.js `loadStats`** pushes 3 listeners to `statsListeners` with no clear-before-push — inconsistent with its sibling `_proposalListener`, which *does* clear before re-subscribe (612-613). Home has no router sub-tabs and same-hash re-navigation does not fire `hashchange`, so under the current router it is not reachable — but any future same-route re-init would leak 3 listeners each call. (b) **mrf-form.js** `loadProjects`/`loadServices` assign `projectsListener`/`servicesListener = onSnapshot(...)` **without** first unsubscribing an existing handle; if re-entered while a handle is live, the prior listener is **orphaned** (reference overwritten, even `destroy()` cannot reach it). Mostly contained today by the sub-tab-switch guard (mrf-form.js:360-362), so latent.
- recommendation: In loadStats, clear `statsListeners` before re-populating; in mrf-form loaders, add `if (projectsListener) { projectsListener(); projectsListener = null; }` (and the services equivalent) before re-subscribing — the exact pattern already at mrf-form.js:360-362.
- handling: code-fix
- target_phase: 112
- was: C-05

### F-023 — Fire-and-forget `last_activity_at` denormalization writes fail silently (inconsistent `.catch`)
- severity: Low
- category: correctness
- collection: projects, services
- anchor: app/views/project-detail.js:3176, project-detail.js:3359; app/views/service-detail.js:2895, service-detail.js:3051, service-detail.js:3235, service-detail.js:3270, service-detail.js:3296 (bare); contrast `.catch(console.debug)` siblings at project-detail.js:3556 and service-detail.js:3673/3686/3698/3728
- impact: These journal/lifecycle handlers bump a denormalized `last_activity_at` clock with a **bare** un-awaited `updateDoc(...)` — no `.catch`, no `await`. On failure (e.g., a non-team active user whose parent-doc write is correctly denied) the write fails silently: the activity-freshness indicator drifts stale until the next successful activity. Deliberately non-blocking by design (documented at project-detail.js:3553-3555) and low-value derived data that self-heals, hence Low. The finding is the **inconsistency**: some sites attach `.catch(console.debug)` and some do not, so a subset produces unhandled promise rejections.
- recommendation: Standardize on the `.catch(err => console.debug(...))` form for all last_activity_at bumps (make the fire-and-forget intent explicit and silence unhandled-rejection noise).
- handling: code-fix
- target_phase: 112
- was: C-07

### F-024 — Caching opportunity: near-static `suppliers` re-read and re-subscribed per view
- severity: Low
- category: efficiency
- collection: suppliers
- anchor: app/utils.js:451 (`getDocs(collection(db, 'suppliers'))` — shared helper, whole collection), app/views/procurement.js:5004 (`onSnapshot(collection(db, 'suppliers'))` — whole-collection live stream)
- impact: `suppliers` changes rarely (manual CRUD in the supplier admin tab) but is both re-fetched whole via the utils helper and separately live-subscribed by procurement on each entry. Pure caching / scale-only concern — negligible at current volumes, hence Low.
- recommendation: Cache suppliers in a module-level store with a short TTL (or a single shared listener) and serve views from the cache; invalidate on supplier create/update/delete. Low priority — flows onto the AUDIT-06 deferral list.
- handling: defer
- target_phase: 112
- was: E-08

### F-025 — Caching opportunity: near-static reference data re-fetched whole on every view entry
- severity: Low
- category: efficiency
- collection: projects, services, clients, role_templates
- anchor: app/proposal-modal.js:212 (whole `projects`), proposal-modal.js:213 (whole `clients`), app/views/project-detail.js:2032 (whole `clients`), app/utils.js:277, utils.js:283, utils.js:367, utils.js:373 (repeated projects/services code-range scans), app/permissions.js:92 (`role_templates` listener — near-static)
- impact: Reference collections that change infrequently (projects/services/clients master data, role_templates) are re-read whole (or re-scanned by code-range) on each modal open / view entry, with no shared cache. Repeated bandwidth + parse cost; scale-only / micro-optimization, so Low.
- recommendation: Add a lightweight shared reference cache (module-level, invalidated on the rare writes) reused across proposal-modal, project-detail, utils code-range helpers, and permissions. Overlaps with F-017's shared-store recommendation. Low priority — AUDIT-06 deferral list.
- handling: defer
- target_phase: 112
- was: E-09
