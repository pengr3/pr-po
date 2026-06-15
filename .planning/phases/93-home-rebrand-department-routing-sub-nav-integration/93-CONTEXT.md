# Phase 93: Home Page Rebrand — Departmental Access Routing + Sub-Nav Integration - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebrand the home page (`app/views/home.js`) so it reads as a **departmental-access dashboard**. The page surfaces 5 large department tiles — one each for **Clients · Projects · Services · Procurement · Finance** — that route to the corresponding top-nav destination on click. The Phase 87.1 home sub-nav (`Overview | Engagements | Proposals`) is **retained as-is** structurally, but the **Overview tab is restructured** to host the new department tiles on top and the existing Procurement stats card below. Engagements and Proposals sub-tabs are unchanged.

### In scope

- New 5-tile departmental grid on the Home Overview sub-tab (Clients, Projects, Services, Procurement, Finance)
- Tile layout: **3-on-top / 2-centered-below** on desktop; visual style **matches the current `.nav-card` pattern** (large icon + title + revised description + Enter button)
- Tile descriptions revised so each accurately reflects the **current** functionality of that department (post v3.2 + v4.0 work)
- Replace the existing 3 nav-cards (Material Request, Procurement, Finance Dashboard) — the Material Request card is already dead-redirect since Phase 91; Procurement and Finance cards subsume into the new 5-tile grid
- Position the new tile grid **above** the Procurement stats card inside the Overview sub-tab (tiles first, stats below)
- Preserve the existing Phase 87.1 sub-nav (Overview | Engagements | Proposals) and its role-gating logic exactly as today

### Out of scope (deferred)

- Adding **Management** to the home sub-nav or as a 6th tile — Management stays in the top nav unchanged (Phase 88 surface preserved)
- Per-role tile visibility filtering — every role sees all 5 tiles
- Soft-disabled "no access" tile state — denied clicks fall through to the existing `router.js` route-protection layer (same as clicking the top-nav link)
- Sub-action / quick-link routing from a tile (e.g., Procurement → Request sub-tab) — tiles route to the **top-level department landing** only
- Engagements sub-tab content / Proposals sub-tab content — unchanged from Phase 87.1
- Mobile-specific reflow beyond what naturally falls out of the existing `.nav-card` + grid CSS (no new mobile-only layout work in this phase)
- Rebranding the `🏗️ CLMC` hero title or `Management System Portal` subtitle (kept as today)

</domain>

<decisions>
## Implementation Decisions

### Departments & tile content

- **D-01:** The 5 department tiles are exactly **Clients, Projects, Services, Procurement, Finance** — 1:1 mirror of the existing top-nav links. There is no broader "department landing" re-framing (Procurement tile = the same `/procurement` view, not a bundled Procurement-landing aggregator).
- **D-02:** Tiles are **identical for every role** — no per-role tile hiding. Visibility is uniform; permission is enforced at the click destination by existing `router.js` route protection.
- **D-03:** Tile click routes to the **top-level department landing** — `#/clients`, `#/projects`, `#/services`, `#/procurement` (default sub-tab), `#/finance` (default sub-tab). Same hash as the equivalent top-nav anchor.

### Sub-nav

- **D-04:** The Phase 87.1 home sub-nav (`Overview | Engagements | Proposals`) is **retained as-is** — same three tabs, same role-gating (`getHomeSubTabConfig()` unchanged), same content in Engagements and Proposals tabs. The Management tab is **not added** to this sub-nav.
- **D-05:** The **Overview sub-tab is restructured** to host: (1) the new 5-tile department grid on top, (2) the existing Procurement stats card (Pending MRFs / Pending PRs / Active POs) directly below. Engagements and Proposals sub-tabs are unchanged.
- **D-06:** The existing 3 nav-cards (Material Request 📝, Procurement 🛒, Finance Dashboard 💰) are **removed** — replaced wholesale by the new 5-tile grid. The Material Request card is already dead-redirect since Phase 91; the Procurement and Finance cards subsume into the new tile grid under their own labels.

### Tile layout & visuals

- **D-07:** Desktop layout: **3 tiles on top row + 2 tiles centered below** (Clients, Projects, Services / Procurement, Finance). Mobile reflow falls out naturally (1 column stack) — no extra mobile work this phase.
- **D-08:** Tile visual style **matches the current `.nav-card` pattern** — large card with icon, title (h3), 1-line description, primary "Enter →" button. Whole tile remains clickable as today.
- **D-09:** Tile **descriptions are revised** to match each department's current functionality (post v3.2 + v4.0 work). Exact copy is Claude's discretion in the plan, but each should describe what a user actually does in that department today (e.g., Clients = manage client records; Projects = project records, financials, Gantt; Services = service work tracking; Procurement = MRFs, suppliers, MRF Records, RFPs; Finance = PR/TR approvals, payables, collectibles).

### Click behavior

- **D-10:** When a user clicks a tile for a department they lack nav permission for, **existing route protection handles it** — `router.js` redirects to `/` or shows access-denied as it does today for direct hash entry. No new soft-disable visual state, no new permission-check layer in `home.js`.

