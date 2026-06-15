---
status: resolved
slug: gantt-handle-artifact-task-loop
trigger: "Two bugs in Gantt project-plan view: (1) mysterious black dot appears after dragging parent bar, (2) CRITICAL infinite task duplication loop when adding tasks"
created: 2026-05-08T13:00:00Z
updated: 2026-05-08T13:30:00Z
---

## Symptoms

### Bug 1 — Phantom SVG dot on parent bar drag
- expected: Dragging/adjusting a parent Gantt bar shows no extra SVG elements
- actual: After adjusting "Demolition Works" (parent bar, row 1) from 6d to 9d, a small black dot/circle appears near the top of the Gantt SVG area above the bar
- error_messages: none
- timeline: discovered during Phase 86.7 UAT
- reproduction: Open a project plan with a parent task. Drag the parent bar to extend its duration. A black dot/circle appears at the top of the SVG.

### Bug 2 — Infinite task duplication loop (CRITICAL)
- expected: Adding a task via inline grid editor adds exactly one task
- actual: After continuously adding tasks, the same task name gets duplicated automatically over and over (Image 3 shows rows 3–11 all named "C") until page refresh
- error_messages: unknown (not provided)
- timeline: discovered during Phase 86.7 UAT
- reproduction: Open project plan. Continuously add new tasks via inline grid editor. After some point, the last task keeps being duplicated in an infinite loop that only stops on page refresh.

## Current Focus

hypothesis: "RESOLVED — both root causes found and fixed"
test: "Read full project-plan.js"
expecting: "n/a"
next_action: "UAT verification"
reasoning_checkpoint: "Both bugs confirmed and fixed in single investigation cycle"

## Evidence

- timestamp: 2026-05-08T13:15:00Z
  type: code_read
  finding: >
    BUG 2 ROOT CAUSE: In renderTaskGrid(), bindGridEvents(container) was called at line 416,
    BEFORE container.innerHTML was replaced at line 429. bindGridEvents() attaches a capture-phase
    blur listener. When innerHTML replaces the DOM, the focused __new__ input is detached, which
    fires a blur event in capture phase. The blur handler calls handleNewRowCommit(input) on the
    still-valued (detached) input node. The guard `if (!input.value.trim()) return` fails because
    the value is still "C" (or whatever was typed). handleNewRowCommit adds a task, which triggers
    onSnapshot, which calls renderTaskGrid() again, which calls bindGridEvents() again before
    innerHTML, repeating the cycle infinitely.

- timestamp: 2026-05-08T13:20:00Z
  type: code_read
  finding: >
    BUG 1 ROOT CAUSE: In initGanttDragLink(), the mouseenter handler guard was:
    `if (barWrapper.classList.contains('parent-summary-bar')) return;`
    But Frappe applies custom_class to the inner .bar element, not to .bar-wrapper.
    The check was always false for parent bars, so the .gantt-link-handle circle was
    created on parent bar-wrappers. After a drag triggers renderGantt() -> gantt.refresh(),
    the orphaned/repositioned circle ended up at SVG coordinate (0,0) or a stale BBox
    position, appearing as a black dot near the top of the SVG.

## Eliminated Hypotheses

- onSnapshot re-triggering add logic independently (no — it's the blur event triggered by innerHTML replacing DOM with active listener already attached)
- stale closure calling addTask (no — the issue is a real blur event on the detached node)
- applyFsViolationStyles() or renderTodayLine() injecting the black dot (no — those functions only manipulate arrow classes and a line element)
- CSS rule stopping handle suppression (no — the suppression check was on the wrong DOM element)

## Resolution

root_cause: "Bug 2: bindGridEvents() called before container.innerHTML replaced DOM, causing capture-phase blur on detached __new__ input to re-fire handleNewRowCommit infinitely. Bug 1: parent bar guard in initGanttDragLink mouseenter checked barWrapper.classList instead of the inner .bar element where Frappe actually places custom_class."
fix: "Bug 2: moved bindGridEvents(container) call to after container.innerHTML assignment. Bug 1: changed guard from barWrapper.classList.contains('parent-summary-bar') to barWrapper.querySelector('.bar.parent-summary-bar')."
verification: "Pending browser UAT — add multiple tasks in sequence (Bug 2), drag parent bar then check for black dot (Bug 1)"
files_changed:
  - app/views/project-plan.js
