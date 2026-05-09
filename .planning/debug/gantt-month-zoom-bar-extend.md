---
status: root_cause_identified
slug: gantt-month-zoom-bar-extend
trigger: "Gantt chart in MONTH ZOOM VIEW: when user drags a bar's right edge to extend it, the bar does not extend to where the cursor was released — it only extends a little bit (much less than the user intended). Issue is specific to Month zoom view."
created: 2026-05-09
updated: 2026-05-09
goal: find_root_cause_only
---

# Debug Session: gantt-month-zoom-bar-extend

## Symptoms

- **Expected:** When dragging the right edge of a Gantt bar in Month zoom view, the bar extends to wherever the cursor is released (proportional to date columns under the cursor).
- **Actual:** In Month zoom view, the bar only extends a small amount — far less than where the user dragged. The visual extension is truncated/shorter than the intent.
- **View:** Specifically MONTH zoom (Day/Week zoom not reported as broken in this session — confirmed below: Day & Week are mathematically correct).
- **Error messages:** None reported.
- **Timeline:** Reported 2026-05-09 by user. Root cause is in code added during phases 86.1 / 86.4 (drag-to-link self-bar resize path); not introduced by recent 86.7 commits.
- **Reproduction:**
  1. Open a project plan.
  2. Switch the Gantt to Month zoom.
  3. Hover a bar — blue circle handle appears at right edge.
  4. Drag that handle far to the right; release on empty space (or back on the same bar).
  5. Bar extends only ~1/30th of the cursor distance traveled.

## Related context

