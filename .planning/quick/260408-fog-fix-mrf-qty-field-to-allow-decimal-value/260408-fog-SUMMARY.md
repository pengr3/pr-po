---
phase: 260408-fog
plan: "01"
type: quick-fix
subsystem: mrf-form, procurement
tags: [decimal-qty, input-validation, mrf, procurement]
dependency_graph:
  requires: []
  provides: [decimal-qty-mrf-form, decimal-qty-procurement]
  affects: [mrf-form.js, procurement.js]
tech_stack:
  added: []
  patterns: [step="any" for fractional number inputs, parseFloat for decimal-safe parsing]
key_files:
  created: []
  modified:
    - app/views/mrf-form.js
    - app/views/procurement.js
decisions:
  - "min=\"0.01\" step=\"any\" used instead of removing min entirely — still blocks zero/negative entries while allowing any positive decimal"
  - "parseInt → parseFloat in mrf-form.js collectItems() — only JS change needed; all procurement.js readers already used parseFloat"
metrics:
  duration: ~5 minutes
  completed_date: "2026-04-08"
---

# Quick Fix 260408-fog: Fix MRF QTY Field to Allow Decimal Values — Summary

**One-liner:** Changed four `item-qty` HTML inputs from `min="1"` to `min="0.01" step="any"` and fixed one `parseInt` → `parseFloat` so fractional quantities like 0.5 persist correctly to Firestore.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Allow decimals in mrf-form.js (HTML + parseInt fix) | c20df98 | app/views/mrf-form.js |
| 2 | Allow decimals in all three procurement.js item-qty inputs | 3f5eabd | app/views/procurement.js |
| 3 | Manual UAT — verify decimal QTY works in all three entry points | approved | checkpoint (human-verify: APPROVED) |

## Changes Made

### app/views/mrf-form.js
- **Line 277** — Template row `<input class="item-qty">`: `min="1"` → `min="0.01" step="any"`
  - The `window.addItem` function clones `tbody.rows[0]`, so this single change propagates to every dynamically added row automatically.
- **Line 727** — `collectItems()`: `parseInt(...)` → `parseFloat(...)` on the `.item-qty` read
  - `parseInt('0.5')` returns `0`, which fails the `if (itemName && qty ...)` truthy guard and silently drops the row. `parseFloat` preserves decimal precision end-to-end into Firestore `items_json`.

### app/views/procurement.js
- **Line ~2605** — `renderMRFItemsTable` (MRF Details edit mode): `min="1"` → `min="0.01" step="any"`
- **Line ~3113** — Create MRF initial table render: `min="1"` → `min="0.01" step="any"`
- **Line ~3343** — `addItemRow` (Add Item button): `min="1"` → `min="0.01" step="any"`
- All downstream readers (`calculateSubtotal`, `recalculateGrandTotal`, `saveProgress`, `generatePR`, `submitTransportRequest`, `saveNewMRF`, `generatePRandTR`) already use `parseFloat` — no JS changes needed.

## Verification

```
grep step="any" results:
  app/views/mrf-form.js:277      → 1 match
  app/views/procurement.js:2605  → 1 match
  app/views/procurement.js:3113  → 1 match
  app/views/procurement.js:3343  → 1 match
  Total: 4 matches ✓

grep parseInt.*item-qty results:
  (zero matches) ✓
```

## Deviations from Plan

None — plan executed exactly as written. Four HTML attributes updated, one parseInt→parseFloat change.

## Known Stubs

None.

## UAT Result

**Status: APPROVED by user (2026-04-08)**

All three entry points verified working:
- Standalone Create MRF (mrf-form.js) — decimal QTY accepted; persists to Firestore as decimal numbers
- Procurement > Create MRF — decimal QTY accepted; subtotals calculate correctly (e.g. 0.5 * 100 = 50)
- Procurement > MRF Details edit — decimal QTY accepted; subtotal recalculates on input
- Regression: zero/negative values blocked by min="0.01"; whole numbers work unchanged

## Self-Check

- [x] `app/views/mrf-form.js` modified — commits c20df98
- [x] `app/views/procurement.js` modified — commit 3f5eabd
- [x] `step="any"` present 4 times across both files
- [x] Zero `parseInt.*item-qty` in codebase

## Self-Check: PASSED
