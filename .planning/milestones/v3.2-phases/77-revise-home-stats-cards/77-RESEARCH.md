# Phase 77: Revise Home Stats Cards — Research

**Researched:** 2026-04-23
**Domain:** Home page UI — Firebase Firestore real-time listeners, CSS card layout, role-aware rendering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Procurement Card — Pipeline Metrics**
Show MRF workflow as left-to-right pipeline:
| Stat | Source | Label |
|------|--------|-------|
| Pending MRFs | `mrfs` where `status == 'Pending'` | Pending MRFs |
| Pending PRs | `prs` where `finance_status == 'Pending'` | Pending PRs |
| Active POs | `pos` where `procurement_status != 'Delivered'` | Active POs |
Department filtering follows existing `getDashboardMode()` pattern (MRFs filtered client-side by `department` field).

**D-02: Projects Card — Status Breakdown**
Show two grouped stat sections:
- **Internal Status** (4 values): For Inspection, For Proposal, For Internal Approval, Ready to Submit
- **Project Status** (7 values): Pending Client Review, Under Client Review, Approved by Client, For Mobilization, On-going, Completed, Loss
Source: `projects` collection, all docs (no active filter).

**D-03: Services Card — Status Breakdown Split by Type**
Same internal + project status breakdown as Projects, split into two sub-sections:
- **One-time** (`service_type === 'one-time'`): Internal Status 4 counts + Project Status 7 counts
- **Recurring** (`service_type === 'recurring'`): Internal Status 4 counts + Project Status 7 counts
Source: `services` collection, all docs. Split client-side by `service_type`.

**D-04: Card Visual Style**
Use white shadow card style matching the 3 nav cards above. Stat cards are secondary/informational — no "Enter →" button, slightly smaller heading.

**D-05: Role Awareness**
- `operations_admin` / `operations_user` → Procurement + Projects cards only
- `services_admin` / `services_user` → Procurement + Services cards only
- `super_admin` / `finance` / `procurement_staff` / unknown → all 3 cards
Procurement card always shown regardless of role.

### Claude's Discretion

- Whether to hide zero-count status rows or show them as "0" — planner decides based on readability.
- Whether Projects and Services status rows use a compact 2-column grid or a vertical list within each section — planner decides.
- Whether the Services card uses tabs (One-time | Recurring) or stacked sections to separate the two types — planner decides.
- Exact spacing, font-size, and color treatment within the new cards — follow existing design system variables.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 77 replaces the current flat `.quick-stats` bar on the Home page with three domain-specific stat cards: Procurement, Projects, and Services. All data comes from live Firestore `onSnapshot` listeners already used throughout the codebase. The implementation is self-contained to `app/views/home.js` and `styles/hero.css` — no other views, collections, or security rules are touched.

The core challenge is information density. The Projects card must display 11 data points (4 internal + 7 project statuses) and the Services card must display 22 (11 per service type). The Procurement card is the simplest (3 pipeline counts). The pattern for everything already exists in the codebase — the work is restructuring the `render()` HTML and `loadStats()` listener subscriptions, and adding new CSS for the card layout in `hero.css`.

**Primary recommendation:** Render the three stat cards as a responsive CSS grid inside `.quick-stats`, using the same white/shadow card style as `.nav-card` but with `padding: 1.5rem` (smaller than the `2.5rem` nav cards). For Services, use stacked sections (One-time above, Recurring below, separated by a divider) rather than tabs — tabs require JS toggle logic with no benefit given the small viewport width available. Show zero-count rows so the layout is stable and the user sees all statuses at a glance.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Firebase Firestore v10.7.1 (CDN) | 10.7.1 | Real-time data source | Project-mandated; all existing listeners use `onSnapshot` |
| Pure JS ES6 modules | native | View module implementation | Project stack — no framework/build system |
| CSS custom properties | native | Styling | All colors/spacing come from `--primary`, `--gray-*` variables in `styles/main.css` |

No new dependencies. All Firestore functions needed (`collection`, `onSnapshot`) are already imported in `home.js`.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `styles/hero.css` | existing | Hero/home page styles | Add new `.hs-stat-card`, `.hs-stat-card-*` classes here |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stacked sections in Services card | Tab toggle (One-time/Recurring tabs) | Tabs need JS toggle wiring, click handlers, state management — zero benefit for 2 static sections on a read-only display |
| Show zero-count rows | Hide zero-count rows | Hiding creates unstable layout height that shifts on load; showing is visually cleaner at a glance |
| Vertical list for status rows | 2-column grid inside status group | 2-column grid cuts card height significantly — 11 items in 6 rows vs 11 rows; recommended for Projects card |

