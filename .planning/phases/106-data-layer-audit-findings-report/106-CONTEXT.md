# Phase 106: Data-Layer Audit — Findings Report - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Inventory and audit the **entire Firestore SDK layer** — every read, write, listener, and query across `app/` — and produce **one severity-ranked findings report**. The deliverable is a *report*, not fixes.

**In scope:**
- Static inventory + audit of all Firestore SDK call sites in `app/` (~1,100+ sites: 144 `onSnapshot`, 251 `getDoc`, 171 `getDocs`, 169 `updateDoc`, 64 `addDoc`, 43 `deleteDoc`, 49 `writeBatch`, 0 `runTransaction`, 229 `where`, 34 `limit`).
- Integrity (AUDIT-02): denormalized-field consistency, orphaned references, status-derivation correctness — verified with a **read-only** real-data pass (see D-01).
- Security-rule coverage vs. actual access patterns (AUDIT-03): `firestore.rules` (29 collection rule blocks) reconciled against real code access (21 literal-collection refs + subcollection/journal access).
- Correctness (AUDIT-04): listener lifecycle/leaks, read/write error-handling gaps, legacy-unsafe field reads.
- Efficiency (AUDIT-05): N+1, redundant listeners/reads, client-side filtering that should be queries, caching opportunities.

**Out of scope (belongs to Phase 112 / other phases):**
- Applying any fix, writing any production data, building backfill/remediation scripts (that is Phase 112, AUDIT-06/07 — gated behind review).
- Live *measurement* of drift/orphans for the v4.0 collections beyond the drift-chain (flagged for Phase 112).
- Auditing `archive/`, `.claude/worktrees/`, and node `scripts/` as app code.

</domain>

<decisions>
## Implementation Decisions

### Verification depth (how "verified" is defined)
- **D-01:** The audit is **static code audit + a read-only real-data pass** — not static-only. The static inventory is the core; it is backed by actual numbers from a live read-only run so AUDIT-02's "verified" means *confirmed against data*, not merely code-reasoned.
- **D-02:** Extend `scripts/verify-integrity.js` **minimally** — add ONLY the denormalized **drift-across-chain** check: agreement of `project_code` / `project_name` / `department` across the **MRF → PR → PO → TR → RFP** chain. All checks are read-only `.get()`.
- **D-03:** The script's **existing** live checks (referential integrity, schema, orphan detection over its current 13 collections) still run and their real counts go into the report.
- **D-04:** **v4.0 collections** (proposals, journal issues/progress_updates, DLP baselines, collectibles, billing_requests, rfps, notifications, edit_history, audit_log, etc.) get full **static** coverage in this phase; *live* drift/orphan measurement for them is **flagged as a Phase 112 task**, not built now. This keeps 106 a report phase, not a scripting project.
- **D-05:** Run environment — validate the extended script against **`clmc-procurement-dev` first**, then run **read-only against prod** for the numbers that go into the report (prod is the system of record; dev may be sparse/stale). Prereq: `firebase-admin` + `serviceAccountKey.json`; note that `verify-integrity.js` hardcodes `projectId: 'clmc-procurement'` (prod) and must be pointed at dev for the validation run.

### Report format & finding schema
- **D-06:** **One ranked report**: `106-FINDINGS.md` in the phase dir. Findings ordered **High → Low**, each tagged with its category (integrity / correctness / efficiency / security-rules). A **summary table at the top** (ID · severity · category · collection · one-line) doubles as the index Phase 112 consumes. (Not split-per-category; not a separate JSON index.)
- **D-07:** **Rich per-finding schema with stable IDs.** Every finding: `F-00N` id, severity, category, affected collection(s), `file:line` anchor, impact, recommendation, **handling** (code-fix / backfill-script / defer), and **suggested target phase**. Stable IDs let Phase 112 cite each finding directly and let Low findings flow straight onto the deferral list (AUDIT-06).

