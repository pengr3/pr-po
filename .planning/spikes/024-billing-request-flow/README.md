---
spike: 024
name: billing-request-flow
type: standard
validates: "Given a project-assigned user (operations_user) has reached a billable milestone, when they submit a billing request with supporting documents from the project detail page, then Finance sees it inline in the Collectibles tab and can approve → pre-fill Create Collectible, or reject with a reason"
verdict: VALIDATED
related: []
tags: [collectibles, billing, project-detail, finance, ux, workflow]
---

# Spike 024: Billing Request Flow

## What This Validates

Given:
- `operations_user` can view project detail but lacks `hasCollectibleWriteAuthority()`
- Project has collection tranches defined (Down Payment / Progress / Completion)
- Finance needs supporting documents before creating a collectible

When:
- Project user clicks "Request Billing" or a per-tranche "Bill" button
- Fills in billing type + document links + optional notes
- Submits → creates a `billing_requests` Firestore doc

Then:
- Finance sees a "Pending Billing Requests" collapsible section in the Collectibles tab
- Each request shows project, tranche, amount, doc links, submitter name + date
- Approve → pre-fills `openCreateCollectibleModal('projects:CODE')` with tranche data
- Reject → requires reason, request marked rejected on both sides

## Key Design Decisions Surfaced

### 1. Billing type determination
The tranche label is free-form text, so we cannot reliably infer billing type programmatically.
The prototype uses **label-based auto-detection** (contains "completion" or "final" → pre-select Completion pill; contains "progress" → pre-select Progress pill) as a convenience shortcut, while still letting the user override.

This is the right approach: tranche labels are for display; billing type is user intent.

### 2. Document requirements by billing type
| Billing type | Documents required |
|--------------|--------------------|
| Progress     | Progress Report (1 link) |
| Completion   | COC + Completion Report (2 links) |
| Other        | Supporting Document (1 link) |

Validation blocks submit until all required doc links are filled.

### 3. Per-tranche rows in project detail
The collectibles section gains per-tranche rows showing Billed/Unbilled/Pending status.
This replaces the aggregate-only view and lets project users see exactly what's outstanding.
Billed tranches are green-tinted; unbilled rows show a "Bill" shortcut button.

### 4. Finance queue placement
Inline collapsible section **above** the existing Collectibles table in the Finance tab — avoids adding a new tab and keeps the review action close to where Finance creates collectibles.

### 5. Approve flow
Approve opens the existing `openCreateCollectibleModal(preselectKey)` — infrastructure already exists in finance.js with the `preselectKey` parameter. Finance still sets the due date and submits; the request just pre-fills dept + project.

## Proposed Firestore Schema

```
billing_requests/
  {id}:
    project_code: string        // e.g. 'CLMC-ACME-001'
    project_name: string
    tranche_index: number       // position in collection_tranches[]
    tranche_label: string       // frozen at submission
    tranche_percentage: number  // frozen at submission
    amount_requested: number    // contract_cost * percentage / 100
    billing_type: 'progress' | 'completion' | 'other'
    documents: [{ key, label, url }]
    notes: string
    status: 'pending' | 'approved' | 'rejected'
    requested_by_uid: string
    requested_by_name: string
    requested_at: Timestamp
    reviewed_by: string         // (on approve/reject)
    reviewed_at: Timestamp      // (on approve/reject)
    rejection_reason: string    // (on reject only)
```

## How to Run

```
open .planning/spikes/024-billing-request-flow/index.html
```
(or double-click the file in Explorer)

## What to Expect

Two-panel prototype:
- **Left** — Project Detail view (operations_user): per-tranche status rows, "Request Billing" + per-tranche "Bill" buttons
- **Right** — Finance > Collectibles tab: collapsible "Pending Billing Requests" section with 2 seeded rows

**Try the flows:**
1. Click "Bill" on Progress Billing → billing type auto-selects → paste any URL → Submit → appears in Finance queue
2. Click "Bill" on Final / Completion → Completion auto-selects → 2 doc fields appear
3. In Finance panel: Approve seed row → confirm modal → new row added to Collectibles table
4. In Finance panel: Reject seed row → enter reason → row shows rejected state

## Investigation Trail

**2026-06-04 — Initial build**

Built full end-to-end interactive prototype. Key findings:

- Label-based auto-detection works well as a shortcut: "Final / Completion" → Completion pills pre-selects; "Progress Billing" → Progress pre-selects. Still overrideable. This avoids a schema change to collection_tranches.
- Per-tranche rows add significant clarity vs. aggregate-only view — project user can see at a glance which tranches are billed vs. outstanding without ever opening Finance.
- Collapsible inline section in Collectibles tab fits cleanly: the section collapses away when empty (no pending requests), so Finance users who don't need it don't see noise.
- The "Approve → pre-fill Create Collectible" bridge is straightforward: `openCreateCollectibleModal('projects:CLMC-ACME-001')` already exists with the preselectKey param. We just need to also pass tranche_index so it auto-selects the tranche.

**Open question for implementation:**
`openCreateCollectibleModal` currently picks the tranche from a dropdown (user action). We should extend the preselectKey to also encode tranche_index: `'projects:CLMC-ACME-001:1'` so Approve truly pre-fills all fields.

## Validated Decisions

| Surface | Choice | Rationale |
|---------|--------|-----------|
| Project Detail | **Option C — Footer link** | "↑ Initiate Billing →" text link at the bottom of the Collectibles section. Zero card expansion, minimal footprint. |
| Finance queue | **Option A — Collapsible banner** | Blue section auto-appears above the Collectibles table when requests are pending. Collapses out of the way. Disappears when queue is empty. |

## Results

VALIDATED ✓ — Design locked. Ready for `/gsd:plan-phase`.

**Build targets:**
1. New `billing_requests` Firestore collection (schema above)
2. Project Detail: footer link → billing request modal (tranche picker → billing type pills → doc link fields)
3. Finance > Collectibles tab: collapsible blue banner above table with Approve/Reject per row
4. Approve → calls `openCreateCollectibleModal('projects:CODE:TRANCHE_INDEX')` (extend preselectKey to include tranche index)
5. Firestore Security Rules: project-assigned users write `billing_requests`; finance reads + updates status
