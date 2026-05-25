---
phase: 93
slug: home-rebrand-department-routing-sub-nav-integration
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-25
---

# Phase 93 — UI Design Contract

> Visual and interaction contract for the home page rebrand: 5-tile departmental access grid replacing the 3 legacy nav-cards, with the Phase 87.1 sub-nav retained as-is.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — pure vanilla CSS/JS, no component library |
| Preset | not applicable |
| Component library | none (hand-authored CSS in styles/) |
| Icon library | Unicode emoji (inline, no external dependency) |
| Font | 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif (from main.css body rule) |

No `components.json` present. Project is a zero-build static SPA — shadcn gate does not apply.

---

## Spacing Scale

Declared values (multiples of 4 only). Values match the rem-based system already used in hero.css:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px (0.25rem) | Icon gap, inline padding |
| sm | 8px (0.5rem) | Compact element spacing, sub-nav tab gap |
| md | 16px (1rem) | Default element spacing, stat-item padding |
| lg | 24px (1.5rem) | Section padding, card gap |
| xl | 32px (2rem) | Card internal padding (nav-card padding: 2.5rem 2rem horizontal) |
| 2xl | 48px (3rem) | Hero vertical padding (mobile: 3rem 1rem) |
| 3xl | 64px (4rem) | Hero section padding (desktop: 4rem 2rem), nav-card margin-bottom |

Exceptions:
- Nav-card padding on desktop: 2.5rem vertical × 2rem horizontal (40px × 32px) — matches existing `.nav-card` verbatim, not a new token.
- Sub-nav tab padding: 0.5rem 1rem (8px × 16px) — existing `.home-sub-nav-tab` pattern, retained as-is.
- 3+2 grid gap: 2rem (32px) — matches existing `.navigation-cards { gap: 2rem }`.

---

## Typography

Sourced from main.css `:root` and hero.css — no changes introduced in this phase.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / card description (p) | 16px (1rem) | 400 (normal) | 1.6 (from `.nav-card p`) |
| Label / stat label | 14px (0.875rem) | 500 | 1.5 |
| Heading / card title (h3) | 24px (1.5rem) | 600 | 1.2 |
| Display / hero title (h1) | 48px (3rem) | 700 | 1.1 |

Mobile overrides (already in hero.css — executor must not regress):
- h1 drops to 32px at ≤768px, 28px at ≤480px.
- Card h3 drops to 20px (1.25rem) at ≤768px.
- Card p drops to 15px (0.9375rem) at ≤768px.

---

## Color

All tokens live in `styles/main.css :root`. No new colors are introduced in this phase.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #f5f7fa → #e8eaed (gradient) | Hero section background (`linear-gradient(135deg, #f5f7fa 0%, #e8eaed 100%)`) |
| Secondary (30%) | #ffffff | Nav-card background, sub-nav background, hs-stat-card background |
| Accent (10%) | #1a73e8 (`--primary`) | Active sub-nav tab background, stat values, "Enter →" btn-primary background, tile border-color on hover |
| Destructive | #ea4335 (`--danger`) | Not used in this phase — no destructive actions |

Accent reserved for: active state of `home-sub-nav-tab--active`, the `btn-primary` "Enter →" button on each tile, `stat-value` numbers in the Procurement stats card, and the `border-color` of a hovered `.nav-card`. No other elements use accent in this phase.

---

## Component Inventory

### Reused verbatim (no modifications)

