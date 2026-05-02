# Phase 85: Collectibles Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 85-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 85-collectibles-tracking
**Areas discussed:** Scope anchor (projects vs services), Finance sub-tab placement, Project-detail surface, Amount source, Tranche UI/migration, Tranche fanout, ID format, Notifications, Project-detail surface (refinement), Payment recording

---

## Scope Anchor

| Option | Description | Selected |
|--------|-------------|----------|
| Projects only | Strict reading of COLL-01..09 — collectible.project_id always points to a `projects` doc. Services get no collectibles in this phase. Smaller surface. | |
| Projects + Services | Mirror RFP pattern — collectibles attach to either `projects` or `services` via a department field. Adds dept filter. ~25% more surface but consistent with everywhere else. | ✓ |
| Projects only now, schema-ready for services | UI/views accept projects only, but Firestore docs already carry a `department` field defaulting to 'projects'. | |

**User's choice:** Projects + Services
**Notes:** Aligns with Phase 29 dept-discriminator pattern and Phase 65 RFP scope. Both `project-detail.js` and `service-detail.js` get the same surfaces.

---

## Finance Sub-Tab Placement

| Option | Description | Selected |
|--------|-------------|----------|
| 5th sub-tab "Collectibles" | New peer tab alongside Pending Approvals / Purchase Orders / Project List / Payables. Top-level visibility, mirrors Phase 65 Payables structure. | ✓ |
| Sub-section inside Project List | Collectibles surface inside the existing Project List tab — closer to per-project context but mixes outflow and inflow. | |
| Reuse Payables tab with a 2nd table | Add Collectibles table beneath RFP/PO Payment Summary on the Payables tab. Single 'money tracking' destination. | |

**User's choice:** 5th sub-tab "Collectibles"
**Notes:** Selected with the preview showing flat table layout with filters: Project | Status | Due-date range. Department filter added based on Projects+Services scope.

---

## Project-Detail Surface (initial selection)

| Option | Description | Selected |
|--------|-------------|----------|
| New cells on Financial Summary card | Add 'Collected' / 'Remaining Collectible' cells parallel to Paid / Remaining Payable. Always-rendered for zero-state visibility. | ✓ |
| New tab in Financial Breakdown modal | Parallel to existing Payables tab from Phase 71. Detail view with per-collectible rows + payment history. | ✓ |
| Inline expandable list on project detail | Render full list directly on project page. Quickest to scan but lengthens the page. | ✓ (then trimmed) |

**User's choice (initial):** All three
**User's choice (refined):** Cells + modal tab only — see "Project-Detail Surface (refinement)" below

---

## Amount Source

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone manual entry | User types amount/due date/description from scratch. Independent of contract_cost. Simplest. | |
| Contract-tied tranches (mirrors RFP-on-PO) | Project has structured collection tranches summing to 100% of contract_cost; each collectible draws from one tranche. Mirrors Phase 65 RFP-on-PO. | ✓ |
| Manual now, optional contract-link later | Phase 85 ships manual entry only; schema includes nullable tranche fields for future. | |

**User's choice:** Contract-tied tranches
**Notes:** Drives a `collection_tranches` array on projects+services (label + percentage, sum=100). Mirror Phase 65 PO tranche builder UI.

---

## Tranche UI Placement & Migration Default

| Option | Description | Selected |
|--------|-------------|----------|
| On project/service form, default = 100% single tranche | Tranche editor in create/edit form. v3.2 projects without tranches get synthetic `[{ label: 'Full Payment', percentage: 100 }]`. Smoothest migration. | |
| On project/service form, no default (block until set) | Same UI, but creating a collectible against a tranche-less project is blocked with a 'Set up collection tranches first' message. v3.2 projects need a one-time backfill click. Cleaner data, more friction. | ✓ |
| Inside the Collectibles Finance tab (per-collectible) | No project-level tranche setup — user enters label + % per collectible. Less rigorous, no migration. | |

**User's choice:** On project/service form, no default (block until set)
**Notes:** Block-message links back to project edit form. Ensures tranche structure is explicit per project before any billing.

---

## Tranche Fanout

| Option | Description | Selected |
|--------|-------------|----------|
| One collectible per tranche (strict, mirrors Phase 65 RFP) | 1:1 mapping. Splitting a tranche requires editing project to break it into smaller tranches. Cleanest semantics. | ✓ |
| Multiple collectibles per tranche | A tranche can host multiple collectible docs; sum ≤ tranche × contract_cost. More flexibility, more validation. | |
| Tranche is just a label/category (no validation) | Descriptive tags only. Simplest implementation. | |

**User's choice:** One collectible per tranche (strict)
**Notes:** Mirrors Phase 65 RFP semantics exactly. Pre-fill UI: when creating a collectible, show only tranches that don't yet have a collectible attached.

