---
phase: 93
status: issues
files_reviewed: 2
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
---

# Code Review — Phase 93: Home Rebrand Department Routing

**Files reviewed:** `styles/hero.css`, `app/views/home.js`
**Depth:** standard

---

## Critical (0)

None.

---

## Warning (2)

### W-1: calc() formula underestimates gap deduction — bottom row ~21px too wide

**File:** `styles/hero.css` — `.dept-cards-row--bottom`

The formula `calc((100% - 2rem) * 2 / 3 + 2rem)` subtracts only 1 gap (2rem) instead of 2 gaps (4rem total in a 3-col grid). A 3-column grid with `gap: 2rem` has 2 internal gaps, so the correct formula is `(100% - 4rem) * 2/3 + 2rem`.

At 1200px container (1rem=16px):
- Current: `(1200-32)*2/3+32 = 810.67px`
- Correct: `(1200-64)*2/3+32 = 789.33px`
- Overshoot: ~21px → bottom row edges don't align with top row columns

**Fix:**
```css
.dept-cards-row--bottom {
    max-width: calc((100% - 4rem) * 2 / 3 + 2rem);
}
```

---

### W-2: ≤1024px last-child override incorrectly orphans Finance tile

**File:** `styles/hero.css` — `@media (max-width: 1024px)` `.dept-cards-row--bottom .nav-card:last-child`

The `grid-column: 1 / -1` rule was borrowed from the old `.navigation-cards` centering pattern (for an odd-numbered 3-card grid at 2-column breakpoint), but the bottom row already has exactly 2 tiles in a `repeat(2, 1fr)` grid. No orphan occurs. The override converts a clean 2×1 side-by-side layout into:

- Row A: Procurement (column 1 only, column 2 empty)
- Row B: Finance (full width, 500px max-width centered)

This is visually inconsistent with the top row's 2×1 tablet layout.

**Fix:** Remove the `.dept-cards-row--bottom .nav-card:last-child` block from the ≤1024px media query (and the corresponding ≤768px reset becomes unnecessary but harmless).

---

## Info (0)

---

## Clean

- `render()` DOM structure: correct `.dept-cards > .dept-cards-row--top` (3 tiles) + `.dept-cards-row--bottom` (2 tiles)
- `switchHomeTab()` selector update: `getElementById('homeOverviewContent')` — more specific, correct
- Phase 87.1 sub-nav regression: None — `#homeSubNav`, `getHomeSubTabConfig()`, `init()`, `destroy()` unchanged
- XSS — tile onclick: all 5 use hardcoded string literals, no user input
- Route targets: all 5 routes (`#/clients`, `#/projects`, `#/services`, `#/procurement`, `#/finance`) exist in router.js
- Media query ordering: correct descending cascade
- `.navigation-cards` CSS retained (no usage in home.js after edit)
