# Phase 102: DLP & Retention Management — Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Source:** Spike-validated plan-now path (Spikes 034 + 035 + 036). No discuss-phase — the three spike verdicts + READMEs are the locked design contract (same precedent as Phases 99.1/99.2/99.3/100/101).

<domain>
## Phase Boundary

This phase delivers **post-award DLP (Defect Liability Period) & retention tracking** for projects, in three connected parts:

1. **Inline collection-tranche editor** in `project-detail.js` (Spike 035) — lets On-going projects add/edit/label/allocate `collection_tranches` and flag one **retention tranche**, closing the gap where tranches were only settable at project creation (`projects.js` edit modal).
2. **DLP field capture at the completion gate** (Spike 034 hybrid) — the editor only sets the `is_retention` flag; the actual DLP values (`dlp_months`, `dlp_start_date`, `retention_percentage`) are entered at the existing **Gate 4 "Mark Completed"** flow (`lcMarkProjectComplete`), because DLP terms are only known at completion.
3. **4-state DLP display** (Spike 036) — a single `getDlpState()` derivation drives amber/red/green states across the project-detail finance bar, the retention tranche row tag, the info card, and the **projects portfolio table** (`projects.js`), plus a Finance-only "Record Release" action.

**In scope:** project-detail finance bar + tranche editor + Gate-4 DLP entry + portfolio table states + Record Release + firestore.rules for new fields.
**Out of scope:** services parity (projects only); wiring retention release into the finance.js collectibles/COLL system (Record Release is a direct write per Spike 036, decided 2026-06-10); changing the existing Phase 99.1 per-tranche lifecycle footer beyond adding the retention/DLP surface.
</domain>

<decisions>
## Implementation Decisions

### Scope packaging (user decision 2026-06-10)
- **D-01:** Single phase covering all three spikes (tranche editor + DLP entry + 4-state display). Tightly coupled; matches 99.1/99.2/99.3 plan-now precedent.
- **D-02:** Portfolio-table DLP states (Spike 036 portfolio row) ARE in scope — touches `projects.js`.
- **D-03:** "Record Release" is a **direct write** of `retention_released_at` on the project doc (Finance role-gated). NO coupling into the finance.js collectibles/COLL creation flow.

### Tranche editor (Spike 035 — VALIDATED)
- **D-04:** Editor lives **in the Financial card** of project-detail (below the financial summary bar), where `collection_tranches` are already displayed read-only. Not a separate "Billing Setup" section.
- **D-05:** Editor is an **inline expand** (toggle below the section header), matching the lifecycle-accordion pattern — not a modal.
- **D-06:** Rows have label (text) + percentage (number). Add/remove rows. **Total must equal exactly 100%** and all labels filled before Save (live total bar turns green at 100%, red otherwise).
- **D-07:** Empty state (no tranches) shows a "Set Up Tranches" CTA prompt; existing tranches show read-only display + "Edit Tranches" button that opens the editor pre-filled.
- **D-08:** Save writes `collection_tranches` back to `projects/{docId}` (array of `{label, percentage, is_retention}`); Cancel discards edits.
- **D-09:** **One retention tranche only** — a "Ret?" toggle on any row marks it; toggling one row clears `is_retention` on all others. The retention tranche works with whatever the user names the final tranche (no separate "Add Retention Tranche" button).
- **D-10:** At editor time, **no DLP fields are captured** — only the `is_retention` flag. (Hybrid: DLP deferred to completion gate.)

### DLP entry placement (Spike 034 — hybrid)
- **D-11:** DLP fields live on the **project document**, not on the tranche. The tranche only carries `is_retention`. Fields: `dlp_months`, `dlp_start_date`, `dlp_expires_at`, `retention_percentage`, `retention_amount`, `retention_released_at`.
- **D-12:** DLP values are captured at **Gate 4 "Mark Completed"** (extending `lcMarkProjectComplete` / its gate panel): `retention_percentage`, `dlp_months` (selector: 3/6/12/18/24), `dlp_start_date` (defaults to completion date, overridable).
- **D-13:** Computed at write time: `dlp_expires_at` = `dlp_start_date` + `dlp_months`; `retention_amount` = `contract_cost × retention_percentage / 100`.
- **D-14:** DLP capture is shown/required **only when a retention tranche exists** (`collection_tranches.some(t => t.is_retention)`). If no retention tranche, completion proceeds as today with no DLP write.
- **D-15:** `retention_released_at` initialized null; set only by Finance via Record Release.

### DLP display states (Spike 036 — VALIDATED)
- **D-16:** Single derivation function `getDlpState(project)` returns `'active' | 'in-dlp' | 'expired' | 'released'`:
  ```js
  function getDlpState(project) {
    if (!project.dlp_months || project.project_status !== 'Completed') return 'active';
    if (project.retention_released_at) return 'released';
    if (Date.now() > new Date(project.dlp_expires_at).getTime()) return 'expired';
    return 'in-dlp';
  }
  ```