### Severity rubric (drives Phase 112's fix/defer gate)
- **D-08:** **Impact-first**, calibrated to *current* data volumes:
  - **High** = correctness/security — wrong data shown to users; denormalized **drift** that misrepresents a record; **orphaned refs** that break a flow; **over/under-permissioned** rules (data exposure or blocked legit access); **silent write failures** (unguarded write path that matters).
  - **Medium** = **listener leaks**; missing error handling on non-critical reads; **N+1** reads; redundant listeners/reads; client-side filtering that should be a query; missing `limit()` on growing collections.
  - **Low** = caching opportunities; micro-optimizations; scale-only concerns (bite only well past current volumes); cosmetic inconsistencies.

### Audit scope boundary
- **D-09:** Audit the **whole `app/` Firestore SDK layer** — every `app/*.js` and `app/views/*.js` that touches Firestore (explicitly includes `proposal-modal.js`, `expense-modal.js`, `engagement-create.js`, `notifications.js`, `auth.js`, `permissions.js`, `utils.js`, `firebase.js`) **plus `firestore.rules`** for AUDIT-03. Not views-only.
- **D-10:** Cover **all collections & subcollections actually in use**, including v4.0. Reconcile the **29** rule blocks against real access (literal `collection(db,'X')` + subcollection/dynamic/journal paths that a naive grep misses).
- **D-11:** **Exclusions (confirmed):** `archive/` (reference-only per CLAUDE.md), `.claude/worktrees/` (duplicate working copies), and node `scripts/` as app code. `scripts/verify-integrity.js` is treated as **tooling we extend** (D-02), not app code we audit.

### Claude's Discretion
- HOW the audit is produced (single-pass vs. fan-out per view/category), exact grep/inspection technique, and the precise `file:line` inventory format — planner/researcher decide. Depth expectation: **exhaustive** call-site coverage over the D-09 surface (not a representative sample), since findings gate the rest of v4.2.
- Whether Phase 106 pre-seeds the Phase 112 deferral list vs. Phase 112 extracting Low findings from `106-FINDINGS.md` — default: the report is the source of truth; 112 extracts. Adjust if planning surfaces a reason.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/ROADMAP.md` § "Phase 106" — goal, depends-on, 4 success criteria; also Phase 112 (§ "Phase 112") for the remediation/backfill split this report feeds.
- `.planning/REQUIREMENTS.md` — AUDIT-01…AUDIT-05 (this phase) and AUDIT-06/07 (Phase 112, shows what the report must enable).

### Data-layer tooling (the thing we extend)
- `scripts/verify-integrity.js` — existing Firestore integrity checker (firebase-admin; read-only `.get()`; hardcodes prod `projectId: 'clmc-procurement'`). Covers 13 collections: mrfs, prs, pos, transport_requests, suppliers, projects, services, users, clients, role_templates, invitation_codes, deleted_mrfs, deleted_users. Does **NOT** yet check drift-across-chain or the v4.0 collections. Phase 112 backfills are meant to build on this same script.

### Security rules (AUDIT-03 target)
- `firestore.rules` — 1,066 lines, 29 collection match blocks: activity_entries, audit_log, baselines, billing_requests, client_errors, clients, collectibles, deleted_mrfs, deleted_users, edit_history, invitation_codes, issues, mrfs, notifications, pos, progress_updates, project_iterations, project_tasks, projects, proposals, prs, rfps, role_templates, service_tasks, services, suppliers, transport_requests, users (+ the `databases` meta-match).

### Schema, patterns & gotchas
- `CLAUDE.md` — Firestore schema (collections + denormalized `project_code`/`project_name`/`department`), listener-management pattern (`listeners[]` + `destroy()`), case-sensitive status matching, `JSON.parse(items_json)` requirement, DOM-selection rules. This is the audit's checklist basis.
- `spike-findings-pr-po` (project-local skill: `.claude/skills/spike-findings-pr-po/`) — validated data-layer patterns, constraints, and landmines. Invoke via `Skill("spike-findings-pr-po")`.

### Existing concerns (starting point — re-verify, do not trust blindly)
- `.planning/codebase/CONCERNS.md` — **STALE (dated 2026-01-23)**: predates auth (v2.0) and in-repo rules, so items like "No Authentication System" / "rules not in repo" are already resolved. Use as a lead list only; every item must be re-confirmed against current code. Still-plausible leads worth checking: sequential-ID race (0 `runTransaction` confirms), listener-array discipline, no `limit()` on large-collection listeners, JSON-string `items_json` storage.
- Other maps if useful: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-integrity.js`: the base to extend (D-02). Its `fetchCollection`, lookup-map, and section-formatter structure directly accommodates a new drift-across-chain check.
- `firestore.rules`: enumerated 29-collection surface for the AUDIT-03 rules-vs-access reconciliation.
- Listener-array cleanup pattern already present in 12 view modules (`engagement-create.js`, `assignments.js`, `clients.js`, `finance.js`, `home.js`, `procurement.js`, `project-plan.js`, `projects.js`, `role-config.js`, `service-plan.js`, `services.js`, `user-management.js`) — audit these for completeness (every `onSnapshot` pushed to the array AND cleared in `destroy()`).

