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

## Automated UAT (2026-07-05, against dev)

Ran everything verifiable without a browser session (scratchpad scripts):

- **Archive decision-logic** — `isLcFilesArchived` truth table (verbatim source + real
  `getDlpState`), **10/10 PASS**: not-Completed, files_recovered override, in-DLP,
  DLP-expired, retention-released, no-DLP+400d, no-DLP+10d (grace), no completed_at.
- **Deployed dev rulesets** (Firebase Rules API) — storage ruleset **HAS 5 MB cap / NO
  10 MB**; firestore ruleset **HAS `files_recovered`** field-mask. PASS.
- **Purge sweep mechanics** on the real dev bucket — seed 3 objects under
  `projects/__uat_s7c__/` → `list(prefix)` returns 3 → delete each (204) → prefix empty.
  Mirrors `purgeStoragePrefix` exactly. PASS (test objects self-cleaned).

**Still needs a human browser (structurally — no browser-automation tool + owner API token
BYPASSES Security Rules, so rules ENFORCEMENT for a real end-user can't be scripted):**
visual 📦 chip / Recover button / caption+live-size rendering; actually clicking Upload
(client 5 MB guard) and Recover; and the assigned-non-admin *allow/deny* path (rule source
is confirmed deployed; the per-user evaluation needs a logged-in session or the Java rules
emulator, which is absent).

## Design notes

- **App hide ≠ GB savings.** T1–T5 give the hide/recover UX and stop the leak. The actual
  storage-cost reduction is the **operator bucket lifecycle rule** below (transition-only,
  never delete — so Recover always works; Archive-class objects stay readable via the same
  download URL for a small retrieval fee).
- `isLcFilesArchived` re-evaluates every render, so no migration/backfill of existing
  completed projects is needed — they hide the moment their DLP lapses.

## Punch list (operator — not code)

1. **Redeploy rules** to dev + prod: `firebase deploy --only storage,firestore:rules`.
   ✅ **DEV + PROD DONE 2026-07-05** (both compiled + released to clmc-procurement-dev and
   clmc-procurement). Deployed-ruleset assertion confirmed the live 5 MB cap + field-mask.
2. **Bucket cold-rule** (the GB-cost lever) on BOTH default buckets.
   ✅ **DONE 2026-07-05** — applied Coldline@90d / Archive@365d (no delete) to
   `clmc-procurement-dev.firebasestorage.app` + `clmc-procurement.firebasestorage.app` via
   the GCS JSON API (equivalent to `gcloud storage buckets update --lifecycle-file`); read
   back + verified on both. Ready file kept: this folder's `lifecycle.json`.
3. **Orphan backfill (optional, low priority)** — pre-T5 deletes: `gsutil ls
   gs://<bucket>/projects/` & `.../services/` → diff vs live collections → `gsutil -m rm -r`
   the orphan id-prefixes. Near-zero expected (upload feature shipped 2026-07-04).
4. **Browser UAT** (dev): 6 MB rejected "5 MB" + 4 MB PDF OK + live size cue; a Completed
   past-DLP project shows 📦 + Recover, in-DLP still shows links, Recover persists on
   reload; assigned non-admin can Recover; repeat on a service; delete a throwaway project
   (both list + detail) and a service → `projects|services/{id}/*` gone from the bucket.

## Shipped (2026-07-05)

- Prod + dev rules deployed; GCS cold-rule live on both buckets (verified).
- `v4.1` pushed; **PR #77 merged to `main`** (merge `355303ed`) → Netlify auto-deploys prod
  JS per [[project_netlify_deployment_facts]]. This ship also carries 260704-luf.

## Remaining (optional / non-blocking)

- **Browser confirmation** of the visual/interactive + per-user rules-enforcement path (the
  parts an owner API token can't exercise) — low-risk given automated coverage.
- **Orphan backfill** (punch-list item 3) — one-time `gsutil` sweep of pre-T5 orphans;
  near-zero expected.
