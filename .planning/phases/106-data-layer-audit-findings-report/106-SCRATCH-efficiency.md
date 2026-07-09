---
phase: 106-data-layer-audit-findings-report
plan: 05
requirement: AUDIT-05
artifact: 106-SCRATCH-efficiency.md
dimension: efficiency
provides: "efficiency findings (temp IDs E-0N) in canonical D-07 schema for Plan 07 (merged/re-IDed to F-00N)"
tempid_prefix: "E-"
severities_used: [Medium, Low]  # D-08: efficiency findings are NEVER High
source_anchor_map: 106-INVENTORY.md
getdocs_read_sites_examined: 136
generated: 2026-07-09
---

# Phase 106 — AUDIT-05: Efficiency Findings (static, scratch)

Static efficiency audit of the whole `app/` Firestore data layer, driven by the
`106-INVENTORY.md` anchor map (136 getDocs · 61 onSnapshot · where 182 vs limit 12). Findings
carry temp IDs `E-0N` in the **canonical D-07 schema** and **D-08 severities** — efficiency
findings are **Medium or Low, never High**. v4.0 collections get **static** coverage here; live
per-volume measurement is deferred to Phase 112 (D-04). Plan 07 merges these into `106-FINDINGS.md`
(re-IDed `F-00N` by severity); Phase 112 (AUDIT-06/07) owns remediation behind the review gate.

**No fix is applied in this phase.** This is a read-only findings report.

## Summary table (E-0N index)

| ID | severity | category | collection(s) | one-line |
|----|----------|----------|---------------|----------|
| E-01 | Medium | efficiency | pos, rfps, projects, services, clients, collectibles, suppliers, billing_requests | ~17 whole-collection `onSnapshot` listeners with **no `limit()`** — the where(182)-vs-limit(12) imbalance; every one of the 12 limits is on notifications/journal, zero business listeners are bounded |
| E-02 | Medium | efficiency | prs, pos, transport_requests, rfps (per mrfs / projects / services) | N+1 per-row `getDocs` fan-out building MRF→PR/PO/TR record rows, CSV export, and finance project/service scoreboards |
| E-03 | Medium | efficiency | rfps (per pos / transport_requests) | N+1 per-PO / per-TR RFP payment-check reads inside the MRF cancel / force-recall loop |
| E-04 | Medium | efficiency | mrfs, pos, transport_requests | Whole-collection `getDocs` then client-side narrowing (assigned-scope filter, client-side pagination, dedup) that a `where()` / `limit()` could do server-side |
| E-05 | Medium | efficiency | pos, prs, transport_requests | Whole-collection `getDocs` max-scan for sequential-ID generation — reads the **entire** pos/prs/TR collection on every create just to compute one max number |
| E-06 | Medium | efficiency | projects, clients, collectibles, services | Redundant duplicate whole-collection `onSnapshot` listeners for the same near-static reference collections across many views — no shared store |
| E-07 | Medium | efficiency | mrfs, prs, pos, transport_requests, rfps | Fetch-to-count: reads full document sets solely for `.size`, where the established `getAggregateFromServer(count())` pattern reads server-side |
| E-08 | Low | efficiency | suppliers | Caching opportunity — near-static `suppliers` re-read (`getDocs`) and separately re-subscribed (`onSnapshot`) on every view entry |
| E-09 | Low | efficiency | projects, services, clients, role_templates | Caching opportunity — near-static reference data re-fetched whole on every view entry; no module-level shared cache |

---

## Findings (canonical D-07 schema)