---

## Architecture Patterns

### File Impact

Only two files change:
- `app/views/home.js` — replace `render()` HTML for `.quick-stats`, extend `loadStats()`, extend `cachedStats`, add `renderStatusBreakdown()` helper
- `styles/hero.css` — add `.hs-stat-card` family rules; replace `.quick-stats` display from flex to grid-of-cards

No other files are touched. The 3 nav cards above are untouched.

### Recommended Project Structure (within home.js)

```
home.js (single file)
├── cachedStats (extended with status count maps)
├── getDashboardMode() — unchanged
├── render()
│   └── .quick-stats → 3 .hs-stat-card divs (role-gated)
├── init()
│   └── loadStats(mode) — extended
├── loadStats(mode)
│   ├── existing: MRF, PR, PO listeners
│   ├── new: projects onSnapshot → compute status count maps
│   └── new: services onSnapshot → compute status count maps × type
├── renderStatusBreakdown(containerId, countsMap) — new helper
├── updateStatDisplay(elementId, value) — unchanged
└── destroy() — unchanged (cachedStats preserved)
```

### Pattern 1: Status Count Map via Client-Side Aggregation

**What:** Fetch entire collection via `onSnapshot`, accumulate counts per status value into a `Map` or plain object.
**When to use:** Projects and Services status breakdowns — full collection fetch, client-side `.reduce()`.
**Example:**
```javascript
// Source: mirrors existing cachedStats/onSnapshot pattern in home.js
const projectsListener = onSnapshot(
    collection(db, 'projects'),
    (snapshot) => {
        const byInternal = {};
        const byProject = {};
        INTERNAL_STATUS_OPTIONS.forEach(s => byInternal[s] = 0);
        PROJECT_STATUS_OPTIONS.forEach(s => byProject[s] = 0);
        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.internal_status && byInternal[d.internal_status] !== undefined) {
                byInternal[d.internal_status]++;
            }
            if (d.project_status && byProject[d.project_status] !== undefined) {
                byProject[d.project_status]++;
            }
        });
        cachedStats.projectsByInternalStatus = byInternal;
        cachedStats.projectsByProjectStatus = byProject;
        renderStatusBreakdown('stat-projects-internal', byInternal);
        renderStatusBreakdown('stat-projects-project', byProject);
    }
);
```

### Pattern 2: renderStatusBreakdown Helper

**What:** A helper function that writes a status count map into a pre-existing container element.
**When to use:** Called from Firestore `onSnapshot` callbacks to update Projects and Services card sections.
**Example:**
```javascript
// Source: new helper modeled on existing updateStatDisplay pattern
function renderStatusBreakdown(containerId, countsMap) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = Object.entries(countsMap)
        .map(([status, count]) =>
            `<div class="hs-status-row">
                <span class="hs-status-label">${status}</span>
                <span class="hs-status-count">${count}</span>
            </div>`
        )
        .join('');
}
```

### Pattern 3: Skeleton Loading for Status Cards

**What:** Stat cards show skeleton shimmer while Firestore data loads, then switch to real content.
**When to use:** Projects/Services cards on first load (cachedStats may be null).
**Example:**
```javascript
// Source: mirrors existing skeleton-stat pattern in home.js projectsStatsHtml()
const skeletonRows = `<span class="skeleton skeleton-stat" style="width:100%;height:16px;margin-bottom:4px;display:block;"></span>`.repeat(4);
```

### Pattern 4: Services Card — Stacked Sections (not tabs)

**What:** Two labelled sections inside the Services card: "One-time" and "Recurring", separated by a `<hr>`.
**When to use:** Services card only. Eliminates JS toggle complexity.
**Example structure:**
```html
<div class="hs-stat-card">
  <h4 class="hs-stat-card-title">Services</h4>
  <div class="hs-type-section">
    <div class="hs-type-label">One-time</div>
    <div class="hs-section-group">
      <div class="hs-section-heading">Internal Status</div>
      <div id="stat-services-ot-internal"><!-- renderStatusBreakdown writes here --></div>
    </div>
    <div class="hs-section-group">
      <div class="hs-section-heading">Project Status</div>
      <div id="stat-services-ot-project"><!-- renderStatusBreakdown writes here --></div>
    </div>
  </div>
  <hr class="hs-divider">
  <div class="hs-type-section">
    <div class="hs-type-label">Recurring</div>
    <!-- same pattern -->
  </div>
</div>
```

