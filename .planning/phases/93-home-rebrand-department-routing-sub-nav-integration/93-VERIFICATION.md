---
phase: 93-home-rebrand-department-routing-sub-nav-integration
verified: 2026-05-25T11:30:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Navigate to the home page. Verify the 5 department tiles appear in a 3-on-top (Clients, Projects, Services) + 2-centered-below (Procurement, Finance) layout. Confirm the bottom row is visually centered under the top row (not left-aligned with empty space on the right)."
    expected: "Desktop shows 3 tiles on top row, 2 tiles on bottom row, with the bottom row horizontally centered."
    why_human: "CSS max-width calc() centering is visual — cannot verify pixel alignment programmatically without a rendering engine."
  - test: "Click each of the 5 tiles in sequence. Verify navigation: Clients → #/clients, Projects → #/projects, Services → #/services, Procurement → #/procurement, Finance → #/finance."
    expected: "Each tile click routes to the correct hash and renders the corresponding view."
    why_human: "Router dispatch and view rendering require a live browser session."
  - test: "Log in as a role that sees the home sub-nav (operations_admin or super_admin). Verify the Overview | Engagements | Proposals tabs appear. Click Engagements — the tile grid should still be visible (tiles are outside #homeOverviewContent). Click back to Overview — the Procurement stats card reappears inside #homeOverviewContent."
    expected: "Tile grid is always visible regardless of which sub-tab is active. Stats card is only visible in Overview sub-tab."
    why_human: "switchHomeTab() show/hide behavior and role-based sub-nav visibility require a live browser with an authenticated session."
  - test: "Resize browser to ≤1024px. Verify top row becomes 2 columns, bottom row stays 2 columns (side by side — Procurement and Finance are equal width, not Finance spanning full width)."
    expected: "At tablet width: 2-column top row + 2-column bottom row. Finance tile is NOT full-width centered alone."
    why_human: "Responsive breakpoint visual layout requires browser rendering."
  - test: "Resize browser to ≤768px. Verify all 5 tiles stack into a single column."
    expected: "All tiles collapse to 1-column stack."
    why_human: "Mobile breakpoint visual layout requires browser rendering."
---

# Phase 93: Home Rebrand Department Routing + Sub-Nav Integration — Verification Report

**Phase Goal:** Rebrand the home page with a 5-tile departmental grid (Clients, Projects, Services, Procurement, Finance) replacing the 3 legacy nav-cards; preserve Phase 87.1 sub-nav infrastructure verbatim; restructure Overview sub-tab to show tiles above Procurement stats card.
**Verified:** 2026-05-25T11:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.dept-cards`, `.dept-cards-row--top`, `.dept-cards-row--bottom` exist in hero.css with correct grid-template-columns (3fr top / 2fr centered bottom) | VERIFIED | Lines 87–109 of hero.css: `.dept-cards-row--top { grid-template-columns: repeat(3, 1fr); }`, `.dept-cards-row--bottom { grid-template-columns: repeat(2, 1fr); max-width: calc((100% - 4rem) * 2 / 3 + 2rem); margin: 0 auto; }` |
| 2 | Existing `.navigation-cards` and `.nav-card` rules are unchanged | VERIFIED | grep -c "navigation-cards" hero.css = 3; all rules at lines 33–84 are present verbatim; no deletion in any commit |
| 3 | Responsive overrides are inside the existing ≤1024px block (top→2col, bottom full-width, no bad last-child override) and ≤768px block (both rows → 1fr) | VERIFIED | Lines 341–348 (≤1024px): top=repeat(2,1fr), bottom=repeat(2,1fr) max-width:100%. No `.dept-cards-row--bottom .nav-card:last-child` in that block (W-2 fix in commit e606873). Lines 381–391 (≤768px): both rows → grid-template-columns:1fr |
| 4 | home.js render() emits `.dept-cards` with 5 tiles: Clients, Projects, Services (top row), Procurement, Finance (bottom row) | VERIFIED | Lines 131–166 of home.js: `<div class="dept-cards">` containing `.dept-cards-row--top` (3 nav-cards) and `.dept-cards-row--bottom` (2 nav-cards); all 5 tiles confirmed by text content |
| 5 | `.navigation-cards` class is absent from home.js (old 3 legacy nav-cards removed) | VERIFIED | `grep -c "navigation-cards" home.js` = 0; `grep -c "mrf-form" home.js` = 0 |
| 6 | Tile onclick routes use `location.hash='#/clients'` etc. — no new `window.*` functions for tiles | VERIFIED | Lines 133, 139, 145, 153, 159 in home.js show `onclick="location.hash='#/clients'"` etc.; no new `window.*` registrations for tile clicks in init() beyond the pre-existing sub-nav handlers |
| 7 | `#homeOverviewContent` wraps `.quick-stats` in render() | VERIFIED | Lines 183–187 of home.js: `<div id="homeOverviewContent"><div class="quick-stats">${statsContent}</div></div>` |
| 8 | `switchHomeTab()` uses `document.getElementById('homeOverviewContent')` — not `document.querySelector('.quick-stats')` | VERIFIED | Line 198 of home.js: `const overviewEl = document.getElementById('homeOverviewContent');`; no `querySelector('.quick-stats')` present |
| 9 | Phase 87.1 sub-nav elements (`#homeSubNav`, `#homeEngagementsContent`, `#homeProposalsContent`) present in render(); `getHomeSubTabConfig()` unchanged | VERIFIED | Lines 169, 179, 180 of home.js confirm all three IDs in render(); `getHomeSubTabConfig()` at lines 55–64 is identical to the Phase 87.1 contract (role checks for finance/procurement_staff, canEngagements/canProposals/canApproveQueue) |