### E-01 — ~17 whole-collection real-time listeners missing `limit()` (the where-vs-limit imbalance)
- severity: Medium
- category: efficiency
- collection: pos, rfps, projects, services, clients, collectibles, suppliers, billing_requests
- anchor: app/views/finance.js:1326 (rfps), app/views/finance.js:1336 (pos), app/views/finance.js:1992 (collectibles), app/views/finance.js:2006 (projects), app/views/finance.js:2025 (services), app/views/finance.js:2045 (billing_requests), app/views/procurement.js:5004 (suppliers), app/views/procurement.js:7426 (rfps), app/views/projects.js:432 (clients), app/views/projects.js:848 (projects), app/views/projects.js:865 (collectibles), app/views/services.js:449 (clients), app/views/assignments.js:192 (projects), app/views/assignments.js:201 (services), app/views/clients.js:191 (clients), app/views/home.js:779 (pos), app/views/user-management.js:276 (projects)
- impact: `106-INVENTORY.md` recon: **where 182 vs limit 12** (context/roadmap quote 183) — and **all 12 `limit()` calls sit on `notifications` (6) + journal subcollections (6× `limit(50)`)**. **Zero** whole-collection business listeners are bounded. Each of these ~17 `onSnapshot(collection(db,'X'))` streams every document in a growing collection into the client and re-runs the render callback on every change; read cost, snapshot payload, and re-render work grow linearly (O(collection size)) forever. Bites at scale, not at current volumes (hence Medium, not High).
- recommendation: Add `limit(N)` + `orderBy(...)` to the listener queries, or narrow with `where(...)` to the rows the view actually shows (e.g. finance PO list bounded to a recent window / status; projects/services scoped to assignment). Where a full set is genuinely needed, page it or move to an on-demand `getDocs` + explicit refresh instead of a live whole-collection stream. `notifications` (limit 10/11/PAGE_SIZE) and the journal subcollections (limit 50) are the correct model to copy.
- handling: code-fix
- target_phase: 112

**Unbounded whole-collection listeners (the zero-`limit()` set) — supporting anchor table:**

| listener (file.js:line) | collection | bounded? |
|-------------------------|-----------|:--------:|
| app/views/finance.js:1326 | rfps | no limit |
| app/views/finance.js:1336 | pos | no limit |
| app/views/finance.js:1992 | collectibles | no limit |
| app/views/finance.js:2006 | projects | no limit |
| app/views/finance.js:2025 | services | no limit |
| app/views/finance.js:2045 | billing_requests | no limit |
| app/views/procurement.js:5004 | suppliers | no limit |
| app/views/procurement.js:7426 | rfps | no limit |
| app/views/projects.js:432 | clients | no limit |
| app/views/projects.js:848 | projects | no limit |
| app/views/projects.js:865 | collectibles | no limit |
| app/views/services.js:449 | clients | no limit |
| app/views/assignments.js:192 | projects | no limit |
| app/views/assignments.js:201 | services | no limit |
| app/views/clients.js:191 | clients | no limit |
| app/views/home.js:779 | pos | no limit |
| app/views/user-management.js:276 | projects | no limit |

*(home.js:748 `mrfs where status==Pending` and home.js:768 `prs where finance_status==Pending` are `where`-scoped so they are naturally bounded by the pending backlog — acceptable, still no explicit `limit()`.)*

### E-02 — N+1 per-row `getDocs` fan-out (record tables, CSV export, finance scoreboards)
- severity: Medium
- category: efficiency
- collection: prs, pos, transport_requests, rfps (fanned out per mrfs / projects / services row)
- anchor: app/views/mrf-records.js:1414, app/views/mrf-records.js:1443, app/views/mrf-records.js:1477 (loop `pageItems.map(async mrf => …)` @1388); app/views/procurement.js:5771, app/views/procurement.js:5809, app/views/procurement.js:5847, app/views/procurement.js:5884 (per-MRF builder loop @5758); app/views/procurement.js:5610, app/views/procurement.js:5627 (CSV export `.map(async mrf => …)` @~5590); app/views/finance.js:4473, app/views/finance.js:4494 (per-project loop @4476); app/views/finance.js:4736, app/views/finance.js:4738, app/views/finance.js:4807, app/views/finance.js:4809 (per-service loops @4726 / recurring)
- impact: For each outer row (MRF / project / service) the code issues a fresh per-row `getDocs(where('…_id','==', row))`. A page of N MRFs = up to 3N reads (PR+PO+TR); the CSV export and scoreboards fan out over the **entire** (filtered) set. Read count and latency scale with row count. Finance scoreboards already use `getAggregateFromServer(count()/sum())` for PO/TR totals (the efficient pattern) but still fan out a per-project/per-service `getDocs(rfps …)` for fee data. Mitigations already present: mrf-records `_subDataCache` (mrf-records.js:1402) and procurement `_prpoSubDataCache` (procurement.js:5760) cache per-MRF sub-data across re-renders, so the fan-out is per first-load, not per paint — which is why this is Medium, not High.
- recommendation: Replace the per-row loops with a **single bulk read + in-memory join**: fetch the child rows for the whole visible page/set with `where('mrf_id','in',[…])` in 10-item chunks (the code already does exactly this at finance.js:5323/5378 and project-detail.js:1985 / service-detail.js:1569 — copy that batched pattern), then group by parent id client-side. Keep the existing caches. For the CSV export, batch the same way instead of awaiting per-MRF inside `.map`.
- handling: code-fix
- target_phase: 112

