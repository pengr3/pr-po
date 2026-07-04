---
quick_id: 260704-luf
status: complete-pending-uat
date: 2026-07-04
branch: v4.1
commits:
  - 83e39e78  # storage infra + rules
  - 36c97bff  # project-detail.js file upload
  - 7fd4edb9  # service-detail.js file upload parity
---

# Quick Task 260704-luf — Summary

## What changed

**`app/firebase.js`** (+storage wiring)
- Re-imported `firebase-storage.js` from CDN; `const storage = getStorage(app)`.
- Exported `storage` + `ref`/`uploadBytes`/`getDownloadURL`/`deleteObject`; added
  `window.firebaseStorage`. (Reverses the `260511-k4f` strip.)

**`storage.rules`** (new file)
- `match /projects/{id}/**` and `/services/{id}/**`: `read` if authed; `write` if
  authed AND (`request.resource == null` for deletes OR size < 10 MB).
- Accepted-risk note: Storage rules v2 can't read Firestore roles; the Firestore
  rules on the parent doc are the primary write gate (mirrors Phase 87 posture).

**`firebase.json`**
- Re-added `"storage": { "rules": "storage.rules" }` (bucket omitted → deploy
  targets each project's default bucket).

**`firestore.rules`**
- Added `inspection_report_storage_path`, `ntp_document_storage_path`,
  `completion_report_storage_path`, `certificate_of_completion_storage_path` to the
  **projects** assigned-user `hasOnly()` field-mask (lines ~226-246). Services'
  assigned-user branch has no field-mask, so it already permits the new field.

**`app/views/project-detail.js`** and **`app/views/service-detail.js`** (parity)
- `buildAttachZone`: empty state now renders **🔗 Link / 📄 Upload tabs** (wiring the
  already-present `lcSwitchTab`/`lcServiceSwitchTab` panels + a file input). Attached
  state: doc **name is now a clickable link** (`target=_blank`) so uploads open.
- `lcAttachFile`/`lcServiceAttachFile`: rewritten from stub to **real upload** — read
  file input, validate size (10 MB) + ext allowlist, `uploadBytes` →
  `getDownloadURL` → persist `_url`(downloadURL)/`_kind='file'`/`_filename`/
  `_storage_path`. Best-effort `deleteObject` of a prior file at a different path.
- `lcAttachLink`/`lcRemoveDoc` (+ service twins): now null `_storage_path` and
  best-effort `deleteObject` the old file object when switching file→link or removing.
- Constants `LC_UPLOAD_MAX_BYTES` / `LC_UPLOAD_ALLOWED_EXT` added per file.

## Verified

- `node --check` passes on all three edited JS files.
- No stale callers of the old 2-arg `lcAttachFile(which, filename)`.
- CSP already allows the Storage endpoint (`*.googleapis.com`).
- Firestore field-mask gap caught & closed (projects `hasOnly` would otherwise
  reject `_storage_path` for assigned non-admin users → silent save failure).

## NOT done (see punch list in .planning/.continue-here.md)

1. **Enable Blaze billing** on `clmc-procurement` (prod) AND `clmc-procurement-dev`
   — Firebase console step; only the account owner can do it. Uploads fail until then.
2. **Deploy rules to both projects**: `firebase deploy --only storage,firestore:rules`
   for dev and prod (`--project`). Not deployed from here (billing-gated + prod caution).
3. **Browser UAT** — pending in a real browser (upload/open/replace/remove across a
   project and a service; test as an assigned non-admin user to exercise the field-mask).

## Notes

- Storage path is deterministic (`<collection>/<docId>/<docKey>.<ext>`), one object
  per doc type; same-ext re-upload overwrites, different-ext re-upload deletes the old.
- Legacy stub docs (old `_kind='file'` with filename-as-url) read harmlessly; their
  clickable name would 404 but no such prod data is expected.
