---
spike: 108
name: executive-dashboard-content-model
type: standard
validates: "Given the 4 dashboard-eligible roles, when the Executive Dashboard is rendered under candidate content models, then the user can pick the model AND the content depth to lock for Phase 109"
verdict: PENDING
decision: "Model A (Uniform) LOCKED; enriched content set awaiting final sign-off (paused at checkpoint)"
related: [041, 107]
tags: [home, dashboard, executive, chartjs, role-gating, dept-scoping, phase-109, composition, ux]
---

# Spike 108: Executive Dashboard — Content Model

## What This Validates

Given the four roles that will see the Home **Dashboard** sub-tab (super_admin, operations_admin,
services_admin, finance), which content **model** and content **depth** give it executive weight?
This is Phase 109 **discuss-phase area 1**. The user declined to pick abstractly and asked to spike it —
output feeds back into `/gsd-discuss-phase 109`.

Two iterations:
1. **Model shootout** — A (uniform) vs B (role-tailored) vs C (uniform base + tailored charts).
2. **Content enrichment** — having locked A, make it *weighty* (money-flow, risk, momentum, throughput).

## Research

- **Visual language reused from Spike 107 (`command-center-v2/preview.html`)** — the contained `.cc-shell`,
  `--cc-*` tokens, integrated tab bar (already carries a "Dashboard" tab), KPI chips, floating controls.
  The dashboard is a sibling tab, so it feels identical. The mockup lands on that Dashboard tab.
- **Chart.js v4.4.7 already loaded** in `index.html` (Phase 77.1); CSP already allows `cdn.jsdelivr.net`.
  Same CDN pin used — no loader/CSP work for the real build.
- **Restoring Phase 77 charts** — the status-breakdown is the retired Phase 77 horizontal-bar chart, removed
  when Phase 107 rewrote `home.js`. Funnel + spend + the enrichment charts are new/extended.
- **Scoping is pre-solved** — DASH-07 maps to `PROJECT_SEE_ALL_ROLES` / `SERVICE_SEE_ALL_ROLES` (quick
  `260706-mco`): super_admin = both depts; ops_admin = all projects + assigned services; services_admin =
  all services + assigned projects; finance = financial across both. Mock reflects this (scope 17 / 14 / 8).
- **Enrichment sources (all confirmed-derivable from existing collections):** billed/collected/outstanding
  from collectibles + billing lifecycle (spikes 025/026/027, `deriveCollectibleStatus`); payables from POs
  (`derivePOSummary`); retention/DLP (spikes 034–036, `getDlpState`); at-risk (Phase 86.12 computed status);
  progress % (spike 023, `computeProjectProgress`); VO-revised contract (spikes 037–040). **One caveat:**
  funnel-weighted-by-₱ assumes proposals carry an estimate field — researcher confirms; else it stays count.

## How to Run

```bash
python -m http.server 8000        # from repo root
# open:
http://localhost:8000/.planning/spikes/108-executive-dashboard-content-model/spike.html
```

The live artifact is **iteration 2 (enriched Model A)**. Controls:
- **Top bar** — Model A locked ✓ · **Weight toggle (Count / ₱ value)** applied to status + funnel charts.
- **Bottom-left** — Role (the 4 eligible) + Populated/Sparse data toggle.
- **Bottom-right** — event log (role/weight switches, simulated deep-links, compute-on-load refresh).

One shared portfolio (12 projects + 5 services) is scoped per role, so KPI totals, the cash-flow ribbon,
the status chart, and the table all agree for every role.

## Investigation Trail

1. **Iter 1 — model shootout.** Built A/B/C in one role×model switcher over shared scoped data. Verified
   the 7-combo differentiation matrix (below). **User picked Model A** (uniform, scoped data) — requirement-
   faithful, one render path, scoping carries the per-role work.
2. **Gotcha found & fixed:** Chart.js default entrance animation needs `requestAnimationFrame`; a background/
   preview tab doesn't tick rAF, so canvases were created but painted 0%. Set `animation:false` → synchronous
   paint. **Signal for the real build:** the Phase 77 charts should adopt `animation:false` (or a short
   duration) to avoid blank-on-first-paint on the Dashboard tab.