### E-03 — N+1 per-PO / per-TR RFP payment-check reads in MRF cancel / force-recall
- severity: Medium
- category: efficiency
- collection: rfps (fanned out per pos / transport_requests)
- anchor: app/views/procurement.js:964 (`for (const po of pos)` @962), app/views/procurement.js:976 (`for (const tr of trs)` @974), app/views/procurement.js:1010 (`for (const po of pendingPOs)` @1004)
- impact: `cancelMRFPRs()` loops the MRF's POs and TRs and issues one `getDocs(query(rfps, where('po_id'|'tr_id','==', …)))` per iteration to check for recorded payments, then a second per-PO RFP read in the force-recall branch. Fan-out is bounded by the number of POs/TRs on a **single** MRF (usually small), so real-world cost is modest — but it is the canonical N+1 shape and grows with PO/TR count per MRF.
- recommendation: Fetch the MRF's RFPs once (`where('po_id','in',[…poIds])` / `where('tr_id','in',[…trIds])` in 10-chunks) and evaluate `rfpHasPaidAmount` in memory; reuse the same set for the force-recall delete pass instead of re-querying at line 1010.
- handling: code-fix
- target_phase: 112

### E-04 — Whole-collection `getDocs` then client-side narrowing (scope filter / pagination / dedup)
- severity: Medium
- category: efficiency
- collection: mrfs, pos, transport_requests
- anchor: app/views/procurement.js:5358 (whole `mrfs`, then `.filter(isMrfInAssignedScope)` @5395), app/views/procurement.js:5399 (whole `pos`, then client-side scope filter @5414), app/views/mrf-records.js:1167 (`mrfs where status in […]`, no `limit()` — full result then client-side pagination via `itemsPerPage`), app/views/procurement.js:3786, app/views/procurement.js:4515 (whole `mrfs` one-shot lookups), app/views/procurement.js:6544 (whole `transport_requests`), app/views/mrf-form.js:1277 (whole `mrfs`), app/utils.js:232 (generic `getDocs(collection(db, collectionName))` helper — whole-collection by construction)
- impact: `loadPRPORecords` pulls **all** mrfs and **all** pos, then discards out-of-assigned-scope rows in JavaScript; the records list query (mrf-records.js:1167) fetches every status-matching MRF and paginates in the client. As mrfs/pos grow, the client downloads and processes rows it immediately throws away — bandwidth, memory, and CPU scale with total collection size rather than with what is shown. (The union project-OR-service scope is genuinely awkward to express as one Firestore query, which partly justifies the client filter — noted, still a scale liability.)
- recommendation: Push the predicate server-side where possible: `where('status','in', …)` + `limit()` + cursor pagination for the records list; scope the mrfs/pos reads with `where` on the assigned project/service codes (or `array-contains`), chunked, instead of fetching the whole collection and filtering. For the generic utils.js:232 helper, require callers to pass a constrained query.
- handling: code-fix
- target_phase: 112