### Pattern 5: Card Grid Layout (`.quick-stats` replacement)

**What:** Replace the current flex row in `.quick-stats` with a 3-column (or responsive) card grid.
**When to use:** The `.quick-stats` container switches from `display: flex; gap: 3rem` to `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem`.
**Example:**
```css
/* styles/hero.css — replaces or overrides existing .quick-stats flex layout */
.quick-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    max-width: 1200px;
    width: 100%;
    padding: 0;           /* remove old padding — cards carry their own */
    background: none;     /* remove old single-card container background */
    box-shadow: none;     /* each card has its own shadow */
    border-radius: 0;
}
```

### Anti-Patterns to Avoid

- **Composite Firestore indexes for home.js:** All filtering is client-side. Do not add `where()` clauses for department on `projects` or `services` — that would require composite index deployment. Full collection fetch + client-side filter is the established pattern (same as MRF department filter in current `loadStats()`).
- **Embedding status arrays directly in render() HTML:** Status option arrays must be module-level constants (inlined or imported from a shared location), not hardcoded inline strings. The CONTEXT.md specifies replicating the arrays from `projects.js` — inline them as constants at the top of `home.js`.
- **Using `getDocs` instead of `onSnapshot`:** Home view must use `onSnapshot` for real-time updates. The existing `loadStats()` uses only `onSnapshot`. Do not switch to one-time `getDocs` for the new collections.
- **Calling `destroy()` on status elements during tab switch:** Router only calls `destroy()` when leaving the home view entirely — not on hash navigation within the same view. The home view has no tabs, so this is not a risk here, but listener cleanup must still be thorough in `destroy()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status count aggregation | Custom query per status with `where('internal_status', '==', ...)` | Full collection `onSnapshot` + client-side `.forEach` counter | 11 Firestore queries per card load vs 1; composite indexes needed; rate-limit risk |
| Real-time updates | `setInterval` polling | `onSnapshot` | Already established pattern; automatic teardown; no polling interval tuning |
| Card styling from scratch | New design system | `.nav-card` as visual reference; new `.hs-stat-card` classes following same variables | Visual consistency; leverages existing `--primary`, `--gray-*`, `box-shadow` tokens |

---

## Common Pitfalls

### Pitfall 1: cachedStats Not Updated When Mode Excludes a Card
**What goes wrong:** `getDashboardMode()` returns `'projects'` (operations role), so Services listeners are never registered. If role changes mid-session (rare), Services card would have stale/null `cachedStats`. Currently not a scenario — role does not change mid-session.
**Why it happens:** `loadStats(mode)` gates which listeners are subscribed.
**How to avoid:** Accept the current pattern — `cachedStats` intentionally preserved across navigations. If role changes force re-init, `destroy()` will be called, wiping listeners, and `init()` will re-subscribe for the new role.
**Warning signs:** Console error "Cannot set property of undefined" if `cachedStats.projectsByInternalStatus` is accessed before the listener fires.

### Pitfall 2: renderStatusBreakdown Called Before DOM Exists
**What goes wrong:** `onSnapshot` fires synchronously in some edge cases, and the container `id` for the status breakdown may not be in the DOM yet if `render()` has not been called.
**Why it happens:** `init()` calls `loadStats()` which registers `onSnapshot`; Firestore may fire the first snapshot synchronously from cache.
**How to avoid:** `renderStatusBreakdown` already guards with `if (!el) return`. Cached data should also be displayed during `render()` if `cachedStats.projectsByInternalStatus !== null`.

### Pitfall 3: Hardcoded Status String Drift
**What goes wrong:** `INTERNAL_STATUS_OPTIONS` or `PROJECT_STATUS_OPTIONS` are defined in three places (projects.js, services.js, and now home.js). If a status value is renamed in the future, home.js won't be updated.
**Why it happens:** Zero-build static site with no shared module for status enums.
**How to avoid:** Add a comment in home.js pointing to projects.js lines 28–43 as the canonical source. The values are stable — no renames are expected in v3.2.
**Warning signs:** Zero counts for a status that has data; typo in status string.

### Pitfall 4: `.quick-stats` CSS Change Breaks Mobile Layout
**What goes wrong:** Current `.quick-stats` has `display: flex; flex-direction: column` on mobile (`@media max-width: 768px`). Switching to grid changes the mobile behavior. The `@media` block in `hero.css` line 253 must be updated to match the new grid layout.
**Why it happens:** The existing responsive rules were written for the flat stat items inside a single card container, not for a grid of cards.
**How to avoid:** In the `@media (max-width: 768px)` block, change `.quick-stats` to `grid-template-columns: 1fr` so the 3 stat cards stack vertically on mobile.

### Pitfall 5: Services Card Height Mismatches Procurement/Projects on Wide Screens
**What goes wrong:** Services card (22 data points) is much taller than Procurement card (3 stats) in a 3-column grid. The grid cells will have unequal heights, which is normal CSS grid behavior, but it may look awkward if the cards are left-aligned by default.
**Why it happens:** CSS grid `align-items` defaults to `stretch`, so shorter cards stretch to fill the row height — actually the desirable behavior here.
**How to avoid:** Keep `align-items: stretch` (the default). Cards stretch to row height and look balanced.

---

## Code Examples

Verified patterns from current codebase:

### Existing onSnapshot with Client-Side Filter (home.js lines 156-166)
```javascript
// Source: app/views/home.js — exact current pattern for MRF department filtering
const mrfListener = onSnapshot(
    query(collection(db, 'mrfs'), where('status', '==', 'Pending')),
    (snapshot) => {
        cachedStats.activeMRFs = snapshot.docs.filter(d =>
            (d.data().department || 'projects') === 'projects'
        ).length;
        updateStatDisplay('stat-mrfs', cachedStats.activeMRFs);
    },
    (error) => { console.error('[Home] Error loading MRF stats:', error); }
);
statsListeners.push(mrfListener);
```

### Existing updateStatDisplay (home.js lines 229-236)
```javascript
// Source: app/views/home.js — reuse as-is for Procurement card numbers
function updateStatDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        element.classList.remove('loading');
        element.classList.remove('stat-refreshing');
    }
}
```

### Nav Card Style Reference (hero.css lines 42-57)
```css
/* Source: styles/hero.css — visual target for new stat cards */
.nav-card {
    background: white;
    border-radius: 12px;
    padding: 2.5rem 2rem;
    text-align: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    transition: all 0.3s ease;
    cursor: pointer;
    border: 2px solid transparent;
}
/* New stat cards: same bg/radius/shadow, no cursor:pointer, smaller padding */
```

### INTERNAL_STATUS_OPTIONS and PROJECT_STATUS_OPTIONS (projects.js lines 28-43)
```javascript
// Source: app/views/projects.js — replicate verbatim in home.js
const INTERNAL_STATUS_OPTIONS = [
    'For Inspection',
    'For Proposal',
    'For Internal Approval',
    'Ready to Submit'
];

