---
status: resolved
trigger: "Phase 86.4 UAT failures — Gantt rendering bugs across Day/Week/Month views"
created: "2026-05-07"
updated: "2026-05-07"
---

# Debug Session: gantt-86-4-uat-failures

## Symptoms

- **Bug 1 — Day view SVG labels missing:** `renderGanttHeaderSvg()` was implemented and wired in, but no M T W Th F S S labels appear in Day view. Silent failure — no console error reported by user.
- **Bug 2 — Week view label format:** User wants "4 May 26 | 11 May 26" style column headers with M T W T F S S sub-row (like a reference image showing full date + day-of-week letters). Currently shows Frappe native "22-28" range labels — our injection skips Week view entirely.
- **Bug 3 — Today line wrong position:** In Day view, red today line appears around April 25 area but today is May 7, 2026. Position is ~12 days off.
- **Bug 4 — Bar horizontal resize doesn't save:** Dragging a Gantt bar's right edge to extend it horizontally does not persist the new end_date to Firestore.
- **Bug 5 — Scroll jankiness:** D-SCROLL bidirectional sync (rail ↔ Gantt pane) implemented in Phase 86.4-02 but still janky in practice.
- **Bug 6 — Floor bypass:** Phase 86.3 D-01 scroll floor fix (prevent scroll past earliest task) is still bypassable.

## Timeline

- Phase 86.2: Initial Gantt implementation
- Phase 86.3: Polish round 1 — today line, scroll floor, bar-drag row lock, DOM overlay (failed)
- Phase 86.4: Gap closure — D-CLAMP, D-SCROLL, D-FS, D-03 SVG headers

## Reproduction

1. Open `http://localhost:8000/#/projects`, enter a project with tasks
2. Day view: No weekday labels appear
3. Week view: Frappe native "22-28" headers, no improvement
4. Drag right edge of a bar → no Firestore write
5. Scroll floor: can scroll past task start date

## Current Focus

hypothesis: "Resolved — all 6 root causes identified and fixed"
next_action: "UAT verification"

## Evidence

- timestamp: 2026-05-07T09:00:00Z
  finding: "Frappe v1.2.2 default infinite_padding: true (not false). Source: options defaults object shows infinite_padding:!0 (= true). This causes Frappe to bind a mousewheel handler on $container that calls render() when scrolling near the timeline edges — wiping all injected SVG elements and interrupting mid-drag bar operations."

- timestamp: 2026-05-07T09:05:00Z
  finding: "gantt.options.step is undefined in our code (user never sets it). The || 24 fallback is wrong. Frappe v1.2.2 stores parsed step in gantt.config.step (a number, e.g. 1 for Day view '1d') and gantt.config.unit ('day'). gantt.options.column_width is also null (not set by user); actual column_width is in gantt.config.column_width (45px for Day). Wrong formula: xPerDay = (24/undefined||24)*30 = 30px/day. Correct: xPerDay = config.column_width/config.step = 45/1 = 45px/day."

- timestamp: 2026-05-07T09:10:00Z
  finding: "Today line 12 days off: with gantt_start ~April 7 (30 days before May 7 earliest task, due to infinite_padding extend_by_units*3=30 day shift) and xPerDay=30 instead of 45, today renders at 30*30=900px but actual is 30*45=1350px. Visible position = 900/45=20 days from gantt_start = April 7+20 = April 27. Matches user's April 25 report (±2 days = actual task date variation)."

- timestamp: 2026-05-07T09:15:00Z
  finding: "Bug 4 (bar resize): on_date_change IS wired correctly. Frappe fires date_change for both move and resize via date_changed() in Bar class. Root cause is infinite_padding: true — mousewheel while dragging triggers render() which rebuilds all bars and resets drag state before mouseup fires, so date_changed() never completes."

- timestamp: 2026-05-07T09:20:00Z
  finding: "Bug 5 (scroll jank): _syncingScroll = false is set synchronously after pane.scrollTop = x, but browser fires the resulting scroll event asynchronously (after current call stack clears). By the time the pane scroll event fires, _syncingScroll is already false, causing a feedback loop. Fix: use requestAnimationFrame to defer the flag reset."

- timestamp: 2026-05-07T09:25:00Z
  finding: "Bug 6 (floor bypass): floorX was computed with wrong xPerDay (30 instead of 45). Floor x-position was 0.667x of the actual gantt_start pixel position, so the clamp fired too early — user could scroll left past the intended floor before the clamp engaged."

## Eliminated

- gantt.options.view_mode updating after change_view_mode: CONFIRMED — gantt.options.view_mode DOES update to the new mode name string. So mode detection in renderGanttHeaderSvg was correct.
- SVG query timing: NOT the issue. ganttSvg is found correctly. Labels were injected but immediately wiped by infinite_padding mousewheel handler.
- date_change event not firing for resize: NOT the issue. Frappe v1.2.2 fires date_change for both move and resize.

## Resolution

root_cause: |
  Six bugs, three root causes:
  1. infinite_padding defaults to true in Frappe v1.2.2 (infinite_padding:!0 in source). This causes Frappe to call render() on mousewheel events near the timeline edges, wiping injected SVG elements (Bug 1) and aborting bar drag operations mid-flight (Bug 4).
  2. gantt.options.step and gantt.options.column_width are not populated in our code (user options). All rendering functions used options.step||24 and options.column_width||30 — both wrong. Correct values are in gantt.config.step (number, e.g. 1 for Day) and gantt.config.column_width (number, e.g. 45 for Day). This caused xPerDay = 30 instead of 45, producing the ~12-day today-line offset (Bug 3) and wrong scroll floor position (Bug 6).
  3. _syncingScroll flag reset synchronously after pane.scrollTop assignment, but browser fires the resulting scroll event asynchronously — causing the bidirectional sync to loop (Bug 5).

fix: |
  1. Added infinite_padding: false to Gantt constructor options. Prevents render() on mousewheel; restores SVG label persistence (Bug 1) and unblocks bar resize save (Bug 4).
  2. Replaced gantt.options.step||24 / gantt.options.column_width||30 with gantt.config.step and gantt.config.column_width in renderTodayLine(), scrollGanttToToday(), computeGanttFloorX(), and renderGanttHeaderSvg(). Correct formula: xPerDay = config.column_width / config.step. Fixes today line position (Bug 3) and scroll floor accuracy (Bug 6).
  3. Changed _syncingScroll = false to requestAnimationFrame(() => { _syncingScroll = false; }) in bindScrollSync() to defer flag reset past the browser's async scroll event. Fixes jank (Bug 5).
  4. Rewrote renderGanttHeaderSvg() Week view branch: now injects date labels ("4 May 26") + M T W T F S S sub-row into .lower-header HTML div (not SVG) via absolutely-positioned wrapper div. Idempotent via .gantt-week-lower-label class. Fixes Bug 2.
  5. Fixed labelY in Day/Month SVG labels: now uses gantt.config.header_height - 8 (robust anchor) instead of reading existing text elements with a flawed y-filter.

verification: "UAT required — load project with tasks, verify Day/Week/Month labels visible, today line on May 7, drag resize saves, scroll floor holds, no scroll jank"

files_changed:
  - app/views/project-plan.js
