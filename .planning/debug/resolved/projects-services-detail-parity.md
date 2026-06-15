---
slug: projects-services-detail-parity
status: resolved
trigger: "investigate thoroughly the current difference in details pages for projects and services. Projects is your basis, ensure 100% identical in terms of UI/UX placement and structure; there are things we omitted already in projects that still exist in services, correct that"
created: 2026-06-15
updated: 2026-06-15
resolved: 2026-06-15
fix_commit: 1d0389e
files_changed:
  - app/views/service-detail.js
---

# Debug: Projects ↔ Services detail-page UI/UX parity — RESOLVED

## Root Cause

`renderServiceDetail()` was adapted from a **pre-redesign** project layout and never tracked the
Phase-100-era chrome changes Projects adopted: a single **header strip** (badge · code · status ·
actions), **compact small-caps card chrome**, and the **deletion of the standalone Status card**.
Services kept the old pattern — `<h3>`+border-bottom card headers, Edit-History/Export-CSV buried
inside cards, a standalone "Status & Assignment" card, a detail-header Back button, 1.5rem padding,
and inconsistent label/value styles.

## Fix (commit 1d0389e) — mirrors project-detail.js exactly

1. **Header strip** (replaced active/back block, mirrors `project-detail.js:622-640`): active badge ·
   `service_code` · `#hdrServiceStatusBadge` status · spacer · Edit History · Export CSV. Removed the
   detail-header "Back to Services" button (Projects has none). `#hdrServiceStatusBadge` relocated here —
   live-update at `service-detail.js:2459` still resolves it.
2. **Info card**: small-caps "Service Information" label (removed h3+border-bottom+inline Created+Edit
   History); padding `1.5rem → 0.75rem 1rem`; grid gap `1rem → 0.4rem 0.75rem`; uniform Projects
   label/value styles; **removed duplicate Service Code field** (now in header); Location + Personnel
   `grid-column:1/-1`; conditional **DLP Period / DLP Expires** fields added (parity, `getDlpState`);
   Created/Updated moved to card bottom with `·` separator.
3. **Financial card**: small-caps header; padding normalized; **Export CSV removed** (now in header);
   finance bar wrapped; **Initiate Billing footer link added** (`window.openBillingRequestModal()`);
   tranche header → `.tranche-header` span + `showEditControls` gate + `trancheEditorOpen` active class.
4. **Deleted services-only "Status & Assignment" card** (Projects deleted its status card).

## Verification

- `node --check app/views/service-detail.js` → PASS
- Exactly one `id="hdrServiceStatusBadge"` (header strip); live-update site (:2459) intact.
- Old chrome removed: no "Status & Assignment", "tranche-section-header", lifecycle helper note, or
  detail-header Back button (error/empty-state back links intentionally retained).
- Card/grid closing structure balanced (financial card-body → card → 2-col grid wrapper → proposal →
  journal → container).
- Behavior preserved: `saveServiceField`, `toggleServiceDetailActive`, `showEditHistory`,
  `exportServiceExpenseCSV`, `openServiceFullBreakdown`, `openBillingRequestModal`, data sources.
- **Browser UAT pending** (zero-build SPA): open a service detail beside a project detail and confirm
  identical header strip, info card, financial card, and absence of the status card.

## Deferred (flagged — NOT done, require decisions / out of scope)

- **Delete-Service button**: Projects has a gated Delete button; Services has **no `confirmDelete`/
  delete window function**. Not invented — would need a real service-deletion flow (cascade rules).
- **Plan / Gantt card**: Projects shows a project-plan card; Services has no task/plan data model →
  this is **Phase 105 (Service Plan / Gantt Parity)**, explicitly deferred.
