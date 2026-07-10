# Phase 107: Home — Command Center Shell & Feed Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 107-home-command-center-shell-feed-engine
**Areas discussed:** Layout & sub-tab fate, Feed shape & interaction, 107↔108 boundary, Panel data sources

---

## Layout & sub-tab fate

### Q1 — Fate of today's Overview/Engagements/Proposals sub-tabs

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Overview only; keep the rest | Command Center = default landing; keep Engagements + Proposals sub-tabs; feed also deep-links to them | |
| Fold queue into feed, drop Proposals sub-tab | Approval queue lives in feed; browse-all + create-engagement need a new/restored route | |
| Command Center only; move mgmt to a route | Home is purely Command Center; relocate Engagements + Proposals to a restored Management route | |
| **Other (user-directed fold design)** | User asked how to *properly fold* proposals + engagement natively | ✓ |

**User's choice:** Free-text — "how can we properly put into the fold that the proposal and engagement?" Resolved to a per-surface fold: approval queue → feed; For-Revision → Your Work; create-engagement → "+ New Proposal" button; browse-all proposals → **non-default "Proposals" sub-tab** (user picked option (a) over a "View all" panel).
**Notes:** Command Center becomes the default landing; `/proposals` route (retired in 87.1) stays retired. Proposal scorecards may double as KPI chips.

### Q2 — Vertical composition

| Option | Description | Selected |
|--------|-------------|----------|
| **Briefing-stacked (single column)** | Header → KPI chips → feed (hero) → Your Work + Recent Activity → nav doors | ✓ |
| Two-column workspace | Left = feed + Your Work; right rail = KPI + Recent Activity | |
| Feed-first minimal | Header → feed immediately, everything else below | |

**User's choice:** Briefing-stacked (single column).
**Notes:** Chosen partly for clean mobile stacking (Phase 111).

### Q3 — Nav card form

| Option | Description | Selected |
|--------|-------------|----------|
| **Condensed door rail** | Compact icon+label tiles, permission-scoped | ✓ |
| Keep full descriptive cards | Current large cards with description + Enter button | |
| Top utility strip | Slim launcher chips near the header | |

**User's choice:** Condensed door rail.
**Notes:** Permission-scoped to reachable areas; satisfies HOME-08.

---

## Feed shape & interaction

### Q1 — Feed structure

| Option | Description | Selected |
|--------|-------------|----------|
| **Flat severity-ranked list** | One list, high→medium, category chip per row, cap + "Show all" | ✓ |
| Grouped by category sections | Sections per category | |
| Grouped by severity blocks | "Now" (high) block, then "Soon" (medium) block | |

**User's choice:** Flat severity-ranked list.

### Q2 — Severity model + tiebreak

| Option | Description | Selected |
|--------|-------------|----------|
| Source-declared, 2 tiers | high/medium only (per HOME-03) | |
| Engine-computed from a shared rule | Uniform rule derives severity | |
| **Source-declared, allow a 3rd 'critical' tier** | critical/high/medium, source-stamped | ✓ |

**User's choice:** Source-declared with a third **critical** tier.
**Notes:** ⚠ Amends HOME-03 (written high/medium) → critical/high/medium. Engine sorts critical→high→medium then most-overdue/newest within tier. Per-source rubric set in Phase 108.

### Q3 — Deep-link behavior

| Option | Description | Selected |
|--------|-------------|----------|
| **Hybrid: row declares route OR modal** | Each item carries a route-hash or a modal action | ✓ |
| Always route (deep-link hash) | Every row navigates via hash | |
| Always modal in place | Every row opens a modal overlay | |

**User's choice:** Hybrid (route OR modal).

### Q4 — Data-refresh model

| Option | Description | Selected |
|--------|-------------|----------|
| **Compute on load + manual Refresh** | Batched getDocs per source; no persistent listeners | ✓ |
| Fully real-time (onSnapshot per source) | Live listeners on every source collection | |
| Hybrid: live for a few, on-load for the rest | Two-mode engine | |

**User's choice:** Compute on load + manual Refresh.
**Notes:** Addresses 106 listener-leak / clear-before-push findings; engine stays fetch-strategy-agnostic so live listeners can be layered later.

---

## 107↔108 boundary

### Q1 — How much feed content in 107

| Option | Description | Selected |
|--------|-------------|----------|
| **Engine + a few universal seed sources** | Engine + empty state + a small reusable source library | ✓ |
| Engine + empty state only | All sources in 108; 107 shows only empty state | |
| Engine + one full reference role | Fully implement one role's feed (e.g. Super Admin) | |

**User's choice:** Engine + a few universal seed sources.
**Notes:** Source = function(user)→items[]; definition (108) = role→sources + thresholds.

### Q2 — Seed source set

| Option | Description | Selected |
|--------|-------------|----------|
| **Approval + Revision + Rejected-MRF trio** | 3 sources spanning permission/ownership/requestor scope + both link types | ✓ |
| Proposal-only (approval + revision) | Two proposal sources only | |
| Planner picks a representative 2–4 | Defer exact set to planner | |

**User's choice:** The approval + revision + rejected-MRF trio.
**Notes:** Populates a Super Admin feed on day one; exercises all scoping paths, both deep-link types, multiple tiers, and the empty state.

---

## Panel data sources

### Q1 — Recent Activity source

| Option | Description | Selected |
|--------|-------------|----------|
| **Reuse the notifications collection** | Per-user, cross-collection, icons + links already present | ✓ |
| Project-journal activity_entries | Aggregate per-project/service journal subcollections | |
| Hybrid: notifications + select journal | Notifications spine + selected journal entries | |

**User's choice:** Reuse the notifications collection (read-only recent slice).

### Q2 — Your Work composition

| Option | Description | Selected |
|--------|-------------|----------|
| **Fixed 3 buckets, hide-empty** | For-Revision proposals · assigned projects/services · submitted MRFs | ✓ |
| Role-adaptive buckets | Vary buckets per role | |
| Assigned items + proposals only | Drop submitted MRFs | |

**User's choice:** Fixed 3 buckets, hide-empty.
**Notes:** Scoping does the per-role work; Finance/Procurement see fewer buckets. Satisfies HOME-06.

### Q3 — KPI chips

| Option | Description | Selected |
|--------|-------------|----------|
| **Small role-tailored set (2–4)** | Per-role chips from counts 107 already reads | ✓ |
| Universal baseline (same for all) | One chip set for everyone | |
| Derive from feed + Your Work rollups | Chips = rollups of computed data | |

**User's choice:** Small role-tailored set (2–4).
**Notes:** Honors HOME-05 role-scoping; exact per-role map finalized in UI-SPEC/planner.

---

## Claude's Discretion

- Exact per-role KPI chip map (within D-15 guidance).
- Empty-state visual/copy; greeting one-liner wording / time-of-day tone.
- Where the shared feed-source library lives (recommend a dedicated `app/home-feed.js` module).
- Category-chip taxonomy; item dedupe/collapse rules.

## Deferred Ideas

- Per-role FEED definitions (HOME-09–13) → Phase 108.
- Executive Dashboard sub-tab (DASH-*) → Phase 109.
- Mobile layout of the Command Center (MOBILE-01) → Phase 111.
- Live/real-time feed listeners (optional per-source enhancement) → future.
- Project-journal-backed Recent Activity enrichment → future.
