---
phase: quick
plan: 260319-j5f
subsystem: procurement-records-table
tags: [ui, styling, po-chips, status-badge, procurement]
dependency_graph:
  requires: []
  provides: [styled-po-id-chips-in-records-table]
  affects: [app/views/procurement.js]
tech_stack:
  added: []
  patterns: [status-badge CSS class, getStatusClass utility]
key_files:
  created: []
  modified:
    - app/views/procurement.js
decisions:
  - "Use getStatusClass(po.procurement_status || defaultStatus) to derive badge color class, matching the exact same pattern used for PR/TR chips"
  - "border-radius updated from 3px to 12px on both outer wrapper and fill overlay span to prevent clipping the pill shape"
metrics:
  duration: "< 5 minutes"
  completed: "2026-03-19"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260319-j5f: Style PO ID Chips in MRF Records POs Column — Summary

**One-liner:** PO IDs in MRF Records POs column now render as colored pill badges via `status-badge` class with procurement-status-based colors, matching the PR/TR chip style.

## What Was Done

Replaced the plain blue anchor (`color:#1a73e8`) used for PO IDs in the MRF Records table POs column with a `status-badge` pill badge using the same class pattern as PR/TR chips in the PRs column.

**File changed:** `app/views/procurement.js` — `renderPRPORecords` function (lines 3979-3996)

**Key changes in the `matchedPOs.map()` callback:**
1. Added `defaultStatus` and `poStatus` derivation (subcon POs default to "Pending", regular POs to "Pending Procurement")
2. Added `poStatusClass = getStatusClass(poStatus)` — same utility used for PR/TR chips
3. Added `class="status-badge ${poStatusClass}"` to the `<a>` tag
4. Removed inline `color:#1a73e8`, `font-weight:600`, `font-size:0.8rem` (now from CSS class)
5. Updated outer `<span>` `border-radius` from `3px` to `12px` to match pill shape
6. Added `border-radius:12px` to the fill overlay `<span>` to match wrapper curvature
7. Kept `position:relative;z-index:1` so payment fill overlay remains visible behind text
8. Preserved `onclick` (viewPODetails) and `oncontextmenu` (showRFPContextMenu) handlers
9. Preserved SUBCON badge appended after the chip

## Badge Color Mapping

| Procurement Status | CSS Class | Visual |
|--------------------|-----------|--------|
| Pending Procurement | `pending` | Yellow |
| Procuring | `procuring` | Blue |
| Procured | `approved` | Green |
| Delivered | `delivered` | Teal-green |

## Commit

| Task | Commit | Files |
|------|--------|-------|
| 1: Restyle PO IDs as status-badge pill chips | `3c40f50` | app/views/procurement.js |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: `app/views/procurement.js` — confirmed
- Commit `3c40f50` exists — confirmed