### Claude's Discretion

- **Tile icon choice** — pick a sensible single-emoji or simple icon per tile (e.g., 📋 Clients, 🏗️ Projects, 🔧 Services, 🛒 Procurement, 💰 Finance). The 🏗️ glyph is currently used in the hero title; Projects can reuse or pick a different one. Aim for visual distinction across the 5.
- **Exact description copy** for each tile (1-line, ≤80 chars, present-tense action verb)
- **CSS for the 3+2 grid** — `display: grid` with `grid-template-columns: repeat(3, 1fr)` for the top row and a `grid-column: span / center` trick (or a second inner grid) for the centered 2-tile bottom row. Other valid approaches welcome; just ensure the bottom row is visually centered relative to the top row.
- Whether to keep the existing `.nav-card` CSS verbatim or extend it (e.g., `.dept-card` variant) — keep verbatim if zero behavior change, extend if the 3+2 grid pulls in spacing/sizing tweaks that would regress other `.nav-card` usages elsewhere (none expected — `.nav-card` is only used on home.js today; verify with grep).
- Whether to retire the now-unused `#/mrf-form` legacy redirect (Phase 91 added it) — out of scope for this phase but flag if encountered.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Phase Context

- `.planning/ROADMAP.md` §"Phase 93" (lines ~818–834) — Phase 93 goal and open-questions log this discussion is resolving
- `.planning/PROJECT.md` — milestone v4.0 framing; CLMC scope (not an authoring platform)

### Upstream Phase Context (must read for surface being modified)

- `.planning/phases/87.1-proposal-lifecycle-integration-proposal-project-bidirectiona/87.1-CONTEXT.md` — D-01/D-07/D-08 (home sub-nav model, role gating, Engagements + Proposals tabs), D-04 (proposal-modal.js shared utility). The current `home.js` sub-nav structure being preserved comes from this phase.
- `.planning/phases/91-navigation-restructuring-mrf-into-procurement-my-requests-fi/91-CONTEXT.md` — D-01 (MRF absorbed into Procurement, `/mrf-form` legacy redirect to `/procurement/request`). Explains why the existing Material Request nav-card is dead.
- `.planning/phases/92-projects-tab-status-scorecards/` — visual language for any scorecard-style elements (not selected for this phase but referenceable for future polish work).
- `.planning/phases/88-management-tab-shell-create-engagement/88-CONTEXT.md` — Management tab origin (Phase 88). Confirms Management is super-admin-only and is **out of scope** for this phase's home changes.

### Primary code surfaces

- `app/views/home.js` (~650 lines) — **primary edit target**. Currently contains: hero section, 3 nav-cards (to be replaced), `home-sub-nav` (D-04 preserve), `quick-stats > .hs-stat-card Procurement` (D-05 stays in Overview), `_loadHomeProposalsTab` + queue helpers (unchanged), `getHomeSubTabConfig()` (unchanged).
- `index.html` — verify nav-link list (Home, Clients, Projects, Services, Procurement, Finance, Admin) matches the 5-tile inventory; no edits expected here unless adding/renaming a nav route.
- `app/router.js` — verify route protection for `/clients`, `/projects`, `/services`, `/procurement`, `/finance` already gates per role; no edits expected.
- `styles/hero.css` — current `.nav-card` and `.navigation-cards` styles live here (search `.nav-card` selector). Primary CSS edit target for the 3+2 grid.
- `styles/views.css` — `.home-sub-nav` CSS from Phase 87.1 (do not regress).

### CLAUDE.md

- View-module `render` / `init` / `destroy` lifecycle — preserve in `home.js`
- Hash-based routing conventions — tile `onclick="location.hash='#/...'"` is the established pattern (matches existing nav-cards)
- No new Firestore collection / no Security Rules work — pure UI rebrand

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`.nav-card` CSS class** in `styles/hero.css` — current visual style for the 3 existing home cards. Reused verbatim for the 5 new tiles per D-08.
- **`.navigation-cards` grid container** in `styles/hero.css` — current grid wrapper; extend or replace with a 3+2 grid variant per D-07.
- **`onclick="location.hash='#/...'"` pattern** — already used on existing nav-cards; reuse for the 5 new tiles (no new JS handler needed; the `home-sub-nav` JS handlers stay scoped to the sub-nav only).
- **`getHomeSubTabConfig()` + `switchHomeTab()` + `_loadHomeProposalsTab()` + `_renderHomeApprovalQueueHtml()` + `_openHomeQueueModal()` + `_homeQueueConfirmAction()`** in `home.js` — all sub-nav infrastructure from Phase 87.1, untouched by this phase.
- **`getDashboardMode()`** + `cachedStats` + `loadStats()` + `procurementCardHtml()` + `updateStatDisplay()` — Procurement stats card infrastructure, untouched. Card moves DOM position (under the new tile grid inside Overview) but rendering is unchanged.

### Established Patterns

