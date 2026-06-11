# Spike Conventions

Patterns and stack choices established across spike sessions.

## Stack
- **Language:** Vanilla JS (ES6), no transpilers, no npm
- **Serving:** `python -m http.server 8000` from project root
- **Styling:** Inline `<style>` in spike.html — no external CSS deps
- **Colors:** Follow project design system — primary `#1a73e8`, dark `#1557b0`, text `#1e293b`, muted `#64748b`, border `#e2e8f0`

## Structure
- Each spike lives in `.planning/spikes/NNN-name/`
- Files: `spike.html` (runnable demo) + `README.md` (findings)
- Spikes are served at `http://localhost:8000/.planning/spikes/NNN-name/spike.html`

## Patterns
- **Self-contained:** spike.html works as a single file with no external imports
- **Interactive by default:** build something the user can feel, not just console output
- **Mock with app colors:** UX spikes mock the actual app nav/layout using project CSS vars
- **Controls overlay:** floating bottom-left panel for triggering demo states
- **Shared mock data across a series:** use the same 5 mocked tasks + same iteration names across all spikes in a series so the user compares interactions, not data
- **Comparison spikes (A/B/C):** put all variants in one spike.html with a top variant-switcher bar — avoids tab-juggling and makes the difference immediately obvious
- **Log pane:** dark `#0f172a` strip at the bottom with monospace entries; type-color coded (`event`=muted, `save`=green, `restore`=blue, `undo`=amber, `diff`=yellow) — use in every interactive spike
- **015c restore mechanic is canonical:** all future iteration spikes should use auto-snapshot + 5s undo toast as the restore mechanic; do not re-probe it
- **Right rail (017B) is canonical history UX:** the persistent side panel is the agreed surface for iteration history; do not re-probe modal vs dropdown
- **Project journal panel (032) is canonical On-going surface:** 3 tabs (Activity Feed / Progress Updates / Issues) below Info+Financial cards; all 3 ship; no role-gating; Progress Updates are manual-only — do not re-probe Gantt integration
- **DLP hybrid entry (034/035) is canonical:** "Ret?" toggle marks retention tranche (tranche editor, any time); DLP period/dates at completion gate Step 2 — do not re-probe whether DLP fields belong on tranche vs project (project-level, confirmed)
- **Tranche editor in project-detail (035) is canonical:** inline editor below the financial card; toggle editor open/close; DLP sub-fields are optional at tranche-setup time
- **4-state DLP display (036) is canonical:** active/in-dlp/expired/released derived at render time from project fields; stacked bar segments; DLP strip below bar; "Record Release" Finance-only action

## Variation Orders series (037–040)
- **Shared mock across the VO series:** project "Acme Warehouse Extension" / PRJ-CLMC-ACME-001, Original contract ₱4,200,000, three approved VOs (+180k +320k −95k = +405k) → Revised ₱4,605,000, one pending VO (VO-004 +260k), 4 tranches (20/30/30/20) with Mobilization already billed & collected at ₱840,000. Reuse this exact data in any future VO spike so the user compares interactions, not numbers.
- **VO data-model proposal (037, reused 038–040):** `contract_cost` stays the **immutable original** contract sum; add a `variation_orders[]` array on the project doc (`{vo_no, description, type:'addition'|'omission', amount, status}`, amount always positive, sign from type). Revised sum = `original + Σ(approved VOs)`, **derived at render time, never stored** — mirrors `getDlpState`/tranche peso amounts. Pending → projected figure; only Approved moves the sum.
- **Tranche-rebasing model (038) is an OPEN decision — do NOT assume one.** User chose "build the comparison." A=auto-rebase all (destructive — reopens billed tranches), B=VO billed as separate collectible line (decouples from milestones), C=freeze-billed + rebase-remaining (non-destructive, respects the existing "billed amounts are frozen" precedent in projects.js/services.js tranche-edit warnings). C is the spike's recommendation; awaiting the 038 review before it becomes canon.
- **VO approval reuses shipped patterns (039):** Draft → For Approval → Approved/Rejected; Approve is gated on an attached supporting document (028/029 attach-gate, `_url`/`_kind`/`_filename`); each transition emits a SYSTEM entry to the Phase 101 `activity_entries` journal (the approved entry is a cost-delta that supersedes the blind NOTIF-19 `contract_cost` old→new line). Do not design a new audit surface.
- **VO surface placement (040) pending:** finance bar + tranche list MUST consume the **revised** sum once VOs exist, regardless of where the ledger UI lives — the 038 model is a hard dependency of any VO surface, not just a billing detail. Dedicated bottom-row card is the spike's lean (single-purpose cards; Financial card already heavy after Phase 102 DLP).