const PROJECT_STATUS_OPTIONS = [
    'Pending Client Review',
    'Under Client Review',
    'Approved by Client',
    'For Mobilization',
    'On-going',
    'Completed',
    'Loss'
];
```

### Services Collection — Confirmed Field Names (services.js lines 720-738)
```javascript
// Source: app/views/services.js — addDoc call confirms field names
await addDoc(collection(db, 'services'), {
    service_type,        // 'one-time' | 'recurring'
    internal_status,     // INTERNAL_STATUS_OPTIONS value
    project_status,      // PROJECT_STATUS_OPTIONS value
    active: true,
    // ...
});
```

### Skeleton Stat (existing class in components.css)
```css
/* Source: styles/components.css lines 1638-1644 */
.skeleton-stat {
    height: 28px;
    width: 48px;
    display: inline-block;
    vertical-align: middle;
}
/* Re-use for status row loading state — adjust width: 100% for full-width rows */
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `.quick-stats` container with flat stat items | 3 domain-specific stat cards inside `.quick-stats` | Phase 77 | Cards become self-contained; each card has its own heading, section grouping, and update scope |
| `projectsStatsHtml()` / `servicesStatsHtml()` helper functions | Inline card HTML in `render()` with dedicated card helpers | Phase 77 | Old helpers deprecated; new card HTML helpers replace them |
| `cachedStats.activeMRFs` etc. (5 scalar keys) | `cachedStats` extended with 6 map keys for status breakdowns | Phase 77 | Backward-compatible extension — existing keys unchanged |

---

## Open Questions

