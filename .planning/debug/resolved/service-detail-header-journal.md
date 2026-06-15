---
slug: service-detail-header-journal
status: resolved
trigger: "1. again header disparity (services header strip renders below the lifecycle accordion; projects renders it above). 2. cannot access activity journal on services — cannot type anything and cannot see the whole picture."
created: 2026-06-15
updated: 2026-06-15
resolved: 2026-06-15
fix_commit: e8bb874
files_changed:
  - app/views/service-detail.js
related: journal-write-controls-missing.md (same root cause, project side)
---

# Debug: service detail — header order + activity journal — RESOLVED

## Outcome (3 findings)

### Bug 1 — header order: FIXED
The header strip was rendered AFTER `renderServiceLifecycleCard()`; projects renders it BEFORE.
Moved the lifecycle call to after the header strip → order now matches projects
(strip → lifecycle accordion → info/financial grid). Commit e8bb874.

### "Can't type" on the screenshot service — NOT A BUG (correct by design)
The service shown is **Completed**. `_buildServiceJournalPanelHtml` computes
`isReadOnly = service.project_status === 'Completed'` and omits the composer — byte-identical to
projects' `_buildJournalPanelHtml`. Projects hides the composer for Completed the same way.
To type, open a service in **For Mobilization** or **On-going**.

### "Can't see the whole picture" — NOT A CODE BUG
`.project-journal-panel` (views.css) has no width/max-width; the service panel reuses the same
class + id and is injected full-width in `.container`. The narrow look was the side-by-side window
crop + the read-only (composer-less) Completed state. No markup/CSS change.

### Bug 2 (real, latent) — journal stale-listener: FIXED
Root cause (identical to debug/journal-write-controls-missing on the project side): service `init()`
lacked the per-service listener teardown. Router `isSameView` skips `destroy()` on service→service
navigation, so the prior service's orphaned `onSnapshot` kept firing and overwrote `currentService`
with stale (e.g. Completed) data → `isReadOnly=true` → composer hidden on an active service; and the
idempotent `ensureServiceJournalListeners()` guard (`if (!journalActivityUnsub)`) stayed latched to
the old service so the new service's journal never loaded ("No entries yet").

**Fix:** ported the teardown block into `init()` (after assignment-handler registration, before the
`!serviceParam` guard), mirroring project-detail.js. Unsubscribes `listener`, `usersListenerUnsub`,
`billingRequestsListenerUnsub`, `collectiblesListenerUnsub`, and the three journal unsubs; resets
`journalActivityEntries`/`journalProgressUpdates`/`journalIssues`/`currentBillingRequests`/
`currentCollectibleDocs` and nulls `currentService` before re-attaching.

## Verification

- `node --check app/views/service-detail.js` → PASS
- `currentService` confirmed `let` (reassignable, line 16); all torn-down vars confirmed against
  declarations (22/23/31/37/40-45).
- Header order confirmed: strip (768) → `renderServiceLifecycleCard` (788) → info/financial grid (790).
- **Browser UAT pending:** (a) confirm strip sits above the lifecycle accordion; (b) navigate
  Completed service → On-going service and confirm the composer appears and entries load.
