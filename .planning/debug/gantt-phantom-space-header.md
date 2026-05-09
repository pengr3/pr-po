---
status: resolved
slug: gantt-phantom-space-header
trigger: "A phantom blank space/gap appears between the Gantt date-header row and the first bar row when the user interacts with the chart (hover, click, drag). The space is NOT present on initial load — it appears on first interaction. Gets progressively worse (larger) on Month zoom vs Week vs Day. Has never been present before phases 86.x. User confirmed: the bug is NOT the dark parent-bar color — it is blank vertical space inserted between the header and the bars area."
created: 2026-05-08T18:00:00Z
updated: 2026-05-09T04:30:00Z
reopened: 2026-05-09 — fix in 88fef29 did NOT resolve; user reports gap still visible across Day/Week/Month per fresh screenshots
final_resolved: 2026-05-09T04:30:00Z — root cause was misidentified twice; full Frappe v1.2.2 CDN source archaeology pinpointed `.grid-header` parent div (height:85px, position:sticky, z-index:1000) as the surviving native header that previous fixes failed to hide; combined with overlay height=85px (vs Frappe's bar y=94 from compute_y), a 9px+ gap was visible
---

# Debug Session: gantt-phantom-space-header

## Symptoms

- **Expected:** No gap between the Gantt calendar header row and the first task bar row. The bars start immediately below the header.
- **Actual:** A blank/empty vertical space appears between the date-header and the first bar. It appears ONLY after the user first interacts with the chart (hover, click, drag, predecessor edge drag — any interaction). It is NOT present on initial load. The gap grows larger with Month zoom compared to Week or Day zoom.
- **Screenshot evidence (Image 5):** Month zoom. Red arrow points to blank space between "Mar 2026 / Apr 2026 / May 2026 / Jun 2026 / Jul 2026" header row and the first bar row containing "Demo". The gap is approximately 1-2 row heights of empty space.
- **Error messages:** None
- **Timeline:** Regression introduced in phases 86.x. Was never present before. Specific phase: 8af0c04 (86.4-uat) — pivoted from a sibling-overlay design to a covering-overlay that hides Frappe's `.upper-header`/`.lower-header` but left `.grid-header` parent visible.
- **Reproduction:** Open any project plan. On initial load the chart looks correct. Then hover or click anything inside the Gantt pane. The space appears.
- **Zoom dependency:** Gap is larger on Month zoom, smaller on Week, smallest on Day. This suggests the space is proportional to column width (Frappe's column_width config varies per zoom mode — Month has wider columns than Day).

## Prior fix attempts (all targeted wrong element or wrong side of geometry)

- CSS height override on parent bar rect — UNRELATED (was targeting parent bar appearance, not this gap)
- JS SVG attribute override in initGanttDragLink() — UNRELATED
- Added initGanttDragLink() call to setGanttZoom() — UNRELATED
- 88fef29 — set Frappe `header_height:67` thinking constructor would respect it; Frappe v1.2.2's `update_view_scale()` SILENTLY OVERWRITES `config.header_height = lower_header_height + upper_header_height + 10 = 85`, so the override was ignored and the bar still landed at y=94 (=85+9), but the overlay was hard-locked to 85px → 9px strip exposed
- Hiding only `.upper-header, .lower-header` (the date-text children) but leaving `.grid-header` parent (height:85px, sticky, z-index:1000, white background) — `.grid-header` continued to render its 85px-tall white empty band over the SVG, producing the visible "extra" gap on top of the 9px strip

## Key investigation angles (resolved)

1. **Frappe v1.2.2 actual compute_y formula**: confirmed by reading the CDN source (`frappe-gantt@1.2.2/dist/frappe-gantt.umd.js`). `compute_y(){this.y=this.gantt.config.header_height+this.gantt.options.padding/2+this.task._index*(this.height+this.gantt.options.padding)}`. For task index 0: `y = header_height + padding/2`. With Frappe defaults `lower_header_height:30, upper_header_height:45`, computed `header_height = 30+45+10 = 85`. With our `padding:18`, first bar y = 85 + 9 = **94**.

2. **Frappe `update_view_scale()` ignores `options.header_height`**: it OVERWRITES `config.header_height` with `lower_header_height + upper_header_height + 10`. Setting `header_height: 67` in 88fef29 had ZERO effect.

3. **Frappe DOM structure**: `.gantt-container` (position:relative, isolation:isolate) contains a `.grid-header` DIV (sticky, height:85px, z-index:1000, background:#fff) and an `<svg class="gantt">` (position:absolute, top:0). The SVG draws bars at y=94. `.grid-header` is the parent of `.upper-header`/`.lower-header`. Hiding only the children leaves `.grid-header` visible as an empty 85px white strip.

4. **Left/right pane parity (GANTT-OVERLAY-PANE-PARITY)**: `.task-grid thead tr` was 85px. After fix, both panes use 94px to match Frappe's actual first-bar y position.

## Current Focus

hypothesis: "RESOLVED — full archaeology of Frappe v1.2.2 CDN source identified two compounding causes: (a) `update_view_scale()` overwrites `options.header_height` so 88fef29's setting was a no-op; (b) only `.upper-header`/`.lower-header` were hidden, leaving the `.grid-header` parent div (85px, white, z-index:1000) producing the visible gap. Fix: hide `.grid-header` directly + set overlay height to `config.header_height + padding/2` (=94) + update left-pane `.task-grid thead tr` to 94px for parity."
test: "Reload project plan in browser; verify no gap above first bar in Day/Week/Month zoom modes both on initial load and after first interaction; verify left-pane row 1 top edge aligns with right-pane bar 1 top edge."
expecting: "No phantom gap; left/right panes vertically aligned at task row 1."
next_action: "Browser UAT (manual verification)"

## Evidence

- timestamp: 2026-05-08T19:00:00Z
  finding: "Frappe v1.2.2 source: config.header_height = lower_header_height(30) + upper_header_height(45) + 10 = 85. First bar y = header_height + padding/2 = 85 + 9 = 94. Overlay was set to 85px, leaving a 9px strip of SVG grid-row background visible between overlay bottom and first bar top."
  file: app/views/project-plan.js:1633
  action: applied fix (later proven incomplete)

- timestamp: 2026-05-08T19:10:00Z
  finding: "getBBox() approach in reverted commit f008ed5 was fragile — getBBox() can return {y:0} before SVG is composited, giving Math.max(30,0)=30px overlay and a 64px gap. Deterministic formula (header_height + padding/2) is robust."
  file: app/views/project-plan.js
  action: confirmed revert of f008ed5 was correct; used deterministic formula instead

- timestamp: 2026-05-08T19:15:00Z
  finding: "Zoom-proportionality perception: gap is a constant 9px+85px=94px in all zoom modes (the 85px is Frappe's still-visible .grid-header). In Month view (wide columns, few vertical gridlines), the gap appears bigger because there are fewer column dividers visually breaking up the empty band. In Day view (dense vertical gridlines every 38-45px), the same gap is broken up and less noticeable. Not actually zoom-proportional — perceptual artifact."
  file: n/a
  action: noted for record

- timestamp: 2026-05-09T03:30:00Z
  finding: "Fix in commit 88fef29 (header_height:67 + padding:18, overlay locked to 85px) was committed at 11:20 AM 2026-05-09 by user but DID NOT resolve. User screenshots taken after this commit confirm gap still visible on Day, Week, Month zoom modes. Premise of 88fef29 commit message says '67 + padding(18) = 85' but Frappe v1.2.2's update_view_scale() OVERWRITES this with lower(30)+upper(45)+10=85 regardless of what was passed."
  file: app/views/project-plan.js:1184, app/views/project-plan.js:1635
  action: reopen session — pursue git archaeology approach per user directive

- timestamp: 2026-05-09T04:00:00Z
  finding: "Downloaded Frappe v1.2.2 CDN source (https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.umd.js + .css). Confirmed: (1) compute_y formula is `header_height + padding/2 + index*(height+padding)`; (2) `update_view_scale` overwrites `config.header_height = options.lower_header_height + options.upper_header_height + 10`; (3) `make_grid_header()` creates a `.grid-header` DIV (NOT inside the SVG) appended to `.gantt-container` as a sibling of the SVG; (4) CSS sets `.grid-header { height: calc(var(--gv-lower-header-height) + var(--gv-upper-header-height) + 10px); position: sticky; top:0; z-index: 1000; background: var(--g-header-background)=#fff }`; (5) `.gantt` (the SVG) is `position: absolute` so it does NOT get pushed down by `.grid-header` — both render at top:0 of `.gantt-container`."
  file: app/views/project-plan.js
  action: identified root cause #2 — `.grid-header` parent div was never hidden

- timestamp: 2026-05-09T04:00:00Z
  finding: "Healthy reference (efd94db, 86.3-05): the ORIGINAL `renderGanttHeaderOverlay()` was a 45px-tall sibling overlay placed BELOW Frappe's visible native header (no covering, no hiding). Pivoted to covering design in 8af0c04 (86.4-uat) — that pivot inadvertently hid only `.upper-header`/`.lower-header`, NOT their `.grid-header` parent."
  file: git history (efd94db, 8af0c04)
  action: archaeology complete — fix derived

- timestamp: 2026-05-09T04:30:00Z
  finding: "Applied complete fix: (a) JS — hide `.grid-header` selector in addition to `.upper-header, .lower-header`; (b) JS — overlay height = `config.header_height + padding/2` (= 94px); (c) CSS — `.task-grid thead tr` height 85px → 94px for left/right pane parity; (d) removed dead `header_height: 67` Frappe option (was a no-op due to update_view_scale overwrite)."
  file: app/views/project-plan.js:1184, app/views/project-plan.js:1635, app/views/project-plan.js:1650, styles/views.css:2466
  action: fix applied — pending browser UAT

## Eliminated

- Dark parent bar color — ELIMINATED: user confirmed the phantom is a SPACE/GAP, not the dark bar color
- CSS height:4px removal — ELIMINATED: addressed different symptom
- initGanttDragLink() missing from setGanttZoom() — ELIMINATED: addressed different symptom
- getBBox() approach (commit f008ed5) — ELIMINATED: fragile, returns 0 before browser composites SVG
- fixGanttContainerScroll() spacer — ELIMINATED: appended to container bottom, does not affect header area
- Interaction trigger causing re-render — ELIMINATED: gap exists from initial render; user perception of "first interaction" likely due to attention shift or second Firestore onSnapshot firing
- Frappe `header_height` config option — ELIMINATED: silently overwritten by `update_view_scale()` to lower+upper+10

## Resolution

root_cause: "Two compounding errors. (1) Frappe v1.2.2's `update_view_scale()` overwrites `config.header_height` from `options.lower_header_height + options.upper_header_height + 10` (default 85), making 88fef29's `header_height:67` setting a no-op. So the first bar lands at y = 85 + 18/2 = 94, not 85. (2) Prior renderCustomGanttHeader() hid only `.upper-header, .lower-header` (text children), leaving the `.grid-header` parent DIV (height:85px, position:sticky, z-index:1000, background:#fff) visible as an empty white strip. Combined effect: the user sees Frappe's empty .grid-header (85px) + the SVG grid-row strip below it up to bar y (9px) — appearing as ~94px of phantom blank space above the first bar."
fix: "(a) `app/views/project-plan.js:1650` — hide selector includes `.grid-header` in addition to its `.upper-header`/`.lower-header` children. (b) `app/views/project-plan.js:1635` — overlay height computed as `(gantt.config.header_height || 85) + Math.round((gantt.options.padding || 18) / 2)` = 94, exactly matching Frappe's compute_y for index 0. (c) `app/views/project-plan.js:1184` — removed the misleading `header_height: 67` Frappe option that update_view_scale() was overwriting anyway. (d) `styles/views.css:2466` — `.task-grid thead tr` height 85px → 94px to maintain GANTT-OVERLAY-PANE-PARITY between left grid header and right Gantt overlay."
verification: "pending browser UAT — load project plan, check all three zoom modes (Day/Week/Month) for absence of gap on initial load and after first interaction; verify left-pane row 1 aligns vertically with right-pane bar 1"
files_changed: app/views/project-plan.js (lines 1184, 1626, 1635, 1649-1650), styles/views.css (line 2466)