| Class | File | Notes |
|-------|------|-------|
| `.nav-card` | styles/hero.css | Tile container — use verbatim per D-08. 12px border-radius, white bg, 4px 16px shadow, 2px transparent border → hover: border-color: var(--primary), translateY(-8px), heavier shadow, icon bounce animation. |
| `.nav-card-icon` | styles/hero.css | 64px (4rem) emoji, margin-bottom 24px (1.5rem). Mobile: 48px, 40px at ≤480px. |
| `.nav-card h3` | styles/hero.css | 24px, weight 600, var(--gray-900), margin-bottom 16px. |
| `.nav-card p` | styles/hero.css | 16px, var(--gray-700), margin-bottom 32px (2rem), line-height 1.6. Description must be ≤80 chars. |
| `.nav-card .btn` | styles/hero.css | Full-width, padding 12px 24px, 16px text, weight 600. |
| `.home-sub-nav` | styles/views.css | White bg, 1px border-bottom var(--gray-200), margin-bottom 24px. Preserved as-is. |
| `.home-sub-nav-tab` | styles/views.css | Active: var(--primary) bg, white text. Preserved as-is. |
| `.hs-stat-card` | styles/hero.css | Procurement stats card — unchanged. |

### New / Modified CSS (Phase 93 only)

| Class | File | Specification |
|-------|------|---------------|
| `.dept-cards` | styles/hero.css | Replaces `.navigation-cards` as the grid wrapper for the 5-tile layout. `display: flex; flex-direction: column; gap: 2rem; max-width: 1200px; width: 100%; margin-bottom: 2rem;` |
| `.dept-cards-row` | styles/hero.css | Inner row container. Top row: `display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem;`. Bottom row: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; max-width: calc((100% - 2rem) * 2/3 + 2rem); margin: 0 auto;` — centers the 2-tile bottom row relative to the 3-tile top row. |
| Responsive `.dept-cards-row` at ≤1024px | styles/hero.css | Both rows become `grid-template-columns: repeat(2, 1fr); max-width: 100%;`. Last card in bottom row: `grid-column: 1 / -1; max-width: 500px; margin: 0 auto;`. |
| Responsive `.dept-cards-row` at ≤768px | styles/hero.css | Both rows become `grid-template-columns: 1fr; max-width: 100%;`. All centering overrides removed. |

Note: `.navigation-cards` CSS is left in hero.css for now — it has no other usages (verified: the class is only set in `home.js`). The executor can optionally comment it out or leave it. Do not delete it if there is any risk of regression.

The `switchHomeTab('overview')` function currently shows/hides `.quick-stats` as the Overview content container. After this phase, the Overview content will contain BOTH the new tile grid (`.dept-cards`) AND the stats card (`.quick-stats`). Resolution: wrap both in a new `<div id="homeOverviewContent">` container and update `switchHomeTab` to toggle `#homeOverviewContent` instead of `.quick-stats`.

---

## Tile Inventory

Exact tile definitions (D-01 through D-09 from CONTEXT.md).

| Order | Title | Icon | Route | Description (≤80 chars) |
|-------|-------|------|-------|--------------------------|
| 1 | Clients | 📋 | `#/clients` | Manage client records, contacts, and engagement history |
| 2 | Projects | 🏗️ | `#/projects` | Track projects, budgets, Gantt schedules, and financials |
| 3 | Services | 🔧 | `#/services` | Manage recurring service contracts and work tracking |
| 4 | Procurement | 🛒 | `#/procurement` | Submit MRFs, manage suppliers, track orders and RFPs |
| 5 | Finance | 💰 | `#/finance` | Approve PRs, manage payables, collectibles, and RFPs |

Row assignment: Top row = Clients, Projects, Services (indices 1–3). Bottom row = Procurement, Finance (indices 4–5), centered.

Icon note: 🏗️ is also used in the hero title `🏗️ CLMC`. Reuse is acceptable per D-09 (the hero title is out of scope and unchanged). If visual distinction is a concern, Projects can use 📁 as an alternative — executor's call.

Click behavior: `onclick="location.hash='#/...'"` — identical to existing nav-card pattern. No new `window.*` handler required per D-10.

Removed tiles: The 3 existing nav-cards (📝 Material Request → `#/mrf-form`, 🛒 Procurement → `#/procurement`, 💰 Finance Dashboard → `#/finance`) are deleted wholesale and replaced by the 5-tile grid per D-06.

