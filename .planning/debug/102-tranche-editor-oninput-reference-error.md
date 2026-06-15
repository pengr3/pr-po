# Debug: editorTranches ReferenceError on Collection Tranches input

**Status:** resolved
**Phase:** 102 (Plan 102-02 — inline collection-tranche editor)
**File:** `app/views/project-detail.js`

## Symptom
Typing in the Collection Tranches editor label/percentage fields threw:
```
Uncaught ReferenceError: editorTranches is not defined
    at HTMLInputElement.oninput
```

## Root cause
The row template wired the text and number inputs with inline attribute handlers
that mutated the array directly:
```html
oninput="editorTranches[${i}].label=this.value"
oninput="editorTranches[${i}].percentage=+this.value; window.recalcTrancheTotal()"
```
Inline DOM event-handler attributes are evaluated in **global scope**, so they
cannot reference the module-scoped `let editorTranches` (project-detail.js:61).
The sibling handlers (`window.recalcTrancheTotal()`, `window.removeEditorTrancheRow()`,
etc.) worked because they were already exposed on `window`.

## Fix
Added two `window`-exposed setters mirroring the existing pattern:
- `updateEditorTrancheLabel(i, value)`
- `updateEditorTranchePercentage(i, value)` (mutates + recalcs total)

Rewired both `oninput` handlers to call them. Registered both in `init()` and
deleted both in `destroy()` (symmetric lifecycle, matching the other tranche fns).

## Verification
- `node --check app/views/project-detail.js` → OK
- No remaining inline `oninput="editorTranches..."` references
- Register/delete symmetry confirmed (2/2)
- Browser UAT: typing in label + percentage fields no longer throws; total bar recalcs live
