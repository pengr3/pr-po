---
phase: 260408-j0d
plan: 01
subsystem: mrf-form, mrf-records
tags: [cancellation, requestor, mrf, items-json, quick-task]
dependency_graph:
  requires: []
  provides: [requestor-mrf-cancellation]
  affects: [mrf-form.js, mrf-records.js]
tech_stack:
  added: []
  patterns: [onCancel controller hook, composite key PR-item matching, item-level Firestore write]
key_files:
  created: []
  modified:
    - app/views/mrf-records.js
    - app/views/mrf-form.js
decisions:
  - Composite key (item_name + supplier) used to match MRF items against PR items — conservative: any matching pair is treated as PR-linked
  - Status guard allows Pending, In Progress, PR Generated — intentionally allows PR Generated since some items may still lack PRs
  - Used property assignment (updatePayload.status = 'Cancelled') rather than object literal for clarity with conditional assignment
  - getDoc added to static import rather than dynamic import to keep module dependencies explicit
metrics:
  duration: ~15 minutes
  completed_date: "2026-04-08T05:48:43Z"
  tasks_completed: 2
  tasks_pending_uat: 1
---

# Quick Task 260408-j0d: Add MRF Cancellation for Requestors — Summary

**One-liner:** Item-level MRF cancellation for requestors via onCancel hook in createMRFRecordsController, with PR-linked item protection using composite key matching.

## What Was Built

### Task 1 — Extend createMRFRecordsController with onCancel hook (COMPLETE)
**Commit:** `da509aa`
**File:** `app/views/mrf-records.js`

- Added `onCancel = null` to the factory options destructure
- Renders a red Cancel button in the Actions `<td>` alongside the Timeline button — only when `onCancel` is provided
- Button calls `window['_mrfRecordsCancel_${containerId}']` which dispatches to the supplied callback
- Per-instance window function registered after existing window function registrations
- Cleaned up in `destroy()` via `delete window['_mrfRecordsCancel_${containerId}']`
- Fully backward compatible: procurement records view passes no `onCancel`, no Cancel button rendered

### Task 2 — Implement cancelRequestorMRFItems in mrf-form.js (COMPLETE)
**Commit:** `1b99410`
**File:** `app/views/mrf-form.js`

- Added `getDoc`, `doc`, `updateDoc` to static firebase.js import
- `cancelRequestorMRFItems(mrfDocId)` function added:
  1. Fetches MRF document by Firestore doc ID using `getDoc`
  2. Status guard: only Pending, In Progress, PR Generated are cancellable
  3. Queries `prs` collection by `mrf_id` and builds a `Set` of composite keys (`item_name|supplier`)
  4. Opens a modal listing each item: disabled + "PR Generated" badge if PR exists, enabled + checked if not
  5. Confirm button filters `items_json` to only kept items and writes back via `updateDoc`
  6. If zero items remain: sets `status = 'Cancelled'`, adds `cancelled_at` and `cancelled_reason`
  7. Triggers `window._myRequestsReload()` after successful write
- Wired into `initMyRequests()` via `onCancel: cancelRequestorMRFItems`

### Task 3 — UAT (PENDING MANUAL VERIFICATION)
Task 3 is a `checkpoint:human-verify` gate requiring manual browser UAT against production Firebase.

## Key Design Decisions

### Composite Key Strategy for PR-Item Matching
Items in MRF `items_json` are matched against items in PR `items_json` using a composite key:
```
key = `${item.item_name.trim()}|${item.supplier.trim()}`
```
For PRs, the supplier falls back to `prData.supplier_name` when the item itself has no `supplier` field.

Conservative behavior: if any MRF item shares a `(item_name, supplier)` pair with any PR item, it is treated as PR-linked. This prevents requestors from accidentally cancelling items that procurement has already acted on.

### Status Guard
Cancellable statuses: `['Pending', 'In Progress', 'PR Generated']`

`PR Generated` is intentionally included because it is exactly the mixed state where some items have PRs and others do not.

Non-cancellable statuses (e.g., Delivered, Completed, Cancelled) show an alert and return without opening the modal.

### Firestore Write Pattern
- Partial cancellation: writes filtered `items_json` only, leaves `status` unchanged
- Full cancellation (zero remaining): adds `status = 'Cancelled'`, `cancelled_at`, `cancelled_reason`
- Only the `mrfs` collection is written — no PRs, POs, TRs, or RFPs are touched

## UAT Checklist (For Manual Verification)

Start dev server: `python -m http.server 8000`

1. Log in as a requestor with at least one MRF
2. Navigate to MRF Form -> My Requests sub-tab
3. Confirm each row shows Timeline + red Cancel button in Actions column
4. Test partial cancellation (MRF with no PRs):
   - Cancel one item, verify items_json drops by one, status unchanged
5. Test PR-linked item protection (MRF in PR Generated status):
   - PR-linked items show orange "PR Generated" badge and disabled checkbox
   - Only non-PR items can be selected and cancelled
6. Test full cancellation (cancel all remaining items):
   - MRF status flips to Cancelled in Firestore
7. Test status guard (Delivered/Completed MRF):
   - Alert shown, modal does not open
8. Switch to Procurement -> MRF Records:
   - No Cancel button in Actions column (only Timeline)
   - Existing right-click "Cancel MRF" context menu still works (regression check)
9. DevTools -> Network: confirm updateDoc writes only to `mrfs` collection

## Files Modified

| File | Change |
|------|--------|
| `app/views/mrf-records.js` | Added onCancel option, Cancel button HTML, per-instance window function, destroy cleanup |
| `app/views/mrf-form.js` | Added getDoc/doc/updateDoc imports, cancelRequestorMRFItems function, wired onCancel into initMyRequests |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed dynamic import of getDoc**
- **Found during:** Task 2 implementation
- **Issue:** Plan suggested `const { getDoc } = await import('../firebase.js')` inside the function body, which would work but is inconsistent with the module's static import pattern
- **Fix:** Added `getDoc` directly to the existing static import line at the top of mrf-form.js
- **Files modified:** `app/views/mrf-form.js`
- **Commit:** `1b99410`

## Self-Check: PASSED

- `app/views/mrf-records.js` — modified, onCancel/Cancel button/destroy present
- `app/views/mrf-form.js` — modified, cancelRequestorMRFItems/onCancel wiring present
- Commit `da509aa` — verified present
- Commit `1b99410` — verified present