- **D-17:** Finance bar (project-detail) states: **active** = blue utilization, no DLP strip; **in-dlp** = amber bar/wrapper + stacked amber retention segment + DLP strip "N days remaining"; **expired** = red wrapper + red strip "Expired N days ago" + Record Release button; **released** = green wrapper, 100% fill, "Fully Collected".
- **D-18:** Stacked bar segments (blue collected + amber/red retention) show retention is **held**, not missing. Retention tranche row gets an In DLP / OVERDUE / Released tag matching state.
- **D-19:** Info card surfaces DLP Period + DLP Expires (Completed date already shown by Phase 100).
- **D-20:** Portfolio table row (`projects.js`) shows the same 4 states: left-accent border (amber/red/green) + status tag + bar color. Mirrors the Spike 033 "Attention Feed" left-border pattern.
- **D-21:** **Record Release** button is Finance-only; appears on in-dlp + expired states; direct-writes `retention_released_at` (now), flipping display to green. No listener changes needed — standard project `onSnapshot` is sufficient.

### Engineering invariants (project convention)
- **D-22:** All new fields read with `|| null` so legacy project docs (no DLP fields) never crash.
- **D-23:** All new window functions registered in `init()` and deleted in `destroy()` **symmetrically** (project-detail.js + projects.js).
- **D-24:** `node --check` PASS on both touched view files. Zero-build app — UAT is browser-gated; static gate is `node --check` + grep.
- **D-25:** `firestore.rules` updated: allow the new `projects` fields to be written by the same roles that can edit a project; gate `retention_released_at` writes to Finance role. Dev deploy only (prod deploy deferred per the standing v3.3→main merge debt).

### Claude's Discretion
- Exact CSS class names (follow Spike 035/036 markup: `.tranche-editor`, `.finance-bar.state-amber`, `.dlp-strip`, portfolio `.dlp-amber/red/green`).
- Whether the tranche editor and Gate-4 DLP entry share a small helper for retention-tranche detection.
- DLP-strip countdown copy/format ("346 days remaining" / "Expired 32 days ago").
- Role-gate helper reuse (`_canAdvanceProjectStatus`, existing Finance-role checks).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract (authoritative)
- `.planning/spikes/035-tranche-editor-in-detail/README.md` + `spike.html` — inline tranche editor, Ret? toggle, 100% validation, empty/partial/full scenarios
- `.planning/spikes/034-dlp-entry-placement/README.md` + `spike.html` — hybrid decision (Ret? flag in editor + DLP fields at completion gate); Variant B = the 3-step "Mark Completed" gate with DLP as Step 2
- `.planning/spikes/036-dlp-states-finance-bar/README.md` + `spike.html` — 4-state model, getDlpState() logic, finance-bar + portfolio + tranche-tag + info-card rendering, Record Release

### Existing code to extend (read before editing)
- `app/views/project-detail.js` — Gate 4 completion (`lcMarkProjectComplete` ~line 3408; gate panel ~line 2260-2294), per-tranche lifecycle rows (`renderTrancheLifecycleRows` ~line 838), `collection_tranches` reads, lifecycle accordion + `init()`/`destroy()` window-function registration
- `app/views/projects.js` — project edit modal `collection_tranches` editor (lines ~682-1165, the existing tranche-builder source pattern); portfolio/table row rendering (Phase 92 status scorecards + table)
- `app/tranche-builder.js` + `app/coll-id.js` — shared tranche module (Phase 85) — reuse the sum=100 validation pattern if applicable
- `styles/views.css` — lifecycle accordion CSS block (pattern to match for the new tranche-editor + DLP CSS)
- `firestore.rules` — `projects` collection update rules (the 87.2 G3 `project_status` write rule + operations_user gate is the pattern to extend)

### Project conventions
- `CLAUDE.md` — SPA view module structure (`render`/`init`/`destroy`), window-function-on-onclick, real-time `onSnapshot`, status case-sensitivity, `#lineItemsBody` DOM-by-class rule
- `Skill("spike-findings-pr-po")` — implementation blueprint for lifecycle/activity/tranche patterns
</canonical_refs>

<specifics>
## Specific Ideas

- Reuse the Phase 99.1 Financial card layout — the read-only `collection_tranches` display already exists there; the editor expands in the same card.
- The Gate-4 DLP entry can be a lightweight extension of the existing single-button gate (D-12) rather than a full 3-step modal rebuild — Spike 034 Variant B showed a 3-step modal, but the existing Gate 4 is a single dual-attach panel; adding a DLP fieldset (shown when a retention tranche exists) before the "Mark as Completed" button is the minimal hybrid.
- `getDlpState()` is render-time only — no new Firestore listeners; the existing project `onSnapshot` already re-renders on `retention_released_at` writes.
- Portfolio states reuse the Spike 033 left-border accent pattern already in the projects table.
</specifics>

<deferred>
## Deferred Ideas

- **Services parity** — services (`services.js`) get the same tranche editor + DLP. Projects-only this phase (matches Phase 101 deferral pattern).
- **Collectibles/COLL coupling** — releasing retention does NOT create/close a COLL collectible this phase (D-03). A future phase could reconcile retention release with the finance.js collectibles money-in records.
- **DLP notifications** — auto-notify Finance when DLP expires (retention overdue). Not in this phase; display-only surfacing of the expired state.
- **Prod firestore.rules deploy** — dev deploy only; prod deploy rides the standing v3.3→main merge debt (Phase 87.4/99/99.1/99.3 carry-over).
</deferred>

---

*Phase: 102-dlp-retention-management*
*Context gathered: 2026-06-10 via spike-validated plan-now path (Spikes 034–036)*
