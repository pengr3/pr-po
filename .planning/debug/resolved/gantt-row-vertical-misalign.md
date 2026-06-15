---
status: resolved
slug: gantt-row-vertical-misalign
trigger: "Phantom-gap fix from earlier today did NOT fully resolve the issue. Headers (left vs right) are now aligned (both 94px), BUT the row contents below the headers are vertically misaligned: left-pane row N (Demo, a, b, c, …) does not sit at the same Y as right-pane bar N. Symptom is visible in Day view, screenshot evidence shows row 1 (Demo) on the left has no bar at the same Y on the right; bars appear shifted upward relative to their row labels."
created: 2026-05-09
updated: 2026-05-09
reopened: 2026-05-09 — first fix (lower_header_height:39) ALIGNED THE CONTENTS (left rows match right bars) but BROKE THE HEADER (right header now visibly different height/content-position vs left thead). Screenshot 2 shows left thead "# Name Duration Start End Predecessors Resource" vs right header showing two stacked rows ("May 26 / 11 May 26 / 18 May 26 / …" upper week-label row + "T W T F S S M T W …" lower day-letter row). Right header content extent does NOT match left thead's 94px box — visible misalignment between the bottom of the right header and the bottom of the left header.
reopened_2: 2026-05-09 — root cause for header mismatch confirmed (overlay was 103, thead was 94). Second-pass fix applied; awaiting browser UAT.
final_resolved: 2026-05-09 — user confirmed browser UAT pass: contents align AND headers align across views.
goal: find_and_fix
related_session: gantt-phantom-space-header (resolved 2026-05-09 — fix made header strips match at 94px but did not verify row-height parity)
---

# Debug Session: gantt-row-vertical-misalign

## Symptoms

- **Expected:** Left thead bottom edge AND right header bottom edge sit at identical Y; left-pane row N centers vertically on right-pane bar N for all N.
- **Actual (after first fix `lower_header_height: 39`):** Row contents align perfectly (user confirmed). But the right header overlay extends ~9px lower than the left thead, with the week-labels/day-letters content vertically off vs the left column titles.
- **User words:** "fail, contents are definitely aligned but the header is not"
- **View:** Visible in Day view (Image 2). Likely Week/Month too.
- **Error messages:** None.
- **Reproduction:** Open project plan, observe left thead row vs right two-row header (week label + day letters). Bottom edges don't line up.

## Related context

- **Prior session (`gantt-phantom-space-header`)** removed dead `header_height: 67` option, hid Frappe's `.grid-header` parent, and set `.task-grid thead tr { height: 94px }`. The overlay-height formula at the time was `(config.header_height || 85) + padding/2 = 85 + 9 = 94` — matched left thead at 94. ✓
- **First fix in this session (uncommitted, then lost during accidental empty-write at 2026-05-09T05:48Z, RE-APPLIED in second pass):** added `lower_header_height: 39` to constructor. Frappe's `update_view_scale()` then computes `config.header_height = 39 + 45 + 10 = 94`, so right-pane bar slots start at y=94 instead of y=85. CONTENTS now align (user confirmed). BUT — the overlay-height formula `(config.header_height || 85) + padding/2` now evaluates to `94 + 9 = 103`, while left thead is still 94 → 9px header mismatch.
- **Second-pass fix (this iteration):** drop the `+ padding/2` term. Overlay height = `gantt.config.header_height || 94` = 94. Both panes now share the identical 94px header band.

## Current Focus

- hypothesis: "Two compounding constraints. (1) After `lower_header_height: 39`, gantt.config.header_height is now 94 (correct), making bar slot 0 begin at y=94 — equal to left thead bottom. CONTENTS align. (2) But the overlay height formula at line 1638 was `(config.header_height || 85) + Math.round((padding || 18) / 2)` = 94 + 9 = 103. Left thead is 94. Right overlay bottom edge is 9px below left thead bottom edge — visible HEADER mismatch. The +padding/2 term was needed in the OLD geometry world (when header_height was 85) to extend the overlay down over Frappe's 9px padding zone above bar 0. Now that config.header_height is itself 94, that padding zone is INSIDE the body area where Frappe paints row stripe 0 — it is NOT part of the header. Adding +padding/2 double-counts and produces a 103px overlay."
- test: "Read overlay element box at runtime: should be height=94 after fix. Compare bottom edge of #ganttHeaderOverlay vs bottom edge of `.task-grid thead tr`. Expected delta = 0px (was 9px before second-pass fix)."
- expecting: "Visual inspection in Day, Week, and Month views: bottom edges of left thead and right header overlay coincide; both have height 94px; row contents continue to align (no regression of first-pass content fix)."
- next_action: "Apply two surgical edits in app/views/project-plan.js — (a) re-add `lower_header_height: 39` to constructor (lost during accidental empty-write earlier; reinstate the content-alignment fix); (b) change overlay height formula at line 1638 from `(config.header_height || 85) + Math.round((padding || 18) / 2)` to `config.header_height || 94`. Update comment to reflect new geometric meaning. Then user verifies in browser."

