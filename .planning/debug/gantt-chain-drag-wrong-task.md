---
slug: gantt-chain-drag-wrong-task
status: resolved
trigger: "Dragging task B in an A→B→C dependency chain shifts task C instead of B"
created: 2026-05-10
updated: 2026-05-11
phase_context: 86.8 (Gantt UX expansion just shipped)
branch: v3.3
---

# Debug: Gantt Chain-Drag Hits Wrong Task

## Symptoms (DATA_START)

**Expected behavior:**
Dragging task B (the middle of an A→B→C predecessor chain) horizontally in the Gantt should shift B's start_date and end_date by the drag amount. A and C should remain unchanged unless they have their own constraints.

**Actual behavior:**
Dragging B leaves B's start/end unchanged. Instead, the next-in-chain task C shifts by the drag amount. Demo (parent of A, B, C) envelope grows because C extended.

**Concrete reproduction (from screenshots 2026-05-10 dev env):**
- Before: A 4d 2026-05-20→2026-05-23 (no pred); B 3d 2026-05-24→2026-05-26 (pred=A); c 1d 2026-06-01→2026-06-01 (pred=B). Demo parent 13d.
- User drags B by ~1 day.
- After: A unchanged; B unchanged (still 3d 2026-05-24→2026-05-26 pred=A); c shifted +1 day to 2026-06-02→2026-06-02. Demo parent now 14d.

**Error messages:** None observed in console (per user report).

**Timeline:** First reported 2026-05-10. Single-task drag (no successors) worked fine through Phase 86.7 UAT. Phase 86.8 just shipped (Plan 01 added arrow handling + collapse + parent-drag cascade + keyboard; Plan 02 added critical path + progress + search). The regression likely entered with 86.8 since chain-drag wasn't part of the 86.7 UAT scenarios.

**Reproduction steps:**
1. Create three sibling leaf tasks A (4d), B (3d, predecessor=A), C (1d, predecessor=B).
2. Drag B's Gantt bar horizontally in either direction (any amount).
3. Observe: B does not move. C moves by the drag amount.

(DATA_END)

## Working Hypotheses (entry, before evidence)