- **Phase 87.1 sub-nav pattern** — `.home-sub-nav` + `.home-sub-nav-tabs` + `.home-sub-nav-tab` + `.home-sub-nav-tab--active`. Reuse exactly; the new Overview tab content is purely a swap of inner HTML inside the existing `.quick-stats` container or a sibling container — researcher decides.
- **View-module lifecycle** (`render` / `init` / `destroy`) — `init()` registers `window.switchHomeTab` + queue handlers + `engagement-create` form; `destroy()` deletes them + unsubscribes stats listeners. No new window functions needed for static `location.hash` tiles.
- **Hash-based tile routing** — existing nav-cards use bare `onclick="location.hash='#/...'"`. Continue this pattern (no new `window.*` handler per tile).

### Integration Points

- **Inside Overview sub-tab** — the tiles render at the top of what is currently the `.quick-stats` block (or a sibling container above it). Researcher should confirm the cleanest DOM container: either restructure `.quick-stats` to hold both tiles + stat card, or introduce a new wrapper inside `.hero-section` that the `switchHomeTab('overview')` show/hide logic targets.
- **`switchHomeTab` show/hide** — currently toggles `.quick-stats` (Overview), `#homeEngagementsContent`, `#homeProposalsContent`. If the new tile grid is placed in a new container, `switchHomeTab('overview')` must show BOTH the new tile container AND `.quick-stats`. Researcher: confirm whether to fold tiles into `.quick-stats` (single show/hide target) or introduce a new container (requires updating `switchHomeTab` show/hide list).
- **No router edits expected** — `/clients`, `/projects`, `/services`, `/procurement`, `/finance` already exist and gate per role.
- **No firestore.rules edits** — pure UI rebrand, no new collections.

### Specific surfaces NOT to touch

- `_loadHomeProposalsTab` and the local approval-queue logic (Phase 87.1 D-01 — RESEARCH Pitfall 7 still applies; do not import `proposals.js` `renderApprovalQueue`)
- `getHomeSubTabConfig()` role-gating logic (preserve Phase 87.1 D-08 model)
- `_applyProposalStateTransition` import path (Phase 87.1 D-03 — proposals.js is the canonical owner)
- `engagement-create.js` form integration in the Engagements sub-tab
- Top-nav `index.html` Management link (Phase 88 surface; out of scope per D-06)

</code_context>

<specifics>
## Specific Ideas

- **Tile order:** Clients first (data domain), then Projects, then Services (parallel domains), then Procurement, then Finance (workflow domains). This is the order the user implicitly used in conversation and matches the existing top-nav ordering (Home → Clients → Projects → Services → Procurement → Finance → Admin).
- **3+2 grid centering:** the bottom row (Procurement, Finance) should be visually centered relative to the top row (Clients, Projects, Services) — not left-aligned with empty space on the right. A natural CSS approach is a wrapper with `display: flex; flex-direction: column` containing two inner grids, or a single grid with offset `grid-column` placement on the bottom row.
- **Tile descriptions should match current functionality** — the user explicitly said "revise their description to match their current functionality." E.g., the existing Procurement card description ("Manage MRFs, suppliers & procurement") is outdated since Phase 91 added Request sub-tab + MRF Records and Phase 91.1 added Supplier categories; the new Procurement tile description should reflect the full scope. Same for Finance (Phase 65 added RFP/Payables, Phase 85 added Collectibles).
- **Material Request 📝 card removal:** this card is already dead-routed (Phase 91 redirected `/mrf-form` → `/procurement/request`); removing it from home is correctness work, not just rebrand. MRF submission is now reached via Procurement → Request sub-tab.

</specifics>

<deferred>
## Deferred Ideas

- **Management as a 5th/6th tile or sub-nav entry** — explicitly out of scope per D-06; Management stays in the top nav. Revisit if a future phase decides the top-nav Management entry should retire (mirroring Phase 87.1's retirement of top-nav Proposals).
- **Per-role tile visibility filtering** — explicitly out of scope per D-02; if future feedback shows that "everybody sees everything" causes dead-click confusion (e.g., Finance role clicking Projects and hitting access-denied), revisit with a soft-disable visual state.
- **Tile sub-action quick links** (e.g., Procurement tile → Request sub-tab directly) — out of scope per D-03; revisit if usability data shows users navigating tile → sub-tab is a frequent path.
- **Hero rebrand** (🏗️ CLMC title / "Management System Portal" subtitle) — not discussed; assumed unchanged. If a future phase wants to refresh branding (logo, tagline, color), it can be its own phase.
- **Mobile-specific tile layout** — assumed natural 1-column stack on ≤768px via existing `.nav-card` responsive CSS. If the 3+2 desktop grid needs explicit mobile media queries, address inside the plan rather than deferring.
- **Retire `/mrf-form` legacy redirect** (added in Phase 91 for backward-compat) — out of scope here; flag if encountered during planning.

</deferred>

---

*Phase: 93 — Home Page Rebrand — Departmental Access Routing + Sub-Nav Integration*
*Context gathered: 2026-05-25*
