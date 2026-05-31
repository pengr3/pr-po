---
quick_id: 20260601-bnm
slug: baseline-naming
description: Let users name their baseline when clicking Set Baseline (Phase 86.12 polish)
related_phase: 86.12
related_quick: 20260531-mbl
date_completed: 2026-06-01
status: complete
commit: cfcc620
files_changed:
  - app/views/project-plan.js
---

# Quick Task 20260601-bnm — Summary

## What shipped

Tiny polish on top of Phase 86.12. `saveBaseline()` now prompts the user for a
custom name; the auto-generated `Baseline N` is the default.

## Diff

```
 app/views/project-plan.js | 9 +++++++--
 1 file changed, 7 insertions(+), 2 deletions(-)
```

The change is local to `saveBaseline()`:

```diff
-        const label = `Baseline ${countSnap.size + 1}`;
+        const defaultLabel = `Baseline ${countSnap.size + 1}`;
+        const userInput = window.prompt('Name this baseline:', defaultLabel);
+        if (userInput === null) return;
+        const label = (userInput.trim() || defaultLabel).substring(0, 60);
```

## Behavior

| User action | Result |
|-------------|--------|
| Click Set Baseline → type custom name → OK | Baseline saved with custom name |
| Click Set Baseline → leave default → OK | Baseline saved as `Baseline N` (existing behavior) |
| Click Set Baseline → clear text → OK | Baseline saved as `Baseline N` (whitespace fallback) |
| Click Set Baseline → Cancel | No write, no toast, no overlay change — save aborted |
| Type a 200-char string | Truncated to 60 chars before write |

## Verification (must_haves)

- [x] `window.prompt` call lives in `saveBaseline()` between `countSnap` and `addDoc`.
- [x] `null` return aborts the save before any mutation.
- [x] Empty/whitespace OK falls back to `Baseline N`.
- [x] Label `.trim()`ed and `.substring(0, 60)`-capped before the Firestore write.
- [x] No changes to `firestore.rules` (baselines remain immutable post-create).
- [x] No changes to data shape, no other functions touched.
- [x] Node syntax check passes.

## Browser UAT

Single browser test loop covers everything (table above). Hard-reload the Plan
page after pulling `cfcc620`, then click Set Baseline five times exercising:
custom name, accept default, blank-OK fallback, Cancel abort, and length cap.

## Follow-ups / deferred

- **Edit baseline name after creation** — explicitly out of scope. Would require
  flipping `firestore.rules:246` from `allow update: if false;` to a role-gated
  update, plus a small UI affordance. Revisit only if requested.
- **Native prompt() looks cheap** — if so, swap to an in-app modal in a separate
  quick task. Same call site, same logic, just a different UI shell.
