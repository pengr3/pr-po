---
phase: 106-data-layer-audit-findings-report
plan: 03
dimension: integrity
requirement: AUDIT-02
tempid_prefix: I-
provides: "integrity findings (I-0N) in the canonical D-07 schema for Plan 07 to renumber to F-00N by severity"
method: "static code audit over 106-INVENTORY.md write/delete anchors; read-only, no runtime, no DB"
generated: 2026-07-09
---

# Phase 106 — AUDIT-02: Integrity Dimension Findings (static, code side)

**The CODE mechanisms behind drifted / orphaned / mis-derived records.** This scratch file
is the integrity half of AUDIT-02: it traces every denormalized-field write path for **drift**,
every `deleteDoc`/`writeBatch` cascade for **orphan creation**, and the status-handling +
sequential-ID surfaces for silent-failure mechanisms. Anchors are taken verbatim from
`106-INVENTORY.md` (the shared 949-anchor map) — this plan judges the cited lines, it does not
re-scan the tree.

Pairs with **Plan 01** (`106-DATA-RESULTS.md`): this side finds *where* the code can drift/orphan;
Plan 01 *measures* it against real data. Plan 01's data pass is currently **PROD-RUN-PENDING**
(no service-account key in repo) — every cross-reference to a measured count below is marked
`(pending 106-DATA-RESULTS.md)` and MUST NOT be cited as a number until that run lands.

## Method & scope

- **Read-only static audit** (T-106-06/07): source inspection only; no runtime, no DB writes, no
  credentials. Every finding carries a `file.js:line` anchor so Phase 112 can locate and act on it.
- **Severity per the D-08 rubric:** High = wrong data shown / denormalized DRIFT misrepresenting a
  record / ORPHANED refs breaking a flow / silent write failures. Medium = partial-cascade / N+1 /
  missing guards on non-critical paths. Low = cosmetic/latent inconsistencies, scale-only concerns.
- **v4.0 collections** (proposals, collectibles, billing_requests, rfps) get **static** coverage
  here; *live* drift/orphan measurement is **deferred to Phase 112** (D-04) — flagged inline.
- **Handling** values: `code-fix` (fix the write/delete path), `backfill-script` (repair existing
  data on the drift-aware `verify-integrity.js`), `defer` (Low → AUDIT-06 deferral list).

---

## Findings

### I-01 — Denormalized project/service identity drifts chain-wide because renames never back-propagate
- severity: High
- category: integrity
- collection: mrfs, prs, pos, transport_requests, rfps (+ v4.0 collectibles, billing_requests, proposals — static)
- anchor: app/views/mrf-form.js:1717-1722, app/views/procurement.js:4540-4547 (chain head — copied from the in-memory selected project/service), app/views/procurement.js:6576-6581, app/views/procurement.js:6859-6864, app/views/procurement.js:7183-7188, app/views/procurement.js:7247-7252 (PR/TR copy from `mrfData.*`), app/views/finance.js:6259-6263 (PO copies from `pr.*`), app/views/procurement.js:1858-1862, app/views/procurement.js:1980-1984, app/views/procurement.js:2083-2087 (RFP copies from `po.*`/`tr.*`); rename trigger with NO propagation: app/views/project-detail.js:1722-1724 (`saveField` writes only `{ [field]: value, updated_at }` to the source doc), app/views/projects.js:1498, app/views/services.js:1560, app/views/service-detail.js:1317
- impact: `project_name` / `service_name` / `project_code` / `department` are **copied forward at create time** down the whole MRF→PR→PO→TR→RFP chain — each downstream write reads the *previous* doc (`mrfData.*`, `pr.*`, `po.*`), **never re-reading the `projects`/`services` source of truth**. The project/service edit paths (`saveField` at project-detail.js:1722-1724 and the list-edit modals) write the new name to **only the source doc** — there is **zero back-propagation** to the already-created children. So renaming a project after any MRF exists leaves every linked PR/PO/TR/RFP (and collectible/billing_request/proposal) displaying the **stale old name**, misrepresenting which project/client a live procurement record belongs to. `project_code` is partially shielded (locked field after issuance — see I-01 note), but the free-text `project_name`/`service_name` are the live drift vector. Measured drift count is `(pending 106-DATA-RESULTS.md § Denormalization Drift)`.
- recommendation: Two-part. (a) **Backfill** existing drift with the drift-aware `verify-integrity.js` chain check (Phase 112). (b) **Prevent** recurrence — either propagate on rename (fan-out `updateDoc` to children keyed by `project_id`/`mrf_id`, mirroring the existing `runCodeIssuance` backfill at project-detail.js:2143-2202), or stop denormalizing the display name and read it through by `project_id` at render. Prefer read-through for `*_name`; keep `*_code`/`department` denormalized (stable-by-construction).
- handling: backfill-script
- target_phase: 112