- Frappe Gantt v1.2.2 (CDN). In Month view_mode Frappe configures: `step="1m"` → parsed to `config.step=1, config.unit="month"`, `column_width=120`.
- Phase 86.1 added a custom blue **drag-to-link handle** (`.gantt-link-handle`, SVG circle r=6, fill #1a73e8) appended at the right edge of every non-parent bar on hover.
- Phase 86.5-06 routed "self-bar drop" and "drop on empty space" from that handle to a **resize-by-pixel-delta** code path that converts cursor x to a `daysDelta` via a custom `xPerDay2` formula.
- This custom handle visually overlays Frappe's native `.handle.right` (the blue circle is rendered on top — last child of `bar-wrapper`), so the user is grabbing the blue handle, not Frappe's internal one. That routes resize through our buggy path, bypassing Frappe's correct internal `compute_start_end_date()` math.

## Current Focus

- hypothesis: CONFIRMED — `xPerDay2 = column_width / step` is wrong when `config.unit !== 'day'`. In Month mode this overshoots the divisor by a factor of ~30 (days-per-month), producing `daysDelta ≈ pixelDelta/120` instead of the correct `pixelDelta/4`. That makes a 200-px drag translate to ~2 days instead of ~50 days — visually "barely extends".
- test: derive `xPerDay` correctly for all three view_modes and verify against Frappe's column geometry.
- expecting: Day = 45 px/day, Week = 20 px/day, Month = ~3.94 px/day.
- next_action: report root cause; propose fix direction (do NOT apply per goal=find_root_cause_only).

## Evidence

- timestamp: 2026-05-09 13:05Z
  source: app/views/project-plan.js:1865-1870 (drag-link self-bar resize handler)
  finding: |
    Custom resize math computes `xPerDay2 = (gantt.config.column_width || 45) / (gantt.config.step || 1)`
    then `daysDelta = Math.round((svgPt2.x - barRightX) / xPerDay2)`. This formula is unit-agnostic
    and silently breaks whenever `config.unit` is not "day".

- timestamp: 2026-05-09 13:06Z
  source: Frappe Gantt v1.2.2 source (CDN, downloaded to `.planning/debug/_frappe-gantt-1.2.2.js`)
  finding: |
    Frappe defines view_modes with the following `step` and `column_width`:
      • Day:   step="1d" → config.step=1,  config.unit="day",   column_width=45
      • Week:  step="7d" → config.step=7,  config.unit="day",   column_width=140
      • Month: step="1m" → config.step=1,  config.unit="month", column_width=120
      • Year:  step="1y" → config.step=1,  config.unit="year",  column_width=120
    The formula `column_width / step` only yields px-per-day when `unit === "day"`. For Month
    it yields px-per-MONTH masquerading as px-per-day.

- timestamp: 2026-05-09 13:07Z
  source: Frappe `update_view_scale()` at offset 27588 in vendor JS
  finding: |
    Confirms `parse_duration("1m")` returns `{duration:1, scale:"month"}`, and Frappe assigns
    `this.config.step = 1` and `this.config.unit = "month"` for Month view. So `gantt.config.step`
    is **1** in Month mode, not 30 — our formula has no chance of recovering days-per-column.

- timestamp: 2026-05-09 13:08Z
  source: Frappe `convert_scales()` table at offset 3294
  finding: |
    Frappe's day-scale conversion table: {day:1, month:30, year:365}. Correct daysPerColumn
    for Month view = convert_scales("1m","day") = 30. Correct xPerDay = 120/30 = 4 px/day.
    Buggy code returns 120 px/day → off by factor of 30.

- timestamp: 2026-05-09 13:10Z
  source: app/views/project-plan.js:1797-1815 (mousedown on `.gantt-link-handle`) and 1842-1884 (mouseup self-bar resize)
  finding: |
    The blue link-handle is rendered **on top of** Frappe's native `.handle.right` (it is appended
    last to bar-wrapper at the same `cx,cy` as Frappe's right handle). User clicks intercept the
    blue circle first → resize goes through our buggy `xPerDay2` math, NOT Frappe's correct
    internal `compute_start_end_date()` (which uses `column_width / step * unit` and works correctly).

- timestamp: 2026-05-09 13:11Z
  source: Numerical check at 200-px rightward drag in Month mode
  finding: |
    Buggy: daysDelta = Math.round((200) / 120) = 2 days.
    Correct: daysDelta = Math.round((200) / 3.94) ≈ 51 days (~1.7 months).
    Observed user report ("only extends a little bit") matches a factor-of-30 underestimate.

- timestamp: 2026-05-09 13:12Z
  source: app/views/project-plan.js — sibling occurrences of the same pattern
  finding: |
    The identical `xPerDay = config.column_width / config.step` formula also appears at:
      • line 1460 — renderTodayLine() (today vertical-line x-coord)
      • line 1488 — scrollGanttToToday() (one-shot initial scroll)
      • line 1519 — computeGanttFloorX() (soft date-floor scroll clamp, Phase 86.3 D-01/D-02)
      • line 1867 — drag-link self-bar resize (THIS BUG)
    All four are broken in Month mode by the same root cause. In Day/Week mode all four work
    correctly because `config.unit === "day"` there. In Month mode all four mis-position by ~30×.
    User has only reported the bar-extend symptom, but the today-line and floor clamp are likely
    also misplaced in Month view (worth a manual visual check).

## Eliminated

- Frappe's internal `compute_start_end_date()` math — verified correct (uses `config.unit` properly).
- Frappe's `get_snap_position()` snap step — Month uses `snap_at: "7d"`, snap quantum is ~28 px (7-day rounding); only truncates by ≤28 px, not by factor of 30.
- CSS overrides on `.handle.right` — only `pointer-events:none` on parent-summary-bar (correct).
- Phase 86.7 SVG/header overlay changes — affect visuals only, not resize math.
- mountGanttBarDragGuard mouseup flush — fires regardless of which handle initiated the drag; the buggy daysDelta is computed *before* the Firestore write, so the small extension is what is persisted (consistent with user report that the bar visually stops where it stops).

## Resolution

- root_cause: |
    The custom drag-link self-bar resize path (app/views/project-plan.js:1867) computes pixels-per-day as
    `xPerDay2 = gantt.config.column_width / gantt.config.step`. This formula assumes `config.unit === "day"`,
    which is only true for Frappe v1.2.2's Day and Week view_modes. In Month view_mode, Frappe sets
    `config.unit = "month"` and `config.step = 1` (because the view_mode `step` is `"1m"`), so the formula
    returns 120 px/day (px per MONTH) instead of the correct ~3.94 px/day. Every pixel of right-handle drag
    is therefore interpreted as ~1/30th of a day, and `Math.round((dx)/120)` rounds away most of the user's
    drag distance. Result: the bar barely extends in Month zoom.

    Why only Month is reported: Day mode → 45/1 = 45 px/day ✓. Week mode → 140/7 = 20 px/day ✓.
    Month mode → 120/1 = 120 px/day ✗ (should be 120/30 ≈ 4). Year mode would be similarly broken
    (120/365 ≈ 0.33 px/day expected; formula gives 120) but the UI exposes no Year zoom pill.

    Why the user is hitting the buggy code path (not Frappe's correct one): phase 86.1 added a blue
    `.gantt-link-handle` SVG circle that is appended on top of Frappe's native `.handle.right`. Mouse
    events on the bar's right edge hit our blue circle first; phase 86.5-06 routed self-bar drops
    (a near-inevitability when the cursor doesn't land exactly on another bar) into a custom
    "extend duration" path that uses the buggy xPerDay2 formula. Frappe's own (correct) resize path
    is effectively shadowed in Month mode for any user who interacts with the visible blue handle.

- fix: |
    Diagnose-only — not applied. Recommended fix direction (single-line correction, plus 3 sibling fixes):

      RECOMMENDED (post-specialist-review): unit-keyed lookup, robust to Frappe upgrades.
        const unitDays = { day: 1, week: 7, month: 30, year: 365 };
        const daysPerColumn = (unitDays[gantt.config.unit] || 1) * (gantt.config.step || 1);
        const xPerDay2 = (gantt.config.column_width || 45) / daysPerColumn;
        const daysDelta = Math.round((svgPt2.x - barRightX) / xPerDay2);

      Verifies for v1.2.2:
        Day:   1 * 1  = 1   → 45/1   = 45 px/day  ✓
        Week:  1 * 7  = 7   → 140/7  = 20 px/day  ✓
        Month: 30 * 1 = 30  → 120/30 =  4 px/day  ✓ (fixes user-reported bug)
        Year:  365 * 1= 365 → 120/365= 0.33 px/day ✓ (defensive — Year pill not exposed today)

      Apply the same correction at three sibling sites that share the bug:
        • app/views/project-plan.js:1460  renderTodayLine
        • app/views/project-plan.js:1488  scrollGanttToToday
        • app/views/project-plan.js:1519  computeGanttFloorX
        • app/views/project-plan.js:1867  drag-link self-bar resize  ← the user-visible bug

      An even cleaner architectural fix is to NOT recompute daysDelta in pixel space at all for the
      handler, and instead reuse Frappe's `compute_start_end_date()` by reading the bar's new width
      after the blue handle finalizes — but that is a larger refactor.

      User approval is required before applying any change (memory: feedback_no_unauthorized_changes).

- verification: |
    Once fixed, in Month zoom: a 200-px drag should extend a bar by ~50 days (1.7 months), matching
    cursor position. Day/Week modes must continue to behave correctly. Today vertical line and
    soft date-floor clamp must align with calendar today in Month zoom (additional regression checks
    if the sibling sites are corrected together).

- files_changed: |
    None applied (find_root_cause_only mode). When a fix is approved, expected changes:
      • app/views/project-plan.js — 4 occurrences of `xPerDay = column_width / step` corrected
        (lines 1460, 1488, 1519, 1867 — all four for consistency, even though only 1867 is
        directly responsible for the user-reported symptom).

## Specialist Review

reviewer: typescript-expert (self-review — subagent dispatch unavailable in this session)
verdict: LOOKS_GOOD with refinement
notes: |
  1. The original draft used a `view_mode.step` string-key lookup (`"1d"|"7d"|"1m"|"1y"`). That
     works for v1.2.2 but couples to Frappe's internal step strings. RECOMMEND keying off
     `gantt.config.unit` (`"day"|"month"|"year"` — note Frappe uses "day" for Week mode too,
     so we multiply by config.step) — survives a wider range of Frappe upgrades.

  2. Hardcoding 30 days/month and 365 days/year matches Frappe's own `convert_scales` table
     exactly (verified at offset 3294 of the vendor JS). No drift from Frappe's internal column
     geometry — the visible columns are also drawn at 30-day-equivalent widths, so the resize
     math will agree with what the user sees.

  3. Math.round on integer-day delta is correct (Firestore stores end_date as ISO date string).
     No fractional-day concern.

  4. This is a pre-existing bug (introduced in 86.1/86.3/86.4), not a regression from 86.7.
     No revert option — must be fixed forward.

  5. Defense in depth: the `|| 1` fallback on `unitDays[unit]` preserves today's broken behavior
     on unknown units rather than crashing — acceptable given fail-open philosophy on the today-line
     and scroll-clamp callsites.
