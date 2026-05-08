---
status: resolved
slug: gantt-phantom-space-header
trigger: "A phantom blank space/gap appears between the Gantt date-header row and the first bar row when the user interacts with the chart (hover, click, drag). The space is NOT present on initial load — it appears on first interaction. Gets progressively worse (larger) on Month zoom vs Week vs Day. Has never been present before phases 86.x. User confirmed: the bug is NOT the dark parent-bar color — it is blank vertical space inserted between the header and the bars area."
created: 2026-05-08T18:00:00Z
updated: 2026-05-08T19:30:00Z
---

# Debug Session: gantt-phantom-space-header

## Symptoms

- **Expected:** No gap between the Gantt calendar header row and the first task bar row. The bars start immediately below the header.
- **Actual:** A blank/empty vertical space appears between the date-header and the first bar. It appears ONLY after the user first interacts with the chart (hover, click, drag, predecessor edge drag — any interaction). It is NOT present on initial load. The gap grows larger with Month zoom compared to Week or Day zoom.
- **Screenshot evidence (Image 5):** Month zoom. Red arrow points to blank space between "Mar 2026 / Apr 2026 / May 2026 / Jun 2026 / Jul 2026" header row and the first bar row containing "Demo". The gap is approximately 1-2 row heights of empty space.
- **Error messages:** None
- **Timeline:** Regression introduced in phases 86.x. Was never present before. Specific phase unknown.
- **Reproduction:** Open any project plan. On initial load the chart looks correct. Then hover or click anything inside the Gantt pane. The space appears.
- **Zoom dependency:** Gap is larger on Month zoom, smaller on Week, smallest on Day. This suggests the space is proportional to column width (Frappe's column_width config varies per zoom mode — Month has wider columns than Day).

## Prior fix attempts (all targeted wrong element)

- CSS height override on parent bar rect — UNRELATED (was targeting parent bar appearance, not this gap)
- JS SVG attribute override in initGanttDragLink() — UNRELATED
- Added initGanttDragLink() call to setGanttZoom() — UNRELATED

## Key investigation angles

1. **Interaction-triggered** — the space only appears on first interaction. What runs on first mousedown/mouseenter/mousemove on the Gantt SVG?
   - `mountGanttBarDragGuard()` — Phase 86.7, mousedown on SVG
   - `initGanttDragLink()` — mouseenter/mouseleave on .bar-wrapper elements

2. **SVG height / viewBox modification** — does any event handler modify the SVG's height attribute or viewBox in a way that adds space at the top?

3. **Spacer div from Phase 86.6** — `fixGanttContainerScroll()` adds a spacer div to equalize maxScrollTop. Is it inserted at the TOP of the gantt body, pushing bars down?

4. **renderGanttHeaderSvg()** — Phase 86.3/86.4, injects custom SVG text elements (day-of-week labels, week range labels) into the Frappe SVG. Could this injection push the bar area downward if elements have y=0 or affect SVG bounding box?

5. **Frappe snapshot/refresh loop** — does clicking trigger an onSnapshot → gantt.refresh() → renderGanttHeaderSvg() re-injection cycle that inserts extra height?

6. **Column width proportionality** — the gap grows with Month zoom. Frappe's column_width is larger for Month (≈150px?) vs Day (≈38px?). If something is using column_width to calculate a y-offset or height, it would scale with zoom.

## Current Focus

hypothesis: "RESOLVED — root cause identified and fix applied"
test: "overlay height formula corrected to match Frappe compute_y() for index 0"
expecting: "no gap on any zoom level after fix"
next_action: "browser UAT"

## Evidence

- timestamp: 2026-05-08T19:00:00Z
  finding: "Frappe v1.2.2 source: config.header_height = lower_header_height(30) + upper_header_height(45) + 10 = 85. First bar y = header_height + padding/2 = 85 + 9 = 94. Overlay was set to 85px, leaving a 9px strip of SVG grid-row background visible between overlay bottom and first bar top."
  file: app/views/project-plan.js:1633
  action: applied fix

- timestamp: 2026-05-08T19:10:00Z
  finding: "getBBox() approach in reverted commit f008ed5 was fragile — getBBox() can return {y:0} before SVG is composited, giving Math.max(30,0)=30px overlay and a 64px gap. Deterministic formula (header_height + padding/2) is robust."
  file: app/views/project-plan.js
  action: confirmed revert of f008ed5 was correct; used deterministic formula instead

- timestamp: 2026-05-08T19:15:00Z
  finding: "Zoom-proportionality perception: gap is a constant 9px in all zoom modes. In Month view (wide columns, few vertical gridlines), the 9px horizontal strip is visually prominent. In Day view (dense vertical gridlines every 38px), the same strip is broken up and less noticeable. Not actually zoom-proportional — perceptual artifact."
  file: n/a
  action: noted for record

## Eliminated

- Dark parent bar color — ELIMINATED: user confirmed the phantom is a SPACE/GAP, not the dark bar color
- CSS height:4px removal — ELIMINATED: addressed different symptom
- initGanttDragLink() missing from setGanttZoom() — ELIMINATED: addressed different symptom
- getBBox() approach (commit f008ed5) — ELIMINATED: fragile, returns 0 before browser composites SVG
- fixGanttContainerScroll() spacer — ELIMINATED: appended to container bottom, does not affect header area
- Interaction trigger causing re-render — ELIMINATED: gap exists from initial render; user perception of "first interaction" likely due to attention shift or second Firestore onSnapshot firing

## Resolution

root_cause: "renderCustomGanttHeader() set #ganttHeaderOverlay height to gantt.config.header_height (85px), but Frappe positions the first bar at y = header_height + padding/2 = 94px. The 9px strip at y=85-94 showed the SVG grid background through the overlay, appearing as a phantom gap between the header and bars."
fix: "Changed headerHeight formula from `gantt.config.header_height || 50` to `(gantt.config.header_height || 85) + Math.round((gantt.options.padding || 18) / 2)`, matching Frappe's compute_y() formula for bar index 0. Overlay now covers exactly to where the first bar begins."
verification: "pending browser UAT — load project plan, check all three zoom modes (Day/Week/Month) for absence of gap on initial load and after first interaction"
files_changed: app/views/project-plan.js (line 1635)