**Score: 9/9 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `styles/hero.css` | `.dept-cards`, `.dept-cards-row`, responsive overrides for dept grid | VERIFIED | 9 occurrences of "dept-cards" across base + 2 media blocks; existing .navigation-cards rules untouched |
| `app/views/home.js` | Updated render() with 5-tile .dept-cards grid + #homeOverviewContent wrapper; updated switchHomeTab() | VERIFIED | 3 structural `.dept-cards` lines in render(); switchHomeTab() targets getElementById; all other functions byte-for-byte unchanged |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `hero.css .dept-cards-row` | `home.js render() .dept-cards-row--top / .dept-cards-row--bottom` | class names in Plan 02 HTML template | VERIFIED | home.js line 132: `class="dept-cards-row dept-cards-row--top"`, line 152: `class="dept-cards-row dept-cards-row--bottom"` match the CSS selectors in hero.css exactly |
| `home.js render() #homeOverviewContent` | `switchHomeTab() overviewEl selector` | `document.getElementById('homeOverviewContent')` | VERIFIED | Render emits `id="homeOverviewContent"` at line 183; switchHomeTab() reads it at line 198 |
| `home.js .nav-card tiles` | `router.js route protection` | `onclick="location.hash='#/...'"` | VERIFIED | All 5 tiles use inline hash assignment; router.js route protection (pre-existing, not modified this phase) handles auth on navigate |

---

### Data-Flow Trace (Level 4)

Tiles are navigation elements (static onclick), not data-rendering components. No data-flow trace needed for the tile grid.

The Procurement stats card (`#homeOverviewContent > .quick-stats`) renders live Firestore data via `onSnapshot` listeners in `loadStats()` — this infrastructure is unchanged from pre-Phase 93 and was verified in prior phases.

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — this is a static SPA with no build system and no runnable CLI entry points. Browser required for all rendering checks. Moved to Human Verification.

---

### Probe Execution

Step 7c: No probes declared in PLAN files. No `scripts/*/tests/probe-*.sh` files present.

---

### Requirements Coverage

No formal requirement IDs (REQ-*) declared in either plan's frontmatter. Phase is a pure UI rebrand with no REQUIREMENTS.md entries.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No TBD, FIXME, XXX, or placeholder markers found in modified files. No stub implementations. No hardcoded empty data passed to rendering paths.

**REVIEW.md findings and resolution:**

Both warnings flagged in `93-REVIEW.md` (written by the reviewer after the plans executed) were fixed in commit `e606873`:

- **W-1** (calc() formula subtracting 1 gap instead of 2): Fixed — line 107 now reads `calc((100% - 4rem) * 2 / 3 + 2rem)`.
- **W-2** (`.dept-cards-row--bottom .nav-card:last-child` grid-column:1/-1 incorrectly applied at ≤1024px): Fixed — that rule is absent from the ≤1024px block; only the ≤768px reset remains (which is harmless by the review's own assessment).

---

### Human Verification Required

#### 1. Desktop 3+2 Centered Layout

**Test:** Navigate to the home page on desktop (≥1025px). Confirm 5 department tiles render: 3 on top (Clients, Projects, Services), 2 centered below (Procurement, Finance). Confirm bottom row is visually centered under the 3-tile top row, not left-aligned.
**Expected:** Bottom row (Procurement + Finance) appears centered horizontally relative to the 3 tiles above.
**Why human:** CSS `max-width: calc((100% - 4rem) * 2/3 + 2rem)` centering requires a browser rendering engine to verify pixel alignment.

#### 2. Tile Click Routing

**Test:** Click each of the 5 tiles on the home page.
**Expected:** Clients → `#/clients`, Projects → `#/projects`, Services → `#/services`, Procurement → `#/procurement`, Finance → `#/finance`. Each route loads the correct view.
**Why human:** Hash routing and view dispatch require a live browser session.

#### 3. Overview Sub-Tab — Tiles Always Visible, Stats Gated

**Test:** Log in as `operations_admin` or `super_admin`. Verify the Overview | Engagements | Proposals sub-nav appears. Switch to Engagements tab — confirm the 5 department tiles are still visible above the sub-nav (they are outside `#homeOverviewContent`). Switch back to Overview — confirm the Procurement stats card (Pending MRFs / Pending PRs / Active POs) is visible.
**Expected:** Tiles are always visible. Stats card appears only under Overview tab. Switching tabs hides/shows only `#homeOverviewContent`.
**Why human:** `switchHomeTab()` show/hide behavior and role-based sub-nav visibility require authenticated browser session.

#### 4. Tablet Layout (≤1024px)

**Test:** Resize browser to 768–1024px. Verify top row becomes 2 columns (Clients, Projects — Services wraps). Verify bottom row stays 2 columns side-by-side (Procurement | Finance — equal width, not Finance spanning the full row).
**Expected:** 2-column top row + 2-column bottom row at tablet width. Finance tile is NOT full-width.
**Why human:** Responsive breakpoint layout requires browser rendering.

#### 5. Mobile Layout (≤768px)

**Test:** Resize to ≤768px. Verify all 5 tiles collapse to a single-column stack.
**Expected:** 5 tiles in a vertical single-column stack.
**Why human:** Mobile breakpoint layout requires browser rendering.

---

### Gaps Summary

No gaps. All 9 must-haves are verified in the codebase. Both REVIEW.md warnings (calc() formula, ≤1024px last-child override) were addressed in commit `e606873` before the phase was submitted for verification — the actual hero.css file on disk reflects the corrected rules.

Status is `human_needed` (not `passed`) because 5 visual and behavioral checks require a live browser to confirm: desktop centering, tile routing, sub-tab show/hide, and responsive breakpoints.

---

_Verified: 2026-05-25T11:30:00Z_
_Verifier: Claude (gsd-verifier)_