> **I-01 note (project_code is lower-risk than project_name):** `project_code` is a **locked field** — project-detail.js:1682 rejects edits to `project_code`/`client_id`/`client_code`, and the only writer is the one-time clientless→coded issuance (project-detail.js:2143-2202) which *does* fan-out to children by `project_id`. `department` is stable-by-construction (a project can't become a service). So the High-severity live vector is specifically the editable `project_name`/`service_name`; `project_code`/`department` drift is a Low residual (issuance-retry edge only). Kept in this finding's collection list because the plan names all three.

### I-02 — Supplier identity denormalized onto POs/TRs drifts on rename and dangles on delete
- severity: Medium
- category: integrity
- collection: pos, transport_requests (supplier_name copied from suppliers)
- anchor: app/views/procurement.js:6587 (TR write `supplier_name: primarySupplier`), app/views/finance.js:6258 (PO write `supplier_name: supplier`), app/views/procurement.js:5217 (supplier rename — `updateDoc(supplierRef,…)`, no propagation), app/views/procurement.js:5251 (`deleteDoc(doc(db,'suppliers',supplierId))` — no guard against in-use)
- impact: POs and TRs store `supplier_name` as a denormalized copy (the join key; suppliers have no stable code — CLAUDE.md keys suppliers by unique `supplier_name`). Editing a supplier's name (procurement.js:5217) does **not** propagate to existing POs/TRs, and **deleting** a supplier (procurement.js:5251) is an unguarded single-doc delete that leaves every PO/TR pointing at a `supplier_name` no longer present in `suppliers`. Result: RFP/scoreboard groupings that join PO/TR→supplier silently mis-bucket or show a phantom supplier. Lower blast radius than I-01 (supplier_name is a label, not the chain spine), hence Medium.
- recommendation: On supplier rename, fan-out to POs/TRs `where('supplier_name','==',old)`; on supplier delete, block if any PO/TR references it (mirror the paid-RFP guard pattern at procurement.js:955-983) or soft-delete. Backfill dangling `supplier_name` values in Phase 112.
- handling: code-fix
- target_phase: 112

### I-03 — MRF delete cascades drop PR/PO/TR but orphan the RFPs that reference them
- severity: High
- category: integrity
- collection: rfps (orphaned), mrfs/prs/pos/transport_requests (cascade sources)
- anchor: app/views/procurement.js:3709-3720 (hard delete `deleteRejectedMRF` — deletes PR, PO, TR, then MRF; **no RFP delete**), app/views/procurement.js:4818-4858 (soft delete → `deleted_mrfs` — archives `deleted_prs`/`deleted_pos`/`deleted_trs`, **no `deleted_rfps`**, no RFP delete), join key app/views/procurement.js:964/976/1010 (`rfps` where `po_id`/`tr_id`)
- impact: Both MRF-deletion cascades enumerate and delete the linked PRs, POs and TRs but **never touch the `rfps` collection**. RFPs are children of POs/TRs (joined by `rfp.po_id` / `rfp.tr_id` — the project-memory landmine says the stored RFP doc-id is unreliable, so RFPs are found by business id). Deleting an MRF therefore leaves **dangling RFP documents pointing at a PO/TR that no longer exists** — they surface in Finance's RFP/payment listings as phantom payables with no resolvable parent. The soft-delete audit snapshot (`deletedMrfData`) is also incomplete: it records deleted PR/PO/TR summaries but omits the RFPs, so the audit trail understates what was removed. Orphaned refs that break the Finance payment flow = High (D-08).
- recommendation: In both cascades, before deleting each PO/TR, query `rfps where po_id/tr_id == …` and delete (or archive into `deleted_rfps[]`) each RFP. Add an RFP orphan sweep to `verify-integrity.js` and backfill existing orphans in Phase 112.
- handling: code-fix
- target_phase: 112

### I-04 — Deleting a project / service / client is a bare single-doc delete: all children and subcollections orphan
- severity: High
- category: integrity
- collection: projects, services, clients (parents); mrfs/prs/pos/transport_requests/rfps/collectibles/billing_requests/project_tasks/service_tasks + the 6 subcollections (orphaned children)
- anchor: app/views/project-detail.js:1925 (`deleteDoc(doc(db,'projects',_delId))`), app/views/projects.js:1470 (`deleteDoc(doc(db,'projects',projectId))`), app/views/services.js:1532 (`deleteDoc(doc(db,'services',serviceId))`), app/views/clients.js:664 (`deleteDoc(doc(db,'clients',clientId))`); orphaned subcollection writers e.g. app/views/project-detail.js:2949/3191/3347/3541, app/views/project-plan.js:3246, app/edit-history.js:90-91
- impact: All four delete paths remove **only the top-level document**. (a) No child cascade: a deleted project/service still has its MRFs, PRs, POs, TRs, RFPs, collectibles, billing_requests and tasks in the DB, now referencing a `project_code`/`service_code`/`project_id` with no parent; a deleted client orphans every project/service carrying its `client_code`. (b) **Firestore does not auto-delete subcollections** when a parent doc is deleted — so `projects/{id}/activity_entries`, `progress_updates`, `issues`, `audit_log`, `baselines`, and the dynamic `edit_history` subcollection become **unreachable orphaned documents** that persist and count against storage forever. Only lifecycle Storage blobs are purged (`purgeStoragePrefix`), not Firestore children. Break-a-flow orphans + unbounded orphaned subcollections = High.
- recommendation: Gate deletion behind a child-count check (block, or require an explicit cascade confirmation like `deleteRejectedMRF` does). On confirmed delete, cascade children by `project_id`/`project_code`/`client_code` and explicitly delete each known subcollection (Firestore has no recursive delete client-side — enumerate + batch). Phase 112 backfill sweeps existing orphans.
- handling: code-fix
- target_phase: 112

### I-05 — Sequential-ID generation is max-scan with zero transactions: concurrent submits mint duplicate IDs
- severity: High
- category: integrity
- collection: mrfs, prs, pos, transport_requests, rfps, collectibles, proposals, project_tasks, service_tasks, projects, services
- anchor: app/utils.js:229-254 (`generateSequentialId` — MRF/PR/PO year counter), app/utils.js:269-309 & app/utils.js:359-399 (`generateProjectCode`/`generateServiceCode`), app/coll-id.js:34-61, app/proposal-id.js:19-41, app/task-id.js:37-60, app/service-task-id.js:37-60, app/views/procurement.js:506-521 & 528-543 (`generateRFPId`/`generateTRRFPId`), inline max-scans app/views/procurement.js:4515-4533 (MRF), app/views/procurement.js:6544-6565 (TR), app/views/procurement.js:6852 & 7176 (PR), app/views/finance.js:6227-6252 (PO); confirmed `runTransaction` = 0 (106-INVENTORY.md Per-Operation Totals)
- impact: **Every** ID generator in the codebase mints its next ID by reading all existing docs, taking `max(seq)+1`, and immediately `addDoc`-ing — with **no `runTransaction` and no atomic counter** anywhere in `app/` (inventory confirms 0). Two users (or one user double-submitting) racing between the read and the write compute the **same** next number and create **two docs with the same business ID** (`MRF-2026-005`, `PR_2026_07-003-…`, `RFP-PO-…-1`, `CLMC-ACME-2026001`, etc.). Because the whole app joins by business id (`where('mrf_id','==',…)`, `where('po_id','==',…)`), a collision silently corrupts every downstream join — the wrong PR attaches to the wrong MRF, totals double-count. `proposal-id.js:8` and `utils.js:266/355` **explicitly document the race as "accepted at current scale"**, confirming it is known and unmitigated. Silent write collision corrupting joins = High (D-08).
- recommendation: Replace max-scan with a transactional counter — a per-scope counter doc updated inside `runTransaction` (or `FieldValue.increment`), exactly the "migrate to a counter document with FieldValue.increment()" path already noted in the utils.js comments. Phase 112, code-fix.
- handling: code-fix
- target_phase: 112

### I-06 — PR-cancellation cascade leaves TR-linked RFPs orphaned and fires child deletes without awaiting them
- severity: Medium
- category: integrity
- collection: rfps (orphaned), prs/transport_requests (cascade)
- anchor: app/views/procurement.js:1004-1031 (cancel cascade — PO-linked RFP delete only, TR-linked RFPs never deleted), app/views/procurement.js:1011-1013 (`rfpSnap.forEach(async (rfpDoc) => { await deleteDoc(…) })` — async callback inside `forEach` is **not awaited** by the enclosing function), app/views/procurement.js:3638 (standalone TR delete — same TR→RFP gap)
- impact: The PR-cancellation flow deletes PRs (1024-1026) and TRs (1028-1031) and, in the force-recall branch only, PO-linked RFPs (1010-1013) — but **TR-linked RFPs are never deleted on any branch**, and the simple-cancel branch deletes no RFPs at all. Any zero-payment RFP attached to a cancelled TR is orphaned (paid RFPs are correctly blocked upstream by the guard at procurement.js:955-983, which caps the blast radius → Medium not High). Compounding it, the RFP deletes at 1011-1013 use an `async` callback inside `forEach`, so the outer function does **not await** them before restoring the MRF and continuing — a partial-cascade / ordering hazard if navigation interrupts.
- recommendation: Delete TR-linked RFPs (`where('tr_id','==',tr.tr_id)`) on both branches; replace the `forEach(async…)` with `for…of await` (or `await Promise.all(map)`) so every delete completes before the MRF is restored.
- handling: code-fix
- target_phase: 112

### I-07 — Two divergent status-casing conventions plus an undocumented MRF status vocabulary invite silent never-match bugs
- severity: Low
- category: integrity
- collection: billing_requests + users (lowercase) vs mrfs/prs/pos/transport_requests (Capitalized); mrfs (undocumented status values)
- anchor: capitalized: app/views/mrf-form.js:1730 (`status: 'Pending'`), app/views/finance.js:6141 (`finance_status: 'Approved'`); lowercase: app/views/project-detail.js:1468 & app/views/service-detail.js:701 (`status: 'pending'`), app/views/finance.js:2198/2221 (`'approved'`/`'rejected'`), app/auth.js:129 (`status: 'pending'`), reads app/views/finance.js:2052-2053, app/expense-modal.js:605-607; undocumented MRF states app/views/procurement.js:3004 (`['Pending','In Progress','Rejected','PR Rejected','TR Rejected','Finance Rejected']`), app/views/procurement.js:1035 (`status: 'In Progress'`)
- impact: Two things, both latent (no current wrong-data bug — each collection is internally consistent, hence Low). (1) **Casing split:** the procurement chain uses Capitalized status literals while `billing_requests` and `users` use lowercase (`'pending'`/`'approved'`), the opposite of CLAUDE.md's single documented "Status Matching (Case-Sensitive)" convention which only shows `'Pending'`. Any new code that trusts the doc and compares `billing_requests.status === 'Pending'` will **silently never match** and under-count. (2) **Undocumented enum:** `mrf.status` actually ranges over `In Progress / PR Rejected / TR Rejected / Finance Rejected / Cancelled` beyond the documented `Pending|Approved|Rejected`, so `verify-integrity.js`'s invalid-status check will emit **false-positive warnings** on legitimate records `(pending 106-DATA-RESULTS.md § Invalid-status warnings)`. Note: parent status DERIVED from children (`finance.js:1057 overallStatus`, project-plan rollup) is **render-only, never persisted** (project-plan.js:770 "never persisted — recomputed each render") — the safe pattern, no stored-vs-derived disagreement; verdict clean.
- recommendation: Document both conventions in CLAUDE.md (or normalize `billing_requests`/`users` to Capitalized behind a migration), and widen the `verify-integrity.js` MRF-status allow-set to the real vocabulary so its warnings are trustworthy. Cosmetic/latent → deferral list.
- handling: defer
- target_phase: 112

---

## Coverage Ledger — integrity surface

Every integrity-relevant write/copy and every delete/cascade site from `106-INVENTORY.md`, each with a `clean` / `flagged` verdict. This proves the whole surface was examined, not only the flagged leads. Verdict = `flagged` when the site participates in a finding (I-0N in the note); `clean` when the site is a leaf delete, an atomic batch, or a source-of-truth write with no drift/orphan mechanism.

### A. Denormalized-field create / copy sites (chain + v4.0)

| site (file.js:line) | verdict | note |
|---------------------|---------|------|
| engagement-create.js:99 | clean | project/service create — writes CANONICAL project_code/name (source of truth, not a copy) |
| mrf-form.js:1735 | flagged | MRF create seeds chain snapshot from in-memory selected project/service → I-01 |
| procurement.js:4559 | flagged | MRF create (procurement tab) copies selectedProject.* → I-01 |
| procurement.js:6572 | flagged | TR create copies mrfData.project_code/name/department → I-01 |
| procurement.js:6877 | flagged | PR create copies mrfData.* → I-01 |
| procurement.js:7178 | flagged | PR create (alt path) copies mrfData.* → I-01 |
| procurement.js:7243 | flagged | TR create (alt path) copies mrfData.* → I-01 |
| finance.js:6254 | flagged | PO create copies pr.project_code/name/department → I-01 |
| procurement.js:1888 | flagged | RFP-from-PO copies po.* → I-01 |
| procurement.js:2009 | flagged | RFP-from-TR copies tr.* → I-01 |
| procurement.js:2112 | flagged | RFP-from-PO (alt) copies po.* → I-01 |
| finance.js:2572 | flagged | collectible create copies meta.name/code (v4.0, static) → I-01 |
| project-detail.js:1457 | flagged | billing_request create copies currentProject.* (v4.0, static) → I-01 |
| service-detail.js:690 | flagged | billing_request create copies currentService.* (v4.0, static) → I-01 |
| proposal-modal.js:946 | flagged | proposal create copies projectCode (v4.0, static) → I-01 |
| procurement.js:6587 | flagged | TR write stamps supplier_name (denorm from suppliers) → I-02 |
| finance.js:6258 | flagged | PO write stamps supplier_name (denorm from suppliers) → I-02 |
| project-plan.js:1340 | clean | project_task carries project_code, but code is locked/stable-by-construction → low drift |
| project-plan.js:1615 | clean | project_task create (add-below) — project_code stable |
| project-plan.js:1761 | clean | project_task create (indent) — project_code stable |
| service-plan.js:1191 | clean | service_task carries service_code — stable-by-construction |
| service-plan.js:1466 | clean | service_task create — service_code stable |
| service-plan.js:1612 | clean | service_task create — service_code stable |

### B. Source-of-truth edit sites (the drift trigger — no propagation)

| site (file.js:line) | verdict | note |
|---------------------|---------|------|
| project-detail.js:1724 | flagged | saveField writes only the edited field to the project doc; no child propagation → I-01 |
| projects.js:1498 | flagged | project edit modal writes source only → I-01 |
| services.js:1560 | flagged | service edit modal writes source only → I-01 |
| service-detail.js:1317 | flagged | service saveField writes source only → I-01 |
| procurement.js:5217 | flagged | supplier rename — no propagation to PO/TR supplier_name → I-02 |
| project-detail.js:2174 | clean | code-issuance backfill DOES fan-out project_code+client_code to children (the correct pattern) |

### C. deleteDoc sites (28)

| site (file.js:line) | verdict | note |
|---------------------|---------|------|
| clients.js:664 | flagged | client delete — no cascade; orphans projects/services by client_code → I-04 |
| finance.js:3113 | clean | delete collectible — leaf, user-initiated removal |
| procurement.js:759 | clean | delete single RFP — leaf, explicit RFP removal |
| procurement.js:1012 | flagged | PR-cancel deletes PO-linked RFP inside unawaited forEach → I-06 |
| procurement.js:1025 | clean | PR-cancel deletes PR — intended, MRF restored to In Progress |
| procurement.js:1030 | flagged | PR-cancel deletes TR but not its RFPs → I-06 |
| procurement.js:3638 | flagged | standalone TR delete — shares TR→RFP orphan gap → I-06 |
| procurement.js:3710 | flagged | MRF hard-delete cascade: PR (RFP gap) → I-03 |
| procurement.js:3713 | flagged | MRF hard-delete cascade: PO — RFPs not deleted → I-03 |
| procurement.js:3716 | flagged | MRF hard-delete cascade: TR — RFPs not deleted → I-03 |
| procurement.js:3720 | clean | MRF doc deleted LAST (correct children-first ordering) |
| procurement.js:4826 | flagged | MRF soft-delete cascade: PR → I-03 |
| procurement.js:4838 | flagged | MRF soft-delete cascade: PO — RFPs not archived/deleted → I-03 |
| procurement.js:4849 | flagged | MRF soft-delete cascade: TR — RFPs not archived/deleted → I-03 |
| procurement.js:4858 | clean | MRF doc deleted after deleted_mrfs archive write (parent last) |
| procurement.js:5251 | flagged | supplier delete — unguarded; orphans PO/TR supplier_name → I-02 |
| procurement.js:6888 | clean | delete PR — rollback cleanup on PR-generation failure |
| procurement.js:7209 | clean | delete PR — rollback cleanup on failure |
| project-detail.js:1925 | flagged | project delete — no child cascade + orphaned subcollections → I-04 |
| project-plan.js:3335 | clean | delete baseline — subcollection leaf, intended |
| project-plan.js:3640 | clean | delete project_iteration — intended snapshot removal |
| project-plan.js:3847 | clean | delete project_iteration snapshot — intended |
| project-plan.js:3876 | clean | delete auto-snapshot iteration — intended |
| projects.js:1470 | flagged | project delete (list) — no child cascade → I-04 |
| services.js:1532 | flagged | service delete — no child cascade → I-04 |
| user-management.js:825 | flagged | user hard-delete — projects/services personnel_user_ids refs may dangle (secondary orphan surface) |
| user-management.js:1320 | clean | user soft-delete — archives to deleted_users first |
| user-management.js:1782 | clean | delete invitation_code — leaf, intended |

### D. writeBatch sites (18) — atomic multi-doc (the safe pattern)

| site (file.js:line) | verdict | note |
|---------------------|---------|------|
| notifications.js:394 | clean | batch mark-read — atomic |
| notifications.js:560 | clean | batch create notifications for roles — atomic |
| notifications.js:632 | clean | batch notification write — atomic |
| seed-roles.js:182 | clean | role_templates seed batch — atomic |
| seed-roles.js:210 | clean | role_templates seed batch — atomic |
| project-detail.js:2198 | clean | code-issuance backfill — atomic, chunked at 500 (the correct propagation pattern) |
| project-plan.js:1601 | clean | task batch write — atomic |
| project-plan.js:1985 | clean | task reorder batch — atomic (watch 500-write cap on huge plans; scale-only Low) |
| project-plan.js:2383 | clean | task reorder batch — atomic |
| project-plan.js:3790 | clean | iteration snapshot batch — atomic |
| project-plan.js:3871 | clean | auto-snapshot batch — atomic |
| project-plan.js:4518 | clean | task dependency batch — atomic |
| proposals.js:277 | clean | proposal batch — atomic |
| role-config.js:342 | clean | role-config batch — atomic |
| service-plan.js:1452 | clean | service_task batch — atomic |
| service-plan.js:1836 | clean | service_task reorder batch — atomic |
| service-plan.js:2230 | clean | service_task reorder batch — atomic |
| service-plan.js:3407 | clean | service_task dependency batch — atomic |

**Ledger totals:** 72 sites examined — 23 denorm create/copy + edit-trigger, 28 deleteDoc, 18 writeBatch, plus the 3 supplier/edit rows. **Flagged: 33** (→ I-01/I-02/I-03/I-04/I-06); **clean: 39**. The ID-race surface (I-05) is a read+addDoc pattern, not a denorm/delete site, so its generator anchors live in I-05, not this ledger.

## v4.0 static-coverage & Phase 112 hand-off (D-04)

- v4.0 collections (proposals, collectibles, billing_requests, rfps) are covered **statically** above:
  their denorm copies ride the same no-back-propagation drift as I-01, and rfps are the orphan victim
  in I-03/I-06. **Live** drift/orphan *measurement* for them is **deferred to Phase 112** (D-04) — do
  not run live queries here.
- Every finding is `target_phase: 112`. Handling split: I-01 backfill-script; I-02/I-03/I-04/I-05/I-06
  code-fix; I-07 defer (AUDIT-06 deferral list). Plan 07 renumbers I-0N → F-00N by severity
  (4 High, 2 Medium, 1 Low).

