---
slug: 86-4-gantt-header-overlay
date: 2026-05-07
status: in-progress
---

# Quick Task: Custom Gantt Header Overlay (Option B)

## Goal
Replace the fragile `renderGanttHeaderLabels()` approach (injecting spans into Frappe's `.lower-header`, which gets wiped on every Frappe re-render) with a stable `#ganttHeaderOverlay` div that is fully under our control.

## Files to Change
- `app/views/project-plan.js`
- `styles/views.css`

## Plan

### Step 1 — JS: Add module-level variable
Add `let _overlayScrollHandler = null;` near the other D-SCROLL module vars (~line 47).

### Step 2 — JS: Replace renderGanttHeaderLabels() with renderCustomGanttHeader()
Delete the entire `renderGanttHeaderLabels()` function (lines ~1371–1425) and replace with:

```
function renderCustomGanttHeader() {
    const mountEl = document.getElementById('ganttPane');
    if (!mountEl || !gantt) return;
    try {
        const mode = gantt.options.view_mode || 'Week';
        const headerHeight = gantt.config.header_height || 50;
        const colWidth = gantt.config.column_width || (mode === 'Day' ? 45 : mode === 'Week' ? 140 : 120);
        const startDate = new Date(gantt.gantt_start); startDate.setHours(0,0,0,0);
        const endDate   = new Date(gantt.gantt_end);   endDate.setHours(0,0,0,0);

        // Get or create overlay — appended inside #ganttPane, position:absolute over Frappe header
        let overlay = document.getElementById('ganttHeaderOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ganttHeaderOverlay';
            mountEl.appendChild(overlay);
        }
        overlay.style.height = headerHeight + 'px';

        // Hide Frappe native header text layers (positioned-absolute, no layout impact)
        mountEl.querySelectorAll('.upper-header, .lower-header').forEach(el => { el.style.display = 'none'; });

        let html = '', totalWidth = 0;
        const DAY_ABBR = ['S','M','T','W','Th','F','S']; // indexed by getDay() (0=Sun)

        if (mode === 'Day') {
            const totalDays = Math.round((endDate - startDate) / 86400000);
            for (let i = 0; i < totalDays; i++) {
                const d = new Date(startDate); d.setDate(d.getDate() + i);
                const dow = d.getDay(), isWknd = dow === 0 || dow === 6;
                html += `<div class="gho-day-cell${isWknd ? ' gho-wknd' : ''}" style="width:${colWidth}px">` +
                        `<span class="gho-num">${d.getDate()}</span><span class="gho-ltr">${DAY_ABBR[dow]}</span></div>`;
            }
            totalWidth = totalDays * colWidth;

        } else if (mode === 'Week') {
            const xPerDay = colWidth / 7;
            const DAY_LETTERS = ['S','M','T','W','T','F','S']; // compact for sub-row
            let cur = new Date(startDate);
            while (cur < endDate) {
                const ws = new Date(cur);
                const lbl = `${ws.getDate()} ${ws.toLocaleDateString('en-GB',{month:'short'})} ${String(ws.getFullYear()).slice(2)}`;
                let subs = '';
                for (let j = 0; j < 7; j++) {
                    const sd = new Date(ws); sd.setDate(sd.getDate() + j);
                    const wk = sd.getDay() === 0 || sd.getDay() === 6;
                    subs += `<div class="gho-sub${wk ? ' gho-wknd' : ''}" style="width:${xPerDay}px">${DAY_LETTERS[sd.getDay()]}</div>`;
                }
                html += `<div class="gho-week-cell" style="width:${colWidth}px">` +
                        `<div class="gho-wk-lbl">${lbl}</div><div class="gho-wk-days">${subs}</div></div>`;
                cur.setDate(cur.getDate() + 7);
                totalWidth += colWidth;
            }

        } else { // Month
            let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endMo = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
            while (cur <= endMo) {
                const lbl = cur.toLocaleDateString('en-GB',{month:'short'}) + ' ' + cur.getFullYear();
                html += `<div class="gho-month-cell" style="width:${colWidth}px"><span class="gho-mon-lbl">${lbl}</span></div>`;
                cur.setMonth(cur.getMonth() + 1);
                totalWidth += colWidth;
            }
        }

        overlay.innerHTML = `<div class="gho-inner" style="width:${totalWidth}px">${html}</div>`;
        _bindOverlayScrollSync();
    } catch (e) {
        console.warn('[ProjectPlan] Custom header render failed:', e);
    }
}

function _bindOverlayScrollSync() {
    const ganttEl = document.querySelector('#ganttPane .gantt-container');
    const overlay = document.getElementById('ganttHeaderOverlay');
    if (!ganttEl || !overlay) return;
    if (_overlayScrollHandler) ganttEl.removeEventListener('scroll', _overlayScrollHandler);
    const inner = overlay.querySelector('.gho-inner');
    if (!inner) return;
    _overlayScrollHandler = () => { inner.style.transform = `translateX(-${ganttEl.scrollLeft}px)`; };
    ganttEl.addEventListener('scroll', _overlayScrollHandler);
    inner.style.transform = `translateX(-${ganttEl.scrollLeft}px)`; // sync immediately
}
```

### Step 3 — JS: Update renderGantt() step 9
Change line: `renderGanttHeaderLabels();` → `renderCustomGanttHeader();`

### Step 4 — JS: Update setGanttZoom()
Change: `renderGanttHeaderLabels(); // Phase 86.4 D-03 — header labels` → `renderCustomGanttHeader();`

### Step 5 — JS: Update destroy() — add overlay cleanup before the Phase 86.4 D-SCROLL block
```
// Phase 86.4 D-03 overlay: clean up horizontal scroll handler
const _overlayGanttEl = document.querySelector('#ganttPane .gantt-container');
if (_overlayScrollHandler && _overlayGanttEl) {
    try { _overlayGanttEl.removeEventListener('scroll', _overlayScrollHandler); } catch(e) { /* swallow */ }
}
_overlayScrollHandler = null;
```

### Step 6 — CSS: Replace old D-03 injection rules with overlay rules
Remove:
- `#ganttPane .lower-header { position: relative; overflow: hidden; }` block
- `.gantt-custom-label { ... }` block
- `.gantt-custom-label.weekend { ... }` block

Add `position: relative` to `.gantt-pane #ganttPane` rule.

Add new overlay CSS block.

## Verification
- `node --check app/views/project-plan.js` passes
- No references to `renderGanttHeaderLabels` or `gantt-custom-label` remain