### Established Patterns (the audit's inspection targets)
- Real-time: `onSnapshot(...)` → `listeners.push(...)` → `destroy()` unsubscribes. Leak = a listener not tracked or not cleared. Note router **does not** call `destroy()` on same-view tab switches (CLAUDE.md) — check for listener re-creation without teardown.
- Denormalized fields copied at write time: `project_code` / `project_name` / `department` flow MRF → PR → PO → TR → RFP. Drift = downstream copy disagrees with the `projects`/`services` source of truth.
- Sequential IDs generated by max-scan of existing docs; **0 `runTransaction`** across `app/` → concurrent-submit race is real (High-candidate).
- Case-sensitive status strings (`'Pending'` not `'pending'`) and `JSON.parse(items_json)` — both silent-failure surfaces (legacy-unsafe reads, AUDIT-04).
- `where`-heavy (229) but `limit`-light (34) → listeners/queries over growing collections without bounds (efficiency, AUDIT-05).

### Integration Points
- **Upstream deps:** none — Phase 106 is the first v4.2 phase, sequenced early so findings inform the UI phases.
- **Downstream consumers:** Phases 107–111 (UI) read the report to avoid building on broken data-layer reads; **Phase 112** (AUDIT-06/07) is the direct consumer — it fixes High/Medium behind a review gate, defers Low to a tracked list, and writes backfill scripts *built on* the (now drift-aware) `verify-integrity.js`. The report's stable finding IDs + handling/target fields are the 112 handoff contract.

</code_context>

<specifics>
## Specific Ideas

- Report file name: `106-FINDINGS.md` in the phase dir, ranked High→Low, summary table on top (the table = Phase 112 index).
- Finding ID format: `F-001`, `F-002`, … (stable, referenced by Phase 112).
- The drift check is the ONE new capability added to `verify-integrity.js` this phase — resist scope-creeping it into v4.0-collection live checks (those are Phase 112).

</specifics>

<deferred>
## Deferred Ideas

- **Live drift/orphan measurement for v4.0 collections** (proposals, collectibles, billing_requests, journal issues/progress, rfps orphans, DLP baselines) — static-covered now; measure against real data in **Phase 112** where remediation happens.
- **Remediation/backfill** of any drift, orphans, or mis-permissioned rules the report finds — **Phase 112** (AUDIT-06/07), behind a review gate with dry-run + typed confirmation.
- **Structural fixes** raised by CONCERNS.md that exceed "data-layer audit" (window-function global pollution, monolithic file split, no-build reconsideration, XSS/DOMPurify, CSP hardening) — not this milestone; note only if they surface as data-layer findings.

</deferred>

---

*Phase: 106-data-layer-audit-findings-report*
*Context gathered: 2026-07-09*