---

## ID Format

| Option | Description | Selected |
|--------|-------------|----------|
| COLL-{PROJECT-CODE}-{n} | Project-scoped sequential, mirrors post-Phase-65.4 RFP fix. Guaranteed uniqueness, explicit project lineage. | ✓ |
| COLL-YYYY-### | Year-scoped global counter, mirrors MRF/PR/PO pattern. Simpler ID generation, no project context. | |
| COLL-{CLIENT-CODE}-{n} | Client-scoped — groups across all client projects. Adds dependency on client_code. | |

**User's choice:** COLL-{PROJECT-CODE}-{n}
**Notes:** For services: COLL-{SERVICE-CODE}-{n}. Custom inline generator. Phase 65.4 lesson: avoid year-counter collisions. For clientless projects (Phase 78), block creation until project_code issued.

---

## Notifications

| Option | Description | Selected |
|--------|-------------|----------|
| Silent for now — add notifications in a future polish phase | Phase 85 ships data + UI only. Avoids scope creep. Future phase can add COLL_CREATED / COLL_FULLY_PAID. | |
| Notify Finance when a collectible is created | Mirrors Phase 84 NOTIF-08 pattern (fan-out to finance role). One trigger site. | ✓ |
| Notify project personnel on Fully Paid status transition | Mirrors NOTIF-11 (personnel_user_ids fan-out). Adds one trigger in auto-derive logic. | |
| Both notifications above | Two trigger sites, ~30 lines. | |

**User's choice:** Notify Finance when a collectible is created
**Notes:** Adds `COLLECTIBLE_CREATED` to `NOTIFICATION_TYPES`. Reuse `createNotificationForRoles({ roles: ['finance'] })`. try/catch wrap. Fully-Paid notification deferred as polish.

---

## Project-Detail Surface (refinement)

| Option | Description | Selected |
|--------|-------------|----------|
| All three — deliberate | Keep cells + modal tab + inline list. Most expensive, highest visibility. | |
| Cells + modal tab only | Drop inline list. Modal tab IS the worklist; cells point users to it. Mirrors Phase 71 Payables UX. | ✓ |
| Cells only | Skip modal tab; collectibles list lives only in Finance sub-tab. Smallest footprint. | |

**User's choice:** Cells + modal tab only
**Notes:** Inline expandable list on project page trimmed to keep project-detail footprint manageable. Captured in deferred ideas.

---

## Payment Recording

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Phase 65 RFP exactly | Modal: date / amount / method dropdown (Bank Transfer | Check | Cash | GCash/E-Wallet | Other) / reference. Partial allowed (per COLL-05). Void-only with audit trail. Read-modify-write. | ✓ |
| Mirror RFP, but allow editing payment records | Same modal, but user can edit a recorded payment in-place. Less rigid audit. | |
| Simpler — amount + date only, hard-delete | No method/reference. No void/edit; hard-delete with confirmation. Departs from Phase 65 precedent. | |

**User's choice:** Mirror Phase 65 RFP exactly
**Notes:** ONE deviation from Phase 65: collectibles are partial-pay (COLL-05 explicit). Voided records persist with `voided` + actor/timestamp + reason. Status auto-derives from non-voided payment_records sum.

---

## Claude's Discretion

- Tranche-editor UI (add/remove rows, running-total badge styling, validation messages) — mirror Phase 65 PO tranche builder
- Block-message UX styling (no-tranches block, clientless-project block)
- Status badge colors for Overdue (red, mirror Phase 65 RFP overdue)
- Right-click context menu for cancel/void on a collectible row (mirror Phase 65.10)
- Confirmation modal copy when editing tranches on a project that already has collectibles
- Modal styling, transitions, animations
- Whether to add a `createNotificationForUsers` helper (not needed this phase)
- Notification message exact wording
- CSV column ordering (within the agreed column set in D-27)
- Mobile layout decisions for the new Finance Collectibles tab (apply Phase 73.1 dual-mode CSS pattern if mobile parity needed)

## Deferred Ideas

- Auto-trigger collectibles from PM task progress (COLL-FUT-01) — needs Phase 86
- Per-client collectibles aggregation view (COLL-FUT-02)
- Ageing report (COLL-FUT-03)
- Inline expandable list on project-detail page — trimmed mid-discussion
- Fully-Paid status notification (project personnel fan-out)
- Overdue status notification (time-based, complicated by no-Cloud-Functions constraint)
- Edit of payment records (currently void-only)
- Per-payment CSV export
- Multiple collectibles per tranche (currently strict 1:1)
- Tranche presets (Standard 50/40/10, 60/40, 100% upfront) — UX polish for v4.1
- DB-level immutability on tranche fields after first payment (currently UI-warning only)
- `createNotificationForUsers({ user_ids })` helper
