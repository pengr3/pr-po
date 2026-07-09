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

<!-- Task 2 appends I-03..I-07 + the Coverage Ledger below. -->
