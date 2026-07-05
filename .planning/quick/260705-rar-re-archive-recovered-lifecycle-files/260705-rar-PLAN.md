---
quick_id: 260705-rar
title: Re-archive toggle for recovered lifecycle files
status: executed
date: 2026-07-05
branch: v4.1
follows: quick 260705-s7c (storage conservation — one-way Recover)
---

# Quick Task 260705-rar: Re-archive Recovered Lifecycle Files

## Origin

`260705-s7c` made **Recover** one-directional: `files_recovered=true` is sticky, so once
you recover a Completed+past-warranty project's files there is **no in-app way to hide them
again** — you'd have to clear the field in the Firestore console. User asked: *"once files
are recovered how do we revert it back to being archived?"* → make the archive/recover a
**toggle**.

## Scope boundary (CONFIRM)

This adds **Re-archive = undo a Recover** only. It does **NOT** add "manually archive a
project before its DLP/warranty is over" — the archive *trigger* stays exactly as shipped
(auto-derived once Completed + warranty lapsed). Re-archive simply returns an
already-eligible, recovered project to its derived-hidden state. (If manual early-archive is
wanted, that's a separate, larger change — flagged, not built here.)

## The state machine (this is the "logic" to get right)

Three inputs on a project/service doc:
- **S** = `project_status === 'Completed'`
- **W** = warranty over = `getDlpState ∈ {expired, released}` **OR** (no `dlp_months` AND
  `project_completed_at` older than `LC_FILES_ARCHIVE_GRACE_DAYS`=365)
- **R** = `files_recovered` (bool; absent ⇒ false)

Derived:
- **eligible** = S && W        ← *archiving applies at all*
- **archived** (hidden) = eligible && **!R**
- **recovered** (shown, was archivable) = eligible && **R**
- **normal** (shown) = **!eligible**  (not completed, or in-DLP, or within grace, or no completion date)

| State | buildAttachZone | "Project Closed" panel | Action offered |
|-------|-----------------|------------------------|----------------|
| **archived** | 📦 chip, no link, no Remove | doc cells muted `📦 archived` + banner | **♻ Recover files** → set R=true |
| **recovered** | normal clickable link | doc cells normal + light "recovered" note | **📦 Re-archive** → set R=false |
| **normal** | normal clickable link | doc cells normal | *(none)* |

Transitions (only these two, each only visible in its source state):
- `archived → recovered`  via **Recover** (existing `lcRecoverFiles`): R=true.
- `recovered → archived`  via **Re-archive** (new `lcArchiveFiles`): R=false.

### Why this is safe / edge cases walked

- **Eligibility is monotonic.** `Completed` is terminal (only `Loss` is the other terminal,
  and you can't reach Completed→other); DLP expiry only moves forward. So once **eligible**
  becomes true it stays true → no state ever silently flips `recovered → normal`. The only
  exit from `recovered` is an explicit **Re-archive**.
- **R only ever set true while eligible** (Recover is only shown in the `archived` state,
  which requires eligible). So `recovered` = eligible && R is the sole meaning of R=true.
- **Legacy / manual-stale defensiveness:** R=true on a *non-eligible* doc (only possible via
  manual console edit) → `!eligible` → **normal**, no Re-archive button, files just show.
  Harmless. R absent → false → archived when eligible (unchanged from s7c).
- **Re-archive returns to the derived default:** R=false ≡ R-absent, so re-archiving is
  idempotent with the legacy/never-recovered path — no special "re-archived" state exists.
- **In-DLP completed project** (not eligible) → normal → files stay visible during warranty,
  no toggle shown. Correct.
- **Failed write** → optimistic flag rolled back + re-render (mirror `lcRecoverFiles`).
- **Concurrent editors:** low-frequency admin action; last-write-wins, view reconciles on
  next load/snapshot. Not guarded (acceptable, matches Recover).

## Tasks

### T1 — project-detail.js

1. **Refactor** the derivation so both flags share one eligibility test (near the current
   `isLcFilesArchived`, ~line 968):
   ```js
   function isLcArchiveEligible(project) {
       if (!project || project.project_status !== 'Completed') return false;
       const dlp = getDlpState(project, currentCollectibleDocs);
       if (dlp === 'in-dlp') return false;
       if (dlp === 'expired' || dlp === 'released') return true;
       const doneMs = project.project_completed_at ? new Date(project.project_completed_at).getTime() : 0;
       return !!doneMs && (Date.now() - doneMs) > LC_FILES_ARCHIVE_GRACE_DAYS * 86400000;
   }
   function isLcFilesArchived(project) {
       return isLcArchiveEligible(project) && !project.files_recovered;   // unchanged meaning
   }
   ```
   (`buildAttachZone` keeps calling `isLcFilesArchived` — no change there.)
2. **Comp-grid** ("Project Closed" panel): compute `eligible` / `archived` / `recovered`.
   - `archived` → existing muted cells + `♻ Recover files` banner (unchanged).
   - `recovered` → normal cells + a **light** note + `📦 Re-archive` button
     (`onclick="window.lcArchiveFiles()"`).
3. **New handler** `window.lcArchiveFiles` (mirror `lcRecoverFiles`, permission-guarded,
   optimistic + rollback):
   ```js
   updateDoc(doc(db,'projects',id), {
       files_recovered: false, files_recovered_at: null, files_recovered_by: null,
       updated_at: serverTimestamp(),
   });
   addProjectAuditEntry(id, 'LC_FILES_REARCHIVED', cu?.uid, cu?.full_name, '');
   ```
   Register in `attachWindowFunctions`; `delete` in `destroy()` (symmetry).

### T2 — service-detail.js

Mirror T1: `isLcArchiveEligible(service)` + refactor `isLcFilesArchived`; comp-grid
`recovered` branch + `📦 Re-archive`; `window.lcServiceArchiveFiles` writing on
`services/{currentServiceDocId}` with `addServiceAuditEntry(...,'LC_FILES_REARCHIVED',...)`;
register↔teardown symmetric.

## No infra / rules change

- `files_recovered` / `_at` / `_by` are **already** in the projects field-mask (s7c);
  writing `false`/`null` uses the same keys. Services branch is maskless. **No firestore.rules
  change, no storage.rules, no firebase.js.**
- **JS-only ship**: merge `v4.1` → main (Netlify auto-deploys). No `firebase deploy` needed.

## Verification

- **Logic truth table** (extend the s7c script): add `isLcArchiveEligible` + assert the 3
  derived states across S/W/R combinations (esp. eligible+R=recovered, eligible+!R=archived,
  !eligible+R=normal).
- `node --check` both files; new window fns register↔teardown symmetric (assign+delete+onclick).
- **Browser (dev):** Completed+past-DLP project → 📦 archived + Recover → click Recover →
  files show + **📦 Re-archive** appears → click Re-archive → back to 📦 archived; reload
  persists each way. Repeat on a **service**. In-DLP completed project shows neither control.

## Out of scope

- Manual early-archive (archiving a completed project still inside its DLP) — see boundary.
- Per-document archive/recover (the flag is per-entity by design).