## Evidence

- timestamp: 2026-05-09T05:15:00Z
  finding: "Read Frappe v1.2.2 CDN source `frappe-gantt.umd.js`. Confirmed: `compute_y(){this.y=this.gantt.config.header_height+this.gantt.options.padding/2+this.task._index*(this.height+this.gantt.options.padding)}` and `make_grid_rows(){const i=this.options.bar_height+this.options.padding; for(let s=this.config.header_height;s<this.grid_height;s+=i) make rect at y=s height=i}`. With our options bar_height=24, padding=18: row pitch on right = 24+18 = 42px. Right row slot N: y=[header_height + N*42, header_height + (N+1)*42]. Bar within slot N: y=[slot_top + 9, slot_top + 9 + 24]."
  file: .tmp-frappe.js (downloaded for inspection)
  action: confirmed Frappe geometry — row slot top = header_height (NOT header_height + padding/2)

- timestamp: 2026-05-09T05:18:00Z
  finding: "Left-pane CSS at styles/views.css:2466 sets `.task-grid thead tr { height: 94px }` and styles/views.css:2495 sets `.tg-row { height: 42px }`. Therefore left row N spans y=[thead_height + N*42, thead_height + (N+1)*42] = [94, 136] for N=0; midpoint y=115."
  file: styles/views.css:2466, styles/views.css:2495
  action: confirmed left-pane geometry

- timestamp: 2026-05-09T05:22:00Z
  finding: "Cleanest content-alignment fix: force gantt.config.header_height to 94 by setting `lower_header_height: 39` in constructor options. Frappe computes `header_height = 39 + 45 + 10 = 94`. Bar slot N starts at y=94+N*42 = matches left row N. Bar centers land at y=115+N*42 = matches left row centers."
  file: app/views/project-plan.js:1183-1195
  action: derived first-pass fix

- timestamp: 2026-05-09T05:42:00Z
  finding: "First-pass fix applied. User UAT: contents align ✓. But user reports header is still misaligned: 'fail, contents are definitely aligned but the header is not'. Image 2 shows left thead and right two-row overlay header have visibly different heights/bottom edges."
  file: app/views/project-plan.js:1192 (lower_header_height: 39 added)
  action: regression discovered — header misalignment introduced by first fix

- timestamp: 2026-05-09T05:50:00Z
  finding: "Re-read overlay rendering at app/views/project-plan.js:1638. Formula was `const headerHeight = (gantt.config.header_height || 85) + Math.round((gantt.options.padding || 18) / 2)`. With first-pass fix raising config.header_height to 94, this evaluates to 94 + 9 = 103. Left thead is 94. Right overlay is 9px taller than left thead → bottom edges differ by 9px. The +padding/2 term was needed in the prior geometry (config.header_height=85) to extend overlay over the 9px bar-padding zone — but now that we forced header_height to 94, that 9px zone is INSIDE the body (where Frappe paints row stripe 0), not part of the header. Adding +9 double-counts."
  file: app/views/project-plan.js:1638
  action: root cause for header mismatch identified

- timestamp: 2026-05-09T05:55:00Z
  finding: "Side-effects audit for dropping +padding/2 in overlay height: (a) The 9px zone between y=94 (overlay bottom) and y=103 (bar 0 top) is the row-stripe 0 padding. Frappe paints `make_grid_rows` rectangles starting at y=header_height=94 with height=42 and a faint border, so this area is part of body row 0 (rendered by Frappe's SVG, beneath the bar). No phantom header strip will appear. (b) Left pane equivalent: y=94..136 is body row 0; cell text vertical-centered at y≈115. Identical layout. (c) Overlay flex-children (`.gho-day-cell justify-content:center`, `.gho-week-cell flex column with 40% label / 60% days`) re-layout cleanly inside 94px instead of 103px — text remains legible (same proportions as the prior 94px we were briefly at before the regression)."
  file: styles/views.css:2615-2687
  action: side effects clear — fix is safe

