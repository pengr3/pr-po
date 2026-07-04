---
quick_id: 260705-s7c
status: executed
date: 2026-07-05
branch: v4.1
follows: quick 260704-luf
commits:
  - 90eadf84  # storage infra + rules (firebase.js, storage.rules, firestore.rules)
  - 7203d62b  # project-detail.js — cap UI + archive/recover + purge on delete
  - 07ea9d10  # service-detail.js parity
  - 359ce318  # projects.js + services.js — purge on list-view delete
---

# Quick Task 260705-s7c — Summary

## What changed

**`app/firebase.js`** — import `listAll`; add best-effort `purgeStoragePrefix(prefix)`
(`listAll` → `deleteObject` every item; never throws) + export + `window.firebaseStorage`.

**`storage.rules`** — upload size cap `10 MB → 5 MB` on both `projects/**` and `services/**`
(delete null-guard kept). **Reads are not size-gated**, so any pre-existing >5 MB object
stays readable; only new writes >5 MB are blocked.

**`firestore.rules`** — added `files_recovered` / `_at` / `_by` to the **projects**
assigned-user `hasOnly()` field-mask (services' assigned branch has no mask → already OK).

**`app/views/project-detail.js`** and **`app/views/service-detail.js`** (parity)
- **T1** `LC_UPLOAD_MAX_BYTES` 10→5 MB; reject-toast now says "5 MB"; the upload panel
  gained a `Max 5 MB · <types>` caption + a live filename/size readout
  (`window.lcFileHint` / `lcServiceFileHint`, green/red vs the cap).
- **T2/T4** `isLcFilesArchived(entity)` — **derived, no background job, no auto-write**:
  true when `project_status === 'Completed'` AND warranty is over
  (`getDlpState ∈ {expired, released}`, or for no-DLP entities >`LC_FILES_ARCHIVE_GRACE_DAYS`
  =365 days past completion) AND NOT `files_recovered`. `in-dlp` entities stay visible.
  When archived: `buildAttachZone` renders a muted `📦` chip (no link, no Remove) and the
  "Project Closed" panel mutes the doc cells + shows a single project/service-level
  **♻ Recover files** button. `window.lcRecoverFiles` / `lcServiceRecoverFiles` set
  `files_recovered=true` (permission-guarded via `canEditTab`, audited `LC_FILES_RECOVERED`,
  optimistic re-render with rollback). All new window fns register↔teardown symmetric.
- **T5 (project-detail only)** `confirmDelete` best-effort `purgeStoragePrefix('projects/'+id)`
  after `deleteDoc`. (No service-detail delete path exists.)

**`app/views/projects.js`** / **`app/views/services.js`** (**T5**) — `deleteProject` /
`deleteService` best-effort `purgeStoragePrefix('projects/'|'services/'+id)` after
`deleteDoc`, so a hard delete no longer orphans the entity's Storage objects. Import added.

## Verified (static)

- `node --check` PASS on all 5 edited JS files.
- No stray `10 * 1024 * 1024` cap left in the view files or `storage.rules` (0).
- `firestore.rules` / `storage.rules` brace-balanced (81/81, 17/17).
- New window fns symmetric: `lcRecoverFiles`/`lcFileHint` (+ service twins) each appear
  3× per file = assign + delete + one onclick/onchange reference.
- CSP already allows the Storage endpoint (unchanged since 260704-luf).

## Design notes

- **App hide ≠ GB savings.** T1–T5 give the hide/recover UX and stop the leak. The actual
  storage-cost reduction is the **operator bucket lifecycle rule** below (transition-only,
  never delete — so Recover always works; Archive-class objects stay readable via the same
  download URL for a small retrieval fee).
- `isLcFilesArchived` re-evaluates every render, so no migration/backfill of existing
  completed projects is needed — they hide the moment their DLP lapses.

## Punch list (operator — not code)

1. **Redeploy rules** to dev **then** prod (CLI active project is PROD — pass `--project dev`
   for the dev deploy): `firebase deploy --only storage,firestore:rules`.
2. **Bucket cold-rule** (the GB-cost lever) on BOTH default buckets
   (`clmc-procurement-dev.firebasestorage.app`, `clmc-procurement.firebasestorage.app`):
   `gcloud storage buckets update gs://<bucket> --lifecycle-file=lifecycle.json`
   (ready file: this folder's `lifecycle.json` — Coldline@90d, Archive@365d, no delete).
   Verify: `gcloud storage buckets describe gs://<bucket> --format="default(lifecycle)"`.
3. **Orphan backfill (optional, low priority)** — pre-T5 deletes: `gsutil ls
   gs://<bucket>/projects/` & `.../services/` → diff vs live collections → `gsutil -m rm -r`
   the orphan id-prefixes. Near-zero expected (upload feature shipped 2026-07-04).
4. **Browser UAT** (dev): 6 MB rejected "5 MB" + 4 MB PDF OK + live size cue; a Completed
   past-DLP project shows 📦 + Recover, in-DLP still shows links, Recover persists on
   reload; assigned non-admin can Recover; repeat on a service; delete a throwaway project
   (both list + detail) and a service → `projects|services/{id}/*` gone from the bucket.

## Not done here

- Rules deploy / bucket lifecycle rule / UAT (punch list — operator/user actions).
- `v4.1` not pushed to origin yet (awaiting go-ahead).
