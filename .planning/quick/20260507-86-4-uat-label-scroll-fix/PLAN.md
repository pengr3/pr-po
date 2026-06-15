---
slug: 86-4-uat-label-scroll-fix
status: in-progress
created: 2026-05-07
---

# Fix Phase 86.4 UAT: Day/Week labels + scroll sync

## Goal
Fix 3 remaining UAT failures from Phase 86.4 browser re-test:
1. Day view labels still not showing
2. Week view labels missing (regression from SVG injection fix)
3. Scroll sync not working at all

## Root Causes Identified

**Labels (Issues 1 & 2):**
- `gantt.config.view_mode` is a full object `{name:"Week", step:"7d",...}` — NOT a string.
  Every `mode === 'Day'` / `mode === 'Week'` check silently fails → zero labels injected.
- Frappe's header is HTML divs (`.lower-header` inside `.gantt-container`), not part of the bars SVG.
  Previous code injected `<text>` into `#ganttPane svg` (the bars SVG) at wrong y positions.

**Scroll sync (Issue 3):**
- `.gantt-container` (Frappe's own div with `overflow: auto`) is the actual vertical scroll container.
  `bindScrollSync()` was attaching listeners to `.gantt-pane` — wrong element, never fires.

## Tasks

### T1 — Fix header label injection (project-plan.js)
- Add `let _syncScrollGanttEl = null;` to module state
- Rename `renderGanttHeaderSvg` → `renderGanttHeaderLabels` everywhere
- Rewrite function body:
  - Use `gantt.options.view_mode` (string) instead of `gantt.config.view_mode` (object)
  - Target `document.querySelector('#ganttPane .lower-header')` (HTML div, not bars SVG)
  - Inject `<span class="gantt-custom-label">` elements with `position: absolute; left: Xpx`
  - Day mode: one letter per day column using dowLetters = ['M','T','W','Th','F','S','S']
  - Week mode: one letter per day within week columns (same xPerDay = column_width/step formula)
  - Month mode: skip (SC3 already PASS)
  - Cleanup: `lowerHeader.querySelectorAll('.gantt-custom-label').forEach(el => el.remove())`

### T2 — Fix scroll sync (project-plan.js)
- Rewrite `bindScrollSync()`:
  - `const ganttEl = document.querySelector('#ganttPane .gantt-container')`
  - Store in `_syncScrollGanttEl` for cleanup
  - Sync `ganttEl.scrollTop ↔ rail.scrollTop`
- Update `destroy()`:
  - Use `_syncScrollGanttEl` for pane cleanup (not `.gantt-pane` querySelector)
  - Update label cleanup: `'#ganttPane .gantt-custom-label'`

### T3 — CSS updates (styles/views.css)
- Add `#ganttPane .lower-header { position: relative; overflow: hidden; }` (absolute children anchor to it)
- Replace `.gantt-header-svg-label` rules with `.gantt-custom-label` rules:
  - `position: absolute; bottom: 2px; transform: translateX(-50%); font-size: 9px; color: #475569`
- Add `#ganttPane .gantt-container::-webkit-scrollbar { width: 0; }` (hide its scrollbar)
- Keep existing `.gantt-pane::-webkit-scrollbar` rules

## Commit
`fix(86.4-uat): Day/Week header labels + scroll sync — correct mode detection and injection target`
