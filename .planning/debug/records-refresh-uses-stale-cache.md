---
status: resolved
trigger: "On MRF Records tab, clicking the UI 🔄 refresh button does not show newly-approved PRs — they only appear after a full browser page reload (F5). Surfaced during Phase 91.2 UAT test C."
created: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:00:00Z
---

## Symptoms

- **Expected:** Click 🔄 on MRF Records → table shows newly created PRs/POs from Finance approval flow
- **Actual:** Table re-renders stale data; new rows absent until F5 browser reload
- **Error messages:** None
- **Timeline:** Surfaced Phase 91.2 UAT test C (2026-05-19)
- **Reproduction:** Approve MRF → generate PR → Finance approve → create PO → MRF Records → click 🔄 within 5 minutes

## Current Focus

```
hypothesis: loadPRPORecords() returns early from 5-min cache on button-triggered calls
test: Read procurement.js:5071 — cache guard condition
expecting: Cache hit causes stale re-render without Firestore fetch
next_action: apply fix — force param to bypass cache for button-triggered calls
reasoning_checkpoint: CONFIRMED — line 5071 `(Date.now() - _prpoRecordsCachedAt) < CACHE_TTL_MS` returns cached data; button at line 2157 calls `window.loadPRPORecords()` with no bypass
```

## Root Cause

`CACHE_TTL_MS = 5 * 60 * 1000` (line 59). `loadPRPORecords()` at line 5071 returns from `cachedAllPRPORecords` if cache age < 5 min. The 🔄 button (line 2157) calls `window.loadPRPORecords()` with no way to signal "force refresh". Any PRs/POs created in another tab within the TTL window are invisible.

Existing bypass precedent: line 4290 sets `_prpoRecordsCachedAt = 0` before calling `loadPRPORecords()` to force fresh fetch after new MRF save.

## Fix

Add `force = false` parameter to `loadPRPORecords`. Cache guard becomes:
```javascript
if (!force && cachedAllPRPORecords.length > 0 && ...) {
```
Update button onclick to call `window.loadPRPORecords(true)`.

## Evidence

- `procurement.js:59` — `CACHE_TTL_MS = 5 * 60 * 1000`
- `procurement.js:5071` — cache guard, returns early without Firestore fetch
- `procurement.js:2157` — button calls `window.loadPRPORecords()` (no force arg)
- `procurement.js:4290` — existing pattern: `_prpoRecordsCachedAt = 0` for forced invalidation

## Eliminated

- Network error / Firebase permission — F5 works fine, so fetch itself works
- Missing Firestore data — data IS in Firestore (visible after F5)
- onSnapshot race — Records tab uses getDocs (not onSnapshot), so no listener issue

## Resolution

```
root_cause: loadPRPORecords 5-min cache not bypassed by 🔄 button call
fix: add force=false param; button passes force=true
files_changed: app/views/procurement.js (lines 2157, 5071)
verification: pending browser test
```