1. **Import vs inline for INTERNAL_STATUS_OPTIONS**
   - What we know: `projects.js` and `services.js` each define their own copy of these arrays. `home.js` has no import of either view.
   - What's unclear: Whether to import from a shared utility or inline a third copy.
   - Recommendation: Inline in `home.js` with a comment pointing to `app/views/projects.js:28`. The zero-build static site has no bundler, so cross-view imports are technically possible (ES modules support it) but add a coupling risk. Inlining is the established pattern throughout the codebase (services.js already duplicates from projects.js).

2. **Procurement card: filter MRF Pending count by department based on mode**
   - What we know: Current home.js filters MRF counts by `department === 'projects'` or `=== 'services'` based on role. D-01 says "Department filtering follows existing `getDashboardMode()` pattern."
   - What's unclear: For `mode === 'both'` (super_admin/finance/procurement_staff), should Pending MRFs count include ALL departments or split by department?
   - Recommendation: For `mode === 'both'`, show total Pending MRFs across all departments (no department filter) — the Procurement card is a cross-cutting pipeline view. For `mode === 'projects'` or `mode === 'services'`, filter by the appropriate department as currently done. Planner should confirm this interpretation.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure JS/CSS/Firebase change; Firebase already deployed and connected)

---

## Validation Architecture

`workflow.nyquist_validation` key is absent from `.planning/config.json` — treated as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual browser testing (no automated test framework — project convention) |
| Config file | none |
| Quick run command | `python -m http.server 8000` then open browser DevTools |
| Full suite command | Manual UAT — navigate to Home, verify each card role by role |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Procurement card shows Pending MRFs / Pending PRs / Active POs counts | manual | n/a | n/a |
| D-02 | Projects card shows Internal Status and Project Status breakdowns | manual | n/a | n/a |
| D-03 | Services card shows One-time and Recurring breakdowns with status counts | manual | n/a | n/a |
| D-04 | New cards visually match nav-card white/shadow style | manual | n/a | n/a |
| D-05 | Role-aware: operations → Procurement+Projects; services → Procurement+Services; both → all 3 | manual | n/a | n/a |

### Sampling Rate
- **Per task commit:** Manual: load home page as at least one role, verify card(s) render with live data
- **Per wave merge:** Manual: test all 3 role modes (operations_admin, services_admin, super_admin)
- **Phase gate:** Full role matrix tested before `/gsd:verify-work`

### Wave 0 Gaps
None — no test framework to install. All verification is manual UAT consistent with project conventions.

---

## Sources

### Primary (HIGH confidence)
- `app/views/home.js` (read directly) — current `getDashboardMode()`, `loadStats()`, `cachedStats`, listener patterns, `updateStatDisplay()`
- `app/views/projects.js` lines 28–43 (read directly) — canonical `INTERNAL_STATUS_OPTIONS` and `PROJECT_STATUS_OPTIONS` arrays
- `app/views/services.js` lines 693–738 (read directly) — confirms `service_type`, `internal_status`, `project_status` field names
- `styles/hero.css` (read directly) — `.nav-card`, `.quick-stats`, `.stat-item`, `.stat-group`, all existing classes and responsive breakpoints
- `styles/components.css` (read directly) — `.skeleton-stat`, `.skeleton` shimmer pattern
- `styles/main.css` (read directly) — all CSS custom properties available

### Secondary (MEDIUM confidence)
- `.planning/phases/77-revise-home-stats-cards/77-CONTEXT.md` — user decisions and canonical refs
- `CLAUDE.md` project-level — confirmed zero-build, pure JS, Firebase Firestore schema

---

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Pure JavaScript ES6 modules, no framework, no build system
- **Database:** Firebase Firestore v10.7.1 (CDN) — use `onSnapshot` for real-time, client-side filtering for status aggregation
- **No composite indexes** — full collection fetch + `.filter()` / `.forEach()` is the standard pattern
- **No new collections** — `projects` and `services` already exist
- **No security rule changes** — reading existing collections; no new collections introduced
- **Window functions:** Not required for this feature (no onclick handlers in stat cards)
- **View module structure:** `render()`, `init()`, `destroy()` must all be exported and updated
- **cachedStats preserved on destroy():** stale-while-revalidate pattern must be maintained — do NOT reset status maps in `destroy()`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all implementation uses existing codebase patterns and Firebase; no new libraries
- Architecture: HIGH — patterns directly observed in `home.js`, `projects.js`, `services.js`; no speculation
- Pitfalls: HIGH — identified from direct CSS/JS reading; responsive breakpoint and DOM timing issues are known patterns in this codebase

**Research date:** 2026-04-23
**Valid until:** 2026-06-01 (stable domain; only stale if projects.js or services.js status enums change)