---

## Interaction Contract

| Interaction | Behavior |
|-------------|----------|
| Tile hover | translateY(-8px), heavier shadow, primary border (existing `.nav-card:hover` — no change) |
| Icon hover | Bounce animation (existing `.nav-card:hover .nav-card-icon` — no change) |
| Tile click | `location.hash = '#/...'` — immediate hash change, router handles navigation |
| Unauthorized tile click | No visual feedback in this phase; router.js redirects to `/` or access-denied as it does today (D-10) |
| Sub-nav tab click | `window.switchHomeTab(tab)` — shows/hides Overview, Engagements, Proposals content containers (existing pattern, no change except Overview container ID update) |
| Overview tab active | Shows `#homeOverviewContent` (new wrapper containing tile grid + stats card) |
| Engagements tab active | Shows `#homeEngagementsContent` (unchanged from Phase 87.1) |
| Proposals tab active | Shows `#homeProposalsContent` (unchanged from Phase 87.1) |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (each tile) | `Enter →` (unchanged from existing nav-card pattern) |
| Tile: Clients | Manage client records, contacts, and engagement history |
| Tile: Projects | Track projects, budgets, Gantt schedules, and financials |
| Tile: Services | Manage recurring service contracts and work tracking |
| Tile: Procurement | Submit MRFs, manage suppliers, track orders and RFPs |
| Tile: Finance | Approve PRs, manage payables, collectibles, and RFPs |
| Empty state | Not applicable — tiles always render (no data dependency) |
| Error state | Not applicable — tiles are static HTML, no async state |
| Destructive confirmation | Not applicable — no destructive actions in this phase |

All descriptions: present-tense, active-voice, ≤80 characters. No punctuation at end of description line.

---

## DOM Structure (Reference)

The executor should produce this structure inside `render()`:

```html
<div class="hero-section">
  <h1 class="hero-title">🏗️ CLMC</h1>
  <p class="hero-subtitle">Management System Portal</p>

  <!-- Phase 93: replaces old .navigation-cards block -->
  <div class="dept-cards">
    <div class="dept-cards-row dept-cards-row--top">
      <!-- nav-card × 3: Clients, Projects, Services -->
    </div>
    <div class="dept-cards-row dept-cards-row--bottom">
      <!-- nav-card × 2: Procurement, Finance -->
    </div>
  </div>

  <!-- Phase 87.1: home sub-nav — preserved as-is -->
  <div class="home-sub-nav" id="homeSubNav" style="display:none;">...</div>
  <div id="homeEngagementsContent" style="display:none;"></div>
  <div id="homeProposalsContent" style="display:none;"></div>

  <!-- Phase 93: new Overview wrapper for switchHomeTab show/hide -->
  <div id="homeOverviewContent">
    <!-- hs-stat-card Procurement (unchanged) -->
    <div class="quick-stats">...</div>
  </div>
</div>
```

`switchHomeTab('overview')` must be updated to target `#homeOverviewContent` (show/hide) instead of `.quick-stats`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | not applicable | not applicable — no component registry in use |

This project uses no npm-installed UI component library and no shadcn registry. All components are hand-authored CSS classes. Registry vetting gate is not applicable.

---

## Pre-Population Sources

| Source | Decisions Used |
|--------|----------------|
| CONTEXT.md | 10 (D-01 through D-10: all tile/layout/click decisions) |
| CONTEXT.md Claude's Discretion | 4 (icon choices, descriptions, CSS approach, .nav-card extension strategy) |
| styles/hero.css (existing) | All spacing, color, animation, and nav-card tokens |
| styles/main.css (existing) | All CSS variable values (--primary, --gray-*, --danger, font) |
| app/views/home.js (existing) | switchHomeTab show/hide target, render() DOM structure |
| User input | 0 — all decisions resolved from upstream artifacts and codebase |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
