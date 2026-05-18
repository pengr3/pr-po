---
slug: po-status-revert-on-refresh
status: resolved
trigger: "User updates a PO's procurement_status via the dropdown on MRF Records; UI shows the new value correctly. User then clicks the 🔄 refresh button in the MRF Records toolbar — the displayed status reverts to the previous value. Browser-level refresh (F5) shows the new value persisted in Firestore, so the write succeeded; only the in-app refresh path serves stale data."
created: 2026-05-18T11:30:00Z
updated: 2026-05-18T12:15:00Z
resolved: 2026-05-18T12:15:00Z
phase_context: 91.2 (just shipped Plan 03 is_subcon auto-detect; surfaced during browser UAT)
fix_commit: pending
---

# Bug: MRF Records 🔄 refresh button reverts updated procurement_status

## Symptoms

- **Expected behavior:** After changing procurement_status via the dropdown and the change persisting to Firestore, clicking the 🔄 button in the MRF Records toolbar should re-fetch and re-render with the NEW status value.
- **Actual behavior:** Clicking 🔄 reverts the displayed status to the PREVIOUS (pre-change) value. The status pill / dropdown reflects the old value until a full browser refresh.
- **Error messages:** None reported.
- **Persistence reality:** Browser-level refresh (F5/Ctrl+R) shows the new value — Firestore write succeeded. Only the in-app `loadPRPORecords` refresh path serves stale data.
- **Timeline:** Newly observed 2026-05-18 during Phase 91.2 browser UAT. Pre-Phase 91.2 behavior unknown (UAT didn't cover this until now).
- **Reproduction:**
  1. Sign in (any role with edit access on MRF Records)
  2. Navigate to `#/procurement/records`
  3. Locate a PO row → change the **Procurement Status dropdown** to a new value
  4. UI shows the new value correctly
  5. Click the 🔄 refresh button in the toolbar
  6. The dropdown / status pill reverts to the old value
  7. Browser F5 → new value reappears (proves DB save was correct)

## Suspected mechanism (initial guess — to be validated)

`loadPRPORecords` has both a **cached path** (using `cachedAllPOData` + `_prpoRecordsCachedAt` freshness window) and a non-cached path. The 🔄 button likely hits the cached path inside the freshness window. The Procurement Status dropdown's onchange handler writes to Firestore but does NOT invalidate `cachedAllPOData` — so re-render reads stale cache.

Plan 02 (this phase) updated `loadPRPORecords` both paths to route through `filterPRPORecords`, but did not change the cache-invalidation semantics. If pre-Plan-02 also had this bug, it's pre-existing; if Plan 02 introduced the cache mid-flow, it's a regression from Phase 91.2 itself.

## Files likely involved

- `app/views/procurement.js`
  - `loadPRPORecords()` (both cached + non-cached paths)
  - `filterPRPORecords()` (Plan 02 routing)
  - `cachedAllPOData` + `_prpoRecordsCachedAt` (module-level state)
  - Procurement Status dropdown render (~ procurement.js:5839-5852 area)
  - Status onchange handler (writes via `updateDoc({ procurement_status })`)
  - The 🔄 button click handler in the MRF Records toolbar
- Firestore `onSnapshot` listener on `pos` collection — does one exist for this view? If yes, why isn't it pushing the update into `cachedAllPOData`?

## Current Focus

- hypothesis: CONFIRMED — three-tier cache stack feeds the dropdown render; the status onchange handler writes to Firestore but invalidates none of the three caches. Initial hypothesis was directionally right (cache coherency) but underspecified: the actual stale-serving cache is `_prpoSubDataCache` (per-MRF sub-data), not `cachedAllPOData`.
- test: Traced the full update→cache→render cycle through procurement.js. See Evidence below.
- expecting: Met — confirmed updatePOStatus performs `updateDoc` then exits without touching any of the three in-memory caches.
- next_action: Apply minimal in-place mutation fix mirroring the proven pattern at procurement.js:1041 (cancelPRorTR) and procurement.js:1930-1935 (_proofOnSaved callback).

## Evidence

- timestamp: 2026-05-18T12:00:00Z
  observation: "🔄 button onclick → procurement.js:2157 — `onclick=\"window.loadPRPORecords()\"`. Hits the same loader as the initial tab mount."
  source: procurement.js:2157
- timestamp: 2026-05-18T12:00:30Z
  observation: "loadPRPORecords (procurement.js:5069) has two paths. Lines 5071-5085 are the cache-hit short-circuit: if `cachedAllPRPORecords.length > 0 && (Date.now() - _prpoRecordsCachedAt) < 5*60*1000`, it re-applies project-scope filters from cache and calls filterPRPORecords() WITHOUT re-fetching POs from Firestore. CACHE_TTL_MS = 5 min (procurement.js:59)."
  source: procurement.js:5069-5085, procurement.js:59
- timestamp: 2026-05-18T12:01:00Z
  observation: "filterPRPORecords (procurement.js:5226) reads `cachedAllPOData` for scoreboard filter sets (lines 5232-5239) and eventually calls renderPRPORecords()."
  source: procurement.js:5226-5239
- timestamp: 2026-05-18T12:01:30Z
  observation: "renderPRPORecords (procurement.js:5456) checks `_prpoSubDataCache.has(mrf.id)` per-MRF at line 5499. If hit, it pulls `poDataArray` straight from the cache (line 5500-5501) WITHOUT any Firestore round-trip. The cache value is set at line 5644 during the initial uncached load. The Procurement Status dropdown is rendered from this exact `poDataArray` at lines 5832-5867."
  source: procurement.js:5456, 5499-5503, 5644, 5832-5867
- timestamp: 2026-05-18T12:02:00Z
  observation: "Dropdown render reads `po.procurement_status` directly: line 5841 `const currentStatus = po.procurement_status || defaultStatus;` and the `selected` attribute on each `<option>` is bound to this currentStatus (lines 5846-5856). So if `_prpoSubDataCache.get(mrf.id).poDataArray[k].procurement_status` is stale, the dropdown will display the stale value with `selected`, overwriting whatever the user clicked."
  source: procurement.js:5841, 5846-5856
- timestamp: 2026-05-18T12:02:30Z
  observation: "updatePOStatus (procurement.js:7516) writes to Firestore via `await updateDoc(poRef, updateData)` at line 7604. After the await, the only follow-up actions are: showToast (success message), optional NOTIF-18 notification, and optional showProofModal for Procured/Processed. NO call to invalidate `_prpoSubDataCache`, NO mutation of `cachedAllPOData`, NO reset of `_prpoRecordsCachedAt`, NO call to filterPRPORecords/renderPRPORecords. The dropdown DOM keeps the user's clicked value only because the browser's native dropdown change set it — the underlying JS state is now divergent from the DOM."
  source: procurement.js:7516-7666 (entire function)
- timestamp: 2026-05-18T12:03:00Z
  observation: "Smoking-gun precedent #1: cancelPRorTR (procurement.js:1041) explicitly invalidates `_prpoSubDataCache.delete(mrfDocId)` after its updateDoc, then calls filterPRPORecords() to re-render. This is the EXACT pattern updatePOStatus is missing."
  source: procurement.js:1040-1049
- timestamp: 2026-05-18T12:03:30Z
  observation: "Smoking-gun precedent #2: `window._proofOnSaved` callback (procurement.js:1930-1935) — fires when the shared proof modal saves a proof URL on a PO. It explicitly clears `_prpoSubDataCache = new Map()` then calls filterPRPORecords(). This callback is even registered FROM updatePOStatus's success branch (line 7655 calls showProofModal which on save invokes _proofOnSaved). So when a user changes status to Procured/Processed AND uploads proof, the proof callback accidentally fixes the cache. When the user changes to Procuring/Processing/Pending/Delivered (no proof modal), the cache is left stale — exact match for the observed symptom pattern."
  source: procurement.js:1930-1935, 7651-7656
- timestamp: 2026-05-18T12:04:00Z
  observation: "The Finance PO-tracking `onSnapshot` listener at procurement.js:7110 feeds `poData` (a separate module-level array used only by renderPOTrackingTable). It does NOT touch `cachedAllPOData`, `cachedAllPRPORecords`, or `_prpoSubDataCache`. So even if that listener fires, it cannot heal the MRF Records caches."
  source: procurement.js:7094-7146
- timestamp: 2026-05-18T12:04:30Z
  observation: "The MRF Records tab has NO onSnapshot listener on `pos`. It is a getDocs/snapshot tab and relies entirely on imperative cache invalidation around mutations. Browser F5 works because the entire module is reinitialized, forcing the uncached path in loadPRPORecords which does `_prpoSubDataCache = new Map()` at line 5095."
  source: procurement.js:5095 + absence of onSnapshot on `pos` in the Records render path
- timestamp: 2026-05-18T12:05:00Z
  observation: "Phase 91.2 Plan 02 attribution check: Plan 02 rerouted both loadPRPORecords paths through filterPRPORecords but the cache-invalidation pattern at line 1041 and the _proofOnSaved callback both pre-date Plan 02. The bug is pre-existing (an updatePOStatus omission), NOT a Plan 02 regression. Plan 02 may have made it more visible by ensuring the cached path always re-renders from cache via filterPRPORecords."
  source: 91.2-02-SUMMARY.md cross-referenced against the surrounding cache-invalidation code

## Eliminated

- **Not a Firestore write failure** — F5 reload proves the write persisted correctly.
- **Not `cachedAllPRPORecords` alone** — that cache holds MRF docs, which are unaffected by PO status changes (and procurement_status lives on the PO, not the MRF).
- **Not the `cachedAllPOData` filter (scoreboard) path alone** — would explain wrong scoreboard counts after refresh, but not why the dropdown itself reverts. The dropdown render reads `_prpoSubDataCache`, not `cachedAllPOData`.
- **Not a stale `onSnapshot` push** — the Records tab has no listener on `pos` to begin with.
- **Not a Plan 02 regression** — cache-invalidation gap in updatePOStatus pre-dates Plan 02.

## Resolution

### Root Cause

`updatePOStatus` (procurement.js:7516-7666) successfully writes to Firestore at line 7604 but never invalidates the three in-memory caches that feed the MRF Records render:

1. **`_prpoSubDataCache`** (per-MRF sub-data Map) — holds the `poDataArray` from which the Procurement Status dropdown is rendered (procurement.js:5832-5867). Its `procurement_status` field is the one bound to the `<option selected>` attribute.
2. **`cachedAllPOData`** (raw PO snapshot) — used by scoreboard filter (procurement.js:5232-5239) and `updatePOScoreboards` (procurement.js:2837).
3. **`_prpoRecordsCachedAt`** (freshness timestamp) — gates the cache-hit short-circuit at procurement.js:5071. Within 5 minutes, the 🔄 button serves from cache without re-fetching.

Because none of these are touched, the next render — whether triggered by the 🔄 button or any other call to `filterPRPORecords()` — reads stale snapshots and the dropdown's `<option selected>` attribute resets to the pre-update value, overwriting what the browser dropdown is displaying. Browser F5 fixes it only because module reinitialization wipes the JS-side state.

The smoking-gun precedent is `window._proofOnSaved` at procurement.js:1930-1935 (clears `_prpoSubDataCache` after proof URL save) and `cancelPRorTR` at procurement.js:1041 (calls `_prpoSubDataCache.delete(mrfDocId)` after MRF restore). Both perform exactly the invalidation step updatePOStatus is missing.

### Fix (proposed — minimal in-place mutation)

In `updatePOStatus`, immediately after `await updateDoc(poRef, updateData)` succeeds (procurement.js:7604), mutate the in-memory caches to reflect the new state. This avoids a Firestore round-trip and matches the precedent at procurement.js:1041 and 1930-1935.

```javascript
// After await updateDoc(poRef, updateData);

// Cache coherency — mirror the write into the three module-level caches
// that feed the MRF Records render. Without this, the next call to
// filterPRPORecords() (including the 🔄 button) serves a stale snapshot
// and the dropdown reverts to the pre-update value. Mirrors the pattern
// at procurement.js:1041 (cancelPRorTR) and procurement.js:1930 (_proofOnSaved).
const cachedPO = cachedAllPOData.find(p => p.id === poId);
if (cachedPO) {
    Object.assign(cachedPO, updateData);
}
for (const [, sub] of _prpoSubDataCache) {
    const subPO = sub.poDataArray?.find(p => p.docId === poId);
    if (subPO) {
        subPO.procurement_status = newStatus;
        if (updateData.delivery_fee !== undefined) {
            subPO.delivery_fee = updateData.delivery_fee;
        }
        break; // a PO belongs to exactly one MRF
    }
}
```

Rationale for in-place mutation over `_prpoRecordsCachedAt = 0`:
- A timestamp reset would force a full re-fetch of every MRF's PO/PR sub-data on the next refresh (procurement.js:5505-5644). Wasteful when we know exactly which PO changed.
- In-place mutation matches the existing precedent (line 1041 is `delete`-then-re-render for ONE MRF; we're updating ONE PO in place).
- We do NOT need to call `filterPRPORecords()` from inside updatePOStatus because the user's next interaction (clicking 🔄, switching tabs, applying a filter) will rebuild from the now-correct caches. The dropdown DOM already reflects the new value from the native onchange.

### Fix Applied

Inserted at `procurement.js:7606-7625` (immediately after the `await updateDoc(poRef, updateData)` at line 7604):

```javascript
// Cache coherency — mirror the Firestore write into the in-memory caches
// that feed the MRF Records render. Without this, the 🔄 button's cache-hit
// path serves a stale snapshot and the dropdown reverts to the pre-update
// value. Mirrors the precedents at procurement.js cancelPRorTR (~1041) and
// _proofOnSaved (~1930).
const cachedPO = cachedAllPOData.find(p => p.id === poId);
if (cachedPO) {
    Object.assign(cachedPO, updateData);
}
for (const [, sub] of _prpoSubDataCache) {
    const subPO = sub.poDataArray?.find(p => p.docId === poId);
    if (subPO) {
        subPO.procurement_status = newStatus;
        if (updateData.delivery_fee !== undefined) {
            subPO.delivery_fee = updateData.delivery_fee;
        }
        break;
    }
}
```

### Static Verification

- `grep -c "Cache coherency" app/views/procurement.js` → 1 ✓
- `grep -n "_prpoSubDataCache" app/views/procurement.js` → 11 references; new one at line 7615 ✓
- `grep -n "cachedAllPOData.find" app/views/procurement.js` → 1 reference at line 7611 ✓ (no pre-existing `.find` calls — this is the first; sole call site)
- No edits outside `updatePOStatus` — confirmed by `git diff --stat` showing only `app/views/procurement.js` modified

### Browser Verification (user-confirmed)

(to be filled after user re-runs the reproduction steps)

Expected: change procurement_status via dropdown → 🔄 toolbar button → dropdown retains the new value (no revert). Browser F5 also retains the new value (DB persistence unchanged from before fix).
