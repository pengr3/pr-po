---
phase: 40-ui-ux-revisions
plan: "06"
subsystem: mrf-records
tags: [gap-closure, modal, procurement-timeline, my-requests, ux]
dependency_graph:
  requires: [40-05]
  provides: [clickable-pr-modal, clickable-po-modal, procurement-timeline-button]
  affects: [app/views/mrf-records.js]
tech_stack:
  added: []
  patterns:
    - instance-scoped window functions with containerId namespace
    - body-injected modal for timeline (self-removing on close)
    - createModal pattern for PR/PO detail modals
key_files:
  created: []
  modified:
    - app/views/mrf-records.js
decisions:
  - "viewPRDetailsLocal/viewPODetailsLocal use createModal pattern (matches procurement.js) while showTimelineLocal injects raw modal div into body (matches timeline pattern from 40-03)"
  - "Instance-scoped window functions prefixed with containerId prevent collision between Procurement and My Requests controller instances"
  - "No document generation button in PR modal and no editable Document Details in PO modal — requestors are read-only consumers"
  - "JSON.stringify(mrf.mrf_id) used in onclick to safely embed MRF ID string in HTML attribute"
metrics:
  duration_seconds: 225
  completed_date: "2026-02-26"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
requirements_closed: [UX-05]
---

# Phase 40 Plan 06: Clickable PR/PO Modals and Procurement Timeline for My Requests Summary

**One-liner:** Self-contained PR detail, PO detail, and procurement timeline modals added to My Requests table via instance-scoped window functions in mrf-records.js.

## What Was Built

Closed 3 UAT gaps from 40-05 UAT: the My Requests table now has full interactivity matching the Procurement MRF Records view.

### Changes to app/views/mrf-records.js

**New imports:**
- `getDoc`, `doc`, `orderBy` from firebase.js (for single-document fetches and ordered queries)
- `formatCurrency`, `showLoading`, `showToast` from utils.js
- `createModal`, `openModal`, `closeModal` from components.js

**Three new module-level async functions (before `createMRFRecordsController`):**

1. `viewPRDetailsLocal(prDocId)` — fetches a PR by Firestore doc ID, renders a read-only grid of all fields plus items table, opens via `createModal`/`openModal`. No document generation button (unavailable in requestor context).

2. `viewPODetailsLocal(poDocId)` — fetches a PO by Firestore doc ID, renders a read-only grid plus items table, opens via `createModal`/`openModal`. No editable Document Details section, no document generation button.

3. `showTimelineLocal(mrfId)` — fetches MRF, PRs, TRs, and POs (ordered by date_issued), builds the MRF→PR→PO hierarchy timeline HTML using the same CSS classes as procurement.js (`timeline`, `timeline-item`, `timeline-children`, `timeline-child-item`), injects a raw modal div into `document.body` (removes itself on close).

**Controller changes inside `createMRFRecordsController`:**
- Window registrations: `window[_mrfRecordsViewPR_${containerId}]`, `window[_mrfRecordsViewPO_${containerId}]`, `window[_mrfRecordsTimeline_${containerId}]`
- `destroy()` updated to delete all three new window functions
- PR badge spans changed to clickable `<a>` elements with `onclick="window['_mrfRecordsViewPR_${containerId}']('${pr.docId}')"`
- PO ID spans changed to clickable `<a>` elements with `onclick="window['_mrfRecordsViewPO_${containerId}']('${po.docId}')"`
- 8th column "Actions" added to thead
- 8th `<td>` with "Timeline" button added to each row using `JSON.stringify(mrf.mrf_id)` for safe HTML embedding

## Commits

| Hash | Message |
|------|---------|
| 2b35bc5 | chore(40-06): update mrf-records.js imports for PR/PO/Timeline modal functions |
| e7fad92 | feat(40-06): add PR/PO detail modals and Timeline button to My Requests table |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

**Files created/modified:**
- `app/views/mrf-records.js` — FOUND (modified)

**Commits:**
- `2b35bc5` — FOUND
- `e7fad92` — FOUND

## Self-Check: PASSED