### E-05 — Whole-collection `getDocs` max-scan for sequential-ID generation
- severity: Medium
- category: efficiency
- collection: pos, prs, transport_requests
- anchor: app/views/finance.js:6227 (`getDocs(posRef)` → scan all `pos` for `maxPONum`), app/views/procurement.js:6782 (`getDocs(prsRef)` → scan all `prs` for `maxPRNum`), app/views/procurement.js:7115 (`getDocs(prsRef)` → all `prs`, second generate-PR path), app/views/procurement.js:7221 (`getDocs(trsRef)` → all `transport_requests` before adding a TR)
- impact: Every PO/PR/TR creation reads the **entire** target collection into the client purely to compute the next sequential number by max-scan (`maxPONum`/`maxPRNum`). Read count per create = current collection size; this only grows. This is the read-cost sibling of the `runTransaction = 0` ID-race lead (that concurrency race is Plan 03's integrity finding; **this** finding is the efficiency cost of the scan itself).
- recommendation: Avoid scanning the whole collection: query only the current-month prefix with `where(field,'>=',prefix) + where(field,'<',prefix+'') + orderBy(field,'desc') + limit(1)` (the proposal-id.js:26-27 range pattern already does this), or move the counter to a dedicated monotonic-id doc updated in a transaction (also resolves the Plan 03 race). Reads drop from O(collection) to O(1).
- handling: code-fix
- target_phase: 112

### E-06 — Redundant duplicate whole-collection listeners for the same reference collections
- severity: Medium
- category: efficiency
- collection: projects, clients, collectibles, services
- anchor: projects — app/views/finance.js:2006, app/views/projects.js:848, app/views/assignments.js:192, app/views/user-management.js:276; clients — app/views/clients.js:191, app/views/projects.js:432, app/views/services.js:449; collectibles — app/views/finance.js:1992, app/views/projects.js:865; services — app/views/finance.js:2025, app/views/assignments.js:201
- impact: The same near-static reference collections are independently `onSnapshot`-subscribed by multiple views — `projects` from **four** modules, `clients` from **three**, `collectibles` and `services` from **two** each. Each view opens its own whole-collection stream (compounding E-01) and re-downloads the same data; there is no shared/module-level source. Redundant reads + redundant re-render work whenever any of these collections changes. Note also procurement subscribes to `mrfs` via status queries (procurement.js:3005/3052) while separately `getDocs`-scanning whole `mrfs` (E-04) — same data pulled two ways within one view.
- recommendation: Introduce a single shared reference-data store (module-level cache with one listener per collection, or a small pub/sub) that views subscribe to, instead of each view opening its own whole-collection listener. Combine with E-01's `limit()`/scoping so the shared stream is itself bounded.
- handling: code-fix
- target_phase: 112

### E-07 — Fetch-to-count: full document reads used only for `.size`
- severity: Medium
- category: efficiency
- collection: mrfs, prs, pos, transport_requests, rfps
- anchor: app/views/project-detail.js:2078, app/views/project-detail.js:2079, app/views/project-detail.js:2080, app/views/project-detail.js:2081, app/views/project-detail.js:2082 (`getDocs(query(…, where('project_id','==', …))).then(s => s.size)`)
- impact: Five collections are fetched **in full** for a project solely to read `s.size` (a count). This downloads every matching document just to count it, when the codebase already uses the server-side `getAggregateFromServer(count())` pattern elsewhere (finance.js:4485/4489, project-detail.js:1799/1810, service-detail.js:1448-1478). If the sibling data reads at project-detail.js:2162-2166 (same five `where('project_id','==', …)` queries, kept for data) run in the same view entry, these count reads are additionally **fully redundant** with them.
- recommendation: Replace the `.then(s => s.size)` reads with `getAggregateFromServer(q, { n: count() })` (reads server-side, returns only the number), or derive the counts from the 2162-2166 data reads if those already run — eliminating the duplicate fetch.
- handling: code-fix
- target_phase: 112

### E-08 — Caching opportunity: near-static `suppliers` re-read and re-subscribed per view
- severity: Low
- category: efficiency
- collection: suppliers
- anchor: app/utils.js:451 (`getDocs(collection(db, 'suppliers'))` — shared helper, whole collection), app/views/procurement.js:5004 (`onSnapshot(collection(db, 'suppliers'))` — whole-collection live stream)
- impact: `suppliers` changes rarely (manual CRUD in the supplier admin tab) but is both re-fetched whole via the utils helper and separately live-subscribed by procurement on each entry. Pure caching / scale-only concern — negligible at current volumes, hence Low.
- recommendation: Cache suppliers in a module-level store with a short TTL (or a single shared listener) and serve views from the cache; invalidate on supplier create/update/delete. Low priority — flows onto the AUDIT-06 deferral list.
- handling: defer
- target_phase: 112

### E-09 — Caching opportunity: near-static reference data re-fetched whole on every view entry
- severity: Low
- category: efficiency
- collection: projects, services, clients, role_templates
- anchor: app/proposal-modal.js:212 (whole `projects`), app/proposal-modal.js:213 (whole `clients`), app/views/project-detail.js:2032 (whole `clients`), app/utils.js:277, app/utils.js:283, app/utils.js:367, app/utils.js:373 (repeated projects/services code-range scans), app/permissions.js:92 (`role_templates` listener — near-static)
- impact: Reference collections that change infrequently (projects/services/clients master data, role_templates) are re-read whole (or re-scanned by code-range) on each modal open / view entry, with no shared cache. Repeated bandwidth + parse cost; scale-only / micro-optimization, so Low.
- recommendation: Add a lightweight shared reference cache (module-level, invalidated on the rare writes) reused across proposal-modal, project-detail, utils code-range helpers, and permissions. Overlaps with E-06's shared-store recommendation. Low priority — AUDIT-06 deferral list.
- handling: defer
- target_phase: 112

---

## v4.0 collection coverage (D-04)

v4.0 collections that touch efficiency-sensitive read paths are covered **statically** above:
`rfps`, `collectibles`, `billing_requests` (unbounded whole-collection listeners → E-01, E-06),
`proposals` (all reads are `where('project_id','==', …)` scoped — clean), journal subcollections
`activity_entries` / `progress_updates` / `issues` (correctly `limit(50)` bounded — the good model),
`baselines` (per-project subcollection, small — clean), `notifications` (correctly `limit()`
bounded — clean). **Live per-volume measurement of these read costs is deferred to Phase 112**
(D-04); this plan asserts only the static shape.

---

## Coverage Ledger — read sites (all 136 `getDocs` call-sites from 106-INVENTORY.md)

Every `getDocs` call-site in the inventory, each classified `clean` or `flagged`. Proves the whole
read surface was examined for N+1 / client-side-filtering / missing-limit — not just the flagged
ones. **Clean = 97 · Flagged = 39 · Total = 136.** Flagged rows point to the E-0N finding.
(`onSnapshot` listener sites are audited separately under E-01/E-06 and are not repeated here.)

| getDocs site (file.js:line) | verdict | note |
|-----------------------------|---------|------|
| app/auth.js:72 | clean | invitation_codes `where(code==) + where(status==active)` — indexed unique lookup |
| app/coll-id.js:43 | clean | collectibles `where(scope==)` — scoped max-scan for collectible id, per-scope bounded |
| app/edit-history.js:120 | clean | edit_history subcollection `orderBy(timestamp)` — bounded to one parent doc's history |
| app/expense-modal.js:44 | clean | pos `where(service_code==)` — scoped |
| app/expense-modal.js:45 | clean | transport_requests `where(service_code==)` — scoped |
| app/expense-modal.js:49 | clean | projects `where(project_name==)` — scoped |
| app/expense-modal.js:55 | clean | pos `where(project_name==)` — scoped |
| app/expense-modal.js:56 | clean | transport_requests `where(project_name==)` — scoped |
| app/expense-modal.js:65 | clean | rfps `where(service_code==)` — scoped |
| app/expense-modal.js:70 | clean | projects `where(project_name==)` — scoped |
| app/expense-modal.js:76 | clean | rfps `where(project_code==)` — scoped |
| app/expense-modal.js:97 | clean | collectibles `where(service_code==)` — scoped |
| app/expense-modal.js:101 | clean | billing_requests `where(service_code==)` — scoped |
| app/expense-modal.js:108 | clean | projects `where(project_name==)` — scoped |
| app/expense-modal.js:114 | clean | collectibles `where(project_code==)` — scoped |
| app/expense-modal.js:119 | clean | billing_requests `where(project_code==)` — scoped (13 scoped reads/open, none whole-collection) |
| app/notifications.js:249 | clean | notifications `where(user_id==) + limit(10)` — bounded |
| app/notifications.js:388 | clean | notifications `where(user_id==)+where(read==false) + limit(11)` — bounded |
| app/notifications.js:558 | clean | users `where(role in)+where(status==active)` — scoped |
| app/proposal-id.js:29 | clean | proposals `where(proposal_id range)` — range-bounded max-scan (the good ID pattern) |
| app/proposal-modal.js:212 | flagged | whole `projects` — near-static ref re-read per modal → E-09 |
| app/proposal-modal.js:213 | flagged | whole `clients` — near-static ref re-read per modal → E-09 |
| app/service-task-id.js:42 | clean | service_tasks `where(service_code==)` — scoped max-scan |
| app/task-id.js:42 | clean | project_tasks `where(project_code==)` — scoped max-scan |
| app/utils.js:232 | flagged | generic `getDocs(collection(db, collectionName))` — whole-collection by construction → E-04 |
| app/utils.js:277 | clean | projects `where(client_code==)+code range` — scoped |
| app/utils.js:283 | clean | services `where(client_code==)+code range` — scoped |
| app/utils.js:367 | clean | projects `where(client_code==)+code range` — scoped |
| app/utils.js:373 | clean | services `where(client_code==)+code range` — scoped |
| app/utils.js:434 | clean | projects `where(status==active)` — scoped (active-projects helper) |
| app/utils.js:451 | flagged | whole `suppliers` — near-static ref, caching opportunity → E-08 |
| app/views/clients.js:243 | clean | projects `where(client_code==)` — scoped (client detail expand) |
| app/views/clients.js:244 | clean | services `where(client_code==)` — scoped |
| app/views/finance.js:3608 | clean | pos `where(po_id==)` — scoped single |
| app/views/finance.js:3726 | clean | transport_requests `where(tr_id==)` — scoped single |
| app/views/finance.js:4473 | flagged | whole `projects` feeding per-project scoreboard fan-out @4476 → E-02 |
| app/views/finance.js:4494 | flagged | rfps `where(project_code==)` per-project inside scoreboard loop → E-02 (N+1) |
| app/views/finance.js:4722 | clean | services `where(service_type==one-time)` — scoped feeder (per-row reads flagged separately) |
| app/views/finance.js:4736 | flagged | transport_requests `where(service_code==)` per-service loop → E-02 (N+1) |
| app/views/finance.js:4738 | flagged | rfps `where(service_code==)` per-service loop → E-02 (N+1) |
| app/views/finance.js:4793 | clean | services `where(service_type==recurring)` — scoped feeder |
| app/views/finance.js:4807 | flagged | transport_requests `where(service_code==)` per-service loop → E-02 (N+1) |
| app/views/finance.js:4809 | flagged | rfps `where(service_code==)` per-service loop → E-02 (N+1) |
| app/views/finance.js:5323 | clean | mrfs `where(mrf_id in chunk)` — BATCHED 10-chunk (the good join pattern) |
| app/views/finance.js:5378 | clean | mrfs `where(mrf_id in chunk)` — BATCHED 10-chunk |
| app/views/finance.js:5735 | clean | transport_requests `where(finance_status==Approved)+date range` — scoped |
| app/views/finance.js:6171 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/finance.js:6227 | flagged | whole `pos` max-scan for `maxPONum` on every PO create → E-05 |
| app/views/finance.js:6534 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/mrf-form.js:505 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/mrf-form.js:1277 | flagged | whole `mrfs` one-shot scan → E-04 |
| app/views/mrf-records.js:883 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/mrf-records.js:887 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/mrf-records.js:891 | clean | transport_requests `where(mrf_id==)` — scoped single |
| app/views/mrf-records.js:895 | clean | pos `where(mrf_id==)+orderBy` — scoped single |
| app/views/mrf-records.js:1167 | flagged | mrfs `where(status in)` no `limit()` — full result, client-side pagination → E-04 |
| app/views/mrf-records.js:1414 | flagged | prs `where(mrf_id==)` per-MRF inside `pageItems.map` @1388 → E-02 (N+1) |
| app/views/mrf-records.js:1443 | flagged | pos `where(mrf_id==)` per-MRF loop → E-02 (N+1) |
| app/views/mrf-records.js:1477 | flagged | transport_requests `where(mrf_id==)` per-MRF loop → E-02 (N+1) |
| app/views/notifications.js:147 | clean | notifications `where(user_id==) + limit(PAGE_SIZE)` — bounded |
| app/views/notifications.js:173 | clean | notifications `where(user_id==) + limit(PAGE_SIZE)` — bounded |
| app/views/notifications.js:210 | clean | notifications `where(user_id==) + limit(PAGE_SIZE)` — bounded |
| app/views/notifications.js:221 | clean | notifications `where(user_id==) + limit(PAGE_SIZE)` — bounded |
| app/views/procurement.js:507 | clean | rfps `where(po_id==)` — scoped single |
| app/views/procurement.js:529 | clean | rfps `where(tr_id==)` — scoped single |
| app/views/procurement.js:925 | clean | prs `where(mrf_id==)` — scoped single (cancelMRFPRs, one MRF) |
| app/views/procurement.js:930 | clean | transport_requests `where(mrf_id==)` — scoped single |
| app/views/procurement.js:940 | clean | pos `where(mrf_id==)` — scoped single |
| app/views/procurement.js:964 | flagged | rfps `where(po_id==)` per-PO loop @962 → E-03 (N+1) |
| app/views/procurement.js:976 | flagged | rfps `where(tr_id==)` per-TR loop @974 → E-03 (N+1) |
| app/views/procurement.js:1010 | flagged | rfps `where(po_id==)` per-PO force-recall loop @1004 → E-03 (N+1) |
| app/views/procurement.js:2669 | clean | pos `where(supplier_name==)+orderBy(date)` — scoped |
| app/views/procurement.js:2910 | clean | services `where(service_code in)/where(active==true)` — scoped |
| app/views/procurement.js:3685 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:3686 | clean | pos `where(mrf_id==)` — scoped single |
| app/views/procurement.js:3687 | clean | transport_requests `where(mrf_id==)` — scoped single |
| app/views/procurement.js:3786 | flagged | whole `mrfs` one-shot scan → E-04 |
| app/views/procurement.js:4515 | flagged | whole `mrfs` one-shot scan → E-04 |
| app/views/procurement.js:4699 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:4703 | clean | pos `where(mrf_id==)` — scoped single |
| app/views/procurement.js:4707 | clean | transport_requests `where(mrf_id==)` — scoped single |
| app/views/procurement.js:5358 | flagged | whole `mrfs` then `.filter(isMrfInAssignedScope)` @5395 → E-04 (client-side filter) |
| app/views/procurement.js:5399 | flagged | whole `pos` then client-side scope filter @5414 → E-04 |
| app/views/procurement.js:5610 | flagged | prs `where(mrf_id==)` per-MRF CSV export map @~5590 → E-02 (N+1) |
| app/views/procurement.js:5627 | flagged | pos `where(mrf_id==)` per-MRF CSV export map → E-02 (N+1) |
| app/views/procurement.js:5771 | flagged | prs `where(mrf_id==)` per-MRF builder loop @5758 → E-02 (N+1) |
| app/views/procurement.js:5809 | flagged | transport_requests `where(mrf_id==)` per-MRF builder loop → E-02 (N+1) |
| app/views/procurement.js:5847 | flagged | pos `where(mrf_id==)` per-MRF builder loop → E-02 (N+1) |
| app/views/procurement.js:5884 | flagged | transport_requests `where(mrf_id==)` per-MRF builder loop → E-02 (N+1) |
| app/views/procurement.js:6544 | flagged | whole `transport_requests` one-shot scan → E-04 |
| app/views/procurement.js:6756 | clean | prs `where(mrf_id==)` — scoped single (existing-PR check) |
| app/views/procurement.js:6782 | flagged | whole `prs` max-scan for `maxPRNum` on PR create → E-05 |
| app/views/procurement.js:7089 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:7115 | flagged | whole `prs` max-scan for `maxPRNum` (second generate path) → E-05 |
| app/views/procurement.js:7221 | flagged | whole `transport_requests` max-scan before TR create → E-05 |
| app/views/procurement.js:7915 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:7946 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:7952 | clean | projects `where(project_name==)` — scoped single |
| app/views/procurement.js:7973 | clean | services `where(service_code==)` — scoped single |
| app/views/procurement.js:8543 | clean | mrfs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:8558 | clean | prs `where(mrf_id==)` — scoped single |
| app/views/procurement.js:8567 | clean | transport_requests `where(mrf_id==)` — scoped single |
| app/views/procurement.js:8577 | clean | pos `where(mrf_id==)+orderBy` — scoped single |
| app/views/project-detail.js:1824 | clean | rfps `where(project_code==)` — scoped |
| app/views/project-detail.js:1852 | clean | collectibles `where(project_code==)` — scoped |
| app/views/project-detail.js:1973 | clean | pos `where(project_name==)` — scoped |
| app/views/project-detail.js:1985 | clean | mrfs `where(mrf_id in chunk)` — BATCHED 10-chunk (good pattern) |
| app/views/project-detail.js:2032 | flagged | whole `clients` — near-static ref re-read → E-09 |
| app/views/project-detail.js:2078 | flagged | mrfs `where(project_id==)` fetched full for `.size` → E-07 (use count()) |
| app/views/project-detail.js:2079 | flagged | prs `where(project_id==)` fetched full for `.size` → E-07 |
| app/views/project-detail.js:2080 | flagged | pos `where(project_id==)` fetched full for `.size` → E-07 |
| app/views/project-detail.js:2081 | flagged | transport_requests `where(project_id==)` fetched full for `.size` → E-07 |
| app/views/project-detail.js:2082 | flagged | rfps `where(project_id==)` fetched full for `.size` → E-07 |
| app/views/project-detail.js:2162 | clean | mrfs `where(project_id==)` — scoped data fetch |
| app/views/project-detail.js:2163 | clean | prs `where(project_id==)` — scoped data fetch |
| app/views/project-detail.js:2164 | clean | pos `where(project_id==)` — scoped data fetch |
| app/views/project-detail.js:2165 | clean | transport_requests `where(project_id==)` — scoped data fetch |
| app/views/project-detail.js:2166 | clean | rfps `where(project_id==)` — scoped data fetch |
| app/views/project-detail.js:2493 | clean | proposals `where(project_id==)` — scoped |
| app/views/project-detail.js:4149 | clean | proposals `where(project_id==)` — scoped |
| app/views/project-plan.js:258 | clean | projects `where(project_code==)` — scoped single |
| app/views/project-plan.js:3169 | clean | baselines subcollection `orderBy(created_at)` — scoped to one project |
| app/views/project-plan.js:3201 | clean | baselines subcollection count — scoped to one project, small |
| app/views/project-plan.js:3449 | clean | project_iterations `where(project_id==)` — scoped |
| app/views/project-plan.js:3778 | clean | project_tasks `where(project_id==)` — scoped |
| app/views/project-plan.js:3861 | clean | project_tasks `where(project_id==)` — scoped |
| app/views/projects.js:1360 | clean | collectibles `where(project_code==)` — scoped |
| app/views/service-detail.js:1489 | clean | rfps `where(service_code==)` — scoped |
| app/views/service-detail.js:1520 | clean | collectibles `where(service_code==)` — scoped |
| app/views/service-detail.js:1557 | clean | pos `where(service_code==)` — scoped |
| app/views/service-detail.js:1569 | clean | mrfs `where(mrf_id in chunk)` — BATCHED 10-chunk (good pattern) |
| app/views/service-detail.js:1881 | clean | proposals `where(project_id==)` — scoped |
| app/views/service-detail.js:3789 | clean | proposals `where(project_id==serviceId)` — scoped |
| app/views/service-plan.js:170 | clean | services `where(service_code==)` — scoped single |
| app/views/services.js:1411 | clean | collectibles `where(service_code==)` — scoped |
| app/views/user-management.js:1769 | clean | invitation_codes `where(status==active)` — scoped |

**Ledger totals: 97 clean · 39 flagged · 136 read-sites examined.**

Flagged-by-finding: E-02 (15), E-03 (3), E-04 (8), E-05 (4), E-07 (5), E-08 (1), E-09 (3).
E-01 and E-06 are listener-based (`onSnapshot`) and are anchored in their finding blocks above,
not in this `getDocs` ledger.