3. **Iter 2 — enrichment.** User's feedback: Model A as built showed *inventory* (counts/lists), not
   *insight* — "no weight or relevance." Rebuilt enriched Model A with all four chosen enrichment themes:
   cash-flow ribbon, risk strip, value-weighted charts + procurement/supplier charts, and a weightier table.
   Verified all 6 charts paint and every figure is internally consistent and scopes correctly (17/14/8).
4. Verified programmatically (DOM + canvas pixel sampling + interaction probes) — the preview pane's
   screenshot endpoint was timing out; those checks are the evidence.

## Results

**Artifact: VALIDATED** — a working decision tool; renders honestly with real Chart.js and self-consistent
scoped data.

### Decision 1 — content MODEL: **A · Uniform (LOCKED)**

Verified iter-1 differentiation matrix (the evidence behind the pick):

| Role · Model | KPI tiles | Charts | Table scope |
|---|---|---|---|
| Super Admin · A | Active proj&svc · Contract · Payables · Collectibles | status · funnel · spend | 17 |
| Finance · A | *(identical)* | status · funnel · spend | 17 |
| Ops Admin · B | Active projects · Active services · At-risk · Proposals | status · funnel | 14 |
| Services Admin · B | *(admin set)* | status · funnel | 8 |
| Finance · B | Contract · Payables · Collectibles · **Overdue** | **spend · aging** | 17 |
| Ops Admin · C | 4 uniform | status · funnel · spend | 14 |
| Finance · C | 4 uniform | **spend · aging** (swapped) | 17 |

Rationale for A: DASH-02/03/04/05/06 name specific tiles/charts (not per-role variants); one render path,
cheapest to maintain; scoping does the per-role differentiation. B forces an awkward "does Super Admin get a
superset?" question; C introduces a non-required aging chart.

### Decision 2 — content DEPTH: enriched Model A (**awaiting final sign-off**)

User chose **all four** enrichment themes. Enriched Model A now stacks:

| Zone | Answers | Scope |
|---|---|---|
| KPI row | Active portfolio · Contract · Payables · Collectibles | DASH-02 (in) |
| **Cash-flow ribbon** | Billed→Collected→Outstanding→**Overdue** · Backlog · **Net cash** · Retention | enriches DASH-02 (in) |
| **Risk strip** | At-risk **₱ exposed** · overdue · stuck stages · avg % complete | **extends** |
| 6 charts | status(₱) · funnel(₱)+win-rate · cash in-vs-out · **procurement throughput** · **supplier concentration** · aging | ② in · ③④ **extend** |
| Portfolio table | Code·Name·Status·**Progress**·**Contract**·Payable·Collectible | DASH-06 enriched (in) |

**Key insight the enrichment surfaced (₱-weight toggle):** On-going is 8/17 items (~47%) *by count* but
**₱44.7M of ₱59.7M (~75%) by value** — the flat count view hid where the money actually is.

**⚠ Scope flag:** the **risk strip, procurement throughput, and supplier concentration EXTEND** DASH-01…07.
The user chose them deliberately — to be confirmed as a Phase 109 scope extension (or split to a follow-on)
when discuss-phase resumes.

**Verified numbers (super_admin):** KPIs 14 / ₱59.7M / ₱3.6M / ₱9.6M · cash ribbon ₱24.2M→₱14.6M→₱9.6M→₱4.4M ·
backlog ₱35.5M · net +₱6.1M · at-risk ₱27.2M exposed · avg 48% complete. Scopes to 7 / ₱26.3M / 8-rows for
services_admin.

**STATUS: session paused at the iter-2 verification checkpoint** — awaiting the user's "keep all / trim /
add more" call before the model+depth lock and the resume of `/gsd-discuss-phase 109` (areas 2–4 pending).

### Signals for later discuss-phase areas (surfaced, not decided)
- *Area 2 (dept scoping):* the 17/14/8 counts make the `SEE_ALL + assigned` model concrete — matches app lists.
- *Area 3 (freshness):* header shows "Updated just now · ↻ Refresh" — compute-on-load framing (Strategy A).
- *Area 4 (table/chart substance):* at-risk accent + progress bars in the table preview the health signal;
  status/funnel ₱-weighting and the spend/collections split are live to react to.
