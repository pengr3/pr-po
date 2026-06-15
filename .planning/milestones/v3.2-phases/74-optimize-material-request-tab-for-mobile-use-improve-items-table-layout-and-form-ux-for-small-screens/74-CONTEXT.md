# Phase 74: Optimize Material Request Tab for Mobile Use — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Mobile optimization of the Material Request Form tab. Three distinct areas:
1. **Items table** — replace the 5-column horizontal-scroll table with a card-per-item layout on mobile
2. **My Requests tab** — replace the 8-column table with MRF summary cards on mobile
3. **Tab navigation bar** — upgrade from generic `.tab-btn` tabs to a sticky pill bar

Desktop behavior stays unchanged throughout. All changes are CSS media-query gated at `≤768px`.

</domain>

<decisions>
## Implementation Decisions

### Items Table Mobile Layout
- **D-01:** Use card-per-item layout on mobile — CSS dual-mode pattern: both `.table-scroll-container` (desktop) and a new `.mrf-item-card-list` (mobile) exist in the DOM simultaneously. `@media (max-width: 768px)` hides the table, shows the cards. Same pattern as Phase 73.1 Finance cards.
- **D-02:** Each item card stacks fields in this order: Item Description (full width input), then Qty + Unit side-by-side on one row, then Category full width.
- **D-03:** Remove button: top-right [×] icon on each card (small, positioned absolute or flex at card top-right). Not a full-width button at the bottom.
- **D-04:** "Add Another Item" button: full-width on mobile (`width: 100%`). Same touch-target treatment as Finance action buttons at `≤768px`.
- **D-05:** Desktop items table is untouched — same 5-column table in `.table-scroll-container` as today.

### My Requests Tab Mobile Layout
- **D-06:** Include My Requests mobile optimization in Phase 74 (not deferred).
- **D-07:** Each MRF card shows 4 key fields: MRF ID (prominent, as card header/title), MRF Status (badge), Date Needed, and an Actions area. PRs/POs counts and Procurement Status are secondary — omit from the mobile card to keep it scannable.
- **D-08:** Mobile action access via 3-dot (⋮) menu icon on each card. Tapping it opens a small dropdown showing "Edit MRF" and "Cancel MRF" (same logic as current context menu: only shown for Pending/In Progress statuses). Non-actionable MRFs show "No actions available" greyed out.
- **D-09:** Desktop right-click context menu on My Requests is **unchanged** — 3-dot menu is mobile-only.
- **D-10:** Card HTML generation should go in `mrf-records.js` (the shared controller) so the mobile card is rendered by `createMRFRecordsController`, consistent with how the controller owns the table rendering.