- timestamp: 2026-05-09T06:05:00Z
  finding: "Operational mishap: during second-pass fix application I issued an empty Write to project-plan.js, blanking the file. Recovered via `git stash` (working tree restored to HEAD), but this discarded the uncommitted `lower_header_height: 39` first-pass change. The destructive stash was dropped to avoid future confusion. Both edits (re-add `lower_header_height: 39` AND drop `+padding/2` from overlay formula) must be applied together in a single pass."
  action: noted — second-pass fix must be a combined patch

- timestamp: 2026-05-09T06:10:00Z
  finding: "Combined second-pass fix applied in a single pass. Edit 1 (constructor): inserted `lower_header_height: 39` between `padding: 18` and `language: 'en'` with explanatory comment. Edit 2 (overlay): replaced `const headerHeight = (gantt.config.header_height || 85) + Math.round((gantt.options.padding || 18) / 2)` with `const headerHeight = gantt.config.header_height || 94` and updated the comment block to explain the new geometry. styles/views.css comment update from prior commit kept (94px target unchanged). Diff stat: app/views/project-plan.js +13/-3, styles/views.css +1/-1."
  file: app/views/project-plan.js:1183-1200, app/views/project-plan.js:1635-1640
  action: fix applied — awaiting browser UAT

## Eliminated

- Row-pitch mismatch — ELIMINATED: both panes use 42px (Frappe bar_height(24)+padding(18) = .tg-row height(42)).
- Box-sizing/border drift — ELIMINATED: .tg-row has `box-sizing: border-box` and 1px border-bottom; total visual pitch is still 42 (border included).
- Independent vertical scrolling — ELIMINATED: D-SCROLL fix already synchronizes vertical scroll between .task-grid-rail and .gantt-container.
- Drift (proportional to row index) — ELIMINATED: this was a CONSTANT 9px offset, not drift.
- First-pass-only fix sufficient — ELIMINATED: `lower_header_height: 39` alone fixes content alignment but introduces a 9px header mismatch via the now-stale `+padding/2` term in the overlay formula.

## Resolution

- root_cause: "Two compounding errors needed to be fixed together. ERROR-1 (already-known from prior session): `gantt.config.header_height = 85` while overlay/thead were both raised to 94, so right-pane bar slot 0 (which begins at y=config.header_height) started 9px above left-pane row 0 (which begins at y=thead_height=94) → constant 9px content offset. ERROR-2 (uncovered this session, after fixing ERROR-1): once `lower_header_height: 39` forces `config.header_height` to 94, the overlay-height formula `(config.header_height || 85) + padding/2` evaluates to 94 + 9 = 103, while left thead remains 94 → 9px header strip appears below the right overlay's bottom edge that has no counterpart on the left. The `+padding/2` term was a workaround for the OLD geometry where the overlay needed to also cover the 9px padding zone above bar 0; in the NEW geometry that 9px zone is inside the body (Frappe paints row stripe 0 there), not the header."
- fix: "Two surgical edits in `app/views/project-plan.js`. (1) Constructor (line ~1188): add `lower_header_height: 39` so update_view_scale computes config.header_height = 39+45+10 = 94 — bar slots and left rows share origin y=94. (2) Overlay (line ~1640): change `const headerHeight = (gantt.config.header_height || 85) + Math.round((gantt.options.padding || 18) / 2)` to `const headerHeight = gantt.config.header_height || 94` — overlay = 94, identical to left thead. styles/views.css `.task-grid thead tr` height stays at 94px (comment already updated to reference the 94 target)."
- verification: "Pending browser UAT — (1) Day view: bottom edge of #ganttHeaderOverlay coincides with bottom edge of left .task-grid thead; week-labels/day-letters content fits inside 94px. (2) Each task name on the left sits at the same vertical center as its bar on the right. (3) Repeat for Week and Month modes. (4) No phantom gap below either header."
- files_changed: app/views/project-plan.js (constructor +1 line + 4 comment lines around line 1188; overlay formula 1 line replaced + 4 comment lines around line 1640), styles/views.css (line 2466 comment text only — height value unchanged at 94px)
