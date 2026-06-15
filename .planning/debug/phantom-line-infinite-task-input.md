---
status: resolved
slug: phantom-line-infinite-task-input
trigger: "Two bugs persist after multiple fix attempts: (1) Phantom horizontal line on parent Gantt bar row; (2) Duplicate tasks created when typing task names too fast in the inline grid editor"
created: 2026-05-08T15:00:00Z
updated: 2026-05-08T17:00:00Z
---

## Symptoms

### Bug 1 — Phantom Line on Parent Gantt Bar
- expected: Parent summary bar (e.g., "Demo") renders as thin 4px charcoal strip with no extra visual artifacts
- actual: A dark horizontal line or artifact persists on/through the parent bar row — visible even without hovering
- error_messages: none
- timeline: Persists through multiple fix attempts in commits 4c3ecc5 and 063a195
- reproduction: Open a project plan with a parent task (e.g., "Demo"). The phantom line is visible on the parent bar row.

### Bug 2 — Duplicate Tasks on Fast Typing
- expected: Each Enter press creates exactly one task with the typed name
- actual: When typing task names quickly, duplicate or extra tasks appear. Not infinite (original infinite loop was fixed), but still happens on fast input.
- error_messages: none
- timeline: Became "not infinite" after 4c3ecc5. Still duplicates on fast entry. Persists after 063a195.
- reproduction: Open a project plan. Type single-character names rapidly, pressing Enter after each. Some task names appear twice or partially.

## Fix History (FAILED — superseded by new root cause analysis)

### Attempt 1 (commit 4c3ecc5)
- Bug 2: Moved bindGridEvents() AFTER container.innerHTML (was before — caused infinite loop via detached blur)
- Bug 2: Added isConnected guard in blur handler
- Bug 1: Changed parent bar guard from barWrapper.classList to barWrapper.querySelector('.bar.parent-summary-bar')
- Bug 1: Propagated parent-summary-bar class from .bar to barWrapper

### Attempt 2 (commit 063a195)
- Bug 1: Changed guard BACK to barWrapper.classList.contains('parent-summary-bar') — Frappe v1.2.2 confirmed to put custom_class on barWrapper <g> directly
- Bug 1: Added document-level mouseup handler to cancel rubber-band if mouseup fires outside SVG
- Bug 2: Added _focusRestoreTimer to cancel stale setTimeout focus restoration calls

## Current Focus

hypothesis: "RESOLVED — root causes found and fixed"
test: "Browser UAT: verify parent bar shows as 4px charcoal strip; verify no duplicate tasks on rapid Enter"
expecting: "Bug 1 gone: thin strip without dark line artifact. Bug 2 gone: no duplicates."
next_action: "Browser re-test"
reasoning_checkpoint: ""

## Evidence

### Bug 1 Root Cause
Frappe v1.2.2 confirmed via CDN source: `custom_class` IS applied to `barWrapper <g>` directly via `prepare_wrappers()`. So CSS selector `.bar-wrapper.parent-summary-bar .bar` targets correctly. The CSS `fill: #475569` was working (bar IS dark). BUT: CSS `height: 4px` on SVG `<rect>` is a geometric property (SVG 2.0 feature) that does NOT reliably override the SVG `height="24"` presentation attribute in all browsers. Result: bar renders at full 24px height with dark fill — appearing as a "dark horizontal line" across the row instead of a thin 4px strip.

### Bug 2 Root Cause
The `_savedEmptyRow` mechanism restores partial text to the new `__new__` input after re-renders. The blur handler (`_gridInputHandler`) was calling `handleNewRowCommit(input)` when `taskId === '__new__'`. This caused accidental task creation when: (a) `_savedEmptyRow` pre-filled the new input with previously-typed text, AND (b) the user or some other action triggered blur on that input before pressing Enter. The result: a task was committed via blur with text the user hadn't explicitly submitted via Enter.

## Eliminated Hypotheses

- bindGridEvents before innerHTML (fixed in 4c3ecc5 — infinite loop gone, but duplication persists)
- barWrapper.querySelector('.bar.parent-summary-bar') guard (changed in 063a195, but phantom line persists)
- CSS fill property not applying (fill DOES work — it IS dark; the issue was height, not fill)
- class propagation needed from .bar to barWrapper (Frappe already puts custom_class on barWrapper directly)

## Resolution

root_cause: "Bug 1: CSS `height` on SVG `rect` does not reliably override SVG presentation attribute `height='24'` in all browsers; bar rendered at full height with dark fill = dark line. Bug 2: blur handler calling handleNewRowCommit for __new__ row caused accidental task creation when _savedEmptyRow pre-filled the input."
fix: "Bug 1: Added JS-based SVG attribute manipulation in initGanttDragLink() to set bar height='4' and y=(origY + 10) directly, runs unconditionally on every renderGantt() (not gated by linkBound sentinel). Removed height/transform from CSS (kept fill). Bug 2: Removed handleNewRowCommit call from blur handler for __new__ row — __new__ row now only commits via Enter key (handleNewRowKeydown)."
verification: "Browser UAT needed: open project plan with parent task, confirm 4px strip appearance; rapid Enter sequence, confirm no duplicates."
files_changed:
  - app/views/project-plan.js
  - styles/views.css