H1 — `_pendingDragWrite` overwrite (most likely): Frappe v1.2.2's `update_bar_position` walks `get_all_dependent_tasks` for the dragged bar; when B's date changes, Frappe may also recompute and fire `on_date_change` for C (B's dependent). Our `handleGanttDateChange` stashes `_pendingDragWrite = { taskId: t.task_id, ... }`. Each call OVERWRITES the previous stash. If Frappe fires for B *then* C, mouseup flushes only the LAST stash — C's. B's stash is lost. C gets written with C's "new" dates that Frappe computed (which happen to be C's old dates + the dependent shift Frappe inferred).

H2 — Frappe writes to wrong bar: less likely; Frappe's drag is bound per-bar.

H3 — `_parentDragInfo` capture stuck: B has children? No, B is a leaf. Not this.

H4 — Phase 86.8 cascade interfering: parentDrag detection triggers because B has children somewhere? Check `_parentDragInfo` only set on `.bar-wrapper.parent-summary-bar` — B is a leaf, shouldn't trigger.

## Suspect Code Surfaces

- `app/views/project-plan.js` `mountGanttBarDragGuard` — the mousedown sets `_ganttBarDragging`, `_pendingDragWrite = null`, `_parentDragInfo = null` (good — fresh per-gesture).
- `app/views/project-plan.js` `handleGanttDateChange` — at the leaf branch (after `if (isParent) return`), stashes `_pendingDragWrite = { taskId: t.task_id, newStart, newEnd, parentId }`. **No filter on which task triggered the gesture.** If Frappe fires for multiple tasks, last write wins.
- Frappe v1.2.2 source: `update_bar_position` and `date_changed` cascades. The `get_all_dependent_tasks` walk is what triggers downstream date_change events.

## Current Focus

hypothesis: H1 — confirmed.
test: Read Frappe v1.2.2 source for the date-cascade pipeline.
expecting: source shows downstream tasks getting their dates recomputed AND `trigger_event('date_change', ...)` fired for each.
next_action: design + apply fix that keys `_pendingDragWrite` by the user-initiated task captured at mousedown.
reasoning_checkpoint: confirmed-via-source-read
tdd_checkpoint: null

## Evidence

- timestamp: 2026-05-11
  source: Frappe Gantt v1.2.2 UMD source (https://cdn.jsdelivr.net/npm/frappe-gantt@1.2.2/dist/frappe-gantt.umd.js, beautified locally)
  finding: `move_dependencies` defaults to `true` (line 1101 of beautified source).
  relevance: Our `new Gantt(...)` config does NOT override this option, so it is in effect.

- timestamp: 2026-05-11
  source: Frappe Gantt v1.2.2 beautified source, `bind_bar_events` mousedown (lines 1966-1989).
  finding: On bar mousedown, Frappe builds the dragged set as `o = [a, ...this.get_all_dependent_tasks(a)]` when `move_dependencies` is true. For task B with successor C, this means `o = [B, C]`. Each bar gets `ox/oy/owidth/finaldx` snapshotted.
  relevance: All dependent successors participate in the gesture — not just the bar the user grabbed.

- timestamp: 2026-05-11
  source: Frappe Gantt v1.2.2 beautified source, mousemove handler (lines 2089-2110).
  finding: Each bar in `o` calls `update_bar_position({x: u.ox + u.finaldx})` on every mousemove. C's bar visually shifts by the same delta as B's bar.
  relevance: Confirms the bug isn't purely cosmetic — Frappe is actively repositioning C's bar during the drag.

- timestamp: 2026-05-11
  source: Frappe Gantt v1.2.2 beautified source, SVG mouseup handler (lines 2125-2132).
  finding: `o.forEach((_) => { _.$bar.finaldx && (_.date_changed(), ...) })`. **Both B and C** have non-zero `finaldx` after a drag, so `date_changed()` is called for each.
  relevance: This is the cascade that triggers our `on_date_change` callback twice per gesture.

- timestamp: 2026-05-11
  source: Frappe Gantt v1.2.2 beautified source, `date_changed()` (lines 773-787).
  finding: Method computes new start/end from current bar position via `compute_start_end_date()`, sets `task._start`/`_end`, and if either differs numerically from the prior value, fires `trigger_event("date_change", [task, e, end-1s])`. For B (originally clicked) the dates are new → fires. For C (cascaded), C's bar is at new x → new dates → fires.
  relevance: Confirms `on_date_change` is invoked **twice** per chain-drag gesture in our scenario — first for B, then for C. Each call overwrites `_pendingDragWrite`. On document mouseup, our flush path writes only the LAST stash (C). B's stash is lost. The Firestore document for C is updated with C's new shifted dates; B is never updated.

- timestamp: 2026-05-11
  source: `app/views/project-plan.js:1586` (Gantt config) — `new Gantt('#ganttPane', frappeTasks, { … })`.
  finding: No `move_dependencies` key set. Default `true` applies.
  relevance: Confirms we are NOT opting out of the cascade.

## Eliminated

- H2 (Frappe writes to wrong bar): Frappe's `getAttribute('data-id')` correctly identifies the clicked bar. The cascade affects different bars by design, not by mis-binding.
- H3 (`_parentDragInfo` stuck): `_parentDragInfo` is only set when `wrapper.classList.contains('parent-summary-bar')`. Task B is a leaf — its bar wrapper does NOT carry that class — so this path was never entered.
- H4 (parent-cascade misfire): same reasoning as H3.

## Resolution

**Root cause:** Frappe Gantt v1.2.2 fires `on_date_change` once per task in the moved set on mouseup (the moved set includes the originally clicked task plus all transitive successors when `move_dependencies` is true, which is the library default). Our `handleGanttDateChange` callback unconditionally stashed each event in a single shared `_pendingDragWrite` slot, so the last cascaded event clobbered the user's actual target. The document-level mouseup flush then wrote only the surviving stash to Firestore, which was always the deepest successor in the chain — never the bar the user grabbed.

**Fix:** Capture the taskId the user actually grabbed at SVG mousedown (`_dragInitiatorTaskId = wrapper.dataset.id`) and ignore `on_date_change` events for any other task while a drag gesture is in progress. The visual cascade during the drag is preserved (Frappe still slides successors along the screen for the snap-back rubber-banding effect), but only the user-targeted task is written to Firestore. After Firestore round-trips back via `onSnapshot`, the parent-envelope and successor positions are recomputed from the truth set on the next `renderGantt()`.

**Files touched:** `app/views/project-plan.js` only.

**Edits (all sites — see also `git diff`):**
1. New module-scope state: `let _dragInitiatorTaskId = null;` (line 71).
2. `destroy()` clears it alongside `_parentDragInfo` (line 417).
3. `mountGanttBarDragGuard` mousedown captures `wrapper.dataset.id` into the new var (line 1662).
4. The 10-second safety timer clears it (line 1678).
5. The out-of-bounds mouseup revert path clears it (line 1701).
6. The end of the document mouseup handler clears it (line 1803), ensuring a non-drag `on_date_change` (e.g. programmatic refresh edge case) takes the immediate-write path next time.
7. `handleGanttDateChange` early-returns when `_ganttBarDragging && _dragInitiatorTaskId && t.task_id !== _dragInitiatorTaskId` (line 2003).

**Why this preserves Phase 86.8 Feature 3 (parent-drag cascade):** the parent-drag path uses `_parentDragInfo` set on `.parent-summary-bar` mousedown and computes its own pixel-delta cascade in the document mouseup handler. It does not depend on Frappe's `on_date_change` cascade and is unaffected by the new filter. In fact, the new filter additionally prevents stray descendant stashes from sneaking past during a parent drag (they would have been overwritten by the batch write anyway, but the filter is cleaner).

**Verification:**
- `node --check app/views/project-plan.js` → SYNTAX OK.
- All 7 expected references to `_dragInitiatorTaskId` present at the expected sites.
- Manual UAT pending: the user must verify in-browser that:
  1. Drag B in A→B→C → B moves, C unchanged. (primary fix)
  2. Drag a leaf task with no successors → still moves correctly. (regression check)
  3. Drag a parent bar → all descendants still move as a block. (Phase 86.8 Feature 3 unbroken)
  4. Drag and release outside the Gantt pane → bar reverts (no Firestore write). (revert path)
