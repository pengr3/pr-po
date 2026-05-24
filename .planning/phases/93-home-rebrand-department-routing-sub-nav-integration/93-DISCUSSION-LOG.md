# Phase 93: Home Page Rebrand — Departmental Access Routing + Sub-Nav Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 93-home-rebrand-department-routing-sub-nav-integration
**Areas discussed:** 5th department identity, Sub-nav fate (Overview/Engagements/Proposals), Tile layout & visual treatment, Per-role visibility & click behavior
**Mode:** `--batch` (initial), switched to default interactive mode at user's request after Area 1

---

## Area 1 — 5th department identity

User said "5 departments" in roadmap text but listed only 4 (Projects, Services, Procurement, Finance). Discussion resolved the missing 5th + framing of what a "department tile" means.

**Q1 — What is the 5th department?**

| Option | Description | Selected |
|--------|-------------|----------|
| (a) Clients | Already a top-nav destination; fits the "data domain" framing | ✓ |
| (b) Management | Phase 88 Mgmt tab, super-admin only | |
| (c) Admin | Role config / users / invitations (super-admin only) | |
| (d) Something else | Reports / Operations / Engineering / etc. | |
| (e) Drop to 4 | "five" was a slip | |

**User's choice:** Clients

**Q2 — Tiles mirror top-nav 1:1, or broader "department landing" semantics?**

| Option | Selected |
|--------|----------|
| Mirror top-nav 1:1 (Procurement tile = `/procurement` view) | ✓ |
| Broader bundling (Procurement tile = MRF + RFP + Suppliers + Payables aggregator landing) | |

**User's choice:** Mirror top-nav 1:1 ("just the same")

**Q3 — Per-role tile visibility?**

| Option | Selected |
|--------|----------|
| Different tile set per role (Finance sees a different 5 than Operations) | |
| Same 5 tiles for everyone; role-gating only at click destination | ✓ |

**User's choice:** Everybody sees everything

**Q4 — Where does Management surface live?**

| Option | Selected |
|--------|----------|
| Become the 5th tile | |
| Hidden inside another tile (sub-action of Admin) | |
| Stay in top nav unchanged, not on home dashboard | |
| Keep the sub-nav (home retains sub-nav structure; Management stays in top nav) | ✓ |

**User's choice:** "no i'd like a sub nav" — retain home sub-nav; Management surface stays in top nav as today, NOT added to sub-nav and NOT a tile.

---

## Area 2 — Sub-nav fate

**Q1 — New sub-nav tab structure?**

| Option | Selected |
|--------|----------|
| Overview · Engagements · Proposals · Management (add 4th tab) | |
| Engagements · Proposals · Management (drop Overview) | |
| Overview · Management · Proposals (Engagements absorbed into Management) | |
| Keep Overview · Engagements · Proposals as today; remove Management from the discussion | ✓ |

**User's choice:** "Overview Engagements proposals remove management" — sub-nav unchanged from Phase 87.1.

**Q2 — Procurement stats card location?**

| Option | Selected |
|--------|----------|
| Stays inside Overview sub-tab as today | ✓ |
| Above/below the 5 tiles as a persistent strip (no longer behind a sub-tab) | |
| Retire from home entirely | |

**User's choice:** Stays inside Overview sub-tab as today

**Q3 — Sub-nav placement relative to the 5 tiles?**

| Option | Selected |
|--------|----------|
| Tiles on top, sub-nav below | |
| Sub-nav on top, tiles below | |
| Side-by-side (≥769px), stacked on mobile | |
| **Tiles retained inside Overview tab; tiles first, then stats card** (user clarification) | ✓ |

**User's clarification:** "No retain tiles in overview. Tiles first then stats" — tiles render inside the Overview sub-tab (above the stats card). Sub-nav stays at top. Structural model: sub-nav (top) → Overview tab content = [tiles + stats card].

**Q4 — Management tab role gating (n/a after Q1)**
**Q5 — Top-nav Management link fate (n/a after Q1)**

Skipped — Management is not added to the sub-nav so these questions are moot.

---

## Area 3 — Tile layout & visual treatment

**Q1 — Grid layout for the 5 tiles on desktop?**

| Option | Selected |
|--------|----------|
| 1 row × 5 columns (all equal) | |
| 2 rows: 3-on-top + 2-centered-below | ✓ |
| 2 rows: 2-on-top + 3-on-bottom | |
| Auto-fit responsive grid (minmax 220px) | |

**User's choice:** 3-on-top + 2-centered-below

**Q2 — Tile visual style? (clarification request — user wanted to discuss further)**

User asked to clarify; reply: "match the current layout of tiles i like it, and just revise their description to much they current functionality"

**User's choice:** Match the current `.nav-card` style (large card with icon + title + description + Enter button) verbatim. Revise per-tile descriptions to match current functionality of each department (post v3.2 + v4.0).

---

## Area 4 — Per-role visibility & click behavior

(Per-role tile visibility was already locked in Area 1 Q3 — everybody sees everything.)

**Q1 — Click denied behavior when role lacks access to the destination?**

| Option | Selected |
|--------|----------|
| Existing route-protection denies access (redirect/error as today) | ✓ |
| Soft-disabled tile (greyed out, no Enter button) | |
| Tile click routes to a fallback (e.g., view-only page) | |

**User's choice:** Existing route-protection denies access — no new soft-disable state

**Q2 — Route depth on tile click?**

| Option | Selected |
|--------|----------|
| Top-level department landing (1:1 with top-nav link) | ✓ |
| Specific sub-tab (Procurement → Request, Finance → Pending Approvals) | |
| Top-level now, structured for future quick-action addition | |

**User's choice:** Top-level department landing (mirror of top-nav)

---

## Wrap-up

**User's choice:** "I'm ready for context — write CONTEXT.md"

User declined to discuss the hero section, the 3 existing nav-cards (decision implied: replace wholesale), or any additional areas.

---

## Claude's Discretion

- Exact icon per tile (single emoji preferred, distinct across 5)
- Exact description copy per tile (1-line, present-tense, ≤80 chars, reflecting current functionality of each department)
- CSS implementation of 3+2 centered grid (single grid w/ offset placement, two stacked inner grids, flex column, etc.)
- Whether to keep `.nav-card` CSS verbatim or introduce `.dept-card` variant (verify `.nav-card` usage scope first — expected to be home-only)
- Whether to fold tile container into existing `.quick-stats` block (single show/hide target in `switchHomeTab`) or introduce a new sibling container (requires updating the show/hide list)
- Tile order (CONTEXT.md suggests Clients → Projects → Services → Procurement → Finance per existing top-nav order)

## Deferred Ideas

- Management as a 5th/6th tile or sub-nav entry — out of scope (D-06)
- Per-role tile visibility filtering / soft-disabled state — out of scope (D-02, D-10)
- Tile sub-action quick links (Procurement → Request directly) — out of scope (D-03)
- Hero rebrand (🏗️ CLMC title / "Management System Portal" subtitle) — assumed unchanged
- Retire `/mrf-form` legacy redirect (Phase 91 backward-compat) — out of scope; flag if encountered during planning