### Tab Navigation Bar
- **D-11:** Replace the current `.tab-btn` tabs with a sticky pill bar, scoped to a new `.mrf-sub-nav-tab` class (does NOT touch `.tab-btn`, `.finance-sub-nav-tab`, or any other view's nav).
- **D-12:** Apply scroll-hide/show behavior on mobile — same as Phase 73.3 Finance pill bar (scrolling down hides nav, scrolling up reveals it).
- **D-13:** Pill bar is sticky (`position: sticky; top: 0`) on both desktop and mobile.
- **D-14:** Only 2 tabs (Material Request Form | My Requests) — simpler than Finance's 5-tab nav, but same implementation pattern.

### Claude's Discretion
- CSS class naming for MRF item cards (e.g., `.mrf-item-card`, `.mrf-item-card-list`) — follow `.fc-card` / `.fc-card-list` naming convention from Finance but with `mrf-` prefix scope.
- Whether to implement the 3-dot dropdown as a positioned div (like existing context menus in the codebase) or a `<details>`/`<summary>` element.
- Layout of Qty + Unit row: exact widths/proportions on the card (e.g., 30% Qty / 70% Unit).
- Whether My Requests card needs Project name or urgency badge as secondary info — researcher/planner can determine based on what fits readably.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary File
- `app/views/mrf-form.js` — Full MRF view: form render (lines 157–351), items table HTML (lines 263–330), My Requests render (lines 49–117), tab nav render (lines 26–43), `addItem()`/`removeItem()` window functions (lines 1059–1086)

### Shared Controller
- `app/views/mrf-records.js` — `createMRFRecordsController` — owns table rendering for My Requests; mobile card HTML should be added here (not in mrf-form.js)

### CSS Reference — Finance Mobile Card Pattern (Phase 73.1)
- `styles/views.css` lines 1729–1870 — `.fc-card-list`, `.fc-card`, `.fc-card-header`, `.fc-card-body`, `.fc-card-row`, `.fc-card-actions` — the established card CSS pattern to follow for MRF cards
- `styles/views.css` lines 1736–1747 — CSS dual-mode rules: `.fc-card-list { display: none }` default, then `@media` shows cards and hides `.table-scroll-container` scoped by section IDs

### CSS Reference — Finance Pill Nav (Phase 73.3)
- `styles/views.css` lines 1635–1710 — `.finance-sub-nav-tab`, `.finance-tab-nav` sticky pill bar CSS — reference for the MRF pill bar (D-11 through D-14). Scroll-hide behavior is here.

### Existing MRF Mobile CSS
- `styles/views.css` lines 825–890 — existing `@media (max-width: 768px)` block for MRF procurement sidebar (`.mrf-list`) — new MRF form mobile rules should be added nearby or in the same block

### Finance Tab Nav JS (Phase 73.3)
- `app/views/finance.js` — `renderFinanceTabNav()` function and scroll listener setup (`_financeNavScrollHandler`) — reference for implementing `.mrf-sub-nav-tab` pill bar in `mrf-form.js`

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.table-scroll-container` — already wraps the items table in `mrf-form.js:263` and My Requests table in `mrf-form.js:94`; the dual-mode CSS pattern hides these at `≤768px`
- `window.addItem()` / `window.removeItem()` — existing DOM manipulation functions for items table; card layout will need companion JS to add/remove card elements in sync with table rows, OR replace the DOM manipulation to work directly on cards (planner to decide)
- `UNIT_OPTIONS` / `CATEGORY_OPTIONS` constants (`mrf-form.js:500–510`) — shared between create form and edit modal; card item dropdowns should reference these same arrays
- Finance scroll listener pattern (`_financeNavScrollHandler`) in `finance.js` — copy pattern for MRF nav scroll hide/show with `_mrfNavScrollHandler` guard

### Established Patterns
- CSS dual-mode (Phase 73.1): desktop table + mobile card list in DOM simultaneously, CSS media query switches visibility. No JS viewport detection.
- Finance pill nav (Phase 73.3): `if (!_financeNavScrollHandler)` init guard prevents duplicate binding on tab-switch re-init.
- Scoped class prefixes: Finance uses `.fc-` and `.finance-sub-nav-tab`; MRF cards should use `.mrf-` prefix. Do NOT reuse Finance class names.
- Context menu pattern in `mrf-form.js:802–826` (initMyRequests) — existing dropdown div built via JS for right-click. The 3-dot mobile dropdown should follow the same `document.createElement('div')` + positioned CSS approach.

### Integration Points
- `mrf-form.js` → `renderSubTabNav()` — replace `.tab-btn` with `.mrf-sub-nav-tab` pill bar
- `mrf-form.js` → items table section (lines 263–330) — add `.mrf-item-card-list` sibling alongside existing `.table-scroll-container`
- `mrf-records.js` → `createMRFRecordsController` — add mobile card render path for My Requests (parallel to desktop table render)
- `styles/views.css` — add new `.mrf-item-card*` rules and `@media` dual-mode block; add `.mrf-sub-nav-tab` pill nav CSS

</code_context>

<specifics>
## Specific Ideas

- **Items card mockup (user-confirmed):**
  ```
  +----------------------------------+ [×]
  | Item Description                 |
  | [___________________________]    |
  | Qty     Unit                     |
  | [____]  [Select Unit  ▾]         |
  | Category                         |
  | [Select Category          ▾]     |
  +----------------------------------+
  [ + Add Another Item ] (full width)
  ```

- **My Requests card:** MRF ID as header/title chip, MRF Status badge, Date Needed, then 3-dot (⋮) icon for Edit/Cancel actions. Compact — not showing all 8 desktop columns.

- **Tab navigation:** "just like the previous phase" — user explicitly wants parity with Phase 73.3 Finance pill bar. Same sticky + scroll-hide behavior, different scoped CSS class.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 74-optimize-material-request-tab-for-mobile-use-improve-items-table-layout-and-form-ux-for-small-screens*
*Context gathered: 2026-04-16*
